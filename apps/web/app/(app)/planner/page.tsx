import { DEPARTMENT_LABELS, type TeamView } from '@opshub/shared';
import { Card, EmptyState, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api, getMe } from '@/lib/api';

/** A Team Leader goes straight to their team; PMs and Admin pick one. */
export default async function PlannerIndex() {
  const [me, teams] = await Promise.all([getMe(), api<TeamView[]>('/teams')]);
  if (!me.permissions.includes('planner.read')) redirect('/no-access');
  const own = teams.filter((t) => t.leaderId === me.id || t.id === me.teamId);
  const seesAll = me.roles.includes('ADMIN') || me.roles.includes('PM');
  if (!seesAll && own.length === 1) redirect(`/planner/${own[0]!.id}`);
  const list = (seesAll ? teams : own).filter((t) => t.memberCount > 0 || t.leaderId);

  return (
    <>
      <PageHeader title="Weekly planner" description="Pick a team to plan its week: hours against availability after leave, drag tasks between people and days." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((t) => (
          <Link key={t.id} href={`/planner/${t.id}`}>
            <Card className="hover:border-border-strong">
              <p className="font-semibold">{t.name}</p>
              <p className="mt-1 font-mono text-[12px] text-muted">
                {DEPARTMENT_LABELS[t.department]} · {t.memberCount} {t.memberCount === 1 ? 'member' : 'members'}
              </p>
            </Card>
          </Link>
        ))}
        {list.length === 0 ? <EmptyState title="No teams to plan yet" hint="An Admin can add people to teams in Admin → Teams." /> : null}
      </div>
    </>
  );
}
