// cycle.generate against a real database (TechSpec 8: idempotent by projectId + cycleMonth).
import { randomBytes } from 'node:crypto';
import { PrismaClient, seedBase, seedCatalog } from '@opshub/db';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { generateCycles } from '../src/cycle-generate';

const RUN = randomBytes(4).toString('hex');
let prisma: PrismaClient;
const at = (ymd: string) => new Date(`${ymd}T01:00:00+05:30`);

async function retainer(name: string, cycleDay: number, statusType: 'ACTIVE' | 'ON_HOLD' = 'ACTIVE') {
  const pm = await prisma.user.findUniqueOrThrow({ where: { email: 'pm@dev.local' } });
  const pipeline = await prisma.pipeline.findFirstOrThrow({ where: { department: 'SEO', active: true }, include: { stages: true } });
  const cycleStage = pipeline.stages.find((s) => s.phase === 'CYCLE')!;
  const pkg = await prisma.package.findFirstOrThrow({ where: { department: 'SEO', name: { startsWith: 'SEO Standard' } } });
  const client = await prisma.client.create({ data: { companyName: `${name} ${RUN}`, market: 'IN', pmId: pm.id } });
  return prisma.project.create({
    data: {
      clientId: client.id,
      department: 'SEO',
      pipelineId: pipeline.id,
      stageId: cycleStage.id,
      statusType,
      packageId: pkg.id,
      type: 'RETAINER',
      cycleDay,
      pmId: pm.id,
      // Far-future month so the demo data and earlier runs cannot interfere.
      startDate: new Date('2026-01-01T00:00:00Z'),
    },
  });
}

const cycleTasks = (projectId: string) => prisma.task.findMany({ where: { projectId, source: 'TEMPLATE' }, orderBy: { title: 'asc' } });

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: inject('testDatabaseUrl') } } });
  await seedBase(prisma);
  await seedCatalog(prisma);
});
afterAll(() => prisma.$disconnect());

describe('cycle.generate', () => {
  it("creates the package's monthly tasks on the cycle day, once", async () => {
    const p = await retainer('Cycle', 15);
    await generateCycles(prisma, at('2031-11-14'));
    expect(await cycleTasks(p.id)).toHaveLength(0);

    await generateCycles(prisma, at('2031-11-15'));
    const tasks = await cycleTasks(p.id);
    expect(tasks.map((t) => t.title)).toEqual(['Backlinks: 100 this month', 'Monthly report', 'Ranking report']);
    expect(tasks.every((t) => t.cycleMonth === '2031-11')).toBe(true);
    expect(tasks.find((t) => t.title === 'Monthly report')!.dueDate!.toISOString().slice(0, 10)).toBe('2031-12-13');

    const rerun = await generateCycles(prisma, at('2031-11-15'));
    expect(rerun.alreadyDone).toBeGreaterThanOrEqual(1);
    expect(await cycleTasks(p.id)).toHaveLength(3);

    await generateCycles(prisma, at('2031-12-15'));
    expect(await cycleTasks(p.id)).toHaveLength(6);
  });

  it('skips projects on hold', async () => {
    const p = await retainer('Paused', 16, 'ON_HOLD');
    await generateCycles(prisma, at('2031-11-16'));
    expect(await cycleTasks(p.id)).toHaveLength(0);
  });

  it('runs a day-31 cycle on the last day of shorter months', async () => {
    const p = await retainer('Monthend', 31);
    await generateCycles(prisma, at('2031-11-30'));
    expect(await cycleTasks(p.id)).toHaveLength(3);
    expect((await prisma.projectCycle.findMany({ where: { projectId: p.id } })).map((c) => c.cycleMonth)).toEqual(['2031-11']);
  });
});
