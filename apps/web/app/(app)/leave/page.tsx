import { LEAVE_KIND_LABELS, todayIn, DEFAULT_TIMEZONE, type HolidayView, type LeaveView, type UserView } from '@opshub/shared';
import { Card, Chip, EmptyState, Label, Masked, PageHeader } from '@opshub/ui';
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
  const today = todayIn(DEFAULT_TIMEZONE);
  const upcoming = holidays.filter((h) => h.date.slice(0, 10) >= today);
  const next = upcoming[0];
  const daysUntil = (date: string) => Math.round((Date.parse(`${date.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

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
          <Card className="p-0">
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div>
                <Label>Office holidays</Label>
                <p className="mt-1 text-xs text-muted">
                  {holidays.length === 0
                    ? 'None recorded yet'
                    : `${holidays.length} ${holidays.length === 1 ? 'holiday' : 'holidays'}${upcoming.length && year === thisYear ? ` · ${upcoming.length} still to come` : ''}`}
                </p>
              </div>
              {/* shadcn-style segmented control for the year */}
              <nav aria-label="Holiday year" className="flex rounded-lg bg-surface-alt p-0.5 text-[13px]">
                {[thisYear, thisYear + 1].map((y) => (
                  <Link
                    key={y}
                    href={y === thisYear ? '/leave' : `/leave?year=${y}`}
                    aria-current={y === year ? 'true' : undefined}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${y === year ? 'bg-canvas text-body shadow-card' : 'text-muted hover:text-body'}`}
                  >
                    {y}
                  </Link>
                ))}
              </nav>
            </div>

            {next ? (
              <div className="mx-5 mt-4 flex items-center gap-3 rounded-lg bg-primary px-3 py-2.5 text-on-primary">
                <span className="text-xs font-medium uppercase tracking-wide opacity-70">Next</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{next.name}</span>
                <span className="text-xs opacity-80">
                  {formatDay(next.date)} · {daysUntil(next.date) === 0 ? 'today' : daysUntil(next.date) === 1 ? 'tomorrow' : `in ${daysUntil(next.date)} days`}
                </span>
              </div>
            ) : null}

            <ul className="mt-3 px-2 pb-2">
              {holidays.map((h) => {
                const day = h.date.slice(0, 10);
                const past = day < today;
                const d = new Date(`${day}T00:00:00Z`);
                return (
                  <li key={h.id} className={`group flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface ${past ? 'opacity-55' : ''}`}>
                    <span
                      aria-hidden
                      className={`flex w-11 shrink-0 flex-col items-center rounded-md border py-1 leading-none ${next?.id === h.id ? 'border-primary bg-primary text-on-primary' : 'border-border bg-canvas'}`}
                    >
                      <span className={`text-[10px] font-medium uppercase ${next?.id === h.id ? 'opacity-80' : 'text-muted'}`}>
                        {d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}
                      </span>
                      <span className="mt-0.5 text-[15px] font-semibold tabular-nums">{d.getUTCDate()}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{h.name}</span>
                      <span className="block text-xs text-muted">
                        {d.toLocaleString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
                        {past ? ' · passed' : ''}
                      </span>
                    </span>
                    {h.location !== 'IN' ? <Chip tone="muted">{h.location}</Chip> : null}
                    {holidaysManage ? <RemoveHoliday id={h.id} name={h.name} /> : null}
                  </li>
                );
              })}
              {holidays.length === 0 ? (
                <li>
                  <EmptyState title={`No holidays for ${year} yet`} hint="Add them one by one below, or paste the whole list from HR." className="py-6" />
                </li>
              ) : null}
            </ul>
            {holidaysManage ? (
              <div className="border-t border-border px-5 pt-1 pb-5">
                <HolidayForm />
                <BulkHolidayForm existing={holidays} />
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </>
  );
}
