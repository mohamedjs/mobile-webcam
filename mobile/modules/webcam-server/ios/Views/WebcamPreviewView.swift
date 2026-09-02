import AVFoundation
import ExpoModulesCore
import UIKit

/// AVCaptureVideoPreviewLayer wrapped as an ExpoView.
///
/// The preview is a layer on the SAME session that is being encoded — no second
/// session, no frames crossing into JavaScript.
final class WebcamPreviewView: ExpoView {
  private let previewLayer = AVCaptureVideoPreviewLayer()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    attachSession()
  }

  var resizeMode: String = "fill" {
    didSet {
      previewLayer.videoGravity = resizeMode == "fit" ? .resizeAspect : .resizeAspectFill
    }
  }

  func attachSession() {
    if let session = WebcamServerModule.sharedCapture?.session {
      previewLayer.session = session
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // The layer is not in the auto-layout system; size it by hand.
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    previewLayer.frame = bounds
    CATransaction.commit()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { attachSession() }
  }
}
