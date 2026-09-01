import type { Settings, StreamProfile } from '@mobile-webcam/shared';

export interface FfmpegTargets {
  videoDevice: string;
  /** Omit for video-only (mic disabled, or the MJPEG profile). */
  audioSink?: string;
}

export interface FfmpegBuildInput {
  profile: StreamProfile;
  baseUrl: string;
  token: string;
  settings: Settings;
  targets: FfmpegTargets;
}

/**
 * Pure argument construction. No side effects, no I/O.
 *
 * Deliberately omits -reconnect / -reconnect_streamed: reconnection belongs to
 * the pipeline module, not ffmpeg. If both react to the same EOF they race, and
 * on a restart-requiring change ffmpeg would splice a fresh init segment with
 * different codec parameters into one continuous output — exactly the corruption
 * the reconfiguration protocol exists to prevent. docs/04 §5.1.
 */
export function buildFfmpegArgs(input: FfmpegBuildInput): string[] {
  const { profile, baseUrl, token, settings, targets } = input;
  const args: string[] = ['-hide_banner', '-loglevel', 'warning', '-stats'];

  if (profile === 'mjpeg') {
    args.push('-f', 'mjpeg');
  } else {
    args.push('-fflags', '+genpts', '-use_wallclock_as_timestamps', '1');
  }

  if (token) {
    args.push('-headers', `Authorization: Bearer ${token}\r\n`);
  }

  const path = profile === 'mjpeg' ? '/stream.mjpeg' : '/stream.mp4';
  args.push('-i', `${baseUrl}${path}`);

  // --- video ---
  args.push('-map', '0:v:0');
  const filters = ['format=yuv420p'];
  if (profile === 'mjpeg') {
    // MJPEG carries no reliable dimensions; force the configured size.
    filters.unshift(`scale=${settings.resolution.width}:${settings.resolution.height}`);
  }
  // format=yuv420p is required: V4L2 consumers reject the encoder's native pixel
  // format, and the failure shows as a black frame in Zoom rather than an error.
  args.push('-vf', filters.join(','));
  args.push('-f', 'v4l2', targets.videoDevice);

  // --- audio ---
  const wantsAudio = profile === 'fmp4' && settings.audio.enabled && targets.audioSink;
  if (wantsAudio) {
    args.push('-map', '0:a:0', '-f', 'pulse', '-device', targets.audioSink!, 'mobile_webcam');
  }

  return args;
}

/** Colour bars + "Reconnecting" while the phone is away, so consumers keep the device open. */
export function buildPlaceholderArgs(opts: {
  videoDevice: string;
  width: number;
  height: number;
  fps: number;
  text?: string;
}): string[] {
  const { videoDevice, width, height, fps } = opts;
  const text = (opts.text ?? 'Reconnecting...').replace(/[:\\']/g, '');
  return [
    '-hide_banner', '-loglevel', 'error',
    '-re',
    '-f', 'lavfi',
    '-i', `smptebars=size=${width}x${height}:rate=${fps}`,
    '-vf', `drawtext=text='${text}':fontcolor=white:fontsize=${Math.round(height / 12)}:` +
           `box=1:boxcolor=black@0.6:boxborderw=12:x=(w-text_w)/2:y=(h-text_h)/2,format=yuv420p`,
    '-f', 'v4l2', videoDevice,
  ];
}
