import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import type { AppConfig } from '../config/index.js';
import type { Device } from './domain/Device.js';
import { LibimobiledeviceAdapter } from './infrastructure/LibimobiledeviceAdapter.js';
import { WatchDevices } from './application/WatchDevices.js';

export type { Device };

export class DiscoveryModule {
  readonly #watcher: WatchDevices;

  constructor(deps: { log: Logger; bus: EventBus; config: AppConfig }) {
    this.#watcher = new WatchDevices({
      devices: new LibimobiledeviceAdapter(),
      bus: deps.bus,
      log: deps.log.child({ module: 'discovery' }),
      intervalMs: deps.config.devicePollMs,
    });
  }

  start(): void { this.#watcher.start(); }
  stop(): void { this.#watcher.stop(); }
  get device(): Device | null { return this.#watcher.device; }
}
