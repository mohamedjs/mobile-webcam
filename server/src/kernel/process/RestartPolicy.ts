export interface RestartPolicyOptions {
  /** First backoff delay in ms. Doubles each consecutive failure. */
  baseDelayMs?: number;
  /** Cap on the backoff delay. */
  maxDelayMs?: number;
  /** Give up after this many failures inside `windowMs`. */
  maxFailures?: number;
  /** Sliding window for counting failures. */
  windowMs?: number;
}

export interface RestartDecision {
  restart: boolean;
  delayMs: number;
  /** Set when `restart` is false: why we gave up. */
  reason?: string;
}

/**
 * Pure restart policy — no timers, no processes. Extracted from ManagedProcess
 * precisely so it can be unit tested without spawning anything.
 *
 * Exponential backoff, capped, with a sliding failure window. Restarting forever
 * in a hot loop hides the real cause and burns CPU (docs/04 §6), so after
 * `maxFailures` inside `windowMs` we stop and let the caller escalate.
 */
export class RestartPolicy {
  readonly #baseDelayMs: number;
  readonly #maxDelayMs: number;
  readonly #maxFailures: number;
  readonly #windowMs: number;

  #failures: number[] = [];
  #consecutive = 0;

  constructor(opts: RestartPolicyOptions = {}) {
    this.#baseDelayMs = opts.baseDelayMs ?? 250;
    this.#maxDelayMs = opts.maxDelayMs ?? 5_000;
    this.#maxFailures = opts.maxFailures ?? 10;
    this.#windowMs = opts.windowMs ?? 60_000;
  }

  /** Call on every unexpected exit. `now` is injectable for tests. */
  recordFailure(now: number = Date.now()): RestartDecision {
    this.#failures = this.#failures.filter((t) => now - t < this.#windowMs);
    this.#failures.push(now);
    this.#consecutive += 1;

    if (this.#failures.length > this.#maxFailures) {
      return {
        restart: false,
        delayMs: 0,
        reason: `${this.#failures.length} failures within ${this.#windowMs}ms`,
      };
    }

    const delayMs = Math.min(
      this.#baseDelayMs * 2 ** (this.#consecutive - 1),
      this.#maxDelayMs,
    );
    return { restart: true, delayMs };
  }

  /** Call once the process has been healthy long enough to count as recovered. */
  recordSuccess(): void {
    this.#consecutive = 0;
  }

  reset(): void {
    this.#failures = [];
    this.#consecutive = 0;
  }

  get consecutiveFailures(): number {
    return this.#consecutive;
  }

  get failuresInWindow(): number {
    return this.#failures.length;
  }
}
