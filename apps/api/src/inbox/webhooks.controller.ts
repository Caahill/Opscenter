// Webhooks (TechSpec 2, 7.1, 7.2; AGENTS.md rule 10): verify first, then store or enqueue, and
// answer quickly. Bodies are never logged.
import { Body, Controller, Get, Headers, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { parsePubSubPush, type PubSubVerifier } from '@opshub/integrations';
import { present } from '@opshub/policy';
import type { Response } from 'express';
import { Public } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import type { OpsRequest } from '../common/request';
import { AckDto } from '../policy/dtos';
import { GmailService } from './gmail.service';
import { PUBSUB } from './providers';
import { WhatsAppService } from './whatsapp.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly gmail: GmailService,
    private readonly whatsapp: WhatsAppService,
    @Inject(PUBSUB) private readonly pubsub: PubSubVerifier,
  ) {}

  /** Pub/Sub push: the OIDC token's audience and service account are checked before anything else. */
  @Post('gmail')
  @Public()
  @HttpCode(200)
  async gmailPush(@Headers('authorization') authorization: string | undefined, @Body() body: unknown) {
    if (!(await this.pubsub.verify(authorization))) throw Errors.unauthenticated();
    const push = parsePubSubPush(body);
    // Acknowledge pushes we cannot use, so Pub/Sub does not redeliver them forever.
    if (push) await this.gmail.onPush(push.emailAddress, push.historyId);
    return present(AckDto, { ok: true });
  }

  @Get('whatsapp')
  @Public()
  verify(@Query('hub.mode') mode: string | undefined, @Query('hub.verify_token') token: string | undefined, @Query('hub.challenge') challenge: string | undefined, @Res() res: Response) {
    res.type('text/plain').send(this.whatsapp.verifyChallenge(mode, token, challenge));
  }

  @Post('whatsapp')
  @Public()
  @HttpCode(200)
  async whatsappEvent(@Req() req: OpsRequest, @Headers('x-hub-signature-256') signature: string | undefined) {
    await this.whatsapp.receive(req.rawBody, signature);
    return present(AckDto, { ok: true });
  }
}
