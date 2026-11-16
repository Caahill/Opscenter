'use client';
import { BILLING_STATUS_LABELS, type TaskDetailView } from '@opshub/shared';
import { Button, Card, Chip, inputClass, Label } from '@opshub/ui';
import Link from 'next/link';
import { useState } from 'react';
import { send, useAction } from '@/lib/client';

/**
 * PRD 4.1: anyone on the task can flag it as work outside the package; the client's PM confirms
 * or rejects. A confirmed task closes only once a billing request lists it.
 */
export function BillableControls({ task, canDecide }: { task: TaskDetailView; canDecide: boolean }) {
  const { run, error, busy } = useAction();
  const [note, setNote] = useState('');
  const closed = task.statusType === 'DONE' || task.statusType === 'STOPPED';
  return (
    <Card data-testid="billable">
      <Label>Billing</Label>
      {!task.billable ? (
        <>
          <p className="mt-2 text-[14px] text-muted">Is this outside the client&apos;s package? Flag it so the PM can bill it.</p>
          {!closed ? (
            <div className="mt-2 grid gap-2">
              <input className={inputClass} aria-label="Why it is extra" placeholder="Why it is extra (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button type="button" variant="tertiary" disabled={busy} onClick={() => void run(() => send('POST', `/tasks/${task.id}/flag-billable`, { note: note || undefined }))}>
                Flag as extra work
              </Button>
            </div>
          ) : null}
        </>
      ) : !task.billableConfirmed ? (
        <>
          <Chip tone="warning" className="mt-2">Flagged as extra work</Chip>
          {canDecide ? (
            <div className="mt-2 flex gap-2">
              <Button type="button" variant="tertiary" disabled={busy} onClick={() => void run(() => send('POST', `/tasks/${task.id}/confirm-billable`, { decision: 'CONFIRM' }))}>
                Confirm billable
              </Button>
              <Button type="button" variant="danger" disabled={busy} onClick={() => void run(() => send('POST', `/tasks/${task.id}/confirm-billable`, { decision: 'REJECT' }))}>
                Reject
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-muted">The PM will confirm or reject it.</p>
          )}
        </>
      ) : (
        <>
          <Chip tone="accent" className="mt-2">Billable, confirmed</Chip>
          {task.billing ? (
            <p className="mt-2 text-[14px]">
              <Link href={`/billing/${task.billing.requestId}`} className="text-link">
                On a billing request ({BILLING_STATUS_LABELS[task.billing.status]})
              </Link>
            </p>
          ) : task.billing === null ? (
            <p className="mt-2 text-[14px] text-muted">
              Not billed yet: it can be closed once the PM raises a billing request.{' '}
              {canDecide ? (
                <Link href={`/projects/${task.projectId}?bill=${task.id}#billing`} className="text-link">
                  Raise one
                </Link>
              ) : null}
            </p>
          ) : (
            <p className="mt-2 text-[13px] text-muted">The PM bills it before it can be closed.</p>
          )}
        </>
      )}
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}
