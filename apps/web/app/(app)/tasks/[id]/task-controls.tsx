'use client';
import {
  PRIORITY_LABELS,
  PRIORITIES,
  STATUS_LABELS,
  STATUS_TYPES,
  TASK_TYPE_LABELS,
  TASK_TYPES,
  type ChecklistItemView,
  type CommentView,
  type TaskDetailView,
  type UserView,
} from '@opshub/shared';
import { Button, Card, Checkbox, Input, Label, NativeSelect, Textarea } from '@opshub/ui';
import { useState, type FormEvent } from 'react';
import { CapacityWarning } from '@/lib/capacity-warning';
import { send, useAction } from '@/lib/client';
import { formatDateTime } from '@/lib/format';

const STEPS = [0, 25, 50, 75, 100];

/** Status and progress: what every assignee may change (PRD 1.5, two clicks or fewer). */
export function TaskQuickUpdate({ task }: { task: TaskDetailView }) {
  const { run, error, busy } = useAction();
  const update = (body: Record<string, unknown>) => run(() => send('PATCH', `/tasks/${task.id}`, body));
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[13px] text-muted">
          Status
          <NativeSelect
            aria-label="Status"
            value={task.statusType}
            disabled={busy}
            onChange={(e) => update({ statusType: e.target.value })}>
            {STATUS_TYPES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <div>
          <p className="text-[13px] text-muted">Progress</p>
          <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="Progress">
            {STEPS.map((p) => (
              <Button
                key={p}
                type="button"
                variant={task.progressPct === p ? 'default' : 'ghost'}
                size="sm"
                disabled={busy}
                aria-pressed={task.progressPct === p}
                onClick={() => update({ progressPct: p })}
                className="rounded-none border-r border-border px-2.5 tabular-nums shadow-none last:border-r-0"
              >
                {p}%
              </Button>
            ))}
          </div>
        </div>
      </div>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}

export function TaskEditor({ task, users }: { task: TaskDetailView; users: UserView[] }) {
  const { run, error, busy } = useAction();
  const [form, setForm] = useState({
    title: task.title ?? '',
    type: task.type ?? 'DELIVERABLE',
    assigneeId: task.assigneeId ?? '',
    priority: task.priority ?? 'NORMAL',
    dueDate: task.dueDate?.slice(0, 10) ?? '',
    estimateH: task.estimateH ?? '',
    description: task.description ?? '',
  });

  async function save(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      send('PATCH', `/tasks/${task.id}`, {
        title: form.title,
        type: form.type,
        assigneeId: form.assigneeId || null,
        priority: form.priority,
        dueDate: form.dueDate || null,
        estimateH: form.estimateH === '' ? null : Number(form.estimateH),
        description: form.description || null,
      }),
    );
  }

  return (
    <Card>
      <Label>Edit</Label>
      <form onSubmit={save} className="mt-3 grid gap-2">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Title" required />
        <NativeSelect value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })} aria-label="Type">
          {TASK_TYPES.map((t) => (
            <option key={t} value={t}>
              {TASK_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} aria-label="Assignee">
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        {form.assigneeId && form.assigneeId !== task.assigneeId ? (
          <CapacityWarning assigneeId={form.assigneeId} day={form.dueDate || task.plannedDate || null} />
        ) : null}
        <NativeSelect value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as typeof form.priority })} aria-label="Priority">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} aria-label="Due date" />
        <Input inputMode="decimal" placeholder="Estimate hours" value={form.estimateH} onChange={(e) => setForm({ ...form, estimateH: e.target.value })} />
        <Textarea
          className="min-h-24"
          placeholder="Description. Client emails, phone numbers and logins are removed on save."
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        {error ? <p className="text-[14px] text-error">{error}</p> : null}
      </form>
    </Card>
  );
}

export function TaskChecklist({ taskId, items, canAdd }: { taskId: string; items: ChecklistItemView[]; canAdd: boolean }) {
  const { run, error } = useAction();
  const [text, setText] = useState('');
  return (
    <div>
      <ul className="mt-2 space-y-1">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-2">
            <label className="flex min-h-9 items-center gap-2 text-[14px]">
              <Checkbox checked={Boolean(i.done)} onCheckedChange={(v) => run(() => send('PATCH', `/checklist/${i.id}`, { done: v === true }))} />
              {i.text}
            </label>
            {canAdd ? (
              <Button variant="ghost" size="inline" className="text-muted hover:text-error text-xs" type="button"  onClick={() => run(() => send('DELETE', `/checklist/${i.id}`))}>
                Remove
              </Button>
            ) : null}
          </li>
        ))}
        {items.length === 0 ? <li className="text-[14px] text-muted">No items.</li> : null}
      </ul>
      {canAdd ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await run(() => send('POST', `/tasks/${taskId}/checklist`, { text }))) setText('');
          }}
        >
          <Input placeholder="Add an item" value={text} onChange={(e) => setText(e.target.value)} required />
          <Button type="submit" variant="tertiary">
            Add
          </Button>
        </form>
      ) : null}
      {error ? <p className="mt-1 text-[14px] text-error">{error}</p> : null}
    </div>
  );
}

export function SubtaskForm({ task }: { task: TaskDetailView }) {
  const { run, error, busy } = useAction();
  const [title, setTitle] = useState('');
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run(() => send('POST', '/tasks', { projectId: task.projectId, parentTaskId: task.id, title }))) setTitle('');
      }}
    >
      <Input placeholder="Add a subtask" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <Button type="submit" variant="tertiary" disabled={busy}>
        Add
      </Button>
      {error ? <p className="text-[14px] text-error">{error}</p> : null}
    </form>
  );
}

export function Comments({ taskId, comments, timezone }: { taskId: string; comments: CommentView[]; timezone: string }) {
  const { run, error, busy } = useAction();
  const [body, setBody] = useState('');
  return (
    <div>
      <ul className="mt-2 space-y-3">
        {comments.map((c) => (
          <li key={c.id} className="text-[14px]">
            <p className="text-[12px] text-muted">
              <span className="font-semibold text-body">{c.authorName}</span> · {c.createdAt ? formatDateTime(c.createdAt, timezone) : ''}
            </p>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
        {comments.length === 0 ? <li className="text-[14px] text-muted">No comments yet.</li> : null}
      </ul>
      <form
        className="mt-3 grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => send('POST', `/tasks/${taskId}/comments`, { body }))) setBody('');
        }}
      >
        <Textarea className="min-h-20" placeholder="Write a comment" value={body} onChange={(e) => setBody(e.target.value)} required />
        <div>
          <Button type="submit" disabled={busy}>
            Comment
          </Button>
        </div>
        {error ? <p className="text-[14px] text-error">{error}</p> : null}
      </form>
    </div>
  );
}
