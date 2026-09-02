import Foundation

struct HTTPRequest {
  let method: String
  let path: String
  let query: [String: String]
  let headers: [String: String]
  let body: Data

  var bearerToken: String? {
    guard let auth = headers["authorization"], auth.lowercased().hasPrefix("bearer ") else {
      return nil
    }
    return String(auth.dropFirst(7)).trimmingCharacters(in: .whitespaces)
  }

  /// Over iproxy the Host header is the loopback one. Rejecting anything else
  /// keeps the listener from serving a real network if it is ever reachable.
  var isLoopbackHost: Bool {
    guard let host = headers["host"]?.lowercased() else { return true }
    return host.hasPrefix("127.0.0.1") || host.hasPrefix("localhost") || host.hasPrefix("[::1]")
  }

  func json<T: Decodable>(_ type: T.Type) -> T? {
    try? JSONDecoder().decode(type, from: body)
  }

  var jsonObject: [String: Any]? {
    (try? JSONSerialization.jsonObject(with: body)) as? [String: Any]
  }

  /// Returns nil when more bytes are needed. Only parses what this server uses:
  /// a request line, headers, and an optional Content-Length body.
  static func parse(_ buffer: Data) -> (request: HTTPRequest, consumed: Int)? {
    guard let headerEnd = buffer.range(of: Data("\r\n\r\n".utf8)) else { return nil }
    guard let head = String(data: buffer[..<headerEnd.lowerBound], encoding: .utf8) else {
      return nil
    }

    var lines = head.components(separatedBy: "\r\n")
    guard !lines.isEmpty else { return nil }
    let requestLine = lines.removeFirst().components(separatedBy: " ")
    guard requestLine.count >= 2 else { return nil }

    var headers: [String: String] = [:]
    for line in lines {
      guard let colon = line.firstIndex(of: ":") else { continue }
      let key = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
      let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
      headers[key] = value
    }

    let target = requestLine[1]
    let parts = target.components(separatedBy: "?")
    var query: [String: String] = [:]
    if parts.count > 1 {
      for pair in parts[1].components(separatedBy: "&") {
        let kv = pair.components(separatedBy: "=")
        if kv.count == 2 { query[kv[0]] = kv[1].removingPercentEncoding ?? kv[1] }
      }
    }

    let contentLength = Int(headers["content-length"] ?? "0") ?? 0
    let bodyStart = headerEnd.upperBound
    let available = buffer.count - bodyStart
    guard available >= contentLength else { return nil }

    let body = contentLength > 0
      ? buffer.subdata(in: bodyStart..<(bodyStart + contentLength))
      : Data()

    let request = HTTPRequest(
      method: requestLine[0].uppercased(),
      path: parts[0],
      query: query,
      headers: headers,
      body: body)

    return (request, bodyStart + contentLength)
  }
}
