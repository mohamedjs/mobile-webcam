import type { EventBus } from '../../../kernel/events/EventBus.js';
import type { Logger } from '../../../kernel/logging/logger.js';
import type { Device, DevicePort } from '../domain/Device.js';

/**
 * Polls for attached devices and emits facts on change.
 *
 * Polling rather than udev: at 2 s the cost is unmeasurable, and a udev rule is
 * an extra root-owned failure mode. docs/06 §8.
 */
export class WatchDevices {
  readonly #devices: DevicePort;
  readonly #bus: EventBus;
  readonly #log: Logger;
  readonly #intervalMs: number;

  #timer: NodeJS.Timeout | null = null;
  #current: Device | null = null;
  #polling = false;

  constructor(deps: { devices: DevicePort; bus: EventBus; log: Logger; intervalMs: number }) {
    this.#devices = deps.devices;
    this.#bus = deps.bus;
    this.#log = deps.log;
    this.#intervalMs = deps.intervalMs;
  }

  get device(): Device | null {
    return this.#current;
  }

  start(): void {
    if (this.#timer) return;
    void this.#poll();
    this.#timer = setInterval(() => void this.#poll(), this.#intervalMs);
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async #poll(): Promise<void> {
    if (this.#polling) return; // a slow describe() must not stack up polls
    this.#polling = true;
    try {
      const udids = await this.#devices.list();
      const first = udids[0];

      if (!first) {
        if (this.#current) {
          const gone = this.#current;
          this.#current = null;
          this.#log.info({ udid: gone.udid }, 'device disconnected');
          this.#bus.emit({ type: 'device.disconnected', udid: gone.udid });
        }
        return;
      }

      if (this.#current?.udid === first) return;

      if (this.#current) {
        this.#bus.emit({ type: 'device.disconnected', udid: this.#current.udid });
      }

      const device = await this.#devices.describe(first);
      this.#current = device;
      this.#log.info({ udid: device.udid, name: device.name, ios: device.ios }, 'device connected');
      this.#bus.emit({
        type: 'device.connected',
        udid: device.udid,
        name: device.name,
        model: device.model,
        ios: device.ios,
      });
    } catch (e) {
      this.#log.error({ err: e }, 'device poll failed');
    } finally {
      this.#polling = false;
    }
  }
}
