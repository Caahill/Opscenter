// Gmail access per mailbox (TechSpec 7.1). The live client calls the Gmail REST API with the
// mailbox's refresh token; the fake keeps mailboxes in memory for local runs and tests.
import { randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import {
  buildMime,
  mimeToGmailPayload,
  parseGmailMessage,
  toBase64Url,
  type Address,
  type GmailApiMessage,
  type OutgoingAttachment,
  type ParsedEmail,
} from './mime';

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

export interface MailboxCredentials {
  address: string;
  refreshToken: string;
}

export interface HistoryPage {
  messageIds: string[];
  historyId: string;
  /** The start id is older than Gmail keeps (about a week): run a full sync instead. */
  expired: boolean;
}

export interface GmailClient {
  readonly mode: 'live' | 'fake';
  profile(mb: MailboxCredentials): Promise<{ emailAddress: string; historyId: string }>;
  watch(mb: MailboxCredentials, topic: string): Promise<{ historyId: string; expiration: Date }>;
  history(mb: MailboxCredentials, startHistoryId: string): Promise<HistoryPage>;
  list(mb: MailboxCredentials, query: string, pageToken?: string | null): Promise<{ ids: string[]; nextPageToken: string | null }>;
  get(mb: MailboxCredentials, id: string): Promise<ParsedEmail>;
  attachment(mb: MailboxCredentials, messageId: string, attachmentId: string): Promise<Buffer>;
  send(mb: MailboxCredentials, raw: string, threadId?: string | null): Promise<{ id: string; threadId: string }>;
}

export class GmailApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`Gmail API ${status} ${code}`);
  }
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** Consent URL for connecting a mailbox (offline access, so we get a refresh token). */
export function gmailAuthUrl(cfg: GoogleOAuthConfig, state: string, loginHint?: string): string {
  return new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri).generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [GMAIL_SCOPE, 'email'],
    state,
    login_hint: loginHint,
    include_granted_scopes: true,
  });
}

export async function exchangeGmailCode(cfg: GoogleOAuthConfig, code: string): Promise<{ refreshToken: string; email: string }> {
  const client = new OAuth2Client(cfg.clientId, cfg.clientSecret, cfg.redirectUri);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token || !tokens.id_token) throw new GmailApiError(400, 'NO_REFRESH_TOKEN');
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: cfg.clientId });
  const email = ticket.getPayload()?.email;
  if (!email) throw new GmailApiError(400, 'NO_EMAIL');
  return { refreshToken: tokens.refresh_token, email: email.toLowerCase() };
}

export class LiveGmailClient implements GmailClient {
  readonly mode = 'live' as const;
  constructor(private readonly cfg: GoogleOAuthConfig) {}

  private async call<T>(mb: MailboxCredentials, path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
    const client = new OAuth2Client(this.cfg.clientId, this.cfg.clientSecret, this.cfg.redirectUri);
    client.setCredentials({ refresh_token: mb.refreshToken });
    try {
      const res = await client.request<T>({ url: `${API}${path}`, method: init.method ?? 'GET', data: init.body, retry: true });
      return res.data;
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status ?? 500;
      // Never pass Google's message on: it can quote addresses.
      throw new GmailApiError(status, status === 404 ? 'NOT_FOUND' : status === 401 ? 'UNAUTHORIZED' : 'REQUEST_FAILED');
    }
  }

  profile(mb: MailboxCredentials) {
    return this.call<{ emailAddress: string; historyId: string }>(mb, '/profile');
  }

  async watch(mb: MailboxCredentials, topic: string) {
    const r = await this.call<{ historyId: string; expiration: string }>(mb, '/watch', { method: 'POST', body: { topicName: topic } });
    return { historyId: r.historyId, expiration: new Date(Number(r.expiration)) };
  }

  async history(mb: MailboxCredentials, startHistoryId: string): Promise<HistoryPage> {
    const ids = new Set<string>();
    let pageToken: string | undefined;
    let historyId = startHistoryId;
    try {
      do {
        const q = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded', ...(pageToken ? { pageToken } : {}) });
        const r = await this.call<{ history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>; historyId: string; nextPageToken?: string }>(
          mb,
          `/history?${q}`,
        );
        for (const h of r.history ?? []) for (const a of h.messagesAdded ?? []) ids.add(a.message.id);
        historyId = r.historyId;
        pageToken = r.nextPageToken;
      } while (pageToken);
    } catch (err) {
      if (err instanceof GmailApiError && err.status === 404) return { messageIds: [], historyId, expired: true };
      throw err;
    }
    return { messageIds: [...ids], historyId, expired: false };
  }

  async list(mb: MailboxCredentials, query: string, pageToken?: string | null) {
    const q = new URLSearchParams({ q: query, maxResults: '100', ...(pageToken ? { pageToken } : {}) });
    const r = await this.call<{ messages?: Array<{ id: string }>; nextPageToken?: string }>(mb, `/messages?${q}`);
    return { ids: (r.messages ?? []).map((m) => m.id), nextPageToken: r.nextPageToken ?? null };
  }

  async get(mb: MailboxCredentials, id: string) {
    return parseGmailMessage(await this.call<GmailApiMessage>(mb, `/messages/${encodeURIComponent(id)}?format=full`));
  }

  async attachment(mb: MailboxCredentials, messageId: string, attachmentId: string) {
    const r = await this.call<{ data: string }>(mb, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
    return Buffer.from(r.data, 'base64url');
  }

  async send(mb: MailboxCredentials, raw: string, threadId?: string | null) {
    return this.call<{ id: string; threadId: string }>(mb, '/messages/send', {
      method: 'POST',
      body: { raw: toBase64Url(raw), ...(threadId ? { threadId } : {}) },
    });
  }
}

// ---- Fake ----

interface FakeMailbox {
  historyId: number;
  messages: Map<string, GmailApiMessage>;
  history: Array<{ historyId: number; id: string }>;
}

export interface FakeInbound {
  from: Address;
  to: Address[];
  cc?: Address[];
  subject: string;
  text: string;
  threadId?: string;
  inReplyTo?: string | null;
  attachments?: OutgoingAttachment[];
  date?: Date;
}

/**
 * In-memory Gmail for GMAIL_MODE=fake. `deliver` plays the part of an incoming mail (or a reply
 * someone typed in Gmail itself); `send` stores what Ops Hub sent, as Gmail would.
 */
export class FakeGmailClient implements GmailClient {
  readonly mode = 'fake' as const;
  private readonly boxes = new Map<string, FakeMailbox>();
  readonly sent: Array<{ mailbox: string; raw: string; threadId: string; id: string }> = [];

  private box(address: string): FakeMailbox {
    const key = address.toLowerCase();
    let b = this.boxes.get(key);
    if (!b) {
      // Like Gmail, history ids only grow, also across restarts of a process using the fake.
      b = { historyId: Date.now(), messages: new Map(), history: [] };
      this.boxes.set(key, b);
    }
    return b;
  }

  private store(address: string, raw: string, threadId: string, labelIds: string[], date: Date): string {
    const b = this.box(address);
    const id = randomUUID().replace(/-/g, '').slice(0, 16);
    b.historyId++;
    b.messages.set(id, { id, threadId, historyId: String(b.historyId), internalDate: String(date.getTime()), labelIds, payload: mimeToGmailPayload(raw) });
    b.history.push({ historyId: b.historyId, id });
    return id;
  }

  /** A message arriving in `mailbox`. Returns its Gmail id and thread id. */
  deliver(mailbox: string, m: FakeInbound): { id: string; threadId: string } {
    const threadId = m.threadId ?? randomUUID().replace(/-/g, '').slice(0, 16);
    const { raw } = buildMime({ ...m, inReplyTo: m.inReplyTo ?? null });
    return { id: this.store(mailbox, raw, threadId, ['INBOX'], m.date ?? new Date()), threadId };
  }

  async profile(mb: MailboxCredentials) {
    return { emailAddress: mb.address, historyId: String(this.box(mb.address).historyId) };
  }

  async watch(mb: MailboxCredentials) {
    return { historyId: String(this.box(mb.address).historyId), expiration: new Date(Date.now() + 7 * 86_400_000) };
  }

  async history(mb: MailboxCredentials, startHistoryId: string): Promise<HistoryPage> {
    const b = this.box(mb.address);
    const start = Number(startHistoryId);
    return { messageIds: b.history.filter((h) => h.historyId > start).map((h) => h.id), historyId: String(b.historyId), expired: false };
  }

  async list(mb: MailboxCredentials, _query: string, pageToken?: string | null) {
    const ids = [...this.box(mb.address).messages.keys()].reverse();
    const start = pageToken ? Number(pageToken) : 0;
    const next = start + 100 < ids.length ? String(start + 100) : null;
    return { ids: ids.slice(start, start + 100), nextPageToken: next };
  }

  async get(mb: MailboxCredentials, id: string) {
    const m = this.box(mb.address).messages.get(id);
    if (!m) throw new GmailApiError(404, 'NOT_FOUND');
    return parseGmailMessage(m);
  }

  async attachment(mb: MailboxCredentials, messageId: string, attachmentId: string) {
    const parsed = await this.get(mb, messageId);
    const a = parsed.attachments.find((x) => x.attachmentId === attachmentId || x.fileName === attachmentId);
    if (!a?.data) throw new GmailApiError(404, 'NOT_FOUND');
    return a.data;
  }

  async send(mb: MailboxCredentials, raw: string, threadId?: string | null) {
    const thread = threadId ?? randomUUID().replace(/-/g, '').slice(0, 16);
    const id = this.store(mb.address, raw, thread, ['SENT'], new Date());
    this.sent.push({ mailbox: mb.address, raw, threadId: thread, id });
    return { id, threadId: thread };
  }
}

// ---- Pub/Sub push verification (TechSpec 7.1, AGENTS.md rule 10) ----

export interface PubSubVerifier {
  /** True when the push carries a valid Google-signed token for our audience and service account. */
  verify(authorization: string | undefined): Promise<boolean>;
}

export class LivePubSubVerifier implements PubSubVerifier {
  private readonly client = new OAuth2Client();
  constructor(
    private readonly audience: string,
    private readonly serviceAccountEmail: string,
  ) {}

  async verify(authorization: string | undefined): Promise<boolean> {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) return false;
    try {
      const ticket = await this.client.verifyIdToken({ idToken: token, audience: this.audience });
      const p = ticket.getPayload();
      return Boolean(p?.email_verified && p.email === this.serviceAccountEmail);
    } catch {
      return false;
    }
  }
}

/** Local and test stand-in: accepts only the fixed fake token. */
export const FAKE_PUBSUB_TOKEN = 'fake-pubsub-token';
export class FakePubSubVerifier implements PubSubVerifier {
  async verify(authorization: string | undefined) {
    return authorization === `Bearer ${FAKE_PUBSUB_TOKEN}`;
  }
}

/** Decodes a Pub/Sub push body: { message: { data: base64({ emailAddress, historyId }) } }. */
export function parsePubSubPush(body: unknown): { emailAddress: string; historyId: string } | null {
  const data = (body as { message?: { data?: unknown } } | null)?.message?.data;
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64').toString('utf8')) as { emailAddress?: unknown; historyId?: unknown };
    if (typeof parsed.emailAddress !== 'string' || (typeof parsed.historyId !== 'string' && typeof parsed.historyId !== 'number')) return null;
    return { emailAddress: parsed.emailAddress.toLowerCase(), historyId: String(parsed.historyId) };
  } catch {
    return null;
  }
}
