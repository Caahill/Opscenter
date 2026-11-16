import { PrismaClient } from '@opshub/db';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env, logger } from './env';
import { mailerFromEnv, pushFromEnv, sendMailWith, sendPushWith } from './senders';
import { isJobName, JOBS, type JobDefinition } from './jobs';

const QUEUE = 'opshub';
const DEAD_LETTER = 'opshub-dead-letter';
const ATTEMPTS = 5;

async function redisReachable(url: string): Promise<boolean> {
  const probe = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
  probe.on('error', () => {});
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

async function main() {
  if (!(await redisReachable(env.REDIS_URL))) {
    // Phase 1A has no job that the UI depends on, so a missing Redis should not stop `pnpm dev`.
    logger.warn(`Redis not reachable at ${env.REDIS_URL}; worker idle. Start it with \`docker compose up -d redis\`.`);
    return;
  }

  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  const prisma = new PrismaClient();
  const queue = new Queue(QUEUE, { connection });
  const deadLetter = new Queue(DEAD_LETTER, { connection });

  for (const [name, job] of Object.entries(JOBS) as Array<[string, JobDefinition]>) {
    if (job.cron) {
      await queue.upsertJobScheduler(name, { pattern: job.cron, tz: 'Asia/Kolkata' }, {
        name,
        opts: { attempts: ATTEMPTS, backoff: { type: 'exponential', delay: 30_000 } },
      });
    }
  }

  const worker = new Worker(
    QUEUE,
    async (job) => {
      if (!isJobName(job.name)) throw new Error(`Unknown job ${job.name}`);
      const result = await JOBS[job.name].run({ prisma, now: () => new Date(), mail: sendMailWith(mailerFromEnv()), push: sendPushWith(pushFromEnv()), appUrl: env.APP_URL }, job.data);
      logger.info({ job: job.name, jobId: job.id, result });
      return result;
    },
    { connection },
  );

  worker.on('failed', async (job, err) => {
    logger.error({ job: job?.name, jobId: job?.id, err });
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await deadLetter.add(job.name, { failedJobId: job.id, data: job.data, error: err.message });
    }
  });

  logger.info('worker ready');

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await deadLetter.close();
    await prisma.$disconnect();
    connection.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  logger.error({ err });
  process.exit(1);
});
