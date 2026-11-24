'use client';
import { PRIORITY_LABELS, PRIORITIES, type ProjectDetailView, type UserView } from '@opshub/shared';
import { Button, Card, inputClass, Label } from '@opshub/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { CapacityWarning } from '@/lib/capacity-warning';
import { PriorityChip, StatusChip } from '@/lib/chips';
import { send, useAction } from '@/lib/client';
import { formatDate, isOverdue, plural } from '@/lib/format';

export function ProjectTasks({ project, users, canCreate }: { project: ProjectDetailView; users: UserView[]; canCreate: boolean }) {
  const { run, error, busy } = useAction();
  const [form, setForm] = useState({ title: '', assigneeId: '', dueDate: '', priority: 'NORMAL', estimateH: '' });
  const [showDone, setShowDone] = useState(false);
  const tasks = (project.tasks ?? []).filter((t) => showDone || (t.statusType !== 'DONE' && t.statusType !== 'STOPPED'));
  const doneCount = (project.tasks ?? []).length - (project.tasks ?? []).filter((t) => t.statusType !== 'DONE' && t.statusType !== 'STOPPED').length;

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      send('POST', '/tasks', {
        projectId: project.id,
        title: form.title,
        assigneeId: form.assigneeId || null,
        dueDate: form.dueDate || null,
        priority: form.priority,
        estimateH: form.estimateH ? Number(form.estimateH) : null,
      }),
    );
    if (ok) setForm({ title: '', assigneeId: '', dueDate: '', priority: 'NORMAL', estimateH: '' });
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <Label>Tasks</Label>
        {doneCount > 0 ? (
          <button type="button" className="text-[13px] text-link" onClick={() => setShowDone((v) => !v)}>
            {showDone ? 'Hide' : 'Show'} {doneCount} done
          </button>
        ) : null}
      </div>
      <ul className="mt-3 divide-y divide-surface-alt">
        {tasks.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
            <div className="min-w-0">
              <Link href={`/tasks/${t.id}`} className="font-semibold hover:text-link">
                {t.title}
              </Link>
              <p className="text-[13px] text-muted">
                {t.assigneeName ?? 'Unassigned'}
                {t.dueDate ? (
                  <span className={isOverdue(t.dueDate, t.statusType) ? 'font-medium text-error' : undefined}>
                    {` · due ${formatDate(t.dueDate)}`}
                    {isOverdue(t.dueDate, t.statusType) ? ' (overdue)' : ''}
                  </span>
                ) : (
                  ''
                )}
                {t.estimateH ? ` · ${t.estimateH} h` : ''}
                {t.cycleMonth ? ` · cycle ${t.cycleMonth}` : ''}
                {t.subtaskCount ? ` · ${plural(t.subtaskCount, 'subtask')}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <PriorityChip priority={t.priority} />
              <StatusChip status={t.statusType} />
              <span className="w-10 text-right font-mono text-[12px] text-muted">{t.progressPct}%</span>
            </div>
          </li>
        ))}
        {tasks.length === 0 ? <li className="py-3 text-muted">No open tasks.</li> : null}
      </ul>

      {canCreate ? (
        <form onSubmit={add} className="mt-4 grid gap-2 border-t border-surface-alt pt-4 md:grid-cols-[1fr_180px]">
          <input className={inputClass} placeholder="New task" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select className={inputClass} value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} aria-label="Assignee">
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <div className="md:col-span-2">
            <CapacityWarning assigneeId={form.assigneeId || null} day={form.dueDate || null} />
          </div>
          <div className="grid grid-cols-3 gap-2 md:col-span-2">
            <input className={inputClass} type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} aria-label="Due date" />
            <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} aria-label="Priority">
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
            <input className={inputClass} inputMode="decimal" placeholder="Estimate h" value={form.estimateH} onChange={(e) => setForm({ ...form, estimateH: e.target.value })} />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              Add task
            </Button>
            {error ? <p className="text-[14px] text-error">{error}</p> : null}
          </div>
        </form>
      ) : null}
    </Card>
  );
}
