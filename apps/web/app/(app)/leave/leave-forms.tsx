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

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Reads "2026-11-08 Diwali", "08/11/2026, Diwali" or "8 Nov 2026 - Diwali" into a date and a name. */
export function parseHolidayLine(line: string): { date: string; name: string } | null {
  const text = line.trim();
  if (!text) return null;
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[\s,;:\t-]+(.+)$/);
  let y: number, mo: number, d: number, name: string;
  if (m) [y, mo, d, name] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]!];
  else if ((m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[\s,;:\t-]+(.+)$/))) [d, mo, y, name] = [Number(m[1]), Number(m[2]), Number(m[3]), m[4]!];
  else if ((m = text.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})[\s,;:\t-]+(.+)$/))) {
    const month = MONTHS.indexOf(m[2]!.toLowerCase());
    if (month < 0) return null;
    [d, mo, y, name] = [Number(m[1]), month + 1, Number(m[3]), m[4]!];
  } else return null;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  const check = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCMonth() + 1 !== mo || check.getUTCDate() !== d) return null;
  name = name.trim().replace(/^[-,;:]\s*/, '');
  return name ? { date, name: name.slice(0, 80) } : null;
}

/** Paste a year's list from the HR calendar in one go; lines already on the list are skipped. */
export function BulkHolidayForm({ existing }: { existing: Array<{ date: string; name: string }> }) {
  const { run, error, busy } = useAction();
  const [text, setText] = useState('');
  const [location, setLocation] = useState('IN');
  const [done, setDone] = useState<string | null>(null);

  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const parsed = lines.map((l) => ({ line: l, h: parseHolidayLine(l) }));
  const bad = parsed.filter((p) => !p.h);
  const known = new Set(existing.map((h) => h.date.slice(0, 10)));
  const toAdd = parsed.flatMap((p) => (p.h && !known.has(p.h.date) ? [p.h] : []));
  const skipped = parsed.length - bad.length - toAdd.length;

  async function save(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    const ok = await run(async () => {
      for (const h of toAdd) await send('POST', '/holidays', { ...h, location });
      return true;
    });
    if (ok) {
      setDone(`Added ${toAdd.length} holiday${toAdd.length === 1 ? '' : 's'}${skipped ? `, skipped ${skipped} already on the list` : ''}.`);
      setText('');
    }
  }

  return (
    <details className="mt-4 border-t border-surface-alt pt-4">
      <summary className="cursor-pointer text-[14px] font-semibold text-accent">Paste a full holiday list</summary>
      <form onSubmit={save} className="mt-3 grid gap-2">
        <p className="text-[13px] text-muted">One holiday per line, for example “2026-11-08 Diwali” or “25/12/2026, Christmas”.</p>
        <textarea
          className={`${inputClass} min-h-32 font-mono text-[13px]`}
          aria-label="Holiday list"
          placeholder={'2026-11-08 Diwali\n2026-12-25 Christmas'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="grid grid-cols-[1fr_72px] items-center gap-2">
          <p className="text-[13px] text-muted">
            {lines.length === 0
              ? 'Nothing pasted yet.'
              : `${toAdd.length} to add${skipped ? `, ${skipped} already listed` : ''}${bad.length ? `, ${bad.length} not understood` : ''}.`}
          </p>
          <input className={inputClass} aria-label="Location for pasted holidays" maxLength={2} value={location} onChange={(e) => setLocation(e.target.value.toUpperCase())} />
        </div>
        {bad.length ? (
          <ul className="text-[13px] text-error">
            {bad.slice(0, 5).map((b) => (
              <li key={b.line}>Couldn’t read: “{b.line.trim()}”</li>
            ))}
          </ul>
        ) : null}
        <Button type="submit" variant="secondary" disabled={busy || toAdd.length === 0 || bad.length > 0}>
          {toAdd.length ? `Add ${toAdd.length} holiday${toAdd.length === 1 ? '' : 's'}` : 'Add holidays'}
        </Button>
        {done ? <p className="text-[14px] text-success">{done}</p> : null}
        {error ? <p className="text-[14px] text-error">{error}</p> : null}
      </form>
    </details>
  );
}
