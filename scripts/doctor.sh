#!/usr/bin/env bash
# Read-only diagnostics. Changes nothing. One actionable line per failure.
# See docs/06-linux-integration.md §7.
set -uo pipefail

# NOTE: this script runs with `pipefail`. Never write `cmd | grep -q ...` —
# grep exits on the first match, the producer takes SIGPIPE (rc 141), and
# pipefail turns a SUCCESSFUL match into a failed test. Piping a variable with
# printf has the same bug. Use a here-string (`grep -q PATTERN <<<"$VAR"`) or a
# `case` statement: neither has a producer process to kill. This produced two
# false FAILs before it was caught.
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
LSUSB="$(lsusb 2>/dev/null || true)"
case "$LSUSB" in *[Aa]pple*) IPHONE_ON_USB=1 ;; esac

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
LSMOD="$(lsmod)"
if grep -q '^v4l2loopback' <<<"$LSMOD"; then
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
SINKS="$(pactl list short sinks 2>/dev/null || true)"
SOURCES="$(pactl list short sources 2>/dev/null || true)"
case "$SINKS" in
  *"$SINK"*)
  ok "PipeWire sink \"$SINK\" present"
  case "$SOURCES" in
    *"${SINK}.monitor"*) ok "monitor source \"${SINK}.monitor\" present" ;;
    *) bad "monitor source missing" "pactl unload-module module-null-sink; then npm run setup:linux" ;;
  esac
  ;;
  *)
  bad "PipeWire sink \"$SINK\" missing" \
      "pactl load-module module-null-sink sink_name=$SINK sink_properties=device.description=Mobile_Webcam_Mic"
  ;;
esac

# --- phone app ---------------------------------------------------------------
# If the service is already running its own tunnel, reuse it. Spawning a second
# iproxy on the same local port fails to bind and reports a false "app not
# responding" — the service's tunnel is the authority when it exists.
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/mobile_webcam/config.json"
LOCAL_PORT=""
if [ -r "$CONFIG" ]; then
  LOCAL_PORT="$(sed -n 's/.*"localPort"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' "$CONFIG" | head -1)"
fi
[ -n "$LOCAL_PORT" ] || LOCAL_PORT=""

probe_port=""
LISTENING="$(ss -ltn 2>/dev/null || true)"
if [ -n "$LOCAL_PORT" ] && grep -q ":${LOCAL_PORT}[[:space:]]" <<<"$LISTENING"; then
  probe_port="$LOCAL_PORT"
  info "Reusing the running service's tunnel on port $probe_port"
  OWN_TUNNEL=0
elif command -v iproxy >/dev/null && [ -n "$UDID" ]; then
  # Find a free local port rather than hardcoding one that may be in use.
  for candidate in 29080 29081 29082 29083 29084; do
    if ! grep -q ":${candidate}[[:space:]]" <<<"$LISTENING"; then
      probe_port="$candidate"; break
    fi
  done
  if [ -n "$probe_port" ]; then
    iproxy "$probe_port" "$DEVICE_PORT" >/dev/null 2>&1 &
    TUNNEL=$!
    OWN_TUNNEL=1
    sleep 1
    if ! kill -0 "$TUNNEL" 2>/dev/null; then
      bad "iproxy could not bind port $probe_port" "Check nothing else holds it: ss -ltnp | grep $probe_port"
      probe_port=""
    fi
  fi
fi

if [ -n "$probe_port" ]; then
  CODE="$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:${probe_port}/health" 2>/dev/null || echo 000)"
  [ "${OWN_TUNNEL:-0}" = "1" ] && { kill "$TUNNEL" 2>/dev/null || true; wait "$TUNNEL" 2>/dev/null || true; }
  case "$CODE" in
    200) ok "Phone app responding on device port $DEVICE_PORT" ;;
    401) ok "Phone app responding (401 = pairing code not set on the desktop)" ;;
    000) bad "Phone app not responding on device port $DEVICE_PORT" \
             "Open mobile_webcam on the phone and tap Start server. If it is already open: Settings -> Privacy & Security -> Local Network -> mobile_webcam" ;;
    *)   bad "Phone app returned HTTP $CODE on /health" "Check the app logs on the phone" ;;
  esac
elif [ -z "$UDID" ]; then
  info "Skipping phone probe (no device connected)"
else
  info "Skipping phone probe (no free local port, or iproxy missing)"
fi

echo "===================="
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
