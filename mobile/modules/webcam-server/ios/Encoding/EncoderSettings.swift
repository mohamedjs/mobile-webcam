import AVFoundation

enum EncoderSettings {
  /// H.264 rather than HEVC: ffmpeg and every browser decode it without a
  /// hardware-specific path, and the bitrate difference is irrelevant over USB.
  static func video(width: Int, height: Int, fps: Int, bitrate: Int) -> [String: Any] {
    [
      AVVideoCodecKey: AVVideoCodecType.h264,
      AVVideoWidthKey: width,
      AVVideoHeightKey: height,
      AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoExpectedSourceFrameRateKey: fps,
        AVVideoMaxKeyFrameIntervalKey: fps,          // 1 s GOP: fast client join
        AVVideoMaxKeyFrameIntervalDurationKey: 1.0,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoAllowFrameReorderingKey: false,       // B-frames add latency
      ],
    ]
  }

  static func audio(sampleRate: Int, channels: Int, bitrate: Int) -> [String: Any] {
    [
      AVFormatIDKey: kAudioFormatMPEG4AAC,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: channels,
      AVEncoderBitRateKey: bitrate,
    ]
  }

  /// 33 ms: one fragment per frame at 30fps for minimal latency over USB.
  static let segmentDuration = CMTime(value: 22, timescale: 1000)
}
