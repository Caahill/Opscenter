// Role dashboards on Home (PRD 6.1, 6.2). Each block shows what one /dashboards/* call returned for
// this person; the API builds every number from their own scope.
import {
  BILLING_STATUS_LABELS,
  DEPARTMENT_LABELS,
  STATUS_LABELS,
  type AccountsDashboardView,
  type AdminDashboardView,
  type HrDashboardView,
  type LeaveView,
  type MeDashboardView,
  type MoneyTotalView,
  type PmDashboardView,
  type ProjectRefView,
  type RenewalView,
  type StatusType,
  type TaskView,
  type TeamLoadView,
  type ThreadSummaryView,
  type TlDashboardView,
} from '@opshub/shared';
import { Card, Label } from '@opshub/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatDate, formatDay, formatLeave, formatMoney, hours } from '@/lib/format';
import { LoadBar } from '@/lib/load-bar';
import { ThreadRow } from './inbox/thread-row';

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <section className="mt-8" data-testid={testId}>
      <h2 className="mb-3 font-display text-[22px] font-[650] tracking-[-0.02em]">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: ReactNode; href?: string; tone?: 'warning' | 'error' }) {
  const body = (
    <Card className="h-full">
      <Label>{label}</Label>
      <p className={`mt-2 font-display text-[32px] font-[650] leading-none tracking-[-0.03em] ${tone === 'error' ? 'text-error' : tone === 'warning' ? 'text-warning' : ''}`}>{value}</p>
    </Card>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-90" data-testid={`stat-${label}`}>
      {body}
    </Link>
  ) : (
    <div data-testid={`stat-${label}`}>{body}</div>
  );
}

const Stats = ({ children }: { children: ReactNode }) => <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{children}</div>;

function ListCard({ title, empty, children, count }: { title: string; empty: string; count: number; children: ReactNode }) {
  return (
    <Card className="p-0">
      <div className="flex items-baseline justify-between px-4 pt-4">
        <Label>{title}</Label>
        <span className="font-mono text-[12px] text-muted">{count}</span>
      </div>
      {count === 0 ? <p className="px-4 py-5 text-[14px] text-muted">{empty}</p> : <ul className="mt-2 divide-y divide-surface-alt">{children}</ul>}
    </Card>
  );
}

const money = (totals: MoneyTotalView[]) => (totals.length ? totals.map((t) => formatMoney(t.amount, t.currency)).join(' + ') : '0');

function Projects({ title, empty, list, timezone }: { title: string; empty: string; list: ProjectRefView[]; timezone: string }) {
  return (
    <ListCard title={title} empty={empty} count={list.length}>
      {list.map((p) => (
        <li key={p.id}>
          <Link href={`/projects/${p.id}`} className="block px-4 py-2 hover:bg-surface">
            <p className="font-medium">
              {p.clientName} · {DEPARTMENT_LABELS[p.department]}
            </p>
            <p className="font-mono text-[12px] text-muted">
              {p.stageName}
              {p.since ? ` · since ${formatDate(p.since, timezone)}` : ''}
            </p>
          </Link>
        </li>
      ))}
    </ListCard>
  );
}

function Tasks({ title, empty, list, timezone }: { title: string; empty: string; list: TaskView[]; timezone: string }) {
  return (
    <ListCard title={title} empty={empty} count={list.length}>
      {list.map((t) => (
        <li key={t.id}>
          <Link href={`/tasks/${t.id}`} className="block px-4 py-2 hover:bg-surface">
            <p className="font-medium">{t.title}</p>
            <p className="font-mono text-[12px] text-muted">
              {t.clientName}
              {t.department ? ` · ${DEPARTMENT_LABELS[t.department]}` : ''}
              {t.assigneeName ? ` · ${t.assigneeName}` : ''}
              {t.dueDate ? ` · due ${formatDate(t.dueDate, timezone)}` : ''}
            </p>
          </Link>
        </li>
      ))}
    </ListCard>
  );
}

function Threads({ list, timezone }: { list: ThreadSummaryView[]; timezone: string }) {
  return (
    <ListCard title="Client messages waiting over 4 working hours" empty="Every client message has a reply." count={list.length}>
      {list.map((t) => (
        <ThreadRow key={t.threadKey} t={t} timezone={timezone} />
      ))}
    </ListCard>
  );
}

function Renewals({ list, timezone }: { list: RenewalView[]; timezone: string }) {
  return (
    <ListCard title="Renewals in the next 30 days" empty="No renewals due." count={list.length}>
      {list.map((r) => (
        <li key={r.projectId}>
          <Link href={`/projects/${r.projectId}`} className="block px-4 py-2 hover:bg-surface">
            <p className="font-medium">
              {r.clientName} · {r.packageName ?? DEPARTMENT_LABELS[r.department]}
            </p>
            <p className={`font-mono text-[12px] ${r.daysLeft <= 7 ? 'text-error' : 'text-muted'}`}>
              ends {formatDate(r.endDate, timezone)} · {r.daysLeft} {r.daysLeft === 1 ? 'day' : 'days'} left
              {r.billingRequestId ? ' · billed' : ''}
            </p>
          </Link>
        </li>
      ))}
    </ListCard>
  );
}

function Leave({ title, list }: { title: string; list: LeaveView[] }) {
  return (
    <ListCard title={title} empty="Nobody is out." count={list.length}>
      {list.map((l) => (
        <li key={l.id} className="px-4 py-2">
          <p className="font-medium">{l.userName}</p>
          <p className="font-mono text-[12px] text-muted">{formatLeave(l.startDate, l.endDate, l.halfDay)}</p>
        </li>
      ))}
    </ListCard>
  );
}

function TeamLoad({ teams }: { teams: TeamLoadView[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[520px] text-[15px]">
        <thead>
          <tr className="text-left font-mono text-[12px] uppercase text-muted">
            <th className="px-4 py-3 font-normal">Team this week</th>
            <th className="px-4 py-3 font-normal">Assigned / available</th>
            <th className="px-4 py-3 font-normal">Load</th>
            <th className="px-4 py-3 text-right font-normal">Overdue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-alt">
          {teams.map((t) => (
            <tr key={t.teamId ?? t.teamName} data-testid="team-load">
              <td className="px-4 py-2 font-medium">{t.teamName}</td>
              <td className="px-4 py-2 font-mono text-[13px]">
                {hours(t.assignedH)} / {hours(t.availableH)}
              </td>
              <td className="px-4 py-2">
                <LoadBar m={t} />
              </td>
              <td className={`px-4 py-2 text-right font-mono text-[13px] ${t.overdue ? 'font-semibold text-error' : 'text-muted'}`}>{t.overdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function AdminDashboard({ d, timezone }: { d: AdminDashboardView; timezone: string }) {
  return (
    <Section title="Business overview" testId="dashboard-admin">
      <Stats>
        <Stat label="Active clients" value={d.activeClients} href="/clients" />
        <Stat label="Open projects" value={d.activeProjects} href="/boards" />
        <Stat label="At risk or blocked" value={d.atRisk.length} tone={d.atRisk.length ? 'warning' : undefined} />
        <Stat label="Renewals in 30 days" value={d.renewalsDue} href="/billing?tab=renewals" />
      </Stats>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {d.byDepartment.map((dep) => (
          <Card key={dep.department} className="p-0">
            <Link href={`/boards/${dep.department}`} className="flex items-baseline justify-between px-4 pt-4 hover:text-link">
              <Label>{DEPARTMENT_LABELS[dep.department]}</Label>
              <span className="font-mono text-[13px]">{dep.total}</span>
            </Link>
            <ul className="mt-2 px-4 pb-4 text-[14px]">
              {dep.stages.map((s) => (
                <li key={s.key} className="flex justify-between gap-3 py-0.5">
                  <span className="truncate text-muted">{s.label}</span>
                  <span className="font-mono">{s.count}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <div className="mt-4">
        <TeamLoad teams={d.teams} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Threads list={d.unanswered} timezone={timezone} />
        <Card>
          <Label>Billing not yet paid</Label>
          <p className="mt-2 text-[15px]" data-testid="billing-pending">
            {d.billingPending.length ? d.billingPending.map((b) => `${formatMoney(b.amount, b.currency)} (${b.count})`).join(', ') : 'Nothing outstanding.'}
          </p>
          <Link href="/billing" className="mt-2 inline-block text-[14px] text-link">
            Open billing
          </Link>
        </Card>
        <Projects title="At risk or blocked" empty="No projects at risk." list={d.atRisk} timezone={timezone} />
        <Projects title="On hold" empty="No projects on hold." list={d.onHold} timezone={timezone} />
        <Projects title="Stopped this month" empty="No projects stopped this month." list={d.stoppedThisMonth} timezone={timezone} />
      </div>
    </Section>
  );
}

export function PmDashboard({ d, timezone }: { d: PmDashboardView; timezone: string }) {
  return (
    <Section title="Your clients" testId="dashboard-pm">
      <Stats>
        <Stat label="Active clients" value={d.clients} href="/clients" />
        <Stat label="Messages to triage" value={d.needsTriage} href="/inbox?view=triage" tone={d.needsTriage ? 'warning' : undefined} />
        <Stat label="Extra work to confirm" value={d.billableToConfirm.length} href="/billing" tone={d.billableToConfirm.length ? 'warning' : undefined} />
        <Stat label="Open billing requests" value={d.billingOpen} href="/billing" />
      </Stats>
      <div className="mt-4 flex flex-wrap gap-2 text-[14px]">
        {d.projectsByStatus.map((s) => (
          <span key={s.key} className="rounded-full bg-surface-alt px-3 py-1">
            {STATUS_LABELS[s.key as StatusType] ?? s.label}: <span className="font-mono">{s.count}</span>
          </span>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Threads list={d.unanswered} timezone={timezone} />
        <Projects title="Waiting on the client" empty="Nothing is waiting on a client." list={d.waitingOnClient} timezone={timezone} />
        <Renewals list={d.renewals} timezone={timezone} />
        <Tasks title="Flagged as extra work" empty="Nothing to confirm." list={d.billableToConfirm} timezone={timezone} />
      </div>
    </Section>
  );
}

export function TlDashboard({ d, timezone }: { d: TlDashboardView; timezone: string }) {
  return (
    <Section title="Your team" testId="dashboard-tl">
      <TeamLoad teams={d.teams} />
      <Card className="mt-4">
        <Label>Planned this week</Label>
        <div className="mt-3 grid grid-cols-7 gap-2 text-center">
          {d.week.map((day) => (
            <div key={day.date} className="rounded-md bg-surface px-1 py-2">
              <p className="font-mono text-[11px] text-muted">{formatDay(day.date)}</p>
              <p className="font-display text-[20px] font-[650]">{day.planned}</p>
              <p className="font-mono text-[11px] text-muted">{hours(day.hours)}</p>
            </div>
          ))}
        </div>
        {d.teams[0]?.teamId ? (
          <Link href={`/planner/${d.teams[0].teamId}`} className="mt-3 inline-block text-[14px] text-link">
            Open the planner
          </Link>
        ) : null}
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Tasks title="Overdue" empty="Nothing overdue." list={d.overdue} timezone={timezone} />
        <Leave title="Out this week" list={d.outThisWeek} />
      </div>
    </Section>
  );
}

export function MeDashboard({ d, timezone }: { d: MeDashboardView; timezone: string }) {
  return (
    <Section title="Your work" testId="dashboard-me">
      <Stats>
        <Stat label="Due today" value={d.today.length} href="/my-tasks" />
        <Stat label="Overdue" value={d.overdue} href="/my-tasks" tone={d.overdue ? 'error' : undefined} />
        <Stat label="Unread alerts" value={d.unreadAlerts} href="/notifications" />
        <Stat label="Unread chat" value={d.unreadChats} href="/chat" />
      </Stats>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Tasks title="Today" empty="Nothing due today." list={d.today} timezone={timezone} />
        <Tasks title="This week" empty="Nothing else this week." list={d.week} timezone={timezone} />
      </div>
    </Section>
  );
}

export function AccountsDashboard({ d, timezone }: { d: AccountsDashboardView; timezone: string }) {
  return (
    <Section title="Billing" testId="dashboard-accounts">
      <Stats>
        {d.byStatus.map((s) => (
          <Stat key={s.status} label={BILLING_STATUS_LABELS[s.status]} value={s.count} href={`/billing?status=${s.status}`} />
        ))}
      </Stats>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <Label>Amounts by status</Label>
          <ul className="mt-2 space-y-1 text-[15px]">
            {d.byStatus.map((s) => (
              <li key={s.status} className="flex justify-between gap-3">
                <span className="text-muted">{BILLING_STATUS_LABELS[s.status]}</span>
                <span className="font-mono text-[13px]">{money(s.totals)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t border-surface-alt pt-2">
              <span>Paid this month</span>
              <span className="font-mono text-[13px]">{money(d.paidThisMonth)}</span>
            </li>
          </ul>
        </Card>
        <Renewals list={d.renewalsDue} timezone={timezone} />
      </div>
    </Section>
  );
}

export function HrDashboard({ d, timezone }: { d: HrDashboardView; timezone: string }) {
  return (
    <Section title="People" testId="dashboard-hr">
      <div className="grid gap-4 lg:grid-cols-3">
        <Leave title="Out this week" list={d.outThisWeek} />
        <Leave title="Out next week" list={d.outNextWeek} />
        <ListCard title="Holidays in the next 30 days" empty="No holidays coming up." count={d.holidays.length}>
          {d.holidays.map((h) => (
            <li key={h.id} className="px-4 py-2">
              <p className="font-medium">{h.name}</p>
              <p className="font-mono text-[12px] text-muted">
                {formatDate(h.date, timezone)} · {h.location}
              </p>
            </li>
          ))}
        </ListCard>
      </div>
    </Section>
  );
}
