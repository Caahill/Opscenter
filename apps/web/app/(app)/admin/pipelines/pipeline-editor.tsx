'use client';
import { STATUS_LABELS, STATUS_TYPES, type PipelineView, type StatusType } from '@opshub/shared';
import { Button, Card, Chip, inputClass } from '@opshub/ui';
import { useState } from 'react';
import { StatusChip } from '@/lib/chips';
import { send, useAction } from '@/lib/client';
import { plural } from '@/lib/format';

interface Row {
  name: string;
  statusType: StatusType;
  phase: 'SETUP' | 'CYCLE';
  slaDays: string;
  checklist: string;
}

const toRows = (p: PipelineView): Row[] =>
  p.stages.map((s) => ({
    name: s.name,
    statusType: s.statusType,
    phase: s.phase,
    slaDays: s.slaDays ? String(s.slaDays) : '',
    checklist: s.checklist.map((c) => c.text).join('; '),
  }));

export function PipelineEditor({ pipeline, title }: { pipeline: PipelineView; title: string }) {
  const { run, error, busy } = useAction();
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => toRows(pipeline));
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const swap = (i: number, j: number) =>
    setRows((r) => {
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  async function save() {
    const ok = await run(() =>
      send('POST', '/pipelines', {
        department: pipeline.department,
        stages: rows.map((r) => ({
          name: r.name,
          statusType: r.statusType,
          phase: r.phase,
          slaDays: r.slaDays ? Number(r.slaDays) : null,
          checklist: r.checklist
            .split(';')
            .map((t) => t.trim())
            .filter(Boolean)
            .map((text) => ({ text })),
        })),
      }),
    );
    if (ok) setEditing(false);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-[18px] font-[650]">{title}</h2>
          <Chip tone="muted">v{pipeline.version}</Chip>
          <Chip tone="muted">{plural(pipeline.projectCount, 'project')}</Chip>
        </div>
        {!editing ? (
          <Button variant="tertiary" onClick={() => setEditing(true)}>
            Edit stages
          </Button>
        ) : null}
      </div>

      {!editing ? (
        <ol className="mt-3 flex flex-wrap gap-2">
          {pipeline.stages.map((s) => (
            <li key={s.id} className="flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[13px]">
              {s.name}
              {s.statusType !== 'ACTIVE' ? <StatusChip status={s.statusType} /> : null}
              {s.phase === 'CYCLE' ? <Chip tone="accent">monthly</Chip> : null}
              {s.slaDays ? <span className="font-mono text-[11px] text-muted">{s.slaDays}d</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-border p-2 md:grid-cols-[auto_1fr_160px_110px_80px_1fr_auto]">
              <div className="flex flex-col">
                <button type="button" className="text-[12px] text-muted" onClick={() => swap(i, i - 1)} aria-label="Move up">
                  Up
                </button>
                <button type="button" className="text-[12px] text-muted" onClick={() => swap(i, i + 1)} aria-label="Move down">
                  Down
                </button>
              </div>
              <input className={inputClass} value={r.name} onChange={(e) => set(i, { name: e.target.value })} aria-label="Stage name" />
              <select className={inputClass} value={r.statusType} onChange={(e) => set(i, { statusType: e.target.value as StatusType })} aria-label="Status type">
                {STATUS_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <select className={inputClass} value={r.phase} onChange={(e) => set(i, { phase: e.target.value as Row['phase'] })} aria-label="Phase">
                <option value="SETUP">Setup</option>
                <option value="CYCLE">Monthly</option>
              </select>
              <input className={inputClass} inputMode="numeric" placeholder="SLA d" value={r.slaDays} onChange={(e) => set(i, { slaDays: e.target.value })} aria-label="SLA days" />
              <input className={inputClass} placeholder="Checklist items; separated by ;" value={r.checklist} onChange={(e) => set(i, { checklist: e.target.value })} aria-label="Checklist" />
              <button type="button" className="text-[13px] text-error" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="tertiary" onClick={() => setRows((r) => [...r, { name: '', statusType: 'ACTIVE', phase: 'SETUP', slaDays: '', checklist: '' }])}>
              Add stage
            </Button>
            <Button onClick={save} disabled={busy}>
              Save as v{pipeline.version + 1}
            </Button>
            <Button
              variant="tertiary"
              onClick={() => {
                setRows(toRows(pipeline));
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
          {error ? <p className="text-[14px] text-error">{error}</p> : null}
        </div>
      )}
    </Card>
  );
}
