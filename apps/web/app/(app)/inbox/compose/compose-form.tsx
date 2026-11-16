'use client';
import { EMAIL_TEMPLATES, type ClientView, type ContactView, type MailboxView, type MeView, type ProjectView, type SendResultView } from '@opshub/shared';
import { Button, Card, inputClass, Label } from '@opshub/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { getJson, sendForm, useAction } from '@/lib/client';
import { threadHref } from '../thread-row';

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date());

export function ComposeForm({ clients, mailboxes, templates, initialClientId, me }: { clients: ClientView[]; mailboxes: MailboxView[]; templates: Array<{ name: string; language: string }>; initialClientId: string; me: MeView }) {
  const router = useRouter();
  const { run, error, busy } = useAction();
  const [clientId, setClientId] = useState(initialClientId);
  const [contacts, setContacts] = useState<ContactView[]>([]);
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [form, setForm] = useState({ channel: 'EMAIL' as 'EMAIL' | 'WHATSAPP', mailboxId: mailboxes[0]?.id ?? '', to: [] as string[], cc: [] as string[], projectId: '', subject: '', body: '', template: '' });
  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    setContacts([]);
    setProjects([]);
    if (!clientId) return;
    void getJson<ContactView[]>(`/clients/${clientId}/contacts`).then(setContacts).catch(() => setContacts([]));
    void getJson<ProjectView[]>(`/projects?clientId=${clientId}`).then(setProjects).catch(() => setProjects([]));
  }, [clientId]);

  const client = clients.find((c) => c.id === clientId);
  function applyTemplate(key: string) {
    const t = EMAIL_TEMPLATES.find((x) => x.key === key);
    if (!t) return;
    const project = projects.find((p) => p.id === form.projectId) ?? projects[0];
    const fill = (s: string) =>
      s
        .replaceAll('{client}', client?.companyName ?? 'there')
        .replaceAll('{project}', project ? `${project.packageName ?? project.department ?? 'your project'}` : 'your project')
        .replaceAll('{pm}', client?.pmName ?? me.name)
        .replaceAll('{month}', MONTH);
    setForm({ ...form, subject: fill(t.subject), body: fill(t.body) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = templates.find((x) => `${x.name}:${x.language}` === form.template);
    const res = await run(() =>
      sendForm<SendResultView>(
        '/inbox/send',
        {
          channel: form.channel,
          mode: 'NEW',
          clientId,
          contactIds: form.to,
          ccContactIds: form.channel === 'EMAIL' ? form.cc : [],
          mailboxId: form.channel === 'EMAIL' ? form.mailboxId : undefined,
          subject: form.channel === 'EMAIL' ? form.subject : undefined,
          body: form.body,
          projectId: form.projectId || null,
          ...(t ? { template: { name: t.name, language: t.language, params: [] } } : {}),
        },
        form.channel === 'EMAIL' ? files : [],
      ),
    );
    if (res) router.push(threadHref(res.message.threadKey));
  }

  const toggle = (list: string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));
  const reachable = contacts.filter((c) => (form.channel === 'EMAIL' ? c.email !== null : c.phone !== null));

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3" aria-label="New message">
        <div className="grid gap-2 md:grid-cols-3">
          <select className={inputClass} aria-label="Client" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Choose a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </select>
          <select className={inputClass} aria-label="Channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value as 'EMAIL' | 'WHATSAPP', to: [], cc: [] })}>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          {form.channel === 'EMAIL' ? (
            <select className={inputClass} aria-label="Send from" value={form.mailboxId} onChange={(e) => setForm({ ...form, mailboxId: e.target.value })}>
              {mailboxes.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label || m.address}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div>
          <Label>To</Label>
          <div className="mt-1 flex flex-wrap gap-3">
            {reachable.map((c) => (
              <label key={c.id} className="flex items-center gap-1 text-[14px]">
                <input type={form.channel === 'EMAIL' ? 'checkbox' : 'radio'} name="to" checked={form.to.includes(c.id)} onChange={(e) => setForm({ ...form, to: form.channel === 'EMAIL' ? toggle(form.to, c.id, e.target.checked) : [c.id] })} />
                {c.label}
              </label>
            ))}
            {clientId && !reachable.length ? <span className="text-[14px] text-muted">No contacts with {form.channel === 'EMAIL' ? 'an email address' : 'a WhatsApp number'}. The PM adds them on the client page.</span> : null}
          </div>
        </div>
        {form.channel === 'EMAIL' && reachable.length > 1 ? (
          <div>
            <Label>Cc</Label>
            <div className="mt-1 flex flex-wrap gap-3">
              {reachable
                .filter((c) => !form.to.includes(c.id))
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-1 text-[14px]">
                    <input type="checkbox" checked={form.cc.includes(c.id)} onChange={(e) => setForm({ ...form, cc: toggle(form.cc, c.id, e.target.checked) })} />
                    {c.label}
                  </label>
                ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 md:grid-cols-2">
          <select className={inputClass} aria-label="Project" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.packageName ?? p.department}
              </option>
            ))}
          </select>
          {form.channel === 'EMAIL' ? (
            <select className={inputClass} aria-label="Template" value="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">Start from a template</option>
              {EMAIL_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          ) : (
            <select className={inputClass} aria-label="WhatsApp template" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })}>
              <option value="">Free text (within 24 hours of the client writing)</option>
              {templates.map((t) => (
                <option key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`}>
                  Template: {t.name} ({t.language})
                </option>
              ))}
            </select>
          )}
        </div>
        {form.channel === 'EMAIL' ? <input className={inputClass} aria-label="Subject" placeholder="Subject" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /> : null}
        <textarea className={`${inputClass} min-h-48`} aria-label="Message" placeholder="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="flex flex-wrap items-center gap-3">
          {form.channel === 'EMAIL' ? <input type="file" multiple aria-label="Attach files" className="text-[13px]" onChange={(e) => setFiles([...(e.target.files ?? [])])} /> : null}
          <Button type="submit" disabled={busy || !clientId || !form.to.length || (!form.body.trim() && !form.template)} className="ml-auto">
            Send
          </Button>
        </div>
        {error ? <p className="text-[14px] text-error">{error}</p> : null}
      </form>
    </Card>
  );
}
