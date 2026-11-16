import type { NotificationListView } from '@opshub/shared';
import { Card, PageHeader } from '@opshub/ui';
import { api, getMe } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { MarkAllRead, OpenAlert } from './alert-actions';

export default async function NotificationsPage() {
  const [me, list] = await Promise.all([getMe(), api<NotificationListView>('/notifications')]);
  return (
    <>
      <PageHeader title="Alerts" description="Mentions, assignments, client messages, billing and leave. Choose what also reaches you by email or push in Notification settings." actions={list.unread ? <MarkAllRead /> : null} />
      <Card className="p-0">
        {list.items.length === 0 ? (
          <p className="px-5 py-8 text-center text-muted">No alerts.</p>
        ) : (
          <ul className="divide-y divide-surface-alt">
            {list.items.map((n) => (
              <li key={n.id} className="flex gap-3 px-5 py-3" data-testid="alert">
                <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-accent'}`} />
                <div className="min-w-0 flex-1">
                  <OpenAlert id={n.id} link={n.link} title={n.title} unread={!n.readAt} />
                  {n.body ? <p className="text-[14px] text-muted">{n.body}</p> : null}
                  <p className="font-mono text-[12px] text-muted">{formatDateTime(n.createdAt, me.timezone)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
