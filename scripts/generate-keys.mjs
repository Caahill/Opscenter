// Prints random 32-byte base64 keys for local development, and a web push (VAPID) key pair.
// Paste them into .env. With --write, fills any empty key in .env (creating it from .env.example).
// With --railway, also prints a STAGING_PASSWORD, for the staging (demo) site. Nothing is saved.
import { createECDH, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const NAMES = ['LOCAL_PII_KEY', 'LOCAL_VAULT_KEY', 'HASH_PEPPER'];
const key = () => randomBytes(32).toString('base64');

/** VAPID keys for web push: a P-256 pair, base64url (what browsers and web-push expect). */
function vapid() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { PUSH_VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString('base64url'), PUSH_VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString('base64url') };
}

if (!process.argv.includes('--write')) {
  for (const name of NAMES) console.log(`${name}=${key()}`);
  for (const [name, value] of Object.entries(vapid())) console.log(`${name}=${value}`);
  // 24 random bytes as base64url: 32 characters, easy to paste, impossible to guess.
  if (process.argv.includes('--railway')) console.log(`STAGING_PASSWORD=${randomBytes(24).toString('base64url')}`);
  process.exit(0);
}

if (!existsSync('.env')) copyFileSync('.env.example', '.env');
let env = readFileSync('.env', 'utf8');
for (const name of NAMES) {
  const re = new RegExp(`^${name}=\\s*$`, 'm');
  if (re.test(env)) {
    env = env.replace(re, `${name}=${key()}`);
    console.log(`${name} written`);
  } else {
    console.log(`${name} already set, left unchanged`);
  }
}
// The push pair is written together, and only when both are empty.
const pair = vapid();
const empty = (name) => new RegExp(`^${name}=\\s*$`, 'm').test(env);
const missing = (name) => !new RegExp(`^${name}=`, 'm').test(env);
if (Object.keys(pair).every((n) => empty(n) || missing(n))) {
  for (const [name, value] of Object.entries(pair)) {
    env = empty(name) ? env.replace(new RegExp(`^${name}=\\s*$`, 'm'), `${name}=${value}`) : `${env.trimEnd()}\n${name}=${value}\n`;
  }
  console.log('PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY written');
} else {
  console.log('Push keys already set, left unchanged');
}
writeFileSync('.env', env);
