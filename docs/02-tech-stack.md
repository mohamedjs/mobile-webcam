# 02 — Tech Stack

## 1. Version policy — read first

Two classes of version appear in this document.

**Verified (2026-09-01).** Do not change these without re-verifying:

| Item | Version | Source |
|---|---|---|
| Expo SDK | 56 | Released 2026-05-21 |
| React Native | 0.85 | Ships with SDK 56 |
| React | 19.2 | Ships with SDK 56 |
| Architecture | New Architecture only — no legacy bridge fallback | SDK 56 |
| JS engine | Hermes v1 | SDK 56 default |
| Node.js | 22.17.0 | Installed on the target machine |
| npm | 11.4.2 | Installed on the target machine |
| ffmpeg | 6.1.1 | Ubuntu 24.04 `7:6.1.1-3ubuntu5` |
| v4l2loopback | 0.12.7 | Ubuntu 24.04 dkms package |
| usbmuxd | 1.1.1 | Ubuntu 24.04 |

**Resolve at install time.** For everything else, install the latest version
compatible with Expo SDK 56 and record the resolved version in the lockfile. Do
**not** copy a version number from this document into `package.json` — a version
pinned in prose ages badly and a wrong pin costs more than an unpinned one.

```bash
npx expo install <package>   # resolves the SDK-56-compatible version automatically
```

Always use `npx expo install`, never bare `npm install`, for anything with native code.

## 2. Prerequisites

### 2.1 Apple

- **Paid Apple Developer Program membership.** Required for a development build
  that survives more than 7 days on a physical device (constraint C3).
- **iOS 26+ on the iPhone** for Cinematic capture. The app must run on iOS 16+
  with Cinematic disabled and hidden on older versions.
- **A build machine.** Xcode does not run on Linux. Use **EAS Build**, Expo's
  hosted macOS builders — this works from the Ubuntu development machine and is
  the assumed path throughout these docs.

### 2.2 Linux desktop

```bash
sudo apt install -y \
  v4l2loopback-dkms v4l2loopback-utils \
  libusbmuxd-tools usbmuxd libimobiledevice-utils \
  ffmpeg pipewire-audio-client-libraries pipewire-utils
```

`libusbmuxd-tools` is the package that provides `iproxy` on Ubuntu 24.04 — **not**
`libimobiledevice-utils`, which is the common and wrong assumption.

Verify:

```bash
iproxy --help >/dev/null && echo "iproxy ok"
idevice_id -l                      # must print the iPhone UDID
modinfo v4l2loopback | head -3
pactl info | grep 'Server Name'    # expect PipeWire
```

## 3. Mobile stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Expo SDK 56, React Native 0.85 | Requested. New Architecture, prebuilt XCFrameworks, faster iOS builds. |
| Language (JS) | TypeScript, `strict: true` | Non-negotiable. Wire types are shared with the server. |
| Language (native) | Swift 5.9+ | AVFoundation and Network.framework are Swift-first. |
| Native bridge | **Expo Modules API** | First-class in SDK 56; config plugins handle Info.plist and entitlements. |
| Navigation | `expo-router` | File-based routing; the app is a handful of screens. |
| State | **Zustand** | The settings object is a single flat store synced with the native module. Redux is overkill here. |
| Server state | None | There is no remote API. The phone *is* the server. |
| Styling | StyleSheet + a small design-token module | No UI kit. The UI is roughly six screens; a component library is dead weight. |
| Storage | `expo-secure-store` (token), `@react-native-async-storage/async-storage` (settings) | Token must not sit in plain storage. |
| Icons | `@expo/vector-icons` | Bundled. |

**Explicitly rejected:** `react-native-vision-camera` — reasoned in
[01-architecture.md §4](01-architecture.md). `expo-camera` — no session-level
control, no Cinematic, no encoder access.

### 3.1 Native module: `WebcamServerModule`

Written as a **local Expo Module** at `modules/webcam-server/`. Not published to
npm; it lives in the repo and is linked by `expo prebuild`.

| Responsibility | Apple API |
|---|---|
| Capture session | `AVCaptureSession`, `AVCaptureDeviceInput`, `AVCaptureVideoDataOutput`, `AVCaptureAudioDataOutput` |
| Lens discovery | `AVCaptureDevice.DiscoverySession` |
| Cinematic capture | `AVCaptureDeviceInput.isCinematicVideoCaptureEnabled` (iOS 26+) |
| Depth (fallback blur) | `AVCaptureDepthDataOutput`, `AVCaptureDataOutputSynchronizer` |
| Segmentation (fallback blur) | `Vision` — `VNGeneratePersonSegmentationRequest` |
| Blur render | `CoreImage` — `CIMaskedVariableBlur`, Metal-backed `CIContext` |
| Encode + mux | `AVAssetWriter` with `outputFileTypeProfile = .mpeg4AppleHLS` + `AVAssetWriterDelegate` |
| HTTP server | `Network.framework` — `NWListener` on TCP 8080 |
| Preview | `AVCaptureVideoPreviewLayer` in an exported `ExpoView` |
| Keep awake | `UIApplication.shared.isIdleTimerDisabled` |

**Why `Network.framework` and not a third-party HTTP server (GCDWebServer,
Telegraph):** the server needs to hold a response open for hours and write
back-pressure-aware chunks. `NWConnection` exposes send completion handlers, which
is exactly the signal needed to drop frames when the consumer falls behind.
Third-party servers buffer unboundedly and the app runs out of memory. If a
library is used anyway, it **must** expose per-write completion.

### 3.2 Expo config plugins required

Configured in `app.config.ts`:

- `expo-build-properties` — set `ios.deploymentTarget` to `"16.0"`.
- The local `webcam-server` plugin, which must add:
  - `NSCameraUsageDescription`
  - `NSMicrophoneUsageDescription`
  - `NSLocalNetworkUsageDescription` — **required even over USB**, because
    `NWListener` binding a TCP port triggers the Local Network permission prompt.
    Denying it makes the server silently fail to bind. This is precisely the
    failure mode that broke the off-the-shelf app this project replaces.
  - `UIBackgroundModes: ["audio"]` — see [05-features.md §F12](05-features.md).
  - `UIFileSharingEnabled: false`

## 4. Desktop stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 22.17 LTS, ESM (`"type": "module"`) | Installed; native `fetch`, `node:test`, top-level await. |
| Language | TypeScript, `strict: true` | Shared wire types with the mobile app. |
| Build | `tsc` | No bundler. It is a server; bundling buys nothing. |
| HTTP/WS API | **Fastify** + `@fastify/websocket` | Local control API for the desktop UI. Faster and lighter than Express, first-class schema validation. |
| Validation | **Zod** | One schema set, shared with mobile, validating both wire directions. |
| Process supervision | `node:child_process` | ffmpeg and iproxy are child processes. No PM2 — the service owns its children. |
| Media | **ffmpeg as a subprocess** | Never a WASM/JS decoder. Hardware paths and V4L2 output live in ffmpeg. |
| Device detection | `libimobiledevice` CLIs (`idevice_id`) | Already installed, no native addon to compile. |
| Audio | `pactl` CLI | PipeWire's Pulse shim. No native binding needed. |
| Logging | **pino** | Structured JSON, low overhead, pretty-printed in dev. |
| Config | Zod-validated file at `~/.config/mobile_webcam/config.json` + env override | |
| Tests | `node:test` + `c8` | Built in. No Jest. |
| Desktop UI | Fastify serving a small static React page on `127.0.0.1:47800` | An Electron app for six sliders is not justified. Opens in the browser. |

**Explicitly rejected:** Electron (weight), NestJS (DI framework overhead for
seven modules), Prisma/any database — see §6.

## 5. Shared code

`packages/shared/` is consumed by both halves.

- Zod schemas for `Settings`, `Capabilities`, `Health`, `Telemetry`
- TypeScript types inferred from those schemas
- The `PROTOCOL_VERSION` constant
- Error codes

Consumed by the mobile app via a relative path in `tsconfig.json` `paths`, and by
the server as an npm workspace. **The schema is defined once.** Two hand-maintained
copies of a wire format diverge within weeks.

## 6. Persistence

**There is no database.** Deliberate. The entire persistent state is one settings
object of about 30 fields and one auth token.

- Desktop: `~/.config/mobile_webcam/config.json`, written atomically
  (write to a temp file in the same directory, then `rename`).
- Mobile: AsyncStorage for settings, SecureStore for the token.

Adding SQLite/Postgres here would add a schema, migrations, a connection lifecycle,
and a backup story to protect 2 KB of JSON.

## 7. Repository layout

An npm workspaces monorepo at `/var/www/html/old/mobile_webcam`:

```
mobile_webcam/
├── package.json           # workspaces: ["mobile","server","packages/*"]
├── tsconfig.base.json
├── docs/
├── mobile/                # Expo app          → 03-mobile-structure.md
├── server/                # Node monolith     → 04-server-structure.md
├── packages/shared/       # Zod schemas + types
└── scripts/               # setup + dev helpers
```

Per the repository conventions: no working files at the repository root, and every
source file stays under 500 lines.

## 8. Tooling

| Tool | Config |
|---|---|
| ESLint | `eslint-config-expo` (mobile) + `@typescript-eslint` (server) |
| Prettier | 2-space, single quotes, trailing commas, 100 columns |
| Husky + lint-staged | Pre-commit: typecheck + lint on staged files |
| EAS | `eas.json` with `development`, `preview`, `production` profiles |

## 9. Commands

```bash
# once
npm install
npm run setup:linux            # scripts/setup-linux.sh — modules, sinks, udev

# mobile — first build only, ~15 min on EAS
cd mobile
npx expo prebuild --clean
eas build --profile development --platform ios
# install the resulting .ipa, then for day-to-day work:
npx expo start --dev-client

# desktop
cd server
npm run dev                    # tsx watch, pino-pretty
npm run build && npm start
```
