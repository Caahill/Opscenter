// Masking contract crawler registry (AGENTS.md "Tests you must write", step 2).
// Every GET route must appear here or in MASKING_EXEMPT; the suite fails otherwise.
import type { TestContext } from '../helpers';

export interface MaskingEndpoint {
  /** Route pattern as Nest reports it, e.g. /api/v1/users/:id */
  route: string;
  /** Concrete URL to request; defaults to `route`. */
  url?: (ctx: TestContext) => Promise<string>;
}

const demoClient = async (ctx: TestContext) =>
  (await ctx.prisma.client.findFirstOrThrow({ where: { companyName: 'Demo Co' } })).id;
const demoProject = async (ctx: TestContext, department: 'SEO' | 'AMC') =>
  (await ctx.prisma.project.findFirstOrThrow({ where: { department, client: { companyName: 'Demo Co' } } })).id;
const memberTask = async (ctx: TestContext) =>
  (
    await ctx.prisma.task.findFirstOrThrow({
      where: { assignee: { email: 'member.seo@dev.local' }, project: { client: { companyName: 'Demo Co' } } },
    })
  ).id;

const seoTeam = async (ctx: TestContext) => (await ctx.prisma.team.findFirstOrThrow({ where: { department: 'SEO', name: 'SEO' } })).id;
const demoLeave = async (ctx: TestContext) =>
  (await ctx.prisma.leave.findFirstOrThrow({ where: { user: { email: 'member.seo@dev.local' } }, orderBy: { createdAt: 'asc' } })).id;

const waThread = async (ctx: TestContext) =>
  (await ctx.prisma.communication.findUniqueOrThrow({ where: { externalId: 'wamid.demo-banner-question' } })).threadKey;

const demoBilling = async (ctx: TestContext) =>
  (await ctx.prisma.billingRequest.findFirstOrThrow({ where: { client: { companyName: 'Demo Co' }, reason: 'ADDITIONAL_TASK' }, orderBy: { createdAt: 'asc' } })).id;

// The Demo Co SEO project channel; the demo seed posts a message in it that pastes client details.
const demoChannel = async (ctx: TestContext) =>
  (await ctx.prisma.chatChannel.findUniqueOrThrow({ where: { projectId: await demoProject(ctx, 'SEO') } })).id;

export const MASKING_ENDPOINTS: MaskingEndpoint[] = [
  { route: '/api/v1/me' },
  { route: '/api/v1/users' },
  { route: '/api/v1/users', url: async () => '/api/v1/users?includeInactive=true' },
  { route: '/api/v1/teams' },
  { route: '/api/v1/audit-log' },
  { route: '/api/v1/dev/policy-preview' },

  { route: '/api/v1/clients' },
  { route: '/api/v1/clients', url: async () => '/api/v1/clients?search=demo' },
  { route: '/api/v1/clients/:id', url: async (c) => `/api/v1/clients/${await demoClient(c)}` },
  { route: '/api/v1/clients/:id/overview', url: async (c) => `/api/v1/clients/${await demoClient(c)}/overview` },
  { route: '/api/v1/clients/:id/contacts', url: async (c) => `/api/v1/clients/${await demoClient(c)}/contacts` },
  { route: '/api/v1/clients/:id/credentials', url: async (c) => `/api/v1/clients/${await demoClient(c)}/credentials` },
  { route: '/api/v1/projects' },
  { route: '/api/v1/projects', url: async (c) => `/api/v1/projects?clientId=${await demoClient(c)}` },
  { route: '/api/v1/projects/:id', url: async (c) => `/api/v1/projects/${await demoProject(c, 'SEO')}` },
  { route: '/api/v1/projects/:id', url: async (c) => `/api/v1/projects/${await demoProject(c, 'AMC')}` },
  { route: '/api/v1/tasks' },
  { route: '/api/v1/tasks/:id', url: async (c) => `/api/v1/tasks/${await memberTask(c)}` },
  { route: '/api/v1/me/tasks' },
  { route: '/api/v1/boards/:department', url: async () => '/api/v1/boards/SEO' },
  { route: '/api/v1/boards/:department', url: async () => '/api/v1/boards/AMC?includeClosed=true' },
  { route: '/api/v1/pipelines' },
  { route: '/api/v1/packages' },

  // Phase 1C. The demo leave may lie in the past by the time this runs, so list from the start.
  { route: '/api/v1/leave', url: async () => '/api/v1/leave?from=2000-01-01' },
  { route: '/api/v1/leave/:id/impact', url: async (c) => `/api/v1/leave/${await demoLeave(c)}/impact` },
  { route: '/api/v1/holidays' },
  { route: '/api/v1/capacity' },
  { route: '/api/v1/planner/:teamId', url: async (c) => `/api/v1/planner/${await seoTeam(c)}` },
  { route: '/api/v1/notifications' },

  // Phase 1D: demo inbox (apps/api/src/seed/inbox-demo.ts) holds Demo Co addresses, numbers and a login.
  { route: '/api/v1/inbox/threads' },
  { route: '/api/v1/inbox/threads', url: async () => '/api/v1/inbox/threads?view=triage' },
  { route: '/api/v1/inbox/threads', url: async () => '/api/v1/inbox/threads?view=unmatched' },
  { route: '/api/v1/inbox/threads/:key', url: async () => '/api/v1/inbox/threads/demo-thread-banner' },
  { route: '/api/v1/inbox/threads/:key', url: async () => '/api/v1/inbox/threads/demo-thread-faq' },
  { route: '/api/v1/inbox/threads/:key', url: async () => '/api/v1/inbox/threads/demo-thread-renewal-2023' },
  { route: '/api/v1/inbox/threads/:key', url: async (c) => `/api/v1/inbox/threads/${encodeURIComponent(await waThread(c))}` },
  { route: '/api/v1/inbox/unmatched' },
  { route: '/api/v1/inbox/settings' },
  { route: '/api/v1/mailboxes' },
  { route: '/api/v1/mailboxes', url: async () => '/api/v1/mailboxes?manage=true' },
  { route: '/api/v1/search', url: async () => '/api/v1/search?q=Demo%20renewal' },
  { route: '/api/v1/search', url: async () => '/api/v1/search?q=banner' },

  // Phase 1E: the demo request carries the 15750 amount; nothing here may carry a project value.
  { route: '/api/v1/billing-requests' },
  { route: '/api/v1/billing-requests', url: async (c) => `/api/v1/billing-requests?clientId=${await demoClient(c)}` },
  { route: '/api/v1/billing-requests/:id', url: async (c) => `/api/v1/billing-requests/${await demoBilling(c)}` },
  { route: '/api/v1/renewals' },
  { route: '/api/v1/renewals', url: async () => '/api/v1/renewals?within=365' },

  // Phase 1F: chat, notification settings, dashboards and the dev outbox.
  { route: '/api/v1/chat/channels' },
  { route: '/api/v1/chat/channels/:id/messages', url: async (c) => `/api/v1/chat/channels/${await demoChannel(c)}/messages` },
  { route: '/api/v1/chat/mention-options', url: async () => '/api/v1/chat/mention-options?q=demo' },
  { route: '/api/v1/notifications/settings' },
  { route: '/api/v1/dashboards/admin' },
  { route: '/api/v1/dashboards/pm' },
  { route: '/api/v1/dashboards/tl' },
  { route: '/api/v1/dashboards/me' },
  { route: '/api/v1/dashboards/accounts' },
  { route: '/api/v1/dashboards/hr' },
  { route: '/api/v1/dev/mail' },
];

/** GET routes that cannot return client data as JSON, with the reason. */
export const MASKING_EXEMPT: Record<string, string> = {
  '/healthz': 'static status',
  '/api/v1/auth/google': 'redirect to Google',
  '/api/v1/auth/callback': 'redirect after sign-in',
  '/api/v1/auth/dev/users': 'seed staff list, dev only',
  '/api/v1/attachments/:id': 'file download; access checked per task or project (tasks.api.test)',
  '/api/v1/inbox/messages/:id/attachments/:index': 'file download; access checked per message (inbox.api.test)',
  '/api/v1/webhooks/whatsapp': "Meta's subscription check; echoes the challenge only",
  '/api/v1/mailboxes/connect': 'redirect to Google consent',
  '/api/v1/mailboxes/oauth/callback': 'redirect after Google consent',
};

/** Websocket events the socket crawl (sockets.test.ts) triggers and checks; must match SOCKET_EVENTS. */
export const MASKING_SOCKET_EVENTS: string[] = ['notification.new', 'chat.message_new', 'inbox.message_new'];
