import type { ChatChannelView, NotificationListView } from '@opshub/shared';
import type { ReactNode } from 'react';
import { api, getMe, isDevAuth, realtimeUrl } from '@/lib/api';
import { RealtimeProvider } from '@/lib/realtime';
import { Shell } from './shell';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const [me, alerts, channels] = await Promise.all([getMe(), api<NotificationListView>('/notifications?unread=true'), api<ChatChannelView[]>('/chat/channels')]);
  return (
    <RealtimeProvider url={realtimeUrl()}>
      <Shell me={me} devAuth={isDevAuth()} unread={alerts.unread} chatUnread={channels.reduce((n, c) => n + c.unread, 0)}>
        {children}
      </Shell>
    </RealtimeProvider>
  );
}
