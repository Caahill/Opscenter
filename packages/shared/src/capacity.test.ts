import { describe, expect, it } from 'vitest';
import { isOver, isoWeekOf, leaveWorkingDays, memberWeek, shiftWeek, taskDay, utilisationPct, weekDays, weekStart } from './capacity';
import { CreateLeaveInput, PlannerMovesInput } from './schemas-people';

describe('ISO weeks', () => {
  it.each([
    ['2026-11-09', '2026-W46'], // Monday
    ['2026-11-15', '2026-W46'], // Sunday
    ['2026-01-01', '2026-W01'], // Thursday
    ['2027-01-01', '2026-W53'], // Friday belongs to the last week of 2026
    ['2024-12-30', '2025-W01'], // Monday belongs to the first week of 2025
  ])('%s is in %s', (day, week) => {
    expect(isoWeekOf(new Date(`${day}T00:00:00.000Z`))).toBe(week);
  });

  it('finds the Monday of a week and rejects weeks that do not exist', () => {
    expect(weekStart('2026-W46')?.toISOString().slice(0, 10)).toBe('2026-11-09');
    expect(weekStart('2025-W01')?.toISOString().slice(0, 10)).toBe('2024-12-30');
    expect(weekStart('2026-W53')).not.toBeNull();
    expect(weekStart('2025-W53')).toBeNull();
    expect(weekStart('2026-W00')).toBeNull();
    expect(weekStart('2026-46')).toBeNull();
  });

  it('lists seven days and moves across years', () => {
    expect(weekDays('2026-W46')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(shiftWeek('2026-W53', 1)).toBe('2027-W01');
    expect(shiftWeek('2027-W01', -1)).toBe('2026-W53');
  });
});

describe('available hours (TechSpec 9.1)', () => {
  const week = '2026-W46';

  it('a full week is the weekly capacity over 6 working days, Sunday off', () => {
    const w = memberWeek({ weeklyCapacityH: 48, week, leaves: [], holidays: [] });
    expect(w.availableH).toBe(48);
    expect(w.dailyH).toBe(8);
    expect(w.days.map((d) => d.availableH)).toEqual([8, 8, 8, 8, 8, 8, 0]);
    expect(w.days[6]!.working).toBe(false);
  });

  it('subtracts leave days, and a half day counts half', () => {
    const w = memberWeek({
      weeklyCapacityH: 48,
      week,
      leaves: [
        { startDate: '2026-11-10', endDate: '2026-11-11', halfDay: false },
        { startDate: '2026-11-13', endDate: '2026-11-13', halfDay: true },
      ],
      holidays: [],
    });
    expect(w.leaveDays).toBe(2.5);
    expect(w.availableH).toBe(28);
    expect(w.days.map((d) => d.leave)).toEqual([null, 'FULL', 'FULL', null, 'HALF', null, null]);
    expect(w.days[4]!.availableH).toBe(4);
  });

  it('subtracts holidays, and does not count leave on a holiday twice', () => {
    const w = memberWeek({
      weeklyCapacityH: 40,
      week,
      leaves: [{ startDate: '2026-11-09', endDate: '2026-11-15', halfDay: false }],
      holidays: [{ date: '2026-11-09', name: 'Office holiday' }],
    });
    expect(w.holidayDays).toBe(1);
    expect(w.leaveDays).toBe(5);
    expect(w.availableH).toBe(0);
    expect(w.days[0]).toMatchObject({ holiday: 'Office holiday', availableH: 0 });
  });

  it('only counts the part of a leave inside the week', () => {
    const w = memberWeek({ weeklyCapacityH: 42, week, leaves: [{ startDate: '2026-11-01', endDate: '2026-11-09', halfDay: false }], holidays: [] });
    expect(w.leaveDays).toBe(1);
    expect(w.availableH).toBe(35);
  });

  it('honours a different working week', () => {
    const w = memberWeek({ weeklyCapacityH: 40, week, leaves: [], holidays: [], workingDays: 5 });
    expect(w.days.map((d) => d.availableH)).toEqual([8, 8, 8, 8, 8, 0, 0]);
  });
});

describe('leave length', () => {
  it('counts working days only, and a half day as 0.5', () => {
    expect(leaveWorkingDays({ startDate: '2026-11-13', endDate: '2026-11-16', halfDay: false })).toBe(3); // Fri, Sat, Mon
    expect(leaveWorkingDays({ startDate: '2026-11-15', endDate: '2026-11-15', halfDay: false })).toBe(0); // Sunday
    expect(leaveWorkingDays({ startDate: '2026-11-10', endDate: '2026-11-10', halfDay: true })).toBe(0.5);
  });
});

describe('utilisation', () => {
  it('rounds to a percentage and flags over 100%', () => {
    expect(utilisationPct(36, 48)).toBe(75);
    expect(utilisationPct(50, 40)).toBe(125);
    expect(isOver(50, 40)).toBe(true);
    expect(isOver(40, 40)).toBe(false);
  });

  it('is null when work is assigned to someone with no hours left', () => {
    expect(utilisationPct(6, 0)).toBeNull();
    expect(utilisationPct(0, 0)).toBe(0);
    expect(isOver(6, 0)).toBe(true);
  });

  it('counts a task on its planner day before its due date', () => {
    expect(taskDay({ plannedDate: '2026-11-10T00:00:00.000Z', dueDate: '2026-11-20T00:00:00.000Z' })).toBe('2026-11-10');
    expect(taskDay({ plannedDate: null, dueDate: new Date('2026-11-20T00:00:00.000Z') })).toBe('2026-11-20');
    expect(taskDay({ plannedDate: null, dueDate: null })).toBeNull();
  });
});

describe('inputs', () => {
  it('rejects leave that ends before it starts, and multi-day half days', () => {
    const base = { userId: 'u1', kind: 'PLANNED' as const };
    expect(CreateLeaveInput.safeParse({ ...base, startDate: '2026-11-10', endDate: '2026-11-09' }).success).toBe(false);
    expect(CreateLeaveInput.safeParse({ ...base, startDate: '2026-11-10', endDate: '2026-11-11', halfDay: true }).success).toBe(false);
    expect(CreateLeaveInput.safeParse({ ...base, startDate: '2026-11-10', endDate: '2026-11-10', halfDay: true }).success).toBe(true);
  });

  it('a planner move must change something', () => {
    expect(PlannerMovesInput.safeParse({ moves: [{ taskId: 't1' }] }).success).toBe(false);
    expect(PlannerMovesInput.safeParse({ moves: [{ taskId: 't1', plannedDate: null }] }).success).toBe(true);
    expect(PlannerMovesInput.safeParse({ week: '2026-W54', moves: [{ taskId: 't1', priority: 'HIGH' }] }).success).toBe(false);
  });
});
