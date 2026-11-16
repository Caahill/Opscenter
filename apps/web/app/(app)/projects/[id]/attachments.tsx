'use client';
import type { AttachmentView } from '@opshub/shared';
import { Card, Label } from '@opshub/ui';
import { upload, useAction } from '@/lib/client';
import { formatDate } from '@/lib/format';

const size = (n?: number) => (n === undefined ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

export function AttachmentList({ attachments }: { attachments: AttachmentView[] }) {
  if (attachments.length === 0) return <p className="mt-2 text-[14px] text-muted">No files yet.</p>;
  return (
    <ul className="mt-2 space-y-1 text-[14px]">
      {attachments.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2">
          <a href={`/api/v1/attachments/${a.id}`} className="text-link">
            {a.fileName}
          </a>
          <span className="font-mono text-[12px] text-muted">
            {size(a.size)}
            {a.uploadedByName ? ` · ${a.uploadedByName}` : ''}
            {a.createdAt ? ` · ${formatDate(a.createdAt)}` : ''}
            {a.source === 'HANDOFF' ? ' · from hand-off' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function UploadButton({ path }: { path: string }) {
  const { run, error, busy } = useAction();
  return (
    <div className="mt-3">
      <label className="inline-flex min-h-9 cursor-pointer items-center rounded-md border border-border px-3 text-[14px] hover:border-border-strong">
        {busy ? 'Uploading...' : 'Upload a file'}
        <input
          type="file"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void run(() => upload(path, file));
          }}
        />
      </label>
      {error ? <p className="mt-1 text-[14px] text-error">{error}</p> : null}
    </div>
  );
}

export function Attachments({ projectId, attachments, canUpload }: { projectId: string; attachments: AttachmentView[]; canUpload: boolean }) {
  return (
    <Card>
      <Label>Files</Label>
      <AttachmentList attachments={attachments} />
      {canUpload ? <UploadButton path={`/projects/${projectId}/attachments`} /> : null}
    </Card>
  );
}
