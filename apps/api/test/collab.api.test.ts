// Phase 1F behaviour: PRD 5.1 to 5.5 (internal chat, mentions, notifications, settings, push and the
// email digest) and PRD 6.1 / 6.2 (role dashboards). Runs on its own team, people and clients, so
// reruns and the demo data cannot interfere.
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mentionToken } from '@opshub/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service';
import { AS, RUN, startApp, uniqueEmail, type TestContext } from './helpers';

let ctx: TestContext;
const drain = () => ctx.app.get(JobsService).drain();

const emails = {
  lead: uniqueEmail('chat.lead'),
  ana: uniqueEmail('chat.ana'),
  ben: uniqueEmail('chat.ben'),
  outsider: uniqueEmail('chat.outsider'),
  pm: uniqueEmail('chat.pm'),
};

interface Crew {
  teamId: string;
  lead: string;
  ana: string;
  ben: string;
  outsider: string;
  pm: string;
  clientId: string;
  projectId: string;
  /** A task on another PM's client, outside this team: nobody here but PMs and Admin can open it. */
  hiddenTaskId: string;
}
let crew: Crew;

const req = async (method: 'get' | 'post' | 'put' | 'delete', email: string, url: string, body?: object) =>
  ctx.http()[method](url).set('Cookie', await ctx.cookieFor(email)).send(body);

const isoDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

async function projectChannel(email: string) {
  const res = await req('get', email, '/api/v1/chat/channels');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as Array<{ id: string; kind: string; projectId: string | null; teamId: string | null; unread: number; lastMessagePreview: string | null }>).find((c) => c.projectId === crew.projectId);
}

beforeAll(async () => {
  ctx = await startApp();
  const p = ctx.prisma;
  const lead = await p.user.create({ data: { email: emails.lead, name: `Lara Lead ${RUN}`, roles: ['TEAM_LEADER'], weeklyCapacityH: 48 } });
  const team = await p.team.create({ data: { name: `Chat ${RUN}`, department: 'SEO', leaderId: lead.id } });
  await p.user.update({ where: { id: lead.id }, data: { teamId: team.id } });
  const mk = (email: string, name: string, teamId: string | null) => p.user.create({ data: { email, name: `${name} ${RUN}`, roles: ['TEAM_MEMBER'], teamId, weeklyCapacityH: 48 } });
  const ana = await mk(emails.ana, 'Ana', team.id);
  const ben = await mk(emails.ben, 'Ben', team.id);
  const outsider = await mk(emails.outsider, 'Otto', null);
  const pm = await p.user.create({ data: { email: emails.pm, name: `Pia PM ${RUN}`, roles: ['PM'], weeklyCapacityH: 48 } });
  const pm2 = await p.user.findUniqueOrThrow({ where: { email: AS.PM_OTHER } });
  const pipeline = await p.pipeline.findFirstOrThrow({ where: { department: 'SEO', active: true }, include: { stages: { orderBy: { order: 'asc' } } } });
  const stage = pipeline.stages[0]!;
  const client = await p.client.create({ data: { companyName: `Chat Co ${RUN}`, market: 'IN', pmId: pm.id } });
  const project = await p.project.create({
    data: { clientId: client.id, department: 'SEO', pipelineId: pipeline.id, stageId: stage.id, statusType: 'WAITING_ON_CLIENT', type: 'RETAINER', pmId: pm.id, teamId: team.id, startDate: new Date('2026-01-01T00:00:00Z') },
  });
  const otherClient = await p.client.create({ data: { companyName: `Hidden Co ${RUN}`, market: 'AU', pmId: pm2.id } });
  const otherProject = await p.project.create({
    data: { clientId: otherClient.id, department: 'SEO', pipelineId: pipeline.id, stageId: stage.id, type: 'RETAINER', pmId: pm2.id, startDate: new Date('2026-01-01T00:00:00Z') },
  });
  const hidden = await p.task.create({ data: { projectId: otherProject.id, title: `Secret launch plan ${RUN}`, type: 'DELIVERABLE' } });
  // The outsider works on one task of the project, so they are in its channel without being in the team.
  await p.task.create({ data: { projectId: project.id, title: `Outsider task ${RUN}`, type: 'DELIVERABLE', assigneeId: outsider.id } });
  // Overdue team work, for the TL dashboard.
  await p.task.create({ data: { projectId: project.id, title: `Overdue audit ${RUN}`, type: 'DELIVERABLE', assigneeId: ana.id, teamId: team.id, dueDate: new Date(`${isoDay(-3)}T00:00:00Z`) } });
  crew = { teamId: team.id, lead: lead.id, ana: ana.id, ben: ben.id, outsider: outsider.id, pm: pm.id, clientId: client.id, projectId: project.id, hiddenTaskId: hidden.id };
  await rm(resolve('.local-mail-test'), { recursive: true, force: true });
});
afterAll(() => ctx.close());

describe('PRD 5.1 channels', () => {
  it('a project channel exists for its PM, team, leader and assignees, and nobody else', async () => {
    for (const email of [emails.pm, emails.lead, emails.ana, emails.ben, emails.outsider]) {
      expect(await projectChannel(email), email).toBeTruthy();
    }
    // Admin has no special access to channels; Accounts, HR and another PM are not members.
    for (const email of [AS.ADMIN, AS.PM_OTHER, AS.ACCOUNTS, AS.HR, AS.TEAM_MEMBER]) {
      expect(await projectChannel(email), email).toBeUndefined();
    }
    const id = (await projectChannel(emails.ana))!.id;
    for (const email of [AS.ADMIN, AS.ACCOUNTS, AS.HR, AS.PM_OTHER]) {
      expect((await req('get', email, `/api/v1/chat/channels/${id}/messages`)).status, email).toBe(404);
      expect((await req('post', email, `/api/v1/chat/channels/${id}/messages`, { body: 'hello' })).status, email).toBe(404);
    }
  });

  it('team members see their team channel', async () => {
    const res = await req('get', emails.ben, '/api/v1/chat/channels');
    expect(res.body.some((c: { kind: string; teamId: string }) => c.kind === 'TEAM' && c.teamId === crew.teamId)).toBe(true);
    const outsider = await req('get', emails.outsider, '/api/v1/chat/channels');
    expect(outsider.body.some((c: { teamId: string }) => c.teamId === crew.teamId)).toBe(false);
  });
});

describe('PRD 5.2 mentions and PRD data protection', () => {
  let channelId: string;
  let messageId: string;

  it('masks pasted client details and notifies the mentioned member without the message text', async () => {
    channelId = (await projectChannel(emails.ana))!.id;
    const body = [
      `${mentionToken('user', crew.ben, 'Ben')} can you take this? ${mentionToken('task', crew.hiddenTaskId, 'Secret launch plan')}`,
      'Client says call +61 412 345 678 or mail ops@chat-client.example.com',
      'Password: Swordfish99',
    ].join('\n');
    const res = await req('post', emails.ana, `/api/v1/chat/channels/${channelId}/messages`, { body });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    messageId = res.body.id;
    const stored = await ctx.prisma.chatMessage.findUniqueOrThrow({ where: { id: messageId } });
    for (const leak of ['412 345 678', 'ops@chat-client.example.com', 'Swordfish99']) expect(stored.body).not.toContain(leak);
    expect(stored.body).toContain('[phone hidden]');
    expect(stored.body).toContain('[email hidden]');
    expect(stored.body).toContain('[credential hidden]');

    await drain();
    const note = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: crew.ben, kind: 'MENTION', link: `/chat/${channelId}` } });
    expect(note.title).toBe(`Ana ${RUN} mentioned you in Chat Co ${RUN} · SEO`);
    expect(note.body).toBe('Open the chat to reply.');
    expect(note.category).toBe('MENTION');
    // The writer is never notified about their own message.
    expect(await ctx.prisma.notification.count({ where: { userId: crew.ana, kind: 'MENTION', link: `/chat/${channelId}` } })).toBe(0);
  });

  it('re-resolves mention labels for each reader: "no access" where they cannot open the record', async () => {
    const asBen = await req('get', emails.ben, `/api/v1/chat/channels/${channelId}/messages`);
    const msg = asBen.body.messages.find((m: { id: string }) => m.id === messageId);
    expect(msg.body).toContain(`@[Ben ${RUN}](user:${crew.ben})`);
    expect(msg.body).toContain(`#[no access](task:${crew.hiddenTaskId})`);
    expect(msg.body).not.toContain('Secret launch plan');
    expect(msg.mentions).toContainEqual({ type: 'task', id: crew.hiddenTaskId, label: null, href: null });

    const asPm = await req('get', emails.pm, `/api/v1/chat/channels/${channelId}/messages`);
    const pmMsg = asPm.body.messages.find((m: { id: string }) => m.id === messageId);
    expect(pmMsg.body).toContain(`#[Secret launch plan ${RUN}](task:${crew.hiddenTaskId})`);

    // The channel list preview follows the same rule.
    expect((await projectChannel(emails.ben))!.lastMessagePreview).not.toContain('Secret launch plan');
  });

  it('a label typed into a token never reaches readers', async () => {
    const res = await req('post', emails.ana, `/api/v1/chat/channels/${channelId}/messages`, { body: `${mentionToken('client', crew.clientId, 'priya@demo.example.com')} update` });
    expect(res.status).toBe(201);
    expect(res.body.body).toBe(`#[Chat Co ${RUN}](client:${crew.clientId}) update`);
    const asOutsider = await req('get', emails.outsider, `/api/v1/chat/channels/${channelId}/messages`);
    expect(JSON.stringify(asOutsider.body)).not.toContain('priya@demo.example.com');
  });

  it('typeahead offers only records the writer can open', async () => {
    const asMember = await req('get', emails.ana, `/api/v1/chat/mention-options?q=${encodeURIComponent(`Secret launch plan ${RUN}`)}`);
    expect(asMember.body).toEqual([]);
    const asPm = await req('get', AS.PM_OWN, `/api/v1/chat/mention-options?q=${encodeURIComponent(`Secret launch plan ${RUN}`)}`);
    expect(asPm.body).toEqual([{ type: 'task', id: crew.hiddenTaskId, label: `Secret launch plan ${RUN}`, hint: 'Task' }]);
  });

  it('unread counts per person clear when they read the channel', async () => {
    const before = (await projectChannel(emails.ben))!;
    expect(before.unread).toBeGreaterThanOrEqual(2);
    expect((await req('post', emails.ben, `/api/v1/chat/channels/${channelId}/read`)).status).toBe(201);
    expect((await projectChannel(emails.ben))!.unread).toBe(0);
    expect((await projectChannel(emails.ana))!.unread).toBe(0);
  });
});

describe('PRD 5.1 direct messages', () => {
  it('only the two people can read a direct message, Admin included', async () => {
    const open = await req('post', emails.ana, '/api/v1/chat/direct', { userId: crew.ben });
    expect(open.status, JSON.stringify(open.body)).toBe(201);
    expect(open.body).toMatchObject({ kind: 'DIRECT', name: `Ben ${RUN}`, otherUserId: crew.ben });
    const again = await req('post', emails.ben, '/api/v1/chat/direct', { userId: crew.ana });
    expect(again.body.id).toBe(open.body.id);
    expect((await req('post', emails.ana, `/api/v1/chat/channels/${open.body.id}/messages`, { body: 'Lunch at 1?' })).status).toBe(201);
    expect((await req('get', emails.ben, `/api/v1/chat/channels/${open.body.id}/messages`)).body.messages.map((m: { body: string }) => m.body)).toEqual(['Lunch at 1?']);
    for (const email of [AS.ADMIN, emails.lead, emails.outsider]) {
      expect((await req('get', email, `/api/v1/chat/channels/${open.body.id}/messages`)).status, email).toBe(404);
    }
    expect((await req('post', emails.ana, '/api/v1/chat/direct', { userId: crew.ana })).status).toBe(400);
  });
});

describe('PRD 5.3 notifications and settings', () => {
  it('shows defaults, saves choices per category, and keeps them per person', async () => {
    const res = await req('get', emails.ana, '/api/v1/notifications/settings');
    expect(res.status).toBe(200);
    expect(res.body.preferences).toHaveLength(7);
    expect(res.body.preferences.find((p: { category: string }) => p.category === 'MENTION')).toEqual({ category: 'MENTION', label: 'Mentions in chat', email: true, push: true });
    expect(res.body.pushDevices).toBe(0);
    const saved = await req('put', emails.ana, '/api/v1/notifications/settings', { preferences: [{ category: 'MENTION', email: false, push: false }] });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.preferences.find((p: { category: string }) => p.category === 'MENTION')).toMatchObject({ email: false, push: false });
    const ben = await req('get', emails.ben, '/api/v1/notifications/settings');
    expect(ben.body.preferences.find((p: { category: string }) => p.category === 'MENTION')).toMatchObject({ email: true, push: true });
    expect((await req('put', emails.ana, '/api/v1/notifications/settings', { preferences: [{ category: 'NOPE', email: true, push: true }] })).status).toBe(400);
  });

  it('pushes to registered devices, respects the push setting, and drops devices that are gone', async () => {
    const live = `https://push.example.com/live-${RUN}`;
    const gone = `https://push.example.com/gone-${RUN}`;
    for (const endpoint of [live, gone]) {
      expect((await req('post', emails.ben, '/api/v1/notifications/push-subscriptions', { endpoint, keys: { p256dh: 'BKey', auth: 'auth' } })).status).toBe(201);
    }
    expect((await req('get', emails.ben, '/api/v1/notifications/settings')).body.pushDevices).toBe(2);
    expect((await req('post', emails.ben, '/api/v1/notifications/test')).status).toBe(201);
    await drain();
    const note = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: crew.ben, kind: 'TEST' }, orderBy: { createdAt: 'desc' } });
    expect(note.pushedAt).not.toBeNull();
    expect(await ctx.prisma.pushSubscription.findUnique({ where: { endpoint: gone } })).toBeNull();
    expect((await ctx.prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: live } })).lastUsedAt).not.toBeNull();

    // Someone else cannot remove Ben's device.
    await req('delete', emails.ana, '/api/v1/notifications/push-subscriptions', { endpoint: live });
    expect(await ctx.prisma.pushSubscription.findUnique({ where: { endpoint: live } })).not.toBeNull();
    await req('delete', emails.ben, '/api/v1/notifications/push-subscriptions', { endpoint: live });
    expect(await ctx.prisma.pushSubscription.findUnique({ where: { endpoint: live } })).toBeNull();
  });

  it('tells a person when a task is assigned to them', async () => {
    const res = await req('post', emails.pm, '/api/v1/tasks', { projectId: crew.projectId, title: `Write meta tags ${RUN}`, type: 'DELIVERABLE', assigneeId: crew.ben, dueDate: '2031-05-02' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const note = await ctx.prisma.notification.findFirstOrThrow({ where: { userId: crew.ben, dedupeKey: `assigned:${res.body.id}` } });
    expect(note.title).toContain(`assigned you "Write meta tags ${RUN}"`);
    expect(note.body).toBe(`Chat Co ${RUN} · SEO, due 2031-05-02`);
    expect(note.link).toBe(`/tasks/${res.body.id}`);
    // Reassigning tells the new assignee.
    const moved = await ctx.http().patch(`/api/v1/tasks/${res.body.id}`).set('Cookie', await ctx.cookieFor(emails.pm)).send({ assigneeId: crew.ana });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(await ctx.prisma.notification.count({ where: { userId: crew.ana, dedupeKey: `assigned:${res.body.id}` } })).toBe(1);
  });

  it("alerts the client's PM about a new client message, with labels and masked text only", async () => {
    const pmId = await ctx.userId(AS.PM_OWN);
    const res = await req('post', AS.PM_OWN, '/api/v1/dev/inbox/simulate', { channel: 'EMAIL', threadKey: 'demo-thread-banner', body: `Also call me on +91 98200 12345 (${RUN})` });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await drain();
    const note = await ctx.prisma.notification.findUniqueOrThrow({ where: { userId_dedupeKey: { userId: pmId, dedupeKey: 'client-msg:demo-thread-banner' } } });
    expect(note.kind).toBe('CLIENT_MESSAGE');
    expect(note.title).toMatch(/^New email from Demo Co · /);
    expect(`${note.title} ${note.body}`).not.toMatch(/priya|98200|demo\.example\.com/i);
    expect(note.link).toBe('/inbox/demo-thread-banner');
  });

  it('the digest emails unread notifications once, by category, honouring email choices', async () => {
    const before = await req('get', emails.ben, '/api/v1/dev/mail');
    expect(before.body).toEqual({ mode: 'file', items: [], sent: null });
    const res = await req('post', emails.ben, '/api/v1/dev/mail/digest');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.sent).toBeGreaterThanOrEqual(1);
    const mail = res.body.items[0];
    expect(mail.subject).toMatch(/^Ops Hub: \d+ updates? for you$/);
    expect(mail.text).toContain('Mentions in chat');
    expect(mail.text).toContain('Tasks assigned to me');
    expect(mail.text).toContain('http://localhost:3000/settings/notifications');
    // Ana turned email off for mentions; her mention-free digest never lists them.
    const ana = await req('get', emails.ana, '/api/v1/dev/mail');
    expect(JSON.stringify(ana.body.items)).not.toContain('Mentions in chat');
    // A second run sends nothing new to Ben.
    const again = await req('post', emails.ben, '/api/v1/dev/mail/digest');
    expect(again.body.items).toHaveLength(res.body.items.length);
    // Ben reads only his own outbox.
    expect(JSON.stringify(ana.body)).not.toContain(`Ben ${RUN}`);
  });
});

describe('PRD 6.1 / 6.2 role dashboards', () => {
  it('Admin overview counts the whole business', async () => {
    const res = await req('get', AS.ADMIN, '/api/v1/dashboards/admin');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.activeClients).toBeGreaterThan(0);
    expect(res.body.activeProjects).toBeGreaterThan(0);
    const seo = res.body.byDepartment.find((d: { department: string }) => d.department === 'SEO');
    expect(seo.total).toBe(seo.stages.reduce((n: number, s: { count: number }) => n + s.count, 0));
    expect(res.body.teams.some((t: { teamId: string }) => t.teamId === crew.teamId)).toBe(true);
    expect(res.body.billingPending.every((b: { currency: string; amount: string }) => /^[A-Z]{3}$/.test(b.currency) && /^\d+(\.\d+)?$/.test(b.amount))).toBe(true);
  });

  it("a PM's dashboard holds their own clients only", async () => {
    const mine = await req('get', emails.pm, '/api/v1/dashboards/pm');
    expect(mine.status).toBe(200);
    expect(mine.body.clients).toBe(1);
    expect(mine.body.waitingOnClient.map((p: { id: string }) => p.id)).toEqual([crew.projectId]);
    expect(mine.body.projectsByStatus).toEqual([{ key: 'WAITING_ON_CLIENT', label: 'WAITING_ON_CLIENT', count: 1 }]);
    const other = await req('get', AS.PM_OTHER, '/api/v1/dashboards/pm');
    expect(other.body.waitingOnClient.map((p: { id: string }) => p.id)).not.toContain(crew.projectId);
    expect(JSON.stringify(other.body)).not.toContain(`Chat Co ${RUN}`);
  });

  it("a TL's dashboard shows their team's load and overdue work", async () => {
    const res = await req('get', emails.lead, '/api/v1/dashboards/tl');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.teams.map((t: { teamId: string }) => t.teamId)).toEqual([crew.teamId]);
    expect(res.body.overdue.map((t: { title: string }) => t.title)).toContain(`Overdue audit ${RUN}`);
    expect(res.body.week).toHaveLength(7);
    const seoLead = await req('get', AS.TEAM_LEADER, '/api/v1/dashboards/tl');
    expect(seoLead.body.teams.map((t: { teamId: string }) => t.teamId)).not.toContain(crew.teamId);
    expect(JSON.stringify(seoLead.body.overdue)).not.toContain(`Overdue audit ${RUN}`);
  });

  it("a member's dashboard is their own work and unread counts", async () => {
    const res = await req('get', emails.ana, '/api/v1/dashboards/me');
    expect(res.status).toBe(200);
    expect(res.body.overdue).toBe(1);
    expect(res.body.unreadChats).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.unreadAlerts).toBe('number');
  });

  it('Accounts sees billing totals by status, never project values', async () => {
    const res = await req('get', AS.ACCOUNTS, '/api/v1/dashboards/accounts');
    expect(res.status).toBe(200);
    expect(res.body.byStatus.map((s: { status: string }) => s.status)).toEqual(['REQUESTED', 'INVOICED', 'PAID', 'CANCELLED']);
    expect(JSON.stringify(res.body)).not.toMatch(/"value"|contractValue/);
  });

  it('HR sees who is out and upcoming holidays, with no client data', async () => {
    const leave = await req('post', AS.HR, '/api/v1/leave', { userId: crew.ben, startDate: isoDay(0), endDate: isoDay(0), kind: 'PLANNED', reason: `Errand ${RUN}` });
    expect(leave.status, JSON.stringify(leave.body)).toBe(201);
    const res = await req('get', AS.HR, '/api/v1/dashboards/hr');
    expect(res.status).toBe(200);
    expect(res.body.outThisWeek.map((l: { userId: string }) => l.userId)).toContain(crew.ben);
    expect(JSON.stringify(res.body)).not.toContain('Chat Co');
  });
});
