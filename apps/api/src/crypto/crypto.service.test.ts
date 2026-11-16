import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env';
import { CryptoService } from './crypto.service';
import { AwsKmsKeyProvider, LocalKeyProvider } from './key-providers';

const key = () => randomBytes(32).toString('base64');
const env = { LOCAL_PII_KEY: key(), LOCAL_VAULT_KEY: key(), HASH_PEPPER: 'pepper-for-tests-only' } as Env;
const svc = new CryptoService(new LocalKeyProvider(env), env);

describe('CryptoService (local keys)', () => {
  it('round-trips and uses a fresh data key each time', async () => {
    const a = await svc.encrypt('priya@demo.example.com', 'pii');
    const b = await svc.encrypt('priya@demo.example.com', 'pii');
    expect(a.keyId).toBe('local:pii');
    expect(Buffer.from(a.ciphertext).equals(Buffer.from(b.ciphertext))).toBe(false);
    expect(Buffer.from(a.ciphertext).toString('utf8')).not.toContain('priya');
    expect(await svc.decrypt(a)).toBe('priya@demo.example.com');
  });

  it('keeps PII and vault keys apart', async () => {
    const sealed = await svc.encrypt('Hunter2!', 'vault');
    expect(sealed.keyId).toBe('local:vault');
    await expect(svc.decrypt({ ...sealed, keyId: 'local:pii' })).rejects.toThrow();
  });

  it('fails on tampering and on wrong associated data', async () => {
    const sealed = await svc.encrypt('secret', 'pii', 'contact:c1');
    const bad = Buffer.from(sealed.ciphertext);
    bad[bad.length - 1] = bad[bad.length - 1]! ^ 0xff;
    await expect(svc.decrypt({ ...sealed, ciphertext: bad })).rejects.toThrow();
    await expect(svc.decrypt(sealed, 'contact:c2')).rejects.toThrow();
    expect(await svc.decrypt(sealed, 'contact:c1')).toBe('secret');
  });

  it('hashes normalized values with the pepper', () => {
    expect(svc.hash('email', ' Priya@Demo.Example.com')).toBe(svc.hash('email', 'priya@demo.example.com'));
    expect(svc.hash('phone', '+91 98200 12345')).toBe(svc.hash('phone', '098200 12345', '91'));
    const other = new CryptoService(new LocalKeyProvider(env), { ...env, HASH_PEPPER: 'another-pepper-value' });
    expect(other.hash('email', 'a@example.com')).not.toBe(svc.hash('email', 'a@example.com'));
  });
});

describe('AwsKmsKeyProvider', () => {
  it('generates and unwraps data keys through KMS', async () => {
    const dataKey = randomBytes(32);
    const sent: string[] = [];
    const kms = {
      send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push(`${cmd.constructor.name}:${String(cmd.input.KeyId)}`);
        return cmd.constructor.name === 'GenerateDataKeyCommand'
          ? { Plaintext: Uint8Array.from(dataKey), CiphertextBlob: Uint8Array.from([1, 2, 3]) }
          : { Plaintext: Uint8Array.from(dataKey) };
      },
    };
    const provider = new AwsKmsKeyProvider(
      { KMS_PII_KEY_ID: 'alias/opshub-pii', KMS_VAULT_KEY_ID: 'alias/opshub-vault' },
      kms as never,
    );
    const kmsSvc = new CryptoService(provider, env);
    const sealed = await kmsSvc.encrypt('hello', 'vault');
    expect(sealed.keyId).toBe('alias/opshub-vault');
    expect(await kmsSvc.decrypt(sealed)).toBe('hello');
    expect(sent).toEqual(['GenerateDataKeyCommand:alias/opshub-vault', 'DecryptCommand:alias/opshub-vault']);
  });
});
