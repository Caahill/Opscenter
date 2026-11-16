// Notification delivery channels (PRD 5.3): email (the daily digest) and web push to the PWA.
// Live senders talk to SMTP and the browsers' push services; local and test ones keep the
// messages where a person (or a test) can read them. Text arriving here is already masked.
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import webpush from 'web-push';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  readonly mode: 'smtp' | 'file' | 'memory';
  send(mail: OutgoingMail): Promise<void>;
}

/** SMTP: Mailpit locally (smtp://localhost:1025), the company relay in staging and production. */
export class SmtpMailer implements Mailer {
  readonly mode = 'smtp' as const;
  private readonly transport: Transporter;
  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(mail: OutgoingMail) {
    await this.transport.sendMail({ from: this.from, ...mail });
  }
}

/** Machines without Docker: each email is written as a .eml file (open it in any mail app). */
export class FileMailer implements Mailer {
  readonly mode = 'file' as const;
  private readonly dir: string;
  private readonly transport = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  constructor(
    dir: string,
    private readonly from: string,
  ) {
    this.dir = resolve(dir);
  }

  async send(mail: OutgoingMail) {
    const info = (await this.transport.sendMail({ from: this.from, ...mail })) as { message: Buffer };
    await mkdir(this.dir, { recursive: true });
    const base = `${new Date().toISOString().replace(/[:.]/g, '-')}-${mail.to.replace(/[^\w.@-]+/g, '_')}`;
    await writeFile(join(this.dir, `${base}.eml`), info.message);
    // A plain copy for the dev outbox page.
    await writeFile(join(this.dir, `${base}.json`), JSON.stringify({ to: mail.to, subject: mail.subject, text: mail.text, sentAt: new Date().toISOString() }));
  }
}

/** Tests. */
export class MemoryMailer implements Mailer {
  readonly mode = 'memory' as const;
  readonly sent: OutgoingMail[] = [];
  async send(mail: OutgoingMail) {
    this.sent.push(mail);
  }
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string | null;
  link: string | null;
  tag: string;
}

/** `gone` means the browser dropped the subscription: delete it. */
export type PushOutcome = 'sent' | 'gone' | 'failed';

export interface PushSender {
  readonly mode: 'live' | 'fake';
  readonly publicKey: string | null;
  send(target: PushTarget, payload: PushPayload): Promise<PushOutcome>;
}

export interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

export class WebPushSender implements PushSender {
  readonly mode = 'live' as const;
  constructor(private readonly vapid: VapidConfig) {}

  get publicKey() {
    return this.vapid.publicKey;
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
        vapidDetails: this.vapid,
        TTL: 60 * 60 * 12,
        timeout: 10_000,
      });
      return 'sent';
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? 'gone' : 'failed';
    }
  }
}

/** Without VAPID keys (tests, quick local runs): records what would have been pushed. */
export class FakePushSender implements PushSender {
  readonly mode = 'fake' as const;
  readonly sent: Array<{ endpoint: string; payload: PushPayload }> = [];
  constructor(readonly publicKey: string | null = null) {}

  async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
    if (target.endpoint.includes('gone')) return 'gone';
    this.sent.push({ endpoint: target.endpoint, payload });
    return 'sent';
  }
}

export const generateVapidKeys = (): { publicKey: string; privateKey: string } => webpush.generateVAPIDKeys();
