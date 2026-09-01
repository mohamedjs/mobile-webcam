import { ManagedProcess } from '../../../kernel/process/ManagedProcess.js';
import type { Logger } from '../../../kernel/logging/logger.js';
import { buildPlaceholderArgs } from '../domain/FfmpegArgs.js';

/**
 * Feeds colour bars into the V4L2 device while the phone is unavailable.
 *
 * Not cosmetic: if /dev/videoN goes dark mid-call, Zoom and Meet drop the camera
 * permanently and the user must restart the whole app. A placeholder keeps the
 * call alive. docs/01 §6.4.
 */
export class PlaceholderFeed {
  readonly #log: Logger;
  #proc: ManagedProcess | null = null;

  constructor(deps: { log: Logger }) {
    this.#log = deps.log.child({ component: 'PlaceholderFeed' });
  }

  get running(): boolean {
    return this.#proc !== null;
  }

  start(opts: { videoDevice: string; width: number; height: number; fps: number; text?: string }): void {
    if (this.#proc) return;
    this.#log.info({ device: opts.videoDevice }, 'starting placeholder');
    this.#proc = new ManagedProcess({
      name: 'ffmpeg-placeholder',
      command: 'ffmpeg',
      args: buildPlaceholderArgs(opts),
      log: this.#log,
      restart: { maxFailures: 3, windowMs: 30_000 },
      onGaveUp: (reason) => this.#log.warn({ reason }, 'placeholder gave up'),
    });
    this.#proc.start();
  }

  async stop(): Promise<void> {
    if (!this.#proc) return;
    await this.#proc.stop();
    this.#proc = null;
    this.#log.info('placeholder stopped');
  }
}
