import Foundation

struct HTTPResponse {
  var status: Int
  var headers: [String: String]
  var body: Data

  static func json(_ object: Any, status: Int = 200) -> HTTPResponse {
    let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
    return HTTPResponse(
      status: status,
      headers: ["Content-Type": "application/json", "Content-Length": "\(data.count)"],
      body: data)
  }

  static func error(_ code: String, _ message: String, status: Int, field: String? = nil)
    -> HTTPResponse {
    var payload: [String: Any] = ["error": code, "message": message]
    if let field { payload["field"] = field }
    return json(payload, status: status)
  }

  static func noContent() -> HTTPResponse {
    HTTPResponse(status: 204, headers: [:], body: Data())
  }

  /// Chunked-free streaming: we simply never close and never send
  /// Content-Length. ffmpeg and browsers both handle a connection-terminated
  /// body, and it avoids re-framing every segment.
  static func streamHeader(contentType: String) -> Data {
    let head = """
    HTTP/1.1 200 OK\r
    Content-Type: \(contentType)\r
    Cache-Control: no-store, no-cache\r
    Connection: close\r
    \r

    """
    return Data(head.utf8)
  }

  func serialize() -> Data {
    let reason = HTTPResponse.reasons[status] ?? "OK"
    var head = "HTTP/1.1 \(status) \(reason)\r\n"
    var allHeaders = headers
    allHeaders["Connection"] = "close"
    if allHeaders["Content-Length"] == nil {
      allHeaders["Content-Length"] = "\(body.count)"
    }
    for (k, v) in allHeaders { head += "\(k): \(v)\r\n" }
    head += "\r\n"
    return Data(head.utf8) + body
  }

  private static let reasons: [Int: String] = [
    200: "OK", 204: "No Content", 400: "Bad Request", 401: "Unauthorized",
    403: "Forbidden", 404: "Not Found", 409: "Conflict", 500: "Internal Server Error",
  ]
}
