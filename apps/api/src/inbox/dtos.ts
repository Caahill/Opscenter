// Phase 1D response DTOs and mappers. Every property names a row in packages/policy fields.ts.
// Addresses, numbers and the original body are decrypted only for viewers allowed to see them
// (Admin, the client's PM); everyone else gets labels and the masked text (TechSpec 5.3, 5.4).
import type { Communication, Mailbox } from '@opshub/db';
import { alt, defineDto, label, present, type Presentable } from '@opshub/policy';
import type { CryptoService } from '../crypto/crypto.service';
import type { AuthedViewer } from '../common/request';
import type { StoredAttachment } from './store';
import type { StoredTriage } from './classify';

export const COMM_INCLUDE = {
  client: { select: { companyName: true, pmId: true } },
  mailbox: { select: { label: true, address: true, ownerUserId: true } },
} as const;

export type CommRow = Communication & {
  client: { companyName: string; pmId: string } | null;
  mailbox: { label: string; address: string; ownerUserId: string | null } | null;
};

export interface PresentCtx {
  viewer: AuthedViewer;
  crypto: CryptoService;
  names: Map<string, string>;
  contactLabels: Map<string, string>;
  /** Per viewer: whether this message arrived since they last opened its thread. */
  isUnread?: (c: CommRow) => boolean;
}

export const MessageDto = defineDto('Communication', {
  id: 'communication.id',
  channel: 'communication.channel',
  direction: 'communication.direction',
  threadKey: 'communication.threadKey',
  clientId: 'communication.clientId',
  clientName: 'communication.clientName',
  projectId: 'communication.projectId',
  taskId: 'communication.taskId',
  sender: 'communication.sender',
  from: 'communication.from',
  to: 'communication.to',
  cc: 'communication.cc',
  subject: 'communication.subject',
  body: 'communication.body',
  snippet: 'communication.snippet',
  attachments: 'communication.attachments',
  sentAt: 'communication.sentAt',
  sentByName: 'communication.sentByName',
  mailboxLabel: 'communication.mailboxLabel',
  triageState: 'communication.triageState',
  triage: 'communication.triage',
  category: 'communication.category',
  triagedByName: 'communication.triagedByName',
  linkMethod: 'communication.linkMethod',
  unread: 'communication.unread',
});

/** The client-side party as a label: "Demo Co · Marketing contact". */
export function clientPartyLabel(c: CommRow, contactLabels: Map<string, string>): string {
  if (!c.client) return c.channel === 'WHATSAPP' ? 'Unmatched number' : 'Unmatched sender';
  const contact = c.contactId ? contactLabels.get(c.contactId) : undefined;
  return label(c.client.companyName, contact ?? (c.channel === 'WHATSAPP' && c.importId ? 'WhatsApp group member' : 'Unknown sender'));
}

export function ourPartyLabel(c: CommRow, names: Map<string, string>): string {
  return (c.sentById ? names.get(c.sentById) : null) ?? (c.mailbox?.label || null) ?? 'SySpree team';
}

/**
 * Record context for the field policy. An unmatched message belongs to no client: the PMs and
 * Admin who can reach it need the real sender to link it, so they are treated as its PM.
 */
export function commContext(c: CommRow, viewer: AuthedViewer): { clientPmId: string | null; entityId: string } {
  const pmId = c.client?.pmId ?? (viewer.roles.includes('PM') ? viewer.userId : null);
  return { clientPmId: pmId, entityId: c.id };
}

export const snippetOf = (masked: string) => masked.replace(/\s+/g, ' ').trim().slice(0, 160);

export function presentMessage(c: CommRow, x: PresentCtx): Presentable {
  const aad = `communication:${c.id}`;
  const open = (enc: Uint8Array) => x.crypto.decryptWith('pii', enc, aad);
  const openList = async (enc: Uint8Array | null) => (enc ? (JSON.parse(await open(enc)) as string[]) : []);
  const theirs = clientPartyLabel(c, x.contactLabels);
  const ours = ourPartyLabel(c, x.names);
  const inbound = c.direction === 'INBOUND';
  const attachments = (c.attachments as unknown as StoredAttachment[]).map((a, index) => ({ index, fileName: a.fileName, contentType: a.contentType, size: a.size }));
  return present(
    MessageDto,
    {
      id: c.id,
      channel: c.channel,
      direction: c.direction,
      threadKey: c.threadKey,
      clientId: c.clientId,
      clientName: c.client?.companyName ?? null,
      projectId: c.projectId,
      taskId: c.taskId,
      sender: inbound ? theirs : ours,
      from: alt({ full: () => open(c.fromEnc), label: inbound ? theirs : ours }),
      to: alt({ full: () => openList(c.toEnc), label: inbound ? ours : theirs }),
      cc: alt({ full: () => openList(c.ccEnc), label: c.ccEnc ? theirs : null }),
      subject: alt({ full: () => c.subject, masked: c.subjectMasked }),
      body: alt({ full: () => open(c.bodyEnc), masked: c.bodyMasked }),
      snippet: snippetOf(c.bodyMasked),
      attachments,
      sentAt: c.sentAt,
      sentByName: c.sentById ? (x.names.get(c.sentById) ?? null) : null,
      mailboxLabel: c.mailbox ? c.mailbox.label || c.mailbox.address : null,
      triageState: c.triageState,
      // Built from masked text only, so safe for every viewer of the message.
      triage: (c.triage as unknown as StoredTriage | null) ?? null,
      category: c.category,
      triagedByName: c.triagedById ? (x.names.get(c.triagedById) ?? null) : null,
      linkMethod: c.linkMethod,
      unread: x.isUnread ? x.isUnread(c) : false,
    },
    commContext(c, x.viewer),
  );
}

export const ThreadSummaryDto = defineDto('CommunicationThread', {
  threadKey: 'thread.threadKey',
  channel: 'thread.channel',
  clientId: 'thread.clientId',
  clientName: 'thread.clientName',
  projectId: 'thread.projectId',
  sender: 'thread.sender',
  subject: 'thread.subject',
  snippet: 'thread.snippet',
  lastAt: 'thread.lastAt',
  lastDirection: 'thread.lastDirection',
  messageCount: 'thread.messageCount',
  needsTriage: 'thread.needsTriage',
  unmatched: 'thread.unmatched',
  mailboxLabel: 'thread.mailboxLabel',
  unread: 'thread.unread',
});

/** One row per thread, from its latest message the viewer can see. */
export function presentThreadSummary(latest: CommRow, stats: { count: number; needsTriage: boolean; subject: CommRow; unread: boolean }, x: PresentCtx): Presentable {
  const theirs = clientPartyLabel(latest, x.contactLabels);
  return present(
    ThreadSummaryDto,
    {
      threadKey: latest.threadKey,
      channel: latest.channel,
      clientId: latest.clientId,
      clientName: latest.client?.companyName ?? null,
      projectId: latest.projectId,
      sender: latest.direction === 'INBOUND' ? theirs : `To ${theirs}`,
      subject: alt({ full: () => stats.subject.subject, masked: stats.subject.subjectMasked }),
      snippet: snippetOf(latest.bodyMasked),
      lastAt: latest.sentAt,
      lastDirection: latest.direction,
      messageCount: stats.count,
      needsTriage: stats.needsTriage,
      unmatched: latest.clientId === null,
      mailboxLabel: latest.mailbox ? latest.mailbox.label || latest.mailbox.address : null,
      unread: stats.unread,
    },
    commContext(latest, x.viewer),
  );
}

export const ThreadListDto = defineDto('CommunicationThreadList', { threads: 'threadList.threads', nextBefore: 'threadList.nextBefore' });

export const ThreadDetailDto = defineDto('CommunicationThreadDetail', {
  threadKey: 'threadDetail.threadKey',
  channel: 'threadDetail.channel',
  clientId: 'threadDetail.clientId',
  clientName: 'threadDetail.clientName',
  messages: 'threadDetail.messages',
  windowOpenUntil: 'threadDetail.windowOpenUntil',
  mailboxId: 'threadDetail.mailboxId',
});

export const TriageResultDto = defineDto('TriageResult', { message: 'triageResult.message', task: 'triageResult.task' });
export const SendResultDto = defineDto('SendResult', { message: 'sendResult.message' });

export const ImportResultDto = defineDto('WhatsAppImport', {
  id: 'import.id',
  chatName: 'import.chatName',
  messages: 'import.messages',
  duplicates: 'import.duplicates',
  media: 'import.media',
  threadKey: 'import.threadKey',
});

export const SearchResultsDto = defineDto('SearchResults', {
  communications: 'search.communications',
  tasks: 'search.tasks',
  clients: 'search.clients',
  tookMs: 'search.tookMs',
});

export const MailboxDto = defineDto('Mailbox', {
  id: 'mailbox.id',
  address: 'mailbox.address',
  label: 'mailbox.label',
  ownerUserId: 'mailbox.ownerUserId',
  ownerName: 'mailbox.ownerName',
  active: 'mailbox.active',
  lastSyncAt: 'mailbox.lastSyncAt',
  syncError: 'mailbox.syncError',
  watchExpiry: 'mailbox.watchExpiry',
  backfillDoneAt: 'mailbox.backfillDoneAt',
  mode: 'mailbox.mode',
});

export const presentMailbox = (m: Mailbox, names: Map<string, string>, mode: 'live' | 'fake') =>
  present(MailboxDto, {
    id: m.id,
    address: m.address,
    label: m.label,
    ownerUserId: m.ownerUserId,
    ownerName: m.ownerUserId ? (names.get(m.ownerUserId) ?? null) : null,
    active: m.active,
    lastSyncAt: m.lastSyncAt,
    syncError: m.syncError,
    watchExpiry: m.watchExpiry,
    backfillDoneAt: m.backfillDoneAt,
    mode,
  });

export const InboxSettingsDto = defineDto('InboxSettings', {
  gmailMode: 'inboxSettings.gmailMode',
  whatsappMode: 'inboxSettings.whatsappMode',
  aiMode: 'inboxSettings.aiMode',
  whatsappTemplates: 'inboxSettings.whatsappTemplates',
});
