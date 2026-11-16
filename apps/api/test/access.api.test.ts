// Every route x every role: allowed, refused, or hidden by row scope (TechSpec 11, AGENTS.md
// "Tests you must write"). Hidden means the role passes the action check but the record is
// outside its scope, so the API answers 404 without revealing that it exists.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AS, startApp, type TestContext } from './helpers';

type Who = keyof typeof AS;
const EVERYONE: Who[] = ['ADMIN', 'PM_OWN', 'PM_OTHER', 'TEAM_LEADER', 'TEAM_MEMBER', 'ACCOUNTS', 'HR'];
const ADMIN_ONLY: Who[] = ['ADMIN'];
const NOT_HR: Who[] = EVERYONE.filter((w) => w !== 'HR');
const PMS: Who[] = ['ADMIN', 'PM_OWN', 'PM_OTHER'];
const DELIVERY: Who[] = ['ADMIN', 'PM_OWN', 'PM_OTHER', 'TEAM_LEADER', 'TEAM_MEMBER'];

interface RouteCase {
  method: 'get' | 'post' | 'patch' | 'put';
  path: string | ((ctx: TestContext) => Promise<string>);
  /** Past the guard: 200, 201, or 400 for an empty body. */
  allowed: Who[];
  /** Past the guard but outside the role's row scope: 404. Everyone else: 403. */
  hidden?: Who[];
  body?: object;
}

const memberPath = async (ctx: TestContext) => `/api/v1/users/${await ctx.userId(AS.TEAM_MEMBER)}`;
const teamPath = async (ctx: TestContext) =>
  `/api/v1/teams/${(await ctx.prisma.team.findFirstOrThrow({ where: { department: 'SEO', name: 'SEO' } })).id}`;
const demoClient = async (ctx: TestContext) => (await ctx.prisma.client.findFirstOrThrow({ where: { companyName: 'Demo Co' } })).id;
const demoSeo = async (ctx: TestContext) =>
  (await ctx.prisma.project.findFirstOrThrow({ where: { department: 'SEO', client: { companyName: 'Demo Co' } } })).id;
const demoCredential = async (ctx: TestContext) =>
  (await ctx.prisma.credential.findFirstOrThrow({ where: { client: { companyName: 'Demo Co' } } })).id;
const PLANNERS: Who[] = ['ADMIN', 'PM_OWN', 'PM_OTHER', 'TEAM_LEADER'];
const NOT_ACCOUNTS: Who[] = EVERYONE.filter((w) => w !== 'ACCOUNTS');
const PEOPLE_ADMIN: Who[] = ['ADMIN', 'HR'];
const teamOf = (department: 'SEO' | 'WEB_DEV', name: string) => async (ctx: TestContext) =>
  (await ctx.prisma.team.findFirstOrThrow({ where: { department, name } })).id;
// The demo leave belongs to the Team Member (apps/api/src/seed/demo-seed.ts).
const demoLeave = async (ctx: TestContext) =>
  (await ctx.prisma.leave.findFirstOrThrow({ where: { user: { email: AS.TEAM_MEMBER } }, orderBy: { createdAt: 'asc' } })).id;
const bannerMessage = async (ctx: TestContext) => (await ctx.prisma.communication.findUniqueOrThrow({ where: { externalId: 'demo-msg-banner' } })).id;
const unmatchedMessage = async (ctx: TestContext) => (await ctx.prisma.communication.findUniqueOrThrow({ where: { externalId: 'demo-msg-unmatched' } })).id;
const demoBilling = async (ctx: TestContext) =>
  (await ctx.prisma.billingRequest.findFirstOrThrow({ where: { client: { companyName: 'Demo Co' }, reason: 'ADDITIONAL_TASK' }, orderBy: { createdAt: 'asc' } })).id;
// Flagging is open to anyone who can see the task; the over-long note keeps this check harmless (400).
const DELIVERABLE_FLAGGERS: Who[] = ['ADMIN', 'PM_OWN', 'PM_OTHER', 'TEAM_LEADER', 'TEAM_MEMBER'];
const BILLING: Who[] = ['ADMIN', 'PM_OWN', 'PM_OTHER', 'ACCOUNTS'];
const memberTask = async (ctx: TestContext) =>
  (await ctx.prisma.task.findFirstOrThrow({ where: { assignee: { email: AS.TEAM_MEMBER }, project: { client: { companyName: 'Demo Co' } } } })).id;

const ROUTES: RouteCase[] = [
  { method: 'get', path: '/api/v1/me', allowed: EVERYONE },
  { method: 'get', path: '/api/v1/users', allowed: EVERYONE },
  { method: 'post', path: '/api/v1/users', allowed: ADMIN_ONLY, body: {} },
  { method: 'patch', path: memberPath, allowed: ADMIN_ONLY, body: {} },
  { method: 'get', path: '/api/v1/teams', allowed: EVERYONE },
  { method: 'post', path: '/api/v1/teams', allowed: ADMIN_ONLY, body: {} },
  { method: 'patch', path: teamPath, allowed: ADMIN_ONLY, body: {} },
  { method: 'get', path: '/api/v1/audit-log', allowed: ADMIN_ONLY },
  { method: 'get', path: '/api/v1/dev/policy-preview', allowed: EVERYONE },

  // Clients: Accounts reaches clients only through billing requests, and Demo Co has one (seed/billing-demo.ts); HR never.
  { method: 'get', path: '/api/v1/clients', allowed: NOT_HR },
  { method: 'post', path: '/api/v1/clients', allowed: PMS, body: {} },
  { method: 'get', path: async (c) => `/api/v1/clients/${await demoClient(c)}`, allowed: NOT_HR },
  { method: 'get', path: async (c) => `/api/v1/clients/${await demoClient(c)}/overview`, allowed: NOT_HR },
  // Schema-valid, harmless bodies, so the scope check (404) is reached rather than validation (400).
  { method: 'patch', path: async (c) => `/api/v1/clients/${await demoClient(c)}`, allowed: ['ADMIN', 'PM_OWN'], hidden: ['PM_OTHER'], body: { status: 'ACTIVE' } },
  { method: 'post', path: async (c) => `/api/v1/clients/${await demoClient(c)}/contacts`, allowed: ['ADMIN', 'PM_OWN'], hidden: ['PM_OTHER'], body: { role: 'TECHNICAL', name: 'Access test contact' } },

  // Credentials: PM of the client and Admin; TL and Member only through a grant.
  { method: 'get', path: async (c) => `/api/v1/clients/${await demoClient(c)}/credentials`, allowed: DELIVERY },
  { method: 'post', path: async (c) => `/api/v1/clients/${await demoClient(c)}/credentials`, allowed: PMS, body: {} },
  {
    method: 'post',
    path: async (c) => `/api/v1/credentials/${await demoCredential(c)}/reveal`,
    allowed: ['ADMIN', 'PM_OWN'],
    hidden: ['PM_OTHER', 'TEAM_LEADER', 'TEAM_MEMBER'],
  },

  // Projects
  { method: 'get', path: '/api/v1/projects', allowed: NOT_HR },
  { method: 'post', path: '/api/v1/projects', allowed: PMS, body: {} },
  { method: 'get', path: async (c) => `/api/v1/projects/${await demoSeo(c)}`, allowed: NOT_HR },
  { method: 'patch', path: async (c) => `/api/v1/projects/${await demoSeo(c)}`, allowed: ['ADMIN', 'PM_OWN'], hidden: ['PM_OTHER'], body: { health: 'ON_TRACK' } },
  { method: 'post', path: async (c) => `/api/v1/projects/${await demoSeo(c)}/move-stage`, allowed: ['ADMIN', 'PM_OWN'], hidden: ['PM_OTHER'], body: { stageId: 'not-a-stage' } },
  // A valid stop body would stop the demo project; scope for stop is covered in work.api.test.
  { method: 'post', path: async (c) => `/api/v1/projects/${await demoSeo(c)}/stop`, allowed: PMS, body: {} },
  { method: 'post', path: async (c) => `/api/v1/projects/${await demoSeo(c)}/handoff`, allowed: ['ADMIN', 'PM_OWN'], hidden: ['PM_OTHER'], body: { targets: [{ department: 'SEO' }] } },
  { method: 'get', path: '/api/v1/boards/SEO', allowed: NOT_HR },

  // Tasks
  { method: 'get', path: '/api/v1/tasks', allowed: DELIVERY },
  { method: 'get', path: '/api/v1/me/tasks', allowed: DELIVERY },
  { method: 'post', path: '/api/v1/tasks', allowed: DELIVERY, body: {} },
  { method: 'get', path: async (c) => `/api/v1/tasks/${await memberTask(c)}`, allowed: DELIVERY },
  { method: 'patch', path: async (c) => `/api/v1/tasks/${await memberTask(c)}`, allowed: DELIVERY, body: {} },

  // Catalog
  { method: 'get', path: '/api/v1/pipelines', allowed: NOT_HR },
  { method: 'post', path: '/api/v1/pipelines', allowed: ADMIN_ONLY, body: {} },
  { method: 'get', path: '/api/v1/packages', allowed: NOT_HR },
  { method: 'post', path: '/api/v1/packages', allowed: ADMIN_ONLY, body: {} },

  // Leave and holidays: HR and Admin record; Accounts has no leave access (PRD access matrix).
  { method: 'get', path: '/api/v1/leave', allowed: NOT_ACCOUNTS },
  { method: 'post', path: '/api/v1/leave', allowed: PEOPLE_ADMIN, body: {} },
  { method: 'patch', path: async (c) => `/api/v1/leave/${await demoLeave(c)}`, allowed: PEOPLE_ADMIN, body: {} },
  { method: 'get', path: async (c) => `/api/v1/leave/${await demoLeave(c)}/impact`, allowed: NOT_ACCOUNTS },
  { method: 'get', path: '/api/v1/holidays', allowed: EVERYONE },
  { method: 'post', path: '/api/v1/holidays', allowed: PEOPLE_ADMIN, body: {} },

  // Capacity for all but Accounts; the planner for PMs and the team's own TL.
  { method: 'get', path: '/api/v1/capacity', allowed: NOT_ACCOUNTS },
  { method: 'get', path: async (c) => `/api/v1/planner/${await teamOf('SEO', 'SEO')(c)}`, allowed: PLANNERS },
  { method: 'get', path: async (c) => `/api/v1/planner/${await teamOf('WEB_DEV', 'Web Development')(c)}`, allowed: PMS, hidden: ['TEAM_LEADER'] },
  { method: 'post', path: async (c) => `/api/v1/planner/${await teamOf('SEO', 'SEO')(c)}/moves`, allowed: PLANNERS, body: {} },

  { method: 'get', path: '/api/v1/notifications', allowed: EVERYONE },

  // Inbox (PRD access matrix "Client email and WhatsApp threads"; demo inbox in seed/inbox-demo.ts).
  { method: 'get', path: '/api/v1/inbox/threads', allowed: NOT_HR },
  { method: 'get', path: '/api/v1/inbox/settings', allowed: NOT_HR },
  // Untriaged Demo Co mail: the SEO TL works for Demo Co; the Member only sees mail on their tasks.
  { method: 'get', path: '/api/v1/inbox/threads/demo-thread-banner', allowed: ['ADMIN', 'PM_OWN', 'PM_OTHER', 'TEAM_LEADER'], hidden: ['TEAM_MEMBER', 'ACCOUNTS'] },
  { method: 'get', path: '/api/v1/inbox/threads/demo-thread-faq', allowed: DELIVERY, hidden: ['ACCOUNTS'] },
  { method: 'get', path: '/api/v1/inbox/threads/demo-thread-renewal-2023', allowed: ['ADMIN', 'PM_OWN', 'PM_OTHER', 'TEAM_LEADER', 'ACCOUNTS'], hidden: ['TEAM_MEMBER'] },
  { method: 'get', path: '/api/v1/inbox/unmatched', allowed: PMS },
  { method: 'post', path: '/api/v1/inbox/threads/demo-thread-banner/read', allowed: PLANNERS, hidden: ['TEAM_MEMBER', 'ACCOUNTS'] },
  { method: 'post', path: async (c) => `/api/v1/inbox/messages/${await bannerMessage(c)}/triage`, allowed: PLANNERS, body: {} },
  { method: 'post', path: async (c) => `/api/v1/inbox/messages/${await unmatchedMessage(c)}/link`, allowed: PMS, body: {} },
  { method: 'post', path: '/api/v1/inbox/send', allowed: NOT_HR, body: {} },
  { method: 'post', path: '/api/v1/whatsapp/imports', allowed: PLANNERS, body: {} },
  { method: 'get', path: '/api/v1/mailboxes', allowed: NOT_HR },
  { method: 'post', path: '/api/v1/mailboxes', allowed: ADMIN_ONLY, body: {} },
  { method: 'get', path: '/api/v1/search?q=demo', allowed: EVERYONE },

  // Billing (PRD access matrix "Billing requests": Admin view, PM create, Accounts process).
  { method: 'get', path: '/api/v1/billing-requests', allowed: BILLING },
  { method: 'post', path: '/api/v1/billing-requests', allowed: PMS, body: {} },
  { method: 'get', path: async (c) => `/api/v1/billing-requests/${await demoBilling(c)}`, allowed: ['ADMIN', 'PM_OWN', 'ACCOUNTS'], hidden: ['PM_OTHER'] },
  // Empty bodies stop at validation (400); who may change which request is in billing.api.test.
  { method: 'patch', path: async (c) => `/api/v1/billing-requests/${await demoBilling(c)}`, allowed: BILLING, body: {} },
  { method: 'post', path: async (c) => `/api/v1/billing-requests/${await demoBilling(c)}/messages`, allowed: BILLING, body: {} },
  { method: 'post', path: async (c) => `/api/v1/tasks/${await memberTask(c)}/flag-billable`, allowed: DELIVERABLE_FLAGGERS, body: { note: 'x'.repeat(501) } },
  { method: 'post', path: async (c) => `/api/v1/tasks/${await memberTask(c)}/confirm-billable`, allowed: PMS, body: {} },
  { method: 'get', path: '/api/v1/renewals', allowed: BILLING },
  { method: 'post', path: async (c) => `/api/v1/projects/${await demoSeo(c)}/renewal`, allowed: PMS, body: {} },
  { method: 'post', path: '/api/v1/notifications/read-all', allowed: EVERYONE },

  // Phase 1F. Chat and notification settings are personal (membership is tested in collab.api.test).
  { method: 'get', path: '/api/v1/chat/channels', allowed: EVERYONE },
  { method: 'post', path: '/api/v1/chat/direct', allowed: EVERYONE, body: {} },
  { method: 'get', path: '/api/v1/chat/mention-options?q=demo', allowed: EVERYONE },
  { method: 'get', path: '/api/v1/notifications/settings', allowed: EVERYONE },
  { method: 'put', path: '/api/v1/notifications/settings', allowed: EVERYONE, body: {} },
  { method: 'post', path: '/api/v1/notifications/push-subscriptions', allowed: EVERYONE, body: {} },
  { method: 'get', path: '/api/v1/dashboards/me', allowed: EVERYONE },
  { method: 'get', path: '/api/v1/dashboards/admin', allowed: ADMIN_ONLY },
  { method: 'get', path: '/api/v1/dashboards/pm', allowed: PMS },
  { method: 'get', path: '/api/v1/dashboards/tl', allowed: ['ADMIN', 'TEAM_LEADER'] },
  { method: 'get', path: '/api/v1/dashboards/accounts', allowed: ['ADMIN', 'ACCOUNTS'] },
  { method: 'get', path: '/api/v1/dashboards/hr', allowed: PEOPLE_ADMIN },
];

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());

describe.each(ROUTES)('$method $path', (route) => {
  const resolvePath = () => (typeof route.path === 'string' ? Promise.resolve(route.path) : route.path(ctx));

  it('rejects anonymous callers with 401', async () => {
    const res = await ctx.http()[route.method](await resolvePath()).send(route.body);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it.each(EVERYONE)('%s', async (who) => {
    const path = await resolvePath();
    const cookie = await ctx.cookieFor(AS[who]);
    const res = await ctx.http()[route.method](path).set('Cookie', cookie).send(route.body);
    if (route.allowed.includes(who)) {
      expect([200, 201, 400], JSON.stringify(res.body)).toContain(res.status);
    } else if (route.hidden?.includes(who)) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});
