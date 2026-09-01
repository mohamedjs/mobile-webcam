# 05 — Features

Every feature below carries **acceptance criteria**. A feature is done when all of
its criteria pass on a physical device, not when the code compiles.

Priority: **P0** = v1.0 blocker · **P1** = v1.0 target · **P2** = post-v1.0.

---

## F1 — USB connection and auto-discovery · P0

Detect the iPhone over the cable, open the tunnel, verify the app is serving, with
no manual steps.

**Behaviour**

- Poll `idevice_id -l` every 2 s. Cheap; no udev rules needed for v1.
- On a new UDID: read `ideviceinfo` for name/model/iOS version, emit
  `device.connected`, open `iproxy 8080 8080`.
- Probe `GET /health` with a 2 s timeout, retrying every 1 s for 30 s — the user
  may still be opening the app.
- Compare `protocol` against the server's expected value. On mismatch, refuse to
  stream and state which side must be upgraded.
- On disconnect, tear down the tunnel and enter `NO_DEVICE`.

**Acceptance criteria**

- [ ] Plugging in a phone with the app open reaches `READY` within 5 s, no user action.
- [ ] Unplugging mid-stream reaches `NO_DEVICE` within 3 s without crashing the service.
- [ ] Replugging returns to `STREAMING` within 8 s if `autoStart` is on.
- [ ] With the app closed, the status reads "device connected, app not running" — not a generic error.
- [ ] A protocol mismatch produces: *"Phone app speaks protocol 2, desktop expects 1. Update the desktop service."*
- [ ] `iproxy` dying is detected and restarted with backoff.

---

## F2 — Video streaming · P0

fMP4 (H.264 + AAC) from phone to `/dev/videoN`.

**Behaviour**

- `AVCaptureSession` → `AVAssetWriter` (`.mpeg4AppleHLS`) → delegate hands back
  segments → written as HTTP chunks.
- Target segment duration **200 ms**. Shorter raises overhead; longer raises latency.
- Exactly one streaming client at a time. A second `GET /stream.mp4` gets `409`
  with `{"error":"already_streaming"}`.
- **Back-pressure:** if `NWConnection`'s send completion has not fired for the
  previous segment, drop the new one and increment `droppedSegments`. Never queue
  unboundedly — that is an OOM crash on a phone.

**Acceptance criteria**

- [ ] 1080p30 sustained 30 minutes with no crash and no memory growth beyond 50 MB.
- [ ] Glass-to-glass latency under 250 ms measured with a stopwatch on screen.
- [ ] Dropped segments under 1% over 10 minutes on a thermally nominal device.
- [ ] `/dev/video9` opens in `ffplay`, OBS, Chrome, and Zoom simultaneously *(read-only consumers)*.
- [ ] Killing the phone app makes ffmpeg exit cleanly and the placeholder appear within 2 s.
- [ ] MJPEG fallback produces a usable image when forced via `/settings/advanced`.

---

## F3 — Resolution and frame-rate control · P0

**Behaviour**

- Offered values come from `/capabilities`, never a hardcoded list.
- 720p / 1080p / 4K; 24 / 30 / 60 fps, filtered by what the active mode supports.
- Both require a session restart — the UI marks them and shows a brief interruption warning.
- Bitrate defaults per resolution: 720p 4 Mbps, 1080p 8 Mbps, 4K 20 Mbps; manually
  overridable 1–40 Mbps and applied **live** without a restart.

**Acceptance criteria**

- [ ] Every advertised combination streams successfully.
- [ ] Switching 1080p → 4K recovers within 3 s and `/dev/video9` is never destroyed.
- [ ] Consumers (OBS, Meet) survive the switch without being restarted.
- [ ] Requesting an unsupported combination returns `400` naming the offending field.
- [ ] A bitrate change takes visible effect within 1 s with no interruption.

---

## F4 — Lens selection and zoom · P0

**Behaviour**

- Enumerate real lenses via `AVCaptureDevice.DiscoverySession`: ultra-wide, wide,
  telephoto, front. Never assume — an iPhone SE has one rear lens.
- **Default to the rear wide lens on every launch.** Persist the user's choice but
  ship the rear camera as the factory default.
- Zoom is continuous within the active lens's range, applied live.
- Optional `lockLens` setting: hides the switcher entirely so the stream can never
  change camera mid-meeting.

**Acceptance criteria**

- [ ] The lens list matches the physical device; no phantom lenses on an SE.
- [ ] Switching lenses completes in under 1.5 s.
- [ ] Zoom is smooth with no visible stepping; debounced at 120 ms.
- [ ] With `lockLens` on, the switcher is absent and `POST /actions/switch-camera` returns `403`.
- [ ] A fresh install starts on the rear wide lens.

---

## F5 — Cinematic mode / background blur · P1

The headline feature, and the one with real device constraints. **Three tiers.**

### Tier 1 — Native Cinematic capture (iOS 26+, supported hardware)

iOS 26 exposes `isCinematicVideoCaptureEnabled` on `AVCaptureDeviceInput`. Setting
it configures the whole session for Cinematic output, and — decisively for this
project — **the video data output produces frames with the shallow depth-of-field
effect already baked in**, which is exactly what is needed when sending frames to
a remote device. No compositing work on our side.

- Detect support at runtime. Never gate on a hardcoded model list.
- Aperture is user-adjustable f/2.0 – f/16.
- Cinematic constrains resolution and fps; re-read `/capabilities` after enabling
  and clamp the UI to what remains.

### Tier 2 — Depth-based blur (iOS 16+, dual-camera devices)

- `AVCaptureDepthDataOutput` alongside video, synchronised with
  `AVCaptureDataOutputSynchronizer`.
- Blur via `CIMaskedVariableBlur` in a Metal-backed `CIContext`.
- Costs frame rate. Cap at 1080p30 and warn.

### Tier 3 — Segmentation blur (any device, iOS 16+)

- `VNGeneratePersonSegmentationRequest` at `.balanced`, blur outside the mask.
- Lowest quality — edge artefacts around hair. Documented as such in the UI.

Also worth surfacing: iOS's **system Portrait video effect**, available from
Control Center to apps using the VoIP background mode. Free, no code in the media
path. Mention it in `/settings/cinematic` as an alternative the user can toggle
themselves.

**Acceptance criteria**

- [ ] On iOS 26 + supported hardware, Tier 1 activates and blur is visible in OBS.
- [ ] On an unsupported device, Tier 1 is hidden with a clear reason — never a broken toggle.
- [ ] Aperture changes are visible within 500 ms and require no restart.
- [ ] Tier 2 holds ≥25 fps at 1080p.
- [ ] Tier 3 works on a single-lens device.
- [ ] Enabling Cinematic re-reads capabilities and clamps unavailable resolutions.
- [ ] Every tier survives 10 minutes without a thermal shutdown.

---

## F6 — Microphone streaming · P0

**Behaviour**

- `AVCaptureAudioDataOutput` into the same `AVAssetWriter`, so A/V share a timebase.
- AAC 48 kHz mono 128 kbps by default; stereo optional.
- Desktop side: ffmpeg writes to a PipeWire null sink; its `.monitor` source is the
  virtual microphone.
- Mic can be disabled — then ffmpeg runs video-only and the sink is left in place.
- Configure the session with `.videoChatMode` / `.measurement` so iOS does not
  apply aggressive processing intended for phone calls.

**Acceptance criteria**

- [ ] "Mobile Webcam Mic" appears in `pavucontrol` and GNOME Sound settings.
- [ ] Selectable in Google Meet, Zoom, and OBS.
- [ ] A/V drift under 100 ms after 30 minutes.
- [ ] Toggling the mic off and on recovers within 3 s.
- [ ] The level meter in the app tracks real input.
- [ ] Killing the service unloads the sink; it does not accumulate on restart.

---

## F7 — Exposure, focus, white balance · P1

- Tap-to-focus on the preview, with a reticle; normalised coordinates sent to the phone.
- Independent auto/locked modes for focus, exposure, white balance.
- Exposure bias −2.0 … +2.0 EV.
- **Lock-all** button — the single most useful control for meetings, where
  autofocus hunting is the most visible artefact.

**Acceptance criteria**

- [ ] Tapping the preview focuses that point within 500 ms; the reticle animates.
- [ ] Locking focus stops hunting when a hand passes the lens.
- [ ] Exposure bias is visible in the output.
- [ ] Locks survive a lens switch or are explicitly reset with a toast saying so.

---

## F8 — Image adjustments · P1

Mirror (horizontal flip), rotation (0/90/180/270), stabilisation mode, HDR toggle,
torch.

Mirror and rotation are applied **on the phone**, not in ffmpeg — an ffmpeg filter
change requires restarting the process and interrupts every consumer.

**Acceptance criteria**

- [ ] Mirror applies live with no interruption.
- [ ] Rotation produces correct dimensions in `/dev/video9` (90° swaps width/height and restarts the pipeline).
- [ ] Torch toggles instantly and is forced off when streaming stops.
- [ ] Stabilisation modes are offered only where the hardware supports them.

---

## F9 — OBS direct mode · P1

OBS can read the phone's HTTP stream **directly** through a Media Source, skipping
v4l2loopback and ffmpeg entirely. Lower latency, one less moving part.

- The desktop UI shows the exact URL to paste.
- Requires the tunnel to be open — the Node service still runs, just without the pipeline.

**Acceptance criteria**

- [ ] An OBS Media Source pointed at `http://127.0.0.1:8080/stream.mp4` plays.
- [ ] Direct mode latency is measurably lower than the v4l2 path.
- [ ] The UI explains the trade-off: OBS only, no Meet/Zoom.
- [ ] Direct mode and v4l2 mode are **mutually exclusive** — the phone serves one
      streaming client at a time (F2). Selecting direct mode stops the pipeline
      first; the UI states this rather than failing with a bare `409`.

---

## F10 — Desktop control UI · P1

Static page on `127.0.0.1:47800`: live preview thumbnail, state badge, every
setting, telemetry graphs, log tail, start/stop.

**Acceptance criteria**

- [ ] Reflects state changes within 1 s over WebSocket, no polling.
- [ ] Every phone setting is adjustable from the desktop.
- [ ] Works in Chrome and Firefox.
- [ ] Does not bind to any non-loopback interface.

---

## F11 — Telemetry and diagnostics · P1

fps, bitrate, dropped frames, thermal state, battery, latency estimate; 300-sample
ring buffer; `scripts/doctor.sh` for one-shot environment checks.

**Acceptance criteria**

- [ ] `doctor.sh` detects each of: missing `iproxy`, unloaded module, missing sink, unpaired device, app not running — one actionable line each.
- [ ] Thermal `serious` triggers automatic quality reduction and says so in the UI.
- [ ] Telemetry costs under 1% CPU.

---

## F12 — Session persistence · P0

iOS suspends listening sockets for backgrounded apps (constraint C5). This is
mitigated, not solved.

**Mitigations**

- `isIdleTimerDisabled = true` while streaming — the screen never auto-locks.
- `UIBackgroundModes: ["audio"]` with an active audio session buys real background
  time when the mic is enabled.
- On `willResignActive`, warn on-screen and keep serving as long as iOS allows.
- On resume, restart the server automatically and re-announce readiness.
- The desktop shows the placeholder feed instead of dropping the device.

**Acceptance criteria**

- [ ] Screen never dims or locks while streaming.
- [ ] Backgrounding the app shows a clear on-phone warning.
- [ ] Returning to the app resumes streaming within 5 s with no manual step.
- [ ] Consumers never lose `/dev/video9`, even across a full app restart.
- [ ] Low Power Mode is detected and warned about.

---

## F13 — Security · P0

Bearer token, loopback-only Host check, no media on disk. Full posture in
[01-architecture.md §8](01-architecture.md).

**Acceptance criteria**

- [ ] Requests without a valid token get `401`, except `/health`.
- [ ] The token is regenerable from the app; the desktop reconnects with the new one.
- [ ] The token is never logged.
- [ ] No frame or audio buffer is ever written to disk.
- [ ] The desktop API refuses to bind anything but `127.0.0.1`.

---

## F14 — Post-v1.0 · P2

Android via `adb reverse` · multi-client streaming · HEVC · LUTs and colour grading
· virtual green screen · remote shutter · overlays and watermarks · a Wi-Fi
transport for people who accept the trade-off.
