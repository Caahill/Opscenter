// Assigned hours against available hours (PRD 3.3), as a short bar and a percentage.

export function LoadBar({ m }: { m: { utilisationPct: number | null; over: boolean; assignedH: number } }) {
  const pct = m.utilisationPct ?? (m.assignedH > 0 ? 100 : 0);
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-alt" aria-hidden>
        <div className={`h-full ${m.over ? 'bg-error' : 'bg-accent'}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`font-mono text-[13px] ${m.over ? 'font-semibold text-error' : 'text-muted'}`}>
        {m.utilisationPct === null ? (m.assignedH > 0 ? 'no hours left' : '-') : `${m.utilisationPct}%`}
      </span>
    </div>
  );
}
