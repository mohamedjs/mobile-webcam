import Foundation
import Network

/// One streaming client.
///
/// Back-pressure is the whole point of this class: NWConnection's send
/// completion tells us when the previous write actually left. If it has not, the
/// new segment is DROPPED rather than queued. Unbounded queueing is an OOM crash
/// on a phone. docs/05 §F2.
final class StreamConnection {
  let id: String
  let profile: String
  private let connection: NWConnection
  private let queue = DispatchQueue(label: "webcam.stream.write")
  private var inFlight = false
  /// When the current in-flight write started, for stall detection.
  private var inFlightSince: Date?
  private var closed = false
  private var sentInitSegment = false

  var onClose: ((String, String) -> Void)?

  init(id: String, profile: String, connection: NWConnection) {
    self.id = id
    self.profile = profile
    self.connection = connection
    observeState()
  }

  /// Notice a vanished client immediately.
  ///
  /// Relying only on a failed write is not enough: if the capture stalls, no
  /// write is attempted, the connection is never reaped, and the one-client
  /// limit then rejects every reconnect with 409 until the app is restarted.
  private func observeState() {
    connection.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .failed(let error):
        self.close(reason: "connection failed: \(error.localizedDescription)")
      case .cancelled:
        self.close(reason: "connection cancelled")
      default:
        break
      }
    }
  }

  func sendHeader(contentType: String) {
    write(HTTPResponse.streamHeader(contentType: contentType), force: true)
  }

  /// Media segments. `isInit` bypasses back-pressure: a client that misses the
  /// initialisation segment can never decode anything that follows.
  func send(_ data: Data, isInit: Bool = false) {
    if isInit {
      guard !sentInitSegment else { return }
      sentInitSegment = true
      write(data, force: true)
      return
    }
    guard sentInitSegment || profile == "mjpeg" else { return }
    write(data, force: false)
  }

  private func write(_ data: Data, force: Bool) {
    queue.async {
      guard !self.closed else { return }
      if self.inFlight && !force {
        // A write that never completes latches inFlight forever. Because a
        // client is only reaped when a write FAILS, and no write is ever
        // attempted again, the entry outlives its connection permanently and
        // every reconnect is refused with 409. Treat a long-stalled write as a
        // dead connection.
        if let since = self.inFlightSince, Date().timeIntervalSince(since) > 10 {
          Log.warn("write stalled for >10s; treating client \(self.id) as dead")
          self.close(reason: "write stalled")
          return
        }
        Telemetry.shared.recordDroppedSegment()
        return
      }
      self.inFlight = true
      self.inFlightSince = Date()
      self.connection.send(content: data, completion: .contentProcessed { [weak self] error in
        guard let self else { return }
        self.queue.async {
          self.inFlight = false
          self.inFlightSince = nil
          if let error {
            Log.debug("stream write failed: \(error.localizedDescription)")
            self.close(reason: "write failed")
          }
        }
      })
    }
  }

  func close(reason: String) {
    queue.async {
      guard !self.closed else { return }
      self.closed = true
      self.connection.cancel()
      self.onClose?(self.id, reason)
    }
  }
}
