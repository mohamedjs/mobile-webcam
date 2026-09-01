import { z } from 'zod';
import { ThermalStateSchema } from './health.js';

export const MetricsSampleSchema = z.object({
  at: z.number().int(),
  fps: z.number().min(0),
  bitrate: z.number().min(0),
  droppedFrames: z.number().int().min(0),
  droppedSegments: z.number().int().min(0),
  latencyMs: z.number().min(0).nullable(),
  thermalState: ThermalStateSchema,
  battery: z.number().min(0).max(1).nullable(),
});

export const TelemetrySchema = z.object({
  fps: z.number().min(0),
  bitrate: z.number().min(0),
  droppedFrames: z.number().int().min(0),
  droppedSegments: z.number().int().min(0),
  thermalState: ThermalStateSchema,
  battery: z.number().min(0).max(1).nullable(),
  clients: z.number().int().min(0),
});

export type MetricsSample = z.infer<typeof MetricsSampleSchema>;
export type Telemetry = z.infer<typeof TelemetrySchema>;

export const PIPELINE_STATES = [
  'NO_DEVICE',
  'TUNNELING',
  'READY',
  'STREAMING',
  'RECONFIGURING',
] as const;

export type PipelineState = (typeof PIPELINE_STATES)[number];

/** Stream container the desktop asks the phone for. See docs/01 §3. */
export const STREAM_PROFILES = ['fmp4', 'mjpeg'] as const;
export type StreamProfile = (typeof STREAM_PROFILES)[number];
