import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildMime,
  FakeClassifier,
  FakeGmailClient,
  FakePubSubVerifier,
  FAKE_PUBSUB_TOKEN,
  mimeToGmailPayload,
  parseAddressList,
  parseChatExport,
  parseGmailMessage,
  parsePubSubPush,
  parseWhatsAppWebhook,
  readChatExport,
  sanitize,
  signWhatsAppPayload,
  TriageOutput,
  triagePrompt,
  verifyWhatsAppSignature,
  whatsAppWebhookBody,
  zonedTime,
  type TriageInput,
} from './index';

const mb = { address: 'support@syspree.example', refreshToken: 'fake' };

describe('email addresses and MIME', () => {
  it('parses address lists with quoted commas and bare addresses', () => {
    expect(parseAddressList('"Doe, Jane" <Jane@Example.com>, b@y.example, Ravi <ravi@z.example>')).toEqual([
      { name: 'Doe, Jane', address: 'jane@example.com' },
      { name: null, address: 'b@y.example' },
      { name: 'Ravi', address: 'ravi@z.example' },
    ]);
    expect(parseAddressList('undisclosed-recipients:;')).toEqual([]);
  });

  it('builds a reply that keeps Gmail threading, and reads it back', () => {
    const built = buildMime({
      from: { name: 'SySpree Support', address: 'support@syspree.example' },
      to: [{ name: null, address: 'priya@demo.example.com' }],
      subject: 'Re: Diwali banner ✨',
      text: 'Hi Priya,\nThe banner is live.',
      inReplyTo: '<abc@mail.example>',
      references: '<root@mail.example>',
      attachments: [{ fileName: 'banner.png', contentType: 'image/png', content: Buffer.from('png-bytes') }],
    });
    expect(built.raw).toContain('In-Reply-To: <abc@mail.example>');
    expect(built.raw).toContain('References: <root@mail.example> <abc@mail.example>');
    expect(built.raw).toContain('Subject: =?UTF-8?B?');
    const parsed = parseGmailMessage({ id: 'm1', threadId: 't1', payload: mimeToGmailPayload(built.raw) });
    expect(parsed.subject).toBe('Re: Diwali banner ✨');
    expect(parsed.text).toBe('Hi Priya,\nThe banner is live.');
    expect(parsed.inReplyTo).toBe('<abc@mail.example>');
    expect(parsed.messageId).toBe(built.messageId);
    expect(parsed.attachments).toEqual([expect.objectContaining({ fileName: 'banner.png', contentType: 'image/png', data: Buffer.from('png-bytes') })]);
  });

  it('falls back to HTML when there is no plain text part', () => {
    const parsed = parseGmailMessage({
      id: 'm2',
      threadId: 't2',
      payload: {
        mimeType: 'multipart/alternative',
        headers: [{ name: 'From', value: 'Priya <priya@demo.example.com>' }],
        parts: [{ mimeType: 'text/html', body: { data: Buffer.from('<p>Hello&nbsp;team</p><p>Thanks</p>').toString('base64url') } }],
      },
    });
    expect(parsed.text).toBe('Hello team\nThanks');
    expect(parsed.from).toEqual({ name: 'Priya', address: 'priya@demo.example.com' });
  });
});

describe('fake Gmail', () => {
  it('delivers into history, threads replies, and keeps what Ops Hub sent', async () => {
    const gmail = new FakeGmailClient();
    const start = (await gmail.profile(mb)).historyId;
    const first = gmail.deliver(mb.address, { from: { name: 'Priya', address: 'priya@demo.example.com' }, to: [{ name: null, address: mb.address }], subject: 'Banner', text: 'Please swap it.' });
    const page = await gmail.history(mb, start);
    expect(page.messageIds).toEqual([first.id]);
    const sent = await gmail.send(mb, buildMime({ from: { name: null, address: mb.address }, to: [{ name: null, address: 'priya@demo.example.com' }], subject: 'Re: Banner', text: 'Done.' }).raw, first.threadId);
    expect(sent.threadId).toBe(first.threadId);
    expect((await gmail.history(mb, page.historyId)).messageIds).toEqual([sent.id]);
    expect((await gmail.get(mb, sent.id)).labelIds).toEqual(['SENT']);
  });

  it('accepts only the fake Pub/Sub token, and decodes pushes', async () => {
    const v = new FakePubSubVerifier();
    expect(await v.verify(`Bearer ${FAKE_PUBSUB_TOKEN}`)).toBe(true);
    expect(await v.verify('Bearer forged')).toBe(false);
    expect(await v.verify(undefined)).toBe(false);
    const data = Buffer.from(JSON.stringify({ emailAddress: 'Support@SySpree.example', historyId: 1234 })).toString('base64');
    expect(parsePubSubPush({ message: { data } })).toEqual({ emailAddress: 'support@syspree.example', historyId: '1234' });
    expect(parsePubSubPush({ message: { data: 'not json' } })).toBeNull();
  });
});

describe('WhatsApp Cloud API', () => {
  it('verifies X-Hub-Signature-256 against the raw body', () => {
    const raw = Buffer.from(JSON.stringify(whatsAppWebhookBody({ from: '919820012345', text: 'hi' })));
    const sig = signWhatsAppPayload('app-secret', raw);
    expect(verifyWhatsAppSignature('app-secret', raw, sig)).toBe(true);
    expect(verifyWhatsAppSignature('other-secret', raw, sig)).toBe(false);
    expect(verifyWhatsAppSignature('app-secret', Buffer.concat([raw, Buffer.from(' ')]), sig)).toBe(false);
    expect(verifyWhatsAppSignature('app-secret', raw, undefined)).toBe(false);
  });

  it('turns webhook messages into inbound messages and ignores status callbacks', () => {
    const at = new Date('2026-11-09T05:00:00Z');
    expect(parseWhatsAppWebhook(whatsAppWebhookBody({ from: '919820012345', text: 'Banner?', wamid: 'wamid.1', sentAt: at }))).toEqual([
      { wamid: 'wamid.1', from: '919820012345', sentAt: at, text: 'Banner?', media: null },
    ]);
    const image = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { messages: [{ from: '919820012345', id: 'wamid.2', timestamp: '1762664400', type: 'image', image: { id: 'media-1', mime_type: 'image/jpeg', caption: 'New artwork' } }] } }] }],
    };
    expect(parseWhatsAppWebhook(image)[0]).toMatchObject({ text: 'New artwork', media: { id: 'media-1', mimeType: 'image/jpeg', fileName: 'image-wamid.2.jpg' } });
    const statuses = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'x', status: 'read' }] } }] }] };
    expect(parseWhatsAppWebhook(statuses)).toEqual([]);
    expect(parseWhatsAppWebhook({ nonsense: true })).toEqual([]);
  });
});

describe('Route B chat export', () => {
  const fixture = readFileSync(resolve(__dirname, '../../../fixtures/whatsapp/sample-export.txt'), 'utf8');

  it('reads the Android sample: system lines skipped, multi-line kept, attachments found', () => {
    const msgs = parseChatExport(fixture);
    expect(msgs.map((m) => m.sender)).toEqual(['+91 98200 12345', '+91 98200 12345', 'Pavan PM', '+91 98200 12345', '+91 98200 12345', 'Arjun Demo']);
    expect(msgs[0]!.text).toBe('Hi team, please swap the homepage banner for the Diwali offer.\nThe new banner text is below:\n"Festive savings, 20% off all plans"');
    expect(msgs[0]!.sentAt.toISOString()).toBe('2026-11-05T04:45:00.000Z'); // 10:15 IST
    expect(msgs[1]).toMatchObject({ attachments: ['IMG-20261105-WA0001.jpg'], text: 'New banner artwork' });
    expect(msgs[4]).toMatchObject({ mediaOmitted: true, text: '' });
    expect(msgs[5]!.sentAt.toISOString()).toBe('2026-11-13T03:35:00.000Z'); // 13/11 means day first
  });

  it('reads iOS 12-hour exports with attachment markers, and US month-first dates', () => {
    const ios = '[11/13/26, 9:05:12\u202fAM] Priya Demo: Morning! Any update?\n[11/13/26, 12:30:00 PM] Priya Demo: \u200e<attached: 00000003-PHOTO-2026-11-13-12-30-00.jpg>';
    const msgs = parseChatExport(ios, { timeZone: 'Asia/Dubai' });
    expect(msgs[0]!.sentAt.toISOString()).toBe('2026-11-13T05:05:12.000Z'); // 9:05 Dubai (UTC+4)
    expect(msgs[1]).toMatchObject({ text: '', attachments: ['00000003-PHOTO-2026-11-13-12-30-00.jpg'] });
    expect(msgs[1]!.sentAt.toISOString()).toBe('2026-11-13T08:30:00.000Z');
  });

  it('gives the same hash to the same message, so overlapping exports de-duplicate', () => {
    const a = parseChatExport(fixture);
    const b = parseChatExport(fixture.split('\n').slice(4).join('\n'));
    expect(b.map((m) => m.hash)).toEqual(a.slice(1).map((m) => m.hash).slice(0, b.length));
  });

  it('reads a zip export with its media', () => {
    const zip = Buffer.from(
      zipSync({ 'WhatsApp Chat with Demo Co x SySpree.txt': new TextEncoder().encode(fixture), 'IMG-20261105-WA0001.jpg': new Uint8Array([1, 2, 3]) }),
    );
    const chat = readChatExport('WhatsApp Chat with Demo Co x SySpree.zip', zip);
    expect(chat.chatName).toBe('Demo Co x SySpree');
    expect(chat.media.get('IMG-20261105-WA0001.jpg')).toEqual(Buffer.from([1, 2, 3]));
    expect(readChatExport('WhatsApp Chat - Team.txt', Buffer.from(fixture)).chatName).toBe('Team');
  });

  it('converts wall-clock times across daylight saving', () => {
    expect(zonedTime(2026, 7, 1, 9, 0, 0, 'Europe/London').toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(zonedTime(2026, 12, 1, 9, 0, 0, 'Europe/London').toISOString()).toBe('2026-12-01T09:00:00.000Z');
  });
});

describe('triage', () => {
  const input: TriageInput = {
    channel: 'EMAIL',
    subject: 'Diwali banner',
    bodyMasked: 'Hi team, please swap the homepage banner for the Diwali offer.\nCall me on [phone hidden].\n[credential hidden]',
    clientName: 'Demo Co',
    projects: [
      { id: 'p-seo', department: 'SEO', stage: 'On-page creation', packageName: 'SEO Standard', openTasks: [{ id: 't-seo', title: 'Keyword research', type: 'DELIVERABLE' }] },
      { id: 'p-amc', department: 'AMC', stage: 'Active', packageName: 'AMC 10 hours', openTasks: [] },
    ],
  };

  it('the prompt carries masked text and project ids, never raw contact details', () => {
    const prompt = triagePrompt(input);
    expect(prompt).toContain('[phone hidden]');
    expect(prompt).toContain('p-amc');
    expect(prompt).not.toMatch(/@|\+91/);
  });

  it('the fake suggests a change request task on the website project', async () => {
    const r = await new FakeClassifier().classify(input);
    expect(r.suggestion).toMatchObject({ category: 'CHANGE_REQUEST', action: 'CREATE_TASK', projectId: 'p-amc', suggestedTitle: 'Swap the homepage banner for the Diwali offer' });
    expect(TriageOutput.safeParse(r.suggestion).success).toBe(true);
  });

  it('drops ids that are not the client’s, and downgrades the action to match', () => {
    const base: TriageOutput = { category: 'ASSET_SHARED', projectId: 'p-seo', action: 'ATTACH_TO_TASK', taskId: 'someone-elses-task', suggestedTitle: ' x ', suggestedPriority: 'LOW', summary: 's', confidence: 3 };
    expect(sanitize(base, input)).toMatchObject({ action: 'CREATE_TASK', taskId: null, projectId: 'p-seo', suggestedTitle: 'x', confidence: 1 });
    expect(sanitize({ ...base, projectId: 'p-other' }, input)).toMatchObject({ action: 'NONE', projectId: null });
  });
});
