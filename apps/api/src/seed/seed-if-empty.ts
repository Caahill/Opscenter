// Run at API start on the demo site (APP_ENV=staging, SEED_DEMO=true): seeds users, pipelines and
// the Demo Co data, but only when the database has no users yet, so the first deploy gets demo
// data and later deploys leave whatever people changed. Never runs in production.
import { PrismaClient, seedBase, seedCatalog } from '@opshub/db';
import { isStaging, loadEnv } from '../config/env';
import { CryptoService } from '../crypto/crypto.service';
import { createKeyProvider } from '../crypto/key-providers';
import { seedDemo } from './demo-seed';

async function main() {
  const env = loadEnv();
  if (env.NODE_ENV === 'production' && !isStaging(env)) throw new Error('Demo data is never seeded in production');
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    if ((await prisma.user.count()) > 0) {
      console.warn('Demo seed skipped: the database already has users.');
      return;
    }
    const base = await seedBase(prisma);
    const catalog = await seedCatalog(prisma);
    const demo = await seedDemo(prisma, new CryptoService(createKeyProvider(env), env));
    console.warn(`Demo seed: ${base.users} users, ${catalog.pipelines} pipelines, ${catalog.packages} packages, ${demo.clients} demo client(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
