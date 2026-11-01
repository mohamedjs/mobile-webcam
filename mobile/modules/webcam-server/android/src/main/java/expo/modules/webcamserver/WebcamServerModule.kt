package expo.modules.webcamserver

import android.view.WindowManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.webcamserver.capture.CaptureSessionController
import expo.modules.webcamserver.capture.CaptureSessionControllerDelegate
import expo.modules.webcamserver.server.Auth
import expo.modules.webcamserver.server.HTTPRequest
import expo.modules.webcamserver.server.HTTPResponse
import expo.modules.webcamserver.server.HTTPServer
import expo.modules.webcamserver.server.HTTPServerDelegate
import expo.modules.webcamserver.server.Routes
import expo.modules.webcamserver.server.StreamConnection
import expo.modules.webcamserver.support.Log
import expo.modules.webcamserver.support.Settings
import expo.modules.webcamserver.support.SettingsStore
import expo.modules.webcamserver.support.Telemetry
import expo.modules.webcamserver.views.WebcamPreviewView
import org.json.JSONObject

class WebcamServerModule : Module(), HTTPServerDelegate, CaptureSessionControllerDelegate {

  private val context get() = appContext.reactContext
  private var capture: CaptureSessionController? = null
  private val server = HTTPServer()
  private var store: SettingsStore? = null
  private var auth = Auth("")
  private var routes: Routes? = null

  override fun definition() = ModuleDefinition {
    Name("WebcamServer")

    Events(
      "onClientConnected",
      "onClientDisconnected",
      "onTelemetry",
      "onThermalStateChange",
      "onServerStateChange",
      "onError"
    )

    OnCreate {
      val ctx = context
      val s = SettingsStore(ctx)
      val c = CaptureSessionController(ctx)
      store = s
      capture = c
      c.delegate = this@WebcamServerModule
      c.onInterruption = { reason, recovered ->
        sendEvent(
          "onError",
          mapOf(
            "code" to if (recovered) "capture_resumed" else "capture_interrupted",
            "message" to if (recovered) "Camera resumed." else "The camera stopped: $reason.",
            "fatal" to false
          )
        )
      }
      server.delegate = this@WebcamServerModule
      routes = Routes(
        capture = c,
        store = s,
        appVersion = "1.0.0",
        protocolVersion = 1,
        onSettingsApplied = { settings, restart ->
          handleSettingsApplied(settings, restart)
        }
      )
    }

    OnDestroy {
      server.stop()
      capture?.stop()
      appContext.currentActivity?.let { act ->
        act.runOnUiThread {
          act.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
    }

    AsyncFunction("startServer") { port: Int, token: String ->
      auth = Auth(token)
      val c = capture ?: throw IllegalStateException("Capture not initialized")
      val s = store ?: throw IllegalStateException("Store not initialized")

      c.start(s.current, profile = "fmp4")
      server.start(port)

      appContext.currentActivity?.let { act ->
        act.runOnUiThread {
          act.window?.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }

      sendEvent("onServerStateChange", mapOf("running" to true, "port" to port))
      mapOf("port" to port, "token" to token)
    }

    AsyncFunction("stopServer") {
      server.stop()
      capture?.stop()
      appContext.currentActivity?.let { act ->
        act.runOnUiThread {
          act.window?.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
      }
      sendEvent("onServerStateChange", mapOf("running" to false, "port" to null))
    }

    Function("isRunning") {
      server.isRunning && (capture?.isRunning == true)
    }

    AsyncFunction("getCapabilities") {
      capture?.capabilities() ?: emptyMap<String, Any>()
    }

    AsyncFunction("getSettings") {
      store?.current?.toMap() ?: emptyMap<String, Any>()
    }

    AsyncFunction("updateSettings") { patch: Map<String, Any> ->
      val s = store ?: throw IllegalStateException("Store not initialized")
      val c = capture ?: throw IllegalStateException("Capture not initialized")
      val previous = s.current
      val next = previous.copy(
        resolution = previous.resolution.copy(),
        cinematic = previous.cinematic.copy(),
        blurFallback = previous.blurFallback.copy(),
        exposure = previous.exposure.copy(),
        focus = previous.focus.copy(),
        whiteBalance = previous.whiteBalance.copy(),
        audio = previous.audio.copy()
      )

      val issue = Routes.applyPatch(JSONObject(patch), next, c.capabilities())
      if (issue != null) {
        throw IllegalArgumentException("${issue.field}: ${issue.message}")
      }

      s.replace(next)
      val restart = next.requiresRestart(previous)
      if (restart && c.isRunning) {
        c.stop()
        c.start(next, profile = "fmp4")
      } else {
        c.applyLive(next)
      }

      next.toMap()
    }

    AsyncFunction("focusAt") { x: Double, y: Double ->
      capture?.focus(x, y)
    }

    AsyncFunction("setLens") { lensId: String ->
      val s = store ?: throw IllegalStateException("Store not initialized")
      val c = capture ?: throw IllegalStateException("Capture not initialized")
      val next = s.current
      if (next.lockLens) {
        throw IllegalArgumentException("lens: Lens is locked")
      }
      next.lens = lensId
      s.replace(next)
      if (c.isRunning) {
        c.stop()
        c.start(next, profile = "fmp4")
      }
      c.capabilities()
    }

    AsyncFunction("getTelemetry") {
      Telemetry.shared.snapshot()
    }

    View(WebcamPreviewView::class) {
      Prop("resizeMode") { view: WebcamPreviewView, mode: String ->
        view.resizeMode = mode
      }
    }
  }

  private fun handleSettingsApplied(settings: Settings, restartRequired: Boolean) {
    val c = capture ?: return
    if (restartRequired && c.isRunning) {
      Thread {
        try {
          c.stop()
          c.start(settings, profile = "fmp4")
        } catch (e: Exception) {
          sendEvent(
            "onError",
            mapOf("code" to "capture_failed", "message" to (e.message ?: "Capture failed"), "fatal" to true)
          )
        }
      }.start()
    }
  }

  override fun handleRequest(server: HTTPServer, request: HTTPRequest): HTTPResponse {
    auth.authorize(request)?.let { return it }
    return routes?.handle(request) ?: HTTPResponse.error("internal", "Routes not ready", 500)
  }

  override fun openStream(server: HTTPServer, profile: String, connection: StreamConnection): Boolean {
    val c = capture ?: return false
    if (!c.isRunning) return false

    connection.sendHeader(
      contentType = if (profile == "mjpeg") {
        "multipart/x-mixed-replace; boundary=${expo.modules.webcamserver.encoding.MJPEGEncoder.BOUNDARY}"
      } else {
        "video/mp4"
      }
    )

    if (profile == "fmp4") {
      c.initializationSegment?.let { initSeg ->
        connection.send(initSeg, isInit = true)
      }
    }

    sendEvent("onClientConnected", mapOf("clientId" to connection.id, "profile" to profile))
    return true
  }

  override fun serverDidChangeClients(server: HTTPServer, count: Int) {
    sendEvent("onTelemetry", Telemetry.shared.snapshot())
  }

  override fun onSegmentProduced(controller: CaptureSessionController, data: ByteArray, isInit: Boolean) {
    server.broadcast(data, isInit = isInit)
  }

  override fun onJpegProduced(controller: CaptureSessionController, data: ByteArray) {
    server.broadcastMJPEG(data)
  }

  override fun onCaptureFailed(controller: CaptureSessionController, error: Exception) {
    Log.error("Capture failed: ${error.message}")
    sendEvent(
      "onError",
      mapOf("code" to "capture_failed", "message" to (error.message ?: "Capture failed"), "fatal" to true)
    )
  }
}
