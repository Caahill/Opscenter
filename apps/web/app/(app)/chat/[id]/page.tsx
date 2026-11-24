import type { ChatHistoryView, UserView } from '@opshub/shared';
import { buttonVariants, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { GroupSettings } from '../group-dialogs';
import { ChatRoom } from './chat-room';

const KIND_LABEL = { DIRECT: 'Direct message', GROUP: 'Group', TEAM: 'Team channel', PROJECT: 'Project channel' } as const;

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, history] = await Promise.all([getMe(), api<ChatHistoryView>(`/chat/channels/${id}/messages`)]);
  const c = history.channel;
  const users = c.kind === 'GROUP' ? await api<UserView[]>('/users') : [];
  const colleagues = users.filter((u) => u.active).map((u) => ({ id: u.id, name: u.name }));
  return (
    <>
      <PageHeader
        title={c.name}
        description={
          <>
            {KIND_LABEL[c.kind]} · {c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}
            {c.projectId ? (
              <>
                {' · '}
                <Link href={`/projects/${c.projectId}`} className="text-link">
                  Open project
                </Link>
              </>
            ) : null}
          </>
        }
        actions={
          <>
            {c.kind === 'GROUP' ? <GroupSettings key={`${c.name}:${c.memberCount}`} channel={c} colleagues={colleagues} meId={me.id} /> : null}
            <Link href="/chat" className={buttonVariants({ variant: 'ghost' })}>
              All chats
            </Link>
          </>
        }
      />
      <ChatRoom key={id} initial={history} meId={me.id} timezone={me.timezone} />
    </>
  );
}
