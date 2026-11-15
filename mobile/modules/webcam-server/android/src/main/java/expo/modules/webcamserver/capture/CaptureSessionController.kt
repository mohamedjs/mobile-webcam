package expo.modules.webcamserver.capture

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Rect
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.params.MeteringRectangle
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Range
import android.view.Surface
import expo.modules.webcamserver.encoding.FragmentedMP4Writer
import expo.modules.webcamserver.encoding.FragmentedMP4WriterDelegate
import expo.modules.webcamserver.support.Log
import expo.modules.webcamserver.support.Settings
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

interface CaptureSessionControllerDelegate {
  fun onSegmentProduced(controller: CaptureSessionController, data: ByteArray, isInit: Boolean)
  fun onJpegProduced(controller: CaptureSessionController, data: ByteArray)
  fun onCaptureFailed(controller: CaptureSessionController, error: Exception)
}

/**
 * Owns the Camera2 device, its capture session and the H.264 encoder.
 *
 * - start() blocks until frames are really flowing, so /health "streaming" and
 *   the HTTP 200 of a settings change both mean the camera is producing.
 * - When the system takes the camera away (another app, an error) and the
 *   server still wants it, the camera is reopened with backoff.
 * - Every (re)start applies the full settings, not only live changes.
 * - Rotation and mirroring are NOT done here: the desktop applies them.
 */
class CaptureSessionController(private val context: Context? = null) : FragmentedMP4WriterDelegate {

  companion object {
    var sharedCapture: CaptureSessionController? = null
      private set

    private const val OPEN_TIMEOUT_MS = 4000L
  }

  init {
    sharedCapture = this
  }

  var delegate: CaptureSessionControllerDelegate? = null
  /** (reason, recovered) for the JS layer. */
  var onInterruption: ((String, Boolean) -> Unit)? = null
  /** Called before the encoder is rebuilt on our own, so stream clients that
   *  hold the old init segment can be dropped. */
  var onWillRestart: (() -> Unit)? = null

  private val manager: CameraManager?
    get() = context?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager

  private val startLock = Any()
  private val fmp4Writer = FragmentedMP4Writer()

  @Volatile private var cameraDevice: CameraDevice? = null
  @Volatile private var captureSession: CameraCaptureSession? = null
  @Volatile private var requestBuilder: CaptureRequest.Builder? = null
  @Volatile private var characteristics: CameraCharacteristics? = null
  @Volatile private var encoderSurface: Surface? = null
  private var backgroundThread: HandlerThread? = null
  @Volatile private var backgroundHandler: Handler? = null

  @Volatile private var previewSurface: Surface? = null
  private var previewTexture: SurfaceTexture? = null

  /** The server wants the camera (set by start, cleared by stop). */
  @Volatile private var wantRunning = false
  @Volatile private var recovering = false
  @Volatile private var settings: Settings = Settings()

  /** True only while the repeating request is feeding the encoder. */
  @Volatile var isRunning: Boolean = false
    private set

  val initializationSegment: ByteArray?
    get() = fmp4Writer.initializationSegment

  init {
    fmp4Writer.delegate = this
  }

  // MARK: - Capabilities

  fun capabilities(): Map<String, Any> {
    val lenses = LensDiscovery.discover(context)
    val selected = lenses.firstOrNull { it.id == settings.lens }
      ?: lenses.firstOrNull { it.id == "back-wide" } ?: lenses.firstOrNull()
    val chars = selected?.let { lens ->
      try { manager?.getCameraCharacteristics(lens.cameraId) } catch (_: Exception) { null }
    }

    val stabilization = mutableListOf("off")
    if (chars != null && (supportsVideoStabilization(chars) || supportsOis(chars))) {
      stabilization.add("standard")
    }

    return mapOf(
      "lenses" to lenses.map { it.toMap() },
      "resolutions" to LensDiscovery.resolutions(context, selected?.cameraId),
      "cinematic" to mapOf(
        "supported" to false,
        "tier" to 0,
        "resolutions" to emptyList<Any>(),
        "maxFps" to 30,
        "minAperture" to 2.0,
        "maxAperture" to 16.0
      ),
      "stabilization" to stabilization,
      "hdr" to false,
      // Audio capture is not implemented on Android yet.
      "audio" to mapOf(
        "supported" to false,
        "sampleRates" to listOf(48000),
        "maxChannels" to 1
      )
    )
  }

  // MARK: - Preview

  /**
   * The app's preview view became visible. The encoder keeps running; only the
   * capture session is rebuilt to add the preview surface, so the stream to the
   * desktop continues without a new init segment.
   */
  fun attachPreviewTexture(texture: SurfaceTexture, width: Int, height: Int) {
    val size = settings.resolution
    texture.setDefaultBufferSize(size.width, size.height)
    previewTexture = texture
    previewSurface = Surface(texture)
    if (isRunning) backgroundHandler?.post { rebuildSession() }
  }

  /**
   * The preview view is going away (app backgrounded, screen changed). The
   * surface must leave the session BEFORE it is released, otherwise the camera
   * errors out and the stream drops.
   */
  fun detachPreview() {
    val surface = previewSurface ?: return
    previewSurface = null
    previewTexture = null
    val session = captureSession
    if (session != null) {
      captureSession = null
      try { session.stopRepeating() } catch (_: Exception) {}
      try { session.abortCaptures() } catch (_: Exception) {}
      try { session.close() } catch (_: Exception) {}
    }
    try { surface.release() } catch (_: Exception) {}
    if (wantRunning && cameraDevice != null) backgroundHandler?.post { rebuildSession() }
  }

  // MARK: - Lifecycle

  /** Start (or restart) capture. Blocks until frames flow; throws otherwise. */
  fun start(settings: Settings, profile: String = "fmp4") {
    synchronized(startLock) {
      wantRunning = true
      this.settings = settings
      try {
        openLocked(settings)
        Log.info("capture started ${settings.resolution.width}x${settings.resolution.height}@${settings.fps} ($profile)")
      } catch (e: Exception) {
        Log.error("capture start failed: ${e.message}")
        wantRunning = false
        closeLocked()
        throw e
      }
    }
  }

  fun stop() {
    wantRunning = false
    synchronized(startLock) { closeLocked() }
  }

  private fun openLocked(settings: Settings) {
    closeLocked()

    val ctx = context ?: throw IllegalStateException("No Android context")
    if (ctx.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
      throw SecurityException("Camera permission not granted")
    }
    val mgr = manager ?: throw IllegalStateException("Camera service unavailable")
    val lenses = LensDiscovery.discover(ctx)
    val lens = lenses.firstOrNull { it.id == settings.lens } ?: lenses.firstOrNull()
      ?: throw IllegalStateException("No camera available")
    val chars = mgr.getCameraCharacteristics(lens.cameraId)
    characteristics = chars

    startBackgroundThread()
    val handler = backgroundHandler ?: throw IllegalStateException("Camera thread did not start")

    val surface = fmp4Writer.start(
      width = settings.resolution.width,
      height = settings.resolution.height,
      fps = settings.fps,
      bitrate = settings.bitrate
    )
    encoderSurface = surface

    val ready = CountDownLatch(1)
    var failure: Exception? = null
    val fail = { e: Exception -> if (failure == null) failure = e; ready.countDown() }

    mgr.openCamera(lens.cameraId, object : CameraDevice.StateCallback() {
      override fun onOpened(camera: CameraDevice) {
        cameraDevice = camera
        createSession(camera, onReady = { ready.countDown() }, onFailed = fail)
      }

      override fun onDisconnected(camera: CameraDevice) {
        try { camera.close() } catch (_: Exception) {}
        if (cameraDevice === camera) cameraDevice = null
        if (ready.count > 0) fail(IllegalStateException("Camera disconnected while opening"))
        else onCameraLost("the camera was taken by another app")
      }

      override fun onError(camera: CameraDevice, error: Int) {
        try { camera.close() } catch (_: Exception) {}
        if (cameraDevice === camera) cameraDevice = null
        val message = "camera error $error"
        if (ready.count > 0) fail(IllegalStateException(message))
        else onCameraLost(message)
      }
    }, handler)

    if (!ready.await(OPEN_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
      throw IllegalStateException("The camera did not start within ${OPEN_TIMEOUT_MS / 1000}s")
    }
    failure?.let { throw it }
  }

  private fun closeLocked() {
    isRunning = false
    val session = captureSession
    captureSession = null
    requestBuilder = null
    try { session?.close() } catch (_: Exception) {}
    val camera = cameraDevice
    cameraDevice = null
    try { camera?.close() } catch (_: Exception) {}
    fmp4Writer.stop()
    encoderSurface = null
    stopBackgroundThread()
  }

  private fun createSession(
    camera: CameraDevice,
    onReady: () -> Unit,
    onFailed: (Exception) -> Unit
  ) {
    val encoder = encoderSurface ?: return onFailed(IllegalStateException("Encoder not started"))
    val surfaces = mutableListOf(encoder)
    previewSurface?.let { surfaces.add(it) }

    try {
      @Suppress("DEPRECATION")
      camera.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
        override fun onConfigured(session: CameraCaptureSession) {
          if (cameraDevice !== camera) {
            try { session.close() } catch (_: Exception) {}
            return onFailed(IllegalStateException("Camera closed while configuring"))
          }
          try {
            val builder = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD)
            surfaces.forEach { builder.addTarget(it) }
            builder.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO)
            applySettings(builder, settings)
            session.setRepeatingRequest(builder.build(), null, backgroundHandler)
            captureSession = session
            requestBuilder = builder
            isRunning = true
            onReady()
          } catch (e: Exception) {
            Log.error("setRepeatingRequest failed: ${e.message}")
            isRunning = false
            onFailed(e)
          }
        }

        override fun onConfigureFailed(session: CameraCaptureSession) {
          isRunning = false
          onFailed(IllegalStateException("Camera session configuration failed"))
        }
      }, backgroundHandler)
    } catch (e: Exception) {
      isRunning = false
      onFailed(e)
    }
  }

  /** Recreate only the capture session (preview added/removed); the encoder and
   *  its stream keep going. */
  private fun rebuildSession() {
    val camera = cameraDevice ?: return
    val old = captureSession
    captureSession = null
    try { old?.close() } catch (_: Exception) {}
    createSession(
      camera,
      onReady = { Log.info("capture session rebuilt (preview ${if (previewSurface != null) "on" else "off"})") },
      onFailed = { e -> onCameraLost("session rebuild failed: ${e.message}") }
    )
  }

  // MARK: - Recovery

  private fun onCameraLost(reason: String) {
    isRunning = false
    Log.warn("camera lost: $reason")
    onInterruption?.invoke(reason, false)
    if (wantRunning) scheduleRecovery()
  }

  private fun scheduleRecovery() {
    if (recovering) return
    recovering = true
    Thread({
      var delayMs = 1000L
      try {
        while (wantRunning) {
          try { Thread.sleep(delayMs) } catch (_: InterruptedException) { return@Thread }
          if (!wantRunning) return@Thread
          try {
            synchronized(startLock) {
              if (!wantRunning) return@Thread
              onWillRestart?.invoke()
              openLocked(settings)
            }
            Log.info("camera recovered")
            onInterruption?.invoke("recovered", true)
            return@Thread
          } catch (e: Exception) {
            Log.warn("camera recovery failed: ${e.message}")
            delayMs = minOf(delayMs * 2, 10_000L)
          }
        }
      } finally {
        recovering = false
      }
    }, "WebcamoCameraRecovery").start()
  }

  // MARK: - Settings

  fun applyLive(next: Settings) {
    settings = next
    val builder = requestBuilder ?: return
    val session = captureSession ?: return
    try {
      applySettings(builder, next)
      session.setRepeatingRequest(builder.build(), null, backgroundHandler)
    } catch (e: Exception) {
      Log.warn("applyLive failed: ${e.message}")
    }
  }

  /** Everything the request can carry. Used at session start and for live changes. */
  private fun applySettings(builder: CaptureRequest.Builder, s: Settings) {
    val chars = characteristics ?: return

    // Zoom
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      val range = chars.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE)
      val zoom = range?.clamp(s.zoom.toFloat()) ?: s.zoom.toFloat()
      builder.set(CaptureRequest.CONTROL_ZOOM_RATIO, zoom)
    } else {
      val active = chars.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE)
      val maxZoom = chars.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1f
      if (active != null) {
        val z = s.zoom.toFloat().coerceIn(1f, maxZoom)
        val w = (active.width() / z).toInt()
        val h = (active.height() / z).toInt()
        val left = (active.width() - w) / 2
        val top = (active.height() - h) / 2
        builder.set(CaptureRequest.SCALER_CROP_REGION, Rect(left, top, left + w, top + h))
      }
    }

    // Torch
    if (chars.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true) {
      builder.set(
        CaptureRequest.FLASH_MODE,
        if (s.torch) CaptureRequest.FLASH_MODE_TORCH else CaptureRequest.FLASH_MODE_OFF
      )
    }

    // Exposure compensation: EV bias divided by the camera's step size.
    val step = chars.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP)
    val evRange = chars.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
    if (step != null && evRange != null && step.toDouble() > 0) {
      val index = (s.exposure.bias / step.toDouble()).roundToInt()
      builder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, evRange.clamp(index))
    }
    builder.set(CaptureRequest.CONTROL_AE_LOCK, s.exposure.locked)
    builder.set(CaptureRequest.CONTROL_AWB_LOCK, s.whiteBalance.locked)

    // Focus
    val afModes = chars.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES) ?: IntArray(0)
    val afMode = when {
      s.focus.locked && afModes.contains(CaptureRequest.CONTROL_AF_MODE_OFF) -> CaptureRequest.CONTROL_AF_MODE_OFF
      afModes.contains(CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO) -> CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO
      afModes.isNotEmpty() -> afModes[0]
      else -> null
    }
    afMode?.let { builder.set(CaptureRequest.CONTROL_AF_MODE, it) }

    // Frame rate
    pickFpsRange(chars, s.fps)?.let { builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, it) }

    // Stabilization
    val wantStable = s.stabilization != "off"
    if (supportsVideoStabilization(chars)) {
      builder.set(
        CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
        if (wantStable) CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON
        else CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_OFF
      )
    }
    if (supportsOis(chars)) {
      builder.set(
        CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
        if (wantStable) CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON
        else CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_OFF
      )
    }
  }

  /** A fixed [fps, fps] range if offered, else the narrowest range ending at fps. */
  private fun pickFpsRange(chars: CameraCharacteristics, fps: Int): Range<Int>? {
    val ranges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES) ?: return null
    ranges.firstOrNull { it.lower == fps && it.upper == fps }?.let { return it }
    ranges.filter { it.upper == fps }.maxByOrNull { it.lower }?.let { return it }
    return ranges.filter { it.upper >= fps }.minByOrNull { it.upper - fps }
  }

  private fun supportsVideoStabilization(chars: CameraCharacteristics): Boolean =
    chars.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES)
      ?.contains(CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON) == true

  private fun supportsOis(chars: CameraCharacteristics): Boolean =
    chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION)
      ?.contains(CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON) == true

  /** Tap to focus. x and y are 0..1 in the frame; Camera2 wants sensor pixels. */
  fun focus(x: Double, y: Double) {
    val builder = requestBuilder ?: return
    val session = captureSession ?: return
    val active = characteristics?.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE) ?: return
    try {
      val cx = (x.coerceIn(0.0, 1.0) * active.width()).toInt()
      val cy = (y.coerceIn(0.0, 1.0) * active.height()).toInt()
      val half = maxOf(active.width(), active.height()) / 20
      val rect = MeteringRectangle(
        (cx - half).coerceAtLeast(0),
        (cy - half).coerceAtLeast(0),
        half * 2,
        half * 2,
        MeteringRectangle.METERING_WEIGHT_MAX
      )
      builder.set(CaptureRequest.CONTROL_AF_REGIONS, arrayOf(rect))
      builder.set(CaptureRequest.CONTROL_AE_REGIONS, arrayOf(rect))
      builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_AUTO)
      builder.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_START)
      session.capture(builder.build(), null, backgroundHandler)
      builder.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_IDLE)
      session.setRepeatingRequest(builder.build(), null, backgroundHandler)
    } catch (e: Exception) {
      Log.warn("focus error: ${e.message}")
    }
  }

  // MARK: - Threads

  private fun startBackgroundThread() {
    if (backgroundThread != null) return
    val t = HandlerThread("WebcamoCamera").apply { start() }
    backgroundThread = t
    backgroundHandler = Handler(t.looper)
  }

  private fun stopBackgroundThread() {
    val t = backgroundThread ?: return
    backgroundThread = null
    backgroundHandler = null
    t.quitSafely()
    if (Thread.currentThread() !== t) {
      try { t.join(1000) } catch (_: InterruptedException) { Thread.currentThread().interrupt() }
    }
  }

  // MARK: - FragmentedMP4WriterDelegate

  override fun onSegmentProduced(writer: FragmentedMP4Writer, data: ByteArray, isInitializationSegment: Boolean) {
    delegate?.onSegmentProduced(this, data, isInitializationSegment)
  }

  override fun onWriterFailed(writer: FragmentedMP4Writer, error: Exception) {
    // The encoder died: rebuild everything as if the camera had been lost.
    onCameraLost("encoder failed: ${error.message}")
  }
}
