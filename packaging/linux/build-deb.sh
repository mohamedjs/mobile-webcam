#!/usr/bin/env bash
# Package Webcamo as a .deb for Debian/Ubuntu.
#   packaging/linux/build-deb.sh 0.1.0 [amd64]
set -euo pipefail
VERSION="${1:-0.1.0}"
ARCH="${2:-amd64}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DIST="$ROOT/dist/webcamo"

mkdir -p "$DIST"
# Ensure server is built and copied if not already packaged
if [ ! -f "$DIST/main.js" ]; then
  mkdir -p "$DIST"
  cp -r "$ROOT/server/dist/." "$DIST/"
  cat <<'EOF' > "$DIST/webcamo"
#!/usr/bin/env bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec node "$DIR/main.js" "$@"
EOF
  chmod +x "$DIST/webcamo"
fi

PKG="$(mktemp -d)/webcamo_${VERSION}_${ARCH}"
mkdir -p "$PKG/DEBIAN" "$PKG/opt" "$PKG/usr/bin" "$PKG/usr/share/applications" \
         "$PKG/usr/share/icons/hicolor/512x512/apps" "$PKG/usr/lib/systemd/user" \
         "$PKG/usr/share/doc/webcamo"

cp -a "$DIST" "$PKG/opt/webcamo"
ln -s /opt/webcamo/webcamo "$PKG/usr/bin/webcamo"
install -m644 "$HERE/webcamo.desktop" "$PKG/usr/share/applications/webcamo.desktop"
install -m644 "$HERE/webcamo.service" "$PKG/usr/lib/systemd/user/webcamo.service"
[ -f "$ROOT/packaging/icons/webcamo.png" ] && install -m644 "$ROOT/packaging/icons/webcamo.png" "$PKG/usr/share/icons/hicolor/512x512/apps/webcamo.png"

SIZE="$(du -sk "$PKG" | cut -f1)"
cat > "$PKG/DEBIAN/control" <<CONTROL
Package: webcamo
Version: $VERSION
Section: video
Priority: optional
Architecture: $ARCH
Installed-Size: $SIZE
Maintainer: Mohamed <mohamed@tripklik.com>
Homepage: https://github.com/mohamedjs/mobile-webcam
Depends: ffmpeg, v4l2loopback-utils, libusbmuxd-tools, adb, nodejs (>= 20.0.0)
Recommends: v4l2loopback-dkms, pipewire, pipewire-pulse
Description: Turn your iPhone or Android phone into a studio webcam over USB
 Webcamo streams pristine 4K & 1080p60 video from your phone over USB cable
 into a native virtual webcam (/dev/video9) and virtual microphone on Linux.
 Zero cloud, hardware H.264 fMP4 encoded, 50ms latency.
CONTROL

cat > "$PKG/DEBIAN/postinst" <<'POSTINST'
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q /usr/share/icons/hicolor || true
for u in $(loginctl list-users --no-legend 2>/dev/null | awk '{print $2}'); do
  systemctl --user -M "$u@" daemon-reload 2>/dev/null || true
  if grep -qx "$u" /run/webcamo-was-running 2>/dev/null; then
    systemctl --user -M "$u@" start webcamo.service 2>/dev/null || true
  fi
done
rm -f /run/webcamo-was-running
echo "Webcamo is installed. Launch from your applications menu or run: webcamo"
POSTINST

cat > "$PKG/DEBIAN/prerm" <<'PRERM'
#!/bin/sh
for u in $(loginctl list-users --no-legend 2>/dev/null | awk '{print $2}'); do
  if systemctl --user -M "$u@" is-active -q webcamo.service 2>/dev/null; then
    echo "$u" >> /run/webcamo-was-running
    systemctl --user -M "$u@" stop webcamo.service 2>/dev/null || true
  fi
done
exit 0
PRERM

chmod 755 "$PKG/DEBIAN/postinst" "$PKG/DEBIAN/prerm"

mkdir -p "$ROOT/dist"
dpkg-deb --build --root-owner-group "$PKG" "$ROOT/dist/webcamo_${VERSION}_${ARCH}.deb"
echo "Built dist/webcamo_${VERSION}_${ARCH}.deb"
