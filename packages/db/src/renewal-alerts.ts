// renewal.alerts (TechSpec 8, PRD 4.3): daily at 09:00 IST, the PM and Accounts hear about every
// retainer and AMC 30 days and again 7 days before its term ends. Idempotent: one notification per
// person per project, term and stage; a missed day catches up on the next run.
import type { PrismaClient } from '@prisma/client';

export const RENEWAL_STAGES = [30, 7] as const;
const DAY_MS = 86_400_000;

export interface RenewalAlertsResult extends Record<string, unknown> {
  date: string;
  projects: number;
  notified: number;
}

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The date a term ends: the renewal date if set, else the end date. */
export const termEnd = (p: { renewalDate: Date | null; endDate: Date | null }): Date | null => p.renewalDate ?? p.endDate;

export const daysUntil = (end: Date, today: string): number => Math.round((end.getTime() - new Date(`${today}T00:00:00.000Z`).getTime()) / DAY_MS);

/** `today` is a YYYY-MM-DD date in IST. */
export async function sendRenewalAlerts(prisma: PrismaClient, today: string): Promise<RenewalAlertsResult> {
  const horizon = new Date(new Date(`${today}T00:00:00.000Z`).getTime() + RENEWAL_STAGES[0] * DAY_MS);
  const projects = await prisma.project.findMany({
    where: {
      type: { in: ['RETAINER', 'AMC'] },
      statusType: { notIn: ['DONE', 'STOPPED'] },
      OR: [{ renewalDate: { lte: horizon } }, { renewalDate: null, endDate: { lte: horizon } }],
    },
    include: { client: { select: { companyName: true } } },
  });
  const accounts = await prisma.user.findMany({ where: { active: true, roles: { has: 'ACCOUNTS' } }, select: { id: true } });
  const activePms = new Set((await prisma.user.findMany({ where: { active: true, id: { in: projects.map((p) => p.pmId) } }, select: { id: true } })).map((u) => u.id));

  let notified = 0;
  for (const p of projects) {
    const end = termEnd(p);
    if (!end) continue;
    const left = daysUntil(end, today);
    const stage = left <= RENEWAL_STAGES[1] ? RENEWAL_STAGES[1] : RENEWAL_STAGES[0];
    const when = left < 0 ? `ended ${fmt.format(end)}` : left === 0 ? 'ends today' : `ends in ${left} ${left === 1 ? 'day' : 'days'} (${fmt.format(end)})`;
    const dedupeKey = `renewal:${p.id}:${end.toISOString().slice(0, 10)}:${stage}`;
    const recipients = [...(activePms.has(p.pmId) ? [p.pmId] : []), ...accounts.map((a) => a.id)];
    for (const userId of new Set(recipients)) {
      const created = await prisma.notification.createMany({
        data: [
          {
            userId,
            kind: 'RENEWAL_DUE',
            category: 'BILLING',
            title: `${p.client.companyName} · ${p.department.replace(/_/g, ' ')} ${when}`,
            body: userId === p.pmId ? 'Renew it (this raises a billing request for Accounts) or close it.' : 'The PM will renew or close it; a renewal arrives as a billing request.',
            link: '/billing?tab=renewals',
            data: { projectId: p.id, stage, endDate: end.toISOString().slice(0, 10) },
            dedupeKey,
          },
        ],
        skipDuplicates: true,
      });
      notified += created.count;
    }
  }
  return { date: today, projects: projects.length, notified };
}
