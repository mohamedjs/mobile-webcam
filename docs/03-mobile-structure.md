# 03 — Mobile App Structure

## 1. Organising principle

**Feature-first, not type-first.** Code is grouped by what it does for the user,
not by what kind of file it is. There is no top-level `components/`, `hooks/`, or
`utils/` folder holding unrelated things.

Rules:

1. A feature owns its components, hooks, state, and types.
2. A feature imports from other features **only through that feature's
   `index.ts`**. Reaching into `features/camera/components/Foo` from another
   feature is forbidden — lint rule enforced.
3. Code shared by three or more features moves to `src/shared/`. Two features
   sharing something is not yet a pattern; leave it duplicated.
4. Only `src/features/*/index.ts` may be imported across feature boundaries.
5. Every file stays under 500 lines.

## 2. File tree

```
mobile/
├── app.config.ts
├── eas.json
├── package.json
├── tsconfig.json
├── babel.config.js
├── index.ts
│
├── app/                                  # expo-router routes; screens only
│   ├── _layout.tsx                       # providers, theme, splash gate
│   ├── index.tsx                         # Home — preview + start/stop
│   ├── settings/
│   │   ├── _layout.tsx
│   │   ├── video.tsx
│   │   ├── cinematic.tsx
│   │   ├── audio.tsx
│   │   └── advanced.tsx
│   ├── connection.tsx                    # pairing code, server status
│   └── diagnostics.tsx                   # telemetry, logs, self-test
│
├── src/
│   ├── features/
│   │   ├── camera/
│   │   │   ├── index.ts
│   │   │   ├── components/
│   │   │   │   ├── CameraPreview.tsx      # wraps the native preview view
│   │   │   │   ├── LensSelector.tsx       # 0.5× / 1× / 3× pills
│   │   │   │   ├── ZoomSlider.tsx
│   │   │   │   ├── FocusReticle.tsx       # tap-to-focus target
│   │   │   │   └── TorchButton.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useCapabilities.ts
│   │   │   │   ├── useCameraControls.ts
│   │   │   │   └── useTapToFocus.ts
│   │   │   ├── store/cameraStore.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── streaming/
│   │   │   ├── index.ts
│   │   │   ├── components/
│   │   │   │   ├── StreamToggle.tsx       # the big start/stop control
│   │   │   │   ├── StreamStatusBadge.tsx
│   │   │   │   └── ClientList.tsx         # who is connected
│   │   │   ├── hooks/
│   │   │   │   ├── useStreamState.ts
│   │   │   │   └── useServerLifecycle.ts
│   │   │   ├── store/streamStore.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── cinematic/
│   │   │   ├── index.ts
│   │   │   ├── components/
│   │   │   │   ├── CinematicToggle.tsx
│   │   │   │   ├── ApertureSlider.tsx     # f/2.0 – f/16
│   │   │   │   ├── BlurFallbackPanel.tsx  # pre-iOS-26 devices
│   │   │   │   └── UnsupportedNotice.tsx
│   │   │   ├── hooks/useCinematic.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── audio/
│   │   │   ├── index.ts
│   │   │   ├── components/
│   │   │   │   ├── MicToggle.tsx
│   │   │   │   ├── InputLevelMeter.tsx
│   │   │   │   └── AudioQualityPicker.tsx
│   │   │   ├── hooks/useAudioLevels.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── connection/
│   │   │   ├── index.ts
│   │   │   ├── components/
│   │   │   │   ├── PairingCode.tsx
│   │   │   │   ├── ServerAddress.tsx
│   │   │   │   └── PermissionGate.tsx     # camera/mic/local-network
│   │   │   ├── hooks/
│   │   │   │   ├── usePermissions.ts
│   │   │   │   └── usePairingToken.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── settings/
│   │   │   ├── index.ts
│   │   │   ├── components/
│   │   │   │   ├── ResolutionPicker.tsx
│   │   │   │   ├── FpsPicker.tsx
│   │   │   │   ├── BitrateSlider.tsx
│   │   │   │   ├── SettingRow.tsx
│   │   │   │   └── RestartWarning.tsx     # "this will briefly interrupt"
│   │   │   ├── hooks/useSettingsSync.ts
│   │   │   ├── store/settingsStore.ts     # the single source of truth
│   │   │   └── types.ts
│   │   │
│   │   └── diagnostics/
│   │       ├── index.ts
│   │       ├── components/
│   │       │   ├── TelemetryPanel.tsx
│   │       │   ├── ThermalBadge.tsx
│   │       │   └── LogViewer.tsx
│   │       ├── hooks/useTelemetry.ts
│   │       └── types.ts
│   │
│   ├── shared/
│   │   ├── ui/                # Button, Slider, Card, Pill, Screen, Toast
│   │   ├── theme/             # tokens.ts, useTheme.ts — dark-first
│   │   ├── hooks/             # useAppState, useKeepAwake, useDebounce
│   │   ├── lib/               # logger.ts, format.ts, result.ts
│   │   └── types/
│   │
│   └── native/
│       ├── WebcamServer.ts    # typed facade over the native module
│       ├── WebcamPreview.tsx  # typed wrapper for the native view
│       └── events.ts          # native → JS event definitions
│
└── modules/webcam-server/                 # local Expo Module
    ├── expo-module.config.json
    ├── plugin/index.ts                    # config plugin: Info.plist keys
    ├── ios/
    │   ├── WebcamServerModule.swift       # Expo Module surface
    │   ├── Capture/
    │   │   ├── CaptureSessionController.swift
    │   │   ├── LensDiscovery.swift
    │   │   ├── CinematicController.swift
    │   │   └── DepthBlurRenderer.swift
    │   ├── Encoding/
    │   │   ├── FragmentedMP4Writer.swift  # AVAssetWriter + delegate
    │   │   ├── MJPEGEncoder.swift         # fallback profile
    │   │   └── EncoderSettings.swift
    │   ├── Server/
    │   │   ├── HTTPServer.swift           # NWListener
    │   │   ├── HTTPRequest.swift
    │   │   ├── HTTPResponse.swift
    │   │   ├── Routes.swift
    │   │   ├── StreamConnection.swift     # back-pressure aware writer
    │   │   └── Auth.swift
    │   ├── Views/WebcamPreviewView.swift
    │   └── Support/
    │       ├── Telemetry.swift
    │       ├── SettingsStore.swift
    │       └── Log.swift
    └── src/                               # TS declarations for the module
```

## 3. The native module surface

`src/native/WebcamServer.ts` is the only file in the app allowed to touch the
native module directly. Everything else goes through hooks.

```ts
export interface WebcamServerAPI {
  startServer(port: number, token: string): Promise<{ port: number }>;
  stopServer(): Promise<void>;
  isRunning(): boolean;

  getCapabilities(): Promise<Capabilities>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<Settings>;

  focusAt(x: number, y: number): Promise<void>;
  setLens(lensId: string): Promise<Capabilities>;

  getTelemetry(): Promise<Telemetry>;
}

// native → JS events
export type WebcamServerEvents = {
  onClientConnected:    { clientId: string; profile: 'fmp4' | 'mjpeg' };
  onClientDisconnected: { clientId: string; reason: string };
  onTelemetry:          Telemetry;                  // ~1 Hz
  onThermalStateChange: { state: ThermalState };
  onError:              { code: string; message: string; fatal: boolean };
};
```

**`updateSettings` returns the full effective settings**, never void. The phone is
the authority on what was actually applied — a requested 4K60 may come back as
4K30 because the hardware refused. The store writes what comes back, never the
optimistic local value.

## 4. State management

One Zustand store per feature. `settingsStore` is the authority; the others hold
ephemeral UI state.

```ts
interface SettingsStore {
  settings: Settings | null;
  capabilities: Capabilities | null;
  pending: Partial<Settings>;        // in flight
  error: string | null;

  hydrate(): Promise<void>;          // native → store on mount
  patch(p: Partial<Settings>): Promise<void>;
  reset(): Promise<void>;
}
```

`patch()` rules:

1. Write to `pending` immediately so the UI feels responsive.
2. Call `updateSettings`.
3. Replace `settings` with the returned object; clear `pending`.
4. On rejection, clear `pending` and surface a toast. **Never leave the UI showing
   a value the camera did not accept.**
5. Debounce continuous controls (zoom, aperture, bitrate) at **120 ms**. A slider
   dragged across its range must not fire fifty native calls.

## 5. Screens

| Route | Contents |
|---|---|
| `/` | Full-bleed preview, lens pills, zoom slider, big Start/Stop, status badge, connected-client count. |
| `/settings/video` | Resolution, fps, bitrate, stabilisation, HDR, mirror, rotation. Restart-requiring rows are marked. |
| `/settings/cinematic` | Cinematic toggle, aperture slider, live preview. On unsupported devices: an explanation plus the fallback blur panel. |
| `/settings/audio` | Mic on/off, sample rate, channels, bitrate, live level meter. |
| `/settings/advanced` | Port, token regeneration, MJPEG fallback toggle, log level, factory reset. |
| `/connection` | Pairing code, permission checklist with deep links to Settings.app, server bind state. |
| `/diagnostics` | Live fps/bitrate/drops, thermal state, battery, last 200 log lines, "Run self-test". |

## 6. Permission gating

`PermissionGate` blocks the Start control until all three are granted, and names
which one is missing with a direct link to `Settings.app`.

| Permission | Failure mode if denied |
|---|---|
| Camera | No video. Obvious. |
| Microphone | Video works, audio silently absent. |
| **Local Network** | **`NWListener` fails to bind. The app looks healthy and the desktop sees `Connection reset by peer`.** |

The Local Network case is the highest-value diagnostic in the whole app. On bind
failure the app must display: *"iOS blocked the local network. Settings → Privacy
& Security → Local Network → mobile_webcam."* Not a generic error.

## 7. Testing

| Layer | Tool | Scope |
|---|---|---|
| Unit (JS) | `jest-expo` | Store reducers, validation, formatting. |
| Component | `@testing-library/react-native` | Feature components with the native module mocked. |
| Native | XCTest | `FragmentedMP4Writer` produces a valid init segment; `HTTPServer` parses requests and honours back-pressure. |
| Manual | `docs/` checklist | Physical-device matrix — no simulator has a camera. |

The native module is mocked in `src/native/__mocks__/WebcamServer.ts`, returning a
realistic `Capabilities` fixture for an iPhone 15 Pro.
