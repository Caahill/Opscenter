// Action checks (TechSpec 5.1): which role may do what, and at which scope (5.2).
// Add actions here as each phase introduces routes; never grant from anywhere else.
import type { Role } from '@opshub/shared';

export const SCOPES = ['ALL', 'OWN_CLIENTS', 'OWN_TEAM', 'ASSIGNED', 'BILLING', 'PEOPLE'] as const;
export type Scope = (typeof SCOPES)[number];

export const ACTIONS = [
  'user.read',
  'user.manage',
  'team.read',
  'team.manage',
  'audit.read',
  'client.read',
  'client.manage',
  'credential.read',
  'credential.manage',
  'credential.reveal',
  'project.read',
  'project.manage',
  'task.read',
  'task.create',
  'task.update',
  'pipeline.read',
  'pipeline.manage',
  'leave.read',
  'leave.manage',
  'holiday.manage',
  'capacity.read',
  'planner.read',
  'planner.manage',
  'inbox.read',
  'inbox.triage',
  'inbox.link',
  'inbox.send',
  'inbox.import',
  'mailbox.manage',
  'billing.read',
  'billing.create',
  'billing.update',
  'renewal.read',
  'dashboard.admin',
  'dashboard.pm',
  'dashboard.tl',
  'dashboard.accounts',
  'dashboard.hr',
] as const;
export type Action = (typeof ACTIONS)[number];

type Grants = Partial<Record<Action, Scope>>;

/** PRD access matrix, translated into action -> scope per role. */
export const ROLE_GRANTS: Record<Role, Grants> = {
  ADMIN: Object.fromEntries(ACTIONS.map((a) => [a, 'ALL'])) as Grants,
  PM: {
    'user.read': 'ALL',
    'team.read': 'ALL',
    // PMs may open any client; unmasked fields only on their own (fields.ts, PM_OWN vs PM_OTHER).
    'client.read': 'ALL',
    'client.manage': 'OWN_CLIENTS',
    'credential.read': 'OWN_CLIENTS',
    'credential.manage': 'OWN_CLIENTS',
    'credential.reveal': 'OWN_CLIENTS',
    'project.read': 'ALL',
    'project.manage': 'OWN_CLIENTS',
    // "Create and assign tasks: any team".
    'task.read': 'ALL',
    'task.create': 'ALL',
    'task.update': 'ALL',
    'pipeline.read': 'ALL',
    // "Leave records: view availability"; "Capacity view: all"; "Set priority and weekly plan: yes".
    'leave.read': 'ALL',
    'capacity.read': 'ALL',
    'planner.read': 'ALL',
    'planner.manage': 'ALL',
    // Inbox: every client's threads, unmasked only on their own clients (fields.ts).
    'inbox.read': 'ALL',
    'inbox.triage': 'ALL',
    'inbox.link': 'ALL',
    'inbox.send': 'ALL',
    'inbox.import': 'ALL',
    // "Billing requests: create" on their own clients; amounts are PM_OWN only (fields.ts).
    'billing.read': 'OWN_CLIENTS',
    'billing.create': 'OWN_CLIENTS',
    'billing.update': 'OWN_CLIENTS',
    'renewal.read': 'OWN_CLIENTS',
    // Dashboards (PRD 6.2): one per role, each built from that role's own scope.
    'dashboard.pm': 'OWN_CLIENTS',
  },
  TEAM_LEADER: {
    'user.read': 'ALL',
    'team.read': 'ALL',
    'client.read': 'OWN_TEAM',
    // Credentials only through a per-task grant from the PM.
    'credential.read': 'ASSIGNED',
    'credential.reveal': 'ASSIGNED',
    'project.read': 'OWN_TEAM',
    'task.read': 'OWN_TEAM',
    'task.create': 'OWN_TEAM',
    'task.update': 'OWN_TEAM',
    'pipeline.read': 'ALL',
    'leave.read': 'OWN_TEAM',
    'capacity.read': 'OWN_TEAM',
    'planner.read': 'OWN_TEAM',
    'planner.manage': 'OWN_TEAM',
    // "Linked projects, masked"; sends from shared mailboxes only (enforced in the send service).
    'inbox.read': 'OWN_TEAM',
    'inbox.triage': 'OWN_TEAM',
    'inbox.send': 'OWN_TEAM',
    'inbox.import': 'OWN_TEAM',
    'dashboard.tl': 'OWN_TEAM',
  },
  TEAM_MEMBER: {
    'user.read': 'ALL',
    'team.read': 'ALL',
    'client.read': 'ASSIGNED',
    'credential.read': 'ASSIGNED',
    'credential.reveal': 'ASSIGNED',
    'project.read': 'ASSIGNED',
    'task.read': 'ASSIGNED',
    // Subtasks of their own tasks only (enforced in the task service).
    'task.create': 'ASSIGNED',
    'task.update': 'ASSIGNED',
    'pipeline.read': 'ALL',
    // Own leave and own load only.
    'leave.read': 'ASSIGNED',
    'capacity.read': 'ASSIGNED',
    // "Linked tasks, masked"; sending only where the PM enabled it per project (PRD OQ10).
    'inbox.read': 'ASSIGNED',
    'inbox.send': 'ASSIGNED',
  },
  ACCOUNTS: {
    'user.read': 'ALL',
    'team.read': 'ALL',
    'client.read': 'BILLING',
    'project.read': 'BILLING',
    'pipeline.read': 'ALL',
    // Billing threads only, masked; replies from shared mailboxes.
    'inbox.read': 'BILLING',
    'inbox.send': 'BILLING',
    // "Billing requests: process"; renewal alerts for every retainer and AMC (PRD 4.3).
    'billing.read': 'BILLING',
    'billing.update': 'BILLING',
    'renewal.read': 'BILLING',
    'dashboard.accounts': 'BILLING',
  },
  HR: {
    'user.read': 'ALL',
    'team.read': 'ALL',
    // Records leave and holidays; sees capacity (hours only, no client data), never the planner.
    'leave.read': 'PEOPLE',
    'leave.manage': 'PEOPLE',
    'holiday.manage': 'PEOPLE',
    'capacity.read': 'PEOPLE',
    'dashboard.hr': 'PEOPLE',
  },
};

/** Scopes a user holds for an action: the union across their roles. Empty means denied. */
export function scopesFor(roles: readonly Role[], action: Action): Scope[] {
  const out = new Set<Scope>();
  for (const role of roles) {
    const scope = ROLE_GRANTS[role]?.[action];
    if (scope) out.add(scope);
  }
  return [...out];
}

export function permissionsFor(roles: readonly Role[]): Action[] {
  return ACTIONS.filter((a) => scopesFor(roles, a).length > 0);
}
