// Shared inbox plumbing: loading and presenting messages within the viewer's scope (MessagesQueries)
// and storing new ones with their follow-up jobs (IngestService).
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import { scopesFor, type Presentable, type Scope } from '@opshub/policy';
import { DirectoryService } from '../common/directory.service';
import type { AuthedViewer } from '../common/request';
import { CryptoService } from '../crypto/crypto.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { StorageService } from '../storage/storage.service';
import { NotifyService } from '../notifications/notify.service';
import { RealtimeService } from '../realtime/realtime.gateway';
import { clientPartyLabel, COMM_INCLUDE, presentMessage, presentThreadSummary, snippetOf, type CommRow, type PresentCtx } from './dtos';
import { relink, storeCommunication, type Link, type StoreInput, type StoreResult } from './store';

export const NEEDS_TRIAGE: Prisma.CommunicationWhereInput = { direction: 'INBOUND', clientId: { not: null }, triageState: { in: ['NEW', 'SUGGESTED'] } };

@Injectable()
export class MessagesQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly crypto: CryptoService,
    private readonly directory: DirectoryService,
  ) {}

  async context(v: AuthedViewer, rows: CommRow[]): Promise<PresentCtx> {
    const contactIds = [...new Set(rows.map((r) => r.contactId).filter((id): id is string => Boolean(id)))];
    const [contacts, names] = await Promise.all([
      contactIds.length ? this.prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, label: true } }) : [],
      this.directory.names(rows.flatMap((r) => [r.sentById, r.triagedById])),
    ]);
    return { viewer: v, crypto: this.crypto, names, contactLabels: new Map(contacts.map((c) => [c.id, c.label])) };
  }

  /** When the viewer last opened each of these threads. */
  async readMarks(v: AuthedViewer, threadKeys: string[]): Promise<Map<string, Date>> {
    if (!threadKeys.length) return new Map();
    const rows = await this.prisma.threadRead.findMany({ where: { userId: v.userId, threadKey: { in: [...new Set(threadKeys)] } } });
    return new Map(rows.map((r) => [r.threadKey, r.lastReadAt]));
  }

  /**
   * A message is unread when it arrived after the viewer last opened its thread. In a thread they
   * have never opened, only the latest message from someone else counts, not the whole history.
   */
  async present(v: AuthedViewer, rows: CommRow[]): Promise<Presentable[]> {
    const [ctx, marks] = await Promise.all([this.context(v, rows), this.readMarks(v, rows.map((r) => r.threadKey))]);
    const latestOther = new Map<string, CommRow>();
    for (const r of rows) {
      if (r.sentById === v.userId) continue;
      const cur = latestOther.get(r.threadKey);
      if (!cur || r.sentAt >= cur.sentAt) latestOther.set(r.threadKey, r);
    }
    ctx.isUnread = (c) => {
      if (c.sentById === v.userId) return false;
      const read = marks.get(c.threadKey);
      return read ? c.createdAt > read : latestOther.get(c.threadKey)?.id === c.id;
    };
    return rows.map((r) => presentMessage(r, ctx));
  }

  /** Records that the viewer has seen the thread up to now. */
  async markRead(v: AuthedViewer, threadKey: string): Promise<void> {
    const lastReadAt = new Date();
    await this.prisma.threadRead.upsert({ where: { userId_threadKey: { userId: v.userId, threadKey } }, update: { lastReadAt }, create: { userId: v.userId, threadKey, lastReadAt } });
  }

  /** Thread rows from messages newest first: one per thread, with counts inside the viewer's scope. */
  async summaries(v: AuthedViewer, scopeWhere: Prisma.CommunicationWhereInput, newestFirst: CommRow[], limit: number) {
    const latest: CommRow[] = [];
    const seen = new Set<string>();
    for (const r of newestFirst) {
      if (seen.has(r.threadKey)) continue;
      seen.add(r.threadKey);
      latest.push(r);
      if (latest.length === limit) break;
    }
    const keys = latest.map((r) => r.threadKey);
    const [counts, triage, firsts] = await Promise.all([
      this.prisma.communication.groupBy({ by: ['threadKey'], where: { AND: [scopeWhere, { threadKey: { in: keys } }] }, _count: { _all: true } }),
      this.prisma.communication.groupBy({ by: ['threadKey'], where: { AND: [scopeWhere, NEEDS_TRIAGE, { threadKey: { in: keys } }] }, _count: { _all: true } }),
      // The thread's subject comes from its first message; replies may change it.
      this.prisma.communication.findMany({ where: { AND: [scopeWhere, { threadKey: { in: keys } }] }, orderBy: { sentAt: 'asc' }, distinct: ['threadKey'], include: COMM_INCLUDE }),
    ]);
    const count = new Map(counts.map((c) => [c.threadKey, c._count._all]));
    const needs = new Set(triage.map((c) => c.threadKey));
    const first = new Map(firsts.map((f) => [f.threadKey, f]));
    const [ctx, marks] = await Promise.all([this.context(v, latest), this.readMarks(v, keys)]);
    // Unread: a message from someone else arrived after the viewer last opened the thread.
    const unread = new Set(
      newestFirst
        .filter((r) => r.sentById !== v.userId && (!marks.has(r.threadKey) || r.createdAt > marks.get(r.threadKey)!))
        .map((r) => r.threadKey),
    );
    return {
      items: latest.map((r) =>
        presentThreadSummary(r, { count: count.get(r.threadKey) ?? 1, needsTriage: needs.has(r.threadKey), subject: first.get(r.threadKey) ?? r, unread: unread.has(r.threadKey) }, ctx),
      ),
      /** More threads exist beyond this page (callers also check whether their row fetch was capped). */
      more: new Set(newestFirst.map((r) => r.threadKey)).size > latest.length,
      lastAt: latest.at(-1)?.sentAt ?? null,
    };
  }

  /** The client message a task was made from, if the viewer may see it. */
  async sourceMessage(v: AuthedViewer, commId: string | null): Promise<Presentable | null> {
    if (!commId) return null;
    const scopes = scopesFor(v.roles, 'inbox.read');
    if (!scopes.length) return null;
    const row = await this.prisma.communication.findFirst({ where: { AND: [{ id: commId }, await this.scopes.communicationWhere(v, scopes)] }, include: COMM_INCLUDE });
    return row ? (await this.present(v, [row]))[0]! : null;
  }

  /** Client 360 "recent communications" (PRD 1.2). */
  async recentForClient(v: AuthedViewer, clientId: string, take = 10): Promise<Presentable[]> {
    const scopes: Scope[] = scopesFor(v.roles, 'inbox.read');
    if (!scopes.length) return [];
    const scopeWhere = await this.scopes.communicationWhere(v, scopes);
    const rows = await this.prisma.communication.findMany({
      where: { AND: [scopeWhere, { clientId }] },
      include: COMM_INCLUDE,
      orderBy: { sentAt: 'desc' },
      take: take * 5,
    });
    return (await this.summaries(v, scopeWhere, rows, take)).items;
  }
}

@Injectable()
export class IngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
    private readonly jobs: JobsService,
    private readonly scopes: ScopeService,
    private readonly messages: MessagesQueries,
    private readonly notify: NotifyService,
    private readonly realtime: RealtimeService,
  ) {
    jobs.register('inbox.announce', (d) => this.announce(String(d.id)));
  }

  /** Stores a message (idempotent by external id) and queues triage for new inbound client mail. */
  async ingest(input: StoreInput): Promise<StoreResult> {
    const result = await storeCommunication({ prisma: this.prisma, crypto: this.crypto, storage: this.storage }, input);
    if (result.created && result.clientId && input.direction === 'INBOUND' && (input.triageState ?? 'NEW') === 'NEW') {
      await this.jobs.enqueue('triage.classify', { id: result.id }, `triage:${result.id}`);
    }
    // Live updates and the PM's alert for messages arriving now (not imported history).
    if (result.created && input.direction === 'INBOUND' && !input.importId) await this.jobs.enqueue('inbox.announce', { id: result.id }, `announce:${result.id}`);
    return result;
  }

  /**
   * `inbox.message_new` to everyone whose scope reaches the message, each with their own masked
   * thread row; and a CLIENT_MESSAGE notification to the client's PM (PRD 5.3), one per thread.
   */
  private async announce(id: string) {
    const row = await this.prisma.communication.findUnique({ where: { id }, include: COMM_INCLUDE });
    if (!row) return { recipients: 0 };
    const users = await this.prisma.user.findMany({ where: { active: true }, select: { id: true, roles: true, teamId: true, name: true, email: true } });
    let recipients = 0;
    for (const u of users) {
      const v: AuthedViewer = { userId: u.id, roles: u.roles, teamId: u.teamId, name: u.name, email: u.email };
      const scopes = scopesFor(v.roles, 'inbox.read');
      if (!scopes.length) continue;
      const scopeWhere = await this.scopes.communicationWhere(v, scopes);
      if (!(await this.prisma.communication.findFirst({ where: { AND: [{ id }, scopeWhere] }, select: { id: true } }))) continue;
      recipients++;
      await this.realtime.emitTo(u.id, 'inbox.message_new', async (viewer) => (await this.messages.summaries(viewer, scopeWhere, [row], 1)).items[0] ?? null);
    }
    const pm = row.client ? await this.realtime.viewer(row.client.pmId) : null;
    if (row.client && pm) {
      const ctx = await this.messages.context(pm, [row]);
      const from = clientPartyLabel(row, ctx.contactLabels);
      await this.notify.notify([row.client.pmId], {
        kind: 'CLIENT_MESSAGE',
        title: `New ${row.channel === 'WHATSAPP' ? 'WhatsApp message' : 'email'} from ${from}`,
        body: (row.subjectMasked ?? snippetOf(row.bodyMasked)).slice(0, 140),
        link: `/inbox/${encodeURIComponent(row.threadKey)}`,
        dedupeKey: `client-msg:${row.threadKey}`,
      });
    }
    return { recipients };
  }

  /** Links earlier unmatched messages (by sender hash or thread) and queues their triage. */
  async relink(where: { fromHashes?: string[]; threadKeys?: string[] }, link: Link): Promise<string[]> {
    const ids = await relink(this.prisma, where, link);
    const inbound = await this.prisma.communication.findMany({ where: { id: { in: ids }, direction: 'INBOUND' }, select: { id: true } });
    for (const r of inbound) await this.jobs.enqueue('triage.classify', { id: r.id }, `triage:${r.id}`);
    return ids;
  }
}
