'use client';
import { MARKETS, type ClientView } from '@opshub/shared';
import { Button, Card, inputClass, Label } from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';

export function NewClientForm() {
  const router = useRouter();
  const { run, error, busy } = useAction();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ companyName: '', website: '', market: 'IN', emailDomains: '' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const created = await run(() =>
      send<ClientView>('POST', '/clients', {
        companyName: form.companyName,
        website: form.website || null,
        market: form.market,
        emailDomains: form.emailDomains
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
      }),
    );
    if (created) router.push(`/clients/${created.id}`);
  }

  if (!open) {
    return (
      <div className="mb-4">
        <Button onClick={() => setOpen(true)}>New client</Button>
      </div>
    );
  }
  return (
    <Card className="mb-6">
      <Label>New client</Label>
      <form onSubmit={submit} className="mt-3 grid gap-3 md:grid-cols-2">
        <input className={inputClass} placeholder="Company name" required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        <input className={inputClass} placeholder="Website, e.g. example.com" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
        <select className={inputClass} value={form.market} onChange={(e) => setForm({ ...form, market: e.target.value })} aria-label="Market">
          {MARKETS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <input
          className={inputClass}
          placeholder="Email domains for auto-linking, comma separated"
          value={form.emailDomains}
          onChange={(e) => setForm({ ...form, emailDomains: e.target.value })}
        />
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={busy}>
            Create client
          </Button>
          <Button type="button" variant="tertiary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {error ? <p className="text-[14px] text-error">{error}</p> : null}
        </div>
      </form>
    </Card>
  );
}
