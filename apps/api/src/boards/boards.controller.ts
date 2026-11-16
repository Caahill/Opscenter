import { Controller, Get, Param, Query } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import { present, type Scope } from '@opshub/policy';
import { BoardQuery, DEPARTMENTS, type BoardQuery as Board, type Department } from '@opshub/shared';
import { CurrentViewer, GrantedScopes, Requires } from '../auth/access.decorators';
import { CatalogService } from '../catalog/catalog.controller';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { OPEN_STATUSES, ProjectsQueries } from '../projects/projects.queries';
import { BoardColumnDto, BoardDto } from '../work/dtos';

/**
 * Department board (PRD 1.1). Columns are the active pipeline's stages; projects still on an older
 * pipeline version sit in the column with the same stage name, or in their own column at the end.
 * The list and calendar views render the same data.
 */
@Controller('boards')
export class BoardsController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly projects: ProjectsQueries,
  ) {}

  @Get(':department')
  @Requires('project.read')
  async board(
    @CurrentViewer() v: AuthedViewer,
    @GrantedScopes() s: Scope[],
    @Param('department') department: string,
    @Query(new ZodPipe(BoardQuery)) q: Board,
  ) {
    if (!(DEPARTMENTS as readonly string[]).includes(department)) throw Errors.notFound('Board');
    const dept = department as Department;
    const pipeline = await this.catalog.activePipeline(dept);
    if (!pipeline) throw Errors.notFound('Board');

    const openTask = { statusType: { in: [...OPEN_STATUSES] } };
    const where: Prisma.ProjectWhereInput = {
      department: dept,
      ...(q.pmId ? { pmId: q.pmId } : {}),
      ...(q.health ? { health: q.health } : {}),
      ...(q.packageId ? { packageId: q.packageId } : {}),
      ...(q.market ? { client: { market: q.market } } : {}),
      ...(q.assigneeId || q.priority
        ? { tasks: { some: { ...openTask, ...(q.assigneeId ? { assigneeId: q.assigneeId } : {}), ...(q.priority ? { priority: q.priority } : {}) } } }
        : {}),
    };
    const rows = await this.projects.list(v, s, where, { includeClosed: q.includeClosed });

    const columns = pipeline.stages.map((st) => ({ stage: st, items: [] as typeof rows }));
    const byName = new Map(columns.map((c) => [c.stage.name.toLowerCase(), c]));
    for (const r of rows) {
      let col = columns.find((c) => c.stage.id === r.row.stageId) ?? byName.get(r.row.stage.name.toLowerCase());
      if (!col) {
        col = { stage: r.row.stage, items: [] };
        columns.push(col);
        byName.set(r.row.stage.name.toLowerCase(), col);
      }
      col.items.push(r);
    }

    return present(BoardDto, {
      department: dept,
      pipelineVersion: pipeline.version,
      columns: columns.map((c) =>
        present(BoardColumnDto, {
          stageId: c.stage.id,
          stageName: c.stage.name,
          statusType: c.stage.statusType,
          phase: c.stage.phase,
          projects: c.items.map((i) => i.dto),
        }),
      ),
    });
  }
}
