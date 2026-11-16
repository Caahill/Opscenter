// Phase 1E response DTOs and mappers. Every property names a row in packages/policy fields.ts.
// No DTO here carries the project value: Accounts sees the billed amount only (PRD OQ4 default).
import type { BillingMessage, BillingRequest, Client, Package, Project, Task } from '@opshub/db';
import { defineDto, present, type Presentable } from '@opshub/policy';

export const BILLING_INCLUDE = {
  client: { select: { companyName: true, pmId: true, market: true } },
  project: { select: { department: true, package: { select: { name: true } } } },
  _count: { select: { messages: true } },
} as const;

export type BillingRow = BillingRequest & {
  client: Pick<Client, 'companyName' | 'pmId' | 'market'>;
  project: Pick<Project, 'department'> & { package: Pick<Package, 'name'> | null };
  _count: { messages: number };
};

const REQUEST_FIELDS = {
  id: 'billingRequest.id',
  clientId: 'billingRequest.clientId',
  clientName: 'billingRequest.clientName',
  projectId: 'billingRequest.projectId',
  department: 'billingRequest.department',
  packageName: 'billingRequest.packageName',
  reason: 'billingRequest.reason',
  description: 'billingRequest.description',
  amount: 'billingRequest.amount',
  currency: 'billingRequest.currency',
  status: 'billingRequest.status',
  invoiceNo: 'billingRequest.invoiceNo',
  invoicedAt: 'billingRequest.invoicedAt',
  paidAt: 'billingRequest.paidAt',
  cancelledAt: 'billingRequest.cancelledAt',
  cancelReason: 'billingRequest.cancelReason',
  raisedById: 'billingRequest.raisedById',
  raisedByName: 'billingRequest.raisedByName',
  pmName: 'billingRequest.pmName',
  taskCount: 'billingRequest.taskCount',
  messageCount: 'billingRequest.messageCount',
  createdAt: 'billingRequest.createdAt',
  updatedAt: 'billingRequest.updatedAt',
} as const;

export const BillingRequestDto = defineDto('BillingRequest', REQUEST_FIELDS);

export const BillingRequestDetailDto = defineDto('BillingRequest', {
  ...REQUEST_FIELDS,
  tasks: 'billingRequest.tasks',
  messages: 'billingRequest.messages',
  billingContact: 'billingRequest.billingContact',
  can: 'billingRequest.can',
});

function requestData(r: BillingRow, names: Map<string, string>) {
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.client.companyName,
    projectId: r.projectId,
    department: r.project.department,
    packageName: r.project.package?.name ?? null,
    reason: r.reason,
    description: r.description,
    amount: r.amount,
    currency: r.currency,
    status: r.status,
    invoiceNo: r.invoiceNo,
    invoicedAt: r.invoicedAt,
    paidAt: r.paidAt,
    cancelledAt: r.cancelledAt,
    cancelReason: r.cancelReason,
    raisedById: r.raisedById,
    raisedByName: names.get(r.raisedById) ?? null,
    pmName: names.get(r.client.pmId) ?? null,
    taskCount: r.taskIds.length,
    messageCount: r._count.messages,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export const presentBillingRequest = (r: BillingRow, names: Map<string, string>) =>
  present(BillingRequestDto, requestData(r, names), { clientPmId: r.client.pmId, entityId: r.id });

export const BillingTaskDto = defineDto('BillingTask', {
  id: 'billingTask.id',
  title: 'billingTask.title',
  statusType: 'billingTask.statusType',
  billableConfirmed: 'billingTask.billableConfirmed',
});

export const BillingMessageDto = defineDto('BillingMessage', {
  id: 'billingMessage.id',
  authorId: 'billingMessage.authorId',
  authorName: 'billingMessage.authorName',
  body: 'billingMessage.body',
  createdAt: 'billingMessage.createdAt',
});

export function presentBillingDetail(
  r: BillingRow,
  names: Map<string, string>,
  parts: { tasks: Task[]; messages: BillingMessage[]; billingContact: Presentable | null; can: string[] },
) {
  const ctx = { clientPmId: r.client.pmId, entityId: r.id };
  return present(
    BillingRequestDetailDto,
    {
      ...requestData(r, names),
      tasks: parts.tasks.map((t) => present(BillingTaskDto, { id: t.id, title: t.title, statusType: t.statusType, billableConfirmed: t.billableConfirmed }, ctx)),
      messages: parts.messages.map((m) =>
        present(BillingMessageDto, { id: m.id, authorId: m.authorId, authorName: names.get(m.authorId) ?? null, body: m.body, createdAt: m.createdAt }, ctx),
      ),
      billingContact: parts.billingContact,
      can: parts.can,
    },
    ctx,
  );
}

export const RenewalDto = defineDto('Renewal', {
  projectId: 'renewal.projectId',
  clientId: 'renewal.clientId',
  clientName: 'renewal.clientName',
  department: 'renewal.department',
  packageName: 'renewal.packageName',
  type: 'renewal.type',
  endDate: 'renewal.endDate',
  daysLeft: 'renewal.daysLeft',
  pmId: 'renewal.pmId',
  pmName: 'renewal.pmName',
  currency: 'renewal.currency',
  billingRequestId: 'renewal.billingRequestId',
});
