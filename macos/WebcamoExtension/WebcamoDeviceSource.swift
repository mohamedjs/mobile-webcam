import AVFoundation
import CoreMediaIO
import Foundation
import os.log

let extLog = OSLog(subsystem: "com.mobilewebcam.app.extension", category: "camera")

/// The virtual camera macOS publishes to Meet, Zoom, OBS and anything else
/// that enumerates cameras.
///
/// A CoreMediaIO extension runs in its own process, launched on demand by the
/// system inside the *client* app's context. It pulls MJPEG frames straight
/// from the phone over the USB tunnel (127.0.0.1:8080) and republishes them as
/// a camera stream. MJPEG rather than fMP4 deliberately: a JPEG becomes a
/// CVPixelBuffer in a few lines, whereas fMP4 would mean parsing avcC boxes and
/// driving VideoToolbox inside a sandboxed extension.
final class WebcamoDeviceSource: NSObject, CMIOExtensionDeviceSource {

  private(set) var device: CMIOExtensionDevice!
  private var streamSource: WebcamoStreamSource!

  private let reader = MJPEGReader()
  private let width = 1920
  private let height = 1080
  private let frameRate = 30

  private var pixelBufferPool: CVPixelBufferPool?
  private var formatDescription: CMFormatDescription?
  private var sequenceNumber: UInt64 = 0
  private var timescale: CMTimeScale { 600 }

  /// Frames are only pulled while something is actually looking at the camera.
  private var activeClients = 0

  init(localizedName: String) {
    super.init()

    let deviceID = UUID()
    device = CMIOExtensionDevice(
      localizedName: localizedName,
      deviceID: deviceID,
      legacyDeviceID: deviceID.uuidString,
      source: self
    )

    guard let format = makeFormatDescription() else {
      os_log("failed to create format description", log: extLog, type: .error)
      return
    }
    formatDescription = format
    makePixelBufferPool()

    let videoFormat = CMIOExtensionStreamFormat(
      formatDescription: format,
      maxFrameDuration: CMTime(value: 1, timescale: CMTimeScale(frameRate)),
      minFrameDuration: CMTime(value: 1, timescale: CMTimeScale(frameRate)),
      validFrameDurations: nil
    )

    streamSource = WebcamoStreamSource(
      localizedName: "webcamo.video",
      streamID: UUID(),
      streamFormat: videoFormat,
      device: device
    )
    streamSource.onStart = { [weak self] in self?.startPulling() }
    streamSource.onStop = { [weak self] in self?.stopPulling() }

    do {
      try device.addStream(streamSource.stream)
    } catch {
      os_log("addStream failed: %{public}@", log: extLog, type: .error, error.localizedDescription)
    }
  }

  var availableProperties: Set<CMIOExtensionProperty> {
    [.deviceTransportType, .deviceModel]
  }

  func deviceProperties(
    forProperties properties: Set<CMIOExtensionProperty>
  ) throws -> CMIOExtensionDeviceProperties {
    let props = CMIOExtensionDeviceProperties(dictionary: [:])
    if properties.contains(.deviceTransportType) {
      // 'virt' — the four-char transport code for a virtual device. The
      // kIOAudioDeviceTransportTypeVirtual constant lives in a Kernel-only
      // header that is not importable here.
      props.transportType = 0x76697274
    }
    if properties.contains(.deviceModel) {
      props.model = "webcamo virtual camera"
    }
    return props
  }

  func setDeviceProperties(_ deviceProperties: CMIOExtensionDeviceProperties) throws {
    // No writable device properties.
  }

  // MARK: - Frame production

  private func makeFormatDescription() -> CMFormatDescription? {
    var format: CMFormatDescription?
    CMVideoFormatDescriptionCreate(
      allocator: kCFAllocatorDefault,
      codecType: kCVPixelFormatType_32BGRA,
      width: Int32(width),
      height: Int32(height),
      extensions: nil,
      formatDescriptionOut: &format
    )
    return format
  }

  private func makePixelBufferPool() {
    let attributes: [String: Any] = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
      kCVPixelBufferWidthKey as String: width,
      kCVPixelBufferHeightKey as String: height,
      kCVPixelBufferIOSurfacePropertiesKey as String: [:],
    ]
    CVPixelBufferPoolCreate(
      kCFAllocatorDefault,
      nil,
      attributes as CFDictionary,
      &pixelBufferPool
    )
  }

  private func startPulling() {
    activeClients += 1
    guard activeClients == 1 else { return }

    os_log("stream start — connecting to phone", log: extLog, type: .info)
    reader.onFrame = { [weak self] image in
      self?.publish(image)
    }
    reader.start()
  }

  private func stopPulling() {
    activeClients = max(0, activeClients - 1)
    guard activeClients == 0 else { return }

    os_log("stream stop", log: extLog, type: .info)
    reader.stop()
  }

  /// Draws a decoded frame into a pooled buffer and hands it to the stream.
  private func publish(_ image: CGImage) {
    guard let pool = pixelBufferPool, let formatDescription else { return }

    var pixelBuffer: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pixelBuffer) == kCVReturnSuccess,
          let buffer = pixelBuffer else { return }

    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }

    guard let base = CVPixelBufferGetBaseAddress(buffer),
          let context = CGContext(
            data: base,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
              | CGBitmapInfo.byteOrder32Little.rawValue
          ) else { return }

    // Aspect-fill into the fixed 1080p frame so a portrait phone or a
    // different capture resolution never distorts.
    let target = CGRect(x: 0, y: 0, width: width, height: height)
    context.setFillColor(CGColor(red: 0, green: 0, blue: 0, alpha: 1))
    context.fill(target)

    let scale = max(target.width / CGFloat(image.width), target.height / CGFloat(image.height))
    let drawn = CGSize(width: CGFloat(image.width) * scale, height: CGFloat(image.height) * scale)
    context.draw(image, in: CGRect(
      x: (target.width - drawn.width) / 2,
      y: (target.height - drawn.height) / 2,
      width: drawn.width,
      height: drawn.height
    ))

    var timing = CMSampleTimingInfo(
      duration: CMTime(value: 1, timescale: CMTimeScale(frameRate)),
      presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
      decodeTimeStamp: .invalid
    )

    var sampleBuffer: CMSampleBuffer?
    let status = CMSampleBufferCreateForImageBuffer(
      allocator: kCFAllocatorDefault,
      imageBuffer: buffer,
      dataReady: true,
      makeDataReadyCallback: nil,
      refcon: nil,
      formatDescription: formatDescription,
      sampleTiming: &timing,
      sampleBufferOut: &sampleBuffer
    )

    guard status == noErr, let sample = sampleBuffer else { return }

    sequenceNumber &+= 1
    streamSource.stream.send(
      sample,
      discontinuity: [],
      hostTimeInNanoseconds: UInt64(timing.presentationTimeStamp.seconds * Double(NSEC_PER_SEC))
    )
  }
}

/// The single video stream the device publishes.
final class WebcamoStreamSource: NSObject, CMIOExtensionStreamSource {

  private(set) var stream: CMIOExtensionStream!
  private let device: CMIOExtensionDevice
  private let format: CMIOExtensionStreamFormat

  var onStart: (() -> Void)?
  var onStop: (() -> Void)?

  init(
    localizedName: String,
    streamID: UUID,
    streamFormat: CMIOExtensionStreamFormat,
    device: CMIOExtensionDevice
  ) {
    self.device = device
    self.format = streamFormat
    super.init()

    stream = CMIOExtensionStream(
      localizedName: localizedName,
      streamID: streamID,
      direction: .source,
      clockType: .hostTime,
      source: self
    )
  }

  var formats: [CMIOExtensionStreamFormat] { [format] }

  var activeFormatIndex: Int = 0 {
    didSet {
      if activeFormatIndex != 0 {
        os_log("invalid format index %{public}d", log: extLog, type: .error, activeFormatIndex)
      }
    }
  }

  var availableProperties: Set<CMIOExtensionProperty> {
    [.streamActiveFormatIndex, .streamFrameDuration]
  }

  func streamProperties(
    forProperties properties: Set<CMIOExtensionProperty>
  ) throws -> CMIOExtensionStreamProperties {
    let props = CMIOExtensionStreamProperties(dictionary: [:])
    if properties.contains(.streamActiveFormatIndex) {
      props.activeFormatIndex = 0
    }
    if properties.contains(.streamFrameDuration) {
      props.frameDuration = CMTime(value: 1, timescale: 30)
    }
    return props
  }

  func setStreamProperties(_ streamProperties: CMIOExtensionStreamProperties) throws {
    if let index = streamProperties.activeFormatIndex {
      activeFormatIndex = index
    }
  }

  /// macOS asks before letting a client attach; nothing here is restricted.
  func authorizedToStartStream(for client: CMIOExtensionClient) -> Bool { true }

  func startStream() throws { onStart?() }

  func stopStream() throws { onStop?() }
}
