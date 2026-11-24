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
import { Button, buttonVariants, Card, Checkbox, Collapsible, CollapsibleContent, CollapsibleTrigger, ConfirmButton, Input, Label, NativeSelect, useConfirm } from '@opshub/ui';
import { useState } from 'react';
import { send, SendError, useAction } from '@/lib/client';

/** Stage stepper: click a stage to move there. An incomplete checklist asks before overriding. */
export function StageStepper({ project, canManage }: { project: ProjectDetailView; canManage: boolean }) {
  const { run, error, setError } = useAction();
  const [confirm, confirmDialog] = useConfirm();
  const stages = project.stages ?? [];

  async function move(stageId: string, name: string) {
    await run(async () => {
      try {
        return await send('POST', `/projects/${project.id}/move-stage`, { stageId });
      } catch (e) {
        if (e instanceof SendError && e.code === 'CHECKLIST_INCOMPLETE') {
          if (await confirm({ title: `Move to "${name}" anyway?`, description: `${e.message}\n\nThe override is logged.`, confirmLabel: 'Move anyway' })) {
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
              <Button
                type="button"
                variant={current ? 'default' : 'outline'}
                size="sm"
                disabled={!canManage || current}
                onClick={() => move(s.id, s.name)}
                aria-current={current ? 'step' : undefined}
                className={`rounded-full disabled:opacity-100 ${current ? '' : cls}`}
                title={s.phase === 'CYCLE' ? 'Monthly cycle stage' : undefined}
              >
                {s.name}
              </Button>
            </li>
          );
        })}
      </ol>
      {confirmDialog}
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
            <Checkbox
              checked={Boolean(i.done)}
              disabled={!canEdit}
              onCheckedChange={(v) => run(() => send('PATCH', `/projects/${projectId}/checklist/${i.id}`, { done: v === true }))}
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
          <Input placeholder="Hold reason" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} />
          <Button variant="tertiary" disabled={busy || !holdReason} onClick={() => patch({ statusType: 'ON_HOLD', holdReason })}>
            Hold
          </Button>
        </div>
      ) : null}

      <label className="mt-3 flex items-center gap-2 text-[14px]">
        <Checkbox checked={Boolean(project.memberSendEnabled)} disabled={busy} onCheckedChange={(v) => patch({ memberSendEnabled: v === true })} />
        Team Members may email this client from a shared mailbox
      </label>

      <label className="mt-3 block text-[13px] text-muted">
        Health
        <NativeSelect value={project.health} onChange={(e) => patch({ health: e.target.value })}>
          {Object.entries(HEALTH_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="mt-3 block text-[13px] text-muted">
        Team
        <NativeSelect value={project.teamId ?? ''} onChange={(e) => patch({ teamId: e.target.value || null })}>
          <option value="">No team</option>
          {deptTeams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="mt-3 block text-[13px] text-muted">
        Package (applies to future monthly cycles)
        <NativeSelect value={project.packageId ?? ''} onChange={(e) => patch({ packageId: e.target.value || null })}>
          <option value="">No package</option>
          {deptPackages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
      </label>

      <Collapsible className="mt-4">
        <CollapsibleTrigger className="text-[14px] text-error hover:underline">Stop this project</CollapsibleTrigger>
        <CollapsibleContent className="mt-2 grid gap-2">
          <NativeSelect value={stopReason} onChange={(e) => setStopReason(e.target.value)} aria-label="Stop reason">
            <option value="">Reason (required)</option>
            {STOP_REASONS.map((r) => (
              <option key={r} value={r}>
                {STOP_REASON_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
          <Input placeholder="Note (optional)" value={stopNote} onChange={(e) => setStopNote(e.target.value)} />
          <ConfirmButton
            className={buttonVariants({ variant: 'danger', size: 'sm' })}
            disabled={busy || !stopReason}
            trigger="Stop project"
            title="Stop this project?"
            description="Stopped is final for this project. Its open tasks close and it leaves the board."
            confirmLabel="Stop project"
            destructive
            onConfirm={() => run(() => send('POST', `/projects/${project.id}/stop`, { reason: stopReason, note: stopNote || null }))}
          />
        </CollapsibleContent>
      </Collapsible>
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
              <Checkbox
                checked={d in chosen}
                onCheckedChange={(v) =>
                  setChosen((c) => {
                    const next = { ...c };
                    if (v === true) next[d] = '';
                    else delete next[d];
                    return next;
                  })
                }
              />
              {DEPARTMENT_LABELS[d as Department]}
            </label>
            {d in chosen ? (
              <NativeSelect className="mt-1" value={chosen[d]} onChange={(e) => setChosen({ ...chosen, [d]: e.target.value })} aria-label={`${d} package`}>
                <option value="">No package</option>
                {packages
                  .filter((p) => p.department === d)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </NativeSelect>
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
