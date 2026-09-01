import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { AppConfigSchema, type AppConfig } from '../domain/schema.js';

export function defaultConfigPath(): string {
  const base = process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config');
  return join(base, 'mobile_webcam', 'config.json');
}

/**
 * Atomic JSON config. Writes to a temp file in the SAME directory then renames —
 * a rename within one filesystem is atomic, so a crash mid-write cannot leave a
 * truncated config that fails to parse on next boot.
 */
export class FileConfigStore {
  readonly #path: string;

  constructor(path: string = defaultConfigPath()) {
    this.#path = path;
  }

  get path(): string {
    return this.#path;
  }

  async load(): Promise<AppConfig> {
    try {
      const raw = await readFile(this.#path, 'utf8');
      return AppConfigSchema.parse(JSON.parse(raw));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        const fresh = AppConfigSchema.parse({});
        await this.save(fresh);
        return fresh;
      }
      throw e;
    }
  }

  async save(config: AppConfig): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true });
    const tmp = `${this.#path}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await rename(tmp, this.#path);
  }
}
