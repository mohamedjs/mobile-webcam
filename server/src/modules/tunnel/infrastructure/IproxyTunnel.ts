import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ManagedProcess } from '../../../kernel/process/ManagedProcess.js';
import type { Logger } from '../../../kernel/logging/logger.js';

const run = promisify(execFile);

export class IproxyTunnel {
  readonly #log: Logger;
  #proc: ManagedProcess | null = null;
  #isOpen = false;

  constructor(log: Logger) {
    this.#log = log.child({ adapter: 'iproxy-tunnel' });
  }

  get isOpen(): boolean {
    return this.#isOpen;
  }

  async open(
    localPort: number,
    devicePort: number,
    onOpened: () => void,
    onFailed: (err: string) => void,
  ): Promise<void> {
    if (this.#proc) return;

    await this.#killStale(localPort);

    this.#proc = new ManagedProcess({
      name: 'iproxy',
      command: 'iproxy',
      args: [String(localPort), String(devicePort)],
      log: this.#log,
      healthyAfterMs: 3000,
      onStarted: () => {
        this.#isOpen = true;
        onOpened();
      },
      onGaveUp: (reason) => {
        this.#isOpen = false;
        this.#log.error({ reason }, 'tunnel gave up');
        onFailed(reason);
      },
    });
    this.#proc.start();
  }

  async close(): Promise<void> {
    if (!this.#proc) return;
    await this.#proc.stop();
    this.#proc = null;
    this.#isOpen = false;
  }

  async #killStale(localPort: number): Promise<void> {
    try {
      await run('pkill', ['-f', `iproxy ${localPort} `], { timeout: 3000 });
      this.#log.debug('killed a stale iproxy');
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // normal case when no stale iproxy is running
    }
  }
}
