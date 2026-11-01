package expo.modules.webcamserver.capture

class BlurRenderer {
  var isEnabled: Boolean = false
  var intensity: Float = 0.6f

  fun applyBlur(enabled: Boolean, intensityVal: Float) {
    this.isEnabled = enabled
    this.intensity = intensityVal
  }
}
