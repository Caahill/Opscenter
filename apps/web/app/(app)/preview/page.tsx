import type { PolicyPreviewView } from '@opshub/shared';
import { Card, Chip, Field, Label, Masked, PageHeader } from '@opshub/ui';
import { notFound } from 'next/navigation';
import { api, isDevAuth } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';

export default async function PolicyPreviewPage() {
  if (!isDevAuth()) notFound();
  const p = await api<PolicyPreviewView>('/dev/policy-preview');

  return (
    <>
      <PageHeader
        title="Privacy preview"
        description="One invented client, Demo Co, as the API sends it to you. Sign in as another role to compare. Nothing here is hidden by the browser: fields you cannot see were never sent."
      />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-[14px] text-muted">
        You are viewing as
        {p.viewerClasses.map((c) => (
          <Chip key={c} tone="accent">
            {c}
          </Chip>
        ))}
        <span>(Demo Co is assigned to Pavan PM)</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <Label>Client</Label>
          <dl className="mt-3">
            <Field label="Company">
              <Masked value={p.client.companyName} />
            </Field>
            <Field label="Website">
              <Masked value={p.client.website} />
            </Field>
            <Field label="Contract value">
              <Masked value={p.client.contractValue ? formatMoney(p.client.contractValue, 'INR') : p.client.contractValue} />
            </Field>
            <Field label="GSTIN">
              <Masked value={p.client.taxId} />
            </Field>
          </dl>
        </Card>

        <Card>
          <Label>Billing request</Label>
          <dl className="mt-3">
            <Field label="Reason">
              <Masked value={p.billingRequest.reason} />
            </Field>
            <Field label="Amount">
              <Masked value={p.billingRequest.amount ? formatMoney(p.billingRequest.amount, p.billingRequest.currency) : p.billingRequest.amount} />
            </Field>
          </dl>
        </Card>

        {p.contacts.map((c, i) => (
          <Card key={c.id ?? i}>
            <Label>{c.label ?? 'Contact'}</Label>
            <dl className="mt-3">
              <Field label="Name">
                <Masked value={c.name} />
              </Field>
              <Field label="Email">
                <Masked value={c.email} />
              </Field>
              <Field label="Phone">
                <Masked value={c.phone} />
              </Field>
            </dl>
          </Card>
        ))}

        <Card className="lg:col-span-2">
          <Label>Client message (WhatsApp)</Label>
          <dl className="mt-3">
            <Field label="From">
              <Masked value={p.message.from} />
            </Field>
            <Field label="Message">
              <Masked value={p.message.body} multiline />
            </Field>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <Label>Leave</Label>
          <dl className="mt-3">
            <Field label="Who">{p.leave.userName}</Field>
            <Field label="Dates">
              {formatDate(p.leave.startDate)} to {formatDate(p.leave.endDate)}
            </Field>
            <Field label="Reason">
              <Masked value={p.leave.reason} />
            </Field>
          </dl>
        </Card>
      </div>
    </>
  );
}
