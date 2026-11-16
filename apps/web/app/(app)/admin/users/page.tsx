import type { MeView, TeamView, UserView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { api, apiIfAllowed } from '@/lib/api';
import { NoAccess } from '../no-access';
import { UsersAdmin } from './users-admin';

export default async function UsersPage() {
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('user.manage')) return <NoAccess title="Users" />;
  const [users, teams] = await Promise.all([
    apiIfAllowed<UserView[]>('/users?includeInactive=true'),
    api<TeamView[]>('/teams'),
  ]);
  if (!users) return <NoAccess title="Users" />;

  return (
    <>
      <PageHeader
        title="Users"
        description="Invite staff, set roles and teams, and deactivate leavers. Deactivating signs the person out, moves their open tasks to the Team Leader and revokes credential access."
      />
      <UsersAdmin users={users} teams={teams} meId={me.id} />
    </>
  );
}
