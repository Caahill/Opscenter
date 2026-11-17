// Staging gate (APP_ENV=staging): the demo site uses dev login, so nothing but the health check may
// answer without the staging password's token, over HTTP or the live connection.
import type { AddressInfo } from 'node:net';
import { SESSION_COOKIE } from '@opshub/shared';
import { io } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GATE_COOKIE, GATE_HEADER, stagingGateToken } from '../src/common/staging-gate';
import { REALTIME_PATH } from '../src/realtime/realtime.gateway';
import { AS, startApp, testEnv, type TestContext } from './helpers';

const PASSWORD = 'staging-test-password-not-secret';
const TOKEN = stagingGateToken(PASSWORD);
const ORIGIN = 'http://localhost:3000';

let ctx: TestContext;
let url: string;
let session: string;

beforeAll(async () => {
  ctx = await startApp({ env: testEnv({ APP_ENV: 'staging', STAGING_PASSWORD: PASSWORD }) });
  url = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
  const res = await ctx
    .http()
    .post('/api/v1/auth/dev/login')
    .set(GATE_HEADER, TOKEN)
    .send({ userId: await ctx.userId(AS.ADMIN) })
    .expect(200);
  session = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE}=`))!.split(';')[0]!;
});

afterAll(async () => {
  await ctx.close();
});

describe('HTTP', () => {
  it('the health check answers without the password', async () => {
    await ctx.http().get('/healthz').expect(200);
  });

  it.each([
    ['GET', '/api/v1/auth/dev/users'],
    ['POST', '/api/v1/auth/dev/login'],
    ['GET', '/api/v1/me'],
  ])('%s %s is refused without the gate token', async (method, path) => {
    const req = method === 'GET' ? ctx.http().get(path) : ctx.http().post(path).send({});
    const res = await req.set('Cookie', session);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('STAGING_LOCKED');
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });

  it('refuses a wrong token, and the password itself in place of the token', async () => {
    for (const wrong of [stagingGateToken('some-other-password'), PASSWORD, '']) {
      await ctx.http().get('/api/v1/auth/dev/users').set(GATE_HEADER, wrong).expect(401);
    }
  });

  it('lets the gate cookie (browser) and the gate header (web server) through', async () => {
    await ctx.http().get('/api/v1/auth/dev/users').set('Cookie', `${GATE_COOKIE}=${TOKEN}`).expect(200);
    await ctx.http().get('/api/v1/me').set(GATE_HEADER, TOKEN).set('Cookie', session).expect(200);
  });
});

describe('live connection', () => {
  const tryConnect = (cookie: string) =>
    new Promise<boolean>((resolve) => {
      const s = io(`${url}/rt`, { path: REALTIME_PATH, transports: ['websocket'], extraHeaders: { cookie, origin: ORIGIN }, reconnection: false, forceNew: true });
      let connected = false;
      let settled = false;
      const done = (v: boolean) => {
        if (settled) return;
        settled = true;
        resolve(v);
        s.close();
      };
      s.on('connect', () => {
        connected = true;
      });
      s.on('disconnect', () => done(false));
      s.on('connect_error', () => done(false));
      // Still connected after the server ran its checks: let in.
      setTimeout(() => done(connected && s.connected), 1500);
    });

  it('is refused with a session but no gate cookie', async () => {
    expect(await tryConnect(session)).toBe(false);
  });

  it('is let in with a session and the gate cookie', async () => {
    expect(await tryConnect(`${session}; ${GATE_COOKIE}=${TOKEN}`)).toBe(true);
  });
});
