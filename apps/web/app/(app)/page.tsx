import type { AccountsDashboardView, AdminDashboardView, HrDashboardView, MeDashboardView, PmDashboardView, Role, TlDashboardView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { api, getMe } from '@/lib/api';
import { tipsFor } from '@/lib/guide';
import { LiveRefresh } from '@/lib/realtime';
import { GettingStarted } from './getting-started';
import { AccountsDashboard, AdminDashboard, HrDashboard, MeDashboard, PmDashboard, TlDashboard } from './dashboards';

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
  const firstName = me.name.split(' ')[0] ?? me.name;
  const greeting = () => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()));
    return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  };
  const hasWork = me.permissions.includes('task.read') && !kinds.has('admin');

  return (
    <>
      <PageHeader title={`${greeting()}, ${firstName}`} description="Here’s what needs your attention today." />
      <GettingStarted name={firstName} tips={tipsFor(me.roles, me.permissions)} />
      <LiveRefresh events={['inbox.message_new', 'notification.new']} />

      {admin ? <AdminDashboard d={admin} timezone={tz} /> : null}
      {pm ? <PmDashboard d={pm} timezone={tz} /> : null}
      {tl ? <TlDashboard d={tl} timezone={tz} /> : null}
      {hasWork || (!admin && !pm && !tl && !accounts && !hr) ? <MeDashboard d={mine} timezone={tz} /> : null}
      {accounts ? <AccountsDashboard d={accounts} timezone={tz} /> : null}
      {hr ? <HrDashboard d={hr} timezone={tz} /> : null}
    </>
  );
}
