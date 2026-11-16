// Dev only (registered with dev auth, never in production): the local outbox. With MAIL_MODE=file
// the digest job writes each email to LOCAL_MAIL_DIR; this lists the signed-in person's own mail
// and can send the digest now instead of waiting for 18:30 IST.
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Controller, Get, Inject, Post } from '@nestjs/common';
import { sendDigests } from '@opshub/db';
import { FileMailer } from '@opshub/integrations';
import { defineDto, present } from '@opshub/policy';
import { z } from 'zod';
import { Authenticated, CurrentViewer } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

const StoredMail = z.object({ to: z.string(), subject: z.string(), text: z.string(), sentAt: z.string() });

export const DevMailDto = defineDto('DevMail', {
  subject: 'devMail.subject',
  text: 'devMail.text',
  sentAt: 'devMail.sentAt',
});
export const DevOutboxDto = defineDto('DevOutbox', { mode: 'devOutbox.mode', items: 'devOutbox.items', sent: 'devOutbox.sent' });

@Controller('dev/mail')
export class DevMailController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get dir() {
    return resolve(this.env.LOCAL_MAIL_DIR);
  }

  private async mine(v: AuthedViewer) {
    const files = (await readdir(this.dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json')).sort().reverse();
    const items = [];
    for (const f of files) {
      const parsed = StoredMail.safeParse(JSON.parse(await readFile(join(this.dir, f), 'utf8').catch(() => 'null')));
      if (!parsed.success || parsed.data.to.toLowerCase() !== v.email.toLowerCase()) continue;
      items.push(present(DevMailDto, { subject: parsed.data.subject, text: parsed.data.text, sentAt: parsed.data.sentAt }));
      if (items.length >= 20) break;
    }
    return items;
  }

  @Get()
  @Authenticated()
  async list(@CurrentViewer() v: AuthedViewer) {
    return present(DevOutboxDto, { mode: this.env.MAIL_MODE, items: await this.mine(v), sent: null });
  }

  /** Runs the 18:30 digest now (everyone with unread, not yet emailed notifications). */
  @Post('digest')
  @Authenticated()
  async digest(@CurrentViewer() v: AuthedViewer) {
    if (this.env.MAIL_MODE !== 'file') throw Errors.invalidState('The local outbox needs MAIL_MODE=file');
    const mailer = new FileMailer(this.dir, this.env.MAIL_FROM);
    const { emails } = await sendDigests(this.prisma, (m) => mailer.send(m), { appUrl: this.env.APP_URL });
    return present(DevOutboxDto, { mode: this.env.MAIL_MODE, items: await this.mine(v), sent: emails });
  }
}
