/**
 * Wire protocol version.
 *
 * Bump on ANY breaking change to the shapes in this package. The desktop refuses
 * to stream when the phone reports a different value — see docs/01 §5.2.
 */
export const PROTOCOL_VERSION = 1;

/** Device port the phone's HTTP server listens on. */
export const DEFAULT_DEVICE_PORT = 8080;

/** Loopback port the desktop control API binds. */
export const DEFAULT_CONTROL_PORT = 47800;

/** Virtual device identities. Changing these makes consumer apps forget the selection. */
export const VIDEO_DEVICE_LABEL = 'Mobile Webcam';
export const VIDEO_DEVICE_NR = 9;
export const AUDIO_SINK_NAME = 'mobile_webcam_mic';

/**
 * The pixel format written to the V4L2 device.
 *
 * These two names describe the SAME memory layout and must never drift: the
 * device caps are pinned with the FourCC while ffmpeg is told the ffmpeg name.
 * Pinning YUYV (packed 4:2:2, 2 bytes/px) while writing yuv420p (planar 4:2:0,
 * 1.5 bytes/px) makes consumers read planar data as packed — the picture shears
 * diagonally into green and magenta. Change both or neither.
 */
export const V4L2_PIXEL_FORMAT = {
  /** ffmpeg `format=` filter name. */
  ffmpeg: 'yuv420p',
  /** v4l2 FourCC for the identical layout, for `v4l2loopback-ctl set-caps`. */
  fourcc: 'YU12',
} as const;
