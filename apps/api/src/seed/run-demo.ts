// pnpm --filter @opshub/api seed:demo (run by `pnpm db:seed`). Local and staging only.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@opshub/db';
import { loadEnv } from '../config/env';
import { CryptoService } from '../crypto/crypto.service';
import { createKeyProvider } from '../crypto/key-providers';
import { seedDemo } from './demo-seed';

const rootEnv = resolve(__dirname, '../../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

async function main() {
  const env = loadEnv();
  if (env.NODE_ENV === 'production') throw new Error('Demo data is never seeded in production');
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const { clients, leave, inbox, billing } = await seedDemo(prisma, new CryptoService(createKeyProvider(env), env));
    const extras = [leave ? 'leave demo for Manoj Member' : null, inbox ? 'demo inbox (support@syspree.example)' : null, billing ? 'demo billing request and renewal alerts' : null].filter(Boolean);
    console.warn(`Demo data: ${clients} client(s) created (existing ones left unchanged)${extras.length ? `; added ${extras.join(' and ')}` : ''}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
