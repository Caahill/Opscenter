import type { NotificationSettingsView } from '@opshub/shared';
import { PageHeader } from '@opshub/ui';
import { api, isDevAuth } from '@/lib/api';
import { DevOutbox, NotificationPreferences, PushDevice } from './settings-forms';

export default async function NotificationSettingsPage() {
  const settings = await api<NotificationSettingsView>('/notifications/settings');
  return (
    <>
      <PageHeader title="Notification settings" description={`Alerts always appear in Ops Hub. Choose what also reaches you by email (one digest a day at ${settings.digestTime}) and by push on your devices.`} />
      <div className="grid gap-4">
        <NotificationPreferences initial={settings.preferences} />
        <PushDevice publicKey={settings.pushPublicKey} devices={settings.pushDevices} />
        {isDevAuth() ? <DevOutbox /> : null}
      </div>
    </>
  );
}
