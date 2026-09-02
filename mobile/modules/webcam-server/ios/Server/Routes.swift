import Foundation
import UIKit

/// Maps HTTP requests to capture/settings operations.
///
/// Validation happens HERE, on the phone, because the phone is the only place
/// that knows what the hardware actually accepts. Never coerce a bad value
/// silently — return 400 naming the field. docs/01 §5.4.
struct Routes {
  let capture: CaptureSessionController
  let store: SettingsStore
  let appVersion: String
  let protocolVersion: Int
  let onSettingsApplied: (Settings, Bool) -> Void

  func handle(_ request: HTTPRequest) -> HTTPResponse {
    switch (request.method, request.path) {
    case ("GET", "/health"):        return health()
    case ("GET", "/capabilities"):  return .json(capture.capabilities())
    case ("GET", "/settings"):      return settingsResponse(store.current)
    case ("PATCH", "/settings"):    return patchSettings(request)
    case ("GET", "/telemetry"):     return .json(Telemetry.shared.snapshot())
    case ("POST", "/actions/focus"): return focus(request)
    case ("POST", "/actions/switch-camera"): return switchCamera(request)
    default:
      return .error("internal", "No route for \(request.method) \(request.path)", status: 404)
    }
  }

  /// Device identity, read once on the main thread at startup.
  ///
  /// UIDevice is UIKit: reading it from the HTTP queue is a main-thread
  /// violation that crashes the app mid-request, which the desktop sees as
  /// "connection reset by peer".
  static let deviceInfo: [String: String] = {
    var info: [String: String] = ["model": "iPhone", "ios": "0.0", "name": "iPhone"]
    let read = {
      info = [
        "model": UIDevice.current.model,
        "ios": UIDevice.current.systemVersion,
        "name": UIDevice.current.name,
      ]
    }
    if Thread.isMainThread { read() } else { DispatchQueue.main.sync(execute: read) }
    return info
  }()

  private func health() -> HTTPResponse {
    .json([
      "ok": true,
      "app": "mobile_webcam",
      "version": appVersion,
      "protocol": protocolVersion,
      "device": Routes.deviceInfo,
      "streaming": capture.isRunning,
      "battery": Telemetry.shared.battery,
      "thermalState": Telemetry.shared.thermalState,
    ])
  }

  private func settingsResponse(_ settings: Settings) -> HTTPResponse {
    guard let data = try? JSONEncoder().encode(settings),
          let object = try? JSONSerialization.jsonObject(with: data) else {
      return .error("internal", "Could not encode settings", status: 500)
    }
    return .json(object)
  }

  private func patchSettings(_ request: HTTPRequest) -> HTTPResponse {
    guard let patch = request.jsonObject else {
      return .error("invalid_setting", "Body must be a JSON object", status: 400)
    }

    let previous = store.current
    var next = previous
    if let issue = Self.apply(patch, to: &next, capabilities: capture.capabilities()) {
      return .error("invalid_setting", issue.message, status: 400, field: issue.field)
    }

    store.replace(next)
    let restart = next.requiresRestart(comparedTo: previous)
    if !restart { capture.applyLive(next) }
    onSettingsApplied(next, restart)
    return settingsResponse(next)
  }

  private func focus(_ request: HTTPRequest) -> HTTPResponse {
    guard let body = request.jsonObject,
          let x = body["x"] as? Double, let y = body["y"] as? Double else {
      return .error("invalid_setting", "x and y are required", status: 400)
    }
    capture.focus(at: CGPoint(x: x, y: y))
    return .noContent()
  }

  private func switchCamera(_ request: HTTPRequest) -> HTTPResponse {
    guard let body = request.jsonObject, let lens = body["lens"] as? String else {
      return .error("invalid_setting", "lens is required", status: 400, field: "lens")
    }
    if store.current.lockLens {
      return .error("unsupported_capability", "Lens is locked in the app", status: 403)
    }
    return patchSettings(HTTPRequest(
      method: "PATCH", path: "/settings", query: [:], headers: request.headers,
      body: (try? JSONSerialization.data(withJSONObject: ["lens": lens])) ?? Data()))
  }

  struct Issue { let field: String; let message: String }

  /// Merge a partial patch, validating each field against real capabilities.
  static func apply(
    _ patch: [String: Any],
    to settings: inout Settings,
    capabilities: [String: Any]
  ) -> Issue? {
    let lenses = (capabilities["lenses"] as? [[String: Any]]) ?? []
    let resolutions = (capabilities["resolutions"] as? [[String: Any]]) ?? []

    if let lens = patch["lens"] as? String {
      guard lenses.contains(where: { $0["id"] as? String == lens }) else {
        return Issue(field: "lens", message: "Unknown lens \"\(lens)\"")
      }
      settings.lens = lens
    }

    if let res = patch["resolution"] as? [String: Any] {
      let w = res["width"] as? Int ?? settings.resolution.width
      let h = res["height"] as? Int ?? settings.resolution.height
      guard resolutions.contains(where: {
        ($0["width"] as? Int) == w && ($0["height"] as? Int) == h
      }) else {
        return Issue(field: "resolution", message: "Device does not offer \(w)x\(h)")
      }
      settings.resolution = Resolution(width: w, height: h)
    }

    if let fps = patch["fps"] as? Int {
      let mode = resolutions.first {
        ($0["width"] as? Int) == settings.resolution.width
          && ($0["height"] as? Int) == settings.resolution.height
      }
      let ceiling = (mode?["maxFps"] as? Int) ?? 30
      guard fps > 0, fps <= ceiling else {
        return Issue(field: "fps", message: "\(fps)fps exceeds \(ceiling)fps for this format")
      }
      settings.fps = fps
    }

    if let bitrate = patch["bitrate"] as? Int {
      guard (1_000_000...40_000_000).contains(bitrate) else {
        return Issue(field: "bitrate", message: "Bitrate must be 1-40 Mbps")
      }
      settings.bitrate = bitrate
    }

    if let cine = patch["cinematic"] as? [String: Any] {
      let support = capabilities["cinematic"] as? [String: Any]
      if let enabled = cine["enabled"] as? Bool {
        if enabled, (support?["supported"] as? Bool) != true {
          return Issue(field: "cinematic.enabled",
                       message: "Device does not support Cinematic capture")
        }
        settings.cinematic.enabled = enabled
      }
      if let aperture = cine["aperture"] as? Double {
        let lo = (support?["minAperture"] as? Double) ?? 2.0
        let hi = (support?["maxAperture"] as? Double) ?? 16.0
        guard (lo...hi).contains(aperture) else {
          return Issue(field: "cinematic.aperture",
                       message: "Aperture outside f/\(lo)-f/\(hi)")
        }
        settings.cinematic.aperture = aperture
      }
    }

    if let blur = patch["blurFallback"] as? [String: Any] {
      if let enabled = blur["enabled"] as? Bool { settings.blurFallback.enabled = enabled }
      if let intensity = blur["intensity"] as? Double {
        guard (0...1).contains(intensity) else {
          return Issue(field: "blurFallback.intensity", message: "Intensity must be 0-1")
        }
        settings.blurFallback.intensity = intensity
      }
    }

    if let zoom = patch["zoom"] as? Double {
      let lens = lenses.first { $0["id"] as? String == settings.lens }
      let lo = (lens?["minZoom"] as? Double) ?? 1.0
      let hi = (lens?["maxZoom"] as? Double) ?? 8.0
      guard (lo...hi).contains(zoom) else {
        return Issue(field: "zoom", message: "Zoom outside \(lo)-\(hi) for this lens")
      }
      settings.zoom = zoom
    }

    if let torch = patch["torch"] as? Bool { settings.torch = torch }
    if let mirror = patch["mirror"] as? Bool { settings.mirror = mirror }
    if let lockLens = patch["lockLens"] as? Bool { settings.lockLens = lockLens }

    if let rotation = patch["rotation"] as? Int {
      guard [0, 90, 180, 270].contains(rotation) else {
        return Issue(field: "rotation", message: "Rotation must be 0, 90, 180 or 270")
      }
      settings.rotation = rotation
    }

    if let stabilization = patch["stabilization"] as? String {
      let supported = (capabilities["stabilization"] as? [String]) ?? []
      guard supported.contains(stabilization) else {
        return Issue(field: "stabilization",
                     message: "Device does not support \"\(stabilization)\"")
      }
      settings.stabilization = stabilization
    }

    if let hdr = patch["hdr"] as? Bool {
      if hdr, (capabilities["hdr"] as? Bool) != true {
        return Issue(field: "hdr", message: "Device does not support HDR")
      }
      settings.hdr = hdr
    }

    if let exposure = patch["exposure"] as? [String: Any] {
      if let bias = exposure["bias"] as? Double {
        guard (-2.0...2.0).contains(bias) else {
          return Issue(field: "exposure.bias", message: "Bias must be -2 to +2 EV")
        }
        settings.exposure.bias = bias
      }
      if let locked = exposure["locked"] as? Bool { settings.exposure.locked = locked }
      if let mode = exposure["mode"] as? String { settings.exposure.mode = mode }
    }

    if let focus = patch["focus"] as? [String: Any] {
      if let locked = focus["locked"] as? Bool { settings.focus.locked = locked }
      if let mode = focus["mode"] as? String { settings.focus.mode = mode }
    }

    if let wb = patch["whiteBalance"] as? [String: Any] {
      if let locked = wb["locked"] as? Bool { settings.whiteBalance.locked = locked }
      if let mode = wb["mode"] as? String { settings.whiteBalance.mode = mode }
    }

    if let audio = patch["audio"] as? [String: Any] {
      let caps = capabilities["audio"] as? [String: Any]
      if let enabled = audio["enabled"] as? Bool { settings.audio.enabled = enabled }
      if let rate = audio["sampleRate"] as? Int {
        let allowed = (caps?["sampleRates"] as? [Int]) ?? [44100, 48000]
        guard allowed.contains(rate) else {
          return Issue(field: "audio.sampleRate", message: "Unsupported sample rate \(rate)")
        }
        settings.audio.sampleRate = rate
      }
      if let channels = audio["channels"] as? Int {
        let maxChannels = (caps?["maxChannels"] as? Int) ?? 2
        guard channels >= 1, channels <= maxChannels else {
          return Issue(field: "audio.channels",
                       message: "Device supports at most \(maxChannels) channels")
        }
        settings.audio.channels = channels
      }
      if let bitrate = audio["bitrate"] as? Int {
        guard (32_000...320_000).contains(bitrate) else {
          return Issue(field: "audio.bitrate", message: "Audio bitrate must be 32-320 kbps")
        }
        settings.audio.bitrate = bitrate
      }
    }

    return nil
  }
}