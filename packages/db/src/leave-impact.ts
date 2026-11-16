// leave.impact (TechSpec 8, PRD 3.2): when leave is recorded or changed, the member's Team Leader
// and the PMs of affected projects get one notification listing the tasks due during it. The API
// runs this inline after the write so the alert is immediate; the worker runs the same function
// as the `leave.impact` job for reruns. Idempotent: one notification per recipient per leave.
import type { PrismaClient } from '@prisma/client';
import { OPEN_STATUS_TYPES } from '@opshub/shared';

export interface LeaveImpactResult extends Record<string, unknown> {
  leaveId: string;
  tasks: number;
  notified: number;
  skipped?: 'missing' | 'past';
}

const fmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function leaveRangeText(startDate: Date, endDate: Date, halfDay: boolean): string {
  if (startDate.getTime() === endDate.getTime()) return `${fmt.format(startDate)}${halfDay ? ' (half day)' : ''}`;
  return `${fmt.format(startDate)} to ${fmt.format(endDate)}`;
}

function tasksText(n: number, onYourProjects: boolean): string {
  if (n === 0) return 'No open tasks are due during the leave.';
  const what = `${n} ${n === 1 ? 'task' : 'tasks'}${onYourProjects ? ' on your projects' : ''}`;
  return `${what} ${n === 1 ? 'is' : 'are'} due during the leave. Reassign ${n === 1 ? 'it' : 'them'} from the alert.`;
}

export const leaveDedupeKey = (leaveId: string) => `leave:${leaveId}`;

/** `today` is a YYYY-MM-DD date; leave that has already ended raises no alert. */
export async function notifyLeaveImpact(prisma: PrismaClient, leaveId: string, today: string): Promise<LeaveImpactResult> {
  const dedupeKey = leaveDedupeKey(leaveId);
  const leave = await prisma.leave.findUnique({
    where: { id: leaveId },
    include: { user: { include: { team: { select: { leaderId: true } } } } },
  });
  if (!leave) {
    await prisma.notification.deleteMany({ where: { dedupeKey } });
    return { leaveId, tasks: 0, notified: 0, skipped: 'missing' };
  }
  if (leave.endDate.toISOString().slice(0, 10) < today) return { leaveId, tasks: 0, notified: 0, skipped: 'past' };

  const during = { gte: leave.startDate, lte: leave.endDate };
  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: leave.userId,
      statusType: { in: [...OPEN_STATUS_TYPES] },
      OR: [{ plannedDate: during }, { plannedDate: null, dueDate: during }],
    },
    select: { id: true, project: { select: { pmId: true } } },
  });

  // The Team Leader always hears about leave in their team; a PM only when their projects are hit.
  const recipients = new Map<string, string[]>();
  const leaderId = leave.user.team?.leaderId;
  if (leaderId && leaderId !== leave.userId) recipients.set(leaderId, tasks.map((t) => t.id));
  for (const t of tasks) {
    const pmId = t.project.pmId;
    if (pmId === leave.userId || pmId === leaderId) continue;
    recipients.set(pmId, [...(recipients.get(pmId) ?? []), t.id]);
  }
  const active = await prisma.user.findMany({ where: { id: { in: [...recipients.keys()] }, active: true }, select: { id: true } });
  const activeIds = new Set(active.map((u) => u.id));

  const title = `${leave.user.name} is on leave ${leaveRangeText(leave.startDate, leave.endDate, leave.halfDay)}`;
  let notified = 0;
  await prisma.$transaction(async (tx) => {
    // Recipients who are no longer affected (dates changed) lose the stale alert.
    await tx.notification.deleteMany({ where: { dedupeKey, userId: { notIn: [...activeIds] } } });
    for (const [userId, taskIds] of recipients) {
      if (!activeIds.has(userId)) continue;
      const fields = {
        kind: 'LEAVE_IMPACT',
        category: 'TEAM',
        title,
        body: tasksText(taskIds.length, userId !== leaderId),
        link: `/leave/${leaveId}`,
        data: { leaveId, taskIds },
      };
      await tx.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey } },
        update: { ...fields, readAt: null, emailedAt: null, pushedAt: null, createdAt: new Date() },
        create: { ...fields, userId, dedupeKey },
      });
      notified++;
    }
  });
  return { leaveId, tasks: tasks.length, notified };
}
