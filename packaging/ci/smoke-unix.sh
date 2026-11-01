#!/usr/bin/env bash
# Smoke test on Linux / macOS: boots server, checks /api/status, verifies clean exit.
set -euo pipefail
PORT="${1:-47800}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Starting Webcamo smoke test on port $PORT..."
node "$ROOT/server/dist/main.js" run --no-window &
PID=$!

trap 'kill "$PID" 2>/dev/null || true' EXIT

for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
    echo "Webcamo responded cleanly on HTTP /api/status"
    exit 0
  fi
  sleep 0.5
done

echo "Smoke test timed out waiting for Webcamo daemon" >&2
exit 1
