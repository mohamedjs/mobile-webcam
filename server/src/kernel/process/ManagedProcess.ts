import { spawn, type ChildProcessByStdio } from 'node:child_process';
import type { Readable } from 'node:stream';

/** stdio is ['ignore','pipe','pipe']: no stdin, both outputs piped. */
type PipedChild = ChildProcessByStdio<null, Readable, Readable>;
import { createInterface } from 'node:readline';
import type { Logger } from '../logging/logger.js';
import { RestartPolicy, type RestartPolicyOptions } from './RestartPolicy.js';

export interface ManagedProcessOptions {
  name: string;
  command: string;
  args: string[];
  log: Logger;
  restart?: RestartPolicyOptions;
  /** ms the process must stay up before its start counts as successful. */
  healthyAfterMs?: number;
  /** ms to wait after SIGTERM before SIGKILL. */
  terminateGraceMs?: number;
  env?: NodeJS.ProcessEnv;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  /** Called when the policy gives up. The caller escalates. */
  onGaveUp?: (reason: string) => void;
  /** Called after each successful (re)start. */
  onStarted?: () => void;
}

type State = 'stopped' | 'starting' | 'running' | 'stopping';

/**
 * Supervises one long-lived child (iproxy, ffmpeg).
 *
 * Deliberately not a generic process pool: this project has exactly two child
 * processes and both want the same behaviour.
 */
export class ManagedProcess {
  readonly #opts: Required<Pick<ManagedProcessOptions, 'healthyAfterMs' | 'terminateGraceMs'>> &
    ManagedProcessOptions;
  readonly #log: Logger;
  readonly #policy: RestartPolicy;

  #child: PipedChild | null = null;
  #state: State = 'stopped';
  #restartTimer: NodeJS.Timeout | null = null;
  #healthyTimer: NodeJS.Timeout | null = null;
  #wantRunning = false;

  constructor(opts: ManagedProcessOptions) {
    this.#opts = {
      healthyAfterMs: 5_000,
      terminateGraceMs: 3_000,
      ...opts,
    };
    this.#log = opts.log.child({ component: 'ManagedProcess', proc: opts.name });
    this.#policy = new RestartPolicy(opts.restart);
  }

  get state(): State {
    return this.#state;
  }

  get pid(): number | undefined {
    return this.#child?.pid;
  }

  start(): void {
    this.#wantRunning = true;
    if (this.#state === 'running' || this.#state === 'starting') return;
    this.#spawn();
  }

  #spawn(): void {
    this.#state = 'starting';
    const { command, args, env } = this.#opts;
    this.#log.info({ command, args }, 'spawning');

    const child = spawn(command, args, {
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.#child = child;

    createInterface({ input: child.stdout }).on('line', (line) => {
      this.#log.debug({ stream: 'stdout' }, line);
      this.#opts.onStdoutLine?.(line);
    });
    createInterface({ input: child.stderr }).on('line', (line) => {
      this.#log.debug({ stream: 'stderr' }, line);
      this.#opts.onStderrLine?.(line);
    });

    child.on('spawn', () => {
      this.#state = 'running';
      this.#log.info({ pid: child.pid }, 'started');
      this.#opts.onStarted?.();
      this.#healthyTimer = setTimeout(() => {
        this.#policy.recordSuccess();
        this.#log.debug('considered healthy; backoff reset');
      }, this.#opts.healthyAfterMs);
    });

    child.on('error', (err) => {
      this.#log.error({ err }, 'spawn error');
    });

    child.on('exit', (code, signal) => {
      this.#clearHealthyTimer();
      this.#child = null;

      if (!this.#wantRunning || this.#state === 'stopping') {
        this.#state = 'stopped';
        this.#log.info({ code, signal }, 'stopped as requested');
        return;
      }

      this.#state = 'stopped';
      this.#log.warn({ code, signal }, 'exited unexpectedly');

      const decision = this.#policy.recordFailure();
      if (!decision.restart) {
        this.#wantRunning = false;
        this.#log.error({ reason: decision.reason }, 'giving up');
        this.#opts.onGaveUp?.(decision.reason ?? 'restart policy exhausted');
        return;
      }

      this.#log.info({ delayMs: decision.delayMs }, 'restarting after backoff');
      this.#restartTimer = setTimeout(() => {
        this.#restartTimer = null;
        if (this.#wantRunning) this.#spawn();
      }, decision.delayMs);
    });
  }

  /**
   * SIGTERM, then SIGKILL after the grace period.
   *
   * The grace period is not decoration: ffmpeg needs it to release the V4L2
   * device. A hard kill can leave the device unusable until the module reloads.
   */
  async stop(): Promise<void> {
    this.#wantRunning = false;
    this.#clearRestartTimer();
    this.#clearHealthyTimer();

    const child = this.#child;
    if (!child) {
      this.#state = 'stopped';
      return;
    }

    this.#state = 'stopping';
    this.#log.info({ pid: child.pid }, 'stopping');

    await new Promise<void>((resolve) => {
      const killTimer = setTimeout(() => {
        this.#log.warn('grace period elapsed; SIGKILL');
        child.kill('SIGKILL');
      }, this.#opts.terminateGraceMs);

      child.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });

      child.kill('SIGTERM');
    });

    this.#child = null;
    this.#state = 'stopped';
    this.#policy.reset();
  }

  #clearRestartTimer(): void {
    if (this.#restartTimer) {
      clearTimeout(this.#restartTimer);
      this.#restartTimer = null;
    }
  }

  #clearHealthyTimer(): void {
    if (this.#healthyTimer) {
      clearTimeout(this.#healthyTimer);
      this.#healthyTimer = null;
    }
  }
}
