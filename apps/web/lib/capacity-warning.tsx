'use client';
// PRD 3.3: assigning a task to an over-capacity member shows a warning. Advisory only; the API
// does not block the assignment.
import { isoWeekOf, todayIn, DEFAULT_TIMEZONE, type CapacityView } from '@opshub/shared';
import { useEffect, useState } from 'react';
import { getJson } from './client';

export function useCapacityWarning(assigneeId: string | null | undefined, day: string | null | undefined): string | null {
  const [warning, setWarning] = useState<string | null>(null);
  useEffect(() => {
    setWarning(null);
    if (!assigneeId) return;
    const date = day ? day.slice(0, 10) : todayIn(DEFAULT_TIMEZONE);
    const week = isoWeekOf(new Date(`${date}T00:00:00.000Z`));
    let live = true;
    getJson<CapacityView>(`/capacity?week=${week}&userId=${encodeURIComponent(assigneeId)}`)
      .then((c) => {
        const m = c.teams.flatMap((t) => t.members).find((x) => x.userId === assigneeId);
        if (!live || !m) return;
        const onLeave = m.days.find((d) => d.date === date)?.leave === 'FULL';
        if (onLeave) setWarning(`${m.name} is on leave that day.`);
        else if (m.over)
          setWarning(
            `${m.name} is over capacity in week ${Number(week.slice(6))}: ${m.assignedH}h assigned for ${m.availableH}h available${m.leaveDays ? ` (${m.leaveDays} days of leave)` : ''}.`,
          );
      })
      .catch(() => undefined); // no capacity access: no warning
    return () => {
      live = false;
    };
  }, [assigneeId, day]);
  return warning;
}

export function CapacityWarning({ assigneeId, day }: { assigneeId: string | null | undefined; day: string | null | undefined }) {
  const warning = useCapacityWarning(assigneeId, day);
  return warning ? (
    <p role="status" className="rounded-md bg-pale-orange px-3 py-2 text-[14px] text-[#8a3a12]">
      {warning} You can still assign.
    </p>
  ) : null;
}
