import type { MeView, TeamView, UserView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { api } from '@/lib/api';
import { NoAccess } from '../no-access';
import { TeamsAdmin } from './teams-admin';

export default async function TeamsPage() {
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('team.manage')) return <NoAccess title="Teams" />;
  const [teams, users] = await Promise.all([api<TeamView[]>('/teams'), api<UserView[]>('/users')]);
  const leaders = users.filter((u) => u.roles.includes('TEAM_LEADER'));

  return (
    <>
      <PageHeader title="Teams" description="One team per department to start. The leader gets the weekly planner and leave alerts for the team." />
      <TeamsAdmin teams={teams} leaders={leaders} />
    </>
  );
}
