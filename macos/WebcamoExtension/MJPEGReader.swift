import CoreGraphics
import Foundation
import ImageIO
import os.log

/// Reads `multipart/x-mixed-replace` MJPEG from the phone and emits decoded frames.
///
/// The phone is reached at 127.0.0.1:8080 because the desktop service holds an
/// `iproxy` tunnel open over usbmuxd — host→device only, which is the whole
/// premise of the project (docs/01 §2). If the tunnel is down there is simply
/// nothing to connect to, so this retries quietly rather than failing hard.
final class MJPEGReader: NSObject, URLSessionDataDelegate {

  var onFrame: ((CGImage) -> Void)?

  private var session: URLSession?
  private var task: URLSessionDataTask?
  private var buffer = Data()
  private var running = false
  private var retryDelay: TimeInterval = 1.0

  private let url = URL(string: "http://127.0.0.1:8080/stream.mjpeg")!
  private let boundary = Data("--webcamoframe".utf8)
  /// A frame that never completes must not grow without bound.
  private let maxBuffer = 32 * 1024 * 1024

  func start() {
    guard !running else { return }
    running = true
    connect()
  }

  func stop() {
    running = false
    task?.cancel()
    task = nil
    session?.invalidateAndCancel()
    session = nil
    buffer.removeAll()
  }

  private func connect() {
    guard running else { return }

    let config = URLSessionConfiguration.ephemeral
    // An MJPEG response never ends; a request timeout would kill it mid-stream.
    config.timeoutIntervalForRequest = 0
    config.timeoutIntervalForResource = 0
    config.networkServiceType = .video

    let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    self.session = session

    var request = URLRequest(url: url)
    request.setValue("multipart/x-mixed-replace", forHTTPHeaderField: "Accept")

    let task = session.dataTask(with: request)
    self.task = task
    buffer.removeAll()
    task.resume()
  }

  private func scheduleReconnect() {
    guard running else { return }
    let delay = retryDelay
    // Back off to 5s so a phone that is simply not serving costs nothing.
    retryDelay = min(retryDelay * 2, 5.0)
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + delay) { [weak self] in
      self?.connect()
    }
  }

  // MARK: - URLSessionDataDelegate

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    retryDelay = 1.0
    buffer.append(data)

    if buffer.count > maxBuffer {
      os_log("mjpeg buffer overflow, resetting", log: extLog, type: .error)
      buffer.removeAll()
      return
    }

    drainFrames()
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard running else { return }
    if let error, (error as NSError).code != NSURLErrorCancelled {
      os_log("mjpeg stream ended: %{public}@", log: extLog, type: .info, error.localizedDescription)
    }
    scheduleReconnect()
  }

  // MARK: - Parsing

  /// Pulls every complete part out of the buffer, leaving a partial tail.
  private func drainFrames() {
    while true {
      guard let start = buffer.range(of: boundary) else { return }
      // Need the *next* boundary to know where this part ends.
      let afterStart = start.upperBound
      guard afterStart < buffer.endIndex,
            let next = buffer.range(of: boundary, in: afterStart..<buffer.endIndex) else { return }

      let part = buffer.subdata(in: afterStart..<next.lowerBound)
      buffer.removeSubrange(buffer.startIndex..<next.lowerBound)

      // Skip the part's own headers.
      guard let headerEnd = part.range(of: Data("\r\n\r\n".utf8)) else { continue }
      let jpeg = part.subdata(in: headerEnd.upperBound..<part.endIndex)
      guard jpeg.count > 4 else { continue }

      if let source = CGImageSourceCreateWithData(jpeg as CFData, nil),
         let image = CGImageSourceCreateImageAtIndex(source, 0, nil) {
        onFrame?(image)
      }
    }
  }
}
