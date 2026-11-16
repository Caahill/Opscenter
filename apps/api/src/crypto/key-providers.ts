import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms';
import type { Env } from '../config/env';

/** PII (contacts, messages, tax ids, leave reasons) and the credential vault use separate keys. */
export type KeyPurpose = 'pii' | 'vault';

export interface DataKey {
  plaintext: Buffer;
  wrapped: Buffer;
  keyId: string;
}

export interface KeyProvider {
  generateDataKey(purpose: KeyPurpose): Promise<DataKey>;
  unwrap(wrapped: Buffer, keyId: string): Promise<Buffer>;
  keyIdFor(purpose: KeyPurpose): string;
}

/** Local development only: key-encryption keys come from .env (KMS_MODE=local). */
export class LocalKeyProvider implements KeyProvider {
  private readonly keks: Record<string, Buffer>;

  constructor(env: Pick<Env, 'LOCAL_PII_KEY' | 'LOCAL_VAULT_KEY'>) {
    this.keks = {
      'local:pii': Buffer.from(env.LOCAL_PII_KEY ?? '', 'base64'),
      'local:vault': Buffer.from(env.LOCAL_VAULT_KEY ?? '', 'base64'),
    };
  }

  async generateDataKey(purpose: KeyPurpose): Promise<DataKey> {
    const keyId = `local:${purpose}`;
    const plaintext = randomBytes(32);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.kek(keyId), iv);
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { plaintext, wrapped: Buffer.concat([iv, cipher.getAuthTag(), ct]), keyId };
  }

  async unwrap(wrapped: Buffer, keyId: string): Promise<Buffer> {
    const decipher = createDecipheriv('aes-256-gcm', this.kek(keyId), wrapped.subarray(0, 12));
    decipher.setAuthTag(wrapped.subarray(12, 28));
    return Buffer.concat([decipher.update(wrapped.subarray(28)), decipher.final()]);
  }

  keyIdFor(purpose: KeyPurpose): string {
    return `local:${purpose}`;
  }

  private kek(keyId: string): Buffer {
    const key = this.keks[keyId];
    if (!key || key.length !== 32) throw new Error(`Unknown local key ${keyId}`);
    return key;
  }
}

/** Staging and production: data keys generated and unwrapped by AWS KMS (Hosting guide 3, 4). */
export class AwsKmsKeyProvider implements KeyProvider {
  constructor(
    private readonly env: Pick<Env, 'KMS_PII_KEY_ID' | 'KMS_VAULT_KEY_ID'>,
    private readonly kms: Pick<KMSClient, 'send'>,
  ) {}

  keyIdFor(purpose: KeyPurpose): string {
    const keyId = purpose === 'pii' ? this.env.KMS_PII_KEY_ID : this.env.KMS_VAULT_KEY_ID;
    if (!keyId) throw new Error(`KMS key id for ${purpose} is not configured`);
    return keyId;
  }

  async generateDataKey(purpose: KeyPurpose): Promise<DataKey> {
    const keyId = this.keyIdFor(purpose);
    const out = await this.kms.send(new GenerateDataKeyCommand({ KeyId: keyId, KeySpec: 'AES_256' }));
    if (!out.Plaintext || !out.CiphertextBlob) throw new Error('KMS returned no data key');
    return { plaintext: Buffer.from(out.Plaintext), wrapped: Buffer.from(out.CiphertextBlob), keyId };
  }

  async unwrap(wrapped: Buffer, keyId: string): Promise<Buffer> {
    const out = await this.kms.send(new DecryptCommand({ CiphertextBlob: wrapped, KeyId: keyId }));
    if (!out.Plaintext) throw new Error('KMS returned no plaintext');
    return Buffer.from(out.Plaintext);
  }
}

export function createKeyProvider(env: Env): KeyProvider {
  if (env.KMS_MODE === 'aws') {
    return new AwsKmsKeyProvider(env, new KMSClient({ region: env.AWS_REGION }));
  }
  return new LocalKeyProvider(env);
}
