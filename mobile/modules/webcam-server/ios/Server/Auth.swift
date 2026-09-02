import Foundation

/// Bearer-token gate.
///
/// Over USB the listener is only reachable from processes on the connected host,
/// so this is not defending against the network — it stops an unrelated process
/// on the computer silently reading the camera. /health stays open so the
/// desktop can diagnose before it knows the token. docs/01 §8.
struct Auth {
  private let token: String

  init(token: String) { self.token = token }

  static let openPaths: Set<String> = ["/health"]

  func authorize(_ request: HTTPRequest) -> HTTPResponse? {
    if Auth.openPaths.contains(request.path) { return nil }
    guard !token.isEmpty else { return nil }

    guard request.isLoopbackHost else {
      return .error("unauthorized", "Non-loopback Host header rejected", status: 403)
    }
    guard let provided = request.bearerToken, constantTimeEquals(provided, token) else {
      return .error("unauthorized", "Missing or invalid pairing code", status: 401)
    }
    return nil
  }

  private func constantTimeEquals(_ a: String, _ b: String) -> Bool {
    let x = Array(a.utf8), y = Array(b.utf8)
    guard x.count == y.count else { return false }
    var diff: UInt8 = 0
    for i in 0..<x.count { diff |= x[i] ^ y[i] }
    return diff == 0
  }
}
