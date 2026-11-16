// PRD usability: dates as DD MMM YYYY, in the viewer's time zone.
export function formatDate(iso: string, timeZone = 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone = 'Asia/Kolkata'): string {
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(
    new Date(iso),
  );
  return `${formatDate(iso, timeZone)}, ${time}`;
}

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A date-only value (YYYY-MM-DD or UTC midnight ISO), e.g. "Mon 9 Nov". */
export const formatDay = (day: string): string => dayFmt.format(new Date(`${day.slice(0, 10)}T00:00:00.000Z`));

/** "Week 46 · 9 Nov to 15 Nov 2026" from an ISO week and its seven days. */
export function formatWeek(week: string, days: string[]): string {
  const first = new Date(`${days[0]}T00:00:00.000Z`);
  const last = new Date(`${days[days.length - 1]}T00:00:00.000Z`);
  return `Week ${Number(week.slice(6))} · ${shortFmt.format(first)} to ${shortFmt.format(last)} ${last.getUTCFullYear()}`;
}

/** Leave dates: one day ("Thu 12 Nov, half day") or a range. */
export function formatLeave(startDate: string, endDate: string, halfDay: boolean): string {
  if (startDate.slice(0, 10) === endDate.slice(0, 10)) return `${formatDay(startDate)}${halfDay ? ', half day' : ''}`;
  return `${formatDay(startDate)} to ${formatDay(endDate)}`;
}

export const hours = (h: number | string | null | undefined): string => (h === null || h === undefined ? '0h' : `${Number(h).toFixed(1).replace(/\.0$/, '')}h`);

/** Amounts as Decimal strings from the API, e.g. "INR 15,750.00". */
export function formatMoney(amount: string | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return '';
  const n = Number(amount);
  const grouped = new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return `${currency} ${grouped}`;
}
