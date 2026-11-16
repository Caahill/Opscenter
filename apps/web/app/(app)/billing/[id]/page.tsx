import { BILLING_REASON_LABELS, BILLING_STATUS_LABELS, DEPARTMENT_LABELS, STATUS_LABELS, type BillingRequestDetailView, type MeView } from '@opshub/shared';
import { Card, Chip, Field, Label, Masked, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { BillingMessages, OwnerActions, ProcessActions } from './billing-actions';

export default async function BillingRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, r] = await Promise.all([api<MeView>('/me'), api<BillingRequestDetailView>(`/billing-requests/${id}`)]);
  const contact = r.billingContact;

  return (
    <>
      <PageHeader
        title={`${r.clientName} · ${DEPARTMENT_LABELS[r.department]}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone="accent">{BILLING_STATUS_LABELS[r.status]}</Chip>
            <span>{BILLING_REASON_LABELS[r.reason]}</span>
            <span className="font-mono text-[12px] text-muted">raised by {r.raisedByName} on {formatDate(r.createdAt)}</span>
          </span>
        }
        actions={
          <Link href={`/billing?tab=${r.status}`} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
            Back to billing
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <p className="font-mono text-[26px] font-semibold" data-testid="billing-amount">
              <Masked value={r.amount === undefined ? undefined : formatMoney(r.amount, r.currency)} />
            </p>
            <p className="mt-2 whitespace-pre-wrap text-[15px]">{r.description}</p>
            <dl className="mt-4">
              <Field label="Project">
                <Link href={`/projects/${r.projectId}`} className="text-link">
                  {DEPARTMENT_LABELS[r.department]}
                  {r.packageName ? ` · ${r.packageName}` : ''}
                </Link>
              </Field>
              <Field label="PM">{r.pmName}</Field>
              {r.invoiceNo ? <Field label="Invoice">{r.invoiceNo}{r.invoicedAt ? `, ${formatDate(r.invoicedAt)}` : ''}</Field> : null}
              {r.paidAt ? <Field label="Paid">{formatDate(r.paidAt)}</Field> : null}
              {r.cancelledAt ? <Field label="Cancelled">{formatDate(r.cancelledAt)}{r.cancelReason ? `: ${r.cancelReason}` : ''}</Field> : null}
            </dl>
          </Card>

          <Card>
            <Label>Work billed</Label>
            {r.tasks.length === 0 ? <p className="mt-2 text-[14px] text-muted">No tasks listed ({BILLING_REASON_LABELS[r.reason].toLowerCase()}).</p> : null}
            <ul className="mt-2 space-y-1 text-[14px]">
              {r.tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t.title}</span>
                  <span className="font-mono text-[12px] text-muted">{STATUS_LABELS[t.statusType]}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <Label>Messages with {me.roles.includes('ACCOUNTS') ? 'the PM' : 'Accounts'}</Label>
            <ul className="mt-2 space-y-3">
              {r.messages.map((m) => (
                <li key={m.id} data-testid="billing-message">
                  <p className="text-[13px]">
                    <span className="font-semibold">{m.authorName}</span> <span className="font-mono text-[12px] text-muted">{formatDateTime(m.createdAt, me.timezone)}</span>
                  </p>
                  <p className="whitespace-pre-wrap text-[15px]">{m.body}</p>
                </li>
              ))}
              {r.messages.length === 0 ? <li className="text-[14px] text-muted">No messages yet.</li> : null}
            </ul>
            <BillingMessages requestId={r.id} />
          </Card>
        </div>

        <div className="space-y-4">
          {r.can.includes('PROCESS') ? <ProcessActions request={r} /> : null}
          {r.can.includes('EDIT') ? <OwnerActions request={r} /> : null}
          <Card>
            <Label>Billing contact</Label>
            {contact ? (
              <dl className="mt-2">
                <Field label="Name"><Masked value={contact.name} /></Field>
                <Field label="Email"><Masked value={contact.email} /></Field>
                <Field label="Phone"><Masked value={contact.phone} /></Field>
              </dl>
            ) : (
              <p className="mt-2 text-[14px] text-muted">No billing contact on the client yet; ask the PM.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
