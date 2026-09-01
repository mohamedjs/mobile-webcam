import {
  PROTOCOL_VERSION,
  requiresRestart,
  validateAgainstCapabilities,
  type Capabilities,
  type Health,
  type Settings,
  type SettingsPatch,
} from '@mobile-webcam/shared';
import { AppError } from '../../kernel/errors/AppError.js';
import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import type { PhoneClient } from './domain/PhoneClient.js';
import { HttpPhoneClient } from './infrastructure/HttpPhoneClient.js';

export type { PhoneClient };

export interface ApplyResult {
  settings: Settings;
  restartRequired: boolean;
}

export class DeviceControlModule {
  readonly #client: PhoneClient;
  readonly #log: Logger;
  readonly #bus: EventBus;

  #capabilities: Capabilities | null = null;
  #settings: Settings | null = null;

  constructor(deps: {
    log: Logger;
    bus: EventBus;
    baseUrl: () => string;
    token: () => string;
    client?: PhoneClient;
  }) {
    this.#log = deps.log.child({ module: 'device-control' });
    this.#bus = deps.bus;
    this.#client = deps.client ?? new HttpPhoneClient({ baseUrl: deps.baseUrl, token: deps.token });
  }

  get capabilities(): Capabilities | null { return this.#capabilities; }
  get settings(): Settings | null { return this.#settings; }
  get client(): PhoneClient { return this.#client; }

  /**
   * Probe /health, gate on protocol version, then cache capabilities+settings.
   * Retries because the user may still be opening the app. docs/05 §F1.
   */
  async waitForReady(opts: { attempts?: number; delayMs?: number } = {}): Promise<Health> {
    const attempts = opts.attempts ?? 30;
    const delayMs = opts.delayMs ?? 1000;
    let last: unknown;

    for (let i = 0; i < attempts; i++) {
      try {
        const health = await this.#client.health();

        if (health.protocol !== PROTOCOL_VERSION) {
          this.#bus.emit({
            type: 'phone.protocol.mismatch',
            expected: PROTOCOL_VERSION,
            actual: health.protocol,
          });
          throw new AppError({
            code: 'protocol_mismatch',
            message:
              `Phone app speaks protocol ${health.protocol}, desktop expects ${PROTOCOL_VERSION}. ` +
              (health.protocol > PROTOCOL_VERSION
                ? 'Update the desktop service.'
                : 'Update the phone app.'),
          });
        }

        this.#capabilities = await this.#client.capabilities();
        this.#settings = await this.#client.settings();
        this.#log.info({ device: health.device }, 'phone ready');
        this.#bus.emit({ type: 'phone.ready', capabilities: this.#capabilities });
        return health;
      } catch (e) {
        if (AppError.is(e) && e.code === 'protocol_mismatch') throw e;
        last = e;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw new AppError({
      code: 'device_not_found',
      message: 'Phone did not become ready. Open mobile_webcam on the phone.',
      retryable: true,
      cause: last,
    });
  }

  /**
   * Validate against real device capabilities before sending. Zod covers shape;
   * this covers what the hardware actually offers.
   */
  async applySettings(patch: SettingsPatch): Promise<ApplyResult> {
    if (!this.#settings || !this.#capabilities) {
      throw new AppError({ code: 'device_not_found', message: 'Phone is not ready' });
    }

    const issues = validateAgainstCapabilities(patch, this.#settings, this.#capabilities);
    if (issues.length > 0) {
      const first = issues[0]!;
      throw new AppError({
        code: 'invalid_setting',
        message: issues.map((i) => `${i.field}: ${i.message}`).join('; '),
        field: first.field,
      });
    }

    const restartRequired = requiresRestart(patch);
    const settings = await this.#client.patchSettings(patch);
    this.#settings = settings;

    // Cinematic changes what the device will accept — re-read rather than assume.
    if (patch.cinematic?.enabled !== undefined) {
      this.#capabilities = await this.#client.capabilities();
    }

    this.#bus.emit({ type: 'phone.settings.changed', settings });
    this.#log.info({ keys: Object.keys(patch), restartRequired }, 'settings applied');
    return { settings, restartRequired };
  }

  async refresh(): Promise<void> {
    this.#capabilities = await this.#client.capabilities();
    this.#settings = await this.#client.settings();
  }

  invalidate(): void {
    this.#capabilities = null;
    this.#settings = null;
  }
}
