// Capacity (TechSpec 9.1, PRD 3.3): available hours after leave and office holidays against the
// estimate hours of open tasks, per member and week. Computed on every read, so leave recorded by
// HR shows on every capacity and planner view straight away (PRD 3.1: within one minute).
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import { present, type Scope } from '@opshub/policy';
import {
  addDays,
  dayDate,
  DEFAULT_TIMEZONE,
  isOver,
  isoWeekOf,
  memberWeek,
  roundHours,
  taskDay,
  todayIn,
  utilisationPct,
  weekDays,
  weekStart,
  type CapacityQuery,
  type CapacityWarningView,
} from '@opshub/shared';
import type { AuthedViewer } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { OPEN_STATUSES } from '../projects/projects.queries';
import { CapacityDto, presentMemberCapacity, TeamCapacityDto, type MemberCapacity } from '../people/dtos';

/** The company runs on IST; weeks default to the current IST week. */
export const currentWeek = (): string => isoWeekOf(dayDate(todayIn(DEFAULT_TIMEZONE)));

export function weekRange(week: string) {
  const start = weekStart(week)!;
  return { gte: start, lte: addDays(start, 6) };
}

/** Open tasks counting against a week: planned in it, or unplanned and due in it. */
export const inWeekWhere = (week: string): Prisma.TaskWhereInput => {
  const range = weekRange(week);
  return { OR: [{ plannedDate: range }, { plannedDate: null, dueDate: range }] };
};

function totals(members: MemberCapacity[]) {
  const availableH = roundHours(members.reduce((n, m) => n + m.availableH, 0));
  const assignedH = roundHours(members.reduce((n, m) => n + m.assignedH, 0));
  return { availableH, assignedH, utilisationPct: utilisationPct(assignedH, availableH), over: isOver(assignedH, availableH) };
}

@Injectable()
export class CapacityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
  ) {}

  /** One row per active user matching `where`, for one ISO week. */
  async members(where: Prisma.UserWhereInput, week: string): Promise<MemberCapacity[]> {
    const users = await this.prisma.user.findMany({ where: { AND: [where, { active: true }] }, orderBy: { name: 'asc' } });
    if (users.length === 0) return [];
    const ids = users.map((u) => u.id);
    const range = weekRange(week);
    const [leaves, holidays, tasks] = await Promise.all([
      this.prisma.leave.findMany({ where: { userId: { in: ids }, startDate: { lte: range.lte }, endDate: { gte: range.gte } } }),
      this.prisma.holiday.findMany({ where: { date: range } }),
      this.prisma.task.findMany({
        where: { assigneeId: { in: ids }, statusType: { in: [...OPEN_STATUSES] }, ...inWeekWhere(week) },
        select: { assigneeId: true, estimateH: true, plannedDate: true, dueDate: true },
      }),
    ]);

    return users.map((u): MemberCapacity => {
      const w = memberWeek({
        weeklyCapacityH: Number(u.weeklyCapacityH),
        week,
        leaves: leaves.filter((l) => l.userId === u.id),
        holidays: holidays.filter((h) => h.location === u.location),
      });
      const perDay = new Map<string, number>();
      let unestimatedCount = 0;
      for (const t of tasks) {
        if (t.assigneeId !== u.id) continue;
        if (t.estimateH === null) unestimatedCount++;
        const day = taskDay(t)!;
        perDay.set(day, (perDay.get(day) ?? 0) + Number(t.estimateH ?? 0));
      }
      const assignedH = roundHours([...perDay.values()].reduce((n, h) => n + h, 0));
      return {
        userId: u.id,
        name: u.name,
        teamId: u.teamId,
        weeklyCapacityH: u.weeklyCapacityH.toString(),
        availableH: w.availableH,
        assignedH,
        utilisationPct: utilisationPct(assignedH, w.availableH),
        over: isOver(assignedH, w.availableH),
        leaveDays: w.leaveDays,
        holidayDays: w.holidayDays,
        unestimatedCount,
        days: w.days.map((d) => ({ ...d, assignedH: roundHours(perDay.get(d.date) ?? 0) })),
      };
    });
  }

  /** GET /capacity: per team and member. Staff without a team show only when work is assigned to them. */
  async overview(v: AuthedViewer, scopes: Scope[], q: CapacityQuery) {
    const week = q.week ?? currentWeek();
    const members = await this.members(
      { AND: [await this.scopes.peopleWhere(v, scopes), q.teamId ? { teamId: q.teamId } : {}, q.userId ? { id: q.userId } : {}] },
      week,
    );
    const teamIds = [...new Set(members.map((m) => m.teamId).filter((id): id is string => id !== null))];
    const teams = await this.prisma.team.findMany({ where: { id: { in: teamIds } }, orderBy: { name: 'asc' } });
    const groups = teams.map((t) => ({ teamId: t.id as string | null, teamName: t.name, department: t.department as string | null, members: members.filter((m) => m.teamId === t.id) }));
    const loose = members.filter((m) => m.teamId === null && (m.assignedH > 0 || q.userId));
    if (loose.length) groups.push({ teamId: null, teamName: 'No team', department: null, members: loose });

    return present(CapacityDto, {
      week,
      days: weekDays(week),
      teams: groups.map((g) =>
        present(TeamCapacityDto, { ...g, ...totals(g.members), members: g.members.map(presentMemberCapacity) }),
      ),
    });
  }

  /**
   * Warnings for work placed on people: over capacity in that week (PRD 3.3), or a full-day leave
   * on that day. `day` null means the task has no date; it is checked against `fallbackWeek`.
   */
  async warnings(placements: Array<{ userId: string; day: string | null }>, fallbackWeek: string): Promise<CapacityWarningView[]> {
    const byWeek = new Map<string, Set<string>>();
    for (const p of placements) {
      const week = p.day ? isoWeekOf(dayDate(p.day)) : fallbackWeek;
      byWeek.set(week, (byWeek.get(week) ?? new Set()).add(p.userId));
    }
    const out: CapacityWarningView[] = [];
    for (const [week, users] of byWeek) {
      const rows = await this.members({ id: { in: [...users] } }, week);
      for (const m of rows) {
        if (m.over) out.push({ userId: m.userId, name: m.name, week, utilisationPct: m.utilisationPct, reason: 'OVER_CAPACITY', date: null });
        const leaveDays = new Set(m.days.filter((d) => d.leave === 'FULL').map((d) => d.date));
        for (const p of placements) {
          if (p.userId === m.userId && p.day && leaveDays.has(p.day) && !out.some((w) => w.userId === m.userId && w.date === p.day)) {
            out.push({ userId: m.userId, name: m.name, week, utilisationPct: m.utilisationPct, reason: 'ON_LEAVE', date: p.day });
          }
        }
      }
    }
    return out;
  }
}
