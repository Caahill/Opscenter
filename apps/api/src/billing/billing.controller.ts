import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { Scope } from '@opshub/policy';
import {
  BillingMessageInput,
  ConfirmBillableInput,
  CreateBillingRequestInput,
  FlagBillableInput,
  ListBillingQuery,
  ListRenewalsQuery,
  RenewalDecisionInput,
  UpdateBillingRequestInput,
  type BillingMessageInput as BillingMessage,
  type ConfirmBillableInput as ConfirmBillable,
  type CreateBillingRequestInput as CreateBilling,
  type FlagBillableInput as FlagBillable,
  type ListBillingQuery as ListBilling,
  type ListRenewalsQuery as ListRenewals,
  type RenewalDecisionInput as RenewalDecision,
  type UpdateBillingRequestInput as UpdateBilling,
} from '@opshub/shared';
import { CurrentViewer, GrantedScopes, Requires } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { BillingService } from './billing.service';
import { RenewalsService } from './renewals.service';

@Controller()
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly renewals: RenewalsService,
  ) {}

  @Get('billing-requests')
  @Requires('billing.read')
  list(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Query(new ZodPipe(ListBillingQuery)) q: ListBilling) {
    return this.billing.list(v, s, q);
  }

  @Post('billing-requests')
  @Requires('billing.create')
  create(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Body(new ZodPipe(CreateBillingRequestInput)) body: CreateBilling) {
    return this.billing.create(v, s, body);
  }

  @Get('billing-requests/:id')
  @Requires('billing.read')
  detail(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    return this.billing.detail(v, s, id);
  }

  /** Accounts: invoice and payment; the client's PM: edit or cancel while Requested (TechSpec 9.4). */
  @Patch('billing-requests/:id')
  @Requires('billing.update')
  update(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(UpdateBillingRequestInput)) body: UpdateBilling) {
    return this.billing.update(v, s, id, body);
  }

  @Post('billing-requests/:id/messages')
  @Requires('billing.read')
  message(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(BillingMessageInput)) body: BillingMessage) {
    return this.billing.message(v, s, id, body.body);
  }

  /** PRD 4.1: anyone who can see the task. */
  @Post('tasks/:id/flag-billable')
  @Requires('task.read')
  flag(@CurrentViewer() v: AuthedViewer, @Param('id') id: string, @Body(new ZodPipe(FlagBillableInput)) body: FlagBillable) {
    return this.billing.flag(v, id, body);
  }

  /** The client's PM (project.manage on the task's project). */
  @Post('tasks/:id/confirm-billable')
  @Requires('project.manage')
  confirm(@CurrentViewer() v: AuthedViewer, @Param('id') id: string, @Body(new ZodPipe(ConfirmBillableInput)) body: ConfirmBillable) {
    return this.billing.confirm(v, id, body);
  }

  @Get('renewals')
  @Requires('renewal.read')
  renewalsDue(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Query(new ZodPipe(ListRenewalsQuery)) q: ListRenewals) {
    return this.renewals.list(v, s, q);
  }

  @Post('projects/:id/renewal')
  @Requires('project.manage')
  decide(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(RenewalDecisionInput)) body: RenewalDecision) {
    return this.renewals.decide(v, s, id, body);
  }
}
