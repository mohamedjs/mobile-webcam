import { ManagedProcess } from '../../../kernel/process/ManagedProcess.js';
import type { Logger } from '../../../kernel/logging/logger.js';

export interface FfmpegStats {
  fps: number;
  bitrateKbits: number;
  droppedFrames: number;
}

/** ffmpeg's -stats line, e.g. "frame= 900 fps= 30 q=-0.0 size=... bitrate=8000.0kbits/s drop=2" */
const STATS = /fps=\s*([\d.]+).*?bitrate=\s*([\d.]+)kbits\/s/;
const DROP = /drop=\s*(\d+)/;

export class FfmpegProcess {
  readonly #log: Logger;
  #proc: ManagedProcess | null = null;
  #stats: FfmpegStats = { fps: 0, bitrateKbits: 0, droppedFrames: 0 };

  constructor(deps: { log: Logger }) {
    this.#log = deps.log.child({ component: 'ffmpeg' });
  }

  get stats(): FfmpegStats {
    return { ...this.#stats };
  }

  get running(): boolean {
    return this.#proc?.state === 'running' || this.#proc?.state === 'starting';
  }

  /**
   * One-shot: no internal restarts. The pipeline state machine decides whether
   * to respawn, because only it can also restart the OUTPUT side (re-pin V4L2
   * caps, re-establish the audio target). docs/04 §5.1.
   */
  start(args: string[], onExit: (reason: string) => void): void {
    if (this.#proc) return;
    this.#stats = { fps: 0, bitrateKbits: 0, droppedFrames: 0 };

    this.#proc = new ManagedProcess({
      name: 'ffmpeg',
      command: 'ffmpeg',
      args,
      log: this.#log,
      restart: { maxFailures: 0 },
      onStderrLine: (line) => this.#parseStats(line),
      onGaveUp: (reason) => {
        this.#proc = null;
        onExit(reason);
      },
    });
    this.#proc.start();
  }

  #parseStats(line: string): void {
    const m = STATS.exec(line);
    if (m) {
      this.#stats.fps = Number.parseFloat(m[1] ?? '0');
      this.#stats.bitrateKbits = Number.parseFloat(m[2] ?? '0');
    }
    const d = DROP.exec(line);
    if (d) this.#stats.droppedFrames = Number.parseInt(d[1] ?? '0', 10);

    if (/error|failed|Invalid|Cannot/i.test(line)) {
      this.#log.warn({ line }, 'ffmpeg reported a problem');
    }
  }

  async stop(): Promise<void> {
    if (!this.#proc) return;
    const p = this.#proc;
    this.#proc = null;
    await p.stop();
  }
}
