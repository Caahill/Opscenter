// Notification delivery (PRD 5.3, TechSpec 8): web push right after a notification is written, the
// email digest at 18:30 IST, and due-date reminders at 08:30 IST. Each person's settings decide
// email and push per category; in-app is always on. Text is masked when written (AGENTS.md rule 4).
// The senders are passed in, so this package needs no mail or push library.
import type { PrismaClient } from '@prisma/client';
import { categoryOf, DEFAULT_PREFERENCES, NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS, OPEN_STATUS_TYPES, type NotificationCategory } from '@opshub/shared';

type Prefs = Record<NotificationCategory, { email: boolean; push: boolean }>;

export async function preferencesFor(prisma: PrismaClient, userIds: string[]): Promise<Map<string, Prefs>> {
  const rows = userIds.length ? await prisma.notificationPreference.findMany({ where: { userId: { in: userIds } } }) : [];
  const out = new Map<string, Prefs>();
  for (const id of userIds) out.set(id, { ...DEFAULT_PREFERENCES });
  for (const r of rows) {
    if ((NOTIFICATION_CATEGORIES as readonly string[]).includes(r.category)) out.get(r.userId)![r.category as NotificationCategory] = { email: r.email, push: r.push };
  }
  return out;
}

export interface PushJob {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export type SendPush = (target: PushJob, payload: { title: string; body: string | null; link: string | null; tag: string }) => Promise<'sent' | 'gone' | 'failed'>;

/**
 * Sends push for notifications not yet pushed: the given ids, or everything from the last hour
 * (the worker's catch-up). Each is marked pushed even when the person has push off or no device.
 */
export async function deliverPush(prisma: PrismaClient, send: SendPush, opts: { ids?: string[]; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const pending = await prisma.notification.findMany({
    where: { pushedAt: null, ...(opts.ids ? { id: { in: opts.ids } } : { createdAt: { gte: new Date(now.getTime() - 3_600_000) } }) },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  if (!pending.length) return { notifications: 0, sent: 0, removed: 0 };
  const userIds = [...new Set(pending.map((n) => n.userId))];
  const [prefs, subs] = await Promise.all([preferencesFor(prisma, userIds), prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } })]);
  let sent = 0;
  let removed = 0;
  const gone = new Set<string>();
  for (const n of pending) {
    // Claim it first, so two runners never push the same notification twice.
    const { count } = await prisma.notification.updateMany({ where: { id: n.id, pushedAt: null }, data: { pushedAt: now } });
    // A test from the settings page always goes out: checking push is its whole point.
    if (!count || (n.kind !== 'TEST' && !prefs.get(n.userId)![categoryOf(n.kind)].push)) continue;
    for (const s of subs.filter((x) => x.userId === n.userId && !gone.has(x.id))) {
      const outcome = await send(s, { title: n.title, body: n.body, link: n.link, tag: n.dedupeKey ?? n.id });
      if (outcome === 'sent') {
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: now } });
      } else if (outcome === 'gone') {
        gone.add(s.id);
        removed++;
        await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      }
    }
  }
  return { notifications: pending.length, sent, removed };
}

export interface DigestMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}
export type SendMail = (mail: DigestMail) => Promise<void>;

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One email per person with what they have not read yet, grouped by category. */
export async function sendDigests(prisma: PrismaClient, send: SendMail, opts: { appUrl: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true } });
  const prefs = await preferencesFor(prisma, users.map((u) => u.id));
  let emails = 0;
  for (const u of users) {
    const pending = await prisma.notification.findMany({ where: { userId: u.id, emailedAt: null, createdAt: { gte: weekAgo } }, orderBy: { createdAt: 'asc' } });
    if (!pending.length) continue;
    const include = pending.filter((n) => n.readAt === null && prefs.get(u.id)![categoryOf(n.kind)].email);
    if (include.length) {
      const groups = NOTIFICATION_CATEGORIES.map((c) => ({ c, items: include.filter((n) => categoryOf(n.kind) === c) })).filter((g) => g.items.length);
      const url = (link: string | null) => (link ? `${opts.appUrl}${link}` : opts.appUrl);
      const text = [
        `Hi ${u.name.split(' ')[0]},`,
        '',
        `Here is what happened in Ops Hub that you have not seen yet.`,
        ...groups.flatMap((g) => ['', NOTIFICATION_CATEGORY_LABELS[g.c], ...g.items.map((n) => `- ${n.title}${n.body ? `. ${n.body}` : ''} ${url(n.link)}`)]),
        '',
        `Change what you get by email: ${opts.appUrl}/settings/notifications`,
      ].join('\n');
      const html = [
        `<p>Hi ${escape(u.name.split(' ')[0]!)},</p><p>Here is what happened in Ops Hub that you have not seen yet.</p>`,
        ...groups.map((g) => `<h3>${escape(NOTIFICATION_CATEGORY_LABELS[g.c])}</h3><ul>${g.items.map((n) => `<li><a href="${escape(url(n.link))}">${escape(n.title)}</a>${n.body ? `<br>${escape(n.body)}` : ''}</li>`).join('')}</ul>`),
        `<p><a href="${escape(opts.appUrl)}/settings/notifications">Change what you get by email</a></p>`,
      ].join('');
      await send({ to: u.email, subject: `Ops Hub: ${include.length} ${include.length === 1 ? 'update' : 'updates'} for you`, text, html });
      emails++;
    }
    // Everything up to now is settled, so a later digest never repeats it.
    await prisma.notification.updateMany({ where: { id: { in: pending.map((n) => n.id) } }, data: { emailedAt: now } });
  }
  return { emails };
}

/** 08:30 IST: each assignee hears once a day about tasks due today and overdue. `today` is YYYY-MM-DD (IST). */
export async function sendDueReminders(prisma: PrismaClient, today: string) {
  const end = new Date(`${today}T00:00:00.000Z`);
  const tasks = await prisma.task.findMany({
    where: { statusType: { in: [...OPEN_STATUS_TYPES] }, assigneeId: { not: null }, dueDate: { lte: end }, assignee: { active: true } },
    select: { assigneeId: true, dueDate: true },
  });
  const byUser = new Map<string, { today: number; overdue: number }>();
  for (const t of tasks) {
    const c = byUser.get(t.assigneeId!) ?? { today: 0, overdue: 0 };
    if (t.dueDate!.getTime() === end.getTime()) c.today++;
    else c.overdue++;
    byUser.set(t.assigneeId!, c);
  }
  let notified = 0;
  for (const [userId, c] of byUser) {
    const parts = [c.today ? `${c.today} ${c.today === 1 ? 'task' : 'tasks'} due today` : null, c.overdue ? `${c.overdue} overdue` : null].filter(Boolean);
    const r = await prisma.notification.createMany({
      data: [{ userId, kind: 'DUE', category: 'DUE', title: parts.join(', '), body: 'Open My tasks to plan your day.', link: '/my-tasks', dedupeKey: `due:${today}` }],
      skipDuplicates: true,
    });
    notified += r.count;
  }
  return { date: today, notified };
}
