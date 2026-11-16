import { Controller, Get, Query } from '@nestjs/common';
import { page, present } from '@opshub/policy';
import { AuditLogQuery, type AuditLogQuery as AuditQuery } from '@opshub/shared';
import { Requires } from '../auth/access.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { AuditLogDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit-log')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Requires('audit.read', 'ALL')
  async list(@Query(new ZodPipe(AuditLogQuery)) q: AuditQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: { entity: q.entity, entityId: q.entityId, actorId: q.actorId, action: q.action },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const more = rows.length > q.limit;
    const items = more ? rows.slice(0, q.limit) : rows;
    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(items.map((r) => r.actorId))] } },
      select: { id: true, name: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.name]));
    return page(
      items.map((r) =>
        present(AuditLogDto, {
          id: r.id,
          actorId: r.actorId,
          actorName: names.get(r.actorId) ?? null,
          action: r.action,
          entity: r.entity,
          entityId: r.entityId,
          meta: r.meta,
          at: r.at,
        }),
      ),
      more ? (items.at(-1)?.id ?? null) : null,
    );
  }
}
