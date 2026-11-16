import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, User } from '@opshub/db';
import { permissionsFor } from '@opshub/policy';
import type { CreateUserInput, Role, UpdateUserInput } from '@opshub/shared';
import { AuditService } from '../audit/audit.service';
import { ENV, type Env } from '../config/env';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { SessionService } from '../auth/session.service';

const OPEN_STATUSES = ['NOT_STARTED', 'ACTIVE', 'WAITING_ON_CLIENT', 'ON_HOLD'] as const;

export function toUserData(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roles: u.roles,
    teamId: u.teamId,
    weeklyCapacityH: u.weeklyCapacityH,
    skills: u.skills,
    timezone: u.timezone,
    location: u.location,
    active: u.active,
    createdAt: u.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  list(includeInactive: boolean) {
    return this.prisma.user.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
    });
  }

  async me(viewer: AuthedViewer) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: viewer.userId }, include: { team: true } });
    return { user, teamName: user.team?.name ?? null, permissions: permissionsFor(user.roles as Role[]) };
  }

  async create(actor: AuthedViewer, input: CreateUserInput) {
    this.assertAllowedDomain(input.email);
    if (input.teamId) await this.assertTeam(input.teamId);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          name: input.name,
          roles: input.roles,
          teamId: input.teamId ?? null,
          weeklyCapacityH: input.weeklyCapacityH,
          skills: input.skills,
          timezone: input.timezone,
          location: input.location,
        },
      });
      await this.audit.record(actor.userId, 'USER_CREATED', 'User', user.id, { roles: input.roles }, tx);
      return user;
    });
  }

  async update(actor: AuthedViewer, id: string, input: UpdateUserInput) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw Errors.notFound('User');

    if (id === actor.userId) {
      if (input.active === false) throw Errors.invalidState('You cannot deactivate yourself');
      if (input.roles && !input.roles.includes('ADMIN') && before.roles.includes('ADMIN')) {
        throw Errors.invalidState('You cannot remove your own Admin role');
      }
    }
    if (input.teamId) await this.assertTeam(input.teamId);

    const deactivating = input.active === false && before.active;
    const reactivating = input.active === true && !before.active;

    const user = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.UserUpdateInput = {
        name: input.name,
        roles: input.roles,
        weeklyCapacityH: input.weeklyCapacityH,
        skills: input.skills,
        timezone: input.timezone,
        location: input.location,
        active: input.active,
        team: input.teamId === undefined ? undefined : input.teamId ? { connect: { id: input.teamId } } : { disconnect: true },
      };
      const updated = await tx.user.update({ where: { id }, data });

      if (input.roles && !sameRoles(before.roles, input.roles)) {
        await this.audit.record(actor.userId, 'ROLE_CHANGE', 'User', id, { from: before.roles, to: input.roles }, tx);
      }
      if (deactivating) {
        const meta = await this.offboard(tx, updated);
        await this.audit.record(actor.userId, 'USER_DEACTIVATED', 'User', id, meta, tx);
      }
      if (reactivating) {
        await this.audit.record(actor.userId, 'USER_REACTIVATED', 'User', id, {}, tx);
      }
      return updated;
    });

    if (deactivating) await this.sessions.revokeAllForUser(id);
    return user;
  }

  /**
   * PRD 7.1 and the offboarding runbook: open tasks go to the Team Leader, credential grants are
   * revoked. Sessions are revoked by the caller once the transaction commits.
   */
  private async offboard(tx: Prisma.TransactionClient, user: User) {
    const team = user.teamId ? await tx.team.findUnique({ where: { id: user.teamId } }) : null;
    const reassignTo = team?.leaderId && team.leaderId !== user.id ? team.leaderId : null;
    const tasks = await tx.task.updateMany({
      where: { assigneeId: user.id, statusType: { in: [...OPEN_STATUSES] } },
      data: { assigneeId: reassignTo },
    });
    const grants = await tx.credentialGrant.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { tasksReassigned: tasks.count, reassignedTo: reassignTo, grantsRevoked: grants.count };
  }

  private assertAllowedDomain(email: string) {
    if (this.env.AUTH_MODE !== 'google') return;
    const domain = email.split('@')[1] ?? '';
    if (!this.env.GOOGLE_ALLOWED_DOMAINS.includes(domain)) {
      throw Errors.validation('email: must be a SySpree Google Workspace address');
    }
  }

  private async assertTeam(teamId: string) {
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team) throw Errors.validation('teamId: team does not exist');
  }
}

function sameRoles(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}
