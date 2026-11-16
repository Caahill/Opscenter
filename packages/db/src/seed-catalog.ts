import type { PrismaClient } from '@prisma/client';
import { PACKAGES, PIPELINES } from './catalog';

/** Idempotent: creates the default pipeline for any department without an active one, and missing packages. */
export async function seedCatalog(prisma: PrismaClient): Promise<{ pipelines: number; packages: number }> {
  let pipelines = 0;
  for (const [department, stages] of Object.entries(PIPELINES) as Array<[keyof typeof PIPELINES, (typeof PIPELINES)[keyof typeof PIPELINES]]>) {
    if (await prisma.pipeline.findFirst({ where: { department, active: true } })) continue;
    const latest = await prisma.pipeline.findFirst({ where: { department }, orderBy: { version: 'desc' } });
    await prisma.pipeline.create({
      data: {
        department,
        version: (latest?.version ?? 0) + 1,
        stages: {
          create: stages.map((st, i) => ({
            name: st.name,
            order: i + 1,
            statusType: st.statusType,
            phase: st.phase,
            slaDays: st.slaDays ?? null,
            checklist: st.checklist ?? [],
          })),
        },
      },
    });
    pipelines++;
  }

  let packages = 0;
  for (const p of PACKAGES) {
    const exists = await prisma.package.findFirst({ where: { department: p.department, name: p.name } });
    if (exists) continue;
    await prisma.package.create({
      data: {
        department: p.department,
        name: p.name,
        setupTasks: p.setupTasks.map((t) => ({ type: 'DELIVERABLE', priority: 'NORMAL', ...t })),
        cycleTasks: p.cycleTasks.map((t) => ({ type: 'DELIVERABLE', priority: 'NORMAL', ...t })),
        monthlyHours: p.monthlyHours ?? null,
      },
    });
    packages++;
  }
  return { pipelines, packages };
}
