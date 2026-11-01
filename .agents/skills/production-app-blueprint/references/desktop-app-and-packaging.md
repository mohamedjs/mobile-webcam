# Native Desktop App Window & Cross-Platform Packaging Reference (Linux, macOS, Windows)

Templates derived from `/var/www/html/lura` (`window.py`, `packaging/`, `.github/workflows/release.yml`).

---

## 1. Native Desktop App Window Launcher (Node.js / TypeScript & Python)

Instead of forcing users to open a browser tab, launch a chromeless native window pointing to the local server (`http://127.0.0.1:<port>`), with automatic crash reaping and browser fallback.

### TypeScript Implementation (`src/modules/window/infrastructure/NativeWindowLauncher.ts`)

```ts
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SIZE = { width: 1220, height: 880 };
let activeWindow: ChildProcess | null = null;

function findChromiumBrowsers(): string[] {
  if (process.platform === 'win32') {
    const roots = [
      process.env['PROGRAMFILES(X86)'] ?? '',
      process.env['PROGRAMFILES'] ?? '',
      process.env['LOCALAPPDATA'] ?? '',
    ].filter(Boolean);
    const rels = [
      'Microsoft\\Edge\\Application\\msedge.exe',
      'Google\\Chrome\\Application\\chrome.exe',
      'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    ];
    const found: string[] = [];
    for (const r of roots) {
      for (const rel of rels) {
        const full = join(r, rel);
        if (existsSync(full)) found.push(full);
      }
    }
    return found;
  }

  if (process.platform === 'darwin') {
    const apps = ['Google Chrome', 'Microsoft Edge', 'Brave Browser', 'Chromium'];
    return apps
      .map((a) => `/Applications/${a}.app/Contents/MacOS/${a}`)
      .filter((p) => existsSync(p));
  }

  // Linux
  const names = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'microsoft-edge',
    'microsoft-edge-stable',
    'brave-browser',
  ];
  const found: string[] = [];
  for (const name of names) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p) found.push(p);
    } catch {}
  }
  return found;
}

export function openFallbackBrowser(url: string): void {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
  } else if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  }
}

export function launchNativeWindow(url: string, dataDir: string): void {
  if (activeWindow && activeWindow.exitCode === null) return;

  const profileDir = join(dataDir, 'window-profile');
  mkdirSync(profileDir, { recursive: true });

  for (const browser of findChromiumBrowsers()) {
    try {
      const child = spawn(
        browser,
        [
          `--app=${url}`,
          `--window-size=${SIZE.width},${SIZE.height}`,
          `--user-data-dir=${profileDir}`,
          '--no-first-run',
          '--no-default-browser-check',
        ],
        {
          detached: process.platform !== 'win32',
          stdio: 'ignore',
          windowsHide: true,
        },
      );
      activeWindow = child;
      child.on('error', () => {
        activeWindow = null;
        openFallbackBrowser(url);
      });
      child.unref();
      return;
    } catch {
      continue;
    }
  }

  openFallbackBrowser(url);
}
```

---

## 2. Linux Packaging (`packaging/linux/`)

### 2.1 `packaging/linux/<app>.desktop`

```ini
[Desktop Entry]
Type=Application
Name=AppName
Comment=App Description
Exec=/opt/appname/appname dashboard
Icon=appname
Terminal=false
Categories=Utility;AudioVideo;
StartupWMClass=appname
```

### 2.2 `packaging/linux/<app>.service` (`systemd --user`)

```ini
[Unit]
Description=AppName background service
After=graphical-session.target pipewire.service

[Service]
Type=simple
ExecStart=/opt/appname/appname run --no-window
Restart=on-failure
RestartSec=3
RestartPreventExitStatus=78

[Install]
WantedBy=default.target
```

### 2.3 `packaging/linux/build-deb.sh`

```bash
#!/usr/bin/env bash
# Package dist/<app> as a .deb for Debian/Ubuntu:
#   packaging/linux/build-deb.sh <version> [amd64]
set -euo pipefail
APP="webcamo"
VERSION="${1:?version}"
ARCH="${2:-amd64}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
DIST="$ROOT/dist/$APP"
[ -x "$DIST/$APP" ] || { echo "Build first: $DIST/$APP missing" >&2; exit 1; }

PKG="$(mktemp -d)/${APP}_${VERSION}_${ARCH}"
mkdir -p "$PKG/DEBIAN" "$PKG/opt" "$PKG/usr/bin" "$PKG/usr/share/applications" \
         "$PKG/usr/share/icons/hicolor/512x512/apps" "$PKG/usr/lib/systemd/user"
cp -a "$DIST" "$PKG/opt/$APP"
ln -s "/opt/$APP/$APP" "$PKG/usr/bin/$APP"
install -m644 "$HERE/$APP.desktop" "$PKG/usr/share/applications/$APP.desktop"
install -m644 "$HERE/$APP.service" "$PKG/usr/lib/systemd/user/$APP.service"
install -m644 "$ROOT/packaging/icons/$APP.png" "$PKG/usr/share/icons/hicolor/512x512/apps/$APP.png"

SIZE="$(du -sk "$PKG" | cut -f1)"
cat > "$PKG/DEBIAN/control" <<CONTROL
Package: $APP
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Installed-Size: $SIZE
Maintainer: Mohamed <mohamed@tripklik.com>
Homepage: https://github.com/mohamedjs/$APP
Depends: ffmpeg, libstdc++6, libgcc-s1, zlib1g
Description: Desktop application and service for $APP
CONTROL

cat > "$PKG/DEBIAN/prerm" <<PRERM
#!/bin/sh
for u in \$(loginctl list-users --no-legend 2>/dev/null | awk '{print \$2}'); do
  if systemctl --user -M "\$u@" is-active -q $APP.service 2>/dev/null; then
    echo "\$u" >> /run/$APP-was-running
    systemctl --user -M "\$u@" stop $APP.service 2>/dev/null || true
  fi
done
exit 0
PRERM

cat > "$PKG/DEBIAN/postinst" <<POSTINST
#!/bin/sh
set -e
command -v update-desktop-database >/dev/null && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q /usr/share/icons/hicolor || true
for u in \$(loginctl list-users --no-legend 2>/dev/null | awk '{print \$2}'); do
  systemctl --user -M "\$u@" daemon-reload 2>/dev/null || true
  if grep -qx "\$u" /run/$APP-was-running 2>/dev/null; then
    systemctl --user -M "\$u@" start $APP.service 2>/dev/null || true
  else
    systemctl --user -M "\$u@" try-restart $APP.service 2>/dev/null || true
  fi
done
rm -f /run/$APP-was-running
POSTINST
chmod 755 "$PKG/DEBIAN/postinst" "$PKG/DEBIAN/prerm"

mkdir -p "$ROOT/dist"
dpkg-deb --build --root-owner-group "$PKG" "$ROOT/dist/${APP}_${VERSION}_${ARCH}.deb"
echo "Built dist/${APP}_${VERSION}_${ARCH}.deb"
```

---

## 3. Windows Inno Setup Installer (`packaging/windows/<app>.iss`)

```iss
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{8A2B3C4D-5E6F-4A1B-9C8D-7E6F5A4B3C2D}
AppName=Webcamo
AppVersion={#AppVersion}
AppPublisher=Webcamo
AppPublisherURL=https://github.com/mohamedjs/mobile-webcam
DefaultDirName={autopf}\Webcamo
DefaultGroupName=Webcamo
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\..\dist
OutputBaseFilename=Webcamo-Setup-{#AppVersion}
SetupIconFile=..\icons\webcamo.ico
UninstallDisplayIcon={app}\WebcamoApp.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "arabic"; MessagesFile: "compiler:Languages\Arabic.isl"

[Tasks]
Name: "autostart"; Description: "Start Webcamo when I sign in"; GroupDescription: "Startup:"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\..\dist\webcamo\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Webcamo"; Filename: "{app}\WebcamoApp.exe"; Parameters: "run"
Name: "{group}\Webcamo Dashboard"; Filename: "{app}\WebcamoApp.exe"; Parameters: "dashboard"
Name: "{group}\Uninstall Webcamo"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Webcamo"; Filename: "{app}\WebcamoApp.exe"; Parameters: "run"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Webcamo"; \
  ValueData: """{app}\WebcamoApp.exe"" run --no-window"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\WebcamoApp.exe"; Parameters: "run"; Description: "Start Webcamo now"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{cmd}"; Parameters: "/C taskkill /IM WebcamoApp.exe /F"; Flags: runhidden; RunOnceId: "StopWebcamo"
```

---

## 4. macOS Homebrew Cask Template (`packaging/homebrew/<app>.rb.tmpl`)

```ruby
cask "webcamo" do
  arch arm: "arm64", intel: "x86_64"

  version "@VERSION@"
  sha256 arm:   "@SHA_ARM64@",
         intel: "@SHA_X86_64@"

  url "https://github.com/mohamedjs/mobile-webcam/releases/download/v#{version}/Webcamo-#{version}-macos-#{arch}.zip"
  name "Webcamo"
  desc "Turn your iPhone or Android into a 1080p60 USB webcam and microphone"
  homepage "https://github.com/mohamedjs/mobile-webcam"

  depends_on macos: ">= :monterey"

  app "Webcamo.app"
  binary "#{appdir}/Webcamo.app/Contents/MacOS/webcamo"

  postflight do
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{appdir}/Webcamo.app"]
  end

  uninstall launchctl: "com.mobilewebcam.app",
            quit:      "com.mobilewebcam.app"

  zap trash: [
    "~/Library/Application Support/Webcamo",
    "~/Library/LaunchAgents/com.mobilewebcam.app.plist",
  ]
end
```

---

## 5. Multi-OS GitHub Actions Release Workflow (`.github/workflows/release.yml`)

```yaml
name: Release

on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      version:
        description: "Version to build (without v), e.g. 1.0.0"
        required: true

permissions:
  contents: write
  actions: write

jobs:
  version:
    runs-on: ubuntu-latest
    outputs:
      version: ${{ steps.v.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - id: v
        run: |
          CODE=$(node -p "require('./package.json').version")
          V="${{ github.event.inputs.version }}"
          if [ -z "$V" ] && [ "$GITHUB_REF_TYPE" = "tag" ]; then V="${GITHUB_REF_NAME#v}"; fi
          [ -n "$V" ] || V="$CODE"
          if [ "$V" != "$CODE" ]; then
            echo "::error::Tag $V does not match package.json version $CODE"; exit 1
          fi
          echo "version=$V" >> "$GITHUB_OUTPUT"

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build && npm test

  build:
    needs: [version, test]
    strategy:
      fail-fast: false
      matrix:
        include:
          - { os: ubuntu-22.04, target: linux }
          - { os: macos-15, target: macos-arm64 }
          - { os: macos-15-intel, target: macos-x86_64 }
          - { os: windows-latest, target: windows }
    runs-on: ${{ matrix.os }}
    env:
      VERSION: ${{ needs.version.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci && npm run build

      - name: Package (Linux)
        if: runner.os == 'Linux'
        run: |
          packaging/linux/build-bundle.sh "$VERSION"
          packaging/linux/build-deb.sh "$VERSION" amd64
          tar -C dist -czf "dist/webcamo-$VERSION-linux-x86_64.tar.gz" webcamo
          mkdir -p out && cp dist/*.deb dist/*.tar.gz out/

      - name: Package (macOS)
        if: runner.os == 'macOS'
        run: |
          ARCH="${{ matrix.target }}"; ARCH="${ARCH#macos-}"
          packaging/macos/build-app.sh "$VERSION" "$ARCH"
          mkdir -p out
          ditto -c -k --keepParent dist/Webcamo.app "out/Webcamo-$VERSION-macos-$ARCH.zip"

      - name: Package (Windows)
        if: runner.os == 'Windows'
        shell: pwsh
        run: |
          packaging/windows/build-bundle.ps1 -Version $env:VERSION
          choco install innosetup -y --no-progress
          & "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" "/DAppVersion=$env:VERSION" packaging\windows\webcamo.iss
          New-Item -ItemType Directory -Force out | Out-Null
          Copy-Item "dist\Webcamo-Setup-$env:VERSION.exe" out\
          Compress-Archive -Path dist\webcamo\* -DestinationPath "out\webcamo-$env:VERSION-windows-x64-portable.zip"

      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.target }}
          path: out/*
          if-no-files-found: error

  release:
    if: github.ref_type == 'tag' || github.event_name == 'workflow_dispatch'
    needs: [version, build]
    runs-on: ubuntu-latest
    env:
      VERSION: ${{ needs.version.outputs.version }}
    steps:
      - uses: actions/download-artifact@v4
        with: { path: artifacts, merge-multiple: true }
      - run: cd artifacts && sha256sum * > SHA256SUMS.txt && cat SHA256SUMS.txt
      - uses: softprops/action-gh-release@v2
        with:
          tag_name: v${{ env.VERSION }}
          target_commitish: ${{ github.sha }}
          name: Release ${{ env.VERSION }}
          generate_release_notes: true
          files: artifacts/*
      - name: Refresh the landing page
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: gh workflow run pages.yml --repo "$GITHUB_REPOSITORY" --ref main || echo "::warning::could not trigger pages.yml"
```
