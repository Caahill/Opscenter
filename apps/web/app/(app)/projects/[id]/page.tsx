import { DEPARTMENT_LABELS, STOP_REASON_LABELS, type BillingRequestView, type MeView, type PackageView, type ProjectDetailView, type TeamView, type UserView } from '@opshub/shared';
import { Card, Chip, Field, Label, Masked, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, apiIfAllowed } from '@/lib/api';
import { HealthChip, StatusChip } from '@/lib/chips';
import { formatDate, formatDateTime } from '@/lib/format';
import { Attachments } from './attachments';
import { BillingCard } from './billing-card';
import { HandoffForm, StageChecklist, StageStepper, StatusControls } from './project-controls';
import { ProjectTasks } from './project-tasks';

const HANDOFF: Record<string, string[]> = {
  PRE_SALES: ['ONBOARDING'],
  ONBOARDING: ['WEB_DEV', 'AMC', 'SPEED_AUDIT', 'SEO', 'GOOGLE_ADS', 'SOCIAL_MEDIA', 'GRAPHIC_DESIGN'],
  WEB_DEV: ['AMC'],
};

function describeActivity(a: NonNullable<ProjectDetailView['activity']>[number]): string {
  const to = (a.to ?? {}) as Record<string, unknown>;
  const from = (a.from ?? {}) as Record<string, unknown>;
  switch (a.kind) {
    case 'STAGE_MOVED':
      return `moved from ${String(from.stage)} to ${String(to.stage)}${to.override ? ' (checklist override)' : ''}`;
    case 'PROJECT_CREATED':
      return `created the project${to.package ? ` with ${String(to.package)}` : ''}`;
    case 'STATUS_CHANGED':
      return `changed status from ${String(from.statusType)} to ${String(to.statusType)}`;
    case 'PROJECT_STOPPED':
      return `stopped the project (${String(to.reason)})`;
    case 'HANDED_OFF':
      return `handed off to ${((to.projects as Array<{ department: string }>) ?? []).map((p) => p.department).join(', ')}`;
    case 'HANDED_OVER_FROM':
      return `received from ${String(from.department)}`;
    case 'CYCLE_GENERATED':
      return `generated ${String(to.tasks)} tasks for ${String(to.cycleMonth)}`;
    case 'ATTACHMENT_ADDED':
      return `added ${String(to.fileName)}`;
    default:
      return a.kind?.toLowerCase().replace(/_/g, ' ') ?? '';
  }
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bill?: string }> }) {
  const [{ id }, { bill }] = await Promise.all([params, searchParams]);
  const [me, p] = await Promise.all([api<MeView>('/me'), api<ProjectDetailView>(`/projects/${id}`)]);
  const canManage = me.permissions.includes('project.manage') && (me.roles.includes('ADMIN') || p.pmId === me.id);
  const canCreateTask = me.permissions.includes('task.create') && !me.roles.every((r) => r === 'TEAM_MEMBER');
  const closed = p.statusType === 'STOPPED' || p.statusType === 'DONE';
  const [packages, teams, users] = await Promise.all([
    canManage ? api<PackageView[]>('/packages') : Promise.resolve([] as PackageView[]),
    canManage ? api<TeamView[]>('/teams') : Promise.resolve([] as TeamView[]),
    canCreateTask ? api<UserView[]>('/users') : Promise.resolve([] as UserView[]),
  ]);
  const billing = me.permissions.includes('billing.read') ? ((await apiIfAllowed<BillingRequestView[]>(`/billing-requests?projectId=${id}`)) ?? []) : null;
  const currentChecklist = (p.checklist ?? []).filter((c) => c.stageId === p.stageId);
  const handoffTargets = p.department ? (HANDOFF[p.department] ?? []) : [];

  return (
    <>
      <PageHeader
        title={`${p.clientName} · ${p.department ? DEPARTMENT_LABELS[p.department] : ''}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/clients/${p.clientId}`} className="text-link">
              Client page
            </Link>
            <StatusChip status={p.statusType} />
            <HealthChip health={p.health} />
            {p.stopReason ? <Chip tone="danger">{STOP_REASON_LABELS[p.stopReason]}</Chip> : null}
            {p.holdReason ? <span className="text-[14px]">On hold: {p.holdReason}</span> : null}
          </span>
        }
      />

      <StageStepper project={p} canManage={canManage && !closed} />

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ProjectTasks project={p} users={users} canCreate={canCreateTask && !closed} />
          <Attachments projectId={p.id} attachments={p.attachments ?? []} canUpload={canManage} />
        </div>

        <div className="space-y-4">
          <Card>
            <Label>Stage checklist: {p.stageName}</Label>
            <StageChecklist projectId={p.id} items={currentChecklist} canEdit={canManage && !closed} />
          </Card>

          <Card>
            <Label>Details</Label>
            <dl className="mt-3">
              <Field label="Package">{p.packageName ?? 'None'}</Field>
              <Field label="Team">{p.teamName ?? 'None'}</Field>
              <Field label="PM">{p.pmName}</Field>
              <Field label="Start">{p.startDate ? formatDate(p.startDate) : ''}</Field>
              <Field label="End / renewal">{p.renewalDate ?? p.endDate ? formatDate((p.renewalDate ?? p.endDate)!) : 'None'}</Field>
              {p.cycleDay ? <Field label="Cycle day">{p.cycleDay} of each month</Field> : null}
              <Field label="Project value">
                <Masked value={p.value === undefined ? undefined : p.value ? `INR ${p.value}` : null} />
              </Field>
            </dl>
          </Card>

          {billing !== null && (canManage || billing.length > 0) ? (
            <BillingCard projectId={p.id} requests={billing} tasks={p.tasks ?? []} canRaise={canManage && me.permissions.includes('billing.create')} preselect={bill ?? null} />
          ) : null}

          {canManage && !closed ? <StatusControls project={p} packages={packages} teams={teams} /> : null}

          {canManage && !closed && handoffTargets.length > 0 ? (
            <HandoffForm projectId={p.id} targets={handoffTargets} packages={packages} />
          ) : null}

          {p.related && p.related.length > 0 ? (
            <Card>
              <Label>Other projects for this client</Label>
              <ul className="mt-2 space-y-1 text-[14px]">
                {p.related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/projects/${r.id}`} className="hover:text-link">
                      {r.department ? DEPARTMENT_LABELS[r.department] : ''}
                    </Link>{' '}
                    <span className="text-muted">
                      · {r.stageName}
                      {r.parentProjectId === p.id ? ' · handed off from here' : ''}
                      {p.parentProjectId === r.id ? ' · handed over to this project' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <Label>Activity</Label>
            <ul className="mt-2 space-y-2 text-[13px]">
              {(p.activity ?? []).map((a) => (
                <li key={a.id}>
                  <span className="text-muted">{a.at ? formatDateTime(a.at, me.timezone) : ''}</span>
                  <br />
                  <span className="font-semibold">{a.actorName ?? 'Ops Hub'}</span> {describeActivity(a)}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
