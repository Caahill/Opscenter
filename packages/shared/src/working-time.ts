// Working hours (PRD 2.8, 6.1 "unanswered client messages older than 4 working hours"): Monday to
// Saturday, 09:00 to 18:00 in IST, the team's calendar (TechSpec decision 3).

export const WORKDAY_START_H = 9;
export const WORKDAY_END_H = 18;
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const HOUR_MS = 3_600_000;

/** Working hours elapsed between two instants. Sundays and outside 09:00-18:00 IST do not count. */
export function workingHoursBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  // Walk day by day in IST wall-clock time.
  const start = new Date(from.getTime() + IST_OFFSET_MS);
  const end = new Date(to.getTime() + IST_OFFSET_MS);
  const day = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (day <= end) {
    if (day.getUTCDay() !== 0) {
      const open = day.getTime() + WORKDAY_START_H * HOUR_MS;
      const close = day.getTime() + WORKDAY_END_H * HOUR_MS;
      const a = Math.max(open, start.getTime());
      const b = Math.min(close, end.getTime());
      if (b > a) total += (b - a) / HOUR_MS;
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return Math.round(total * 100) / 100;
}
