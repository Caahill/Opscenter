// Gmail (TechSpec 7.1, 8): connect mailboxes, sync from Pub/Sub pushes (plus a 5-minute safety poll),
// renew watches daily, backfill history, and send. Refresh tokens are sealed with the vault key.
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Mailbox } from '@opshub/db';
import { exchangeGmailCode, gmailAuthUrl, GmailApiError, type GmailClient, type MailboxCredentials, type ParsedEmail } from '@opshub/integrations';
import type { CreateMailboxInput, UpdateMailboxInput } from '@opshub/shared';
import { AuditService } from '../audit/audit.service';
import { DirectoryService } from '../common/directory.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ENV, type Env } from '../config/env';
import { CryptoService } from '../crypto/crypto.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { presentMailbox } from './dtos';
import { IngestService } from './messages';
import { GMAIL, googleOAuth } from './providers';

const domainOf = (a: string) => a.split('@')[1]?.toLowerCase() ?? '';
const DAY_MS = 86_400_000;

@Injectable()
export class GmailService {
  private readonly log = new Logger('Gmail');

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly ingest: IngestService,
    private readonly jobs: JobsService,
    private readonly audit: AuditService,
    private readonly directory: DirectoryService,
    @Inject(GMAIL) readonly client: GmailClient,
    @Inject(ENV) private readonly env: Env,
  ) {
    jobs.register('gmail.sync', (d) => this.sync(String(d.mailboxId)));
    jobs.register('gmail.backfill', (d) => this.backfillPage(String(d.mailboxId)));
    jobs.register('gmail.poll', () => this.pollAll());
    jobs.register('gmail.watch.renew', () => this.renewWatches());
    jobs.schedule('gmail.poll', '*/5 * * * *');
    jobs.schedule('gmail.watch.renew', '0 2 * * *');
  }

  // ---- Mailboxes ----

  async list(v: AuthedViewer, manage: boolean) {
    const rows = await this.prisma.mailbox.findMany({
      where: manage ? {} : { active: true, OR: [{ ownerUserId: null }, ...(v.roles.includes('PM') ? [{ ownerUserId: v.userId }] : [])] },
      orderBy: [{ ownerUserId: 'asc' }, { address: 'asc' }],
    });
    const names = await this.directory.names(rows.map((r) => r.ownerUserId));
    return rows.map((m) => presentMailbox(m, names, this.client.mode));
  }

  private async sealToken(mailboxId: string, token: string) {
    return (await this.crypto.encrypt(token, 'vault', `mailbox:${mailboxId}`)).ciphertext;
  }

  private async credentials(mb: Mailbox): Promise<MailboxCredentials> {
    return { address: mb.address, refreshToken: await this.crypto.decryptWith('vault', mb.oauthEnc, `mailbox:${mb.id}`) };
  }

  private async assertOwner(ownerUserId: string | null) {
    if (!ownerUserId) return;
    const u = await this.prisma.user.findUnique({ where: { id: ownerUserId } });
    if (!u?.active || !u.roles.includes('PM')) throw Errors.validation('ownerUserId: personal mailboxes belong to an active PM');
  }

  /** GMAIL_MODE=fake: Admin adds a mailbox directly. Live mailboxes go through Google consent. */
  async createFake(v: AuthedViewer, input: CreateMailboxInput) {
    if (this.client.mode !== 'fake') throw Errors.invalidState('Connect live mailboxes with Google (Connect mailbox)');
    await this.assertOwner(input.ownerUserId);
    if (await this.prisma.mailbox.findUnique({ where: { address: input.address } })) throw Errors.conflict('That mailbox is already connected');
    const id = randomUUID();
    const creds = { address: input.address, refreshToken: 'fake' };
    const mb = await this.prisma.mailbox.create({
      data: { id, address: input.address, label: input.label, ownerUserId: input.ownerUserId, oauthEnc: await this.sealToken(id, 'fake'), connectedById: v.userId, historyId: (await this.client.profile(creds)).historyId },
    });
    await this.audit.record(v.userId, 'MAILBOX_CONNECTED', 'Mailbox', mb.id, { shared: !input.ownerUserId });
    return presentMailbox(mb, await this.directory.names([mb.ownerUserId]), this.client.mode);
  }

  async update(v: AuthedViewer, id: string, input: UpdateMailboxInput) {
    const before = await this.prisma.mailbox.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('Mailbox');
    if (input.ownerUserId !== undefined) await this.assertOwner(input.ownerUserId);
    const mb = await this.prisma.mailbox.update({ where: { id }, data: input });
    if (input.active === false && before.active) await this.audit.record(v.userId, 'MAILBOX_DISCONNECTED', 'Mailbox', id, {});
    return presentMailbox(mb, await this.directory.names([mb.ownerUserId]), this.client.mode);
  }

  // OAuth state: signed, tied to the Admin who started it, valid for 10 minutes.
  private sign(payload: string) {
    return createHmac('sha256', this.env.HASH_PEPPER).update(`mailbox-oauth:${payload}`).digest('base64url');
  }

  connectUrl(v: AuthedViewer, opts: { label: string; ownerUserId: string | null; loginHint?: string }): string {
    if (this.client.mode !== 'live') throw Errors.invalidState('GMAIL_MODE is fake; add the mailbox directly');
    const payload = Buffer.from(JSON.stringify({ uid: v.userId, label: opts.label, owner: opts.ownerUserId, n: randomBytes(8).toString('hex'), exp: Date.now() + 600_000 })).toString('base64url');
    return gmailAuthUrl(googleOAuth(this.env), `${payload}.${this.sign(payload)}`, opts.loginHint);
  }

  async connectCallback(v: AuthedViewer, code: string, state: string) {
    const [payload, sig] = state.split('.');
    const good = payload && sig && Buffer.from(sig).length === Buffer.from(this.sign(payload)).length && timingSafeEqual(Buffer.from(sig), Buffer.from(this.sign(payload)));
    if (!good) throw Errors.forbidden('The connection link is not valid; start again');
    const s = JSON.parse(Buffer.from(payload!, 'base64url').toString('utf8')) as { uid: string; label: string; owner: string | null; exp: number };
    if (s.uid !== v.userId || s.exp < Date.now()) throw Errors.forbidden('The connection link has expired; start again');
    await this.assertOwner(s.owner);
    const { refreshToken, email } = await exchangeGmailCode(googleOAuth(this.env), code);
    const existing = await this.prisma.mailbox.findUnique({ where: { address: email } });
    const id = existing?.id ?? randomUUID();
    const oauthEnc = await this.sealToken(id, refreshToken);
    const mb = existing
      ? await this.prisma.mailbox.update({ where: { id }, data: { oauthEnc, active: true, syncError: null, label: s.label || existing.label } })
      : await this.prisma.mailbox.create({ data: { id, address: email, label: s.label, ownerUserId: s.owner, oauthEnc, connectedById: v.userId, backfillFrom: new Date(Date.now() - this.env.GMAIL_BACKFILL_YEARS * 365 * DAY_MS) } });
    await this.audit.record(v.userId, 'MAILBOX_CONNECTED', 'Mailbox', mb.id, { shared: !s.owner });
    await this.startWatch(mb);
    if (!existing) await this.jobs.enqueue('gmail.backfill', { mailboxId: mb.id });
    return mb;
  }

  private async startWatch(mb: Mailbox) {
    if (this.client.mode !== 'live' || !this.env.GMAIL_PUBSUB_TOPIC) return;
    const w = await this.client.watch(await this.credentials(mb), this.env.GMAIL_PUBSUB_TOPIC);
    await this.prisma.mailbox.update({ where: { id: mb.id }, data: { watchExpiry: w.expiration, historyId: mb.historyId ?? w.historyId } });
  }

  async renewWatches() {
    const boxes = await this.prisma.mailbox.findMany({ where: { active: true } });
    let renewed = 0;
    for (const mb of boxes) {
      try {
        await this.startWatch(mb);
        renewed++;
      } catch (err) {
        await this.fail(mb.id, err);
      }
    }
    return { renewed };
  }

  // ---- Sync ----

  /** Called by the verified Pub/Sub webhook. */
  async onPush(emailAddress: string, historyId: string) {
    const mb = await this.prisma.mailbox.findUnique({ where: { address: emailAddress } });
    if (!mb?.active) return false;
    await this.jobs.enqueue('gmail.sync', { mailboxId: mb.id }, `sync:${mb.id}:${historyId}`);
    return true;
  }

  async pollAll() {
    const boxes = await this.prisma.mailbox.findMany({ where: { active: true }, select: { id: true } });
    for (const b of boxes) await this.jobs.enqueue('gmail.sync', { mailboxId: b.id });
    return { mailboxes: boxes.length };
  }

  private async fail(mailboxId: string, err: unknown) {
    const code = err instanceof GmailApiError ? err.code : 'SYNC_FAILED';
    await this.prisma.mailbox.update({ where: { id: mailboxId }, data: { syncError: code } });
    this.log.warn({ mailboxId, error: code });
  }

  async sync(mailboxId: string) {
    const mb = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mb?.active) return { stored: 0 };
    const creds = await this.credentials(mb);
    try {
      if (!mb.historyId) {
        const p = await this.client.profile(creds);
        await this.prisma.mailbox.update({ where: { id: mb.id }, data: { historyId: p.historyId, lastSyncAt: new Date() } });
        return { stored: 0 };
      }
      const page = await this.client.history(creds, mb.historyId);
      let ids = page.messageIds;
      let historyId = page.historyId;
      if (page.expired) {
        // History older than Gmail keeps: catch up with a search since the last sync.
        const since = Math.floor((mb.lastSyncAt ?? new Date(Date.now() - 7 * DAY_MS)).getTime() / 1000);
        ids = (await this.client.list(creds, `after:${since}`)).ids;
        historyId = (await this.client.profile(creds)).historyId;
      }
      let stored = 0;
      for (const id of ids) if (await this.ingestOne(mb, creds, id)) stored++;
      await this.prisma.mailbox.update({ where: { id: mb.id }, data: { historyId, lastSyncAt: new Date(), syncError: null } });
      return { stored };
    } catch (err) {
      await this.fail(mb.id, err);
      throw err;
    }
  }

  /** One page of history import (default 3 years); re-queues itself until done. */
  async backfillPage(mailboxId: string) {
    const mb = await this.prisma.mailbox.findUnique({ where: { id: mailboxId } });
    if (!mb?.active || mb.backfillDoneAt) return { stored: 0, done: true };
    const creds = await this.credentials(mb);
    const from = mb.backfillFrom ?? new Date(Date.now() - this.env.GMAIL_BACKFILL_YEARS * 365 * DAY_MS);
    const query = `after:${Math.floor(from.getTime() / 1000)}`;
    const page = await this.client.list(creds, query, mb.backfillPageToken);
    let stored = 0;
    for (const id of page.ids) if (await this.ingestOne(mb, creds, id)) stored++;
    await this.prisma.mailbox.update({
      where: { id: mb.id },
      data: { backfillPageToken: page.nextPageToken, backfillDoneAt: page.nextPageToken ? null : new Date() },
    });
    if (page.nextPageToken) await this.jobs.enqueue('gmail.backfill', { mailboxId: mb.id });
    return { stored, done: !page.nextPageToken };
  }

  private async internalDomains(): Promise<Set<string>> {
    const boxes = await this.prisma.mailbox.findMany({ select: { address: true } });
    return new Set([...this.env.GOOGLE_ALLOWED_DOMAINS, ...boxes.map((b) => domainOf(b.address))]);
  }

  /** Stores one Gmail message unless it is a draft, spam or purely internal mail. */
  private async ingestOne(mb: Mailbox, creds: MailboxCredentials, id: string): Promise<boolean> {
    if (await this.prisma.communication.findUnique({ where: { externalId: id }, select: { id: true } })) return false;
    const msg: ParsedEmail = await this.client.get(creds, id);
    if (msg.labelIds.some((l) => l === 'DRAFT' || l === 'SPAM' || l === 'TRASH')) return false;
    const from = msg.from?.address ?? '';
    const internal = await this.internalDomains();
    const everyone = [from, ...msg.to.map((a) => a.address), ...msg.cc.map((a) => a.address)].filter(Boolean);
    if (everyone.every((a) => internal.has(domainOf(a)))) return false; // staff-only mail is not client communication
    const outbound = msg.labelIds.includes('SENT') || from === mb.address;
    const attachments = [];
    for (const a of msg.attachments) {
      if (a.size > this.env.MAX_UPLOAD_MB * 1024 * 1024) continue;
      const data = a.data ?? (a.attachmentId ? await this.client.attachment(creds, id, a.attachmentId) : null);
      if (data) attachments.push({ fileName: a.fileName, contentType: a.contentType, data });
    }
    const r = await this.ingest.ingest({
      channel: 'EMAIL',
      direction: outbound ? 'OUTBOUND' : 'INBOUND',
      mailboxId: mb.id,
      externalId: msg.id,
      threadKey: msg.threadId,
      from,
      to: msg.to.map((a) => a.address),
      cc: msg.cc.map((a) => a.address),
      subject: msg.subject || null,
      text: msg.text,
      sentAt: msg.date,
      messageIdHeader: msg.messageId,
      attachments,
    });
    return r.created;
  }

  async send(mb: Mailbox, raw: string, threadId: string | null) {
    return this.client.send(await this.credentials(mb), raw, threadId);
  }
}
