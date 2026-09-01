# 07 — Roadmap

Seven phases. Each ends at a state that can be demonstrated. **Do not begin a phase
before its predecessor's exit criteria pass** — every phase here exists to
de-risk the one after it.

---

## Phase 0 — Spike: prove the transport · ~1 day

Before any app architecture, prove the pipeline end to end with throwaway code.

- Any iOS app that serves HTTP (or a hand-written 100-line Swift `NWListener`).
- `iproxy` + `ffmpeg` + `v4l2loopback` on the desktop, run by hand.
- Get *any* moving image from the phone into `ffplay /dev/video9`.

**Exit criteria**

- [ ] A live image from the phone camera renders on the Linux desktop over the cable.
- [ ] Measured latency and achievable resolution recorded in `docs/`.

**Why first:** every subsequent phase assumes the transport works. If fMP4 over
`NWListener` has an unforeseen problem, it must surface on day one, not in week
five with an app built on top of it.

---

## Phase 1 — Foundations · ~3 days

- Monorepo, workspaces, TypeScript configs, lint, format, hooks.
- `packages/shared`: Zod schemas for `Settings`, `Capabilities`, `Health`, `Telemetry`.
- `server/`: kernel — EventBus, logger, `ManagedProcess`, `Result`, errors.
- `scripts/setup-linux.sh` and `scripts/doctor.sh`.

**Exit criteria**

- [ ] `npm run typecheck` and `npm run lint` pass across all workspaces.
- [ ] `doctor.sh` correctly reports the current machine's state.
- [ ] `setup-linux.sh` creates `/dev/video9` and the null sink idempotently.

---

## Phase 2 — Mobile capture and server · ~1.5 weeks

The largest and riskiest phase. Almost entirely Swift.

- Local Expo Module scaffold + config plugin (Info.plist keys, including
  `NSLocalNetworkUsageDescription`).
- `CaptureSessionController`: session, lens discovery, capabilities.
- `FragmentedMP4Writer`: `AVAssetWriter` + delegate → in-memory segments.
- `HTTPServer` on `NWListener`: routing, auth, back-pressure-aware chunked writes.
- `WebcamPreviewView` for the RN preview.
- Minimal RN UI: preview, start/stop, connected-client count.

**Exit criteria**

- [ ] `curl http://127.0.0.1:8080/health` through the tunnel returns valid JSON.
- [ ] `GET /stream.mp4` piped to `ffplay` plays with audio.
- [ ] 1080p30 for 10 minutes with no memory growth.
- [ ] A slow consumer causes dropped segments, not unbounded memory.

---

## Phase 3 — Desktop pipeline · ~1 week

- `discovery`, `tunnel`, `device-control`, `video-device`, `audio-device`, `pipeline`.
- `FfmpegArgs` with full unit coverage.
- The state machine including reconnect and placeholder feed.
- Local API on 47800 with WebSocket.

**Exit criteria**

- [ ] Plug in phone + open app → `/dev/video9` live with no manual step.
- [ ] Unplug/replug recovers automatically.
- [ ] The virtual camera survives an ffmpeg restart without consumers noticing.
- [ ] Mic reaches `mobile_webcam_mic` with drift under 100 ms over 30 minutes.
- [ ] Verified working in OBS, Google Meet, and Zoom.

---

## Phase 4 — Controls · ~1 week

F3, F4, F7, F8 — resolution, fps, lens, zoom, focus, exposure, white balance,
mirror, rotation, torch. Settings screens on the phone; equivalents in the desktop UI.

**Exit criteria**

- [ ] Every setting round-trips phone ↔ desktop and survives an app restart.
- [ ] Restart-requiring changes never destroy `/dev/video9`.
- [ ] Live changes apply within 1 s with no interruption.
- [ ] A rejected setting shows a clear message and the UI reverts.

---

## Phase 5 — Cinematic · ~1 week

F5, all three tiers, with runtime capability detection.

**Exit criteria**

- [ ] Tier 1 verified on iOS 26 hardware; blur visible in OBS.
- [ ] Graceful, explained degradation on older devices.
- [ ] Aperture adjustable live.
- [ ] No thermal shutdown in 10 minutes at 1080p30.

---

## Phase 6 — Hardening · ~1 week

F11, F12, F13 — telemetry, session persistence, security. Thermal degradation.
Error messages audited for actionability. Full diagnostics screen.

**Exit criteria**

- [ ] A 2-hour continuous session with no crash and no leak.
- [ ] Every error path produces a message naming the fix.
- [ ] Auth cannot be bypassed except on `/health`.
- [ ] Thermal pressure reduces quality automatically and visibly.

---

## Phase 7 — Polish and release · ~4 days

Desktop control UI, systemd unit, README with real screenshots, an install script,
and a manual test pass across the device matrix.

**Exit criteria**

- [ ] A new user reaches a working webcam from a clean checkout using only the README.
- [ ] Verified on at least two different iPhone models.
- [ ] Verified in OBS, Meet, Zoom, Chrome, and Firefox.

---

## Estimate

**Roughly 6–7 weeks** of focused single-developer work. Phase 2 dominates and is
the one most likely to overrun — it is the phase with the least prior art, since
almost nobody streams fMP4 out of an `NWListener` on iOS.

## Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| `AVAssetWriter` delegate segments prove unusable for live streaming | High — forces a container rewrite | Phase 0 spike tests exactly this before anything is built on it |
| iOS backgrounding kills the server too aggressively | Medium — hurts usability | F12 mitigations; the constraint is documented, not hidden |
| Cinematic API differs from the WWDC session's description | Medium — F5 tier 1 slips | Tiers 2 and 3 are independent and ship regardless |
| Thermal throttling at 4K | Medium | Automatic degradation in F11; 4K is explicitly best-effort |
| `exclusive_caps` reopen bug | Low — already understood | `v4l2loopback-ctl set-caps`, documented in 06 §2.3 |
| Apple Developer account / signing friction | Low but blocking | Resolve during Phase 0, before it can block Phase 2 |
