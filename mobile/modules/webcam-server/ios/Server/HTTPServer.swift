import Foundation
import Network

protocol HTTPServerDelegate: AnyObject {
  func server(_ server: HTTPServer, handle request: HTTPRequest) -> HTTPResponse
  func server(_ server: HTTPServer, openStream profile: String, connection: StreamConnection) -> Bool
  func serverDidChangeClients(_ server: HTTPServer, count: Int)
}

/// HTTP/1.1 server on Network.framework.
///
/// NWListener rather than a third-party server (GCDWebServer, Telegraph): this
/// server holds a response open for hours and must know when each write actually
/// left the device. NWConnection's send completion is exactly that signal;
/// libraries that buffer without bound run the phone out of memory. docs/02 §3.1.
final class HTTPServer {
  weak var delegate: HTTPServerDelegate?

  private var listener: NWListener?
  private let queue = DispatchQueue(label: "webcam.http", attributes: .concurrent)
  private let stateQueue = DispatchQueue(label: "webcam.http.state")
  private var streams: [String: StreamConnection] = [:]
  private(set) var port: UInt16 = 0

  var isRunning: Bool { listener?.state == .ready }
  var clientCount: Int { stateQueue.sync { streams.count } }

  /// Blocks until the listener is actually READY, or throws.
  ///
  /// `NWListener.start` is asynchronous: it returns before the socket is bound.
  /// Returning success here regardless would make the app show "Waiting for
  /// computer" while the listener silently failed — and the desktop would see
  /// only "connection reset by peer" with no explanation on the phone. That is
  /// the exact failure this project exists to avoid, so we wait for the real
  /// outcome. Called from an AsyncFunction on a background queue, so blocking
  /// is safe.
  func start(port: UInt16, timeout: TimeInterval = 5.0) throws {
    stop()

    let params = NWParameters.tcp
    params.allowLocalEndpointReuse = true
    (params.defaultProtocolStack.transportProtocol as? NWProtocolTCP.Options)?
      .noDelay = true

    guard let nwPort = NWEndpoint.Port(rawValue: port) else {
      throw ServerError.invalidPort(port)
    }

    let listener = try NWListener(using: params, on: nwPort)
    listener.newConnectionHandler = { [weak self] connection in
      self?.accept(connection)
    }

    let semaphore = DispatchSemaphore(value: 0)
    var settled = false
    var failure: Error?
    let settle: (Error?) -> Void = { error in
      guard !settled else { return }
      settled = true
      failure = error
      semaphore.signal()
    }

    listener.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        Log.info("http server listening on \(port)")
        settle(nil)
      case .failed(let error):
        Log.error("listener failed: \(error.localizedDescription)")
        self?.stop()
        settle(ServerError.bindFailed(port: port, underlying: error))
      case .cancelled:
        settle(ServerError.bindFailed(
          port: port,
          underlying: NSError(domain: "webcam", code: -1,
                              userInfo: [NSLocalizedDescriptionKey: "listener cancelled"])))
      default:
        break
      }
    }

    listener.start(queue: queue)

    if semaphore.wait(timeout: .now() + timeout) == .timedOut {
      listener.cancel()
      throw ServerError.bindTimeout(port: port)
    }
    if let failure {
      listener.cancel()
      throw failure
    }

    self.listener = listener
    self.port = port
  }

  func stop() {
    stateQueue.sync {
      for (_, stream) in streams { stream.close(reason: "server stopping") }
      streams.removeAll()
    }
    listener?.cancel()
    listener = nil
    Telemetry.shared.setClients(0)
  }

  /// Fan a media segment out to every attached client.
  func broadcast(_ data: Data, isInit: Bool = false) {
    let current = stateQueue.sync { Array(streams.values) }
    for stream in current { stream.send(data, isInit: isInit) }
  }

  func broadcastMJPEG(_ jpeg: Data) {
    let payload = MJPEGEncoder.partHeader(length: jpeg.count) + jpeg + Data("\r\n".utf8)
    let current = stateQueue.sync { streams.values.filter { $0.profile == "mjpeg" } }
    for stream in current { stream.send(payload) }
  }

  private func accept(_ connection: NWConnection) {
    connection.start(queue: queue)
    receive(on: connection, buffer: Data())
  }

  private func receive(on connection: NWConnection, buffer: Data) {
    connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
      [weak self] data, _, isComplete, error in
      guard let self else { return }

      if error != nil || (isComplete && data == nil) {
        connection.cancel()
        return
      }

      var buffer = buffer
      if let data { buffer.append(data) }

      guard let (request, _) = HTTPRequest.parse(buffer) else {
        if buffer.count > 128 * 1024 {
          connection.cancel()   // never grow a request buffer without bound
          return
        }
        self.receive(on: connection, buffer: buffer)
        return
      }

      self.route(request, on: connection)
    }
  }

  private func route(_ request: HTTPRequest, on connection: NWConnection) {
    guard let delegate else {
      connection.cancel()
      return
    }

    let isStream = request.path == "/stream.mp4" || request.path == "/stream.mjpeg"
    if isStream {
      let profile = request.path == "/stream.mjpeg" ? "mjpeg" : "fmp4"
      let id = UUID().uuidString

      // One streaming client at a time — but the NEW client wins.
      //
      // Refusing with 409 looked safer and was worse in practice: when the
      // desktop's ffmpeg is killed abruptly, its entry can outlive it, and every
      // reconnect is then refused forever. The symptom is brutal to diagnose —
      // the virtual camera stays empty, which renders as a solid green frame at
      // 0 fps, with nothing in any log but a 409. A reconnecting desktop is the
      // normal case, so evict the old client and let the new one in.
      let displaced = stateQueue.sync { Array(streams.values) }
      for old in displaced {
        Log.info("displacing client \(old.id) for a new one")
        old.close(reason: "replaced by a new client")
      }
      if !displaced.isEmpty {
        stateQueue.sync { streams.removeAll() }
      }

      let stream = StreamConnection(id: id, profile: profile, connection: connection)
      stream.onClose = { [weak self] closedId, reason in
        guard let self else { return }
        self.stateQueue.sync { _ = self.streams.removeValue(forKey: closedId) }
        Telemetry.shared.setClients(self.clientCount)
        self.delegate?.serverDidChangeClients(self, count: self.clientCount)
        Log.info("client \(closedId) closed: \(reason)")
      }

      guard delegate.server(self, openStream: profile, connection: stream) else {
        send(.error("capture_failed", "Camera is not running", status: 409), on: connection)
        return
      }

      stateQueue.sync { streams[id] = stream }
      Telemetry.shared.setClients(clientCount)
      delegate.serverDidChangeClients(self, count: clientCount)
      return
    }

    let response = delegate.server(self, handle: request)
    send(response, on: connection)
  }

  private func send(_ response: HTTPResponse, on connection: NWConnection) {
    connection.send(content: response.serialize(), completion: .contentProcessed { _ in
      connection.cancel()
    })
  }

  enum ServerError: LocalizedError {
    case invalidPort(UInt16)
    case bindFailed(port: UInt16, underlying: Error)
    case bindTimeout(port: UInt16)

    /// A bind failure is nearly always the Local Network permission, so say so
    /// instead of surfacing an opaque POSIX error. docs/03 §6.
    var errorDescription: String? {
      switch self {
      case .invalidPort(let p):
        return "Invalid port \(p)"
      case .bindFailed(let p, let underlying):
        return "Could not listen on port \(p) (\(underlying.localizedDescription)). "
          + "Open Settings > Privacy & Security > Local Network and enable mobile_webcam."
      case .bindTimeout(let p):
        return "Listening on port \(p) timed out. This usually means iOS blocked the "
          + "local network: Settings > Privacy & Security > Local Network > mobile_webcam."
      }
    }
  }
}
