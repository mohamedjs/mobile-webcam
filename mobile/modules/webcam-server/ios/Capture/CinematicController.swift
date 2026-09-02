import AVFoundation

/// Cinematic video capture support.
///
/// Three tiers, detected at runtime — never gated on a hardcoded model list.
/// docs/05 §F5.
///
/// Tier 1: iOS 26's `isCinematicVideoCaptureEnabled` on AVCaptureDeviceInput.
///         The video data output emits frames with the shallow depth-of-field
///         ALREADY BAKED IN, which is exactly what we need when sending frames
///         to a remote device — no compositing on our side.
/// Tier 2: AVCaptureDepthDataOutput + CoreImage masked blur (dual camera).
/// Tier 3: Vision person segmentation (any device).
enum CinematicTier: Int {
  case unsupported = 0
  case native = 1
  case depth = 2
  case segmentation = 3
}

enum CinematicController {
  static func tier(for device: AVCaptureDevice) -> CinematicTier {
    if device.activeFormat.supportedDepthDataFormats.isEmpty == false { return .depth }
    return .segmentation
  }

  @available(iOS 26.0, *)
  private static func supportsNative(_ device: AVCaptureDevice) -> Bool {
    device.formats.contains { format in
      format.value(forKey: "isCinematicVideoCaptureSupported") as? Bool ?? false
    }
  }

  /// Enable native Cinematic on the input. Returns false when unsupported, so
  /// the caller can fall back rather than silently producing a flat image.
  static func enableNative(on input: AVCaptureDeviceInput, enabled: Bool) -> Bool {
    guard #available(iOS 26.0, *) else { return false }
    guard input.responds(to: NSSelectorFromString("setCinematicVideoCaptureEnabled:")) else {
      return false
    }
    input.setValue(enabled, forKey: "cinematicVideoCaptureEnabled")
    Log.info("native cinematic \(enabled ? "enabled" : "disabled")")
    return true
  }

  /// Formats that can run Cinematic, used to clamp the UI. Empty when unsupported.
  static func supportedResolutions(for device: AVCaptureDevice) -> [[String: Any]] {
    guard #available(iOS 26.0, *), supportsNative(device) else { return [] }
    var out: [[String: Any]] = []
    var seen = Set<String>()
    for format in device.formats {
      guard format.value(forKey: "isCinematicVideoCaptureSupported") as? Bool == true else { continue }
      let dims = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
      let key = "\(dims.width)x\(dims.height)"
      if seen.insert(key).inserted {
        out.append(["width": Int(dims.width), "height": Int(dims.height)])
      }
    }
    return out
  }
}
