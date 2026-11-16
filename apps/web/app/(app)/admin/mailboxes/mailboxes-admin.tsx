'use client';
import type { InboxSettingsView, MailboxView, UserView } from '@opshub/shared';
import { Button, Card, Chip, inputClass, Label } from '@opshub/ui';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';
import { formatDateTime } from '@/lib/format';

export function MailboxesAdmin({ mailboxes, pms, settings, notice }: { mailboxes: MailboxView[]; pms: UserView[]; settings: InboxSettingsView; notice: string | null }) {
  const { run, error, busy } = useAction();
  const [form, setForm] = useState({ address: '', label: '', ownerUserId: '' });
  const live = settings.gmailMode === 'live';

  async function add(e: FormEvent) {
    e.preventDefault();
    if (live) {
      const qs = new URLSearchParams({ label: form.label, ...(form.ownerUserId ? { ownerUserId: form.ownerUserId } : {}), ...(form.address ? { loginHint: form.address } : {}) });
      window.location.href = `/api/v1/mailboxes/connect?${qs}`;
      return;
    }
    const ok = await run(() => send('POST', '/mailboxes', { address: form.address, label: form.label, ownerUserId: form.ownerUserId || null }));
    if (ok) setForm({ address: '', label: '', ownerUserId: '' });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <Card className="p-0">
        {notice ? <p role="status" className="border-b border-surface-alt px-5 py-3 text-[14px]">{notice}</p> : null}
        <ul className="divide-y divide-surface-alt">
          {mailboxes.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-testid="mailbox-row">
              <div className="min-w-0">
                <p className="font-semibold">{m.label || m.address}</p>
                <p className="font-mono text-[12px] text-muted">
                  {m.address} · {m.ownerName ? `${m.ownerName}'s mailbox` : 'shared'}
                </p>
                <p className="text-[12px] text-muted">
                  {m.lastSyncAt ? `Synced ${formatDateTime(m.lastSyncAt)}` : 'Not synced yet'}
                  {m.backfillDoneAt ? ' · history imported' : ''}
                  {m.watchExpiry ? ` · watch until ${formatDateTime(m.watchExpiry)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.syncError ? <Chip tone="danger">{m.syncError}</Chip> : null}
                {!m.active ? <Chip tone="muted">Off</Chip> : null}
                <Chip tone="muted">{m.mode}</Chip>
                <Button variant="tertiary" disabled={busy || !m.active} onClick={() => void run(() => send('POST', `/mailboxes/${m.id}/sync`))}>
                  Sync now
                </Button>
                <Button variant="tertiary" disabled={busy} onClick={() => void run(() => send('PATCH', `/mailboxes/${m.id}`, { active: !m.active }))}>
                  {m.active ? 'Turn off' : 'Turn on'}
                </Button>
              </div>
            </li>
          ))}
          {mailboxes.length === 0 ? <li className="px-5 py-8 text-center text-muted">No mailboxes yet.</li> : null}
        </ul>
        {error ? <p className="px-5 pb-3 text-[14px] text-error">{error}</p> : null}
      </Card>
      <Card>
        <Label>{live ? 'Connect a Gmail mailbox' : 'Add a mailbox (fake Gmail)'}</Label>
        <p className="mt-1 text-[13px] text-muted">
          {live ? 'You will sign in to the mailbox with Google and allow Ops Hub to read and send mail. History from the last 3 years is imported.' : 'GMAIL_MODE is fake: mail arrives through the inbox simulator.'}
        </p>
        <form onSubmit={add} className="mt-3 grid gap-2">
          <input className={inputClass} type="email" aria-label="Mailbox address" placeholder="support@syspreedigital.com" required={!live} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          <input className={inputClass} aria-label="Label" placeholder="Label, e.g. Support" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <select className={inputClass} aria-label="Owner" value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}>
            <option value="">Shared mailbox</option>
            {pms.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}'s own mailbox
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy}>
            {live ? 'Connect with Google' : 'Add mailbox'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
