// RFC 5322 / MIME helpers for Gmail (TechSpec 7.1): build outbound messages with threading
// headers, parse address lists, and read the parts of a Gmail API message.
import { randomUUID } from 'node:crypto';

export interface Address {
  name: string | null;
  address: string;
}

/** Splits "A <a@x.com>, \"Doe, Jane\" <j@y.com>, b@z.com" respecting quotes and angle brackets. */
export function parseAddressList(header: string | null | undefined): Address[] {
  if (!header) return [];
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let angle = 0;
  for (const ch of header) {
    if (ch === '"') quoted = !quoted;
    else if (ch === '<' && !quoted) angle++;
    else if (ch === '>' && !quoted) angle = Math.max(0, angle - 1);
    if (ch === ',' && !quoted && angle === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p): Address | null => {
      const m = /^(.*?)\s*<([^>]+)>$/.exec(p);
      if (m) {
        const name = m[1]!.trim().replace(/^"|"$/g, '').trim();
        return { name: name || null, address: m[2]!.trim().toLowerCase() };
      }
      return p.includes('@') ? { name: null, address: p.toLowerCase() } : null;
    })
    .filter((a): a is Address => a !== null);
}

export const formatAddress = (a: Address): string =>
  a.name ? `${encodeWord(a.name.replace(/"/g, ''), true)} <${a.address}>` : a.address;

/** RFC 2047 encoded-word for non-ASCII header text. */
function encodeWord(text: string, quoteAscii = false): string {
  if (/^[\x20-\x7e]*$/.test(text)) return quoteAscii && /[,;:<>@]/.test(text) ? `"${text}"` : text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function decodeWords(text: string): string {
  return text.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, _charset: string, enc: string, data: string) =>
    enc.toUpperCase() === 'B'
      ? Buffer.from(data, 'base64').toString('utf8')
      : data.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__, h: string) => String.fromCharCode(parseInt(h, 16))),
  );
}

const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n').trimEnd();

export interface OutgoingAttachment {
  fileName: string;
  contentType: string;
  content: Buffer;
}

export interface OutgoingEmail {
  from: Address;
  to: Address[];
  cc?: Address[];
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string | null;
  attachments?: OutgoingAttachment[];
  /** Defaults to a fresh id on the sender's domain. */
  messageId?: string;
  date?: Date;
}

export interface BuiltEmail {
  raw: string;
  messageId: string;
}

/** Builds a MIME message: base64 UTF-8 text, and multipart/mixed when there are attachments. */
export function buildMime(m: OutgoingEmail): BuiltEmail {
  const domain = m.from.address.split('@')[1] ?? 'opshub.local';
  const messageId = m.messageId ?? `<${randomUUID()}@${domain}>`;
  const headers = [
    `From: ${formatAddress(m.from)}`,
    `To: ${m.to.map(formatAddress).join(', ')}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.map(formatAddress).join(', ')}`] : []),
    `Subject: ${encodeWord(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString()}`,
    `Message-ID: ${messageId}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`] : []),
    ...(m.references || m.inReplyTo ? [`References: ${[m.references, m.inReplyTo].filter(Boolean).join(' ').trim()}`] : []),
    'MIME-Version: 1.0',
  ];
  const textPart = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap76(Buffer.from(m.text, 'utf8').toString('base64'))];
  if (!m.attachments?.length) return { raw: [...headers, ...textPart].join('\r\n'), messageId };

  const boundary = `opshub-${randomUUID()}`;
  const lines = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, ...textPart];
  for (const a of m.attachments) {
    const name = a.fileName.replace(/["\r\n]/g, '_');
    lines.push(
      `--${boundary}`,
      `Content-Type: ${a.contentType}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(a.content.toString('base64')),
    );
  }
  lines.push(`--${boundary}--`);
  return { raw: lines.join('\r\n'), messageId };
}

export const toBase64Url = (s: string | Buffer): string => Buffer.from(s).toString('base64url');
export const fromBase64Url = (s: string): Buffer => Buffer.from(s, 'base64url');

// ---- Reading Gmail API messages (format=full) ----

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
}

export interface GmailApiMessage {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate?: string;
  labelIds?: string[];
  payload?: GmailPart;
}

export interface AttachmentRef {
  attachmentId: string | null;
  /** Inline content when Gmail returned it directly (small parts). */
  data: Buffer | null;
  fileName: string;
  contentType: string;
  size: number;
}

export interface ParsedEmail {
  id: string;
  threadId: string;
  historyId: string | null;
  labelIds: string[];
  from: Address | null;
  to: Address[];
  cc: Address[];
  subject: string;
  date: Date;
  messageId: string | null;
  references: string | null;
  inReplyTo: string | null;
  text: string;
  attachments: AttachmentRef[];
}

/** Plain text from HTML, for mail with no text/plain part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseGmailMessage(m: GmailApiMessage): ParsedEmail {
  const headers = new Map<string, string>();
  for (const h of m.payload?.headers ?? []) headers.set(h.name.toLowerCase(), h.value);
  const h = (name: string) => headers.get(name) ?? null;

  let plain: string | null = null;
  let html: string | null = null;
  const attachments: AttachmentRef[] = [];
  const walk = (p: GmailPart) => {
    const type = (p.mimeType ?? '').toLowerCase();
    if (p.filename) {
      attachments.push({
        attachmentId: p.body?.attachmentId ?? null,
        data: p.body?.data ? fromBase64Url(p.body.data) : null,
        fileName: decodeWords(p.filename),
        contentType: type || 'application/octet-stream',
        size: p.body?.size ?? 0,
      });
    } else if (type === 'text/plain' && p.body?.data && plain === null) {
      plain = fromBase64Url(p.body.data).toString('utf8');
    } else if (type === 'text/html' && p.body?.data && html === null) {
      html = fromBase64Url(p.body.data).toString('utf8');
    }
    for (const child of p.parts ?? []) walk(child);
  };
  if (m.payload) walk(m.payload);

  const dateHeader = h('date');
  const date = m.internalDate ? new Date(Number(m.internalDate)) : dateHeader ? new Date(dateHeader) : new Date();
  return {
    id: m.id,
    threadId: m.threadId,
    historyId: m.historyId ?? null,
    labelIds: m.labelIds ?? [],
    from: parseAddressList(h('from'))[0] ?? null,
    to: parseAddressList(h('to')),
    cc: parseAddressList(h('cc')),
    subject: decodeWords(h('subject') ?? ''),
    date,
    messageId: h('message-id'),
    references: h('references'),
    inReplyTo: h('in-reply-to'),
    text: plain ?? (html ? htmlToText(html) : ''),
    attachments,
  };
}

/** Reads a message produced by buildMime back into a Gmail-shaped payload (fake mailbox, tests). */
export function mimeToGmailPayload(raw: string): GmailPart {
  const [head, ...rest] = raw.split('\r\n\r\n');
  const body = rest.join('\r\n\r\n');
  const headers = head!.split('\r\n').map((line) => {
    const i = line.indexOf(':');
    return { name: line.slice(0, i), value: line.slice(i + 1).trim() };
  });
  const type = headers.find((x) => x.name.toLowerCase() === 'content-type')?.value ?? 'text/plain';
  const boundary = /boundary="([^"]+)"/.exec(type)?.[1];
  if (!boundary) {
    return { mimeType: 'text/plain', headers, body: { data: Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('base64url') } };
  }
  const parts = body
    .split(`--${boundary}`)
    .slice(1, -1)
    .map((chunk) => mimeToGmailPayload(chunk.replace(/^\r\n/, '').replace(/\r\n$/, '')));
  return {
    mimeType: 'multipart/mixed',
    headers,
    parts: parts.map((p) => {
      const disp = p.headers?.find((x) => x.name.toLowerCase() === 'content-disposition')?.value ?? '';
      const fileName = /filename="([^"]+)"/.exec(disp)?.[1];
      const ctype = (p.headers?.find((x) => x.name.toLowerCase() === 'content-type')?.value ?? '').split(';')[0]!.trim();
      return { ...p, mimeType: ctype || p.mimeType, filename: fileName ?? '', body: { ...p.body, size: p.body?.data ? fromBase64Url(p.body.data).length : 0 } };
    }),
  };
}
