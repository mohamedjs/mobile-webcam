import AVFoundation
import ExpoModulesCore
import UIKit

/// The Expo Module surface: everything JavaScript can reach.
///
/// The phone is a SERVER and the desktop is the client — usbmuxd only allows
/// host→device connections, so this module never dials out. docs/01 §2.
public final class WebcamServerModule: Module {
  /// The preview view needs the live AVCaptureSession; this is the only shared
  /// handle between them.
  static private(set) var sharedCapture: CaptureSessionController?

  private let capture = CaptureSessionController()
  private let server = HTTPServer()
  private let store = SettingsStore()
  private var auth = Auth(token: "")
  private var routes: Routes?
  private var pendingRestart = false

  private static let protocolVersion = 1

  public func definition() -> ModuleDefinition {
    Name("WebcamServer")

    Events(
      "onClientConnected",
      "onClientDisconnected",
      "onTelemetry",
      "onThermalStateChange",
      "onServerStateChange",
      "onError"
    )

    OnCreate {
      // Force the device-info cache to initialise here, while we are on the
      // main thread. Leaving it lazy risks a background request being the first
      // toucher and blocking on DispatchQueue.main.sync.
      _ = Routes.deviceInfo
      WebcamServerModule.sharedCapture = self.capture
      self.capture.delegate = self
      self.capture.onInterruption = { [weak self] reason, recovered in
        self?.sendEvent("onError", [
          "code": recovered ? "capture_resumed" : "capture_interrupted",
          "message": recovered
            ? "Camera resumed."
            : "The camera stopped: \(reason).",
          "fatal": false,
        ])
      }
      self.server.delegate = self
      self.routes = Routes(
        capture: self.capture,
        store: self.store,
        appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0",
        protocolVersion: WebcamServerModule.protocolVersion,
        onSettingsApplied: { [weak self] settings, restart in
          self?.handleSettingsApplied(settings, restartRequired: restart)
        })
    }

    OnDestroy {
      self.server.stop()
      self.capture.stop()
      DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
      WebcamServerModule.sharedCapture = nil
    }

    // MARK: Server lifecycle

    AsyncFunction("startServer") { (port: Int, token: String) -> [String: Any] in
      try self.requestPermissions()
      self.auth = Auth(token: token)

      try self.capture.start(with: self.store.current, profile: "fmp4")
      try self.server.start(port: UInt16(port))

      // Hold the screen awake for as long as the SERVER lives, not just while
      // capturing. Tying it to capture meant that any capture hiccup let the
      // phone lock, iOS suspended the app, and the listening socket died — the
      // desktop then saw only "connection reset by peer".
      DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true }

      self.sendEvent("onServerStateChange", ["running": true, "port": port])
      return ["port": port, "token": token]
    }

    AsyncFunction("stopServer") {
      self.server.stop()
      self.capture.stop()
      DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false }
      self.sendEvent("onServerStateChange", ["running": false, "port": NSNull()])
    }

    Function("isRunning") { () -> Bool in
      self.server.isRunning && self.capture.isRunning
    }

    // MARK: Capabilities and settings

    AsyncFunction("getCapabilities") { () -> [String: Any] in
      self.capture.capabilities()
    }

    AsyncFunction("getSettings") { () -> [String: Any] in
      try self.encode(self.store.current)
    }

    /// Returns the FULL effective settings, never void — the phone is the
    /// authority on what was actually applied. docs/03 §3.
    AsyncFunction("updateSettings") { (patch: [String: Any]) -> [String: Any] in
      let previous = self.store.current
      var next = previous

      if let issue = Routes.apply(patch, to: &next, capabilities: self.capture.capabilities()) {
        throw SettingError.invalid(field: issue.field, message: issue.message)
      }

      self.store.replace(next)
      let restart = next.requiresRestart(comparedTo: previous)

      if restart, self.capture.isRunning {
        self.capture.stop()
        try self.capture.start(with: next, profile: "fmp4")
      } else {
        self.capture.applyLive(next)
      }

      return try self.encode(next)
    }

    AsyncFunction("focusAt") { (x: Double, y: Double) in
      self.capture.focus(at: CGPoint(x: x, y: y))
    }

    AsyncFunction("setLens") { (lensId: String) -> [String: Any] in
      var next = self.store.current
      guard !next.lockLens else {
        throw SettingError.invalid(field: "lens", message: "Lens is locked")
      }
      next.lens = lensId
      self.store.replace(next)
      if self.capture.isRunning {
        self.capture.stop()
        try self.capture.start(with: next, profile: "fmp4")
      }
      return self.capture.capabilities()
    }

    AsyncFunction("getTelemetry") { () -> [String: Any] in
      Telemetry.shared.snapshot()
    }

    // MARK: Preview view

    View(WebcamPreviewView.self) {
      Prop("resizeMode") { (view: WebcamPreviewView, mode: String) in
        view.resizeMode = mode
      }
    }
  }

  // MARK: - Helpers

  private func encode(_ settings: Settings) throws -> [String: Any] {
    let data = try JSONEncoder().encode(settings)
    guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      throw SettingError.encoding
    }
    return object
  }

  private func requestPermissions() throws {
    let camera = AVCaptureDevice.authorizationStatus(for: .video)
    if camera == .notDetermined {
      let sem = DispatchSemaphore(value: 0)
      AVCaptureDevice.requestAccess(for: .video) { _ in sem.signal() }
      sem.wait()
    }
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      throw SettingError.permission("Camera access denied")
    }

    if store.current.audio.enabled {
      let mic = AVCaptureDevice.authorizationStatus(for: .audio)
      if mic == .notDetermined {
        let sem = DispatchSemaphore(value: 0)
        AVCaptureDevice.requestAccess(for: .audio) { _ in sem.signal() }
        sem.wait()
      }
    }
  }

  private func handleSettingsApplied(_ settings: Settings, restartRequired: Bool) {
    guard restartRequired, capture.isRunning else { return }
    // Restarting the session invalidates the codec parameters in the current
    // fMP4 stream, so the client is dropped and must reconnect for a fresh
    // initialisation segment. docs/01 §5.5.
    pendingRestart = true
    DispatchQueue.global(qos: .userInitiated).async {
      self.capture.stop()
      do {
        try self.capture.start(with: settings, profile: "fmp4")
      } catch {
        self.sendEvent("onError", [
          "code": "capture_failed", "message": error.localizedDescription, "fatal": true,
        ])
      }
      self.pendingRestart = false
    }
  }

  enum SettingError: LocalizedError {
    case invalid(field: String, message: String)
    case permission(String)
    case encoding

    var errorDescription: String? {
      switch self {
      case .invalid(let field, let message): return "\(field): \(message)"
      case .permission(let message): return message
      case .encoding: return "Could not encode settings"
      }
    }
  }
}

// MARK: - HTTPServerDelegate

extension WebcamServerModule: HTTPServerDelegate {
  func server(_ server: HTTPServer, handle request: HTTPRequest) -> HTTPResponse {
    if let rejection = auth.authorize(request) { return rejection }
    guard let routes else {
      return .error("internal", "Routes not ready", status: 500)
    }
    return routes.handle(request)
  }

  func server(
    _ server: HTTPServer,
    openStream profile: String,
    connection: StreamConnection
  ) -> Bool {
    guard capture.isRunning else { return false }

    connection.sendHeader(contentType: profile == "mjpeg"
      ? "multipart/x-mixed-replace; boundary=\(MJPEGEncoder.boundary)"
      : "video/mp4")

    // A client that misses the initialisation segment can never decode what
    // follows, so replay it immediately on connect.
    if profile == "fmp4", let initSegment = capture.initializationSegment {
      connection.send(initSegment, isInit: true)
    }

    sendEvent("onClientConnected", ["clientId": connection.id, "profile": profile])
    return true
  }

  func serverDidChangeClients(_ server: HTTPServer, count: Int) {
    sendEvent("onTelemetry", Telemetry.shared.snapshot())
  }
}

// MARK: - CaptureSessionControllerDelegate

extension WebcamServerModule: CaptureSessionControllerDelegate {
  func capture(_ c: CaptureSessionController, didProduceSegment data: Data, isInit: Bool) {
    server.broadcast(data, isInit: isInit)
  }

  func capture(_ c: CaptureSessionController, didProduceJPEG data: Data) {
    server.broadcastMJPEG(data)
  }

  func capture(_ c: CaptureSessionController, didFail error: Error) {
    Log.error("capture failed: \(error.localizedDescription)")
    sendEvent("onError", [
      "code": "capture_failed", "message": error.localizedDescription, "fatal": true,
    ])
  }
}
