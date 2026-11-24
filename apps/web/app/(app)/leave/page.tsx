import { LEAVE_KIND_LABELS, todayIn, DEFAULT_TIMEZONE, type HolidayView, type LeaveView, type UserView } from '@opshub/shared';
import { Card, EmptyState, Label, Masked, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { formatDay, formatLeave } from '@/lib/format';
import { BulkHolidayForm, HolidayForm, LeaveForm, LeaveRowActions, RemoveHoliday } from './leave-forms';

/** PRD 3.1: HR records leave; everyone else sees availability within their scope. */
export default async function LeavePage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await getMe();
  const manage = me.permissions.includes('leave.manage');
  const holidaysManage = me.permissions.includes('holiday.manage');
  const thisYear = Number(todayIn(DEFAULT_TIMEZONE).slice(0, 4));
  const asked = Number((await searchParams).year);
  // This year or next: HR usually publishes next year's list in December.
  const year = asked === thisYear + 1 ? asked : thisYear;
  const [leave, holidays, users] = await Promise.all([
    api<LeaveView[]>('/leave'),
    api<HolidayView[]>(`/holidays?year=${year}`),
    manage ? api<UserView[]>('/users') : Promise.resolve([] as UserView[]),
  ]);
  const showReason = leave.some((l) => 'reason' in l || 'kind' in l);

  return (
    <>
      <PageHeader
        title="Leave"
        description={
          manage
            ? 'Record leave once: every planner and capacity view updates, and the Team Leader and affected PMs are alerted.'
            : 'Who is out, now and coming up. Reasons are kept by HR.'
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card className="p-0">
          <div className="border-b border-surface-alt px-5 py-3">
            <Label>Current and upcoming</Label>
          </div>
          {leave.length === 0 ? (
            <EmptyState title="No upcoming leave" hint="Leave recorded from today onwards will show here, with the tasks it affects." />
          ) : (
            <ul className="divide-y divide-surface-alt">
              {leave.map((l) => (
                <li key={l.id} className="px-5 py-3" data-testid="leave-row">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">{l.userName}</p>
                    <p className="font-mono text-[13px] text-muted">
                      {formatLeave(l.startDate, l.endDate, l.halfDay)} · {l.days} {l.days === 1 ? 'working day' : 'working days'}
                    </p>
                  </div>
                  {showReason ? (
                    <p className="mt-1 text-[14px] text-muted">
                      {l.kind ? `${LEAVE_KIND_LABELS[l.kind]} · ` : ''}
                      <Masked value={l.reason} />
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-[14px]">
                    <Link href={`/leave/${l.id}`} className="text-link">
                      Tasks affected
                    </Link>
                    {manage ? <LeaveRowActions leave={l} /> : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid content-start gap-4">
          {manage ? (
            <Card>
              <Label>Record leave</Label>
              <LeaveForm users={users.filter((u) => u.active)} />
            </Card>
          ) : null}
          <Card>
            <div className="flex items-center justify-between gap-2">
              <Label>Office holidays {year}</Label>
              <span className="flex gap-1 text-[13px]">
                {[thisYear, thisYear + 1].map((y) => (
                  <Link
                    key={y}
                    href={y === thisYear ? '/leave' : `/leave?year=${y}`}
                    aria-current={y === year ? 'true' : undefined}
                    className={`rounded-md px-2 py-0.5 ${y === year ? 'bg-pale-purple font-semibold text-accent-pressed' : 'text-muted hover:text-body'}`}
                  >
                    {y}
                  </Link>
                ))}
              </span>
            </div>
            <ul className="mt-3 space-y-1 text-[14px]">
              {holidays.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2">
                  <span>
                    {formatDay(h.date)} · {h.name} <span className="font-mono text-[12px] text-muted">{h.location}</span>
                  </span>
                  {holidaysManage ? <RemoveHoliday id={h.id} name={h.name} /> : null}
                </li>
              ))}
              {holidays.length === 0 ? <li className="text-muted">No holidays recorded for {year} yet.</li> : null}
            </ul>
            {holidaysManage ? (
              <>
                <HolidayForm />
                <BulkHolidayForm existing={holidays} />
              </>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
