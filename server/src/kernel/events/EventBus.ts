import type { Logger } from '../logging/logger.js';
import type { AppEvent, AppEventType, EventOf } from './events.js';

export type Handler<T extends AppEventType> = (event: EventOf<T>) => void;
export type Unsubscribe = () => void;

/**
 * Typed synchronous pub/sub.
 *
 * Synchronous on purpose: an event handler that does slow work blocks the
 * emitter, which makes the mistake obvious instead of silently reordering
 * state transitions. Handlers that need to do real work schedule it.
 *
 * A throwing handler is logged and does NOT prevent the remaining handlers from
 * running — one bad subscriber must not take down the pipeline.
 */
export class EventBus {
  readonly #handlers = new Map<AppEventType, Set<(event: AppEvent) => void>>();
  readonly #log: Logger;

  constructor(log: Logger) {
    this.#log = log.child({ component: 'EventBus' });
  }

  on<T extends AppEventType>(type: T, handler: Handler<T>): Unsubscribe {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    const erased = handler as unknown as (event: AppEvent) => void;
    set.add(erased);
    return () => {
      set!.delete(erased);
    };
  }

  once<T extends AppEventType>(type: T, handler: Handler<T>): Unsubscribe {
    const off = this.on(type, (event) => {
      off();
      handler(event);
    });
    return off;
  }

  emit(event: AppEvent): void {
    this.#log.debug({ event: event.type }, 'event');
    const set = this.#handlers.get(event.type);
    if (!set || set.size === 0) return;
    // Copy: a handler may unsubscribe itself or others mid-dispatch.
    for (const handler of [...set]) {
      try {
        handler(event);
      } catch (e) {
        this.#log.error({ err: e, event: event.type }, 'event handler threw');
      }
    }
  }

  /** Resolves on the next matching event, or rejects on timeout. */
  waitFor<T extends AppEventType>(type: T, timeoutMs: number): Promise<EventOf<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error(`Timed out after ${timeoutMs}ms waiting for "${type}"`));
      }, timeoutMs);
      const off = this.once(type, (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
  }

  handlerCount(type: AppEventType): number {
    return this.#handlers.get(type)?.size ?? 0;
  }

  removeAll(): void {
    this.#handlers.clear();
  }
}
