import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Device, DevicePort } from '../domain/Device.js';

const run = promisify(execFile);

export class AdbDeviceAdapter implements DevicePort {
  async list(): Promise<string[]> {
    try {
      const { stdout } = await run('adb', ['devices'], { timeout: 5000 });
      const lines = stdout.split('\n');
      const serials: string[] = [];
      let inList = false;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith('List of devices')) {
          inList = true;
          continue;
        }
        if (inList) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2 && parts[1] === 'device' && parts[0]) {
            serials.push(parts[0]);
          }
        }
      }

      return serials;
    } catch {
      return [];
    }
  }

  async describe(udid: string): Promise<Device> {
    const getProp = async (prop: string, fallback: string): Promise<string> => {
      try {
        const { stdout } = await run('adb', ['-s', udid, 'shell', 'getprop', prop], { timeout: 5000 });
        return stdout.trim() || fallback;
      } catch {
        return fallback;
      }
    };

    const model = await getProp('ro.product.model', 'Android Device');
    const osVersion = await getProp('ro.build.version.release', 'unknown');

    return {
      udid,
      name: model,
      model,
      ios: `Android ${osVersion}`,
      platform: 'android',
      osVersion,
    };
  }
}
