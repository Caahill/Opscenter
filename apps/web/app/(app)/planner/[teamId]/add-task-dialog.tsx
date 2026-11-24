'use client';
// "+ Add task" on the weekly planner: create a task on one of the team's projects without leaving
// the plan. Uses the same POST /tasks as the project page, so the API checks scope as usual.
import { PRIORITIES, PRIORITY_LABELS, type Priority } from '@opshub/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FieldLabel,
  Input,
  inputClass,
} from '@opshub/ui';
import { useState, type FormEvent } from 'react';
import { CapacityWarning } from '@/lib/capacity-warning';
import { send, useAction } from '@/lib/client';
import { formatDay } from '@/lib/format';

export interface PlannerProjectOption {
  id: string;
  label: string;
}

const NO_DAY = '';

export function AddTaskDialog({
  teamId,
  projects,
  members,
  days,
}: {
  teamId: string;
  projects: PlannerProjectOption[];
  members: Array<{ userId: string; name: string }>;
  days: string[];
}) {
  const { run, error, busy, setError } = useAction();
  const [open, setOpen] = useState(false);
  const blank = { projectId: projects[0]?.id ?? '', title: '', assigneeId: '', day: NO_DAY, dueDate: '', priority: 'NORMAL' as Priority, estimateH: '' };
  const [form, setForm] = useState(blank);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function save(e: FormEvent) {
    e.preventDefault();
    const dueDate = form.dueDate || form.day || null;
    const ok = await run(() =>
      send('POST', '/tasks', {
        projectId: form.projectId,
        title: form.title.trim(),
        assigneeId: form.assigneeId || null,
        teamId,
        priority: form.priority,
        plannedDate: form.day || null,
        dueDate,
        estimateH: form.estimateH ? Number(form.estimateH) : null,
      }),
    );
    if (ok) {
      setOpen(false);
      setForm(blank);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a task</DialogTitle>
          <DialogDescription>It goes on the project you pick and appears in this plan on the day you choose.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4" aria-label="Add a task">
          <div className="grid gap-2">
            <FieldLabel htmlFor="add-task-project">Project</FieldLabel>
            <select id="add-task-project" required className={inputClass} value={form.projectId} onChange={(e) => set({ projectId: e.target.value })}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="add-task-title">Task</FieldLabel>
            <Input
              id="add-task-title"
              required
              maxLength={200}
              placeholder="e.g. Write meta descriptions for 10 pages"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <FieldLabel htmlFor="add-task-person">Person</FieldLabel>
              <select id="add-task-person" className={inputClass} value={form.assigneeId} onChange={(e) => set({ assigneeId: e.target.value })}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="add-task-day">Plan for</FieldLabel>
              <select id="add-task-day" className={inputClass} value={form.day} onChange={(e) => set({ day: e.target.value })}>
                <option value={NO_DAY}>No day yet (backlog)</option>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {formatDay(d)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <FieldLabel htmlFor="add-task-due">Due date</FieldLabel>
              <Input id="add-task-due" type="date" value={form.dueDate || form.day} onChange={(e) => set({ dueDate: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <FieldLabel htmlFor="add-task-priority">Priority</FieldLabel>
                <select id="add-task-priority" className={inputClass} value={form.priority} onChange={(e) => set({ priority: e.target.value as Priority })}>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <FieldLabel htmlFor="add-task-hours">Hours</FieldLabel>
                <Input id="add-task-hours" type="number" min={0} max={400} step={0.5} placeholder="e.g. 4" value={form.estimateH} onChange={(e) => set({ estimateH: e.target.value })} />
              </div>
            </div>
          </div>
          <CapacityWarning assigneeId={form.assigneeId || null} day={form.day || form.dueDate || null} />
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !form.projectId || !form.title.trim()}>
              {busy ? 'Adding…' : 'Add task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
