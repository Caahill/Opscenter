// Phase 1C response DTOs and mappers: leave, holidays, capacity, planner, notifications.
// Every property names a row in packages/policy fields.ts.
import type { Holiday, Leave, Notification } from '@opshub/db';
import { alt, defineDto, present } from '@opshub/policy';
import { leaveWorkingDays, type CapacityDay, type CapacityWarningView } from '@opshub/shared';
import type { CryptoService } from '../crypto/crypto.service';

export const LeaveDto = defineDto('Leave', {
  id: 'leave.id',
  userId: 'leave.userId',
  userName: 'leave.userName',
  teamId: 'leave.teamId',
  startDate: 'leave.startDate',
  endDate: 'leave.endDate',
  halfDay: 'leave.halfDay',
  days: 'leave.days',
  kind: 'leave.kind',
  reason: 'leave.reason',
  createdByName: 'leave.createdByName',
  createdAt: 'leave.createdAt',
});

export type LeaveRow = Leave & { user: { name: string; teamId: string | null } };

export function presentLeave(l: LeaveRow, names: Map<string, string>, crypto: CryptoService) {
  return present(
    LeaveDto,
    {
      id: l.id,
      userId: l.userId,
      userName: l.user.name,
      teamId: l.user.teamId,
      startDate: l.startDate,
      endDate: l.endDate,
      halfDay: l.halfDay,
      days: leaveWorkingDays(l),
      kind: l.kind,
      // Decrypted only for viewers the field policy lets see it (HR and Admin).
      reason: l.reasonEnc ? alt({ full: () => crypto.decryptWith('pii', l.reasonEnc!, `leave:${l.id}`) }) : null,
      createdByName: names.get(l.createdById) ?? null,
      createdAt: l.createdAt,
    },
    { entityId: l.id },
  );
}

export const HolidayDto = defineDto('Holiday', {
  id: 'holiday.id',
  date: 'holiday.date',
  location: 'holiday.location',
  name: 'holiday.name',
});

export const presentHoliday = (h: Holiday) =>
  present(HolidayDto, { id: h.id, date: h.date, location: h.location, name: h.name });

export interface MemberCapacity {
  userId: string;
  name: string;
  teamId: string | null;
  weeklyCapacityH: string;
  availableH: number;
  assignedH: number;
  utilisationPct: number | null;
  over: boolean;
  leaveDays: number;
  holidayDays: number;
  unestimatedCount: number;
  days: Array<CapacityDay & { assignedH: number }>;
}

export const MemberCapacityDto = defineDto('MemberCapacity', {
  userId: 'memberCapacity.userId',
  name: 'memberCapacity.name',
  teamId: 'memberCapacity.teamId',
  weeklyCapacityH: 'memberCapacity.weeklyCapacityH',
  availableH: 'memberCapacity.availableH',
  assignedH: 'memberCapacity.assignedH',
  utilisationPct: 'memberCapacity.utilisationPct',
  over: 'memberCapacity.over',
  leaveDays: 'memberCapacity.leaveDays',
  holidayDays: 'memberCapacity.holidayDays',
  unestimatedCount: 'memberCapacity.unestimatedCount',
  days: 'memberCapacity.days',
});

export const presentMemberCapacity = (m: MemberCapacity) => present(MemberCapacityDto, { ...m });

export const TeamCapacityDto = defineDto('TeamCapacity', {
  teamId: 'teamCapacity.teamId',
  teamName: 'teamCapacity.teamName',
  department: 'teamCapacity.department',
  availableH: 'teamCapacity.availableH',
  assignedH: 'teamCapacity.assignedH',
  utilisationPct: 'teamCapacity.utilisationPct',
  over: 'teamCapacity.over',
  members: 'teamCapacity.members',
});

export const CapacityDto = defineDto('Capacity', {
  week: 'capacity.week',
  days: 'capacity.days',
  teams: 'capacity.teams',
});

export const CapacityWarningDto = defineDto('CapacityWarning', {
  userId: 'capacityWarning.userId',
  name: 'capacityWarning.name',
  week: 'capacityWarning.week',
  utilisationPct: 'capacityWarning.utilisationPct',
  reason: 'capacityWarning.reason',
  date: 'capacityWarning.date',
});

export const presentWarning = (w: CapacityWarningView) => present(CapacityWarningDto, { ...w });

export const PlannerDto = defineDto('Planner', {
  teamId: 'planner.teamId',
  teamName: 'planner.teamName',
  department: 'planner.department',
  week: 'planner.week',
  prevWeek: 'planner.prevWeek',
  nextWeek: 'planner.nextWeek',
  days: 'planner.days',
  members: 'planner.members',
  tasks: 'planner.tasks',
  backlog: 'planner.backlog',
});

export const PlannerMovesDto = defineDto('PlannerMoves', {
  planner: 'plannerMoves.planner',
  warnings: 'plannerMoves.warnings',
});

export const LeaveImpactDto = defineDto('LeaveImpact', {
  leave: 'leaveImpact.leave',
  tasks: 'leaveImpact.tasks',
  candidates: 'leaveImpact.candidates',
  suggestions: 'leaveImpact.suggestions',
});

export const NotificationDto = defineDto('Notification', {
  id: 'notification.id',
  kind: 'notification.kind',
  title: 'notification.title',
  body: 'notification.body',
  link: 'notification.link',
  readAt: 'notification.readAt',
  createdAt: 'notification.createdAt',
});

export const presentNotification = (n: Notification) =>
  present(NotificationDto, {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: n.readAt,
    createdAt: n.createdAt,
  });

export const NotificationListDto = defineDto('NotificationList', {
  unread: 'notifications.unread',
  items: 'notifications.items',
});

export const NotificationSettingsDto = defineDto('NotificationSettings', {
  preferences: 'notificationSettings.preferences',
  pushPublicKey: 'notificationSettings.pushPublicKey',
  pushDevices: 'notificationSettings.pushDevices',
  digestTime: 'notificationSettings.digestTime',
});
