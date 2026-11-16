import { DEPARTMENT_LABELS, TASK_TYPE_LABELS, type MeView, type ProjectDetailView, type TaskDetailView, type UserView } from '@opshub/shared';
import { Card, Field, Label, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, apiIfAllowed } from '@/lib/api';
import { PriorityChip, StatusChip } from '@/lib/chips';
import { formatDate, formatDateTime } from '@/lib/format';
import { AttachmentList, UploadButton } from '../../projects/[id]/attachments';
import { MessageCard } from '../../inbox/message-card';
import { threadHref } from '../../inbox/thread-row';
import { BillableControls } from './billable-controls';
import { Comments, SubtaskForm, TaskChecklist, TaskEditor, TaskQuickUpdate } from './task-controls';

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, t] = await Promise.all([api<MeView>('/me'), api<TaskDetailView>(`/tasks/${id}`)]);
  const editAll = (t.canEdit ?? []).includes('all');
  const users = editAll ? await api<UserView[]>('/users') : [];
  // Only the client's PM (or Admin) confirms billable work; the API checks it again.
  const project = me.permissions.includes('project.manage') ? await apiIfAllowed<ProjectDetailView>(`/projects/${t.projectId}`) : null;
  const canDecideBillable = me.roles.includes('ADMIN') || (project?.pmId !== undefined && project.pmId === me.id);

  return (
    <>
      <PageHeader
        title={t.title ?? 'Task'}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/projects/${t.projectId}`} className="text-link">
              {t.clientName} · {t.department ? DEPARTMENT_LABELS[t.department] : ''}
            </Link>
            <StatusChip status={t.statusType} />
            <PriorityChip priority={t.priority} />
            {t.parentTaskId ? (
              <Link href={`/tasks/${t.parentTaskId}`} className="text-link">
                Parent task
              </Link>
            ) : null}
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <TaskQuickUpdate task={t} />

          {t.sourceMessage ? (
            <section aria-label="Client message">
              <div className="mb-2 flex items-center justify-between">
                <Label>Client message</Label>
                <Link href={threadHref(t.sourceMessage.threadKey)} className="text-[14px] text-link">
                  Open the thread
                </Link>
              </div>
              <MessageCard m={t.sourceMessage} timezone={me.timezone} />
            </section>
          ) : null}

          {t.description ? (
            <Card>
              <Label>Description</Label>
              <p className="mt-2 whitespace-pre-wrap text-[15px]">{t.description}</p>
            </Card>
          ) : null}

          <Card>
            <Label>Checklist</Label>
            <TaskChecklist taskId={t.id} items={t.checklist ?? []} canAdd={editAll} />
          </Card>

          <Card>
            <Label>Subtasks</Label>
            <ul className="mt-2 space-y-1 text-[14px]">
              {(t.subtasks ?? []).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <Link href={`/tasks/${s.id}`} className="hover:text-link">
                    {s.title}
                  </Link>
                  <span className="flex items-center gap-1 text-muted">
                    {s.assigneeName ?? 'Unassigned'} <StatusChip status={s.statusType} />
                  </span>
                </li>
              ))}
              {(t.subtasks ?? []).length === 0 ? <li className="text-muted">None</li> : null}
            </ul>
            {t.statusType !== 'DONE' && t.statusType !== 'STOPPED' ? <SubtaskForm task={t} /> : null}
          </Card>

          <Card>
            <Label>Comments</Label>
            <Comments taskId={t.id} comments={t.comments ?? []} timezone={me.timezone} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <Label>Details</Label>
            <dl className="mt-3">
              <Field label="Type">{t.type ? TASK_TYPE_LABELS[t.type] : ''}</Field>
              <Field label="Assignee">{t.assigneeName ?? 'Unassigned'}</Field>
              <Field label="Due">{t.dueDate ? formatDate(t.dueDate) : 'None'}</Field>
              <Field label="Estimate">{t.estimateH ? `${t.estimateH} h` : 'None'}</Field>
              <Field label="Source">{t.source}</Field>
              {t.cycleMonth ? <Field label="Cycle">{t.cycleMonth}</Field> : null}
              {t.completedAt ? <Field label="Completed">{formatDateTime(t.completedAt, me.timezone)}</Field> : null}
            </dl>
          </Card>

          {editAll ? <TaskEditor task={t} users={users} /> : null}

          <BillableControls task={t} canDecide={canDecideBillable} />

          <Card>
            <Label>Files</Label>
            <AttachmentList attachments={t.attachments ?? []} />
            <UploadButton path={`/tasks/${t.id}/attachments`} />
          </Card>

          {(t.credentials ?? []).length > 0 ? (
            <Card>
              <Label>Client logins you can use</Label>
              <p className="mt-1 text-[12px] text-muted">Reveal from the client page. Every reveal is logged.</p>
              <ul className="mt-2 text-[14px]">
                {(t.credentials ?? []).map((c) => (
                  <li key={c.id}>
                    <Link href={`/clients/${t.clientId}`} className="text-link">
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
