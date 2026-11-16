// Masking contract for websocket events (TechSpec 6.2 and 11): one socket per role, every event
// this phase emits is triggered with Demo Co's restricted values in play, and each payload a role
// receives is checked against the same needles as the GET crawl. Typed text carries the values
// maskBody hides (TechSpec 5.4: addresses, numbers, logins); names in free text are not masked.
import type { AddressInfo } from 'node:net';
import { mentionToken } from '@opshub/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SENSITIVE_FIXTURES } from '../../src/dev/preview-fixture';
import { JobsService } from '../../src/jobs/jobs.service';
import { REALTIME_PATH, SOCKET_EVENTS } from '../../src/realtime/realtime.gateway';
import { AS, RUN, startApp, type TestContext } from '../helpers';
import { MASKING_SOCKET_EVENTS } from './endpoints';

type Who = keyof typeof AS;
const VIEWERS = Object.keys(AS) as Who[];
const ORIGIN = 'http://localhost:3000';

let ctx: TestContext;
let url: string;
const sockets = new Map<Who, Socket>();
const received = new Map<Who, Array<{ event: string; text: string }>>();

function connect(headers: Record<string, string>): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = io(`${url}/rt`, { path: REALTIME_PATH, transports: ['websocket'], extraHeaders: headers, reconnection: false, forceNew: true });
    const timer = setTimeout(() => reject(new Error('socket did not connect')), 5000);
    s.on('connect', () => {
      clearTimeout(timer);
      resolve(s);
    });
    s.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Resolves when the server has dropped the socket (or it never got in). */
function refused(headers: Record<string, string>): Promise<boolean> {
  return new Promise((resolve) => {
    const s = io(`${url}/rt`, { path: REALTIME_PATH, transports: ['websocket'], extraHeaders: headers, reconnection: false, forceNew: true });
    const done = (v: boolean) => {
      s.close();
      resolve(v);
    };
    s.on('disconnect', () => done(true));
    s.on('connect_error', () => done(true));
    setTimeout(() => done(!s.connected), 1500);
  });
}

const settle = async () => {
  await ctx.app.get(JobsService).drain();
  await new Promise((r) => setTimeout(r, 300));
};

beforeAll(async () => {
  ctx = await startApp();
  url = `http://127.0.0.1:${(ctx.app.getHttpServer().address() as AddressInfo).port}`;
  for (const who of VIEWERS) {
    const s = await connect({ cookie: await ctx.cookieFor(AS[who]), origin: ORIGIN });
    received.set(who, []);
    for (const event of SOCKET_EVENTS) s.on(event, (payload: unknown) => received.get(who)!.push({ event, text: JSON.stringify(payload) }));
    sockets.set(who, s);
  }
  // Give the server a moment to finish joining each socket to its room.
  await new Promise((r) => setTimeout(r, 200));

  // inbox.message_new and notification.new (the PM's client-message alert): Demo Co writes back with
  // its contact details and a login in the text.
  const simulate = await ctx
    .http()
    .post('/api/v1/dev/inbox/simulate')
    .set('Cookie', await ctx.cookieFor(AS.ADMIN))
    .send({ channel: 'EMAIL', threadKey: 'demo-thread-banner', body: `Ref ${RUN}. Call me on +91 98200 12345 or priya@demo.example.com.\nPassword: Hunter2!` });
  expect(simulate.status, JSON.stringify(simulate.body)).toBe(201);
  await settle();

  // chat.message_new and notification.new (the mention): the member pastes the same details.
  const project = await ctx.prisma.project.findFirstOrThrow({ where: { department: 'SEO', client: { companyName: 'Demo Co' } } });
  const channel = await ctx.prisma.chatChannel.findUniqueOrThrow({ where: { projectId: project.id } });
  const pm = await ctx.userId(AS.PM_OWN);
  const post = await ctx
    .http()
    .post(`/api/v1/chat/channels/${channel.id}/messages`)
    .set('Cookie', await ctx.cookieFor(AS.TEAM_MEMBER))
    .send({ body: `${mentionToken('user', pm, 'Pavan')} ${mentionToken('client', project.clientId, 'priya@demo.example.com')} ${RUN}\nThe client login: demoadmin / Hunter2!\nCall her on +91 98200 12345 or priya@demo.example.com` });
  expect(post.status, JSON.stringify(post.body)).toBe(201);
  await settle();
});

afterAll(async () => {
  for (const s of sockets.values()) s.close();
  await ctx.close();
});

describe('socket registry', () => {
  it('every event the gateway emits is crawled', () => {
    expect([...MASKING_SOCKET_EVENTS].sort()).toEqual([...SOCKET_EVENTS].sort());
  });

  it('refuses connections without a session or from another origin', async () => {
    expect(await refused({ origin: ORIGIN })).toBe(true);
    expect(await refused({ cookie: await ctx.cookieFor(AS.ADMIN), origin: 'https://evil.example.com' })).toBe(true);
  });
});

describe('the crawl reaches real events', () => {
  // Guards against a suite that passes because nothing was delivered.
  it.each(MASKING_SOCKET_EVENTS)('%s reached someone', (event) => {
    const all = [...received.values()].flat().filter((r) => r.event === event);
    expect(all.length).toBeGreaterThan(0);
  });

  it('delivers per scope: the PM gets all three, HR gets no client events', () => {
    const events = (who: Who) => new Set(received.get(who)!.map((r) => r.event));
    expect(events('PM_OWN')).toEqual(new Set(SOCKET_EVENTS));
    expect(events('HR').has('inbox.message_new')).toBe(false);
    expect(events('HR').has('chat.message_new')).toBe(false);
  });
});

describe.each(VIEWERS)('as %s', (who) => {
  it.each(MASKING_SOCKET_EVENTS)('%s leaks nothing', (event) => {
    const text = received.get(who)!.filter((r) => r.event === event).map((r) => r.text).join('\n');
    const leaks = SENSITIVE_FIXTURES.filter((f) => !f.visibleTo.includes(who) && text.includes(f.needle)).map((f) => f.what);
    expect(leaks, `${who} received restricted values on ${event}`).toEqual([]);
  });
});
