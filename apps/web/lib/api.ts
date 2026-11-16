// Server-side API access for server components. Forwards the user's cookie; the API decides
// what they may see (AGENTS.md: apps/web makes no permission decisions).
import type { ApiError, MeView } from '@opshub/shared';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, opts: { allowForbidden?: boolean } = {}): Promise<T> {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    headers: { cookie: cookieHeader, accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 401) redirect('/login');
  if (res.status === 403 && !opts.allowForbidden) redirect('/no-access');
  if (res.status === 404) notFound();
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(res.status, body?.error.code ?? 'ERROR', body?.error.message ?? res.statusText);
  }
  return (await res.json()) as T;
}

/** Like api(), but returns null on 403 so pages can show a "no access" state. */
export async function apiIfAllowed<T>(path: string): Promise<T | null> {
  try {
    return await api<T>(path, { allowForbidden: true });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 403) return null;
    throw err;
  }
}

export const getMe = () => api<MeView>('/me');

/** Shows the seed-user picker. The API refuses dev login in production regardless. */
export const isDevAuth = () => (process.env.AUTH_MODE ?? 'dev') === 'dev';

/**
 * Where the browser opens its live connection. In production the load balancer routes /api/* on
 * the app's own origin to the API (''); locally the browser reaches the API port directly, since
 * the /api/v1 rewrite does not carry websockets.
 */
export const realtimeUrl = () => process.env.REALTIME_URL ?? (process.env.NODE_ENV === 'production' ? '' : API_URL);
