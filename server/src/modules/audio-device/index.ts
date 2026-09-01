import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import { AppError } from '../../kernel/errors/AppError.js';
import type { AppConfig } from '../config/index.js';

const run = promisify(execFile);

/**
 * Owns the PipeWire null sink whose .monitor source is the virtual microphone.
 *
 * A null sink via pactl needs no compilation, no root, and no PipeWire ABI
 * coupling — unlike a custom SPA plugin. docs/06 §3.2.
 */
export class AudioDeviceModule {
  readonly #log: Logger;
  readonly #bus: EventBus;
  readonly #config: AppConfig;
  /** Only set when WE loaded it, so we never unload a sink the user made. */
  #ownedModuleId: number | null = null;

  constructor(deps: { log: Logger; bus: EventBus; config: AppConfig }) {
    this.#log = deps.log.child({ module: 'audio-device' });
    this.#bus = deps.bus;
    this.#config = deps.config;
  }

  get sinkName(): string {
    return this.#config.audio.sinkName;
  }

  get monitorSource(): string {
    return `${this.sinkName}.monitor`;
  }

  async exists(): Promise<boolean> {
    try {
      const { stdout } = await run('pactl', ['list', 'short', 'sinks'], { timeout: 5000 });
      return stdout.split('\n').some((l) => l.includes(this.sinkName));
    } catch {
      return false;
    }
  }

  async ensure(): Promise<void> {
    if (await this.exists()) {
      this.#log.info({ sink: this.sinkName }, 'sink already present');
      this.#bus.emit({ type: 'audio.sink.ready', sinkName: this.sinkName, moduleId: -1 });
      return;
    }

    try {
      const { stdout } = await run(
        'pactl',
        [
          'load-module', 'module-null-sink',
          `sink_name=${this.sinkName}`,
          `sink_properties=device.description=${this.#config.audio.description}`,
        ],
        { timeout: 5000 },
      );
      this.#ownedModuleId = Number.parseInt(stdout.trim(), 10);
      this.#log.info({ sink: this.sinkName, moduleId: this.#ownedModuleId }, 'sink created');
      this.#bus.emit({
        type: 'audio.sink.ready',
        sinkName: this.sinkName,
        moduleId: this.#ownedModuleId,
      });
    } catch (cause) {
      throw new AppError({
        code: 'audio_sink_unavailable',
        message: `Could not create PipeWire sink "${this.sinkName}". Is PipeWire running?`,
        cause,
      });
    }
  }

  /** Unload only what we loaded — otherwise duplicate sinks pile up per restart. */
  async release(): Promise<void> {
    if (this.#ownedModuleId === null) return;
    try {
      await run('pactl', ['unload-module', String(this.#ownedModuleId)], { timeout: 5000 });
      this.#log.info({ moduleId: this.#ownedModuleId }, 'sink unloaded');
      this.#bus.emit({ type: 'audio.sink.lost', sinkName: this.sinkName });
    } catch (e) {
      this.#log.warn({ err: e }, 'failed to unload sink');
    } finally {
      this.#ownedModuleId = null;
    }
  }
}
