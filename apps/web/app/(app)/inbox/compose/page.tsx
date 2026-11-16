import type { ClientView, InboxSettingsView, MailboxView, MeView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { ComposeForm } from './compose-form';

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams;
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('inbox.send')) redirect('/no-access');
  const [clients, mailboxes, settings] = await Promise.all([api<ClientView[]>('/clients'), api<MailboxView[]>('/mailboxes'), api<InboxSettingsView>('/inbox/settings')]);
  return (
    <>
      <PageHeader title="New message" description="Choose recipients by role. The address or number is filled in when the message is sent, so it never reaches your screen." />
      <ComposeForm clients={clients} mailboxes={mailboxes} templates={settings.whatsappTemplates} initialClientId={clientId ?? ''} me={me} />
    </>
  );
}
