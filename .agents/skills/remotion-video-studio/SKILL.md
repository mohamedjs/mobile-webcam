---
name: remotion-video-studio
description: >-
  Create production-ready marketing and keynote animation videos for any application
  using the shared Remotion studio at /var/www/html/old/remotion. Combines
  @remotion/transitions (TransitionSeries, slide, wipe, flip, fade),
  @remotion/sfx sound effects (whoosh, uiSwitch, shutterModern, ding, loadingLag),
  @remotion/media (<Audio>, <Video>), and Lemo-Opuscar Dark Tech Keynote motion graphics
  with bilingual English and Arabic (RTL) output.
---

# Remotion Video Studio Skill (`remotion-video-studio`)

Use this skill whenever the user wants to create an animated marketing video, product promo, or keynote showcase for any application using **Remotion**, **`@remotion/transitions`**, **`@remotion/sfx`**, and **`@remotion/media`**.

---

## 1. Shared Studio Location & Architecture

Instead of reinstalling Remotion in every repository, use the centralized multi-app studio located at:

```text
/var/www/html/old/remotion/
├── package.json              # Pre-installed: remotion, @remotion/cli, @remotion/bundler, @remotion/renderer,
│                             # @remotion/transitions, @remotion/sfx, @remotion/media, react, typescript
├── tsconfig.json
├── render.mjs                # Multi-app CLI renderer (outputs MP4 + JPG posters + ambient score)
├── public/
│   └── sfx/                  # Offline-cached @remotion/sfx WAV files + ambient pad tracks
│       ├── whoosh.wav
│       ├── switch.wav
│       ├── shutter-modern.wav
│       ├── ding.wav
│       ├── loading-lag.wav
│       └── ambient-pad.wav
└── src/
    ├── index.ts              # registerRoot(Root)
    ├── Root.tsx              # Registers compositions for all apps (<AppId>-en, <AppId>-ar)
    ├── shared/               # Reusable Dark Tech Keynote components (Stage, Grid, Pill, SFX helpers)
    │   ├── Stage.tsx
    │   └── sfx.ts
    └── projects/             # One folder per application
        └── webcamo/          # Example: Webcamo 5-scene keynote video
            ├── WebcamoVideo.tsx
            └── copy.ts
```

---

## 2. Core Remotion Packages & Patterns

### A. Visual Transitions (`@remotion/transitions`)

Always structure multi-scene videos with `<TransitionSeries>` so scenes overlap smoothly during transitions:

```tsx
import { TransitionSeries, linearTiming, springTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { fade } from '@remotion/transitions/fade';
import { flip } from '@remotion/transitions/flip';

// Total frames = sum(sequence durations) - sum(transition durations)
// Example: (150 + 180 + 210 + 180 + 180) - (20 + 20 + 20 + 20) = 900 - 80 = 820 frames
export const AppKeynote: React.FC<{ lang: 'en' | 'ar' }> = ({ lang }) => {
  const rtl = lang === 'ar';
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={150}>
        <Scene1Problem lang={lang} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={slide({ direction: rtl ? 'from-left' : 'from-right' })}
        timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
      />

      <TransitionSeries.Sequence durationInFrames={180}>
        <Scene2Solution lang={lang} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={wipe({ direction: 'from-bottom-left' })}
        timing={linearTiming({ durationInFrames: 20 })}
      />

      <TransitionSeries.Sequence durationInFrames={210}>
        <Scene3Features lang={lang} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={flip({ direction: 'from-right' })}
        timing={springTiming({ config: { damping: 180 }, durationInFrames: 20 })}
      />

      <TransitionSeries.Sequence durationInFrames={180}>
        <Scene4Ecosystem lang={lang} />
      </TransitionSeries.Sequence>

      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 20 })}
      />

      <TransitionSeries.Sequence durationInFrames={180}>
        <Scene5Finale lang={lang} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
```

### B. Sound Effects & Audio (`@remotion/sfx` + `@remotion/media`)

Use `<Audio>` from `@remotion/media` paired with `<Sequence>` from `remotion` and sound assets from `@remotion/sfx` (or offline cached `staticFile('sfx/...')`):

```tsx
import { Sequence, staticFile } from 'remotion';
import { Audio } from '@remotion/media';
import { whoosh, uiSwitch, shutterModern, ding, loadingLag } from '@remotion/sfx';

// Available @remotion/sfx exports:
// whoosh, whip, uiSwitch, shutterModern, shutterOld, ding, mouseClick,
// pageTurn, loadingLag, snapchatNotification, windowsXpError, vineBoom, etc.

export const SoundTrack: React.FC = () => (
  <>
    {/* Continuous ambient keynote pad */}
    <Audio src={staticFile('sfx/ambient-pad.wav')} volume={0.35} />

    {/* Scene 1 problem glitch sound */}
    <Sequence from={15} durationInFrames={60}>
      <Audio src={staticFile('sfx/loading-lag.wav')} volume={0.35} />
    </Sequence>

    {/* Transition 1 whoosh (starts when transition 1 begins at frame 130) */}
    <Sequence from={130} durationInFrames={35}>
      <Audio src={staticFile('sfx/whoosh.wav')} volume={0.6} />
    </Sequence>

    {/* UI action click / USB connect snap */}
    <Sequence from={175} durationInFrames={30}>
      <Audio src={staticFile('sfx/switch.wav')} volume={0.7} />
    </Sequence>

    {/* Camera / feature shutter lock */}
    <Sequence from={340} durationInFrames={40}>
      <Audio src={staticFile('sfx/shutter-modern.wav')} volume={0.65} />
    </Sequence>

    {/* Finale CTA chime */}
    <Sequence from={670} durationInFrames={90}>
      <Audio src={staticFile('sfx/ding.wav')} volume={0.75} />
    </Sequence>
  </>
);
```

> **Tip**: Always prefer `staticFile('sfx/...')` mapped to the local copies in `/var/www/html/old/remotion/public/sfx/` (with `@remotion/sfx` URLs as fallback) so headless rendering never stalls on network requests.

### C. Lemo-Opuscar Dark Tech Keynote Visual Rules

1. **Stage**: Radial dark gradient (`#101726` center → `#04060a` vignette) with a 60px hairline grid (`rgba(0, 229, 255, 0.04)`).
2. **Color Logic**:
   - **Problem State**: Red/Amber (`#ff4d6d`) — used only in Scene 1.
   - **Brand Accent**: Electric Cyan (`#00e5ff`) or custom brand color with soft glow.
   - **Success / Live Status**: Emerald (`#00ff9d`).
3. **Physics Motion**: Use `spring({ frame, fps, config: { damping: 14, stiffness: 120 } })` and `interpolate()` from `remotion` for all entrances, counters, and scale pops.
4. **Bilingual Support**: Pass `lang: 'en' | 'ar'` to every scene. Set `direction: lang === 'ar' ? 'rtl' : 'ltr'` on the root container.

---

## 3. Step-by-Step Workflow to Add a New App Video

1. **Create Project Folder**:
   Create `/var/www/html/old/remotion/src/projects/<app>/` with `copy.ts` (EN/AR strings) and `<App>Video.tsx`.
2. **Calculate Total Frames**:
   If you have 5 sequences of `[150, 180, 210, 180, 180]` frames (sum = 900) and 4 transitions of `20` frames each (sum = 80), set composition `durationInFrames={820}` (27.33s at 30fps).
3. **Register in `src/Root.tsx`**:
   Add `<Composition id="<app>-en" ... />` and `<Composition id="<app>-ar" ... />`.
4. **Render Video & Poster**:
   Run from `/var/www/html/old/remotion`:
   ```bash
   node render.mjs --app <app> --out /path/to/target/app/site/assets
   ```
   This renders:
   - `intro-en.mp4` & `intro-ar.mp4` (H.264, `yuv420p`, AAC audio, `+faststart`)
   - `intro-en.jpg` & `intro-ar.jpg` (High-res poster frames from the finale scene)
5. **Embed in Target Landing Page**:
   Add the `<video id="intro" controls playsinline preload="metadata" poster="./assets/intro-en.jpg">` player and switch `video.src` / `video.poster` when the user toggles English ⇄ Arabic.
