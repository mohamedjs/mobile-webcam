#!/usr/bin/env bash
# Bundles self-contained Windows portable zip (and Inno Setup installer if iscc is present).
set -euo pipefail
VERSION="${1:-0.1.0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$ROOT/dist"
WIN_DIR="$OUT/windows-x64"

rm -rf "$WIN_DIR"
mkdir -p "$WIN_DIR/static"

cp "$ROOT/server/dist/webcamo-bundle.cjs" "$WIN_DIR/webcamo-bundle.cjs"
cp -r "$ROOT/server/dist/static/." "$WIN_DIR/static/"
[ -f "$ROOT/packaging/icons/webcamo.ico" ] && cp "$ROOT/packaging/icons/webcamo.ico" "$WIN_DIR/webcamo.ico"

cat <<'EOF' > "$WIN_DIR/webcamo.cmd"
@echo off
setlocal
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo Error: Node.js 20+ is required to run Webcamo. Install from https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0webcamo-bundle.cjs" %*
EOF

cat <<'EOF' > "$WIN_DIR/Webcamo.bat"
@echo off
setlocal
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  msg "%username%" "Webcamo requires Node.js 20+ installed on your PC. Download from https://nodejs.org"
  exit /b 1
)
start "Webcamo" /min cmd /c "node "%~dp0webcamo-bundle.cjs" dashboard"
EOF

cat <<'EOF' > "$WIN_DIR/Webcamo.vbs"
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.Run "cmd /c """"" & dir & "\webcamo.cmd"" dashboard""", 0, False
EOF

cat <<EOF > "$WIN_DIR/README.txt"
Webcamo v${VERSION} for Windows (64-bit)
========================================

Quick Start:
1. Double-click "Webcamo.vbs" (or "Webcamo.bat") to start the background daemon
   and open the native Webcamo control window.
2. Or from Command Prompt / PowerShell:
     webcamo.cmd dashboard
     webcamo.cmd doctor
     webcamo.cmd --version

Requirements:
- Windows 10 or Windows 11 (64-bit)
- Node.js 20+ (https://nodejs.org)
- FFmpeg in PATH (winget install Gyan.FFmpeg)
EOF

rm -f "$OUT/webcamo-windows-x64-${VERSION}.zip"
if command -v zip >/dev/null 2>&1; then
  (cd "$OUT" && zip -qry "webcamo-windows-x64-${VERSION}.zip" windows-x64)
elif command -v 7z >/dev/null 2>&1; then
  (cd "$OUT" && 7z a -tzip "webcamo-windows-x64-${VERSION}.zip" windows-x64 >/dev/null)
fi
echo "Built dist/webcamo-windows-x64-${VERSION}.zip"
