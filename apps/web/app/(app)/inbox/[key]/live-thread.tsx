'use client';
import { LiveRefresh } from '@/lib/realtime';

/** A reply in this thread shows up without reloading the page. */
export function LiveThread({ threadKey }: { threadKey: string }) {
  return <LiveRefresh events={['inbox.message_new']} filter={(p) => (p as { threadKey?: string }).threadKey === threadKey} />;
}
