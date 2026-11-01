package expo.modules.webcamserver.support

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock

class Telemetry(private val context: Context? = null) {
  companion object {
    val shared = Telemetry()
  }

  private val lock = Any()
  private var frames = 0
  private var bytes = 0L
  private var windowStart = SystemClock.elapsedRealtime()

  var fps: Double = 0.0
    private set
  var bitrate: Double = 0.0
    private set
  var droppedFrames: Int = 0
    private set
  var droppedSegments: Int = 0
    private set
  var clients: Int = 0
    private set
  var audioLevel: Float = 0.0f
    private set

  fun recordFrame(byteCount: Int) {
    synchronized(lock) {
      frames++
      bytes += byteCount
      rollWindowLocked()
    }
  }

  fun recordDroppedFrame() {
    synchronized(lock) { droppedFrames++ }
  }

  fun recordDroppedSegment() {
    synchronized(lock) { droppedSegments++ }
  }

  fun setClientsCount(count: Int) {
    synchronized(lock) { clients = count }
  }

  fun setAudio(level: Float) {
    synchronized(lock) { audioLevel = level }
  }

  fun reset() {
    synchronized(lock) {
      frames = 0
      bytes = 0L
      droppedFrames = 0
      droppedSegments = 0
      fps = 0.0
      bitrate = 0.0
      windowStart = SystemClock.elapsedRealtime()
    }
  }

  private fun rollWindowLocked() {
    val now = SystemClock.elapsedRealtime()
    val elapsedMs = now - windowStart
    if (elapsedMs >= 1000) {
      val elapsedSec = elapsedMs / 1000.0
      fps = frames / elapsedSec
      bitrate = (bytes * 8) / elapsedSec
      frames = 0
      bytes = 0L
      windowStart = now
    }
  }

  val thermalState: String
    get() {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && context != null) {
        val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        when (powerManager?.currentThermalStatus) {
          PowerManager.THERMAL_STATUS_NONE,
          PowerManager.THERMAL_STATUS_LIGHT -> return "nominal"
          PowerManager.THERMAL_STATUS_MODERATE -> return "fair"
          PowerManager.THERMAL_STATUS_SEVERE -> return "serious"
          PowerManager.THERMAL_STATUS_CRITICAL,
          PowerManager.THERMAL_STATUS_EMERGENCY,
          PowerManager.THERMAL_STATUS_SHUTDOWN -> return "critical"
        }
      }
      return "nominal"
    }

  val battery: Double
    get() {
      if (context != null) {
        val intent = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        if (intent != null) {
          val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
          val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
          if (level >= 0 && scale > 0) {
            return level / scale.toDouble()
          }
        }
      }
      return 1.0
    }

  fun snapshot(): Map<String, Any> {
    return synchronized(lock) {
      mapOf(
        "fps" to fps,
        "bitrate" to bitrate,
        "droppedFrames" to droppedFrames,
        "droppedSegments" to droppedSegments,
        "thermalState" to thermalState,
        "battery" to battery,
        "clients" to clients,
        "audioLevel" to audioLevel.toDouble()
      )
    }
  }
}
