import type { Role } from '@opshub/shared';

/** One thing to try, with the page it happens on. Shown on Home (first steps) and on Help. */
export interface Tip {
  text: string;
  href: string;
  /** Hidden when /me lacks this permission. */
  needs?: string;
}

export interface RoleGuide {
  /** What this role uses Ops Hub for, in one line. */
  summary: string;
  tips: Tip[];
}

export const EVERYONE: Tip[] = [
  { text: 'Start the day in My tasks: update status and progress as you go, so nobody has to chase you', href: '/my-tasks', needs: 'task.read' },
  { text: 'Use Chat instead of WhatsApp groups. Type @ to mention someone and # to link a task, project or client', href: '/chat' },
  { text: 'The bell (Alerts) shows mentions, new tasks and client messages. Choose what also reaches you by email', href: '/settings/notifications' },
];

export const ROLE_GUIDES: Record<Role, RoleGuide> = {
  ADMIN: {
    summary: 'Set up people, teams and the way work flows; check who saw sensitive data.',
    tips: [
      { text: 'Invite each person in Users, with the right role and team', href: '/admin/users', needs: 'user.manage' },
      { text: 'Give every team a leader in Teams, so leave and planning alerts reach someone', href: '/admin/teams', needs: 'team.manage' },
      { text: 'Check the stages in Pipelines and the setup tasks in Packages match how each department works', href: '/admin/pipelines', needs: 'pipeline.manage' },
      { text: 'Review the Audit log: every password reveal and view of hidden client details is listed', href: '/admin/audit', needs: 'audit.read' },
    ],
  },
  PM: {
    summary: 'Run your clients: start projects, answer client messages and raise billing.',
    tips: [
      { text: 'Open a client and use “Start a project” to create the project with all its tasks from a package', href: '/clients', needs: 'client.read' },
      { text: 'Check the Inbox for client emails and WhatsApp waiting on a reply, and link each one to its project', href: '/inbox', needs: 'inbox.read' },
      { text: 'Flag extra work on a project and raise a billing request, so Accounts can invoice it', href: '/billing', needs: 'renewal.read' },
      { text: 'Look at Capacity before assigning: anyone over 100% is shown in red', href: '/capacity', needs: 'capacity.read' },
    ],
  },
  TEAM_LEADER: {
    summary: 'Plan your team’s week and keep its work moving.',
    tips: [
      { text: 'Plan the week in Planner: drag tasks between people and days against their available hours', href: '/planner', needs: 'planner.read' },
      { text: 'Check Capacity for anyone overloaded or on leave this week', href: '/capacity', needs: 'capacity.read' },
      { text: 'When someone goes on leave, open it in Leave to reassign the tasks it affects', href: '/leave', needs: 'leave.read' },
      { text: 'Your team’s board shows every project by stage', href: '/boards', needs: 'project.read' },
    ],
  },
  TEAM_MEMBER: {
    summary: 'See your own tasks, update them, and talk to your team.',
    tips: [
      { text: 'Open a task to tick off its checklist, add comments and upload files', href: '/my-tasks', needs: 'task.read' },
      { text: 'Client details you don’t need are hidden. Ask your PM if a task needs a login', href: '/my-tasks', needs: 'task.read' },
      { text: 'See your own leave and upcoming holidays in Leave', href: '/leave', needs: 'leave.read' },
    ],
  },
  ACCOUNTS: {
    summary: 'Invoice billing requests and keep renewals on time.',
    tips: [
      { text: 'Open Billing: each request shows the amount and what was done. Mark it invoiced, then paid', href: '/billing', needs: 'renewal.read' },
      { text: 'Renewals due in the next 30 days are listed in Billing, so retainers and AMCs don’t lapse', href: '/billing', needs: 'renewal.read' },
      { text: 'Message the PM on a billing request if something needs checking, such as the GST rate', href: '/billing', needs: 'renewal.read' },
    ],
  },
  HR: {
    summary: 'Record leave and holidays so everyone’s capacity stays accurate.',
    tips: [
      { text: 'Record leave in Leave: the planner and capacity update, and the Team Leader is alerted', href: '/leave', needs: 'leave.read' },
      { text: 'Keep the office holidays list up to date for the year (Leave → Office holidays)', href: '/leave', needs: 'leave.read' },
      { text: 'Capacity shows hours only, never client details', href: '/capacity', needs: 'capacity.read' },
    ],
  },
};

/** First steps for someone with these roles and permissions: role tips first, then the everyday ones. */
export function tipsFor(roles: Role[], permissions: string[]): Tip[] {
  const seen = new Set<string>();
  const out: Tip[] = [];
  for (const tip of [...roles.flatMap((r) => ROLE_GUIDES[r]?.tips ?? []), ...EVERYONE]) {
    if (seen.has(tip.text) || (tip.needs && !permissions.includes(tip.needs))) continue;
    seen.add(tip.text);
    out.push(tip);
  }
  return out;
}
