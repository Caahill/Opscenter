// Phase 1E demo billing: a Demo Co request for extra work (the policy preview's amount, so the
// masking crawler can look for it on real endpoints), a task flagged for the PM to confirm, a
// message from Accounts, and today's renewal alerts. Invented data only. Runs once per database.
import { sendRenewalAlerts, type PrismaClient } from '@opshub/db';
import { DEFAULT_TIMEZONE, todayIn } from '@opshub/shared';
import { DEMO_BILLING, DEMO_CLIENT } from '../dev/preview-fixture';

export async function seedBillingDemo(prisma: PrismaClient): Promise<boolean> {
  const client = await prisma.client.findFirst({ where: { companyName: DEMO_CLIENT.companyName } });
  const [pm, member, accounts] = await Promise.all(['pm@dev.local', 'member.seo@dev.local', 'accounts@dev.local'].map((email) => prisma.user.findUnique({ where: { email } })));
  if (!client || !pm || !member || !accounts) return false;
  if (await prisma.billingRequest.findFirst({ where: { clientId: client.id } })) return false;
  const seo = await prisma.project.findFirst({ where: { clientId: client.id, department: 'SEO' } });
  if (!seo) return false;

  const landing = await prisma.task.create({
    data: {
      projectId: seo.id,
      title: 'Diwali landing page (outside the package)',
      type: 'DELIVERABLE',
      assigneeId: member.id,
      teamId: member.teamId,
      estimateH: 6,
      billable: true,
      billableConfirmed: true,
      statusType: 'ACTIVE',
      createdById: pm.id,
    },
  });
  const request = await prisma.billingRequest.create({
    data: {
      clientId: client.id,
      projectId: seo.id,
      reason: 'ADDITIONAL_TASK',
      description: 'Extra landing page for the Diwali campaign, agreed with the client on the call.',
      amount: DEMO_BILLING.amount,
      currency: DEMO_BILLING.currency,
      raisedById: pm.id,
      taskIds: [landing.id],
    },
  });
  await prisma.billingMessage.create({ data: { requestId: request.id, authorId: accounts.id, body: 'Please confirm the GST rate before I raise the invoice.' } });

  // Flagged by the team, waiting for the PM to confirm or reject.
  const flagged = await prisma.task.findFirst({ where: { assigneeId: member.id, projectId: seo.id, billable: false, statusType: { notIn: ['DONE', 'STOPPED'] } }, orderBy: { createdAt: 'desc' } });
  if (flagged) await prisma.task.update({ where: { id: flagged.id }, data: { billable: true } });

  await sendRenewalAlerts(prisma, todayIn(DEFAULT_TIMEZONE));
  return true;
}
