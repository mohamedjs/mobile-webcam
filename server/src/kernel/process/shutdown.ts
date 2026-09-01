import type { Logger } from '../logging/logger.js';

export interface ShutdownTask {
  name: string;
  run: () => Promise<void> | void;
}

/**
 * Ordered graceful shutdown. Tasks run in REVERSE registration order, so
 * teardown mirrors startup.
 *
 * A failing task is logged and the remaining tasks still run — a stuck ffmpeg
 * must not prevent the audio sink from being unloaded.
 */
export class ShutdownCoordinator {
  readonly #tasks: ShutdownTask[] = [];
  readonly #log: Logger;
  #running = false;

  constructor(log: Logger) {
    this.#log = log.child({ component: 'Shutdown' });
  }

  register(name: string, run: ShutdownTask['run']): void {
    this.#tasks.push({ name, run });
  }

  async shutdown(signal: string): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    this.#log.info({ signal }, 'shutting down');

    for (const task of [...this.#tasks].reverse()) {
      try {
        await task.run();
        this.#log.debug({ task: task.name }, 'shutdown task done');
      } catch (e) {
        this.#log.error({ err: e, task: task.name }, 'shutdown task failed');
      }
    }
    this.#log.info('shutdown complete');
  }

  install(onDone: () => void = () => process.exit(0)): void {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.once(signal, () => {
        void this.shutdown(signal).then(onDone);
      });
    }
  }
}
