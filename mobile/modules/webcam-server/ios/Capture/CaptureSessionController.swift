import AVFoundation
import UIKit

protocol CaptureSessionControllerDelegate: AnyObject {
  func capture(_ c: CaptureSessionController, didProduceSegment data: Data, isInit: Bool)
  func capture(_ c: CaptureSessionController, didProduceJPEG data: Data)
  func capture(_ c: CaptureSessionController, didFail error: Error)
}

/// Owns AVCaptureSession outright.
///
/// react-native-vision-camera is deliberately not used: this needs
/// session-level control (Cinematic on the device input, specific lenses, an
/// AVAssetWriter bolted to the outputs), and two AVCaptureSessions contending
/// for one camera fail at runtime. Frames never enter JavaScript. docs/01 §4.
final class CaptureSessionController: NSObject {
  weak var delegate: CaptureSessionControllerDelegate?

  let session = AVCaptureSession()
  private let videoQueue = DispatchQueue(label: "webcam.capture.video")
  private let audioQueue = DispatchQueue(label: "webcam.capture.audio")
  private let configQueue = DispatchQueue(label: "webcam.capture.config")

  private var deviceInput: AVCaptureDeviceInput?
  private var audioInput: AVCaptureDeviceInput?
  // NOTE: the members below are intentionally internal, not private.
  // CaptureSessionController+Delegates.swift extends this type from ANOTHER
  // file, and Swift's `private` (and `fileprivate`) never cross a file boundary.
  var videoOutput: AVCaptureVideoDataOutput?
  private var audioOutput: AVCaptureAudioDataOutput?
  var depthOutput: AVCaptureDepthDataOutput?
  private var synchronizer: AVCaptureDataOutputSynchronizer?

  let writer = FragmentedMP4Writer()
  let mjpeg = MJPEGEncoder()
  let blur = DepthBlurRenderer()

  private(set) var settings: Settings = .default
  private(set) var activeProfile: String = "fmp4"
  private var running = false

  override init() {
    super.init()
    writer.delegate = self
    observeSession()
  }

  /// Block-based observers return tokens; `removeObserver(self)` does not
  /// remove them, so keep the tokens and drop those.
  private var observerTokens: [NSObjectProtocol] = []

  deinit {
    observerTokens.forEach(NotificationCenter.default.removeObserver)
  }

  /// iOS stops the capture session on its own — thermal pressure, the app being
  /// backgrounded, a phone call, or another app claiming the camera. Without
  /// these observers the session simply stays dead: the HTTP server keeps
  /// answering, /stream.mp4 refuses every client, and the desktop shows its
  /// reconnecting placeholder forever with nothing explaining why.
  private func observeSession() {
    let center = NotificationCenter.default

    observerTokens.append(center.addObserver(
      forName: AVCaptureSession.wasInterruptedNotification,
      object: session, queue: nil
    ) { [weak self] note in
      guard let self else { return }
      let raw = (note.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int) ?? -1
      let reason = Self.describeInterruption(raw)
      Log.warn("capture interrupted: \(reason)")
      self.onInterruption?(reason, false)
    })

    observerTokens.append(center.addObserver(
      forName: AVCaptureSession.interruptionEndedNotification,
      object: session, queue: nil
    ) { [weak self] _ in
      guard let self else { return }
      Log.info("capture interruption ended; resuming")
      self.onInterruption?("ended", true)
      self.resumeAfterInterruption()
    })

    observerTokens.append(center.addObserver(
      forName: AVCaptureSession.runtimeErrorNotification,
      object: session, queue: nil
    ) { [weak self] note in
      guard let self else { return }
      let error = note.userInfo?[AVCaptureSessionErrorKey] as? NSError
      Log.error("capture runtime error: \(error?.localizedDescription ?? "unknown")")
      self.onInterruption?(error?.localizedDescription ?? "runtime error", false)
      // A media-services reset needs a full rebuild, not just startRunning().
      self.resumeAfterInterruption()
    })
  }

  /// Called with (reason, recovered). Wired to a JS event by the module.
  var onInterruption: ((String, Bool) -> Void)?

  private func resumeAfterInterruption() {
    configQueue.async { [weak self] in
      guard let self, self.running else { return }
      if self.session.isRunning { return }
      Log.info("restarting capture session")
      self.session.startRunning()
      if !self.session.isRunning {
        // startRunning() is best-effort; a full reconfigure is the fallback.
        do {
          try self.configureLocked()
          self.session.startRunning()
          if self.activeProfile == "fmp4" { try self.startWriterLocked() }
          Log.info("capture session rebuilt")
        } catch {
          Log.error("could not rebuild capture: \(error.localizedDescription)")
          self.delegate?.capture(self, didFail: error)
        }
      }
    }
  }

  private static func describeInterruption(_ raw: Int) -> String {
    switch raw {
    case 1: return "another app is using audio"
    case 2: return "another app is using the camera"
    case 3: return "the app was backgrounded"
    case 4: return "multiple foreground apps"
    case 5: return "the system is too hot (thermal pressure)"
    default: return "unknown reason (\(raw))"
    }
  }

  /// The REAL state, not a flag.
  ///
  /// `running` is our own bool and drifts from reality the moment iOS stops the
  /// session underneath us (thermal pressure, backgrounding, another app taking
  /// the camera). /health reported "capturing" while the camera was dead.
  var isRunning: Bool { configQueue.sync { running && session.isRunning } }

  // MARK: - Capabilities

  func capabilities() -> [String: Any] {
    let lenses = LensDiscovery.discover()
    let active = LensDiscovery.device(for: settings.lens) ?? lenses.first?.device

    var cinematic: [String: Any] = [
      "supported": false, "tier": 0, "resolutions": [],
      "maxFps": 30, "minAperture": 2.0, "maxAperture": 16.0,
    ]

    if let active {
      let tier = CinematicController.tier(for: active)
      let resolutions = CinematicController.supportedResolutions(for: active)
      cinematic = [
        "supported": tier != .unsupported,
        "tier": tier.rawValue,
        "resolutions": resolutions.isEmpty
          ? [["width": 1920, "height": 1080]] : resolutions,
        "maxFps": 30,
        "minAperture": 2.0,
        "maxAperture": 16.0,
      ]
    }

    var stabilization = ["off", "standard"]
    if let active, active.activeFormat.isVideoStabilizationModeSupported(.cinematic) {
      stabilization.append("cinematic")
    }

    let fallbackRes: [[String: Any]] = [["width": 1920, "height": 1080, "maxFps": 30]]
    
    return [
      "lenses": lenses.map(\.json),
      "resolutions": active.map { LensDiscovery.resolutions(for: $0) } ?? fallbackRes,
      "cinematic": cinematic,
      "stabilization": stabilization,
      "hdr": active?.activeFormat.isVideoHDRSupported ?? false,
      "audio": ["sampleRates": [44100, 48000], "maxChannels": 2],
    ]
  }

  // MARK: - Lifecycle

  func start(with settings: Settings, profile: String) throws {
    try configQueue.sync {
      self.settings = settings
      self.activeProfile = profile
      try configureLocked()
      if !session.isRunning { session.startRunning() }
      if profile == "fmp4" { try startWriterLocked() }
      running = true
    }
  }

  func stop() {
    configQueue.sync {
      writer.stop()
      if session.isRunning { session.stopRunning() }
      running = false
      Telemetry.shared.reset()
    }
  }

  // MARK: - Configuration

  private func configureLocked() throws {
    session.beginConfiguration()
    defer { session.commitConfiguration() }

    for input in session.inputs { session.removeInput(input) }
    for output in session.outputs { session.removeOutput(output) }
    synchronizer = nil

    guard let device = LensDiscovery.device(for: settings.lens)
      ?? LensDiscovery.discover().first(where: { $0.position == "back" })?.device else {
      throw CaptureError.noCamera
    }

    let input = try AVCaptureDeviceInput(device: device)
    guard session.canAddInput(input) else { throw CaptureError.cannotAddInput }
    session.addInput(input)
    deviceInput = input

    // Cinematic must be set on the INPUT before the format is chosen: it
    // reconfigures the whole session. docs/05 §F5 tier 1.
    if settings.cinematic.enabled {
      let ok = CinematicController.enableNative(on: input, enabled: true)
      if !ok { Log.warn("native cinematic unavailable; using fallback blur") }
    }

    try applyFormatLocked(device: device)
    try applyDeviceSettingsLocked(device: device)

    let video = AVCaptureVideoDataOutput()
    video.alwaysDiscardsLateVideoFrames = true
    video.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String:
        kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ]
    video.setSampleBufferDelegate(self, queue: videoQueue)
    guard session.canAddOutput(video) else { throw CaptureError.cannotAddOutput }
    session.addOutput(video)
    videoOutput = video

    if let connection = video.connection(with: .video) {
      if connection.isVideoMirroringSupported {
        connection.automaticallyAdjustsVideoMirroring = false
        connection.isVideoMirrored = settings.mirror
      }
      if #available(iOS 17.0, *) {
        if connection.isVideoRotationAngleSupported(CGFloat(settings.rotation)) {
          connection.videoRotationAngle = CGFloat(settings.rotation)
        }
      } else {
        if connection.isVideoOrientationSupported {
          switch settings.rotation {
          case 90: connection.videoOrientation = .portrait
          case 180: connection.videoOrientation = .landscapeLeft
          case 270: connection.videoOrientation = .portraitUpsideDown
          default: connection.videoOrientation = .landscapeRight
          }
        }
      }
      if connection.isVideoStabilizationSupported {
        connection.preferredVideoStabilizationMode =
          settings.stabilization == "off" ? .off
          : settings.stabilization == "cinematic" ? .cinematic : .standard
      }
    }

    if settings.audio.enabled,
       let mic = AVCaptureDevice.default(for: .audio) {
      let micInput = try AVCaptureDeviceInput(device: mic)
      if session.canAddInput(micInput) {
        session.addInput(micInput)
        audioInput = micInput
      }
      let audio = AVCaptureAudioDataOutput()
      audio.setSampleBufferDelegate(self, queue: audioQueue)
      if session.canAddOutput(audio) {
        session.addOutput(audio)
        audioOutput = audio
      }
    }

    // Tier 2 blur needs depth alongside video, time-aligned.
    if settings.blurFallback.enabled,
       !settings.cinematic.enabled,
       CinematicController.tier(for: device) == .depth {
      let depth = AVCaptureDepthDataOutput()
      depth.isFilteringEnabled = true
      if session.canAddOutput(depth) {
        session.addOutput(depth)
        depthOutput = depth
        synchronizer = AVCaptureDataOutputSynchronizer(dataOutputs: [video, depth])
        synchronizer?.setDelegate(self, queue: videoQueue)
      }
    }
  }

  private func applyFormatLocked(device: AVCaptureDevice) throws {
    let target = settings.resolution
    let best = device.formats.first { format in
      let d = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
      guard Int(d.width) == target.width, Int(d.height) == target.height else { return false }
      return format.videoSupportedFrameRateRanges.contains {
        $0.maxFrameRate >= Double(settings.fps)
      }
    }
    guard let best else { throw CaptureError.unsupportedFormat(target.width, target.height) }

    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }
    device.activeFormat = best
    let duration = CMTime(value: 1, timescale: CMTimeScale(settings.fps))
    device.activeVideoMinFrameDuration = duration
    device.activeVideoMaxFrameDuration = duration
  }

  private func applyDeviceSettingsLocked(device: AVCaptureDevice) throws {
    try device.lockForConfiguration()
    defer { device.unlockForConfiguration() }

    device.videoZoomFactor = max(
      device.minAvailableVideoZoomFactor,
      min(CGFloat(settings.zoom), device.maxAvailableVideoZoomFactor))

    if device.hasTorch, device.isTorchModeSupported(settings.torch ? .on : .off) {
      device.torchMode = settings.torch ? .on : .off
    }

    if settings.focus.locked, device.isFocusModeSupported(.locked) {
      device.focusMode = .locked
    } else if device.isFocusModeSupported(.continuousAutoFocus) {
      device.focusMode = .continuousAutoFocus
    }

    if settings.exposure.locked, device.isExposureModeSupported(.locked) {
      device.exposureMode = .locked
    } else if device.isExposureModeSupported(.continuousAutoExposure) {
      device.exposureMode = .continuousAutoExposure
      device.setExposureTargetBias(Float(settings.exposure.bias))
    }

    if settings.whiteBalance.locked, device.isWhiteBalanceModeSupported(.locked) {
      device.whiteBalanceMode = .locked
    } else if device.isWhiteBalanceModeSupported(.continuousAutoWhiteBalance) {
      device.whiteBalanceMode = .continuousAutoWhiteBalance
    }
  }

  private func startWriterLocked() throws {
    try writer.start(
      width: settings.resolution.width,
      height: settings.resolution.height,
      fps: settings.fps,
      bitrate: settings.bitrate,
      audio: settings.audio.enabled ? settings.audio : nil,
      transform: .identity)
  }

  // MARK: - Live updates

  /// Applies everything that does NOT need a session rebuild. The caller decides
  /// whether a restart is required. docs/01 §5.5.
  func applyLive(_ next: Settings) {
    configQueue.sync {
      settings = next
      guard let device = deviceInput?.device else { return }
      try? applyDeviceSettingsLocked(device: device)
      if let connection = videoOutput?.connection(with: .video),
         connection.isVideoMirroringSupported {
        connection.isVideoMirrored = next.mirror
      }
    }
  }

  func focus(at point: CGPoint) {
    configQueue.sync {
      guard let device = deviceInput?.device else { return }
      try? device.lockForConfiguration()
      defer { device.unlockForConfiguration() }
      if device.isFocusPointOfInterestSupported {
        device.focusPointOfInterest = point
        if device.isFocusModeSupported(.autoFocus) { device.focusMode = .autoFocus }
      }
      if device.isExposurePointOfInterestSupported {
        device.exposurePointOfInterest = point
        if device.isExposureModeSupported(.continuousAutoExposure) {
          device.exposureMode = .continuousAutoExposure
        }
      }
    }
  }

  var initializationSegment: Data? { writer.initializationSegment }

  enum CaptureError: LocalizedError {
    case noCamera, cannotAddInput, cannotAddOutput
    case unsupportedFormat(Int, Int)

    var errorDescription: String? {
      switch self {
      case .noCamera: return "No camera available"
      case .cannotAddInput: return "Cannot add camera input"
      case .cannotAddOutput: return "Cannot add video output"
      case .unsupportedFormat(let w, let h): return "Device does not support \(w)x\(h)"
      }
    }
  }
}
