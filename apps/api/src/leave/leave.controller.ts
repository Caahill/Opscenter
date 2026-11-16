import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { present, type Scope } from '@opshub/policy';
import {
  CreateHolidayInput,
  CreateLeaveInput,
  ListHolidaysQuery,
  ListLeaveQuery,
  UpdateLeaveInput,
  type CreateHolidayInput as CreateHoliday,
  type CreateLeaveInput as CreateLeave,
  type ListHolidaysQuery as ListHolidays,
  type ListLeaveQuery as ListLeave,
  type UpdateLeaveInput as UpdateLeave,
} from '@opshub/shared';
import { Authenticated, CurrentViewer, GrantedScopes, Requires } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { AckDto } from '../policy/dtos';
import { LeaveService } from './leave.service';

@Controller()
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('leave')
  @Requires('leave.read')
  list(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Query(new ZodPipe(ListLeaveQuery)) q: ListLeave) {
    return this.leave.list(v, s, q);
  }

  @Post('leave')
  @Requires('leave.manage')
  create(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(CreateLeaveInput)) body: CreateLeave) {
    return this.leave.create(v, body);
  }

  @Patch('leave/:id')
  @Requires('leave.manage')
  update(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(UpdateLeaveInput)) body: UpdateLeave) {
    return this.leave.update(v, s, id, body);
  }

  @Delete('leave/:id')
  @Requires('leave.manage')
  async remove(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    await this.leave.remove(v, s, id);
    return present(AckDto, { ok: true });
  }

  /** The leave impact alert's page: affected tasks and who could take them (PRD 3.2). */
  @Get('leave/:id/impact')
  @Requires('leave.read')
  impact(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    return this.leave.impact(v, s, id);
  }

  /** Office holidays are company information, not personal data. */
  @Get('holidays')
  @Authenticated()
  holidays(@Query(new ZodPipe(ListHolidaysQuery)) q: ListHolidays) {
    return this.leave.holidays(q);
  }

  @Post('holidays')
  @Requires('holiday.manage')
  addHoliday(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(CreateHolidayInput)) body: CreateHoliday) {
    return this.leave.addHoliday(v, body);
  }

  @Delete('holidays/:id')
  @Requires('holiday.manage')
  async removeHoliday(@CurrentViewer() v: AuthedViewer, @Param('id') id: string) {
    await this.leave.removeHoliday(v, id);
    return present(AckDto, { ok: true });
  }
}
