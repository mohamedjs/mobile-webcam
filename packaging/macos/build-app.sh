#!/usr/bin/env bash
# Bundles macos/Webcamo.app + self-contained server bundle into Webcamo-<version>-macos-<arch>.zip
# and (when hdiutil or genisoimage is available) Webcamo-<version>.dmg.
set -euo pipefail
VERSION="${1:-0.1.0}"
ARCH="${2:-arm64}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

OUT="$ROOT/dist"
mkdir -p "$OUT"
APP="$OUT/Webcamo.app"
rm -rf "$APP"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/server/static"

cat <<'EOF' > "$APP/Contents/MacOS/webcamo"
#!/usr/bin/env bash
HERE="$(cd "$(dirname "$0")/../Resources/server" && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.fnm/current/bin:$PATH"
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_LATEST="$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)"
  if [ -n "$NVM_LATEST" ]; then
    export PATH="$HOME/.nvm/versions/node/$NVM_LATEST/bin:$PATH"
  fi
fi

ARGS=()
for arg in "$@"; do
  if [[ "$arg" != -psn_* ]]; then
    ARGS+=("$arg")
  fi
done

if ! command -v node >/dev/null 2>&1; then
  if [ "$(uname -s)" = "Darwin" ] && command -v osascript >/dev/null 2>&1; then
    osascript -e 'display dialog "Webcamo requires Node.js 20+ installed on your Mac.\n\nInstall via Homebrew:\n  brew install node\n\nOr download from https://nodejs.org" buttons {"OK"} default button "OK" with title "Webcamo" with icon stop' >/dev/null 2>&1 || true
  else
    echo "Error: Node.js 20+ is required to run Webcamo. Install from https://nodejs.org" >&2
  fi
  exit 1
fi

exec node "$HERE/webcamo-bundle.cjs" "${ARGS[@]}"
EOF
chmod +x "$APP/Contents/MacOS/webcamo"

cat <<EOF > "$APP/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>webcamo</string>
  <key>CFBundleIdentifier</key>
  <string>com.webcamo.app</string>
  <key>CFBundleName</key>
  <string>Webcamo</string>
  <key>CFBundleDisplayName</key>
  <string>Webcamo</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

cp "$ROOT/server/dist/webcamo-bundle.cjs" "$APP/Contents/Resources/server/webcamo-bundle.cjs"
cp -r "$ROOT/server/dist/static/." "$APP/Contents/Resources/server/static/"
[ -f "$ROOT/packaging/icons/webcamo.png" ] && cp "$ROOT/packaging/icons/webcamo.png" "$APP/Contents/Resources/webcamo.png"

rm -f "$OUT/Webcamo-${VERSION}-macos-${ARCH}.zip"
(cd "$OUT" && zip -qry "Webcamo-${VERSION}-macos-${ARCH}.zip" Webcamo.app)
echo "Built dist/Webcamo-${VERSION}-macos-${ARCH}.zip"

if command -v hdiutil >/dev/null 2>&1; then
  DMG_STAGE="$(mktemp -d)"
  cp -R "$APP" "$DMG_STAGE/Webcamo.app"
  ln -s /Applications "$DMG_STAGE/Applications"
  rm -f "$OUT/webcamo-v${VERSION}.dmg"
  hdiutil create -volname "Webcamo ${VERSION}" -srcfolder "$DMG_STAGE" -ov -format UDZO "$OUT/webcamo-v${VERSION}.dmg"
  rm -rf "$DMG_STAGE"
  echo "Built dist/webcamo-v${VERSION}.dmg"
fi
