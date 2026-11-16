// In-app notifications written by services, then delivered: a live `notification.new` event to the
// person and web push to their devices (PRD 5.3). The email digest is the worker's job.
// Text must never hold client contact data, project values or amounts (AGENTS.md rule 4).
import { Inject, Injectable } from '@nestjs/common';
import { deliverPush } from '@opshub/db';
import type { Prisma } from '@opshub/db';
import type { PushSender } from '@opshub/integrations';
import { maskBody } from '@opshub/policy';
import { categoryOf } from '@opshub/shared';
import { JobsService } from '../jobs/jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.gateway';
import { presentNotification } from '../people/dtos';
import { PUSH } from './push.provider';

export interface NewNotification {
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  data?: Prisma.InputJsonObject;
  /** Same key for the same person replaces the earlier notification. */
  dedupeKey?: string;
}

@Injectable()
export class NotifyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly jobs: JobsService,
    @Inject(PUSH) private readonly push: PushSender,
  ) {
    jobs.register('notify.deliver', (d) => this.deliver(d.ids as string[]));
  }

  async accountsUserIds(): Promise<string[]> {
    return (await this.prisma.user.findMany({ where: { active: true, roles: { has: 'ACCOUNTS' } }, select: { id: true } })).map((u) => u.id);
  }

  /** Skips the actor and inactive people. */
  async notify(userIds: Array<string | null | undefined>, n: NewNotification, actorId?: string): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id) && id !== actorId))];
    if (!ids.length) return;
    const active = await this.prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true } });
    // Masked again on the way in: callers build text from masked data, this is the backstop.
    const fields = { kind: n.kind, category: categoryOf(n.kind), title: maskBody(n.title), body: n.body ? maskBody(n.body) : null, link: n.link ?? null, data: n.data };
    const written: string[] = [];
    for (const { id: userId } of active) {
      const row = n.dedupeKey
        ? await this.prisma.notification.upsert({
            where: { userId_dedupeKey: { userId, dedupeKey: n.dedupeKey } },
            update: { ...fields, readAt: null, emailedAt: null, pushedAt: null, createdAt: new Date() },
            create: { ...fields, userId, dedupeKey: n.dedupeKey },
          })
        : await this.prisma.notification.create({ data: { ...fields, userId } });
      written.push(row.id);
    }
    await this.announce(written);
  }

  /** Delivers notifications written elsewhere (leave impact, renewal alerts run inside the API). */
  async announce(ids: string[]): Promise<void> {
    if (ids.length) await this.jobs.enqueue('notify.deliver', { ids });
  }

  private async deliver(ids: string[]) {
    const rows = await this.prisma.notification.findMany({ where: { id: { in: ids } } });
    for (const n of rows) await this.realtime.emitTo(n.userId, 'notification.new', async () => presentNotification(n));
    return deliverPush(this.prisma, (target, payload) => this.push.send(target, payload), { ids });
  }
}
