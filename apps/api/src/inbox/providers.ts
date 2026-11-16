// Integration clients by mode (TechSpec 7, AGENTS.md: tests never call Gmail, WhatsApp or Claude).
import type { Provider } from '@nestjs/common';
import {
  FakeClassifier,
  FakeGmailClient,
  FakePubSubVerifier,
  FakeWhatsAppClient,
  LiveClassifier,
  LiveGmailClient,
  LivePubSubVerifier,
  LiveWhatsAppClient,
  type GoogleOAuthConfig,
} from '@opshub/integrations';
import { ENV, type Env } from '../config/env';

export const GMAIL = Symbol('GMAIL');
export const PUBSUB = Symbol('PUBSUB');
export const WHATSAPP = Symbol('WHATSAPP');
export const CLASSIFIER = Symbol('CLASSIFIER');

export const FAKE_WHATSAPP_SECRET = 'fake-app-secret';
export const FAKE_WHATSAPP_VERIFY_TOKEN = 'fake-verify-token';

export const gmailWebhookUrl = (env: Env) => `${env.API_URL}/api/v1/webhooks/gmail`;
export const mailboxCallbackUrl = (env: Env) => `${env.API_URL}/api/v1/mailboxes/oauth/callback`;

export const googleOAuth = (env: Env): GoogleOAuthConfig => ({
  clientId: env.GOOGLE_CLIENT_ID ?? '',
  clientSecret: env.GOOGLE_CLIENT_SECRET ?? '',
  redirectUri: mailboxCallbackUrl(env),
});

// `||`, not `??`: an empty line in .env arrives as an empty string.
export const whatsappSecret = (env: Env) => env.WHATSAPP_APP_SECRET || (env.WHATSAPP_MODE === 'fake' ? FAKE_WHATSAPP_SECRET : '');
export const whatsappVerifyToken = (env: Env) => env.WHATSAPP_VERIFY_TOKEN || (env.WHATSAPP_MODE === 'fake' ? FAKE_WHATSAPP_VERIFY_TOKEN : '');

/** Approved templates for WhatsApp outside 24 hours. Fake mode offers Meta's sample template so the path can be tried. */
export const whatsappTemplates = (env: Env) =>
  env.WHATSAPP_TEMPLATES.length || env.WHATSAPP_MODE === 'live' ? env.WHATSAPP_TEMPLATES : [{ name: 'hello_world', language: 'en_US' }];

export const INTEGRATION_PROVIDERS: Provider[] = [
  {
    provide: GMAIL,
    inject: [ENV],
    useFactory: (env: Env) => (env.GMAIL_MODE === 'live' ? new LiveGmailClient(googleOAuth(env)) : new FakeGmailClient()),
  },
  {
    provide: PUBSUB,
    inject: [ENV],
    useFactory: (env: Env) =>
      env.GMAIL_MODE === 'live' ? new LivePubSubVerifier(env.GMAIL_PUBSUB_AUDIENCE || gmailWebhookUrl(env), env.GMAIL_PUBSUB_SERVICE_ACCOUNT!) : new FakePubSubVerifier(),
  },
  {
    provide: WHATSAPP,
    inject: [ENV],
    useFactory: (env: Env) =>
      env.WHATSAPP_MODE === 'live'
        ? new LiveWhatsAppClient({ phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID!, accessToken: env.WHATSAPP_ACCESS_TOKEN!, graphVersion: env.WHATSAPP_GRAPH_VERSION })
        : new FakeWhatsAppClient(),
  },
  {
    provide: CLASSIFIER,
    inject: [ENV],
    useFactory: (env: Env) =>
      env.AI_MODE === 'live' ? new LiveClassifier(env.ANTHROPIC_API_KEY!, { triage: env.AI_TRIAGE_MODEL, fallback: env.AI_FALLBACK_MODEL }) : new FakeClassifier(),
  },
];
