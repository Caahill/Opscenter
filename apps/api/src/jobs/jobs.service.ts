// Inbox job runner (TechSpec 8). Inbox jobs need the PII key and file storage, so they run in the API
// process: on BullMQ with retries, backoff and a dead-letter queue when Redis is reachable, otherwise
// in-process straight away (local runs without Docker, tests). Handlers must be idempotent either way.
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env';

export type JobHandler = (data: Record<string, unknown>) => Promise<unknown>;

const QUEUE = 'opshub-inbox';
const DEAD_LETTER = 'opshub-dead-letter';
const ATTEMPTS = 5;

@Injectable()
export class JobsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('Jobs');
  private readonly handlers = new Map<string, JobHandler>();
  private readonly schedules: Array<{ name: string; pattern: string }> = [];
  private readonly pending = new Set<Promise<unknown>>();
  private queue: Queue | null = null;
  private deadLetter: Queue | null = null;
  private worker: Worker | null = null;
  private connection: Redis | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  /** Services register their handlers in their constructors. */
  register(name: string, handler: JobHandler) {
    this.handlers.set(name, handler);
  }

  /** Repeats on a cron in IST. Only runs with Redis; without it, use the manual triggers. */
  schedule(name: string, pattern: string) {
    this.schedules.push({ name, pattern });
  }

  get mode(): 'queue' | 'inline' {
    return this.queue ? 'queue' : 'inline';
  }

  async onApplicationBootstrap() {
    if (!this.env.REDIS_URL || this.env.NODE_ENV === 'test') return;
    const probe = new Redis(this.env.REDIS_URL, { family: 0, lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
    probe.on('error', () => {});
    try {
      await probe.connect();
      await probe.ping();
    } catch {
      this.log.warn(`Redis not reachable; inbox jobs run in-process without retries`);
      return;
    } finally {
      probe.disconnect();
    }
    this.connection = new Redis(this.env.REDIS_URL, { family: 0, maxRetriesPerRequest: null });
    this.queue = new Queue(QUEUE, { connection: this.connection });
    this.deadLetter = new Queue(DEAD_LETTER, { connection: this.connection });
    for (const s of this.schedules) {
      await this.queue.upsertJobScheduler(s.name, { pattern: s.pattern, tz: 'Asia/Kolkata' }, { name: s.name, opts: { attempts: ATTEMPTS, backoff: { type: 'exponential', delay: 30_000 } } });
    }
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) throw new Error(`Unknown job ${job.name}`);
        return handler((job.data ?? {}) as Record<string, unknown>);
      },
      { connection: this.connection, concurrency: 5 },
    );
    this.worker.on('failed', async (job, err) => {
      this.log.error({ job: job?.name, jobId: job?.id, error: err.name });
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        await this.deadLetter?.add(job.name, { failedJobId: job.id, data: job.data, error: err.name });
      }
    });
    this.log.log('Inbox jobs on the Redis queue');
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
    await this.deadLetter?.close();
    this.connection?.disconnect();
  }

  /** `jobId` de-duplicates on the queue (e.g. one triage per message). */
  async enqueue(name: string, data: Record<string, unknown>, jobId?: string): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Unknown job ${name}`);
    if (this.queue) {
      await this.queue.add(name, data, { jobId, attempts: ATTEMPTS, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 5000 });
      return;
    }
    const run = handler(data)
      .catch((err: unknown) => this.log.error({ job: name, error: err instanceof Error ? err.name : 'Error' }))
      .finally(() => this.pending.delete(run));
    this.pending.add(run);
  }

  /** Runs a job now and returns its result (manual "sync now", dev tools). */
  run(name: string, data: Record<string, unknown>): Promise<unknown> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Unknown job ${name}`);
    return handler(data);
  }

  /** Waits for in-process jobs, including ones they enqueue. Tests and dev tools use it. */
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
}
