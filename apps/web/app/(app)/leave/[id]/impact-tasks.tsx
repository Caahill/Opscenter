'use client';
import { taskDay, type LeaveCandidateView, type TaskView } from '@opshub/shared';
import { Button, Card, inputClass, Label } from '@opshub/ui';
import Link from 'next/link';
import { useState } from 'react';
import { PriorityChip } from '@/lib/chips';
import { send, useAction } from '@/lib/client';
import { formatDay, hours } from '@/lib/format';

function Row({ t, candidates, suggested, canReassign }: { t: TaskView; candidates: LeaveCandidateView[]; suggested?: string; canReassign: boolean }) {
  const { run, error, busy } = useAction();
  const [to, setTo] = useState(suggested ?? '');
  const day = taskDay({ plannedDate: t.plannedDate ?? null, dueDate: t.dueDate ?? null });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3" data-testid="impact-task">
      <div className="min-w-0">
        <Link href={`/tasks/${t.id}`} className="font-semibold hover:text-link">
          {t.title}
        </Link>
        <p className="font-mono text-[12px] text-muted">
          {t.clientName}
          {day ? ` · ${t.plannedDate ? 'planned' : 'due'} ${formatDay(day)}` : ''} · {t.estimateH ? hours(t.estimateH) : 'no estimate'}
        </p>
        <PriorityChip priority={t.priority} />
      </div>
      {canReassign ? (
        <div className="flex items-center gap-2">
          <select aria-label={`Reassign ${t.title} to`} className={`${inputClass} w-56`} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose someone</option>
            {candidates.map((c) => (
              <option key={c.userId} value={c.userId}>
                {c.name} · {c.onLeave ? 'also away' : `${hours(c.freeH)} free`}
              </option>
            ))}
          </select>
          <Button type="button" variant="tertiary" disabled={busy || !to} onClick={() => run(() => send('PATCH', `/tasks/${t.id}`, { assigneeId: to }))}>
            Reassign
          </Button>
        </div>
      ) : null}
      {error ? <p className="w-full text-[13px] text-error">{error}</p> : null}
    </li>
  );
}

export function ImpactTasks({
  tasks,
  candidates,
  suggestions,
  canReassign,
}: {
  tasks: TaskView[];
  candidates: LeaveCandidateView[];
  suggestions: Record<string, string>;
  canReassign: boolean;
}) {
  return (
    <Card>
      <Label>Tasks due during the leave</Label>
      {canReassign && tasks.length ? <p className="mt-1 text-[14px] text-muted">The suggestion is the teammate with the most free hours who is not away that day.</p> : null}
      {tasks.length === 0 ? (
        <p className="mt-3 text-muted">Nothing to reassign.</p>
      ) : (
        <ul className="mt-2 divide-y divide-surface-alt">
          {tasks.map((t) => (
            <Row key={t.id} t={t} candidates={candidates} suggested={suggestions[t.id]} canReassign={canReassign} />
          ))}
        </ul>
      )}
    </Card>
  );
}
