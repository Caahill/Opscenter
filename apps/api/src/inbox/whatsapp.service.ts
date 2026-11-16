// WhatsApp (TechSpec 7.2): one-to-one chats from the Cloud API webhook, and Route B chat-export
// imports. Webhooks are verified before anything is stored (AGENTS.md rule 10); payloads are kept
// encrypted until the wa.ingest job has processed them.
import { createHash, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  parseChatExport,
  parseWhatsAppWebhook,
  readChatExport,
  verifyWhatsAppSignature,
  type WhatsAppClient,
} from '@opshub/integrations';
import { present, type Scope } from '@opshub/policy';
import type { ImportChatInput } from '@opshub/shared';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ENV, type Env } from '../config/env';
import { CryptoService } from '../crypto/crypto.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { ImportResultDto } from './dtos';
import { IngestService } from './messages';
import { WHATSAPP, whatsappSecret, whatsappVerifyToken } from './providers';
import { partyHash } from './store';

/** Imported messages newer than this are triaged; older ones are stored as history only. */
const IMPORT_TRIAGE_DAYS = 14;
const guessType = (name: string) =>
  /\.(jpe?g)$/i.test(name) ? 'image/jpeg' : /\.png$/i.test(name) ? 'image/png' : /\.pdf$/i.test(name) ? 'application/pdf' : /\.(opus|ogg)$/i.test(name) ? 'audio/ogg' : /\.mp4$/i.test(name) ? 'video/mp4' : 'application/octet-stream';

export interface ImportFile {
  originalname: string;
  buffer: Buffer;
}

@Injectable()
export class WhatsAppService {
  private readonly log = new Logger('WhatsApp');

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly scopes: ScopeService,
    private readonly ingest: IngestService,
    private readonly audit: AuditService,
    private readonly jobs: JobsService,
    @Inject(WHATSAPP) readonly client: WhatsAppClient,
    @Inject(ENV) private readonly env: Env,
  ) {
    jobs.register('wa.ingest', (d) => this.processEvent(String(d.eventId)));
  }

  /** GET /webhooks/whatsapp: Meta's subscription check. */
  verifyChallenge(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
    const expected = whatsappVerifyToken(this.env);
    if (mode !== 'subscribe' || !expected || token !== expected || !challenge) throw Errors.forbidden('Verification failed');
    return challenge;
  }

  /** POST /webhooks/whatsapp: signature first, then store encrypted and queue. */
  async receive(rawBody: Buffer | undefined, signature: string | undefined): Promise<void> {
    if (!verifyWhatsAppSignature(whatsappSecret(this.env), rawBody, signature)) {
      this.log.warn({ event: 'whatsapp_signature_failed' });
      throw Errors.unauthenticated();
    }
    const id = randomUUID();
    const sealed = await this.crypto.encrypt(rawBody!.toString('utf8'), 'pii', `webhook:${id}`);
    await this.prisma.webhookEvent.create({ data: { id, source: 'WHATSAPP', payloadEnc: sealed.ciphertext } });
    await this.jobs.enqueue('wa.ingest', { eventId: id }, `wa:${id}`);
  }

  async processEvent(eventId: string) {
    const event = await this.prisma.webhookEvent.findUnique({ where: { id: eventId } });
    if (!event || event.processedAt) return { stored: 0 };
    await this.prisma.webhookEvent.update({ where: { id: eventId }, data: { attempts: { increment: 1 } } });
    const body: unknown = JSON.parse(await this.crypto.decryptWith('pii', event.payloadEnc, `webhook:${eventId}`));
    let stored = 0;
    for (const m of parseWhatsAppWebhook(body)) {
      const number = `+${m.from}`;
      const attachments = [];
      if (m.media) {
        try {
          const media = await this.client.media(m.media.id);
          attachments.push({ fileName: m.media.fileName, contentType: media.mimeType || m.media.mimeType, data: media.data });
        } catch {
          this.log.warn({ event: 'whatsapp_media_failed', eventId });
        }
      }
      const r = await this.ingest.ingest({
        channel: 'WHATSAPP',
        direction: 'INBOUND',
        mailboxId: null,
        externalId: m.wamid,
        threadKey: `wa:${partyHash(this.crypto, number)}`,
        from: number,
        to: [],
        cc: [],
        subject: null,
        text: m.text,
        sentAt: m.sentAt,
        attachments,
      });
      if (r.created) stored++;
    }
    await this.prisma.webhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date(), error: null } });
    return { stored };
  }

  /**
   * Route B: a chat export uploaded for one client. Senders are matched to the client's contacts
   * by number or saved name, and to staff by name; re-uploads de-duplicate by message hash.
   */
  async importChat(v: AuthedViewer, scopes: Scope[], input: ImportChatInput, file: ImportFile | undefined) {
    if (!file) throw Errors.validation('file: attach a WhatsApp chat export (.txt or .zip)');
    const scope = await this.scopes.communicationScope(v, scopes);
    if (!scope.all && !scope.teamClientIds.includes(input.clientId)) throw Errors.notFound('Client');
    const client = await this.prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw Errors.notFound('Client');
    if (input.projectId && !(await this.prisma.project.findFirst({ where: { id: input.projectId, clientId: client.id } }))) {
      throw Errors.validation("projectId: must be one of this client's projects");
    }

    let chat;
    try {
      chat = readChatExport(file.originalname, file.buffer);
    } catch {
      throw Errors.validation('file: not a WhatsApp chat export');
    }
    const messages = parseChatExport(chat.text, { timeZone: input.timeZone ?? 'Asia/Kolkata', dateOrder: input.dateOrder });
    if (!messages.length) throw Errors.validation('file: no messages found; export the chat with "Export chat" in WhatsApp');

    // Saved names in an export are the uploader's phone contacts, so match them against the
    // client's contact names (decrypted here, never returned) as well as by number.
    const contacts = await this.prisma.contact.findMany({ where: { clientId: client.id } });
    const byName = new Map<string, string>();
    for (const c of contacts) byName.set((await this.crypto.decrypt({ ciphertext: c.nameEnc, keyId: c.keyId }, `contact:${c.id}`)).trim().toLowerCase(), c.id);
    const byHash = new Map(contacts.flatMap((c) => (c.phoneHash ? [[c.phoneHash, c.id] as const] : [])));
    const staff = new Map((await this.prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } })).map((u) => [u.name.trim().toLowerCase(), u.id]));

    const threadKey = `wa-group:${createHash('sha256').update(`${client.id}\u0000${chat.chatName}`).digest('hex').slice(0, 32)}`;
    const record = await this.prisma.whatsAppImport.create({ data: { clientId: client.id, projectId: input.projectId ?? null, fileName: file.originalname.slice(0, 200), uploadedById: v.userId } });
    const recent = Date.now() - IMPORT_TRIAGE_DAYS * 86_400_000;
    let created = 0;
    let duplicates = 0;
    let media = 0;
    for (const m of messages) {
      const staffId = staff.get(m.sender.toLowerCase()) ?? null;
      const hash = partyHash(this.crypto, m.sender);
      const contactId = (hash ? byHash.get(hash) : undefined) ?? byName.get(m.sender.toLowerCase()) ?? null;
      const files = m.attachments.flatMap((name) => {
        const data = chat.media.get(name);
        return data ? [{ fileName: name, contentType: guessType(name), data }] : [];
      });
      const r = await this.ingest.ingest({
        channel: 'WHATSAPP',
        direction: staffId ? 'OUTBOUND' : 'INBOUND',
        mailboxId: null,
        externalId: `wa-import:${createHash('sha256').update(`${client.id}\u0000${m.hash}`).digest('hex')}`,
        threadKey,
        from: m.sender,
        to: [],
        cc: [],
        subject: null,
        text: m.text || (m.mediaOmitted ? '[media not included in the export]' : ''),
        sentAt: m.sentAt,
        attachments: files,
        sentById: staffId,
        importId: record.id,
        link: { clientId: client.id, contactId: staffId ? null : contactId, method: 'MANUAL' },
        projectId: input.projectId ?? null,
        triageState: staffId || m.sentAt.getTime() >= recent ? 'NEW' : 'DISMISSED',
      });
      if (r.created) {
        created++;
        media += files.length;
      } else duplicates++;
    }
    await this.prisma.whatsAppImport.update({ where: { id: record.id }, data: { messages: created, duplicates, media } });
    await this.audit.record(v.userId, 'WHATSAPP_IMPORT', 'WhatsAppImport', record.id, { clientId: client.id, messages: created, duplicates });
    return present(ImportResultDto, { id: record.id, chatName: chat.chatName, messages: created, duplicates, media, threadKey: created || duplicates ? threadKey : null });
  }
}
