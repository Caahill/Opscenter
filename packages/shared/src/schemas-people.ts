// Phase 1C inputs: leave, holidays, capacity, the TL weekly planner and notifications.
import { z } from 'zod';
import { isIsoWeek } from './capacity';
import { PRIORITIES } from './enums';

const id = z.string().min(1).max(64);
const day = z.string().date();

export const LEAVE_KINDS = ['PLANNED', 'SICK', 'OTHER'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];
export const LEAVE_KIND_LABELS: Record<LeaveKind, string> = { PLANNED: 'Planned', SICK: 'Sick', OTHER: 'Other' };

export const IsoWeekInput = z.string().refine(isIsoWeek, 'must be an ISO week like 2026-W46');

const leaveFields = {
  startDate: day,
  endDate: day,
  /** Half days are single-day leave. */
  halfDay: z.boolean().default(false),
  kind: z.enum(LEAVE_KINDS),
  /** HR and Admin only; stored encrypted. */
  reason: z.string().trim().max(500).nullable().optional(),
};

export const LEAVE_RULES = {
  order: 'endDate: must be on or after the start date',
  halfDay: 'halfDay: a half day must start and end on the same date',
};

export const CreateLeaveInput = z
  .object({ userId: id, ...leaveFields })
  .refine((v) => v.startDate <= v.endDate, { message: LEAVE_RULES.order })
  .refine((v) => !v.halfDay || v.startDate === v.endDate, { message: LEAVE_RULES.halfDay });
export type CreateLeaveInput = z.infer<typeof CreateLeaveInput>;

/** Merged with the stored row and checked against LEAVE_RULES in the service. */
export const UpdateLeaveInput = z
  .object({
    startDate: day.optional(),
    endDate: day.optional(),
    halfDay: z.boolean().optional(),
    kind: z.enum(LEAVE_KINDS).optional(),
    reason: leaveFields.reason,
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateLeaveInput = z.infer<typeof UpdateLeaveInput>;

export const ListLeaveQuery = z.object({
  from: day.optional(),
  to: day.optional(),
  userId: id.optional(),
  teamId: id.optional(),
});
export type ListLeaveQuery = z.infer<typeof ListLeaveQuery>;

export const CreateHolidayInput = z.object({
  date: day,
  location: z.string().regex(/^[A-Z]{2}$/, 'must be a country code like IN').default('IN'),
  name: z.string().trim().min(1).max(80),
});
export type CreateHolidayInput = z.infer<typeof CreateHolidayInput>;

export const ListHolidaysQuery = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  location: z.string().regex(/^[A-Z]{2}$/).optional(),
});
export type ListHolidaysQuery = z.infer<typeof ListHolidaysQuery>;

export const CapacityQuery = z.object({
  week: IsoWeekInput.optional(),
  teamId: id.optional(),
  userId: id.optional(),
});
export type CapacityQuery = z.infer<typeof CapacityQuery>;

export const PlannerQuery = z.object({ week: IsoWeekInput.optional() });
export type PlannerQuery = z.infer<typeof PlannerQuery>;

export const PlannerMove = z
  .object({
    taskId: id,
    assigneeId: id.nullable().optional(),
    plannedDate: day.nullable().optional(),
    priority: z.enum(PRIORITIES).optional(),
  })
  .refine((m) => m.assigneeId !== undefined || m.plannedDate !== undefined || m.priority !== undefined, {
    message: 'Each move changes the assignee, the day or the priority',
  });

export const PlannerMovesInput = z.object({
  /** The week to return after the moves; defaults to the current week. */
  week: IsoWeekInput.optional(),
  moves: z.array(PlannerMove).min(1).max(50),
});
export type PlannerMovesInput = z.infer<typeof PlannerMovesInput>;

export const ListNotificationsQuery = z.object({ unread: z.enum(['true', 'false']).optional() });
export type ListNotificationsQuery = z.infer<typeof ListNotificationsQuery>;
