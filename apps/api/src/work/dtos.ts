// Phase 1B response DTOs and mappers. Every property names a row in packages/policy fields.ts.
import type {
  ActivityLog,
  Attachment,
  ChecklistItem,
  Client,
  Contact,
  Credential,
  CredentialGrant,
  Package,
  Pipeline,
  Project,
  Stage,
  Task,
  TaskComment,
} from '@opshub/db';
import { alt, defineDto, label, present, type Presentable } from '@opshub/policy';
import type { CryptoService } from '../crypto/crypto.service';

type Names = Map<string, string>;

export const ClientDto = defineDto('Client', {
  id: 'client.id',
  companyName: 'client.companyName',
  website: 'client.website',
  market: 'client.market',
  status: 'client.status',
  pmId: 'client.pmId',
  pmName: 'client.pmName',
  salesOwnerId: 'client.salesOwnerId',
  tags: 'client.tags',
  createdAt: 'client.createdAt',
  projectCount: 'client.projectCount',
  contractValue: 'client.contractValue',
  taxId: 'client.taxId',
  emailDomains: 'client.emailDomains',
});

export function presentClient(c: Client & { _count?: { projects: number } }, names: Names, crypto: CryptoService) {
  return present(
    ClientDto,
    {
      id: c.id,
      companyName: c.companyName,
      website: c.website,
      market: c.market,
      status: c.status,
      pmId: c.pmId,
      pmName: names.get(c.pmId) ?? null,
      salesOwnerId: c.salesOwnerId,
      tags: c.tags,
      createdAt: c.createdAt,
      projectCount: c._count?.projects ?? null,
      contractValue: c.contractValue,
      taxId: c.taxIdEnc ? alt({ full: () => crypto.decryptWith('pii', c.taxIdEnc!, `client:${c.id}`) }) : null,
      emailDomains: c.emailDomains,
    },
    { clientPmId: c.pmId, entityId: c.id },
  );
}

export const ContactDto = defineDto('Contact', {
  id: 'contact.id',
  clientId: 'contact.clientId',
  role: 'contact.role',
  label: 'contact.label',
  name: 'contact.name',
  email: 'contact.email',
  phone: 'contact.phone',
});

export function presentContact(c: Contact, client: Pick<Client, 'companyName' | 'pmId'>, crypto: CryptoService) {
  const display = label(client.companyName, c.label);
  const open = (enc: Uint8Array | null) =>
    enc ? alt({ full: () => crypto.decrypt({ ciphertext: enc, keyId: c.keyId }, `contact:${c.id}`) }) : null;
  return present(
    ContactDto,
    {
      id: c.id,
      clientId: c.clientId,
      role: c.role,
      label: display,
      name: alt({ full: () => crypto.decrypt({ ciphertext: c.nameEnc, keyId: c.keyId }, `contact:${c.id}`) }),
      email: open(c.emailEnc),
      phone: open(c.phoneEnc),
    },
    { clientPmId: client.pmId, contactRole: c.role, entityId: c.id, label: display },
  );
}

export const GrantDto = defineDto('CredentialGrant', {
  id: 'grant.id',
  userId: 'grant.userId',
  userName: 'grant.userName',
  taskId: 'grant.taskId',
  taskTitle: 'grant.taskTitle',
  expiresAt: 'grant.expiresAt',
  revokedAt: 'grant.revokedAt',
});

export const CredentialDto = defineDto('Credential', {
  id: 'credential.id',
  clientId: 'credential.clientId',
  system: 'credential.system',
  label: 'credential.label',
  grants: 'credential.grants',
});

export function presentCredential(
  c: Credential & { grants: Array<CredentialGrant & { taskTitle?: string | null }> },
  clientPmId: string,
  names: Names,
) {
  return present(
    CredentialDto,
    {
      id: c.id,
      clientId: c.clientId,
      system: c.system,
      label: c.label,
      grants: c.grants.map((g) =>
        present(
          GrantDto,
          {
            id: g.id,
            userId: g.userId,
            userName: names.get(g.userId) ?? null,
            taskId: g.taskId,
            taskTitle: g.taskTitle ?? null,
            expiresAt: g.expiresAt,
            revokedAt: g.revokedAt,
          },
          { clientPmId },
        ),
      ),
    },
    { clientPmId, entityId: c.id },
  );
}

export const CredentialRevealDto = defineDto('Credential', {
  username: 'credentialReveal.username',
  password: 'credentialReveal.password',
  notes: 'credentialReveal.notes',
});

export const StageDto = defineDto('Stage', {
  id: 'stage.id',
  name: 'stage.name',
  order: 'stage.order',
  statusType: 'stage.statusType',
  phase: 'stage.phase',
  slaDays: 'stage.slaDays',
  checklist: 'stage.checklist',
});

export const presentStage = (s: Stage) =>
  present(StageDto, {
    id: s.id,
    name: s.name,
    order: s.order,
    statusType: s.statusType,
    phase: s.phase,
    slaDays: s.slaDays,
    checklist: s.checklist,
  });

export const PipelineDto = defineDto('Pipeline', {
  id: 'pipeline.id',
  department: 'pipeline.department',
  version: 'pipeline.version',
  active: 'pipeline.active',
  stages: 'pipeline.stages',
  projectCount: 'pipeline.projectCount',
});

export const presentPipeline = (p: Pipeline & { stages: Stage[] }, projectCount: number) =>
  present(PipelineDto, {
    id: p.id,
    department: p.department,
    version: p.version,
    active: p.active,
    stages: [...p.stages].sort((a, b) => a.order - b.order).map(presentStage),
    projectCount,
  });

export const PackageDto = defineDto('Package', {
  id: 'package.id',
  department: 'package.department',
  name: 'package.name',
  setupTasks: 'package.setupTasks',
  cycleTasks: 'package.cycleTasks',
  monthlyHours: 'package.monthlyHours',
  active: 'package.active',
});

export const presentPackage = (p: Package) =>
  present(PackageDto, {
    id: p.id,
    department: p.department,
    name: p.name,
    setupTasks: p.setupTasks,
    cycleTasks: p.cycleTasks,
    monthlyHours: p.monthlyHours,
    active: p.active,
  });

export const ProjectDto = defineDto('Project', {
  id: 'project.id',
  clientId: 'project.clientId',
  clientName: 'project.clientName',
  department: 'project.department',
  pipelineId: 'project.pipelineId',
  stageId: 'project.stageId',
  stageName: 'project.stageName',
  stageOrder: 'project.stageOrder',
  stagePhase: 'project.stagePhase',
  packageId: 'project.packageId',
  packageName: 'project.packageName',
  type: 'project.type',
  statusType: 'project.statusType',
  startDate: 'project.startDate',
  endDate: 'project.endDate',
  renewalDate: 'project.renewalDate',
  cycleDay: 'project.cycleDay',
  health: 'project.health',
  holdReason: 'project.holdReason',
  stopReason: 'project.stopReason',
  stopNote: 'project.stopNote',
  pmId: 'project.pmId',
  pmName: 'project.pmName',
  teamId: 'project.teamId',
  teamName: 'project.teamName',
  parentProjectId: 'project.parentProjectId',
  stageEnteredAt: 'project.stageEnteredAt',
  createdAt: 'project.createdAt',
  openTaskCount: 'project.openTaskCount',
  overdueTaskCount: 'project.overdueTaskCount',
  value: 'project.value',
  billingCycle: 'project.billingCycle',
  memberSendEnabled: 'project.memberSendEnabled',
});

export type ProjectRow = Project & {
  client: Pick<Client, 'companyName' | 'pmId'>;
  stage: Stage;
  team: { name: string } | null;
  package: { name: string } | null;
};

export interface ProjectCounts {
  open: Map<string, number>;
  overdue: Map<string, number>;
}

function projectData(p: ProjectRow, names: Names, counts?: ProjectCounts) {
  return {
    id: p.id,
    clientId: p.clientId,
    clientName: p.client.companyName,
    department: p.department,
    pipelineId: p.pipelineId,
    stageId: p.stageId,
    stageName: p.stage.name,
    stageOrder: p.stage.order,
    stagePhase: p.stage.phase,
    packageId: p.packageId,
    packageName: p.package?.name ?? null,
    type: p.type,
    statusType: p.statusType,
    startDate: p.startDate,
    endDate: p.endDate,
    renewalDate: p.renewalDate,
    cycleDay: p.cycleDay,
    health: p.health,
    holdReason: p.holdReason,
    stopReason: p.stopReason,
    stopNote: p.stopNote,
    pmId: p.pmId,
    pmName: names.get(p.pmId) ?? null,
    teamId: p.teamId,
    teamName: p.team?.name ?? null,
    parentProjectId: p.parentProjectId,
    stageEnteredAt: p.stageEnteredAt,
    createdAt: p.createdAt,
    openTaskCount: counts?.open.get(p.id) ?? null,
    overdueTaskCount: counts?.overdue.get(p.id) ?? null,
    value: p.value,
    billingCycle: p.billingCycle,
    memberSendEnabled: p.memberSendEnabled,
  };
}

/** Project value is PM-only on projects where the viewer is the project's assigned PM. */
export const presentProject = (p: ProjectRow, names: Names, counts?: ProjectCounts) =>
  present(ProjectDto, projectData(p, names, counts), { clientPmId: p.pmId, entityId: p.id });

export const ProjectDetailDto = defineDto('Project', {
  ...ProjectDto.fields,
  stages: 'project.stages',
  checklist: 'project.checklist',
  tasks: 'project.tasks',
  attachments: 'project.attachments',
  activity: 'project.activity',
  related: 'project.related',
});

export function presentProjectDetail(
  p: ProjectRow,
  names: Names,
  counts: ProjectCounts,
  parts: { stages: Stage[]; checklist: ChecklistItem[]; tasks: Presentable[]; attachments: Presentable[]; activity: Presentable[]; related: Presentable[] },
) {
  return present(
    ProjectDetailDto,
    {
      ...projectData(p, names, counts),
      stages: parts.stages.map(presentStage),
      checklist: parts.checklist.map(presentChecklistItem),
      tasks: parts.tasks,
      attachments: parts.attachments,
      activity: parts.activity,
      related: parts.related,
    },
    { clientPmId: p.pmId, entityId: p.id },
  );
}

export const ChecklistItemDto = defineDto('ChecklistItem', {
  id: 'checklistItem.id',
  text: 'checklistItem.text',
  done: 'checklistItem.done',
  ownerRole: 'checklistItem.ownerRole',
  stageId: 'checklistItem.stageId',
});

export const presentChecklistItem = (c: ChecklistItem) =>
  present(ChecklistItemDto, { id: c.id, text: c.text, done: c.done, ownerRole: c.ownerRole, stageId: c.stageId });

export const TaskDto = defineDto('Task', {
  id: 'task.id',
  projectId: 'task.projectId',
  clientId: 'task.clientId',
  clientName: 'task.clientName',
  department: 'task.department',
  parentTaskId: 'task.parentTaskId',
  title: 'task.title',
  type: 'task.type',
  description: 'task.description',
  assigneeId: 'task.assigneeId',
  assigneeName: 'task.assigneeName',
  teamId: 'task.teamId',
  priority: 'task.priority',
  dueDate: 'task.dueDate',
  plannedDate: 'task.plannedDate',
  estimateH: 'task.estimateH',
  progressPct: 'task.progressPct',
  statusType: 'task.statusType',
  billable: 'task.billable',
  billableConfirmed: 'task.billableConfirmed',
  source: 'task.source',
  cycleMonth: 'task.cycleMonth',
  dependsOnId: 'task.dependsOnId',
  createdAt: 'task.createdAt',
  completedAt: 'task.completedAt',
  subtaskCount: 'task.subtaskCount',
  checklistDone: 'task.checklistDone',
  checklistTotal: 'task.checklistTotal',
});

export type TaskRow = Task & {
  project: Pick<Project, 'clientId' | 'department' | 'pmId'> & { client: { companyName: string } };
  assignee?: { name: string } | null;
};

export interface TaskCounts {
  subtasks: Map<string, number>;
  checklistDone: Map<string, number>;
  checklistTotal: Map<string, number>;
}

function taskData(t: TaskRow, counts?: TaskCounts) {
  return {
    id: t.id,
    projectId: t.projectId,
    clientId: t.project.clientId,
    clientName: t.project.client.companyName,
    department: t.project.department,
    parentTaskId: t.parentTaskId,
    title: t.title,
    type: t.type,
    description: t.description,
    assigneeId: t.assigneeId,
    assigneeName: t.assignee?.name ?? null,
    teamId: t.teamId,
    priority: t.priority,
    dueDate: t.dueDate,
    plannedDate: t.plannedDate,
    estimateH: t.estimateH,
    progressPct: t.progressPct,
    statusType: t.statusType,
    billable: t.billable,
    billableConfirmed: t.billableConfirmed,
    source: t.source,
    cycleMonth: t.cycleMonth,
    dependsOnId: t.dependsOnId,
    createdAt: t.createdAt,
    completedAt: t.completedAt,
    subtaskCount: counts?.subtasks.get(t.id) ?? 0,
    checklistDone: counts?.checklistDone.get(t.id) ?? 0,
    checklistTotal: counts?.checklistTotal.get(t.id) ?? 0,
  };
}

export const presentTask = (t: TaskRow, counts?: TaskCounts) =>
  present(TaskDto, taskData(t, counts), { clientPmId: t.project.pmId, entityId: t.id });

export const TaskDetailDto = defineDto('Task', {
  ...TaskDto.fields,
  checklist: 'task.checklist',
  subtasks: 'task.subtasks',
  comments: 'task.comments',
  attachments: 'task.attachments',
  activity: 'task.activity',
  credentials: 'task.credentials',
  canEdit: 'task.canEdit',
  sourceMessage: 'task.sourceMessage',
  billing: 'task.billing',
});

export function presentTaskDetail(
  t: TaskRow,
  counts: TaskCounts,
  parts: {
    checklist: ChecklistItem[];
    subtasks: Presentable[];
    comments: Presentable[];
    attachments: Presentable[];
    activity: Presentable[];
    credentials: Presentable[];
    canEdit: string[];
    sourceMessage: Presentable | null;
    billing: { requestId: string; status: string } | null;
  },
) {
  return present(
    TaskDetailDto,
    { ...taskData(t, counts), ...parts, checklist: parts.checklist.map(presentChecklistItem) },
    { clientPmId: t.project.pmId, entityId: t.id },
  );
}

export const CommentDto = defineDto('TaskComment', {
  id: 'comment.id',
  authorId: 'comment.authorId',
  authorName: 'comment.authorName',
  body: 'comment.body',
  createdAt: 'comment.createdAt',
});

export const presentComment = (c: TaskComment, names: Names) =>
  present(CommentDto, { id: c.id, authorId: c.authorId, authorName: names.get(c.authorId) ?? null, body: c.body, createdAt: c.createdAt });

export const AttachmentDto = defineDto('Attachment', {
  id: 'attachment.id',
  taskId: 'attachment.taskId',
  fileName: 'attachment.fileName',
  contentType: 'attachment.contentType',
  size: 'attachment.size',
  source: 'attachment.source',
  uploadedByName: 'attachment.uploadedByName',
  createdAt: 'attachment.createdAt',
});

export const presentAttachment = (a: Attachment, names: Names) =>
  present(AttachmentDto, {
    id: a.id,
    taskId: a.taskId,
    fileName: a.fileName,
    contentType: a.contentType,
    size: a.size,
    source: a.source,
    uploadedByName: a.uploadedById ? (names.get(a.uploadedById) ?? null) : null,
    createdAt: a.createdAt,
  });

export const ActivityDto = defineDto('ActivityLog', {
  id: 'activity.id',
  kind: 'activity.kind',
  actorName: 'activity.actorName',
  from: 'activity.from',
  to: 'activity.to',
  at: 'activity.at',
});

export const presentActivity = (a: ActivityLog, names: Names) =>
  present(ActivityDto, { id: a.id, kind: a.kind, actorName: a.actorId ? (names.get(a.actorId) ?? null) : null, from: a.from, to: a.to, at: a.at });

export const BoardColumnDto = defineDto('BoardColumn', {
  stageId: 'boardColumn.stageId',
  stageName: 'boardColumn.stageName',
  statusType: 'boardColumn.statusType',
  phase: 'boardColumn.phase',
  projects: 'boardColumn.projects',
});

export const BoardDto = defineDto('Board', {
  department: 'board.department',
  pipelineVersion: 'board.pipelineVersion',
  columns: 'board.columns',
});

export const Client360Dto = defineDto('Client', {
  client: 'client360.client',
  contacts: 'client360.contacts',
  projects: 'client360.projects',
  openTasks: 'client360.openTasks',
  credentials: 'client360.credentials',
  communications: 'client360.communications',
  billingRequests: 'client360.billingRequests',
  renewals: 'client360.renewals',
});
