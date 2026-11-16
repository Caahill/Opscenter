// Job registry (TechSpec 8). Each job is idempotent, so retries and reruns are safe.
import { deliverPush, notifyLeaveImpact, sendDigests, sendDueReminders, sendRenewalAlerts, type PrismaClient, type SendMail, type SendPush } from '@opshub/db';
import { generateCycles, istDate } from './cycle-generate';

export interface JobContext {
  prisma: PrismaClient;
  now: () => Date;
  /** Notification delivery; set by main.ts and run-once.ts from the environment. */
  mail?: SendMail;
  push?: SendPush;
  appUrl?: string;
}

const istDay = (at: Date) => {
  const { y, m, d } = istDate(at);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

export interface JobDefinition {
  /** Repeat schedule, cron in IST. Omit for jobs that are only enqueued on demand. */
  cron?: string;
  run: (ctx: JobContext, data: unknown) => Promise<Record<string, unknown>>;
}

/** `pnpm jobs:run <job> <arg>` passes `{ arg }`; queued jobs pass named fields. */
const field = (data: unknown, name: string): unknown => {
  const d = data as Record<string, unknown> | null;
  return d?.[name] ?? d?.arg;
};

/** `pnpm jobs:run cycle.generate 2026-11-15` runs as if it were that day. */
function dateArg(data: unknown, now: () => Date): Date {
  const date = field(data, 'date');
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(`${date}T12:00:00+05:30`);
  return now();
}

export const JOBS = {
  /** Revoke credential grants past expiry (min of task close and 7 days). TechSpec 5.7. */
  'grants.expire': {
    cron: '0 * * * *',
    run: async ({ prisma, now }: JobContext, _data: unknown) => {
      const { count } = await prisma.credentialGrant.updateMany({
        where: { revokedAt: null, expiresAt: { lte: now() } },
        data: { revokedAt: now() },
      });
      return { revoked: count };
    },
  },
  /** Daily 00:30 IST: monthly retainer tasks for projects whose cycle day is today. */
  'cycle.generate': {
    cron: '30 0 * * *',
    run: async ({ prisma, now }: JobContext, data: unknown) => generateCycles(prisma, dateArg(data, now)),
  },
  /** Daily 18:30 IST (TechSpec 8): one email per person with what they have not read. */
  'digest.email': {
    cron: '30 18 * * *',
    run: async ({ prisma, now, mail, appUrl }: JobContext, _data: unknown) => {
      if (!mail) throw new Error('digest.email needs a mailer');
      return sendDigests(prisma, mail, { appUrl: appUrl ?? 'http://localhost:3000', now: now() });
    },
  },
  /** Daily 08:30 IST: tasks due today and overdue, once per person per day. */
  'due.reminders': {
    cron: '30 8 * * *',
    run: async ({ prisma, now }: JobContext, data: unknown) => sendDueReminders(prisma, istDay(dateArg(data, now))),
  },
  /** Every minute: push anything from the last hour not pushed yet (the API pushes straight away). */
  'notify.push': {
    cron: '* * * * *',
    run: async ({ prisma, now, push }: JobContext, _data: unknown) => {
      if (!push) throw new Error('notify.push needs a push sender');
      return deliverPush(prisma, push, { now: now() });
    },
  },
  /** Daily 09:00 IST (PRD 4.3): 30 and 7 days before a retainer or AMC ends. `pnpm jobs:run renewal.alerts 2026-12-01` time-travels. */
  'renewal.alerts': {
    cron: '0 9 * * *',
    run: async ({ prisma, now }: JobContext, data: unknown) => {
      const { y, m, d } = istDate(dateArg(data, now));
      return sendRenewalAlerts(prisma, `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    },
  },
  /**
   * Nightly 03:00 IST (TechSpec 10): rebuilds message search text, e.g. after a client is renamed.
   * The API keeps it current on every write; this catches anything that drifted.
   */
  'search.reindex': {
    cron: '0 3 * * *',
    run: async ({ prisma }: JobContext, _data: unknown) => {
      const updated = await prisma.$executeRaw`
        UPDATE "Communication" c
        SET "searchVector" = to_tsvector('english',
          coalesce(c."subjectMasked", '') || ' ' || c."bodyMasked" || ' ' ||
          coalesce((SELECT "companyName" FROM "Client" WHERE id = c."clientId"), ''))`;
      return { updated };
    },
  },
  /**
   * On leave create or change: alert the TL and affected PMs (PRD 3.2). The API runs this inline
   * after each leave write; the job reruns it, e.g. `pnpm jobs:run leave.impact <leaveId>`.
   */
  'leave.impact': {
    run: async ({ prisma, now }: JobContext, data: unknown) => {
      const leaveId = field(data, 'leaveId');
      if (typeof leaveId !== 'string' || !leaveId) throw new Error('leave.impact needs a leaveId');
      const { y, m, d } = istDate(now());
      const today = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      return notifyLeaveImpact(prisma, leaveId, today);
    },
  },
} satisfies Record<string, JobDefinition>;

export type JobName = keyof typeof JOBS;

export const isJobName = (name: string): name is JobName => name in JOBS;
