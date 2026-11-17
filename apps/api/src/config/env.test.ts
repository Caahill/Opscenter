// APP_ENV rules: staging (the demo site) may use local keys, fakes, dev login and file mail behind
// STAGING_PASSWORD; production keeps every check, and a deployed build must say which it is.
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { isDevAuth, isStaging, loadEnv } from './env';

const k = () => randomBytes(32).toString('base64');

/** A deployed environment that uses everything staging is allowed and production is not. */
const demoSite = (over: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://example.com/opshub',
  KMS_MODE: 'local',
  LOCAL_PII_KEY: k(),
  LOCAL_VAULT_KEY: k(),
  HASH_PEPPER: k(),
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: 'https://storage.example.com',
  PUSH_VAPID_PUBLIC_KEY: 'pub',
  PUSH_VAPID_PRIVATE_KEY: 'priv',
  AUTH_MODE: 'dev',
  GMAIL_MODE: 'fake',
  WHATSAPP_MODE: 'fake',
  AI_MODE: 'fake',
  MAIL_MODE: 'file',
  ...over,
});

const problems = (source: Record<string, string | undefined>) => {
  try {
    loadEnv(source as NodeJS.ProcessEnv);
    return '';
  } catch (err) {
    return (err as Error).message;
  }
};

describe('APP_ENV', () => {
  it('is required when NODE_ENV=production', () => {
    expect(problems(demoSite({ APP_ENV: undefined }))).toContain('APP_ENV: required when NODE_ENV=production');
  });

  it('treats a blank value as unset', () => {
    expect(problems(demoSite({ APP_ENV: '' }))).toContain('APP_ENV: required');
  });

  it('without it, every production check still applies', () => {
    const msg = problems(demoSite({ APP_ENV: undefined }));
    for (const key of ['MAIL_MODE', 'GMAIL_MODE', 'WHATSAPP_MODE', 'AI_MODE', 'AUTH_MODE', 'KMS_MODE']) expect(msg).toContain(`${key}:`);
  });
});

describe('APP_ENV=staging', () => {
  const password = 'a-long-staging-password';

  it('allows local keys, fakes, dev login and file mail behind the password', () => {
    const env = loadEnv(demoSite({ APP_ENV: 'staging', STAGING_PASSWORD: password }) as NodeJS.ProcessEnv);
    expect(isStaging(env)).toBe(true);
    expect(isDevAuth(env)).toBe(true);
  });

  it('needs STAGING_PASSWORD of at least 16 characters', () => {
    expect(problems(demoSite({ APP_ENV: 'staging' }))).toContain('STAGING_PASSWORD: required on staging');
    expect(problems(demoSite({ APP_ENV: 'staging', STAGING_PASSWORD: 'short' }))).toContain('STAGING_PASSWORD');
  });

  it('still refuses local file storage and missing push keys', () => {
    const msg = problems(demoSite({ APP_ENV: 'staging', STAGING_PASSWORD: password, STORAGE_DRIVER: 'fs', PUSH_VAPID_PUBLIC_KEY: undefined }));
    expect(msg).toContain('STORAGE_DRIVER: local file storage is not allowed');
    expect(msg).toContain('PUSH_VAPID_PUBLIC_KEY');
  });
});

describe('APP_ENV=production keeps every check', () => {
  const msg = problems(demoSite({ APP_ENV: 'production', STAGING_PASSWORD: 'a-long-staging-password' }));
  it.each([
    ['MAIL_MODE', 'email must go out over SMTP in production'],
    ['GMAIL_MODE', 'fakes are not allowed in production'],
    ['WHATSAPP_MODE', 'fakes are not allowed in production'],
    ['AI_MODE', 'fakes are not allowed in production'],
    ['AUTH_MODE', 'dev login is not allowed in production'],
    ['KMS_MODE', 'local keys are not allowed in production'],
  ])('%s', (key, message) => {
    expect(msg).toContain(`${key}: ${message}`);
  });

  it('has no dev login even if AUTH_MODE slipped through', () => {
    const env = loadEnv({ ...demoSite({ APP_ENV: 'production' }), NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(isDevAuth({ ...env, NODE_ENV: 'production' })).toBe(false);
  });

  it('errors name variables, never values', () => {
    const secret = 'a-long-staging-password';
    expect(problems(demoSite({ APP_ENV: 'staging', STAGING_PASSWORD: secret, STORAGE_DRIVER: 'fs' }))).not.toContain(secret);
  });
});

describe('PORT', () => {
  it('comes from the platform when set', () => {
    expect(loadEnv(demoSite({ APP_ENV: 'staging', STAGING_PASSWORD: 'a-long-staging-password', PORT: '8080' }) as NodeJS.ProcessEnv).PORT).toBe(8080);
  });
});
