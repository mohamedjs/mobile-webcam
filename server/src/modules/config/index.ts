import type { Logger } from '../../kernel/logging/logger.js';
import type { EventBus } from '../../kernel/events/EventBus.js';
import { AppConfigSchema, type AppConfig } from './domain/schema.js';
import { FileConfigStore, defaultConfigPath } from './infrastructure/FileConfigStore.js';

export type { AppConfig };
export { videoDevicePath, DEFAULT_CONFIG } from './domain/schema.js';
export { defaultConfigPath };

export class ConfigModule {
  readonly #store: FileConfigStore;
  readonly #log: Logger;
  readonly #bus: EventBus;
  #config: AppConfig | null = null;

  constructor(deps: { log: Logger; bus: EventBus; path?: string }) {
    this.#store = new FileConfigStore(deps.path);
    this.#log = deps.log.child({ module: 'config' });
    this.#bus = deps.bus;
  }

  async load(): Promise<AppConfig> {
    this.#config = await this.#store.load();
    this.#log.info({ path: this.#store.path }, 'config loaded');
    return this.#config;
  }

  get current(): AppConfig {
    if (!this.#config) throw new Error('ConfigModule.load() not called');
    return this.#config;
  }

  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const next = AppConfigSchema.parse({ ...this.current, ...patch });
    await this.#store.save(next);
    this.#config = next;
    this.#log.info({ keys: Object.keys(patch) }, 'config updated');
    return next;
  }
}
