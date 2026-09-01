import Foundation
import SystemExtensions

/// Installs and activates the camera extension.
///
/// macOS only accepts a system extension from an app in /Applications, and the
/// user must approve it once in System Settings → General → Login Items &
/// Extensions. Neither step can be done for them.
final class ExtensionManager: NSObject, ObservableObject, OSSystemExtensionRequestDelegate {

  @Published var status: String = "Not installed"
  @Published var busy = false

  private let identifier = "com.mobilewebcam.app.extension"

  func install() {
    busy = true
    status = "Requesting activation…"

    let request = OSSystemExtensionRequest.activationRequest(
      forExtensionWithIdentifier: identifier,
      queue: .main
    )
    request.delegate = self
    OSSystemExtensionManager.shared.submitRequest(request)
  }

  func uninstall() {
    busy = true
    status = "Removing…"

    let request = OSSystemExtensionRequest.deactivationRequest(
      forExtensionWithIdentifier: identifier,
      queue: .main
    )
    request.delegate = self
    OSSystemExtensionManager.shared.submitRequest(request)
  }

  // MARK: - OSSystemExtensionRequestDelegate

  func request(
    _ request: OSSystemExtensionRequest,
    actionForReplacingExtension existing: OSSystemExtensionProperties,
    withExtension ext: OSSystemExtensionProperties
  ) -> OSSystemExtensionRequest.ReplacementAction {
    .replace
  }

  func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
    status = "Approve it in System Settings → General → Login Items & Extensions → Camera Extensions"
  }

  func request(_ request: OSSystemExtensionRequest, didFinishWithResult result: OSSystemExtensionRequest.Result) {
    busy = false
    switch result {
    case .completed:
      status = "Installed — pick “webcamo” as your camera"
    case .willCompleteAfterReboot:
      status = "Installed — restart to finish"
    @unknown default:
      status = "Finished"
    }
  }

  func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
    busy = false
    status = "Failed: \(error.localizedDescription)"
  }
}
