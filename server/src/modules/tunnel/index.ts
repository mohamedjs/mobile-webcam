import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import type { AppConfig } from '../config/index.js';
import type { Device } from '../discovery/index.js';
import { IproxyTunnel } from './infrastructure/IproxyTunnel.js';
import { AdbTunnel } from './infrastructure/AdbTunnel.js';

export { IproxyTunnel, AdbTunnel };

export class TunnelModule {
  readonly #log: Logger;
  readonly #bus: EventBus;
  readonly #config: AppConfig;
  readonly #iproxy: IproxyTunnel;
  readonly #adb: AdbTunnel;
  #currentMode: 'iproxy' | 'adb' | null = null;

  constructor(deps: { log: Logger; bus: EventBus; config: AppConfig }) {
    this.#log = deps.log.child({ module: 'tunnel' });
    this.#bus = deps.bus;
    this.#config = deps.config;
    this.#iproxy = new IproxyTunnel(this.#log);
    this.#adb = new AdbTunnel(this.#log);
  }

  get isOpen(): boolean {
    return this.#iproxy.isOpen || this.#adb.isOpen;
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.#config.localPort}`;
  }

  async open(device?: Pick<Device, 'platform' | 'udid'> | null): Promise<void> {
    if (this.isOpen) return;

    const { localPort, devicePort } = this.#config;
    const isAndroid = device?.platform === 'android';

    if (isAndroid) {
      this.#currentMode = 'adb';
      try {
        await this.#adb.open(localPort, devicePort, device?.udid);
        this.#bus.emit({ type: 'tunnel.opened', localPort, devicePort });
      } catch (err) {
        // Swallowing this left the pipeline waiting 30 s on a tunnel that
        // never existed. Fail now with the real reason.
        this.#bus.emit({ type: 'tunnel.failed', error: String(err) });
        throw err;
      }
    } else {
      this.#currentMode = 'iproxy';
      await this.#iproxy.open(
        localPort,
        devicePort,
        () => this.#bus.emit({ type: 'tunnel.opened', localPort, devicePort }),
        (error) => this.#bus.emit({ type: 'tunnel.failed', error }),
      );
    }
  }

  async close(reason = 'requested'): Promise<void> {
    if (this.#currentMode === 'adb') {
      await this.#adb.close();
    } else {
      await this.#iproxy.close();
    }
    this.#currentMode = null;
    this.#bus.emit({ type: 'tunnel.closed', reason });
  }
}
