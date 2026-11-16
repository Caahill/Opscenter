import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AS, startApp, uniqueEmail, type TestContext } from './helpers';

let ctx: TestContext;
let admin: string;
beforeAll(async () => {
  ctx = await startApp();
  admin = await ctx.cookieFor(AS.ADMIN);
});
afterAll(() => ctx.close());

const newUser = (email: string) => ({ email, name: 'Test Person', roles: ['TEAM_MEMBER'] });

describe('users admin (PRD 7.1)', () => {
  it('invites a user, rejects duplicates and records the creation', async () => {
    const created = await ctx.http().post('/api/v1/users').set('Cookie', admin).send(newUser(uniqueEmail('new.one'))).expect(201);
    expect(created.body).toMatchObject({ email: uniqueEmail('new.one'), roles: ['TEAM_MEMBER'], active: true });
    expect(created.body.weeklyCapacityH).toBe('40');

    const dup = await ctx.http().post('/api/v1/users').set('Cookie', admin).send(newUser(uniqueEmail('new.one').toUpperCase())).expect(409);
    expect(dup.body.error.code).toBe('CONFLICT');

    expect(await ctx.prisma.auditLog.count({ where: { action: 'USER_CREATED', entityId: created.body.id } })).toBe(1);
  });

  it('logs role changes', async () => {
    const u = await ctx.http().post('/api/v1/users').set('Cookie', admin).send(newUser(uniqueEmail('promote.me'))).expect(201);
    await ctx
      .http()
      .patch(`/api/v1/users/${u.body.id}`)
      .set('Cookie', admin)
      .send({ roles: ['TEAM_MEMBER', 'TEAM_LEADER'] })
      .expect(200);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'ROLE_CHANGE', entityId: u.body.id } });
    expect(log.meta).toEqual({ from: ['TEAM_MEMBER'], to: ['TEAM_MEMBER', 'TEAM_LEADER'] });
  });

  it('deactivating a user ends their sessions, reassigns open tasks to the TL and revokes grants', async () => {
    const seo = await ctx.prisma.team.findFirstOrThrow({ where: { department: 'SEO', name: 'SEO' } });
    const leaver = await ctx.prisma.user.create({
      data: { email: uniqueEmail('leaver'), name: 'Leaver', roles: ['TEAM_MEMBER'], teamId: seo.id },
    });
    const pmId = await ctx.userId(AS.PM_OWN);
    const client = await ctx.prisma.client.create({ data: { companyName: 'Example Pty Ltd', market: 'AU', pmId } });
    const pipeline = await ctx.prisma.pipeline.create({
      data: { department: 'SEO', version: 1000 + Math.floor(Math.random() * 1_000_000), active: false, stages: { create: { name: 'Keyword research', order: 1, statusType: 'ACTIVE', phase: 'SETUP', checklist: [] } } },
      include: { stages: true },
    });
    const project = await ctx.prisma.project.create({
      data: { clientId: client.id, department: 'SEO', pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, type: 'RETAINER', pmId },
    });
    const open = await ctx.prisma.task.create({
      data: { projectId: project.id, title: 'Keyword list', type: 'DELIVERABLE', assigneeId: leaver.id, statusType: 'ACTIVE' },
    });
    const done = await ctx.prisma.task.create({
      data: { projectId: project.id, title: 'Old report', type: 'REPORT', assigneeId: leaver.id, statusType: 'DONE' },
    });
    const cred = await ctx.prisma.credential.create({
      data: { clientId: client.id, system: 'HOSTING', label: 'Hosting', secretEnc: new Uint8Array([1]), keyId: 'local:vault' },
    });
    await ctx.prisma.credentialGrant.create({
      data: { credentialId: cred.id, userId: leaver.id, taskId: open.id, expiresAt: new Date(Date.now() + 86_400_000), grantedById: pmId },
    });

    const leaverCookie = await ctx.cookieFor(uniqueEmail('leaver'));
    await ctx.http().get('/api/v1/me').set('Cookie', leaverCookie).expect(200);

    await ctx.http().patch(`/api/v1/users/${leaver.id}`).set('Cookie', admin).send({ active: false }).expect(200);

    await ctx.http().get('/api/v1/me').set('Cookie', leaverCookie).expect(401);
    expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: open.id } })).assigneeId).toBe(seo.leaderId);
    expect((await ctx.prisma.task.findUniqueOrThrow({ where: { id: done.id } })).assigneeId).toBe(leaver.id);
    expect(await ctx.prisma.credentialGrant.count({ where: { userId: leaver.id, revokedAt: null } })).toBe(0);
    const log = await ctx.prisma.auditLog.findFirstOrThrow({ where: { action: 'USER_DEACTIVATED', entityId: leaver.id } });
    expect(log.meta).toMatchObject({ tasksReassigned: 1, grantsRevoked: 1 });
  });

  it('stops an Admin locking themselves out', async () => {
    const id = await ctx.userId(AS.ADMIN);
    const a = await ctx.http().patch(`/api/v1/users/${id}`).set('Cookie', admin).send({ active: false }).expect(422);
    expect(a.body.error.code).toBe('INVALID_STATE');
    await ctx.http().patch(`/api/v1/users/${id}`).set('Cookie', admin).send({ roles: ['PM'] }).expect(422);
  });

  it('hides inactive users unless asked', async () => {
    const all = await ctx.http().get('/api/v1/users?includeInactive=true').set('Cookie', admin).expect(200);
    const active = await ctx.http().get('/api/v1/users').set('Cookie', admin).expect(200);
    expect(all.body.length).toBeGreaterThan(active.body.length);
  });
});

describe('teams', () => {
  it('requires the leader to hold the Team Leader role', async () => {
    const memberId = await ctx.userId(AS.TEAM_MEMBER);
    const res = await ctx
      .http()
      .post('/api/v1/teams')
      .set('Cookie', admin)
      .send({ name: 'Content', department: 'SEO', leaderId: memberId })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');

    const ok = await ctx
      .http()
      .post('/api/v1/teams')
      .set('Cookie', admin)
      .send({ name: 'Content', department: 'SEO', leaderId: await ctx.userId(AS.TEAM_LEADER) })
      .expect(201);
    expect(ok.body).toMatchObject({ name: 'Content', department: 'SEO', memberCount: 0 });
  });
});

describe('audit log', () => {
  it('pages newest first with actor names', async () => {
    const first = await ctx.http().get('/api/v1/audit-log?limit=2').set('Cookie', admin).expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.items[0].actorName).toBeTruthy();
    expect(first.body.nextCursor).toBeTruthy();
    const next = await ctx.http().get(`/api/v1/audit-log?limit=2&cursor=${first.body.nextCursor}`).set('Cookie', admin).expect(200);
    expect(next.body.items[0].id).not.toBe(first.body.items[0].id);
  });
});
