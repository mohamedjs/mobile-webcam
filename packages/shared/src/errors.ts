export const ERROR_CODES = [
  'invalid_setting',
  'unsupported_capability',
  'already_streaming',
  'not_streaming',
  'unauthorized',
  'protocol_mismatch',
  'device_not_found',
  'tunnel_failed',
  'capture_failed',
  'encoder_failed',
  'server_bind_failed',
  'video_device_unavailable',
  'audio_sink_unavailable',
  'ffmpeg_failed',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface WireError {
  error: ErrorCode;
  message: string;
  /** Present for `invalid_setting`: which field was rejected. */
  field?: string;
}
