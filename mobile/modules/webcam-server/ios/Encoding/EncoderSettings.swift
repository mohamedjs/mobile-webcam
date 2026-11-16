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

  /// 100 ms fragments. AVAssetWriter hands every fragment over XPC from the
  /// system media daemon; at 22 ms (~45 a second) that daemon ran at ~73% CPU
  /// and was the main reason the phone overheated. 100 ms keeps the added
  /// latency small and cuts that traffic by more than four times.
  static let segmentDuration = CMTime(value: 100, timescale: 1000)
}
