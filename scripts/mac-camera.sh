#!/usr/bin/env bash
# Brings up the whole Mac path in one go: desktop service -> USB tunnel ->
# phone -> OBS Virtual Camera, which Meet/Zoom/Teams can select.
#
# This is the route that needs no Apple Developer entitlements. The native
# camera extension in macos/ produces "webcamo" directly in the camera list,
# but it cannot be signed without the System Extension capability on the
# developer account (see macos/README.md).
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PHONE="http://127.0.0.1:8080"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- 1. service
if curl -sf -m 2 http://127.0.0.1:47800/api/status >/dev/null 2>&1; then
  say "Desktop service already running"
else
  say "Starting desktop service…"
  ( cd "$REPO/server" && npm start >/tmp/webcamo-server.log 2>&1 & )
  for _ in $(seq 1 20); do
    curl -sf -m 2 http://127.0.0.1:47800/api/status >/dev/null 2>&1 && break
    sleep 1
  done
fi

# The OBS scene reads /stream.mp4 (H.264, hardware-decoded) rather than
# /stream.mjpeg — roughly a tenth of the bytes and a fraction of the CPU.
# The service spawns iproxy, which is what makes the phone reachable on 8080.
say "Waiting for the phone…"
ok=false
for _ in $(seq 1 30); do
  if curl -sf -m 2 "$PHONE/health" >/dev/null 2>&1; then ok=true; break; fi
  sleep 2
done

if [ "$ok" != true ]; then
  cat <<'EOF'

The phone is not answering on 127.0.0.1:8080. Check, in order:
  1. iPhone connected by cable and unlocked
  2. webcamo open on the phone, "Start server" tapped
  3. Local Network permission allowed when iOS asked
EOF
  exit 1
fi
say "Phone is streaming"

# -------------------------------------------------------------------- 2. OBS
# --startvirtualcam publishes the OBS camera extension, which is already
# installed and approved on this Mac.
if pgrep -x OBS >/dev/null; then
  say "OBS already running — switch to the 'webcamo' scene and click Start Virtual Camera"
else
  say "Launching OBS with the webcamo scene…"
  open -a OBS --args --collection webcamo --scene webcamo --startvirtualcam
fi

cat <<'EOF'

In Meet / Zoom / Teams pick:  OBS Virtual Camera

If the picture is black, the phone stopped serving — reopen webcamo and tap
Start server. If the camera is missing from the list, quit and reopen the
browser: Chrome only enumerates cameras at launch.
EOF
