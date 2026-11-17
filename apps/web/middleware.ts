// Staging gate (APP_ENV=staging): every page, API call and live connection needs the staging
// password first. Production and local runs pass straight through.
import { NextResponse, type NextRequest } from 'next/server';
import { GATE_COOKIE, gateMisconfigured, isStaging, tokenMatches } from './lib/staging-gate';

const OPEN = new Set(['/gate', '/gate/unlock', '/icon.svg', '/manifest.webmanifest']);

export function middleware(req: NextRequest) {
  if (!isStaging()) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (gateMisconfigured()) return new NextResponse('This staging site is closed: STAGING_PASSWORD is not set.', { status: 503 });
  if (OPEN.has(pathname) || tokenMatches(req.cookies.get(GATE_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: { code: 'STAGING_LOCKED', message: 'This staging site needs its password', requestId: '' } }, { status: 401 });
  }
  // Show the password page in place, then come back here.
  return NextResponse.rewrite(new URL(`/gate?next=${encodeURIComponent(pathname + search)}`, req.url));
}

export const config = {
  runtime: 'nodejs',
  // Covers the live connection too; the API checks the gate cookie there again (realtime.gateway.ts).
  matcher: ['/((?!_next/static|_next/image).*)'],
};
