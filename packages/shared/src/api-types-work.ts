// Phase 1B response shapes after the Policy Serializer. Restricted fields are optional because
// they are omitted for viewers who may not see them; contact fields may arrive as a label.
import type {
  ClientStatus,
  Department,
  Health,
  Priority,
  ProjectType,
  StatusType,
  StopReason,
  TaskSource,
  TaskType,
} from './enums';
import type { TaskTemplate } from './templates';

export interface ClientView {
  id: string;
  companyName?: string;
  website?: string | null;
  market?: string;
  status?: ClientStatus;
  pmId?: string;
  pmName?: string | null;
  salesOwnerId?: string | null;
  tags?: string[];
  createdAt?: string;
  projectCount?: number;
  contractValue?: string | null;
  taxId?: string | null;
  emailDomains?: string[];
}

export interface ContactView {
  id: string;
  clientId?: string;
  role?: string;
  label?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
}

export interface GrantView {
  id: string;
  userId?: string;
  userName?: string;
  taskId?: string;
  taskTitle?: string;
  expiresAt?: string;
  revokedAt?: string | null;
}

export interface CredentialView {
  id: string;
  clientId?: string;
  system?: string;
  label?: string;
  grants?: GrantView[];
}

export interface CredentialRevealView {
  username?: string;
  password?: string;
  notes?: string | null;
}

export interface StageView {
  id: string;
  name: string;
  order: number;
  statusType: StatusType;
  phase: 'SETUP' | 'CYCLE';
  slaDays: number | null;
  checklist: Array<{ text: string; ownerRole?: string }>;
}

export interface PipelineView {
  id: string;
  department: Department;
  version: number;
  active: boolean;
  stages: StageView[];
  projectCount: number;
}

export interface PackageView {
  id: string;
  department: Department;
  name: string;
  setupTasks: TaskTemplate[];
  cycleTasks: TaskTemplate[];
  monthlyHours: string | null;
  active: boolean;
}

export interface ChecklistItemView {
  id: string;
  text?: string;
  done?: boolean;
  ownerRole?: string | null;
  stageId?: string | null;
}

export interface CommentView {
  id: string;
  authorId?: string;
  authorName?: string | null;
  body?: string;
  createdAt?: string;
}

export interface AttachmentView {
  id: string;
  taskId?: string | null;
  fileName?: string;
  contentType?: string;
  size?: number;
  source?: string;
  uploadedByName?: string | null;
  createdAt?: string;
}

export interface ActivityView {
  id: string;
  kind?: string;
  actorName?: string | null;
  from?: Record<string, unknown> | null;
  to?: Record<string, unknown> | null;
  at?: string;
}

export interface ProjectView {
  memberSendEnabled?: boolean;
  id: string;
  clientId?: string;
  clientName?: string;
  department?: Department;
  pipelineId?: string;
  stageId?: string;
  stageName?: string;
  stageOrder?: number;
  stagePhase?: 'SETUP' | 'CYCLE';
  packageId?: string | null;
  packageName?: string | null;
  type?: ProjectType;
  statusType?: StatusType;
  startDate?: string | null;
  endDate?: string | null;
  renewalDate?: string | null;
  cycleDay?: number | null;
  health?: Health;
  holdReason?: string | null;
  stopReason?: StopReason | null;
  stopNote?: string | null;
  pmId?: string;
  pmName?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  parentProjectId?: string | null;
  stageEnteredAt?: string;
  createdAt?: string;
  openTaskCount?: number;
  overdueTaskCount?: number;
  value?: string | null;
  billingCycle?: string | null;
}

export interface ProjectDetailView extends ProjectView {
  stages?: StageView[];
  checklist?: ChecklistItemView[];
  tasks?: TaskView[];
  attachments?: AttachmentView[];
  activity?: ActivityView[];
  related?: ProjectView[];
}

export interface TaskView {
  id: string;
  projectId?: string;
  clientId?: string;
  clientName?: string;
  department?: Department;
  parentTaskId?: string | null;
  title?: string;
  type?: TaskType;
  description?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  teamId?: string | null;
  priority?: Priority;
  dueDate?: string | null;
  plannedDate?: string | null;
  estimateH?: string | null;
  progressPct?: number;
  statusType?: StatusType;
  billable?: boolean;
  billableConfirmed?: boolean;
  source?: TaskSource;
  cycleMonth?: string | null;
  dependsOnId?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  subtaskCount?: number;
  checklistDone?: number;
  checklistTotal?: number;
}

export interface TaskDetailView extends TaskView {
  checklist?: ChecklistItemView[];
  subtasks?: TaskView[];
  comments?: CommentView[];
  attachments?: AttachmentView[];
  activity?: ActivityView[];
  credentials?: CredentialView[];
  canEdit?: string[];
  /** The client message the task was created from (PRD story: work from the exact request). */
  sourceMessage?: import('./api-types-inbox').MessageView | null;
  /** The billing request that bills this task (client's PM, Admin and Accounts only). */
  billing?: import('./api-types-billing').TaskBillingView | null;
}

export interface BoardColumnView {
  stageId: string;
  stageName: string;
  statusType: StatusType;
  phase: 'SETUP' | 'CYCLE';
  projects: ProjectView[];
}

export interface BoardView {
  department: Department;
  pipelineVersion: number;
  columns: BoardColumnView[];
}

export interface Client360View {
  client: ClientView;
  contacts: ContactView[];
  projects: ProjectView[];
  openTasks: TaskView[];
  credentials: CredentialView[];
  /** Latest threads the viewer may see (Phase 1D). */
  communications: import('./api-types-inbox').ThreadSummaryView[];
  /** The viewer's billing requests for this client (Phase 1E). */
  billingRequests?: import('./api-types-billing').BillingRequestView[];
  renewals: ProjectView[];
}
