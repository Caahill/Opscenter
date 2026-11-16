import { Body, Controller, Get, Injectable, Param, Patch, Post } from '@nestjs/common';
import type { Team } from '@opshub/db';
import { present } from '@opshub/policy';
import {
  CreateTeamInput,
  UpdateTeamInput,
  type CreateTeamInput as CreateTeam,
  type UpdateTeamInput as UpdateTeam,
} from '@opshub/shared';
import { Requires } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import { ZodPipe } from '../common/zod.pipe';
import { TeamDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: { where: { active: true } } } } },
    });
  }

  async create(input: CreateTeam) {
    if (input.leaderId) await this.assertLeader(input.leaderId);
    const team = await this.prisma.team.create({
      data: { name: input.name, department: input.department, leaderId: input.leaderId ?? null },
    });
    return { ...team, _count: { members: 0 } };
  }

  async update(id: string, input: UpdateTeam) {
    if (input.leaderId) await this.assertLeader(input.leaderId);
    await this.prisma.team.update({ where: { id }, data: { name: input.name, leaderId: input.leaderId } });
    return this.prisma.team.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { members: { where: { active: true } } } } },
    });
  }

  private async assertLeader(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active || !user.roles.includes('TEAM_LEADER')) {
      throw Errors.validation('leaderId: must be an active user with the Team Leader role');
    }
  }
}

const toTeamData = (t: Team & { _count: { members: number } }) => ({
  id: t.id,
  name: t.name,
  department: t.department,
  leaderId: t.leaderId,
  memberCount: t._count.members,
});

@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @Requires('team.read')
  async list() {
    return (await this.teams.list()).map((t) => present(TeamDto, toTeamData(t)));
  }

  @Post()
  @Requires('team.manage', 'ALL')
  async create(@Body(new ZodPipe(CreateTeamInput)) body: CreateTeam) {
    return present(TeamDto, toTeamData(await this.teams.create(body)));
  }

  @Patch(':id')
  @Requires('team.manage', 'ALL')
  async update(@Param('id') id: string, @Body(new ZodPipe(UpdateTeamInput)) body: UpdateTeam) {
    return present(TeamDto, toTeamData(await this.teams.update(id, body)));
  }
}
