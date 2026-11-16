// Masking contract suite (TechSpec 11): for each role, crawl every GET endpoint over seeded data
// and fail if a restricted string appears where policy says it should not.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SENSITIVE_FIXTURES } from '../../src/dev/preview-fixture';
import { RouteCatalog } from '../../src/policy/route-audit';
import { AS, startApp, type TestContext } from '../helpers';
import { MASKING_ENDPOINTS, MASKING_EXEMPT } from './endpoints';

type Who = keyof typeof AS;
const VIEWERS = Object.keys(AS) as Who[];

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());

describe('registry completeness', () => {
  it('every GET route is crawled or explicitly exempt', () => {
    const covered = new Set([...MASKING_ENDPOINTS.map((e) => e.route), ...Object.keys(MASKING_EXEMPT)]);
    const gets = ctx.app
      .get(RouteCatalog)
      .routes()
      .filter((r) => r.method === 'GET')
      .map((r) => r.path);
    const missing = gets.filter((p) => !covered.has(p));
    expect(missing, 'add these to test/masking/endpoints.ts').toEqual([]);
  });
});

describe.each(VIEWERS)('as %s', (who) => {
  it.each(MASKING_ENDPOINTS.map((e) => [e.route, e] as const))('GET %s leaks nothing', async (_route, endpoint) => {
    const url = endpoint.url ? await endpoint.url(ctx) : endpoint.route;
    const res = await ctx.http().get(url).set('Cookie', await ctx.cookieFor(AS[who]));
    const text = res.text + JSON.stringify(res.headers);
    const leaks = SENSITIVE_FIXTURES.filter((f) => !f.visibleTo.includes(who) && text.includes(f.needle)).map((f) => f.what);
    expect(leaks, `${who} saw restricted values on ${url}`).toEqual([]);
  });
});

describe('policy preview: what each role should see', () => {
  const preview = async (who: Who) =>
    (await ctx.http().get('/api/v1/dev/policy-preview').set('Cookie', await ctx.cookieFor(AS[who])).expect(200)).body;

  it('the assigned PM sees everything unmasked, and the view is audit logged', async () => {
    const body = await preview('PM_OWN');
    expect(body.viewerClasses).toEqual(['PM_OWN']);
    expect(body.contacts[0].email).toBe('priya@demo.example.com');
    expect(body.message.body).toContain('Hunter2!');
    expect(body.client.contractValue).toBe('2417350.00');
    expect(body.leave.reason).toBeUndefined();
    const pmId = await ctx.userId(AS.PM_OWN);
    const rows = await ctx.prisma.auditLog.findMany({ where: { actorId: pmId, action: 'VIEW_UNMASKED' } });
    expect(rows.map((r) => r.entity).sort()).toEqual(expect.arrayContaining(['Client', 'Communication', 'Contact']));
    expect(JSON.stringify(rows.map((r) => r.meta))).not.toContain('priya');
  });

  it('another PM gets labels and masked text', async () => {
    const body = await preview('PM_OTHER');
    expect(body.viewerClasses).toEqual(['PM_OTHER']);
    expect(body.contacts[0]).toMatchObject({
      label: 'Demo Co · Marketing contact',
      email: 'Demo Co · Marketing contact',
      phone: 'Demo Co · Marketing contact',
    });
    expect(body.message.from).toBe('Demo Co · Marketing contact');
    expect(body.message.body).toContain('[phone hidden]');
    expect(body.message.body).toContain('[email hidden]');
    expect(body.message.body).toContain('[credential hidden]');
    expect(body.client).not.toHaveProperty('contractValue');
  });

  it('a Team Member sees the client name and the request, masked', async () => {
    const body = await preview('TEAM_MEMBER');
    expect(body.client).toEqual({ companyName: 'Demo Co', website: 'demo.example.com' });
    expect(body.message.body).toContain('please swap the homepage banner');
    expect(body.billingRequest).not.toHaveProperty('amount');
  });

  it('Accounts sees the billing contact, tax id and amount only', async () => {
    const body = await preview('ACCOUNTS');
    expect(body.contacts[1].email).toBe('billing@demo.example.com');
    expect(body.contacts[0]).not.toHaveProperty('email');
    expect(body.client.taxId).toBe('27AAAPD1234C1ZV');
    expect(body.billingRequest.amount).toBe('15750.00');
    expect(body.client).not.toHaveProperty('contractValue');
  });

  it('HR sees leave with its reason and no client data', async () => {
    const body = await preview('HR');
    expect(body.client).toEqual({});
    expect(body.contacts).toEqual([{}, {}]);
    expect(body.message).toEqual({});
    expect(body.leave.reason).toBe('Dental surgery recovery');
  });
});

describe('the crawl reaches real data', () => {
  // Guards against a crawler that only ever sees 404s or empty lists and so passes trivially.
  it('finds every Demo Co restricted value when crawling as Admin', async () => {
    let text = '';
    for (const e of MASKING_ENDPOINTS) {
      const url = e.url ? await e.url(ctx) : e.route;
      text += (await ctx.http().get(url).set('Cookie', await ctx.cookieFor(AS.ADMIN))).text;
    }
    const missing = SENSITIVE_FIXTURES.filter((f) => !f.alternateForm && !text.includes(f.needle)).map((f) => f.what);
    expect(missing).toEqual([]);
  });
});
