import { DEPARTMENT_LABELS, shiftWeek, type CapacityView } from '@opshub/shared';
import { Card, Chip, Label, PageHeader, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@opshub/ui';
import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { AutoRefresh } from '@/lib/auto-refresh';
import { formatWeek, hours } from '@/lib/format';
import { LoadBar as Bar } from '@/lib/load-bar';

/** PRD 3.3: per member and per team, assigned estimate hours against available hours for a week. */
export default async function CapacityPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const [me, cap] = await Promise.all([getMe(), api<CapacityView>(`/capacity${week ? `?week=${encodeURIComponent(week)}` : ''}`)]);
  const canPlan = me.permissions.includes('planner.read');
  const nav = (w: string, label: string) => (
    <Link href={`/capacity?week=${w}`} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
      {label}
    </Link>
  );

  return (
    <>
      <AutoRefresh seconds={30} />
      <PageHeader
        title="Capacity"
        description="Estimate hours of open tasks against hours available after leave and office holidays. Over 100% is red."
        actions={
          <>
            {nav(shiftWeek(cap.week, -1), 'Previous')}
            <Link href="/capacity" className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
              This week
            </Link>
            {nav(shiftWeek(cap.week, 1), 'Next')}
          </>
        }
      />
      <div className="mb-4">
        <Chip tone="accent">{formatWeek(cap.week, cap.days)}</Chip>
      </div>

      <div className="grid gap-4">
        {cap.teams.map((t) => (
          <Card key={t.teamId ?? 'none'} className="p-0" data-testid="capacity-team">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-alt px-5 py-3">
              <div>
                <p className="font-semibold">{t.teamName}</p>
                <p className="font-mono text-[12px] text-muted">
                  {t.department ? DEPARTMENT_LABELS[t.department] : 'Staff without a team'} · {hours(t.assignedH)} of {hours(t.availableH)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Bar m={t} />
                {canPlan && t.teamId ? (
                  <Link href={`/planner/${t.teamId}?week=${cap.week}`} className="text-[14px] text-link">
                    Plan the week
                  </Link>
                ) : null}
              </div>
            </header>
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[640px] text-left text-[14px]">
                <TableHeader>
                  <TableRow className="text-[12px] text-muted">
                    <TableHead className="px-5 py-2 font-medium">Person</TableHead>
                    <TableHead className="px-2 py-2 font-medium">Weekly</TableHead>
                    <TableHead className="px-2 py-2 font-medium">Leave</TableHead>
                    <TableHead className="px-2 py-2 font-medium">Available</TableHead>
                    <TableHead className="px-2 py-2 font-medium">Assigned</TableHead>
                    <TableHead className="px-2 py-2 font-medium">Load</TableHead>
                    <TableHead className="px-5 py-2 font-medium">Unestimated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {t.members.map((m) => (
                    <TableRow key={m.userId} data-testid="capacity-member" data-over={m.over ? 'true' : 'false'}>
                      <TableCell className="px-5 py-2 font-semibold">{m.name}</TableCell>
                      <TableCell className="px-2 py-2 font-mono">{hours(m.weeklyCapacityH)}</TableCell>
                      <TableCell className="px-2 py-2">
                        {m.leaveDays ? <Chip tone="warning" className="px-2 py-0 text-[12px]">{m.leaveDays}d</Chip> : null}
                        {m.holidayDays ? <Chip tone="muted" className="ml-1 px-2 py-0 text-[12px]">holiday {m.holidayDays}d</Chip> : null}
                        {!m.leaveDays && !m.holidayDays ? <span className="text-muted">-</span> : null}
                      </TableCell>
                      <TableCell className="px-2 py-2 font-mono">{hours(m.availableH)}</TableCell>
                      <TableCell className={`px-2 py-2 font-mono ${m.over ? 'font-semibold text-error' : ''}`}>{hours(m.assignedH)}</TableCell>
                      <TableCell className="px-2 py-2">
                        <Bar m={m} />
                      </TableCell>
                      <TableCell className="px-5 py-2 font-mono text-muted">{m.unestimatedCount || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        ))}
        {cap.teams.length === 0 ? (
          <Card>
            <Label>Nothing to show</Label>
            <p className="mt-2 text-muted">No one in your view has hours this week.</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
