// Masking functions (TechSpec 5.4). Over-masking is acceptable; leaking is not.
import { MASK_TOKENS } from '@opshub/shared';

/** "<Company> · <Contact label>", e.g. "Vastrado · Marketing contact". */
export function label(companyName: string, contactLabel: string): string {
  return `${companyName} · ${contactLabel}`;
}

const EMAIL_RE = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

// scheme://user:pass@host -> scheme://[credential hidden]@host
const URL_CREDENTIALS_RE = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi;

// A credential keyword, up to two more words, then a separator or "is".
const CREDENTIAL_LINE_RE =
  /\b(?:password|passwd|passcode|pass|pwd|pw|user\s?name|username|user\s?id|login|log\s?in)\b(?:\s+[\w/]+){0,2}\s*(?:[:=]|-\s|\bis\b)/i;
const KEYWORD_ONLY_RE = /(?:[:=]|-|\bis)\s*$/i;

// Dates and times look like digit runs; shield them from the phone scan.
const DATE_TIME_RE =
  /\b\d{4}-\d{2}-\d{2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?\b|\b\d{1,2}[-.]\d{1,2}[-.]\d{4}\b|\b\d{1,2}:\d{2}(?::\d{2})?\b/g;

// Digit groups joined by at most two of: space, dot, hyphen, with optional parentheses.
const PHONE_CANDIDATE_RE = /(?<![\w@.])(?:\+|\b00)?\(?\d+\)?(?:[ .-]{1,2}\(?\d+\)?)*(?![\w])/g;

// National and country-code formats for IN, AE, SA, AU, UK, CA, US, NZ (digits only).
const NATIONAL_FORMATS: RegExp[] = [
  /^[6-9]\d{9}$/, // IN mobile
  /^0[6-9]\d{9}$/, // IN mobile with trunk 0
  /^0\d{10}$/, // IN landline with STD code, UK 11-digit
  /^91[6-9]\d{9}$/, // IN with country code
  /^05\d{8}$/, // AE and SA mobile
  /^0[1-9]\d{7}$/, // AE landline, NZ landline
  /^01\d{8}$/, // SA landline
  /^9715\d{8}$/, // AE mobile with country code
  /^971[2-9]\d{7}$/, // AE landline with country code
  /^966[15]\d{8}$/, // SA with country code
  /^04\d{8}$/, // AU mobile
  /^0[2378]\d{8}$/, // AU landline
  /^61[2-478]\d{8}$/, // AU with country code
  /^07\d{9}$/, // UK mobile
  /^0[123]\d{8,9}$/, // UK landline
  /^44[1237]\d{8,9}$/, // UK with country code
  /^[2-9]\d{2}[2-9]\d{6}$/, // US and CA (NANP)
  /^1[2-9]\d{2}[2-9]\d{6}$/, // NANP with country code
  /^02\d{7,9}$/, // NZ mobile
  /^64[2-9]\d{7,9}$/, // NZ with country code
];

function isPhone(candidate: string): boolean {
  const international = candidate.startsWith('+') || candidate.startsWith('00');
  let digits = candidate.replace(/\D/g, '');
  if (candidate.startsWith('00')) digits = digits.slice(2);
  if (international) return digits.length >= 8 && digits.length <= 15;
  if (digits.length < 9 || digits.length > 13) return false;
  return NATIONAL_FORMATS.some((re) => re.test(digits));
}

function maskPhones(text: string): string {
  const shielded: string[] = [];
  const guarded = text.replace(DATE_TIME_RE, (m) => {
    shielded.push(m);
    return `${String.fromCharCode(0xe100 + shielded.length - 1)}`;
  });
  const masked = guarded.replace(PHONE_CANDIDATE_RE, (m) => (isPhone(m) ? MASK_TOKENS.phone : m));
  return masked.replace(/([-])/g, (_, c: string) => shielded[c.charCodeAt(0) - 0xe100]!);
}

function maskCredentialLines(text: string): string {
  const lines = text.split('\n');
  let hideNext = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const indent = line.match(/^\s*/)?.[0] ?? '';
    if (CREDENTIAL_LINE_RE.test(line)) {
      lines[i] = indent + MASK_TOKENS.credential;
      // "Login details:" with the values on the following lines.
      if (KEYWORD_ONLY_RE.test(line.trim())) hideNext = 2;
    } else if (hideNext > 0 && line.trim() !== '') {
      lines[i] = indent + MASK_TOKENS.credential;
      hideNext--;
    }
  }
  return lines.join('\n');
}

/**
 * Redacts credential URLs, email addresses, phone numbers and credential lines.
 * Credential URLs go first so "user:pass@host" is not half-eaten by the email pattern.
 */
export function maskBody(text: string): string {
  if (!text) return text;
  let out = text.replace(URL_CREDENTIALS_RE, `$1${MASK_TOKENS.credential}@`);
  out = out.replace(EMAIL_RE, MASK_TOKENS.email);
  out = maskPhones(out);
  out = maskCredentialLines(out);
  return out;
}

export interface SensitiveFinding {
  kind: 'email' | 'phone' | 'credential';
  value: string;
}

/**
 * What maskBody would hide, as values: used by the ClickUp import to move contacts and logins
 * into encrypted storage (TechSpec 7.4 PII sweep). Same patterns as maskBody.
 */
export function findSensitive(text: string): SensitiveFinding[] {
  if (!text) return [];
  const out: SensitiveFinding[] = [];
  for (const m of text.matchAll(URL_CREDENTIALS_RE)) out.push({ kind: 'credential', value: m[0] });
  const withoutUrlCreds = text.replace(URL_CREDENTIALS_RE, '');
  for (const m of withoutUrlCreds.matchAll(EMAIL_RE)) out.push({ kind: 'email', value: m[0] });
  const guarded = withoutUrlCreds.replace(EMAIL_RE, ' ').replace(DATE_TIME_RE, ' ');
  for (const m of guarded.matchAll(PHONE_CANDIDATE_RE)) if (isPhone(m[0])) out.push({ kind: 'phone', value: m[0].trim() });
  const masked = maskCredentialLines(text);
  const before = text.split('\n');
  masked.split('\n').forEach((line, i) => {
    if (line.trim() === MASK_TOKENS.credential && before[i]?.trim() !== MASK_TOKENS.credential) {
      out.push({ kind: 'credential', value: before[i]!.trim() });
    }
  });
  return out;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Canonical phone form for hashing: "+" and digits. National numbers need the client's
 * country calling code (e.g. "91") to become E.164; without it the digits are kept as-is.
 */
export function normalizePhone(raw: string, countryCallingCode?: string): string {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+')) return `+${digits}`;
  if (trimmed.startsWith('00')) return `+${digits.slice(2)}`;
  if (countryCallingCode) {
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (!digits.startsWith(countryCallingCode) || digits.length <= 10) {
      digits = countryCallingCode + digits;
    }
    return `+${digits}`;
  }
  return digits;
}
