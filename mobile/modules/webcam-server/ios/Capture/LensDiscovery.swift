import AVFoundation

struct LensInfo {
  let id: String
  let label: String
  let position: String
  let device: AVCaptureDevice
  let minZoom: Double
  let maxZoom: Double

  var json: [String: Any] {
    ["id": id, "label": label, "position": position, "minZoom": minZoom, "maxZoom": maxZoom]
  }
}

/// Enumerates the lenses this specific device actually has.
///
/// Never hardcode a model list: an iPhone SE has one rear lens, a 15 Pro has
/// three. docs/05 §F4.
enum LensDiscovery {
  static func discover() -> [LensInfo] {
    var lenses: [LensInfo] = []

    let backTypes: [(AVCaptureDevice.DeviceType, String, String)] = [
      (.builtInUltraWideCamera, "back-ultrawide", "0.5x Ultra Wide"),
      (.builtInWideAngleCamera, "back-wide", "1x Wide"),
      (.builtInTelephotoCamera, "back-tele", "Telephoto"),
    ]

    for (type, id, label) in backTypes {
      let session = AVCaptureDevice.DiscoverySession(
        deviceTypes: [type], mediaType: .video, position: .back)
      if let device = session.devices.first {
        lenses.append(LensInfo(
          id: id, label: label, position: "back", device: device,
          minZoom: Double(device.minAvailableVideoZoomFactor),
          maxZoom: Double(min(device.maxAvailableVideoZoomFactor, 10))))
      }
    }

    let front = AVCaptureDevice.DiscoverySession(
      deviceTypes: [.builtInWideAngleCamera], mediaType: .video, position: .front)
    if let device = front.devices.first {
      lenses.append(LensInfo(
        id: "front", label: "Front", position: "front", device: device,
        minZoom: Double(device.minAvailableVideoZoomFactor),
        maxZoom: Double(min(device.maxAvailableVideoZoomFactor, 4))))
    }

    return lenses
  }

  static func device(for id: String) -> AVCaptureDevice? {
    discover().first { $0.id == id }?.device
  }

  /// Resolutions the device can actually deliver, with their real fps ceilings.
  static func resolutions(for device: AVCaptureDevice) -> [[String: Any]] {
    var seen: [String: Int] = [:]
    let wanted = [(1280, 720), (1920, 1080), (3840, 2160)]

    for format in device.formats {
      let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
      let w = Int(dims.width), h = Int(dims.height)
      guard wanted.contains(where: { $0.0 == w && $0.1 == h }) else { continue }
      let maxFps = Int(format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 30)
      let key = "\(w)x\(h)"
      seen[key] = max(seen[key] ?? 0, maxFps)
    }

    return wanted.compactMap { (w, h) in
      guard let fps = seen["\(w)x\(h)"] else { return nil }
      return ["width": w, "height": h, "maxFps": fps]
    }
  }
}
