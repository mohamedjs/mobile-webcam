package expo.modules.webcamserver.server

import android.os.Build
import expo.modules.webcamserver.capture.CaptureSessionController
import expo.modules.webcamserver.support.Resolution
import expo.modules.webcamserver.support.Settings
import expo.modules.webcamserver.support.SettingsStore
import expo.modules.webcamserver.support.Telemetry
import org.json.JSONObject

class Routes(
  private val capture: CaptureSessionController,
  private val store: SettingsStore,
  private val appVersion: String,
  private val protocolVersion: Int,
  /** (next, previous, restartRequired). Restarts the camera before returning;
   *  throws when it could not. */
  private val onSettingsApplied: (Settings, Settings, Boolean) -> Unit
) {
  fun handle(request: HTTPRequest): HTTPResponse {
    return when (request.method to request.path) {
      "GET" to "/health" -> health()
      "GET" to "/capabilities" -> HTTPResponse.json(capture.capabilities())
      "GET" to "/settings" -> HTTPResponse.json(store.current.toMap())
      "PATCH" to "/settings" -> patchSettings(request)
      "GET" to "/telemetry" -> HTTPResponse.json(Telemetry.shared.snapshot())
      "POST" to "/actions/focus" -> focus(request)
      "POST" to "/actions/switch-camera" -> switchCamera(request)
      else -> HTTPResponse.error("internal", "No route for ${request.method} ${request.path}", 404)
    }
  }

  private val deviceInfo: Map<String, String> by lazy {
    mapOf(
      "model" to (Build.MODEL ?: "Android"),
      "ios" to "Android ${Build.VERSION.RELEASE}",
      "platform" to "android",
      "osVersion" to Build.VERSION.RELEASE,
      "name" to "${Build.MANUFACTURER} ${Build.MODEL}"
    )
  }

  private fun health(): HTTPResponse {
    return HTTPResponse.json(
      mapOf(
        "ok" to true,
        "app" to "webcamo",
        "version" to appVersion,
        "protocol" to protocolVersion,
        "device" to deviceInfo,
        "streaming" to capture.isRunning,
        "battery" to Telemetry.shared.battery,
        "thermalState" to Telemetry.shared.thermalState
      )
    )
  }

  private fun patchSettings(request: HTTPRequest): HTTPResponse {
    val patch = request.jsonObject ?: return HTTPResponse.error("invalid_setting", "Body must be a JSON object", 400)
    val previous = store.current
    val next = previous.deepCopy()

    val issue = try {
      applyPatch(patch, next, capture.capabilities())
    } catch (e: Exception) {
      Issue("settings", "Malformed value: ${e.message}")
    }
    if (issue != null) {
      return HTTPResponse.error("invalid_setting", issue.message, 400, issue.field)
    }

    store.replace(next)
    val restart = next.requiresRestart(previous)
    if (!restart) {
      capture.applyLive(next)
    }
    // A restart happens BEFORE answering, so a 200 means the camera is already
    // producing with the new settings and the desktop can reconnect at once.
    try {
      onSettingsApplied(next, previous, restart)
    } catch (e: Exception) {
      return HTTPResponse.error("capture_failed", e.message ?: "Camera restart failed", 500)
    }
    return HTTPResponse.json(store.current.toMap())
  }

  private fun focus(request: HTTPRequest): HTTPResponse {
    val body = request.jsonObject ?: return HTTPResponse.error("invalid_setting", "x and y are required", 400)
    val x = body.optDouble("x", -1.0)
    val y = body.optDouble("y", -1.0)
    if (x < 0 || y < 0) {
      return HTTPResponse.error("invalid_setting", "x and y are required", 400)
    }
    capture.focus(x, y)
    return HTTPResponse.noContent()
  }

  private fun switchCamera(request: HTTPRequest): HTTPResponse {
    val body = request.jsonObject ?: return HTTPResponse.error("invalid_setting", "lens is required", 400, "lens")
    val lens = body.optString("lens", "")
    if (lens.isEmpty()) {
      return HTTPResponse.error("invalid_setting", "lens is required", 400, "lens")
    }
    if (store.current.lockLens) {
      return HTTPResponse.error("unsupported_capability", "Lens is locked in the app", 403)
    }
    val patchReq = HTTPRequest(
      method = "PATCH",
      path = "/settings",
      query = emptyMap(),
      headers = request.headers,
      body = JSONObject(mapOf("lens" to lens)).toString().toByteArray(Charsets.UTF_8)
    )
    return patchSettings(patchReq)
  }

  data class Issue(val field: String, val message: String)

  companion object {
    @Suppress("UNCHECKED_CAST")
    fun applyPatch(patch: JSONObject, settings: Settings, capabilities: Map<String, Any>): Issue? {
      val lenses = (capabilities["lenses"] as? List<Map<String, Any>>) ?: emptyList()
      val resolutions = (capabilities["resolutions"] as? List<Map<String, Any>>) ?: emptyList()

      if (patch.has("lens")) {
        val lens = patch.getString("lens")
        if (lenses.none { it["id"] == lens }) {
          return Issue("lens", "Unknown lens \"$lens\"")
        }
        settings.lens = lens
      }

      if (patch.has("resolution")) {
        val resObj = patch.getJSONObject("resolution")
        val w = resObj.optInt("width", settings.resolution.width)
        val h = resObj.optInt("height", settings.resolution.height)
        if (resolutions.none { (it["width"] as? Int) == w && (it["height"] as? Int) == h }) {
          return Issue("resolution", "Device does not offer ${w}x${h}")
        }
        settings.resolution = Resolution(w, h)
      }

      if (patch.has("fps")) {
        val fps = patch.getInt("fps")
        val mode = resolutions.firstOrNull {
          (it["width"] as? Int) == settings.resolution.width && (it["height"] as? Int) == settings.resolution.height
        }
        val ceiling = (mode?.get("maxFps") as? Int) ?: 30
        if (fps <= 0 || fps > ceiling) {
          return Issue("fps", "${fps}fps exceeds ${ceiling}fps for this format")
        }
        settings.fps = fps
      }

      if (patch.has("bitrate")) {
        val bitrate = patch.getInt("bitrate")
        if (bitrate !in 1_000_000..40_000_000) {
          return Issue("bitrate", "Bitrate must be 1-40 Mbps")
        }
        settings.bitrate = bitrate
      }

      if (patch.has("zoom")) {
        val zoom = patch.getDouble("zoom")
        val lens = lenses.firstOrNull { it["id"] == settings.lens }
        val lo = (lens?.get("minZoom") as? Double) ?: 1.0
        val hi = (lens?.get("maxZoom") as? Double) ?: 8.0
        if (zoom !in lo..hi) {
          return Issue("zoom", "Zoom outside $lo-$hi for this lens")
        }
        settings.zoom = zoom
      }

      if (patch.has("torch")) settings.torch = patch.getBoolean("torch")
      if (patch.has("mirror")) settings.mirror = patch.getBoolean("mirror")
      if (patch.has("lockLens")) settings.lockLens = patch.getBoolean("lockLens")

      if (patch.has("rotation")) {
        val rot = patch.getInt("rotation")
        if (rot !in listOf(0, 90, 180, 270)) {
          return Issue("rotation", "Rotation must be 0, 90, 180 or 270")
        }
        settings.rotation = rot
      }

      if (patch.has("stabilization")) {
        val value = patch.getString("stabilization")
        val supported = (capabilities["stabilization"] as? List<String>) ?: listOf("off")
        if (value !in supported) {
          return Issue("stabilization", "Device does not support \"$value\"")
        }
        settings.stabilization = value
      }
      if (patch.has("hdr")) {
        val hdr = patch.getBoolean("hdr")
        if (hdr && capabilities["hdr"] != true) return Issue("hdr", "Device does not support HDR")
        settings.hdr = hdr
      }

      patch.optJSONObject("exposure")?.let { e ->
        if (e.has("bias")) {
          val bias = e.getDouble("bias")
          if (bias !in -2.0..2.0) return Issue("exposure.bias", "Bias must be -2 to +2 EV")
          settings.exposure.bias = bias
        }
        if (e.has("locked")) settings.exposure.locked = e.getBoolean("locked")
        if (e.has("mode")) settings.exposure.mode = e.getString("mode")
      }
      patch.optJSONObject("focus")?.let { f ->
        if (f.has("locked")) settings.focus.locked = f.getBoolean("locked")
        if (f.has("mode")) settings.focus.mode = f.getString("mode")
      }
      patch.optJSONObject("whiteBalance")?.let { w ->
        if (w.has("locked")) settings.whiteBalance.locked = w.getBoolean("locked")
        if (w.has("mode")) settings.whiteBalance.mode = w.getString("mode")
      }
      patch.optJSONObject("audio")?.let { a ->
        // Stored for when Android gets audio; the capabilities say unsupported.
        if (a.has("enabled")) settings.audio.enabled = a.getBoolean("enabled")
        if (a.has("sampleRate")) settings.audio.sampleRate = a.getInt("sampleRate")
        if (a.has("channels")) settings.audio.channels = a.getInt("channels")
        if (a.has("bitrate")) settings.audio.bitrate = a.getInt("bitrate")
      }

      return null
    }
  }
}
