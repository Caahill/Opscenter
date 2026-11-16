// cycle.generate (TechSpec 8, PRD 1.4): retainers in their monthly-cycle stage get that month's
// package tasks on the cycle day. ProjectCycle's unique (projectId, cycleMonth) makes reruns safe.
import { parseTemplates, tasksFromTemplates, type PrismaClient } from '@opshub/db';
import { cycleDateFor } from '@opshub/shared';

const IST = 'Asia/Kolkata';

export function istDate(at: Date): { y: number; m: number; d: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(at)
    .split('-')
    .map(Number) as [number, number, number];
  return { y, m, d };
}

export interface CycleResult extends Record<string, unknown> {
  date: string;
  generated: number;
  alreadyDone: number;
  tasks: number;
}

/** `date` (YYYY-MM-DD) runs the job as if it were that day in IST; defaults to now. */
export async function generateCycles(prisma: PrismaClient, at: Date): Promise<CycleResult> {
  const { y, m, d } = istDate(at);
  const cycleMonth = `${y}-${String(m).padStart(2, '0')}`;
  const projects = await prisma.project.findMany({
    where: {
      type: { in: ['RETAINER', 'AMC'] },
      // On hold pauses the retainer; stopped and finished projects are closed.
      statusType: { notIn: ['STOPPED', 'DONE', 'ON_HOLD'] },
      stage: { phase: 'CYCLE' },
      packageId: { not: null },
      cycleDay: { not: null },
    },
    include: { package: true },
  });

  let generated = 0;
  let alreadyDone = 0;
  let tasks = 0;
  for (const p of projects) {
    const cycleStart = cycleDateFor(y, m - 1, p.cycleDay!);
    if (cycleStart.getUTCDate() !== d || !p.package) continue;
    const templates = tasksFromTemplates(parseTemplates(p.package.cycleTasks), {
      projectId: p.id,
      teamId: p.teamId,
      from: cycleStart,
      cycleMonth,
      createdById: null,
    });
    try {
      await prisma.$transaction(async (tx) => {
        await tx.projectCycle.create({ data: { projectId: p.id, cycleMonth } });
        if (templates.length) await tx.task.createMany({ data: templates });
        await tx.activityLog.create({
          data: { kind: 'CYCLE_GENERATED', actorId: null, projectId: p.id, to: { cycleMonth, tasks: templates.length } },
        });
      });
      generated++;
      tasks += templates.length;
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') alreadyDone++;
      else throw err;
    }
  }
  return { date: `${cycleMonth}-${String(d).padStart(2, '0')}`, generated, alreadyDone, tasks };
}
