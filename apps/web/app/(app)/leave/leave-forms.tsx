'use client';
import { LEAVE_KIND_LABELS, LEAVE_KINDS, type LeaveKind, type LeaveView, type UserView } from '@opshub/shared';
import { Button, inputClass } from '@opshub/ui';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';

const empty = { userId: '', startDate: '', endDate: '', halfDay: false, kind: 'PLANNED' as LeaveKind, reason: '' };

export function LeaveForm({ users }: { users: UserView[] }) {
  const { run, error, busy } = useAction();
  const [form, setForm] = useState(empty);
  const [done, setDone] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    const ok = await run(() =>
      send<LeaveView>('POST', '/leave', {
        userId: form.userId,
        startDate: form.startDate,
        endDate: form.halfDay ? form.startDate : form.endDate || form.startDate,
        halfDay: form.halfDay,
        kind: form.kind,
        reason: form.reason || null,
      }),
    );
    if (ok) {
      setDone(`Recorded for ${ok.userName}. Their Team Leader and affected PMs have been alerted.`);
      setForm(empty);
    }
  }

  return (
    <form onSubmit={save} className="mt-3 grid gap-2">
      <select className={inputClass} required aria-label="Person" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
        <option value="">Who is out?</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[13px] text-muted">
          From
          <input className={inputClass} type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </label>
        <label className="text-[13px] text-muted">
          To
          <input className={inputClass} type="date" disabled={form.halfDay} value={form.halfDay ? form.startDate : form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </label>
      </div>
      <label className="flex min-h-9 items-center gap-2 text-[14px]">
        <input type="checkbox" checked={form.halfDay} onChange={(e) => setForm({ ...form, halfDay: e.target.checked })} />
        Half day
      </label>
      <select className={inputClass} aria-label="Kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as LeaveKind })}>
        {LEAVE_KINDS.map((k) => (
          <option key={k} value={k}>
            {LEAVE_KIND_LABELS[k]}
          </option>
        ))}
      </select>
      <textarea
        className={`${inputClass} min-h-16`}
        placeholder="Reason (HR and Admin only, stored encrypted)"
        value={form.reason}
        onChange={(e) => setForm({ ...form, reason: e.target.value })}
      />
      <Button type="submit" disabled={busy}>
        Record leave
      </Button>
      {done ? <p role="status" className="text-[14px] text-success">{done}</p> : null}
      {error ? <p className="text-[14px] text-error">{error}</p> : null}
    </form>
  );
}

export function LeaveRowActions({ leave }: { leave: LeaveView }) {
  const { run, error, busy } = useAction();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ startDate: leave.startDate.slice(0, 10), endDate: leave.endDate.slice(0, 10), halfDay: leave.halfDay });

  async function save(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => send('PATCH', `/leave/${leave.id}`, { ...form, endDate: form.halfDay ? form.startDate : form.endDate }));
    if (ok) setEditing(false);
  }

  return (
    <>
      <button type="button" className="text-link" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
        Change dates
      </button>
      <button
        type="button"
        className="text-error"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Delete ${leave.userName}'s leave? Plans and alerts update straight away.`)) void run(() => send('DELETE', `/leave/${leave.id}`));
        }}
      >
        Delete
      </button>
      {editing ? (
        <form onSubmit={save} className="mt-2 grid w-full grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
          <input className={inputClass} type="date" aria-label="From" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          <input className={inputClass} type="date" aria-label="To" disabled={form.halfDay} value={form.halfDay ? form.startDate : form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          <label className="flex items-center gap-1 text-[13px]">
            <input type="checkbox" checked={form.halfDay} onChange={(e) => setForm({ ...form, halfDay: e.target.checked })} />
            Half
          </label>
          <Button type="submit" variant="tertiary" disabled={busy}>
            Save
          </Button>
        </form>
      ) : null}
      {error ? <span className="w-full text-[13px] text-error">{error}</span> : null}
    </>
  );
}

export function HolidayForm() {
  const { run, error, busy } = useAction();
  const [form, setForm] = useState({ date: '', name: '', location: 'IN' });
  async function save(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => send('POST', '/holidays', form));
    if (ok) setForm({ date: '', name: '', location: form.location });
  }
  return (
    <form onSubmit={save} className="mt-4 grid gap-2 border-t border-surface-alt pt-4">
      <div className="grid grid-cols-[1fr_72px] gap-2">
        <input className={inputClass} type="date" required aria-label="Holiday date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <input className={inputClass} required aria-label="Location" maxLength={2} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value.toUpperCase() })} />
      </div>
      <input className={inputClass} required placeholder="Holiday name, e.g. Diwali" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Button type="submit" variant="secondary" disabled={busy}>
        Add holiday
      </Button>
      {error ? <p className="text-[14px] text-error">{error}</p> : null}
    </form>
  );
}

export function RemoveHoliday({ id, name }: { id: string; name: string }) {
  const { run, busy } = useAction();
  return (
    <button
      type="button"
      className="font-mono text-[12px] text-error"
      disabled={busy}
      aria-label={`Remove ${name}`}
      onClick={() => {
        if (window.confirm(`Remove ${name}?`)) void run(() => send('DELETE', `/holidays/${id}`));
      }}
    >
      Remove
    </button>
  );
}
