// Demo clients for local checks and API tests (QuickStart 5). Invented companies only
// (AGENTS.md rule 9); Demo Co reuses the policy preview's fake contacts so the masking crawler
// can search real endpoints for them.
import { randomUUID } from 'node:crypto';
import { notifyLeaveImpact, type Department, type PrismaClient } from '@opshub/db';
import { DEFAULT_TIMEZONE, MARKET_CALLING_CODES, OPEN_STATUS_TYPES, todayIn } from '@opshub/shared';
import type { CryptoService } from '../crypto/crypto.service';
import { DEMO_CLIENT, DEMO_CONTACTS, DEMO_LEAVE } from '../dev/preview-fixture';
import { seedChatDemo } from './chat-demo';
import { createProject, ensureStageChecklist } from '../projects/project-factory';
import { seedBillingDemo } from './billing-demo';
import { seedInboxDemo } from './inbox-demo';

interface DemoProject {
  department: Department;
  packageName: string;
  stage: string;
  startDate: string;
  endDate?: string;
  renewalDate?: string;
  value?: string;
}

interface DemoClient {
  companyName: string;
  website: string;
  market: string;
  pmEmail: string;
  emailDomains: string[];
  taxId?: string;
  contractValue?: string;
  contacts: Array<{ role: string; label: string; name: string; email: string; phone: string }>;
  projects: DemoProject[];
  credential?: { system: string; label: string; username: string; password: string };
}

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export const DEMO_CLIENTS: DemoClient[] = [
  {
    companyName: DEMO_CLIENT.companyName,
    website: DEMO_CLIENT.website,
    market: 'IN',
    pmEmail: 'pm@dev.local',
    emailDomains: ['demo.example.com'],
    taxId: DEMO_CLIENT.taxId,
    contractValue: DEMO_CLIENT.contractValue,
    contacts: DEMO_CONTACTS.map((c) => ({ ...c })),
    projects: [
      { department: 'SEO', packageName: 'SEO Standard (30 keywords, 100 backlinks a month)', stage: 'On-page creation', startDate: isoDay(-40), value: '45000.00' },
      { department: 'GOOGLE_ADS', packageName: 'Google Ads Standard', stage: 'Strategy call', startDate: isoDay(-6), value: '30000.00' },
      { department: 'AMC', packageName: 'AMC 10 hours a month', stage: 'Active', startDate: isoDay(-330), endDate: isoDay(35), renewalDate: isoDay(35), value: '60000.00' },
    ],
    credential: { system: 'HOSTING', label: 'Demo Co hosting panel', username: 'demoadmin', password: 'Hunter2!' },
  },
  {
    companyName: 'Example Pty Ltd',
    website: 'example.com.au',
    market: 'AU',
    pmEmail: 'pm2@dev.local',
    emailDomains: ['example.com.au'],
    contacts: [{ role: 'MARKETING', label: 'Marketing contact', name: 'Olivia Example', email: 'olivia@example.com.au', phone: '+61 412 345 678' }],
    projects: [
      { department: 'WEB_DEV', packageName: 'Website build', stage: 'Development', startDate: isoDay(-20) },
      { department: 'SOCIAL_MEDIA', packageName: 'Social 12 posts a month', stage: 'Monthly cycle', startDate: isoDay(-60) },
    ],
  },
  {
    companyName: 'Sample Trading LLC',
    website: 'sampletrading.example',
    market: 'AE',
    pmEmail: 'pm@dev.local',
    emailDomains: ['sampletrading.example'],
    contacts: [{ role: 'DECISION_MAKER', label: 'Decision maker', name: 'Omar Sample', email: 'omar@sampletrading.example', phone: '+971 50 111 2233' }],
    projects: [{ department: 'ONBOARDING', packageName: 'Client onboarding', stage: 'Kickoff call done', startDate: isoDay(-3) }],
  },
];

/** Idempotent per company name; the Phase 1C leave demo runs once per database. */
export async function seedDemo(prisma: PrismaClient, crypto: CryptoService): Promise<{ clients: number; leave: boolean; inbox: boolean; billing: boolean; chat: boolean }> {
  const member = await prisma.user.findUnique({ where: { email: 'member.seo@dev.local' } });
  let created = 0;
  for (const dc of DEMO_CLIENTS) {
    if (await prisma.client.findFirst({ where: { companyName: dc.companyName } })) continue;
    const pm = await prisma.user.findUniqueOrThrow({ where: { email: dc.pmEmail } });
    const clientId = randomUUID();
    await prisma.client.create({
      data: {
        id: clientId,
        companyName: dc.companyName,
        website: dc.website,
        market: dc.market,
        pmId: pm.id,
        emailDomains: dc.emailDomains,
        taxIdEnc: dc.taxId ? (await crypto.encrypt(dc.taxId, 'pii', `client:${clientId}`)).ciphertext : null,
        contractValue: dc.contractValue ?? null,
      },
    });
    for (const c of dc.contacts) {
      const id = randomUUID();
      const seal = async (v: string) => (await crypto.encrypt(v, 'pii', `contact:${id}`)).ciphertext;
      await prisma.contact.create({
        data: {
          id,
          clientId,
          role: c.role,
          label: c.label,
          nameEnc: await seal(c.name),
          emailEnc: await seal(c.email),
          phoneEnc: await seal(c.phone),
          emailHash: crypto.hash('email', c.email),
          phoneHash: crypto.hash('phone', c.phone, MARKET_CALLING_CODES[dc.market]),
          keyId: crypto.keyIdFor('pii'),
        },
      });
    }
    if (dc.credential) {
      const id = randomUUID();
      const sealed = await crypto.encrypt(JSON.stringify({ username: dc.credential.username, password: dc.credential.password }), 'vault', `credential:${id}`);
      await prisma.credential.create({
        data: { id, clientId, system: dc.credential.system, label: dc.credential.label, secretEnc: sealed.ciphertext, keyId: sealed.keyId },
      });
    }

    for (const dp of dc.projects) {
      const pkg = await prisma.package.findFirst({ where: { department: dp.department, name: dp.packageName } });
      const project = await prisma.$transaction((tx) =>
        createProject(tx, pm.id, {
          clientId,
          department: dp.department,
          pmId: pm.id,
          packageId: pkg?.id ?? null,
          startDate: new Date(`${dp.startDate}T00:00:00.000Z`),
          endDate: dp.endDate ? new Date(`${dp.endDate}T00:00:00.000Z`) : null,
          renewalDate: dp.renewalDate ? new Date(`${dp.renewalDate}T00:00:00.000Z`) : null,
          value: dp.value ?? null,
        }),
      );
      const stage = await prisma.stage.findFirstOrThrow({ where: { pipelineId: project.pipelineId, name: dp.stage } });
      await prisma.$transaction(async (tx) => {
        await tx.project.update({ where: { id: project.id }, data: { stageId: stage.id, statusType: stage.statusType } });
        await ensureStageChecklist(tx, project.id, stage);
        // Setup tasks of the stages already passed are done.
        const tasks = await tx.task.findMany({ where: { projectId: project.id }, orderBy: { dueDate: 'asc' } });
        const stages = await tx.stage.findMany({ where: { pipelineId: project.pipelineId } });
        const passed = new Set(stages.filter((s) => s.order < stage.order).map((s) => s.name));
        const pkgTemplates = (pkg?.setupTasks as Array<{ title: string; stage?: string }> | undefined) ?? [];
        const doneTitles = new Set(pkgTemplates.filter((t) => t.stage && passed.has(t.stage)).map((t) => t.title));
        for (const t of tasks) {
          if (doneTitles.has(t.title)) {
            await tx.task.update({ where: { id: t.id }, data: { statusType: 'DONE', progressPct: 100, completedAt: new Date() } });
          }
        }
        // Give the SEO team member something for today and this week.
        if (dp.department === 'SEO' && member) {
          const open = tasks.filter((t) => !doneTitles.has(t.title)).slice(0, 3);
          const due = [0, 2, 5];
          for (const [i, t] of open.entries()) {
            await tx.task.update({
              where: { id: t.id },
              data: {
                assigneeId: member.id,
                statusType: i === 0 ? 'ACTIVE' : 'NOT_STARTED',
                progressPct: i === 0 ? 40 : 0,
                priority: i === 0 ? 'HIGH' : 'NORMAL',
                dueDate: new Date(`${isoDay(due[i] ?? 5)}T00:00:00.000Z`),
              },
            });
          }
        }
      });
    }
    created++;
  }
  return { clients: created, leave: await seedLeaveDemo(prisma, crypto), inbox: await seedInboxDemo(prisma, crypto), billing: await seedBillingDemo(prisma), chat: await seedChatDemo(prisma) };
}

/**
 * Phase 1C: Manoj Member is on leave later this week with SEO work due during it, Sana Member has
 * room to take it, and Tara Lead (TL) and Pavan PM get the leave impact alert. Runs once: it
 * re-dates Manoj's Demo Co tasks around today so the planner has something to rebalance.
 */
async function seedLeaveDemo(prisma: PrismaClient, crypto: CryptoService): Promise<boolean> {
  const member = await prisma.user.findUnique({ where: { email: 'member.seo@dev.local' } });
  const member2 = await prisma.user.findUnique({ where: { email: 'member2.seo@dev.local' } });
  const hr = await prisma.user.findUnique({ where: { email: 'hr@dev.local' } });
  if (!member || !member2 || !hr) return false;
  if (await prisma.leave.findFirst({ where: { userId: member.id } })) return false;

  const day = (offset: number) => new Date(`${isoDay(offset)}T00:00:00.000Z`);
  const open = { statusType: { in: [...OPEN_STATUS_TYPES] }, project: { department: 'SEO' as const, client: { companyName: DEMO_CLIENT.companyName } } };
  const mine = await prisma.task.findMany({ where: { ...open, assigneeId: member.id }, orderBy: { createdAt: 'asc' }, take: 3 });
  // 36 hours due this week; the leave takes away the last part of it, so Manoj shows over capacity.
  const plan: Array<[number, number]> = [[0, 16], [2, 12], [5, 8]];
  for (const [i, t] of mine.entries()) {
    const [due, hours] = plan[i]!;
    await prisma.task.update({ where: { id: t.id }, data: { dueDate: day(due), plannedDate: null, estimateH: hours } });
  }
  const spare = await prisma.task.findFirst({ where: { ...open, assigneeId: null }, orderBy: { createdAt: 'asc' } });
  if (spare) await prisma.task.update({ where: { id: spare.id }, data: { assigneeId: member2.id, teamId: member2.teamId, dueDate: day(1), estimateH: 4 } });

  const id = randomUUID();
  const reason = await crypto.encrypt(DEMO_LEAVE.reason, 'pii', `leave:${id}`);
  await prisma.leave.create({
    data: { id, userId: member.id, startDate: day(5), endDate: day(6), halfDay: false, kind: 'SICK', reasonEnc: reason.ciphertext, createdById: hr.id },
  });
  await notifyLeaveImpact(prisma, id, todayIn(DEFAULT_TIMEZONE));
  return true;
}
