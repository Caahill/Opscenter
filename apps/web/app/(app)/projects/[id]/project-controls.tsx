'use client';
import {
  DEPARTMENT_LABELS,
  HEALTH_LABELS,
  STOP_REASON_LABELS,
  STOP_REASONS,
  type ChecklistItemView,
  type Department,
  type PackageView,
  type ProjectDetailView,
  type TeamView,
} from '@opshub/shared';
import { Button, Card, inputClass, Label } from '@opshub/ui';
import { useState } from 'react';
import { send, SendError, useAction } from '@/lib/client';

/** Stage stepper: click a stage to move there. An incomplete checklist asks before overriding. */
export function StageStepper({ project, canManage }: { project: ProjectDetailView; canManage: boolean }) {
  const { run, error, setError } = useAction();
  const stages = project.stages ?? [];

  async function move(stageId: string, name: string) {
    await run(async () => {
      try {
        return await send('POST', `/projects/${project.id}/move-stage`, { stageId });
      } catch (e) {
        if (e instanceof SendError && e.code === 'CHECKLIST_INCOMPLETE') {
          if (window.confirm(`${e.message}\n\nMove to "${name}" anyway? The override is logged.`)) {
            return send('POST', `/projects/${project.id}/move-stage`, { stageId, override: true });
          }
          setError(null);
          return undefined;
        }
        throw e;
      }
    });
  }

  return (
    <div>
      <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Pipeline stages">
        {stages.map((s) => {
          const current = s.id === project.stageId;
          const past = s.order < (project.stageOrder ?? 0);
          const cls = current
            ? 'bg-primary text-on-primary'
            : past
              ? 'bg-pale-purple text-accent-pressed'
              : 'bg-canvas text-muted border border-border';
          return (
            <li key={s.id} className="shrink-0">
              <button
                type="button"
                disabled={!canManage || current}
                onClick={() => move(s.id, s.name)}
                aria-current={current ? 'step' : undefined}
                className={`min-h-10 rounded-full px-3 text-[13px] ${cls} ${canManage && !current ? 'hover:border-accent' : ''}`}
                title={s.phase === 'CYCLE' ? 'Monthly cycle stage' : undefined}
              >
                {s.name}
              </button>
            </li>
          );
        })}
      </ol>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </div>
  );
}

export function StageChecklist({ projectId, items, canEdit }: { projectId: string; items: ChecklistItemView[]; canEdit: boolean }) {
  const { run } = useAction();
  if (items.length === 0) return <p className="mt-2 text-[14px] text-muted">No checklist for this stage.</p>;
  return (
    <ul className="mt-2 space-y-1">
      {items.map((i) => (
        <li key={i.id}>
          <label className="flex min-h-9 items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={Boolean(i.done)}
              disabled={!canEdit}
              onChange={(e) => run(() => send('PATCH', `/projects/${projectId}/checklist/${i.id}`, { done: e.target.checked }))}
            />
            {i.text}
          </label>
        </li>
      ))}
    </ul>
  );
}

export function StatusControls({ project, packages, teams }: { project: ProjectDetailView; packages: PackageView[]; teams: TeamView[] }) {
  const { run, error, busy } = useAction();
  const [holdReason, setHoldReason] = useState('');
  const [stopReason, setStopReason] = useState('');
  const [stopNote, setStopNote] = useState('');
  const patch = (body: Record<string, unknown>) => run(() => send('PATCH', `/projects/${project.id}`, body));
  const deptTeams = teams.filter((t) => t.department === project.department);
  const deptPackages = packages.filter((p) => p.department === project.department);

  return (
    <Card>
      <Label>Status</Label>
      <div className="mt-3 flex flex-wrap gap-2">
        {project.statusType !== 'WAITING_ON_CLIENT' ? (
          <Button variant="tertiary" disabled={busy} onClick={() => patch({ statusType: 'WAITING_ON_CLIENT' })}>
            Waiting on client
          </Button>
        ) : null}
        {project.statusType === 'WAITING_ON_CLIENT' || project.statusType === 'ON_HOLD' ? (
          <Button variant="tertiary" disabled={busy} onClick={() => patch({ statusType: 'ACTIVE' })}>
            Resume
          </Button>
        ) : null}
      </div>
      {project.statusType !== 'ON_HOLD' ? (
        <div className="mt-3 flex gap-2">
          <input className={inputClass} placeholder="Hold reason" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
          <Button variant="tertiary" disabled={busy || !holdReason} onClick={() => patch({ statusType: 'ON_HOLD', holdReason })}>
            Hold
          </Button>
        </div>
      ) : null}

      <label className="mt-3 flex items-center gap-2 text-[14px]">
        <input type="checkbox" checked={Boolean(project.memberSendEnabled)} disabled={busy} onChange={(e) => patch({ memberSendEnabled: e.target.checked })} />
        Team Members may email this client from a shared mailbox
      </label>

      <label className="mt-3 block text-[13px] text-muted">
        Health
        <select className={inputClass} value={project.health} onChange={(e) => patch({ health: e.target.value })}>
          {Object.entries(HEALTH_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[13px] text-muted">
        Team
        <select className={inputClass} value={project.teamId ?? ''} onChange={(e) => patch({ teamId: e.target.value || null })}>
          <option value="">No team</option>
          {deptTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[13px] text-muted">
        Package (applies to future monthly cycles)
        <select className={inputClass} value={project.packageId ?? ''} onChange={(e) => patch({ packageId: e.target.value || null })}>
          <option value="">No package</option>
          {deptPackages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <details className="mt-4">
        <summary className="cursor-pointer text-[14px] text-error">Stop this project</summary>
        <div className="mt-2 grid gap-2">
          <select className={inputClass} value={stopReason} onChange={(e) => setStopReason(e.target.value)} aria-label="Stop reason">
            <option value="">Reason (required)</option>
            {STOP_REASONS.map((r) => (
              <option key={r} value={r}>
                {STOP_REASON_LABELS[r]}
              </option>
            ))}
          </select>
          <input className={inputClass} placeholder="Note (optional)" value={stopNote} onChange={(e) => setStopNote(e.target.value)} />
          <Button
            variant="danger"
            disabled={busy || !stopReason}
            onClick={() => {
              if (window.confirm('Stopped is final for this project. Continue?')) {
                void run(() => send('POST', `/projects/${project.id}/stop`, { reason: stopReason, note: stopNote || null }));
              }
            }}
          >
            Stop project
          </Button>
        </div>
      </details>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}

export function HandoffForm({ projectId, targets, packages }: { projectId: string; targets: string[]; packages: PackageView[] }) {
  const { run, error, busy } = useAction();
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const selected = Object.keys(chosen);

  return (
    <Card>
      <Label>Hand off</Label>
      <p className="mt-1 text-[13px] text-muted">Creates the new project{targets.length > 1 ? 's' : ''}, carries files over and closes this one.</p>
      <ul className="mt-3 space-y-2">
        {targets.map((d) => (
          <li key={d} className="text-[14px]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={d in chosen}
                onChange={(e) =>
                  setChosen((c) => {
                    const next = { ...c };
                    if (e.target.checked) next[d] = '';
                    else delete next[d];
                    return next;
                  })
                }
              />
              {DEPARTMENT_LABELS[d as Department]}
            </label>
            {d in chosen ? (
              <select className={`${inputClass} mt-1`} value={chosen[d]} onChange={(e) => setChosen({ ...chosen, [d]: e.target.value })} aria-label={`${d} package`}>
                <option value="">No package</option>
                {packages
                  .filter((p) => p.department === d)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            ) : null}
          </li>
        ))}
      </ul>
      <Button
        className="mt-3"
        disabled={busy || selected.length === 0}
        onClick={() =>
          run(() =>
            send('POST', `/projects/${projectId}/handoff`, {
              targets: selected.map((department) => ({ department, packageId: chosen[department] || null })),
            }),
          )
        }
      >
        Hand off to {selected.length || ''} {selected.length === 1 ? 'department' : 'departments'}
      </Button>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}
