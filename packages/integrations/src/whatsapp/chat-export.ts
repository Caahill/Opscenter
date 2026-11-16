// Route B (TechSpec 7.2): parse a WhatsApp "Export chat" file. Handles Android ("12/03/2024, 14:05 -
// Name: text") and iOS ("[12/03/24, 2:05:33 PM] Name: text") layouts, 12h and 24h times, multi-line
// messages and attachment markers, and reads .zip exports with their media.
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

export interface ChatMessage {
  sentAt: Date;
  sender: string;
  text: string;
  /** File names referenced by the message; matched against the zip's media. */
  attachments: string[];
  /** The export left media out ("<Media omitted>"). */
  mediaOmitted: boolean;
  /** sha256 of (sender, timestamp, text): de-duplicates re-uploads of overlapping exports. */
  hash: string;
}

export interface ParseOptions {
  /** Where the exporting phone was; export times are wall-clock times there. */
  timeZone?: string;
  /** Forced when the dates are ambiguous; otherwise detected, falling back to day first. */
  dateOrder?: 'DMY' | 'MDY';
}

const HEADER =
  /^[\u200e\u200f]?\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:[\s\u202f\u00a0]*([AaPp])\.?\s?[Mm]\.?)?\]?(?:\s+-)?\s+(.*)$/;
const SENDER = /^[\u200e\u200f]?([^:\n]{1,80}?):\s([\s\S]*)$/;
const IOS_ATTACHED = /[\u200e]?<attached:\s*([^>]+)>/gi;
const ANDROID_ATTACHED = /^[\u200e]?(\S.*?\.[A-Za-z0-9]{2,5}) \(file attached\)$/m;
const OMITTED = /^[\u200e]?(?:<Media omitted>|(?:image|video|audio|sticker|document|GIF) omitted)$/im;

interface Raw {
  a: number;
  b: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  rest: string;
}

/** Converts a wall-clock time in an IANA zone to a UTC Date. */
export function zonedTime(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
      .formatToParts(new Date(guess))
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const asZone = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return new Date(guess - (asZone - guess));
}

export function parseChatExport(text: string, opts: ParseOptions = {}): ChatMessage[] {
  const raws: Raw[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const m = HEADER.exec(line);
    if (m) {
      let hour = Number(m[4]);
      const ampm = m[7]?.toLowerCase();
      if (ampm === 'p' && hour < 12) hour += 12;
      if (ampm === 'a' && hour === 12) hour = 0;
      const y = Number(m[3]);
      raws.push({ a: Number(m[1]), b: Number(m[2]), year: y < 100 ? 2000 + y : y, hour, minute: Number(m[5]), second: Number(m[6] ?? 0), rest: m[8]! });
    } else if (raws.length) {
      raws[raws.length - 1]!.rest += `\n${line}`;
    }
  }

  const order = opts.dateOrder ?? (raws.some((r) => r.a > 12) ? 'DMY' : raws.some((r) => r.b > 12) ? 'MDY' : 'DMY');
  const tz = opts.timeZone ?? 'Asia/Kolkata';
  const out: ChatMessage[] = [];
  for (const r of raws) {
    const s = SENDER.exec(r.rest);
    if (!s) continue; // system lines: encryption notice, "X added Y", group renames
    const sender = s[1]!.trim();
    let body = s[2]!;
    const attachments: string[] = [];
    body = body.replace(IOS_ATTACHED, (_, name: string) => {
      attachments.push(name.trim());
      return '';
    });
    const android = ANDROID_ATTACHED.exec(body);
    if (android) {
      attachments.push(android[1]!.trim());
      body = body.replace(ANDROID_ATTACHED, '');
    }
    const mediaOmitted = OMITTED.test(body);
    if (mediaOmitted) body = body.replace(OMITTED, '');
    const clean = body.replace(/[\u200e\u200f]/g, '').trim();
    const [day, month] = order === 'DMY' ? [r.a, r.b] : [r.b, r.a];
    const sentAt = zonedTime(r.year, month, day, r.hour, r.minute, r.second, tz);
    out.push({
      sentAt,
      sender,
      text: clean,
      attachments,
      mediaOmitted,
      hash: createHash('sha256').update(`${sender}\u0000${sentAt.toISOString()}\u0000${clean}`).digest('hex'),
    });
  }
  return out;
}

export interface ChatExport {
  /** The chat's name, from the file name ("WhatsApp Chat with Demo Co Team"). */
  chatName: string;
  text: string;
  media: Map<string, Buffer>;
}

const chatNameFrom = (fileName: string) =>
  fileName
    .replace(/\.(txt|zip)$/i, '')
    .replace(/^WhatsApp Chat( with| -)?\s*/i, '')
    .replace(/^_chat$/i, '')
    .trim();

/** Reads a .txt export, or a .zip with the chat text and its media. */
export function readChatExport(fileName: string, data: Buffer): ChatExport {
  const isZip = data.length > 4 && data[0] === 0x50 && data[1] === 0x4b;
  if (!isZip) return { chatName: chatNameFrom(fileName) || 'WhatsApp chat', text: data.toString('utf8'), media: new Map() };
  const files = unzipSync(new Uint8Array(data));
  const names = Object.keys(files).filter((n) => !n.startsWith('__MACOSX') && !n.endsWith('/'));
  const txt = names.filter((n) => n.toLowerCase().endsWith('.txt')).sort((x, y) => files[y]!.length - files[x]!.length)[0];
  if (!txt) throw new Error('NO_CHAT_TEXT');
  const media = new Map<string, Buffer>();
  for (const n of names) if (n !== txt) media.set(n.split('/').pop()!, Buffer.from(files[n]!));
  const base = txt.split('/').pop()!;
  return { chatName: chatNameFrom(base) || chatNameFrom(fileName) || 'WhatsApp chat', text: Buffer.from(files[txt]!).toString('utf8'), media };
}
