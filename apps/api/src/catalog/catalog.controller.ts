import { Body, Controller, Get, Injectable, Param, Patch, Post, Query } from '@nestjs/common';
import type { Department } from '@opshub/db';
import {
  CreatePipelineVersionInput,
  DEPARTMENTS,
  UpsertPackageInput,
  type CreatePipelineVersionInput as CreatePipeline,
  type UpsertPackageInput as UpsertPackage,
} from '@opshub/shared';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentViewer, Requires } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { presentPackage, presentPipeline } from '../work/dtos';

const CatalogQuery = z.object({
  department: z.enum(DEPARTMENTS).optional(),
  all: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
type CatalogQuery = z.infer<typeof CatalogQuery>;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  activePipeline(department: Department) {
    return this.prisma.pipeline.findFirst({
      where: { department, active: true },
      orderBy: { version: 'desc' },
      include: { stages: { orderBy: { order: 'asc' } } },
    });
  }

  /** PRD pipeline rule: stage names never contain a person's name; the owner is the assignee. */
  async assertNoPeopleInStageNames(names: string[]) {
    const users = await this.prisma.user.findMany({ select: { name: true } });
    const people = new Set(
      users.flatMap((u) => u.name.toLowerCase().split(/\s+/)).filter((w) => w.length >= 3),
    );
    for (const stage of names) {
      const hit = stage.toLowerCase().split(/[^a-z]+/).find((w) => people.has(w));
      if (hit) throw Errors.validation(`stages: "${stage}" contains a person's name. Assign the person to tasks instead.`);
    }
  }

  async createPipelineVersion(actorId: string, input: CreatePipeline) {
    await this.assertNoPeopleInStageNames(input.stages.map((s) => s.name));
    const latest = await this.prisma.pipeline.findFirst({ where: { department: input.department }, orderBy: { version: 'desc' } });
    const version = (latest?.version ?? 0) + 1;
    const pipeline = await this.prisma.$transaction(async (tx) => {
      // Live projects keep their pipeline and history; only new projects use the new version.
      await tx.pipeline.updateMany({ where: { department: input.department, active: true }, data: { active: false } });
      const p = await tx.pipeline.create({
        data: {
          department: input.department,
          version,
          stages: {
            create: input.stages.map((s, i) => ({
              name: s.name,
              order: i + 1,
              statusType: s.statusType,
              phase: s.phase,
              slaDays: s.slaDays ?? null,
              checklist: s.checklist ?? [],
            })),
          },
        },
        include: { stages: true },
      });
      await this.audit.record(actorId, 'PIPELINE_VERSION_CREATED', 'Pipeline', p.id, { department: input.department, version }, tx);
      return p;
    });
    return presentPipeline(pipeline, 0);
  }
}

@Controller()
export class CatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    private readonly audit: AuditService,
  ) {}

  @Get('pipelines')
  @Requires('pipeline.read')
  async pipelines(@Query(new ZodPipe(CatalogQuery)) q: CatalogQuery) {
    const rows = await this.prisma.pipeline.findMany({
      where: { ...(q.department ? { department: q.department } : {}), ...(q.all ? {} : { active: true }) },
      include: { stages: true },
      orderBy: [{ department: 'asc' }, { version: 'desc' }],
    });
    const counts = await this.prisma.project.groupBy({ by: ['pipelineId'], _count: { _all: true } });
    const byPipeline = new Map(counts.map((c) => [c.pipelineId, c._count._all]));
    return rows.map((p) => presentPipeline(p, byPipeline.get(p.id) ?? 0));
  }

  @Post('pipelines')
  @Requires('pipeline.manage', 'ALL')
  createPipeline(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(CreatePipelineVersionInput)) body: CreatePipeline) {
    return this.catalog.createPipelineVersion(v.userId, body);
  }

  @Get('packages')
  @Requires('pipeline.read')
  async packages(@Query(new ZodPipe(CatalogQuery)) q: CatalogQuery) {
    const rows = await this.prisma.package.findMany({
      where: { ...(q.department ? { department: q.department } : {}), ...(q.all ? {} : { active: true }) },
      orderBy: [{ department: 'asc' }, { name: 'asc' }],
    });
    return rows.map(presentPackage);
  }

  @Post('packages')
  @Requires('pipeline.manage', 'ALL')
  async createPackage(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(UpsertPackageInput)) body: UpsertPackage) {
    const input = body;
    const pkg = await this.prisma.package.create({
      data: {
        department: input.department,
        name: input.name,
        setupTasks: input.setupTasks,
        cycleTasks: input.cycleTasks,
        monthlyHours: input.monthlyHours ?? null,
        active: input.active ?? true,
      },
    });
    await this.audit.record(v.userId, 'PACKAGE_CHANGED', 'Package', pkg.id, { created: true });
    return presentPackage(pkg);
  }

  /** Template changes apply to projects started and cycles generated after the change. */
  @Patch('packages/:id')
  @Requires('pipeline.manage', 'ALL')
  async updatePackage(@CurrentViewer() v: AuthedViewer, @Param('id') id: string, @Body(new ZodPipe(UpsertPackageInput)) body: UpsertPackage) {
    const input = body;
    const existing = await this.prisma.package.findUnique({ where: { id } });
    if (!existing) throw Errors.notFound('Package');
    if (existing.department !== input.department) throw Errors.validation('department: cannot change a package department');
    const pkg = await this.prisma.package.update({
      where: { id },
      data: { name: input.name, setupTasks: input.setupTasks, cycleTasks: input.cycleTasks, monthlyHours: input.monthlyHours ?? null, active: input.active },
    });
    await this.audit.record(v.userId, 'PACKAGE_CHANGED', 'Package', id, { created: false });
    return presentPackage(pkg);
  }
}
