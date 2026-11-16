// Package templates -> tasks (PRD 1.4). Shared by project creation (API) and cycle.generate (worker).
import type { Prisma } from '@prisma/client';
import { TaskTemplates, type TaskTemplate } from '@opshub/shared';

const DAY = 86_400_000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY);

/** Invalid template JSON yields no tasks rather than a crash; Admin input is validated on save. */
export function parseTemplates(json: Prisma.JsonValue): TaskTemplate[] {
  const parsed = TaskTemplates.safeParse(json);
  return parsed.success ? parsed.data : [];
}

export function tasksFromTemplates(
  templates: TaskTemplate[],
  base: { projectId: string; teamId: string | null; from: Date; cycleMonth?: string; createdById: string | null },
): Prisma.TaskCreateManyInput[] {
  return templates.map((t) => ({
    projectId: base.projectId,
    title: t.title,
    type: t.type,
    priority: t.priority,
    estimateH: t.estimateH ?? null,
    dueDate: t.dueInDays !== undefined ? addDays(base.from, t.dueInDays) : null,
    teamId: base.teamId,
    source: 'TEMPLATE' as const,
    cycleMonth: base.cycleMonth ?? null,
    createdById: base.createdById,
  }));
}
