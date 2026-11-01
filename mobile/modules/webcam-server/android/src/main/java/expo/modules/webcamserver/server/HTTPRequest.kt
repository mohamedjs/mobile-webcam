package expo.modules.webcamserver.server

import org.json.JSONObject
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

data class HTTPRequest(
  val method: String,
  val path: String,
  val query: Map<String, String>,
  val headers: Map<String, String>,
  val body: ByteArray
) {
  val bearerToken: String?
    get() {
      val auth = headers["authorization"] ?: return null
      return if (auth.startsWith("Bearer ", ignoreCase = true)) {
        auth.substring(7).trim()
      } else null
    }

  val isLoopbackHost: Boolean
    get() {
      val host = headers["host"]?.lowercase() ?: return true
      return host.startsWith("127.0.0.1") || host.startsWith("localhost") || host.startsWith("[::1]")
    }

  val jsonObject: JSONObject?
    get() = try {
      if (body.isNotEmpty()) JSONObject(String(body, StandardCharsets.UTF_8)) else null
    } catch (_: Exception) {
      null
    }

  companion object {
    fun parse(data: ByteArray): Pair<HTTPRequest, Int>? {
      val str = String(data, StandardCharsets.ISO_8859_1)
      val headerEnd = str.indexOf("\r\n\r\n")
      if (headerEnd == -1) return null

      val head = str.substring(0, headerEnd)
      val lines = head.split("\r\n").filter { it.isNotEmpty() }
      if (lines.isEmpty()) return null

      val requestLine = lines[0].split(" ")
      if (requestLine.size < 2) return null
      val method = requestLine[0].uppercase()
      val fullTarget = requestLine[1]

      val headers = mutableMapOf<String, String>()
      for (i in 1 until lines.size) {
        val line = lines[i]
        val colon = line.indexOf(':')
        if (colon != -1) {
          val k = line.substring(0, colon).trim().lowercase()
          val v = line.substring(colon + 1).trim()
          headers[k] = v
        }
      }

      val parts = fullTarget.split("?", limit = 2)
      val path = parts[0]
      val query = mutableMapOf<String, String>()
      if (parts.size > 1) {
        for (pair in parts[1].split("&")) {
          val kv = pair.split("=", limit = 2)
          if (kv.size == 2) {
            query[kv[0]] = try {
              URLDecoder.decode(kv[1], "UTF-8")
            } catch (_: Exception) {
              kv[1]
            }
          }
        }
      }

      val contentLength = headers["content-length"]?.toIntOrNull() ?: 0
      val bodyStart = headerEnd + 4
      val available = data.size - bodyStart
      if (available < contentLength) return null

      val body = if (contentLength > 0) {
        data.copyOfRange(bodyStart, bodyStart + contentLength)
      } else {
        ByteArray(0)
      }

      return Pair(HTTPRequest(method, path, query, headers, body), bodyStart + contentLength)
    }
  }
}
