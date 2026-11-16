// Phase 1F dashboard DTOs. Every property names a row in packages/policy fields.ts.
import { defineDto } from '@opshub/policy';

export const AdminDashboardDto = defineDto('AdminDashboard', {
  activeClients: 'dashboard.activeClients',
  activeProjects: 'dashboard.activeProjects',
  byDepartment: 'dashboard.byDepartment',
  atRisk: 'dashboard.atRisk',
  onHold: 'dashboard.onHold',
  stoppedThisMonth: 'dashboard.stoppedThisMonth',
  teams: 'dashboard.teams',
  unanswered: 'dashboard.unanswered',
  billingPending: 'dashboard.billingPending',
  renewalsDue: 'dashboard.renewalsDue',
});

export const PmDashboardDto = defineDto('PmDashboard', {
  clients: 'dashboard.clients',
  projectsByStatus: 'dashboard.projectsByStatus',
  waitingOnClient: 'dashboard.waitingOnClient',
  renewals: 'dashboard.renewals',
  unanswered: 'dashboard.unanswered',
  needsTriage: 'dashboard.needsTriage',
  billableToConfirm: 'dashboard.billableToConfirm',
  billingOpen: 'dashboard.billingOpen',
});

export const TlDashboardDto = defineDto('TlDashboard', {
  teams: 'dashboard.teams',
  overdue: 'dashboard.overdue',
  week: 'dashboard.week',
  outThisWeek: 'dashboard.outThisWeek',
});

export const MeDashboardDto = defineDto('MeDashboard', {
  today: 'dashboard.today',
  week: 'dashboard.weekTasks',
  overdue: 'dashboard.overdueCount',
  unreadAlerts: 'dashboard.unreadAlerts',
  unreadChats: 'dashboard.unreadChats',
});

export const AccountsDashboardDto = defineDto('AccountsDashboard', {
  byStatus: 'dashboard.billingByStatus',
  renewalsDue: 'dashboard.renewals',
  paidThisMonth: 'dashboard.paidThisMonth',
});

export const HrDashboardDto = defineDto('HrDashboard', {
  outThisWeek: 'dashboard.outThisWeek',
  outNextWeek: 'dashboard.outNextWeek',
  holidays: 'dashboard.holidays',
});
