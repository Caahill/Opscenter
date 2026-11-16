// Compose, reply, reply-all and forward (PRD 2.2, TechSpec 5.5). The browser sends contact ids;
// the server resolves real addresses at send time, so masked users never handle them. Raw
// addresses are accepted only from Admin and the client's PM.
import { Inject, Injectable } from '@nestjs/common';
import type { Communication, Mailbox } from '@opshub/db';
import { buildMime, WHATSAPP_WINDOW_MS, type WhatsAppClient } from '@opshub/integrations';
import { present, scopesFor, type Scope } from '@opshub/policy';
import type { SendMessageInput } from '@opshub/shared';
import { ActivityService } from '../common/activity.service';
import { AppError, Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ENV, type Env } from '../config/env';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import type { IncomingFile } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';
import { COMM_INCLUDE, SendResultDto } from './dtos';
import { GmailService } from './gmail.service';
import { IngestService, MessagesQueries } from './messages';
import { WHATSAPP, whatsappTemplates } from './providers';
import { partyHash, type StoredAttachment } from './store';

const prefixed = (subject: string, prefix: 'Re' | 'Fwd') => (new RegExp(`^${prefix}:`, 'i').test(subject) ? subject : `${prefix}: ${subject}`);
const quote = (text: string) =>
  text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');

@Injectable()
export class SendService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
    private readonly gmail: GmailService,
    private readonly ingest: IngestService,
    private readonly messages: MessagesQueries,
    private readonly activity: ActivityService,
    @Inject(WHATSAPP) private readonly whatsapp: WhatsAppClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private open(c: Communication, enc: Uint8Array) {
    return this.crypto.decryptWith('pii', enc, `communication:${c.id}`);
  }

  private async openList(c: Communication, enc: Uint8Array | null): Promise<string[]> {
    return enc ? (JSON.parse(await this.open(c, enc)) as string[]) : [];
  }

  /** Who may message this client: by role scope (PRD access matrix, "Send to client"). */
  private async assertMaySend(v: AuthedViewer, scopes: Scope[], clientId: string, original: Communication | null) {
    const scope = await this.scopes.communicationScope(v, scopes);
    if (scope.all || scope.teamClientIds.includes(clientId)) return;
    // Accounts replies on billing threads, including a client's follow-up nobody has triaged yet.
    if (scope.billing && original && ((original.category === 'BILLING' && original.triageState === 'CONFIRMED') || scope.threadKeys.includes(original.threadKey))) return;
    if (scope.taskIds.length) {
      const enabled = await this.prisma.project.findFirst({ where: { clientId, memberSendEnabled: true, tasks: { some: { assigneeId: v.userId } } } });
      if (enabled) return;
      throw Errors.forbidden("Your PM has not turned on client email for you on this client's projects");
    }
    throw Errors.forbidden('You cannot message this client');
  }

  async send(v: AuthedViewer, scopes: Scope[], input: SendMessageInput, files: IncomingFile[] = []) {
    const original = input.replyToId ? await this.scopes.requireCommunication(v, scopesFor(v.roles, 'inbox.read'), input.replyToId) : null;
    if (original && !original.clientId) throw Errors.invalidState('Link this message to a client before replying');
    const clientId = original?.clientId ?? input.clientId!;
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw Errors.notFound('Client');
    await this.assertMaySend(v, scopes, client.id, original);
    const full = v.roles.includes('ADMIN') || client.pmId === v.userId;
    if (input.addresses.length && !full) throw Errors.forbidden("Choose recipients from the client's contacts");

    const ids = [...new Set([...input.contactIds, ...input.ccContactIds])];
    const contacts = ids.length ? await this.prisma.contact.findMany({ where: { id: { in: ids }, clientId: client.id } }) : [];
    if (contacts.length !== ids.length) throw Errors.validation('contactIds: must be contacts of this client');
    const contact = (id: string) => contacts.find((c) => c.id === id)!;
    const reveal = (enc: Uint8Array | null, c: (typeof contacts)[number]) =>
      enc ? this.crypto.decrypt({ ciphertext: enc, keyId: c.keyId }, `contact:${c.id}`) : Promise.resolve(null);

    const projectId = input.projectId !== undefined ? input.projectId : (original?.projectId ?? null);
    const taskId = input.taskId !== undefined ? input.taskId : (original?.taskId ?? null);
    const link = { clientId: client.id, contactId: input.contactIds[0] ?? original?.contactId ?? null, method: 'MANUAL' as const };

    let commId: string;
    if (input.channel === 'EMAIL') {
      const mailbox = await this.pickMailbox(v, input.mailboxId ?? original?.mailboxId ?? null);
      const own = mailbox.address;
      const to: string[] = [];
      for (const id of input.contactIds) {
        const email = await reveal(contact(id).emailEnc, contact(id));
        if (!email) throw Errors.validation(`contactIds: ${contact(id).label} has no email address`);
        to.push(email);
      }
      const cc: string[] = [];
      for (const id of input.ccContactIds) {
        const email = await reveal(contact(id).emailEnc, contact(id));
        if (email) cc.push(email);
      }
      to.push(...input.addresses);
      if (original && (input.toSender || input.mode === 'REPLY_ALL')) {
        if (original.direction === 'INBOUND') to.push(await this.open(original, original.fromEnc));
        else to.push(...(await this.openList(original, original.toEnc)));
      }
      if (original && input.mode === 'REPLY_ALL') {
        for (const a of [...(await this.openList(original, original.toEnc)), ...(await this.openList(original, original.ccEnc))]) cc.push(a);
      }
      const dedupe = (list: string[]) => [...new Set(list.map((a) => a.toLowerCase()))].filter((a) => a !== own && a.includes('@'));
      const toList = dedupe(to);
      const ccList = dedupe(cc).filter((a) => !toList.includes(a));
      if (!toList.length) throw Errors.validation('Add at least one recipient');

      const subject = input.subject ?? (original ? prefixed(original.subject ?? '', input.mode === 'FORWARD' ? 'Fwd' : 'Re') : '');
      let text = input.body;
      const attachments = files.map((f) => ({ fileName: f.originalname, contentType: f.mimetype || 'application/octet-stream', content: f.buffer }));
      if (original) {
        const originalBody = await this.open(original, original.bodyEnc);
        const when = original.sentAt.toUTCString();
        if (input.mode === 'FORWARD') {
          text += `\n\n---------- Forwarded message ----------\nDate: ${when}\nSubject: ${original.subject ?? ''}\n\n${originalBody}`;
          for (const a of original.attachments as unknown as StoredAttachment[]) {
            attachments.push({ fileName: a.fileName, contentType: a.contentType, content: await this.storage.read(a.key) });
          }
        } else {
          text += `\n\nOn ${when}, the client wrote:\n${quote(originalBody)}`;
        }
      }
      const sameThread = original && input.mode !== 'FORWARD' && original.mailboxId === mailbox.id ? original.threadKey : null;
      const built = buildMime({
        from: { name: mailbox.label || null, address: mailbox.address },
        to: toList.map((address) => ({ name: null, address })),
        cc: ccList.map((address) => ({ name: null, address })),
        subject,
        text,
        inReplyTo: input.mode === 'FORWARD' ? null : (original?.messageIdHeader ?? null),
        references: null,
        attachments,
      });
      const sent = await this.gmail.send(mailbox, built.raw, sameThread);
      const r = await this.ingest.ingest({
        channel: 'EMAIL',
        direction: 'OUTBOUND',
        mailboxId: mailbox.id,
        externalId: sent.id,
        threadKey: sent.threadId,
        from: mailbox.address,
        to: toList,
        cc: ccList,
        subject: subject || null,
        text,
        sentAt: new Date(),
        messageIdHeader: built.messageId,
        attachments: attachments.map((a) => ({ fileName: a.fileName, contentType: a.contentType, data: a.content })),
        sentById: v.userId,
        link,
        projectId,
        taskId,
      });
      commId = r.id;
    } else {
      let number: string | null = null;
      if (input.contactIds[0]) number = await reveal(contact(input.contactIds[0]).phoneEnc, contact(input.contactIds[0]));
      else if (original?.channel === 'WHATSAPP' && original.direction === 'INBOUND' && !original.importId) number = await this.open(original, original.fromEnc);
      if (!number) throw Errors.validation('Choose a contact with a WhatsApp number');
      const hash = partyHash(this.crypto, number)!;
      const lastInbound = await this.prisma.communication.findFirst({
        where: { channel: 'WHATSAPP', direction: 'INBOUND', fromHash: hash, importId: null },
        orderBy: { sentAt: 'desc' },
      });
      const open = lastInbound && Date.now() - lastInbound.sentAt.getTime() < WHATSAPP_WINDOW_MS;
      const digits = number.replace(/\D/g, '');
      let sent: { wamid: string };
      let text = input.body;
      if (input.template) {
        const allowed = whatsappTemplates(this.env).some((t) => t.name === input.template!.name && t.language === input.template!.language);
        if (!allowed) throw Errors.validation('template: not an approved template');
        sent = await this.whatsapp.sendTemplate(digits, input.template.name, input.template.language, input.template.params);
        text = text || `[Template: ${input.template.name}]`;
      } else if (open) {
        sent = await this.whatsapp.sendText(digits, input.body);
      } else {
        throw new AppError(422, 'OUTSIDE_WINDOW', 'More than 24 hours since the client last wrote on WhatsApp: send an approved template instead');
      }
      const r = await this.ingest.ingest({
        channel: 'WHATSAPP',
        direction: 'OUTBOUND',
        mailboxId: null,
        externalId: sent.wamid,
        threadKey: `wa:${hash}`,
        from: 'SySpree WhatsApp',
        to: [`+${digits}`],
        cc: [],
        subject: null,
        text,
        sentAt: new Date(),
        sentById: v.userId,
        link,
        projectId,
        taskId,
      });
      commId = r.id;
    }

    if (projectId) await this.activity.log({ kind: 'MESSAGE_SENT', actorId: v.userId, projectId, taskId, to: { communicationId: commId, channel: input.channel } });
    const row = await this.prisma.communication.findUniqueOrThrow({ where: { id: commId }, include: COMM_INCLUDE });
    return present(SendResultDto, { message: (await this.messages.present(v, [row]))[0]! });
  }

  /** PMs send from their own mailbox or a shared one; everyone else from shared mailboxes only. */
  private async pickMailbox(v: AuthedViewer, mailboxId: string | null): Promise<Mailbox> {
    const mailbox = mailboxId
      ? await this.prisma.mailbox.findUnique({ where: { id: mailboxId } })
      : await this.prisma.mailbox.findFirst({ where: { active: true, ownerUserId: null }, orderBy: { createdAt: 'asc' } });
    if (!mailbox?.active) throw Errors.validation('mailboxId: no connected mailbox to send from');
    if (mailbox.ownerUserId && mailbox.ownerUserId !== v.userId) throw Errors.forbidden('Send from your own mailbox or a shared one');
    return mailbox;
  }
}
