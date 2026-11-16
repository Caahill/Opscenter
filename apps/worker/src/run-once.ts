// pnpm jobs:run <job> [arg] - runs one job immediately, without Redis (QuickStart 7).
import { PrismaClient } from '@opshub/db';
import { env } from './env';
import { mailerFromEnv, pushFromEnv, sendMailWith, sendPushWith } from './senders';
import { isJobName, JOBS } from './jobs';

async function main() {
  const name = process.argv[2] ?? '';
  if (!isJobName(name)) {
    console.error(`Usage: pnpm jobs:run <job> [YYYY-MM-DD | leaveId]\nJobs: ${Object.keys(JOBS).join(', ')}`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const result = await JOBS[name].run({ prisma, now: () => new Date(), mail: sendMailWith(mailerFromEnv()), push: sendPushWith(pushFromEnv()), appUrl: env.APP_URL }, { arg: process.argv[3] });
    console.warn(`${name}:`, result);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
