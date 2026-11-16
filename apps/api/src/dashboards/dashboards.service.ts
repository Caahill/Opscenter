// Role dashboards (PRD 6.1, 6.2). Each one is built from the viewer's own scopes, so a dashboard
// never shows more than the lists behind it would.
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import { present, scopesFor, type Presentable } from '@opshub/policy';
import { addDays, dayDate, DEFAULT_TIMEZONE, isoWeekOf, OPEN_STATUS_TYPES, todayIn, weekDays, workingHoursBetween, ymd, type Department } from '@opshub/shared';
import { RenewalsService } from '../billing/renewals.service';
import { CapacityService, currentWeek, inWeekWhere } from '../capacity/capacity.service';
import { ChatService } from '../chat/chat.service';
import type { AuthedViewer } from '../common/request';
import { COMM_INCLUDE } from '../inbox/dtos';
import { MessagesQueries } from '../inbox/messages';
import { LeaveService } from '../leave/leave.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { TasksQueries } from '../tasks/tasks.queries';
import { TasksService } from '../tasks/tasks.service';
import { AccountsDashboardDto, AdminDashboardDto, HrDashboardDto, MeDashboardDto, PmDashboardDto, TlDashboardDto } from './dtos';

const OPEN = { in: [...OPEN_STATUS_TYPES] };
const OPEN_PROJECT = { notIn: ['DONE', 'STOPPED'] as Array<'DONE' | 'STOPPED'> };
/** PRD 2.8 / 6.1: client messages without a reply after 4 working hours. */
const UNANSWERED_AFTER_H = 4;

const today = () => dayDate(todayIn(DEFAULT_TIMEZONE));
const monthStart = () => dayDate(`${todayIn(DEFAULT_TIMEZONE).slice(0, 7)}-01`);

type ProjectRow = Prisma.ProjectGetPayload<{ include: { client: { select: { companyName: true } }; stage: { select: { name: true } } } }>;
const projectRef = (p: ProjectRow) => ({
  id: p.id,
  clientId: p.clientId,
  clientName: p.client.companyName,
  department: p.department,
  statusType: p.statusType,
  stageName: p.stage.name,
  since: p.stageEnteredAt,
});
const PROJECT_REF = { client: { select: { companyName: true } }, stage: { select: { name: true } } } as const;

@Injectable()
export class DashboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly capacity: CapacityService,
    private readonly messages: MessagesQueries,
    private readonly tasks: TasksQueries,
    private readonly tasksService: TasksService,
    private readonly renewals: RenewalsService,
    private readonly leave: LeaveService,
    private readonly chat: ChatService,
  ) {}

  /** Inbound client messages with no reply in their thread, older than 4 working hours. */
  private async unanswered(v: AuthedViewer, extra: Prisma.CommunicationWhereInput): Promise<Presentable[]> {
    const scopeWhere = await this.scopes.communicationWhere(v, scopesFor(v.roles, 'inbox.read'));
    const recent = await this.prisma.communication.findMany({
      where: { AND: [scopeWhere, extra, { direction: 'INBOUND', clientId: { not: null }, triageState: { not: 'DISMISSED' }, sentAt: { gte: addDays(new Date(), -30) } }] },
      include: COMM_INCLUDE,
      orderBy: { sentAt: 'desc' },
      take: 300,
    });
    if (!recent.length) return [];
    const replies = await this.prisma.communication.groupBy({ by: ['threadKey'], where: { threadKey: { in: recent.map((r) => r.threadKey) }, direction: 'OUTBOUND' }, _max: { sentAt: true } });
    const lastReply = new Map(replies.map((r) => [r.threadKey, r._max.sentAt]));
    const now = new Date();
    const waiting = recent.filter((r) => {
      const replied = lastReply.get(r.threadKey);
      return (!replied || replied < r.sentAt) && workingHoursBetween(r.sentAt, now) > UNANSWERED_AFTER_H;
    });
    return (await this.messages.summaries(v, scopeWhere, waiting, 10)).items;
  }

  private async teamLoad(v: AuthedViewer, teamWhere: Prisma.TeamWhereInput) {
    const week = currentWeek();
    const teams = await this.prisma.team.findMany({ where: teamWhere, orderBy: { name: 'asc' } });
    const overdue = await this.prisma.task.groupBy({ by: ['teamId'], where: { statusType: OPEN, dueDate: { lt: today() }, teamId: { in: teams.map((t) => t.id) } }, _count: { _all: true } });
    const out = [];
    for (const t of teams) {
      const members = await this.capacity.members({ OR: [{ teamId: t.id }, ...(t.leaderId ? [{ id: t.leaderId }] : [])] }, week);
      if (!members.length) continue;
      const availableH = Math.round(members.reduce((n, m) => n + m.availableH, 0) * 10) / 10;
      const assignedH = Math.round(members.reduce((n, m) => n + m.assignedH, 0) * 10) / 10;
      out.push({
        teamId: t.id,
        teamName: t.name,
        availableH,
        assignedH,
        utilisationPct: availableH > 0 ? Math.round((assignedH / availableH) * 100) : null,
        over: assignedH > availableH + 0.05,
        overdue: overdue.find((o) => o.teamId === t.id)?._count._all ?? 0,
      });
    }
    return out;
  }

  // ---- PRD 6.1 Admin overview ----

  async admin(v: AuthedViewer) {
    const [activeClients, open, atRisk, onHold, stoppedIds, billing, renewals] = await Promise.all([
      this.prisma.client.count({ where: { status: 'ACTIVE' } }),
      this.prisma.project.findMany({ where: { statusType: OPEN_PROJECT }, select: { department: true, stage: { select: { name: true, order: true } } } }),
      this.prisma.project.findMany({ where: { statusType: OPEN_PROJECT, health: { in: ['AT_RISK', 'BLOCKED'] } }, include: PROJECT_REF, orderBy: { stageEnteredAt: 'asc' }, take: 20 }),
      this.prisma.project.findMany({ where: { statusType: 'ON_HOLD' }, include: PROJECT_REF, orderBy: { stageEnteredAt: 'asc' }, take: 20 }),
      this.prisma.activityLog.findMany({ where: { kind: 'PROJECT_STOPPED', at: { gte: monthStart() } }, select: { projectId: true } }),
      this.prisma.billingRequest.groupBy({ by: ['currency'], where: { status: { in: ['REQUESTED', 'INVOICED'] } }, _sum: { amount: true }, _count: { _all: true } }),
      this.renewals.list(v, ['ALL'], { within: 30 }),
    ]);
    const stopped = await this.prisma.project.findMany({ where: { id: { in: stoppedIds.map((s) => s.projectId!).filter(Boolean) }, statusType: 'STOPPED' }, include: PROJECT_REF });
    const byDept = new Map<Department, Map<string, { order: number; count: number }>>();
    for (const p of open) {
      const stages = byDept.get(p.department) ?? new Map();
      const s = stages.get(p.stage.name) ?? { order: p.stage.order, count: 0 };
      s.count++;
      stages.set(p.stage.name, s);
      byDept.set(p.department, stages);
    }
    return present(AdminDashboardDto, {
      activeClients,
      activeProjects: open.length,
      byDepartment: [...byDept.entries()].map(([department, stages]) => ({
        department,
        total: [...stages.values()].reduce((n, s) => n + s.count, 0),
        stages: [...stages.entries()].sort((a, b) => a[1].order - b[1].order).map(([label, s]) => ({ key: label, label, count: s.count })),
      })),
      atRisk: atRisk.map(projectRef),
      onHold: onHold.map(projectRef),
      stoppedThisMonth: stopped.map(projectRef),
      teams: await this.teamLoad(v, {}),
      unanswered: await this.unanswered(v, {}),
      billingPending: billing.map((b) => ({ currency: b.currency, amount: b._sum.amount?.toString() ?? '0', count: b._count._all })),
      renewalsDue: renewals.length,
    });
  }

  // ---- PRD 6.2 role dashboards ----

  async pm(v: AuthedViewer) {
    const mine = { pmId: v.userId };
    const [clients, byStatus, waiting, renewals, triage, billable, billingOpen] = await Promise.all([
      this.prisma.client.count({ where: { pmId: v.userId, status: 'ACTIVE' } }),
      this.prisma.project.groupBy({ by: ['statusType'], where: { ...mine, statusType: OPEN_PROJECT }, _count: { _all: true } }),
      this.prisma.project.findMany({ where: { ...mine, statusType: 'WAITING_ON_CLIENT' }, include: PROJECT_REF, orderBy: { stageEnteredAt: 'asc' }, take: 20 }),
      this.renewals.list(v, ['OWN_CLIENTS'], { within: 30 }),
      this.prisma.communication.count({ where: { client: { pmId: v.userId }, direction: 'INBOUND', triageState: { in: ['NEW', 'SUGGESTED'] } } }),
      this.tasks.list(v, ['OWN_CLIENTS'], { billable: true, billableConfirmed: false, statusType: OPEN }, 20),
      this.prisma.billingRequest.count({ where: { client: { pmId: v.userId }, status: { in: ['REQUESTED', 'INVOICED'] } } }),
    ]);
    return present(PmDashboardDto, {
      clients,
      projectsByStatus: byStatus.map((s) => ({ key: s.statusType, label: s.statusType, count: s._count._all })),
      waitingOnClient: waiting.map(projectRef),
      renewals,
      unanswered: await this.unanswered(v, { client: { pmId: v.userId } }),
      needsTriage: triage,
      billableToConfirm: billable,
      billingOpen,
    });
  }

  async tl(v: AuthedViewer) {
    const teamIds = await this.scopes.teamIds(v);
    const week = currentWeek();
    const days = weekDays(week);
    const memberIds = (await this.prisma.user.findMany({ where: { teamId: { in: teamIds }, active: true }, select: { id: true } })).map((u) => u.id);
    const [overdue, weekTasks, out] = await Promise.all([
      this.tasks.list(v, ['OWN_TEAM'], { statusType: OPEN, dueDate: { lt: today() }, OR: [{ teamId: { in: teamIds } }, { assigneeId: { in: memberIds } }] }, 20),
      this.prisma.task.findMany({ where: { statusType: OPEN, assigneeId: { in: memberIds }, ...inWeekWhere(week) }, select: { plannedDate: true, dueDate: true, estimateH: true } }),
      this.leave.list(v, ['OWN_TEAM'], { from: days[0], to: days[6] }),
    ]);
    return present(TlDashboardDto, {
      teams: await this.teamLoad(v, { id: { in: teamIds } }),
      overdue,
      week: days.map((date) => {
        const on = weekTasks.filter((t) => ymd(t.plannedDate ?? t.dueDate!) === date);
        return { date, planned: on.length, hours: Math.round(on.reduce((n, t) => n + Number(t.estimateH ?? 0), 0) * 10) / 10 };
      }),
      outThisWeek: out,
    });
  }

  async me(v: AuthedViewer) {
    const canTasks = scopesFor(v.roles, 'task.read').length > 0;
    const [todayList, weekList, overdue, unreadAlerts, unreadChats] = await Promise.all([
      canTasks ? this.tasksService.mine(v, { range: 'today' }) : [],
      canTasks ? this.tasksService.mine(v, { range: 'week' }) : [],
      this.prisma.task.count({ where: { assigneeId: v.userId, statusType: OPEN, dueDate: { lt: today() } } }),
      this.prisma.notification.count({ where: { userId: v.userId, readAt: null } }),
      this.chat.unreadTotal(v),
    ]);
    return present(MeDashboardDto, { today: todayList, week: weekList, overdue, unreadAlerts, unreadChats });
  }

  async accounts(v: AuthedViewer) {
    const [byStatus, renewals, paid] = await Promise.all([
      this.prisma.billingRequest.groupBy({ by: ['status', 'currency'], _sum: { amount: true }, _count: { _all: true } }),
      this.renewals.list(v, ['BILLING'], { within: 30 }),
      this.prisma.billingRequest.groupBy({ by: ['currency'], where: { status: 'PAID', paidAt: { gte: monthStart() } }, _sum: { amount: true }, _count: { _all: true } }),
    ]);
    const statuses = ['REQUESTED', 'INVOICED', 'PAID', 'CANCELLED'] as const;
    return present(AccountsDashboardDto, {
      byStatus: statuses.map((status) => {
        const rows = byStatus.filter((r) => r.status === status);
        return { status, count: rows.reduce((n, r) => n + r._count._all, 0), totals: rows.map((r) => ({ currency: r.currency, amount: r._sum.amount?.toString() ?? '0', count: r._count._all })) };
      }),
      renewalsDue: renewals,
      paidThisMonth: paid.map((r) => ({ currency: r.currency, amount: r._sum.amount?.toString() ?? '0', count: r._count._all })),
    });
  }

  async hr(v: AuthedViewer) {
    const thisWeek = weekDays(currentWeek());
    const nextWeek = weekDays(isoWeekOf(addDays(dayDate(thisWeek[0]!), 7)));
    const [outThisWeek, outNextWeek, holidays] = await Promise.all([
      this.leave.list(v, ['PEOPLE'], { from: thisWeek[0], to: thisWeek[6] }),
      this.leave.list(v, ['PEOPLE'], { from: nextWeek[0], to: nextWeek[6] }),
      this.prisma.holiday.findMany({ where: { date: { gte: today(), lte: addDays(today(), 30) } }, orderBy: { date: 'asc' } }),
    ]);
    return present(HrDashboardDto, {
      outThisWeek,
      outNextWeek,
      holidays: holidays.map((h) => ({ id: h.id, date: h.date, name: h.name, location: h.location })),
    });
  }
}
