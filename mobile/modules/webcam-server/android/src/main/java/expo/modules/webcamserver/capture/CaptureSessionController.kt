package expo.modules.webcamserver.capture

import android.content.Context
import android.graphics.SurfaceTexture
import android.hardware.camera2.*
import android.hardware.camera2.params.MeteringRectangle
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import expo.modules.webcamserver.encoding.FragmentedMP4Writer
import expo.modules.webcamserver.encoding.FragmentedMP4WriterDelegate
import expo.modules.webcamserver.support.Log
import expo.modules.webcamserver.support.Settings
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

interface CaptureSessionControllerDelegate {
  fun onSegmentProduced(controller: CaptureSessionController, data: ByteArray, isInit: Boolean)
  fun onJpegProduced(controller: CaptureSessionController, data: ByteArray)
  fun onCaptureFailed(controller: CaptureSessionController, error: Exception)
}

class CaptureSessionController(private val context: Context? = null) : FragmentedMP4WriterDelegate {

  companion object {
    var sharedCapture: CaptureSessionController? = null
      private set
  }

  init {
    sharedCapture = this
  }

  var delegate: CaptureSessionControllerDelegate? = null
  var onInterruption: ((String, Boolean) -> Unit)? = null

  private var cameraDevice: CameraDevice? = null
  private var captureSession: CameraCaptureSession? = null
  private var captureRequestBuilder: CaptureRequest.Builder? = null
  private var backgroundThread: HandlerThread? = null
  private var backgroundHandler: Handler? = null

  private val fmp4Writer = FragmentedMP4Writer()
  private val cameraOpenCloseLock = Semaphore(1)
  private var previewSurface: Surface? = null
  private var previewTexture: SurfaceTexture? = null

  var isRunning: Boolean = false
    private set

  val initializationSegment: ByteArray?
    get() = fmp4Writer.initializationSegment

  init {
    fmp4Writer.delegate = this
  }

  fun capabilities(): Map<String, Any> {
    val lenses = LensDiscovery.discover(context).map { it.toMap() }
    val primaryLens = lenses.firstOrNull { it["id"] == "back-wide" } ?: lenses.firstOrNull()
    val resolutions = LensDiscovery.resolutions(context, primaryLens?.get("id") as? String)

    return mapOf(
      "lenses" to lenses,
      "resolutions" to resolutions,
      "cinematic" to mapOf(
        "supported" to true,
        "minAperture" to 2.0,
        "maxAperture" to 16.0,
        "resolutions" to listOf(listOf(1920, 1080), listOf(3840, 2160)),
        "maxFps" to 30
      ),
      "stabilization" to listOf("off", "standard", "cinematic"),
      "hdr" to true,
      "audio" to mapOf(
        "sampleRates" to listOf(44100, 48000),
        "maxChannels" to 2
      )
    )
  }

  fun attachPreviewTexture(texture: SurfaceTexture, width: Int, height: Int) {
    texture.setDefaultBufferSize(width, height)
    previewTexture = texture
    previewSurface = Surface(texture)
  }

  fun detachPreview() {
    previewSurface?.release()
    previewSurface = null
    previewTexture = null
  }

  fun start(settings: Settings, profile: String = "fmp4") {
    stop()
    startBackgroundThread()

    try {
      val encoderSurface = fmp4Writer.start(
        width = settings.resolution.width,
        height = settings.resolution.height,
        fps = settings.fps,
        bitrate = settings.bitrate,
        audioSettings = if (settings.audio.enabled) settings.audio else null
      )

      openCamera(settings, encoderSurface)
      isRunning = true
      Log.info("CaptureSessionController started with $profile")
    } catch (e: Exception) {
      Log.error("CaptureSessionController start failed: ${e.message}")
      stop()
      throw e
    }
  }

  fun stop() {
    isRunning = false
    try {
      cameraOpenCloseLock.acquire()
      captureSession?.close()
      captureSession = null
      cameraDevice?.close()
      cameraDevice = null
    } catch (_: Exception) {} finally {
      cameraOpenCloseLock.release()
    }
    fmp4Writer.stop()
    stopBackgroundThread()
  }

  fun applyLive(settings: Settings) {
    val builder = captureRequestBuilder ?: return
    val session = captureSession ?: return

    try {
      // Zoom
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
        builder.set(CaptureRequest.CONTROL_ZOOM_RATIO, settings.zoom.toFloat())
      }

      // Torch
      val flashMode = if (settings.torch) CaptureRequest.FLASH_MODE_TORCH else CaptureRequest.FLASH_MODE_OFF
      builder.set(CaptureRequest.FLASH_MODE, flashMode)

      // Exposure bias
      val evBias = (settings.exposure.bias * 2).toInt() // index
      builder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, evBias)

      // Auto-exposure lock
      builder.set(CaptureRequest.CONTROL_AE_LOCK, settings.exposure.locked)
      builder.set(CaptureRequest.CONTROL_AWB_LOCK, settings.whiteBalance.locked)

      session.setRepeatingRequest(builder.build(), null, backgroundHandler)
    } catch (e: Exception) {
      Log.warn("applyLive failed: ${e.message}")
    }
  }

  fun focus(x: Double, y: Double) {
    val builder = captureRequestBuilder ?: return
    val session = captureSession ?: return
    try {
      val focusX = (x * 1000).toInt().coerceIn(0, 1000)
      val focusY = (y * 1000).toInt().coerceIn(0, 1000)
      val rect = MeteringRectangle(focusX, focusY, 100, 100, MeteringRectangle.METERING_WEIGHT_MAX)
      builder.set(CaptureRequest.CONTROL_AF_REGIONS, arrayOf(rect))
      builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_AUTO)
      builder.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_START)
      session.capture(builder.build(), null, backgroundHandler)
    } catch (e: Exception) {
      Log.warn("focus error: ${e.message}")
    }
  }

  private fun openCamera(settings: Settings, encoderSurface: Surface) {
    val manager = context?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager ?: return
    val lenses = LensDiscovery.discover(context)
    val lens = lenses.firstOrNull { it.id == settings.lens } ?: lenses.firstOrNull() ?: return

    if (!cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)) {
      throw RuntimeException("Time out waiting to lock camera opening.")
    }

    try {
      manager.openCamera(lens.cameraId, object : CameraDevice.StateCallback() {
        override fun onOpened(camera: CameraDevice) {
          cameraOpenCloseLock.release()
          cameraDevice = camera
          createCaptureSession(camera, encoderSurface)
        }

        override fun onDisconnected(camera: CameraDevice) {
          cameraOpenCloseLock.release()
          camera.close()
          cameraDevice = null
          isRunning = false
          onInterruption?.invoke("Camera disconnected", false)
        }

        override fun onError(camera: CameraDevice, error: Int) {
          cameraOpenCloseLock.release()
          camera.close()
          cameraDevice = null
          isRunning = false
          val msg = "Camera device error: $error"
          Log.error(msg)
          onInterruption?.invoke(msg, false)
        }
      }, backgroundHandler)
    } catch (e: SecurityException) {
      cameraOpenCloseLock.release()
      throw e
    }
  }

  private fun createCaptureSession(camera: CameraDevice, encoderSurface: Surface) {
    try {
      val surfaces = mutableListOf(encoderSurface)
      previewSurface?.let { surfaces.add(it) }

      camera.createCaptureSession(surfaces, object : CameraCaptureSession.StateCallback() {
        override fun onConfigured(session: CameraCaptureSession) {
          if (cameraDevice == null) return
          captureSession = session
          try {
            val builder = camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD)
            builder.addTarget(encoderSurface)
            previewSurface?.let { builder.addTarget(it) }

            builder.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO)
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)
            captureRequestBuilder = builder

            session.setRepeatingRequest(builder.build(), null, backgroundHandler)
          } catch (e: Exception) {
            Log.error("setRepeatingRequest failed: ${e.message}")
          }
        }

        override fun onConfigureFailed(session: CameraCaptureSession) {
          Log.error("Camera session configuration failed")
        }
      }, backgroundHandler)
    } catch (e: Exception) {
      Log.error("createCaptureSession failed: ${e.message}")
    }
  }

  private fun startBackgroundThread() {
    backgroundThread = HandlerThread("CameraBackground").apply {
      start()
      backgroundHandler = Handler(looper)
    }
  }

  private fun stopBackgroundThread() {
    backgroundThread?.quitSafely()
    try {
      backgroundThread?.join()
      backgroundThread = null
      backgroundHandler = null
    } catch (_: Exception) {}
  }

  override fun onSegmentProduced(writer: FragmentedMP4Writer, data: ByteArray, isInitializationSegment: Boolean) {
    delegate?.onSegmentProduced(this, data, isInitializationSegment)
  }

  override fun onWriterFailed(writer: FragmentedMP4Writer, error: Exception) {
    delegate?.onCaptureFailed(this, error)
  }
}
