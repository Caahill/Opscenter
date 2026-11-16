// Points API tests at a separate `<db>_test` database and applies pending migrations.
// Non-destructive on purpose: data from earlier runs stays, so tests create uniquely named records.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestProject } from 'vitest/node' with { 'resolution-mode': 'import' };

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

export default function setup(project: TestProject) {
  const rootEnv = resolve(__dirname, '../../../.env');
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) {
    throw new Error('Set DATABASE_URL (or TEST_DATABASE_URL). Start Postgres with `docker compose up -d` or `pnpm db:local`.');
  }
  const url = new URL(base);
  if (!process.env.TEST_DATABASE_URL) url.pathname = `${url.pathname.replace(/\/$/, '')}_test`;
  const testDatabaseUrl = url.toString();

  const dbPackage = resolve(__dirname, '../../../packages/db');
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: dbPackage,
    env: { ...process.env, DATABASE_URL: testDatabaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });

  project.provide('testDatabaseUrl', testDatabaseUrl);
}
