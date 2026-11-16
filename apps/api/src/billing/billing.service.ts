// Billing triggers (PRD 4.1, 4.2, 4.4; TechSpec 9.4): billable flags on tasks, billing requests
// raised by the client's PM, processed by Accounts through Requested, Invoiced, Paid or Cancelled,
// with a message thread per request.
import { Injectable } from '@nestjs/common';
import type { BillingRequest, BillingStatus, Prisma } from '@opshub/db';
import { maskBody, present, scopesFor, type Scope } from '@opshub/policy';
import {
  BILLING_REASON_LABELS,
  BILLING_STATUS_LABELS,
  DEPARTMENT_LABELS,
  MARKET_CURRENCY,
  type ConfirmBillableInput,
  type CreateBillingRequestInput,
  type FlagBillableInput,
  type ListBillingQuery,
  type UpdateBillingRequestInput,
} from '@opshub/shared';
import { ActivityService } from '../common/activity.service';
import { DirectoryService } from '../common/directory.service';
import { AppError, Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { CryptoService } from '../crypto/crypto.service';
import { NotifyService } from '../notifications/notify.service';
import { AckDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { presentContact } from '../work/dtos';
import { BILLING_INCLUDE, presentBillingDetail, presentBillingRequest, type BillingRow } from './dtos';

const ACTIVE: Prisma.BillingRequestWhereInput = { status: { not: 'CANCELLED' } };
const day = (s: string | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : new Date());

/** TechSpec 9.4 state machine. */
const TRANSITIONS: Record<BillingStatus, BillingStatus[]> = {
  REQUESTED: ['INVOICED', 'CANCELLED'],
  INVOICED: ['PAID', 'CANCELLED'],
  PAID: [],
  CANCELLED: [],
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly directory: DirectoryService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly crypto: CryptoService,
  ) {}

  private names(rows: BillingRow[], extra: string[] = []) {
    return this.directory.names([...rows.flatMap((r) => [r.raisedById, r.client.pmId]), ...extra]);
  }

  async list(v: AuthedViewer, scopes: Scope[], q: ListBillingQuery) {
    const rows = await this.prisma.billingRequest.findMany({
      where: { AND: [this.scopes.billingWhere(v, scopes), q.status ? { status: q.status } : {}, q.clientId ? { clientId: q.clientId } : {}, q.projectId ? { projectId: q.projectId } : {}] },
      include: BILLING_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const names = await this.names(rows);
    return rows.map((r) => presentBillingRequest(r, names));
  }

  /** Client 360: the viewer's billing requests for one client, or none without billing access. */
  async forClient(v: AuthedViewer, clientId: string) {
    const scopes = scopesFor(v.roles, 'billing.read');
    return scopes.length ? this.list(v, scopes, { clientId }) : [];
  }

  private async require(v: AuthedViewer, scopes: Scope[], id: string): Promise<BillingRow> {
    const r = await this.prisma.billingRequest.findFirst({ where: { AND: [{ id }, this.scopes.billingWhere(v, scopes)] }, include: BILLING_INCLUDE });
    if (!r) throw Errors.notFound('Billing request');
    return r;
  }

  /** Accounts and Admin process; the client's PM (and Admin) edits or cancels while it is Requested. */
  private roles(v: AuthedViewer, r: Pick<BillingRow, 'client'>) {
    const processor = v.roles.includes('ADMIN') || v.roles.includes('ACCOUNTS');
    const owner = v.roles.includes('ADMIN') || (v.roles.includes('PM') && r.client.pmId === v.userId);
    return { processor, owner };
  }

  async detail(v: AuthedViewer, scopes: Scope[], id: string) {
    const r = await this.require(v, scopes, id);
    const [tasks, messages, contact, client] = await Promise.all([
      this.prisma.task.findMany({ where: { id: { in: r.taskIds } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.billingMessage.findMany({ where: { requestId: id }, orderBy: { createdAt: 'asc' }, take: 200 }),
      this.prisma.contact.findFirst({ where: { clientId: r.clientId, role: 'BILLING' } }),
      this.prisma.client.findUniqueOrThrow({ where: { id: r.clientId } }),
    ]);
    const names = await this.names([r], messages.map((m) => m.authorId));
    const { processor, owner } = this.roles(v, r);
    const can = [
      ...(processor && r.status !== 'PAID' && r.status !== 'CANCELLED' ? ['PROCESS'] : []),
      ...(owner && r.status === 'REQUESTED' ? ['EDIT', 'CANCEL'] : []),
    ];
    return presentBillingDetail(r, names, { tasks, messages, billingContact: contact ? presentContact(contact, client, this.crypto) : null, can });
  }

  async create(v: AuthedViewer, scopes: Scope[], input: CreateBillingRequestInput) {
    const project = await this.scopes.requireProject(v, scopes, input.projectId);
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: project.clientId } });
    const taskIds = [...new Set(input.taskIds)];
    if (taskIds.length) {
      const tasks = await this.prisma.task.findMany({ where: { id: { in: taskIds }, projectId: project.id }, select: { id: true } });
      if (tasks.length !== taskIds.length) throw Errors.validation('taskIds: must be tasks on this project');
      const taken = await this.prisma.billingRequest.findFirst({ where: { ...ACTIVE, taskIds: { hasSome: taskIds } } });
      if (taken) throw Errors.conflict('Some of these tasks are already on another billing request');
    }
    const request = await this.prisma.$transaction(async (tx) => {
      const r = await tx.billingRequest.create({
        data: {
          clientId: client.id,
          projectId: project.id,
          reason: input.reason,
          description: maskBody(input.description),
          amount: input.amount,
          currency: input.currency ?? MARKET_CURRENCY[client.market] ?? 'INR',
          raisedById: v.userId,
          taskIds,
        },
      });
      // Listing a task on a request is the PM confirming it as billable (PRD 4.1).
      if (taskIds.length) await tx.task.updateMany({ where: { id: { in: taskIds } }, data: { billable: true, billableConfirmed: true } });
      await this.activity.log({ kind: 'BILLING_REQUESTED', actorId: v.userId, projectId: project.id, to: { billingRequestId: r.id, reason: r.reason, tasks: taskIds.length } }, tx);
      return r;
    });
    await this.tellAccounts(request, `Billing request: ${client.companyName} · ${DEPARTMENT_LABELS[project.department]}`, `${BILLING_REASON_LABELS[request.reason]}, raised by the PM.`, v.userId);
    return this.detail(v, scopesFor(v.roles, 'billing.read'), request.id);
  }

  private async tellAccounts(r: BillingRequest, title: string, body: string, actorId: string) {
    await this.notify.notify(await this.notify.accountsUserIds(), { kind: 'BILLING', title, body, link: `/billing/${r.id}`, data: { billingRequestId: r.id } }, actorId);
  }

  async update(v: AuthedViewer, scopes: Scope[], id: string, input: UpdateBillingRequestInput) {
    const r = await this.require(v, scopes, id);
    const { processor, owner } = this.roles(v, r);
    const editing = input.description !== undefined || input.amount !== undefined || input.currency !== undefined;
    const invoiceFields = input.invoiceNo !== undefined || input.invoicedAt !== undefined || input.paidAt !== undefined;
    if (editing && !owner) throw Errors.forbidden("Only the client's PM changes a request's details");
    if (editing && r.status !== 'REQUESTED') throw Errors.invalidState('Only a request that is not yet invoiced can be changed');
    if (invoiceFields && !processor) throw Errors.forbidden('Only Accounts records invoices and payments');

    const data: Prisma.BillingRequestUpdateInput = {
      description: input.description === undefined ? undefined : maskBody(input.description),
      amount: input.amount,
      currency: input.currency,
      invoiceNo: input.invoiceNo,
      invoicedAt: input.invoicedAt ? day(input.invoicedAt) : undefined,
      paidAt: input.paidAt ? day(input.paidAt) : undefined,
    };
    if (input.status && input.status !== r.status) {
      if (!TRANSITIONS[r.status].includes(input.status)) {
        throw new AppError(422, 'INVALID_TRANSITION', `A ${BILLING_STATUS_LABELS[r.status].toLowerCase()} request cannot become ${BILLING_STATUS_LABELS[input.status].toLowerCase()}`);
      }
      const pmCancel = input.status === 'CANCELLED' && owner && r.status === 'REQUESTED';
      if (!processor && !pmCancel) throw Errors.forbidden('Only Accounts moves a request on; the PM can cancel it until it is invoiced');
      data.status = input.status;
      if (input.status === 'INVOICED') data.invoicedAt = day(input.invoicedAt);
      if (input.status === 'PAID') data.paidAt = day(input.paidAt);
      if (input.status === 'CANCELLED') {
        data.cancelledAt = new Date();
        data.cancelReason = input.cancelReason;
      }
    } else if (invoiceFields && r.status === 'REQUESTED') {
      throw Errors.invalidState('Mark the request invoiced to record invoice details');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.billingRequest.update({ where: { id }, data });
      if (input.status && input.status !== r.status) {
        await this.activity.log({ kind: 'BILLING_STATUS', actorId: v.userId, projectId: r.projectId, from: { status: r.status }, to: { status: input.status, billingRequestId: id } }, tx);
      }
    });
    if (input.status && input.status !== r.status) {
      const title = `${r.client.companyName} billing request ${BILLING_STATUS_LABELS[input.status].toLowerCase()}`;
      if (processor && !owner) await this.notify.notify([r.client.pmId], { kind: 'BILLING', title, link: `/billing/${id}` }, v.userId);
      else await this.tellAccounts(r, title, input.cancelReason ? `Reason: ${maskBody(input.cancelReason)}` : '', v.userId);
    }
    return this.detail(v, scopes, id);
  }

  /** PRD 4.4: Accounts and the PM talk on the request. The other side is notified. */
  async message(v: AuthedViewer, scopes: Scope[], id: string, body: string) {
    const r = await this.require(v, scopes, id);
    await this.prisma.billingMessage.create({ data: { requestId: id, authorId: v.userId, body: maskBody(body) } });
    const recipients = v.userId === r.client.pmId || !v.roles.includes('ACCOUNTS') ? await this.notify.accountsUserIds() : [r.client.pmId];
    await this.notify.notify(recipients, { kind: 'BILLING', title: `New message on ${r.client.companyName} billing`, link: `/billing/${id}`, dedupeKey: `billing-message:${id}` }, v.userId);
    return this.detail(v, scopes, id);
  }

  // ---- Billable flags (PRD 4.1) ----

  /** Anyone who can see a task can flag it as work outside the package. */
  async flag(v: AuthedViewer, taskId: string, input: FlagBillableInput) {
    const task = await this.scopes.requireTask(v, scopesFor(v.roles, 'task.read'), taskId);
    if (task.billable) return present(AckDto, { ok: true });
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { billable: true } });
      await this.activity.log({ kind: 'BILLABLE_FLAGGED', actorId: v.userId, projectId: task.projectId, taskId, to: { note: input.note ? maskBody(input.note) : null } }, tx);
    });
    await this.notify.notify([task.project.pmId], { kind: 'BILLABLE', title: `"${task.title}" flagged as extra work`, body: 'Confirm or reject it on the task.', link: `/tasks/${taskId}` }, v.userId);
    return present(AckDto, { ok: true });
  }

  /** The client's PM decides. A rejected task can be flagged again later. */
  async confirm(v: AuthedViewer, taskId: string, input: ConfirmBillableInput) {
    const task = await this.scopes.requireTask(v, scopesFor(v.roles, 'task.read'), taskId);
    await this.scopes.requireProject(v, scopesFor(v.roles, 'project.manage'), task.projectId);
    if (input.decision === 'CONFIRM' && !task.billable) throw Errors.invalidState('Flag the task as extra work first');
    if (input.decision === 'REJECT' && (await this.prisma.billingRequest.findFirst({ where: { ...ACTIVE, taskIds: { has: taskId } } }))) {
      throw Errors.conflict('This task is on a billing request; cancel the request first');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: input.decision === 'CONFIRM' ? { billableConfirmed: true } : { billable: false, billableConfirmed: false } });
      await this.activity.log({ kind: input.decision === 'CONFIRM' ? 'BILLABLE_CONFIRMED' : 'BILLABLE_REJECTED', actorId: v.userId, projectId: task.projectId, taskId }, tx);
    });
    return present(AckDto, { ok: true });
  }

  /** TechSpec 9.4: a confirmed billable task cannot be Done until a request lists it. */
  static async assertBilled(tx: Pick<PrismaService, 'billingRequest'>, task: { id: string; billableConfirmed: boolean }) {
    if (!task.billableConfirmed) return;
    const listed = await tx.billingRequest.findFirst({ where: { ...ACTIVE, taskIds: { has: task.id } }, select: { id: true } });
    if (!listed) throw new AppError(422, 'BILLING_REQUEST_REQUIRED', 'This task is confirmed as billable: the PM raises a billing request for it before it can be closed');
  }

  /** The request that bills a task, for the task page (field policy limits who sees it). */
  async forTask(taskId: string) {
    const r = await this.prisma.billingRequest.findFirst({ where: { ...ACTIVE, taskIds: { has: taskId } }, orderBy: { createdAt: 'desc' } });
    return r ? { requestId: r.id, status: r.status } : null;
  }
}
