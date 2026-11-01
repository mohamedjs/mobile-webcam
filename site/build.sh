#!/usr/bin/env bash
# Assemble the Webcamo landing page into _site/ (what GitHub Pages / Apache serves).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/_site"

rm -rf "$OUT"
mkdir -p "$OUT/assets"

cp "$ROOT/site/index.html" "$ROOT/site/site.css" "$ROOT/site/site.js" "$OUT/"
cp "$ROOT/site/assets/favicon.svg" "$OUT/assets/"

# Bake latest release metadata if available; otherwise write fallback release.json
if command -v curl >/dev/null; then
  auth=()
  [ -n "${GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")
  curl -fsSL "${auth[@]}" "https://api.github.com/repos/mohamedjs/mobile-webcam/releases/latest" -o "$OUT/release.json" 2>/dev/null \
    || cat <<'EOF' > "$OUT/release.json"
{
  "tag_name": "v0.1.0",
  "name": "Webcamo v0.1.0",
  "assets": [
    { "name": "webcamo-setup-v0.1.0.exe", "browser_download_url": "https://github.com/mohamedjs/mobile-webcam/releases/download/v0.1.0/webcamo-setup-v0.1.0.exe" },
    { "name": "webcamo-windows-x64-v0.1.0.zip", "browser_download_url": "https://github.com/mohamedjs/mobile-webcam/releases/download/v0.1.0/webcamo-windows-x64-v0.1.0.zip" },
    { "name": "webcamo-v0.1.0.dmg", "browser_download_url": "https://github.com/mohamedjs/mobile-webcam/releases/download/v0.1.0/webcamo-v0.1.0.dmg" },
    { "name": "webcamo_0.1.0_amd64.deb", "browser_download_url": "https://github.com/mohamedjs/mobile-webcam/releases/download/v0.1.0/webcamo_0.1.0_amd64.deb" },
    { "name": "webcamo-linux-x64-v0.1.0.tar.gz", "browser_download_url": "https://github.com/mohamedjs/mobile-webcam/releases/download/v0.1.0/webcamo-linux-x64-v0.1.0.tar.gz" },
    { "name": "webcamo-v0.1.0.apk", "browser_download_url": "https://github.com/mohamedjs/mobile-webcam/releases/download/v0.1.0/webcamo-v0.1.0.apk" }
  ]
}
EOF
fi

touch "$OUT/.nojekyll"
echo "built $OUT ($(du -sh "$OUT" | cut -f1))"
