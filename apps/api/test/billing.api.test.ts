// Phase 1E behaviour: PRD 4.1 to 4.4 and TechSpec 9.4. Each test works on a client of its own,
// created by pm@dev.local, so reruns and the demo data cannot interfere.
import { DEFAULT_TIMEZONE, todayIn } from '@opshub/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AS, RUN, startApp, type TestContext } from './helpers';

type Who = keyof typeof AS;
let ctx: TestContext;
const as = (who: Who) => ctx.cookieFor(AS[who]);
const get = async (who: Who, url: string) => ctx.http().get(url).set('Cookie', await as(who));
const post = async (who: Who, url: string, body: object = {}) => ctx.http().post(url).set('Cookie', await as(who)).send(body);
const patch = async (who: Who, url: string, body: object) => ctx.http().patch(url).set('Cookie', await as(who)).send(body);

let n = 0;
async function setup(market = 'AE') {
  n++;
  const client = (await post('PM_OWN', '/api/v1/clients', { companyName: `Billing Co ${RUN} ${n}`, market })).body as { id: string };
  const project = (await post('PM_OWN', '/api/v1/projects', { clientId: client.id, department: 'SEO', type: 'RETAINER', value: '98765.00' })).body as { id: string };
  const memberId = await ctx.userId(AS.TEAM_MEMBER);
  const task = async (title: string) =>
    (await post('PM_OWN', '/api/v1/tasks', { projectId: project.id, title: `${title} ${RUN}`, assigneeId: memberId })).body as { id: string };
  return { clientId: client.id, projectId: project.id, task };
}

beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());

describe('PRD 4.1 billable flag', () => {
  it('anyone on the task flags it; the PM confirms; a confirmed task cannot close without a request', async () => {
    const s = await setup();
    const t = await s.task('Extra banner set');
    expect((await post('TEAM_MEMBER', `/api/v1/tasks/${t.id}/flag-billable`, { note: 'Client asked for 3 more sizes' })).status).toBe(201);
    const pmAlerts = await get('PM_OWN', '/api/v1/notifications');
    expect(pmAlerts.body.items.some((x: { title: string }) => x.title === `"Extra banner set ${RUN}" flagged as extra work`)).toBe(true);

    // Only the client's PM confirms.
    expect((await post('TEAM_MEMBER', `/api/v1/tasks/${t.id}/confirm-billable`, { decision: 'CONFIRM' })).status).toBe(403);
    expect((await post('PM_OTHER', `/api/v1/tasks/${t.id}/confirm-billable`, { decision: 'CONFIRM' })).status).toBe(404);
    expect((await post('PM_OWN', `/api/v1/tasks/${t.id}/confirm-billable`, { decision: 'CONFIRM' })).status).toBe(201);

    const blocked = await patch('TEAM_MEMBER', `/api/v1/tasks/${t.id}`, { statusType: 'DONE' });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe('BILLING_REQUEST_REQUIRED');

    const req = await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'ADDITIONAL_TASK', description: 'Three extra banner sizes', amount: '4500', taskIds: [t.id] });
    expect(req.status, JSON.stringify(req.body)).toBe(201);
    expect((await patch('TEAM_MEMBER', `/api/v1/tasks/${t.id}`, { statusType: 'DONE' })).status).toBe(200);
  });

  it('a rejected flag clears; a task already on a request cannot be rejected', async () => {
    const s = await setup();
    const t = await s.task('Not extra');
    await post('TEAM_LEADER', `/api/v1/tasks/${t.id}/flag-billable`);
    expect((await post('PM_OWN', `/api/v1/tasks/${t.id}/confirm-billable`, { decision: 'REJECT' })).status).toBe(201);
    expect(await ctx.prisma.task.findUniqueOrThrow({ where: { id: t.id } })).toMatchObject({ billable: false, billableConfirmed: false });
    expect((await post('PM_OWN', `/api/v1/tasks/${t.id}/confirm-billable`, { decision: 'CONFIRM' })).status).toBe(422);

    const u = await s.task('Billed already');
    await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'ADDITIONAL_TASK', description: 'x', amount: '100', taskIds: [u.id] });
    expect((await post('PM_OWN', `/api/v1/tasks/${u.id}/confirm-billable`, { decision: 'REJECT' })).status).toBe(409);
    expect((await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'ADDITIONAL_TASK', description: 'again', amount: '100', taskIds: [u.id] })).status).toBe(409);
  });
});

describe('PRD 4.2 billing requests', () => {
  it('the PM raises one; Accounts is told in the app; currency follows the client market', async () => {
    const s = await setup('AE');
    const t = await s.task('Landing page');
    const res = await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'ADDITIONAL_TASK', description: 'Call me on +971 50 123 4567 about it', amount: '12500.50', taskIds: [t.id] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ amount: '12500.5', currency: 'AED', status: 'REQUESTED', taskCount: 1, can: ['EDIT', 'CANCEL'] });
    expect(res.body.description).toContain('[phone hidden]');
    expect(res.body.tasks[0]).toMatchObject({ id: t.id, billableConfirmed: true });

    const alerts = await get('ACCOUNTS', '/api/v1/notifications');
    const alert = alerts.body.items.find((x: { link: string }) => x.link === `/billing/${res.body.id}`);
    expect(alert.title).toBe(`Billing request: Billing Co ${RUN} ${n} · SEO`);
    expect(JSON.stringify(alert)).not.toContain('12500');
  });

  it('only the client’s PM raises it, and ADDITIONAL_TASK needs the tasks being billed', async () => {
    const s = await setup();
    expect((await post('PM_OTHER', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'NEW_PACKAGE', description: 'x', amount: '1' })).status).toBe(404);
    expect((await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'ADDITIONAL_TASK', description: 'x', amount: '1' })).status).toBe(400);
    expect((await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'NEW_PACKAGE', description: 'Ads package', amount: '30000' })).status).toBe(201);
    expect((await post('ACCOUNTS', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'NEW_PACKAGE', description: 'x', amount: '1' })).status).toBe(403);
  });
});

describe('TechSpec 9.4 state machine and the Accounts workspace (PRD 4.4)', () => {
  it('Accounts invoices then marks paid; the PM is told; nothing goes backwards', async () => {
    const s = await setup();
    const r = (await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'NEW_PACKAGE', description: 'Social package', amount: '20000' })).body as { id: string };
    const url = `/api/v1/billing-requests/${r.id}`;
    expect((await patch('ACCOUNTS', url, { status: 'PAID' })).body.error.code).toBe('INVALID_TRANSITION');
    expect((await patch('ACCOUNTS', url, { status: 'INVOICED' })).status).toBe(400); // invoice number needed
    expect((await patch('PM_OWN', url, { status: 'INVOICED', invoiceNo: 'X' })).status).toBe(403);

    const invoiced = await patch('ACCOUNTS', url, { status: 'INVOICED', invoiceNo: `INV-${RUN}`, invoicedAt: '2026-11-10' });
    expect(invoiced.status).toBe(200);
    expect(invoiced.body).toMatchObject({ status: 'INVOICED', invoiceNo: `INV-${RUN}`, invoicedAt: '2026-11-10T00:00:00.000Z', can: ['PROCESS'] });
    expect((await patch('PM_OWN', url, { amount: '1' })).status).toBe(422); // too late to edit
    expect((await patch('PM_OWN', url, { status: 'CANCELLED', cancelReason: 'x' })).status).toBe(403); // Accounts issues a credit note

    const paid = await patch('ACCOUNTS', url, { status: 'PAID', paidAt: '2026-11-20' });
    expect(paid.body).toMatchObject({ status: 'PAID', paidAt: '2026-11-20T00:00:00.000Z', can: [] });
    expect((await patch('ACCOUNTS', url, { status: 'CANCELLED', cancelReason: 'x' })).status).toBe(422);
    const pm = await get('PM_OWN', '/api/v1/notifications');
    expect(pm.body.items.some((x: { link: string; title: string }) => x.link === `/billing/${r.id}` && x.title.endsWith('paid'))).toBe(true);
  });

  it('the PM can edit or cancel until it is invoiced; cancelled requests free their tasks', async () => {
    const s = await setup();
    const t = await s.task('Cancelled work');
    const r = (await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'ADDITIONAL_TASK', description: 'x', amount: '500', taskIds: [t.id] })).body as { id: string };
    const url = `/api/v1/billing-requests/${r.id}`;
    expect((await patch('PM_OWN', url, { amount: '650', description: 'Updated scope' })).body).toMatchObject({ amount: '650', description: 'Updated scope' });
    expect((await patch('ACCOUNTS', url, { amount: '1' })).status).toBe(403);
    expect((await patch('PM_OTHER', url, { amount: '1' })).status).toBe(404);
    expect((await patch('PM_OWN', url, { status: 'CANCELLED' })).status).toBe(400); // reason needed
    expect((await patch('PM_OWN', url, { status: 'CANCELLED', cancelReason: 'Client dropped it' })).body).toMatchObject({ status: 'CANCELLED', cancelReason: 'Client dropped it' });
    // The task is billable but no longer on a live request, so it cannot close again until re-billed.
    expect((await patch('PM_OWN', `/api/v1/tasks/${t.id}`, { statusType: 'DONE' })).status).toBe(422);
  });

  it('Accounts and the PM message each other on the request, scrubbed of contact details', async () => {
    const s = await setup();
    const r = (await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'NEW_PACKAGE', description: 'x', amount: '1000' })).body as { id: string };
    const res = await post('ACCOUNTS', `/api/v1/billing-requests/${r.id}/messages`, { body: `Send the PO to accounts.${RUN}@client.example please` });
    expect(res.status).toBe(201);
    expect(res.body.messages.at(-1)).toMatchObject({ authorName: 'Anil Accounts', body: 'Send the PO to [email hidden] please' });
    const pm = await get('PM_OWN', '/api/v1/notifications');
    expect(pm.body.items.some((x: { link: string }) => x.link === `/billing/${r.id}`)).toBe(true);
    expect((await post('PM_OTHER', `/api/v1/billing-requests/${r.id}/messages`, { body: 'hi' })).status).toBe(404);
  });

  it('Accounts sees the amount and the billing contact, never the project value', async () => {
    const s = await setup();
    await post('PM_OWN', `/api/v1/clients/${s.clientId}/contacts`, { role: 'BILLING', name: 'Bill Payer', email: `pay.${RUN}@billing.example` });
    await post('PM_OWN', `/api/v1/clients/${s.clientId}/contacts`, { role: 'MARKETING', name: 'Mark Eting', email: `mark.${RUN}@billing.example` });
    const r = (await post('PM_OWN', '/api/v1/billing-requests', { projectId: s.projectId, reason: 'NEW_PACKAGE', description: 'x', amount: '777' })).body as { id: string };
    const detail = await get('ACCOUNTS', `/api/v1/billing-requests/${r.id}`);
    expect(detail.body).toMatchObject({ amount: '777', billingContact: { email: `pay.${RUN}@billing.example` } });
    const project = await get('ACCOUNTS', `/api/v1/projects/${s.projectId}`);
    expect(project.status).toBe(200);
    expect(project.body).not.toHaveProperty('value');
    const all = JSON.stringify([detail.body, project.body, (await get('ACCOUNTS', `/api/v1/clients/${s.clientId}/overview`)).body]);
    expect(all).not.toContain('98765');
    expect(all).not.toContain(`mark.${RUN}@billing.example`);
    // A PM without the client gets nothing at all; TL and Members never see billing.
    expect((await get('PM_OTHER', `/api/v1/billing-requests/${r.id}`)).status).toBe(404);
    expect((await get('TEAM_MEMBER', '/api/v1/billing-requests')).status).toBe(403);
  });
});

describe('PRD 4.3 renewals', () => {
  async function retainerEnding(daysFromNow: number) {
    const s = await setup('IN');
    // Days are counted from today in IST, the company's calendar, not from the UTC date.
    const end = new Date(new Date(`${todayIn(DEFAULT_TIMEZONE)}T00:00:00.000Z`).getTime() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
    await patch('PM_OWN', `/api/v1/projects/${s.projectId}`, { endDate: end });
    return { ...s, end };
  }

  it('lists retainers ending soon for the PM and Accounts, without project values', async () => {
    const s = await retainerEnding(10);
    const pm = await get('PM_OWN', '/api/v1/renewals');
    const row = pm.body.find((r: { projectId: string }) => r.projectId === s.projectId);
    expect(row).toMatchObject({ daysLeft: 10, currency: 'INR', billingRequestId: null, type: 'RETAINER' });
    const accounts = await get('ACCOUNTS', '/api/v1/renewals');
    expect(accounts.body.map((r: { projectId: string }) => r.projectId)).toContain(s.projectId);
    expect(JSON.stringify(accounts.body)).not.toContain('98765');
    expect((await get('PM_OTHER', '/api/v1/renewals')).body.map((r: { projectId: string }) => r.projectId)).not.toContain(s.projectId);
  });

  it('Renew raises a RENEWAL request for Accounts and moves the term on, once', async () => {
    const s = await retainerEnding(5);
    const newEnd = new Date(Date.now() + 370 * 86_400_000).toISOString().slice(0, 10);
    const res = await post('PM_OWN', `/api/v1/projects/${s.projectId}/renewal`, { decision: 'RENEW', newEndDate: newEnd, amount: '120000' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ reason: 'RENEWAL', amount: '120000', currency: 'INR', status: 'REQUESTED' });
    expect((await ctx.prisma.project.findUniqueOrThrow({ where: { id: s.projectId } })).endDate!.toISOString().slice(0, 10)).toBe(newEnd);
    expect((await get('PM_OWN', '/api/v1/renewals')).body.map((r: { projectId: string }) => r.projectId)).not.toContain(s.projectId);
    // Re-renewing the old term (a double click, a retry) is refused.
    await ctx.prisma.project.update({ where: { id: s.projectId }, data: { endDate: new Date(`${s.end}T00:00:00.000Z`) } });
    expect((await post('PM_OWN', `/api/v1/projects/${s.projectId}/renewal`, { decision: 'RENEW', newEndDate: newEnd, amount: '1' })).status).toBe(409);
    expect((await post('PM_OTHER', `/api/v1/projects/${s.projectId}/renewal`, { decision: 'CLOSE' })).status).toBe(404);
  });

  it('Close ends the project and tells Accounts', async () => {
    const s = await retainerEnding(3);
    expect((await post('PM_OWN', `/api/v1/projects/${s.projectId}/renewal`, { decision: 'CLOSE' })).status).toBe(201);
    expect((await ctx.prisma.project.findUniqueOrThrow({ where: { id: s.projectId } })).statusType).toBe('DONE');
    const accounts = await get('ACCOUNTS', '/api/v1/notifications');
    expect(accounts.body.items.some((x: { title: string }) => x.title === `Billing Co ${RUN} ${n} · SEO will not renew`)).toBe(true);
    expect((await post('PM_OWN', `/api/v1/projects/${s.projectId}/renewal`, { decision: 'CLOSE' })).status).toBe(422);
  });
});
