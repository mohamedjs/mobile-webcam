import Foundation

/// Mirrors the shared Zod `Settings` schema. Keep the keys in lockstep with
/// packages/shared/src/settings.ts — the wire format is defined there.
struct Resolution: Codable, Equatable {
  var width: Int
  var height: Int
}

struct CinematicSettings: Codable, Equatable {
  var enabled: Bool
  var aperture: Double
}

struct BlurFallbackSettings: Codable, Equatable {
  var enabled: Bool
  var intensity: Double
}

struct ExposureSettings: Codable, Equatable {
  var mode: String
  var bias: Double
  var locked: Bool
}

struct LockableSettings: Codable, Equatable {
  var mode: String
  var locked: Bool
}

struct AudioSettings: Codable, Equatable {
  var enabled: Bool
  var sampleRate: Int
  var channels: Int
  var bitrate: Int
}

struct Settings: Codable, Equatable {
  var lens: String
  var resolution: Resolution
  var fps: Int
  var bitrate: Int
  var cinematic: CinematicSettings
  var blurFallback: BlurFallbackSettings
  var zoom: Double
  var torch: Bool
  var mirror: Bool
  var rotation: Int
  var stabilization: String
  var hdr: Bool
  var lockLens: Bool
  var exposure: ExposureSettings
  var focus: LockableSettings
  var whiteBalance: LockableSettings
  var audio: AudioSettings

  /// Factory defaults: rear wide lens, 1080p30. docs/05 §F4.
  static let `default` = Settings(
    lens: "back-wide",
    resolution: Resolution(width: 1920, height: 1080),
    fps: 30,
    bitrate: 8_000_000,
    cinematic: CinematicSettings(enabled: false, aperture: 2.8),
    blurFallback: BlurFallbackSettings(enabled: false, intensity: 0.6),
    zoom: 1.0,
    torch: false,
    mirror: false,
    rotation: 0,
    stabilization: "standard",
    hdr: true,
    lockLens: false,
    exposure: ExposureSettings(mode: "auto", bias: 0, locked: false),
    focus: LockableSettings(mode: "auto", locked: false),
    whiteBalance: LockableSettings(mode: "auto", locked: false),
    audio: AudioSettings(enabled: true, sampleRate: 48_000, channels: 1, bitrate: 128_000)
  )

  /// Which keys force an AVCaptureSession rebuild, breaking the current stream.
  /// docs/01 §5.5.
  func requiresRestart(comparedTo other: Settings) -> Bool {
    lens != other.lens
      || resolution != other.resolution
      || fps != other.fps
      || rotation != other.rotation
  }
}

final class SettingsStore {
  private let key = "mobile_webcam.settings"
  private let defaults = UserDefaults.standard
  private let queue = DispatchQueue(label: "webcam.settings")
  private var cached: Settings

  init() {
    if let data = defaults.data(forKey: key),
       let decoded = try? JSONDecoder().decode(Settings.self, from: data) {
      cached = decoded
    } else {
      cached = .default
    }
  }

  var current: Settings { queue.sync { cached } }

  func update(_ mutate: (inout Settings) -> Void) -> Settings {
    queue.sync {
      mutate(&cached)
      if let data = try? JSONEncoder().encode(cached) {
        defaults.set(data, forKey: key)
      }
      return cached
    }
  }

  func replace(_ settings: Settings) {
    _ = update { $0 = settings }
  }
}
