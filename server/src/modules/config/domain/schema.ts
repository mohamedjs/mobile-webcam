import { z } from 'zod';
import {
  AUDIO_SINK_NAME,
  DEFAULT_CONTROL_PORT,
  DEFAULT_DEVICE_PORT,
  VIDEO_DEVICE_LABEL,
  VIDEO_DEVICE_NR,
} from '@mobile-webcam/shared';

export const AppConfigSchema = z.object({
  devicePort: z.number().int().min(1).max(65535).default(DEFAULT_DEVICE_PORT),
  localPort: z.number().int().min(1).max(65535).default(DEFAULT_DEVICE_PORT),
  controlPort: z.number().int().min(1).max(65535).default(DEFAULT_CONTROL_PORT),
  video: z.object({
    deviceNr: z.number().int().min(0).default(VIDEO_DEVICE_NR),
    label: z.string().default(VIDEO_DEVICE_LABEL),
  }).default({}),
  audio: z.object({
    sinkName: z.string().default(AUDIO_SINK_NAME),
    description: z.string().default('Mobile_Webcam_Mic'),
  }).default({}),
  /** Bearer token shown by the phone app. Empty until paired. */
  token: z.string().default(''),
  /** Begin streaming as soon as the phone reports ready. */
  autoStart: z.boolean().default(true),
  /** Force the MJPEG diagnostic profile instead of fMP4. */
  forceMjpeg: z.boolean().default(false),
  /** Skip v4l2/audio entirely; OBS reads the phone directly. docs/05 §F9. */
  directMode: z.boolean().default(false),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  devicePollMs: z.number().int().min(500).default(2000),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export const DEFAULT_CONFIG: AppConfig = AppConfigSchema.parse({});

export function videoDevicePath(cfg: AppConfig): string {
  return `/dev/video${cfg.video.deviceNr}`;
}
