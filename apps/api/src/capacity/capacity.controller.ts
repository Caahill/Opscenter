import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { Scope } from '@opshub/policy';
import {
  CapacityQuery,
  PlannerMovesInput,
  PlannerQuery,
  type CapacityQuery as Capacity,
  type PlannerMovesInput as PlannerMoves,
  type PlannerQuery as Planner,
} from '@opshub/shared';
import { CurrentViewer, GrantedScopes, Requires } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { CapacityService } from './capacity.service';
import { PlannerService } from './planner.service';

@Controller()
export class CapacityController {
  constructor(
    private readonly capacity: CapacityService,
    private readonly planner: PlannerService,
  ) {}

  @Get('capacity')
  @Requires('capacity.read')
  overview(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Query(new ZodPipe(CapacityQuery)) q: Capacity) {
    return this.capacity.overview(v, s, q);
  }

  @Get('planner/:teamId')
  @Requires('planner.read')
  view(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('teamId') teamId: string, @Query(new ZodPipe(PlannerQuery)) q: Planner) {
    return this.planner.view(v, s, teamId, q.week);
  }

  /** Batch reassign, reschedule or reprioritise from the planner (drag between members and days). */
  @Post('planner/:teamId/moves')
  @Requires('planner.manage')
  moves(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('teamId') teamId: string, @Body(new ZodPipe(PlannerMovesInput)) body: PlannerMoves) {
    return this.planner.moves(v, s, teamId, body);
  }
}
