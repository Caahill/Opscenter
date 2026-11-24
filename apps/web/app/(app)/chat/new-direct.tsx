'use client';
import type { ChatChannelView } from '@opshub/shared';
import { Button, NativeSelect } from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { send } from '@/lib/client';

export function NewDirectMessage({ colleagues }: { colleagues: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function open() {
    if (!userId) return;
    try {
      const channel = await send<ChatChannelView>('POST', '/chat/direct', { userId });
      router.push(`/chat/${channel.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the chat');
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="dm-user">
        Message a colleague
      </label>
      <NativeSelect id="dm-user" className="sm:min-w-[220px]" wrapperClassName="sm:w-auto" value={userId} onChange={(e) => setUserId(e.target.value)}>
        <option value="">Message a colleague</option>
        {colleagues.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
      <Button onClick={open} disabled={!userId}>
        Open chat
      </Button>
      {error ? <p className="w-full text-[14px] text-error">{error}</p> : null}
    </div>
  );
}
