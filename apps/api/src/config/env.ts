import { z } from 'zod';

const base64Key = z
  .string()
  .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be 32 bytes, base64 (pnpm keys:generate)');

/** An empty value in .env (`APP_ENV=`) means unset. */
const blankAsUnset = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /**
     * Which deployed environment this is; required when NODE_ENV=production. `staging` is the demo
     * site: it may use local keys, fakes, dev login and file mail, and sits behind STAGING_PASSWORD.
     * `production` keeps every production check.
     */
    APP_ENV: blankAsUnset(z.enum(['staging', 'production'])),
    /** Site-wide password for staging (the web shows a password page; the API checks the gate). */
    STAGING_PASSWORD: z.string().optional(),
    /** Port to listen on; the platform sets it. Falls back to the API_URL port, then 4000. */
    PORT: blankAsUnset(z.coerce.number().int().min(1).max(65535)),
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
    /** Bucket region; defaults to AWS_REGION. Railway buckets use `auto`. */
    S3_REGION: z.string().optional(),
    /** Path-style URLs (MinIO). Defaults to on when S3_ENDPOINT is set; Railway buckets need false. */
    S3_FORCE_PATH_STYLE: blankAsUnset(z.enum(['true', 'false'])),
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
    if (env.APP_ENV === 'staging') {
      if (!env.STAGING_PASSWORD || env.STAGING_PASSWORD.length < 16) {
        ctx.addIssue({ code: 'custom', path: ['STAGING_PASSWORD'], message: 'required on staging, at least 16 characters (pnpm keys:generate --railway)' });
      }
    }
    if (env.NODE_ENV === 'production' && !env.APP_ENV) {
      ctx.addIssue({ code: 'custom', path: ['APP_ENV'], message: 'required when NODE_ENV=production (staging or production)' });
    }
    // Staging (the demo site, no real client data) may use local keys, fakes, dev login and file
    // mail. Everything else, and every production check, applies to both.
    if (env.NODE_ENV === 'production' && env.APP_ENV !== 'staging') {
      if (env.MAIL_MODE === 'file') ctx.addIssue({ code: 'custom', path: ['MAIL_MODE'], message: 'email must go out over SMTP in production' });
      for (const key of ['GMAIL_MODE', 'WHATSAPP_MODE', 'AI_MODE'] as const) {
        if (env[key] === 'fake') ctx.addIssue({ code: 'custom', path: [key], message: 'fakes are not allowed in production' });
      }
      if (env.AUTH_MODE === 'dev') {
        ctx.addIssue({ code: 'custom', path: ['AUTH_MODE'], message: 'dev login is not allowed in production' });
      }
      if (env.KMS_MODE === 'local') {
        ctx.addIssue({ code: 'custom', path: ['KMS_MODE'], message: 'local keys are not allowed in production' });
      }
    }
    if (env.NODE_ENV === 'production') {
      if (!env.PUSH_VAPID_PUBLIC_KEY || !env.PUSH_VAPID_PRIVATE_KEY) ctx.addIssue({ code: 'custom', path: ['PUSH_VAPID_PUBLIC_KEY'], message: 'push needs VAPID keys in production (pnpm keys:generate)' });
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

/** The demo site: behind STAGING_PASSWORD, never holding real client data. */
export function isStaging(env: Env): boolean {
  return env.APP_ENV === 'staging';
}

/** Dev login: local, test and staging only. The schema refuses it in production. */
export function isDevAuth(env: Env): boolean {
  return env.AUTH_MODE === 'dev' && (env.NODE_ENV !== 'production' || isStaging(env));
}
