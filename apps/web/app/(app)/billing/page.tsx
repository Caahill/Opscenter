import { BILLING_REASON_LABELS, BILLING_STATUS_LABELS, BILLING_STATUSES, DEPARTMENT_LABELS, type BillingRequestView, type BillingStatus, type MeView, type RenewalView } from '@opshub/shared';
import { Card, Chip, Masked, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { AutoRefresh } from '@/lib/auto-refresh';
import { formatDate, formatMoney, plural } from '@/lib/format';
import { RenewalActions } from './renewal-actions';

const TONE: Record<BillingStatus, 'accent' | 'warning' | 'success' | 'muted'> = { REQUESTED: 'warning', INVOICED: 'accent', PAID: 'success', CANCELLED: 'muted' };

/** PRD 4.4 Accounts workspace (and the PM's own requests): billing requests by status, and renewals due. */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('billing.read') && !me.permissions.includes('renewal.read')) redirect('/no-access');
  const tab = raw === 'renewals' || (BILLING_STATUSES as readonly string[]).includes(raw ?? '') ? raw! : 'REQUESTED';
  const [requests, renewals] = await Promise.all([
    tab !== 'renewals' ? api<BillingRequestView[]>(`/billing-requests?status=${tab}`) : Promise.resolve([] as BillingRequestView[]),
    tab === 'renewals' ? api<RenewalView[]>('/renewals') : Promise.resolve([] as RenewalView[]),
  ]);
  const accounts = me.roles.includes('ACCOUNTS');

  return (
    <>
      <AutoRefresh seconds={60} />
      <PageHeader
        title="Billing"
        description={accounts ? 'Billing requests from PMs, by status. Record invoice numbers and payments, and message the PM on any request.' : 'Billing requests for your clients, and retainers coming up for renewal.'}
      />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Billing views">
        {BILLING_STATUSES.map((s) => (
          <Link key={s} href={`/billing?tab=${s}`}>
            <Chip tone={tab === s ? 'accent' : 'neutral'}>{BILLING_STATUS_LABELS[s]}</Chip>
          </Link>
        ))}
        <Link href="/billing?tab=renewals">
          <Chip tone={tab === 'renewals' ? 'accent' : 'neutral'}>Renewals due</Chip>
        </Link>
      </nav>

      {tab === 'renewals' ? (
        <Card className="p-0">
          {renewals.length === 0 ? <p className="px-5 py-8 text-center text-muted">No retainers or AMCs end in the next 30 days.</p> : null}
          <ul className="divide-y divide-surface-alt">
            {renewals.map((r) => (
              <li key={r.projectId} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3" data-testid="renewal-row">
                <div className="min-w-0">
                  <Link href={`/projects/${r.projectId}`} className="font-semibold hover:text-link">
                    {r.clientName} · {DEPARTMENT_LABELS[r.department]}
                  </Link>
                  <p className="font-mono text-[12px] text-muted">
                    {r.packageName ?? r.type} · PM {r.pmName} · ends {formatDate(r.endDate)}
                  </p>
                  <Chip tone={r.daysLeft <= 7 ? 'danger' : 'warning'} className="mt-1 px-2 py-0 text-[11px]">
                    {r.daysLeft < 0 ? `${plural(-r.daysLeft, 'day')} overdue` : r.daysLeft === 0 ? 'ends today' : `${plural(r.daysLeft, 'day')} left`}
                  </Chip>
                </div>
                {r.billingRequestId ? (
                  <Link href={`/billing/${r.billingRequestId}`} className="text-[14px] text-link">
                    Renewed: billing request
                  </Link>
                ) : me.permissions.includes('project.manage') && (me.roles.includes('ADMIN') || r.pmId === me.id) ? (
                  <RenewalActions renewal={r} />
                ) : (
                  <span className="text-[13px] text-muted">Waiting for the PM</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-0">
          {requests.length === 0 ? <p className="px-5 py-8 text-center text-muted">Nothing {BILLING_STATUS_LABELS[tab as BillingStatus].toLowerCase()}.</p> : null}
          <ul className="divide-y divide-surface-alt">
            {requests.map((r) => (
              <li key={r.id} data-testid="billing-row">
                <Link href={`/billing/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-surface">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {r.clientName} · {DEPARTMENT_LABELS[r.department]}
                    </p>
                    <p className="truncate text-[14px] text-muted">
                      {BILLING_REASON_LABELS[r.reason]} · {r.description}
                    </p>
                    <p className="font-mono text-[12px] text-muted">
                      Raised by {r.raisedByName} on {formatDate(r.createdAt)}
                      {r.taskCount ? ` · ${r.taskCount} ${r.taskCount === 1 ? 'task' : 'tasks'}` : ''}
                      {r.messageCount ? ` · ${plural(r.messageCount, 'message')}` : ''}
                      {r.invoiceNo ? ` · ${r.invoiceNo}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[15px] font-semibold">
                      <Masked value={r.amount === undefined ? undefined : formatMoney(r.amount, r.currency)} />
                    </span>
                    <Chip tone={TONE[r.status]}>{BILLING_STATUS_LABELS[r.status]}</Chip>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
