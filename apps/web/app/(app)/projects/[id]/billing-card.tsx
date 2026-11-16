'use client';
import { BILLING_REASON_LABELS, BILLING_STATUS_LABELS, CURRENCIES, type BillingRequestView, type TaskView } from '@opshub/shared';
import { Button, Card, Chip, inputClass, Label, Masked } from '@opshub/ui';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';
import { formatDate, formatMoney } from '@/lib/format';

/** PRD 4.2: the project's billing requests, and (for its PM) raising a new one from flagged work. */
export function BillingCard({ projectId, requests, tasks, canRaise, preselect }: { projectId: string; requests: BillingRequestView[]; tasks: TaskView[]; canRaise: boolean; preselect: string | null }) {
  const { run, error, busy } = useAction();
  const [open, setOpen] = useState(Boolean(preselect));
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState({ reason: preselect ? 'ADDITIONAL_TASK' : 'ADDITIONAL_TASK', description: '', amount: '', currency: '', taskIds: preselect ? [preselect] : ([] as string[]) });
  const flagged = tasks.filter((t) => t.billable);
  const listed = showAll ? tasks : flagged;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      send('POST', '/billing-requests', {
        projectId,
        reason: form.reason,
        description: form.description,
        amount: form.amount,
        ...(form.currency ? { currency: form.currency } : {}),
        taskIds: form.reason === 'ADDITIONAL_TASK' ? form.taskIds : [],
      }),
    );
    if (ok) {
      setOpen(false);
      setForm({ ...form, description: '', amount: '', taskIds: [] });
    }
  }

  return (
    <Card id="billing">
      <div className="flex items-center justify-between">
        <Label>Billing</Label>
        {canRaise ? (
          <Button type="button" variant="tertiary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Raise billing request
          </Button>
        ) : null}
      </div>
      <ul className="mt-2 space-y-2 text-[14px]">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/billing/${r.id}`} className="text-link">
              {BILLING_REASON_LABELS[r.reason]} · {formatDate(r.createdAt)}
            </Link>
            <span className="flex items-center gap-2">
              <span className="font-mono text-[13px]">
                <Masked value={r.amount === undefined ? undefined : formatMoney(r.amount, r.currency)} />
              </span>
              <Chip className="px-2 py-0 text-[11px]">{BILLING_STATUS_LABELS[r.status]}</Chip>
            </span>
          </li>
        ))}
        {requests.length === 0 ? <li className="text-muted">No billing requests.</li> : null}
      </ul>
      {flagged.some((t) => !t.billableConfirmed) ? <p className="mt-2 text-[13px] text-muted">{flagged.filter((t) => !t.billableConfirmed).length} task(s) flagged as extra work and waiting for you.</p> : null}

      {open ? (
        <form onSubmit={submit} className="mt-4 grid gap-2 border-t border-surface-alt pt-4" aria-label="Raise billing request">
          <select className={inputClass} aria-label="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}>
            <option value="ADDITIONAL_TASK">{BILLING_REASON_LABELS.ADDITIONAL_TASK}</option>
            <option value="NEW_PACKAGE">{BILLING_REASON_LABELS.NEW_PACKAGE}</option>
          </select>
          {form.reason === 'ADDITIONAL_TASK' ? (
            <fieldset className="grid gap-1">
              <legend className="text-[13px] text-muted">Work being billed</legend>
              {listed.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    checked={form.taskIds.includes(t.id)}
                    onChange={(e) => setForm({ ...form, taskIds: e.target.checked ? [...form.taskIds, t.id] : form.taskIds.filter((x) => x !== t.id) })}
                  />
                  {t.title}
                  {t.billable && !t.billableConfirmed ? <span className="font-mono text-[11px] text-muted">(flagged)</span> : null}
                </label>
              ))}
              {listed.length === 0 ? <span className="text-[13px] text-muted">No tasks flagged as extra work.</span> : null}
              <button type="button" className="text-left text-[13px] text-link" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show flagged tasks only' : 'Show all tasks'}
              </button>
            </fieldset>
          ) : null}
          <textarea className={`${inputClass} min-h-16`} aria-label="Description" placeholder="What is being billed" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-[1fr_110px] gap-2">
            <input className={inputClass} aria-label="Amount" inputMode="decimal" placeholder="Amount" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <select className={inputClass} aria-label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="">Client&apos;s</option>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={busy || (form.reason === 'ADDITIONAL_TASK' && form.taskIds.length === 0)}>
            Send to Accounts
          </Button>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}
