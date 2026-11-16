import { CHANNELS, type MeView, type SearchResultsView } from '@opshub/shared';
import { Card, Label, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PriorityChip, StatusChip } from '@/lib/chips';
import { ThreadRow } from '../inbox/thread-row';

/** PRD 2.2: find any message by client and keyword; also tasks and clients. Results follow your access. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; channel?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const me = await api<MeView>('/me');
  const qs = new URLSearchParams({ q, ...(sp.channel ? { channel: sp.channel } : {}), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) });
  const results = q.length >= 2 ? await api<SearchResultsView>(`/search?${qs}`) : null;
  const total = results ? (results.communications?.length ?? 0) + (results.tasks?.length ?? 0) + (results.clients?.length ?? 0) : 0;

  return (
    <>
      <PageHeader title="Search" description='Client name plus a word finds old mail fastest, e.g. "Demo renewal". Contact addresses and numbers are never searchable.' />
      <form className="mb-6 grid gap-2 md:grid-cols-[1fr_140px_150px_150px_auto]" action="/search">
        <input name="q" defaultValue={q} aria-label="Search" placeholder="Client and keyword" className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-[15px]" />
        <select name="channel" defaultValue={sp.channel ?? ''} aria-label="Channel" className="rounded-lg border border-border bg-canvas px-3 py-2 text-[15px]">
          <option value="">Any channel</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c === 'EMAIL' ? 'Email' : 'WhatsApp'}
            </option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={sp.from ?? ''} aria-label="From date" className="rounded-lg border border-border bg-canvas px-3 py-2 text-[15px]" />
        <input type="date" name="to" defaultValue={sp.to ?? ''} aria-label="To date" className="rounded-lg border border-border bg-canvas px-3 py-2 text-[15px]" />
        <button type="submit" className="min-h-10 rounded-xl bg-primary px-4 font-semibold text-on-primary">
          Search
        </button>
      </form>

      {results ? (
        <>
          <p className="mb-3 font-mono text-[12px] text-muted" data-testid="search-summary">
            {total} results in {results.tookMs} ms
          </p>
          <div className="grid gap-4">
            {results.communications?.length ? (
              <Card className="p-0">
                <Label className="px-4 pt-4">Messages</Label>
                <ul className="mt-2 divide-y divide-surface-alt">
                  {results.communications.map((t) => (
                    <ThreadRow key={t.threadKey} t={t} timezone={me.timezone} />
                  ))}
                </ul>
              </Card>
            ) : null}
            {results.tasks?.length ? (
              <Card>
                <Label>Tasks</Label>
                <ul className="mt-2 space-y-1">
                  {results.tasks.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2">
                      <Link href={`/tasks/${t.id}`} className="text-link">
                        {t.title}
                      </Link>
                      <span className="text-[13px] text-muted">{t.clientName}</span>
                      <StatusChip status={t.statusType} />
                      <PriorityChip priority={t.priority} />
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {results.clients?.length ? (
              <Card>
                <Label>Clients</Label>
                <ul className="mt-2 space-y-1">
                  {results.clients.map((c) => (
                    <li key={c.id}>
                      <Link href={`/clients/${c.id}`} className="text-link">
                        {c.companyName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
            {total === 0 ? <p className="text-muted">Nothing found.</p> : null}
          </div>
        </>
      ) : null}
    </>
  );
}
