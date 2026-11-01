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

  get sourceName(): string {
    return `${this.sinkName}_source`;
  }

  async exists(): Promise<boolean> {
    if (process.platform !== 'linux') return true;
    try {
      const { stdout } = await run('pactl', ['list', 'short', 'sinks'], { timeout: 5000 });
      return stdout.split('\n').some((l) => l.includes(this.sinkName));
    } catch {
      return false;
    }
  }

  async existsSource(): Promise<boolean> {
    if (process.platform !== 'linux') return true;
    try {
      const { stdout } = await run('pactl', ['list', 'short', 'sources'], { timeout: 5000 });
      return stdout.split('\n').some((l) => l.includes(this.sourceName));
    } catch {
      return false;
    }
  }

  async ensure(): Promise<void> {
    if (process.platform !== 'linux') {
      this.#bus.emit({ type: 'audio.sink.ready', sinkName: this.sinkName, moduleId: -1 });
      this.#log.info({ sink: this.sinkName }, 'audio device ready (virtual)');
      return;
    }
    if (await this.exists()) {
      this.#log.info({ sink: this.sinkName }, 'sink already present');
      await this.#ensureSource();
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
      await this.#ensureSource();
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

  async #ensureSource(): Promise<void> {
    if (process.platform !== 'linux') return;
    if (await this.existsSource()) return;
    try {
      const { stdout } = await run(
        'pactl',
        [
          'load-module', 'module-remap-source',
          `master=${this.sinkName}.monitor`,
          `source_name=${this.sourceName}`,
          `source_properties=device.description=Mobile_Webcam_Microphone`,
        ],
        { timeout: 5000 },
      );
      this.#log.info({ source: this.sourceName, moduleId: stdout.trim() }, 'remap source created for OBS');
    } catch (err) {
      this.#log.warn({ err }, 'failed to create remap source for mic');
    }
  }

  /** Unload only what we loaded — otherwise duplicate sinks pile up per restart. */
  async release(): Promise<void> {
    if (process.platform !== 'linux') return;
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
