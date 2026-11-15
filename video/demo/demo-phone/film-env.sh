#!/usr/bin/env bash
# Filming only. Starts a stand-in phone and the real Webcamo daemon with an
# isolated config, so filming never touches the user's own settings.
#   film-env.sh up [plugged]   start (phone unplugged unless "plugged")
#   film-env.sh plug           "plug the phone in" (discovery sees it within 2 s)
#   film-env.sh down           stop everything this script started
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
D="${WEBCAMO_DEMO_DIR:-/tmp/webcamo-film}"
export WEBCAMO_DEMO_DIR="$D"
case "${1:-}" in
  up)
    "$0" down >/dev/null 2>&1 || true
    mkdir -p "$D/cfg/mobile_webcam"
    echo '{"localPort":18080,"autoStart":true}' > "$D/cfg/mobile_webcam/config.json"
    rm -f "$D/plugged"; [ "${2:-}" = plugged ] && touch "$D/plugged"
    node "$HERE/fakephone.mjs" > "$D/phone.log" 2>&1 & echo $! > "$D/phone.pid"
    PATH="$HERE/bin:$PATH" XDG_CONFIG_HOME="$D/cfg" \
      node "$ROOT/server/dist/webcamo-bundle.cjs" run --no-window > "$D/daemon.log" 2>&1 & echo $! > "$D/daemon.pid"
    for _ in $(seq 40); do curl -fs http://127.0.0.1:47800/api/status >/dev/null && break; sleep 0.25; done
    if [ "${2:-}" = plugged ]; then
      for _ in $(seq 60); do curl -fs http://127.0.0.1:47800/api/status | grep -q '"STREAMING"' && break; sleep 0.25; done
    fi ;;
  real)
    # The real phone: no stand-in, no adb shim. Only the config folder is
    # isolated, so filming leaves the user's own settings alone.
    "$0" down >/dev/null 2>&1 || true
    mkdir -p "$D/cfg-real/mobile_webcam"
    echo '{"autoStart":true}' > "$D/cfg-real/mobile_webcam/config.json"
    XDG_CONFIG_HOME="$D/cfg-real" \
      node "$ROOT/server/dist/webcamo-bundle.cjs" run --no-window > "$D/daemon.log" 2>&1 & echo $! > "$D/daemon.pid"
    for _ in $(seq 80); do curl -fs http://127.0.0.1:47800/api/status 2>/dev/null | grep -q '"STREAMING"' && break; sleep 0.25; done ;;
  plug) touch "$D/plugged" ;;
  down)
    for f in daemon phone; do
      [ -f "$D/$f.pid" ] && kill "$(cat "$D/$f.pid")" 2>/dev/null || true
      rm -f "$D/$f.pid"
    done
    sleep 2 ;;
  *) echo "usage: $0 up [plugged] | real | plug | down"; exit 2 ;;
esac
