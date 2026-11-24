import type {
  ClientView,
  ContactView,
  InboxSettingsView,
  MailboxView,
  MeView,
  ProjectView,
  TaskView,
  ThreadView,
  UserView,
} from '@opshub/shared';
import { Card, Chip, Label, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api, apiIfAllowed, isDevAuth } from '@/lib/api';
import { formatDateTime, plural } from '@/lib/format';
import { MessageCard } from '../message-card';
import { SimulateReply } from '../simulate-panel';
import { LiveThread } from './live-thread';
import { MarkRead } from './mark-read';
import { LinkForm, ReplyBox, TriageCard } from './thread-controls';

export default async function ThreadPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = await params;
  const key = decodeURIComponent(raw);
  const [me, thread] = await Promise.all([api<MeView>('/me'), api<ThreadView>(`/inbox/threads/${encodeURIComponent(key)}`)]);
  const can = (p: string) => me.permissions.includes(p);
  const clientId = thread.clientId;
  const needsTriage = thread.messages.filter((m) => m.direction === 'INBOUND' && (m.triageState === 'NEW' || m.triageState === 'SUGGESTED'));

  const [projects, users, clients, contacts, mailboxes, settings] = await Promise.all([
    clientId && can('inbox.triage') ? (apiIfAllowed<ProjectView[]>(`/projects?clientId=${clientId}`).then((p) => p ?? [])) : Promise.resolve([] as ProjectView[]),
    can('inbox.triage') && needsTriage.length ? api<UserView[]>('/users') : Promise.resolve([] as UserView[]),
    !clientId && can('inbox.link') ? api<ClientView[]>('/clients') : Promise.resolve([] as ClientView[]),
    clientId && can('inbox.send') ? (apiIfAllowed<ContactView[]>(`/clients/${clientId}/contacts`).then((c) => c ?? [])) : Promise.resolve([] as ContactView[]),
    can('inbox.send') ? api<MailboxView[]>('/mailboxes') : Promise.resolve([] as MailboxView[]),
    api<InboxSettingsView>('/inbox/settings'),
  ]);
  const openProjects = projects.filter((p) => p.statusType !== 'DONE' && p.statusType !== 'STOPPED');
  const tasksByProject: Record<string, TaskView[]> = {};
  if (needsTriage.length) {
    await Promise.all(
      openProjects.map(async (p) => {
        tasksByProject[p.id] = (await apiIfAllowed<TaskView[]>(`/tasks?projectId=${p.id}&open=true`)) ?? [];
      }),
    );
  }
  const latest = thread.messages.at(-1)!;
  const first = thread.messages[0]!;
  const lastInbound = [...thread.messages].reverse().find((m) => m.direction === 'INBOUND') ?? latest;

  return (
    <>
      <MarkRead threadKey={thread.threadKey} />
      <LiveThread threadKey={thread.threadKey} />
      <PageHeader
        title={first.subject || (thread.channel === 'WHATSAPP' ? 'WhatsApp chat' : '(no subject)')}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {clientId ? (
              <Link href={`/clients/${clientId}`} className="text-link">
                {thread.clientName}
              </Link>
            ) : (
              <Chip tone="warning">Unmatched</Chip>
            )}
            <Chip tone="muted">{thread.channel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}</Chip>
            <span className="font-mono text-[12px] text-muted">{plural(thread.messages.length, 'message')}</span>
          </span>
        }
        actions={
          <Link href="/inbox" className="inline-flex min-h-9 items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
            Back to inbox
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {thread.messages.map((m) => (
            <MessageCard key={m.id} m={m} timezone={me.timezone}>
              {can('inbox.triage') && clientId && m.direction === 'INBOUND' && (m.triageState === 'NEW' || m.triageState === 'SUGGESTED') ? (
                <TriageCard message={m} projects={openProjects} tasksByProject={tasksByProject} users={users.filter((u) => u.active)} />
              ) : null}
            </MessageCard>
          ))}
          {clientId && can('inbox.send') ? (
            <ReplyBox thread={thread} replyTo={lastInbound} contacts={contacts} mailboxes={mailboxes} templates={settings.whatsappTemplates} />
          ) : null}
          {isDevAuth() && thread.messages.some((m) => m.direction === 'INBOUND') && !thread.threadKey.startsWith('wa-group:') ? (
            <SimulateReply threadKey={thread.threadKey} channel={thread.channel} />
          ) : null}
        </div>

        <div className="space-y-4">
          {!clientId && can('inbox.link') ? (
            <Card>
              <Label>Link to a client</Label>
              <p className="mt-1 text-[13px] text-muted">The whole thread moves to the client. Save the sender as a contact so their next messages link on their own.</p>
              <LinkForm messageId={first.id} clients={clients} />
            </Card>
          ) : null}
          <Card>
            <Label>Thread</Label>
            <ul className="mt-2 space-y-1 text-[14px]">
              <li>
                Started {formatDateTime(first.sentAt, me.timezone)}
              </li>
              <li>Last message {formatDateTime(latest.sentAt, me.timezone)}</li>
              {latest.mailboxLabel ? <li>Mailbox: {latest.mailboxLabel}</li> : null}
              {thread.windowOpenUntil ? (
                <li>
                  {new Date(thread.windowOpenUntil) > new Date()
                    ? `Free-form WhatsApp replies until ${formatDateTime(thread.windowOpenUntil, me.timezone)}`
                    : 'More than 24 hours since the client wrote: WhatsApp replies need an approved template'}
                </li>
              ) : null}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
