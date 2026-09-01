# 01 — Architecture

## 1. Component map

```
┌──────────────────────── iPhone ────────────────────────┐
│  Expo app (React Native 0.85, UI + settings)           │
│      │ JSI                                             │
│  WebcamServerModule  (custom Expo Module, Swift)       │
│      ├── AVCaptureSession   camera + mic               │
│      ├── AVAssetWriter      H.264 + AAC → fMP4         │
│      └── NWListener         HTTP server, port 8080     │
└──────────────────────────┬─────────────────────────────┘
                           │  Lightning / USB-C cable
                           │  (usbmuxd transport)
┌──────────────────────────┴─────────────────────────────┐
│                    Linux desktop                        │
│  iproxy 8080 → device:8080     (tunnel module)          │
│      │                                                  │
│  Node service (modular monolith)                        │
│      ├── discovery   find + health-check the device     │
│      ├── tunnel      own the iproxy lifecycle           │
│      ├── control     proxy settings to/from the phone   │
│      ├── pipeline    supervise ffmpeg                   │
│      ├── audio       PipeWire null sink                 │
│      └── telemetry   fps, bitrate, drops                │
│      │                                                  │
│  ffmpeg ──┬── /dev/video9   "Mobile Webcam"  (v4l2)     │
│           └── mobile_webcam_mic  (PipeWire null sink)   │
│      │                                                  │
│  OBS · Google Meet · Zoom · Chrome · Firefox            │
└─────────────────────────────────────────────────────────┘
```

## 2. The USB invariant — read this before designing anything

> **`usbmuxd` allows only host→device TCP connections. There is no reverse path.**
> Therefore **the phone is the server and the desktop is the client.**

`iproxy LOCAL_PORT DEVICE_PORT` binds `127.0.0.1:LOCAL_PORT` on the laptop and
forwards each accepted connection to `DEVICE_PORT` on the iPhone. The flow of
connection establishment is strictly one-way. An iPhone connected by cable has no
route back to the laptop: it cannot resolve the laptop, cannot open a socket to
it, and cannot push a stream to it.

**Consequences that must be respected throughout the implementation:**

- The mobile app **listens**. It never dials out to the desktop.
- The desktop **connects**. It never waits to be contacted.
- Any design where the phone pushes RTMP/SRT/WebRTC to a server on the laptop
  **cannot work over a cable.** This is the single most likely way to get this
  project wrong, because push-to-server is the intuitive way to draw it.
- Control commands (change resolution, toggle Cinematic) travel *inside*
  desktop-initiated requests. The phone cannot be notified spontaneously; it can
  only answer. Use a WebSocket that the **desktop opens** if bidirectional
  messaging is needed — once established, a WebSocket carries messages both ways.

This constraint was verified empirically on this machine: with `iproxy` bound
locally and no server running on the phone, `curl` to the local port returns
`Connection reset by peer` immediately — usbmuxd reached the device and the device
refused. The tunnel is real and one-directional.

## 3. Why fragmented MP4 over one connection

Video and audio must arrive **muxed in a single stream**. Two separate endpoints
(`/video` + `/audio`) drift out of sync within minutes because each connection has
independent buffering and no shared timebase.

The chosen container is **fMP4 (fragmented MP4)**, produced on-device by
`AVAssetWriter` with `outputFileTypeProfile = .mpeg4AppleHLS` and an
`AVAssetWriterDelegate` that hands back finished segments in memory rather than
writing to disk. Each segment is written to the open HTTP response as a chunk.

Why this and not the alternatives:

| Option | Verdict |
|---|---|
| **fMP4 via AVAssetWriter delegate** | **Chosen.** Hardware encoded, A/V muxed with a shared timebase, streamable, ffmpeg reads it natively, no hand-rolled muxer. |
| MPEG-TS | Excellent for streaming, but iOS has no built-in TS muxer — would require writing one by hand. |
| MJPEG | Video only, no audio, ~5× the bitrate, no hardware encode path. Kept **only** as a fallback profile. |
| Raw H.264 Annex-B | No audio, no timestamps, sync must be reinvented. |
| WebRTC | Needs a signalling path and works peer-to-peer over IP; wrong shape for a one-way USB tunnel. |

**Fallback profile.** `/stream.mjpeg` must also be implemented. It is the
diagnostic path: if fMP4 fails in ffmpeg, MJPEG proves whether the problem is the
container or the transport. It is also the only profile that works if
`AVAssetWriter` is unavailable.

## 4. Why a custom native module instead of `react-native-vision-camera`

VisionCamera is the default choice for camera work in React Native and is
deliberately **not** used here.

- This project needs to own `AVCaptureSession` outright — to set
  `isCinematicVideoCaptureEnabled` on the device input, select specific lenses,
  and attach an `AVAssetWriter` to the session's outputs. VisionCamera owns its
  own session and does not expose these.
- Two `AVCaptureSession` instances contending for the same camera fail at runtime.
  Using VisionCamera for preview *and* a custom session for capture is not viable.
- The frame path must never enter JavaScript. Encoding or copying frames in JS
  cannot sustain 1080p30 — this is the second most common way to get this project
  wrong. Frames go camera → encoder → socket entirely in Swift.

The Expo app renders a **preview view exported by our own module** (a
`UIView` wrapping `AVCaptureVideoPreviewLayer`), plus all the settings UI.

## 5. Wire protocol

The phone serves plain HTTP/1.1 on **device port 8080**. All paths are relative to
`http://127.0.0.1:8080` **as seen from the desktop after `iproxy 8080 8080`**.

### 5.1 Endpoints

| Method | Path | Returns | Notes |
|---|---|---|---|
| `GET` | `/health` | `200` JSON | Liveness + capability probe. Must answer in <100 ms. |
| `GET` | `/capabilities` | `200` JSON | Device-specific: lenses, supported resolutions, Cinematic support. |
| `GET` | `/stream.mp4` | `200` chunked | Primary. fMP4, H.264 + AAC. Never ends until the client disconnects. |
| `GET` | `/stream.mjpeg` | `200` chunked | Fallback. `multipart/x-mixed-replace`, video only. |
| `GET` | `/settings` | `200` JSON | Current settings. |
| `PATCH` | `/settings` | `200` JSON | Partial update. Returns the full effective settings. |
| `POST` | `/actions/focus` | `204` | Body `{"x":0.5,"y":0.5}`, normalised to the frame. |
| `POST` | `/actions/switch-camera` | `200` JSON | Body `{"lens":"back-wide"}`. |
| `GET` | `/telemetry` | `200` JSON | Instantaneous fps, bitrate, dropped frames, thermal state. |
| `WS` | `/ws` | — | Desktop-initiated. Push telemetry down, settings up, without polling. |

### 5.2 `GET /health`

```json
{
  "ok": true,
  "app": "mobile_webcam",
  "version": "1.0.0",
  "protocol": 1,
  "device": { "model": "iPhone 15 Pro", "ios": "26.1", "name": "Mohamed's iPhone" },
  "streaming": false,
  "battery": 0.82,
  "thermalState": "nominal"
}
```

`protocol` is an integer. The desktop **must refuse to stream** if
`protocol` differs from the value it was built against, and log a clear upgrade
message. This prevents silent breakage across versions.

### 5.3 `GET /capabilities`

Enumerated at runtime from `AVCaptureDevice.DiscoverySession` — never hardcoded,
because it varies per model.

```json
{
  "lenses": [
    { "id": "back-ultrawide", "label": "0.5× Ultra Wide", "minZoom": 1.0, "maxZoom": 2.0 },
    { "id": "back-wide",      "label": "1× Wide",         "minZoom": 1.0, "maxZoom": 8.0 },
    { "id": "back-tele",      "label": "3× Telephoto",    "minZoom": 1.0, "maxZoom": 4.0 },
    { "id": "front",          "label": "Front",           "minZoom": 1.0, "maxZoom": 2.0 }
  ],
  "resolutions": [
    { "width": 1280, "height": 720,  "maxFps": 60 },
    { "width": 1920, "height": 1080, "maxFps": 60 },
    { "width": 3840, "height": 2160, "maxFps": 30 }
  ],
  "cinematic": { "supported": true, "resolutions": [[1920,1080],[3840,2160]], "maxFps": 30 },
  "stabilization": ["off", "standard", "cinematic"],
  "hdr": true
}
```

### 5.4 Settings object

`GET /settings` and `PATCH /settings` share this shape. `PATCH` accepts any subset.

```json
{
  "lens": "back-wide",
  "resolution": { "width": 1920, "height": 1080 },
  "fps": 30,
  "bitrate": 8000000,
  "cinematic": { "enabled": false, "aperture": 2.8 },
  "blurFallback": { "enabled": false, "intensity": 0.6 },
  "zoom": 1.0,
  "torch": false,
  "mirror": false,
  "rotation": 0,
  "stabilization": "standard",
  "hdr": true,
  "exposure": { "mode": "auto", "bias": 0.0, "locked": false },
  "focus":    { "mode": "auto", "locked": false },
  "whiteBalance": { "mode": "auto", "locked": false },
  "audio": { "enabled": true, "sampleRate": 48000, "channels": 1, "bitrate": 128000 }
}
```

**Validation is mandatory on the phone.** Reject unknown lens ids, resolutions not
present in `/capabilities`, fps above the mode's maximum, and out-of-range
numerics with `400` and a body of
`{"error":"invalid_setting","field":"fps","message":"..."}`. Never coerce silently.

### 5.5 Settings that require a session restart

Changing `resolution`, `fps`, `lens`, or `cinematic.enabled` reconfigures
`AVCaptureSession` and **breaks the current fMP4 stream** — the codec parameters
in the initialisation segment become invalid.

Protocol for these:

1. Phone applies the change and closes the `/stream.mp4` response.
2. Desktop observes EOF, waits 500 ms, and reconnects.
3. Phone serves a fresh initialisation segment.
4. Desktop's ffmpeg process is restarted by the `pipeline` module.

The virtual camera device must **not** be torn down during this — see
[06-linux-integration.md §3](06-linux-integration.md) on pinning caps, otherwise
every consumer app loses the device and must be restarted by the user.

Settings that do **not** require a restart, and must be applied live: `zoom`,
`torch`, `mirror`, `exposure`, `focus`, `whiteBalance`, `bitrate`,
`blurFallback.intensity`, `cinematic.aperture`.

## 6. Sequences

### 6.1 Cold start

```
Desktop                          Tunnel            Phone
   │                                │                │
   │ idevice_id -l                  │                │
   │───────────────────────────────>│                │
   │<── UDID ───────────────────────│                │
   │ spawn iproxy 8080 8080         │                │
   │───────────────────────────────>│                │
   │ GET /health ───────────────────┼───────────────>│
   │<────────────────── 200 {ok:true, protocol:1} ───│
   │ GET /capabilities ─────────────┼───────────────>│
   │<────────────────── 200 {...} ──────────────────│
   │ PATCH /settings {1080p,30fps} ─┼───────────────>│
   │<────────────────── 200 {...} ──────────────────│
   │ ensure /dev/video9 + null sink │                │
   │ spawn ffmpeg                   │                │
   │ GET /stream.mp4 ───────────────┼───────────────>│
   │<═══════ fMP4 chunks, continuous ═══════════════│
   │ ffmpeg → /dev/video9 + mobile_webcam_mic        │
```

### 6.2 Live setting change (no restart)

```
Desktop                                        Phone
   │ PATCH /settings {"zoom":2.0} ───────────────>│
   │                            applies to device │
   │<─────────── 200 {full settings} ─────────────│
   │ stream continues uninterrupted               │
```

### 6.3 Restart-requiring change

```
Desktop                                        Phone
   │ PATCH /settings {"resolution":{4K}} ────────>│
   │<─────────── 200 {full settings} ─────────────│
   │<─────────── EOF on /stream.mp4 ──────────────│
   │ kill ffmpeg; wait 500 ms                     │
   │ GET /stream.mp4 ────────────────────────────>│
   │<═══════ new init segment + chunks ═══════════│
   │ respawn ffmpeg (device stays alive)          │
```

### 6.4 Cable unplugged

```
Desktop                          Tunnel            Phone
   │<── connection reset ───────────│      (gone)
   │ ffmpeg exits non-zero          │
   │ pipeline → state DISCONNECTED  │
   │ feed colour-bars placeholder into /dev/video9 │
   │ poll idevice_id -l every 2s    │
   │ ... device reappears ...       │
   │ restart tunnel, resume §6.1 from /health      │
```

Feeding a placeholder rather than closing the device is deliberate: if
`/dev/video9` disappears mid-call, Zoom and Meet drop the camera permanently and
the user must restart the whole application. A static "Reconnecting…" frame keeps
the call alive.

## 7. State machine

The `pipeline` module owns exactly one state machine. Every transition is logged.

```
        ┌──────────────┐
        │ NO_DEVICE    │◄──────────────┐
        └──────┬───────┘               │
        device appears                 │ device lost
        ┌──────▼───────┐               │
        │ TUNNELING    │───── fail ────┤
        └──────┬───────┘               │
        health ok                      │
        ┌──────▼───────┐               │
        │ READY        │───── fail ────┤
        └──────┬───────┘               │
        start requested                │
        ┌──────▼───────┐               │
        │ STREAMING    │───── fail ────┤
        └──────┬───────┘               │
        restart-requiring change       │
        ┌──────▼───────┐               │
        │ RECONFIGURING│───────────────┘
        └──────────────┘
```

`DEGRADED` is a sub-state of `STREAMING`, entered when telemetry reports sustained
frame drops or a `thermalState` of `serious`/`critical`. It automatically steps
the bitrate down and, if drops persist, the resolution — and surfaces this in the
UI rather than silently degrading.

## 8. Security posture

The phone runs an **unauthenticated HTTP server**. Over USB this is acceptable:
usbmuxd only exposes it to processes on the connected host. It becomes a real
vulnerability the moment the same listener is reachable over Wi-Fi.

Mandatory requirements:

- **Bind the listener to all interfaces only when a shared secret is set.**
  Default: bind and serve, but reject any request whose `Host` header is not
  `127.0.0.1` or `localhost`. Over `iproxy` the Host header is the local one.
- **Generate a token on first launch**, shown as a QR code / 6-digit code in the
  app. The desktop sends it as `Authorization: Bearer <token>`. Required for
  everything except `GET /health`.
- Never log the token, and never write frames or audio to disk.
- No analytics, no crash reporters that upload media, no third-party SDKs in the
  media path.
