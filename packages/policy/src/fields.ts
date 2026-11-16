// Field policy table (TechSpec 5.3). Every property of every response DTO maps to a key here;
// the Policy Serializer emits only declared properties, so an unlisted field never leaves the API.
import { viewerClasses, type RecordContext, type Viewer, type ViewerClass } from './viewer';

export type Visibility = 'full' | 'masked' | 'label' | 'amount' | 'none';
/** Accounts sees billing contacts in full and no other contact (PRD access matrix, OQ4 default). */
type ConditionalVisibility = 'billingContactOnly';

type ByClass = Record<ViewerClass, Visibility | ConditionalVisibility>;

export interface FieldRule {
  visibility: 'public' | ByClass;
  /** Write an AuditLog VIEW_UNMASKED row whenever this field is served in full. */
  audit?: boolean;
}

const PUBLIC: FieldRule = { visibility: 'public' };

type V = Visibility | ConditionalVisibility;
/** Columns in TechSpec 5.3 order: Admin, PM (own client), PM (other client), TL, Member, Accounts, HR. */
type Row = [V, V, V, V, V, V, V];

function rule(
  [ADMIN, PM_OWN, PM_OTHER, TEAM_LEADER, TEAM_MEMBER, ACCOUNTS, HR]: Row,
  audit = false,
): FieldRule {
  return {
    visibility: { ADMIN, PM_OWN, PM_OTHER, TEAM_LEADER, TEAM_MEMBER, ACCOUNTS, HR },
    audit,
  };
}

const CLIENT_DIRECTORY = rule(['full', 'full', 'full', 'full', 'full', 'full', 'none']);
const PM_ONLY_VALUE = rule(['full', 'full', 'none', 'none', 'none', 'none', 'none'], true);
const CREDENTIAL_META = rule(['full', 'full', 'none', 'full', 'full', 'none', 'none']);
/** Billing requests: Admin, the client's PM and Accounts (PRD access matrix, OQ4 default). */
const BILLING_VIEW = rule(['full', 'full', 'none', 'none', 'none', 'full', 'none']);
const MASKED_TEXT = rule(['full', 'full', 'masked', 'masked', 'masked', 'masked', 'none']);
const HR_ONLY = rule(['full', 'none', 'none', 'none', 'none', 'none', 'full']);
const CONTACT_PII = rule(
  ['full', 'full', 'label', 'label', 'label', 'billingContactOnly', 'none'],
  true,
);

export const FIELD_POLICY = {
  // Staff directory: SySpree users are not client PII.
  'user.id': PUBLIC,
  'user.email': PUBLIC,
  'user.name': PUBLIC,
  'user.roles': PUBLIC,
  'user.teamId': PUBLIC,
  'user.weeklyCapacityH': PUBLIC,
  'user.skills': PUBLIC,
  'user.timezone': PUBLIC,
  'user.location': PUBLIC,
  'user.active': PUBLIC,
  'user.createdAt': PUBLIC,
  'me.teamName': PUBLIC,
  'me.permissions': PUBLIC,

  'team.id': PUBLIC,
  'team.name': PUBLIC,
  'team.department': PUBLIC,
  'team.leaderId': PUBLIC,
  'team.memberCount': PUBLIC,

  // The audit-log route is Admin only; meta never holds restricted values.
  'auditLog.id': PUBLIC,
  'auditLog.actorId': PUBLIC,
  'auditLog.actorName': PUBLIC,
  'auditLog.action': PUBLIC,
  'auditLog.entity': PUBLIC,
  'auditLog.entityId': PUBLIC,
  'auditLog.meta': PUBLIC,
  'auditLog.at': PUBLIC,

  'devUser.id': PUBLIC,
  'devUser.name': PUBLIC,
  'devUser.email': PUBLIC,
  'devUser.roles': PUBLIC,

  'ack.ok': PUBLIC,
  'health.status': PUBLIC,
  'policyPreview.viewerClasses': PUBLIC,
  'policyPreview.client': PUBLIC,
  'policyPreview.contacts': PUBLIC,
  'policyPreview.message': PUBLIC,
  'policyPreview.billingRequest': PUBLIC,
  'policyPreview.leave': PUBLIC,

  // Clients
  'client.id': PUBLIC,
  'client.companyName': CLIENT_DIRECTORY,
  'client.website': CLIENT_DIRECTORY,
  'client.contractValue': PM_ONLY_VALUE,
  'client.taxId': rule(['full', 'full', 'none', 'none', 'none', 'full', 'none']),
  'client.emailDomains': rule(['full', 'full', 'none', 'none', 'none', 'none', 'none']),

  // Projects
  'project.value': PM_ONLY_VALUE,
  'project.billingCycle': PM_ONLY_VALUE,

  // Contacts: the label is the safe stand-in for name, email and phone.
  'contact.id': CLIENT_DIRECTORY,
  'contact.role': CLIENT_DIRECTORY,
  'contact.label': CLIENT_DIRECTORY,
  'contact.name': CONTACT_PII,
  'contact.email': CONTACT_PII,
  'contact.phone': CONTACT_PII,

  // Communications
  'communication.id': CLIENT_DIRECTORY,
  'communication.from': rule(['full', 'full', 'label', 'label', 'label', 'label', 'none'], true),
  'communication.to': rule(['full', 'full', 'label', 'label', 'label', 'label', 'none'], true),
  // Accounts sees billing threads only; that is a row scope, not a field rule.
  'communication.body': rule(
    ['full', 'full', 'masked', 'masked', 'masked', 'masked', 'none'],
    true,
  ),

  // Billing
  'billingRequest.id': CLIENT_DIRECTORY,
  'billingRequest.reason': CLIENT_DIRECTORY,
  'billingRequest.currency': CLIENT_DIRECTORY,
  'billingRequest.amount': rule(['full', 'full', 'none', 'none', 'none', 'amount', 'none']),

  // Leave: availability is visible, the reason (and whether it was sick leave) is HR and Admin only.
  'leave.id': PUBLIC,
  'leave.userName': PUBLIC,
  'leave.startDate': PUBLIC,
  'leave.endDate': PUBLIC,
  'leave.reason': HR_ONLY,

  // Credentials: TL and Member access goes through per-task grants on the reveal endpoint only.
  'credential.secret': rule(['full', 'full', 'none', 'none', 'none', 'none', 'none'], true),

  // ---- Phase 1B ----

  'client.market': CLIENT_DIRECTORY,
  'client.status': CLIENT_DIRECTORY,
  'client.pmId': CLIENT_DIRECTORY,
  'client.pmName': CLIENT_DIRECTORY,
  'client.salesOwnerId': CLIENT_DIRECTORY,
  'client.tags': CLIENT_DIRECTORY,
  'client.createdAt': CLIENT_DIRECTORY,
  'client.projectCount': CLIENT_DIRECTORY,
  'client360.client': CLIENT_DIRECTORY,
  'client360.contacts': CLIENT_DIRECTORY,
  'client360.projects': CLIENT_DIRECTORY,
  'client360.openTasks': CLIENT_DIRECTORY,
  'client360.credentials': CLIENT_DIRECTORY,
  'client360.communications': CLIENT_DIRECTORY,
  'client360.billingRequests': CLIENT_DIRECTORY,
  'client360.renewals': CLIENT_DIRECTORY,

  'contact.clientId': CLIENT_DIRECTORY,

  // Credential metadata: the PM and Admin, and TL/Member rows reached through an active grant.
  'credential.id': CREDENTIAL_META,
  'credential.clientId': CREDENTIAL_META,
  'credential.system': CREDENTIAL_META,
  'credential.label': CREDENTIAL_META,
  'credential.grants': CREDENTIAL_META,
  'grant.id': CREDENTIAL_META,
  'grant.userId': CREDENTIAL_META,
  'grant.userName': CREDENTIAL_META,
  'grant.taskId': CREDENTIAL_META,
  'grant.taskTitle': CREDENTIAL_META,
  'grant.expiresAt': CREDENTIAL_META,
  'grant.revokedAt': CREDENTIAL_META,
  // The reveal endpoint checks ownership or an active grant per row and logs REVEAL_CREDENTIAL.
  'credentialReveal.username': CREDENTIAL_META,
  'credentialReveal.password': CREDENTIAL_META,
  'credentialReveal.notes': CREDENTIAL_META,

  'project.id': CLIENT_DIRECTORY,
  'project.clientId': CLIENT_DIRECTORY,
  'project.clientName': CLIENT_DIRECTORY,
  'project.department': CLIENT_DIRECTORY,
  'project.pipelineId': CLIENT_DIRECTORY,
  'project.stageId': CLIENT_DIRECTORY,
  'project.stageName': CLIENT_DIRECTORY,
  'project.stageOrder': CLIENT_DIRECTORY,
  'project.stagePhase': CLIENT_DIRECTORY,
  'project.packageId': CLIENT_DIRECTORY,
  'project.packageName': CLIENT_DIRECTORY,
  'project.type': CLIENT_DIRECTORY,
  'project.statusType': CLIENT_DIRECTORY,
  'project.startDate': CLIENT_DIRECTORY,
  'project.endDate': CLIENT_DIRECTORY,
  'project.renewalDate': CLIENT_DIRECTORY,
  'project.cycleDay': CLIENT_DIRECTORY,
  'project.health': CLIENT_DIRECTORY,
  'project.holdReason': CLIENT_DIRECTORY,
  'project.stopReason': CLIENT_DIRECTORY,
  'project.stopNote': CLIENT_DIRECTORY,
  'project.pmId': CLIENT_DIRECTORY,
  'project.pmName': CLIENT_DIRECTORY,
  'project.teamId': CLIENT_DIRECTORY,
  'project.teamName': CLIENT_DIRECTORY,
  'project.parentProjectId': CLIENT_DIRECTORY,
  'project.stageEnteredAt': CLIENT_DIRECTORY,
  'project.createdAt': CLIENT_DIRECTORY,
  'project.openTaskCount': CLIENT_DIRECTORY,
  'project.overdueTaskCount': CLIENT_DIRECTORY,
  'project.stages': CLIENT_DIRECTORY,
  'project.checklist': CLIENT_DIRECTORY,
  'project.tasks': CLIENT_DIRECTORY,
  'project.attachments': CLIENT_DIRECTORY,
  'project.activity': CLIENT_DIRECTORY,
  'project.related': CLIENT_DIRECTORY,

  'task.id': CLIENT_DIRECTORY,
  'task.projectId': CLIENT_DIRECTORY,
  'task.clientId': CLIENT_DIRECTORY,
  'task.clientName': CLIENT_DIRECTORY,
  'task.department': CLIENT_DIRECTORY,
  'task.parentTaskId': CLIENT_DIRECTORY,
  'task.title': CLIENT_DIRECTORY,
  'task.type': CLIENT_DIRECTORY,
  // Scrubbed with maskBody on write, so the stored text is already safe for every role.
  'task.description': CLIENT_DIRECTORY,
  'task.assigneeId': CLIENT_DIRECTORY,
  'task.assigneeName': CLIENT_DIRECTORY,
  'task.teamId': CLIENT_DIRECTORY,
  'task.priority': CLIENT_DIRECTORY,
  'task.dueDate': CLIENT_DIRECTORY,
  'task.plannedDate': CLIENT_DIRECTORY,
  'task.estimateH': CLIENT_DIRECTORY,
  'task.progressPct': CLIENT_DIRECTORY,
  'task.statusType': CLIENT_DIRECTORY,
  'task.billable': CLIENT_DIRECTORY,
  'task.billableConfirmed': CLIENT_DIRECTORY,
  'task.source': CLIENT_DIRECTORY,
  'task.cycleMonth': CLIENT_DIRECTORY,
  'task.dependsOnId': CLIENT_DIRECTORY,
  'task.createdAt': CLIENT_DIRECTORY,
  'task.completedAt': CLIENT_DIRECTORY,
  'task.subtaskCount': CLIENT_DIRECTORY,
  'task.checklistDone': CLIENT_DIRECTORY,
  'task.checklistTotal': CLIENT_DIRECTORY,
  'task.checklist': CLIENT_DIRECTORY,
  'task.subtasks': CLIENT_DIRECTORY,
  'task.comments': CLIENT_DIRECTORY,
  'task.attachments': CLIENT_DIRECTORY,
  'task.activity': CLIENT_DIRECTORY,
  'task.credentials': CLIENT_DIRECTORY,
  'task.canEdit': CLIENT_DIRECTORY,

  'checklistItem.id': CLIENT_DIRECTORY,
  'checklistItem.text': CLIENT_DIRECTORY,
  'checklistItem.done': CLIENT_DIRECTORY,
  'checklistItem.ownerRole': CLIENT_DIRECTORY,
  'checklistItem.stageId': CLIENT_DIRECTORY,

  'comment.id': CLIENT_DIRECTORY,
  'comment.authorId': CLIENT_DIRECTORY,
  'comment.authorName': CLIENT_DIRECTORY,
  'comment.body': CLIENT_DIRECTORY,
  'comment.createdAt': CLIENT_DIRECTORY,

  'attachment.id': CLIENT_DIRECTORY,
  'attachment.taskId': CLIENT_DIRECTORY,
  'attachment.fileName': CLIENT_DIRECTORY,
  'attachment.contentType': CLIENT_DIRECTORY,
  'attachment.size': CLIENT_DIRECTORY,
  'attachment.source': CLIENT_DIRECTORY,
  'attachment.uploadedByName': CLIENT_DIRECTORY,
  'attachment.createdAt': CLIENT_DIRECTORY,

  'activity.id': CLIENT_DIRECTORY,
  'activity.kind': CLIENT_DIRECTORY,
  'activity.actorName': CLIENT_DIRECTORY,
  'activity.from': CLIENT_DIRECTORY,
  'activity.to': CLIENT_DIRECTORY,
  'activity.at': CLIENT_DIRECTORY,

  'board.department': CLIENT_DIRECTORY,
  'board.pipelineVersion': CLIENT_DIRECTORY,
  'board.columns': CLIENT_DIRECTORY,
  'boardColumn.stageId': CLIENT_DIRECTORY,
  'boardColumn.stageName': CLIENT_DIRECTORY,
  'boardColumn.statusType': CLIENT_DIRECTORY,
  'boardColumn.phase': CLIENT_DIRECTORY,
  'boardColumn.projects': CLIENT_DIRECTORY,

  // Catalog: no client data.
  'pipeline.id': PUBLIC,
  'pipeline.department': PUBLIC,
  'pipeline.version': PUBLIC,
  'pipeline.active': PUBLIC,
  'pipeline.stages': PUBLIC,
  'pipeline.projectCount': PUBLIC,
  'stage.id': PUBLIC,
  'stage.name': PUBLIC,
  'stage.order': PUBLIC,
  'stage.statusType': PUBLIC,
  'stage.phase': PUBLIC,
  'stage.slaDays': PUBLIC,
  'stage.checklist': PUBLIC,
  'package.id': PUBLIC,
  'package.department': PUBLIC,
  'package.name': PUBLIC,
  'package.setupTasks': PUBLIC,
  'package.cycleTasks': PUBLIC,
  'package.monthlyHours': PUBLIC,
  'package.active': PUBLIC,

  // ---- Phase 1C ----
  // Leave rows reach a viewer only through the leave.read scope (own, own team, all).
  'leave.userId': PUBLIC,
  'leave.teamId': PUBLIC,
  'leave.halfDay': PUBLIC,
  'leave.days': PUBLIC,
  'leave.kind': HR_ONLY,
  'leave.createdByName': PUBLIC,
  'leave.createdAt': PUBLIC,
  // Impact lists hold tasks, so they follow the client directory rule (HR never).
  'leaveImpact.leave': PUBLIC,
  'leaveImpact.tasks': CLIENT_DIRECTORY,
  'leaveImpact.candidates': PUBLIC,
  'leaveImpact.suggestions': CLIENT_DIRECTORY,

  'holiday.id': PUBLIC,
  'holiday.date': PUBLIC,
  'holiday.location': PUBLIC,
  'holiday.name': PUBLIC,

  // Capacity: staff hours only, no client data.
  'capacity.week': PUBLIC,
  'capacity.days': PUBLIC,
  'capacity.teams': PUBLIC,
  'teamCapacity.teamId': PUBLIC,
  'teamCapacity.teamName': PUBLIC,
  'teamCapacity.department': PUBLIC,
  'teamCapacity.availableH': PUBLIC,
  'teamCapacity.assignedH': PUBLIC,
  'teamCapacity.utilisationPct': PUBLIC,
  'teamCapacity.over': PUBLIC,
  'teamCapacity.members': PUBLIC,
  'memberCapacity.userId': PUBLIC,
  'memberCapacity.name': PUBLIC,
  'memberCapacity.teamId': PUBLIC,
  'memberCapacity.weeklyCapacityH': PUBLIC,
  'memberCapacity.availableH': PUBLIC,
  'memberCapacity.assignedH': PUBLIC,
  'memberCapacity.utilisationPct': PUBLIC,
  'memberCapacity.over': PUBLIC,
  'memberCapacity.leaveDays': PUBLIC,
  'memberCapacity.holidayDays': PUBLIC,
  'memberCapacity.unestimatedCount': PUBLIC,
  'memberCapacity.days': PUBLIC,
  'capacityWarning.userId': PUBLIC,
  'capacityWarning.name': PUBLIC,
  'capacityWarning.week': PUBLIC,
  'capacityWarning.utilisationPct': PUBLIC,
  'capacityWarning.reason': PUBLIC,
  'capacityWarning.date': PUBLIC,

  'planner.teamId': PUBLIC,
  'planner.teamName': PUBLIC,
  'planner.department': PUBLIC,
  'planner.week': PUBLIC,
  'planner.prevWeek': PUBLIC,
  'planner.nextWeek': PUBLIC,
  'planner.days': PUBLIC,
  'planner.members': PUBLIC,
  'planner.tasks': CLIENT_DIRECTORY,
  'planner.backlog': CLIENT_DIRECTORY,
  'plannerMoves.planner': PUBLIC,
  'plannerMoves.warnings': PUBLIC,

  // Own notifications only; text is written masked and holds no client contact data.
  'notifications.unread': PUBLIC,
  'notifications.items': PUBLIC,
  'notification.id': PUBLIC,
  'notification.kind': PUBLIC,
  'notification.title': PUBLIC,
  'notification.body': PUBLIC,
  'notification.link': PUBLIC,
  'notification.readAt': PUBLIC,
  'notification.createdAt': PUBLIC,

  // ---- Phase 1D ----
  // Messages: contact data in from/to/cc and the original body reach only Admin and the client's PM.
  'communication.channel': CLIENT_DIRECTORY,
  'communication.direction': CLIENT_DIRECTORY,
  'communication.threadKey': CLIENT_DIRECTORY,
  'communication.clientId': CLIENT_DIRECTORY,
  'communication.clientName': CLIENT_DIRECTORY,
  'communication.projectId': CLIENT_DIRECTORY,
  'communication.taskId': CLIENT_DIRECTORY,
  'communication.sender': CLIENT_DIRECTORY,
  'communication.snippet': CLIENT_DIRECTORY,
  'communication.attachments': CLIENT_DIRECTORY,
  'communication.sentAt': CLIENT_DIRECTORY,
  'communication.sentByName': CLIENT_DIRECTORY,
  'communication.mailboxLabel': CLIENT_DIRECTORY,
  'communication.triageState': CLIENT_DIRECTORY,
  'communication.triage': CLIENT_DIRECTORY,
  'communication.category': CLIENT_DIRECTORY,
  'communication.triagedByName': CLIENT_DIRECTORY,
  'communication.linkMethod': CLIENT_DIRECTORY,
  'communication.unread': CLIENT_DIRECTORY,
  'communication.cc': rule(['full', 'full', 'label', 'label', 'label', 'label', 'none'], true),
  'communication.subject': MASKED_TEXT,

  'thread.threadKey': CLIENT_DIRECTORY,
  'thread.channel': CLIENT_DIRECTORY,
  'thread.clientId': CLIENT_DIRECTORY,
  'thread.clientName': CLIENT_DIRECTORY,
  'thread.projectId': CLIENT_DIRECTORY,
  'thread.sender': CLIENT_DIRECTORY,
  'thread.snippet': CLIENT_DIRECTORY,
  'thread.lastAt': CLIENT_DIRECTORY,
  'thread.lastDirection': CLIENT_DIRECTORY,
  'thread.messageCount': CLIENT_DIRECTORY,
  'thread.needsTriage': CLIENT_DIRECTORY,
  'thread.unmatched': CLIENT_DIRECTORY,
  'thread.mailboxLabel': CLIENT_DIRECTORY,
  'thread.unread': CLIENT_DIRECTORY,
  'thread.subject': MASKED_TEXT,
  'threadList.threads': CLIENT_DIRECTORY,
  'threadList.nextBefore': CLIENT_DIRECTORY,
  'threadDetail.threadKey': CLIENT_DIRECTORY,
  'threadDetail.channel': CLIENT_DIRECTORY,
  'threadDetail.clientId': CLIENT_DIRECTORY,
  'threadDetail.clientName': CLIENT_DIRECTORY,
  'threadDetail.messages': CLIENT_DIRECTORY,
  'threadDetail.windowOpenUntil': CLIENT_DIRECTORY,
  'threadDetail.mailboxId': CLIENT_DIRECTORY,
  'triageResult.message': CLIENT_DIRECTORY,
  'triageResult.task': CLIENT_DIRECTORY,
  'sendResult.message': CLIENT_DIRECTORY,
  'import.id': CLIENT_DIRECTORY,
  'import.chatName': CLIENT_DIRECTORY,
  'import.messages': CLIENT_DIRECTORY,
  'import.duplicates': CLIENT_DIRECTORY,
  'import.media': CLIENT_DIRECTORY,
  'import.threadKey': CLIENT_DIRECTORY,
  'search.communications': CLIENT_DIRECTORY,
  'search.tasks': CLIENT_DIRECTORY,
  'search.clients': CLIENT_DIRECTORY,
  'search.tookMs': PUBLIC,
  'task.sourceMessage': CLIENT_DIRECTORY,
  'project.memberSendEnabled': CLIENT_DIRECTORY,

  // SySpree mailboxes are staff data, not client data.
  'mailbox.id': PUBLIC,
  'mailbox.address': PUBLIC,
  'mailbox.label': PUBLIC,
  'mailbox.ownerUserId': PUBLIC,
  'mailbox.ownerName': PUBLIC,
  'mailbox.active': PUBLIC,
  'mailbox.lastSyncAt': PUBLIC,
  'mailbox.syncError': PUBLIC,
  'mailbox.watchExpiry': PUBLIC,
  'mailbox.backfillDoneAt': PUBLIC,
  'mailbox.mode': PUBLIC,
  'inboxSettings.gmailMode': PUBLIC,
  'inboxSettings.whatsappMode': PUBLIC,
  'inboxSettings.aiMode': PUBLIC,
  'inboxSettings.whatsappTemplates': PUBLIC,

  // ---- Phase 1E ----
  'billingRequest.clientId': BILLING_VIEW,
  'billingRequest.clientName': BILLING_VIEW,
  'billingRequest.projectId': BILLING_VIEW,
  'billingRequest.department': BILLING_VIEW,
  'billingRequest.packageName': BILLING_VIEW,
  'billingRequest.description': BILLING_VIEW,
  'billingRequest.status': BILLING_VIEW,
  'billingRequest.invoiceNo': BILLING_VIEW,
  'billingRequest.invoicedAt': BILLING_VIEW,
  'billingRequest.paidAt': BILLING_VIEW,
  'billingRequest.cancelledAt': BILLING_VIEW,
  'billingRequest.cancelReason': BILLING_VIEW,
  'billingRequest.raisedById': BILLING_VIEW,
  'billingRequest.raisedByName': BILLING_VIEW,
  'billingRequest.pmName': BILLING_VIEW,
  'billingRequest.taskCount': BILLING_VIEW,
  'billingRequest.messageCount': BILLING_VIEW,
  'billingRequest.createdAt': BILLING_VIEW,
  'billingRequest.updatedAt': BILLING_VIEW,
  'billingRequest.tasks': BILLING_VIEW,
  'billingRequest.messages': BILLING_VIEW,
  'billingRequest.billingContact': BILLING_VIEW,
  'billingRequest.can': BILLING_VIEW,
  'billingMessage.id': BILLING_VIEW,
  'billingMessage.authorId': BILLING_VIEW,
  'billingMessage.authorName': BILLING_VIEW,
  'billingMessage.body': BILLING_VIEW,
  'billingMessage.createdAt': BILLING_VIEW,
  'billingTask.id': BILLING_VIEW,
  'billingTask.title': BILLING_VIEW,
  'billingTask.statusType': BILLING_VIEW,
  'billingTask.billableConfirmed': BILLING_VIEW,
  // Renewals: dates and names only, never the project value.
  'renewal.projectId': CLIENT_DIRECTORY,
  'renewal.clientId': CLIENT_DIRECTORY,
  'renewal.clientName': CLIENT_DIRECTORY,
  'renewal.department': CLIENT_DIRECTORY,
  'renewal.packageName': CLIENT_DIRECTORY,
  'renewal.type': CLIENT_DIRECTORY,
  'renewal.endDate': CLIENT_DIRECTORY,
  'renewal.daysLeft': CLIENT_DIRECTORY,
  'renewal.pmId': CLIENT_DIRECTORY,
  'renewal.pmName': CLIENT_DIRECTORY,
  'renewal.currency': CLIENT_DIRECTORY,
  'renewal.billingRequestId': CLIENT_DIRECTORY,
  'task.billing': BILLING_VIEW,

  // Notification settings: the person's own preferences and device count.
  'notificationSettings.preferences': PUBLIC,
  'notificationSettings.pushPublicKey': PUBLIC,
  'notificationSettings.pushDevices': PUBLIC,
  'notificationSettings.digestTime': PUBLIC,

  // Internal chat (PRD 5.1): staff only. Bodies are scrubbed with maskBody on write and mention
  // labels are re-resolved for each reader, so no client contact data reaches a channel.
  'chatChannel.id': PUBLIC,
  'chatChannel.kind': PUBLIC,
  'chatChannel.name': PUBLIC,
  'chatChannel.projectId': PUBLIC,
  'chatChannel.teamId': PUBLIC,
  'chatChannel.otherUserId': PUBLIC,
  'chatChannel.memberCount': PUBLIC,
  'chatChannel.unread': PUBLIC,
  'chatChannel.lastMessageAt': PUBLIC,
  'chatChannel.lastMessagePreview': PUBLIC,
  'chatMessage.id': PUBLIC,
  'chatMessage.channelId': PUBLIC,
  'chatMessage.authorId': PUBLIC,
  'chatMessage.authorName': PUBLIC,
  'chatMessage.body': PUBLIC,
  'chatMessage.mentions': PUBLIC,
  'chatMessage.createdAt': PUBLIC,
  'chatHistory.channel': PUBLIC,
  'chatHistory.messages': PUBLIC,
  'chatHistory.nextBefore': PUBLIC,
  'mentionOption.type': PUBLIC,
  'mentionOption.id': PUBLIC,
  'mentionOption.label': PUBLIC,
  'mentionOption.hint': PUBLIC,

  // Dashboards (PRD 6.1, 6.2). Routes are per role; nested records keep their own field rules.
  'dashboard.activeClients': CLIENT_DIRECTORY,
  'dashboard.activeProjects': CLIENT_DIRECTORY,
  'dashboard.byDepartment': CLIENT_DIRECTORY,
  'dashboard.atRisk': CLIENT_DIRECTORY,
  'dashboard.onHold': CLIENT_DIRECTORY,
  'dashboard.stoppedThisMonth': CLIENT_DIRECTORY,
  'dashboard.unanswered': CLIENT_DIRECTORY,
  'dashboard.renewalsDue': CLIENT_DIRECTORY,
  'dashboard.renewals': CLIENT_DIRECTORY,
  'dashboard.clients': CLIENT_DIRECTORY,
  'dashboard.projectsByStatus': CLIENT_DIRECTORY,
  'dashboard.waitingOnClient': CLIENT_DIRECTORY,
  'dashboard.needsTriage': CLIENT_DIRECTORY,
  'dashboard.billableToConfirm': CLIENT_DIRECTORY,
  'dashboard.billingOpen': CLIENT_DIRECTORY,
  'dashboard.overdue': CLIENT_DIRECTORY,
  'dashboard.today': CLIENT_DIRECTORY,
  'dashboard.weekTasks': CLIENT_DIRECTORY,
  // Money totals: Admin (all requests) and Accounts; never project value.
  'dashboard.billingPending': rule(['full', 'none', 'none', 'none', 'none', 'none', 'none']),
  'dashboard.billingByStatus': rule(['full', 'none', 'none', 'none', 'none', 'full', 'none']),
  'dashboard.paidThisMonth': rule(['full', 'none', 'none', 'none', 'none', 'full', 'none']),
  // Hours, counts and leave dates: no client data.
  'dashboard.teams': PUBLIC,
  'dashboard.week': PUBLIC,
  'dashboard.outThisWeek': PUBLIC,
  'dashboard.outNextWeek': PUBLIC,
  'dashboard.holidays': PUBLIC,
  'dashboard.overdueCount': PUBLIC,
  'dashboard.unreadAlerts': PUBLIC,
  'dashboard.unreadChats': PUBLIC,

  // Dev outbox (dev auth only): the signed-in person's own digest emails, already masked text.
  'devOutbox.mode': PUBLIC,
  'devOutbox.items': PUBLIC,
  'devOutbox.sent': PUBLIC,
  'devMail.subject': PUBLIC,
  'devMail.text': PUBLIC,
  'devMail.sentAt': PUBLIC,
} as const satisfies Record<string, FieldRule>;

export type FieldKey = keyof typeof FIELD_POLICY;

const RANK: Record<Visibility, number> = { none: 0, label: 1, masked: 2, amount: 3, full: 4 };

function resolveClass(v: Visibility | ConditionalVisibility, ctx: RecordContext): Visibility {
  if (v === 'billingContactOnly') return ctx.contactRole === 'BILLING' ? 'full' : 'none';
  return v;
}

/** What this viewer may see of this field on this record. Fails closed to `none`. */
export function resolveVisibility(
  field: FieldKey,
  viewer: Viewer | null,
  ctx: RecordContext = {},
): Visibility {
  const policy: FieldRule = FIELD_POLICY[field];
  if (!policy) return 'none';
  if (policy.visibility === 'public') return 'full';
  let best: Visibility = 'none';
  for (const cls of viewerClasses(viewer, ctx)) {
    const v = resolveClass(policy.visibility[cls], ctx);
    if (RANK[v] > RANK[best]) best = v;
  }
  return best;
}

export function isAudited(field: FieldKey): boolean {
  return (FIELD_POLICY[field] as FieldRule).audit === true;
}

export function isPublic(field: FieldKey): boolean {
  return (FIELD_POLICY[field] as FieldRule).visibility === 'public';
}
