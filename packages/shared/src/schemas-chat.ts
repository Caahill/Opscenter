// Phase 1F inputs: internal chat, notification settings and push subscriptions.
import { z } from 'zod';

const id = z.string().min(1).max(64);

export const CHAT_KINDS = ['DIRECT', 'TEAM', 'PROJECT', 'GROUP'] as const;
export type ChatKind = (typeof CHAT_KINDS)[number];

export const MENTION_TYPES = ['user', 'task', 'project', 'client'] as const;
export type MentionType = (typeof MENTION_TYPES)[number];

/**
 * Mentions are written into the text as tokens: @[Asha Admin](user:<id>), #[Fix footer](task:<id>).
 * The label is re-resolved for each reader with their own permissions (PRD 5.2).
 */
export const MENTION_TOKEN = /([@#])\[([^\]\n]{1,120})\]\((user|task|project|client):([A-Za-z0-9_-]{1,64})\)/g;

export function parseMentions(text: string): Array<{ type: MentionType; id: string }> {
  const out = new Map<string, { type: MentionType; id: string }>();
  for (const m of text.matchAll(MENTION_TOKEN)) out.set(`${m[3]}:${m[4]}`, { type: m[3] as MentionType, id: m[4]! });
  return [...out.values()];
}

export const mentionToken = (type: MentionType, mentionId: string, label: string) =>
  `${type === 'user' ? '@' : '#'}[${label.replace(/[[\]\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}](${type}:${mentionId})`;

export const ChatMessageInput = z.object({ body: z.string().trim().min(1).max(4000) });
export type ChatMessageInput = z.infer<typeof ChatMessageInput>;

export const DirectChannelInput = z.object({ userId: id });
export type DirectChannelInput = z.infer<typeof DirectChannelInput>;

/** Group chats: a name and the colleagues to add (the creator is always a member). */
const groupName = z.string().trim().min(1, 'give the group a name').max(60);
export const CreateGroupInput = z.object({ name: groupName, memberIds: z.array(id).min(1, 'add at least one colleague').max(50) });
export type CreateGroupInput = z.infer<typeof CreateGroupInput>;

export const RenameGroupInput = z.object({ name: groupName });
export type RenameGroupInput = z.infer<typeof RenameGroupInput>;

export const GroupMembersInput = z.object({ userIds: z.array(id).min(1).max(50) });
export type GroupMembersInput = z.infer<typeof GroupMembersInput>;

export const ChatHistoryQuery = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ChatHistoryQuery = z.infer<typeof ChatHistoryQuery>;

export const MentionSearchQuery = z.object({ q: z.string().trim().min(1).max(80) });
export type MentionSearchQuery = z.infer<typeof MentionSearchQuery>;

/** PRD 5.3: what people are notified about. In the app always; email digest and push per person. */
export const NOTIFICATION_CATEGORIES = ['MENTION', 'ASSIGNMENT', 'DUE', 'CLIENT_MESSAGE', 'BILLING', 'TEAM', 'OTHER'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  MENTION: 'Mentions in chat',
  ASSIGNMENT: 'Tasks assigned to me',
  DUE: 'Due today and overdue',
  CLIENT_MESSAGE: 'Client messages',
  BILLING: 'Billing and renewals',
  TEAM: 'Leave in my team',
  OTHER: 'Everything else',
};

/** Defaults when a person has not chosen: everything in the digest, push for the time-sensitive ones. */
export const DEFAULT_PREFERENCES: Record<NotificationCategory, { email: boolean; push: boolean }> = {
  MENTION: { email: true, push: true },
  ASSIGNMENT: { email: true, push: true },
  DUE: { email: true, push: false },
  CLIENT_MESSAGE: { email: true, push: true },
  BILLING: { email: true, push: true },
  TEAM: { email: true, push: false },
  OTHER: { email: true, push: false },
};

/** Notification kind -> category. Unknown kinds fall into OTHER. */
export const KIND_CATEGORY: Record<string, NotificationCategory> = {
  MENTION: 'MENTION',
  ASSIGNED: 'ASSIGNMENT',
  DUE: 'DUE',
  CLIENT_MESSAGE: 'CLIENT_MESSAGE',
  BILLING: 'BILLING',
  BILLABLE: 'BILLING',
  RENEWAL_DUE: 'BILLING',
  RENEWAL_DECIDED: 'BILLING',
  LEAVE_IMPACT: 'TEAM',
};
export const categoryOf = (kind: string): NotificationCategory => KIND_CATEGORY[kind] ?? 'OTHER';

export const UpdatePreferencesInput = z.object({
  preferences: z
    .array(z.object({ category: z.enum(NOTIFICATION_CATEGORIES), email: z.boolean(), push: z.boolean() }))
    .min(1)
    .max(NOTIFICATION_CATEGORIES.length),
});
export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesInput>;

export const PushSubscriptionInput = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof PushSubscriptionInput>;

export const RemovePushInput = z.object({ endpoint: z.string().url().max(1000) });
