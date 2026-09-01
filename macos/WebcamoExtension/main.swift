import CoreMediaIO
import Foundation

// Entry point for the camera extension process. macOS launches this on demand
// inside the client app (Meet, Zoom, OBS) whenever the camera is opened.
let providerSource = WebcamoProviderSource(clientQueue: nil)
CMIOExtensionProvider.startService(provider: providerSource.provider)
CFRunLoopRun()
