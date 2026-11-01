package expo.modules.webcamserver.encoding

import android.graphics.ImageFormat
import android.graphics.Rect
import android.graphics.YuvImage
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets

object MJPEGEncoder {
  const val BOUNDARY = "mobilewebcamframe"

  fun partHeader(length: Int): ByteArray {
    val header = "--$BOUNDARY\r\nContent-Type: image/jpeg\r\nContent-Length: $length\r\n\r\n"
    return header.toByteArray(StandardCharsets.ISO_8859_1)
  }

  fun compressNv21(nv21: ByteArray, width: Int, height: Int, quality: Int = 70): ByteArray? {
    return try {
      val yuvImage = YuvImage(nv21, ImageFormat.NV21, width, height, null)
      val out = ByteArrayOutputStream()
      yuvImage.compressToJpeg(Rect(0, 0, width, height), quality, out)
      out.toByteArray()
    } catch (_: Exception) {
      null
    }
  }
}
