type Level = 'debug' | 'info' | 'warn' | 'error';

const RING_MAX = 200;
const ring: string[] = [];

function write(level: Level, msg: string, extra?: unknown): void {
  const line = `${new Date().toISOString().slice(11, 23)} ${level.toUpperCase()} ${msg}` +
    (extra === undefined ? '' : ` ${safeJson(extra)}`);
  ring.push(line);
  if (ring.length > RING_MAX) ring.shift();
  if (__DEV__) console[level === 'debug' ? 'log' : level](line);
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return String(v); }
}

export const log = {
  debug: (m: string, e?: unknown) => write('debug', m, e),
  info: (m: string, e?: unknown) => write('info', m, e),
  warn: (m: string, e?: unknown) => write('warn', m, e),
  error: (m: string, e?: unknown) => write('error', m, e),
  /** Newest first, for the diagnostics screen. */
  history: (): string[] => [...ring].reverse(),
  clear: (): void => { ring.length = 0; },
};
