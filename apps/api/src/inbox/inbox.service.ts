// Unified inbox reads (PRD 2.2, 2.3): threads per viewer scope, one thread, the unmatched queue and
// manual linking. Scope is applied in the SQL where (AGENTS.md rule 5).
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import { present, scopesFor, type Scope } from '@opshub/policy';
import { WHATSAPP_WINDOW_MS } from '@opshub/integrations';
import type { LinkMessageInput, ListThreadsQuery } from '@opshub/shared';
import { ActivityService } from '../common/activity.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ClientsService } from '../clients/clients.service';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { COMM_INCLUDE, ThreadDetailDto, ThreadListDto, type CommRow } from './dtos';
import { IngestService, MessagesQueries, NEEDS_TRIAGE } from './messages';
import type { StoredAttachment } from './store';

const ROW_CAP = 600;

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly messages: MessagesQueries,
    private readonly ingest: IngestService,
    private readonly clients: ClientsService,
    private readonly crypto: CryptoService,
    private readonly activity: ActivityService,
  ) {}

  async threads(v: AuthedViewer, scopes: Scope[], q: ListThreadsQuery) {
    const scopeWhere = await this.scopes.communicationWhere(v, scopes);
    const filters: Prisma.CommunicationWhereInput[] = [
      q.channel ? { channel: q.channel } : {},
      q.clientId ? { clientId: q.clientId } : {},
      q.projectId ? { projectId: q.projectId } : {},
      q.before ? { sentAt: { lt: new Date(q.before) } } : {},
      q.view === 'triage' ? NEEDS_TRIAGE : {},
      q.view === 'unmatched' ? { clientId: null } : {},
      q.view === 'sent' ? { direction: 'OUTBOUND' } : {},
    ];
    const rows = await this.prisma.communication.findMany({
      where: { AND: [scopeWhere, ...filters] },
      include: COMM_INCLUDE,
      orderBy: { sentAt: 'desc' },
      take: ROW_CAP,
    });
    const page = await this.messages.summaries(v, scopeWhere, rows, q.limit);
    return present(ThreadListDto, { threads: page.items, nextBefore: page.more || rows.length === ROW_CAP ? page.lastAt : null });
  }

  /** Messages of one thread the viewer can see, oldest first. 404 when they see none. */
  async thread(v: AuthedViewer, scopes: Scope[], threadKey: string) {
    const rows = await this.prisma.communication.findMany({
      where: { AND: [await this.scopes.communicationWhere(v, scopes), { threadKey }] },
      include: COMM_INCLUDE,
      orderBy: { sentAt: 'asc' },
      take: 200,
    });
    if (!rows.length) throw Errors.notFound('Thread');
    const lastInbound = [...rows].reverse().find((r) => r.direction === 'INBOUND');
    const latest = rows.at(-1)!;
    return present(ThreadDetailDto, {
      threadKey,
      channel: latest.channel,
      clientId: latest.clientId,
      clientName: latest.client?.companyName ?? null,
      messages: await this.messages.present(v, rows),
      windowOpenUntil: latest.channel === 'WHATSAPP' && lastInbound && !lastInbound.importId ? new Date(lastInbound.sentAt.getTime() + WHATSAPP_WINDOW_MS) : null,
      mailboxId: [...rows].reverse().find((r) => r.mailboxId)?.mailboxId ?? null,
    });
  }

  /** The viewer opened the thread: its messages stop being "New" for them. 404 outside their scope. */
  async markRead(v: AuthedViewer, scopes: Scope[], threadKey: string) {
    const visible = await this.prisma.communication.findFirst({ where: { AND: [await this.scopes.communicationWhere(v, scopes), { threadKey }] }, select: { id: true } });
    if (!visible) throw Errors.notFound('Thread');
    await this.messages.markRead(v, threadKey);
  }

  /**
   * PRD 2.3: a PM links an unmatched message (and its thread) to a client. Saving the sender as a
   * contact also re-links their other messages, past and future (PRD edge case).
   */
  async link(v: AuthedViewer, scopes: Scope[], id: string, input: LinkMessageInput) {
    const msg = await this.scopes.requireCommunication(v, scopes, id);
    if (msg.clientId) throw Errors.conflict('This message is already linked to a client');
    const client = await this.prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw Errors.notFound('Client');

    let contactId: string | null = null;
    if (input.saveAsContact) {
      const sender = await this.crypto.decryptWith('pii', msg.fromEnc, `communication:${msg.id}`);
      const isEmail = sender.includes('@');
      if (!isEmail && msg.channel === 'EMAIL') throw Errors.validation('saveAsContact: the sender has no address to save');
      // ClientsService checks the viewer may manage this client's contacts and relinks by hash.
      const contact = await this.clients.createContact(v, scopesFor(v.roles, 'client.manage'), client.id, {
        role: input.saveAsContact.role,
        name: input.saveAsContact.name,
        label: input.saveAsContact.label || undefined,
        ...(isEmail ? { email: sender } : { phone: sender.startsWith('+') ? sender : `+${sender.replace(/\D/g, '')}` }),
      });
      contactId = (contact.data as { id: string }).id;
    }
    await this.ingest.relink({ threadKeys: [msg.threadKey], fromHashes: msg.fromHash ? [msg.fromHash] : [] }, { clientId: client.id, contactId, method: contactId ? 'CONTACT' : 'MANUAL' });
    await this.activity.log({ kind: 'MESSAGE_LINKED', actorId: v.userId, to: { communicationId: msg.id, clientId: client.id, contactSaved: Boolean(contactId) } });
    return this.thread(v, scopesFor(v.roles, 'inbox.read'), msg.threadKey);
  }

  async attachment(v: AuthedViewer, scopes: Scope[], id: string, index: number): Promise<StoredAttachment> {
    const msg = await this.scopes.requireCommunication(v, scopes, id);
    const a = (msg.attachments as unknown as StoredAttachment[])[index];
    if (!a) throw Errors.notFound('Attachment');
    return a;
  }

  async rows(where: Prisma.CommunicationWhereInput): Promise<CommRow[]> {
    return this.prisma.communication.findMany({ where, include: COMM_INCLUDE, orderBy: { sentAt: 'asc' } });
  }
}
