import { createHash, randomBytes } from 'node:crypto';
import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaClient, seedBase, seedCatalog, SEED_USERS } from '@opshub/db';
import { SESSION_COOKIE } from '@opshub/shared';
import request from 'supertest';
import { inject } from 'vitest';
import { createApp } from '../src/app';
import { loadEnv, type Env } from '../src/config/env';
import { CryptoService } from '../src/crypto/crypto.service';
import { LocalKeyProvider } from '../src/crypto/key-providers';
import { seedDemo } from '../src/seed/demo-seed';

export type SeedEmail = (typeof SEED_USERS)[number]['email'];

/** Suffix for records a test creates, so reruns against the same database do not collide. */
export const RUN = randomBytes(4).toString('hex');
export const uniqueEmail = (local: string) => `${local}.${RUN}@dev.local`;

/** Seed user per viewer class used by the role matrices. */
export const AS = {
  ADMIN: 'admin@dev.local',
  PM_OWN: 'pm@dev.local',
  PM_OTHER: 'pm2@dev.local',
  TEAM_LEADER: 'tl.seo@dev.local',
  TEAM_MEMBER: 'member.seo@dev.local',
  ACCOUNTS: 'accounts@dev.local',
  HR: 'hr@dev.local',
} as const;

/**
 * Fixed fake keys for the test database, so encrypted demo data stays readable across runs.
 * Derived from public strings on purpose: these never protect anything real.
 */
const fakeKey = (label: string) => createHash('sha256').update(`opshub-test-only:${label}`).digest('base64');

export function testEnv(overrides: Partial<Record<string, string>> = {}): Env {
  const key = (label: string) => fakeKey(label);
  return loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: inject('testDatabaseUrl'),
    APP_URL: 'http://localhost:3000',
    API_URL: 'http://localhost:4000',
    LOCAL_PII_KEY: key('pii'),
    LOCAL_VAULT_KEY: key('vault'),
    HASH_PEPPER: key('pepper'),
    STORAGE_DRIVER: 'fs',
    LOCAL_STORAGE_DIR: '.local-storage-test',
    LOCAL_MAIL_DIR: '.local-mail-test',
    AUTH_MODE: 'dev',
    ...overrides,
  });
}

export interface TestContext {
  app: NestExpressApplication;
  prisma: PrismaClient;
  http: () => ReturnType<typeof request>;
  /** Session cookie header for a seed user. */
  cookieFor: (email: string) => Promise<string>;
  userId: (email: string) => Promise<string>;
  close: () => Promise<void>;
}

export async function startApp(opts: { env?: Env; controllers?: Type[] } = {}): Promise<TestContext> {
  const env = opts.env ?? testEnv();
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  await seedBase(prisma);
  await seedCatalog(prisma);
  await seedDemo(prisma, new CryptoService(new LocalKeyProvider(env), env));
  const app = await createApp(env, { controllers: opts.controllers });
  // A listening server keeps supertest from opening and closing one per request.
  await app.listen(0, '127.0.0.1');
  const http = () => request(app.getHttpServer());
  const cookies = new Map<string, string>();

  const userId = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;

  return {
    app,
    prisma,
    http,
    userId,
    cookieFor: async (email) => {
      const cached = cookies.get(email);
      if (cached) return cached;
      const res = await http().post('/api/v1/auth/dev/login').send({ userId: await userId(email) }).expect(200);
      const set = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
      const cookie = set.find((c) => c.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0];
      if (!cookie) throw new Error('no session cookie');
      cookies.set(email, cookie);
      return cookie;
    },
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}
