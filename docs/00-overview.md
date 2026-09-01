# 00 — Overview

## 1. What this project is

`mobile_webcam` makes an iPhone act as a high-quality webcam and microphone for a
Linux desktop, connected **by USB cable**. It has two halves:

1. **The mobile app** (Expo SDK 56 + React Native + a custom Swift native module)
   runs on the iPhone. It captures camera and microphone, hardware-encodes to
   H.264/AAC, and **serves** that stream over an HTTP server running on the phone.
2. **The desktop service** (Node.js modular monolith) runs on Linux. It opens a
   USB tunnel to the phone, **connects** to the phone's HTTP server, and pipes the
   stream into a virtual camera (`/dev/video*`) and a virtual microphone
   (PipeWire null sink) that every Linux app can consume.

## 2. Why it exists

Every commercial product in this space fails at least one requirement:

| Product | Linux desktop client | 1080p without paying | iPhone over cable |
|---|---|---|---|
| Camo Studio | No — Windows/macOS only | — | — |
| iVCam | No — Windows only | — | — |
| DroidCam | Yes | No — free tier is 640×480 | Yes |
| Iriun | Yes | Yes | No — Wi-Fi only on iOS |
| **mobile_webcam** | Yes | Yes | Yes |

The gap is structural, not commercial — see the USB invariant in
[01-architecture.md](01-architecture.md). Vendors who solve iOS-over-USB ship
proprietary Windows/macOS drivers and do not port them to Linux.

## 3. Goals

**G1.** 1080p30 video from the iPhone rear camera into `/dev/video*` on Linux, over USB.
**G2.** iPhone microphone into a virtual Linux input device, A/V synchronised.
**G3.** On-device control: resolution, frame rate, lens, zoom, exposure, focus.
**G4.** Cinematic mode — real shallow depth-of-field, baked into the streamed frames.
**G5.** Works in OBS, Google Meet, Zoom, Chrome, Firefox, and any V4L2 consumer.
**G6.** No Wi-Fi dependency, no account, no subscription, no cloud egress.
**G7.** Reconnect automatically when the cable is replugged or the app restarts.

## 4. Non-goals

- **Android support.** iOS only. Android over USB uses `adb`, an entirely different
  transport, and would double the surface area. Revisit after v1.0.
- **Wi-Fi transport.** Deliberately excluded. Wi-Fi introduces jitter, discovery,
  and pairing problems, and free Wi-Fi tools already exist (Iriun). The cable is
  the differentiator.
- **Recording, cloud upload, streaming to RTMP services.** Out of scope. This is a
  camera source; OBS handles everything downstream.
- **Windows or macOS desktop clients.** Linux only.
- **Multi-phone / multi-camera composition.** One device at a time in v1.

## 5. Hard constraints

These are not preferences. Violating any of them yields a non-functional product.

**C1 — Direction of connection.** `usbmuxd` permits only host→device TCP
connections. The phone is the server; the desktop is the client. Fully explained
in [01-architecture.md §2](01-architecture.md).

**C2 — Expo Go cannot run this app.** The app opens a listening socket and drives
`AVCaptureSession` through custom Swift. Both require native code. Development
uses `expo prebuild` and an **EAS development build** installed on the device.
There is no Expo Go path at any point in this project.

**C3 — A paid Apple Developer account is required.** Installing a development
build on a physical iPhone, and the entitlements the app needs, require code
signing. Free personal teams expire builds after 7 days.

**C4 — Cinematic video capture requires iOS 26 or later** and a device that
supports it. Older devices fall back to the blur strategies described in
[05-features.md §F5](05-features.md).

**C5 — The phone must stay unlocked with the app in the foreground.** iOS suspends
listening sockets for backgrounded apps. Mitigations are documented in
[05-features.md §F12](05-features.md); none of them fully remove this constraint.

**C6 — macOS is required to build the iOS app.** Xcode cannot run on Linux. Either
use EAS Build (Expo's hosted macOS builders, works from this Linux machine) or a
Mac. EAS Build is the assumed path.

## 6. Target environment

Verified on the development machine on 2026-09-01:

| Component | Value |
|---|---|
| OS | Ubuntu 24.04.2 LTS |
| Kernel | 6.8.0-138-generic |
| Node.js | v22.17.0 |
| npm | 11.4.2 |
| ffmpeg | 6.1.1 (Ubuntu 7:6.1.1-3ubuntu5) |
| v4l2loopback | 0.12.7 (dkms) |
| usbmuxd | 1.1.1 |
| Audio server | PipeWire |
| Project root | `/var/www/html/old/mobile_webcam` |

The iPhone is already paired and visible to `usbmuxd` — `idevice_id -l` returns a
UDID on this machine.

## 7. Glossary

| Term | Meaning |
|---|---|
| **usbmuxd** | Linux daemon multiplexing TCP connections to iOS devices over USB. |
| **iproxy** | CLI that binds a local TCP port and forwards it to a device port via usbmuxd. Ships in `libusbmuxd-tools`. |
| **v4l2loopback** | Kernel module creating virtual `/dev/videoN` devices that any app can open as a camera. |
| **PipeWire null sink** | A virtual audio device; its monitor source acts as a virtual microphone. |
| **fMP4** | Fragmented MP4. Streamable MP4 that does not need a final index, so it can be sent while still being recorded. |
| **Expo Module** | Expo's native-module system. Swift/Kotlin code exposed to JS, integrated via config plugins. |
| **Dev client** | A custom build of the app including its native modules, replacing Expo Go. |
| **Cinematic video** | Apple's live shallow depth-of-field capture mode, `isCinematicVideoCaptureEnabled`, iOS 26+. |
