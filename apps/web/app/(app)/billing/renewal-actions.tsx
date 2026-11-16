'use client';
import { CURRENCIES, type RenewalView } from '@opshub/shared';
import { Button, inputClass } from '@opshub/ui';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';

const plusYear = (d: string) => {
  const x = new Date(`${d.slice(0, 10)}T00:00:00.000Z`);
  x.setUTCFullYear(x.getUTCFullYear() + 1);
  return x.toISOString().slice(0, 10);
};

/** PRD 4.3: Renew raises a billing request for Accounts; Close ends the project. */
export function RenewalActions({ renewal }: { renewal: RenewalView }) {
  const { run, error, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ newEndDate: plusYear(renewal.endDate), amount: '', currency: renewal.currency });

  async function renew(e: FormEvent) {
    e.preventDefault();
    await run(() => send('POST', `/projects/${renewal.projectId}/renewal`, { decision: 'RENEW', ...form }));
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button type="button" variant="tertiary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          Renew
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm(`Close ${renewal.clientName}? The project ends and Accounts is told it will not renew.`)) void run(() => send('POST', `/projects/${renewal.projectId}/renewal`, { decision: 'CLOSE' }));
          }}
        >
          Close
        </Button>
      </div>
      {open ? (
        <form onSubmit={renew} className="grid w-72 gap-2" aria-label={`Renew ${renewal.clientName}`}>
          <label className="text-[13px] text-muted">
            New end date
            <input className={inputClass} type="date" required value={form.newEndDate} onChange={(e) => setForm({ ...form, newEndDate: e.target.value })} />
          </label>
          <div className="grid grid-cols-[1fr_90px] gap-2">
            <input className={inputClass} aria-label="Renewal amount" inputMode="decimal" placeholder="Amount" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <select className={inputClass} aria-label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={busy}>
            Renew and bill
          </Button>
        </form>
      ) : null}
      {error ? <p className="text-[13px] text-error">{error}</p> : null}
    </div>
  );
}
