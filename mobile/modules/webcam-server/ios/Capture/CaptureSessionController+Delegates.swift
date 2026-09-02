import AVFoundation

// MARK: - Sample buffers

extension CaptureSessionController: AVCaptureVideoDataOutputSampleBufferDelegate,
                                   AVCaptureAudioDataOutputSampleBufferDelegate {
  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    if output is AVCaptureAudioDataOutput {
      writer.append(audio: sampleBuffer)
      updateAudioLevel(sampleBuffer)
      return
    }

    if activeProfile == "mjpeg" {
      guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer),
            let jpeg = mjpeg.encode(pixels, mirror: settings.mirror) else { return }
      Telemetry.shared.recordFrame(bytes: jpeg.count)
      delegate?.capture(self, didProduceJPEG: jpeg)
      return
    }

    // Tier 3 blur: only when neither native Cinematic nor depth is in play.
    if settings.blurFallback.enabled,
       !settings.cinematic.enabled,
       depthOutputIsIdle,
       let pixels = CMSampleBufferGetImageBuffer(sampleBuffer),
       let blurred = blur.renderWithSegmentation(
        image: pixels, intensity: settings.blurFallback.intensity),
       let replaced = sampleBuffer.replacingImageBuffer(with: blurred) {
      writer.append(video: replaced)
      return
    }

    writer.append(video: sampleBuffer)
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didDrop sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    Telemetry.shared.recordDroppedFrame()
  }

  private var depthOutputIsIdle: Bool { true }

  private func updateAudioLevel(_ sample: CMSampleBuffer) {
    guard let block = CMSampleBufferGetDataBuffer(sample) else { return }
    var length = 0
    var pointer: UnsafeMutablePointer<Int8>?
    guard CMBlockBufferGetDataPointer(
      block, atOffset: 0, lengthAtOffsetOut: nil,
      totalLengthOut: &length, dataPointerOut: &pointer) == noErr,
      let pointer, length > 1 else { return }

    let samples = UnsafeBufferPointer(
      start: UnsafeRawPointer(pointer).bindMemory(to: Int16.self, capacity: length / 2),
      count: length / 2)
    var sum = 0.0
    for s in samples { let v = Double(s) / 32768.0; sum += v * v }
    let rms = (sum / Double(samples.count)).squareRoot()
    Telemetry.shared.setAudioLevel(Float(min(1.0, rms * 3)))
  }
}

// MARK: - Depth (tier 2)

extension CaptureSessionController: AVCaptureDataOutputSynchronizerDelegate {
  func dataOutputSynchronizer(
    _ synchronizer: AVCaptureDataOutputSynchronizer,
    didOutput collection: AVCaptureSynchronizedDataCollection
  ) {
    guard let videoOutput,
          let depthOutput,
          let videoData = collection.synchronizedData(for: videoOutput)
            as? AVCaptureSynchronizedSampleBufferData,
          !videoData.sampleBufferWasDropped else { return }

    let sample = videoData.sampleBuffer

    guard settings.blurFallback.enabled,
          let depthData = collection.synchronizedData(for: depthOutput)
            as? AVCaptureSynchronizedDepthData,
          !depthData.depthDataWasDropped,
          let pixels = CMSampleBufferGetImageBuffer(sample),
          let blurred = blur.renderWithDepth(
            image: pixels,
            depth: depthData.depthData,
            intensity: settings.blurFallback.intensity),
          let replaced = sample.replacingImageBuffer(with: blurred) else {
      writer.append(video: sample)
      return
    }

    writer.append(video: replaced)
  }
}

// MARK: - Writer output

extension CaptureSessionController: FragmentedMP4WriterDelegate {
  func writer(
    _ writer: FragmentedMP4Writer,
    didProduce data: Data,
    isInitializationSegment: Bool
  ) {
    delegate?.capture(self, didProduceSegment: data, isInit: isInitializationSegment)
  }

  func writer(_ writer: FragmentedMP4Writer, didFailWith error: Error) {
    delegate?.capture(self, didFail: error)
  }
}

// MARK: - Helpers

extension CMSampleBuffer {
  /// Rewraps a sample buffer around a new image buffer, preserving timing.
  func replacingImageBuffer(with pixelBuffer: CVPixelBuffer) -> CMSampleBuffer? {
    var timing = CMSampleTimingInfo()
    guard CMSampleBufferGetSampleTimingInfo(self, at: 0, timingInfoOut: &timing) == noErr
    else { return nil }

    var formatDescription: CMFormatDescription?
    guard CMVideoFormatDescriptionCreateForImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescriptionOut: &formatDescription) == noErr,
      let formatDescription else { return nil }

    var output: CMSampleBuffer?
    guard CMSampleBufferCreateReadyWithImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: pixelBuffer,
      formatDescription: formatDescription,
      sampleTiming: &timing,
      sampleBufferOut: &output) == noErr else { return nil }

    return output
  }
}
