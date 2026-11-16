import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { scopesFor } from '@opshub/policy';
import {
  BackfillInput,
  CreateMailboxInput,
  UpdateMailboxInput,
  type CreateMailboxInput as CreateMailbox,
  type UpdateMailboxInput as UpdateMailbox,
} from '@opshub/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import { CurrentViewer, Requires } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, type Env } from '../config/env';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { DirectoryService } from '../common/directory.service';
import { presentMailbox } from './dtos';
import { GmailService } from './gmail.service';

@Controller('mailboxes')
export class MailboxesController {
  constructor(
    private readonly gmail: GmailService,
    private readonly jobs: JobsService,
    private readonly prisma: PrismaService,
    private readonly directory: DirectoryService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Mailboxes the viewer may send from; `manage=true` lists all of them (Admin). */
  @Get()
  @Requires('inbox.send')
  list(@CurrentViewer() v: AuthedViewer, @Query('manage') manage?: string) {
    const all = manage === 'true';
    if (all && !scopesFor(v.roles, 'mailbox.manage').length) throw Errors.forbidden();
    return this.gmail.list(v, all);
  }

  /** GMAIL_MODE=fake only; live mailboxes connect through Google consent (GET /mailboxes/connect). */
  @Post()
  @Requires('mailbox.manage')
  create(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(CreateMailboxInput)) body: CreateMailbox) {
    return this.gmail.createFake(v, body);
  }

  @Patch(':id')
  @Requires('mailbox.manage')
  update(@CurrentViewer() v: AuthedViewer, @Param('id') id: string, @Body(new ZodPipe(UpdateMailboxInput)) body: UpdateMailbox) {
    return this.gmail.update(v, id, body);
  }

  @Post(':id/sync')
  @Requires('mailbox.manage')
  async sync(@Param('id') id: string) {
    await this.jobs.run('gmail.sync', { mailboxId: id }).catch(() => undefined);
    await this.jobs.drain();
    return this.one(id);
  }

  @Post(':id/backfill')
  @Requires('mailbox.manage')
  async backfill(@Param('id') id: string, @Body(new ZodPipe(BackfillInput)) body: z.infer<typeof BackfillInput>) {
    const mb = await this.prisma.mailbox.findUnique({ where: { id } });
    if (!mb) throw Errors.notFound('Mailbox');
    await this.prisma.mailbox.update({
      where: { id },
      data: {
        backfillFrom: body.from ? new Date(`${body.from}T00:00:00.000Z`) : new Date(Date.now() - this.env.GMAIL_BACKFILL_YEARS * 365 * 86_400_000),
        backfillPageToken: null,
        backfillDoneAt: null,
      },
    });
    await this.jobs.enqueue('gmail.backfill', { mailboxId: id });
    return this.one(id);
  }

  @Get('connect')
  @Requires('mailbox.manage')
  connect(@CurrentViewer() v: AuthedViewer, @Res() res: Response, @Query('label') label = '', @Query('ownerUserId') ownerUserId?: string, @Query('loginHint') loginHint?: string) {
    res.redirect(this.gmail.connectUrl(v, { label: label.slice(0, 60), ownerUserId: ownerUserId || null, loginHint }));
  }

  /** Google sends the Admin back here after consent. */
  @Get('oauth/callback')
  @Requires('mailbox.manage')
  async callback(@CurrentViewer() v: AuthedViewer, @Res() res: Response, @Query('code') code?: string, @Query('state') state?: string) {
    if (!code || !state) return res.redirect(`${this.env.APP_URL}/admin/mailboxes?error=cancelled`);
    try {
      await this.gmail.connectCallback(v, code, state);
      res.redirect(`${this.env.APP_URL}/admin/mailboxes?connected=1`);
    } catch {
      res.redirect(`${this.env.APP_URL}/admin/mailboxes?error=connect_failed`);
    }
  }

  private async one(id: string) {
    const mb = await this.prisma.mailbox.findUnique({ where: { id } });
    if (!mb) throw Errors.notFound('Mailbox');
    return presentMailbox(mb, await this.directory.names([mb.ownerUserId]), this.gmail.client.mode);
  }
}
