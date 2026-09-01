#!/usr/bin/env bash
# macOS setup script for mobile-webcam

set -euo pipefail

say()  { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33m[!]\033[0m %s\n' "$1"; }

# 1. Check for Homebrew
if ! command -v brew >/dev/null 2>&1; then
  warn "Homebrew is not installed. Please install it from https://brew.sh/"
  exit 1
fi

# 2. Check for dependencies
say "Checking for macOS dependencies..."
MISSING=()
command -v iproxy >/dev/null || MISSING+=(libusbmuxd)
command -v idevice_id >/dev/null || MISSING+=(libimobiledevice)
command -v ffmpeg >/dev/null || MISSING+=(ffmpeg)

if [ "${#MISSING[@]}" -gt 0 ]; then
  say "Installing missing packages via Homebrew: ${MISSING[*]}"
  brew install "${MISSING[@]}"
else
  say "All packages present."
fi

# 3. Check for device
if idevice_id -l 2>/dev/null | grep -q .; then
  say "iPhone paired: $(idevice_id -l | head -1)"
else
  warn "No paired iPhone. Plug in the cable, unlock the phone, tap Trust."
fi

echo
say "Setup complete!"
say "Note: The Node.js desktop server pipeline is currently designed for Linux (requires v4l2/PipeWire)."
say "To use your iPhone as a webcam on macOS:"
say "  1. Run this command in a terminal: iproxy 8080 8080"
say "  2. Open the mobile app and tap 'Start server'"
say "  3. Open OBS Studio, add a 'Media Source', uncheck 'Local File', and set Input to:"
say "     http://127.0.0.1:8080/stream.mp4"
say "  4. Start OBS Virtual Camera to use it in Zoom/Meet."
