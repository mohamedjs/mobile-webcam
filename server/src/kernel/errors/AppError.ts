import type { ErrorCode } from '@mobile-webcam/shared';

export interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  /** Whether retrying the same operation could plausibly succeed. */
  retryable?: boolean;
  cause?: unknown;
  /** For invalid_setting: the offending field path. */
  field?: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly field: string | undefined;

  constructor(opts: AppErrorOptions) {
    super(opts.message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'AppError';
    this.code = opts.code;
    this.retryable = opts.retryable ?? false;
    this.field = opts.field;
  }

  toWire(): { error: ErrorCode; message: string; field?: string } {
    return this.field !== undefined
      ? { error: this.code, message: this.message, field: this.field }
      : { error: this.code, message: this.message };
  }

  static is(e: unknown): e is AppError {
    return e instanceof AppError;
  }
}
