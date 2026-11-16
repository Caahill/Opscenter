import type { AuditLogView, MeView, Page } from '@opshub/shared';
import { Card, Chip, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { NoAccess } from '../no-access';

const TONE: Record<string, 'accent' | 'warning' | 'success' | 'neutral'> = {
  VIEW_UNMASKED: 'accent',
  REVEAL_CREDENTIAL: 'accent',
  ROLE_CHANGE: 'warning',
  USER_DEACTIVATED: 'warning',
  USER_CREATED: 'success',
};

function describe(row: AuditLogView): string {
  const meta = row.meta as Record<string, unknown>;
  if (row.action === 'VIEW_UNMASKED' && Array.isArray(meta.fields)) return `${row.entity}: ${meta.fields.join(', ')}`;
  if (row.action === 'ROLE_CHANGE') return `${(meta.from as string[]).join(', ')} to ${(meta.to as string[]).join(', ')}`;
  if (row.action === 'USER_DEACTIVATED') return `${String(meta.tasksReassigned)} tasks reassigned, ${String(meta.grantsRevoked)} grants revoked`;
  if (row.action === 'LOGIN') return `via ${String(meta.method)}`;
  return row.entity;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ cursor?: string; action?: string }> }) {
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('audit.read')) return <NoAccess title="Audit log" />;
  const { cursor, action } = await searchParams;
  const qs = new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}), ...(action ? { action } : {}) });
  const data = await api<Page<AuditLogView>>(`/audit-log?${qs}`);
  const filters = ['VIEW_UNMASKED', 'ROLE_CHANGE', 'USER_CREATED', 'USER_DEACTIVATED', 'LOGIN'];

  return (
    <>
      <PageHeader title="Audit log" description="Every view of unmasked client data, every credential reveal and every role change, with who and when (PRD 7.4)." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/audit">
          <Chip tone={action ? 'neutral' : 'accent'}>All</Chip>
        </Link>
        {filters.map((f) => (
          <Link key={f} href={`/admin/audit?action=${f}`}>
            <Chip tone={action === f ? 'accent' : 'neutral'}>{f}</Chip>
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
                  <Chip tone={TONE[row.action] ?? 'neutral'}>{row.action}</Chip>
                </td>
                <td className="px-4 py-3 text-muted">{describe(row)}</td>
              </tr>
            ))}
            {data.items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Nothing logged yet.
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
