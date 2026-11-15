package expo.modules.webcamserver.capture

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.MediaCodec
import android.util.Size

data class LensInfo(
  val id: String,
  val label: String,
  val position: String,
  val cameraId: String,
  val minZoom: Double,
  val maxZoom: Double
) {
  fun toMap(): Map<String, Any> {
    return mapOf(
      "id" to id,
      "label" to label,
      "position" to position,
      "minZoom" to minZoom,
      "maxZoom" to maxZoom
    )
  }
}

object LensDiscovery {

  fun discover(context: Context?): List<LensInfo> {
    val manager = context?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
      ?: return defaultFallbackLenses()

    val lenses = mutableListOf<LensInfo>()
    try {
      for (id in manager.cameraIdList) {
        val chars = manager.getCameraCharacteristics(id)
        val facing = chars.get(CameraCharacteristics.LENS_FACING)

        val maxZoom = chars.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM)?.toDouble() ?: 8.0

        if (facing == CameraCharacteristics.LENS_FACING_FRONT) {
          lenses.add(LensInfo("front", "Front", "front", id, 1.0, minOf(maxZoom, 4.0)))
        } else if (facing == CameraCharacteristics.LENS_FACING_BACK) {
          if (lenses.none { it.id == "back-wide" }) {
            lenses.add(LensInfo("back-wide", "1x Wide", "back", id, 1.0, minOf(maxZoom, 8.0)))
          } else if (lenses.none { it.id == "back-ultrawide" }) {
            lenses.add(LensInfo("back-ultrawide", "0.5x Ultra Wide", "back", id, 1.0, 2.0))
          } else if (lenses.none { it.id == "back-tele" }) {
            lenses.add(LensInfo("back-tele", "Telephoto", "back", id, 1.0, 4.0))
          }
        }
      }
    } catch (_: Exception) {}

    return if (lenses.isNotEmpty()) lenses else defaultFallbackLenses()
  }

  private fun defaultFallbackLenses(): List<LensInfo> {
    return listOf(
      LensInfo("back-wide", "1x Wide", "back", "0", 1.0, 8.0),
      LensInfo("front", "Front", "front", "1", 1.0, 4.0)
    )
  }

  /**
   * Sizes the encoder can take from this camera, with the real frame-rate limit
   * of each (from the stream configuration's minimum frame duration, capped by
   * the auto-exposure fps ranges). Never more than the hardware can do: the
   * dashboard only offers what is returned here.
   */
  fun resolutions(context: Context?, cameraId: String?): List<Map<String, Any>> {
    val manager = context?.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
    val targetSizes = listOf(Size(640, 480), Size(1280, 720), Size(1920, 1080), Size(3840, 2160))

    if (manager != null && cameraId != null) {
      try {
        val chars = manager.getCameraCharacteristics(cameraId)
        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val outputSizes = map?.getOutputSizes(MediaCodec::class.java)?.toSet() ?: emptySet()
        val aeMax = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES)
          ?.maxOfOrNull { it.upper } ?: 30

        val modes = targetSizes.mapNotNull { sz ->
          if (!outputSizes.contains(sz)) return@mapNotNull null
          val minDurationNs = try {
            map?.getOutputMinFrameDuration(MediaCodec::class.java, sz) ?: 0L
          } catch (_: Exception) { 0L }
          val sensorMax = if (minDurationNs > 0) (1_000_000_000L / minDurationNs).toInt() else 30
          val maxFps = minOf(sensorMax, aeMax).coerceAtLeast(1)
          mapOf("width" to sz.width, "height" to sz.height, "maxFps" to maxFps)
        }
        if (modes.isNotEmpty()) return modes
      } catch (_: Exception) {}
    }

    return defaultResolutions()
  }

  private fun defaultResolutions(): List<Map<String, Any>> {
    return listOf(
      mapOf("width" to 1280, "height" to 720, "maxFps" to 30),
      mapOf("width" to 1920, "height" to 1080, "maxFps" to 30)
    )
  }
}
