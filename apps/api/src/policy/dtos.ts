// Response DTO specs. Each property names its row in packages/policy/src/fields.ts.
import { defineDto } from '@opshub/policy';

export const AckDto = defineDto('Ack', { ok: 'ack.ok' });

export const HealthDto = defineDto('Health', { status: 'health.status' });

export const UserDto = defineDto('User', {
  id: 'user.id',
  email: 'user.email',
  name: 'user.name',
  roles: 'user.roles',
  teamId: 'user.teamId',
  weeklyCapacityH: 'user.weeklyCapacityH',
  skills: 'user.skills',
  timezone: 'user.timezone',
  location: 'user.location',
  active: 'user.active',
  createdAt: 'user.createdAt',
});

export const MeDto = defineDto('User', {
  ...UserDto.fields,
  teamName: 'me.teamName',
  permissions: 'me.permissions',
});

export const TeamDto = defineDto('Team', {
  id: 'team.id',
  name: 'team.name',
  department: 'team.department',
  leaderId: 'team.leaderId',
  memberCount: 'team.memberCount',
});

export const AuditLogDto = defineDto('AuditLog', {
  id: 'auditLog.id',
  actorId: 'auditLog.actorId',
  actorName: 'auditLog.actorName',
  action: 'auditLog.action',
  entity: 'auditLog.entity',
  entityId: 'auditLog.entityId',
  meta: 'auditLog.meta',
  at: 'auditLog.at',
});

export const DevUserDto = defineDto('User', {
  id: 'devUser.id',
  name: 'devUser.name',
  email: 'devUser.email',
  roles: 'devUser.roles',
});
