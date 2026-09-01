#!/usr/bin/env bash
# Idempotent host setup. Safe to re-run. Prints every privileged action first.
# See docs/06-linux-integration.md §6.
set -euo pipefail

VIDEO_NR="${MW_VIDEO_NR:-9}"
VIDEO_DEV="/dev/video${VIDEO_NR}"
VIDEO_LABEL="${MW_VIDEO_LABEL:-Mobile Webcam}"
SINK="${MW_AUDIO_SINK:-mobile_webcam_mic}"
MODPROBE_CONF=/etc/modprobe.d/mobile-webcam.conf
MODULES_CONF=/etc/modules-load.d/mobile-webcam.conf
ASSUME_YES="${MW_YES:-0}"

say()  { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$1"; }

confirm() {
  [ "$ASSUME_YES" = "1" ] && return 0
  printf '    %s\n    Proceed? [y/N] ' "$1"
  read -r a </dev/tty
  [ "$a" = "y" ] || [ "$a" = "Y" ]
}

# 1 — packages ----------------------------------------------------------------
say "Checking packages"
MISSING=()
command -v iproxy            >/dev/null || MISSING+=(libusbmuxd-tools)
command -v ffmpeg            >/dev/null || MISSING+=(ffmpeg)
command -v idevice_id        >/dev/null || MISSING+=(libimobiledevice-utils)
command -v v4l2loopback-ctl  >/dev/null || MISSING+=(v4l2loopback-utils)
command -v pactl             >/dev/null || MISSING+=(pipewire-utils)
modinfo v4l2loopback         >/dev/null 2>&1 || MISSING+=(v4l2loopback-dkms)

if [ "${#MISSING[@]}" -gt 0 ]; then
  warn "Missing packages: ${MISSING[*]}"
  echo "    Run this, then re-run setup:"
  echo "    sudo apt install -y ${MISSING[*]}"
  exit 1
fi
say "All packages present"

# 2 — v4l2loopback config -----------------------------------------------------
WANT_MODPROBE="options v4l2loopback video_nr=${VIDEO_NR} card_label=\"${VIDEO_LABEL}\" exclusive_caps=1 max_buffers=2"

if [ "$(cat "$MODPROBE_CONF" 2>/dev/null || true)" = "$WANT_MODPROBE" ]; then
  say "$MODPROBE_CONF already correct"
else
  say "Writing $MODPROBE_CONF"
  if confirm "sudo tee $MODPROBE_CONF  ($WANT_MODPROBE)"; then
    echo "$WANT_MODPROBE" | sudo tee "$MODPROBE_CONF" >/dev/null
    echo "v4l2loopback" | sudo tee "$MODULES_CONF" >/dev/null
  else
    warn "Skipped; $VIDEO_DEV will not be stable across reboots"
  fi
fi

# 3 — reload the module -------------------------------------------------------
CURRENT_LABEL="$(cat "/sys/devices/virtual/video4linux/video${VIDEO_NR}/name" 2>/dev/null || true)"
if [ "$CURRENT_LABEL" = "$VIDEO_LABEL" ]; then
  say "$VIDEO_DEV already present as \"$VIDEO_LABEL\""
else
  say "Reloading v4l2loopback"
  if confirm "sudo modprobe -r v4l2loopback && sudo modprobe v4l2loopback"; then
    sudo modprobe -r v4l2loopback 2>/dev/null || warn "module busy — close apps holding a camera"
    sudo modprobe v4l2loopback
    sleep 1
    [ -e "$VIDEO_DEV" ] && say "Created $VIDEO_DEV" || warn "$VIDEO_DEV did not appear"
  fi
fi

# 4 — pin caps ----------------------------------------------------------------
# Without this, exclusive_caps=1 leaves the device capture-only after the first
# producer exits and the next ffmpeg run cannot open it. docs/06 §2.3.
if [ -e "$VIDEO_DEV" ]; then
  say "Pinning caps on $VIDEO_DEV (YUYV 1920x1080@30)"
  v4l2loopback-ctl set-caps "YUYV:1920x1080@30" "$VIDEO_DEV" 2>/dev/null \
    || warn "set-caps failed — will retry at stream start"
fi

# 5 — audio sink --------------------------------------------------------------
if pactl list short sinks 2>/dev/null | grep -q "$SINK"; then
  say "PipeWire sink \"$SINK\" already loaded"
else
  say "Creating PipeWire sink \"$SINK\""
  ID="$(pactl load-module module-null-sink \
        sink_name="$SINK" \
        sink_properties=device.description="Mobile_Webcam_Mic")"
  say "Loaded as module $ID"
  warn "This sink is not persistent across reboots; the service recreates it at startup"
fi

# 6 — video group -------------------------------------------------------------
if id -nG "$USER" | tr ' ' '\n' | grep -qx video; then
  say "$USER is in the video group"
else
  say "Adding $USER to the video group"
  if confirm "sudo usermod -aG video $USER"; then
    sudo usermod -aG video "$USER"
    warn "Log out and back in for the group change to take effect"
  fi
fi

# 7 — device ------------------------------------------------------------------
if idevice_id -l 2>/dev/null | grep -q .; then
  say "iPhone paired: $(idevice_id -l | head -1)"
else
  warn "No paired iPhone. Plug in the cable, unlock the phone, tap Trust."
fi

echo
say "Setup complete. Run 'npm run doctor' to verify."
