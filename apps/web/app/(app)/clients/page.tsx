import { MARKETS, type ClientView, type MeView } from '@opshub/shared';
import { Button, Card, Chip, EmptyState, Input, NativeSelect, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api } from '@/lib/api';
import { NewClientForm } from './new-client-form';
import { plural } from '@/lib/format';

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
        <Input
          name="search"
          defaultValue={q.search ?? ''}
          placeholder="Search by name or website"
          className="min-h-10 min-w-64 flex-1 rounded-lg border border-border bg-canvas px-3" />
        <NativeSelect name="market" defaultValue={q.market ?? ''} wrapperClassName="w-auto" aria-label="Market">
          <option value="">Any market</option>
          {MARKETS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </NativeSelect>
        <Button variant="outline">Search</Button>
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
                <Chip tone="muted">{plural(c.projectCount ?? 0, 'project')}</Chip>
                <span className="text-[14px] text-muted">{c.pmName}</span>
              </div>
            </li>
          ))}
          {clients.length === 0 ? (
            <li>
              <EmptyState title="No clients found" hint="Try a different name or website, or set the market back to “Any market”." />
            </li>
          ) : null}
        </ul>
      </Card>
    </>
  );
}
