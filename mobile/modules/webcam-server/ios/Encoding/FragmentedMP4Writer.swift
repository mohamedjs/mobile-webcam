import AVFoundation
import UniformTypeIdentifiers

protocol FragmentedMP4WriterDelegate: AnyObject {
  /// `isInitializationSegment` marks the moov/ftyp header that every new client
  /// must receive before any media segment.
  func writer(_ writer: FragmentedMP4Writer, didProduce data: Data, isInitializationSegment: Bool)
  func writer(_ writer: FragmentedMP4Writer, didFailWith error: Error)
}

/// Hardware-encoded H.264 + AAC muxed into fragmented MP4, handed back in
/// memory rather than written to disk.
///
/// AVAssetWriter with `.mpeg4AppleHLS` plus an AVAssetWriterDelegate is the only
/// route on iOS that gives streamable, A/V-muxed, hardware-encoded output
/// without hand-rolling a muxer. docs/01 §3.
final class FragmentedMP4Writer: NSObject {
  weak var delegate: FragmentedMP4WriterDelegate?

  private var writer: AVAssetWriter?
  private var videoInput: AVAssetWriterInput?
  private var audioInput: AVAssetWriterInput?
  private var started = false
  private let queue = DispatchQueue(label: "webcam.fmp4")

  private(set) var initializationSegment: Data?

  var isRunning: Bool { queue.sync { writer?.status == .writing } }

  func start(
    width: Int, height: Int, fps: Int, bitrate: Int,
    audio: AudioSettings?, transform: CGAffineTransform
  ) throws {
    try queue.sync {
      stopLocked()

      let w = AVAssetWriter(contentType: UTType.mpeg4Movie)
      w.outputFileTypeProfile = .mpeg4AppleHLS
      w.preferredOutputSegmentInterval = EncoderSettings.segmentDuration
      w.initialSegmentStartTime = .zero
      w.delegate = self
      w.shouldOptimizeForNetworkUse = true

      let v = AVAssetWriterInput(
        mediaType: .video,
        outputSettings: EncoderSettings.video(
          width: width, height: height, fps: fps, bitrate: bitrate))
      v.expectsMediaDataInRealTime = true
      v.transform = transform
      guard w.canAdd(v) else { throw WriterError.cannotAddInput("video") }
      w.add(v)
      videoInput = v

      if let audio {
        let a = AVAssetWriterInput(
          mediaType: .audio,
          outputSettings: EncoderSettings.audio(
            sampleRate: audio.sampleRate, channels: audio.channels, bitrate: audio.bitrate))
        a.expectsMediaDataInRealTime = true
        guard w.canAdd(a) else { throw WriterError.cannotAddInput("audio") }
        w.add(a)
        audioInput = a
      }

      guard w.startWriting() else {
        throw w.error ?? WriterError.startFailed
      }
      writer = w
      started = false
      initializationSegment = nil
      Log.info("fmp4 writer started \(width)x\(height)@\(fps)")
    }
  }

  func append(video sample: CMSampleBuffer) {
    queue.async {
      guard let writer = self.writer, writer.status == .writing else { return }
      if !self.started {
        writer.startSession(atSourceTime: CMSampleBufferGetPresentationTimeStamp(sample))
        self.started = true
      }
      guard let input = self.videoInput, input.isReadyForMoreMediaData else {
        // Encoder is behind. Dropping is correct: queueing without bound is an
        // OOM crash on a phone. docs/05 §F2.
        Telemetry.shared.recordDroppedFrame()
        return
      }
      input.append(sample)
    }
  }

  func append(audio sample: CMSampleBuffer) {
    queue.async {
      guard self.started,
            let writer = self.writer, writer.status == .writing,
            let input = self.audioInput, input.isReadyForMoreMediaData else { return }
      input.append(sample)
    }
  }

  func stop() { queue.sync { stopLocked() } }

  private func stopLocked() {
    guard let writer, writer.status == .writing else {
      self.writer = nil
      return
    }
    videoInput?.markAsFinished()
    audioInput?.markAsFinished()
    writer.finishWriting {}
    self.writer = nil
    videoInput = nil
    audioInput = nil
    started = false
  }

  enum WriterError: LocalizedError {
    case cannotAddInput(String)
    case startFailed

    var errorDescription: String? {
      switch self {
      case .cannotAddInput(let kind): return "Cannot add \(kind) input to the asset writer"
      case .startFailed: return "AVAssetWriter refused to start"
      }
    }
  }
}

extension FragmentedMP4Writer: AVAssetWriterDelegate {
  func assetWriter(
    _ writer: AVAssetWriter,
    didOutputSegmentData segmentData: Data,
    segmentType: AVAssetSegmentType,
    segmentReport: AVAssetSegmentReport?
  ) {
    let isInit = segmentType == .initialization
    if isInit { initializationSegment = segmentData }
    Telemetry.shared.recordFrame(bytes: segmentData.count)
    delegate?.writer(self, didProduce: segmentData, isInitializationSegment: isInit)
  }
}
