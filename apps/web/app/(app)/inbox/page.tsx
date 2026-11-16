import type { InboxView, MeView, ThreadListView } from '@opshub/shared';
import { Card, Chip, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, isDevAuth } from '@/lib/api';
import { AutoRefresh } from '@/lib/auto-refresh';
import { LiveRefresh } from '@/lib/realtime';
import { SimulatePanel } from './simulate-panel';
import { ThreadRow } from './thread-row';

const VIEWS: Array<{ key: InboxView; label: string; needs?: string }> = [
  { key: 'all', label: 'All' },
  { key: 'triage', label: 'Needs triage' },
  { key: 'unmatched', label: 'Unmatched', needs: 'inbox.link' },
  { key: 'sent', label: 'Sent' },
];

/** PRD 2.1 to 2.3: one inbox for email and WhatsApp, matched to clients, in the viewer's scope. */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ view?: string; channel?: string; before?: string }> }) {
  const sp = await searchParams;
  const view = (VIEWS.find((v) => v.key === sp.view)?.key ?? 'all') as InboxView;
  const channel = sp.channel === 'EMAIL' || sp.channel === 'WHATSAPP' ? sp.channel : undefined;
  // Only a real timestamp pages back; anything else (an old or hand-edited link) is ignored.
  const before = sp.before && !Number.isNaN(Date.parse(sp.before)) ? sp.before : undefined;
  const qs = new URLSearchParams({ view, ...(channel ? { channel } : {}), ...(before ? { before } : {}) });
  const [me, list] = await Promise.all([api<MeView>('/me'), api<ThreadListView>(`/inbox/threads?${qs}`)]);
  const can = (p: string) => me.permissions.includes(p);
  // Undefined values are dropped here: URLSearchParams would turn them into the text "undefined".
  const href = (patch: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = { view, channel, ...patch };
    const next = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => Boolean(e[1])));
    return `/inbox?${next}`;
  };

  return (
    <>
      {/* New messages arrive live; the slow refresh catches anything missed while offline. */}
      <LiveRefresh events={['inbox.message_new']} />
      <AutoRefresh seconds={120} />
      <PageHeader
        title="Inbox"
        description="Client email and WhatsApp in one place, matched to the client. Addresses and numbers are shown only to the client's PM and Admin."
        actions={
          <>
            {can('inbox.import') ? (
              <Link href="/inbox/import" className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
                Import WhatsApp chat
              </Link>
            ) : null}
            {can('inbox.send') ? (
              <Link href="/inbox/compose" className="inline-flex min-h-9 items-center rounded-md bg-primary px-3 text-[14px] font-semibold text-on-primary hover:bg-deep-panel">
                New message
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {VIEWS.filter((v) => !v.needs || can(v.needs)).map((v) => (
          <Link key={v.key} href={href({ view: v.key, before: undefined })}>
            <Chip tone={view === v.key ? 'accent' : 'neutral'}>{v.label}</Chip>
          </Link>
        ))}
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        {(['EMAIL', 'WHATSAPP'] as const).map((c) => (
          <Link key={c} href={href({ channel: channel === c ? undefined : c, before: undefined })}>
            <Chip tone={channel === c ? 'accent' : 'muted'}>{c === 'EMAIL' ? 'Email' : 'WhatsApp'}</Chip>
          </Link>
        ))}
        <Link href="/search" className="ml-auto text-[14px] text-link">
          Search messages
        </Link>
      </div>

      <Card className="p-0">
        {list.threads.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted">{view === 'triage' ? 'Nothing waiting for triage.' : 'No messages here.'}</p>
        ) : (
          <ul className="divide-y divide-surface-alt">
            {list.threads.map((t) => (
              <ThreadRow key={t.threadKey} t={t} timezone={me.timezone} />
            ))}
          </ul>
        )}
      </Card>
      {list.nextBefore ? (
        <p className="mt-3 text-right">
          <Link href={href({ before: list.nextBefore })} className="text-[14px] text-link">
            Older
          </Link>
        </p>
      ) : null}

      {isDevAuth() ? <SimulatePanel /> : null}
    </>
  );
}
