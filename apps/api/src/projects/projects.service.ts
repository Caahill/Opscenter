import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Injectable } from '@nestjs/common';
import { scopesFor, type Scope } from '@opshub/policy';
import type { CreateProjectInput, HandoffInput, ListProjectsQuery, MoveStageInput, StopProjectInput, UpdateProjectInput } from '@opshub/shared';
import { ActivityService } from '../common/activity.service';
import { DirectoryService } from '../common/directory.service';
import { AppError, Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { StorageService } from '../storage/storage.service';
import { TasksQueries } from '../tasks/tasks.queries';
import { presentActivity, presentAttachment, presentChecklistItem, presentProjectDetail } from '../work/dtos';
import { createProject, ensureStageChecklist, HANDOFF_TARGETS } from './project-factory';
import { PROJECT_INCLUDE, ProjectsQueries } from './projects.queries';

export interface IncomingFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly queries: ProjectsQueries,
    private readonly tasks: TasksQueries,
    private readonly activity: ActivityService,
    private readonly directory: DirectoryService,
    private readonly storage: StorageService,
  ) {}

  async list(v: AuthedViewer, scopes: Scope[], q: ListProjectsQuery) {
    const rows = await this.queries.list(
      v,
      scopes,
      { clientId: q.clientId, department: q.department, statusType: q.statusType },
      { includeClosed: Boolean(q.statusType) || Boolean(q.clientId) },
    );
    return rows.map((r) => r.dto);
  }

  async detail(v: AuthedViewer, scopes: Scope[], id: string) {
    const base = await this.scopes.requireProject(v, scopes, id);
    const p = await this.prisma.project.findUniqueOrThrow({ where: { id: base.id }, include: PROJECT_INCLUDE });
    const taskScopes = scopesFor(v.roles, 'task.read');
    const [stages, checklist, taskRows, attachments, activity, related, counts] = await Promise.all([
      this.prisma.stage.findMany({ where: { pipelineId: p.pipelineId }, orderBy: { order: 'asc' } }),
      this.prisma.checklistItem.findMany({ where: { projectId: p.id }, orderBy: [{ stageId: 'asc' }, { order: 'asc' }] }),
      taskScopes.length ? this.tasks.rows(v, taskScopes, { projectId: p.id, parentTaskId: null }, 300) : [],
      this.prisma.attachment.findMany({ where: { projectId: p.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.activityLog.findMany({ where: { projectId: p.id }, orderBy: { at: 'desc' }, take: 50 }),
      this.queries.list(
        v,
        scopes,
        { clientId: p.clientId, id: { not: p.id } },
        { includeClosed: true },
      ),
      this.queries.counts([p.id]),
    ]);
    const names = await this.directory.names([
      p.pmId,
      ...attachments.map((a) => a.uploadedById),
      ...activity.map((a) => a.actorId),
    ]);
    return presentProjectDetail(p, names, counts, {
      stages,
      checklist,
      tasks: await this.tasks.present(taskRows),
      attachments: attachments.map((a) => presentAttachment(a, names)),
      activity: activity.map((a) => presentActivity(a, names)),
      related: related.map((r) => r.dto),
    });
  }

  async create(v: AuthedViewer, scopes: Scope[], input: CreateProjectInput) {
    const client = await this.prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw Errors.notFound('Client');
    const all = scopes.includes('ALL');
    if (!all && client.pmId !== v.userId) throw Errors.notFound('Client');
    const pmId = input.pmId ?? client.pmId;
    if (!all && pmId !== v.userId) throw Errors.forbidden('Only the Admin can assign a project to another PM');
    if (input.teamId) await this.assertTeam(input.teamId);

    const project = await this.prisma.$transaction((tx) =>
      createProject(tx, v.userId, {
        clientId: client.id,
        department: input.department,
        pmId,
        packageId: input.packageId,
        type: input.type,
        teamId: input.teamId,
        startDate: input.startDate,
        endDate: input.endDate,
        renewalDate: input.renewalDate,
        cycleDay: input.cycleDay,
        value: input.value,
        billingCycle: input.billingCycle,
      }),
    );
    return this.detail(v, scopesFor(v.roles, 'project.read'), project.id);
  }

  async update(v: AuthedViewer, scopes: Scope[], id: string, input: UpdateProjectInput) {
    const p = await this.scopes.requireProject(v, scopes, id);
    if (p.statusType === 'STOPPED' || p.statusType === 'DONE') throw Errors.invalidState('This project is closed');
    if (input.pmId && !scopes.includes('ALL')) throw Errors.forbidden('Only the Admin can reassign the PM');
    if (input.statusType === 'ON_HOLD' && !(input.holdReason ?? p.holdReason)) {
      throw Errors.validation('holdReason: required when putting a project on hold');
    }
    if (input.teamId) await this.assertTeam(input.teamId);

    const changed: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of ['statusType', 'teamId', 'pmId', 'health', 'holdReason', 'endDate', 'renewalDate', 'cycleDay', 'packageId', 'memberSendEnabled'] as const) {
      const next = input[key];
      if (next !== undefined && String(next) !== String(p[key])) changed[key] = { from: p[key], to: next };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: {
          ...input,
          holdReason: input.statusType && input.statusType !== 'ON_HOLD' ? null : input.holdReason,
        },
      });
      if (Object.keys(changed).length) {
        const kind = 'statusType' in changed ? 'STATUS_CHANGED' : 'PROJECT_UPDATED';
        const from = Object.fromEntries(Object.entries(changed).map(([k, c]) => [k, c.from === null ? null : String(c.from)]));
        const to = Object.fromEntries(Object.entries(changed).map(([k, c]) => [k, c.to === null ? null : String(c.to)]));
        await this.activity.log({ kind, actorId: v.userId, projectId: id, from, to }, tx);
      }
    });
    return this.detail(v, scopesFor(v.roles, 'project.read'), id);
  }

  /** TechSpec 9.2: logs the move, resets stageEnteredAt, warns on an incomplete checklist. */
  async moveStage(v: AuthedViewer, scopes: Scope[], id: string, input: MoveStageInput) {
    const p = await this.scopes.requireProject(v, scopes, id);
    if (p.statusType === 'STOPPED') throw Errors.invalidState('This project is stopped');
    const [current, target] = await Promise.all([
      this.prisma.stage.findUniqueOrThrow({ where: { id: p.stageId } }),
      this.prisma.stage.findFirst({ where: { id: input.stageId, pipelineId: p.pipelineId } }),
    ]);
    if (!target) throw Errors.validation('stageId: not a stage of this project pipeline');
    if (target.id === current.id) return this.detail(v, scopesFor(v.roles, 'project.read'), id);

    const forward = target.order > current.order;
    const incomplete = forward
      ? await this.prisma.checklistItem.findMany({ where: { projectId: id, stageId: current.id, done: false }, orderBy: { order: 'asc' } })
      : [];
    if (incomplete.length && !input.override) {
      throw new AppError(
        409,
        'CHECKLIST_INCOMPLETE',
        `${incomplete.length} checklist item${incomplete.length > 1 ? 's are' : ' is'} not done for "${current.name}": ${incomplete.map((i) => i.text).join(', ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data: { stageId: target.id, stageEnteredAt: new Date(), statusType: target.statusType, holdReason: null },
      });
      await ensureStageChecklist(tx, id, target);
      await this.activity.log(
        {
          kind: 'STAGE_MOVED',
          actorId: v.userId,
          projectId: id,
          from: { stageId: current.id, stage: current.name },
          to: { stageId: target.id, stage: target.name, override: incomplete.length > 0, skippedItems: incomplete.map((i) => i.text) },
        },
        tx,
      );
    });
    return this.detail(v, scopesFor(v.roles, 'project.read'), id);
  }

  async stop(v: AuthedViewer, scopes: Scope[], id: string, input: StopProjectInput) {
    const p = await this.scopes.requireProject(v, scopes, id);
    if (p.statusType === 'STOPPED') throw Errors.invalidState('This project is already stopped');
    await this.prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id }, data: { statusType: 'STOPPED', stopReason: input.reason, stopNote: input.note ?? null } });
      await this.activity.log(
        { kind: 'PROJECT_STOPPED', actorId: v.userId, projectId: id, from: { statusType: p.statusType }, to: { statusType: 'STOPPED', reason: input.reason } },
        tx,
      );
    });
    return this.detail(v, scopesFor(v.roles, 'project.read'), id);
  }

  /**
   * TechSpec 9.3: creates the receiving projects linked by parentProjectId, carries attachments
   * over by reference and closes the source at its Done stage. Nothing is copied by hand.
   */
  async handoff(v: AuthedViewer, scopes: Scope[], id: string, input: HandoffInput) {
    const source = await this.scopes.requireProject(v, scopes, id);
    if (source.statusType === 'STOPPED' || source.statusType === 'DONE') throw Errors.invalidState('This project is closed');
    const allowed = HANDOFF_TARGETS[source.department] ?? [];
    const bad = input.targets.find((t) => !allowed.includes(t.department));
    if (bad) throw Errors.validation(`targets: ${source.department} cannot hand off to ${bad.department}`);
    for (const t of input.targets) if (t.teamId) await this.assertTeam(t.teamId);

    await this.prisma.$transaction(async (tx) => {
      const attachments = await tx.attachment.findMany({ where: { projectId: source.id } });
      const out = [];
      for (const t of input.targets) {
        const project = await createProject(tx, v.userId, {
          clientId: source.clientId,
          department: t.department,
          pmId: source.pmId,
          packageId: t.packageId,
          teamId: t.teamId,
          startDate: t.startDate,
          cycleDay: t.cycleDay,
          parentProjectId: source.id,
        });
        if (attachments.length) {
          await tx.attachment.createMany({
            data: attachments.map((a) => ({
              projectId: project.id,
              storageKey: a.storageKey,
              fileName: a.fileName,
              contentType: a.contentType,
              size: a.size,
              uploadedById: a.uploadedById,
              source: 'HANDOFF',
            })),
          });
        }
        const team = project.teamId ? await tx.team.findUnique({ where: { id: project.teamId } }) : null;
        await this.activity.log(
          {
            kind: 'HANDED_OVER_FROM',
            actorId: v.userId,
            projectId: project.id,
            from: { projectId: source.id, department: source.department },
            // Receiving TL; in-app notification arrives with Phase 1F.
            to: { teamLeaderId: team?.leaderId ?? null, attachments: attachments.length },
          },
          tx,
        );
        out.push(project);
      }

      const done = await tx.stage.findFirst({ where: { pipelineId: source.pipelineId, statusType: 'DONE' }, orderBy: { order: 'asc' } });
      if (done) {
        await tx.project.update({ where: { id: source.id }, data: { stageId: done.id, statusType: 'DONE', stageEnteredAt: new Date() } });
      }
      await this.activity.log(
        { kind: 'HANDED_OFF', actorId: v.userId, projectId: source.id, to: { projects: out.map((p) => ({ id: p.id, department: p.department })) } },
        tx,
      );
      return out;
    });

    // The source detail lists the new projects under `related`.
    return this.detail(v, scopesFor(v.roles, 'project.read'), source.id);
  }

  async setChecklistItem(v: AuthedViewer, scopes: Scope[], projectId: string, itemId: string, done: boolean) {
    await this.scopes.requireProject(v, scopes, projectId);
    const item = await this.prisma.checklistItem.findFirst({ where: { id: itemId, projectId } });
    if (!item) throw Errors.notFound('Checklist item');
    const updated = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: { done, doneAt: done ? new Date() : null, doneById: done ? v.userId : null },
    });
    return presentChecklistItem(updated);
  }

  async addAttachment(v: AuthedViewer, scopes: Scope[], projectId: string, file: IncomingFile | undefined, taskId: string | null = null) {
    if (!file) throw Errors.validation('file: required');
    await this.scopes.requireProject(v, scopes, projectId);
    const key = `projects/${projectId}/${randomUUID()}${extname(file.originalname).slice(0, 12)}`;
    await this.storage.put(key, file.buffer, file.mimetype || 'application/octet-stream');
    const a = await this.prisma.attachment.create({
      data: {
        projectId,
        taskId,
        storageKey: key,
        fileName: file.originalname.slice(0, 200),
        contentType: file.mimetype || 'application/octet-stream',
        size: file.size,
        uploadedById: v.userId,
      },
    });
    await this.activity.log({ kind: 'ATTACHMENT_ADDED', actorId: v.userId, projectId, taskId, to: { attachmentId: a.id, fileName: a.fileName } });
    return presentAttachment(a, await this.directory.names([v.userId]));
  }

  private async assertTeam(teamId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw Errors.validation('teamId: team does not exist');
  }
}
