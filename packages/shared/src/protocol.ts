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
