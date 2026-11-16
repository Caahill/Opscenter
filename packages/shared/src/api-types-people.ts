// Phase 1C response shapes. Optional properties may be omitted by the Policy Serializer.
import type { Department } from './enums';
import type { CapacityDay } from './capacity';
import type { LeaveKind } from './schemas-people';
import type { TaskView } from './api-types-work';

export interface LeaveView {
  id: string;
  userId: string;
  userName: string;
  teamId: string | null;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  /** Working days, a half day counts 0.5. */
  days: number;
  /** HR and Admin only. */
  kind?: LeaveKind;
  reason?: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface HolidayView {
  id: string;
  date: string;
  location: string;
  name: string;
}

export interface MemberCapacityView {
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

export interface TeamCapacityView {
  teamId: string | null;
  teamName: string;
  department: Department | null;
  availableH: number;
  assignedH: number;
  utilisationPct: number | null;
  over: boolean;
  members: MemberCapacityView[];
}

export interface CapacityView {
  week: string;
  days: string[];
  teams: TeamCapacityView[];
}

export interface PlannerView {
  teamId: string;
  teamName: string;
  department: Department;
  week: string;
  prevWeek: string;
  nextWeek: string;
  days: string[];
  members: MemberCapacityView[];
  /** Open tasks of the team planned or due this week. */
  tasks: TaskView[];
  /** Open team tasks with no day, or overdue from earlier weeks. */
  backlog: TaskView[];
}

export interface CapacityWarningView {
  userId: string;
  name: string;
  week: string;
  utilisationPct: number | null;
  reason: 'OVER_CAPACITY' | 'ON_LEAVE';
  /** The day, for ON_LEAVE. */
  date: string | null;
}

export interface PlannerMovesView {
  planner: PlannerView;
  warnings: CapacityWarningView[];
}

export interface LeaveCandidateView {
  userId: string;
  name: string;
  /** Free hours in the leave's first week. */
  freeH: number;
  onLeave: boolean;
}

export interface LeaveImpactView {
  leave: LeaveView;
  /** Open tasks of the person on leave, due or planned during it, that the viewer can see. Omitted for HR. */
  tasks?: TaskView[];
  candidates: LeaveCandidateView[];
  /** taskId -> suggested userId (most free hours, not on leave that day). */
  suggestions?: Record<string, string>;
}

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListView {
  unread: number;
  items: NotificationView[];
}
