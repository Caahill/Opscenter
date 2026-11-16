// digest.email, notify.push and due.reminders against a real database (PRD 5.3), with in-memory
// senders. Each test uses people of its own.
import { randomBytes } from 'node:crypto';
import { PrismaClient, seedBase, seedCatalog } from '@opshub/db';
import { FakePushSender, MemoryMailer } from '@opshub/integrations';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { JOBS, type JobContext } from '../src/jobs';

const RUN = randomBytes(4).toString('hex');
let prisma: PrismaClient;
let n = 0;
const person = () => prisma.user.create({ data: { email: `notify.${RUN}.${++n}@dev.local`, name: `Nina Notify ${n}`, roles: ['TEAM_MEMBER'] } });

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: inject('testDatabaseUrl') } } });
  await seedBase(prisma);
  await seedCatalog(prisma);
});
afterAll(() => prisma.$disconnect());

describe('digest.email', () => {
  it('one email per person with unread items in categories they get by email, never repeated', async () => {
    const mailer = new MemoryMailer();
    const ctx: JobContext = { prisma, now: () => new Date(), mail: (m) => mailer.send(m), appUrl: 'https://ops.example' };
    const u = await person();
    await prisma.notification.createMany({
      data: [
        { userId: u.id, kind: 'MENTION', category: 'MENTION', title: 'Asha mentioned you in #SEO', link: '/chat/x' },
        { userId: u.id, kind: 'DUE', category: 'DUE', title: '2 tasks due today', link: '/my-tasks' },
        { userId: u.id, kind: 'BILLING', category: 'BILLING', title: 'Already read', readAt: new Date() },
      ],
    });
    await prisma.notificationPreference.create({ data: { userId: u.id, category: 'DUE', email: false, push: false } });

    await JOBS['digest.email'].run(ctx, {});
    const mine = mailer.sent.filter((m) => m.to === u.email);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.subject).toBe('Ops Hub: 1 update for you');
    expect(mine[0]!.text).toContain('Asha mentioned you in #SEO https://ops.example/chat/x');
    expect(mine[0]!.text).not.toContain('2 tasks due today');
    expect(mine[0]!.text).not.toContain('Already read');
    expect(mine[0]!.html).toContain('<a href="https://ops.example/chat/x">');

    await JOBS['digest.email'].run(ctx, {});
    expect(mailer.sent.filter((m) => m.to === u.email)).toHaveLength(1);
  });
});

describe('notify.push', () => {
  it('pushes to every device of people who want it, once, and forgets dead devices', async () => {
    const sender = new FakePushSender();
    const ctx: JobContext = { prisma, now: () => new Date(), push: (t, p) => sender.send(t, p) };
    const [a, b] = [await person(), await person()];
    await prisma.pushSubscription.createMany({
      data: [
        { userId: a.id, endpoint: `https://push.example/${RUN}/a1`, p256dh: 'k', auth: 'x' },
        { userId: a.id, endpoint: `https://push.example/${RUN}/gone`, p256dh: 'k', auth: 'x' },
        { userId: b.id, endpoint: `https://push.example/${RUN}/b1`, p256dh: 'k', auth: 'x' },
      ],
    });
    await prisma.notificationPreference.create({ data: { userId: b.id, category: 'MENTION', email: true, push: false } });
    await prisma.notification.createMany({
      data: [
        { userId: a.id, kind: 'MENTION', category: 'MENTION', title: `Mention ${RUN}`, link: '/chat' },
        { userId: b.id, kind: 'MENTION', category: 'MENTION', title: `Muted ${RUN}` },
      ],
    });
    await JOBS['notify.push'].run(ctx, {});
    await JOBS['notify.push'].run(ctx, {});
    expect(sender.sent.filter((s) => s.payload.title === `Mention ${RUN}`).map((s) => s.endpoint)).toEqual([`https://push.example/${RUN}/a1`]);
    expect(sender.sent.some((s) => s.payload.title === `Muted ${RUN}`)).toBe(false);
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: `https://push.example/${RUN}/gone` } })).toBeNull();
    expect((await prisma.notification.findMany({ where: { userId: { in: [a.id, b.id] } } })).every((x) => x.pushedAt)).toBe(true);
  });
});

describe('due.reminders', () => {
  it('one reminder a day per person with what is due today and overdue', async () => {
    const u = await person();
    const pm = await prisma.user.findUniqueOrThrow({ where: { email: 'pm@dev.local' } });
    const pipeline = await prisma.pipeline.findFirstOrThrow({ where: { department: 'SEO', active: true }, include: { stages: true } });
    const client = await prisma.client.create({ data: { companyName: `Due Co ${RUN}`, market: 'IN', pmId: pm.id } });
    const project = await prisma.project.create({ data: { clientId: client.id, department: 'SEO', pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, type: 'RETAINER', pmId: pm.id } });
    const task = (due: string, statusType: 'ACTIVE' | 'DONE' = 'ACTIVE') =>
      prisma.task.create({ data: { projectId: project.id, title: `T ${due}`, type: 'DELIVERABLE', assigneeId: u.id, dueDate: new Date(`${due}T00:00:00Z`), statusType } });
    await task('2031-03-10');
    await task('2031-03-10');
    await task('2031-03-07');
    await task('2031-03-05', 'DONE');
    await task('2031-03-12');
    const ctx: JobContext = { prisma, now: () => new Date() };
    await JOBS['due.reminders'].run(ctx, { arg: '2031-03-10' });
    await JOBS['due.reminders'].run(ctx, { arg: '2031-03-10' });
    const rows = await prisma.notification.findMany({ where: { userId: u.id, kind: 'DUE' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: '2 tasks due today, 1 overdue', category: 'DUE', link: '/my-tasks', dedupeKey: 'due:2031-03-10' });
  });
});
