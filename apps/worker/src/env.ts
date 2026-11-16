import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { sanitizeForLog } from '@opshub/policy';
import pino from 'pino';

const rootEnv = resolve(__dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  APP_URL: process.env.APP_URL ?? 'http://localhost:3000',
  // Email digest: SMTP (Mailpit locally, the relay in production) or .eml files on machines without Docker.
  MAIL_MODE: (process.env.MAIL_MODE || 'file') as 'smtp' | 'file',
  SMTP_URL: process.env.SMTP_URL || 'smtp://localhost:1025',
  MAIL_FROM: process.env.MAIL_FROM || 'Ops Hub <opshub@syspree.example>',
  LOCAL_MAIL_DIR: process.env.LOCAL_MAIL_DIR || resolve(__dirname, '../../../.local-mail'),
  // Web push (PWA). Without keys, pushes are recorded, not sent.
  PUSH_VAPID_PUBLIC_KEY: process.env.PUSH_VAPID_PUBLIC_KEY || '',
  PUSH_VAPID_PRIVATE_KEY: process.env.PUSH_VAPID_PRIVATE_KEY || '',
  PUSH_SUBJECT: process.env.PUSH_SUBJECT || 'mailto:ops@syspree.example',
};

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: { service: 'worker' },
  formatters: { log: (obj) => sanitizeForLog(obj) as Record<string, unknown> },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname,service' } }
      : undefined,
});
