import { Injectable } from '@nestjs/common';
import type { Prisma, Task, TaskSource } from '@opshub/db';
import { maskBody, scopesFor, type Scope } from '@opshub/policy';
import {
  DEPARTMENT_LABELS,
  MEMBER_TASK_FIELDS,
  type CreateTaskInput,
  type ListTasksQuery,
  type MyTasksQuery,
  type UpdateTaskInput,
} from '@opshub/shared';
import { ActivityService } from '../common/activity.service';
import { DirectoryService } from '../common/directory.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { BillingService } from '../billing/billing.service';
import { CredentialsService } from '../credentials/credentials.service';
import { MessagesQueries } from '../inbox/messages';
import { NotifyService } from '../notifications/notify.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { OPEN_STATUSES } from '../projects/projects.queries';
import { presentActivity, presentAttachment, presentChecklistItem, presentComment, presentTaskDetail } from '../work/dtos';
import { TASK_INCLUDE, TasksQueries } from './tasks.queries';

const CLOSED = ['DONE', 'STOPPED'];

/** What the viewer may edit on a task they can reach, for the UI and for enforcement. */
function editableFields(scopes: Scope[]): 'all' | readonly string[] {
  return scopes.some((s) => s === 'ALL' || s === 'OWN_TEAM' || s === 'OWN_CLIENTS') ? 'all' : MEMBER_TASK_FIELDS;
}

function ymdInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly queries: TasksQueries,
    private readonly activity: ActivityService,
    private readonly directory: DirectoryService,
    private readonly credentials: CredentialsService,
    private readonly messages: MessagesQueries,
    private readonly billing: BillingService,
    private readonly notify: NotifyService,
  ) {}

  /** PRD 5.3 "assignments": the new assignee hears about it (not when they took it themselves). */
  async notifyAssigned(actorId: string, taskId: string) {
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, include: { project: { include: { client: { select: { companyName: true } } } } } });
    if (!t?.assigneeId || t.assigneeId === actorId) return;
    const actor = (await this.directory.names([actorId])).get(actorId) ?? 'Someone';
    await this.notify.notify([t.assigneeId], {
      kind: 'ASSIGNED',
      title: `${actor} assigned you "${t.title}"`,
      body: `${t.project.client.companyName} · ${DEPARTMENT_LABELS[t.project.department]}${t.dueDate ? `, due ${t.dueDate.toISOString().slice(0, 10)}` : ''}`,
      link: `/tasks/${t.id}`,
      dedupeKey: `assigned:${t.id}`,
    }, actorId);
  }

  async list(v: AuthedViewer, scopes: Scope[], q: ListTasksQuery) {
    return this.queries.list(v, scopes, {
      projectId: q.projectId,
      assigneeId: q.assigneeId,
      ...(q.department ? { project: { department: q.department } } : {}),
      ...(q.dueFrom || q.dueTo
        ? { dueDate: { ...(q.dueFrom ? { gte: new Date(`${q.dueFrom}T00:00:00.000Z`) } : {}), ...(q.dueTo ? { lte: new Date(`${q.dueTo}T00:00:00.000Z`) } : {}) } }
        : {}),
      statusType: q.statusType ?? (q.open === undefined ? undefined : q.open ? { in: [...OPEN_STATUSES] } : { in: ['DONE', 'STOPPED'] }),
    });
  }

  /** PRD user story: my tasks for today and this week, by priority then due date. */
  async mine(v: AuthedViewer, q: MyTasksQuery) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: v.userId } });
    const today = new Date(`${ymdInZone(new Date(), user.timezone)}T00:00:00.000Z`);
    const dow = today.getUTCDay(); // 0 Sunday
    const end = q.range === 'today' ? today : new Date(today.getTime() + ((7 - dow) % 7) * 86_400_000);
    const rows = await this.queries.rows(v, ['ASSIGNED'], {
      statusType: { in: [...OPEN_STATUSES] },
      OR: [
        { dueDate: { lte: end } },
        { plannedDate: { gte: today, lte: end } },
        ...(q.range === 'week' ? [{ dueDate: null, plannedDate: null }] : []),
      ],
    });
    return this.queries.present(rows);
  }

  async detail(v: AuthedViewer, scopes: Scope[], id: string) {
    const base = await this.scopes.requireTask(v, scopes, id);
    const t = await this.prisma.task.findUniqueOrThrow({ where: { id: base.id }, include: TASK_INCLUDE });
    const [checklist, subtaskRows, comments, attachments, activity, counts, sourceMessage, billing] = await Promise.all([
      this.prisma.checklistItem.findMany({ where: { taskId: id }, orderBy: { order: 'asc' } }),
      this.prisma.task.findMany({ where: { parentTaskId: id }, include: TASK_INCLUDE, orderBy: { createdAt: 'asc' } }),
      this.prisma.taskComment.findMany({ where: { taskId: id }, orderBy: { createdAt: 'asc' }, take: 200 }),
      this.prisma.attachment.findMany({ where: { taskId: id }, orderBy: { createdAt: 'desc' } }),
      this.prisma.activityLog.findMany({ where: { taskId: id }, orderBy: { at: 'desc' }, take: 50 }),
      this.queries.counts([id]),
      this.messages.sourceMessage(v, t.sourceCommId),
      t.billable ? this.billing.forTask(id) : null,
    ]);
    const credScopes = scopesFor(v.roles, 'credential.read');
    const credentials = credScopes.length ? await this.credentials.listForClient(v, credScopes, t.project.clientId) : [];
    const names = await this.directory.names([
      ...comments.map((c) => c.authorId),
      ...attachments.map((a) => a.uploadedById),
      ...activity.map((a) => a.actorId),
    ]);
    const editable = editableFields(scopesFor(v.roles, 'task.update'));
    return presentTaskDetail(t, counts, {
      checklist,
      subtasks: await this.queries.present(subtaskRows),
      comments: comments.map((c) => presentComment(c, names)),
      attachments: attachments.map((a) => presentAttachment(a, names)),
      activity: activity.map((a) => presentActivity(a, names)),
      credentials,
      canEdit: editable === 'all' ? ['all'] : [...editable],
      sourceMessage,
      billing,
    });
  }

  /** `origin` is set when the task comes from a triaged client message (PRD 2.4). */
  async create(v: AuthedViewer, scopes: Scope[], input: CreateTaskInput, origin?: { source: TaskSource; sourceCommId: string }) {
    const project = await this.scopes.requireProject(v, scopes, input.projectId);
    if (project.statusType === 'STOPPED' || project.statusType === 'DONE') throw Errors.invalidState('This project is closed');
    const memberOnly = editableFields(scopes) !== 'all';

    let assigneeId = input.assigneeId ?? null;
    if (input.parentTaskId) {
      const parent = await this.prisma.task.findFirst({ where: { id: input.parentTaskId, projectId: project.id } });
      if (!parent) throw Errors.validation('parentTaskId: must be a task on the same project');
      if (memberOnly && parent.assigneeId !== v.userId) throw Errors.forbidden('You can add subtasks to your own tasks only');
    } else if (memberOnly) {
      throw Errors.forbidden('Team Members can add subtasks only');
    }
    if (memberOnly) {
      if (assigneeId && assigneeId !== v.userId) throw Errors.forbidden('You can assign subtasks to yourself only');
      assigneeId = v.userId;
    }
    if (assigneeId) await this.assertAssignable(v, scopes, assigneeId);
    if (input.dependsOnId) await this.assertSameProject(input.dependsOnId, project.id);

    const assignee = assigneeId ? await this.prisma.user.findUnique({ where: { id: assigneeId } }) : null;
    const task = await this.prisma.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          projectId: project.id,
          parentTaskId: input.parentTaskId ?? null,
          title: input.title,
          type: input.type,
          description: input.description ? maskBody(input.description) : null,
          assigneeId,
          teamId: input.teamId ?? assignee?.teamId ?? project.teamId,
          priority: input.priority,
          dueDate: input.dueDate ?? null,
          plannedDate: input.plannedDate ?? null,
          estimateH: input.estimateH ?? null,
          billable: input.billable ?? false,
          dependsOnId: input.dependsOnId ?? null,
          source: origin?.source ?? 'MANUAL',
          sourceCommId: origin?.sourceCommId ?? null,
          createdById: v.userId,
        },
      });
      await this.activity.log({ kind: 'TASK_CREATED', actorId: v.userId, projectId: project.id, taskId: t.id, to: { title: t.title, assigneeId } }, tx);
      return t;
    });
    if (assigneeId) await this.notifyAssigned(v.userId, task.id);
    return this.detail(v, scopesFor(v.roles, 'task.read'), task.id);
  }

  async update(v: AuthedViewer, scopes: Scope[], id: string, input: UpdateTaskInput) {
    const task = await this.scopes.requireTask(v, scopes, id);
    const editable = editableFields(scopes);
    if (editable !== 'all') {
      const blocked = Object.keys(input).filter((k) => !editable.includes(k));
      if (blocked.length) throw Errors.forbidden(`Team Members can update status and progress only (not ${blocked.join(', ')})`);
    }
    if (input.assigneeId) await this.assertAssignable(v, scopes, input.assigneeId);
    if (input.dependsOnId) {
      if (input.dependsOnId === id) throw Errors.validation('dependsOnId: a task cannot depend on itself');
      await this.assertSameProject(input.dependsOnId, task.projectId);
    }

    const data: Prisma.TaskUncheckedUpdateInput = { ...input };
    if (input.description !== undefined) data.description = input.description ? maskBody(input.description) : null;
    const closing = input.statusType !== undefined && CLOSED.includes(input.statusType) && !CLOSED.includes(task.statusType);
    const reopening = input.statusType !== undefined && !CLOSED.includes(input.statusType) && CLOSED.includes(task.statusType);
    if (closing) {
      data.completedAt = new Date();
      if (input.statusType === 'DONE') data.progressPct = 100;
    }
    if (reopening) data.completedAt = null;

    if (closing && input.statusType === 'DONE') await BillingService.assertBilled(this.prisma, task);
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id }, data });
      if (closing) await CredentialsService.revokeForTask(tx, id);
      const changed = diff(task, input);
      if (Object.keys(changed.to).length) {
        await this.activity.log({ kind: 'TASK_UPDATED', actorId: v.userId, projectId: task.projectId, taskId: id, ...changed }, tx);
      }
    });
    if (input.assigneeId && input.assigneeId !== task.assigneeId) await this.notifyAssigned(v.userId, id);
    return this.detail(v, scopesFor(v.roles, 'task.read'), id);
  }

  // ---- Checklist, comments, attachments ----

  async addChecklistItem(v: AuthedViewer, scopes: Scope[], taskId: string, text: string) {
    await this.scopes.requireTask(v, scopes, taskId);
    const order = await this.prisma.checklistItem.count({ where: { taskId } });
    return presentChecklistItem(await this.prisma.checklistItem.create({ data: { taskId, text, order } }));
  }

  async updateChecklistItem(v: AuthedViewer, scopes: Scope[], itemId: string, input: { text?: string; done?: boolean }) {
    const item = await this.prisma.checklistItem.findUnique({ where: { id: itemId } });
    if (!item?.taskId) throw Errors.notFound('Checklist item');
    await this.scopes.requireTask(v, scopes, item.taskId);
    if (input.text !== undefined && editableFields(scopes) !== 'all') throw Errors.forbidden('Team Members can tick items only');
    const updated = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        text: input.text,
        done: input.done,
        doneAt: input.done === undefined ? undefined : input.done ? new Date() : null,
        doneById: input.done === undefined ? undefined : input.done ? v.userId : null,
      },
    });
    return presentChecklistItem(updated);
  }

  async deleteChecklistItem(v: AuthedViewer, scopes: Scope[], itemId: string) {
    const item = await this.prisma.checklistItem.findUnique({ where: { id: itemId } });
    if (!item?.taskId) throw Errors.notFound('Checklist item');
    await this.scopes.requireTask(v, scopes, item.taskId);
    if (editableFields(scopes) !== 'all') throw Errors.forbidden('Team Members can tick items only');
    await this.prisma.checklistItem.delete({ where: { id: itemId } });
  }

  async comment(v: AuthedViewer, scopes: Scope[], taskId: string, body: string) {
    const task = await this.scopes.requireTask(v, scopes, taskId);
    // Pasted client details must not spread through comments (PRD data protection).
    const c = await this.prisma.taskComment.create({ data: { taskId, authorId: v.userId, body: maskBody(body) } });
    await this.activity.log({ kind: 'COMMENTED', actorId: v.userId, projectId: task.projectId, taskId, to: { commentId: c.id } });
    return presentComment(c, await this.directory.names([v.userId]));
  }

  // ---- Helpers ----

  /** TL: own team members (or themselves). PM and Admin: any active user. Members: themselves. */
  private async assertAssignable(v: AuthedViewer, scopes: Scope[], userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active) throw Errors.validation('assigneeId: must be an active user');
    if (scopes.includes('ALL')) return;
    if (scopes.includes('OWN_TEAM') && userId !== v.userId) {
      const teamIds = await this.scopes.teamIds(v);
      if (!user.teamId || !teamIds.includes(user.teamId)) throw Errors.forbidden('Team Leaders can assign within their own team only');
    }
    if (!scopes.includes('OWN_TEAM') && !scopes.includes('OWN_CLIENTS') && userId !== v.userId) {
      throw Errors.forbidden('You can assign tasks to yourself only');
    }
  }

  private async assertSameProject(taskId: string, projectId: string) {
    const other = await this.prisma.task.findFirst({ where: { id: taskId, projectId } });
    if (!other) throw Errors.validation('dependsOnId: must be a task on the same project');
  }
}

function diff(before: Task, input: Record<string, unknown>) {
  const from: Record<string, string | null> = {};
  const to: Record<string, string | null> = {};
  for (const [k, next] of Object.entries(input)) {
    if (k === 'description') continue;
    const prev = (before as unknown as Record<string, unknown>)[k];
    const p = prev instanceof Date ? prev.toISOString() : prev === null || prev === undefined ? null : String(prev);
    const n = next instanceof Date ? next.toISOString() : next === null || next === undefined ? null : String(next);
    if (p !== n) {
      from[k] = p;
      to[k] = n;
    }
  }
  return { from, to };
}
