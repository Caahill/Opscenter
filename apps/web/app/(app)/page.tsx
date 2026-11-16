import type { AccountsDashboardView, AdminDashboardView, HrDashboardView, MeDashboardView, PmDashboardView, Role, TlDashboardView } from '@opshub/shared';
import { Card, Label, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { LiveRefresh } from '@/lib/realtime';
import { AccountsDashboard, AdminDashboard, HrDashboard, MeDashboard, PmDashboard, TlDashboard } from './dashboards';

// Phase 1F checks; earlier lists are in docs/06_Build_Plan.md.
const CHECKS: Array<{ text: string; href: string; needs?: string }> = [
  { text: 'Open Chat: your team channel and a channel per project you work on', href: '/chat' },
  { text: 'In a project channel type @ for a person or # for a task; a colleague without access sees "no access"', href: '/chat' },
  { text: 'Paste a phone number or email into chat and send: it is hidden for everyone', href: '/chat' },
  { text: 'Open the same chat as two people in two browsers: messages and the badge arrive live', href: '/chat' },
  { text: 'Simulate a client reply in the inbox: the PM gets an alert and the inbox updates without reloading', href: '/inbox', needs: 'inbox.read' },
  { text: 'Assign a task to someone: they get an alert straight away', href: '/my-tasks', needs: 'task.create' },
  { text: 'Notification settings: choose email and push per alert, turn on push, send a test', href: '/settings/notifications' },
  { text: 'Send the digest now from Notification settings (dev outbox), or run `pnpm jobs:run digest.email`', href: '/settings/notifications' },
];

/** Which dashboards each role sees on Home (PRD 6.2). Everyone with tasks also sees their own work. */
const BY_ROLE: Partial<Record<Role, 'admin' | 'pm' | 'tl' | 'accounts' | 'hr'>> = { ADMIN: 'admin', PM: 'pm', TEAM_LEADER: 'tl', ACCOUNTS: 'accounts', HR: 'hr' };

export default async function HomePage() {
  const me = await getMe();
  const kinds = new Set(me.roles.map((r) => BY_ROLE[r]).filter(Boolean));
  const [mine, admin, pm, tl, accounts, hr] = await Promise.all([
    api<MeDashboardView>('/dashboards/me'),
    kinds.has('admin') ? api<AdminDashboardView>('/dashboards/admin') : null,
    kinds.has('pm') ? api<PmDashboardView>('/dashboards/pm') : null,
    kinds.has('tl') ? api<TlDashboardView>('/dashboards/tl') : null,
    kinds.has('accounts') ? api<AccountsDashboardView>('/dashboards/accounts') : null,
    kinds.has('hr') ? api<HrDashboardView>('/dashboards/hr') : null,
  ]);
  const tz = me.timezone;
  const hasWork = me.permissions.includes('task.read') && !kinds.has('admin');

  return (
    <>
      <PageHeader title={`Welcome, ${me.name.split(' ')[0]}`} description="Your dashboards, built from what you can see." />
      <LiveRefresh events={['inbox.message_new', 'notification.new']} />

      {admin ? <AdminDashboard d={admin} timezone={tz} /> : null}
      {pm ? <PmDashboard d={pm} timezone={tz} /> : null}
      {tl ? <TlDashboard d={tl} timezone={tz} /> : null}
      {hasWork || (!admin && !pm && !tl && !accounts && !hr) ? <MeDashboard d={mine} timezone={tz} /> : null}
      {accounts ? <AccountsDashboard d={accounts} timezone={tz} /> : null}
      {hr ? <HrDashboard d={hr} timezone={tz} /> : null}

      <Card className="mt-8">
        <Label>Check this phase</Label>
        <ol className="mt-3 space-y-2 text-[15px]">
          {CHECKS.filter((c) => !c.needs || me.permissions.includes(c.needs)).map((c, i) => (
            <li key={c.text} className="flex gap-3">
              <span className="font-mono text-[13px] text-muted">{String(i + 1).padStart(2, '0')}</span>
              <Link href={c.href} className="hover:text-link">
                {c.text}
              </Link>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
