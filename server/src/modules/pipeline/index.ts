import type { PipelineState, SettingsPatch, StreamProfile } from '@mobile-webcam/shared';
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

export { buildFfmpegArgs, buildPlaceholderArgs } from './domain/FfmpegArgs.js';

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

  #state: PipelineState = 'NO_DEVICE';
  #degraded = false;
  #restarting = false;

  constructor(deps: {
    log: Logger;
    bus: EventBus;
    config: AppConfig;
    tunnel: TunnelModule;
    control: DeviceControlModule;
    video: VideoDeviceModule;
    audio: AudioDeviceModule;
  }) {
    this.#log = deps.log.child({ module: 'pipeline' });
    this.#bus = deps.bus;
    this.#config = deps.config;
    this.#tunnel = deps.tunnel;
    this.#control = deps.control;
    this.#video = deps.video;
    this.#audio = deps.audio;
    this.#ffmpeg = new FfmpegProcess({ log: this.#log });
    this.#placeholder = new PlaceholderFeed({ log: this.#log });

    this.#bus.on('device.connected', () => void this.#onDeviceConnected());
    this.#bus.on('device.disconnected', () => void this.#onDeviceDisconnected());
  }

  get state(): PipelineState { return this.#state; }
  get degraded(): boolean { return this.#degraded; }
  get ffmpegStats() { return this.#ffmpeg.stats; }

  get profile(): StreamProfile {
    return this.#config.forceMjpeg ? 'mjpeg' : 'fmp4';
  }

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
      await this.#tunnel.open();
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
    await this.#ffmpeg.stop();
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
    const s = this.#control.settings;
    this.#placeholder.start({
      videoDevice: this.#video.path,
      width: s?.resolution.width ?? 1280,
      height: s?.resolution.height ?? 720,
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
    // Must happen BEFORE ffmpeg opens the device. docs/06 §2.3.
    await this.#video.pinCaps(settings.resolution.width, settings.resolution.height, settings.fps);
    if (settings.audio.enabled) await this.#audio.ensure();

    const args = buildFfmpegArgs({
      profile: this.profile,
      baseUrl: this.#tunnel.baseUrl,
      token: this.#config.token,
      settings,
      targets: {
        videoDevice: this.#video.path,
        ...(settings.audio.enabled ? { audioSink: this.#audio.sinkName } : {}),
      },
    });

    this.#log.info({ profile: this.profile }, 'starting ffmpeg');
    this.#ffmpeg.start(args, (reason) => void this.#onFfmpegExit(reason));
    this.#transition('STREAMING');
  }

  async stop(): Promise<void> {
    await this.#ffmpeg.stop();
    if (this.#state === 'STREAMING') {
      this.#transition(this.#control.settings ? 'READY' : 'NO_DEVICE');
    }
  }

  /**
   * ffmpeg exited on its own. WE decide whether to respawn — ffmpeg's own
   * -reconnect is deliberately not used. docs/04 §5.1.
   */
  async #onFfmpegExit(reason: string): Promise<void> {
    if (this.#restarting) return;
    this.#log.warn({ reason }, 'ffmpeg exited');

    if (this.#state !== 'STREAMING') return;

    // Is the phone still there? If yes this was a transient stream end.
    try {
      await this.#control.client.health();
      this.#log.info('phone still healthy; restarting ffmpeg');
      await new Promise((r) => setTimeout(r, 500));
      await this.start();
    } catch {
      this.#log.warn('phone unreachable after ffmpeg exit');
      this.#transition('READY');
      await this.#startPlaceholder();
    }
  }

  /**
   * Apply a settings patch, restarting the stream only when the codec parameters
   * actually change. The V4L2 device is never torn down, so consumers keep it
   * open across the change. docs/01 §5.5.
   */
  async applySettings(patch: SettingsPatch): Promise<void> {
    const { restartRequired, settings } = await this.#control.applySettings(patch);
    if (!restartRequired || this.#state !== 'STREAMING') return;

    this.#restarting = true;
    this.#transition('RECONFIGURING');
    try {
      await this.#ffmpeg.stop();
      await new Promise((r) => setTimeout(r, 500));
      await this.#video.pinCaps(settings.resolution.width, settings.resolution.height, settings.fps);
      this.#restarting = false;
      await this.start();
    } catch (e) {
      this.#restarting = false;
      this.#log.error({ err: e }, 'reconfiguration failed');
      this.#transition('READY');
      throw e;
    }
  }

  /** Step quality down under thermal pressure or sustained drops. docs/05 §F11. */
  async degrade(reason: 'thermal' | 'drops'): Promise<void> {
    const s = this.#control.settings;
    if (!s || this.#degraded) return;

    const next =
      s.resolution.height > 1080
        ? { resolution: { width: 1920, height: 1080 } }
        : s.bitrate > 4_000_000
          ? { bitrate: Math.round(s.bitrate * 0.6) }
          : s.fps > 24
            ? { fps: 24 }
            : null;

    if (!next) {
      this.#log.warn({ reason }, 'already at the lowest quality step');
      return;
    }

    this.#degraded = true;
    const action = `reduced ${Object.keys(next)[0]}`;
    this.#log.warn({ reason, next }, 'degrading quality');
    this.#bus.emit({ type: 'telemetry.degraded', reason, action });
    await this.applySettings(next);
  }

  clearDegraded(): void {
    this.#degraded = false;
  }

  async shutdown(): Promise<void> {
    await this.#ffmpeg.stop();
    await this.#placeholder.stop();
  }
}
