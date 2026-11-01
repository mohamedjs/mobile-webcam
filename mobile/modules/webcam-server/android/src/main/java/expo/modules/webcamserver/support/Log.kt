package expo.modules.webcamserver.support

import android.util.Log as AndroidLog

object Log {
  private const val TAG = "webcam-server"

  fun debug(message: String) { AndroidLog.d(TAG, message) }
  fun info(message: String)  { AndroidLog.i(TAG, message) }
  fun warn(message: String)  { AndroidLog.w(TAG, message) }
  fun error(message: String) { AndroidLog.e(TAG, message) }
}
