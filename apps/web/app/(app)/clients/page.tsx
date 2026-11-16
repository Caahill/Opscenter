import { MARKETS, type ClientView, type MeView } from '@opshub/shared';
import { Card, Chip, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api } from '@/lib/api';
import { NewClientForm } from './new-client-form';

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ search?: string; market?: string }> }) {
  const q = await searchParams;
  const qs = new URLSearchParams();
  if (q.search) qs.set('search', q.search);
  if (q.market) qs.set('market', q.market);
  const [me, clients] = await Promise.all([api<MeView>('/me'), api<ClientView[]>(`/clients?${qs}`)]);
  const canCreate = me.permissions.includes('client.manage');

  return (
    <>
      <PageHeader title="Clients" description="One record per client, with every service as a linked project." />
      {canCreate ? <NewClientForm /> : null}
      <form className="mb-4 flex flex-wrap gap-2" action="/clients">
        <input
          name="search"
          defaultValue={q.search ?? ''}
          placeholder="Search by name or website"
          className="min-h-10 min-w-64 flex-1 rounded-lg border border-border bg-canvas px-3"
        />
        <select name="market" defaultValue={q.market ?? ''} className="min-h-10 rounded-lg border border-border bg-canvas px-2" aria-label="Market">
          <option value="">Any market</option>
          {MARKETS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <button className="min-h-10 rounded-lg border border-border bg-canvas px-4 hover:border-border-strong">Search</button>
      </form>
      <Card className="p-0">
        <ul className="divide-y divide-surface-alt">
          {clients.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link href={`/clients/${c.id}`} className="font-semibold hover:text-link">
                  {c.companyName}
                </Link>
                <p className="font-mono text-[12px] text-muted">{c.website ?? ''}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {c.market ? <Chip>{c.market}</Chip> : null}
                {c.status && c.status !== 'ACTIVE' ? <Chip tone="warning">{c.status}</Chip> : null}
                <Chip tone="muted">{c.projectCount ?? 0} projects</Chip>
                <span className="text-[14px] text-muted">{c.pmName}</span>
              </div>
            </li>
          ))}
          {clients.length === 0 ? <li className="px-4 py-8 text-center text-muted">No clients found.</li> : null}
        </ul>
      </Card>
    </>
  );
}
