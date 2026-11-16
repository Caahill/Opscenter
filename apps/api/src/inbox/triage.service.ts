// PRD 2.4 triage into tasks: the classifier suggests, a PM or TL confirms (as is or edited) or
// dismisses. Confirming files the message's attachments to the project. Outcomes are stored so
// suggestion accuracy can be measured (TechSpec 7.3).
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import type { Classifier } from '@opshub/integrations';
import { present, scopesFor, type Presentable, type Scope } from '@opshub/policy';
import type { TriageDecisionInput } from '@opshub/shared';
import { ActivityService } from '../common/activity.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { TasksService } from '../tasks/tasks.service';
import { classifyCommunication, type StoredTriage } from './classify';
import { COMM_INCLUDE, snippetOf, TriageResultDto } from './dtos';
import { MessagesQueries } from './messages';
import { CLASSIFIER } from './providers';
import type { StoredAttachment } from './store';

@Injectable()
export class TriageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly messages: MessagesQueries,
    private readonly tasks: TasksService,
    private readonly activity: ActivityService,
    jobs: JobsService,
    @Inject(CLASSIFIER) private readonly classifier: Classifier,
  ) {
    jobs.register('triage.classify', async (data) => classifyCommunication(this.prisma, this.classifier, String(data.id)));
  }

  async decide(v: AuthedViewer, scopes: Scope[], id: string, input: TriageDecisionInput) {
    const msg = await this.scopes.requireCommunication(v, scopes, id);
    if (!msg.clientId) throw Errors.invalidState('Link this message to a client first');
    if (msg.direction !== 'INBOUND') throw Errors.invalidState('Only client messages are triaged');
    if (msg.triageState === 'CONFIRMED' || msg.triageState === 'DISMISSED') throw Errors.conflict('This message has already been triaged');
    const stored = msg.triage as unknown as StoredTriage | null;
    const s = stored?.suggestion ?? null;
    const base = { triagedById: v.userId, triagedAt: new Date() };

    if (input.decision === 'DISMISS') {
      await this.prisma.communication.update({
        where: { id },
        data: { ...base, triageState: 'DISMISSED', triageOutcome: { decision: 'DISMISS', model: stored?.model ?? null, suggested: s?.action ?? null } },
      });
      return this.result(v, id, null);
    }

    const action = input.action ?? s?.action ?? 'NONE';
    const category = input.category ?? s?.category ?? 'OTHER';
    const projectId = input.projectId !== undefined ? input.projectId : (s?.projectId ?? null);
    const project = projectId ? await this.prisma.project.findFirst({ where: { id: projectId, clientId: msg.clientId } }) : null;
    if (projectId && !project) throw Errors.validation("projectId: must be one of this client's projects");
    if (action !== 'NONE' && !project) throw Errors.validation('projectId: choose the project this message is about');

    let taskId: string | null = null;
    let task: Presentable | null = null;
    if (action === 'CREATE_TASK') {
      task = await this.tasks.create(
        v,
        scopesFor(v.roles, 'task.create'),
        {
          projectId: project!.id,
          title: input.title ?? s?.suggestedTitle ?? msg.subjectMasked ?? 'Client request',
          type: category === 'CHANGE_REQUEST' ? 'CHANGE_REQUEST' : 'DELIVERABLE',
          // The masked text: readable by everyone on the task, with client contact details removed.
          description: msg.bodyMasked,
          priority: input.priority ?? s?.suggestedPriority ?? 'NORMAL',
          assigneeId: input.assigneeId ?? null,
          dueDate: input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null,
        },
        { source: msg.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL', sourceCommId: msg.id },
      );
      taskId = (task.data as { id: string }).id;
    } else if (action === 'ATTACH_TO_TASK') {
      const target = input.taskId !== undefined ? input.taskId : (s?.taskId ?? null);
      if (!target) throw Errors.validation('taskId: choose the task to add this message to');
      const t = await this.scopes.requireTask(v, scopesFor(v.roles, 'task.update'), target);
      if (t.projectId !== project!.id) throw Errors.validation('taskId: must be a task on the chosen project');
      taskId = t.id;
      await this.prisma.taskComment.create({
        data: { taskId, authorId: v.userId, body: `Client message added from the inbox: "${snippetOf(msg.bodyMasked)}"` },
      });
    } else if (action === 'LOG_APPROVAL') {
      await this.scopes.requireProject(v, scopesFor(v.roles, 'project.read'), project!.id);
      await this.activity.log({ kind: 'CLIENT_APPROVAL', actorId: v.userId, projectId: project!.id, to: { communicationId: msg.id, summary: s?.summary ?? snippetOf(msg.bodyMasked) } });
    }

    // Which suggested fields the person changed: the accuracy measure for TechSpec 7.3.
    const edited: string[] = [];
    if (s) {
      if (category !== s.category) edited.push('category');
      if (action !== s.action) edited.push('action');
      if ((project?.id ?? null) !== s.projectId) edited.push('projectId');
      if (input.title !== undefined && input.title !== s.suggestedTitle) edited.push('title');
      if (input.priority !== undefined && input.priority !== s.suggestedPriority) edited.push('priority');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.communication.update({
        where: { id },
        data: {
          ...base,
          triageState: 'CONFIRMED',
          category,
          projectId: project?.id ?? null,
          taskId,
          triageOutcome: { decision: 'CONFIRM', action, model: stored?.model ?? null, edited } as Prisma.InputJsonValue,
        },
      });
      // PRD 2.4: attachments are filed to the project (and the task) without anyone copying them.
      if (project) {
        for (const a of msg.attachments as unknown as StoredAttachment[]) {
          await tx.attachment.create({
            data: { projectId: project.id, taskId, storageKey: a.key, fileName: a.fileName, contentType: a.contentType, size: a.size, source: msg.channel === 'WHATSAPP' ? 'WHATSAPP' : 'EMAIL' },
          });
        }
      }
    });
    return this.result(v, id, task);
  }

  private async result(v: AuthedViewer, id: string, task: Presentable | null) {
    const row = await this.prisma.communication.findUniqueOrThrow({ where: { id }, include: COMM_INCLUDE });
    return present(TriageResultDto, { message: (await this.messages.present(v, [row]))[0]!, task });
  }
}
