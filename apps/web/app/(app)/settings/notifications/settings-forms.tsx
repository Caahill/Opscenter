'use client';
import type { NotificationPreferenceView } from '@opshub/shared';
import { Button, Card, Label } from '@opshub/ui';
import { useEffect, useState } from 'react';
import { getJson, send, useAction } from '@/lib/client';

export function NotificationPreferences({ initial }: { initial: NotificationPreferenceView[] }) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(false);
  const { run, busy, error } = useAction();
  const toggle = (category: string, key: 'email' | 'push') => {
    setSaved(false);
    setPrefs((list) => list.map((p) => (p.category === category ? { ...p, [key]: !p[key] } : p)));
  };
  async function save() {
    const out = await run(() => send('PUT', '/notifications/settings', { preferences: prefs.map(({ category, email, push }) => ({ category, email, push })) }));
    if (out) setSaved(true);
  }
  return (
    <Card>
      <Label>What reaches you</Label>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] text-[15px]">
          <thead>
            <tr className="text-left font-mono text-[12px] uppercase text-muted">
              <th className="py-2 font-normal">Alert</th>
              <th className="w-24 py-2 text-center font-normal">In app</th>
              <th className="w-24 py-2 text-center font-normal">Email</th>
              <th className="w-24 py-2 text-center font-normal">Push</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-alt">
            {prefs.map((p) => (
              <tr key={p.category} data-testid={`pref-${p.category}`}>
                <td className="py-2">{p.label}</td>
                <td className="py-2 text-center">
                  <input type="checkbox" checked disabled aria-label={`${p.label}: in app (always on)`} />
                </td>
                <td className="py-2 text-center">
                  <input type="checkbox" checked={p.email} onChange={() => toggle(p.category, 'email')} aria-label={`${p.label}: email`} />
                </td>
                <td className="py-2 text-center">
                  <input type="checkbox" checked={p.push} onChange={() => toggle(p.category, 'push')} aria-label={`${p.label}: push`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          Save
        </Button>
        {saved ? <span className="text-[14px] text-success">Saved</span> : null}
        {error ? <span className="text-[14px] text-error">{error}</span> : null}
      </div>
    </Card>
  );
}

const keyBytes = (base64url: string) => {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
};

type PushState = 'unsupported' | 'blocked' | 'off' | 'on' | 'checking';

export function PushDevice({ publicKey, devices }: { publicKey: string | null; devices: number }) {
  const [state, setState] = useState<PushState>('checking');
  const [note, setNote] = useState<string | null>(null);
  const { run, busy, error } = useAction();

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !publicKey) return setState('unsupported');
      if (Notification.permission === 'denied') return setState('blocked');
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      setState((await reg?.pushManager.getSubscription()) ? 'on' : 'off');
    })().catch(() => setState('unsupported'));
  }, [publicKey]);

  async function turnOn() {
    await run(async () => {
      const reg = await navigator.serviceWorker.register('/sw.js');
      if ((await Notification.requestPermission()) !== 'granted') {
        setState('blocked');
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await send('POST', '/notifications/push-subscriptions', { endpoint: json.endpoint, keys: json.keys });
      setState('on');
    });
  }

  async function turnOff() {
    await run(async () => {
      const sub = await (await navigator.serviceWorker.getRegistration('/sw.js'))?.pushManager.getSubscription();
      if (sub) {
        await send('DELETE', '/notifications/push-subscriptions', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState('off');
    });
  }

  async function test() {
    const out = await run(() => send('POST', '/notifications/test'));
    if (out) setNote('Test sent. It shows in Alerts now, and as a push on every device that has push turned on.');
  }

  return (
    <Card>
      <Label>Push on this device</Label>
      <p className="mt-2 text-[15px]">
        {state === 'checking' && 'Checking this browser...'}
        {state === 'unsupported' && 'This browser cannot receive push from Ops Hub.'}
        {state === 'blocked' && 'Notifications are blocked for Ops Hub in this browser. Allow them in the browser settings, then come back.'}
        {state === 'off' && 'Push is off on this device.'}
        {state === 'on' && 'Push is on for this device.'}
      </p>
      <p className="mt-1 text-[13px] text-muted">
        {devices} {devices === 1 ? 'device has' : 'devices have'} push turned on for you.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {state === 'off' ? (
          <Button onClick={turnOn} disabled={busy}>
            Turn on push
          </Button>
        ) : null}
        {state === 'on' ? (
          <Button variant="secondary" onClick={turnOff} disabled={busy}>
            Turn off on this device
          </Button>
        ) : null}
        <Button variant="tertiary" onClick={test} disabled={busy}>
          Send me a test
        </Button>
      </div>
      {note ? <p className="mt-2 text-[14px] text-success">{note}</p> : null}
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
    </Card>
  );
}

interface Outbox {
  mode: string;
  items: Array<{ subject: string; text: string; sentAt: string }>;
  sent: number | null;
}

/** Dev only: the digest emails written to .local-mail, so they can be read without SMTP. */
export function DevOutbox() {
  const [box, setBox] = useState<Outbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getJson<Outbox>('/dev/mail').then(setBox, (e: Error) => setError(e.message));
  }, []);
  async function digest() {
    setError(null);
    try {
      setBox(await send<Outbox>('POST', '/dev/mail/digest'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the digest');
    }
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label>Local outbox (dev)</Label>
        <Button variant="secondary" onClick={digest}>
          Send the digest now
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-muted">Digest emails written to .local-mail for you. In production they go out over SMTP at 18:30 IST.</p>
      {box?.sent !== null && box?.sent !== undefined ? <p className="mt-2 text-[14px]">Digest sent to {box.sent} {box.sent === 1 ? 'person' : 'people'}.</p> : null}
      {error ? <p className="mt-2 text-[14px] text-error">{error}</p> : null}
      {box && box.items.length === 0 ? <p className="mt-3 text-[14px] text-muted">No emails for you yet.</p> : null}
      <ul className="mt-3 space-y-3">
        {box?.items.map((m) => (
          <li key={m.sentAt + m.subject} className="rounded-lg border border-border p-3" data-testid="outbox-mail">
            <p className="font-semibold">{m.subject}</p>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-[14px] text-muted">{m.text}</pre>
          </li>
        ))}
      </ul>
    </Card>
  );
}
