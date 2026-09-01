import SwiftUI

@main
struct WebcamoApp: App {
  var body: some Scene {
    WindowGroup("webcamo") {
      ContentView()
        .frame(width: 460, height: 320)
    }
    .windowResizability(.contentSize)
  }
}
