# Webcamo Keynote Video (Code-First Film)

Programmatic product keynote animation video for Webcamo, created following the **[Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar)** code-first film architecture (Dark Tech Keynote style).

## Architecture

- **Visual Engine (`animation.html`)**:
  - Deterministic time-driven Canvas 2D (`window.render(t)`) at 1920×1080.
  - Snap-grid typography, optical camera HUD, lens selector dock, live VU meters, USB connect sequence, and multi-app integration cards.
  - Bilingual support (English and Arabic RTL) with dynamic glyph layout.
- **Headless Capture Pipeline (`frames.mjs`)**:
  - Headless Chromium (Playwright) frame-by-frame snapshot capture.
  - Raw JPEG stream piped directly into `ffmpeg` via stdin (`-f image2pipe`).
- **Sound Design & Multiplexing (`render.mjs`)**:
  - Procedural sound synthesis using FFmpeg `aevalsrc`:
    - Ambient harmonic drone pad with harmonic overtone modulation.
    - Low-frequency laptop fan rumble (Scene 1).
    - High-frequency metallic USB connect chime (Scene 2).
    - Camera shutter optical snap (Scene 3).
    - Multi-note app docking chords (Scene 4).
    - Warm resolution finale chord (Scene 5).
  - Faststart MP4 encoding (`-movflags +faststart`) and automatic poster frame extraction (`intro-{en,ar}.jpg`).

## Usage

```bash
# Render English and Arabic full production videos (1080p @ 30fps)
node render.mjs --all

# Render English preview only (15fps fast pass)
node render.mjs --lang en --preview

# Capture still frames for visual regression
node capture-stills.mjs
```
