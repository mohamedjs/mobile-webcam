package expo.modules.webcamserver.server

import expo.modules.webcamserver.encoding.MJPEGEncoder
import expo.modules.webcamserver.support.Log
import expo.modules.webcamserver.support.Telemetry
import java.io.InputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

interface HTTPServerDelegate {
  fun handleRequest(server: HTTPServer, request: HTTPRequest): HTTPResponse
  fun openStream(server: HTTPServer, profile: String, connection: StreamConnection): Boolean
  fun serverDidChangeClients(server: HTTPServer, count: Int)
}

class HTTPServer {
  var delegate: HTTPServerDelegate? = null
  private var serverSocket: ServerSocket? = null
  private val executor = Executors.newCachedThreadPool()
  private val streams = ConcurrentHashMap<String, StreamConnection>()
  private var running = false

  val isRunning: Boolean
    get() = running && serverSocket?.isBound == true && serverSocket?.isClosed == false

  val clientCount: Int
    get() = streams.size

  fun start(port: Int) {
    stop()
    try {
      // Loopback only. `adb forward` delivers to the device's localhost, so USB
      // keeps working, and with auth disabled for USB this is what stops anyone
      // on the same Wi-Fi from opening the camera stream.
      val socket = ServerSocket(port, 50, InetAddress.getLoopbackAddress())
      serverSocket = socket
      running = true
      Log.info("HTTPServer listening on port $port")

      executor.submit {
        while (running && !socket.isClosed) {
          try {
            val client = socket.accept()
            executor.submit { handleClient(client) }
          } catch (_: Exception) {
            break
          }
        }
      }
    } catch (e: Exception) {
      Log.error("HTTPServer failed to bind port $port: ${e.message}")
      throw e
    }
  }

  fun stop() {
    running = false
    try {
      serverSocket?.close()
    } catch (_: Exception) {}
    serverSocket = null

    for ((_, stream) in streams) {
      stream.close("server stopping")
    }
    streams.clear()
    Telemetry.shared.setClientsCount(0)
  }

  fun broadcast(data: ByteArray, isInit: Boolean = false) {
    for ((_, stream) in streams) {
      if (stream.profile != "mjpeg") {
        stream.send(data, isInit)
      }
    }
  }

  fun broadcastMJPEG(jpeg: ByteArray) {
    val partHeader = MJPEGEncoder.partHeader(jpeg.size)
    val payload = ByteArray(partHeader.size + jpeg.size + 2)
    System.arraycopy(partHeader, 0, payload, 0, partHeader.size)
    System.arraycopy(jpeg, 0, payload, partHeader.size, jpeg.size)
    payload[payload.size - 2] = '\r'.code.toByte()
    payload[payload.size - 1] = '\n'.code.toByte()

    for ((_, stream) in streams) {
      if (stream.profile == "mjpeg") {
        stream.send(payload)
      }
    }
  }

  private fun handleClient(socket: Socket) {
    try {
      socket.tcpNoDelay = true
      val input: InputStream = socket.getInputStream()
      val buffer = ByteArray(64 * 1024)
      var totalRead = 0

      while (totalRead < buffer.size) {
        val read = input.read(buffer, totalRead, buffer.size - totalRead)
        if (read <= 0) break
        totalRead += read

        val parseResult = HTTPRequest.parse(buffer.copyOfRange(0, totalRead))
        if (parseResult != null) {
          val (request, _) = parseResult
          route(request, socket)
          return
        }
      }
      socket.close()
    } catch (e: Exception) {
      Log.debug("handleClient error: ${e.message}")
      try { socket.close() } catch (_: Exception) {}
    }
  }

  private fun route(request: HTTPRequest, socket: Socket) {
    val d = delegate ?: run {
      socket.close()
      return
    }

    val isStream = request.path == "/stream.mp4" || request.path == "/stream.mjpeg"
    if (isStream) {
      val profile = if (request.path == "/stream.mjpeg") "mjpeg" else "fmp4"
      val id = UUID.randomUUID().toString()

      // Displace existing clients for the new one (single client model)
      for ((oldId, oldStream) in streams) {
        Log.info("displacing client $oldId for new connection $id")
        oldStream.close("replaced by a new client")
      }
      streams.clear()

      val stream = StreamConnection(id, profile, socket)
      stream.onClose = { closedId, reason ->
        streams.remove(closedId)
        val count = clientCount
        Telemetry.shared.setClientsCount(count)
        d.serverDidChangeClients(this, count)
        Log.info("client $closedId closed: $reason")
      }

      if (!d.openStream(this, profile, stream)) {
        val err = HTTPResponse.error("capture_failed", "Camera is not running", 409)
        socket.getOutputStream().write(err.serialize())
        socket.getOutputStream().flush()
        socket.close()
        return
      }

      streams[id] = stream
      val count = clientCount
      Telemetry.shared.setClientsCount(count)
      d.serverDidChangeClients(this, count)
      return
    }

    val response = d.handleRequest(this, request)
    val out = socket.getOutputStream()
    out.write(response.serialize())
    out.flush()
    socket.close()
  }
}
