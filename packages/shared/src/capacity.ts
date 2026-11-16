// Capacity maths (TechSpec 9.1). Pure functions shared by the API, the worker and the web app.
// Dates are date-only values at UTC midnight, the same convention as Task.dueDate.

/** TechSpec decision 3: Mon to Sat. */
export const WORKING_DAYS_PER_WEEK = 6;
export const OVER_CAPACITY_PCT = 100;

const DAY_MS = 86_400_000;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
export const dayDate = (s: string): Date => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
export const addDays = (d: Date, n: number): Date => new Date(d.getTime() + n * DAY_MS);

/** Today's date in a time zone, as YYYY-MM-DD. */
export const todayIn = (timeZone: string, at: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/** ISO 8601 week, e.g. "2026-W46". Weeks start on Monday. */
export function isoWeekOf(date: Date): string {
  const d = dayDate(ymd(date));
  const dow = d.getUTCDay() || 7;
  const thursday = addDays(d, 4 - dow);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Monday of an ISO week, or null when the week does not exist (e.g. 2026-W54). */
export function weekStart(week: string): Date | null {
  const m = WEEK_RE.exec(week);
  if (!m) return null;
  const year = Number(m[1]);
  const n = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = addDays(jan4, 1 - (jan4.getUTCDay() || 7) + (n - 1) * 7);
  return n >= 1 && isoWeekOf(monday) === week ? monday : null;
}

export const isIsoWeek = (s: string): boolean => weekStart(s) !== null;

export function shiftWeek(week: string, by: number): string {
  const start = weekStart(week);
  if (!start) throw new Error(`Not an ISO week: ${week}`);
  return isoWeekOf(addDays(start, by * 7));
}

/** All seven days, Monday first, as YYYY-MM-DD. */
export function weekDays(week: string): string[] {
  const start = weekStart(week);
  if (!start) throw new Error(`Not an ISO week: ${week}`);
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(start, i)));
}

/** Monday is 1, Sunday is 7; the first `workingDays` of the week are working days. */
export const isWorkingDay = (day: string, workingDays = WORKING_DAYS_PER_WEEK): boolean =>
  (dayDate(day).getUTCDay() || 7) <= workingDays;

export interface LeaveSpan {
  startDate: Date | string;
  endDate: Date | string;
  halfDay: boolean;
}

export interface HolidaySpan {
  date: Date | string;
  name: string;
}

export interface CapacityDay {
  date: string;
  working: boolean;
  availableH: number;
  leave: 'FULL' | 'HALF' | null;
  holiday: string | null;
}

export interface MemberWeek {
  dailyH: number;
  availableH: number;
  /** Working days lost to leave; a half day counts 0.5. Leave on a holiday is not counted twice. */
  leaveDays: number;
  holidayDays: number;
  days: CapacityDay[];
}

/** Hours to one decimal place. */
export const roundHours = (n: number): number => Math.round(n * 10) / 10;
const round1 = roundHours;
const asDay = (d: Date | string) => (typeof d === 'string' ? d.slice(0, 10) : ymd(d));

/**
 * available = weeklyCapacityH - leave days x dailyH - holidays x dailyH, per TechSpec 9.1, with
 * dailyH = weeklyCapacityH / working days. A day is lost once even if leave and a holiday overlap.
 */
export function memberWeek(input: {
  weeklyCapacityH: number;
  week: string;
  leaves: LeaveSpan[];
  holidays: HolidaySpan[];
  workingDays?: number;
}): MemberWeek {
  const workingDays = input.workingDays ?? WORKING_DAYS_PER_WEEK;
  const dailyH = input.weeklyCapacityH / workingDays;
  const holidays = new Map(input.holidays.map((h) => [asDay(h.date), h.name]));
  let leaveDays = 0;
  let holidayDays = 0;
  const days = weekDays(input.week).map((date): CapacityDay => {
    const working = isWorkingDay(date, workingDays);
    const holiday = holidays.get(date) ?? null;
    const covering = input.leaves.filter((l) => asDay(l.startDate) <= date && date <= asDay(l.endDate));
    const leave = covering.length === 0 ? null : covering.some((l) => !l.halfDay) ? 'FULL' : 'HALF';
    if (!working) return { date, working, availableH: 0, leave, holiday };
    if (holiday) {
      holidayDays++;
      return { date, working, availableH: 0, leave, holiday };
    }
    const lost = leave === 'FULL' ? 1 : leave === 'HALF' ? 0.5 : 0;
    leaveDays += lost;
    return { date, working, availableH: round1(dailyH * (1 - lost)), leave, holiday };
  });
  const availableH = round1(Math.max(0, input.weeklyCapacityH - (leaveDays + holidayDays) * dailyH));
  return { dailyH: round1(dailyH), availableH, leaveDays, holidayDays, days };
}

/** Working days a leave covers; a half day counts 0.5. */
export function leaveWorkingDays(l: LeaveSpan, workingDays = WORKING_DAYS_PER_WEEK): number {
  if (l.halfDay) return 0.5;
  let n = 0;
  for (let d = dayDate(asDay(l.startDate)); ymd(d) <= asDay(l.endDate); d = addDays(d, 1)) {
    if (isWorkingDay(ymd(d), workingDays)) n++;
  }
  return n;
}

/** The day a task counts against: its planner day if set, else its due date. */
export const taskDay = (t: { plannedDate: Date | string | null; dueDate: Date | string | null }): string | null =>
  t.plannedDate ? asDay(t.plannedDate) : t.dueDate ? asDay(t.dueDate) : null;

/** Rounded percentage, or null when nothing is available (on leave all week). */
export function utilisationPct(assignedH: number, availableH: number): number | null {
  if (availableH <= 0) return assignedH > 0 ? null : 0;
  return Math.round((assignedH / availableH) * 100);
}

export const isOver = (assignedH: number, availableH: number): boolean => assignedH > availableH + 0.05;

