import type { AuditLogView, MeView, Page } from '@opshub/shared';
import { Card, Chip, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDateTime, plural } from '@/lib/format';
import { NoAccess } from '../no-access';

const TONE: Record<string, 'accent' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  VIEW_UNMASKED: 'accent',
  REVEAL_CREDENTIAL: 'danger',
  ROLE_CHANGE: 'warning',
  USER_DEACTIVATED: 'warning',
  USER_CREATED: 'success',
};

/** Plain-English names for the actions the API records (apps/api: audit.record calls). */
const ACTION_LABELS: Record<string, string> = {
  VIEW_UNMASKED: 'Viewed hidden details',
  REVEAL_CREDENTIAL: 'Revealed a credential',
  CREDENTIAL_CREATED: 'Added a credential',
  CREDENTIAL_GRANTED: 'Shared a credential',
  CREDENTIAL_GRANT_REVOKED: 'Removed credential access',
  ROLE_CHANGE: 'Changed role',
  USER_CREATED: 'Added a user',
  USER_DEACTIVATED: 'Deactivated a user',
  USER_REACTIVATED: 'Reactivated a user',
  LOGIN: 'Signed in',
  LEAVE_RECORDED: 'Recorded leave',
  LEAVE_CHANGED: 'Changed leave',
  LEAVE_DELETED: 'Deleted leave',
  HOLIDAY_CHANGED: 'Changed holidays',
  MAILBOX_CONNECTED: 'Connected a mailbox',
  MAILBOX_DISCONNECTED: 'Disconnected a mailbox',
  PACKAGE_CHANGED: 'Changed a package',
  PIPELINE_VERSION_CREATED: 'Changed a pipeline',
  WHATSAPP_IMPORT: 'Imported a WhatsApp chat',
};
const actionLabel = (a: string) => ACTION_LABELS[a] ?? a;

/** Filter buttons, most sensitive first. */
const FILTERS = ['REVEAL_CREDENTIAL', 'VIEW_UNMASKED', 'ROLE_CHANGE', 'USER_CREATED', 'USER_DEACTIVATED', 'LOGIN'];

function describe(row: AuditLogView): string {
  const meta = row.meta as Record<string, unknown>;
  if (row.action === 'VIEW_UNMASKED' && Array.isArray(meta.fields)) return `${row.entity}: ${meta.fields.join(', ')}`;
  if (row.action === 'ROLE_CHANGE') return `${(meta.from as string[]).join(', ')} to ${(meta.to as string[]).join(', ')}`;
  if (row.action === 'USER_DEACTIVATED') return `${plural(Number(meta.tasksReassigned), 'task')} reassigned, ${plural(Number(meta.grantsRevoked), 'grant')} revoked`;
  if (row.action === 'LOGIN') return `via ${String(meta.method)}`;
  return row.entity;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ cursor?: string; action?: string }> }) {
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('audit.read')) return <NoAccess title="Audit log" />;
  const { cursor, action } = await searchParams;
  const qs = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}), ...(action ? { action } : {}) });
  const data = await api<Page<AuditLogView>>(`/audit-log?${qs}`);

  return (
    <>
      <PageHeader title="Audit log" description="Who saw hidden client details, revealed a password or changed someone’s access, and when." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/audit">
          <Chip tone={action ? 'neutral' : 'accent'}>All</Chip>
        </Link>
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/audit?action=${f}`}>
            <Chip tone={action === f ? 'accent' : 'neutral'}>{actionLabel(f)}</Chip>
          </Link>
        ))}
      </div>
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-[14px]">
          <thead className="border-b border-border font-mono text-[12px] uppercase text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Who</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-alt">
            {data.items.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{formatDateTime(row.at, me.timezone)}</td>
                <td className="px-4 py-3">{row.actorName ?? row.actorId}</td>
                <td className="px-4 py-3">
                  <Chip tone={TONE[row.action] ?? 'neutral'} title={row.action}>
                    {actionLabel(row.action)}
                  </Chip>
                </td>
                <td className="px-4 py-3 text-muted">{describe(row)}</td>
              </tr>
            ))}
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  {action ? `No “${actionLabel(action)}” entries yet.` : 'Nothing logged yet.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
      {data.nextCursor ? (
        <div className="mt-4">
          <Link className="text-link" href={`/admin/audit?${new URLSearchParams({ cursor: data.nextCursor, ...(action ? { action } : {}) })}`}>
            Older entries
          </Link>
        </div>
      ) : null}
    </>
  );
}
