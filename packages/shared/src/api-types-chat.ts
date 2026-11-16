// Phase 1F response shapes: chat, notification settings and role dashboards.
import type { BillingStatus, Department, StatusType } from './enums';
import type { ChatKind, MentionType, NotificationCategory } from './schemas-chat';
import type { LeaveView } from './api-types-people';
import type { RenewalView } from './api-types-billing';
import type { TaskView } from './api-types-work';
import type { ThreadSummaryView } from './api-types-inbox';

export interface ChatChannelView {
  id: string;
  kind: ChatKind;
  name: string;
  projectId: string | null;
  teamId: string | null;
  /** DIRECT: the other person. */
  otherUserId: string | null;
  memberCount: number;
  unread: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

export interface ChatMentionView {
  type: MentionType;
  id: string;
  /** Resolved for the reader; null when they cannot open the record. */
  label: string | null;
  href: string | null;
}

export interface ChatMessageView {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string | null;
  /** Mention tokens keep their place; their labels are the reader's (or "no access"). */
  body: string;
  mentions: ChatMentionView[];
  createdAt: string;
}

export interface ChatHistoryView {
  channel: ChatChannelView;
  messages: ChatMessageView[];
  nextBefore: string | null;
}

export interface MentionOptionView {
  type: MentionType;
  id: string;
  label: string;
  hint: string | null;
}

export interface NotificationPreferenceView {
  category: NotificationCategory;
  label: string;
  email: boolean;
  push: boolean;
}

export interface NotificationSettingsView {
  preferences: NotificationPreferenceView[];
  pushPublicKey: string | null;
  pushDevices: number;
  digestTime: string;
}

export interface CountView {
  key: string;
  label: string;
  count: number;
}

export interface MoneyTotalView {
  currency: string;
  amount: string;
  count: number;
}

export interface TeamLoadView {
  teamId: string | null;
  teamName: string;
  availableH: number;
  assignedH: number;
  utilisationPct: number | null;
  over: boolean;
  overdue: number;
}

export interface ProjectRefView {
  id: string;
  clientId: string;
  clientName: string;
  department: Department;
  statusType: StatusType;
  stageName: string;
  since: string | null;
}

export interface AdminDashboardView {
  activeClients: number;
  activeProjects: number;
  byDepartment: Array<{ department: Department; total: number; stages: CountView[] }>;
  atRisk: ProjectRefView[];
  onHold: ProjectRefView[];
  stoppedThisMonth: ProjectRefView[];
  teams: TeamLoadView[];
  unanswered: ThreadSummaryView[];
  billingPending: MoneyTotalView[];
  renewalsDue: number;
}

export interface PmDashboardView {
  clients: number;
  projectsByStatus: CountView[];
  waitingOnClient: ProjectRefView[];
  renewals: RenewalView[];
  unanswered: ThreadSummaryView[];
  needsTriage: number;
  billableToConfirm: TaskView[];
  billingOpen: number;
}

export interface TlDashboardView {
  teams: TeamLoadView[];
  overdue: TaskView[];
  week: Array<{ date: string; planned: number; hours: number }>;
  outThisWeek: LeaveView[];
}

export interface MeDashboardView {
  today: TaskView[];
  week: TaskView[];
  overdue: number;
  unreadAlerts: number;
  unreadChats: number;
}

export interface AccountsDashboardView {
  byStatus: Array<{ status: BillingStatus; count: number; totals: MoneyTotalView[] }>;
  renewalsDue: RenewalView[];
  paidThisMonth: MoneyTotalView[];
}

export interface HrDashboardView {
  outThisWeek: LeaveView[];
  outNextWeek: LeaveView[];
  holidays: Array<{ id: string; date: string; name: string; location: string }>;
}
