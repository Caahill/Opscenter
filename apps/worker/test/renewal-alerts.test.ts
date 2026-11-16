// renewal.alerts with time travel (Phase 1E exit criterion): runs the job "on" chosen dates
// against a project of its own and checks who is alerted, when, and that reruns add nothing.
import { randomBytes } from 'node:crypto';
import { PrismaClient, seedBase, seedCatalog } from '@opshub/db';
import { afterAll, beforeAll, describe, expect, it, inject } from 'vitest';
import { JOBS, type JobContext } from '../src/jobs';

const RUN = randomBytes(4).toString('hex');
let prisma: PrismaClient;
let projectId: string;
let pmId: string;
let accountsIds: string[];
const run = (date: string) => JOBS['renewal.alerts'].run({ prisma, now: () => new Date() } as JobContext, { arg: date });
const alerts = () => prisma.notification.findMany({ where: { kind: 'RENEWAL_DUE', dedupeKey: { startsWith: `renewal:${projectId}:` } } });

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: inject('testDatabaseUrl') } } });
  await seedBase(prisma);
  await seedCatalog(prisma);
  const pm = await prisma.user.create({ data: { email: `renewal.pm.${RUN}@dev.local`, name: `Renewal PM ${RUN}`, roles: ['PM'] } });
  pmId = pm.id;
  accountsIds = (await prisma.user.findMany({ where: { active: true, roles: { has: 'ACCOUNTS' } } })).map((u) => u.id);
  const pipeline = await prisma.pipeline.findFirstOrThrow({ where: { department: 'AMC', active: true }, include: { stages: true } });
  const client = await prisma.client.create({ data: { companyName: `Renewal Co ${RUN}`, market: 'IN', pmId } });
  const project = await prisma.project.create({
    data: { clientId: client.id, department: 'AMC', pipelineId: pipeline.id, stageId: pipeline.stages[0]!.id, type: 'AMC', pmId, startDate: new Date('2032-07-01T00:00:00Z'), endDate: new Date('2033-06-30T00:00:00Z') },
  });
  projectId = project.id;
});
afterAll(() => prisma.$disconnect());

describe('renewal.alerts', () => {
  it('stays quiet more than 30 days out', async () => {
    await run('2033-05-30');
    expect(await alerts()).toEqual([]);
  });

  it('alerts the PM and Accounts 30 days out, once', async () => {
    await run('2033-05-31');
    await run('2033-06-01');
    const rows = await alerts();
    expect(rows.map((r) => r.userId).sort()).toEqual([pmId, ...accountsIds].sort());
    expect(rows.every((r) => r.dedupeKey!.endsWith(':30'))).toBe(true);
    expect(rows.find((r) => r.userId === pmId)!.title).toBe(`Renewal Co ${RUN} · AMC ends in 30 days (30 Jun 2033)`);
  });

  it('alerts again at 7 days, and catches up if a day was missed', async () => {
    await run('2033-06-25'); // 5 days left: the 7-day run on the 23rd was missed
    await run('2033-06-26');
    const seven = (await alerts()).filter((r) => r.dedupeKey!.endsWith(':7'));
    expect(seven).toHaveLength(1 + accountsIds.length);
    expect(seven[0]!.title).toContain('ends in 5 days');
  });

  it('a renewed term starts over, and closed projects are left alone', async () => {
    await prisma.project.update({ where: { id: projectId }, data: { endDate: new Date('2034-06-30T00:00:00Z') } });
    await run('2033-06-28');
    expect((await alerts()).filter((r) => r.dedupeKey!.includes('2034-06-30'))).toEqual([]);
    await run('2034-05-31');
    expect((await alerts()).filter((r) => r.dedupeKey!.includes('2034-06-30'))).toHaveLength(1 + accountsIds.length);
    await prisma.project.update({ where: { id: projectId }, data: { statusType: 'DONE', endDate: new Date('2035-06-30T00:00:00Z') } });
    await run('2035-06-25');
    expect((await alerts()).filter((r) => r.dedupeKey!.includes('2035-06-30'))).toEqual([]);
  });
});
