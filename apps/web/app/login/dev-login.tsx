'use client';
import { ROLE_LABELS, type DevUserView } from '@opshub/shared';
import { Button, Chip } from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { send } from '@/lib/client';

export function DevLogin({ users }: { users: DevUserView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(userId: string) {
    setBusy(userId);
    setError(null);
    try {
      await send('POST', '/auth/dev/login', { userId });
      router.push('/');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
      setBusy(null);
    }
  }

  return (
    <div className="mt-4">
      <ul className="divide-y divide-surface-alt overflow-hidden rounded-lg border border-border">
        {users.map((u) => (
          <li key={u.id}>
            <Button
              type="button"
              variant="ghost"
              onClick={() => signIn(u.id)}
              disabled={busy !== null}
              className="h-auto min-h-12 w-full justify-between gap-3 rounded-none px-4 py-3 text-left font-normal whitespace-normal disabled:opacity-60"
            >
              <span>
                <span className="block text-[15px] font-semibold">{u.name}</span>
                <span className="block font-mono text-[12px] text-muted">{u.email}</span>
              </span>
              <span className="flex flex-wrap justify-end gap-1">
                {u.roles.map((r) => (
                  <Chip key={r} tone="accent">
                    {ROLE_LABELS[r]}
                  </Chip>
                ))}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-[14px] text-error">{error}</p> : null}
    </div>
  );
}
