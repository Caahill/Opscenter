'use client';
import { Button } from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { send, useAction } from '@/lib/client';

/** Opening an alert marks it read, then follows its link. */
export function OpenAlert({ id, link, title, unread }: { id: string; link: string | null; title: string; unread: boolean }) {
  const router = useRouter();
  async function open() {
    if (unread) await send('POST', `/notifications/${id}/read`).catch(() => null);
    if (link) router.push(link);
    router.refresh();
  }
  return (
    <button type="button" onClick={open} className={`text-left hover:text-link ${unread ? 'font-semibold' : ''}`}>
      {title}
    </button>
  );
}

export function MarkAllRead() {
  const { run, busy } = useAction();
  return (
    <Button variant="tertiary" disabled={busy} onClick={() => run(() => send('POST', '/notifications/read-all'))}>
      Mark all read
    </Button>
  );
}
