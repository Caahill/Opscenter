// Client de-duplication (TechSpec 7.4): ClickUp tasks are named after the client URL, so the same
// client appears in several lists. Group by domain; name-only tasks by a normalised company name.

const URLISH = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/:?#].*)?$/i;

/** "https://www.shcw.com.au/about/" -> "shcw.com.au"; null when the name is not a domain. */
export function domainFromName(name: string): string | null {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const m = first.match(URLISH);
  if (!m) return null;
  const domain = m[1]!.toLowerCase().replace(/\.+$/, '');
  return /\.[a-z]{2,}$/.test(domain) ? domain : null;
}

const SUFFIXES = /\b(pvt|private|ltd|limited|llc|l\.l\.c|pty|inc|co|company|fze|fzco|plc|llp)\b\.?/g;

/** Loose company key for name-only tasks; the dry-run report lists these merges for review. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clientKey(taskName: string): { key: string; kind: 'domain' | 'name' } {
  const domain = domainFromName(taskName);
  return domain ? { key: domain, kind: 'domain' } : { key: companyKey(taskName), kind: 'name' };
}
