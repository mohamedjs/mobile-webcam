package expo.modules.webcamserver.support

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

data class Resolution(
  var width: Int = 1920,
  var height: Int = 1080
)

data class CinematicSettings(
  var enabled: Boolean = false,
  var aperture: Double = 2.8
)

data class BlurFallbackSettings(
  var enabled: Boolean = false,
  var intensity: Double = 0.6
)

data class ExposureSettings(
  var mode: String = "auto",
  var bias: Double = 0.0,
  var locked: Boolean = false
)

data class LockableSettings(
  var mode: String = "auto",
  var locked: Boolean = false
)

data class AudioSettings(
  var enabled: Boolean = true,
  var sampleRate: Int = 48000,
  var channels: Int = 1,
  var bitrate: Int = 128000
)

data class Settings(
  var lens: String = "back-wide",
  var resolution: Resolution = Resolution(1920, 1080),
  var fps: Int = 30,
  var bitrate: Int = 8000000,
  var cinematic: CinematicSettings = CinematicSettings(),
  var blurFallback: BlurFallbackSettings = BlurFallbackSettings(),
  var zoom: Double = 1.0,
  var torch: Boolean = false,
  var mirror: Boolean = false,
  var rotation: Int = 0,
  var stabilization: String = "standard",
  var hdr: Boolean = true,
  var lockLens: Boolean = false,
  var exposure: ExposureSettings = ExposureSettings(),
  var focus: LockableSettings = LockableSettings(),
  var whiteBalance: LockableSettings = LockableSettings(),
  var audio: AudioSettings = AudioSettings()
) {
  fun requiresRestart(comparedTo: Settings): Boolean {
    return lens != comparedTo.lens ||
      resolution != comparedTo.resolution ||
      fps != comparedTo.fps ||
      rotation != comparedTo.rotation
  }

  fun toMap(): Map<String, Any> {
    return mapOf(
      "lens" to lens,
      "resolution" to mapOf("width" to resolution.width, "height" to resolution.height),
      "fps" to fps,
      "bitrate" to bitrate,
      "cinematic" to mapOf("enabled" to cinematic.enabled, "aperture" to cinematic.aperture),
      "blurFallback" to mapOf("enabled" to blurFallback.enabled, "intensity" to blurFallback.intensity),
      "zoom" to zoom,
      "torch" to torch,
      "mirror" to mirror,
      "rotation" to rotation,
      "stabilization" to stabilization,
      "hdr" to hdr,
      "lockLens" to lockLens,
      "exposure" to mapOf("mode" to exposure.mode, "bias" to exposure.bias, "locked" to exposure.locked),
      "focus" to mapOf("mode" to focus.mode, "locked" to focus.locked),
      "whiteBalance" to mapOf("mode" to whiteBalance.mode, "locked" to whiteBalance.locked),
      "audio" to mapOf(
        "enabled" to audio.enabled,
        "sampleRate" to audio.sampleRate,
        "channels" to audio.channels,
        "bitrate" to audio.bitrate
      )
    )
  }

  fun toJsonObject(): JSONObject = JSONObject(toMap())
}

class SettingsStore(private val context: Context? = null) {
  private val prefs: SharedPreferences? = context?.getSharedPreferences("webcamo_settings", Context.MODE_PRIVATE)
  private val lock = Any()
  private var cached: Settings = Settings()

  init {
    load()
  }

  val current: Settings
    get() = synchronized(lock) { cached.copy() }

  fun update(block: (Settings) -> Unit): Settings {
    return synchronized(lock) {
      block(cached)
      save()
      cached.copy()
    }
  }

  fun replace(next: Settings) {
    synchronized(lock) {
      cached = next.copy()
      save()
    }
  }

  private fun save() {
    prefs?.edit()?.putString("settings_json", cached.toJsonObject().toString())?.apply()
  }

  private fun load() {
    val raw = prefs?.getString("settings_json", null) ?: return
    try {
      val json = JSONObject(raw)
      // Populate fields from json
      val res = json.optJSONObject("resolution")
      if (res != null) {
        cached.resolution = Resolution(res.optInt("width", 1920), res.optInt("height", 1080))
      }
      cached.lens = json.optString("lens", "back-wide")
      cached.fps = json.optInt("fps", 30)
      cached.bitrate = json.optInt("bitrate", 8000000)
      cached.zoom = json.optDouble("zoom", 1.0)
      cached.torch = json.optBoolean("torch", false)
      cached.mirror = json.optBoolean("mirror", false)
      cached.rotation = json.optInt("rotation", 0)
      cached.stabilization = json.optString("stabilization", "standard")
      cached.hdr = json.optBoolean("hdr", true)
      cached.lockLens = json.optBoolean("lockLens", false)
    } catch (_: Exception) {}
  }
}
