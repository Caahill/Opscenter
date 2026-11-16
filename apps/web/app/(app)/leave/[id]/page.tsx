import { LEAVE_KIND_LABELS, type LeaveImpactView } from '@opshub/shared';
import { Card, Field, Label, Masked, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { formatLeave, hours } from '@/lib/format';
import { ImpactTasks } from './impact-tasks';

/** The leave impact alert (PRD 3.2): tasks due while someone is away, reassigned in one click. */
export default async function LeaveImpactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, impact] = await Promise.all([getMe(), api<LeaveImpactView>(`/leave/${id}/impact`)]);
  const { leave } = impact;
  const canReassign = me.permissions.includes('planner.manage');
  const tasks = impact.tasks ?? [];

  return (
    <>
      <PageHeader
        title={`${leave.userName} is on leave`}
        description={`${formatLeave(leave.startDate, leave.endDate, leave.halfDay)}. ${
          impact.tasks === undefined ? '' : tasks.length === 0 ? 'No open tasks are due during it.' : `${tasks.length} open ${tasks.length === 1 ? 'task is' : 'tasks are'} due during it.`
        }`}
        actions={
          leave.teamId && me.permissions.includes('planner.read') ? (
            <Link href={`/planner/${leave.teamId}`} className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
              Open the team planner
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {impact.tasks === undefined ? (
          <Card>
            <p className="text-muted">Task details are not part of your role.</p>
          </Card>
        ) : (
          <ImpactTasks tasks={tasks} candidates={impact.candidates} suggestions={impact.suggestions ?? {}} canReassign={canReassign} />
        )}

        <div className="grid content-start gap-4">
          <Card>
            <Label>Leave</Label>
            <dl className="mt-2">
              <Field label="Dates">{formatLeave(leave.startDate, leave.endDate, leave.halfDay)}</Field>
              <Field label="Working days">{leave.days}</Field>
              {'kind' in leave ? <Field label="Kind">{leave.kind ? LEAVE_KIND_LABELS[leave.kind] : ''}</Field> : null}
              {'reason' in leave ? (
                <Field label="Reason">
                  <Masked value={leave.reason} />
                </Field>
              ) : null}
              <Field label="Recorded by">{leave.createdByName ?? 'Unknown'}</Field>
            </dl>
          </Card>
          <Card>
            <Label>Teammates that week</Label>
            <ul className="mt-2 space-y-1 text-[14px]">
              {impact.candidates.map((c) => (
                <li key={c.userId} className="flex justify-between gap-2">
                  <span>{c.name}</span>
                  <span className={`font-mono text-[13px] ${c.onLeave ? 'text-error' : 'text-muted'}`}>{c.onLeave ? 'also away' : `${hours(c.freeH)} free`}</span>
                </li>
              ))}
              {impact.candidates.length === 0 ? <li className="text-muted">No teammates to suggest.</li> : null}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
