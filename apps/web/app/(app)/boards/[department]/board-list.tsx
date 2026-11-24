import type { BoardView } from '@opshub/shared';
import { Card, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@opshub/ui';
import Link from 'next/link';
import { HealthChip, StatusChip } from '@/lib/chips';
import { formatDate } from '@/lib/format';

export function BoardList({ board }: { board: BoardView }) {
  const rows = board.columns.flatMap((c) => c.projects.map((p) => ({ ...p, column: c.stageName })));
  return (
    <Card className="overflow-x-auto p-0">
      <Table className="w-full min-w-[760px] text-left text-[14px]">
        <TableHeader className="border-b border-border text-[12px] text-muted">
          <TableRow>
            <TableHead className="px-4 py-3 font-medium">Client</TableHead>
            <TableHead className="px-4 py-3 font-medium">Stage</TableHead>
            <TableHead className="px-4 py-3 font-medium">Status</TableHead>
            <TableHead className="px-4 py-3 font-medium">PM</TableHead>
            <TableHead className="px-4 py-3 font-medium">Open / overdue</TableHead>
            <TableHead className="px-4 py-3 font-medium">End or renewal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="px-4 py-3">
                <Link href={`/projects/${p.id}`} className="font-semibold hover:text-link">
                  {p.clientName}
                </Link>
                <p className="font-mono text-[12px] text-muted">{p.packageName ?? ''}</p>
              </TableCell>
              <TableCell className="px-4 py-3">{p.column}</TableCell>
              <TableCell className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  <StatusChip status={p.statusType} />
                  <HealthChip health={p.health} />
                </div>
              </TableCell>
              <TableCell className="px-4 py-3">{p.pmName}</TableCell>
              <TableCell className="px-4 py-3 font-mono">
                {p.openTaskCount ?? 0} / <span className={p.overdueTaskCount ? 'text-error' : undefined}>{p.overdueTaskCount ?? 0}</span>
              </TableCell>
              <TableCell className="px-4 py-3">{p.renewalDate ?? p.endDate ? formatDate((p.renewalDate ?? p.endDate)!) : ''}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="px-4 py-8 text-center text-muted">
                No projects match.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </Card>
  );
}
