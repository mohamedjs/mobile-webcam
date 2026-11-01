#!/usr/bin/env bash
# Bundles macos/Webcamo.app + server runtime into Webcamo-<version>-macos-<arch>.zip
set -euo pipefail
VERSION="${1:-0.1.0}"
ARCH="${2:-arm64}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

OUT="$ROOT/dist"
mkdir -p "$OUT"
APP="$OUT/Webcamo.app"
rm -rf "$APP"

mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/server"

cat <<'EOF' > "$APP/Contents/MacOS/webcamo"
#!/usr/bin/env bash
HERE="$(cd "$(dirname "$0")/../Resources/server" && pwd)"
exec node "$HERE/main.js" "$@"
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
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
EOF

cp -r "$ROOT/server/dist/." "$APP/Contents/Resources/server/"

(cd "$OUT" && zip -qry "Webcamo-${VERSION}-macos-${ARCH}.zip" Webcamo.app)
echo "Built dist/Webcamo-${VERSION}-macos-${ARCH}.zip"
