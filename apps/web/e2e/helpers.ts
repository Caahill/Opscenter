import { randomBytes } from 'node:crypto';
import { expect, request, type APIRequestContext, type Page } from '@playwright/test';
import { WEB_URL } from './env.mts';

export const RUN = randomBytes(3).toString('hex');

export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(email.replace(/\./g, '\\.')) }).click();
  await page.waitForURL((u) => u.pathname === '/');
}

/** API session for test setup, through the same proxy the browser uses. */
export async function apiAs(email: string): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: WEB_URL });
  const users = (await (await ctx.get('/api/v1/auth/dev/users')).json()) as Array<{ id: string; email: string }>;
  const user = users.find((u) => u.email === email);
  if (!user) throw new Error(`no seed user ${email}`);
  expect((await ctx.post('/api/v1/auth/dev/login', { data: { userId: user.id } })).ok()).toBe(true);
  return ctx;
}

export async function createClient(api: APIRequestContext, name: string) {
  const res = await api.post('/api/v1/clients', { data: { companyName: `${name} ${RUN}`, market: 'IN' } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string; companyName: string };
}

export async function createProject(api: APIRequestContext, clientId: string, department: string, packageName?: string) {
  let packageId: string | null = null;
  if (packageName) {
    const pkgs = (await (await api.get(`/api/v1/packages?department=${department}`)).json()) as Array<{ id: string; name: string }>;
    packageId = pkgs.find((p) => p.name === packageName)?.id ?? null;
  }
  const res = await api.post('/api/v1/projects', { data: { clientId, department, packageId } });
  expect(res.status()).toBe(201);
  return (await res.json()) as { id: string };
}
