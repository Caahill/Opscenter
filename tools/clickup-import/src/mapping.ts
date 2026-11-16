import { readFileSync } from 'node:fs';
import { PIPELINES, type Department, type StatusType } from '@opshub/db';
import { parse } from 'yaml';
import { z } from 'zod';

const DEPARTMENTS = Object.keys(PIPELINES) as [Department, ...Department[]];
const STATUS_TYPES = ['NOT_STARTED', 'ACTIVE', 'WAITING_ON_CLIENT', 'ON_HOLD', 'DONE', 'STOPPED'] as const;

const StatusRule = z.object({
  /** A stage name, or FIRST / SECOND / LAST_DONE / KEEP (KEEP: stage unknown, review). */
  stage: z.string(),
  statusType: z.enum(STATUS_TYPES),
  assignee: z.string().optional(),
});

const MappingSchema = z.object({
  workspace: z.object({ teamId: z.string(), spaceId: z.string(), spaceName: z.string() }),
  lists: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      department: z.enum(DEPARTMENTS),
      taskType: z.string().optional(),
      subtype: z.string().optional(),
      packageTier: z.string().optional(),
      dateFields: z.record(z.enum(['startDate', 'endDate'])).optional(),
    }),
  ),
  statuses: z.record(z.record(StatusRule)),
});

export type Mapping = z.infer<typeof MappingSchema>;
export type ListMapping = Mapping['lists'][number];

export function loadMapping(path: string): Mapping {
  return MappingSchema.parse(parse(readFileSync(path, 'utf8')));
}

export interface ResolvedStatus {
  stage: string;
  statusType: StatusType;
  assigneeHint: string | null;
  /** The ClickUp status replaced the working stage (hold, stop): someone should check the stage. */
  stageUnknown: boolean;
}

/** ClickUp status -> pipeline stage and status type, or null when the mapping has no rule. */
export function resolveStatus(mapping: Mapping, department: Department, clickupStatus: string): ResolvedStatus | null {
  const key = clickupStatus.trim().toLowerCase();
  const rule = mapping.statuses[department]?.[key] ?? mapping.statuses.default?.[key];
  if (!rule) return null;
  const stages = PIPELINES[department];
  let stage = rule.stage;
  let stageUnknown = false;
  if (stage === 'FIRST' || stage === 'KEEP') {
    stage = stages[0]!.name;
    stageUnknown = rule.stage === 'KEEP';
  } else if (stage === 'SECOND') {
    stage = (stages[1] ?? stages[0]!).name;
  } else if (stage === 'LAST_DONE') {
    stage = [...stages].reverse().find((s) => s.statusType === 'DONE')!.name;
  } else if (!stages.some((s) => s.name === stage)) {
    throw new Error(`mapping.yaml: "${stage}" is not a ${department} stage`);
  }
  return { stage, statusType: rule.statusType, assigneeHint: rule.assignee ?? null, stageUnknown };
}
