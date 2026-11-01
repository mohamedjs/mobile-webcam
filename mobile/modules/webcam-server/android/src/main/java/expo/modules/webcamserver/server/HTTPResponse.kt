package expo.modules.webcamserver.server

import org.json.JSONObject
import java.nio.charset.StandardCharsets

data class HTTPResponse(
  val status: Int,
  val headers: Map<String, String>,
  val body: ByteArray
) {
  fun serialize(): ByteArray {
    val reason = reasons[status] ?: "OK"
    val allHeaders = headers.toMutableMap()
    allHeaders["Connection"] = "close"
    if (!allHeaders.containsKey("Content-Length")) {
      allHeaders["Content-Length"] = body.size.toString()
    }

    val headBuilder = StringBuilder()
    headBuilder.append("HTTP/1.1 ").append(status).append(" ").append(reason).append("\r\n")
    for ((k, v) in allHeaders) {
      headBuilder.append(k).append(": ").append(v).append("\r\n")
    }
    headBuilder.append("\r\n")

    val headBytes = headBuilder.toString().toByteArray(StandardCharsets.ISO_8859_1)
    val result = ByteArray(headBytes.size + body.size)
    System.arraycopy(headBytes, 0, result, 0, headBytes.size)
    System.arraycopy(body, 0, result, headBytes.size, body.size)
    return result
  }

  companion object {
    private val reasons = mapOf(
      200 to "OK",
      204 to "No Content",
      400 to "Bad Request",
      401 to "Unauthorized",
      403 to "Forbidden",
      404 to "Not Found",
      409 to "Conflict",
      500 to "Internal Server Error"
    )

    fun json(obj: Any, status: Int = 200): HTTPResponse {
      val jsonStr = when (obj) {
        is JSONObject -> obj.toString()
        is Map<*, *> -> JSONObject(obj).toString()
        else -> obj.toString()
      }
      val bytes = jsonStr.toByteArray(StandardCharsets.UTF_8)
      return HTTPResponse(
        status = status,
        headers = mapOf(
          "Content-Type" to "application/json",
          "Content-Length" to bytes.size.toString()
        ),
        body = bytes
      )
    }

    fun error(code: String, message: String, status: Int, field: String? = null): HTTPResponse {
      val payload = mutableMapOf<String, Any>("error" to code, "message" to message)
      if (field != null) payload["field"] = field
      return json(payload, status)
    }

    fun noContent(): HTTPResponse = HTTPResponse(204, emptyMap(), ByteArray(0))

    fun streamHeader(contentType: String): ByteArray {
      val head = "HTTP/1.1 200 OK\r\n" +
        "Content-Type: $contentType\r\n" +
        "Cache-Control: no-store, no-cache\r\n" +
        "Connection: close\r\n\r\n"
      return head.toByteArray(StandardCharsets.ISO_8859_1)
    }
  }
}
