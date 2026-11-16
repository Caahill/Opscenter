import { maskBody } from '@opshub/policy';
import { MENTION_TOKEN } from '@opshub/shared';

/**
 * Pasted client addresses, numbers and logins never spread through chat (PRD data protection).
 * Text around mention tokens is masked; the tokens keep their ids, and their labels are only the
 * writer's (each reader gets their own), so a label that needed masking is dropped.
 */
export function scrub(raw: string): string {
  let out = '';
  let at = 0;
  for (const m of raw.matchAll(new RegExp(MENTION_TOKEN.source, 'g'))) {
    const [token, sigil, label, type, id] = m as unknown as [string, string, string, string, string];
    out += maskBody(raw.slice(at, m.index));
    out += `${sigil}[${maskBody(label) === label ? label : 'mention'}](${type}:${id})`;
    at = m.index + token.length;
  }
  return out + maskBody(raw.slice(at));
}
