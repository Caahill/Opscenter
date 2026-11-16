import type { MeView, TaskView } from '@opshub/shared';
import { Card, Chip, PageHeader } from '@opshub/ui';
import Link from 'next/link';
import { api } from '@/lib/api';
import { TaskRow } from './task-row';

export default async function MyTasksPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: raw } = await searchParams;
  const range = raw === 'today' ? 'today' : 'week';
  const [me, tasks] = await Promise.all([api<MeView>('/me'), api<TaskView[]>(`/me/tasks?range=${range}`)]);

  return (
    <>
      <PageHeader title="My tasks" description="Sorted by priority, then due date. Change status or progress right here." />
      <div className="mb-4 flex gap-2">
        <Link href="/my-tasks?range=today">
          <Chip tone={range === 'today' ? 'accent' : 'neutral'}>Today</Chip>
        </Link>
        <Link href="/my-tasks?range=week">
          <Chip tone={range === 'week' ? 'accent' : 'neutral'}>This week</Chip>
        </Link>
      </div>
      <Card className="p-0">
        {tasks.length === 0 ? (
          <p className="px-4 py-8 text-center text-muted">Nothing due {range === 'today' ? 'today' : 'this week'}.</p>
        ) : (
          <ul className="divide-y divide-surface-alt">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} timezone={me.timezone} />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
