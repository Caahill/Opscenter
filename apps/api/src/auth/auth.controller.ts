import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { present } from '@opshub/policy';
import { OAUTH_STATE_COOKIE } from '@opshub/shared';
import type { Response } from 'express';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { Errors } from '../common/errors';
import type { OpsRequest } from '../common/request';
import { AckDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';
import { Authenticated, Public } from './access.decorators';
import { GoogleOidcService } from './google-oidc.service';
import { SessionService } from './session.service';

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

@Controller('auth')
export class AuthController {
  constructor(
    private readonly google: GoogleOidcService,
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('google')
  @Public()
  startGoogle(@Res() res: Response): void {
    if (!this.google.enabled) throw Errors.notFound();
    const state = randomBytes(24).toString('base64url');
    res.cookie(OAUTH_STATE_COOKIE, state, {
      ...this.sessions.cookieOptions(),
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(this.google.authUrl(state));
  }

  @Get('callback')
  @Public()
  async googleCallback(
    @Req() req: OpsRequest,
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
  ): Promise<void> {
    if (!this.google.enabled) throw Errors.notFound();
    const fail = (reason: string) => res.redirect(`${this.env.APP_URL}/login?error=${reason}`);
    const expected = req.cookies?.[OAUTH_STATE_COOKIE] as string | undefined;
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/' });
    if (!code || !state || !expected || !safeEqual(state, expected)) return fail('state_mismatch');

    const identity = await this.google.exchange(code);
    if (typeof identity === 'string') return fail(identity);

    const user = await this.prisma.user.findUnique({ where: { email: identity.email } });
    if (!user || !user.active) return fail('not_invited');

    const token = await this.sessions.create(user.id, req.header('user-agent'));
    this.sessions.setCookie(res, token);
    await this.audit.record(user.id, 'LOGIN', 'User', user.id, { method: 'google' });
    res.redirect(this.env.APP_URL);
  }

  @Post('logout')
  @HttpCode(200)
  @Authenticated()
  async logout(@Req() req: OpsRequest, @Res({ passthrough: true }) res: Response) {
    if (req.sessionId) await this.sessions.revoke(req.sessionId);
    this.sessions.clearCookie(res);
    return present(AckDto, { ok: true });
  }
}
