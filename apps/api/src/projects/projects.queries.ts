import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import type { Presentable, Scope } from '@opshub/policy';
import { OPEN_STATUS_TYPES } from '@opshub/shared';
import { DirectoryService } from '../common/directory.service';
import type { AuthedViewer } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { presentProject, type ProjectCounts, type ProjectRow } from '../work/dtos';

export const OPEN_STATUSES = OPEN_STATUS_TYPES;
export const CLOSED_STATUSES = ['DONE', 'STOPPED'] as const;

export const PROJECT_INCLUDE = {
  client: { select: { companyName: true, pmId: true, market: true } },
  stage: true,
  team: { select: { name: true } },
  package: { select: { name: true } },
} satisfies Prisma.ProjectInclude;

/** Start of today (UTC midnight of the date), the convention used for date-only due dates. */
export function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@Injectable()
export class ProjectsQueries {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly directory: DirectoryService,
  ) {}

  async counts(projectIds: string[]): Promise<ProjectCounts> {
    if (projectIds.length === 0) return { open: new Map(), overdue: new Map() };
    const base = { projectId: { in: projectIds }, statusType: { in: [...OPEN_STATUSES] }, parentTaskId: null };
    const [open, overdue] = await Promise.all([
      this.prisma.task.groupBy({ by: ['projectId'], where: base, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['projectId'], where: { ...base, dueDate: { lt: todayUtc() } }, _count: { _all: true } }),
    ]);
    return {
      open: new Map(open.map((r) => [r.projectId, r._count._all])),
      overdue: new Map(overdue.map((r) => [r.projectId, r._count._all])),
    };
  }

  /** Projects inside the viewer's scope matching `where`. Closed projects are archive unless asked for. */
  async list(
    v: AuthedViewer,
    scopes: Scope[],
    where: Prisma.ProjectWhereInput,
    opts: { includeClosed?: boolean } = {},
  ): Promise<Array<{ row: ProjectRow; dto: Presentable }>> {
    const rows = await this.prisma.project.findMany({
      where: {
        AND: [await this.scopes.projectWhere(v, scopes), where, opts.includeClosed ? {} : { statusType: { notIn: [...CLOSED_STATUSES] } }],
      },
      include: PROJECT_INCLUDE,
      orderBy: [{ stageEnteredAt: 'asc' }],
      take: 1000,
    });
    const [counts, names] = await Promise.all([this.counts(rows.map((r) => r.id)), this.directory.names(rows.map((r) => r.pmId))]);
    return rows.map((row) => ({ row, dto: presentProject(row, names, counts) }));
  }
}
