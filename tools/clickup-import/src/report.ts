// Dry-run report files (QuickStart 9). Contains masked previews only, never raw contact data or logins.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImportPlan } from './plan';

const csv = (rows: Array<Array<string | number>>) =>
  rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n') + '\n';

export function writeReport(plan: ImportPlan, outDir: string, meta: { generatedAt: string; lists: number }): string[] {
  mkdirSync(outDir, { recursive: true });

  const byList = new Map<string, Map<string, number>>();
  for (const p of plan.projects) {
    const m = byList.get(p.listName) ?? new Map<string, number>();
    m.set(p.clickupStatus, (m.get(p.clickupStatus) ?? 0) + 1);
    byList.set(p.listName, m);
  }
  const active = plan.projects.filter((p) => !p.archived);
  const unknownStage = plan.projects.filter((p) => p.stageUnknown);
  const people = [...new Set(plan.projects.map((p) => p.assigneeHint).filter(Boolean))];
  const merged = plan.clients.filter((c) => c.lists.length > 1 || c.names.length > 1);

  const summary = [
    '# ClickUp import dry run',
    '',
    `Generated ${meta.generatedAt}. Nothing was written to Ops Hub.`,
    '',
    `- Lists read: ${meta.lists}`,
    `- Projects: ${plan.projects.length} (${active.length} active, ${plan.projects.length - active.length} archived as read-only history)`,
    `- Subtasks: ${plan.subtasks}`,
    `- Clients after de-duplication: ${plan.clients.length} (${merged.length} merged across lists or names)`,
    `- Statuses with no mapping: ${plan.gaps.length} (see mapping-gaps.csv)`,
    `- Projects whose stage needs a check (on hold or stopped in ClickUp): ${unknownStage.length}`,
    `- People taken out of status names, to become assignees: ${people.join(', ') || 'none'}`,
    `- Contact details and logins to move to encrypted storage: ${plan.extractions.length} (see pii-extractions.csv)`,
    '',
    '## Tasks per list and status',
    '',
    '| List | Status | Tasks |',
    '| --- | --- | --- |',
    ...[...byList.entries()].flatMap(([list, statuses]) => [...statuses.entries()].map(([s, n]) => `| ${list} | ${s} | ${n} |`)),
    '',
  ].join('\n');

  const files = {
    'summary.md': summary,
    'mapping-gaps.csv': csv([['list', 'department', 'clickup_status', 'tasks'], ...plan.gaps.map((g) => [g.listName, g.department, g.clickupStatus, g.tasks])]),
    'clients-dedup.csv': csv([
      ['client_key', 'matched_by', 'projects', 'lists', 'task_names'],
      ...plan.clients.map((c) => [c.key, c.kind, c.projects, c.lists.join(' | '), c.names.join(' | ')]),
    ]),
    'pii-extractions.csv': csv([['task_id', 'list', 'kind', 'masked_preview'], ...plan.extractions.map((e) => [e.taskId, e.listName, e.kind, e.preview])]),
    'projects.csv': csv([
      ['task_id', 'task_name', 'list', 'department', 'clickup_status', 'stage', 'status_type', 'assignee_hint', 'archived', 'client_key'],
      ...plan.projects.map((p) => [p.taskId, p.taskName, p.listName, p.department, p.clickupStatus, p.stage ?? 'UNMAPPED', p.statusType ?? 'UNMAPPED', p.assigneeHint ?? '', p.archived ? 'yes' : 'no', p.clientKey]),
    ]),
  };
  for (const [name, content] of Object.entries(files)) writeFileSync(join(outDir, name), content);
  return Object.keys(files);
}
