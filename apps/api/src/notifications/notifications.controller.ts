// In-app notifications, per-person settings and push devices (PRD 5.3). Everyone reads and changes
// only their own.
import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { preferencesFor } from '@opshub/db';
import type { PushSender } from '@opshub/integrations';
import { present } from '@opshub/policy';
import {
  ListNotificationsQuery,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  PushSubscriptionInput,
  RemovePushInput,
  UpdatePreferencesInput,
  type ListNotificationsQuery as ListNotifications,
  type PushSubscriptionInput as PushSubscriptionBody,
  type UpdatePreferencesInput as UpdatePreferences,
} from '@opshub/shared';
import type { z } from 'zod';
import { Authenticated, CurrentViewer } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { AckDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationListDto, NotificationSettingsDto, presentNotification } from '../people/dtos';
import { NotifyService } from './notify.service';
import { PUSH } from './push.provider';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    @Inject(PUSH) private readonly push: PushSender,
  ) {}

  @Get()
  @Authenticated()
  async list(@CurrentViewer() v: AuthedViewer, @Query(new ZodPipe(ListNotificationsQuery)) q: ListNotifications) {
    const [unread, items] = await Promise.all([
      this.prisma.notification.count({ where: { userId: v.userId, readAt: null } }),
      this.prisma.notification.findMany({
        where: { userId: v.userId, ...(q.unread === 'true' ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);
    return present(NotificationListDto, { unread, items: items.map(presentNotification) });
  }

  @Post('read-all')
  @Authenticated()
  async readAll(@CurrentViewer() v: AuthedViewer) {
    await this.prisma.notification.updateMany({ where: { userId: v.userId, readAt: null }, data: { readAt: new Date() } });
    return present(AckDto, { ok: true });
  }

  @Get('settings')
  @Authenticated()
  async settings(@CurrentViewer() v: AuthedViewer) {
    const [prefs, devices] = await Promise.all([preferencesFor(this.prisma, [v.userId]), this.prisma.pushSubscription.count({ where: { userId: v.userId } })]);
    const mine = prefs.get(v.userId)!;
    return present(NotificationSettingsDto, {
      preferences: NOTIFICATION_CATEGORIES.map((category) => ({ category, label: NOTIFICATION_CATEGORY_LABELS[category], ...mine[category] })),
      pushPublicKey: this.push.publicKey,
      pushDevices: devices,
      digestTime: '18:30 IST',
    });
  }

  @Put('settings')
  @Authenticated()
  async saveSettings(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(UpdatePreferencesInput)) body: UpdatePreferences) {
    for (const p of body.preferences) {
      await this.prisma.notificationPreference.upsert({
        where: { userId_category: { userId: v.userId, category: p.category } },
        update: { email: p.email, push: p.push },
        create: { userId: v.userId, category: p.category, email: p.email, push: p.push },
      });
    }
    return this.settings(v);
  }

  /** This browser or phone accepts push for the signed-in person (re-pointed if it was someone else's). */
  @Post('push-subscriptions')
  @Authenticated()
  async subscribe(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(PushSubscriptionInput)) body: PushSubscriptionBody) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { userId: v.userId, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: { userId: v.userId, endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
    return present(AckDto, { ok: true });
  }

  @Delete('push-subscriptions')
  @Authenticated()
  async unsubscribe(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(RemovePushInput)) body: z.infer<typeof RemovePushInput>) {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint: body.endpoint, userId: v.userId } });
    return present(AckDto, { ok: true });
  }

  /** Sends yourself a notification, to check push on this device. */
  @Post('test')
  @Authenticated()
  async test(@CurrentViewer() v: AuthedViewer) {
    await this.notify.notify([v.userId], { kind: 'TEST', title: 'Notifications are working', body: 'This is how Ops Hub alerts will look.', link: '/settings/notifications' });
    return present(AckDto, { ok: true });
  }

  @Post(':id/read')
  @Authenticated()
  async read(@CurrentViewer() v: AuthedViewer, @Param('id') id: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { id, userId: v.userId }, data: { readAt: new Date() } });
    if (count === 0) throw Errors.notFound('Notification');
    return present(AckDto, { ok: true });
  }
}
