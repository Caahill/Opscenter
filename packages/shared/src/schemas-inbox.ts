// Phase 1D inputs: inbox, triage, compose, mailboxes, WhatsApp imports and search.
import { z } from 'zod';
import { CHANNELS, CONTACT_ROLES, PRIORITIES, TRIAGE_STATES } from './enums';

const id = z.string().min(1).max(64);
const day = z.string().date();

export const TRIAGE_CATEGORIES = ['CHANGE_REQUEST', 'ASSET_SHARED', 'APPROVAL', 'QUESTION', 'COMPLAINT', 'BILLING', 'OTHER'] as const;
export type TriageCategory = (typeof TRIAGE_CATEGORIES)[number];
export const TRIAGE_ACTIONS = ['ATTACH_TO_TASK', 'CREATE_TASK', 'LOG_APPROVAL', 'NONE'] as const;
export type TriageAction = (typeof TRIAGE_ACTIONS)[number];

export const TRIAGE_CATEGORY_LABELS: Record<TriageCategory, string> = {
  CHANGE_REQUEST: 'Change request',
  ASSET_SHARED: 'Content or asset shared',
  APPROVAL: 'Approval',
  QUESTION: 'Question',
  COMPLAINT: 'Complaint',
  BILLING: 'Billing',
  OTHER: 'Other',
};

export const TRIAGE_ACTION_LABELS: Record<TriageAction, string> = {
  ATTACH_TO_TASK: 'Add to existing task',
  CREATE_TASK: 'Create a task',
  LOG_APPROVAL: 'Log the approval',
  NONE: 'No action',
};

export const INBOX_VIEWS = ['all', 'triage', 'unmatched', 'sent'] as const;
export type InboxView = (typeof INBOX_VIEWS)[number];

export const ListThreadsQuery = z.object({
  view: z.enum(INBOX_VIEWS).default('all'),
  channel: z.enum(CHANNELS).optional(),
  clientId: id.optional(),
  projectId: id.optional(),
  /** Threads whose latest message is older than this (paging). */
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ListThreadsQuery = z.infer<typeof ListThreadsQuery>;

/**
 * Confirm takes the suggestion as it is, or with edits; every field defaults to the suggestion.
 * Dismiss records that nothing should happen.
 */
export const TriageDecisionInput = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('CONFIRM'),
    category: z.enum(TRIAGE_CATEGORIES).optional(),
    action: z.enum(TRIAGE_ACTIONS).optional(),
    projectId: id.nullable().optional(),
    taskId: id.nullable().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    priority: z.enum(PRIORITIES).optional(),
    assigneeId: id.nullable().optional(),
    dueDate: day.nullable().optional(),
  }),
  z.object({ decision: z.literal('DISMISS') }),
]);
export type TriageDecisionInput = z.infer<typeof TriageDecisionInput>;

export const LinkMessageInput = z.object({
  clientId: id,
  /** Save the sender on the client, which re-links their past and future messages (PRD edge case). */
  saveAsContact: z
    .object({ role: z.enum(CONTACT_ROLES), name: z.string().trim().min(1).max(120), label: z.string().trim().max(60).optional() })
    .optional(),
});
export type LinkMessageInput = z.infer<typeof LinkMessageInput>;

export const SEND_MODES = ['NEW', 'REPLY', 'REPLY_ALL', 'FORWARD'] as const;
export type SendMode = (typeof SEND_MODES)[number];

/**
 * Compose by contact id (AGENTS.md rule 6). `addresses` is accepted only from viewers who may see
 * the client's contact data; the API resolves everything else to real addresses at send time.
 */
export const SendMessageInput = z
  .object({
    channel: z.enum(CHANNELS),
    mode: z.enum(SEND_MODES).default('NEW'),
    replyToId: id.optional(),
    clientId: id.optional(),
    mailboxId: id.optional(),
    contactIds: z.array(id).max(20).default([]),
    ccContactIds: z.array(id).max(20).default([]),
    /** Reply to whoever sent the original, without the viewer knowing the address. */
    toSender: z.boolean().default(false),
    addresses: z.array(z.string().trim().toLowerCase().email()).max(20).default([]),
    subject: z.string().trim().max(250).optional(),
    body: z.string().max(50_000).default(''),
    /** WhatsApp outside the 24-hour window needs an approved template. */
    template: z.object({ name: z.string().min(1).max(100), language: z.string().min(2).max(10), params: z.array(z.string().max(500)).max(10).default([]) }).optional(),
    projectId: id.nullable().optional(),
    taskId: id.nullable().optional(),
  })
  .refine((v) => v.mode === 'NEW' || v.replyToId, { message: 'replyToId: needed to reply or forward' })
  .refine((v) => v.mode !== 'NEW' || v.clientId, { message: 'clientId: needed for a new message' })
  .refine((v) => v.body.trim() || v.template, { message: 'body: write a message' });
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const CreateMailboxInput = z.object({
  address: z.string().trim().toLowerCase().email(),
  label: z.string().trim().max(60).default(''),
  /** Null for shared mailboxes (support@, development@); a PM for their own mailbox. */
  ownerUserId: id.nullable().default(null),
});
export type CreateMailboxInput = z.infer<typeof CreateMailboxInput>;

export const UpdateMailboxInput = z
  .object({ label: z.string().trim().max(60), ownerUserId: id.nullable(), active: z.boolean() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateMailboxInput = z.infer<typeof UpdateMailboxInput>;

export const BackfillInput = z.object({ from: day.optional() });

export const ImportChatInput = z.object({
  clientId: id,
  projectId: id.nullable().optional(),
  dateOrder: z.enum(['DMY', 'MDY']).optional(),
  timeZone: z.string().min(1).max(60).optional(),
});
export type ImportChatInput = z.infer<typeof ImportChatInput>;

export const SEARCH_TYPES = ['all', 'communication', 'task', 'client'] as const;
export const SearchQuery = z.object({
  q: z.string().trim().min(2).max(200),
  type: z.enum(SEARCH_TYPES).default('all'),
  clientId: id.optional(),
  projectId: id.optional(),
  channel: z.enum(CHANNELS).optional(),
  from: day.optional(),
  to: day.optional(),
  senderRole: z.enum(CONTACT_ROLES).optional(),
  triageState: z.enum(TRIAGE_STATES).optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

export const SimulateMessageInput = z
  .object({
    channel: z.enum(CHANNELS),
    /** An email address or a WhatsApp number with country code; defaults to the thread's client. */
    from: z.string().trim().min(3).max(200).optional(),
    subject: z.string().trim().max(250).optional(),
    body: z.string().min(1).max(10_000),
    mailboxId: id.optional(),
    /** Continue an existing thread (a reply typed in Gmail). */
    threadKey: z.string().max(200).optional(),
    attachmentName: z.string().trim().max(120).optional(),
    sentAt: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => v.from || v.threadKey, { message: 'from: needed for a new thread' });
export type SimulateMessageInput = z.infer<typeof SimulateMessageInput>;

/** Email templates (PRD 2.2). Placeholders are filled in the composer from client and project. */
export const EMAIL_TEMPLATES = [
  {
    key: 'welcome',
    label: 'Welcome email',
    subject: 'Welcome to SySpree, {client}',
    body: 'Hi,\n\nWelcome aboard! I am {pm}, your project manager for {project}. Over the next few days we will collect the access we need and share a short plan for the first month.\n\nReply to this email any time; it reaches the whole team.\n\nBest regards,\n{pm}',
  },
  {
    key: 'approval',
    label: 'Approval request',
    subject: 'Approval needed: {project}',
    body: 'Hi,\n\nThe next piece of work for {project} is ready for your review. Please reply with "approved" or let us know what to change.\n\nThanks,\n{pm}',
  },
  {
    key: 'monthly-report',
    label: 'Monthly report',
    subject: '{project} report for {month}',
    body: 'Hi,\n\nPlease find this month\'s {project} report attached. Highlights and next steps are in the summary on the first page.\n\nHappy to walk you through it on a call.\n\nBest regards,\n{pm}',
  },
] as const;
