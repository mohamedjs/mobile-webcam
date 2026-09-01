# 08 — Running and Using mobile_webcam

Everything you need to go from a fresh checkout to a working webcam. Read §1 and
§2 once; after that §5 is the whole daily routine.

---

## 1. What you need before you start

| Requirement | Why | How to check |
|---|---|---|
| Ubuntu 22.04+ (24.04 verified) | v4l2loopback + PipeWire | `lsb_release -d` |
| Node.js 22+ | The desktop service | `node -v` |
| A Mac **or** an Expo account | Xcode cannot run on Linux | — |
| Paid Apple Developer account | A free account expires builds after 7 days | [developer.apple.com](https://developer.apple.com) |
| iPhone on iOS 16+ | iOS 26+ unlocks native Cinematic | Settings → General → About |
| A **data** USB cable | Charge-only cables carry no data | See §6 |

The single most common setup failure is a charge-only cable. If `idevice_id -l`
prints nothing with the phone plugged in and unlocked, suspect the cable before
anything else.

---

## 2. One-time setup

### 2.1 Desktop

```bash
cd /var/www/html/old/mobile_webcam
npm install
npm run build
```

Then the privileged step. It prints each action and asks before running it:

```bash
npm run setup:linux
```

This does five things:

1. Verifies packages, printing an exact `apt install` line for anything missing.
2. Writes `/etc/modprobe.d/mobile-webcam.conf` so `/dev/video9` is stable across reboots.
3. Loads `v4l2loopback` as **"Mobile Webcam"**.
4. Pins the device format — without this the second stream start fails (§7.4).
5. Creates the PipeWire null sink that becomes your virtual microphone.

Verify:

```bash
npm run doctor
```

Everything should read `[PASS]`. Anything that does not comes with the exact
command to fix it on the next line.

### 2.2 Build the iPhone app

**Expo Go will not work.** The app opens a listening TCP socket and drives
`AVCaptureSession` from custom Swift; neither exists in Expo Go. You need a
development build.

Copy the repo to a Mac, or use Expo's hosted macOS builders from Linux.

**On a Mac:**

```bash
cd mobile
npx expo prebuild --clean
npx expo run:ios --device
```

**From Linux, via EAS:**

```bash
cd mobile
npm install -g eas-cli
eas login
eas build --profile development --platform ios
```

EAS returns a link to a `.ipa`. Install it on the phone, then trust the developer
certificate: Settings → General → VPN & Device Management → your developer
account → Trust.

This first build compiles ~2,100 lines of Swift for the first time. Budget
15–20 minutes and expect to fix compiler diagnostics — see [09-native-module.md](09-native-module.md).

---

## 3. Setting up the iPhone app

Do this once, in order. Step 3 is the one that silently breaks everything if skipped.

### Step 1 — Open the app

Launch **mobile_webcam**. You land on the camera screen: a live preview, lens
pills along the bottom, and a **Start server** button.

### Step 2 — Grant camera and microphone

iOS prompts on first launch. Tap **Allow** for both. If you tapped "Don't Allow",
go to Settings → mobile_webcam and switch them back on.

### Step 3 — Grant Local Network ← the critical one

The first time you tap **Start server**, iOS asks:

> "mobile_webcam" would like to find and connect to devices on your local network.

**Tap Allow.**

This permission is required **even though you are using a cable**. The app binds a
TCP port, and iOS gates that behind Local Network regardless of transport. If you
deny it:

- The app still looks completely healthy
- The server silently fails to bind
- Your laptop reports only `Connection reset by peer`

There is no error on the phone. This exact failure is why this project exists
instead of using an off-the-shelf app.

If you already denied it, or never saw the prompt:

**Settings → Privacy & Security → Local Network → mobile_webcam → ON**

If mobile_webcam is not listed there at all, iOS never asked. Delete the app,
reinstall it, and tap **Allow** when the prompt appears.

### Step 4 — Note the pairing code

Go to **Advanced** (or **Connection**). A six-digit code is shown. The desktop
service needs it:

```bash
curl -X PATCH http://127.0.0.1:47800/api/config \
  -H 'Content-Type: application/json' \
  -d '{"token":"123456"}'
```

Or type it into the **Advanced** section of the desktop control UI.

Over a cable this is not defending against the network — it stops an unrelated
process on your computer from quietly reading your camera.

### Step 5 — Stop iOS suspending the app

iOS kills listening sockets for backgrounded apps. The app disables auto-lock
itself while streaming, but also:

- Settings → Display & Brightness → **Auto-Lock → Never**
- Turn **Low Power Mode off** (it throttles background sockets)
- Keep mobile_webcam in the **foreground** — do not swipe away or lock

If you background the app, the phone shows a warning and the laptop falls back to
a "Reconnecting…" placeholder rather than dropping the camera. Return to the app
and streaming resumes within about five seconds.

---

## 4. First connection

1. Plug the phone into the laptop and **unlock it**. Tap **Trust** if asked.
2. On the phone, open mobile_webcam and tap **Start server**. The badge reads
   *Waiting for computer*.
3. On the laptop:

```bash
cd /var/www/html/old/mobile_webcam/server && npm start
```

4. Open **http://127.0.0.1:47800**.

Within about five seconds the service finds the phone, opens the USB tunnel,
reads the camera's capabilities and starts streaming. The phone badge flips to
*Streaming · 1 client*.

Confirm the video is live:

```bash
ffplay /dev/video9
```

---

## 5. Daily use

Once set up, the whole routine is:

1. Plug in the phone, unlock it.
2. Open mobile_webcam, tap **Start server**.
3. `cd server && npm start` on the laptop (or leave it running as a service, §8).

Then pick the devices in whatever app you use.

### OBS Studio

- **Camera:** Sources → *Video Capture Device (V4L2)* → **Mobile Webcam**
- **Microphone:** Settings → Audio → Mic/Auxiliary → **Mobile_Webcam_Mic**

**Lower-latency alternative:** OBS can read the phone directly, skipping
v4l2loopback and ffmpeg. Sources → *Media Source*, uncheck **Local File**, and
set Input to:

```
http://127.0.0.1:8080/stream.mp4
```

This is OBS-only — Meet and Zoom cannot use it. The phone serves one streaming
client at a time, so stop the pipeline first (**Stop** in the control UI).

### Google Meet / Chrome

- **Camera:** Mobile Webcam
- **Microphone:** Monitor of Mobile_Webcam_Mic

Chrome enumerates devices **when the page loads**. Start the service before
opening the tab, or reload it.

### Zoom

Video → Camera → **Mobile Webcam**. Turn **off** *Touch up my appearance* and
*Adjust for low light* — both re-process an already-processed image and fight
Cinematic mode.

---

## 6. Using the features

### Resolution and frame rate

Phone: **Video** settings. Desktop: the Camera panel.

720p / 1080p / 4K, 24 / 30 / 60 fps, filtered to what your device reports.
Changing either briefly interrupts the stream but **never destroys
`/dev/video9`** — meeting apps keep the camera and notice nothing.

Bitrate applies **live** with no interruption. Defaults: 4 Mbps at 720p, 8 at
1080p, 20 at 4K.

### Choosing the rear camera and locking it

The app starts on the **rear wide lens** every launch. The pills switch lenses
live.

To stop the camera ever changing mid-meeting: **Video → Lock lens**. The switcher
disappears entirely and the desktop's switch endpoint returns 403.

### Cinematic mode

**Cinematic** settings. What you get depends on your device:

| Tier | Requires | Quality |
|---|---|---|
| 1 — Native Cinematic | iOS 26+, supported hardware | Best. iOS renders the depth-of-field and bakes it into the frames your laptop receives. |
| 2 — Depth blur | Dual camera, iOS 16+ | Good. Costs frame rate; capped at 1080p30. |
| 3 — Segmentation blur | Any device | Usable. Edges around hair can artefact. |

The app detects your tier at runtime and says which one it is using. Aperture
(f/2.0–f/16) adjusts live — lower means more blur.

Turning Cinematic on restricts available resolutions and frame rates; the UI
filters itself to what remains.

**Free alternative on any device:** while streaming, open Control Centre, tap
**Video Effects**, and turn on **Portrait**. That is iOS's own blur, costs
nothing, and needs no code.

### Microphone

**Audio** settings: on/off, sample rate, mono/stereo, and a live level meter.
Audio is muxed with video in the same container, so it stays in sync — expect
under 100 ms drift after 30 minutes.

Turning the mic off leaves the virtual device in place; your laptop's own
microphone keeps working normally.

### Focus and exposure

Tap the preview to focus that point. **Video → Focus & exposure** has independent
locks plus a **Lock all** button.

Lock all before a meeting. Autofocus hunting when you move your hands is the most
visible artefact on a phone camera, and locking removes it entirely.

---

## 7. Troubleshooting

Start here always:

```bash
npm run doctor
```

### 7.1 `Connection refused` on port 8080

`iproxy` is not running. A laptop-side problem — the service supervises it, so
check the service logs.

### 7.2 `Connection reset by peer`

**The tunnel reached the phone and the phone refused the port.** The app is not
serving. In order of likelihood:

1. Local Network permission denied → §3 step 3
2. App not open, or backgrounded / phone locked
3. **Start server** never tapped

### 7.3 No device found at all

```bash
idevice_id -l
```

Silent means: charge-only cable, phone locked, or **Trust** not tapped. Unplug,
replug, unlock, tap Trust.

### 7.4 Worked once, fails on restart

`v4l2loopback`'s `exclusive_caps=1` leaves the device capture-only after the
first producer exits. The service re-pins the format on every start, but if you
started ffmpeg by hand:

```bash
v4l2loopback-ctl set-caps "YUYV:1920x1080@30" /dev/video9
```

### 7.5 Device exists but OBS/Chrome shows nothing

Snap and Flatpak confinement:

```bash
snap connect obs-studio:camera
flatpak override --user --device=all com.obsproject.Studio
```

### 7.6 Black frame in Zoom, no error

A pixel-format mismatch. The service always passes `format=yuv420p`; if you built
your own ffmpeg command, add it.

### 7.7 Stuttering, or quality dropping on its own

The phone is thermally throttling. The service detects sustained drops or a
`serious` thermal state and steps quality down automatically, saying so in the
UI. Take the phone out of its case, off the charger, and out of sunlight.

### 7.8 Protocol mismatch

The phone app and desktop service are different versions. The message names which
side to update. They must match exactly.

---

## 8. Running the service automatically

```ini
# ~/.config/systemd/user/mobile-webcam.service
[Unit]
Description=mobile_webcam desktop service
After=graphical-session.target pipewire.service

[Service]
Type=simple
WorkingDirectory=/var/www/html/old/mobile_webcam/server
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now mobile-webcam
```

It must be a **user** service. A system service cannot reach your PipeWire
session, so the microphone would not work.

---

## 9. Configuration reference

`~/.config/mobile_webcam/config.json`, or via `PATCH /api/config`:

| Key | Default | Meaning |
|---|---|---|
| `devicePort` | 8080 | Port the phone listens on |
| `localPort` | 8080 | Local end of the USB tunnel |
| `controlPort` | 47800 | Desktop control UI |
| `token` | `""` | Pairing code from the phone |
| `autoStart` | `true` | Stream as soon as the phone is ready |
| `forceMjpeg` | `false` | Diagnostic fallback profile |
| `directMode` | `false` | Skip v4l2/audio; OBS reads the phone directly |
| `logLevel` | `info` | `trace` · `debug` · `info` · `warn` · `error` |
| `devicePollMs` | 2000 | How often to look for the phone |
