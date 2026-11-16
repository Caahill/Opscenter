import { TRIAGE_CATEGORY_LABELS, type MessageView } from '@opshub/shared';
import { Chip, Masked } from '@opshub/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDateTime } from '@/lib/format';

const list = (v: string[] | string | undefined) => (Array.isArray(v) ? v.join(', ') : v);

/**
 * One message as the API served it: real addresses and the original body for the client's PM and
 * Admin, labels and masked text for everyone else. Nothing is hidden or added here.
 */
export function MessageCard({ m, timezone, children }: { m: MessageView; timezone: string; children?: ReactNode }) {
  // Every message has the same card; only what arrived since you last opened the thread stands out.
  return (
    <article
      data-testid="message"
      data-unread={m.unread ? 'true' : undefined}
      className={`rounded-xl border bg-canvas p-4 ${m.unread ? 'border-accent shadow-card ring-2 ring-pale-purple' : 'border-border'}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{m.sender}</p>
          <p className="font-mono text-[12px] text-muted">
            {m.from !== undefined && m.from !== m.sender ? (
              <>
                <Masked value={m.from} />
                {' · '}
              </>
            ) : null}
            to <Masked value={list(m.to)} />
            {m.cc && (Array.isArray(m.cc) ? m.cc.length : true) ? (
              <>
                {' · cc '}
                <Masked value={list(m.cc)} />
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {m.unread ? <Chip tone="accent" className="px-2 py-0 text-[11px]">New</Chip> : null}
          <Chip tone="muted" className="px-2 py-0 text-[11px]">
            {m.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
          </Chip>
          {m.category && m.triageState === 'CONFIRMED' ? <Chip tone="accent" className="px-2 py-0 text-[11px]">{TRIAGE_CATEGORY_LABELS[m.category]}</Chip> : null}
          {m.triageState === 'DISMISSED' ? <Chip tone="muted" className="px-2 py-0 text-[11px]">No action</Chip> : null}
          <span className="font-mono text-[12px] text-muted">{formatDateTime(m.sentAt, timezone)}</span>
        </div>
      </header>
      {m.subject ? <p className="mt-2 font-semibold">{m.subject}</p> : null}
      <div className="mt-2 text-[15px] leading-relaxed" data-testid="message-body">
        <Masked value={m.body ?? m.snippet} multiline />
      </div>
      {m.attachments.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {m.attachments.map((a) => (
            <li key={a.index}>
              <a href={`/api/v1/inbox/messages/${m.id}/attachments/${a.index}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 font-mono text-[12px] hover:border-border-strong">
                {a.fileName}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {m.taskId && m.triageState === 'CONFIRMED' ? (
        <p className="mt-3 text-[14px]">
          <Link href={`/tasks/${m.taskId}`} className="text-link">
            Open the task
          </Link>
          {m.triagedByName ? <span className="text-muted"> · triaged by {m.triagedByName}</span> : null}
        </p>
      ) : null}
      {children}
    </article>
  );
}
