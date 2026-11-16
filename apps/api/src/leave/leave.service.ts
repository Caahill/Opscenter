// Leave and holidays (PRD 3.1, 3.2, 3.4). HR records leave; the reason is encrypted and shown to
// HR and Admin only. Each write re-runs the leave impact alert for the TL and affected PMs.
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { leaveDedupeKey, notifyLeaveImpact, Prisma } from '@opshub/db';
import { present, scopesFor, type Scope } from '@opshub/policy';
import {
  dayDate,
  DEFAULT_TIMEZONE,
  isoWeekOf,
  LEAVE_RULES,
  taskDay,
  todayIn,
  type CreateHolidayInput,
  type CreateLeaveInput,
  type ListHolidaysQuery,
  type ListLeaveQuery,
  type UpdateLeaveInput,
} from '@opshub/shared';
import { AuditService } from '../audit/audit.service';
import { CapacityService } from '../capacity/capacity.service';
import { DirectoryService } from '../common/directory.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { OPEN_STATUSES } from '../projects/projects.queries';
import { NotifyService } from '../notifications/notify.service';
import { TasksQueries } from '../tasks/tasks.queries';
import { LeaveImpactDto, presentHoliday, presentLeave, type LeaveRow } from '../people/dtos';

const WITH_USER = { user: { select: { name: true, teamId: true } } } as const;

const overlaps = (start: Date, end: Date): Prisma.LeaveWhereInput => ({ startDate: { lte: end }, endDate: { gte: start } });

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly directory: DirectoryService,
    private readonly capacity: CapacityService,
    private readonly tasks: TasksQueries,
    private readonly notify: NotifyService,
  ) {}

  private async present(rows: LeaveRow[]) {
    const names = await this.directory.names(rows.map((r) => r.createdById));
    return rows.map((r) => presentLeave(r, names, this.crypto));
  }

  /** Current and upcoming leave by default; `from`/`to` pick any window. */
  async list(v: AuthedViewer, scopes: Scope[], q: ListLeaveQuery) {
    const from = dayDate(q.from ?? todayIn(DEFAULT_TIMEZONE));
    const rows = await this.prisma.leave.findMany({
      where: {
        AND: [
          await this.scopes.leaveWhere(v, scopes),
          { endDate: { gte: from }, ...(q.to ? { startDate: { lte: dayDate(q.to) } } : {}) },
          q.userId ? { userId: q.userId } : {},
          q.teamId ? { user: { teamId: q.teamId } } : {},
        ],
      },
      include: WITH_USER,
      orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
      take: 200,
    });
    return this.present(rows);
  }

  private async requireLeave(v: AuthedViewer, scopes: Scope[], id: string): Promise<LeaveRow> {
    const leave = await this.prisma.leave.findFirst({ where: { AND: [{ id }, await this.scopes.leaveWhere(v, scopes)] }, include: WITH_USER });
    if (!leave) throw Errors.notFound('Leave');
    return leave;
  }

  private async assertFree(userId: string, start: Date, end: Date, exceptId?: string) {
    const clash = await this.prisma.leave.findFirst({ where: { userId, ...overlaps(start, end), ...(exceptId ? { id: { not: exceptId } } : {}) } });
    if (clash) throw Errors.conflict('Leave is already recorded for some of these dates; edit that record instead');
  }

  private sealReason(id: string, reason: string | null | undefined) {
    return reason ? this.crypto.encrypt(reason, 'pii', `leave:${id}`).then((s) => s.ciphertext) : Promise.resolve(null);
  }

  /** Runs after the write commits; the alert is best effort and never fails the request. */
  private async alert(leaveId: string) {
    const started = new Date();
    await notifyLeaveImpact(this.prisma, leaveId, todayIn(DEFAULT_TIMEZONE)).catch(() => undefined);
    const fresh = await this.prisma.notification.findMany({ where: { dedupeKey: leaveDedupeKey(leaveId), createdAt: { gte: started } }, select: { id: true } });
    await this.notify.announce(fresh.map((n) => n.id));
  }

  async create(v: AuthedViewer, input: CreateLeaveInput) {
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user?.active) throw Errors.validation('userId: must be an active user');
    const start = dayDate(input.startDate);
    const end = dayDate(input.endDate);
    await this.assertFree(user.id, start, end);
    const id = randomUUID();
    const leave = await this.prisma.$transaction(async (tx) => {
      const row = await tx.leave.create({
        data: { id, userId: user.id, startDate: start, endDate: end, halfDay: input.halfDay, kind: input.kind, reasonEnc: await this.sealReason(id, input.reason), createdById: v.userId },
        include: WITH_USER,
      });
      await this.audit.record(v.userId, 'LEAVE_RECORDED', 'Leave', id, { userId: user.id, startDate: input.startDate, endDate: input.endDate }, tx);
      return row;
    });
    await this.alert(leave.id);
    return (await this.present([leave]))[0]!;
  }

  async update(v: AuthedViewer, scopes: Scope[], id: string, input: UpdateLeaveInput) {
    const before = await this.requireLeave(v, scopes, id);
    const start = input.startDate ? dayDate(input.startDate) : before.startDate;
    const end = input.endDate ? dayDate(input.endDate) : before.endDate;
    const halfDay = input.halfDay ?? before.halfDay;
    if (start > end) throw Errors.validation(LEAVE_RULES.order);
    if (halfDay && start.getTime() !== end.getTime()) throw Errors.validation(LEAVE_RULES.halfDay);
    await this.assertFree(before.userId, start, end, id);
    const data: Prisma.LeaveUpdateInput = { startDate: start, endDate: end, halfDay, kind: input.kind };
    if (input.reason !== undefined) data.reasonEnc = await this.sealReason(id, input.reason);
    const leave = await this.prisma.$transaction(async (tx) => {
      const row = await tx.leave.update({ where: { id }, data, include: WITH_USER });
      await this.audit.record(v.userId, 'LEAVE_CHANGED', 'Leave', id, { fields: Object.keys(input) }, tx);
      return row;
    });
    await this.alert(id);
    return (await this.present([leave]))[0]!;
  }

  async remove(v: AuthedViewer, scopes: Scope[], id: string) {
    const leave = await this.requireLeave(v, scopes, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.leave.delete({ where: { id } });
      await this.audit.record(v.userId, 'LEAVE_DELETED', 'Leave', id, { userId: leave.userId }, tx);
    });
    await this.alert(id); // removes the alert
  }

  /**
   * PRD 3.2: open tasks of the person on leave, due or planned during it, that the viewer can see,
   * with teammates' free hours and a suggested assignee per task for the one-click reassign.
   */
  async impact(v: AuthedViewer, scopes: Scope[], id: string) {
    const leave = await this.requireLeave(v, scopes, id);
    const during = { gte: leave.startDate, lte: leave.endDate };
    const taskScopes = scopesFor(v.roles, 'task.read');
    const rows = taskScopes.length
      ? await this.tasks.rows(v, taskScopes, {
          assigneeId: leave.userId,
          statusType: { in: [...OPEN_STATUSES] },
          OR: [{ plannedDate: during }, { plannedDate: null, dueDate: during }],
        })
      : [];

    const team = leave.user.teamId ? await this.prisma.team.findUnique({ where: { id: leave.user.teamId } }) : null;
    const teamWhere: Prisma.UserWhereInput = team
      ? { id: { not: leave.userId }, OR: [{ teamId: team.id }, ...(team.leaderId ? [{ id: team.leaderId }] : [])] }
      : { id: { in: [] } };
    const week = isoWeekOf(leave.startDate);
    const [members, theirLeave] = await Promise.all([
      this.capacity.members(teamWhere, week),
      this.prisma.leave.findMany({ where: { user: teamWhere, ...overlaps(leave.startDate, leave.endDate) } }),
    ]);
    const awayOn = (userId: string, day: string | null) =>
      theirLeave.some((l) => l.userId === userId && (!day || (l.startDate <= dayDate(day) && dayDate(day) <= l.endDate)));
    const candidates = members
      .map((m) => ({ userId: m.userId, name: m.name, freeH: Math.max(0, Math.round((m.availableH - m.assignedH) * 10) / 10), onLeave: awayOn(m.userId, null) }))
      .sort((a, b) => b.freeH - a.freeH);

    const suggestions: Record<string, string> = {};
    for (const t of rows) {
      const pick = candidates.find((c) => !awayOn(c.userId, taskDay(t)));
      if (pick) suggestions[t.id] = pick.userId;
    }

    const names = await this.directory.names([leave.createdById]);
    return present(LeaveImpactDto, {
      leave: presentLeave(leave, names, this.crypto),
      tasks: await this.tasks.present(rows),
      candidates,
      suggestions,
    });
  }

  // ---- Holidays ----

  async holidays(q: ListHolidaysQuery) {
    const year = q.year ?? new Date().getUTCFullYear();
    const rows = await this.prisma.holiday.findMany({
      where: { date: { gte: dayDate(`${year}-01-01`), lte: dayDate(`${year}-12-31`) }, ...(q.location ? { location: q.location } : {}) },
      orderBy: { date: 'asc' },
    });
    return rows.map(presentHoliday);
  }

  async addHoliday(v: AuthedViewer, input: CreateHolidayInput) {
    try {
      const h = await this.prisma.holiday.create({ data: { date: dayDate(input.date), location: input.location, name: input.name } });
      await this.audit.record(v.userId, 'HOLIDAY_CHANGED', 'Holiday', h.id, { added: input.date, location: input.location });
      return presentHoliday(h);
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw Errors.conflict('There is already a holiday on that date for this location');
      throw e;
    }
  }

  async removeHoliday(v: AuthedViewer, id: string) {
    const h = await this.prisma.holiday.findUnique({ where: { id } });
    if (!h) throw Errors.notFound('Holiday');
    await this.prisma.holiday.delete({ where: { id } });
    await this.audit.record(v.userId, 'HOLIDAY_CHANGED', 'Holiday', id, { removed: h.date.toISOString().slice(0, 10), location: h.location });
  }
}
