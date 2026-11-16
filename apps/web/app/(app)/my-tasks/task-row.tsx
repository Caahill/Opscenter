'use client';
import { DEPARTMENT_LABELS, STATUS_LABELS, STATUS_TYPES, type StatusType, type TaskView } from '@opshub/shared';
import Link from 'next/link';
import { PriorityChip } from '@/lib/chips';
import { send, useAction } from '@/lib/client';
import { formatDate } from '@/lib/format';

const STEPS = [0, 25, 50, 75, 100];

export function TaskRow({ task, timezone }: { task: TaskView; timezone: string }) {
  const { run, error, busy } = useAction();
  const update = (body: Record<string, unknown>) => run(() => send('PATCH', `/tasks/${task.id}`, body));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = task.dueDate !== null && task.dueDate !== undefined && task.dueDate.slice(0, 10) < today;

  return (
    <li className="px-4 py-3" data-testid="my-task">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/tasks/${task.id}`} className="font-semibold hover:text-link">
            {task.title}
          </Link>
          <p className="font-mono text-[12px] text-muted">
            {task.clientName} · {task.department ? DEPARTMENT_LABELS[task.department] : ''}
            {task.dueDate ? (
              <span className={overdue ? 'text-error' : undefined}>
                {' '}
                · due {formatDate(task.dueDate, timezone)}
                {overdue ? ' (overdue)' : ''}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PriorityChip priority={task.priority} />
          <label className="sr-only" htmlFor={`status-${task.id}`}>
            Status
          </label>
          <select
            id={`status-${task.id}`}
            aria-label="Status"
            className="min-h-9 rounded-md border border-border bg-canvas px-2 text-[14px]"
            value={task.statusType}
            disabled={busy}
            onChange={(e) => update({ statusType: e.target.value as StatusType })}
          >
            {STATUS_TYPES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="Progress">
            {STEPS.map((p) => (
              <button
                key={p}
                type="button"
                disabled={busy}
                aria-pressed={task.progressPct === p}
                onClick={() => update({ progressPct: p })}
                className={`min-h-9 px-2 font-mono text-[12px] ${task.progressPct === p ? 'bg-primary text-on-primary' : 'bg-canvas text-muted hover:text-body'}`}
              >
                {p}%
              </button>
            ))}
          </div>
          {task.statusType !== 'DONE' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => update({ statusType: 'DONE' })}
              className="min-h-9 rounded-md border border-border px-3 text-[14px] hover:border-success hover:text-success"
            >
              Done
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </li>
  );
}
