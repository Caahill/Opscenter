// Dev only (registered with dev auth, never in production): plays the part of a client writing in,
// through the same verified webhook paths the real services use, so the inbox can be checked locally.
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { FakeGmailClient, FakeWhatsAppClient, signWhatsAppPayload, whatsAppWebhookBody, type GmailClient, type WhatsAppClient } from '@opshub/integrations';
import { present } from '@opshub/policy';
import { SimulateMessageInput, type SimulateMessageInput as Simulate } from '@opshub/shared';
import { Authenticated } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, type Env } from '../config/env';
import { CryptoService } from '../crypto/crypto.service';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { AckDto } from '../policy/dtos';
import { GmailService } from '../inbox/gmail.service';
import { GMAIL, WHATSAPP, whatsappSecret } from '../inbox/providers';
import { WhatsAppService } from '../inbox/whatsapp.service';

const typeOf = (name: string) => (/\.pdf$/i.test(name) ? 'application/pdf' : /\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : 'text/plain');

@Controller('dev/inbox')
export class InboxSimulateController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gmailService: GmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly jobs: JobsService,
    private readonly crypto: CryptoService,
    @Inject(GMAIL) private readonly gmail: GmailClient,
    @Inject(WHATSAPP) private readonly whatsapp: WhatsAppClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('simulate')
  @Authenticated()
  async simulate(@Body(new ZodPipe(SimulateMessageInput)) body: Simulate) {
    // A reply in an existing thread comes from whoever last wrote in from the client side.
    let from = body.from;
    if (!from && body.threadKey) {
      const last = await this.prisma.communication.findFirst({ where: { threadKey: body.threadKey, direction: 'INBOUND' }, orderBy: { sentAt: 'desc' } });
      if (!last) throw Errors.validation('threadKey: no client message in this thread to reply as');
      from = await this.crypto.decryptWith('pii', last.fromEnc, `communication:${last.id}`);
    }
    if (!from) throw Errors.validation('from: needed for a new thread');
    const sentAt = body.sentAt ? new Date(body.sentAt) : new Date();
    const attachments = body.attachmentName ? [{ fileName: body.attachmentName, contentType: typeOf(body.attachmentName), content: Buffer.from(`Sample file "${body.attachmentName}" from a simulated client message.\n`) }] : [];
    if (body.channel === 'EMAIL') {
      if (!(this.gmail instanceof FakeGmailClient)) throw Errors.invalidState('Simulation needs GMAIL_MODE=fake');
      const mailbox = body.mailboxId
        ? await this.prisma.mailbox.findUnique({ where: { id: body.mailboxId } })
        : await this.prisma.mailbox.findFirst({ where: { active: true, ownerUserId: null }, orderBy: { createdAt: 'asc' } });
      if (!mailbox) throw Errors.validation('mailboxId: connect a mailbox first (Admin > Mailboxes)');
      const previous = body.threadKey ? await this.prisma.communication.findFirst({ where: { threadKey: body.threadKey }, orderBy: { sentAt: 'desc' } }) : null;
      this.gmail.deliver(mailbox.address, {
        from: { name: null, address: from.toLowerCase() },
        to: [{ name: mailbox.label || null, address: mailbox.address }],
        subject: body.subject ?? (previous?.subject ? `Re: ${previous.subject.replace(/^Re:\s*/i, '')}` : 'Message'),
        text: body.body,
        threadId: body.threadKey,
        inReplyTo: previous?.messageIdHeader ?? null,
        attachments,
        date: sentAt,
      });
      // What a verified Pub/Sub push does.
      await this.gmailService.onPush(mailbox.address, String(Date.now()));
    } else {
      if (!(this.whatsapp instanceof FakeWhatsAppClient)) throw Errors.invalidState('Simulation needs WHATSAPP_MODE=fake');
      const raw = Buffer.from(JSON.stringify(whatsAppWebhookBody({ from: from.replace(/\D/g, ''), text: body.body, sentAt })));
      await this.whatsappService.receive(raw, signWhatsAppPayload(whatsappSecret(this.env), raw));
    }
    await this.jobs.drain();
    return present(AckDto, { ok: true });
  }
}
