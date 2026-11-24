import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  HEALTH_LABELS,
  MARKETS,
  PRIORITY_LABELS,
  type BoardView,
  type Department,
  type MeView,
  type PackageView,
  type TaskView,
  type UserView,
} from '@opshub/shared';
import { Chip, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import { BoardColumns } from './board-columns';
import { BoardCalendar } from './board-calendar';
import { BoardList } from './board-list';

type Params = { department: string };
type Search = Record<string, string | undefined>;

const FILTERS = ['pmId', 'assigneeId', 'market', 'health', 'priority', 'packageId', 'includeClosed'] as const;

function monthRange(month: string | undefined) {
  const base = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [y, m] = base.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { month: base, from: `${base}-01`, to: `${base}-${String(last).padStart(2, '0')}` };
}

export default async function BoardPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const { department } = await params;
  if (!(DEPARTMENTS as readonly string[]).includes(department)) notFound();
  const dept = department as Department;
  const search = await searchParams;
  const view = search.view === 'list' || search.view === 'calendar' ? search.view : 'board';

  const filterQs = new URLSearchParams();
  for (const f of FILTERS) if (search[f]) filterQs.set(f, search[f]!);
  const { month, from, to } = monthRange(search.month);

  const [me, board, users, packages, calendarTasks] = await Promise.all([
    api<MeView>('/me'),
    api<BoardView>(`/boards/${dept}?${filterQs}`),
    api<UserView[]>('/users'),
    api<PackageView[]>(`/packages?department=${dept}`),
    view === 'calendar'
      ? api<TaskView[]>(`/tasks?department=${dept}&open=true&dueFrom=${from}&dueTo=${to}`).catch(() => [] as TaskView[])
      : Promise.resolve([] as TaskView[]),
  ]);
  const canMove = me.permissions.includes('project.manage');
  const pms = users.filter((u) => u.roles.includes('PM'));
  const link = (patch: Record<string, string | null>) => {
    const qs = new URLSearchParams(filterQs);
    qs.set('view', view);
    if (view === 'calendar') qs.set('month', month);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) qs.delete(k);
      else qs.set(k, v);
    }
    return `/boards/${dept}?${qs}`;
  };
  const projects = board.columns.flatMap((c) => c.projects);

  return (
    <>
      <PageHeader title={`${DEPARTMENT_LABELS[dept]} board`} description={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'} · stages version ${board.pipelineVersion}`} />

      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Departments">
        {DEPARTMENTS.map((d) => (
          <Link key={d} href={`/boards/${d}?view=${view}`} className="shrink-0">
            <Chip tone={d === dept ? 'accent' : 'neutral'}>{DEPARTMENT_LABELS[d]}</Chip>
          </Link>
        ))}
      </nav>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['board', 'list', 'calendar'] as const).map((v) => (
          <Link key={v} href={link({ view: v })}>
            <Chip tone={v === view ? 'accent' : 'muted'}>{v[0]!.toUpperCase() + v.slice(1)}</Chip>
          </Link>
        ))}
        <form className="ml-auto flex flex-wrap gap-2 text-[14px]" action={`/boards/${dept}`}>
          <input type="hidden" name="view" value={view} />
          <select name="pmId" defaultValue={search.pmId ?? ''} className="min-h-9 rounded-md border border-border bg-canvas px-2" aria-label="PM">
            <option value="">Any PM</option>
            {pms.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select name="assigneeId" defaultValue={search.assigneeId ?? ''} className="min-h-9 rounded-md border border-border bg-canvas px-2" aria-label="Assignee">
            <option value="">Any assignee</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <select name="market" defaultValue={search.market ?? ''} className="min-h-9 rounded-md border border-border bg-canvas px-2" aria-label="Market">
            <option value="">Any market</option>
            {MARKETS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <select name="health" defaultValue={search.health ?? ''} className="min-h-9 rounded-md border border-border bg-canvas px-2" aria-label="Health">
            <option value="">Any health</option>
            {Object.entries(HEALTH_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue={search.priority ?? ''} className="min-h-9 rounded-md border border-border bg-canvas px-2" aria-label="Priority">
            <option value="">Any priority</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select name="packageId" defaultValue={search.packageId ?? ''} className="min-h-9 rounded-md border border-border bg-canvas px-2" aria-label="Package">
            <option value="">Any package</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-muted">
            <input type="checkbox" name="includeClosed" value="true" defaultChecked={search.includeClosed === 'true'} /> Closed
          </label>
          <button type="submit" className="min-h-9 rounded-md border border-border bg-canvas px-3 hover:border-border-strong">
            Filter
          </button>
        </form>
      </div>

      {view === 'board' ? <BoardColumns board={board} canMove={canMove} /> : null}
      {view === 'list' ? <BoardList board={board} /> : null}
      {view === 'calendar' ? (
        <BoardCalendar
          month={month}
          projects={projects}
          tasks={calendarTasks}
          prevHref={link({ month: shiftMonth(month, -1) })}
          nextHref={link({ month: shiftMonth(month, 1) })}
        />
      ) : null}
    </>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}
