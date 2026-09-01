# 09 — The Native Module: How Swift Reaches JavaScript

What `modules/webcam-server/` is, how it gets compiled, how JavaScript calls into
it, and what actually happens at runtime.

---

## 1. Why a native module exists at all

React Native runs JavaScript. This project needs three things JavaScript cannot do:

1. **Open a listening TCP socket.** JS has no socket server. `NWListener` does.
2. **Drive `AVCaptureSession` directly** — set Cinematic on the device input,
   select specific lenses, attach an `AVAssetWriter` to the session outputs.
3. **Keep camera frames out of JavaScript entirely.** A 1080p30 stream is
   ~62 million pixels per second. Copying that across the JS bridge — or encoding
   in JS — cannot work. Frames go camera → encoder → socket without JavaScript
   ever seeing one.

So the app is split:

```
JavaScript  →  what the user sees and taps: preview, sliders, screens
Swift       →  capture, hardware encode, HTTP server, the entire media path
```

JavaScript sends **commands** ("use 1080p", "enable Cinematic") and receives
**events** ("a client connected", "fps is 29.8"). It never touches a frame.

---

## 2. The three files that wire it together

### 2.1 `expo-module.config.json` — the declaration

```json
{
  "platforms": ["apple"],
  "apple": { "modules": ["WebcamServerModule"] }
}
```

This is what makes the folder a module rather than a folder of Swift files. At
build time `expo-modules-autolinking` scans `node_modules` **and the app's own
`modules/` directory**, finds every `expo-module.config.json`, and reads which
Swift classes to register. `WebcamServerModule` here must match the Swift class
name exactly.

### 2.2 `ios/WebcamServer.podspec` — the compiler instructions

```ruby
s.platforms    = { :ios => '16.0' }
s.dependency   'ExpoModulesCore'
s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
```

CocoaPods reads this to build the Swift into a static framework linked into the
app. `source_files` is a glob — new `.swift` files anywhere under `ios/` are
picked up automatically, no project file to edit.

`ios: 16.0` sets the floor. Anything newer must be runtime-gated (§6).

### 2.3 `plugin/index.ts` — the Info.plist writer

`expo prebuild` regenerates the entire `ios/` project from `app.config.ts`, so
hand-edited Info.plist changes are destroyed on every prebuild. A config plugin
is code that re-applies them each time:

```ts
const withWebcamServer: ConfigPlugin = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults['NSLocalNetworkUsageDescription'] ??= '...';
    ...
  });
```

**`NSLocalNetworkUsageDescription` is the single most important line in this
project.** Binding a TCP listener triggers iOS's Local Network permission —
even over USB. Without the key, iOS never shows the prompt, `NWListener` fails to
bind, the app looks healthy, and the desktop sees only `Connection reset by peer`.

---

## 3. What happens when you compile

```
   app.config.ts + plugin/index.ts
              │
              │  npx expo prebuild --clean
              ▼
   ios/  ← generated Xcode project, Info.plist, Podfile
              │
              │  pod install  (runs automatically)
              │  expo-modules-autolinking scans for expo-module.config.json
              ▼
   Podfile.lock now includes the local WebcamServer pod
              │
              │  xcodebuild
              ▼
   Swift compiler reads WebcamServer.podspec's source_files
   → typechecks all 19 .swift files
   → links against ExpoModulesCore, AVFoundation, Network, Vision, CoreImage
   → produces a static framework inside the .app
              │
              ▼
   .ipa  →  installed on the phone
```

Four things worth understanding about this pipeline:

**`prebuild --clean` deletes and regenerates `ios/`.** That is why `ios/` is
gitignored and why every Info.plist key lives in a plugin. Never edit the
generated project.

**Autolinking is why there is no manual registration.** You do not import the
module anywhere in JS setup code, do not edit a bridging header, and do not add
files to an Xcode target. The config file is the entire registration.

**The Swift compiler runs here for the first time.** Everything in this repo has
been checked only statically on Linux — brace balance and import placement, which
catch nothing real. Expect diagnostics on the first build. The likeliest are
`CinematicController` (KVC against iOS 26 APIs) and
`CMSampleBuffer.replacingImageBuffer`.

**JS changes do not need a rebuild; Swift changes do.** After the first build,
`npx expo start --dev-client` hot-reloads JavaScript over the network. Touch any
`.swift` file and you must rebuild the app.

---

## 4. How a JavaScript call reaches Swift

### 4.1 The Swift side declares its surface

```swift
public final class WebcamServerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WebcamServer")                          // ← the lookup key

    Events("onClientConnected", "onTelemetry", …) // ← Swift → JS

    AsyncFunction("startServer") { (port: Int, token: String) -> [String: Any] in
      …
    }

    View(WebcamPreviewView.self) { … }            // ← a native UIView
  }
}
```

`definition()` is a DSL, not ordinary code. Expo evaluates it once at startup to
build a registry of names, argument types, and return types.

### 4.2 The JavaScript side looks it up by name

```ts
export const WebcamServer = requireNativeModule<WebcamServerAPI>('WebcamServer');
```

The string must equal `Name("WebcamServer")`. There is no compile-time link
between them — a typo is a runtime crash, not a build error.

### 4.3 The view has a name trap worth knowing

`View(WebcamPreviewView.self)` inside a module registers the view under the
**module's** name, not the Swift class name:

```ts
// correct — the MODULE name
requireNativeViewManager('WebcamServer')

// wrong — throws "view manager not found" at runtime, blank preview
requireNativeViewManager('WebcamPreview')
```

This project hit exactly that bug. If your preview is blank, check this first.

### 4.4 What happens on a single call

```
JS:  await WebcamServer.updateSettings({ fps: 60 })
      │
      │  ExpoModulesCore converts the JS object to Swift types
      │  using the closure's declared signature
      ▼
Swift: the AsyncFunction closure runs on a background queue
      │  validates against real device capabilities
      │  applies to AVCaptureSession
      │  returns [String: Any]
      ▼
      │  ExpoModulesCore converts back to a JS object
      ▼
JS:  the Promise resolves with the FULL effective settings
```

Two rules the codebase follows here:

**`AsyncFunction` for anything touching hardware.** `Function` runs synchronously
on the JS thread; reconfiguring a capture session there freezes the UI.

**Always return the full effective state, never void.** The phone is the
authority on what was actually applied — a requested 4K60 can come back as 4K30
because the hardware refused. The JS store writes what came back, never the
optimistic local value.

### 4.5 Events flow the other way

```swift
sendEvent("onClientConnected", ["clientId": id, "profile": profile])
```

```ts
WebcamServer.addListener('onClientConnected', (payload) => { … });
```

Every event name must appear in the `Events(...)` list or `sendEvent` is a no-op.
Events are how Swift tells JS about things JS did not ask for: a client
connecting, telemetry ticking, the device overheating.

---

## 5. The runtime picture

```
        ┌─────────────── JavaScript ────────────────┐
        │  screens, zustand stores, sliders          │
        │      │ commands              ▲ events      │
        └──────┼───────────────────────┼─────────────┘
               ▼                       │
        ┌──────────── WebcamServerModule ───────────┐
        │  the only class JS can see                 │
        └──┬──────────────────┬─────────────────┬────┘
           ▼                  ▼                 ▼
   CaptureSessionController  HTTPServer     SettingsStore
           │                  │
   ┌───────┴────────┐         │
   ▼                ▼         ▼
AVCaptureSession  FragmentedMP4Writer → StreamConnection → the cable
   │                                          ▲
   └── AVCaptureVideoPreviewLayer ────────────┘
        (WebcamPreviewView — same session, no second capture)
```

The frame path, end to end, entirely inside Swift:

```
camera sensor
  → AVCaptureVideoDataOutput      (CVPixelBuffer)
  → [optional blur: CoreImage/Vision, Metal-backed]
  → AVAssetWriter                 (VideoToolbox hardware H.264 + AAC)
  → AVAssetWriterDelegate         (fMP4 segments, in memory, ~200 ms each)
  → StreamConnection.send()       (NWConnection, back-pressure aware)
  → USB cable
  → iproxy on the laptop
  → ffmpeg
  → /dev/video9
```

JavaScript appears nowhere in that chain. That is the design, not an optimisation.

### 5.1 Why the preview does not need a second session

`WebcamPreviewView` attaches an `AVCaptureVideoPreviewLayer` to the **same**
`AVCaptureSession` that is being encoded, reached through one shared static:

```swift
static private(set) var sharedCapture: CaptureSessionController?
```

Two `AVCaptureSession` instances contending for one camera fail at runtime. This
is also why `react-native-vision-camera` is not used — it owns its own session.

### 5.2 Back-pressure, and why it matters more than it sounds

`StreamConnection` writes with `NWConnection.send(completion:)`. If the previous
write has not completed, the new segment is **dropped**:

```swift
if self.inFlight && !force {
  Telemetry.shared.recordDroppedSegment()
  return
}
```

A phone has no swap. Queueing segments for a consumer that fell behind is an
out-of-memory crash within a minute. Dropping is correct — a dropped 200 ms
segment is invisible, a crash is not.

The initialisation segment is the one exception (`force: true`): a client that
misses it can never decode anything that follows.

---

## 6. Runtime gating for newer iOS APIs

The deployment target is iOS 16, but Cinematic capture needs iOS 26. Two layers
of guard:

```swift
guard #available(iOS 26.0, *) else { return false }
guard input.responds(to: NSSelectorFromString("setCinematicVideoCaptureEnabled:")) else {
  return false
}
input.setValue(enabled, forKey: "cinematicVideoCaptureEnabled")
```

`#available` handles the OS version. The `responds(to:)` check handles the case
where the OS is new enough but the *hardware* is not.

KVC (`setValue(forKey:)`) is used rather than the typed property so the code
compiles against older SDKs. If you build with an SDK that has the real API, this
can become a direct property access — and should, since KVC has no compile-time
checking.

**Never gate on a hardcoded device list.** An iPhone SE has one rear lens, a
15 Pro has three; capability is always discovered at runtime.

---

## 7. Adding to the module

**A new Swift file:** drop it under `ios/`. The podspec glob finds it. Rebuild.

**A new function JS can call:**

```swift
AsyncFunction("myThing") { (arg: String) -> [String: Any] in … }
```

then add it to the `WebcamServerAPI` interface in
`mobile/src/native/WebcamServer.ts`. Nothing enforces that those two agree —
keeping them in sync is manual.

**A new event:** add the name to `Events(...)` *and* call `sendEvent` with it.
Missing from the list means silently no-op.

**A new Info.plist key:** add it to `plugin/index.ts`. Editing the generated
`ios/` directory is pointless — the next prebuild deletes it.

---

## 8. Debugging

| Symptom | Cause |
|---|---|
| `Cannot find native module 'WebcamServer'` | Running in Expo Go, or the app was not rebuilt after adding the module |
| `View manager not found` / blank preview | `requireNativeViewManager` name ≠ the module's `Name()` — §4.3 |
| Server never binds, no error on the phone | Local Network permission denied — the defining failure of this project |
| Swift changes have no effect | JS hot-reloads; Swift does not. Rebuild. |
| Works in the simulator, fails on device | The simulator has no camera. Always test on hardware. |

Swift logs go to the unified log, not the Metro console:

```bash
# on a Mac, with the phone connected
xcrun devicectl device console --device <udid> | grep webcam-server
```

`Log.swift` writes under subsystem `com.mobilewebcam.app`, category
`webcam-server`.
