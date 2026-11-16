import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import type { UnmaskedView } from '@opshub/policy';
import { PrismaService } from '../prisma/prisma.service';

export type AuditAction =
  | 'VIEW_UNMASKED'
  | 'REVEAL_CREDENTIAL'
  | 'ROLE_CHANGE'
  | 'USER_CREATED'
  | 'USER_DEACTIVATED'
  | 'USER_REACTIVATED'
  | 'LOGIN'
  | 'EXPORT'
  | 'CREDENTIAL_CREATED'
  | 'CREDENTIAL_GRANTED'
  | 'CREDENTIAL_GRANT_REVOKED'
  | 'PIPELINE_VERSION_CREATED'
  | 'PACKAGE_CHANGED'
  | 'LEAVE_RECORDED'
  | 'LEAVE_CHANGED'
  | 'LEAVE_DELETED'
  | 'HOLIDAY_CHANGED'
  | 'MAILBOX_CONNECTED'
  | 'MAILBOX_DISCONNECTED'
  | 'WHATSAPP_IMPORT';

type Tx = Pick<PrismaService, 'auditLog'>;

/** Compliance log (PRD 7.4). `meta` holds ids and field names only, never restricted values. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    actorId: string,
    action: AuditAction,
    entity: string,
    entityId: string,
    meta: Prisma.InputJsonObject = {},
    tx: Tx = this.prisma,
  ): Promise<void> {
    await tx.auditLog.create({ data: { actorId, action, entity, entityId, meta } });
  }

  /** One VIEW_UNMASKED row per record served unmasked in a response, listing the fields. */
  async recordUnmasked(actorId: string, views: UnmaskedView[], path: string): Promise<void> {
    const byRecord = new Map<string, { entity: string; entityId: string; fields: Set<string> }>();
    for (const v of views) {
      const entityId = v.entityId ?? 'unknown';
      const key = `${v.entity}:${entityId}`;
      const row = byRecord.get(key) ?? { entity: v.entity, entityId, fields: new Set<string>() };
      row.fields.add(v.field);
      byRecord.set(key, row);
    }
    if (byRecord.size === 0) return;
    await this.prisma.auditLog.createMany({
      data: [...byRecord.values()].map((r) => ({
        actorId,
        action: 'VIEW_UNMASKED',
        entity: r.entity,
        entityId: r.entityId,
        meta: { fields: [...r.fields].sort(), path },
      })),
    });
  }
}
