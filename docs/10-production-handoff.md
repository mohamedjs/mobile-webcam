# 10 — Production Handoff Specification: Cross-Platform Desktop App, Android Native Module, Expo SDK 58 & Landing Page (Lura Reference Architecture)

> **Target Audience:** The next engineering AI agent executing the production transformation of `mobile_webcam` (`webcamo`).
> **Reference Codebase:** `/var/www/html/lura` (Repo: `mohamedjs/lura`) — read its `site/`, `packaging/`, `.github/workflows/`, and `src/lura/modules/dashboard/window.py` directly when implementing.
> **Target Codebase:** `/var/www/html/old/mobile_webcam` (Repo: `mohamedjs/mobile-webcam`).

---

## 0. Executive Summary & Architectural Goals

`mobile_webcam` (`webcamo`) currently supports **iOS (Expo 56, Swift native module)** streaming over USB to a **Linux-only Node.js server** that exposes a web control UI at `http://127.0.0.1:47800`.

To make `webcamo` production-ready and match the quality, distribution, and UX of **Lura** (`/var/www/html/lura`), the next AI agent must execute **four workstreams**:

1. **Workstream 1 — Upgrade Mobile App to Expo SDK 58 (`~58.0.22`):** Update `mobile/package.json`, `mobile/app.config.ts`, and all dependencies to the exact versions bundled with Expo SDK 58 (React `19.3.0`, React Native `0.88.1`).
2. **Workstream 2 — Android Native Module (`mobile/modules/webcam-server/android/`) & ADB USB Transport:** Build a Kotlin Expo Module with full feature and wire-protocol parity with `mobile/modules/webcam-server/ios/` (Camera2 API + `AudioRecord` + hardware `MediaCodec` H.264/AAC → in-memory fMP4 muxer + MJPEG fallback + local HTTP/1.1 server on port `8080` + `TextureView` preview). Add Android USB discovery & tunneling via `adb forward tcp:8080 tcp:8080` alongside iOS `iproxy`.
3. **Workstream 3 — Server Website → Native Cross-Platform Desktop App (Linux, macOS, Windows):** Transform `server/` so that:
   - Like Lura (`src/lura/modules/dashboard/window.py`), the control UI opens in a **dedicated native desktop window** (with chromeless `--app=` / WebView2 / WKWebView / WebKitGTK and automatic crash-reap fallback) rather than requiring the user to open a browser tab.
   - The server abstracts OS-specific device discovery (`usbmuxd` + `adb`), USB tunneling (`iproxy` + `adb forward`), virtual camera output (Linux `v4l2loopback`, macOS Camera Extension / OBS Virtual Camera, Windows DirectShow / OBS VirtualCam), and virtual audio output (Linux PipeWire `pactl`, macOS BlackHole, Windows VB-Cable).
   - Desktop packaging & GitHub Actions release pipeline (`packaging/`, `.github/workflows/release.yml`) produces `.deb` + `.tar.gz` (Linux), `.app` zips + Homebrew cask (macOS arm64 & x86_64), and Inno Setup `Webcamo-Setup-<v>.exe` + portable `.zip` (Windows), plus Android `.apk`.
4. **Workstream 4 — Production Landing Page (`site/` + `.github/workflows/pages.yml`):** Port Lura's static landing page (`site/index.html`, `site/site.css`, `site/site.js`, `site/build.sh`) to `mobile_webcam`, keeping bilingual EN/AR support, light/dark/auto theme, OS auto-detection, live GitHub Release asset binding (`release.json` + GitHub API fallback), SHA256 checksums, and adding mobile app downloads (Android `.apk` + iOS build instructions).

---

## 1. Workstream 1: Upgrade Mobile App to Expo SDK 58

### 1.1 Exact Package Versions (Verified against `expo@58.0.22/bundledNativeModules.json`)

Replace `/var/www/html/old/mobile_webcam/mobile/package.json` with the following SDK 58 configuration:

```json
{
  "name": "webcamo",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "start": "expo start --dev-client",
    "prebuild": "expo prebuild --clean",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "typecheck": "tsc --noEmit",
    "lint": "eslint ."
  },
  "dependencies": {
    "@expo/vector-icons": "^15.0.2",
    "@react-native-async-storage/async-storage": "2.2.0",
    "expo": "~58.0.22",
    "expo-build-properties": "~58.0.12",
    "expo-constants": "~58.0.14",
    "expo-dev-client": "~58.0.18",
    "expo-keep-awake": "~58.0.3",
    "expo-linking": "~58.0.15",
    "expo-router": "~58.0.29",
    "expo-secure-store": "~58.0.2",
    "expo-splash-screen": "~58.0.12",
    "expo-status-bar": "~58.0.4",
    "lucide-react-native": "^1.38.0",
    "react": "19.3.0",
    "react-native": "0.88.1",
    "react-native-safe-area-context": "~5.10.1",
    "react-native-screens": "~4.30.1",
    "react-native-svg": "15.16.0",
    "zod": "^3.23.8",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@types/react": "~19.3.0",
    "eslint": "^9.0.0",
    "eslint-config-expo": "~58.0.4",
    "typescript": "~5.8.0"
  }
}
```

### 1.2 Update `mobile/app.config.ts` for iOS + Android on SDK 58

Update `/var/www/html/old/mobile_webcam/mobile/app.config.ts` to configure both `ios` and `android`:

```ts
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'webcamo',
  slug: 'webcamo',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'mobilewebcam',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: 'com.mobilewebcam.app',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'webcamo uses the camera to stream video to your computer over USB.',
      NSMicrophoneUsageDescription:
        'webcamo uses the microphone to stream audio to your computer over USB.',
      NSLocalNetworkUsageDescription:
        'webcamo runs a local server so your computer can read the camera over the USB cable.',
      UIBackgroundModes: ['audio'],
      UIFileSharingEnabled: false,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.mobilewebcam.app',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.INTERNET',
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ],
  },
  plugins: [
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4' },
        android: {
          minSdkVersion: 26,
          compileSdkVersion: 35,
          targetSdkVersion: 35,
        },
      },
    ],
    './modules/webcam-server/plugin',
    'expo-router',
    'expo-secure-store',
  ],
  experiments: { typedRoutes: true },
};

export default config;
```

### 1.3 Update `mobile/eas.json`

Ensure `mobile/eas.json` has Android `.apk` build profiles alongside iOS so GitHub Actions or local Gradle can build installable APKs:

```json
{
  "cli": { "version": ">= 15.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    },
    "production": {
      "android": { "buildType": "apk" }
    }
  }
}
```

---

## 2. Workstream 2: Android Native Module (`mobile/modules/webcam-server/android/`)

### 2.1 The USB Invariant on Android (`adb forward`)

Just like `usbmuxd` (`iproxy`) on iOS, Android over USB uses **`adb forward tcp:<localPort> tcp:8080`**.
- The connection direction is **strictly host → device**.
- The Android phone **listens** on `127.0.0.1:8080` (or `0.0.0.0:8080` with `Host` header validation).
- The desktop **connects** to `http://127.0.0.1:<localPort>`.
- The wire protocol (`/health`, `/capabilities`, `/settings`, `/stream.mp4`, `/stream.mjpeg`, `/telemetry`, `/actions/focus`, `/actions/switch-camera`) is **100% identical** between iOS and Android.

### 2.2 Shared Schema Update (`packages/shared/src/health.ts`)

Currently `HealthSchema` has `device: { model: string, ios: string, name: string }`. Update `/var/www/html/old/mobile_webcam/packages/shared/src/health.ts` so it stays backward-compatible while supporting Android:

```ts
export const HealthSchema = z.object({
  ok: z.literal(true),
  app: z.string(),
  version: z.string(),
  protocol: z.number().int(),
  device: z.object({
    model: z.string(),
    ios: z.string(), // On Android, populate with Build.VERSION.RELEASE (e.g., "Android 15") for backward compatibility
    platform: z.enum(['ios', 'android']).optional().default('ios'),
    osVersion: z.string().optional(),
    name: z.string(),
  }),
  streaming: z.boolean(),
  battery: z.number().min(0).max(1),
  thermalState: ThermalStateSchema,
});
```

### 2.3 Expo Module Declaration (`mobile/modules/webcam-server/expo-module.config.json`)

Update `/var/www/html/old/mobile_webcam/mobile/modules/webcam-server/expo-module.config.json`:

```json
{
  "platforms": ["apple", "android"],
  "apple": {
    "modules": ["WebcamServerModule"]
  },
  "android": {
    "modules": ["expo.modules.webcamserver.WebcamServerModule"]
  }
}
```

### 2.4 Config Plugin (`mobile/modules/webcam-server/plugin/index.ts`)

Extend `withWebcamServer` in `/var/www/html/old/mobile_webcam/mobile/modules/webcam-server/plugin/index.ts` using `withAndroidManifest` from `expo/config-plugins`:
- Ensure `<uses-permission>` entries exist for `CAMERA`, `RECORD_AUDIO`, `INTERNET`, `WAKE_LOCK`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_MICROPHONE`.
- Add `<uses-feature android:name="android.hardware.camera" android:required="true" />`.

### 2.5 File Tree for `mobile/modules/webcam-server/android/`

Create the following structure mirroring `ios/`:

```
mobile/modules/webcam-server/android/
├── build.gradle
└── src/main/
    ├── AndroidManifest.xml
    └── java/expo/modules/webcamserver/
        ├── WebcamServerModule.kt               # Expo Module DSL (matches WebcamServerModule.swift)
        ├── capture/
        │   ├── CaptureSessionController.kt     # Camera2 CameraManager + CameraCaptureSession + AudioRecord
        │   ├── LensDiscovery.kt                # CameraCharacteristics lens & resolution enumeration
        │   └── BlurRenderer.kt                 # RenderEffect / GLES portrait blur fallback
        ├── encoding/
        │   ├── FragmentedMP4Writer.kt          # Hardware MediaCodec (video/avc + audio/mp4a-latm) → in-memory fMP4 muxer
        │   ├── Mp4BoxBuilder.kt                # Builds ISO BMFF ftyp+moov (init segment) and moof+mdat (media fragments)
        │   ├── MJPEGEncoder.kt                 # YUV_420_888 → NV21 → YuvImage.compressToJpeg() fallback
        │   └── EncoderSettings.kt
        ├── server/
        │   ├── HTTPServer.kt                   # ServerSocket on port 8080, executor thread pool
        │   ├── HTTPRequest.kt                  # HTTP/1.1 parser
        │   ├── HTTPResponse.kt
        │   ├── Routes.kt                       # Identical route table & validation to ios/Server/Routes.swift
        │   ├── StreamConnection.kt             # Back-pressure aware chunked writer (drops segments if inFlight)
        │   └── Auth.kt                         # Host header (127.0.0.1/localhost) + Bearer token check
        ├── views/
        │   └── WebcamPreviewView.kt            # ExpoView wrapping TextureView attached to CaptureSessionController
        └── support/
            ├── Telemetry.kt                    # FPS, bitrate, droppedSegments, BatteryManager, PowerManager thermal status
            ├── SettingsStore.kt
            └── Log.kt
```

### 2.6 Critical Implementation Details for Android Native Files

#### A. `android/build.gradle`
```groovy
apply plugin: 'com.android.library'
apply plugin: 'org.jetbrains.kotlin.android'
apply plugin: 'expo-module-gradle-plugin'

group = 'expo.modules.webcamserver'
version = '1.0.0'

android {
  namespace "expo.modules.webcamserver"
  defaultConfig {
    versionCode 1
    versionName "1.0.0"
  }
}

dependencies {
  implementation project(':expo-modules-core')
  implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1"
}
```

#### B. `WebcamServerModule.kt` — Exact Surface Parity with `WebcamServerModule.swift`
Must expose the exact same module name (`Name("WebcamServer")`), events, functions, and view:
- `Events("onClientConnected", "onClientDisconnected", "onTelemetry", "onThermalStateChange", "onServerStateChange", "onError")`
- `AsyncFunction("startServer") { port: Int, token: String -> ... }`
  - Verifies `CAMERA` and (if enabled) `RECORD_AUDIO` permissions via `appContext.permissions`.
  - Starts `CaptureSessionController` and `HTTPServer(port)`.
  - Acquires `FLAG_KEEP_SCREEN_ON` on `appContext.currentActivity?.window` on the UI thread.
  - Emits `onServerStateChange` (`{"running": true, "port": port}`) and returns `mapOf("port" to port, "token" to token)`.
- `AsyncFunction("stopServer")`: Stops server + capture, clears `FLAG_KEEP_SCREEN_ON`, emits `onServerStateChange`.
- `Function("isRunning")`: Returns `server.isRunning && capture.isRunning`.
- `AsyncFunction("getCapabilities")`, `AsyncFunction("getSettings")`, `AsyncFunction("updateSettings")`, `AsyncFunction("focusAt")`, `AsyncFunction("setLens")`, `AsyncFunction("getTelemetry")`.
- `View(WebcamPreviewView::class) { Prop("resizeMode") { view, mode: String -> view.setResizeMode(mode) } }`.
  - **Remember the view name trap (`docs/09 §4.3`):** `View(WebcamPreviewView::class)` inside `WebcamServerModule` registers under `"WebcamServer"`, matching `requireNativeViewManager('WebcamServer')` in `mobile/src/native/WebcamPreview.tsx`.

#### C. `LensDiscovery.kt` & `CaptureSessionController.kt` (Camera2 + Single Session)
- **Lens Enumeration (`LensDiscovery.kt`):**
  - Query `CameraManager.cameraIdList` and `getCameraCharacteristics(id)`.
  - Map `LENS_FACING_FRONT` → `"front"` (`"Front"`).
  - For `LENS_FACING_BACK` cameras, inspect `LENS_INFO_AVAILABLE_FOCAL_LENGTHS` and physical camera IDs (`logicalMultiCamera` on Android 9+) to map:
    - shortest focal length (< 2.0mm) → `"back-ultrawide"` (`"0.5× Ultra Wide"`)
    - primary rear camera → `"back-wide"` (`"1× Wide"`)
    - longer focal length (> 5.0mm) → `"back-tele"` (`"3× Telephoto"`)
  - Query `SCALER_STREAM_CONFIGURATION_MAP` for `MediaCodec::class.java` output sizes, filtering to standard 16:9 modes (`1280x720`, `1920x1080`, `3840x2160`) and computing `maxFps` from `CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES`.
  - Check `CONTROL_AVAILABLE_EFFECTS` / `CameraExtensionCharacteristics` (`EXTENSION_BOKEH` on Android 12+ / API 31+) for hardware portrait/bokeh (`cinematic.supported`).
- **Single `CameraCaptureSession` (`CaptureSessionController.kt`):**
  - Hold a companion `sharedCapture: CaptureSessionController?` reference (just like `WebcamServerModule.sharedCapture` on iOS).
  - Attach up to two surfaces to a single `CameraCaptureSession`:
    1. The `WebcamPreviewView`'s `SurfaceTexture` (if mounted).
    2. Either the `MediaCodec` input `Surface` (via `MediaCodec.createInputSurface()` for zero-copy hardware H.264 encoding in `fmp4` mode) or an `ImageReader` (`ImageFormat.YUV_420_888`, maxImages = 2) for `mjpeg` mode.
  - **Live controls (`applyLive`):** Update the repeating `CaptureRequest.Builder` on the session without restarting:
    - Zoom: `CONTROL_ZOOM_RATIO` (API 30+) or `SCALER_CROP_REGION`.
    - Torch: `FLASH_MODE = FLASH_MODE_TORCH` vs `FLASH_MODE_OFF`.
    - Exposure: `CONTROL_AE_LOCK`, `CONTROL_AE_EXPOSURE_COMPENSATION`.
    - Focus: `CONTROL_AF_MODE` (`CONTROL_AF_MODE_CONTINUOUS_VIDEO` vs locked `CONTROL_AF_TRIGGER_START`), `CONTROL_AF_REGIONS` (`MeteringRectangle` from normalized `x, y`).
    - White balance: `CONTROL_AWB_LOCK`, `CONTROL_AWB_MODE`.
    - Video bitrate: `Bundle().apply { putInt(MediaCodec.PARAMETER_KEY_VIDEO_BITRATE, settings.bitrate) }` passed to `videoCodec.setParameters(...)` live!

#### D. `FragmentedMP4Writer.kt` & `Mp4BoxBuilder.kt` (Hardware H.264 + AAC → In-Memory fMP4)
Android's built-in `MediaMuxer` writes only to a seekable `FileDescriptor` (cannot write fragmented MP4 (`moof`+`mdat`) to a non-seekable pipe). Therefore, implement `Mp4BoxBuilder.kt` (~250 lines of pure Kotlin ByteBuffer packing) fed by hardware `MediaCodec`:
1. **Video Encoder (`MediaCodec.createEncoderByType("video/avc")`):**
   - Configured with `COLOR_FormatSurface`, `KEY_BIT_RATE = settings.bitrate`, `KEY_FRAME_RATE = settings.fps`, `KEY_I_FRAME_INTERVAL = 1` (1-second GOP so segments are ~200ms–1000ms and low-latency), `KEY_PREPEND_HEADER_TO_SYNC_FRAMES = 0`.
2. **Audio Encoder (`MediaCodec.createEncoderByType("audio/mp4a-latm")`):**
   - Fed by `AudioRecord(MediaRecorder.AudioSource.MIC, sampleRate, channelConfig, AudioFormat.ENCODING_PCM_16BIT, bufferSize)`.
3. **Initialization Segment (`isInit = true`):**
   - When both encoders emit `INFO_OUTPUT_FORMAT_CHANGED`, extract `csd-0` (`sps`) and `csd-1` (`pps`) from video `MediaFormat` and `csd-0` (AudioSpecificConfig) from audio `MediaFormat`.
   - `Mp4BoxBuilder.buildInitSegment(...)` writes `ftyp` (`isom`, `iso5`, `dash`) + `moov` (`mvhd`, video `trak` with `avc1`+`avcC`, audio `trak` with `mp4a`+`esds`, and `mvex` with `trex` boxes for track 1 and track 2).
   - Store as `capture.initializationSegment` and broadcast immediately with `isInit = true`.
4. **Media Fragments (`isInit = false`):**
   - Buffer encoded video/audio access units for ~200ms (or 6 frames at 30fps).
   - Emit `moof` (`mfhd` sequence number + `traf` with `tfhd`, `tfdt` 90kHz/sampleRate decode time, `trun` sample durations/sizes/flags) followed immediately by `mdat` containing the length-prefixed H.264 NALUs and raw AAC frames.
   - Pass each finished fragment `ByteArray` to `server.broadcast(segment, isInit = false)`.

#### E. `HTTPServer.kt` & `StreamConnection.kt` (Back-Pressure Aware Socket Server)
- Bind `java.net.ServerSocket(port, 16, InetAddress.getByName("127.0.0.1"))` (or `0.0.0.0` with `Auth.kt` rejecting any `Host` header other than `127.0.0.1` or `localhost`).
- In `StreamConnection.kt`:
  - Use a single-thread `ExecutorService` per streaming client and an `AtomicBoolean(false)` `inFlight` flag with a `lastSendStartMs` timestamp.
  - When `send(data: ByteArray, isInit: Boolean)` is called:
    - If `!isInit && inFlight.get()`:
      - If `SystemClock.elapsedRealtime() - lastSendStartMs > 10_000`, close the socket (dead client, matching `ios/Server/StreamConnection.swift`).
      - Otherwise increment `Telemetry.recordDroppedSegment()` and return immediately (never queue unboundedly in RAM).
    - Submit write of HTTP chunk (`"${ data.size.toString(16) }\r\n"` + `data` + `"\r\n"`) to the client's executor and clear `inFlight` on completion.

#### F. Mobile UI Adjustments for Android (`mobile/src/`)
1. `mobile/src/features/connection/hooks/usePermissions.ts` & `PermissionGate.tsx`:
   - On `Platform.OS === 'android'`, request `PermissionsAndroid.PERMISSIONS.CAMERA` and `PermissionsAndroid.PERMISSIONS.RECORD_AUDIO`.
   - Do **not** show the iOS-only "Local Network permission" warning on Android; instead show an **"USB Debugging (ADB)"** checklist card explaining: *"Enable Developer Options → USB Debugging on your Android phone and tap Allow when plugged into your computer."*
2. `mobile/src/features/cinematic/`:
   - On Android, if `capabilities.cinematic.supported` is `false`, hide the iOS 26 notice and show the Portrait Blur toggle if `blurFallback` is supported.

---

## 3. Workstream 3: Transform Server Website into a Cross-Platform Desktop App (Like Lura)

### 3.1 How Lura Works (Reference Architecture)

In `/var/www/html/lura`:
1. **Local HTTP/WS Server + Static UI:** Runs on `127.0.0.1` (`src/lura/modules/dashboard/server.py`).
2. **Native App Window (`src/lura/modules/dashboard/window.py`):**
   - Instead of making the user open a browser tab, running the app (`webcamo` or clicking the desktop/menu-bar icon) launches a dedicated native window (`1220x880`, min `420x560`) pointing at `http://127.0.0.1:47800`.
   - Window strategy in priority order:
     1. Native OS WebView helper or Chromium-family app mode (`--app=http://127.0.0.1:47800 --window-size=1220,880`), which gives a chromeless native window using Edge WebView2 / Chrome / Brave / Chromium with zero Electron bloat.
     2. Fallback to `open` / `xdg-open` / `start` default browser if no native webview or Chromium browser is present.
   - If the window process crashes, a background reaper detects the non-zero exit code and opens the fallback window automatically.
3. **CLI Subcommands:**
   - `webcamo` or `webcamo run`: Starts the background daemon AND opens the native desktop window (unless `--no-window` is passed, which `systemd` / LaunchAgent uses).
   - `webcamo dashboard` or `webcamo window`: If the daemon is already running on `127.0.0.1:47800`, immediately opens the native desktop window to `http://127.0.0.1:47800`.
   - `webcamo doctor`: Runs cross-platform host diagnostics (checks USB tools, virtual camera driver, virtual audio driver, `ffmpeg`).
   - `webcamo --version`: Prints version and exits `0` (used by CI smoke tests).

### 3.2 Server Module Architecture Changes (`server/src/`)

Update `server/src/` to support **Linux, macOS, and Windows** and **both iOS and Android phones** while strictly preserving the modular-monolith rules (`docs/04-server-structure.md`):

```
server/src/
├── main.ts                                      # CLI entry: run | dashboard | window | doctor | --version
├── composition-root.ts                          # Wires OS-specific adapters based on process.platform
├── kernel/
│   └── platform/paths.ts                        # Per-OS config/data/log paths (Linux XDG, macOS ~/Library/Application Support/Webcamo, Windows %APPDATA%\Webcamo)
├── modules/
│   ├── window/                                  # NEW — Native Desktop Window module (ported from Lura's window.py)
│   │   ├── index.ts                             # WindowModule: launch(url), openAppWindowOrBrowser(url)
│   │   └── infrastructure/NativeWindowLauncher.ts
│   ├── discovery/
│   │   ├── index.ts
│   │   ├── domain/Device.ts                     # Add platform: 'ios' | 'android'
│   │   ├── application/WatchDevices.ts          # Polls CompositeDeviceAdapter every 2s
│   │   └── infrastructure/
│   │       ├── LibimobiledeviceAdapter.ts       # iOS: idevice_id -l, ideviceinfo
│   │       ├── AdbDeviceAdapter.ts              # NEW — Android: adb devices -l, adb shell getprop
│   │       └── CompositeDeviceAdapter.ts        # NEW — Queries both iOS and Android adapters
│   ├── tunnel/
│   │   ├── index.ts                             # Dispatches to IproxyTunnel or AdbTunnel based on device.platform
│   │   └── infrastructure/
│   │       ├── IproxyTunnel.ts                  # iOS: iproxy <localPort> <devicePort>
│   │       └── AdbTunnel.ts                     # NEW — Android: adb -s <udid> forward tcp:<localPort> tcp:<devicePort>
│   ├── video-device/
│   │   ├── index.ts                             # VideoDevicePort interface + factory per OS
│   │   └── infrastructure/
│   │       ├── LinuxV4l2Adapter.ts              # Existing v4l2loopback implementation
│   │       ├── MacOSCameraAdapter.ts            # NEW — Checks Webcamo CMIO Extension or OBS Virtual Camera + StreamProxy MJPEG/fMP4 feed
│   │       └── WindowsDirectShowAdapter.ts      # NEW — Checks UnityCapture / OBS-Camera DirectShow / shared memory target
│   ├── audio-device/
│   │   ├── index.ts                             # AudioDevicePort interface + factory per OS
│   │   └── infrastructure/
│   │       ├── LinuxPactlAdapter.ts             # Existing PipeWire pactl null sink
│   │       ├── MacOSAudioAdapter.ts             # NEW — Detects BlackHole 2ch (`SwitchAudioSource` / `ffmpeg -f avfoundation -list_devices`)
│   │       └── WindowsAudioAdapter.ts           # NEW — Detects `CABLE Input (VB-Audio Virtual Cable)` via `ffmpeg -f dshow -list_devices`
│   └── pipeline/
│       └── domain/FfmpegArgs.ts                 # Extend buildFfmpegArgs with platform: 'linux' | 'darwin' | 'win32'
```

### 3.3 Detailed Implementation of New Server Modules

#### A. `discovery/infrastructure/AdbDeviceAdapter.ts` (Android USB Discovery)
- `list()` runs `adb devices` (timeout 5000ms), parses lines after `List of devices attached`, and returns serials where state is `device` (ignoring `unauthorized` or `offline`, but logging a clear warning if a device is `unauthorized`: *"Android phone connected but USB debugging is not authorized — tap Allow on the phone"*).
- `describe(serial)` runs:
  - `adb -s <serial> shell getprop ro.product.model` → `model` (e.g. `"Pixel 9 Pro"`)
  - `adb -s <serial> shell getprop ro.build.version.release` → `osVersion` (e.g. `"15"`)
  - Returns `{ udid: serial, name: model, model, ios: "Android " + osVersion, platform: 'android' }`.

#### B. `tunnel/infrastructure/AdbTunnel.ts` (Android USB Tunnel)
- Unlike `iproxy` (which stays running as a foreground process), `adb forward` installs a port forward in the `adb` server daemon:
  - `open(udid)`: Runs `adb -s <udid> forward tcp:${localPort} tcp:${devicePort}` and emits `tunnel.opened`.
  - Starts a lightweight health interval (every 3s) verifying `adb -s <udid> forward --list` still contains `tcp:${localPort}`; if removed (e.g. cable unplugged), emits `tunnel.closed`.
  - `close()`: Runs `adb -s <udid> forward --remove tcp:${localPort}` and emits `tunnel.closed`.

#### C. Cross-Platform `FfmpegArgs.ts` (Linux, macOS, Windows)
Extend `FfmpegTargets` in `server/src/modules/pipeline/domain/FfmpegArgs.ts` with `platform: 'linux' | 'darwin' | 'win32'`:
1. **Linux (`platform === 'linux'`):**
   - Video output: `-flush_packets 1 -fps_mode passthrough -f v4l2 /dev/video9`
   - Audio output: `-map 0:a:0? -f pulse -device mobile_webcam_mic mobile_webcam`
2. **macOS (`platform === 'darwin'`):**
   - The macOS native Camera Extension (`macos/WebcamoExtension/MJPEGReader.swift`) reads MJPEG frames from `http://127.0.0.1:47800/api/stream.mjpeg` served by `server/src/modules/pipeline/infrastructure/StreamProxy.ts`!
   - When `StreamProxy` is active on macOS:
     - `ffmpeg` decodes `http://127.0.0.1:8080/stream.mp4`, outputs MJPEG to `pipe:1` (consumed by `StreamProxy` for `WebcamoExtension`), and simultaneously routes audio to BlackHole 2ch (if installed) via `-map 0:a:0? -f audiotoolbox -audio_device_index <BlackHoleIndex> ""` (or `sox`/`ffplay` audio pipe).
     - Also keep support for OBS Virtual Camera (`scripts/mac-camera.sh`) as a zero-entitlement fallback.
3. **Windows (`platform === 'win32'`):**
   - Video output:
     - Primary: Stream via `StreamProxy` (`http://127.0.0.1:47800/api/stream.mjpeg` and `http://127.0.0.1:8080/stream.mp4`) + auto-configure OBS Virtual Camera scene (just like `scripts/sync-obs-format.py`), OR output to UnityCapture / DirectShow virtual sink if installed.
   - Audio output:
     - Route audio to `CABLE Input (VB-Audio Virtual Cable)` using PowerShell / `ffplay -nodisp -autoexit -f f32le` or `ffmpeg -f wave` to the virtual audio device.

#### D. `window/index.ts` (Ported from Lura's `src/lura/modules/dashboard/window.py`)
Implement `WindowModule` in `server/src/modules/window/index.ts`:
- Searches for an installed Chromium-family browser across OSes (exact paths from Lura's `_chromium_family()` in `window.py`):
  - **Windows:** `Microsoft\Edge\Application\msedge.exe` (pre-installed on every Windows 10/11 machine!), `Google\Chrome\Application\chrome.exe`, `BraveSoftware\Brave-Browser\Application\brave.exe` under `PROGRAMFILES`, `PROGRAMFILES(X86)`, `LOCALAPPDATA`.
  - **macOS:** `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, `/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`, `/Applications/Brave Browser.app/Contents/MacOS/Brave Browser`, `/Applications/Chromium.app/Contents/MacOS/Chromium`.
  - **Linux:** `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`, `microsoft-edge`, `brave-browser`.
- Spawns `[browser, "--app=http://127.0.0.1:47800", "--window-size=1220,880", "--user-data-dir=<appDataDir>/window-profile"]` detached so it opens as a standalone desktop app window with its own taskbar/dock icon and persistent `localStorage` (theme, language), falling back to the system default browser (`xdg-open` / `open` / `cmd /c start`) if none is found.

#### E. Upgrade Desktop UI (`server/src/modules/api/static/`) to Match Lura's Dashboard UX
Update `server/src/modules/api/static/index.html` to include:
- **Bilingual EN / AR toggle** (`dir="rtl"` for Arabic, matching Lura's `src/lura/modules/dashboard/static/index.html`).
- **Light / Dark / Auto theme toggle** persisted in `localStorage`.
- **Phone Type Indicator:** Shows whether an **iPhone (USB / usbmuxd)** or **Android (USB / ADB)** is connected, with OS-specific setup cards if no device is detected.
- **Host Driver Status Bar:** Shows green/amber pills for `USB Tunnel`, `Virtual Camera`, and `Virtual Microphone` with a one-click **"Run Doctor / Fix Setup"** modal.

---

## 4. Workstream 4: Desktop Packaging & GitHub Actions Release Pipeline (Like Lura)

Model `packaging/` and `.github/workflows/release.yml` directly after `/var/www/html/lura/packaging/` and `/var/www/html/lura/.github/workflows/release.yml`.

### 4.1 Directory Layout for `packaging/`

```
packaging/
├── icons/
│   ├── webcamo.svg
│   ├── webcamo.png            # 512x512 PNG
│   ├── webcamo.ico            # Windows icon
│   └── webcamo.icns           # macOS icon
├── linux/
│   ├── build-deb.sh           # Builds dist/webcamo_<v>_amd64.deb (like Lura's build-deb.sh)
│   ├── webcamo.desktop        # Desktop launcher: Exec=/opt/webcamo/webcamo dashboard
│   └── webcamo.service        # systemd --user unit: ExecStart=/opt/webcamo/webcamo run --no-window
├── macos/
│   └── build-app.sh           # Bundles macos/Webcamo.app + server runtime into Webcamo-<v>-macos-<arch>.zip
├── windows/
│   └── webcamo.iss            # Inno Setup script → dist/Webcamo-Setup-<v>.exe (per-user, HKCU Run autostart)
├── homebrew/
│   └── webcamo.rb.tmpl        # Homebrew Cask template for mohamedjs/homebrew-webcamo
└── ci/
    ├── smoke-unix.sh          # Boots server under Xvfb/macOS, checks /api/status, screenshots dashboard
    └── smoke-windows.ps1      # Installs Webcamo-Setup-<v>.exe, checks /api/status, screenshots dashboard
```

### 4.2 How the Desktop Bundle is Built on Each OS

To ship a single self-contained folder (`dist/webcamo`) without requiring the end-user to install Node.js:
1. Build `packages/shared` and `server` (`npm run build`).
2. Bundle `server/dist/main.js` and its production dependencies (`fastify`, `pino`, `zod`, etc.) into a single CJS/ESM bundle using `esbuild` (`npx esbuild server/dist/main.js --bundle --platform=node --target=node22 --outfile=dist/bundle/server.cjs`), copying `server/dist/modules/api/static` alongside it.
3. Package a portable Node 22 binary (or Node Single Executable Application `node --experimental-sea-config`) + launcher wrapper (`webcamo` / `WebcamoApp.exe`) into `dist/webcamo/`:
   - **Linux (`ubuntu-22.04`):**
     - `packaging/linux/build-deb.sh <VERSION> amd64` packages `/opt/webcamo/`, `/usr/bin/webcamo`, `/usr/share/applications/webcamo.desktop`, `/usr/lib/systemd/user/webcamo.service`.
     - `Depends: ffmpeg, usbmuxd, libusbmuxd-tools, libimobiledevice-utils, adb, v4l2loopback-dkms, v4l2loopback-utils, pulseaudio-utils | pipewire-First`
     - `postinst` reloads `systemd --user` for logged-in users (`loginctl list-users`) and restarts `webcamo.service`, identical to `/var/www/html/lura/packaging/linux/build-deb.sh`.
     - Also outputs `webcamo-<v>-linux-x86_64.tar.gz`.
   - **macOS (`macos-15` arm64 & `macos-15-intel` x86_64):**
     - Compiles `macos/Webcamo.xcodeproj` (`./macos/build.sh nosign` or signed if certs exist) and embeds the bundled server inside `Webcamo.app/Contents/Resources/server/` with a CLI entrypoint at `Webcamo.app/Contents/MacOS/webcamo`.
     - Outputs `Webcamo-<v>-macos-arm64.zip` and `Webcamo-<v>-macos-x86_64.zip`.
   - **Windows (`windows-latest`):**
     - Bundles `WebcamoApp.exe` (windowless launcher using `wscript`/`pwsh` or SEA binary so no console flashes up), `webcamo.exe` (CLI), `ffmpeg.exe`, `adb.exe` (`platform-tools`), and `iproxy.exe` (`libimobiledevice` win64) into `dist\webcamo\`.
     - Runs Inno Setup (`ISCC.exe "/DAppVersion=$env:VERSION" packaging\windows\webcamo.iss`) to produce `Webcamo-Setup-<v>.exe` and `webcamo-<v>-windows-x64-portable.zip`.
   - **Android (`ubuntu-latest` with Java 17 + Android SDK):**
     - Runs `cd mobile && npx expo prebuild --platform android --clean && cd android && ./gradlew assembleRelease` to produce `webcamo-<v>-android.apk`!

### 4.3 Release Artifacts Matrix (`.github/workflows/release.yml`)

Every tagged release (`v*`) or manual `workflow_dispatch` produces these exact asset names (matching `site/site.js` `PICK` regexes):

| Platform | Asset Filename Pattern | Description |
|---|---|---|
| Windows Installer | `Webcamo-Setup-<v>.exe` | Inno Setup per-user installer + autostart |
| Windows Portable | `webcamo-<v>-windows-x64-portable.zip` | No-install portable archive |
| macOS Apple Silicon | `Webcamo-<v>-macos-arm64.zip` | `Webcamo.app` for M1–M4 Macs |
| macOS Intel | `Webcamo-<v>-macos-x86_64.zip` | `Webcamo.app` for Intel Macs |
| Linux Debian/Ubuntu | `webcamo_<v>_amd64.deb` | `.deb` with `systemd --user` service + desktop icon |
| Linux Tarball | `webcamo-<v>-linux-x86_64.tar.gz` | Portable tarball for Fedora / Arch / other distros |
| Android Phone App | `webcamo-<v>-android.apk` | Signed Android APK with `WebcamServerModule` |
| Checksums | `SHA256SUMS.txt` | SHA-256 hashes of all release artifacts |

And after publishing the GitHub Release:
1. Triggers `gh workflow run pages.yml --repo "$GITHUB_REPOSITORY" --ref main` so the landing page updates `release.json` to the new version automatically.
2. Updates the Homebrew Cask in `mohamedjs/homebrew-webcamo` (`brew install --cask mohamedjs/webcamo/webcamo`) if `HOMEBREW_TAP_TOKEN` is set.

---

## 5. Workstream 4: Production Landing Page (`site/` + `.github/workflows/pages.yml`)

Copy the architecture and design language of `/var/www/html/lura/site/` (`index.html`, `site.css`, `site.js`, `build.sh`) into `/var/www/html/old/mobile_webcam/site/`.

### 5.1 Files to Create in `site/`

```
site/
├── index.html        # Semantic HTML5 with data-i18n attributes, OS cards, mobile companion card, FAQ
├── site.css          # Ported from Lura's site.css (calm paper/dark aesthetic, responsive grid3, RTL support)
├── site.js           # Bilingual EN/AR dictionary, theme toggle, OS detection, GitHub release asset binding
└── build.sh          # Assembles _site/, copies screenshots/icons/fonts, fetches release.json, touches .nojekyll
```

### 5.2 Key Features Required in `site/index.html` and `site/site.js`

1. **Repository Constant:** `const REPO = "mohamedjs/mobile-webcam";`
2. **Asset Regex Matcher (`PICK` in `site/site.js`):**
   ```js
   const PICK = {
     setup: /^Webcamo-Setup-.*\.exe$/i,
     portable: /windows-x64-portable\.zip$/i,
     "mac-arm": /macos-arm64\.zip$/i,
     "mac-intel": /macos-x86_64\.zip$/i,
     deb: /_amd64\.deb$/i,
     tar: /linux-x86_64\.tar\.gz$/i,
     apk: /-android\.apk$/i,
     sums: /^SHA256SUMS/i,
   };
   const HERO_ASSET = { windows: "setup", macos: "mac-arm", linux: "deb", android: "apk" };
   ```
3. **OS Auto-Detection (`detectOS()`):**
   - Detects `"windows"`, `"macos"`, `"linux"`, `"android"`, `"ios"`.
   - Highlights the user's current desktop OS card with `.platform.mine` (`data-i18n="dl.yours"` badge) and sets `#hero-download` to the primary installer for their OS.
   - If opened on an Android phone, `#hero-download` points directly to `webcamo-<v>-android.apk`!
4. **Desktop Download Cards (`#download .grid3`) + Mobile App Companion Card:**
   - **Windows Card:** `Download installer (.exe)` (`data-asset="setup"`), `Portable zip` (`data-asset="portable"`), SmartScreen note.
   - **macOS Card:** `Apple Silicon (M1–M4)` (`data-asset="mac-arm"`), `Intel Mac` (`data-asset="mac-intel"`), copyable command `brew install --cask mohamedjs/webcamo/webcamo`.
   - **Linux Card:** `Download .deb` (`data-asset="deb"`), `Other distros (.tar.gz)` (`data-asset="tar"`), copyable command `sudo apt install ./webcamo_amd64.deb`.
   - **Phone Companion Section (`#mobile-download`):**
     - **Android Card:** Direct `.apk` download button (`data-asset="apk"`) + `adb install webcamo.apk` snippet.
     - **iOS Card:** Instructions for installing via EAS / Xcode (`npx expo run:ios --device`) and granting the critical **Local Network** permission.
5. **Bilingual EN / Egyptian Arabic (`T.en` and `T.ar`):**
   - Full translations in English and Egyptian Arabic (matching Mohamed's style in `/var/www/html/lura/site/site.js`), automatically switching `document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"`.
6. **Interactive Hero Preview Canvas (`#camera-preview`):**
   - A clean, lightweight HTML5 canvas animation in the hero card showing a simulated 1080p60 camera viewfinder with lens pills (`0.5×`, `1×`, `3×`), `f/2.0 Cinematic` badge, live audio level meter, and `USB · 0ms jitter` status indicator.

---

## 6. Step-by-Step Execution Order for the Next AI Agent

Execute these phases in order and verify each before moving to the next:

### Phase 1: Shared Schema & Expo SDK 58 Upgrade
1. Update `packages/shared/src/health.ts` to add optional `platform: z.enum(['ios', 'android'])` and `osVersion: z.string()` while keeping `ios: z.string()`. Run `npm run build --workspace=@mobile-webcam/shared` and `npm test --workspace=@mobile-webcam/shared`.
2. Update `mobile/package.json`, `mobile/app.config.ts`, and `mobile/eas.json` to Expo SDK 58 (`~58.0.22`) using the exact versions in **§1.1**.
3. Run `npm install` from the repo root (or inside `mobile/`) and verify `cd mobile && npm run typecheck` passes with 0 errors.

### Phase 2: Android Native Module (`mobile/modules/webcam-server/android/`)
1. Update `mobile/modules/webcam-server/expo-module.config.json` and `mobile/modules/webcam-server/plugin/index.ts` as specified in **§2.3–2.4**.
2. Create `mobile/modules/webcam-server/android/build.gradle` and `src/main/AndroidManifest.xml`.
3. Implement `support/Log.kt`, `support/SettingsStore.kt`, `support/Telemetry.kt`.
4. Implement `server/Auth.kt`, `server/HTTPRequest.kt`, `server/HTTPResponse.kt`, `server/StreamConnection.kt`, `server/HTTPServer.kt`, `server/Routes.kt`.
5. Implement `encoding/EncoderSettings.kt`, `encoding/MJPEGEncoder.kt`, `encoding/Mp4BoxBuilder.kt`, `encoding/FragmentedMP4Writer.kt`.
6. Implement `capture/LensDiscovery.kt`, `capture/BlurRenderer.kt`, `capture/CaptureSessionController.kt`.
7. Implement `views/WebcamPreviewView.kt` and `WebcamServerModule.kt`.
8. Update `mobile/src/features/connection/` permissions UI to handle `Platform.OS === 'android'` cleanly.
9. Verify `cd mobile && npm run typecheck` passes.

### Phase 3: Cross-Platform Desktop App & Native Window (`server/`)
1. Implement `server/src/kernel/platform/paths.ts` for Linux, macOS, and Windows config directories.
2. Implement `server/src/modules/window/` (`NativeWindowLauncher.ts` + `index.ts`) modeled after `/var/www/html/lura/src/lura/modules/dashboard/window.py`.
3. Implement `AdbDeviceAdapter.ts` and `CompositeDeviceAdapter.ts` in `server/src/modules/discovery/infrastructure/`.
4. Implement `AdbTunnel.ts` and update `TunnelModule` in `server/src/modules/tunnel/` to support both `ios` (`iproxy`) and `android` (`adb forward`).
5. Add macOS and Windows adapters to `video-device` and `audio-device`, and update `FfmpegArgs.ts` for multi-OS targets.
6. Update `server/src/main.ts` to support CLI subcommands (`run`, `dashboard`, `window`, `doctor`, `--version`) and launch the native window by default unless `--no-window` is passed.
7. Update `server/src/modules/api/static/index.html` with EN/AR i18n, Dark/Light theme toggle, and iOS/Android device badge.
8. Add unit tests in `server/test/unit/` for `AdbDeviceAdapter`, `AdbTunnel`, and multi-OS `FfmpegArgs.build`. Run `cd server && npm test` and verify all tests pass.

### Phase 4: Landing Page (`site/`) & Packaging (`packaging/`, `.github/workflows/`)
1. Create `site/index.html`, `site/site.css`, `site/site.js`, and `site/build.sh` modeled after `/var/www/html/lura/site/`.
2. Run `bash site/build.sh` and verify `_site/` builds cleanly.
3. Create `packaging/linux/build-deb.sh`, `packaging/linux/webcamo.desktop`, `packaging/linux/webcamo.service`, `packaging/windows/webcamo.iss`, `packaging/homebrew/webcamo.rb.tmpl`, `packaging/ci/smoke-unix.sh`, `packaging/ci/smoke-windows.ps1`.
4. Create `.github/workflows/ci.yml`, `.github/workflows/release.yml`, and `.github/workflows/pages.yml` modeled after `/var/www/html/lura/.github/workflows/`.
5. Update `README.md` and `docs/RELEASING.md` with build, release, and installation instructions for Linux, macOS, Windows, iOS, and Android.

---

## 7. Verification Checklist for the Implementing Agent

Before concluding work, the implementing agent must run and report the output of:

```bash
# 1. Shared package build & tests
npm run build --workspace=@mobile-webcam/shared
npm test --workspace=@mobile-webcam/shared

# 2. Server build, unit tests & CLI smoke check
npm run build --workspace=@mobile-webcam/server
npm test --workspace=@mobile-webcam/server
node server/dist/main.js --version

# 3. Mobile Expo SDK 58 typecheck & config plugin check
cd mobile && npm run typecheck
npx expo config --type public

# 4. Landing page build check
./site/build.sh
ls -la _site/
```
