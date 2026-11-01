import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Logger } from '../../../kernel/logging/logger.js';

const run = promisify(execFile);

export class AdbTunnel {
  readonly #log: Logger;
  #checkTimer: NodeJS.Timeout | null = null;
  #localPort = 0;
  #udid?: string;
  #isOpen = false;

  constructor(log: Logger) {
    this.#log = log.child({ adapter: 'adb-tunnel' });
  }

  get isOpen(): boolean {
    return this.#isOpen;
  }

  async open(localPort: number, devicePort: number, udid?: string): Promise<void> {
    this.#localPort = localPort;
    this.#udid = udid;

    const args = udid
      ? ['-s', udid, 'forward', `tcp:${localPort}`, `tcp:${devicePort}`]
      : ['forward', `tcp:${localPort}`, `tcp:${devicePort}`];

    try {
      await run('adb', args, { timeout: 5000 });
      this.#isOpen = true;
      this.#log.info({ localPort, devicePort, udid }, 'adb forward established');

      // Periodic health check
      this.#checkTimer = setInterval(() => {
        void this.#checkHealth(localPort);
      }, 3000);
    } catch (err) {
      this.#isOpen = false;
      this.#log.error({ err }, 'failed to establish adb forward');
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.#checkTimer) {
      clearInterval(this.#checkTimer);
      this.#checkTimer = null;
    }
    if (!this.#isOpen) return;

    this.#isOpen = false;
    const args = this.#udid
      ? ['-s', this.#udid, 'forward', '--remove', `tcp:${this.#localPort}`]
      : ['forward', '--remove', `tcp:${this.#localPort}`];

    try {
      await run('adb', args, { timeout: 3000 });
      this.#log.info({ localPort: this.#localPort }, 'adb forward removed');
    } catch (err) {
      this.#log.debug({ err }, 'adb forward remove error (may have already closed)');
    }
  }

  async #checkHealth(localPort: number): Promise<void> {
    try {
      const { stdout } = await run('adb', ['forward', '--list'], { timeout: 3000 });
      if (!stdout.includes(`tcp:${localPort}`)) {
        this.#isOpen = false;
        this.#log.warn({ localPort }, 'adb forward disappeared');
        if (this.#checkTimer) {
          clearInterval(this.#checkTimer);
          this.#checkTimer = null;
        }
      }
    } catch {
      this.#isOpen = false;
    }
  }
}
