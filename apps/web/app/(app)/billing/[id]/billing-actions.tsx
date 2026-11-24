'use client';
import { CURRENCIES, type BillingRequestDetailView } from '@opshub/shared';
import { Button, Card, Input, Label, NativeSelect, Textarea } from '@opshub/ui';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';

const today = () => new Date().toISOString().slice(0, 10);

/** Accounts (TechSpec 9.4): Requested -> Invoiced -> Paid, or Cancelled (a credit note once invoiced). */
export function ProcessActions({ request }: { request: BillingRequestDetailView }) {
  const { run, error, busy } = useAction();
  const [form, setForm] = useState({ invoiceNo: request.invoiceNo ?? '', invoicedAt: today(), paidAt: today(), cancelReason: '' });
  const patch = (body: Record<string, unknown>) => run(() => send('PATCH', `/billing-requests/${request.id}`, body));
  return (
    <Card>
      <Label>Process</Label>
      {request.status === 'REQUESTED' ? (
        <form
          className="mt-3 grid gap-2"
          aria-label="Mark invoiced"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void patch({ status: 'INVOICED', invoiceNo: form.invoiceNo, invoicedAt: form.invoicedAt });
          }}
        >
          <Input aria-label="Invoice number" placeholder="Invoice number" required value={form.invoiceNo} onChange={(e) => setForm({ ...form, invoiceNo: e.target.value })} />
          <label className="text-[13px] text-muted">
            Invoice date
            <Input type="date" value={form.invoicedAt} onChange={(e) => setForm({ ...form, invoicedAt: e.target.value })} />
          </label>
          <Button type="submit" disabled={busy}>
            Mark invoiced
          </Button>
        </form>
      ) : null}
      {request.status === 'INVOICED' ? (
        <form
          className="mt-3 grid gap-2"
          aria-label="Mark paid"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            void patch({ status: 'PAID', paidAt: form.paidAt });
          }}
        >
          <label className="text-[13px] text-muted">
            Paid on
            <Input type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} />
          </label>
          <Button type="submit" disabled={busy}>
            Mark paid
          </Button>
        </form>
      ) : null}
      <div className="mt-4 grid gap-2 border-t border-surface-alt pt-3">
        <Input aria-label="Cancel reason" placeholder={request.status === 'INVOICED' ? 'Reason (credit note)' : 'Reason'} value={form.cancelReason} onChange={(e) => setForm({ ...form, cancelReason: e.target.value })} />
        <Button type="button" variant="danger" disabled={busy || !form.cancelReason} onClick={() => void patch({ status: 'CANCELLED', cancelReason: form.cancelReason })}>
          Cancel request
        </Button>
      </div>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}

/** The client's PM, while the request is still Requested. */
export function OwnerActions({ request }: { request: BillingRequestDetailView }) {
  const { run, error, busy } = useAction();
  const [form, setForm] = useState({ amount: request.amount ?? '', currency: request.currency, description: request.description, cancelReason: '' });
  return (
    <Card>
      <Label>Change or cancel</Label>
      <form
        className="mt-3 grid gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void run(() => send('PATCH', `/billing-requests/${request.id}`, { amount: form.amount, currency: form.currency, description: form.description }));
        }}
      >
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <Input aria-label="Amount" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <NativeSelect aria-label="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </div>
        <Textarea className="min-h-20" aria-label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <Button type="submit" variant="tertiary" disabled={busy}>
          Save changes
        </Button>
      </form>
      <div className="mt-3 grid gap-2 border-t border-surface-alt pt-3">
        <Input aria-label="Cancel reason" placeholder="Reason" value={form.cancelReason} onChange={(e) => setForm({ ...form, cancelReason: e.target.value })} />
        <Button type="button" variant="danger" disabled={busy || !form.cancelReason} onClick={() => void run(() => send('PATCH', `/billing-requests/${request.id}`, { status: 'CANCELLED', cancelReason: form.cancelReason }))}>
          Cancel request
        </Button>
      </div>
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}

export function BillingMessages({ requestId }: { requestId: string }) {
  const { run, error, busy } = useAction();
  const [body, setBody] = useState('');
  return (
    <form
      className="mt-3 grid gap-2"
      aria-label="Message"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        const ok = await run(() => send('POST', `/billing-requests/${requestId}/messages`, { body }));
        if (ok) setBody('');
      }}
    >
      <Textarea className="min-h-16" aria-label="Message text" placeholder="Write a message" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" variant="secondary" disabled={busy || !body.trim()}>
        Send
      </Button>
      {error ? <p className="text-[14px] text-error">{error}</p> : null}
    </form>
  );
}
