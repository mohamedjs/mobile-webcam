import { z } from 'zod';
import { ResolutionSchema, StabilizationSchema, type Capabilities, sameResolution } from './capabilities.js';

export const ExposureSchema = z.object({
  mode: z.enum(['auto', 'manual']),
  bias: z.number().min(-2).max(2),
  locked: z.boolean(),
});

export const FocusSchema = z.object({
  mode: z.enum(['auto', 'manual']),
  locked: z.boolean(),
});

export const WhiteBalanceSchema = z.object({
  mode: z.enum(['auto', 'manual']),
  locked: z.boolean(),
});

export const AudioSettingsSchema = z.object({
  enabled: z.boolean(),
  sampleRate: z.number().int().positive(),
  channels: z.number().int().min(1).max(2),
  bitrate: z.number().int().min(32_000).max(320_000),
});

export const SettingsSchema = z.object({
  lens: z.string().min(1),
  resolution: ResolutionSchema,
  fps: z.number().int().min(1).max(120),
  bitrate: z.number().int().min(1_000_000).max(40_000_000),
  cinematic: z.object({
    enabled: z.boolean(),
    aperture: z.number().min(1).max(22),
  }),
  blurFallback: z.object({
    enabled: z.boolean(),
    intensity: z.number().min(0).max(1),
  }),
  zoom: z.number().positive(),
  torch: z.boolean(),
  mirror: z.boolean(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  stabilization: StabilizationSchema,
  hdr: z.boolean(),
  lockLens: z.boolean(),
  exposure: ExposureSchema,
  focus: FocusSchema,
  whiteBalance: WhiteBalanceSchema,
  audio: AudioSettingsSchema,
});

export const SettingsPatchSchema = SettingsSchema.deepPartial();

export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

/** Factory defaults. Rear wide lens, 1080p30 — see docs/05 §F4. */
export const DEFAULT_SETTINGS: Settings = {
  lens: 'back-wide',
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  bitrate: 8_000_000,
  cinematic: { enabled: false, aperture: 2.8 },
  blurFallback: { enabled: false, intensity: 0.6 },
  zoom: 1.0,
  torch: false,
  mirror: false,
  rotation: 0,
  stabilization: 'standard',
  hdr: true,
  lockLens: false,
  exposure: { mode: 'auto', bias: 0, locked: false },
  focus: { mode: 'auto', locked: false },
  whiteBalance: { mode: 'auto', locked: false },
  audio: { enabled: true, sampleRate: 48_000, channels: 1, bitrate: 128_000 },
};

/** Default bitrate for a resolution, used when the user has not overridden it. */
export function defaultBitrateFor(width: number, height: number): number {
  const pixels = width * height;
  if (pixels >= 3840 * 2160) return 20_000_000;
  if (pixels >= 1920 * 1080) return 8_000_000;
  return 4_000_000;
}

/**
 * Settings whose change requires tearing down and rebuilding AVCaptureSession,
 * which breaks the current fMP4 stream. See docs/01 §5.5.
 */
const RESTART_KEYS = ['lens', 'resolution', 'fps'] as const;

export function requiresRestart(patch: SettingsPatch): boolean {
  if (patch.cinematic?.enabled !== undefined) return true;
  if (patch.rotation !== undefined) return true;
  return RESTART_KEYS.some((k) => patch[k] !== undefined);
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/**
 * Validate a patch against what the device actually reports it can do.
 *
 * Zod covers shape and range; this covers device reality — a 1080p schema-valid
 * request is still invalid on a phone that does not offer 1080p.
 */
export function validateAgainstCapabilities(
  patch: SettingsPatch,
  current: Settings,
  caps: Capabilities,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (patch.lens !== undefined) {
    const lens = caps.lenses.find((l) => l.id === patch.lens);
    if (!lens) {
      issues.push({ field: 'lens', message: `Unknown lens "${patch.lens}"` });
    } else if (patch.zoom !== undefined && (patch.zoom < lens.minZoom || patch.zoom > lens.maxZoom)) {
      issues.push({
        field: 'zoom',
        message: `Zoom ${patch.zoom} outside ${lens.minZoom}-${lens.maxZoom} for "${lens.id}"`,
      });
    }
  } else if (patch.zoom !== undefined) {
    const lens = caps.lenses.find((l) => l.id === current.lens);
    if (lens && (patch.zoom < lens.minZoom || patch.zoom > lens.maxZoom)) {
      issues.push({
        field: 'zoom',
        message: `Zoom ${patch.zoom} outside ${lens.minZoom}-${lens.maxZoom} for "${lens.id}"`,
      });
    }
  }

  const wantsCinematic = patch.cinematic?.enabled ?? current.cinematic.enabled;
  const resolution = patch.resolution
    ? { width: patch.resolution.width ?? current.resolution.width, height: patch.resolution.height ?? current.resolution.height }
    : current.resolution;

  if (patch.resolution !== undefined) {
    const mode = caps.resolutions.find((r) => sameResolution(r, resolution));
    if (!mode) {
      issues.push({
        field: 'resolution',
        message: `Device does not offer ${resolution.width}x${resolution.height}`,
      });
    }
  }

  const fps = patch.fps ?? current.fps;
  const mode = caps.resolutions.find((r) => sameResolution(r, resolution));
  if (mode && fps > mode.maxFps) {
    issues.push({
      field: 'fps',
      message: `${fps}fps exceeds ${mode.maxFps}fps max at ${resolution.width}x${resolution.height}`,
    });
  }

  if (patch.cinematic?.enabled === true && !caps.cinematic.supported) {
    issues.push({ field: 'cinematic.enabled', message: 'Device does not support Cinematic capture' });
  }

  if (wantsCinematic && caps.cinematic.supported) {
    if (!caps.cinematic.resolutions.some((r) => sameResolution(r, resolution))) {
      issues.push({
        field: 'resolution',
        message: `Cinematic mode does not support ${resolution.width}x${resolution.height}`,
      });
    }
    if (fps > caps.cinematic.maxFps) {
      issues.push({ field: 'fps', message: `Cinematic mode caps at ${caps.cinematic.maxFps}fps` });
    }
    const aperture = patch.cinematic?.aperture ?? current.cinematic.aperture;
    if (aperture < caps.cinematic.minAperture || aperture > caps.cinematic.maxAperture) {
      issues.push({
        field: 'cinematic.aperture',
        message: `Aperture outside f/${caps.cinematic.minAperture}-f/${caps.cinematic.maxAperture}`,
      });
    }
  }

  if (patch.stabilization !== undefined && !caps.stabilization.includes(patch.stabilization)) {
    issues.push({ field: 'stabilization', message: `Device does not support "${patch.stabilization}"` });
  }

  if (patch.hdr === true && !caps.hdr) {
    issues.push({ field: 'hdr', message: 'Device does not support HDR' });
  }

  if (patch.audio?.sampleRate !== undefined && !caps.audio.sampleRates.includes(patch.audio.sampleRate)) {
    issues.push({ field: 'audio.sampleRate', message: `Unsupported sample rate ${patch.audio.sampleRate}` });
  }

  if (patch.audio?.channels !== undefined && patch.audio.channels > caps.audio.maxChannels) {
    issues.push({ field: 'audio.channels', message: `Device supports at most ${caps.audio.maxChannels} channels` });
  }

  return issues;
}
