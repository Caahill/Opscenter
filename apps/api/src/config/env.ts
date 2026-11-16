import { z } from 'zod';

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64 (pnpm keys:generate)');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    API_URL: z.string().url().default('http://localhost:4000'),
    DATABASE_URL: z.string().min(1),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    KMS_MODE: z.enum(['local', 'aws']).default('local'),
    LOCAL_PII_KEY: base64Key.optional(),
    LOCAL_VAULT_KEY: base64Key.optional(),
    HASH_PEPPER: z.string().min(16, 'must be at least 16 characters (pnpm keys:generate)'),
    KMS_PII_KEY_ID: z.string().optional(),
    KMS_VAULT_KEY_ID: z.string().optional(),
    AWS_REGION: z.string().default('ap-south-1'),

    STORAGE_DRIVER: z.enum(['s3', 'fs']).default('fs'),
    LOCAL_STORAGE_DIR: z.string().default('.local-storage'),
    S3_ENDPOINT: z.string().optional(),
    S3_BUCKET: z.string().default('opshub-local'),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(25),

    REDIS_URL: z.string().optional(),

    // Integrations (TechSpec 7): fakes locally and in tests; live only with real credentials.
    GMAIL_MODE: z.enum(['live', 'fake']).default('fake'),
    GMAIL_PUBSUB_TOPIC: z.string().optional(),
    /** Audience of the Pub/Sub push token; defaults to the webhook URL. */
    GMAIL_PUBSUB_AUDIENCE: z.string().optional(),
    GMAIL_PUBSUB_SERVICE_ACCOUNT: z.string().optional(),
    GMAIL_BACKFILL_YEARS: z.coerce.number().int().min(0).max(10).default(3),
    WHATSAPP_MODE: z.enum(['live', 'fake']).default('fake'),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    WHATSAPP_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_GRAPH_VERSION: z.string().default('v23.0'),
    /** Approved templates for messages outside the 24-hour window: "name:language,name:language". */
    WHATSAPP_TEMPLATES: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => {
            const [name, language] = t.split(':');
            return { name: name!.trim(), language: (language ?? 'en').trim() };
          }),
      ),
    AI_MODE: z.enum(['live', 'fake']).default('fake'),
    ANTHROPIC_API_KEY: z.string().optional(),
    AI_TRIAGE_MODEL: z.string().default('claude-haiku-5-5'),
    AI_FALLBACK_MODEL: z.string().default('claude-sonnet-5-5'),

    // Notifications (PRD 5.3): the digest is sent by the worker; the API pushes straight away.
    MAIL_MODE: z.enum(['smtp', 'file']).default('file'),
    SMTP_URL: z.string().default('smtp://localhost:1025'),
    MAIL_FROM: z.string().default('Ops Hub <opshub@syspree.example>'),
    LOCAL_MAIL_DIR: z.string().default('../../.local-mail'),
    PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
    PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
    PUSH_SUBJECT: z.string().default('mailto:ops@syspree.example'),

    AUTH_MODE: z.enum(['dev', 'google']).default('dev'),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_ALLOWED_DOMAINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean),
      ),
  })
  .superRefine((env, ctx) => {
    const need = (key: keyof typeof env, why: string) => {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `required when ${why}` });
    };
    if (env.KMS_MODE === 'local') {
      need('LOCAL_PII_KEY', 'KMS_MODE=local');
      need('LOCAL_VAULT_KEY', 'KMS_MODE=local');
      if (env.LOCAL_PII_KEY && env.LOCAL_PII_KEY === env.LOCAL_VAULT_KEY) {
        ctx.addIssue({ code: 'custom', path: ['LOCAL_VAULT_KEY'], message: 'must differ from LOCAL_PII_KEY' });
      }
    } else {
      need('KMS_PII_KEY_ID', 'KMS_MODE=aws');
      need('KMS_VAULT_KEY_ID', 'KMS_MODE=aws');
    }
    if (env.AUTH_MODE === 'google') {
      need('GOOGLE_CLIENT_ID', 'AUTH_MODE=google');
      need('GOOGLE_CLIENT_SECRET', 'AUTH_MODE=google');
      if (env.GOOGLE_ALLOWED_DOMAINS.length === 0) {
        ctx.addIssue({ code: 'custom', path: ['GOOGLE_ALLOWED_DOMAINS'], message: 'required when AUTH_MODE=google' });
      }
    }
    if (env.GMAIL_MODE === 'live') {
      need('GOOGLE_CLIENT_ID', 'GMAIL_MODE=live');
      need('GOOGLE_CLIENT_SECRET', 'GMAIL_MODE=live');
      need('GMAIL_PUBSUB_TOPIC', 'GMAIL_MODE=live');
      need('GMAIL_PUBSUB_SERVICE_ACCOUNT', 'GMAIL_MODE=live');
    }
    if (env.WHATSAPP_MODE === 'live') {
      need('WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_MODE=live');
      need('WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_MODE=live');
      need('WHATSAPP_APP_SECRET', 'WHATSAPP_MODE=live');
      need('WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_MODE=live');
    }
    if (env.AI_MODE === 'live') need('ANTHROPIC_API_KEY', 'AI_MODE=live');
    if (env.NODE_ENV === 'production') {
      if (env.MAIL_MODE === 'file') ctx.addIssue({ code: 'custom', path: ['MAIL_MODE'], message: 'email must go out over SMTP in production' });
      if (!env.PUSH_VAPID_PUBLIC_KEY || !env.PUSH_VAPID_PRIVATE_KEY) ctx.addIssue({ code: 'custom', path: ['PUSH_VAPID_PUBLIC_KEY'], message: 'push needs VAPID keys in production (pnpm keys:generate)' });
      for (const key of ['GMAIL_MODE', 'WHATSAPP_MODE', 'AI_MODE'] as const) {
        if (env[key] === 'fake') ctx.addIssue({ code: 'custom', path: [key], message: 'fakes are not allowed in production' });
      }
      if (env.AUTH_MODE === 'dev') {
        ctx.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'dev login is not allowed in production' });
      }
      if (env.KMS_MODE === 'local') {
        ctx.addIssue({ code: 'custom', path: ['KMS_MODE'], message: 'local keys are not allowed in production' });
      }
      if (env.STORAGE_DRIVER === 'fs') {
        ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'local file storage is not allowed in production' });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('ENV');

/** Parses the environment. Errors name the variables, never their values. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

export function isDevAuth(env: Env): boolean {
  return env.AUTH_MODE === 'dev' && env.NODE_ENV !== 'production';
}
