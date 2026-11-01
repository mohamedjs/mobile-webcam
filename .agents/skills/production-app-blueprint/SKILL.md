---
name: production-app-blueprint
description: >-
  Refactor and upgrade any application into a production-ready cross-platform product
  (Linux, macOS, Windows, and mobile) using the Lura reference architecture. Includes:
  (1) Layered Modular Monolith architecture (domain/application/infrastructure + composition root),
  (2) Converting a local web server UI into a native desktop app window with background service,
  (3) Multi-OS packaging (.deb, .tar.gz, macOS .app + Homebrew cask, Windows Inno Setup .exe) and CI/CD release workflows,
  and (4) Bilingual (EN/AR) OS-aware static landing page wired to GitHub Releases.
---

# Production App Blueprint (Modular Monolith + Desktop App + Multi-OS Packaging + Landing Page)

Use this skill when asked to refactor a project for production, structure a codebase as a **layered modular monolith**, turn a local server/web UI into a **native desktop application** for **Linux, macOS, and Windows**, set up **cross-platform installers & GitHub release pipelines**, or build a **production landing page** with live OS-aware download links.

---

## 1. Layered Modular Monolith Architecture

Every application (Node.js/TypeScript, Python, Rust, or Go) must be organized as a **Modular Monolith** with strict **DDD Layered Architecture** inside each module.

### Core Directory Structure

```text
src/
├── main.{ts,py}              # CLI & lifecycle entrypoint (run, window/dashboard, doctor, --version)
├── composition-root.{ts,py}  # ONLY file allowed to instantiate and wire modules together
├── shared/ (or kernel/)      # Cross-cutting primitives; depends on NO module
│   ├── paths.{ts,py}         # Per-OS config/data/cache/log directories
│   ├── events.{ts,py}        # Typed synchronous in-process EventBus (emits facts, never commands)
│   ├── errors.{ts,py}        # AppError (code, message, retryable, cause)
│   ├── process.{ts,py}       # ManagedProcess (backoff, graceful SIGTERM→SIGKILL, log capture)
│   ├── result.{ts,py}        # Ok / Err result type for expected failures
│   └── i18n/                 # en.json, ar.json
└── modules/
    └── <module-name>/
        ├── index.ts (or __init__.py)  # Public API — the ONLY file other modules may import
        ├── domain/                    # Pure business logic, entities, value objects, Port interfaces (ZERO I/O)
        ├── application/               # Use cases orchestrating domain + ports (depends only on domain)
        └── infrastructure/            # Concrete adapters: HTTP, SQLite/files, OS CLIs, sockets, child processes
```

### The 5 Non-Negotiable Architecture Rules

1. **Public Boundary Only:** A module is imported strictly via its package root (`modules/<name>/index.ts` or `modules/<name>/__init__.py`). Importing `modules/foo/infrastructure/Bar` from outside `foo` is forbidden.
2. **Strict Inward Dependency Direction:** `infrastructure` → `application` → `domain`.
   - `domain/` must have **zero I/O** (no `fs`, `http`, `child_process`, `subprocess`, database drivers, or web frameworks).
   - If a lower module or `application/` layer needs an external capability, it defines a `Port` interface (`Protocol` in Python, `interface` in TS) in `domain/`, and `composition-root` injects the `infrastructure/` adapter.
3. **Single Composition Root:** No DI container frameworks. `composition-root.{ts,py}` explicitly constructs adapters and modules and wires them together.
4. **Single State Owner:** Each piece of state (settings, tunnel, pipeline, telemetry) is mutated by exactly one module.
5. **Event Bus Carries Facts, Not Commands:** Emit past-tense facts (`device.connected`, `settings.changed`). Use direct interface method calls for commands (`startStream()`).

- Read [references/modular-monolith-architecture.md](./references/modular-monolith-architecture.md) for copy-pasteable TypeScript & Python templates and the automated `test_architecture` boundary test.

---

## 2. Turn Any Local Server Website into a Native Desktop App (Linux, macOS, Windows)

Never force end-users to manually start a terminal server and open a browser tab. Follow the **Daemon + Native Window** pattern:

1. **Local Loopback Server (`127.0.0.1:<port>`):**
   - Bind strictly to `127.0.0.1`. Serve the REST/WebSocket API and static dashboard UI.
2. **Dedicated Native Window Process (`<app> window <url>`):**
   - Running `<app>` (or clicking the desktop/dock/start-menu icon) starts the background daemon (if not already running) and opens the UI in a **chromeless native window** (`1220x880`, min `420x560`) with persistent storage (`theme`, `lang`).
   - **Window Backend Priority Chain:**
     1. Native OS WebView (`pywebview` / WebView2 on Windows, WKWebView on macOS, Qt WebEngine / WebKitGTK on Linux) **or** Chromium-family App Mode (`--app=http://127.0.0.1:<port> --window-size=1220,880` using pre-installed Edge on Windows, Chrome/Edge/Brave/Chromium on macOS & Linux).
     2. **Crash Reaper & Fallback:** Monitor the window child process; if it exits with a non-zero code (e.g., GPU/driver issue), automatically fall back to opening the URL in the system default browser so the user is never stranded.
3. **CLI Subcommands Contract:**
   - `<app> run [--no-window]`: Runs the background service (passes `--no-window` when started by `systemd --user`, macOS `LaunchAgent`, or Windows `HKCU\...\Run` autostart).
   - `<app> dashboard` (or `<app>` with no args when daemon is alive): Opens the native desktop window.
   - `<app> doctor` (or `selftest`): Verifies OS dependencies, permissions, and devices; prints `[PASS]`/`[FAIL]` with exact fix commands.
   - `<app> --version`: Prints `<version>` and exits `0` (used by CI smoke tests).

- Read [references/desktop-app-and-packaging.md](./references/desktop-app-and-packaging.md) for the complete Python & Node.js native window launcher implementations.

---

## 3. Cross-Platform Packaging & GitHub Actions Release Pipeline

Every production desktop app ships installers for **Linux, macOS (Apple Silicon + Intel), and Windows** from a single `.github/workflows/release.yml` triggered by `v*` tags or `workflow_dispatch`.

### Standard Release Artifacts Matrix

| OS | Artifact Filename | Packaging Method |
|---|---|---|
| **Windows** | `<App>-Setup-<v>.exe` | Inno Setup (`packaging/windows/<app>.iss`), `PrivilegesRequired=lowest` (per-user, no UAC prompt), `HKCU\...\Run` autostart task |
| **Windows** | `<app>-<v>-windows-x64-portable.zip` | Portable zip of the frozen app folder |
| **macOS (M1–M4)** | `<App>-<v>-macos-arm64.zip` | `ditto -c -k --keepParent dist/<App>.app` on `macos-15` |
| **macOS (Intel)** | `<App>-<v>-macos-x86_64.zip` | `ditto -c -k --keepParent dist/<App>.app` on `macos-15-intel` |
| **macOS Homebrew** | `Casks/<app>.rb` | Automated push to `homebrew-<app>` tap repo (`postflight` strips `com.apple.quarantine`) |
| **Linux (Deb)** | `<app>_<v>_amd64.deb` | `packaging/linux/build-deb.sh` installing to `/opt/<app>`, `/usr/bin/<app>`, `.desktop` launcher, `systemd --user` service with `prerm`/`postinst` seamless restart |
| **Linux (Tar)** | `<app>-<v>-linux-x86_64.tar.gz` | Portable tarball built on `ubuntu-22.04` (oldest target `glibc`) |
| **Checksums** | `SHA256SUMS.txt` | `sha256sum * > SHA256SUMS.txt` attached to the GitHub Release |

- Read [references/desktop-app-and-packaging.md](./references/desktop-app-and-packaging.md) for the complete `build-deb.sh`, `.desktop`, `.service`, `.iss`, `homebrew.rb.tmpl`, and `.github/workflows/release.yml` templates.

---

## 4. Production Landing Page (`site/` + `.github/workflows/pages.yml`)

Every project includes a zero-framework, fast static landing page in `site/` deployed via GitHub Pages (`.github/workflows/pages.yml`).

### Required Landing Page Capabilities

1. **Bilingual EN / AR (`dir="ltr"` / `dir="rtl"`):**
   - Instant client-side language toggle (`EN` | `ع`) stored in `localStorage`, defaulting to `ar` when `navigator.language.startsWith("ar")`.
2. **Light / Dark / Auto Theme:**
   - CSS custom properties (`:root` + `:root[data-theme="dark"]` + `@media (prefers-color-scheme: dark)`) with a 3-state cycle button (`auto` → `dark` → `light`).
3. **OS Auto-Detection & Live GitHub Release Wiring:**
   - Detects `windows`, `macos`, `linux`, `mobile` (`android` / `ios`).
   - Fetches `release.json` (baked at build time by `site/build.sh` so visitors never hit GitHub API rate limits) with `https://api.github.com/repos/<owner>/<repo>/releases/latest` as a live fallback.
   - Binds each `[data-asset]` button to the matching release asset's `browser_download_url` and appends the file size in MB (`· 42 MB`).
   - Highlights the visitor's detected OS card with `.platform.mine` (`your computer` / `جهازك` badge) and wires the primary `#hero-download` CTA button to their OS installer.
   - Auto-refreshes whenever `.github/workflows/release.yml` publishes a new release (`gh workflow run pages.yml`).

- Read [references/landing-page-template.md](./references/landing-page-template.md) for the complete `site/index.html`, `site/site.css`, `site/site.js`, `site/build.sh`, and `.github/workflows/pages.yml` templates.

---

## 5. Step-by-Step Refactoring Workflow

When applying this skill to any project:

1. **Audit & Restructure into Layered Modular Monolith:**
   - Move shared utilities (`paths`, `events`, `errors`, `process`, `result`, `i18n`) into `shared/` (or `kernel/`).
   - Group features into `modules/<name>/{domain,application,infrastructure}` with a single public `index.ts` / `__init__.py`.
   - Centralize all wiring in `composition-root.{ts,py}`.
   - Add the automated architecture boundary test (`test_architecture`) and verify all unit/integration tests pass.
2. **Add Native Desktop Window & CLI Lifecycle:**
   - Add the `window` module (`launch()`, `openAppWindowOrBrowser()`) and CLI subcommands (`run`, `dashboard`, `window`, `doctor`, `--version`).
   - Ensure the dashboard UI supports EN/AR (`dir="rtl"`) and Dark/Light themes.
3. **Add Multi-OS Packaging (`packaging/` + `.github/workflows/release.yml`):**
   - Create `packaging/linux/{build-deb.sh,<app>.desktop,<app>.service}`, `packaging/windows/<app>.iss`, `packaging/homebrew/<app>.rb.tmpl`, and `.github/workflows/release.yml`.
4. **Create the Landing Page (`site/` + `.github/workflows/pages.yml`):**
   - Create `site/{index.html,site.css,site.js,build.sh}` and `.github/workflows/pages.yml`.
   - Run `bash site/build.sh` to verify `_site/` builds cleanly.
5. **Create Bilingual Marketing Video (`remotion-video-studio`):**
   - Use the shared Remotion studio at `/var/www/html/old/remotion` (`@remotion/transitions`, `@remotion/sfx`, `@remotion/media`) to generate `intro-en.mp4`, `intro-ar.mp4`, `intro-en.jpg`, and `intro-ar.jpg` into `site/assets/` and wire them into the landing page.
   - See [../remotion-video-studio/SKILL.md](../remotion-video-studio/SKILL.md) for full details.

