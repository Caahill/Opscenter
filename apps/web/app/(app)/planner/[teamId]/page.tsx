import type { BoardView, PlannerView } from '@opshub/shared';
import { Chip, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { AutoRefresh } from '@/lib/auto-refresh';
import { formatWeek } from '@/lib/format';
import { AddTaskDialog, type PlannerProjectOption } from './add-task-dialog';
import { PlannerBoard } from './planner-board';

export default async function TeamPlannerPage({ params, searchParams }: { params: Promise<{ teamId: string }>; searchParams: Promise<{ week?: string }> }) {
  const [{ teamId }, { week }] = await Promise.all([params, searchParams]);
  const [me, planner] = await Promise.all([getMe(), api<PlannerView>(`/planner/${teamId}${week ? `?week=${encodeURIComponent(week)}` : ''}`)]);
  const canManage = me.permissions.includes('planner.manage');
  // Open projects of this team's department, for "Add task". Only for people who may create tasks.
  const canCreate = me.permissions.includes('task.create');
  const board = canCreate ? await api<BoardView>(`/boards/${planner.department}`).catch(() => null) : null;
  const projects: PlannerProjectOption[] = (board?.columns ?? [])
    .flatMap((c) => c.projects)
    .filter((p) => p.statusType !== 'DONE' && p.statusType !== 'STOPPED')
    .map((p) => ({ id: p.id, label: `${p.clientName ?? 'Client'} · ${p.packageName ?? p.stageName ?? 'Project'}` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const nav = (w: string, label: string) => (
    <Link href={`/planner/${teamId}?week=${w}`} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
      {label}
    </Link>
  );

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title={`${planner.teamName} weekly plan`}
        description={
          canManage
            ? 'Drag a task to another person or day, or use Move. Shaded days are leave or holidays; red means over the hours available.'
            : 'Hours against availability after leave and holidays.'
        }
        actions={
          <>
            {projects.length ? (
              <AddTaskDialog teamId={teamId} projects={projects} members={planner.members.map((m) => ({ userId: m.userId, name: m.name }))} days={planner.days} />
            ) : null}
            {nav(planner.prevWeek, 'Previous')}
            <Link href={`/planner/${teamId}`} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
              This week
            </Link>
            {nav(planner.nextWeek, 'Next')}
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tone="accent">{formatWeek(planner.week, planner.days)}</Chip>
        <Link href={`/capacity?week=${planner.week}`} className="text-[14px] text-link">
          Capacity for all teams
        </Link>
      </div>
      <PlannerBoard planner={planner} canManage={canManage} />
    </>
  );
}
