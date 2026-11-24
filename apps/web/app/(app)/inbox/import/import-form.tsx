'use client';
import type { ClientView, ImportResultView, ProjectView } from '@opshub/shared';
import { Button, Card, NativeSelect } from '@opshub/ui';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { getJson, sendForm, useAction } from '@/lib/client';
import { threadHref } from '../thread-row';

export function ImportForm({ clients }: { clients: ClientView[] }) {
  const { run, error, busy } = useAction();
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dateOrder, setDateOrder] = useState('');
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResultView | null>(null);

  useEffect(() => {
    setProjects([]);
    if (clientId) void getJson<ProjectView[]>(`/projects?clientId=${clientId}`).then(setProjects).catch(() => setProjects([]));
  }, [clientId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    const r = await run(() => sendForm<ImportResultView>('/whatsapp/imports', { clientId, projectId: projectId || null, dateOrder: dateOrder || undefined }, [file], 'file'));
    if (r) setResult(r);
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-2" aria-label="Import a WhatsApp chat">
        <NativeSelect aria-label="Client" required value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">Which client is this chat with?</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">No particular project</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.packageName ?? p.department}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Date format" value={dateOrder} onChange={(e) => setDateOrder(e.target.value)}>
          <option value="">Detect the date format</option>
          <option value="DMY">Day first (31/12/2026)</option>
          <option value="MDY">Month first (12/31/2026)</option>
        </NativeSelect>
        <input type="file" accept=".txt,.zip" aria-label="Chat export" required className="text-[14px]" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div className="md:col-span-2">
          <Button type="submit" disabled={busy || !clientId || !file}>
            Import
          </Button>
        </div>
        {error ? <p className="text-[14px] text-error md:col-span-2">{error}</p> : null}
      </form>
      {result ? (
        <p role="status" className="mt-4 text-[15px]">
          {result.chatName}: {result.messages} new messages
          {result.duplicates ? `, ${result.duplicates} already imported` : ''}
          {result.media ? `, ${result.media} files` : ''}.{' '}
          {result.threadKey ? (
            <Link href={threadHref(result.threadKey)} className="text-link">
              Open the chat
            </Link>
          ) : null}
        </p>
      ) : null}
    </Card>
  );
}
