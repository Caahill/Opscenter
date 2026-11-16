// Phase 1D response shapes. Optional properties may be omitted by the Policy Serializer: client
// addresses and numbers reach only Admin and the client's PM; everyone else gets the label.
import type { Channel, Direction, Priority, TriageState } from './enums';
import type { TaskView } from './api-types-work';
import type { TriageAction, TriageCategory } from './schemas-inbox';

export interface TriageSuggestionView {
  category: TriageCategory;
  projectId: string | null;
  action: TriageAction;
  taskId: string | null;
  suggestedTitle: string;
  suggestedPriority: Priority;
  summary: string;
  confidence: number;
}

export interface TriageView {
  suggestion: TriageSuggestionView | null;
  model: string;
  at: string;
}

export interface MessageAttachmentView {
  index: number;
  fileName: string;
  contentType: string;
  size: number;
}

export interface MessageView {
  id: string;
  channel: Channel;
  direction: Direction;
  threadKey: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  taskId: string | null;
  /** Safe display: the contact label for client senders, the staff member or mailbox for ours. */
  sender: string;
  /** Real address or number for full viewers; the label otherwise. */
  from?: string;
  to?: string[] | string;
  cc?: string[] | string;
  subject?: string | null;
  body?: string;
  snippet: string;
  attachments: MessageAttachmentView[];
  sentAt: string;
  sentByName: string | null;
  mailboxLabel: string | null;
  triageState: TriageState;
  triage: TriageView | null;
  category: TriageCategory | null;
  triagedByName: string | null;
  linkMethod: string | null;
  /** Arrived since the viewer last opened the thread (never true for their own messages). */
  unread: boolean;
}

export interface ThreadSummaryView {
  threadKey: string;
  channel: Channel;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  sender: string;
  subject?: string | null;
  snippet: string;
  lastAt: string;
  lastDirection: Direction;
  messageCount: number;
  needsTriage: boolean;
  unmatched: boolean;
  mailboxLabel: string | null;
  /** Something arrived since the viewer last opened it. */
  unread: boolean;
}

export interface ThreadListView {
  threads: ThreadSummaryView[];
  nextBefore: string | null;
}

export interface ThreadView {
  threadKey: string;
  channel: Channel;
  clientId: string | null;
  clientName: string | null;
  messages: MessageView[];
  /** WhatsApp: free-form replies are allowed until this time; after it, a template is needed. */
  windowOpenUntil: string | null;
  mailboxId: string | null;
}

export interface TriageResultView {
  message: MessageView;
  task: TaskView | null;
}

export interface SendResultView {
  message: MessageView;
}

export interface MailboxView {
  id: string;
  address: string;
  label: string;
  ownerUserId: string | null;
  ownerName: string | null;
  active: boolean;
  lastSyncAt: string | null;
  syncError: string | null;
  watchExpiry: string | null;
  backfillDoneAt: string | null;
  mode: 'live' | 'fake';
}

export interface ImportResultView {
  id: string;
  chatName: string;
  messages: number;
  duplicates: number;
  media: number;
  threadKey: string | null;
}

/** Result groups are omitted for roles with no client access (HR). */
export interface SearchResultsView {
  communications?: ThreadSummaryView[];
  tasks?: TaskView[];
  clients?: Array<{ id: string; companyName?: string; website?: string | null; market?: string }>;
  tookMs: number;
}

export interface InboxSettingsView {
  gmailMode: 'live' | 'fake';
  whatsappMode: 'live' | 'fake';
  aiMode: 'live' | 'fake';
  whatsappTemplates: Array<{ name: string; language: string }>;
}
