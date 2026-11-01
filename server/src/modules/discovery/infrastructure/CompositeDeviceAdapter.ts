import type { Device, DevicePort } from '../domain/Device.js';

export class CompositeDeviceAdapter implements DevicePort {
  readonly #adapters: DevicePort[];

  constructor(adapters: DevicePort[]) {
    this.#adapters = adapters;
  }

  async list(): Promise<string[]> {
    const results = await Promise.allSettled(this.#adapters.map((a) => a.list()));
    const ids: string[] = [];
    for (const res of results) {
      if (res.status === 'fulfilled') {
        ids.push(...res.value);
      }
    }
    return ids;
  }

  async describe(udid: string): Promise<Device> {
    for (const adapter of this.#adapters) {
      try {
        const list = await adapter.list();
        if (list.includes(udid)) {
          return await adapter.describe(udid);
        }
      } catch {}
    }
    return {
      udid,
      name: 'Mobile Device',
      model: 'unknown',
      ios: 'unknown',
    };
  }
}
