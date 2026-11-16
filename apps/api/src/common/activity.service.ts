import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import { PrismaService } from '../prisma/prisma.service';

export type ActivityKind =
  | 'PROJECT_CREATED'
  | 'PROJECT_UPDATED'
  | 'STAGE_MOVED'
  | 'STATUS_CHANGED'
  | 'PROJECT_STOPPED'
  | 'HANDED_OFF'
  | 'HANDED_OVER_FROM'
  | 'CYCLE_GENERATED'
  | 'TASK_CREATED'
  | 'TASK_UPDATED'
  | 'TASK_PLANNED'
  | 'COMMENTED'
  | 'ATTACHMENT_ADDED'
  | 'CREDENTIAL_GRANTED'
  | 'CREDENTIAL_GRANT_REVOKED'
  | 'CLIENT_APPROVAL'
  | 'MESSAGE_LINKED'
  | 'MESSAGE_SENT'
  | 'BILLABLE_FLAGGED'
  | 'BILLABLE_CONFIRMED'
  | 'BILLABLE_REJECTED'
  | 'BILLING_REQUESTED'
  | 'BILLING_STATUS'
  | 'RENEWED'
  | 'RENEWAL_CLOSED';

type Db = Pick<PrismaService, 'activityLog'>;

/** Business history (stage moves, status, assignment). Never holds client contact data. */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  log(
    entry: {
      kind: ActivityKind;
      actorId: string | null;
      projectId?: string | null;
      taskId?: string | null;
      from?: Prisma.InputJsonObject | null;
      to?: Prisma.InputJsonObject | null;
    },
    db: Db = this.prisma,
  ) {
    return db.activityLog.create({
      data: {
        kind: entry.kind,
        actorId: entry.actorId,
        projectId: entry.projectId ?? null,
        taskId: entry.taskId ?? null,
        from: entry.from ?? undefined,
        to: entry.to ?? undefined,
      },
    });
  }
}
