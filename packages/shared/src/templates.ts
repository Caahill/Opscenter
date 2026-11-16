import { z } from 'zod';
import { PRIORITIES, TASK_TYPES } from './enums';

/** One task in a package template (Package.setupTasks / Package.cycleTasks). PRD 1.4. */
export const TaskTemplate = z.object({
  title: z.string().trim().min(1).max(160),
  type: z.enum(TASK_TYPES).default('DELIVERABLE'),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  estimateH: z.number().min(0).max(400).optional(),
  /** Setup tasks: the stage the task belongs to, for grouping on the project page. */
  stage: z.string().trim().max(80).optional(),
  /** Due this many days after the project start (setup) or the cycle start (monthly). */
  dueInDays: z.number().int().min(0).max(366).optional(),
});
export type TaskTemplate = z.infer<typeof TaskTemplate>;

export const TaskTemplates = z.array(TaskTemplate).max(100);

export const ChecklistTemplate = z.array(
  z.object({ text: z.string().trim().min(1).max(160), ownerRole: z.string().max(40).optional() }),
);
export type ChecklistTemplate = z.infer<typeof ChecklistTemplate>;

/** Last day of the month when the cycle day does not exist (e.g. 31 in November). */
export function cycleDateFor(year: number, monthIndex: number, cycleDay: number): Date {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, monthIndex, Math.min(cycleDay, lastDay)));
}

export const MARKET_CALLING_CODES: Record<string, string> = {
  IN: '91',
  AE: '971',
  SA: '966',
  AU: '61',
  UK: '44',
  CA: '1',
  US: '1',
  NZ: '64',
};

export const MARKETS = ['IN', 'AE', 'SA', 'AU', 'UK', 'CA', 'US', 'NZ'] as const;
