import type { Department, Prisma, ProjectType, Stage } from '@opshub/db';
import { parseTemplates, PROJECT_TYPE_BY_DEPARTMENT, tasksFromTemplates } from '@opshub/db';
import { ChecklistTemplate } from '@opshub/shared';
import { Errors } from '../common/errors';

type Tx = Prisma.TransactionClient;

/** Instantiates a stage's entry checklist on a project, once. */
export async function ensureStageChecklist(tx: Tx, projectId: string, stage: Stage) {
  const existing = await tx.checklistItem.count({ where: { projectId, stageId: stage.id } });
  if (existing > 0) return;
  const items = ChecklistTemplate.safeParse(stage.checklist);
  if (!items.success || items.data.length === 0) return;
  await tx.checklistItem.createMany({
    data: items.data.map((c, i) => ({ projectId, stageId: stage.id, text: c.text, ownerRole: c.ownerRole ?? null, order: i })),
  });
}

export interface NewProject {
  clientId: string;
  department: Department;
  pmId: string;
  packageId?: string | null;
  type?: ProjectType;
  teamId?: string | null;
  startDate?: Date;
  endDate?: Date | null;
  renewalDate?: Date | null;
  cycleDay?: number | null;
  value?: string | null;
  billingCycle?: string | null;
  parentProjectId?: string | null;
}

/**
 * Creates a project on the department's active pipeline at its first stage, with that stage's
 * checklist and the package's setup tasks. Used by POST /projects and by hand-off.
 */
export async function createProject(tx: Tx, actorId: string, input: NewProject) {
  const pipeline = await tx.pipeline.findFirst({
    where: { department: input.department, active: true },
    orderBy: { version: 'desc' },
    include: { stages: { orderBy: { order: 'asc' } } },
  });
  const first = pipeline?.stages[0];
  if (!pipeline || !first) throw Errors.invalidState(`No active pipeline for ${input.department}`);

  const pkg = input.packageId ? await tx.package.findUnique({ where: { id: input.packageId } }) : null;
  if (input.packageId && (!pkg || pkg.department !== input.department || !pkg.active)) {
    throw Errors.validation('packageId: must be an active package of the same department');
  }

  const teamId =
    input.teamId !== undefined ? input.teamId : ((await tx.team.findFirst({ where: { department: input.department }, orderBy: { name: 'asc' } }))?.id ?? null);
  const type = input.type ?? PROJECT_TYPE_BY_DEPARTMENT[input.department];
  const startDate = input.startDate ?? new Date(new Date().toISOString().slice(0, 10));
  const cycleDay = input.cycleDay !== undefined ? input.cycleDay : type === 'ONE_TIME' ? null : startDate.getUTCDate();

  const project = await tx.project.create({
    data: {
      clientId: input.clientId,
      department: input.department,
      pipelineId: pipeline.id,
      stageId: first.id,
      statusType: first.statusType,
      packageId: pkg?.id ?? null,
      type,
      startDate,
      endDate: input.endDate ?? null,
      renewalDate: input.renewalDate ?? null,
      cycleDay,
      pmId: input.pmId,
      teamId,
      value: input.value ?? null,
      billingCycle: input.billingCycle ?? null,
      parentProjectId: input.parentProjectId ?? null,
    },
  });
  await ensureStageChecklist(tx, project.id, first);
  if (pkg) {
    const tasks = tasksFromTemplates(parseTemplates(pkg.setupTasks), {
      projectId: project.id,
      teamId,
      from: startDate,
      createdById: actorId,
    });
    if (tasks.length) await tx.task.createMany({ data: tasks });
  }
  await tx.activityLog.create({
    data: {
      kind: 'PROJECT_CREATED',
      actorId,
      projectId: project.id,
      to: { stage: first.name, package: pkg?.name ?? null, parentProjectId: input.parentProjectId ?? null },
    },
  });
  return project;
}

/** Hand-off rules (PRD 1.3 and the client lifecycle). */
export const HANDOFF_TARGETS: Partial<Record<Department, Department[]>> = {
  PRE_SALES: ['ONBOARDING'],
  ONBOARDING: ['WEB_DEV', 'AMC', 'SPEED_AUDIT', 'SEO', 'GOOGLE_ADS', 'SOCIAL_MEDIA', 'GRAPHIC_DESIGN'],
  WEB_DEV: ['AMC'],
};
