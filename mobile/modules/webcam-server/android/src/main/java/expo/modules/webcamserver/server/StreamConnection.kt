package expo.modules.webcamserver.server

import android.os.SystemClock
import expo.modules.webcamserver.support.Log
import expo.modules.webcamserver.support.Telemetry
import java.io.OutputStream
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

class StreamConnection(
  val id: String,
  val profile: String,
  private val socket: Socket
) {
  private val executor = Executors.newSingleThreadExecutor()
  private val outputStream: OutputStream = socket.getOutputStream()
  private val inFlight = AtomicBoolean(false)
  private var inFlightSince: Long = 0L
  private var closed = false
  private var sentInitSegment = false

  var onClose: ((String, String) -> Unit)? = null

  fun sendHeader(contentType: String) {
    write(HTTPResponse.streamHeader(contentType), force = true)
  }

  fun send(data: ByteArray, isInit: Boolean = false) {
    if (isInit) {
      if (sentInitSegment) return
      sentInitSegment = true
      write(data, force = true)
      return
    }
    if (!sentInitSegment && profile != "mjpeg") return
    write(data, force = false)
  }

  private fun write(data: ByteArray, force: Boolean) {
    if (closed) return

    if (inFlight.get() && !force) {
      val now = SystemClock.elapsedRealtime()
      if (inFlightSince > 0 && now - inFlightSince > 10000) {
        Log.warn("write stalled for >10s; treating client $id as dead")
        close("write stalled")
        return
      }
      Telemetry.shared.recordDroppedSegment()
      return
    }

    inFlight.set(true)
    inFlightSince = SystemClock.elapsedRealtime()

    executor.submit {
      try {
        if (!socket.isClosed) {
          outputStream.write(data)
          outputStream.flush()
        }
      } catch (e: Exception) {
        Log.debug("stream write failed: ${e.message}")
        close("write failed: ${e.message}")
      } finally {
        inFlight.set(false)
        inFlightSince = 0L
      }
    }
  }

  fun close(reason: String) {
    synchronized(this) {
      if (closed) return
      closed = true
    }
    try {
      socket.close()
    } catch (_: Exception) {}
    executor.shutdownNow()
    onClose?.invoke(id, reason)
  }
}
