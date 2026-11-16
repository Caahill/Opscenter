'use client';
// Dev only: play a client writing in, through the same webhook paths as production.
import { Button, Card, inputClass, Label } from '@opshub/ui';
import { useState, type FormEvent } from 'react';
import { send, useAction } from '@/lib/client';

export function SimulatePanel() {
  const { run, error, busy } = useAction();
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ channel: 'EMAIL', from: 'priya@demo.example.com', subject: 'Footer update', body: 'Hi team,\nPlease change the footer phone number on the website.\nThanks', attachmentName: '' });
  async function submit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    const ok = await run(() =>
      send('POST', '/dev/inbox/simulate', {
        channel: form.channel,
        from: form.from,
        subject: form.channel === 'EMAIL' ? form.subject : undefined,
        body: form.body,
        attachmentName: form.attachmentName || undefined,
      }),
    );
    if (ok) setDone(true);
  }
  return (
    <Card className="mt-6 border-dashed">
      <Label>Dev: simulate a client message</Label>
      <p className="mt-1 text-[13px] text-muted">Goes through the verified Gmail or WhatsApp webhook path with the fake services. Try +91 98200 12345 for WhatsApp.</p>
      <form onSubmit={submit} className="mt-3 grid gap-2 md:grid-cols-2" aria-label="Simulate a client message">
        <select className={inputClass} aria-label="Channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value, from: e.target.value === 'EMAIL' ? 'priya@demo.example.com' : '+91 98200 12345' })}>
          <option value="EMAIL">Email</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <input className={inputClass} aria-label="From" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        {form.channel === 'EMAIL' ? <input className={inputClass} aria-label="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /> : null}
        {form.channel === 'EMAIL' ? <input className={inputClass} aria-label="Attachment name" placeholder="Attachment name, e.g. brief.pdf" value={form.attachmentName} onChange={(e) => setForm({ ...form, attachmentName: e.target.value })} /> : null}
        <textarea className={`${inputClass} min-h-24 md:col-span-2`} aria-label="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="flex items-center gap-3 md:col-span-2">
          <Button type="submit" variant="secondary" disabled={busy}>
            Deliver
          </Button>
          {done ? <span role="status" className="text-[14px] text-success">Delivered. It is in the list above.</span> : null}
          {error ? <span className="text-[14px] text-error">{error}</span> : null}
        </div>
      </form>
    </Card>
  );
}

/** Dev only, on a thread: the client answers from their own mail app or phone. */
export function SimulateReply({ threadKey, channel }: { threadKey: string; channel: 'EMAIL' | 'WHATSAPP' }) {
  const { run, error, busy } = useAction();
  const [body, setBody] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await run(() => send('POST', '/dev/inbox/simulate', { channel, threadKey, body }));
    if (ok) setBody('');
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-dashed border-border p-4" aria-label="Simulate the client's reply">
      <Label>Dev: simulate the client&apos;s reply</Label>
      <p className="mt-1 text-[13px] text-muted">As if the client answered from {channel === 'EMAIL' ? 'Gmail or their mail app' : 'their phone'}, through the verified webhook.</p>
      <textarea className={`${inputClass} mt-2 min-h-16`} aria-label="Client reply" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="mt-2 flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={busy || !body.trim()}>
          Deliver reply
        </Button>
        {error ? <span className="text-[14px] text-error">{error}</span> : null}
      </div>
    </form>
  );
}
