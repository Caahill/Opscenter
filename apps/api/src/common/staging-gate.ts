// Staging gate (APP_ENV=staging): the demo site sits behind one shared password. The web shows the
// password page and sets the gate cookie; the API checks the same token on every request and
// socket, so dev login stays closed even if the API is reached directly. The token is derived
// from STAGING_PASSWORD, so changing the password signs everyone out of the gate.
// Keep in step with apps/web/lib/staging-gate.ts.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type { OpsRequest } from './request';

export const GATE_COOKIE = 'opshub_gate';
export const GATE_HEADER = 'x-opshub-gate';

export function stagingGateToken(password: string): string {
  return createHmac('sha256', password).update('opshub-staging-gate-v1').digest('base64url');
}

const cookieValue = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1);

/** True when the request carries the gate token, as the cookie or (server-side calls) the header. */
export function passesGate(password: string, headers: { cookie?: string; [GATE_HEADER]?: string | string[] }): boolean {
  const expected = Buffer.from(stagingGateToken(password));
  const header = headers[GATE_HEADER];
  const candidates = [typeof header === 'string' ? header : undefined, cookieValue(headers.cookie, GATE_COOKIE)];
  return candidates.some((c) => {
    if (!c) return false;
    let given: Buffer;
    try {
      given = Buffer.from(decodeURIComponent(c));
    } catch {
      return false;
    }
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Refuses every request without the gate token, except the platform health check. */
export function stagingGate(password: string) {
  return (req: OpsRequest, res: Response, next: NextFunction) => {
    if (req.path === '/healthz' || passesGate(password, req.headers as Parameters<typeof passesGate>[1])) return next();
    res.status(401).json({ error: { code: 'STAGING_LOCKED', message: 'This staging site needs its password', requestId: req.requestId } });
  };
}
