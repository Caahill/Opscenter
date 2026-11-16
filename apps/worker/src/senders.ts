// Mail and push senders for the notification jobs, from the environment.
import { FakePushSender, FileMailer, SmtpMailer, WebPushSender, type Mailer, type PushSender } from '@opshub/integrations';
import type { SendMail, SendPush } from '@opshub/db';
import { env } from './env';

export function mailerFromEnv(): Mailer {
  return env.MAIL_MODE === 'smtp' ? new SmtpMailer(env.SMTP_URL, env.MAIL_FROM) : new FileMailer(env.LOCAL_MAIL_DIR, env.MAIL_FROM);
}

export function pushFromEnv(): PushSender {
  return env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY
    ? new WebPushSender({ publicKey: env.PUSH_VAPID_PUBLIC_KEY, privateKey: env.PUSH_VAPID_PRIVATE_KEY, subject: env.PUSH_SUBJECT })
    : new FakePushSender();
}

export const sendMailWith = (m: Mailer): SendMail => (mail) => m.send(mail);
export const sendPushWith = (p: PushSender): SendPush => (target, payload) => p.send(target, payload);
