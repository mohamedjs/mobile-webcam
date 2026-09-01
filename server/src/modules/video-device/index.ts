import { execFile } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import { AppError } from '../../kernel/errors/AppError.js';
import { videoDevicePath, type AppConfig } from '../config/index.js';

const run = promisify(execFile);

export class VideoDeviceModule {
  readonly #log: Logger;
  readonly #bus: EventBus;
  readonly #config: AppConfig;

  constructor(deps: { log: Logger; bus: EventBus; config: AppConfig }) {
    this.#log = deps.log.child({ module: 'video-device' });
    this.#bus = deps.bus;
    this.#config = deps.config;
  }

  get path(): string {
    return videoDevicePath(this.#config);
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.path);
      return true;
    } catch {
      return false;
    }
  }

  async label(): Promise<string | null> {
    try {
      const raw = await readFile(
        `/sys/devices/virtual/video4linux/video${this.#config.video.deviceNr}/name`,
        'utf8',
      );
      return raw.trim();
    } catch {
      return null;
    }
  }

  /**
   * Verify the device is present and correctly labelled.
   *
   * Deliberately does NOT modprobe: loading kernel modules needs root, and a
   * service that silently sudo's is worse than one that tells you to run setup.
   */
  async ensure(): Promise<void> {
    if (!(await this.exists())) {
      throw new AppError({
        code: 'video_device_unavailable',
        message: `${this.path} does not exist. Run: npm run setup:linux`,
      });
    }
    const label = await this.label();
    if (label !== this.#config.video.label) {
      this.#log.warn(
        { expected: this.#config.video.label, actual: label },
        'unexpected device label; consumers may not find it',
      );
    }
    this.#bus.emit({ type: 'video.device.ready', path: this.path, label: label ?? '?' });
    this.#log.info({ path: this.path, label }, 'video device ready');
  }

  /**
   * Pin the format BEFORE the first producer connects.
   *
   * With exclusive_caps=1 the device flips to capture-only once a producer opens
   * it and does not reliably reset on exit, so the next ffmpeg run fails to open
   * it for writing. Pinning caps makes every restart deterministic. docs/06 §2.3.
   */
  async pinCaps(width: number, height: number, fps: number): Promise<void> {
    const caps = `YUYV:${width}x${height}@${fps}`;
    try {
      await run('v4l2loopback-ctl', ['set-caps', caps, this.path], { timeout: 5000 });
      this.#log.info({ caps }, 'pinned caps');
    } catch (e) {
      // Not fatal: ffmpeg often negotiates anyway. Failing hard here would block
      // streaming on a cosmetic step.
      this.#log.warn({ err: e, caps }, 'set-caps failed; continuing');
    }
  }
}
