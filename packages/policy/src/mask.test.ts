import { describe, expect, it } from 'vitest';
import { findSensitive, label, maskBody, normalizeEmail, normalizePhone } from './mask';

const PHONE = '[phone hidden]';
const EMAIL = '[email hidden]';
const CRED = '[credential hidden]';

describe('label', () => {
  it('joins company and contact label', () => {
    expect(label('Vastrado', 'Marketing contact')).toBe('Vastrado · Marketing contact');
  });
});

describe('maskBody: email', () => {
  it.each([
    'priya@demo.example.com',
    'first.last+tag@example.co.uk',
    "o'brien@example.com.au",
    'ACCOUNTS@EXAMPLE.AE',
  ])('masks %s', (addr) => {
    expect(maskBody(`Write to ${addr} today`)).toBe(`Write to ${EMAIL} today`);
  });
});

describe('maskBody: phones by market', () => {
  const cases: Record<string, string[]> = {
    IN: ['+91 98200 12345', '98200 12345', '9820012345', '098200 12345', '022 2345 6789', '0091 98200 12345', '91 98200 12345'],
    AE: ['+971 50 123 4567', '050 123 4567', '04 123 4567', '971 50 123 4567'],
    SA: ['+966 50 123 4567', '050 123 4567', '011 234 5678', '966 50 123 4567'],
    AU: ['+61 412 345 678', '0412 345 678', '(02) 9876 5432', '61 412 345 678'],
    UK: ['+44 7700 900123', '07700 900123', '020 7946 0958', '44 7700 900123'],
    CA: ['+1 (416) 555-0199', '(416) 555-0199', '416-555-0199', '416.555.0199'],
    US: ['+1 212 555 0147', '(212) 555-0147', '1-212-555-0147', '2125550147'],
    NZ: ['+64 21 123 4567', '021 123 4567', '09 123 4567', '64 21 123 4567'],
  };
  for (const [market, numbers] of Object.entries(cases)) {
    it.each(numbers)(`${market}: masks %s`, (n) => {
      const out = maskBody(`Call me on ${n} after lunch`);
      expect(out).toBe(`Call me on ${PHONE} after lunch`);
      expect(out.replace(/\D/g, '')).toBe('');
    });
  }
});

describe('maskBody: leaves ordinary numbers alone', () => {
  it.each([
    'Meeting on 2026-10-25 10:30 IST',
    'Due 25-10-2026, invoice INV-2026-0042',
    'Package: 30 keywords, 100 backlinks / month',
    'Retainer INR 1,50,000 per quarter',
    'Reports for 2023 2024 2025',
    '12 posts: 1 reel, 4 static, 2 email creatives',
    'Progress 75% at 14:05',
    'Order total AED 4,500.00',
  ])('keeps "%s"', (text) => {
    expect(maskBody(text)).toBe(text);
  });
});

describe('maskBody: credentials', () => {
  it('redacts user:pass in URLs before the email pattern can split them', () => {
    expect(maskBody('ftp://demoadmin:Hunter2!@files.example.com/x')).toBe(
      `ftp://${CRED}@files.example.com/x`,
    );
  });

  it.each([
    'password: Hunter2!',
    'Pwd = abc123',
    'pw: abc123',
    'User name - demoadmin',
    'username: demoadmin',
    'Hosting login: demoadmin / Hunter2!',
    'The password is Hunter2!',
  ])('masks the line "%s"', (line) => {
    expect(maskBody(`Hi team\n${line}\nThanks`)).toBe(`Hi team\n${CRED}\nThanks`);
  });

  it('masks values on the lines after a bare "Login details:"', () => {
    expect(maskBody('Login details:\ndemoadmin\nHunter2!\nThanks')).toBe(
      `${CRED}\n${CRED}\n${CRED}\nThanks`,
    );
  });

  it('masks everything in a realistic client message', () => {
    const msg =
      'Hi, please update the banner. Call +91 98200 12345 or mail priya@demo.example.com.\n' +
      'Hosting login - username: demoadmin password: Hunter2!';
    const out = maskBody(msg);
    expect(out).not.toContain('98200');
    expect(out).not.toContain('priya@');
    expect(out).not.toContain('Hunter2');
    expect(out).not.toContain('demoadmin');
    expect(out).toContain('please update the banner');
  });
});

describe('normalize', () => {
  it('lowercases email', () => {
    expect(normalizeEmail('  Priya@Demo.Example.COM ')).toBe('priya@demo.example.com');
  });
  it.each([
    ['+91 98200 12345', undefined, '+919820012345'],
    ['0091 98200 12345', undefined, '+919820012345'],
    ['098200 12345', '91', '+919820012345'],
    ['98200 12345', '91', '+919820012345'],
    ['0412 345 678', '61', '+61412345678'],
  ])('%s (%s) -> %s', (raw, cc, expected) => {
    expect(normalizePhone(raw, cc)).toBe(expected);
  });
});

describe('findSensitive (ClickUp PII sweep)', () => {
  it('returns the values maskBody would hide', () => {
    const text =
      'Client: priya@demo.example.com, +91 98200 12345\n' +
      'Hosting login - username: demoadmin password: Hunter2!\n' +
      'FTP ftp://demo:Secr3t@files.example.com\n' +
      'Meeting 2026-10-25 10:30, 30 keywords';
    const found = findSensitive(text);
    expect(found).toEqual(
      expect.arrayContaining([
        { kind: 'email', value: 'priya@demo.example.com' },
        { kind: 'phone', value: '+91 98200 12345' },
        { kind: 'credential', value: 'Hosting login - username: demoadmin password: Hunter2!' },
        { kind: 'credential', value: 'ftp://demo:Secr3t@' },
      ]),
    );
    expect(found.some((f) => f.value.includes('2026'))).toBe(false);
  });
});
