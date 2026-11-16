// pnpm db:seed - idempotent. Teams, one user per role, department pipelines and packages.
// Demo clients and projects are seeded by the API (`pnpm --filter @opshub/api seed:demo`),
// because their contact details must be encrypted with the app's keys.
import { PrismaClient } from '@prisma/client';
import { seedBase } from './seed-base';
import { seedCatalog } from './seed-catalog';

const prisma = new PrismaClient();

async function main() {
  const base = await seedBase(prisma);
  const catalog = await seedCatalog(prisma);
  console.log(
    `Seeded ${base.teams} teams, ${base.users} users; created ${catalog.pipelines} pipelines and ${catalog.packages} packages.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
