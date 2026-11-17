// Staging gate (APP_ENV=staging): one shared password in front of the whole demo site. The token
// is derived from STAGING_PASSWORD; the API checks the same token (apps/api/src/common/staging-gate.ts,
// keep the two in step), so the gate holds even if the API is reached some other way.
// Server only: the password never reaches the browser.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const GATE_COOKIE = 'opshub_gate';
export const GATE_HEADER = 'x-opshub-gate';

export const isStaging = () => process.env.APP_ENV === 'staging';

const password = () => process.env.STAGING_PASSWORD ?? '';

/** Staging with no usable password: the site stays shut rather than open. */
export const gateMisconfigured = () => isStaging() && password().length < 16;

export const gateToken = () => createHmac('sha256', password()).update('opshub-staging-gate-v1').digest('base64url');

const same = (a: string, b: string) => {
  // Hash both sides so the comparison takes the same time whatever the lengths.
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
};

export const passwordMatches = (given: string) => !gateMisconfigured() && same(given, password());

export const tokenMatches = (given: string | undefined) => Boolean(given) && !gateMisconfigured() && same(given!, gateToken());

/** Header for server-side calls to the API, which checks the gate on staging. */
export const gateHeaders = (): Record<string, string> => (isStaging() && !gateMisconfigured() ? { [GATE_HEADER]: gateToken() } : {});

/** Only same-site paths, so the password page cannot be used to bounce people elsewhere. */
export const safeNext = (next: string | null | undefined) => (next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/');
