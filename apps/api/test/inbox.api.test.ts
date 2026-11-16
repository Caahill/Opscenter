// Phase 1D behaviour: PRD 2.1 to 2.6 and TechSpec 5.5, 7.1 to 7.3 and 10, against the fake Gmail,
// WhatsApp and classifier (AGENTS.md: tests never call the real services). Each test makes its own
// messages with run-unique text, on top of the demo inbox from apps/api/src/seed/inbox-demo.ts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FAKE_PUBSUB_TOKEN,
  FakeGmailClient,
  FakeWhatsAppClient,
  mimeToGmailPayload,
  parseGmailMessage,
  signWhatsAppPayload,
  whatsAppWebhookBody,
} from '@opshub/integrations';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GMAIL, WHATSAPP } from '../src/inbox/providers';
import { JobsService } from '../src/jobs/jobs.service';
import { DEMO_MAILBOX } from '../src/seed/inbox-demo';
import { AS, RUN, startApp, type TestContext } from './helpers';

type Who = keyof typeof AS;
let ctx: TestContext;
let gmail: FakeGmailClient;
let wa: FakeWhatsAppClient;
let demoId: string;

const as = (who: Who) => ctx.cookieFor(AS[who]);
const get = async (who: Who, url: string) => ctx.http().get(url).set('Cookie', await as(who));
const post = async (who: Who, url: string, body: object = {}) => ctx.http().post(url).set('Cookie', await as(who)).send(body);
const drain = () => ctx.app.get(JobsService).drain();

/** A client email arrives in the shared mailbox and Pub/Sub pushes, as in production. */
async function deliver(from: string, subject: string, text: string, opts: { attachment?: string; to?: string; threadId?: string } = {}) {
  gmail.deliver(DEMO_MAILBOX.address, {
    threadId: opts.threadId,
    from: { name: null, address: from },
    to: [{ name: null, address: opts.to ?? DEMO_MAILBOX.address }],
    subject,
    text,
    attachments: opts.attachment ? [{ fileName: opts.attachment, contentType: 'application/pdf', content: Buffer.from(`pdf ${RUN}`) }] : [],
  });
  const data = Buffer.from(JSON.stringify({ emailAddress: DEMO_MAILBOX.address, historyId: Date.now() })).toString('base64');
  await ctx.http().post('/api/v1/webhooks/gmail').set('Authorization', `Bearer ${FAKE_PUBSUB_TOKEN}`).send({ message: { data } }).expect(200);
  await drain();
  return ctx.prisma.communication.findFirst({ where: { subject }, orderBy: { sentAt: 'desc' } });
}

async function whatsapp(from: string, text: string) {
  const raw = JSON.stringify(whatsAppWebhookBody({ from, text }));
  const res = await ctx.http().post('/api/v1/webhooks/whatsapp').set('content-type', 'application/json').set('X-Hub-Signature-256', signWhatsAppPayload('fake-app-secret', raw)).send(raw);
  await drain();
  return res;
}

beforeAll(async () => {
  ctx = await startApp();
  gmail = ctx.app.get(GMAIL);
  wa = ctx.app.get(WHATSAPP);
  demoId = (await ctx.prisma.client.findFirstOrThrow({ where: { companyName: 'Demo Co' } })).id;
});
afterAll(() => ctx.close());

describe('Gmail push and sync (TechSpec 7.1)', () => {
  it('rejects a push without a valid Pub/Sub token, before doing anything', async () => {
    const before = await ctx.prisma.communication.count();
    gmail.deliver(DEMO_MAILBOX.address, { from: { name: null, address: 'priya@demo.example.com' }, to: [{ name: null, address: DEMO_MAILBOX.address }], subject: `Forged ${RUN}`, text: 'x' });
    const data = Buffer.from(JSON.stringify({ emailAddress: DEMO_MAILBOX.address, historyId: 1 })).toString('base64');
    await ctx.http().post('/api/v1/webhooks/gmail').set('Authorization', 'Bearer forged').send({ message: { data } }).expect(401);
    await drain();
    expect(await ctx.prisma.communication.count()).toBe(before);
  });

  it('links a contact by address hash, stores it encrypted with a masked copy, and suggests triage', async () => {
    const msg = await deliver('Priya@Demo.example.com', `Footer phone ${RUN}`, 'Hi team,\nPlease change the footer phone number on the website to +91 98200 12345.', { attachment: 'brief.pdf' });
    expect(msg).toMatchObject({ clientId: demoId, linkMethod: 'CONTACT', direction: 'INBOUND', triageState: 'SUGGESTED', category: 'CHANGE_REQUEST' });
    expect(msg!.contactId).not.toBeNull();
    expect(msg!.bodyMasked).toContain('[phone hidden]');
    expect(Buffer.from(msg!.fromEnc).toString('latin1')).not.toContain('priya');
    expect(Buffer.from(msg!.bodyEnc).toString('latin1')).not.toContain('98200');
    expect(msg!.attachments).toEqual([expect.objectContaining({ fileName: 'brief.pdf', contentType: 'application/pdf' })]);

    // The same push again stores nothing new.
    const data = Buffer.from(JSON.stringify({ emailAddress: DEMO_MAILBOX.address, historyId: 2 })).toString('base64');
    await ctx.http().post('/api/v1/webhooks/gmail').set('Authorization', `Bearer ${FAKE_PUBSUB_TOKEN}`).send({ message: { data } }).expect(200);
    await drain();
    expect(await ctx.prisma.communication.count({ where: { subject: `Footer phone ${RUN}` } })).toBe(1);
  });

  it('links by email domain, leaves webmail senders unmatched, and skips staff-only mail', async () => {
    expect(await deliver('someone.new@demo.example.com', `Domain ${RUN}`, 'Hello')).toMatchObject({ clientId: demoId, linkMethod: 'DOMAIN', contactId: null });
    expect(await deliver(`ravi.${RUN}@gmail.com`, `Webmail ${RUN}`, 'Hello')).toMatchObject({ clientId: null, triageState: 'UNMATCHED' });
    expect(await deliver('colleague@syspree.example', `Internal ${RUN}`, 'Lunch?')).toBeNull();
  });

  it("keeps unmatched mail in a PM's own mailbox private to that PM", async () => {
    const keys = async (who: Who) => (await get(who, '/api/v1/inbox/unmatched')).body.threads.map((t: { threadKey: string }) => t.threadKey);
    expect(await keys('PM_OWN')).toContain('demo-thread-personal');
    expect(await keys('PM_OTHER')).not.toContain('demo-thread-personal');
    expect(await keys('ADMIN')).not.toContain('demo-thread-personal');
    expect(await keys('PM_OTHER')).toContain('demo-thread-unmatched');
  });
});

describe('WhatsApp Cloud API webhook (TechSpec 7.2)', () => {
  it("answers Meta's verification challenge only with the right token", async () => {
    const ok = await ctx.http().get('/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=fake-verify-token&hub.challenge=12345').expect(200);
    expect(ok.text).toBe('12345');
    await ctx.http().get('/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345').expect(403);
  });

  it('refuses a bad signature before storing anything', async () => {
    const before = await ctx.prisma.webhookEvent.count();
    const raw = JSON.stringify(whatsAppWebhookBody({ from: '919820012345', text: 'forged' }));
    await ctx.http().post('/api/v1/webhooks/whatsapp').set('content-type', 'application/json').set('X-Hub-Signature-256', signWhatsAppPayload('wrong-secret', raw)).send(raw).expect(401);
    expect(await ctx.prisma.webhookEvent.count()).toBe(before);
  });

  it('stores a signed message encrypted, linked by number to the contact', async () => {
    const res = await whatsapp('919820012345', `Is the banner live? ${RUN}`);
    expect(res.status).toBe(200);
    const msg = await ctx.prisma.communication.findFirstOrThrow({ where: { bodyMasked: `Is the banner live? ${RUN}` } });
    expect(msg).toMatchObject({ channel: 'WHATSAPP', clientId: demoId, linkMethod: 'CONTACT', triageState: 'SUGGESTED' });
    expect(msg.threadKey).toMatch(/^wa:[0-9a-f]{64}$/);
    const event = await ctx.prisma.webhookEvent.findFirstOrThrow({ orderBy: { receivedAt: 'desc' } });
    expect(event.processedAt).not.toBeNull();
    expect(Buffer.from(event.payloadEnc).toString('latin1')).not.toContain('919820012345');
  });
});

describe('triage into tasks (PRD 2.4)', () => {
  it('a PM confirms the suggestion: a task on the right project, the message and its file attached', async () => {
    const msg = await deliver('priya@demo.example.com', `Header logo ${RUN}`, 'Hi team,\nPlease replace the homepage logo with the attached file.', { attachment: `logo-${RUN}.pdf` });
    const amc = await ctx.prisma.project.findFirstOrThrow({ where: { clientId: demoId, department: 'AMC' } });
    expect((msg!.triage as { suggestion: { projectId: string; action: string } }).suggestion).toMatchObject({ projectId: amc.id, action: 'CREATE_TASK' });

    const res = await post('PM_OWN', `/api/v1/inbox/messages/${msg!.id}/triage`, { decision: 'CONFIRM' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.task).toMatchObject({ projectId: amc.id, source: 'EMAIL', title: 'Replace the homepage logo with the attached file' });
    const task = await ctx.prisma.task.findUniqueOrThrow({ where: { id: res.body.task.id } });
    expect(task.sourceCommId).toBe(msg!.id);
    const files = await ctx.prisma.attachment.findMany({ where: { taskId: task.id } });
    expect(files).toEqual([expect.objectContaining({ fileName: `logo-${RUN}.pdf`, projectId: amc.id, source: 'EMAIL' })]);
    const stored = await ctx.prisma.communication.findUniqueOrThrow({ where: { id: msg!.id } });
    expect(stored).toMatchObject({ triageState: 'CONFIRMED', taskId: task.id, projectId: amc.id });
    expect(stored.triageOutcome).toMatchObject({ decision: 'CONFIRM', action: 'CREATE_TASK', model: 'fake', edited: [] });

    // The task shows the original message: in full to the client's PM.
    const detail = await get('PM_OWN', `/api/v1/tasks/${task.id}`);
    expect(detail.body.sourceMessage).toMatchObject({ from: 'priya@demo.example.com', subject: `Header logo ${RUN}` });
    expect((await post('PM_OWN', `/api/v1/inbox/messages/${msg!.id}/triage`, { decision: 'DISMISS' })).status).toBe(409);
  });

  it('records edits, attaches to an existing task, and lets a TL triage their clients only', async () => {
    const msg = await deliver('priya@demo.example.com', `Keywords ${RUN}`, `Sharing the keyword list for the SEO work ${RUN}.`);
    const seoTask = await ctx.prisma.task.findFirstOrThrow({ where: { project: { clientId: demoId, department: 'SEO' }, statusType: { notIn: ['DONE', 'STOPPED'] } } });
    const res = await post('TEAM_LEADER', `/api/v1/inbox/messages/${msg!.id}/triage`, { decision: 'CONFIRM', action: 'ATTACH_TO_TASK', projectId: seoTask.projectId, taskId: seoTask.id });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const stored = await ctx.prisma.communication.findUniqueOrThrow({ where: { id: msg!.id } });
    expect(stored).toMatchObject({ taskId: seoTask.id, triageState: 'CONFIRMED' });
    expect((stored.triageOutcome as { edited: string[] }).edited).toEqual(expect.arrayContaining(['action']));
    expect(await ctx.prisma.taskComment.count({ where: { taskId: seoTask.id, body: { contains: `Sharing the keyword list for the SEO work ${RUN}` } } })).toBe(1);

    // A client with no SEO work: the SEO Team Leader cannot see or triage its mail.
    const domain = `other-${RUN}.example`;
    const other = (await post('PM_OTHER', '/api/v1/clients', { companyName: `Other Co ${RUN}`, market: 'AU', emailDomains: [domain] })).body as { id: string };
    await post('PM_OTHER', '/api/v1/projects', { clientId: other.id, department: 'WEB_DEV' });
    const otherMsg = await deliver(`owner@${domain}`, `Other client ${RUN}`, 'Please update the menu.');
    expect(otherMsg).toMatchObject({ clientId: other.id, linkMethod: 'DOMAIN' });
    expect((await post('TEAM_LEADER', `/api/v1/inbox/messages/${otherMsg!.id}/triage`, { decision: 'DISMISS' })).status).toBe(404);
    expect((await post('TEAM_MEMBER', `/api/v1/inbox/messages/${otherMsg!.id}/triage`, { decision: 'DISMISS' })).status).toBe(403);
    const dismissed = await post('PM_OTHER', `/api/v1/inbox/messages/${otherMsg!.id}/triage`, { decision: 'DISMISS' });
    expect(dismissed.status, JSON.stringify(dismissed.body)).toBe(201);
    expect(dismissed.body.message.triageState).toBe('DISMISSED');
  });
});

describe('compose by contact id (TechSpec 5.5)', () => {
  it('a TL replies by role; the server fills in the address and keeps the Gmail thread', async () => {
    const original = await ctx.prisma.communication.findUniqueOrThrow({ where: { externalId: 'demo-msg-banner' } });
    const res = await post('TEAM_LEADER', '/api/v1/inbox/send', { channel: 'EMAIL', mode: 'REPLY', replyToId: original.id, toSender: true, body: `Preview attached soon ${RUN}` });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('priya@demo.example.com');
    expect(res.body.message).toMatchObject({ threadKey: 'demo-thread-banner', direction: 'OUTBOUND', to: 'Demo Co · Marketing contact' });

    const sent = gmail.sent.at(-1)!;
    expect(sent.threadId).toBe('demo-thread-banner');
    const parsed = parseGmailMessage({ id: sent.id, threadId: sent.threadId, payload: mimeToGmailPayload(sent.raw) });
    expect(parsed.to).toEqual([{ name: null, address: 'priya@demo.example.com' }]);
    expect(parsed.inReplyTo).toBe('<demo-msg-banner@mail.example>');
    expect(parsed.subject).toBe('Re: Diwali banner');
    expect(parsed.text).toContain(`Preview attached soon ${RUN}`);
  });

  it('refuses typed addresses and personal mailboxes for anyone but the PM and Admin', async () => {
    const contact = await ctx.prisma.contact.findFirstOrThrow({ where: { clientId: demoId, role: 'MARKETING' } });
    const base = { channel: 'EMAIL', clientId: demoId, subject: `Hello ${RUN}`, body: 'Hi' };
    expect((await post('TEAM_LEADER', '/api/v1/inbox/send', { ...base, addresses: ['priya@demo.example.com'] })).status).toBe(403);
    expect((await post('TEAM_LEADER', '/api/v1/inbox/send', { ...base, contactIds: [contact.id], mailboxId: 'demo-mailbox-pavan' })).status).toBe(403);
    expect((await post('PM_OWN', '/api/v1/inbox/send', { ...base, addresses: [`newcontact.${RUN}@demo.example.com`] })).status).toBe(201);
    expect((await post('PM_OWN', '/api/v1/inbox/send', { ...base, contactIds: ['not-their-contact'] })).status).toBe(400);
  });

  it('Team Members can email a client only where the PM turned it on (PRD OQ10)', async () => {
    const contact = await ctx.prisma.contact.findFirstOrThrow({ where: { clientId: demoId, role: 'MARKETING' } });
    const seo = await ctx.prisma.project.findFirstOrThrow({ where: { clientId: demoId, department: 'SEO' } });
    const body = { channel: 'EMAIL', clientId: demoId, contactIds: [contact.id], subject: `From Manoj ${RUN}`, body: 'Report attached.' };
    expect((await post('TEAM_MEMBER', '/api/v1/inbox/send', body)).status).toBe(403);
    await ctx.http().patch(`/api/v1/projects/${seo.id}`).set('Cookie', await as('PM_OWN')).send({ memberSendEnabled: true }).expect(200);
    expect((await post('TEAM_MEMBER', '/api/v1/inbox/send', body)).status).toBe(201);
    await ctx.http().patch(`/api/v1/projects/${seo.id}`).set('Cookie', await as('PM_OWN')).send({ memberSendEnabled: false }).expect(200);
  });

  it('WhatsApp: free text inside 24 hours of the client writing, approved templates outside it', async () => {
    // A number of this run's own, so earlier runs' messages cannot open the window.
    const digits = `97150${String(parseInt(RUN, 16) % 10_000_000).padStart(7, '0')}`;
    const created = await post('PM_OWN', `/api/v1/clients/${demoId}/contacts`, { role: 'TECHNICAL', name: 'WhatsApp test', phone: `+${digits}` });
    const contact = { id: created.body.id as string };
    const out = await post('PM_OWN', '/api/v1/inbox/send', { channel: 'WHATSAPP', clientId: demoId, contactIds: [contact.id], body: 'Invoice sent.' });
    expect(out.status).toBe(422);
    expect(out.body.error.code).toBe('OUTSIDE_WINDOW');
    const template = await post('PM_OWN', '/api/v1/inbox/send', { channel: 'WHATSAPP', clientId: demoId, contactIds: [contact.id], body: '', template: { name: 'hello_world', language: 'en_US', params: [] } });
    expect(template.status, JSON.stringify(template.body)).toBe(201);
    expect(wa.sent.at(-1)).toMatchObject({ to: digits, kind: 'template', body: 'hello_world()' });
    const unapproved = await post('PM_OWN', '/api/v1/inbox/send', { channel: 'WHATSAPP', clientId: demoId, contactIds: [contact.id], body: '', template: { name: 'made_up', language: 'en', params: [] } });
    expect(unapproved.status).toBe(400);

    await whatsapp(digits, `Payment done ${RUN}`);
    const inside = await post('PM_OWN', '/api/v1/inbox/send', { channel: 'WHATSAPP', clientId: demoId, contactIds: [contact.id], body: `Thanks, received ${RUN}` });
    expect(inside.status, JSON.stringify(inside.body)).toBe(201);
    expect(wa.sent.at(-1)).toMatchObject({ to: digits, kind: 'text', body: `Thanks, received ${RUN}` });
  });
});

describe('unmatched senders and re-linking (PRD 2.3 and edge cases)', () => {
  it('saving a personal address on a contact links that sender’s earlier messages', async () => {
    const address = `priya.personal.${RUN}@gmail.com`;
    const msg = await deliver(address, `From home ${RUN}`, 'Please change the banner colour.');
    expect(msg!.clientId).toBeNull();
    const res = await post('PM_OWN', `/api/v1/clients/${demoId}/contacts`, { role: 'MARKETING', name: 'Priya at home', email: address, label: 'Marketing contact (personal)' });
    expect(res.status).toBe(201);
    await drain();
    expect(await ctx.prisma.communication.findUniqueOrThrow({ where: { id: msg!.id } })).toMatchObject({ clientId: demoId, linkMethod: 'CONTACT', triageState: 'SUGGESTED' });
  });

  it('a PM links an unmatched message by hand and can save the sender as a contact', async () => {
    const address = `buyer.${RUN}@outlook.com`;
    const first = await deliver(address, `Quote ${RUN}`, 'Can you share a quote for ads?');
    const second = await deliver(address, `Quote again ${RUN}`, 'Following up on the quote.');
    // Not the client's PM: may link, but not add contacts to someone else's client.
    expect((await post('PM_OTHER', `/api/v1/inbox/messages/${first!.id}/link`, { clientId: demoId, saveAsContact: { role: 'DECISION_MAKER', name: 'Buyer' } })).status).toBe(404);
    const res = await post('PM_OWN', `/api/v1/inbox/messages/${first!.id}/link`, { clientId: demoId, saveAsContact: { role: 'DECISION_MAKER', name: 'Buyer' } });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await drain();
    for (const id of [first!.id, second!.id]) {
      expect(await ctx.prisma.communication.findUniqueOrThrow({ where: { id } })).toMatchObject({ clientId: demoId, linkMethod: 'CONTACT' });
    }
    expect((await post('PM_OWN', `/api/v1/inbox/messages/${first!.id}/link`, { clientId: demoId })).status).toBe(409);
    expect((await post('TEAM_LEADER', `/api/v1/inbox/messages/${first!.id}/link`, { clientId: demoId })).status).toBe(403);
  });
});

describe('search (PRD 2.2, TechSpec 10)', () => {
  it('finds a 2023 email by client name and one keyword, fast', async () => {
    const res = await get('PM_OWN', '/api/v1/search?q=Demo%20renewal');
    expect(res.status).toBe(200);
    expect(res.body.communications.map((c: { threadKey: string }) => c.threadKey)).toContain('demo-thread-renewal-2023');
    expect(res.body.tookMs).toBeLessThan(800);
    // Date filters apply to the message: nothing matches before the 2023 email was sent.
    expect((await get('PM_OWN', '/api/v1/search?q=Demo%20renewal&to=2023-08-13')).body.communications).toEqual([]);
    expect((await get('PM_OWN', '/api/v1/search?q=Demo%20renewal&to=2023-12-31')).body.communications.map((c: { threadKey: string }) => c.threadKey)).toEqual(['demo-thread-renewal-2023']);
  });

  it('only searches what the viewer can see, and masked text only', async () => {
    const member = await get('TEAM_MEMBER', '/api/v1/search?q=FAQ');
    const keys = member.body.communications.map((c: { threadKey: string }) => c.threadKey);
    expect(keys).toContain('demo-thread-faq');
    expect(keys).not.toContain('demo-thread-banner');
    expect((await get('TEAM_MEMBER', '/api/v1/search?q=Diwali%20banner')).body.communications).toEqual([]);
    expect((await get('PM_OWN', '/api/v1/search?q=Hunter2')).body.communications).toEqual([]);
    // HR has no client data at all: the result fields are not even sent.
    const hr = await get('HR', '/api/v1/search?q=Demo');
    expect(Object.keys(hr.body)).toEqual(['tookMs']);
  });
});

describe('Route B chat export import (TechSpec 7.2)', () => {
  const fixture = readFileSync(resolve(__dirname, '../../../fixtures/whatsapp/sample-export.txt'));

  it('imports a client group export, matches senders, and de-duplicates a re-upload', async () => {
    const client = (await post('PM_OWN', '/api/v1/clients', { companyName: `Import Co ${RUN}`, market: 'IN' })).body as { id: string };
    await post('PM_OWN', `/api/v1/clients/${client.id}/contacts`, { role: 'MARKETING', name: 'Import Marketing', phone: `+91 98111 ${RUN.slice(0, 5).replace(/\D/g, '1').padEnd(5, '1')}` });
    const upload = (who: Who, clientId: string) =>
      as(who).then((cookie) =>
        ctx.http().post('/api/v1/whatsapp/imports').set('Cookie', cookie).field('payload', JSON.stringify({ clientId })).attach('file', fixture, 'WhatsApp Chat with Import Co.txt'),
      );
    const first = await upload('PM_OWN', client.id);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body).toMatchObject({ chatName: 'Import Co', messages: 6, duplicates: 0 });
    const rows = await ctx.prisma.communication.findMany({ where: { importId: first.body.id }, orderBy: { sentAt: 'asc' } });
    expect(rows.map((r) => r.direction)).toEqual(['INBOUND', 'INBOUND', 'OUTBOUND', 'INBOUND', 'INBOUND', 'INBOUND']);
    expect(rows[2]!.sentById).toBe(await ctx.userId(AS.PM_OWN));
    expect(rows[0]!.bodyMasked).toContain('please swap the homepage banner');
    expect(rows[4]!.bodyMasked).toBe('[media not included in the export]');

    const again = await upload('PM_OWN', client.id);
    expect(again.body).toMatchObject({ messages: 0, duplicates: 6 });
    expect((await upload('TEAM_MEMBER', client.id)).status).toBe(403);
    expect((await upload('TEAM_LEADER', client.id)).status).toBe(404);
  });
});

describe('read state', () => {
  it('a new message is "New" until the person opens the thread; read state is per person', async () => {
    const msg = await deliver('priya@demo.example.com', `Read state ${RUN}`, 'First message');
    const key = encodeURIComponent(msg!.threadKey);
    const unreadIn = async (who: Who) => (await get(who, `/api/v1/inbox/threads/${key}`)).body.messages.filter((m: { unread: boolean }) => m.unread).length;
    // Email only: imported WhatsApp chats from earlier runs carry fixture dates that can sort above today.
    const listed = async (who: Who) => (await get(who, '/api/v1/inbox/threads?channel=EMAIL')).body.threads.find((t: { threadKey: string }) => t.threadKey === msg!.threadKey);

    expect(await unreadIn('PM_OWN')).toBe(1);
    expect((await listed('PM_OWN')).unread).toBe(true);
    expect((await post('PM_OWN', `/api/v1/inbox/threads/${key}/read`)).status).toBe(201);
    expect(await unreadIn('PM_OWN')).toBe(0);
    expect((await listed('PM_OWN')).unread).toBe(false);
    expect(await unreadIn('PM_OTHER')).toBe(1); // someone else has not read it

    // The client writes again: only the new message is New; my own replies never are.
    await new Promise((r) => setTimeout(r, 5));
    const reply = await deliver('priya@demo.example.com', `Re: Read state ${RUN}`, 'Second message', { threadId: msg!.threadKey });
    await post('PM_OWN', '/api/v1/inbox/send', { channel: 'EMAIL', mode: 'REPLY', replyToId: reply!.id, toSender: true, body: 'My answer' });
    const thread = (await get('PM_OWN', `/api/v1/inbox/threads/${key}`)).body.messages as Array<{ id: string; unread: boolean; direction: string }>;
    expect(thread.filter((m) => m.unread).map((m) => m.id)).toEqual([reply!.id]);
    expect(thread.filter((m) => m.direction === 'OUTBOUND').every((m) => !m.unread)).toBe(true);
    expect((await post('TEAM_MEMBER', `/api/v1/inbox/threads/${key}/read`)).status).toBe(404);
  });
});

describe('masked views (PRD 2.5)', () => {
  it('a Team Member sees the request on their task with labels and masked text only', async () => {
    const res = await get('TEAM_MEMBER', '/api/v1/inbox/threads/demo-thread-faq');
    expect(res.status).toBe(200);
    const [m] = res.body.messages;
    expect(m).toMatchObject({ sender: 'Demo Co · Marketing contact', from: 'Demo Co · Marketing contact' });
    expect(m.body).toContain('Please add the new FAQ section');
    expect(m.body).toContain('[phone hidden]');
    expect(JSON.stringify(res.body)).not.toMatch(/priya@|98200|@demo\.example\.com/);
    expect((await get('TEAM_MEMBER', '/api/v1/inbox/threads/demo-thread-banner')).status).toBe(404);
  });

  it('the client’s PM sees the original, and the view is audit logged', async () => {
    const res = await get('PM_OWN', '/api/v1/inbox/threads/demo-thread-banner');
    expect(res.body.messages[0]).toMatchObject({ from: 'priya@demo.example.com' });
    expect(res.body.messages[0].body).toContain('Hunter2!');
    const pmId = await ctx.userId(AS.PM_OWN);
    const audit = await ctx.prisma.auditLog.findFirst({ where: { actorId: pmId, action: 'VIEW_UNMASKED', entity: 'Communication' }, orderBy: { at: 'desc' } });
    expect(audit).not.toBeNull();
    const other = await get('PM_OTHER', '/api/v1/inbox/threads/demo-thread-banner');
    expect(other.body.messages[0].body).toContain('[credential hidden]');
    expect(other.body.messages[0].from).toBe('Demo Co · Marketing contact');
  });

  it("a client's follow-up in an email thread reaches everyone who can see the thread, before triage", async () => {
    // Accounts: a reply in the confirmed 2023 billing thread (the bug: it stayed hidden until triaged).
    const followUp = await deliver('billing@demo.example.com', `Re: SEO contract renewal 2023 ${RUN}`, `Any update on the quote? ${RUN}`, { threadId: 'demo-thread-renewal-2023' });
    expect(followUp).toMatchObject({ threadKey: 'demo-thread-renewal-2023', triageState: 'SUGGESTED' });
    const accounts = await get('ACCOUNTS', '/api/v1/inbox/threads/demo-thread-renewal-2023');
    expect(accounts.body.messages.map((m: { id: string }) => m.id)).toContain(followUp!.id);
    expect(JSON.stringify(accounts.body)).not.toContain('billing@demo.example.com');
    const reply = await post('ACCOUNTS', '/api/v1/inbox/send', { channel: 'EMAIL', mode: 'REPLY', replyToId: followUp!.id, toSender: true, body: `Quote attached ${RUN}` });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    expect((await get('ACCOUNTS', '/api/v1/inbox/threads?view=all')).body.threads.map((t: { threadKey: string }) => t.threadKey)).toContain('demo-thread-renewal-2023');

    // A Team Member: the client writes again in the thread on their task.
    const more = await deliver('priya@demo.example.com', `Re: FAQ section ${RUN}`, `Two more questions for the FAQ ${RUN}`, { threadId: 'demo-thread-faq' });
    const member = await get('TEAM_MEMBER', '/api/v1/inbox/threads/demo-thread-faq');
    expect(member.body.messages.map((m: { id: string }) => m.id)).toContain(more!.id);
    expect((await get('TEAM_MEMBER', `/api/v1/search?q=${encodeURIComponent(`questions ${RUN}`)}`)).body.communications.map((c: { threadKey: string }) => c.threadKey)).toEqual(['demo-thread-faq']);
  });

  it('WhatsApp chats stay message by message: one linked message does not open the whole chat', async () => {
    await whatsapp('919820012345', `Unrelated WhatsApp ${RUN}`);
    await whatsapp('919820012345', `About the FAQ on WhatsApp ${RUN}`);
    const linked = await ctx.prisma.communication.findFirstOrThrow({ where: { bodyMasked: `About the FAQ on WhatsApp ${RUN}` } });
    const memberTask = await ctx.prisma.communication.findUniqueOrThrow({ where: { externalId: 'demo-msg-faq' } });
    await ctx.prisma.communication.update({ where: { id: linked.id }, data: { taskId: memberTask.taskId, projectId: memberTask.projectId, triageState: 'CONFIRMED' } });
    const res = await get('TEAM_MEMBER', `/api/v1/inbox/threads/${encodeURIComponent(linked.threadKey)}`);
    const bodies = res.body.messages.map((m: { body: string }) => m.body);
    expect(bodies).toContain(`About the FAQ on WhatsApp ${RUN}`);
    expect(bodies).not.toContain(`Unrelated WhatsApp ${RUN}`);
  });

  it('Accounts sees confirmed billing threads only, masked; HR sees no inbox', async () => {
    const billing = await get('ACCOUNTS', '/api/v1/inbox/threads/demo-thread-renewal-2023');
    expect(billing.status).toBe(200);
    expect(billing.body.messages[0].body).toContain('[phone hidden]');
    expect((await get('ACCOUNTS', '/api/v1/inbox/threads/demo-thread-banner')).status).toBe(404);
    expect((await get('HR', '/api/v1/inbox/threads')).status).toBe(403);
  });

  it('attachments download only for people who can see the message', async () => {
    const msg = await ctx.prisma.communication.findFirstOrThrow({ where: { subject: `Footer phone ${RUN}` } });
    const ok = await get('PM_OWN', `/api/v1/inbox/messages/${msg.id}/attachments/0`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-disposition']).toContain('attachment; filename="brief.pdf"');
    expect((await get('TEAM_MEMBER', `/api/v1/inbox/messages/${msg.id}/attachments/0`)).status).toBe(404);
  });
});
