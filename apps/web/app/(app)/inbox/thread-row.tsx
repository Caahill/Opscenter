import type { ThreadSummaryView } from '@opshub/shared';
import { Chip, Masked } from '@opshub/ui';
import Link from 'next/link';
import { formatDateTime } from '@/lib/format';

export const threadHref = (key: string) => `/inbox/${encodeURIComponent(key)}`;

export function ThreadRow({ t, timezone }: { t: ThreadSummaryView; timezone: string }) {
  return (
    <li data-testid="thread-row" data-unread={t.unread ? 'true' : undefined}>
      <Link href={threadHref(t.threadKey)} className="flex gap-3 px-4 py-3 hover:bg-surface">
        <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${t.unread ? 'bg-accent' : 'bg-transparent'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={`truncate ${t.unread ? 'font-bold' : 'font-medium'}`}>
              {t.sender}
              {t.unread ? <span className="sr-only"> (unread)</span> : null}
            </p>
            <span className={`font-mono text-[12px] ${t.unread ? 'font-semibold text-body' : 'text-muted'}`}>{formatDateTime(t.lastAt, timezone)}</span>
          </div>
          <p className={`truncate text-[14px] ${t.unread ? 'font-semibold' : ''}`}>
            {t.subject ? <Masked value={t.subject} /> : <span className="text-muted">{t.channel === 'WHATSAPP' ? 'WhatsApp chat' : '(no subject)'}</span>}
            {t.messageCount > 1 ? <span className="ml-1 font-mono text-[12px] text-muted">({t.messageCount})</span> : null}
          </p>
          <p className="truncate text-[13px] text-muted">{t.snippet}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Chip tone="muted" className="px-2 py-0 text-[11px]">
              {t.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
            </Chip>
            {t.needsTriage ? <Chip tone="accent" className="px-2 py-0 text-[11px]">Needs triage</Chip> : null}
            {t.unmatched ? <Chip tone="warning" className="px-2 py-0 text-[11px]">Unmatched</Chip> : null}
            {t.mailboxLabel ? <span className="font-mono text-[11px] text-muted">{t.mailboxLabel}</span> : null}
          </div>
        </div>
      </Link>
    </li>
  );
}
