'use client';
import { DEPARTMENT_LABELS, DEPARTMENTS, TASK_TYPE_LABELS, TASK_TYPES, type Department, type PackageView, type TaskTemplate, type TaskType } from '@opshub/shared';
import { Button, Card, Chip, inputClass, Label } from '@opshub/ui';
import { useState } from 'react';
import { send, useAction } from '@/lib/client';
import { plural } from '@/lib/format';

interface Row {
  title: string;
  type: TaskType;
  estimateH: string;
  dueInDays: string;
  stage: string;
}

const toRows = (t: TaskTemplate[]): Row[] =>
  t.map((x) => ({ title: x.title, type: x.type, estimateH: x.estimateH?.toString() ?? '', dueInDays: x.dueInDays?.toString() ?? '', stage: x.stage ?? '' }));
const fromRows = (rows: Row[]) =>
  rows
    .filter((r) => r.title.trim())
    .map((r) => ({
      title: r.title.trim(),
      type: r.type,
      priority: 'NORMAL' as const,
      ...(r.estimateH ? { estimateH: Number(r.estimateH) } : {}),
      ...(r.dueInDays ? { dueInDays: Number(r.dueInDays) } : {}),
      ...(r.stage ? { stage: r.stage } : {}),
    }));

function TemplateRows({ label, rows, onChange, stages }: { label: string; rows: Row[]; onChange: (r: Row[]) => void; stages?: string[] }) {
  const set = (i: number, patch: Partial<Row>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="mt-3">
      <Label>{label}</Label>
      <div className="mt-2 space-y-2">
        {rows.map((r, i) => (
          <div key={i} className={`grid gap-2 ${stages ? 'md:grid-cols-[1fr_150px_90px_90px_180px_auto]' : 'md:grid-cols-[1fr_150px_90px_90px_auto]'}`}>
            <input className={inputClass} value={r.title} onChange={(e) => set(i, { title: e.target.value })} aria-label="Task title" />
            <select className={inputClass} value={r.type} onChange={(e) => set(i, { type: e.target.value as TaskType })} aria-label="Task type">
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TASK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <input className={inputClass} inputMode="decimal" placeholder="Hours" value={r.estimateH} onChange={(e) => set(i, { estimateH: e.target.value })} aria-label="Estimate hours" />
            <input className={inputClass} inputMode="numeric" placeholder="Due +d" value={r.dueInDays} onChange={(e) => set(i, { dueInDays: e.target.value })} aria-label="Due in days" />
            {stages ? (
              <select className={inputClass} value={r.stage} onChange={(e) => set(i, { stage: e.target.value })} aria-label="Stage">
                <option value="">No stage</option>
                {stages.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            ) : null}
            <button type="button" className="text-[13px] text-error" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        ))}
        <Button variant="tertiary" onClick={() => onChange([...rows, { title: '', type: 'DELIVERABLE', estimateH: '', dueInDays: '', stage: '' }])}>
          Add task
        </Button>
      </div>
    </div>
  );
}

export function PackageEditor({ pkg, department, stages }: { pkg: PackageView; department: string; stages: string[] }) {
  const { run, error, busy } = useAction();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(pkg.name);
  const [hours, setHours] = useState(pkg.monthlyHours ?? '');
  const [setup, setSetup] = useState(() => toRows(pkg.setupTasks));
  const [cycle, setCycle] = useState(() => toRows(pkg.cycleTasks));

  const save = (active = pkg.active) =>
    run(() =>
      send('PATCH', `/packages/${pkg.id}`, {
        department: pkg.department,
        name,
        setupTasks: fromRows(setup),
        cycleTasks: fromRows(cycle),
        monthlyHours: hours === '' ? null : Number(hours),
        active,
      }),
    ).then((ok) => ok && setEditing(false));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-[18px] font-[650]">{pkg.name}</p>
          <p className="font-mono text-[12px] text-muted">
            {department} · {plural(pkg.setupTasks.length, 'setup task')} · {plural(pkg.cycleTasks.length, 'monthly task')}
            {pkg.monthlyHours ? ` · ${pkg.monthlyHours} h a month` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!pkg.active ? <Chip tone="muted">Inactive</Chip> : null}
          {!editing ? (
            <Button variant="tertiary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_160px]">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} aria-label="Package name" />
            <input className={inputClass} inputMode="decimal" placeholder="Hours a month" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Monthly hours" />
          </div>
          <TemplateRows label="Setup tasks (once, when the project starts)" rows={setup} onChange={setSetup} stages={stages} />
          <TemplateRows label="Monthly tasks (each cycle day)" rows={cycle} onChange={setCycle} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => save()}>
              Save
            </Button>
            <Button variant="tertiary" disabled={busy} onClick={() => save(!pkg.active)}>
              {pkg.active ? 'Save and deactivate' : 'Save and activate'}
            </Button>
            <Button variant="tertiary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
          {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}

export function NewPackage() {
  const { run, error, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [department, setDepartment] = useState<Department>('SEO');
  const [name, setName] = useState('');
  if (!open) {
    return (
      <div className="mb-4">
        <Button onClick={() => setOpen(true)}>New package</Button>
      </div>
    );
  }
  return (
    <Card className="mb-4">
      <Label>New package</Label>
      <div className="mt-3 grid gap-2 md:grid-cols-[200px_1fr_auto]">
        <select className={inputClass} value={department} onChange={(e) => setDepartment(e.target.value as Department)} aria-label="Department">
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
        <input className={inputClass} placeholder="Package name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button
          disabled={busy || !name}
          onClick={() =>
            run(() => send('POST', '/packages', { department, name, setupTasks: [], cycleTasks: [] })).then((ok) => {
              if (ok) {
                setOpen(false);
                setName('');
              }
            })
          }
        >
          Create
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-muted">Add its tasks with Edit after creating it.</p>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}
