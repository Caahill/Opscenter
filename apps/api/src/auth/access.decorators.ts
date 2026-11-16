import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Action, Scope } from '@opshub/policy';
import type { AuthedViewer, OpsRequest } from '../common/request';

export const ACCESS_KEY = 'opshub:access';

export type AccessRule =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'requires'; action: Action; scopes: Scope[] | 'ANY' };

/**
 * Deny by default (AGENTS.md rule 2). Every route carries exactly one of these; the app refuses
 * to start if one is missing.
 *
 * - `@Requires(action, scope?)`: the viewer's roles must grant `action`, optionally at one of
 *   the listed scopes. Granted scopes are passed to the handler for SQL filtering.
 * - `@Authenticated()`: any signed-in user (e.g. /me, logout). Field policy still applies.
 * - `@Public()`: no session (login, webhooks, health).
 */
export const Requires = (action: Action, scopes: Scope | Scope[] | 'ANY' = 'ANY') =>
  SetMetadata<string, AccessRule>(ACCESS_KEY, {
    kind: 'requires',
    action,
    scopes: scopes === 'ANY' ? 'ANY' : ([] as Scope[]).concat(scopes),
  });

export const Authenticated = () =>
  SetMetadata<string, AccessRule>(ACCESS_KEY, { kind: 'authenticated' });

export const Public = () => SetMetadata<string, AccessRule>(ACCESS_KEY, { kind: 'public' });

export const CurrentViewer = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthedViewer => {
  const viewer = ctx.switchToHttp().getRequest<OpsRequest>().viewer;
  if (!viewer) throw new Error('CurrentViewer used on a route without a session');
  return viewer;
});

export const GrantedScopes = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Scope[] => ctx.switchToHttp().getRequest<OpsRequest>().grantedScopes ?? [],
);
