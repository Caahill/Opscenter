import type { LoggerService } from '@nestjs/common';
import { sanitizeForLog } from '@opshub/policy';
import pino from 'pino';
import type { Env } from '../config/env';

/** JSON logs; every payload is passed through sanitizeForLog so PII-tagged fields are dropped. */
export function createLogger(env: Pick<Env, 'LOG_LEVEL' | 'NODE_ENV'>): pino.Logger {
  return pino({
    level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
    base: { service: 'api' },
    formatters: { log: (obj) => sanitizeForLog(obj) as Record<string, unknown> },
    transport:
      env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname,service' } }
        : undefined,
  });
}

export class PinoNestLogger implements LoggerService {
  constructor(private readonly logger: pino.Logger) {}

  private write(level: 'info' | 'error' | 'warn' | 'debug' | 'trace', message: unknown, context: unknown[]) {
    const ctx = typeof context.at(-1) === 'string' ? (context.at(-1) as string) : undefined;
    if (message && typeof message === 'object') {
      this.logger[level]({ context: ctx, ...(message as object) });
    } else {
      this.logger[level]({ context: ctx }, String(sanitizeForLog(String(message))));
    }
  }

  log(message: unknown, ...context: unknown[]) {
    this.write('info', message, context);
  }
  error(message: unknown, ...context: unknown[]) {
    this.write('error', message, context);
  }
  warn(message: unknown, ...context: unknown[]) {
    this.write('warn', message, context);
  }
  debug(message: unknown, ...context: unknown[]) {
    this.write('debug', message, context);
  }
  verbose(message: unknown, ...context: unknown[]) {
    this.write('trace', message, context);
  }
}
