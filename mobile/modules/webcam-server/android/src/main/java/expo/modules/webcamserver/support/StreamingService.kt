package expo.modules.webcamserver.support

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/**
 * Keeps the camera alive while the app is in the background.
 *
 * Android stops camera access for background apps unless a foreground service
 * of type "camera" is running, which is why streaming used to stop as soon as
 * the user switched apps or the screen turned off. The service holds a partial
 * wake lock too, so the CPU keeps encoding with the screen off.
 */
class StreamingService : Service() {

  private var wakeLock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = buildNotification()
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
    } catch (e: Exception) {
      // E.g. started while the app was already in the background on Android 14+.
      Log.warn("could not start the foreground service: ${e.message}")
      stopSelf()
      return START_NOT_STICKY
    }

    if (wakeLock == null) {
      val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager
      wakeLock = pm?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "webcamo:streaming")?.apply {
        setReferenceCounted(false)
        acquire()
      }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    try { wakeLock?.release() } catch (_: Exception) {}
    wakeLock = null
    super.onDestroy()
  }

  private fun buildNotification(): Notification {
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (manager.getNotificationChannel(CHANNEL_ID) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Streaming", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while Webcamo is sending the camera to your computer"
          setShowBadge(false)
        }
      )
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val pending = launch?.let {
      android.app.PendingIntent.getActivity(
        this, 0, it,
        android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
      )
    }
    return Notification.Builder(this, CHANNEL_ID)
      .setContentTitle("Webcamo is streaming")
      .setContentText("Your camera is being sent to the computer over USB.")
      .setSmallIcon(android.R.drawable.ic_menu_camera)
      .setOngoing(true)
      .apply { if (pending != null) setContentIntent(pending) }
      .build()
  }

  companion object {
    private const val CHANNEL_ID = "webcamo_streaming"
    private const val NOTIFICATION_ID = 4108

    fun start(context: Context) {
      try {
        context.startForegroundService(Intent(context, StreamingService::class.java))
      } catch (e: Exception) {
        Log.warn("could not start the streaming service: ${e.message}")
      }
    }

    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, StreamingService::class.java))
      } catch (_: Exception) {}
    }
  }
}
