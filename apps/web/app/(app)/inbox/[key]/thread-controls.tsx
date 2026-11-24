'use client';
import {
  CONTACT_ROLE_LABELS,
  CONTACT_ROLES,
  DEPARTMENT_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  TRIAGE_ACTION_LABELS,
  TRIAGE_ACTIONS,
  TRIAGE_CATEGORIES,
  TRIAGE_CATEGORY_LABELS,
  type ClientView,
  type ContactRole,
  type ContactView,
  type MailboxView,
  type MessageView,
  type Priority,
  type ProjectView,
  type SendResultView,
  type TaskView,
  type ThreadView,
  type TriageAction,
  type TriageCategory,
  type TriageResultView,
  type UserView,
} from '@opshub/shared';
import { Button, Checkbox, Chip, Input, NativeSelect, Textarea } from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { CapacityWarning } from '@/lib/capacity-warning';
import { send, sendForm, SendError, useAction } from '@/lib/client';

const PRIMARY: Record<TriageAction, string> = {
  CREATE_TASK: 'Create task',
  ATTACH_TO_TASK: 'Add to task',
  LOG_APPROVAL: 'Log approval',
  NONE: 'Confirm, no action',
};

/** PRD 2.4: the suggestion, pre-filled; one click confirms it as is, or after edits. */
export function TriageCard({ message, projects, tasksByProject, users }: { message: MessageView; projects: ProjectView[]; tasksByProject: Record<string, TaskView[]>; users: UserView[] }) {
  const { run, error, busy } = useAction();
  const s = message.triage?.suggestion ?? null;
  const [editing, setEditing] = useState(!s);
  const [form, setForm] = useState({
    category: (s?.category ?? 'OTHER') as TriageCategory,
    action: (s?.action ?? (projects.length ? 'CREATE_TASK' : 'NONE')) as TriageAction,
    projectId: s?.projectId ?? projects[0]?.id ?? '',
    taskId: s?.taskId ?? '',
    title: s?.suggestedTitle ?? '',
    priority: (s?.suggestedPriority ?? 'NORMAL') as Priority,
    assigneeId: '',
    dueDate: '',
  });
  const project = projects.find((p) => p.id === form.projectId);
  const tasks = tasksByProject[form.projectId] ?? [];

  const confirm = () =>
    run(() =>
      send<TriageResultView>('POST', `/inbox/messages/${message.id}/triage`, {
        decision: 'CONFIRM',
        ...(editing
          ? {
              category: form.category,
              action: form.action,
              projectId: form.projectId || null,
              taskId: form.action === 'ATTACH_TO_TASK' ? form.taskId || null : null,
              title: form.title || undefined,
              priority: form.priority,
              assigneeId: form.assigneeId || null,
              dueDate: form.dueDate || null,
            }
          : {}),
      }),
    );

  return (
    <section className="mt-4 rounded-lg border border-pale-purple bg-pale-purple/40 p-3" aria-label="Triage" data-testid="triage-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[12px] uppercase text-accent-pressed">Suggested</span>
        {s ? (
          <>
            <Chip tone="accent" className="px-2 py-0 text-[11px]">{TRIAGE_CATEGORY_LABELS[s.category]}</Chip>
            <span className="font-mono text-[12px] text-muted">{Math.round(s.confidence * 100)}% sure · {message.triage?.model}</span>
          </>
        ) : (
          <span className="text-[13px] text-muted">{message.triageState === 'NEW' ? 'Working on a suggestion. Refresh in a moment, or triage it yourself.' : 'No suggestion; choose below.'}</span>
        )}
      </div>
      {s && !editing ? (
        <p className="mt-2 text-[14px]">
          {TRIAGE_ACTION_LABELS[s.action]}
          {project ? ` on ${DEPARTMENT_LABELS[project.department!]}` : ''}
          {s.action === 'CREATE_TASK' ? `: "${s.suggestedTitle}"` : ''}
          {s.action === 'ATTACH_TO_TASK' ? `: ${tasks.find((t) => t.id === s.taskId)?.title ?? 'the matching task'}` : ''}
          {s.action === 'CREATE_TASK' && s.suggestedPriority !== 'NORMAL' ? ` (${PRIORITY_LABELS[s.suggestedPriority]})` : ''}
        </p>
      ) : null}
      {s?.summary && !editing ? <p className="mt-1 text-[13px] text-muted">{s.summary}</p> : null}

      {editing ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <NativeSelect aria-label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TriageCategory })}>
            {TRIAGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {TRIAGE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Action" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as TriageAction })}>
            {TRIAGE_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {TRIAGE_ACTION_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, taskId: '' })}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.department ? DEPARTMENT_LABELS[p.department] : ''} · {p.stageName}
              </option>
            ))}
          </NativeSelect>
          {form.action === 'ATTACH_TO_TASK' ? (
            <NativeSelect aria-label="Task" value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
              <option value="">Choose a task</option>
              {tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </NativeSelect>
          ) : null}
          {form.action === 'CREATE_TASK' ? (
            <>
              <Input className="md:col-span-2" aria-label="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <NativeSelect aria-label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect aria-label="Assignee" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </NativeSelect>
              <Input type="date" aria-label="Due date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              <div className="md:col-span-2">
                <CapacityWarning assigneeId={form.assigneeId || null} day={form.dueDate || null} />
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" disabled={busy || (form.action === 'ATTACH_TO_TASK' && editing && !form.taskId)} onClick={() => void confirm()}>
          {PRIMARY[editing ? form.action : (s?.action ?? form.action)]}
        </Button>
        {!editing ? (
          <Button type="button" variant="tertiary" onClick={() => setEditing(true)}>
            Change
          </Button>
        ) : null}
        <Button type="button" variant="tertiary" disabled={busy} onClick={() => void run(() => send('POST', `/inbox/messages/${message.id}/triage`, { decision: 'DISMISS' }))}>
          Dismiss
        </Button>
        {message.attachments.length && project ? <span className="text-[13px] text-muted">Files are filed to the project.</span> : null}
      </div>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </section>
  );
}

export function LinkForm({ messageId, clients }: { messageId: string; clients: ClientView[] }) {
  const { run, error, busy } = useAction();
  const [form, setForm] = useState({ clientId: '', save: false, role: 'MARKETING' as ContactRole, name: '' });
  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(() =>
      send('POST', `/inbox/messages/${messageId}/link`, {
        clientId: form.clientId,
        ...(form.save ? { saveAsContact: { role: form.role, name: form.name } } : {}),
      }),
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 grid gap-2" aria-label="Link to a client">
      <NativeSelect aria-label="Client" required value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
        <option value="">Choose a client</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.companyName}
          </option>
        ))}
      </NativeSelect>
      <label className="flex items-center gap-2 text-[14px]">
        <Checkbox checked={form.save} onCheckedChange={(v) => setForm({ ...form, save: v === true })} />
        Save the sender as a contact (your own clients)
      </label>
      {form.save ? (
        <>
          <NativeSelect aria-label="Contact role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ContactRole })}>
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>
                {CONTACT_ROLE_LABELS[r]}
              </option>
            ))}
          </NativeSelect>
          <Input aria-label="Contact name" required placeholder="Their name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </>
      ) : null}
      <Button type="submit" variant="secondary" disabled={busy}>
        Link
      </Button>
      {error ? <p className="text-[14px] text-error">{error}</p> : null}
    </form>
  );
}

type Mode = 'REPLY' | 'REPLY_ALL' | 'FORWARD';

/** Replies go to the sender by role; the server fills in the real address (TechSpec 5.5). */
export function ReplyBox({ thread, replyTo, contacts, mailboxes, templates }: { thread: ThreadView; replyTo: MessageView; contacts: ContactView[]; mailboxes: MailboxView[]; templates: Array<{ name: string; language: string }> }) {
  const router = useRouter();
  const { run, error, busy, setError } = useAction();
  const email = thread.channel === 'EMAIL';
  const [mode, setMode] = useState<Mode>('REPLY');
  const [extra, setExtra] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mailboxId, setMailboxId] = useState(thread.mailboxId ?? mailboxes[0]?.id ?? '');
  const [template, setTemplate] = useState('');
  const windowOpen = !thread.windowOpenUntil || new Date(thread.windowOpenUntil) > new Date();
  const replyToSender = replyTo.direction === 'INBOUND';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = templates.find((x) => `${x.name}:${x.language}` === template);
    const payload = {
      channel: thread.channel,
      mode,
      replyToId: replyTo.id,
      toSender: mode !== 'FORWARD' && replyToSender,
      contactIds: extra,
      mailboxId: email ? mailboxId || undefined : undefined,
      body,
      ...(t ? { template: { name: t.name, language: t.language, params: [] } } : {}),
    };
    const ok = await run(async () => {
      try {
        return await sendForm<SendResultView>('/inbox/send', payload, files);
      } catch (err) {
        if (err instanceof SendError && err.code === 'OUTSIDE_WINDOW') setTemplate(templates[0] ? `${templates[0].name}:${templates[0].language}` : '');
        throw err;
      }
    });
    if (ok) {
      setBody('');
      setFiles([]);
      setExtra([]);
      setError(null);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-canvas p-4" aria-label="Reply">
      <div className="flex flex-wrap items-center gap-2">
        {(email ? (['REPLY', 'REPLY_ALL', 'FORWARD'] as Mode[]) : (['REPLY'] as Mode[])).map((m) => (
          <Button key={m} type="button" variant={mode === m ? 'default' : 'secondary'} size="sm" onClick={() => setMode(m)} aria-pressed={mode === m} className="rounded-full">
            {m === 'REPLY' ? 'Reply' : m === 'REPLY_ALL' ? 'Reply all' : 'Forward'}
          </Button>
        ))}
        {email && mailboxes.length > 1 ? (
          <NativeSelect className="py-1 text-[13px]" wrapperClassName="ml-auto w-auto" aria-label="Send from" value={mailboxId} onChange={(e) => setMailboxId(e.target.value)}>
            {mailboxes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.address}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        To: {mode !== 'FORWARD' && replyToSender ? replyTo.sender : 'choose below'}
        {extra.length ? ` + ${extra.length} more` : ''}
      </p>
      {contacts.length ? (
        <div className="mt-1 flex flex-wrap gap-2">
          {contacts.map((c) => (
            <label key={c.id} className="flex items-center gap-1 text-[13px]">
              <Checkbox checked={extra.includes(c.id)} onCheckedChange={(v) => setExtra(v === true ? [...extra, c.id] : extra.filter((x) => x !== c.id))} />
              {c.label}
            </label>
          ))}
        </div>
      ) : null}
      {!email && !windowOpen ? (
        <NativeSelect className="mt-2" aria-label="Template" value={template} onChange={(e) => setTemplate(e.target.value)}>
          <option value="">Approved template (required outside 24 hours)</option>
          {templates.map((t) => (
            <option key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`}>
              {t.name} ({t.language})
            </option>
          ))}
        </NativeSelect>
      ) : null}
      <Textarea className="mt-2 min-h-28" aria-label="Message" placeholder={email ? 'Write your reply' : 'WhatsApp message'} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {email ? <input type="file" multiple aria-label="Attach files" className="text-[13px]" onChange={(e) => setFiles([...(e.target.files ?? [])])} /> : null}
        <Button type="submit" disabled={busy || (!body.trim() && !template)} className="ml-auto">
          Send
        </Button>
      </div>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </form>
  );
}
