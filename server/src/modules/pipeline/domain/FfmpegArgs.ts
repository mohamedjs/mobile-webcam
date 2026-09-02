import { V4L2_PIXEL_FORMAT, type Settings, type StreamProfile } from '@mobile-webcam/shared';

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
  /**
   * The size to scale to — the V4L2 device's ACTUAL format, which is not
   * always the requested resolution. Falls back to settings.resolution.
   */
  outputSize?: { width: number; height: number };
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
  const out = input.outputSize ?? settings.resolution;
  const args: string[] = ['-hide_banner', '-loglevel', 'warning', '-stats'];

  if (profile === 'mjpeg') {
    args.push('-f', 'mjpeg');
  } else {
    args.push(
      '-fflags', '+genpts+nobuffer+discardcorrupt',
      '-avioflags', 'direct',
      '-use_wallclock_as_timestamps', '1',
    );
    // A cable carries no jitter worth buffering for. Without these ffmpeg
    // spends seconds probing and then holds a queue that shows up as lag.
    args.push(
      '-flags', 'low_delay',
      '-probesize', '32768',
      '-analyzeduration', '0',
      '-thread_queue_size', '0',
    );
  }

  if (token) {
    args.push('-headers', `Authorization: Bearer ${token}\r\n`);
  }

  const path = profile === 'mjpeg' ? '/stream.mjpeg' : '/stream.mp4';
  args.push('-i', `${baseUrl}${path}`);

  // Slice threading: decode slices of ONE frame in parallel across cores.
  // Unlike the default "frame" threading (which holds N frames to reorder),
  // slice threading adds zero latency — and easily handles 1080p30.
  args.push('-threads', '4', '-thread_type', 'slice');

  // --- video ---
  args.push('-map', '0:v:0');
  // ALWAYS scale to the configured size, for every profile.
  //
  // The V4L2 device's caps are pinned to settings.resolution. If ffmpeg emits a
  // different size, each row lands at the wrong offset and the picture shears
  // diagonally into green and magenta — it does NOT error. Scaling here makes
  // the writer match the pinned device by construction, whatever the phone
  // actually sends (a rotated frame, a mode the hardware silently substituted,
  // or a stale stream from before a resolution change).
  const filters = [
    `scale=${settings.resolution.width}:${settings.resolution.height}:flags=fast_bilinear`,
    `format=${V4L2_PIXEL_FORMAT.ffmpeg}`,
    // fMP4 fragments arrive in bursts. Without pacing, ffmpeg dumps the whole
    // burst to v4l2 at once and the consumer drops stale frames. The fps filter
    // smooths bursts into an evenly-spaced stream by dropping extras and
    // duplicating the last frame when a burst is late. setpts then assigns
    // clean, monotonic timestamps so the consumer never sees drift.
    `fps=fps=${settings.fps}`,
    `setpts=N/${settings.fps}/TB`,
  ];
  // The format filter is required: V4L2 consumers reject the encoder's native
  // pixel format, and the failure shows as a black frame rather than an error.
  // It must agree with the pinned device caps or the image shears.
  args.push('-vf', filters.join(','));
  args.push('-flush_packets', '1', '-vsync', 'cfr', '-f', 'v4l2', targets.videoDevice);

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
           `box=1:boxcolor=black@0.6:boxborderw=12:x=(w-text_w)/2:y=(h-text_h)/2,format=${V4L2_PIXEL_FORMAT.ffmpeg}`,
    '-f', 'v4l2', videoDevice,
  ];
}
