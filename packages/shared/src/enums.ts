// Mirrors the Prisma enums in packages/db/prisma/schema.prisma (TechSpec section 4).
// packages/db has a test that fails if the two drift apart.

const values = <const T extends readonly string[]>(...v: T) => v;

export const ROLES = values('ADMIN', 'PM', 'TEAM_LEADER', 'TEAM_MEMBER', 'ACCOUNTS', 'HR');
export type Role = (typeof ROLES)[number];

export const DEPARTMENTS = values(
  'PRE_SALES',
  'ONBOARDING',
  'WEB_DEV',
  'AMC',
  'SPEED_AUDIT',
  'SEO',
  'GOOGLE_ADS',
  'SOCIAL_MEDIA',
  'GRAPHIC_DESIGN',
);
export type Department = (typeof DEPARTMENTS)[number];

export const STATUS_TYPES = values(
  'NOT_STARTED',
  'ACTIVE',
  'WAITING_ON_CLIENT',
  'ON_HOLD',
  'DONE',
  'STOPPED',
);
/** Statuses that still need work: everything but Done and Stopped. */
export const OPEN_STATUS_TYPES = ['NOT_STARTED', 'ACTIVE', 'WAITING_ON_CLIENT', 'ON_HOLD'] as const satisfies readonly StatusType[];
export type StatusType = (typeof STATUS_TYPES)[number];

export const PROJECT_TYPES = values('ONE_TIME', 'RETAINER', 'AMC');
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const HEALTHS = values('ON_TRACK', 'AT_RISK', 'BLOCKED');
export type Health = (typeof HEALTHS)[number];

export const PRIORITIES = values('URGENT', 'HIGH', 'NORMAL', 'LOW');
export type Priority = (typeof PRIORITIES)[number];

export const TASK_TYPES = values(
  'DELIVERABLE',
  'CHANGE_REQUEST',
  'REPORT',
  'FIX',
  'INTERNAL',
  'PRESALES_REQUEST',
);
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_SOURCES = values('MANUAL', 'EMAIL', 'WHATSAPP', 'TEMPLATE', 'IMPORT');
export type TaskSource = (typeof TASK_SOURCES)[number];

export const CHANNELS = values('EMAIL', 'WHATSAPP');
export type Channel = (typeof CHANNELS)[number];

export const DIRECTIONS = values('INBOUND', 'OUTBOUND');
export type Direction = (typeof DIRECTIONS)[number];

export const TRIAGE_STATES = values('NEW', 'SUGGESTED', 'CONFIRMED', 'DISMISSED', 'UNMATCHED');
export type TriageState = (typeof TRIAGE_STATES)[number];

export const BILLING_REASONS = values('ADDITIONAL_TASK', 'RENEWAL', 'NEW_PACKAGE');
export type BillingReason = (typeof BILLING_REASONS)[number];

export const BILLING_STATUSES = values('REQUESTED', 'INVOICED', 'PAID', 'CANCELLED');
export type BillingStatus = (typeof BILLING_STATUSES)[number];

export const CLIENT_STATUSES = values('ACTIVE', 'PAUSED', 'CHURNED');
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const STOP_REASONS = values(
  'CLIENT_PAUSED',
  'CLIENT_CHURNED',
  'NON_PAYMENT',
  'SCOPE_CANCELLED',
);
export type StopReason = (typeof STOP_REASONS)[number];

export const CONTACT_ROLES = values('DECISION_MAKER', 'MARKETING', 'BILLING', 'TECHNICAL');
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  PM: 'Project Manager',
  TEAM_LEADER: 'Team Leader',
  TEAM_MEMBER: 'Team Member',
  ACCOUNTS: 'Accounts',
  HR: 'HR',
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  PRE_SALES: 'Pre-Sales',
  ONBOARDING: 'Client Onboarding',
  WEB_DEV: 'Web Development',
  AMC: 'AMC',
  SPEED_AUDIT: 'Speed / Responsiveness Audit',
  SEO: 'SEO',
  GOOGLE_ADS: 'Google Ads',
  SOCIAL_MEDIA: 'Social Media',
  GRAPHIC_DESIGN: 'Graphic Design',
};

export const STATUS_LABELS: Record<StatusType, string> = {
  NOT_STARTED: 'Not started',
  ACTIVE: 'Active',
  WAITING_ON_CLIENT: 'Waiting on client',
  ON_HOLD: 'On hold',
  DONE: 'Done',
  STOPPED: 'Stopped',
};

export const PRIORITY_LABELS: Record<Priority, string> = { URGENT: 'Urgent', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' };

export const HEALTH_LABELS: Record<Health, string> = { ON_TRACK: 'On track', AT_RISK: 'At risk', BLOCKED: 'Blocked' };

export const STOP_REASON_LABELS: Record<StopReason, string> = {
  CLIENT_PAUSED: 'Client paused',
  CLIENT_CHURNED: 'Client churned',
  NON_PAYMENT: 'Non-payment',
  SCOPE_CANCELLED: 'Scope cancelled',
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  DELIVERABLE: 'Deliverable',
  CHANGE_REQUEST: 'Change request',
  REPORT: 'Report',
  FIX: 'Fix',
  INTERNAL: 'Internal',
  PRESALES_REQUEST: 'Pre-sales request',
};

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  DECISION_MAKER: 'Decision maker',
  MARKETING: 'Marketing',
  BILLING: 'Billing',
  TECHNICAL: 'Technical',
};
