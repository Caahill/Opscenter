'use client';
import type { BoardView, ProjectView } from '@opshub/shared';
import Link from 'next/link';
import { useState } from 'react';
import { HealthChip, StatusChip } from '@/lib/chips';
import { send, SendError, useAction } from '@/lib/client';

function ProjectCard({ p, canMove, onDragStart }: { p: ProjectView; canMove: boolean; onDragStart: () => void }) {
  return (
    <Link
      href={`/projects/${p.id}`}
      draggable={canMove}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', p.id);
        onDragStart();
      }}
      data-testid="board-card"
      className="block rounded-lg border border-border bg-canvas p-3 shadow-card hover:border-border-strong"
    >
      <p className="font-semibold leading-tight">{p.clientName}</p>
      <p className="mt-0.5 font-mono text-[12px] text-muted">{p.packageName ?? 'No package'}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {p.statusType !== 'ACTIVE' ? <StatusChip status={p.statusType} /> : null}
        <HealthChip health={p.health} />
        {p.overdueTaskCount ? <span className="font-mono text-[12px] text-error">{p.overdueTaskCount} overdue</span> : null}
      </div>
      <p className="mt-2 text-[13px] text-muted">
        {p.pmName ?? ''}
        {p.openTaskCount ? ` · ${p.openTaskCount} open tasks` : ''}
      </p>
    </Link>
  );
}

/** Board view. PMs and Admin drag a card to another column to move its stage (logged by the API). */
export function BoardColumns({ board, canMove }: { board: BoardView; canMove: boolean }) {
  const { run, error, setError } = useAction();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  async function move(projectId: string, stageId: string, stageName: string) {
    await run(async () => {
      try {
        return await send('POST', `/projects/${projectId}/move-stage`, { stageId });
      } catch (e) {
        if (e instanceof SendError && e.code === 'CHECKLIST_INCOMPLETE') {
          if (window.confirm(`${e.message}\n\nMove to "${stageName}" anyway? The override is logged.`)) {
            return send('POST', `/projects/${projectId}/move-stage`, { stageId, override: true });
          }
          setError(null);
          return undefined;
        }
        throw e;
      }
    });
  }

  return (
    <>
      {error ? <p className="mb-3 text-[14px] text-error">{error}</p> : null}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {board.columns.map((c) => (
          <section
            key={c.stageId}
            aria-label={c.stageName}
            data-testid="board-column"
            onDragOver={(e) => {
              if (!canMove || !dragging) return;
              e.preventDefault();
              setOver(c.stageId);
            }}
            onDragLeave={() => setOver((o) => (o === c.stageId ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              setOver(null);
              setDragging(null);
              const card = board.columns.flatMap((col) => col.projects).find((p) => p.id === id);
              if (id && card && card.stageId !== c.stageId) void move(id, c.stageId, c.stageName);
            }}
            className={`flex w-64 shrink-0 flex-col rounded-xl border p-2 ${over === c.stageId ? 'border-accent bg-pale-purple' : 'border-border bg-surface-alt'}`}
          >
            <header className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[14px] font-semibold">{c.stageName}</h2>
              <span className="font-mono text-[12px] text-muted">{c.projects.length}</span>
            </header>
            {c.phase === 'CYCLE' ? <p className="mb-2 px-1 font-mono text-[11px] uppercase text-muted">Monthly cycle</p> : null}
            <div className="flex flex-col gap-2">
              {c.projects.map((p) => (
                <ProjectCard key={p.id} p={p} canMove={canMove} onDragStart={() => setDragging(p.id)} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
