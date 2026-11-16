import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { present } from '@opshub/policy';
import { DevLoginInput, type DevLoginInput as DevLogin } from '@opshub/shared';
import type { Response } from 'express';
import { Public } from '../auth/access.decorators';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../audit/audit.service';
import { Errors } from '../common/errors';
import type { OpsRequest } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { AckDto, DevUserDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';

/** AUTH_MODE=dev only (never registered in production): pick a seed user instead of Google. */
@Controller('auth/dev')
export class DevAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  @Get('users')
  @Public()
  async users() {
    const users = await this.prisma.user.findMany({ where: { active: true }, orderBy: { email: 'asc' } });
    return users.map((u) => present(DevUserDto, { id: u.id, name: u.name, email: u.email, roles: u.roles }));
  }

  @Post('login')
  @HttpCode(200)
  @Public()
  async login(
    @Req() req: OpsRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(DevLoginInput)) body: DevLogin,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: body.userId } });
    if (!user || !user.active) throw Errors.notFound('User');
    const token = await this.sessions.create(user.id, req.header('user-agent'));
    this.sessions.setCookie(res, token);
    await this.audit.record(user.id, 'LOGIN', 'User', user.id, { method: 'dev' });
    return present(AckDto, { ok: true });
  }
}
