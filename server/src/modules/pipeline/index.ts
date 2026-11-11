import {
  requiresRestart,
  type PipelineState,
  type Settings,
  type SettingsPatch,
  type StreamProfile,
} from '@mobile-webcam/shared';
import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import { AppError } from '../../kernel/errors/AppError.js';
import type { AppConfig } from '../config/index.js';
import type { DeviceControlModule } from '../device-control/index.js';
import type { TunnelModule } from '../tunnel/index.js';
import type { VideoDeviceModule } from '../video-device/index.js';
import type { AudioDeviceModule } from '../audio-device/index.js';
import { buildFfmpegArgs } from './domain/FfmpegArgs.js';
import { FfmpegProcess } from './infrastructure/FfmpegProcess.js';
import { PlaceholderFeed } from './infrastructure/PlaceholderFeed.js';
import { StreamProxy } from './infrastructure/StreamProxy.js';

export { buildFfmpegArgs, buildPlaceholderArgs } from './domain/FfmpegArgs.js';

/** Consecutive ffmpeg failures before the pipeline stops retrying. */
const MAX_FFMPEG_RETRIES = 5;
/** How long a phone gets to bring its camera back after a restart. */
const CAPTURE_WAIT_MS = 8000;
/** Minimum gap between two automatic quality reductions. */
const DEGRADE_COOLDOWN_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Owns the state machine and the ffmpeg process. Nothing else may spawn ffmpeg —
 * two producers writing the same V4L2 device tears the output. docs/04 §3.
 */
export class PipelineModule {
  readonly #log: Logger;
  readonly #bus: EventBus;
  readonly #config: AppConfig;
  readonly #tunnel: TunnelModule;
  readonly #control: DeviceControlModule;
  readonly #video: VideoDeviceModule;
  readonly #audio: AudioDeviceModule;
  readonly #ffmpeg: FfmpegProcess;
  readonly #placeholder: PlaceholderFeed;
  readonly #streamProxy: StreamProxy;
  readonly #outputPlatform: 'linux' | 'darwin' | 'win32' | undefined;

  #state: PipelineState = 'NO_DEVICE';
  #degraded = false;
  #restarting = false;
  #ffmpegRetries = 0;
  #resumeTimer: NodeJS.Timeout | null = null;
  #atQualityFloor = false;
  /** Bumped for every ffmpeg run; exits from older runs are ignored. */
  #generation = 0;
  #platform: 'ios' | 'android' = 'ios';
  #udid: string | undefined;
  /** Quality before the first automatic reduction, restored when it cools down. */
  #preDegrade: Pick<Settings, 'resolution' | 'fps' | 'bitrate'> | null = null;
  #lastDegradeAt = 0;

  constructor(deps: {
    log: Logger;
    bus: EventBus;
    config: AppConfig;
    tunnel: TunnelModule;
    control: DeviceControlModule;
    video: VideoDeviceModule;
    audio: AudioDeviceModule;
    /** Override the output platform (tests write to a null sink). */
    outputPlatform?: 'linux' | 'darwin' | 'win32';
  }) {
    this.#log = deps.log.child({ module: 'pipeline' });
    this.#bus = deps.bus;
    this.#config = deps.config;
    this.#tunnel = deps.tunnel;
    this.#control = deps.control;
    this.#video = deps.video;
    this.#audio = deps.audio;
    this.#outputPlatform = deps.outputPlatform;
    this.#ffmpeg = new FfmpegProcess({ log: this.#log });
    this.#placeholder = new PlaceholderFeed({ log: this.#log });
    this.#streamProxy = new StreamProxy({ log: this.#log });

    this.#bus.on('device.connected', (e) => {
      this.#platform = e.platform ?? 'ios';
      this.#udid = e.udid;
      void this.#onDeviceConnected();
    });
    this.#bus.on('device.disconnected', () => void this.#onDeviceDisconnected());
  }

  get state(): PipelineState { return this.#state; }
  get degraded(): boolean { return this.#degraded; }
  get ffmpegStats() { return this.#ffmpeg.stats; }
  get platform(): 'ios' | 'android' { return this.#platform; }

  get profile(): StreamProfile {
    return this.#config.forceMjpeg ? 'mjpeg' : 'fmp4';
  }

  /** Last size the phone reported, so a placeholder started before the phone
   *  is ready does not fall back to 720p and lock the device there. */
  #lastKnownResolution: { width: number; height: number } | null = null;

  #transition(to: PipelineState): void {
    if (this.#state === to) return;
    const from = this.#state;
    this.#state = to;
    this.#log.info({ from, to }, 'state');
    this.#bus.emit({ type: 'pipeline.state.changed', from, to });
  }

  // ---------------------------------------------------------------- lifecycle

  async #onDeviceConnected(): Promise<void> {
    try {
      this.#transition('TUNNELING');
      await this.#tunnel.open({ platform: this.#platform, udid: this.#udid ?? '' });
      await this.#control.waitForReady();
      this.#transition('READY');
      if (this.#config.autoStart) await this.start();
    } catch (e) {
      this.#log.error({ err: e }, 'failed to reach READY');
      this.#bus.emit({
        type: 'pipeline.error',
        code: AppError.is(e) ? e.code : 'internal',
        message: e instanceof Error ? e.message : String(e),
        fatal: false,
      });
      await this.#fallBackToNoDevice();
    }
  }

  async #onDeviceDisconnected(): Promise<void> {
    this.#clearResumeWatch();
    await this.#stopFfmpeg();
    await this.#tunnel.close('device disconnected');
    this.#control.invalidate();
    await this.#fallBackToNoDevice();
  }

  async #fallBackToNoDevice(): Promise<void> {
    this.#transition('NO_DEVICE');
    if (!this.#config.directMode) await this.#startPlaceholder();
  }

  async #startPlaceholder(): Promise<void> {
    if (!(await this.#video.exists())) return;
    // The placeholder is the FIRST producer to open the node, and with
    // exclusive_caps=1 whatever it negotiates locks the device for the session.
    // Pin the size we actually intend to stream before it opens, otherwise a
    // 720p placeholder silently caps a 1080p stream. docs/06 §2.3.
    const s = this.#control.settings;
    const wanted = s?.resolution ?? this.#lastKnownResolution ?? { width: 1280, height: 720 };
    await this.#video.forceFormat(wanted.width, wanted.height, s?.fps ?? 30);
    const actual = await this.#video.actualFormat();
    const size = actual ?? wanted;
    this.#placeholder.start({
      videoDevice: this.#video.path,
      width: size.width,
      height: size.height,
      fps: 15,
    });
  }

  // ------------------------------------------------------------------ control

  async start(): Promise<void> {
    if (this.#state === 'STREAMING') return;
    const settings = this.#control.settings;
    if (!settings) throw new AppError({ code: 'device_not_found', message: 'Phone is not ready' });

    if (this.#config.directMode) {
      this.#log.info('direct mode: OBS reads the phone; no local pipeline');
      this.#transition('STREAMING');
      return;
    }

    await this.#placeholder.stop();
    await this.#video.ensure();
    this.#lastKnownResolution = settings.resolution;

    // Must happen BEFORE ffmpeg opens the device. docs/06 §2.3.
    // forceFormat retries: the placeholder we just killed can still hold the
    // node briefly, and set-caps against a held node silently does nothing.
    const pinned = await this.#video.forceFormat(
      settings.resolution.width,
      settings.resolution.height,
      settings.fps,
    );

    // Audio only when the phone can actually send it (Android cannot yet).
    const audioSupported = this.#control.capabilities?.audio.supported !== false;
    const withAudio = settings.audio.enabled && audioSupported && this.profile === 'fmp4';
    if (withAudio) await this.#audio.ensure();

    // Scale to what the device REALLY is, not what we asked for. A mismatch
    // does not error — it shears the picture. docs/08 §7.2c.
    const outputSize = pinned ?? settings.resolution;
    if (outputSize.width !== settings.resolution.width) {
      this.#log.warn(
        { requested: settings.resolution, actual: outputSize },
        'device format differs from the requested resolution; scaling to the device',
      );
    }

    const generation = ++this.#generation;
    let baseUrl = this.#tunnel.baseUrl;
    if (this.profile === 'fmp4') {
      const proxyPort = await this.#streamProxy.start({
        phonePort: this.#config.localPort,
        token: this.#config.token,
      });
      baseUrl = `http://127.0.0.1:${proxyPort}`;
    }

    const args = buildFfmpegArgs({
      profile: this.profile,
      baseUrl,
      token: this.profile === 'fmp4' ? '' : this.#config.token,
      settings,
      outputSize,
      // iOS mirrors in AVCaptureConnection; Android's encoder surface cannot,
      // so the desktop flips the picture for it.
      mirror: this.#platform === 'android' && settings.mirror,
      targets: {
        videoDevice: this.#video.path,
        ...(this.#outputPlatform ? { platform: this.#outputPlatform } : {}),
        ...(withAudio ? { audioSink: this.#audio.sinkName } : {}),
      },
    });

    this.#log.info({ profile: this.profile, generation, size: outputSize, fps: settings.fps }, 'starting ffmpeg');
    this.#ffmpeg.start(args, (reason) => void this.#onFfmpegExit(generation, reason));
    this.#transition('STREAMING');
    // Clear the failure streak once a run has stayed up for a while.
    setTimeout(() => {
      if (this.#state === 'STREAMING' && this.#generation === generation) this.#ffmpegRetries = 0;
    }, 10_000);
  }

  async stop(): Promise<void> {
    this.#clearResumeWatch();
    await this.#stopFfmpeg();
    if (this.#state === 'STREAMING') {
      this.#transition(this.#control.settings ? 'READY' : 'NO_DEVICE');
    }
  }

  /** Stop the current run so that its exit is never mistaken for a failure. */
  async #stopFfmpeg(): Promise<void> {
    this.#generation += 1;
    await this.#ffmpeg.stop();
    await this.#streamProxy.stop();
  }

  /** Poll /health until the phone reports a running camera. */
  async #waitForCapture(timeoutMs = CAPTURE_WAIT_MS): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      try {
        const health = await this.#control.client.health();
        if (health.streaming) return true;
      } catch {
        // The phone may drop requests while it rebuilds the capture session.
      }
      await sleep(300);
    }
    return false;
  }

  /**
   * ffmpeg exited on its own. WE decide whether to respawn — ffmpeg's own
   * -reconnect is deliberately not used. docs/04 §5.1.
   *
   * The common cause is the phone restarting its camera (a settings change
   * made on the phone, an interruption, a thermal stop): it closes the stream
   * so the client can fetch a fresh init segment. So wait for the camera, pick
   * up the phone's current settings, and reconnect.
   */
  async #onFfmpegExit(generation: number, reason: string): Promise<void> {
    // An exit from a run we already replaced must not touch the new one.
    if (generation !== this.#generation || this.#restarting) return;
    await this.#streamProxy.stop();
    this.#log.warn({ reason }, 'ffmpeg exited');
    if (this.#state !== 'STREAMING') return;
    this.#transition('READY');

    const capturing = await this.#waitForCapture();
    if (generation !== this.#generation || this.#restarting) return;

    if (!capturing) {
      let reachable = true;
      try { await this.#control.client.health(); } catch { reachable = false; }
      this.#log.error(
        reachable
          ? 'phone is reachable but its camera is not running'
          : 'phone unreachable after ffmpeg exit',
      );
      this.#bus.emit({
        type: 'pipeline.error',
        code: reachable ? 'capture_failed' : 'device_not_found',
        message: reachable
          ? 'The phone is connected but its camera is not running. Open Webcamo on the phone; '
            + 'streaming resumes by itself once the camera is back.'
          : 'Lost the phone. Check the USB cable and that Webcamo is open.',
        fatal: false,
      });
      this.#ffmpegRetries = 0;
      await this.#startPlaceholder();
      this.#watchForCaptureResume();
      return;
    }

    // Bounded retries with backoff. An unbounded 500 ms loop spins forever.
    this.#ffmpegRetries += 1;
    if (this.#ffmpegRetries > MAX_FFMPEG_RETRIES) {
      this.#log.error({ retries: this.#ffmpegRetries }, 'giving up restarting ffmpeg');
      this.#bus.emit({
        type: 'pipeline.error',
        code: 'ffmpeg_failed',
        message: `ffmpeg failed ${this.#ffmpegRetries} times in a row: ${reason}`,
        fatal: false,
      });
      this.#ffmpegRetries = 0;
      await this.#startPlaceholder();
      return;
    }

    const delayMs = Math.min(250 * 2 ** (this.#ffmpegRetries - 1), 4000);
    this.#log.info({ attempt: this.#ffmpegRetries, delayMs }, 'reconnecting to the phone');
    await sleep(delayMs);
    if (generation !== this.#generation || this.#restarting) return;
    try {
      // The phone may have changed resolution itself; never stream stale caps.
      await this.#control.refresh();
      await this.start();
    } catch (e) {
      this.#log.error({ err: e }, 'reconnect failed');
      await this.#startPlaceholder();
      this.#watchForCaptureResume();
    }
  }

  /**
   * Apply a settings patch, restarting the stream only when the codec parameters
   * actually change. The V4L2 device is never torn down, so consumers keep it
   * open across the change. docs/01 §5.5.
   *
   * Order matters: ffmpeg is stopped BEFORE the phone restarts its camera, so the
   * phone closing the old stream is not mistaken for a failure; then we wait
   * until the phone reports the new capture running instead of guessing a delay.
   */
  applySettings(patch: SettingsPatch, source: 'user' | 'auto' = 'user'): Promise<void> {
    // One change at a time: two quick clicks in the dashboard must not run two
    // camera restarts on top of each other.
    const run = this.#settingsChain.then(() => this.#applySettings(patch, source));
    this.#settingsChain = run.catch(() => undefined);
    return run;
  }

  #settingsChain: Promise<void> = Promise.resolve();

  async #applySettings(patch: SettingsPatch, source: 'user' | 'auto'): Promise<void> {
    if (source === 'user') {
      // The user chose a quality by hand; do not "restore" over it later.
      this.#preDegrade = null;
      this.clearDegraded();
    }

    const restart = requiresRestart(patch)
      && this.#state === 'STREAMING'
      && !this.#config.directMode;
    if (!restart) {
      await this.#control.applySettings(patch);
      return;
    }

    this.#restarting = true;
    this.#clearResumeWatch();
    this.#transition('RECONFIGURING');
    try {
      await this.#stopFfmpeg();
      let settings: Settings;
      try {
        ({ settings } = await this.#control.applySettings(patch));
      } catch (e) {
        // Rejected (e.g. invalid value): the phone kept its old capture, so
        // bring the old stream back before reporting the error.
        this.#restarting = false;
        this.#transition('READY');
        await this.start().catch(() => this.#startPlaceholder());
        throw e;
      }
      if (!(await this.#waitForCapture())) {
        throw new AppError({
          code: 'capture_failed',
          message: 'The phone did not restart its camera with the new settings.',
        });
      }
      await this.#video.pinCaps(settings.resolution.width, settings.resolution.height, settings.fps);
      this.#restarting = false;
      this.#transition('READY');
      await this.start();
    } catch (e) {
      if (this.#restarting) {
        this.#restarting = false;
        this.#log.error({ err: e }, 'reconfiguration failed');
        this.#transition('READY');
        await this.#startPlaceholder();
        this.#watchForCaptureResume();
      }
      throw e;
    } finally {
      this.#restarting = false;
    }
  }

  /**
   * Poll until the phone starts capturing again, then resume by itself.
   *
   * Without this the desktop sits in READY showing the placeholder even after
   * the user taps Start server on the phone.
   */
  #watchForCaptureResume(): void {
    if (this.#resumeTimer) return;
    this.#resumeTimer = setInterval(() => {
      void (async () => {
        if (this.#state !== 'READY') { this.#clearResumeWatch(); return; }
        try {
          const health = await this.#control.client.health();
          if (!health.streaming) return;
          this.#log.info('phone is capturing again; resuming');
          this.#clearResumeWatch();
          await this.#control.refresh();
          await this.start();
        } catch {
          // Phone unreachable; device.disconnected will handle it.
        }
      })();
    }, 3000);
  }

  #clearResumeWatch(): void {
    if (this.#resumeTimer) {
      clearInterval(this.#resumeTimer);
      this.#resumeTimer = null;
    }
  }

  /** Step quality down under thermal pressure or sustained drops. docs/05 §F11. */
  async degrade(reason: 'thermal' | 'drops'): Promise<void> {
    const s = this.#control.settings;
    if (!s) return;
    if (Date.now() - this.#lastDegradeAt < DEGRADE_COOLDOWN_MS) return;

    const next =
      s.resolution.height > 1080
        ? { resolution: { width: 1920, height: 1080 } }
        : s.bitrate > 4_000_000
          ? { bitrate: Math.round(s.bitrate * 0.6) }
          : s.fps > 24
            ? { fps: 24 }
            : s.resolution.height > 720
              ? { resolution: { width: 1280, height: 720 } }
              : null;

    if (!next) {
      // Latch. Without this, telemetry re-triggers every few seconds forever and
      // floods the log with a warning nothing can act on.
      if (!this.#atQualityFloor) {
        this.#atQualityFloor = true;
        this.#log.warn(
          { reason, settings: { fps: s.fps, bitrate: s.bitrate, resolution: s.resolution } },
          'already at the lowest quality step; no further reduction possible',
        );
        this.#bus.emit({
          type: 'telemetry.degraded',
          reason,
          action: 'at minimum quality — the phone is still overheating',
        });
      }
      return;
    }

    this.#preDegrade ??= { resolution: s.resolution, fps: s.fps, bitrate: s.bitrate };
    this.#degraded = true;
    this.#lastDegradeAt = Date.now();
    const action = `reduced ${Object.keys(next)[0]}`;
    this.#log.warn({ reason, next }, 'degrading quality');
    this.#bus.emit({ type: 'telemetry.degraded', reason, action });
    await this.applySettings(next, 'auto');
  }

  /** The phone has cooled down: put back the quality the user picked. */
  async restoreQuality(): Promise<void> {
    const before = this.#preDegrade;
    if (!before) { this.clearDegraded(); return; }
    this.#log.info({ restore: before }, 'phone cooled down; restoring quality');
    this.#preDegrade = null;
    this.clearDegraded();
    await this.applySettings(
      { resolution: before.resolution, fps: before.fps, bitrate: before.bitrate },
      'auto',
    );
  }

  clearDegraded(): void {
    this.#degraded = false;
    this.#atQualityFloor = false;
  }

  async shutdown(): Promise<void> {
    this.#clearResumeWatch();
    await this.#stopFfmpeg();
    await this.#placeholder.stop();
  }
}
