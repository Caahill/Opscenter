'use client';
import type { CredentialRevealView, CredentialView, TaskView, UserView } from '@opshub/shared';
import { Button, Card, Input, Label, NativeSelect } from '@opshub/ui';
import { useEffect, useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';
import { formatDate } from '@/lib/format';

const SYSTEMS = ['WEBSITE_ADMIN', 'HOSTING', 'GA', 'GSC', 'GMB', 'GOOGLE_ADS', 'META', 'OTHER'];

/** Shown once, then hidden again after 30 seconds. Never stored in the page. */
function Reveal({ credential }: { credential: CredentialView }) {
  const { run, error, busy } = useAction();
  const [secret, setSecret] = useState<CredentialRevealView | null>(null);
  useEffect(() => {
    if (!secret) return;
    const t = setTimeout(() => setSecret(null), 30_000);
    return () => clearTimeout(t);
  }, [secret]);

  return (
    <div>
      {secret ? (
        <div className="mt-2 rounded-md bg-pale-orange p-2 font-mono text-[13px]">
          <p>User: {secret.username}</p>
          <p>Password: {secret.password}</p>
          {secret.notes ? <p>{secret.notes}</p> : null}
          <Button variant="link" size="inline" className="mt-1" type="button"  onClick={() => setSecret(null)}>
            Hide
          </Button>
        </div>
      ) : (
        <Button
          variant="tertiary"
          disabled={busy}
          onClick={async () => {
            const s = await run(() => send<CredentialRevealView>('POST', `/credentials/${credential.id}/reveal`));
            if (s) setSecret(s);
          }}
        >
          Reveal (logged)
        </Button>
      )}
      {error ? <p className="mt-1 text-[13px] text-error">{error}</p> : null}
    </div>
  );
}

export function CredentialsPanel({
  clientId,
  credentials,
  canManage,
  users,
  tasks,
}: {
  clientId: string;
  credentials: CredentialView[];
  canManage: boolean;
  users: UserView[];
  tasks: TaskView[];
}) {
  const { run, error, busy } = useAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ system: 'HOSTING', label: '', username: '', password: '', notes: '' });
  const [grantFor, setGrantFor] = useState<string | null>(null);
  const [grant, setGrant] = useState({ userId: '', taskId: '' });

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => send('POST', `/clients/${clientId}/credentials`, { ...form, notes: form.notes || undefined }));
    if (ok) {
      setForm({ system: 'HOSTING', label: '', username: '', password: '', notes: '' });
      setAdding(false);
    }
  }

  return (
    <Card>
      <Label>Credentials</Label>
      <p className="mt-1 text-[12px] text-muted">Encrypted vault. Every reveal is logged; task grants end when the task closes or after 7 days.</p>
      <ul className="mt-3 space-y-3">
        {credentials.map((c) => (
          <li key={c.id} className="text-[14px]">
            <p className="font-semibold">{c.label}</p>
            <p className="font-mono text-[12px] text-muted">{c.system}</p>
            <Reveal credential={c} />
            {c.grants && c.grants.length > 0 ? (
              <ul className="mt-1 text-[12px] text-muted">
                {c.grants.map((g) => (
                  <li key={g.id} className="flex items-center gap-2">
                    {g.userName} for {g.taskTitle}, until {g.expiresAt ? formatDate(g.expiresAt) : ''}
                    {canManage ? (
                      <Button variant="link" size="inline" type="button"  onClick={() => run(() => send('DELETE', `/grants/${g.id}`))}>
                        Revoke
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {canManage && grantFor !== c.id ? (
              <Button variant="link" size="inline" className="mt-1" type="button"  onClick={() => setGrantFor(c.id)}>
                Grant for a task
              </Button>
            ) : null}
            {canManage && grantFor === c.id ? (
              <form
                className="mt-2 grid gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await run(() => send('POST', `/credentials/${c.id}/grants`, grant));
                  if (ok) setGrantFor(null);
                }}
              >
                <NativeSelect required value={grant.userId} onChange={(e) => setGrant({ ...grant, userId: e.target.value })} aria-label="Person">
                  <option value="">Person</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect required value={grant.taskId} onChange={(e) => setGrant({ ...grant, taskId: e.target.value })} aria-label="Task">
                  <option value="">Task</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </NativeSelect>
                <div className="flex gap-2">
                  <Button type="submit" disabled={busy}>
                    Grant
                  </Button>
                  <Button type="button" variant="tertiary" onClick={() => setGrantFor(null)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </li>
        ))}
        {credentials.length === 0 ? <li className="text-[14px] text-muted">None you can access.</li> : null}
      </ul>
      {canManage && !adding ? (
        <Button variant="tertiary" className="mt-4" onClick={() => setAdding(true)}>
          Add credential
        </Button>
      ) : null}
      {canManage && adding ? (
        <form onSubmit={add} className="mt-4 grid gap-2">
          <NativeSelect value={form.system} onChange={(e) => setForm({ ...form, system: e.target.value })} aria-label="System">
            {SYSTEMS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </NativeSelect>
          <Input placeholder="Label, e.g. Hosting panel" required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <Input placeholder="Username" required autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input
            placeholder="Password"
            type="password"
            required
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              Save to vault
            </Button>
            <Button type="button" variant="tertiary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}
