// leave.impact against a real database (PRD 3.2): the TL and the PMs of affected projects get
// one alert per leave, kept in step when the leave changes. Uses its own team and users.
import { randomBytes } from 'node:crypto';
import { PrismaClient, seedBase, seedCatalog } from '@opshub/db';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { JOBS, type JobContext } from '../src/jobs';

const RUN = randomBytes(4).toString('hex');
const day = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
let prisma: PrismaClient;
let ctx: JobContext;
let ids: { leader: string; member: string; pmA: string; pmB: string; hr: string; projectA: string; projectB: string };

const user = (local: string, roles: Array<'TEAM_LEADER' | 'TEAM_MEMBER' | 'PM' | 'HR'>, teamId?: string) =>
  prisma.user.create({ data: { email: `${local}.${RUN}@dev.local`, name: `${local} ${RUN}`, roles, teamId } });

async function project(pmId: string) {
  const client = await prisma.client.create({ data: { companyName: `Leave Impact ${RUN} ${pmId.slice(-4)}`, market: 'IN', pmId } });
  const pipeline = await prisma.pipeline.findFirstOrThrow({ where: { department: 'SEO', active: true }, include: { stages: true } });
  return prisma.project.create({
    data: { clientId: client.id, department: 'SEO', pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, type: 'RETAINER', pmId, startDate: day('2031-01-01') },
  });
}

const alerts = (leaveId: string) =>
  prisma.notification.findMany({ where: { dedupeKey: `leave:${leaveId}` }, orderBy: { userId: 'asc' } });

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: inject('testDatabaseUrl') } } });
  await seedBase(prisma);
  await seedCatalog(prisma);
  ctx = { prisma, now: () => new Date('2031-03-01T09:00:00+05:30') };
  const leader = await user('tl', ['TEAM_LEADER']);
  const team = await prisma.team.create({ data: { name: `Leave Impact ${RUN}`, department: 'SEO', leaderId: leader.id } });
  const member = await user('member', ['TEAM_MEMBER'], team.id);
  const pmA = await user('pma', ['PM']);
  const pmB = await user('pmb', ['PM']);
  const hr = await user('hr', ['HR']);
  const [a, b] = [await project(pmA.id), await project(pmB.id)];
  ids = { leader: leader.id, member: member.id, pmA: pmA.id, pmB: pmB.id, hr: hr.id, projectA: a.id, projectB: b.id };
  const task = (projectId: string, title: string, due: string, extra: object = {}) =>
    prisma.task.create({ data: { projectId, title: `${title} ${RUN}`, type: 'DELIVERABLE', assigneeId: member.id, dueDate: day(due), ...extra } });
  await task(a.id, 'Due during', '2031-03-10');
  await task(a.id, 'Planned during, due later', '2031-03-30', { plannedDate: day('2031-03-11') });
  await task(b.id, 'Due after', '2031-03-20');
  await task(a.id, 'Done already', '2031-03-10', { statusType: 'DONE' });
});
afterAll(() => prisma.$disconnect());

describe('leave.impact', () => {
  it('alerts the TL with every task and each affected PM with theirs, once', async () => {
    const leave = await prisma.leave.create({
      data: { userId: ids.member, startDate: day('2031-03-09'), endDate: day('2031-03-12'), kind: 'PLANNED', createdById: ids.hr },
    });
    expect(await JOBS['leave.impact'].run(ctx, { leaveId: leave.id })).toMatchObject({ tasks: 2, notified: 2 });
    await JOBS['leave.impact'].run(ctx, { arg: leave.id }); // rerun: no duplicates

    const rows = await alerts(leave.id);
    expect(rows.map((r) => r.userId).sort()).toEqual([ids.leader, ids.pmA].sort());
    const tl = rows.find((r) => r.userId === ids.leader)!;
    expect(tl.title).toBe(`member ${RUN} is on leave 9 Mar to 12 Mar`);
    expect(tl.body).toBe('2 tasks are due during the leave. Reassign them from the alert.');
    expect(tl.link).toBe(`/leave/${leave.id}`);
    expect(rows.find((r) => r.userId === ids.pmA)!.body).toBe('2 tasks on your projects are due during the leave. Reassign them from the alert.');
  });

  it('moves the alert when the dates change, and drops it when the leave is deleted', async () => {
    const leave = await prisma.leave.create({
      data: { userId: ids.member, startDate: day('2031-03-19'), endDate: day('2031-03-19'), halfDay: true, kind: 'OTHER', createdById: ids.hr },
    });
    // Before the dates move, mark the TL's alert read: a change must surface it again.
    await JOBS['leave.impact'].run(ctx, { leaveId: leave.id });
    expect((await alerts(leave.id)).map((r) => r.userId)).toEqual([ids.leader]);
    await prisma.notification.updateMany({ where: { dedupeKey: `leave:${leave.id}` }, data: { readAt: new Date() } });

    await prisma.leave.update({ where: { id: leave.id }, data: { startDate: day('2031-03-20'), endDate: day('2031-03-20') } });
    await JOBS['leave.impact'].run(ctx, { leaveId: leave.id });
    const moved = await alerts(leave.id);
    expect(moved.map((r) => r.userId).sort()).toEqual([ids.leader, ids.pmB].sort());
    expect(moved.every((r) => r.readAt === null)).toBe(true);
    expect(moved[0]!.title).toContain('20 Mar (half day)');

    await prisma.leave.delete({ where: { id: leave.id } });
    expect(await JOBS['leave.impact'].run(ctx, { leaveId: leave.id })).toMatchObject({ skipped: 'missing' });
    expect(await alerts(leave.id)).toEqual([]);
  });

  it('raises nothing for leave that has already ended', async () => {
    const leave = await prisma.leave.create({
      data: { userId: ids.member, startDate: day('2031-02-02'), endDate: day('2031-02-03'), kind: 'SICK', createdById: ids.hr },
    });
    expect(await JOBS['leave.impact'].run(ctx, { leaveId: leave.id })).toMatchObject({ skipped: 'past', notified: 0 });
    expect(await alerts(leave.id)).toEqual([]);
  });

  it('needs a leave id', async () => {
    await expect(JOBS['leave.impact'].run(ctx, {})).rejects.toThrow('leaveId');
  });
});
