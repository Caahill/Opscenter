// Pure planning step: ClickUp tasks + mapping -> what the import would create. No network, no DB.
import type { Department, StatusType } from '@opshub/db';
import { findSensitive, type SensitiveFinding } from '@opshub/policy';
import type { ClickUpTask } from './clickup';
import { resolveStatus, type ListMapping, type Mapping } from './mapping';
import { clientKey } from './normalize';

export interface PlannedProject {
  taskId: string;
  taskName: string;
  listId: string;
  listName: string;
  department: Department;
  clickupStatus: string;
  stage: string | null;
  statusType: StatusType | null;
  assigneeHint: string | null;
  stageUnknown: boolean;
  archived: boolean;
  clientKey: string;
}

export interface PlannedClient {
  key: string;
  kind: 'domain' | 'name';
  names: string[];
  lists: string[];
  projects: number;
}

export interface Extraction {
  taskId: string;
  listName: string;
  kind: SensitiveFinding['kind'];
  /** Masked preview for review; the real value is never written to the report. */
  preview: string;
}

export interface Gap {
  listName: string;
  department: Department;
  clickupStatus: string;
  tasks: number;
}

export interface ImportPlan {
  projects: PlannedProject[];
  clients: PlannedClient[];
  gaps: Gap[];
  extractions: Extraction[];
  subtasks: number;
}

export function preview(f: SensitiveFinding): string {
  if (f.kind === 'email') {
    const [local, domain] = f.value.split('@');
    return `${(local ?? '').slice(0, 1)}***@${domain ?? ''}`;
  }
  if (f.kind === 'phone') return `***${f.value.replace(/\D/g, '').slice(-2)}`;
  return `[credential, ${f.value.length} characters]`;
}

export function buildPlan(mapping: Mapping, tasksByList: Map<string, ClickUpTask[]>): ImportPlan {
  const projects: PlannedProject[] = [];
  const clients = new Map<string, PlannedClient>();
  const gaps = new Map<string, Gap>();
  const extractions: Extraction[] = [];
  let subtasks = 0;

  for (const list of mapping.lists as ListMapping[]) {
    for (const task of tasksByList.get(list.id) ?? []) {
      const text = `${task.text_content ?? task.description ?? ''}`;
      for (const f of findSensitive(text)) extractions.push({ taskId: task.id, listName: list.name, kind: f.kind, preview: preview(f) });

      // Subtasks become tasks on their parent's project, not projects of their own.
      if (task.parent) {
        subtasks++;
        continue;
      }

      const resolved = resolveStatus(mapping, list.department, task.status.status);
      if (!resolved) {
        const k = `${list.id}:${task.status.status.toLowerCase()}`;
        const g = gaps.get(k) ?? { listName: list.name, department: list.department, clickupStatus: task.status.status, tasks: 0 };
        g.tasks++;
        gaps.set(k, g);
      }
      const ck = clientKey(task.name);
      const client = clients.get(ck.key) ?? { key: ck.key, kind: ck.kind, names: [], lists: [], projects: 0 };
      if (!client.names.includes(task.name)) client.names.push(task.name);
      if (!client.lists.includes(list.name)) client.lists.push(list.name);
      client.projects++;
      clients.set(ck.key, client);

      projects.push({
        taskId: task.id,
        taskName: task.name,
        listId: list.id,
        listName: list.name,
        department: list.department,
        clickupStatus: task.status.status,
        stage: resolved?.stage ?? null,
        statusType: resolved?.statusType ?? null,
        assigneeHint: resolved?.assigneeHint ?? null,
        stageUnknown: resolved?.stageUnknown ?? false,
        // Stopped and finished work imports as read-only history.
        archived: resolved?.statusType === 'STOPPED' || resolved?.statusType === 'DONE',
        clientKey: ck.key,
      });
    }
  }

  return {
    projects,
    clients: [...clients.values()].sort((a, b) => b.projects - a.projects || a.key.localeCompare(b.key)),
    gaps: [...gaps.values()],
    extractions,
    subtasks,
  };
}
