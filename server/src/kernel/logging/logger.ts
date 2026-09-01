import { pino, type Logger } from 'pino';

export type { Logger };

export interface LoggerOptions {
  level: string;
  pretty: boolean;
}

export function createLogger(opts: LoggerOptions): Logger {
  if (!opts.pretty) {
    return pino({ level: opts.level });
  }
  return pino({
    level: opts.level,
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
    },
  });
}
