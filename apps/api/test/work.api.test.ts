// Phase 1B behaviour: PRD 1.1 to 1.5 acceptance criteria and the data rules around them.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AS, RUN, startApp, type TestContext } from './helpers';

let ctx: TestContext;
const as = (who: keyof typeof AS) => ctx.cookieFor(AS[who]);
const get = async (who: keyof typeof AS, url: string) => ctx.http().get(url).set('Cookie', await as(who));
const post = async (who: keyof typeof AS, url: string, body: object = {}) => ctx.http().post(url).set('Cookie', await as(who)).send(body);
const patch = async (who: keyof typeof AS, url: string, body: object) => ctx.http().patch(url).set('Cookie', await as(who)).send(body);

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());

/** A fresh client owned by pm@dev.local, so tests do not depend on each other. */
async function newClient(name: string, market = 'IN') {
  const res = await post('PM_OWN', '/api/v1/clients', { companyName: `${name} ${RUN}`, market, website: `https://www.${name.toLowerCase()}-${RUN}.example/` });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; website: string };
}

async function newProject(clientId: string, department: string, packageName?: string) {
  const pkg = packageName ? await ctx.prisma.package.findFirstOrThrow({ where: { name: packageName } }) : null;
  const res = await post('PM_OWN', '/api/v1/projects', { clientId, department, packageId: pkg?.id ?? null, startDate: '2026-11-02' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; stages: Array<{ id: string; name: string }>; tasks: Array<{ id: string; title: string }>; checklist: Array<{ id: string; stageId: string; done: boolean }> };
}

describe('PRD 1.1 department boards', () => {
  it('shows all 9 department pipelines with stages as columns', async () => {
    const pipelines = await get('PM_OWN', '/api/v1/pipelines');
    expect(pipelines.status).toBe(200);
    expect(new Set(pipelines.body.map((p: { department: string }) => p.department)).size).toBe(9);
    for (const dept of ['PRE_SALES', 'ONBOARDING', 'WEB_DEV', 'AMC', 'SPEED_AUDIT', 'SEO', 'GOOGLE_ADS', 'SOCIAL_MEDIA', 'GRAPHIC_DESIGN']) {
      const board = await get('PM_OWN', `/api/v1/boards/${dept}`);
      expect(board.status, dept).toBe(200);
      expect(board.body.columns.length, dept).toBeGreaterThan(1);
    }
  });

  it('filters by market and assignee, and scopes the Team Member to their projects', async () => {
    const all = await get('PM_OWN', '/api/v1/boards/SEO');
    const names = (b: { columns: Array<{ projects: Array<{ clientName: string }> }> }) => b.columns.flatMap((c) => c.projects.map((p) => p.clientName));
    expect(names(all.body)).toContain('Demo Co');
    expect(names((await get('PM_OWN', '/api/v1/boards/SEO?market=AU')).body)).not.toContain('Demo Co');
    const memberId = await ctx.userId(AS.TEAM_MEMBER);
    expect(names((await get('PM_OWN', `/api/v1/boards/SEO?assigneeId=${memberId}`)).body)).toContain('Demo Co');
    const memberBoard = await get('TEAM_MEMBER', '/api/v1/boards/SOCIAL_MEDIA');
    expect(names(memberBoard.body)).not.toContain('Example Pty Ltd');
  });

  it('moves a project between stages and logs the move; an incomplete checklist needs an override', async () => {
    const client = await newClient('Movers');
    const project = await newProject(client.id, 'WEB_DEV', 'Website build');
    const [, design] = project.stages;
    const blocked = await post('PM_OWN', `/api/v1/projects/${project.id}/move-stage`, { stageId: design!.id });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('CHECKLIST_INCOMPLETE');
    expect(blocked.body.error.message).toContain('Sitemap agreed');

    const moved = await post('PM_OWN', `/api/v1/projects/${project.id}/move-stage`, { stageId: design!.id, override: true });
    expect(moved.status).toBe(200);
    expect(moved.body.stageName).toBe('Design (Figma)');
    const log = await ctx.prisma.activityLog.findFirstOrThrow({ where: { projectId: project.id, kind: 'STAGE_MOVED' } });
    expect(log.from).toMatchObject({ stage: 'Requirements and sitemap' });
    expect(log.to).toMatchObject({ stage: 'Design (Figma)', override: true, skippedItems: ['Sitemap agreed', 'Content received'] });

    // Ticking the checklist removes the need for an override.
    const develop = project.stages.find((s) => s.name === 'Development')!;
    const back = await post('PM_OWN', `/api/v1/projects/${project.id}/move-stage`, { stageId: project.stages[0]!.id });
    for (const item of back.body.checklist.filter((c: { stageId: string }) => c.stageId === project.stages[0]!.id)) {
      expect((await patch('PM_OWN', `/api/v1/projects/${project.id}/checklist/${item.id}`, { done: true })).status).toBe(200);
    }
    expect((await post('PM_OWN', `/api/v1/projects/${project.id}/move-stage`, { stageId: develop.id })).status).toBe(200);
  });
});

describe('PRD 1.2 client 360', () => {
  it('shows SEO, Google Ads and AMC for Demo Co on one page, with the AMC renewal', async () => {
    const demo = await ctx.prisma.client.findFirstOrThrow({ where: { companyName: 'Demo Co' } });
    const res = await get('PM_OWN', `/api/v1/clients/${demo.id}/overview`);
    expect(res.status).toBe(200);
    const departments = res.body.projects.map((p: { department: string }) => p.department);
    expect(departments).toEqual(expect.arrayContaining(['SEO', 'GOOGLE_ADS', 'AMC']));
    expect(res.body.renewals.map((p: { department: string }) => p.department)).toContain('AMC');
    // Other suites add contacts to Demo Co; the seeded one keeps the plain label.
    expect(res.body.contacts.find((c: { label: string }) => c.label === 'Demo Co · Marketing contact').email).toBe('priya@demo.example.com');
    expect(res.body.client.contractValue).toBe('2417350');
  });

  it('gives a Team Member labels, not contact details, and no project values', async () => {
    const demo = await ctx.prisma.client.findFirstOrThrow({ where: { companyName: 'Demo Co' } });
    const res = await get('TEAM_MEMBER', `/api/v1/clients/${demo.id}/overview`);
    expect(res.status).toBe(200);
    expect(res.body.contacts.find((c: { label: string }) => c.label === 'Demo Co · Marketing contact').email).toBe('Demo Co · Marketing contact');
    expect(res.body.projects.every((p: Record<string, unknown>) => !('value' in p))).toBe(true);
    expect(res.body.openTasks.every((t: { assigneeName: string }) => t.assigneeName === 'Manoj Member')).toBe(true);
  });
});

describe('PRD 1.3 hand-off', () => {
  it('creates one project per service bought, carries files over and closes onboarding', async () => {
    const client = await newClient('Handoff');
    const onboarding = await newProject(client.id, 'ONBOARDING', 'Client onboarding');
    const upload = await ctx
      .http()
      .post(`/api/v1/projects/${onboarding.id}/attachments`)
      .set('Cookie', await as('PM_OWN'))
      .attach('file', Buffer.from('questionnaire answers'), 'questionnaire.txt');
    expect(upload.status).toBe(201);

    const seoPkg = await ctx.prisma.package.findFirstOrThrow({ where: { department: 'SEO', name: { startsWith: 'SEO Standard' } } });
    const res = await post('PM_OWN', `/api/v1/projects/${onboarding.id}/handoff`, {
      targets: [{ department: 'SEO', packageId: seoPkg.id }, { department: 'GOOGLE_ADS' }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.statusType).toBe('DONE');
    expect(res.body.stageName).toBe('Handed over');

    const children = await ctx.prisma.project.findMany({ where: { parentProjectId: onboarding.id }, include: { attachments: true, tasks: true } });
    expect(children.map((c) => c.department).sort()).toEqual(['GOOGLE_ADS', 'SEO']);
    for (const c of children) expect(c.attachments.map((a) => a.fileName)).toEqual(['questionnaire.txt']);
    expect(children.find((c) => c.department === 'SEO')!.tasks.length).toBe(11);
  });

  it('only allows the hand-offs in the client lifecycle', async () => {
    const client = await newClient('Wrongway');
    const web = await newProject(client.id, 'WEB_DEV');
    const bad = await post('PM_OWN', `/api/v1/projects/${web.id}/handoff`, { targets: [{ department: 'SEO' }] });
    expect(bad.status).toBe(400);
    const ok = await post('PM_OWN', `/api/v1/projects/${web.id}/handoff`, { targets: [{ department: 'AMC' }] });
    expect(ok.status).toBe(200);
  });
});

describe('PRD 1.4 templates', () => {
  it('creates the package setup tasks when a project starts', async () => {
    const client = await newClient('Templates');
    const project = await newProject(client.id, 'SOCIAL_MEDIA', 'Social 12 posts a month');
    expect(project.tasks.map((t) => t.title)).toEqual(['Collect brand kit and page access', 'Content strategy']);
  });
});

describe('PRD 1.5 tasks and the Team Member', () => {
  it('lets a Team Member update status and progress of their task, and nothing else', async () => {
    const task = await ctx.prisma.task.findFirstOrThrow({ where: { assignee: { email: AS.TEAM_MEMBER }, statusType: { not: 'DONE' } } });
    const ok = await patch('TEAM_MEMBER', `/api/v1/tasks/${task.id}`, { statusType: 'ACTIVE', progressPct: 60 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ statusType: 'ACTIVE', progressPct: 60, canEdit: ['statusType', 'progressPct'] });
    const no = await patch('TEAM_MEMBER', `/api/v1/tasks/${task.id}`, { title: 'Renamed' });
    expect(no.status).toBe(403);
    expect((await post('TEAM_MEMBER', '/api/v1/tasks', { projectId: task.projectId, title: 'Top level' })).status).toBe(403);
    const sub = await post('TEAM_MEMBER', '/api/v1/tasks', { projectId: task.projectId, parentTaskId: task.id, title: 'My subtask' });
    expect(sub.status).toBe(201);
    expect(sub.body.assigneeName).toBe('Manoj Member');
  });

  it("hides other people's tasks from a Team Member", async () => {
    const other = await ctx.prisma.task.findFirstOrThrow({ where: { assigneeId: null, project: { client: { companyName: 'Demo Co' } } } });
    expect((await get('TEAM_MEMBER', `/api/v1/tasks/${other.id}`)).status).toBe(404);
    expect((await patch('TEAM_MEMBER', `/api/v1/tasks/${other.id}`, { progressPct: 10 })).status).toBe(404);
  });

  it('keeps Team Leaders to their own team when assigning', async () => {
    const task = await ctx.prisma.task.findFirstOrThrow({ where: { project: { department: 'SEO', client: { companyName: 'Demo Co' } } } });
    const pm2 = await ctx.userId(AS.PM_OTHER);
    const res = await patch('TEAM_LEADER', `/api/v1/tasks/${task.id}`, { assigneeId: pm2 });
    expect(res.status).toBe(403);
    const member = await ctx.userId(AS.TEAM_MEMBER);
    expect((await patch('TEAM_LEADER', `/api/v1/tasks/${task.id}`, { assigneeId: member })).status).toBe(200);
  });

  it('closing a task stamps completion; reopening clears it', async () => {
    const client = await newClient('Closer');
    const project = await newProject(client.id, 'GRAPHIC_DESIGN', 'Design request');
    const id = project.tasks[0]!.id;
    const done = await patch('PM_OWN', `/api/v1/tasks/${id}`, { statusType: 'DONE' });
    expect(done.body).toMatchObject({ statusType: 'DONE', progressPct: 100 });
    expect(done.body.completedAt).toBeTruthy();
    const reopened = await patch('PM_OWN', `/api/v1/tasks/${id}`, { statusType: 'ACTIVE' });
    expect(reopened.body.completedAt).toBeNull();
  });

  it('scrubs client details out of descriptions and comments', async () => {
    const client = await newClient('Scrub');
    const project = await newProject(client.id, 'GRAPHIC_DESIGN');
    const created = await post('PM_OWN', '/api/v1/tasks', {
      projectId: project.id,
      title: 'Banner',
      description: 'Client said call +91 98200 12345 or mail priya@demo.example.com',
    });
    expect(created.body.description).toBe('Client said call [phone hidden] or mail [email hidden]');
    const c = await post('PM_OWN', `/api/v1/tasks/${created.body.id}/comments`, { body: 'login: demoadmin / Hunter2!' });
    expect(c.body.body).toBe('[credential hidden]');
    const stored = await ctx.prisma.taskComment.findUniqueOrThrow({ where: { id: c.body.id } });
    expect(stored.body).not.toContain('Hunter2');
  });

  it("lists the member's tasks for today and this week, by priority then due date", async () => {
    const week = await get('TEAM_MEMBER', '/api/v1/me/tasks?range=week');
    expect(week.status).toBe(200);
    expect(week.body.length).toBeGreaterThan(0);
    const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as Record<string, number>;
    const ranks = week.body.map((t: { priority: string }) => rank[t.priority]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    const today = await get('TEAM_MEMBER', '/api/v1/me/tasks?range=today');
    expect(today.body.length).toBeLessThanOrEqual(week.body.length);
  });
});

describe('attachments', () => {
  it('uploads to a task and downloads only for people who can see the task', async () => {
    const task = await ctx.prisma.task.findFirstOrThrow({ where: { assignee: { email: AS.TEAM_MEMBER } } });
    const up = await ctx
      .http()
      .post(`/api/v1/tasks/${task.id}/attachments`)
      .set('Cookie', await as('TEAM_MEMBER'))
      .attach('file', Buffer.from('<script>alert(1)</script>'), 'notes.html');
    expect(up.status).toBe(201);
    const dl = await get('TEAM_MEMBER', `/api/v1/attachments/${up.body.id}`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toContain('attachment');
    expect(dl.headers['content-type']).toBe('application/octet-stream');
    expect((await get('ACCOUNTS', `/api/v1/attachments/${up.body.id}`)).status).toBe(404);
    expect((await get('HR', `/api/v1/attachments/${up.body.id}`)).status).toBe(403);
  });
});

describe('contacts and credentials (TechSpec 5.3, 5.7)', () => {
  it('stores contact details encrypted and rejects a duplicate without naming the other client', async () => {
    const client = await newClient('Contacts');
    const res = await post('PM_OWN', `/api/v1/clients/${client.id}/contacts`, {
      role: 'BILLING',
      name: 'Bina Billing',
      email: `bina.${RUN}@contacts.example`,
      phone: `022 2345 ${String(parseInt(RUN, 16) % 10000).padStart(4, '0')}`,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ label: `Contacts ${RUN} · Billing contact`, email: `bina.${RUN}@contacts.example` });
    const row = await ctx.prisma.contact.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(Buffer.from(row.emailEnc!).toString('utf8')).not.toContain('bina');
    expect(row.emailHash).toMatch(/^[0-9a-f]{64}$/);

    const other = await newClient('Contacts2');
    const dup = await post('PM_OWN', `/api/v1/clients/${other.id}/contacts`, { role: 'MARKETING', name: 'Copy', email: `BINA.${RUN}@contacts.example` });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).not.toContain('Contacts');

    // Another PM sees the label in place of the details.
    const pm2 = await get('PM_OTHER', `/api/v1/clients/${client.id}/contacts`);
    expect(pm2.body[0]).toMatchObject({ email: `Contacts ${RUN} · Billing contact`, name: `Contacts ${RUN} · Billing contact` });
  });

  it('reveals a credential to its PM, to a granted member until the task closes, and logs every reveal', async () => {
    const client = await newClient('Vault');
    const cred = await post('PM_OWN', `/api/v1/clients/${client.id}/credentials`, {
      system: 'HOSTING',
      label: 'cPanel',
      username: 'vaultuser',
      password: 'S3cret!',
    });
    expect(cred.status).toBe(201);
    const project = await newProject(client.id, 'SPEED_AUDIT', 'Speed and responsiveness audit');
    const taskId = project.tasks[0]!.id;
    const member = await ctx.userId(AS.TEAM_MEMBER);
    await patch('PM_OWN', `/api/v1/tasks/${taskId}`, { assigneeId: member });

    const own = await post('PM_OWN', `/api/v1/credentials/${cred.body.id}/reveal`);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ username: 'vaultuser', password: 'S3cret!' });
    expect(own.headers['cache-control']).toBe('no-store');

    expect((await post('TEAM_MEMBER', `/api/v1/credentials/${cred.body.id}/reveal`)).status).toBe(404);
    const grant = await post('PM_OWN', `/api/v1/credentials/${cred.body.id}/grants`, { userId: member, taskId });
    expect(grant.status).toBe(201);
    const listed = await get('TEAM_MEMBER', `/api/v1/clients/${client.id}/credentials`);
    expect(listed.body.map((c: { label: string }) => c.label)).toEqual(['cPanel']);
    expect((await post('TEAM_MEMBER', `/api/v1/credentials/${cred.body.id}/reveal`)).body.password).toBe('S3cret!');

    await patch('TEAM_MEMBER', `/api/v1/tasks/${taskId}`, { statusType: 'DONE' });
    expect((await post('TEAM_MEMBER', `/api/v1/credentials/${cred.body.id}/reveal`)).status).toBe(404);

    const reveals = await ctx.prisma.auditLog.findMany({ where: { action: 'REVEAL_CREDENTIAL', entityId: cred.body.id } });
    expect(reveals).toHaveLength(2);
    const row = await ctx.prisma.credential.findUniqueOrThrow({ where: { id: cred.body.id } });
    expect(Buffer.from(row.secretEnc).toString('utf8')).not.toContain('S3cret');
  });
});

describe('project status', () => {
  it('needs a reason to stop, then treats the project as closed and archives it from boards', async () => {
    const client = await newClient('Stopper');
    const project = await newProject(client.id, 'GRAPHIC_DESIGN');
    expect((await post('PM_OTHER', `/api/v1/projects/${project.id}/stop`, { reason: 'CLIENT_PAUSED' })).status).toBe(404);
    expect((await post('PM_OWN', `/api/v1/projects/${project.id}/stop`, {})).status).toBe(400);
    const stopped = await post('PM_OWN', `/api/v1/projects/${project.id}/stop`, { reason: 'NON_PAYMENT', note: 'Invoice overdue' });
    expect(stopped.body).toMatchObject({ statusType: 'STOPPED', stopReason: 'NON_PAYMENT' });
    expect((await patch('PM_OWN', `/api/v1/projects/${project.id}`, { statusType: 'ACTIVE' })).status).toBe(422);
    const ids = (b: { columns: Array<{ projects: Array<{ id: string }> }> }) => b.columns.flatMap((c) => c.projects.map((p) => p.id));
    expect(ids((await get('PM_OWN', '/api/v1/boards/GRAPHIC_DESIGN')).body)).not.toContain(project.id);
    expect(ids((await get('PM_OWN', '/api/v1/boards/GRAPHIC_DESIGN?includeClosed=true')).body)).toContain(project.id);
  });

  it('requires a hold reason to put a project on hold', async () => {
    const client = await newClient('Holder');
    const project = await newProject(client.id, 'GRAPHIC_DESIGN');
    expect((await patch('PM_OWN', `/api/v1/projects/${project.id}`, { statusType: 'ON_HOLD' })).status).toBe(400);
    const held = await patch('PM_OWN', `/api/v1/projects/${project.id}`, { statusType: 'ON_HOLD', holdReason: 'Waiting for brand refresh' });
    expect(held.body).toMatchObject({ statusType: 'ON_HOLD', holdReason: 'Waiting for brand refresh' });
  });
});

describe('pipeline admin (PRD pipeline rules)', () => {
  const stages = (names: string[]) => [
    ...names.map((name) => ({ name, statusType: 'ACTIVE', phase: 'SETUP' })),
    { name: 'Delivered', statusType: 'DONE', phase: 'SETUP' },
  ];

  it("rejects a stage named after a person, and new versions leave live projects on theirs", async () => {
    const bad = await post('ADMIN', '/api/v1/pipelines', { department: 'GRAPHIC_DESIGN', stages: stages(['Brief', 'Mockup - Manoj']) });
    expect(bad.status).toBe(400);
    expect(bad.body.error.message).toContain('person');

    const client = await newClient('Versions');
    const first = await post('ADMIN', '/api/v1/pipelines', { department: 'GRAPHIC_DESIGN', stages: stages(['Brief', `Concepts ${RUN}`]) });
    expect(first.status).toBe(201);
    const before = await newProject(client.id, 'GRAPHIC_DESIGN');
    const second = await post('ADMIN', '/api/v1/pipelines', { department: 'GRAPHIC_DESIGN', stages: stages(['Brief', 'Design', 'Client feedback']) });
    expect(second.status).toBe(201);
    expect(second.body.version).toBe(first.body.version + 1);
    const after = await newProject(client.id, 'GRAPHIC_DESIGN');
    expect(after.stages.map((s) => s.name)).toEqual(['Brief', 'Design', 'Client feedback', 'Delivered']);
    const old = await get('PM_OWN', `/api/v1/projects/${before.id}`);
    expect(old.body.stages.map((s: { name: string }) => s.name)).toEqual(['Brief', `Concepts ${RUN}`, 'Delivered']);
  });
});
