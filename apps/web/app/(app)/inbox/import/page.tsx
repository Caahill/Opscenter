import type { ClientView, MeView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import { ImportForm } from './import-form';

/** Route B (PRD 2.7): bring a client WhatsApp group into the inbox from "Export chat". */
export default async function ImportPage() {
  const me = await api<MeView>('/me');
  if (!me.permissions.includes('inbox.import')) redirect('/no-access');
  const clients = await api<ClientView[]>('/clients');
  return (
    <>
      <PageHeader
        title="Import a WhatsApp chat"
        description='In the WhatsApp group, choose More > Export chat ("Include media" for files) and upload the .txt or .zip here. Messages from the last 14 days are triaged; older ones are kept as history. Uploading a newer export later adds only the new messages.'
      />
      <ImportForm clients={clients} />
    </>
  );
}
