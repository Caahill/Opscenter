// Ingest core (TechSpec 7.1, 7.2, 10): store a message encrypted with its masked text, link it to
// a client, and index the masked text for search. Plain functions so the demo seed can use them.
import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@opshub/db';
import { maskBody } from '@opshub/policy';
import type { Channel, Direction } from '@opshub/shared';
import type { CryptoService } from '../crypto/crypto.service';

/** Webmail domains are never domain-linked: those senders must be saved as contacts (PRD edge case). */
export const FREE_MAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'rediffmail.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'yandex.com',
  'gmx.com',
]);

export interface StoredAttachment {
  key: string;
  fileName: string;
  contentType: string;
  size: number;
}

export interface Link {
  clientId: string;
  contactId: string | null;
  method: 'CONTACT' | 'DOMAIN' | 'THREAD' | 'MANUAL';
}

export interface StoreInput {
  channel: Channel;
  direction: Direction;
  mailboxId: string | null;
  externalId: string;
  threadKey: string;
  /** Address, number or (Route B) display name, exactly as received. */
  from: string;
  to: string[];
  cc: string[];
  subject: string | null;
  text: string;
  sentAt: Date;
  messageIdHeader?: string | null;
  attachments?: Array<{ fileName: string; contentType: string; data: Buffer }>;
  sentById?: string | null;
  importId?: string | null;
  /** Set when the caller already knows the client (sending, imports). Otherwise linked here. */
  link?: Link | null;
  projectId?: string | null;
  taskId?: string | null;
  triageState?: 'NEW' | 'CONFIRMED' | 'DISMISSED';
}

export interface StoreDeps {
  prisma: PrismaClient;
  crypto: CryptoService;
  storage?: { put(key: string, body: Buffer, contentType: string): Promise<void> } | null;
}

export interface StoreResult {
  id: string;
  created: boolean;
  clientId: string | null;
}

const isPhone = (s: string) => !s.includes('@') && s.replace(/\D/g, '').length >= 8 && /^[+\d\s()-]+$/.test(s.trim());

/** HMAC of an address or number, matching Contact.emailHash / phoneHash. Names get no hash. */
export function partyHash(crypto: CryptoService, raw: string): string | null {
  const v = raw.trim();
  if (v.includes('@')) return crypto.hash('email', v);
  if (isPhone(v)) return crypto.hash('phone', v.startsWith('+') || v.startsWith('00') ? v : `+${v.replace(/\D/g, '')}`);
  return null;
}

const domainOf = (address: string) => address.split('@')[1]?.toLowerCase() ?? '';

/** Contact hash, then email domain, then an already linked message in the same thread (TechSpec 7.1). */
export async function findLink(
  deps: StoreDeps,
  q: { hashes: string[]; addresses: string[]; threadKey: string },
): Promise<Link | null> {
  const hashes = q.hashes.filter(Boolean);
  if (hashes.length) {
    const contact = await deps.prisma.contact.findFirst({ where: { OR: [{ emailHash: { in: hashes } }, { phoneHash: { in: hashes } }] } });
    if (contact) return { clientId: contact.clientId, contactId: contact.id, method: 'CONTACT' };
  }
  const domains = [...new Set(q.addresses.filter((a) => a.includes('@')).map(domainOf))].filter((d) => d && !FREE_MAIL_DOMAINS.has(d));
  if (domains.length) {
    const clients = await deps.prisma.client.findMany({ where: { emailDomains: { hasSome: domains } }, select: { id: true }, take: 2 });
    if (clients.length === 1) return { clientId: clients[0]!.id, contactId: null, method: 'DOMAIN' };
  }
  const sibling = await deps.prisma.communication.findFirst({ where: { threadKey: q.threadKey, clientId: { not: null } }, orderBy: { sentAt: 'desc' } });
  return sibling ? { clientId: sibling.clientId!, contactId: null, method: 'THREAD' } : null;
}

/** Search text is masked text plus the client's name, so "client + keyword" matches (TechSpec 10). */
export async function refreshSearchVector(prisma: Pick<PrismaClient, '$executeRaw'>, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await prisma.$executeRaw`
    UPDATE "Communication" c
    SET "searchVector" = to_tsvector('english',
      coalesce(c."subjectMasked", '') || ' ' || c."bodyMasked" || ' ' ||
      coalesce((SELECT "companyName" FROM "Client" WHERE id = c."clientId"), ''))
    WHERE c.id = ANY(${ids}::text[])`;
}

const safeName = (n: string) => n.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';

export async function storeCommunication(deps: StoreDeps, input: StoreInput): Promise<StoreResult> {
  const existing = await deps.prisma.communication.findUnique({ where: { externalId: input.externalId }, select: { id: true, clientId: true } });
  if (existing) return { id: existing.id, created: false, clientId: existing.clientId };

  const fromHash = partyHash(deps.crypto, input.from);
  const counterparts = input.direction === 'INBOUND' ? [input.from] : [...input.to, ...input.cc];
  const link =
    input.link ??
    (await findLink(deps, {
      hashes: counterparts.map((c) => partyHash(deps.crypto, c)).filter((h): h is string => h !== null),
      addresses: counterparts,
      threadKey: input.threadKey,
    }));

  const id = randomUUID();
  const aad = `communication:${id}`;
  const seal = async (v: string) => (await deps.crypto.encrypt(v, 'pii', aad)).ciphertext;
  const attachments: StoredAttachment[] = [];
  for (const [i, a] of (input.attachments ?? []).entries()) {
    if (!deps.storage) break;
    const key = `inbox/${id}/${i}-${safeName(a.fileName)}`;
    await deps.storage.put(key, a.data, a.contentType);
    attachments.push({ key, fileName: a.fileName, contentType: a.contentType, size: a.data.length });
  }

  try {
    await deps.prisma.communication.create({
      data: {
        id,
        channel: input.channel,
        direction: input.direction,
        mailboxId: input.mailboxId,
        externalId: input.externalId,
        threadKey: input.threadKey,
        clientId: link?.clientId ?? null,
        contactId: link?.contactId ?? null,
        linkMethod: link?.method ?? null,
        projectId: input.projectId ?? null,
        taskId: input.taskId ?? null,
        fromEnc: await seal(input.from),
        fromHash,
        toEnc: input.to.length ? await seal(JSON.stringify(input.to)) : null,
        ccEnc: input.cc.length ? await seal(JSON.stringify(input.cc)) : null,
        subject: input.subject,
        subjectMasked: input.subject === null ? null : maskBody(input.subject),
        bodyMasked: maskBody(input.text),
        bodyEnc: await seal(input.text),
        attachments: attachments as unknown as Prisma.InputJsonValue,
        sentAt: input.sentAt,
        sentById: input.sentById ?? null,
        messageIdHeader: input.messageIdHeader ?? null,
        importId: input.importId ?? null,
        triageState: link ? (input.triageState ?? 'NEW') : 'UNMATCHED',
      },
    });
  } catch (e) {
    // Two deliveries of the same message raced; the other one won.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const row = await deps.prisma.communication.findUniqueOrThrow({ where: { externalId: input.externalId }, select: { id: true, clientId: true } });
      return { id: row.id, created: false, clientId: row.clientId };
    }
    throw e;
  }
  await refreshSearchVector(deps.prisma, [id]);
  return { id, created: true, clientId: link?.clientId ?? null };
}

/**
 * Links messages to a client after the fact: an unmatched sender saved as a contact (PRD edge
 * case), or a PM linking by hand. Whole threads move together. Returns the ids that changed.
 */
export async function relink(
  prisma: PrismaClient,
  where: { fromHashes?: string[]; threadKeys?: string[] },
  link: Link,
): Promise<string[]> {
  const or: Prisma.CommunicationWhereInput[] = [];
  if (where.fromHashes?.length) or.push({ fromHash: { in: where.fromHashes } });
  if (where.threadKeys?.length) or.push({ threadKey: { in: where.threadKeys } });
  if (!or.length) return [];
  const rows = await prisma.communication.findMany({ where: { clientId: null, OR: or }, select: { id: true, threadKey: true } });
  if (!rows.length) return [];
  const threads = [...new Set(rows.map((r) => r.threadKey))];
  const all = await prisma.communication.findMany({ where: { clientId: null, threadKey: { in: threads } }, select: { id: true } });
  const ids = all.map((r) => r.id);
  await prisma.communication.updateMany({
    where: { id: { in: ids } },
    data: { clientId: link.clientId, linkMethod: link.method, triageState: 'NEW' },
  });
  if (link.contactId && where.fromHashes?.length) {
    await prisma.communication.updateMany({ where: { id: { in: ids }, fromHash: { in: where.fromHashes } }, data: { contactId: link.contactId } });
  }
  await refreshSearchVector(prisma, ids);
  return ids;
}
