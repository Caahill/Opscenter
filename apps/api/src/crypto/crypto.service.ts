import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { normalizeEmail, normalizePhone } from '@opshub/policy';
import { ENV, type Env } from '../config/env';
import { createKeyProvider, type KeyProvider, type KeyPurpose } from './key-providers';

export const KEY_PROVIDER = Symbol('KEY_PROVIDER');

export interface Sealed {
  ciphertext: Uint8Array<ArrayBuffer>;
  keyId: string;
}

const VERSION = 1;

/**
 * Envelope encryption (TechSpec 5.7): a fresh AES-256-GCM data key per value, wrapped by the
 * PII or vault key. Layout: [version][u16 wrapped length][wrapped key][iv 12][tag 16][ciphertext].
 */
@Injectable()
export class CryptoService {
  constructor(
    @Inject(KEY_PROVIDER) private readonly keys: KeyProvider,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async encrypt(plaintext: string, purpose: KeyPurpose, aad?: string): Promise<Sealed> {
    const dk = await this.keys.generateDataKey(purpose);
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', dk.plaintext, iv);
      if (aad) cipher.setAAD(Buffer.from(aad));
      const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const header = Buffer.alloc(3);
      header.writeUInt8(VERSION, 0);
      header.writeUInt16BE(dk.wrapped.length, 1);
      const out = Buffer.concat([header, dk.wrapped, iv, cipher.getAuthTag(), ct]);
      return { ciphertext: new Uint8Array(out), keyId: dk.keyId };
    } finally {
      dk.plaintext.fill(0);
    }
  }

  async decrypt(sealed: { ciphertext: Uint8Array; keyId: string }, aad?: string): Promise<string> {
    const buf = Buffer.from(sealed.ciphertext);
    if (buf.readUInt8(0) !== VERSION) throw new Error('Unknown ciphertext version');
    const wrappedLen = buf.readUInt16BE(1);
    let o = 3;
    const wrapped = buf.subarray(o, (o += wrappedLen));
    const iv = buf.subarray(o, (o += 12));
    const tag = buf.subarray(o, (o += 16));
    const ct = buf.subarray(o);
    const key = await this.keys.unwrap(wrapped, sealed.keyId);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      if (aad) decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    } finally {
      key.fill(0);
    }
  }

  /**
   * For columns without their own keyId (Client.taxIdEnc, Leave.reasonEnc, ...): the configured
   * key for that purpose. KMS keeps the same key id across rotations.
   */
  keyIdFor(purpose: KeyPurpose): string {
    return this.keys.keyIdFor(purpose);
  }

  decryptWith(purpose: KeyPurpose, ciphertext: Uint8Array, aad?: string): Promise<string> {
    return this.decrypt({ ciphertext, keyId: this.keys.keyIdFor(purpose) }, aad);
  }

  /** HMAC-SHA256 lookup hash (Contact.emailHash / phoneHash): match without decrypting. */
  hash(kind: 'email' | 'phone', value: string, countryCallingCode?: string): string {
    const normalized =
      kind === 'email' ? normalizeEmail(value) : normalizePhone(value, countryCallingCode);
    return createHmac('sha256', this.env.HASH_PEPPER).update(`${kind}:${normalized}`).digest('hex');
  }
}

@Global()
@Module({
  providers: [
    { provide: KEY_PROVIDER, inject: [ENV], useFactory: (env: Env) => createKeyProvider(env) },
    CryptoService,
  ],
  exports: [CryptoService],
})
export class CryptoModule {}
