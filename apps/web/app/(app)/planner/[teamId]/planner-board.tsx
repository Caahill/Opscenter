'use client';
// TL weekly planner (PRD 1.6): members down the side, days across, tasks in the cells. Drag a card
// to another person or day, or use Move (keyboard friendly). The API logs each move and warns,
// without blocking, when work lands on someone over capacity or on leave.
import {
  PRIORITIES,
  PRIORITY_LABELS,
  taskDay,
  type CapacityWarningView,
  type MemberCapacityView,
  type PlannerMovesView,
  type PlannerView,
  type Priority,
  type TaskView,
} from '@opshub/shared';
import { Button, Chip, inputClass } from '@opshub/ui';
import Link from 'next/link';
import { useState } from 'react';
import { PriorityChip, StatusChip } from '@/lib/chips';
import { send, useAction } from '@/lib/client';
import { formatDay, hours } from '@/lib/format';

const UNASSIGNED = 'unassigned';
type Move = { taskId: string; assigneeId?: string | null; plannedDate?: string | null; priority?: Priority };

function describe(w: CapacityWarningView): string {
  if (w.reason === 'ON_LEAVE') return `${w.name} is on leave on ${formatDay(w.date!)}.`;
  return `${w.name} is over capacity in week ${Number(w.week.slice(6))}${w.utilisationPct === null ? ' (no hours left)' : ` (${w.utilisationPct}%)`}.`;
}

function Utilisation({ m }: { m: MemberCapacityView }) {
  const pct = m.utilisationPct ?? (m.assignedH > 0 ? 100 : 0);
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt" aria-hidden>
        <div className={`h-full ${m.over ? 'bg-error' : 'bg-accent'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <p className={`mt-1 font-mono text-[12px] ${m.over ? 'font-semibold text-error' : 'text-muted'}`}>
        {hours(m.assignedH)} of {hours(m.availableH)}
        {m.utilisationPct !== null ? ` · ${m.utilisationPct}%` : m.assignedH > 0 ? ' · no hours left' : ''}
      </p>
    </div>
  );
}

function TaskCard({
  t,
  planner,
  canManage,
  duringLeave,
  onMove,
  busy,
}: {
  t: TaskView;
  planner: PlannerView;
  canManage: boolean;
  duringLeave: boolean;
  onMove: (m: Move) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    assigneeId: t.assigneeId ?? UNASSIGNED,
    day: taskDay({ plannedDate: t.plannedDate ?? null, dueDate: t.dueDate ?? null }) ?? '',
    priority: t.priority ?? 'NORMAL',
  });
  return (
    <div
      draggable={canManage}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
      data-testid="planner-card"
      className={`rounded-md border bg-canvas p-2 text-[13px] shadow-card ${duringLeave ? 'border-error' : 'border-border'} ${canManage ? 'cursor-grab' : ''}`}
    >
      <Link href={`/tasks/${t.id}`} className="line-clamp-2 font-semibold leading-tight hover:text-link">
        {t.title}
      </Link>
      <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
        {t.clientName} · {t.estimateH ? hours(t.estimateH) : 'no estimate'}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <PriorityChip priority={t.priority} />
        {t.statusType === 'WAITING_ON_CLIENT' || t.statusType === 'ON_HOLD' ? <StatusChip status={t.statusType} /> : null}
        {duringLeave ? <span className="font-mono text-[11px] font-semibold text-error">During leave</span> : null}
        {canManage ? (
          <button type="button" className="ml-auto font-mono text-[11px] text-link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            Move
          </button>
        ) : null}
      </div>
      {open ? (
        <form
          className="mt-2 grid gap-1"
          aria-label={`Move ${t.title}`}
          onSubmit={(e) => {
            e.preventDefault();
            onMove({
              taskId: t.id,
              assigneeId: form.assigneeId === UNASSIGNED ? null : form.assigneeId,
              plannedDate: form.day || null,
              priority: form.priority,
            });
            setOpen(false);
          }}
        >
          <select aria-label="Person" className={`${inputClass} py-1 text-[13px]`} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
            <option value={UNASSIGNED}>Unassigned</option>
            {planner.members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name} ({hours(Math.max(0, m.availableH - m.assignedH))} free)
              </option>
            ))}
          </select>
          <select aria-label="Day" className={`${inputClass} py-1 text-[13px]`} value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })}>
            <option value="">No day</option>
            {planner.days.map((d) => (
              <option key={d} value={d}>
                {formatDay(d)}
              </option>
            ))}
          </select>
          <select aria-label="Priority" className={`${inputClass} py-1 text-[13px]`} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <Button type="submit" variant="tertiary" disabled={busy}>
            Save
          </Button>
        </form>
      ) : null}
    </div>
  );
}

export function PlannerBoard({ planner, canManage }: { planner: PlannerView; canManage: boolean }) {
  const { run, error, busy } = useAction();
  const [warnings, setWarnings] = useState<CapacityWarningView[]>([]);
  const [over, setOver] = useState<string | null>(null);

  const dayOf = (t: TaskView) => taskDay({ plannedDate: t.plannedDate ?? null, dueDate: t.dueDate ?? null });
  const inCell = (userId: string | null, day: string) => planner.tasks.filter((t) => (t.assigneeId ?? null) === userId && dayOf(t) === day);
  const unassigned = planner.tasks.filter((t) => !t.assigneeId);
  const rows: Array<{ key: string; userId: string | null; member?: MemberCapacityView }> = [
    ...planner.members.map((m) => ({ key: m.userId, userId: m.userId, member: m })),
    ...(canManage || unassigned.length ? [{ key: UNASSIGNED, userId: null }] : []),
  ];

  async function move(m: Move) {
    const res = await run(() => send<PlannerMovesView>('POST', `/planner/${planner.teamId}/moves`, { week: planner.week, moves: [m] }));
    if (res) setWarnings(res.warnings);
  }

  function drop(taskId: string, userId: string | null, day: string) {
    const t = [...planner.tasks, ...planner.backlog].find((x) => x.id === taskId);
    if (!t || ((t.assigneeId ?? null) === userId && dayOf(t) === day)) return;
    void move({ taskId, assigneeId: userId, plannedDate: day });
  }

  return (
    <>
      {error ? <p className="mb-3 text-[14px] text-error">{error}</p> : null}
      {warnings.length ? (
        <div role="status" className="mb-3 rounded-md bg-pale-orange px-3 py-2 text-[14px] text-[#8a3a12]">
          Moved. {warnings.map(describe).join(' ')}
        </div>
      ) : null}

      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1060px] grid-cols-[190px_repeat(7,minmax(120px,1fr))] gap-px overflow-hidden rounded-xl border border-border bg-border">
          <div className="bg-surface px-3 py-2 font-mono text-[12px] uppercase text-muted">Person</div>
          {planner.days.map((d, i) => (
            <div key={d} className="bg-surface px-2 py-2 text-[13px] font-semibold">
              {formatDay(d)}
              {planner.members[0]?.days[i]?.working === false ? <span className="ml-1 font-mono text-[11px] font-normal text-muted">off</span> : null}
            </div>
          ))}

          {rows.map((r) => (
            <div key={r.key} className="contents" data-testid="planner-row" data-person={r.member?.name ?? 'Unassigned'}>
              <div className="bg-canvas px-3 py-2">
                <p className="font-semibold leading-tight">{r.member?.name ?? 'Unassigned'}</p>
                {r.member ? (
                  <>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.member.leaveDays ? <Chip tone="warning" className="px-2 py-0 text-[11px]">Leave {r.member.leaveDays}d</Chip> : null}
                      {r.member.holidayDays ? <Chip tone="muted" className="px-2 py-0 text-[11px]">Holiday {r.member.holidayDays}d</Chip> : null}
                      {r.member.unestimatedCount ? <Chip tone="muted" className="px-2 py-0 text-[11px]">{r.member.unestimatedCount} unestimated</Chip> : null}
                    </div>
                    <Utilisation m={r.member} />
                  </>
                ) : (
                  <p className="mt-1 text-[12px] text-muted">Team tasks with no one on them</p>
                )}
              </div>
              {planner.days.map((d, i) => {
                const cell = r.member?.days[i];
                const key = `${r.key}|${d}`;
                const shade = cell?.holiday ? 'bg-pale-blue' : cell?.leave ? 'bg-pale-orange' : cell && !cell.working ? 'bg-surface' : 'bg-canvas';
                return (
                  <div
                    key={key}
                    data-testid="planner-cell"
                    data-day={d}
                    onDragOver={(e) => {
                      if (!canManage) return;
                      e.preventDefault();
                      setOver(key);
                    }}
                    onDragLeave={() => setOver((o) => (o === key ? null : o))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOver(null);
                      drop(e.dataTransfer.getData('text/plain'), r.userId, d);
                    }}
                    className={`flex min-h-24 flex-col gap-1 p-1.5 ${over === key ? 'bg-pale-purple outline outline-2 outline-accent' : shade}`}
                  >
                    {cell?.holiday ? <p className="font-mono text-[11px] text-muted">{cell.holiday}</p> : null}
                    {cell?.leave ? <p className="font-mono text-[11px] font-semibold text-[#8a3a12]">{cell.leave === 'FULL' ? 'On leave' : 'Half day'}</p> : null}
                    {inCell(r.userId, d).map((t) => (
                      <TaskCard key={t.id} t={t} planner={planner} canManage={canManage} duringLeave={cell?.leave === 'FULL'} onMove={move} busy={busy} />
                    ))}
                    {cell && (cell.working || cell.assignedH > 0) ? (
                      <p className={`mt-auto text-right font-mono text-[11px] ${cell.assignedH > cell.availableH ? 'font-semibold text-error' : 'text-muted'}`}>
                        {hours(cell.assignedH)} / {hours(cell.availableH)}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <section className="mt-6" aria-label="Backlog">
        <h2 className="mb-2 text-[15px] font-semibold">
          Backlog <span className="font-mono text-[12px] font-normal text-muted">no day yet, or overdue from earlier weeks · {planner.backlog.length}</span>
        </h2>
        {planner.backlog.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {planner.backlog.map((t) => (
              <TaskCard key={t.id} t={t} planner={planner} canManage={canManage} duringLeave={false} onMove={move} busy={busy} />
            ))}
          </div>
        ) : (
          <p className="text-[14px] text-muted">Nothing waiting.</p>
        )}
      </section>
    </>
  );
}
