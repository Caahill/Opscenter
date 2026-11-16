'use client';
import { ROLE_LABELS, ROLES, type Role, type TeamView, type UserView } from '@opshub/shared';
import { Button, Card, Chip, inputClass, Label } from '@opshub/ui';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';

function RolePicker({ value, onChange }: { value: Role[]; onChange: (roles: Role[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map((r) => {
        const on = value.includes(r);
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== r) : [...value, r])}
            className={`min-h-9 rounded-full px-3 font-mono text-[13px] ${on ? 'bg-primary text-on-primary' : 'border border-border bg-canvas text-muted'}`}
          >
            {ROLE_LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}

function InviteForm({ teams }: { teams: TeamView[] }) {
  const { run, error, busy } = useAction();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [roles, setRoles] = useState<Role[]>(['TEAM_MEMBER']);
  const [teamId, setTeamId] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => send('POST', '/users', { email, name, roles, teamId: teamId || null }));
    if (ok) {
      setEmail('');
      setName('');
    }
  }

  return (
    <Card className="mb-6">
      <Label>Invite a user</Label>
      <form onSubmit={submit} className="mt-3 grid gap-3 md:grid-cols-2">
        <input className={inputClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className={inputClass} placeholder="name@syspreedigital.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <div className="md:col-span-2">
          <RolePicker value={roles} onChange={setRoles} />
        </div>
        <select className={inputClass} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">No team</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || roles.length === 0}>
            Invite
          </Button>
          {error ? <p className="text-[14px] text-error">{error}</p> : null}
        </div>
      </form>
    </Card>
  );
}

function UserRow({ user, teams, isMe }: { user: UserView; teams: TeamView[]; isMe: boolean }) {
  const { run, error, busy } = useAction();
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<Role[]>(user.roles);
  const [teamId, setTeamId] = useState(user.teamId ?? '');
  const [capacity, setCapacity] = useState(user.weeklyCapacityH);
  const team = teams.find((t) => t.id === user.teamId);

  const save = () =>
    run(() => send('PATCH', `/users/${user.id}`, { roles, teamId: teamId || null, weeklyCapacityH: Number(capacity) })).then(
      (ok) => ok && setEditing(false),
    );

  return (
    <li className={`px-4 py-3 ${user.active ? '' : 'bg-surface'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {user.name} {isMe ? <span className="font-mono text-[12px] text-muted">(you)</span> : null}
          </p>
          <p className="font-mono text-[12px] text-muted">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {user.roles.map((r) => (
            <Chip key={r} tone="accent">
              {ROLE_LABELS[r]}
            </Chip>
          ))}
          {team ? <Chip>{team.name}</Chip> : null}
          <Chip tone="muted">{user.weeklyCapacityH} h/wk</Chip>
          {user.active ? null : <Chip tone="warning">Deactivated</Chip>}
          <Button variant="tertiary" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Close' : 'Edit'}
          </Button>
          {isMe ? null : (
            <Button
              variant={user.active ? 'danger' : 'tertiary'}
              disabled={busy}
              onClick={() => run(() => send('PATCH', `/users/${user.id}`, { active: !user.active }))}
            >
              {user.active ? 'Deactivate' : 'Reactivate'}
            </Button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="mt-3 grid gap-3 rounded-lg border border-border bg-canvas p-3 md:grid-cols-[1fr_200px_120px_auto]">
          <RolePicker value={roles} onChange={setRoles} />
          <select className={inputClass} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <input className={inputClass} type="number" min={0} max={80} value={capacity} onChange={(e) => setCapacity(e.target.value)} aria-label="Weekly capacity hours" />
          <Button disabled={busy || roles.length === 0} onClick={save}>
            Save
          </Button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </li>
  );
}

export function UsersAdmin({ users, teams, meId }: { users: UserView[]; teams: TeamView[]; meId: string }) {
  return (
    <>
      <InviteForm teams={teams} />
      <Card className="p-0">
        <ul className="divide-y divide-surface-alt">
          {users.map((u) => (
            <UserRow key={u.id} user={u} teams={teams} isMe={u.id === meId} />
          ))}
        </ul>
      </Card>
    </>
  );
}
