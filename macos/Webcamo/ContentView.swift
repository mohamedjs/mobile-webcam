import SwiftUI

struct ContentView: View {
  @StateObject private var manager = ExtensionManager()
  @State private var phoneReachable: Bool?

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("webcamo").font(.largeTitle.bold())
      Text("Turns the iPhone into a system camera for Meet, Zoom and OBS.")
        .foregroundStyle(.secondary)

      Divider()

      HStack(spacing: 8) {
        Circle()
          .fill(phoneReachable == true ? .green : .red)
          .frame(width: 10, height: 10)
        Text(phoneStatus).font(.callout)
      }

      Text(manager.status)
        .font(.callout)
        .foregroundStyle(.secondary)
        .fixedSize(horizontal: false, vertical: true)

      Spacer()

      HStack {
        Button("Install camera") { manager.install() }
          .buttonStyle(.borderedProminent)
          .disabled(manager.busy)
        Button("Remove") { manager.uninstall() }
          .disabled(manager.busy)
        Spacer()
        Button("Check phone") { checkPhone() }
      }
    }
    .padding(20)
    .onAppear(perform: checkPhone)
  }

  private var phoneStatus: String {
    switch phoneReachable {
    case true: "Phone reachable on 127.0.0.1:8080"
    case false: "Phone not reachable — start the desktop service and tap Start server"
    default: "Checking…"
    }
  }

  /// The phone is only reachable while the desktop service holds the iproxy
  /// tunnel open, so this doubles as a check that the service is running.
  private func checkPhone() {
    var request = URLRequest(url: URL(string: "http://127.0.0.1:8080/health")!)
    request.timeoutInterval = 3
    URLSession.shared.dataTask(with: request) { data, response, _ in
      let ok = (response as? HTTPURLResponse)?.statusCode == 200 && data != nil
      DispatchQueue.main.async { phoneReachable = ok }
    }.resume()
  }
}
