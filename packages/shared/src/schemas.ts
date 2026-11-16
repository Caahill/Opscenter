import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants';
import { DEPARTMENTS, ROLES } from './enums';

const id = z.string().min(1).max(64);
const staffEmail = z.string().trim().toLowerCase().email().max(254);
const timezone = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Unknown time zone' },
  );

/** Office location for holidays, as a country code (IN first). */
const location = z.string().regex(/^[A-Z]{2}$/, 'must be a country code like IN');

export const PageQuery = z.object({
  cursor: id.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PageQuery = z.infer<typeof PageQuery>;

export const DevLoginInput = z.object({ userId: id });
export type DevLoginInput = z.infer<typeof DevLoginInput>;

export const CreateUserInput = z.object({
  email: staffEmail,
  name: z.string().trim().min(1).max(120),
  roles: z.array(z.enum(ROLES)).min(1),
  teamId: id.nullable().optional(),
  weeklyCapacityH: z.number().min(0).max(80).optional(),
  skills: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  timezone: timezone.optional(),
  location: location.optional(),
});
export type CreateUserInput = z.infer<typeof CreateUserInput>;

export const UpdateUserInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    roles: z.array(z.enum(ROLES)).min(1),
    teamId: id.nullable(),
    weeklyCapacityH: z.number().min(0).max(80),
    skills: z.array(z.string().trim().min(1).max(40)).max(20),
    timezone,
    location,
    active: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateUserInput = z.infer<typeof UpdateUserInput>;

export const CreateTeamInput = z.object({
  name: z.string().trim().min(1).max(80),
  department: z.enum(DEPARTMENTS),
  leaderId: id.nullable().optional(),
});
export type CreateTeamInput = z.infer<typeof CreateTeamInput>;

export const UpdateTeamInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    leaderId: id.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateTeamInput = z.infer<typeof UpdateTeamInput>;

export const AuditLogQuery = PageQuery.extend({
  entity: z.string().max(40).optional(),
  entityId: id.optional(),
  actorId: id.optional(),
  action: z.string().max(40).optional(),
});
export type AuditLogQuery = z.infer<typeof AuditLogQuery>;

export const ListUsersQuery = z.object({
  includeInactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuery>;
