#!/usr/bin/env bash
# Read-only diagnostics. Changes nothing. One actionable line per failure.
# See docs/06-linux-integration.md §7.
set -uo pipefail

VIDEO_NR="${MW_VIDEO_NR:-9}"
VIDEO_DEV="/dev/video${VIDEO_NR}"
VIDEO_LABEL="${MW_VIDEO_LABEL:-Mobile Webcam}"
SINK="${MW_AUDIO_SINK:-mobile_webcam_mic}"
DEVICE_PORT="${MW_DEVICE_PORT:-8080}"

PASS=0; FAIL=0
green() { printf '\033[32m%s\033[0m\n' "$1"; }
red()   { printf '\033[31m%s\033[0m\n' "$1"; }

ok()   { green "[PASS] $1"; PASS=$((PASS+1)); }
bad()  { red   "[FAIL] $1"; printf '       → %s\n' "$2"; FAIL=$((FAIL+1)); }
info() { printf '\033[33m[INFO]\033[0m %s\n' "$1"; }

echo "mobile_webcam doctor"
echo "===================="

# --- tooling -----------------------------------------------------------------
if command -v iproxy >/dev/null; then
  ok "iproxy installed"
else
  bad "iproxy not found" "sudo apt install libusbmuxd-tools   (NOT libimobiledevice-utils)"
fi

for c in ffmpeg idevice_id v4l2loopback-ctl pactl; do
  if command -v "$c" >/dev/null; then ok "$c installed"
  else bad "$c not found" "sudo apt install ffmpeg libimobiledevice-utils v4l2loopback-utils pipewire-utils"; fi
done

# --- usbmuxd + device --------------------------------------------------------
# usbmuxd is socket/udev-activated: it is legitimately inactive with no phone
# attached. Only a phone that IS plugged in but unreachable is a real failure.
IPHONE_ON_USB=0
lsusb 2>/dev/null | grep -qi 'Apple' && IPHONE_ON_USB=1

if pgrep -x usbmuxd >/dev/null || systemctl is-active --quiet usbmuxd 2>/dev/null; then
  ok "usbmuxd running"
elif [ "$IPHONE_ON_USB" = "1" ]; then
  bad "usbmuxd not running but an Apple device is on USB" "sudo systemctl start usbmuxd"
else
  info "usbmuxd inactive (normal — socket-activated, no device attached)"
fi

UDID="$(idevice_id -l 2>/dev/null | head -1)"
if [ -n "$UDID" ]; then
  NAME="$(ideviceinfo -u "$UDID" -k DeviceName 2>/dev/null || echo '?')"
  IOS="$(ideviceinfo -u "$UDID" -k ProductVersion 2>/dev/null || echo '?')"
  ok "iPhone paired: $UDID ($NAME, iOS $IOS)"
elif [ "$IPHONE_ON_USB" = "1" ]; then
  bad "Apple device on USB but not paired" "Unlock the phone and tap Trust, then re-run"
else
  info "No iPhone plugged in (host checks below still apply)"
fi

# --- v4l2loopback ------------------------------------------------------------
if lsmod | grep -q '^v4l2loopback'; then
  ok "v4l2loopback loaded"
  if [ -e "$VIDEO_DEV" ]; then
    ACTUAL="$(cat "/sys/devices/virtual/video4linux/video${VIDEO_NR}/name" 2>/dev/null || echo '?')"
    if [ "$ACTUAL" = "$VIDEO_LABEL" ]; then
      ok "$VIDEO_DEV present, label \"$ACTUAL\""
    else
      bad "$VIDEO_DEV has label \"$ACTUAL\", expected \"$VIDEO_LABEL\"" \
          "Re-run: npm run setup:linux"
    fi
    [ -r "$VIDEO_DEV" ] && ok "$VIDEO_DEV readable by $USER" \
      || bad "$VIDEO_DEV not accessible" "sudo usermod -aG video $USER, then log out and back in"
  else
    bad "$VIDEO_DEV missing" "npm run setup:linux"
  fi
else
  bad "v4l2loopback not loaded" "sudo modprobe v4l2loopback   (or: npm run setup:linux)"
fi

# --- audio -------------------------------------------------------------------
if command -v pactl >/dev/null && pactl list short sinks 2>/dev/null | grep -q "$SINK"; then
  ok "PipeWire sink \"$SINK\" present"
  pactl list short sources 2>/dev/null | grep -q "${SINK}.monitor" \
    && ok "monitor source \"${SINK}.monitor\" present" \
    || bad "monitor source missing" "pactl unload-module module-null-sink; then npm run setup:linux"
else
  bad "PipeWire sink \"$SINK\" missing" \
      "pactl load-module module-null-sink sink_name=$SINK sink_properties=device.description=Mobile_Webcam_Mic"
fi

# --- phone app ---------------------------------------------------------------
if command -v iproxy >/dev/null && [ -n "$UDID" ]; then
  pkill -f "iproxy .* ${DEVICE_PORT}\$" 2>/dev/null || true
  iproxy 1"$DEVICE_PORT" "$DEVICE_PORT" >/dev/null 2>&1 &
  TUNNEL=$!
  sleep 1
  CODE="$(curl -s -m 3 -o /dev/null -w '%{http_code}' "http://127.0.0.1:1${DEVICE_PORT}/health" 2>/dev/null)"
  kill "$TUNNEL" 2>/dev/null; wait "$TUNNEL" 2>/dev/null
  case "$CODE" in
    200) ok "Phone app responding on device port $DEVICE_PORT" ;;
    000) bad "Phone app not responding on device port $DEVICE_PORT" \
             "Open mobile_webcam on the phone. If it is already open: Settings → Privacy & Security → Local Network → mobile_webcam" ;;
    *)   bad "Phone app returned HTTP $CODE on /health" "Check the app logs on the phone" ;;
  esac
else
  echo "[SKIP] Phone app probe (needs iproxy and a paired device)"
fi

echo "===================="
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
