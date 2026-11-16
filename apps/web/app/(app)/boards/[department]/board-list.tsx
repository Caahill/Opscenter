import type { BoardView } from '@opshub/shared';
import { Card } from '@opshub/ui';
import Link from 'next/link';
import { HealthChip, StatusChip } from '@/lib/chips';
import { formatDate } from '@/lib/format';

export function BoardList({ board }: { board: BoardView }) {
  const rows = board.columns.flatMap((c) => c.projects.map((p) => ({ ...p, column: c.stageName })));
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[760px] text-left text-[14px]">
        <thead className="border-b border-border font-mono text-[12px] uppercase text-muted">
          <tr>
            <th className="px-4 py-3 font-medium">Client</th>
            <th className="px-4 py-3 font-medium">Stage</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">PM</th>
            <th className="px-4 py-3 font-medium">Open / overdue</th>
            <th className="px-4 py-3 font-medium">End or renewal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-alt">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3">
                <Link href={`/projects/${p.id}`} className="font-semibold hover:text-link">
                  {p.clientName}
                </Link>
                <p className="font-mono text-[12px] text-muted">{p.packageName ?? ''}</p>
              </td>
              <td className="px-4 py-3">{p.column}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  <StatusChip status={p.statusType} />
                  <HealthChip health={p.health} />
                </div>
              </td>
              <td className="px-4 py-3">{p.pmName}</td>
              <td className="px-4 py-3 font-mono">
                {p.openTaskCount ?? 0} / <span className={p.overdueTaskCount ? 'text-error' : undefined}>{p.overdueTaskCount ?? 0}</span>
              </td>
              <td className="px-4 py-3">{p.renewalDate ?? p.endDate ? formatDate((p.renewalDate ?? p.endDate)!) : ''}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-muted">
                No projects match.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Card>
  );
}
