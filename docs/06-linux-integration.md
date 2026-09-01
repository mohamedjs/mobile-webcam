# 06 — Linux Integration

Everything in this document targets **Ubuntu 24.04 with PipeWire**, verified on the
development machine. Adapt for other distributions at your own risk.

## 1. Package prerequisites

```bash
sudo apt install -y \
  v4l2loopback-dkms v4l2loopback-utils \
  usbmuxd libusbmuxd-tools libimobiledevice-utils \
  ffmpeg
```

`iproxy` lives in **`libusbmuxd-tools`** on Ubuntu 24.04. It is *not* in
`libimobiledevice-utils`, which is the intuitive and wrong guess — a missing
`iproxy` presents as `Connection refused` on the local port and sends people
debugging the phone instead of the laptop.

Verify the phone is reachable before writing any code:

```bash
idevice_id -l                 # prints the UDID
ideviceinfo -k DeviceName     # prints the phone's name
```

If these are silent, the pairing record is missing: unplug, replug, and tap
**Trust** on the phone.

## 2. Virtual camera — v4l2loopback

### 2.1 Persistent configuration

Pin the device number so `/dev/video9` is stable across reboots and does not
collide with real webcams at `video0`/`video1`.

`/etc/modprobe.d/mobile-webcam.conf`:

```
options v4l2loopback video_nr=9 card_label="Mobile Webcam" exclusive_caps=1 max_buffers=2
```

`/etc/modules-load.d/mobile-webcam.conf`:

```
v4l2loopback
```

Then:

```bash
sudo modprobe -r v4l2loopback 2>/dev/null || true
sudo modprobe v4l2loopback
v4l2-ctl --list-devices
```

### 2.2 What each option does, and why

| Option | Reason |
|---|---|
| `video_nr=9` | Deterministic path. Without it the number shifts when a real webcam is plugged in and every consumer's saved device selection breaks. |
| `card_label` | The string users pick in Zoom/OBS. Must be stable — changing it makes every app forget the selection. |
| `exclusive_caps=1` | Makes the device advertise capture-only capability once a producer is writing. **Required** — Chrome and Firefox refuse devices that advertise both output and capture. |
| `max_buffers=2` | Low latency. Higher values add a frame or two of delay for no benefit on a live source. |

### 2.3 The `exclusive_caps` reopen problem

With `exclusive_caps=1`, the device flips to capture-only when the producer opens
it and **does not reliably reset when the producer exits**. The next ffmpeg run can
fail to open it for writing.

**Fix — pin the format before the first producer connects:**

```bash
v4l2loopback-ctl set-caps "YUYV:1920x1080@30" /dev/video9
```

`VideoDeviceModule` must run this on startup and after every resolution change,
**before** spawning ffmpeg. Without it the pipeline works once and fails on the
first restart, which is easy to misdiagnose as a phone problem.

### 2.4 Permissions

```bash
sudo usermod -aG video "$USER"     # log out and back in
ls -l /dev/video9                  # expect: crw-rw----+ root video
```

Snap-packaged consumers need explicit access:

```bash
snap connect obs-studio:camera             # if OBS is a snap
snap connect chromium:camera
```

Flatpak:

```bash
flatpak override --user --device=all com.obsproject.Studio
```

This is a common silent failure: the device exists, ffmpeg writes to it, and OBS
shows nothing because confinement blocks it.

## 3. Virtual microphone — PipeWire

### 3.1 Create the sink

```bash
pactl load-module module-null-sink \
  sink_name=mobile_webcam_mic \
  sink_properties=device.description="Mobile_Webcam_Mic"
```

Returns a module id — **store it**; it is required to unload cleanly:

```bash
pactl unload-module <id>
```

Applications select the **monitor source**, `mobile_webcam_mic.monitor`, as their
input. Set a friendly description or it appears as "Monitor of …" in pickers.

`AudioDeviceModule` owns this lifecycle: create on startup if absent, unload on
shutdown. Reloading without unloading accumulates duplicate sinks across restarts —
a visible bug users notice as a growing list of identical microphones.

### 3.2 Why a null sink and not a SPA plugin

A custom PipeWire SPA plugin would present a true virtual source rather than a
monitor. It is also a compiled C plugin installed into system paths, versioned
against PipeWire's ABI, requiring root to install and breaking on PipeWire
upgrades. `pactl load-module` needs no compilation, no root, and no ABI coupling.
The only cost is the word "Monitor" in some pickers, fixed with a description.

### 3.3 Verify

```bash
pactl list short sinks   | grep mobile_webcam
pactl list short sources | grep mobile_webcam
```

## 4. The USB tunnel

```bash
iproxy 8080 8080          # local 8080 → device 8080
```

`TunnelModule` runs this as a supervised child, never a detached shell process.

**Interpreting failures — this table is the fastest debugging tool in the project:**

| Symptom on `curl http://127.0.0.1:8080/health` | Meaning |
|---|---|
| `Connection refused` | `iproxy` is not running or failed to bind locally. Laptop-side problem. |
| `Connection reset by peer` | The tunnel reached the phone and the phone refused the port. **The app is not serving** — not running, backgrounded, or Local Network permission denied. |
| Hangs then times out | The phone accepted but never responded. App is wedged; restart it. |
| `200` with JSON | Working. |

`bind(): Address already in use` from `iproxy` means a previous instance is still
alive. `pkill -f 'iproxy 8080'` before starting a new one; `ManagedProcess` must do
this on startup.

## 5. Consumer configuration

### 5.1 OBS Studio

**V4L2 path** — Sources → **Video Capture Device (V4L2)** → Device: *Mobile Webcam*.

**Direct path (lower latency, F9)** — Sources → **Media Source**, uncheck *Local
File*, Input: `http://127.0.0.1:8080/stream.mp4`, Input Format: `mp4`.
Set *Network Buffering* to the minimum and enable *Restart playback when source
becomes active*.

Audio: Settings → Audio → Mic/Auxiliary → **Mobile_Webcam_Mic**.

### 5.2 Google Meet / Chrome

Camera: *Mobile Webcam*. Microphone: *Monitor of Mobile_Webcam_Mic*.

Chrome enumerates devices **at page load**. The virtual devices must exist before
the tab opens, or they will not appear until reload. `main.ts` creating them at
startup is what makes this reliable.

### 5.3 Zoom

Video → Camera → *Mobile Webcam*. Disable *Touch up my appearance* and *Adjust for
low light* — both re-process an already-processed image and fight Cinematic mode.

### 5.4 Firefox

Works with no configuration. Firefox is stricter about `exclusive_caps`; if the
device does not appear, §2.3 is the cause.

## 6. `scripts/setup-linux.sh`

Idempotent. Safe to re-run. Must not silently `sudo` — it prints what it is about
to do and asks.

```
1. Verify packages; print the exact apt line for anything missing.
2. Write /etc/modprobe.d/mobile-webcam.conf and modules-load.d (needs sudo).
3. Reload v4l2loopback; confirm /dev/video9 with the right label.
4. Pin caps with v4l2loopback-ctl.
5. Create the PipeWire null sink if absent; record the module id.
6. Add the user to the video group if needed; say a re-login is required.
7. Check for the phone via idevice_id; guide through Trust if absent.
8. Print a summary table of every check with PASS/FAIL.
```

## 7. `scripts/doctor.sh`

Read-only diagnostics. Changes nothing. One actionable line per failure.

```
[PASS] iproxy installed (libusbmuxd-tools)
[PASS] usbmuxd running
[PASS] iPhone paired: 00008110-000105803EBB601E (Mohamed's iPhone, iOS 26.1)
[PASS] v4l2loopback loaded, /dev/video9 "Mobile Webcam"
[FAIL] PipeWire sink mobile_webcam_mic missing
       → pactl load-module module-null-sink sink_name=mobile_webcam_mic
[FAIL] Phone app not responding on device port 8080
       → Open mobile_webcam on the phone. If it is already open, check
         Settings → Privacy & Security → Local Network → mobile_webcam.
```

## 8. Optional: udev hotplug

A udev rule can start the service on plug-in instead of polling. **Not in v1** —
the 2 s poll costs nothing measurable and udev rules are an extra failure mode
requiring root. Ship polling first; add this only if the poll proves inadequate.

```
# /etc/udev/rules.d/99-mobile-webcam.rules   (post-v1.0)
ACTION=="add", SUBSYSTEM=="usb", ATTR{idVendor}=="05ac", \
  RUN+="/usr/bin/systemctl --user --machine=mohamed@ start mobile-webcam.service"
```

## 9. Optional: systemd user service

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

It must be a **user** service, not system — it needs the user's PipeWire session,
which a system service cannot reach.
