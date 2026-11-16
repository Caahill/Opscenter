// Phase 1B inputs: clients, contacts, credentials, projects, tasks, boards, catalog.
import { z } from 'zod';
import { CONTACT_ROLES, CLIENT_STATUSES, DEPARTMENTS, PRIORITIES, PROJECT_TYPES, STATUS_TYPES, STOP_REASONS, TASK_TYPES } from './enums';
import { ChecklistTemplate, MARKETS, TaskTemplates } from './templates';

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** "2026-11-02" or a full ISO timestamp; stored as UTC. */
export const DateInput = z
  .union([z.string().date(), z.string().datetime({ offset: true })])
  .transform((s) => new Date(s.length === 10 ? `${s}T00:00:00.000Z` : s));

const Money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'must be an amount like 1200 or 1200.50');

export const ListClientsQuery = z.object({
  search: z.string().trim().max(80).optional(),
  market: z.enum(MARKETS).optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  pmId: id.optional(),
});
export type ListClientsQuery = z.infer<typeof ListClientsQuery>;

export const CreateClientInput = z.object({
  companyName: text(120),
  website: optionalText(200),
  market: z.enum(MARKETS),
  pmId: id.optional(),
  salesOwnerId: id.nullable().optional(),
  tags: z.array(text(30)).max(10).optional(),
  emailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, 'must be a domain like example.com')).max(10).optional(),
  taxId: optionalText(40),
  contractValue: Money.nullable().optional(),
});
export type CreateClientInput = z.infer<typeof CreateClientInput>;

export const UpdateClientInput = CreateClientInput.partial()
  .extend({ status: z.enum(CLIENT_STATUSES).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateClientInput = z.infer<typeof UpdateClientInput>;

export const CreateContactInput = z.object({
  role: z.enum(CONTACT_ROLES),
  label: text(60).optional(),
  name: text(120),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  phone: z.string().trim().regex(/^\+?[\d\s().-]{7,20}$/, 'must be a phone number').nullable().optional(),
});
export type CreateContactInput = z.infer<typeof CreateContactInput>;

export const UpdateContactInput = CreateContactInput.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Nothing to update',
});
export type UpdateContactInput = z.infer<typeof UpdateContactInput>;

export const CREDENTIAL_SYSTEMS = ['WEBSITE_ADMIN', 'HOSTING', 'GA', 'GSC', 'GMB', 'GOOGLE_ADS', 'META', 'OTHER'] as const;

export const CreateCredentialInput = z.object({
  system: z.enum(CREDENTIAL_SYSTEMS),
  label: text(80),
  username: text(200),
  password: z.string().min(1).max(500),
  notes: z.string().max(2000).optional(),
});
export type CreateCredentialInput = z.infer<typeof CreateCredentialInput>;

export const CreateGrantInput = z.object({ userId: id, taskId: id });
export type CreateGrantInput = z.infer<typeof CreateGrantInput>;

export const CreateProjectInput = z.object({
  clientId: id,
  department: z.enum(DEPARTMENTS),
  packageId: id.nullable().optional(),
  type: z.enum(PROJECT_TYPES).optional(),
  teamId: id.nullable().optional(),
  pmId: id.optional(),
  startDate: DateInput.optional(),
  endDate: DateInput.nullable().optional(),
  renewalDate: DateInput.nullable().optional(),
  cycleDay: z.number().int().min(1).max(31).nullable().optional(),
  value: Money.nullable().optional(),
  billingCycle: optionalText(40),
});
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;

export const UpdateProjectInput = z
  .object({
    teamId: id.nullable(),
    pmId: id,
    packageId: id.nullable(),
    startDate: DateInput.nullable(),
    endDate: DateInput.nullable(),
    renewalDate: DateInput.nullable(),
    cycleDay: z.number().int().min(1).max(31).nullable(),
    health: z.enum(['ON_TRACK', 'AT_RISK', 'BLOCKED']),
    /** Pause or resume at any stage. STOPPED goes through /stop. */
    statusType: z.enum(['ACTIVE', 'WAITING_ON_CLIENT', 'ON_HOLD']),
    holdReason: optionalText(200),
    value: Money.nullable(),
    billingCycle: optionalText(40),
    /** PRD OQ10: Team Members may email this client from a shared mailbox. Off by default. */
    memberSendEnabled: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateProjectInput = z.infer<typeof UpdateProjectInput>;

export const MoveStageInput = z.object({
  stageId: id,
  /** Move on although the current stage checklist is incomplete; logged as an override. */
  override: z.boolean().optional(),
});
export type MoveStageInput = z.infer<typeof MoveStageInput>;

export const StopProjectInput = z.object({ reason: z.enum(STOP_REASONS), note: optionalText(500) });
export type StopProjectInput = z.infer<typeof StopProjectInput>;

export const HandoffInput = z.object({
  targets: z
    .array(
      z.object({
        department: z.enum(DEPARTMENTS),
        packageId: id.nullable().optional(),
        teamId: id.nullable().optional(),
        startDate: DateInput.optional(),
        cycleDay: z.number().int().min(1).max(31).nullable().optional(),
      }),
    )
    .min(1)
    .max(8),
});
export type HandoffInput = z.infer<typeof HandoffInput>;

export const ListProjectsQuery = z.object({
  clientId: id.optional(),
  department: z.enum(DEPARTMENTS).optional(),
  statusType: z.enum(STATUS_TYPES).optional(),
});
export type ListProjectsQuery = z.infer<typeof ListProjectsQuery>;

export const BoardQuery = z.object({
  pmId: id.optional(),
  assigneeId: id.optional(),
  market: z.enum(MARKETS).optional(),
  health: z.enum(['ON_TRACK', 'AT_RISK', 'BLOCKED']).optional(),
  priority: z.enum(PRIORITIES).optional(),
  packageId: id.optional(),
  /** Stopped and finished projects are archived history, hidden unless asked for. */
  includeClosed: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type BoardQuery = z.infer<typeof BoardQuery>;

export const CreateTaskInput = z.object({
  projectId: id,
  parentTaskId: id.nullable().optional(),
  title: text(200),
  type: z.enum(TASK_TYPES).default('DELIVERABLE'),
  description: z.string().max(10_000).nullable().optional(),
  assigneeId: id.nullable().optional(),
  teamId: id.nullable().optional(),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  dueDate: DateInput.nullable().optional(),
  plannedDate: DateInput.nullable().optional(),
  estimateH: z.number().min(0).max(400).nullable().optional(),
  billable: z.boolean().optional(),
  dependsOnId: id.nullable().optional(),
});
export type CreateTaskInput = z.infer<typeof CreateTaskInput>;

/** Fields a Team Member may change on their own tasks (PRD access matrix). */
export const MEMBER_TASK_FIELDS = ['statusType', 'progressPct'] as const;

export const UpdateTaskInput = z
  .object({
    title: text(200),
    type: z.enum(TASK_TYPES),
    description: z.string().max(10_000).nullable(),
    assigneeId: id.nullable(),
    teamId: id.nullable(),
    priority: z.enum(PRIORITIES),
    dueDate: DateInput.nullable(),
    plannedDate: DateInput.nullable(),
    estimateH: z.number().min(0).max(400).nullable(),
    progressPct: z.number().int().min(0).max(100),
    statusType: z.enum(STATUS_TYPES),
    dependsOnId: id.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateTaskInput = z.infer<typeof UpdateTaskInput>;

export const ListTasksQuery = z.object({
  projectId: id.optional(),
  department: z.enum(DEPARTMENTS).optional(),
  /** Due-date window, for the board calendar. */
  dueFrom: z.string().date().optional(),
  dueTo: z.string().date().optional(),
  assigneeId: id.optional(),
  statusType: z.enum(STATUS_TYPES).optional(),
  open: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListTasksQuery = z.infer<typeof ListTasksQuery>;

export const MyTasksQuery = z.object({ range: z.enum(['today', 'week']).default('week') });
export type MyTasksQuery = z.infer<typeof MyTasksQuery>;

export const ChecklistItemInput = z.object({ text: text(200) });
export const UpdateChecklistItemInput = z
  .object({ text: text(200), done: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export const CommentInput = z.object({ body: z.string().trim().min(1).max(5000) });

export const CreatePipelineVersionInput = z.object({
  department: z.enum(DEPARTMENTS),
  stages: z
    .array(
      z.object({
        name: text(80),
        statusType: z.enum(STATUS_TYPES),
        phase: z.enum(['SETUP', 'CYCLE']),
        slaDays: z.number().int().min(1).max(365).nullable().optional(),
        checklist: ChecklistTemplate.optional(),
      }),
    )
    .min(2)
    .max(30)
    .refine((stages) => stages.some((s) => s.statusType === 'DONE'), { message: 'needs at least one Done stage' })
    .refine((stages) => new Set(stages.map((s) => s.name.toLowerCase())).size === stages.length, {
      message: 'stage names must be unique',
    }),
});
export type CreatePipelineVersionInput = z.infer<typeof CreatePipelineVersionInput>;

export const UpsertPackageInput = z.object({
  department: z.enum(DEPARTMENTS),
  name: text(120),
  setupTasks: TaskTemplates,
  cycleTasks: TaskTemplates,
  monthlyHours: z.number().min(0).max(400).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpsertPackageInput = z.infer<typeof UpsertPackageInput>;
