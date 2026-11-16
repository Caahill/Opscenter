import { SESSION_IDLE_MS } from '@opshub/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AS, startApp, testEnv, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startApp();
});
afterAll(() => ctx.close());

describe('dev login and sessions', () => {
  it('lists seed users and signs one in', async () => {
    const list = await ctx.http().get('/api/v1/auth/dev/users').expect(200);
    expect(list.body.map((u: { email: string }) => u.email)).toContain(AS.TEAM_MEMBER);

    const me = await ctx.http().get('/api/v1/me').set('Cookie', await ctx.cookieFor(AS.TEAM_LEADER)).expect(200);
    expect(me.body).toMatchObject({ email: AS.TEAM_LEADER, roles: ['TEAM_LEADER'], teamName: 'SEO' });
    expect(me.body.permissions).toEqual(expect.arrayContaining(['user.read', 'team.read', 'client.read', 'task.update']));
    expect(me.body.permissions).not.toContain('user.manage');
  });

  it('logout revokes the session', async () => {
    const res = await ctx
      .http()
      .post('/api/v1/auth/dev/login')
      .send({ userId: await ctx.userId(AS.HR) })
      .expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    await ctx.http().post('/api/v1/auth/logout').set('Cookie', cookie).expect(200);
    await ctx.http().get('/api/v1/me').set('Cookie', cookie).expect(401);
  });

  it('expires sessions after 12 hours of inactivity', async () => {
    const res = await ctx
      .http()
      .post('/api/v1/auth/dev/login')
      .send({ userId: await ctx.userId(AS.ACCOUNTS) })
      .expect(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? [])[0]!.split(';')[0]!;
    await ctx.http().get('/api/v1/me').set('Cookie', cookie).expect(200);
    const userId = await ctx.userId(AS.ACCOUNTS);
    await ctx.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 60_000) },
    });
    await ctx.http().get('/api/v1/me').set('Cookie', cookie).expect(401);
  });

  it('rejects a forged cookie', async () => {
    await ctx.http().get('/api/v1/me').set('Cookie', 'opshub_session=not-a-real-token').expect(401);
  });

  it('records logins in the audit log', async () => {
    const id = await ctx.userId(AS.TEAM_LEADER);
    expect(await ctx.prisma.auditLog.count({ where: { action: 'LOGIN', actorId: id } })).toBeGreaterThan(0);
  });
});

describe('request hygiene', () => {
  it('returns the error shape with a request id and no echoed input', async () => {
    const res = await ctx
      .http()
      .post('/api/v1/users')
      .set('Cookie', await ctx.cookieFor(AS.ADMIN))
      .send({ email: 'not-an-email+leak@', name: 'x', roles: ['NOPE'] })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.requestId).toMatch(/[\w-]{8,}/);
    expect(JSON.stringify(res.body)).not.toContain('leak');
  });

  it('blocks state-changing requests from another origin', async () => {
    const res = await ctx
      .http()
      .post('/api/v1/auth/logout')
      .set('Origin', 'https://evil.example.com')
      .set('Cookie', await ctx.cookieFor(AS.ADMIN))
      .expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('serves the health check outside /api/v1', async () => {
    await ctx.http().get('/healthz').expect(200, { status: 'ok' });
  });

  it('returns 404 in the standard shape for unknown routes', async () => {
    const res = await ctx.http().get('/api/v1/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('does not offer Google sign-in when AUTH_MODE=dev', async () => {
    await ctx.http().get('/api/v1/auth/google').expect(404);
  });
});

describe('AUTH_MODE=google', () => {
  it('does not register the dev login routes', async () => {
    const google = await startApp({
      env: testEnv({
        AUTH_MODE: 'google',
        GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'test-secret',
        GOOGLE_ALLOWED_DOMAINS: 'syspreedigital.com',
      }),
    });
    try {
      await google.http().get('/api/v1/auth/dev/users').expect(404);
      await google.http().get('/api/v1/dev/policy-preview').expect(404);
      const start = await google.http().get('/api/v1/auth/google').expect(302);
      expect(start.headers.location).toContain('accounts.google.com');
      expect(start.headers.location).toContain(encodeURIComponent('http://localhost:3000/api/v1/auth/callback'));
      await google.http().get('/api/v1/auth/callback?code=x&state=y').expect(302).expect('location', /error=state_mismatch/);
    } finally {
      await google.close();
    }
  });
});
