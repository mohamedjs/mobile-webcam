import CoreMediaIO
import Foundation

/// Publishes the single "webcamo" device to the system.
final class WebcamoProviderSource: NSObject, CMIOExtensionProviderSource {

  private(set) var provider: CMIOExtensionProvider!
  private var deviceSource: WebcamoDeviceSource!

  init(clientQueue: DispatchQueue?) {
    super.init()

    provider = CMIOExtensionProvider(source: self, clientQueue: clientQueue)
    deviceSource = WebcamoDeviceSource(localizedName: "webcamo")

    do {
      try provider.addDevice(deviceSource.device)
    } catch {
      fatalError("failed to add device: \(error.localizedDescription)")
    }
  }

  func connect(to client: CMIOExtensionClient) throws {
    // Any client may connect.
  }

  func disconnect(from client: CMIOExtensionClient) {}

  var availableProperties: Set<CMIOExtensionProperty> {
    [.providerManufacturer]
  }

  func providerProperties(
    forProperties properties: Set<CMIOExtensionProperty>
  ) throws -> CMIOExtensionProviderProperties {
    let props = CMIOExtensionProviderProperties(dictionary: [:])
    if properties.contains(.providerManufacturer) {
      props.manufacturer = "mobile_webcam"
    }
    return props
  }

  func setProviderProperties(_ providerProperties: CMIOExtensionProviderProperties) throws {}
}
