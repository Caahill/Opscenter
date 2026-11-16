// Phase 1F demo chat: the Demo Co SEO project channel with a message that pastes the client's
// details, stored the way the chat service stores it (scrubbed), so the masking crawler checks
// that what reaches a channel holds none of them. Invented data only. Runs once per database.
import type { PrismaClient } from '@opshub/db';
import { DEPARTMENT_LABELS, mentionToken } from '@opshub/shared';
import { scrub } from '../chat/scrub';
import { DEMO_CLIENT } from '../dev/preview-fixture';

export async function seedChatDemo(prisma: PrismaClient): Promise<boolean> {
  const project = await prisma.project.findFirst({ where: { department: 'SEO', client: { companyName: DEMO_CLIENT.companyName } }, include: { client: true } });
  const [pm, member] = await Promise.all(['pm@dev.local', 'member.seo@dev.local'].map((email) => prisma.user.findUnique({ where: { email } })));
  if (!project || !pm || !member) return false;
  const channel = await prisma.chatChannel.upsert({
    where: { projectId: project.id },
    update: {},
    create: { kind: 'PROJECT', projectId: project.id, name: `${project.client.companyName} · ${DEPARTMENT_LABELS.SEO}` },
  });
  if (await prisma.chatMessage.findFirst({ where: { channelId: channel.id } })) return false;
  const raw = [
    `${mentionToken('user', pm.id, pm.name)} the client sent new details today.`,
    'Hosting login: demoadmin / Hunter2!',
    'They want us to call Priya on +91 98200 12345 or write to priya@demo.example.com.',
    `Can you check with ${mentionToken('client', project.clientId, project.client.companyName)}?`,
  ].join('\n');
  const body = scrub(raw);
  await prisma.chatMessage.create({
    data: { channelId: channel.id, authorId: member.id, body, mentions: [{ type: 'user', id: pm.id }, { type: 'client', id: project.clientId }] },
  });
  return true;
}
