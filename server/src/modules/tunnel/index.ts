import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ManagedProcess } from '../../kernel/process/ManagedProcess.js';
import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import type { AppConfig } from '../config/index.js';

const run = promisify(execFile);

/**
 * Owns the iproxy process. Nothing else may spawn one.
 *
 * iproxy binds LOCAL and forwards to DEVICE. The direction is fixed by usbmuxd:
 * host→device only. See docs/01 §2.
 */
export class TunnelModule {
  readonly #log: Logger;
  readonly #bus: EventBus;
  readonly #config: AppConfig;
  #proc: ManagedProcess | null = null;
  #open = false;

  constructor(deps: { log: Logger; bus: EventBus; config: AppConfig }) {
    this.#log = deps.log.child({ module: 'tunnel' });
    this.#bus = deps.bus;
    this.#config = deps.config;
  }

  get isOpen(): boolean {
    return this.#open;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.#config.localPort}`;
  }

  async open(): Promise<void> {
    if (this.#proc) return;

    // A previous instance still holding the port makes iproxy exit with
    // "bind(): Address already in use" — clear it before spawning. docs/06 §4.
    await this.#killStale();

    const { localPort, devicePort } = this.#config;
    this.#proc = new ManagedProcess({
      name: 'iproxy',
      command: 'iproxy',
      args: [String(localPort), String(devicePort)],
      log: this.#log,
      healthyAfterMs: 3000,
      onStarted: () => {
        this.#open = true;
        this.#bus.emit({ type: 'tunnel.opened', localPort, devicePort });
      },
      onGaveUp: (reason) => {
        this.#open = false;
        this.#log.error({ reason }, 'tunnel gave up');
        this.#bus.emit({ type: 'tunnel.failed', error: reason });
      },
    });
    this.#proc.start();
  }

  async close(reason = 'requested'): Promise<void> {
    if (!this.#proc) return;
    await this.#proc.stop();
    this.#proc = null;
    this.#open = false;
    this.#bus.emit({ type: 'tunnel.closed', reason });
  }

  async #killStale(): Promise<void> {
    try {
      await run('pkill', ['-f', `iproxy ${this.#config.localPort} `], { timeout: 3000 });
      this.#log.debug('killed a stale iproxy');
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      // pkill exits non-zero when nothing matched — the normal case.
    }
  }
}
