// Renewals (PRD 4.3): retainers and AMCs ending within the window. The PM renews (a RENEWAL billing
// request for Accounts, and the term moves on) or closes (the project ends). Alerts come from the
// renewal.alerts job in the worker.
import { Injectable } from '@nestjs/common';
import { daysUntil, Prisma, termEnd } from '@opshub/db';
import { present, scopesFor, type Scope } from '@opshub/policy';
import { DEFAULT_TIMEZONE, DEPARTMENT_LABELS, MARKET_CURRENCY, todayIn, type ListRenewalsQuery, type RenewalDecisionInput } from '@opshub/shared';
import { ActivityService } from '../common/activity.service';
import { DirectoryService } from '../common/directory.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { NotifyService } from '../notifications/notify.service';
import { AckDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { BillingService } from './billing.service';
import { RenewalDto } from './dtos';

const DAY_MS = 86_400_000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const renewalKey = (projectId: string, end: Date) => `${projectId}:${ymd(end)}`;

@Injectable()
export class RenewalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly directory: DirectoryService,
    private readonly activity: ActivityService,
    private readonly notify: NotifyService,
    private readonly billing: BillingService,
  ) {}

  async list(v: AuthedViewer, scopes: Scope[], q: ListRenewalsQuery) {
    const today = todayIn(DEFAULT_TIMEZONE);
    const horizon = new Date(new Date(`${today}T00:00:00.000Z`).getTime() + q.within * DAY_MS);
    const projects = await this.prisma.project.findMany({
      where: {
        AND: [
          this.scopes.renewalWhere(v, scopes),
          { type: { in: ['RETAINER', 'AMC'] }, statusType: { notIn: ['DONE', 'STOPPED'] } },
          { OR: [{ renewalDate: { lte: horizon } }, { renewalDate: null, endDate: { lte: horizon } }] },
        ],
      },
      include: { client: { select: { companyName: true, market: true } }, package: { select: { name: true } } },
    });
    const keys = projects.map((p) => renewalKey(p.id, termEnd(p)!));
    const [billed, names] = await Promise.all([
      this.prisma.billingRequest.findMany({ where: { renewalKey: { in: keys } }, select: { id: true, renewalKey: true } }),
      this.directory.names(projects.map((p) => p.pmId)),
    ]);
    const billedBy = new Map(billed.map((b) => [b.renewalKey!, b.id]));
    return projects
      .map((p) => {
        const end = termEnd(p)!;
        return {
          p,
          dto: present(
            RenewalDto,
            {
              projectId: p.id,
              clientId: p.clientId,
              clientName: p.client.companyName,
              department: p.department,
              packageName: p.package?.name ?? null,
              type: p.type,
              endDate: end,
              daysLeft: daysUntil(end, today),
              pmId: p.pmId,
              pmName: names.get(p.pmId) ?? null,
              currency: MARKET_CURRENCY[p.client.market] ?? 'INR',
              billingRequestId: billedBy.get(renewalKey(p.id, end)) ?? null,
            },
            { clientPmId: p.pmId, entityId: p.id },
          ),
          end,
        };
      })
      .sort((a, b) => a.end.getTime() - b.end.getTime())
      .map((x) => x.dto);
  }

  async decide(v: AuthedViewer, scopes: Scope[], projectId: string, input: RenewalDecisionInput) {
    const p = await this.scopes.requireProject(v, scopes, projectId);
    if (p.type !== 'RETAINER' && p.type !== 'AMC') throw Errors.invalidState('Only retainers and AMCs renew');
    if (p.statusType === 'DONE' || p.statusType === 'STOPPED') throw Errors.invalidState('This project is closed');
    const end = termEnd(p);
    if (!end) throw Errors.invalidState('Set the end date first');
    const client = await this.prisma.client.findUniqueOrThrow({ where: { id: p.clientId } });
    const what = `${client.companyName} · ${DEPARTMENT_LABELS[p.department]}`;

    if (input.decision === 'CLOSE') {
      await this.prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id: p.id }, data: { statusType: 'DONE' } });
        await this.activity.log({ kind: 'RENEWAL_CLOSED', actorId: v.userId, projectId: p.id, from: { endDate: ymd(end) } }, tx);
      });
      await this.notify.notify(await this.notify.accountsUserIds(), { kind: 'RENEWAL_DECIDED', title: `${what} will not renew`, body: `It ends ${ymd(end)}.`, link: `/projects/${p.id}` }, v.userId);
      return present(AckDto, { ok: true });
    }

    const newEnd = new Date(`${input.newEndDate}T00:00:00.000Z`);
    if (newEnd <= end) throw Errors.validation('newEndDate: must be after the current end date');
    let requestId: string;
    try {
      requestId = await this.prisma.$transaction(async (tx) => {
        const r = await tx.billingRequest.create({
          data: {
            clientId: client.id,
            projectId: p.id,
            reason: 'RENEWAL',
            description: input.description || `Renewal of ${DEPARTMENT_LABELS[p.department]} from ${ymd(new Date(end.getTime() + DAY_MS))} to ${input.newEndDate}`,
            amount: input.amount,
            currency: input.currency ?? MARKET_CURRENCY[client.market] ?? 'INR',
            raisedById: v.userId,
            renewalKey: renewalKey(p.id, end),
          },
        });
        await tx.project.update({ where: { id: p.id }, data: { endDate: newEnd, renewalDate: p.renewalDate ? newEnd : null } });
        await this.activity.log({ kind: 'RENEWED', actorId: v.userId, projectId: p.id, from: { endDate: ymd(end) }, to: { endDate: input.newEndDate, billingRequestId: r.id } }, tx);
        return r.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw Errors.conflict('This term has already been renewed');
      throw e;
    }
    await this.notify.notify(await this.notify.accountsUserIds(), { kind: 'BILLING', title: `Renewal: ${what}`, body: `Renewed to ${input.newEndDate}; please invoice.`, link: `/billing/${requestId}` }, v.userId);
    return this.billing.detail(v, scopesFor(v.roles, 'billing.read'), requestId);
  }
}
