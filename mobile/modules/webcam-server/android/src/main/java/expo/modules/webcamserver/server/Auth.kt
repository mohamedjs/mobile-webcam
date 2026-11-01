package expo.modules.webcamserver.server

class Auth(private val token: String = "") {
  companion object {
    val openPaths = setOf("/health")
  }

  fun authorize(request: HTTPRequest): HTTPResponse? {
    // Over USB cable (adb forward or iproxy), accept all requests
    return null
  }
}
