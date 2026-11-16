// Log redaction (TechSpec 5.6, 12). Sensitive fields are dropped by the logger, not redacted later.
import { Alternatives, PageResult, Presentable } from './present';
import { maskBody } from './mask';

const SENSITIVE_KEYS = new Set(
  [
    'password',
    'passwd',
    'secret',
    'secretEnc',
    'token',
    'accessToken',
    'refreshToken',
    'idToken',
    'authorization',
    'cookie',
    'set-cookie',
    'code',
    'email',
    'emails',
    'emailEnc',
    'phone',
    'phoneEnc',
    'name',
    'nameEnc',
    'body',
    'bodyEnc',
    'bodyMasked',
    'from',
    'fromEnc',
    'to',
    'toEnc',
    'amount',
    'value',
    'contractValue',
    'taxId',
    'taxIdEnc',
    'reason',
    'reasonEnc',
    'oauthEnc',
    'emailDomains',
  ].map((k) => k.toLowerCase()),
);

/** Marks a DTO or payload property so the logger always drops it. */
export function Sensitive(): PropertyDecorator {
  return (_target, key) => {
    SENSITIVE_KEYS.add(String(key).toLowerCase());
  };
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/** Copy of `value` that is safe to log: sensitive keys and DTOs removed, strings masked. */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[depth]';
  if (value === null || value === undefined) return value;
  if (value instanceof Presentable || value instanceof Alternatives || value instanceof PageResult) {
    return '[dto]';
  }
  if (typeof value === 'string') return maskBody(value);
  if (typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { type: value.name, message: maskBody(value.message), stack: value.stack ? maskBody(value.stack) : undefined };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeForLog(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (isSensitiveKey(k)) continue;
    out[k] = sanitizeForLog(v, depth + 1);
  }
  return out;
}
