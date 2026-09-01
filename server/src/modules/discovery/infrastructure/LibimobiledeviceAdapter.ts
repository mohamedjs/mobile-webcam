import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Device, DevicePort } from '../domain/Device.js';

const run = promisify(execFile);

/**
 * Uses the libimobiledevice CLIs rather than a native binding — they are already
 * installed as a hard dependency of usbmuxd, and a native addon would need
 * compiling on every machine for no gain at this call rate (0.5 Hz).
 */
export class LibimobiledeviceAdapter implements DevicePort {
  async list(): Promise<string[]> {
    try {
      const { stdout } = await run('idevice_id', ['-l'], { timeout: 5000 });
      return stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    } catch {
      // No daemon or no device is a normal empty result, not an error.
      return [];
    }
  }

  async describe(udid: string): Promise<Device> {
    const key = async (k: string, fallback: string): Promise<string> => {
      try {
        const { stdout } = await run('ideviceinfo', ['-u', udid, '-k', k], { timeout: 5000 });
        return stdout.trim() || fallback;
      } catch {
        return fallback;
      }
    };
    return {
      udid,
      name: await key('DeviceName', 'iPhone'),
      model: await key('ProductType', 'unknown'),
      ios: await key('ProductVersion', 'unknown'),
    };
  }
}
