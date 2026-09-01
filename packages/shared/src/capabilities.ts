import { z } from 'zod';

/**
 * Lens ids are discovered at runtime from AVCaptureDevice.DiscoverySession.
 * They are NOT an enum: an iPhone SE has one rear lens, a 15 Pro has three.
 */
export const LensSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  position: z.enum(['back', 'front']),
  minZoom: z.number().positive(),
  maxZoom: z.number().positive(),
});

export const ResolutionSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const ResolutionModeSchema = ResolutionSchema.extend({
  maxFps: z.number().int().positive(),
});

export const StabilizationSchema = z.enum(['off', 'standard', 'cinematic']);

export const CinematicSupportSchema = z.object({
  supported: z.boolean(),
  /** Which tier the device can actually run. See docs/05 §F5. */
  tier: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  resolutions: z.array(ResolutionSchema),
  maxFps: z.number().int().positive(),
  minAperture: z.number().positive(),
  maxAperture: z.number().positive(),
});

export const CapabilitiesSchema = z.object({
  lenses: z.array(LensSchema).min(1),
  resolutions: z.array(ResolutionModeSchema).min(1),
  cinematic: CinematicSupportSchema,
  stabilization: z.array(StabilizationSchema),
  hdr: z.boolean(),
  audio: z.object({
    sampleRates: z.array(z.number().int().positive()),
    maxChannels: z.number().int().positive(),
  }),
});

export type Lens = z.infer<typeof LensSchema>;
export type Resolution = z.infer<typeof ResolutionSchema>;
export type ResolutionMode = z.infer<typeof ResolutionModeSchema>;
export type Stabilization = z.infer<typeof StabilizationSchema>;
export type CinematicSupport = z.infer<typeof CinematicSupportSchema>;
export type Capabilities = z.infer<typeof CapabilitiesSchema>;

/** Resolution equality, used when validating a requested mode against capabilities. */
export function sameResolution(a: Resolution, b: Resolution): boolean {
  return a.width === b.width && a.height === b.height;
}
