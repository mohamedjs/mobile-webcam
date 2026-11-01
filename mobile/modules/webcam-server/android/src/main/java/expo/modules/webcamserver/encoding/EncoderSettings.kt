package expo.modules.webcamserver.encoding

import android.media.MediaFormat

object EncoderSettings {
  const val MIME_VIDEO = MediaFormat.MIMETYPE_VIDEO_AVC
  const val MIME_AUDIO = MediaFormat.MIMETYPE_AUDIO_AAC

  fun videoFormat(width: Int, height: Int, fps: Int, bitrate: Int): MediaFormat {
    return MediaFormat.createVideoFormat(MIME_VIDEO, width, height).apply {
      setInteger(MediaFormat.KEY_COLOR_FORMAT, android.media.MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface)
      setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
      setInteger(MediaFormat.KEY_FRAME_RATE, fps)
      setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1) // 1 second GOP
      setInteger(MediaFormat.KEY_PRIORITY, 0) // realtime
      // Minimal latency
      try {
        setInteger(MediaFormat.KEY_LATENCY, 1)
      } catch (_: Exception) {}
    }
  }

  fun audioFormat(sampleRate: Int, channels: Int, bitrate: Int): MediaFormat {
    return MediaFormat.createAudioFormat(MIME_AUDIO, sampleRate, channels).apply {
      setInteger(MediaFormat.KEY_BIT_RATE, bitrate)
      setInteger(MediaFormat.KEY_AAC_PROFILE, android.media.MediaCodecInfo.CodecProfileLevel.AACObjectLC)
    }
  }
}
