// Environment for the e2e stack: API on :4100 and web on :3100 against an `<db>_e2e` database,
// so a run never touches the data you use with `pnpm dev`. Keys are fixed fakes (test only).
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Both callers (prepare and playwright test) run from apps/web.
export const root = resolve(process.cwd(), '../..');
const rootEnv = resolve(root, '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const fakeKey = (label: string) => createHash('sha256').update(`opshub-test-only:${label}`).digest('base64');

function databaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL (or E2E_DATABASE_URL) and start Postgres first');
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/\/$/, '')}_e2e`;
  return url.toString();
}

export const WEB_URL = 'http://localhost:3100';
export const API_URL = 'http://localhost:4100';

export const e2eEnv: Record<string, string> = {
  DATABASE_URL: databaseUrl(),
  APP_URL: WEB_URL,
  API_URL,
  KMS_MODE: 'local',
  LOCAL_PII_KEY: fakeKey('pii'),
  LOCAL_VAULT_KEY: fakeKey('vault'),
  HASH_PEPPER: fakeKey('pepper'),
  AUTH_MODE: 'dev',
  STORAGE_DRIVER: 'fs',
  LOCAL_STORAGE_DIR: resolve(root, '.local-storage-e2e'),
  LOCAL_MAIL_DIR: resolve(root, '.local-mail-e2e'),
  // The browser opens its live connection to the API port (next start does not proxy websockets).
  REALTIME_URL: API_URL,
  LOG_LEVEL: 'warn',
};

/** process.env plus the e2e values, as plain strings for child processes. */
export function childEnv(extra: Record<string, string> = {}): Record<string, string> {
  const base = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'));
  return { ...base, ...e2eEnv, ...extra };
}
