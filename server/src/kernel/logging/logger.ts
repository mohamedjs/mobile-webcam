import { pino, type Logger, type DestinationStream } from 'pino';

export type { Logger };

export interface LoggerOptions {
  level: string;
  pretty: boolean;
}

const LEVEL_LABELS: Record<number, string> = {
  10: '\x1b[90mTRACE\x1b[0m',
  20: '\x1b[36mDEBUG\x1b[0m',
  30: '\x1b[32mINFO\x1b[0m ',
  40: '\x1b[33mWARN\x1b[0m ',
  50: '\x1b[31mERROR\x1b[0m',
  60: '\x1b[41m\x1b[37mFATAL\x1b[0m',
};

function createPrettyStream(): DestinationStream {
  return {
    write(chunk: string) {
      try {
        const obj = JSON.parse(chunk) as Record<string, unknown>;
        const time = typeof obj.time === 'number' ? new Date(obj.time) : new Date();
        const ts = time.toISOString().slice(11, 23);
        const level = LEVEL_LABELS[Number(obj.level)] ?? 'INFO ';
        const mod = typeof obj.module === 'string' ? `\x1b[90m(${obj.module})\x1b[0m ` : '';
        const msg = typeof obj.msg === 'string' ? obj.msg : '';
        const extraKeys = Object.keys(obj).filter(
          (k) => !['level', 'time', 'pid', 'hostname', 'module', 'msg', 'v'].includes(k),
        );
        const extra =
          extraKeys.length > 0
            ? ' ' +
              extraKeys
                .map((k) => `${k}=${JSON.stringify(obj[k])}`)
                .join(' ')
            : '';
        process.stdout.write(`\x1b[90m[${ts}]\x1b[0m ${level} ${mod}${msg}${extra}\n`);
      } catch {
        process.stdout.write(chunk);
      }
    },
  };
}

export function createLogger(opts: LoggerOptions): Logger {
  if (!opts.pretty) {
    return pino({ level: opts.level });
  }
  return pino({ level: opts.level }, createPrettyStream());
}
