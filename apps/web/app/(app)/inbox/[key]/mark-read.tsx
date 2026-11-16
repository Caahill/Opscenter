'use client';
import { useEffect } from 'react';
import { send } from '@/lib/client';

/** Opening a thread marks it read for you. The "New" highlight stays until you next open it. */
export function MarkRead({ threadKey }: { threadKey: string }) {
  useEffect(() => {
    void send('POST', `/inbox/threads/${encodeURIComponent(threadKey)}/read`).catch(() => undefined);
  }, [threadKey]);
  return null;
}
