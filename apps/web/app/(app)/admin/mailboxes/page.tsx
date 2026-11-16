import type { InboxSettingsView, MailboxView, MeView, UserView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { api } from '@/lib/api';
import { NoAccess } from '../no-access';
import { MailboxesAdmin } from './mailboxes-admin';

/** PRD 2.1, OQ6: shared mailboxes (support@, development@) and each PM's own mailbox. */
export default async function MailboxesPage({ searchParams }: { searchParams: Promise<{ connected?: string; error?: string }> }) {
  const sp = await searchParams;
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('mailbox.manage')) return <NoAccess title="Mailboxes" />;
  const [mailboxes, users, settings] = await Promise.all([api<MailboxView[]>('/mailboxes?manage=true'), api<UserView[]>('/users'), api<InboxSettingsView>('/inbox/settings')]);
  return (
    <>
      <PageHeader
        title="Mailboxes"
        description="Connected Gmail mailboxes sync both ways. Unknown senders in a PM's own mailbox are seen only by that PM; in shared mailboxes, by all PMs."
      />
      <MailboxesAdmin
        mailboxes={mailboxes}
        pms={users.filter((u) => u.active && u.roles.includes('PM'))}
        settings={settings}
        notice={sp.connected ? 'Mailbox connected. History import has started.' : sp.error ? 'The mailbox could not be connected. Try again.' : null}
      />
    </>
  );
}
