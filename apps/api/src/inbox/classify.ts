// triage.classify (TechSpec 7.3, 8): suggest a category and action for an inbound client message.
// The classifier sees the masked subject and body plus the client's open projects and tasks only.
import type { Prisma, PrismaClient } from '@opshub/db';
import type { Classifier, TriageInput } from '@opshub/integrations';
import { OPEN_STATUS_TYPES } from '@opshub/shared';

type ClassifyResult = Awaited<ReturnType<Classifier['classify']>>;

/** Communication.triage: the suggestion, which model made it, and how the routing went. */
export interface StoredTriage {
  suggestion: ClassifyResult['suggestion'];
  model: string;
  attempts: ClassifyResult['attempts'];
  at: string;
}

export async function triageInput(prisma: PrismaClient, commId: string): Promise<TriageInput | null> {
  const c = await prisma.communication.findUnique({ where: { id: commId }, include: { client: { select: { companyName: true } } } });
  if (!c?.clientId || !c.client || c.direction !== 'INBOUND') return null;
  const projects = await prisma.project.findMany({
    where: { clientId: c.clientId, statusType: { notIn: ['DONE', 'STOPPED'] } },
    include: {
      stage: { select: { name: true } },
      package: { select: { name: true } },
      tasks: {
        where: { statusType: { in: [...OPEN_STATUS_TYPES] }, parentTaskId: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, title: true, type: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });
  return {
    channel: c.channel,
    subject: c.subjectMasked,
    bodyMasked: c.bodyMasked,
    clientName: c.client.companyName,
    projects: projects.map((p) => ({ id: p.id, department: p.department, stage: p.stage.name, packageName: p.package?.name ?? null, openTasks: p.tasks })),
  };
}

/** Idempotent: only messages still waiting for a suggestion are classified. */
export async function classifyCommunication(prisma: PrismaClient, classifier: Classifier, commId: string): Promise<'suggested' | 'skipped'> {
  const current = await prisma.communication.findUnique({ where: { id: commId }, select: { triageState: true } });
  if (current?.triageState !== 'NEW') return 'skipped';
  const input = await triageInput(prisma, commId);
  if (!input) return 'skipped';
  const result = await classifier.classify(input);
  const triage: StoredTriage = { suggestion: result.suggestion, model: result.model, attempts: result.attempts, at: new Date().toISOString() };
  const { count } = await prisma.communication.updateMany({
    where: { id: commId, triageState: 'NEW' },
    data: { triage: triage as unknown as Prisma.InputJsonValue, triageState: 'SUGGESTED', category: result.suggestion?.category ?? null },
  });
  return count ? 'suggested' : 'skipped';
}
