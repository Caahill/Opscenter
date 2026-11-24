import { ROLE_LABELS, type ChatChannelView, type ChatKind, type UserView } from '@opshub/shared';
import { Card, Label, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, getMe } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { NewGroupDialog } from './group-dialogs';
import { NewDirectMessage } from './new-direct';

const GROUPS: Array<{ kind: ChatKind; title: string; empty: string }> = [
  { kind: 'DIRECT', title: 'Direct messages', empty: 'No direct messages yet.' },
  { kind: 'GROUP', title: 'Groups', empty: 'No groups yet. Use “New group” to start one.' },
  { kind: 'PROJECT', title: 'Projects', empty: 'Project channels appear for projects you work on.' },
  { kind: 'TEAM', title: 'Teams', empty: 'You are not in a team.' },
];

export default async function ChatPage() {
  const [me, channels, users] = await Promise.all([getMe(), api<ChatChannelView[]>('/chat/channels'), api<UserView[]>('/users')]);
  const colleagues = users.filter((u) => u.active && u.id !== me.id).map((u) => ({ id: u.id, name: u.name }));
  const roleOf = (id: string) => users.find((u) => u.id === id)?.roles.map((r) => ROLE_LABELS[r]).join(', ');
  return (
    <>
      <PageHeader
        title="Chat"
        description="Direct messages, groups, your team and every project you work on. Clients are never in these channels."
        actions={
          <>
            <NewGroupDialog colleagues={colleagues.map((c) => ({ ...c, hint: roleOf(c.id) }))} />
            <NewDirectMessage colleagues={colleagues} />
          </>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {GROUPS.map((g) => {
          const list = channels.filter((c) => c.kind === g.kind);
          return (
            <Card key={g.kind} className="p-0">
              <Label className="px-4 pt-4">{g.title}</Label>
              {list.length === 0 ? (
                <p className="px-4 py-6 text-[14px] text-muted">{g.empty}</p>
              ) : (
                <ul className="mt-2 divide-y divide-surface-alt" data-testid={`channels-${g.kind.toLowerCase()}`}>
                  {list.map((c) => (
                    <li key={c.id} data-testid="channel" data-unread={c.unread ? 'true' : undefined}>
                      <Link href={`/chat/${c.id}`} className="flex gap-3 px-4 py-3 hover:bg-surface">
                        <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${c.unread ? 'bg-accent' : 'bg-transparent'}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className={`truncate ${c.unread ? 'font-bold' : 'font-medium'}`}>{c.name}</p>
                            {c.unread ? <span className="rounded-full bg-accent px-2 font-mono text-[12px] text-on-primary">{c.unread}</span> : null}
                          </div>
                          <p className="truncate text-[13px] text-muted">{c.lastMessagePreview ?? `${c.memberCount} ${c.memberCount === 1 ? 'member' : 'members'}`}</p>
                          {c.lastMessageAt ? <p className="font-mono text-[11px] text-muted">{formatDateTime(c.lastMessageAt, me.timezone)}</p> : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
