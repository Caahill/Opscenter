// WhatsApp Business Platform Cloud API (TechSpec 7.2): webhook signature check, payload parsing
// and the send/media client. One-to-one chats only in Phase 1; groups are Phase 2 (wa_groups).
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(app secret, raw body). Checked before anything is stored. */
export function verifyWhatsAppSignature(appSecret: string, rawBody: Buffer | undefined, header: string | undefined): boolean {
  if (!rawBody || !header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(signWhatsAppPayload(appSecret, rawBody));
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const signWhatsAppPayload = (appSecret: string, rawBody: Buffer | string): string =>
  `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;

const Media = z.object({ id: z.string(), mime_type: z.string().optional(), caption: z.string().optional(), filename: z.string().optional() });

const Message = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
  image: Media.optional(),
  document: Media.optional(),
  audio: Media.optional(),
  video: Media.optional(),
  sticker: Media.optional(),
});

const WebhookBody = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              metadata: z.object({ phone_number_id: z.string() }).partial().optional(),
              contacts: z.array(z.object({ wa_id: z.string(), profile: z.object({ name: z.string() }).partial().optional() })).optional(),
              messages: z.array(Message).optional(),
            })
            .passthrough(),
        }),
      ),
    }),
  ),
});

export interface InboundWhatsApp {
  wamid: string;
  /** Sender's number, digits with country code (WhatsApp wa_id). */
  from: string;
  sentAt: Date;
  text: string;
  media: { id: string; mimeType: string; fileName: string } | null;
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf', 'audio/ogg': 'ogg', 'video/mp4': 'mp4' };

/** Messages in a webhook body. Status callbacks (sent, delivered, read) carry none and are ignored. */
export function parseWhatsAppWebhook(body: unknown): InboundWhatsApp[] {
  const parsed = WebhookBody.safeParse(body);
  if (!parsed.success || parsed.data.object !== 'whatsapp_business_account') return [];
  const out: InboundWhatsApp[] = [];
  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      for (const m of change.value.messages ?? []) {
        const media = m.image ?? m.document ?? m.audio ?? m.video ?? m.sticker ?? null;
        const mimeType = media?.mime_type?.split(';')[0]?.trim() ?? 'application/octet-stream';
        out.push({
          wamid: m.id,
          from: m.from.replace(/\D/g, ''),
          sentAt: new Date(Number(m.timestamp) * 1000),
          text: m.text?.body ?? media?.caption ?? (media ? '' : `[${m.type} message]`),
          media: media
            ? { id: media.id, mimeType, fileName: media.filename ?? `${m.type}-${m.id.slice(-8)}.${EXT[mimeType] ?? 'bin'}` }
            : null,
        });
      }
    }
  }
  return out;
}

/** Builds a webhook body as Meta sends it (fake mode, tests). */
export function whatsAppWebhookBody(m: { from: string; text: string; wamid?: string; sentAt?: Date; profileName?: string; phoneNumberId?: string }) {
  const wamid = m.wamid ?? `wamid.${randomUUID().replace(/-/g, '')}`;
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'fake-waba',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { phone_number_id: m.phoneNumberId ?? 'fake-number' },
              contacts: [{ wa_id: m.from, profile: { name: m.profileName ?? 'Client' } }],
              messages: [{ from: m.from, id: wamid, timestamp: String(Math.floor((m.sentAt ?? new Date()).getTime() / 1000)), type: 'text', text: { body: m.text } }],
            },
          },
        ],
      },
    ],
  };
}

/** Free-form replies are allowed for 24 hours after the client's last message (customer service window). */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface WhatsAppClient {
  readonly mode: 'live' | 'fake';
  sendText(to: string, body: string): Promise<{ wamid: string }>;
  sendTemplate(to: string, name: string, language: string, params: string[]): Promise<{ wamid: string }>;
  media(mediaId: string): Promise<{ data: Buffer; mimeType: string }>;
}

export class WhatsAppApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`WhatsApp API ${status} ${code}`);
  }
}

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  graphVersion: string;
}

export class LiveWhatsAppClient implements WhatsAppClient {
  readonly mode = 'live' as const;
  constructor(private readonly cfg: WhatsAppConfig) {}

  private async graph<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
    const res = await fetch(`https://graph.facebook.com/${this.cfg.graphVersion}/${path}`, {
      method: init.method ?? 'GET',
      headers: { authorization: `Bearer ${this.cfg.accessToken}`, 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(20_000),
    });
    // Meta's error text can quote the recipient number; keep only the status.
    if (!res.ok) throw new WhatsAppApiError(res.status, 'REQUEST_FAILED');
    return (await res.json()) as T;
  }

  private async message(body: object) {
    const r = await this.graph<{ messages: Array<{ id: string }> }>(`${this.cfg.phoneNumberId}/messages`, {
      method: 'POST',
      body: { messaging_product: 'whatsapp', recipient_type: 'individual', ...body },
    });
    return { wamid: r.messages[0]!.id };
  }

  sendText(to: string, body: string) {
    return this.message({ to, type: 'text', text: { preview_url: false, body } });
  }

  sendTemplate(to: string, name: string, language: string, params: string[]) {
    return this.message({
      to,
      type: 'template',
      template: { name, language: { code: language }, components: params.length ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }] : [] },
    });
  }

  async media(mediaId: string) {
    const meta = await this.graph<{ url: string; mime_type: string }>(encodeURIComponent(mediaId));
    const res = await fetch(meta.url, { headers: { authorization: `Bearer ${this.cfg.accessToken}` }, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new WhatsAppApiError(res.status, 'MEDIA_FAILED');
    return { data: Buffer.from(await res.arrayBuffer()), mimeType: meta.mime_type };
  }
}

export class FakeWhatsAppClient implements WhatsAppClient {
  readonly mode = 'fake' as const;
  readonly sent: Array<{ to: string; kind: 'text' | 'template'; body: string; wamid: string }> = [];
  readonly mediaStore = new Map<string, { data: Buffer; mimeType: string }>();

  async sendText(to: string, body: string) {
    const wamid = `wamid.out.${randomUUID().replace(/-/g, '')}`;
    this.sent.push({ to, kind: 'text', body, wamid });
    return { wamid };
  }

  async sendTemplate(to: string, name: string, _language: string, params: string[]) {
    const wamid = `wamid.out.${randomUUID().replace(/-/g, '')}`;
    this.sent.push({ to, kind: 'template', body: `${name}(${params.join(', ')})`, wamid });
    return { wamid };
  }

  async media(mediaId: string) {
    const m = this.mediaStore.get(mediaId);
    if (!m) throw new WhatsAppApiError(404, 'MEDIA_FAILED');
    return m;
  }
}
