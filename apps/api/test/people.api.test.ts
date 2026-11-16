// Phase 1C behaviour: PRD 1.6 (TL weekly planner) and PRD 3.1 to 3.4 (leave, impact alert,
// capacity, holidays). Runs on its own team, users and a far-future week, so reruns and the demo
// data cannot interfere.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AS, RUN, startApp, uniqueEmail, type TestContext } from './helpers';

let ctx: TestContext;
const WEEK = '2031-W10'; // Mon 3 Mar to Sun 9 Mar 2031
const LOCATION = 'QA'; // an office location of its own, for the holiday test

interface Crew {
  teamId: string;
  lead: string;
  ana: string;
  ben: string;
  outsider: string;
  projectId: string;
}
let crew: Crew;

const cookie = (email: string) => ctx.cookieFor(email);
const req = async (method: 'get' | 'post' | 'patch' | 'delete', email: string, url: string, body?: object) =>
  ctx.http()[method](url).set('Cookie', await cookie(email)).send(body);

const emails = {
  lead: uniqueEmail('planner.lead'),
  ana: uniqueEmail('planner.ana'),
  ben: uniqueEmail('planner.ben'),
  outsider: uniqueEmail('planner.outsider'),
};

async function task(title: string, fields: { assigneeId?: string | null; dueDate?: string; plannedDate?: string; estimateH?: number; teamId?: string }) {
  return ctx.prisma.task.create({
    data: {
      projectId: crew.projectId,
      title: `${title} ${RUN}`,
      type: 'DELIVERABLE',
      assigneeId: fields.assigneeId ?? null,
      teamId: fields.teamId ?? crew.teamId,
      dueDate: fields.dueDate ? new Date(`${fields.dueDate}T00:00:00.000Z`) : null,
      plannedDate: fields.plannedDate ? new Date(`${fields.plannedDate}T00:00:00.000Z`) : null,
      estimateH: fields.estimateH ?? null,
    },
  });
}

type MemberRow = { userId: string; availableH: number; assignedH: number; over: boolean; utilisationPct: number | null; unestimatedCount: number; days: Array<{ date: string; leave: string | null; holiday: string | null; availableH: number }> };
const member = (rows: MemberRow[], userId: string) => rows.find((m) => m.userId === userId)!;

beforeAll(async () => {
  ctx = await startApp();
  const p = ctx.prisma;
  const lead = await p.user.create({ data: { email: emails.lead, name: `Lena Lead ${RUN}`, roles: ['TEAM_LEADER'], weeklyCapacityH: 36, location: LOCATION } });
  const team = await p.team.create({ data: { name: `Planner ${RUN}`, department: 'SEO', leaderId: lead.id } });
  await p.user.update({ where: { id: lead.id }, data: { teamId: team.id } });
  const mk = (email: string, name: string) =>
    p.user.create({ data: { email, name: `${name} ${RUN}`, roles: ['TEAM_MEMBER'], teamId: team.id, weeklyCapacityH: 48, location: LOCATION } });
  const ana = await mk(emails.ana, 'Ana');
  const ben = await mk(emails.ben, 'Ben');
  const outsider = await p.user.create({ data: { email: emails.outsider, name: `Otto ${RUN}`, roles: ['TEAM_MEMBER'], weeklyCapacityH: 48 } });
  const pm = await p.user.findUniqueOrThrow({ where: { email: AS.PM_OWN } });
  const pipeline = await p.pipeline.findFirstOrThrow({ where: { department: 'SEO', active: true }, include: { stages: true } });
  const client = await p.client.create({ data: { companyName: `Planner Co ${RUN}`, market: 'IN', pmId: pm.id } });
  const project = await p.project.create({
    data: { clientId: client.id, department: 'SEO', pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, type: 'RETAINER', pmId: pm.id, teamId: team.id, startDate: new Date('2031-01-01T00:00:00Z') },
  });
  crew = { teamId: team.id, lead: lead.id, ana: ana.id, ben: ben.id, outsider: outsider.id, projectId: project.id };
  await p.holiday.deleteMany({ where: { location: LOCATION } });
});
afterAll(async () => {
  await ctx.prisma.holiday.deleteMany({ where: { location: LOCATION } });
  await ctx.close();
});

describe('PRD 3.1 leave records', () => {
  it('HR records leave; the reason and kind are for HR and Admin only', async () => {
    const res = await req('post', AS.HR, '/api/v1/leave', { userId: crew.ana, startDate: '2031-03-05', endDate: '2031-03-06', kind: 'SICK', reason: `Flu ${RUN}` });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ userId: crew.ana, startDate: '2031-03-05T00:00:00.000Z', days: 2, kind: 'SICK', reason: `Flu ${RUN}` });

    const stored = await ctx.prisma.leave.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(Buffer.from(stored.reasonEnc!).toString('utf8')).not.toContain('Flu');

    const asLead = await req('get', emails.lead, `/api/v1/leave?from=2031-03-01&userId=${crew.ana}`);
    expect(asLead.status).toBe(200);
    expect(asLead.body).toHaveLength(1);
    expect(asLead.body[0]).toMatchObject({ userName: `Ana ${RUN}`, days: 2 });
    expect(asLead.body[0]).not.toHaveProperty('reason');
    expect(asLead.body[0]).not.toHaveProperty('kind');

    const asAdmin = await req('get', AS.ADMIN, `/api/v1/leave?from=2031-03-01&userId=${crew.ana}`);
    expect(asAdmin.body[0].reason).toBe(`Flu ${RUN}`);
  });

  it('refuses overlapping leave, multi-day half days and inactive people', async () => {
    const clash = await req('post', AS.HR, '/api/v1/leave', { userId: crew.ana, startDate: '2031-03-06', endDate: '2031-03-07', kind: 'PLANNED' });
    expect(clash.status).toBe(409);
    const half = await req('post', AS.HR, '/api/v1/leave', { userId: crew.ben, startDate: '2031-03-03', endDate: '2031-03-04', halfDay: true, kind: 'PLANNED' });
    expect(half.status).toBe(400);
    const nobody = await req('post', AS.HR, '/api/v1/leave', { userId: 'no-such-user', startDate: '2031-03-03', endDate: '2031-03-03', kind: 'PLANNED' });
    expect(nobody.status).toBe(400);
  });

  it('a Team Member sees only their own leave; a TL only their team', async () => {
    const mine = await req('get', emails.ben, '/api/v1/leave?from=2031-01-01');
    expect(mine.body.every((l: { userId: string }) => l.userId === crew.ben)).toBe(true);
    const seoLead = await req('get', AS.TEAM_LEADER, `/api/v1/leave?from=2031-01-01&userId=${crew.ana}`);
    expect(seoLead.body).toEqual([]);
  });

  it('edits and deletes leave, checking the merged dates', async () => {
    const created = await req('post', AS.HR, '/api/v1/leave', { userId: crew.ben, startDate: '2031-04-07', endDate: '2031-04-07', halfDay: true, kind: 'PLANNED' });
    expect(created.status).toBe(201);
    const bad = await req('patch', AS.HR, `/api/v1/leave/${created.body.id}`, { endDate: '2031-04-08' });
    expect(bad.status).toBe(400);
    const moved = await req('patch', AS.HR, `/api/v1/leave/${created.body.id}`, { startDate: '2031-04-08', endDate: '2031-04-08' });
    expect(moved.status).toBe(200);
    expect(moved.body.startDate).toBe('2031-04-08T00:00:00.000Z');
    expect((await req('delete', AS.HR, `/api/v1/leave/${created.body.id}`)).status).toBe(200);
    expect(await ctx.prisma.leave.findUnique({ where: { id: created.body.id } })).toBeNull();
    const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: created.body.id }, orderBy: { at: 'asc' } });
    expect(audit.map((a) => a.action)).toEqual(['LEAVE_RECORDED', 'LEAVE_CHANGED', 'LEAVE_DELETED']);
  });
});

describe('PRD 3.3 capacity', () => {
  it('available hours drop with leave straight away, and over capacity is flagged', async () => {
    await task('Big audit', { assigneeId: crew.ana, dueDate: '2031-03-03', estimateH: 30 });
    await task('Unestimated', { assigneeId: crew.ana, dueDate: '2031-03-04' });
    const res = await req('get', emails.lead, `/api/v1/capacity?week=${WEEK}`);
    expect(res.status).toBe(200);
    expect(res.body.teams).toHaveLength(1);
    const ana = member(res.body.teams[0].members, crew.ana);
    // 48 h over 6 days = 8 h a day; 2 days of leave leaves 32 h; 30 h assigned.
    expect(ana).toMatchObject({ availableH: 32, assignedH: 30, utilisationPct: 94, over: false, unestimatedCount: 1 });
    expect(ana.days.map((d) => d.leave)).toEqual([null, null, 'FULL', 'FULL', null, null, null]);

    await task('Extra', { assigneeId: crew.ana, dueDate: '2031-03-07', estimateH: 6 });
    const after = member((await req('get', emails.lead, `/api/v1/capacity?week=${WEEK}`)).body.teams[0].members, crew.ana);
    expect(after).toMatchObject({ assignedH: 36, over: true, utilisationPct: 113 });
  });

  it('office holidays reduce capacity for everyone at that location', async () => {
    const add = await req('post', AS.HR, '/api/v1/holidays', { date: '2031-03-03', location: LOCATION, name: `Test holiday ${RUN}` });
    expect(add.status).toBe(201);
    expect((await req('post', AS.HR, '/api/v1/holidays', { date: '2031-03-03', location: LOCATION, name: 'Again' })).status).toBe(409);

    const res = await req('get', emails.lead, `/api/v1/capacity?week=${WEEK}`);
    const ben = member(res.body.teams[0].members, crew.ben);
    expect(ben).toMatchObject({ availableH: 40, holidayDays: 1 });
    expect(ben.days[0]).toMatchObject({ holiday: `Test holiday ${RUN}`, availableH: 0 });
    // Not counted twice for Ana: her leave days are not holidays.
    expect(member(res.body.teams[0].members, crew.ana).availableH).toBe(24);

    const listed = await req('get', AS.ACCOUNTS, `/api/v1/holidays?year=2031&location=${LOCATION}`);
    expect(listed.body.map((h: { name: string }) => h.name)).toEqual([`Test holiday ${RUN}`]);
    expect((await req('delete', AS.HR, `/api/v1/holidays/${add.body.id}`)).status).toBe(200);
  });

  it('scopes capacity: a member sees their own load, HR sees every team', async () => {
    const mine = await req('get', emails.ben, `/api/v1/capacity?week=${WEEK}`);
    expect(mine.body.teams.flatMap((t: { members: MemberRow[] }) => t.members.map((m) => m.userId))).toEqual([crew.ben]);
    const hr = await req('get', AS.HR, `/api/v1/capacity?week=${WEEK}`);
    expect(hr.body.teams.map((t: { teamName: string }) => t.teamName)).toEqual(expect.arrayContaining(['SEO', `Planner ${RUN}`]));
    expect(JSON.stringify(hr.body)).not.toContain('Planner Co');
    const seoLead = await req('get', AS.TEAM_LEADER, `/api/v1/capacity?week=${WEEK}&userId=${crew.ana}`);
    expect(seoLead.body.teams).toEqual([]);
    expect((await req('get', AS.PM_OWN, '/api/v1/capacity?week=2031-W99')).status).toBe(400);
  });
});

describe('PRD 1.6 weekly planner', () => {
  it("shows each member's hours against availability, the week's tasks and the backlog", async () => {
    await task('Backlog item', { teamId: crew.teamId });
    const res = await req('get', emails.lead, `/api/v1/planner/${crew.teamId}?week=${WEEK}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ teamName: `Planner ${RUN}`, week: WEEK, prevWeek: '2031-W09', nextWeek: '2031-W11' });
    expect(res.body.days).toHaveLength(7);
    expect(res.body.members.map((m: MemberRow) => m.userId)).toEqual([crew.lead, crew.ana, crew.ben]);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual(expect.arrayContaining([`Big audit ${RUN}`, `Extra ${RUN}`]));
    expect(res.body.backlog.map((t: { title: string }) => t.title)).toContain(`Backlog item ${RUN}`);
  });

  it('the TL rebalances a member on leave: move to a teammate and a day, with a logged change', async () => {
    const t = await task('Rebalance me', { assigneeId: crew.ana, dueDate: '2031-03-05', estimateH: 4 });
    const res = await req('post', emails.lead, `/api/v1/planner/${crew.teamId}/moves`, {
      week: WEEK,
      moves: [{ taskId: t.id, assigneeId: crew.ben, plannedDate: '2031-03-05', priority: 'HIGH' }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const moved = res.body.planner.tasks.find((x: { id: string }) => x.id === t.id);
    expect(moved).toMatchObject({ assigneeId: crew.ben, plannedDate: '2031-03-05T00:00:00.000Z', priority: 'HIGH' });
    expect(res.body.warnings).toEqual([]);
    const log = await ctx.prisma.activityLog.findFirstOrThrow({ where: { taskId: t.id, kind: 'TASK_PLANNED' } });
    expect(log.to).toMatchObject({ assigneeId: crew.ben, plannedDate: '2031-03-05', priority: 'HIGH' });
  });

  it('warns, without blocking, when work lands on someone over capacity or on leave that day', async () => {
    const t = await task('Heavy', { assigneeId: crew.ben, dueDate: '2031-03-08', estimateH: 50 });
    const res = await req('post', emails.lead, `/api/v1/planner/${crew.teamId}/moves`, {
      week: WEEK,
      moves: [{ taskId: t.id, assigneeId: crew.ana, plannedDate: '2031-03-06' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: crew.ana, reason: 'OVER_CAPACITY', week: WEEK }),
        expect.objectContaining({ userId: crew.ana, reason: 'ON_LEAVE', date: '2031-03-06' }),
      ]),
    );
    await ctx.prisma.task.update({ where: { id: t.id }, data: { statusType: 'DONE' } });
  });

  it('keeps moves inside the team and the plan', async () => {
    const t = await task('Stay home', { assigneeId: crew.ana, dueDate: '2031-03-03' });
    const outside = await req('post', emails.lead, `/api/v1/planner/${crew.teamId}/moves`, { moves: [{ taskId: t.id, assigneeId: crew.outsider }] });
    expect(outside.status).toBe(400);
    const foreign = await task('Not ours', { assigneeId: crew.outsider, dueDate: '2031-03-03', teamId: undefined });
    await ctx.prisma.task.update({ where: { id: foreign.id }, data: { teamId: null } });
    const notOnPlan = await req('post', AS.PM_OWN, `/api/v1/planner/${crew.teamId}/moves`, { moves: [{ taskId: foreign.id, plannedDate: '2031-03-04' }] });
    expect(notOnPlan.status).toBe(400);
    // Another team's TL cannot see this planner at all.
    expect((await req('get', AS.TEAM_LEADER, `/api/v1/planner/${crew.teamId}`)).status).toBe(404);
  });
});

describe('PRD 3.2 leave impact alert', () => {
  it('alerts the TL and the PM with the tasks due during the leave', async () => {
    await task('Due while away', { assigneeId: crew.ben, dueDate: '2031-03-12', estimateH: 3 });
    const res = await req('post', AS.HR, '/api/v1/leave', { userId: crew.ben, startDate: '2031-03-11', endDate: '2031-03-13', kind: 'PLANNED' });
    expect(res.status).toBe(201);

    const lead = await req('get', emails.lead, '/api/v1/notifications');
    const alert = lead.body.items.find((n: { link: string }) => n.link === `/leave/${res.body.id}`);
    expect(alert).toMatchObject({ kind: 'LEAVE_IMPACT', title: `Ben ${RUN} is on leave 11 Mar to 13 Mar`, readAt: null });
    expect(alert.body).toContain('1 task is due during the leave');
    expect(lead.body.unread).toBeGreaterThan(0);

    const pm = await req('get', AS.PM_OWN, '/api/v1/notifications');
    expect(pm.body.items.some((n: { link: string }) => n.link === `/leave/${res.body.id}`)).toBe(true);
    expect(JSON.stringify(pm.body)).not.toContain('PLANNED');

    // Read state is per user, and nobody can mark someone else's alert.
    expect((await req('post', AS.PM_OWN, `/api/v1/notifications/${alert.id}/read`)).status).toBe(404);
    expect((await req('post', emails.lead, `/api/v1/notifications/${alert.id}/read`)).status).toBe(201);
  });

  it('lists the affected tasks with a suggested teammate, and the TL reassigns in one call', async () => {
    const leave = await ctx.prisma.leave.findFirstOrThrow({ where: { userId: crew.ben, startDate: new Date('2031-03-11T00:00:00Z') } });
    const res = await req('get', emails.lead, `/api/v1/leave/${leave.id}/impact`);
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: { title: string }) => t.title)).toEqual([`Due while away ${RUN}`]);
    expect(res.body.candidates.map((c: { userId: string }) => c.userId).sort()).toEqual([crew.ana, crew.lead].sort());
    const taskId = res.body.tasks[0].id as string;
    const suggested = res.body.suggestions[taskId] as string;
    expect([crew.ana, crew.lead]).toContain(suggested);

    const reassign = await req('patch', emails.lead, `/api/v1/tasks/${taskId}`, { assigneeId: suggested });
    expect(reassign.status).toBe(200);
    expect((await req('get', emails.lead, `/api/v1/leave/${leave.id}/impact`)).body.tasks).toEqual([]);
  });

  it('hides another team’s leave from a TL, and the tasks from HR', async () => {
    const leave = await ctx.prisma.leave.findFirstOrThrow({ where: { userId: crew.ben, startDate: new Date('2031-03-11T00:00:00Z') } });
    expect((await req('get', AS.TEAM_LEADER, `/api/v1/leave/${leave.id}/impact`)).status).toBe(404);
    const hr = await req('get', AS.HR, `/api/v1/leave/${leave.id}/impact`);
    expect(hr.status).toBe(200);
    expect(hr.body).not.toHaveProperty('tasks');
  });
});
