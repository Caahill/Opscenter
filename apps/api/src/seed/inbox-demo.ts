// Phase 1D demo inbox: a shared mailbox and Demo Co messages that exercise every masking path
// (contact addresses, numbers and a login in a body), plus a 2023 email for search, a WhatsApp
// chat and an unmatched sender. Invented data only (AGENTS.md rule 9). Runs once per database.
import type { PrismaClient } from '@opshub/db';
import { FakeClassifier } from '@opshub/integrations';
import type { CryptoService } from '../crypto/crypto.service';
import { DEMO_CLIENT, DEMO_CONTACTS, DEMO_MESSAGE } from '../dev/preview-fixture';
import { classifyCommunication } from '../inbox/classify';
import { partyHash, storeCommunication } from '../inbox/store';

export const DEMO_MAILBOX = { address: 'support@syspree.example', label: 'SySpree Support' };
export const DEMO_PERSONAL_MAILBOX = { address: 'pavan@syspree.example', label: 'Pavan (PM)' };

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

export async function seedInboxDemo(prisma: PrismaClient, crypto: CryptoService): Promise<boolean> {
  if (await prisma.mailbox.findUnique({ where: { address: DEMO_MAILBOX.address } })) return false;
  const client = await prisma.client.findFirst({ where: { companyName: DEMO_CLIENT.companyName } });
  const pm = await prisma.user.findUnique({ where: { email: 'pm@dev.local' } });
  const member = await prisma.user.findUnique({ where: { email: 'member.seo@dev.local' } });
  if (!client || !pm || !member) return false;

  const seal = async (id: string) => (await crypto.encrypt('fake', 'vault', `mailbox:${id}`)).ciphertext;
  const shared = await prisma.mailbox.create({ data: { id: 'demo-mailbox-support', address: DEMO_MAILBOX.address, label: DEMO_MAILBOX.label, oauthEnc: await seal('demo-mailbox-support'), historyId: '1000' } });
  const personal = await prisma.mailbox.create({
    data: { id: 'demo-mailbox-pavan', address: DEMO_PERSONAL_MAILBOX.address, label: DEMO_PERSONAL_MAILBOX.label, ownerUserId: pm.id, oauthEnc: await seal('demo-mailbox-pavan'), historyId: '1000' },
  });

  const deps = { prisma, crypto };
  const [marketing, billing] = DEMO_CONTACTS;
  const email = (o: { id: string; thread: string; from: string; to: string; subject: string; text: string; at: Date; mailboxId?: string; outbound?: boolean; sentById?: string }) =>
    storeCommunication(deps, {
      channel: 'EMAIL',
      direction: o.outbound ? 'OUTBOUND' : 'INBOUND',
      mailboxId: o.mailboxId ?? shared.id,
      externalId: o.id,
      threadKey: o.thread,
      from: o.from,
      to: [o.to],
      cc: [],
      subject: o.subject,
      text: o.text,
      sentAt: o.at,
      messageIdHeader: `<${o.id}@mail.example>`,
      sentById: o.sentById ?? null,
    });

  // 1. A change request carrying an address, a phone number and a login: triaged, waiting for a PM.
  const banner = await email({ id: 'demo-msg-banner', thread: 'demo-thread-banner', from: marketing.email, to: shared.address, subject: 'Diwali banner', text: DEMO_MESSAGE.body, at: hoursAgo(48) });
  await email({
    id: 'demo-msg-banner-reply',
    thread: 'demo-thread-banner',
    from: shared.address,
    to: marketing.email,
    subject: 'Re: Diwali banner',
    text: 'Thanks, we will swap the banner today and send a preview.',
    at: hoursAgo(47),
    outbound: true,
    sentById: pm.id,
  });

  // 2. Already triaged onto Manoj's SEO task, so a Team Member can open it (masked).
  const memberTask = await prisma.task.findFirst({ where: { assigneeId: member.id, project: { clientId: client.id, department: 'SEO' } }, orderBy: { createdAt: 'asc' } });
  const faq = await email({
    id: 'demo-msg-faq',
    thread: 'demo-thread-faq',
    from: marketing.email,
    to: shared.address,
    subject: 'FAQ section for the SEO pages',
    text: `Hi team,\nPlease add the new FAQ section to the SEO pages we discussed.\nCall me on ${marketing.phone} or write to ${marketing.email} if anything is unclear.\nThanks`,
    at: hoursAgo(24),
  });
  if (memberTask) {
    await prisma.communication.update({
      where: { id: faq.id },
      data: { triageState: 'CONFIRMED', category: 'ASSET_SHARED', projectId: memberTask.projectId, taskId: memberTask.id, triagedById: pm.id, triagedAt: hoursAgo(23), triageOutcome: { decision: 'CONFIRM', action: 'ATTACH_TO_TASK', model: 'seed', edited: [] } },
    });
  }

  // 3. A 2023 billing email: found by "Demo renewal" in search (PRD 2.2), visible to Accounts masked.
  const renewal = await email({
    id: 'demo-msg-renewal-2023',
    thread: 'demo-thread-renewal-2023',
    from: billing.email,
    to: shared.address,
    subject: 'SEO contract renewal 2023',
    text: `Hello,\nPlease send the renewal quote for the SEO retainer and the GST invoice for August.\nRegards,\nAccounts team\n${billing.phone}`,
    at: new Date('2023-08-14T06:30:00.000Z'),
  });
  await prisma.communication.update({
    where: { id: renewal.id },
    data: { triageState: 'CONFIRMED', category: 'BILLING', triagedById: pm.id, triagedAt: new Date('2023-08-14T08:00:00.000Z'), triageOutcome: { decision: 'CONFIRM', action: 'NONE', model: 'seed', edited: [] } },
  });

  // 4. WhatsApp one-to-one from the marketing contact's number.
  const waNumber = `+${marketing.phone.replace(/\D/g, '')}`;
  const wa = await storeCommunication(deps, {
    channel: 'WHATSAPP',
    direction: 'INBOUND',
    mailboxId: null,
    externalId: 'wamid.demo-banner-question',
    threadKey: `wa:${partyHash(crypto, waNumber)}`,
    from: waNumber,
    to: [],
    cc: [],
    subject: null,
    text: 'Hi, is the Diwali banner live yet? Please share a screenshot.',
    sentAt: hoursAgo(3),
  });

  // 5. An unknown sender in the shared mailbox (Unmatched queue), and one in Pavan's own mailbox,
  //    which only Pavan sees (personal mail stays personal).
  await email({ id: 'demo-msg-unmatched', thread: 'demo-thread-unmatched', from: 'partnerships@unknown-agency.example', to: shared.address, subject: 'Partnership enquiry', text: 'Hello, we would like to discuss a referral partnership. Are you free next week?', at: hoursAgo(5) });
  await email({ id: 'demo-msg-personal', thread: 'demo-thread-personal', from: 'newsletter@vendor.example', to: personal.address, subject: 'Your weekly digest', text: 'Here is your weekly digest.', at: hoursAgo(6), mailboxId: personal.id });

  const classifier = new FakeClassifier();
  for (const id of [banner.id, wa.id]) await classifyCommunication(prisma, classifier, id);
  return true;
}
