import type { ProjectView, TaskView } from '@opshub/shared';
import { Card } from '@opshub/ui';
import Link from 'next/link';

interface Entry {
  href: string;
  text: string;
  kind: 'task' | 'renewal' | 'end';
}

/** Month view: open tasks by due date, plus project end and renewal dates. Weeks start Monday. */
export function BoardCalendar({
  month,
  projects,
  tasks,
  prevHref,
  nextHref,
}: {
  month: string;
  projects: ProjectView[];
  tasks: TaskView[];
  prevHref: string;
  nextHref: string;
}) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  const byDay = new Map<string, Entry[]>();
  const add = (date: string | null | undefined, e: Entry) => {
    if (!date || date.slice(0, 7) !== month) return;
    const key = date.slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  };
  for (const t of tasks) add(t.dueDate, { href: `/tasks/${t.id}`, text: `${t.title} · ${t.clientName}`, kind: 'task' });
  for (const p of projects) {
    add(p.renewalDate, { href: `/projects/${p.id}`, text: `Renewal: ${p.clientName}`, kind: 'renewal' });
    if (p.endDate !== p.renewalDate) add(p.endDate, { href: `/projects/${p.id}`, text: `Ends: ${p.clientName}`, kind: 'end' });
  }
  const title = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)] as Array<number | null>;

  return (
    <Card className="p-0">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link href={prevHref} className="text-link">
          Previous
        </Link>
        <h2 className="font-display text-[18px] font-[650]">{title}</h2>
        <Link href={nextHref} className="text-link">
          Next
        </Link>
      </header>
      <div className="grid grid-cols-7 border-b border-border font-mono text-[11px] uppercase text-muted">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="px-2 py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, i) => {
          const key = day ? `${month}-${String(day).padStart(2, '0')}` : `blank-${i}`;
          const entries = day ? (byDay.get(key) ?? []) : [];
          return (
            <div key={key} className="min-h-24 border-b border-r border-surface-alt p-1 text-[12px]">
              {day ? <p className="font-mono text-muted">{day}</p> : null}
              {entries.slice(0, 4).map((e, j) => (
                <Link
                  key={j}
                  href={e.href}
                  className={`mt-1 block truncate rounded-sm px-1 ${e.kind === 'task' ? 'bg-pale-blue' : e.kind === 'renewal' ? 'bg-pale-orange' : 'bg-surface-alt'}`}
                  title={e.text}
                >
                  {e.text}
                </Link>
              ))}
              {entries.length > 4 ? <p className="mt-1 text-muted">+{entries.length - 4} more</p> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
