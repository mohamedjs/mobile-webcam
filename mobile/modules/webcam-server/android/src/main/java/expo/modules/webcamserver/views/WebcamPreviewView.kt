package expo.modules.webcamserver.views

import android.content.Context
import android.graphics.SurfaceTexture
import android.view.TextureView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import expo.modules.webcamserver.capture.CaptureSessionController

class WebcamPreviewView(context: Context, appContext: AppContext) : ExpoView(context, appContext), TextureView.SurfaceTextureListener {

  private val textureView = TextureView(context)
  var resizeMode: String = "fill"

  init {
    textureView.surfaceTextureListener = this
    addView(textureView)
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    textureView.layout(0, 0, right - left, bottom - top)
  }

  override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
    CaptureSessionController.sharedCapture?.attachPreviewTexture(surface, width, height)
  }

  override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {}

  override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
    CaptureSessionController.sharedCapture?.detachPreview()
    return true
  }

  override fun onSurfaceTextureUpdated(surface: SurfaceTexture) {}
}
