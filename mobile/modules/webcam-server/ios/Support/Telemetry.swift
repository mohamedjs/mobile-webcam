import Foundation
import UIKit

/// Thread-safe counters shared between the capture queue, the encoder and the
/// HTTP server. All mutation goes through one serial queue.
final class Telemetry {
  static let shared = Telemetry()

  private let queue = DispatchQueue(label: "webcam.telemetry")
  private var frames = 0
  private var bytes = 0
  private var windowStart = Date()

  private(set) var fps: Double = 0
  private(set) var bitrate: Double = 0
  private(set) var droppedFrames = 0
  private(set) var droppedSegments = 0
  private(set) var clients = 0
  private(set) var audioLevel: Float = 0

  private init() {
    // UIKit must be touched on the main thread. Enable battery monitoring once,
    // here, and cache the level via notifications — the HTTP queue then reads a
    // plain Double instead of calling into UIKit. Accessing UIDevice from the
    // request handler crashed the app on every /health.
    DispatchQueue.main.async {
      UIDevice.current.isBatteryMonitoringEnabled = true
      let initial = Double(max(UIDevice.current.batteryLevel, 0))
      // Every write goes through the serial queue, same as every read.
      self.queue.async { self.cachedBattery = initial }
      NotificationCenter.default.addObserver(
        forName: UIDevice.batteryLevelDidChangeNotification,
        object: nil, queue: .main
      ) { _ in
        let level = Double(max(UIDevice.current.batteryLevel, 0))
        self.queue.async { self.cachedBattery = level }
      }
    }
  }

  private var cachedBattery: Double = 1.0

  func recordFrame(bytes count: Int) {
    queue.async {
      self.frames += 1
      self.bytes += count
      self.rollWindowLocked()
    }
  }

  func recordDroppedFrame() { queue.async { self.droppedFrames += 1 } }
  func recordDroppedSegment() { queue.async { self.droppedSegments += 1 } }
  func setClients(_ n: Int) { queue.async { self.clients = n } }
  func setAudioLevel(_ level: Float) { queue.async { self.audioLevel = level } }

  func reset() {
    queue.async {
      self.frames = 0; self.bytes = 0
      self.droppedFrames = 0; self.droppedSegments = 0
      self.fps = 0; self.bitrate = 0
      self.windowStart = Date()
    }
  }

  private func rollWindowLocked() {
    let elapsed = Date().timeIntervalSince(windowStart)
    guard elapsed >= 1.0 else { return }
    fps = Double(frames) / elapsed
    bitrate = Double(bytes * 8) / elapsed
    frames = 0
    bytes = 0
    windowStart = Date()
  }

  var thermalState: String {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal:  return "nominal"
    case .fair:     return "fair"
    case .serious:  return "serious"
    case .critical: return "critical"
    @unknown default: return "nominal"
    }
  }

  /// Reads the cached value. Safe from any queue.
  var battery: Double { queue.sync { cachedBattery } }

  func snapshot() -> [String: Any] {
    queue.sync {
      [
        "fps": fps,
        "bitrate": bitrate,
        "droppedFrames": droppedFrames,
        "droppedSegments": droppedSegments,
        "thermalState": thermalState,
        "battery": cachedBattery,
        "clients": clients,
        "audioLevel": Double(audioLevel),
      ]
    }
  }
}
