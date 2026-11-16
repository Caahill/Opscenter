import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import type { Presentable, Scope } from '@opshub/policy';
import type { AuthedViewer } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { presentTask, type TaskCounts, type TaskRow } from '../work/dtos';

export const TASK_INCLUDE = {
  project: { select: { clientId: true, department: true, pmId: true, client: { select: { companyName: true } } } },
  assignee: { select: { name: true } },
} satisfies Prisma.TaskInclude;

const PRIORITY_RANK = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;

/** Priority first, then due date (undated last). PRD: "sorted by priority and due date". */
export function byPriorityThenDue(a: TaskRow, b: TaskRow): number {
  const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (p !== 0) return p;
  const ad = a.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const bd = b.dueDate?.getTime() ?? Number.POSITIVE_INFINITY;
  return ad - bd;
}

@Injectable()
export class TasksQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
  ) {}

  async counts(taskIds: string[]): Promise<TaskCounts> {
    if (taskIds.length === 0) return { subtasks: new Map(), checklistDone: new Map(), checklistTotal: new Map() };
    const [subtasks, total, done] = await Promise.all([
      this.prisma.task.groupBy({ by: ['parentTaskId'], where: { parentTaskId: { in: taskIds } }, _count: { _all: true } }),
      this.prisma.checklistItem.groupBy({ by: ['taskId'], where: { taskId: { in: taskIds } }, _count: { _all: true } }),
      this.prisma.checklistItem.groupBy({ by: ['taskId'], where: { taskId: { in: taskIds }, done: true }, _count: { _all: true } }),
    ]);
    return {
      subtasks: new Map(subtasks.map((r) => [r.parentTaskId!, r._count._all])),
      checklistTotal: new Map(total.map((r) => [r.taskId!, r._count._all])),
      checklistDone: new Map(done.map((r) => [r.taskId!, r._count._all])),
    };
  }

  async rows(v: AuthedViewer, scopes: Scope[], where: Prisma.TaskWhereInput, take = 500): Promise<TaskRow[]> {
    const rows = await this.prisma.task.findMany({
      where: { AND: [await this.scopes.taskWhere(v, scopes), where] },
      include: TASK_INCLUDE,
      take,
    });
    return rows.sort(byPriorityThenDue);
  }

  async present(rows: TaskRow[]): Promise<Presentable[]> {
    const counts = await this.counts(rows.map((r) => r.id));
    return rows.map((r) => presentTask(r, counts));
  }

  async list(v: AuthedViewer, scopes: Scope[], where: Prisma.TaskWhereInput, take = 500): Promise<Presentable[]> {
    return this.present(await this.rows(v, scopes, where, take));
  }
}
