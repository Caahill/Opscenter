'use client';
import { DEPARTMENT_LABELS, DEPARTMENTS, type Department, type TeamView, type UserView } from '@opshub/shared';
import { Button, Card, Chip, Input, Label, NativeSelect } from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { send } from '@/lib/client';
import { plural } from '@/lib/format';

export function TeamsAdmin({ teams, leaders }: { teams: TeamView[]; leaders: UserView[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<Department>('SEO');

  async function act(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    await act(() => send('POST', '/teams', { name, department }));
    setName('');
  }

  return (
    <>
      {error ? <p className="mb-4 text-[14px] text-error">{error}</p> : null}
      <Card className="mb-6">
        <Label>Add a team</Label>
        <form onSubmit={create} className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <Input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} required />
          <NativeSelect value={department} onChange={(e) => setDepartment(e.target.value as Department)}>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {DEPARTMENT_LABELS[d]}
              </option>
            ))}
          </NativeSelect>
          <Button type="submit">Add team</Button>
        </form>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-display text-[18px] font-[650] tracking-[-0.03em]">{t.name}</p>
              <Chip tone="muted">{plural(t.memberCount, 'member')}</Chip>
            </div>
            <p className="mt-1 font-mono text-[12px] text-muted">{DEPARTMENT_LABELS[t.department]}</p>
            <label className="mt-4 block text-[13px] text-muted" htmlFor={`leader-${t.id}`}>
              Team leader
            </label>
            <NativeSelect
              id={`leader-${t.id}`}
              className="mt-1"
              value={t.leaderId ?? ''}
              onChange={(e) => act(() => send('PATCH', `/teams/${t.id}`, { leaderId: e.target.value || null }))}>
              <option value="">No leader</option>
              {leaders.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
          </Card>
        ))}
      </div>
    </>
  );
}
