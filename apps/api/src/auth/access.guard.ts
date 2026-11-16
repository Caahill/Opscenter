import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { scopesFor } from '@opshub/policy';
import { SESSION_COOKIE } from '@opshub/shared';
import { Errors } from '../common/errors';
import type { OpsRequest } from '../common/request';
import { ACCESS_KEY, type AccessRule } from './access.decorators';
import { SessionService } from './session.service';

/** Action check (TechSpec 5.1 step 1). Global guard; denies when a route has no rule. */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!rule) throw Errors.forbidden();
    if (rule.kind === 'public') return true;

    const req = ctx.switchToHttp().getRequest<OpsRequest>();
    const resolved = await this.sessions.resolve(req.cookies?.[SESSION_COOKIE]);
    if (!resolved) throw Errors.unauthenticated();
    req.viewer = resolved.viewer;
    req.sessionId = resolved.sessionId;
    if (rule.kind === 'authenticated') return true;

    const held = scopesFor(resolved.viewer.roles, rule.action);
    const granted = rule.scopes === 'ANY' ? held : held.filter((s) => rule.scopes.includes(s));
    if (granted.length === 0) throw Errors.forbidden();
    req.grantedScopes = granted;
    return true;
  }
}
