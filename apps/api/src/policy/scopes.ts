// Row scopes (TechSpec 5.2) as Prisma `where` clauses, so filtering happens in SQL (AGENTS.md
// rule 5). A viewer holding several scopes gets the union (OR).
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import type { Scope } from '@opshub/policy';
import type { AuthedViewer } from '../common/request';
import { Errors } from '../common/errors';
import { PrismaService } from '../prisma/prisma.service';

const NOTHING = { id: { in: [] as string[] } };

/**
 * Which messages a viewer reaches (PRD access matrix, client threads). One structure, rendered as
 * a Prisma where for lists and as SQL for full-text search, so both apply the same scope.
 */
export interface CommunicationScope {
  userId: string;
  /** Admin and PM: every client message, plus unmatched mail except other people's personal mailboxes. */
  all: boolean;
  /** TL: messages on the team's projects, and untriaged messages of clients the team works for. */
  projectIds: string[];
  teamClientIds: string[];
  /** Member: messages linked to their tasks. */
  taskIds: string[];
  /** Accounts: confirmed billing threads. */
  billing: boolean;
  /**
   * Email threads holding a message the rules above reach. The whole thread is visible (masked),
   * so a client's follow-up shows before anyone triages it (PRD: "threads"). WhatsApp one-to-one
   * chats are one thread per person across every topic, so they stay message by message.
   */
  threadKeys: string[];
}

@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Teams a viewer leads or belongs to (a TL may lead a team they are not a member of). */
  async teamIds(v: AuthedViewer): Promise<string[]> {
    const led = await this.prisma.team.findMany({ where: { leaderId: v.userId }, select: { id: true } });
    return [...new Set([...led.map((t) => t.id), ...(v.teamId ? [v.teamId] : [])])];
  }

  private async billingProjectIds(): Promise<string[]> {
    const rows = await this.prisma.billingRequest.findMany({ select: { projectId: true }, distinct: ['projectId'] });
    return rows.map((r) => r.projectId);
  }

  async projectWhere(v: AuthedViewer, scopes: Scope[]): Promise<Prisma.ProjectWhereInput> {
    if (scopes.includes('ALL')) return {};
    const or: Prisma.ProjectWhereInput[] = [];
    for (const s of scopes) {
      if (s === 'OWN_CLIENTS') or.push({ pmId: v.userId });
      if (s === 'OWN_TEAM') {
        const teamIds = await this.teamIds(v);
        or.push({ teamId: { in: teamIds } }, { tasks: { some: { OR: [{ teamId: { in: teamIds } }, { assigneeId: v.userId }] } } });
      }
      if (s === 'ASSIGNED') or.push({ tasks: { some: { assigneeId: v.userId } } });
      if (s === 'BILLING') or.push({ id: { in: await this.billingProjectIds() } });
    }
    return or.length ? { OR: or } : NOTHING;
  }

  async clientWhere(v: AuthedViewer, scopes: Scope[]): Promise<Prisma.ClientWhereInput> {
    if (scopes.includes('ALL')) return {};
    const or: Prisma.ClientWhereInput[] = [];
    for (const s of scopes) {
      if (s === 'OWN_CLIENTS') or.push({ pmId: v.userId });
      else or.push({ projects: { some: await this.projectWhere(v, [s]) } });
    }
    return or.length ? { OR: or } : NOTHING;
  }

  async taskWhere(v: AuthedViewer, scopes: Scope[]): Promise<Prisma.TaskWhereInput> {
    if (scopes.includes('ALL')) return {};
    const or: Prisma.TaskWhereInput[] = [];
    for (const s of scopes) {
      if (s === 'OWN_CLIENTS') or.push({ project: { pmId: v.userId } });
      if (s === 'OWN_TEAM') {
        const teamIds = await this.teamIds(v);
        or.push({ teamId: { in: teamIds } }, { project: { teamId: { in: teamIds } } }, { assigneeId: v.userId });
      }
      if (s === 'ASSIGNED') or.push({ assigneeId: v.userId });
      if (s === 'BILLING') or.push({ projectId: { in: await this.billingProjectIds() } });
    }
    return or.length ? { OR: or } : NOTHING;
  }

  credentialWhere(v: AuthedViewer, scopes: Scope[]): Prisma.CredentialWhereInput {
    if (scopes.includes('ALL')) return {};
    const or: Prisma.CredentialWhereInput[] = [];
    for (const s of scopes) {
      if (s === 'OWN_CLIENTS') or.push({ client: { pmId: v.userId } });
      if (s === 'ASSIGNED') {
        or.push({ grants: { some: { userId: v.userId, revokedAt: null, expiresAt: { gt: new Date() } } } });
      }
    }
    return or.length ? { OR: or } : NOTHING;
  }

  /** Leave rows: all (Admin, PM, HR), own team (TL), own (Member). */
  async leaveWhere(v: AuthedViewer, scopes: Scope[]): Promise<Prisma.LeaveWhereInput> {
    if (scopes.includes('ALL') || scopes.includes('PEOPLE')) return {};
    const or: Prisma.LeaveWhereInput[] = [];
    for (const s of scopes) {
      if (s === 'OWN_TEAM') or.push({ user: { teamId: { in: await this.teamIds(v) } } }, { userId: v.userId });
      if (s === 'ASSIGNED') or.push({ userId: v.userId });
    }
    return or.length ? { OR: or } : NOTHING;
  }

  /** Staff whose capacity a viewer may see: the same shape as leave. */
  async peopleWhere(v: AuthedViewer, scopes: Scope[]): Promise<Prisma.UserWhereInput> {
    if (scopes.includes('ALL') || scopes.includes('PEOPLE')) return {};
    const or: Prisma.UserWhereInput[] = [];
    for (const s of scopes) {
      if (s === 'OWN_TEAM') or.push({ teamId: { in: await this.teamIds(v) } }, { id: v.userId });
      if (s === 'ASSIGNED') or.push({ id: v.userId });
    }
    return or.length ? { OR: or } : NOTHING;
  }

  async communicationScope(v: AuthedViewer, scopes: Scope[]): Promise<CommunicationScope> {
    const out: CommunicationScope = { userId: v.userId, all: false, projectIds: [], teamClientIds: [], taskIds: [], billing: false, threadKeys: [] };
    for (const s of scopes) {
      if (s === 'ALL') out.all = true;
      if (s === 'OWN_TEAM') {
        const teamIds = await this.teamIds(v);
        const projects = await this.prisma.project.findMany({ where: await this.projectWhere(v, ['OWN_TEAM']), select: { id: true } });
        const clients = await this.prisma.project.findMany({ where: { teamId: { in: teamIds } }, select: { clientId: true }, distinct: ['clientId'] });
        out.projectIds = projects.map((p) => p.id);
        out.teamClientIds = clients.map((c) => c.clientId);
      }
      if (s === 'ASSIGNED') {
        const tasks = await this.prisma.task.findMany({ where: { assigneeId: v.userId }, select: { id: true } });
        out.taskIds = tasks.map((t) => t.id);
      }
      if (s === 'BILLING') out.billing = true;
    }
    if (!out.all) {
      const anchors = this.messageRules(out);
      if (anchors.length) {
        const rows = await this.prisma.communication.findMany({ where: { channel: 'EMAIL', OR: anchors }, select: { threadKey: true }, distinct: ['threadKey'] });
        out.threadKeys = rows.map((r) => r.threadKey);
      }
    }
    return out;
  }

  /** Per-message rules for viewers without ALL. */
  private messageRules(c: CommunicationScope): Prisma.CommunicationWhereInput[] {
    const or: Prisma.CommunicationWhereInput[] = [];
    if (c.projectIds.length) or.push({ projectId: { in: c.projectIds } });
    if (c.teamClientIds.length) or.push({ projectId: null, clientId: { in: c.teamClientIds } });
    if (c.taskIds.length) or.push({ taskId: { in: c.taskIds } });
    if (c.billing) or.push({ category: 'BILLING', triageState: 'CONFIRMED' });
    return or;
  }

  communicationWhereFrom(c: CommunicationScope): Prisma.CommunicationWhereInput {
    if (c.all) {
      // Unmatched mail in someone's personal mailbox stays with that person (PRD OQ6).
      return { OR: [{ clientId: { not: null } }, { mailboxId: null }, { mailbox: { ownerUserId: null } }, { mailbox: { ownerUserId: c.userId } }] };
    }
    const or = this.messageRules(c);
    if (c.threadKeys.length) or.push({ channel: 'EMAIL', threadKey: { in: c.threadKeys } });
    return or.length ? { OR: or } : NOTHING;
  }

  async communicationWhere(v: AuthedViewer, scopes: Scope[]): Promise<Prisma.CommunicationWhereInput> {
    return this.communicationWhereFrom(await this.communicationScope(v, scopes));
  }

  async requireCommunication(v: AuthedViewer, scopes: Scope[], id: string) {
    const c = await this.prisma.communication.findFirst({ where: { AND: [{ id }, await this.communicationWhere(v, scopes)] } });
    if (!c) throw Errors.notFound('Message');
    return c;
  }

  /** Billing requests: every one for Admin and Accounts, the PM's own clients' for a PM. */
  billingWhere(v: AuthedViewer, scopes: Scope[]): Prisma.BillingRequestWhereInput {
    if (scopes.includes('ALL') || scopes.includes('BILLING')) return {};
    return scopes.includes('OWN_CLIENTS') ? { client: { pmId: v.userId } } : NOTHING;
  }

  /** Renewals: Accounts hears about every retainer and AMC (PRD 4.3), a PM about their own. */
  renewalWhere(v: AuthedViewer, scopes: Scope[]): Prisma.ProjectWhereInput {
    if (scopes.includes('ALL') || scopes.includes('BILLING')) return {};
    return scopes.includes('OWN_CLIENTS') ? { pmId: v.userId } : NOTHING;
  }

  /** Loads one project inside the viewer's scope, or 404 (never reveal that it exists). */
  async requireProject(v: AuthedViewer, scopes: Scope[], id: string) {
    const project = await this.prisma.project.findFirst({ where: { AND: [{ id }, await this.projectWhere(v, scopes)] } });
    if (!project) throw Errors.notFound('Project');
    return project;
  }

  async requireTask(v: AuthedViewer, scopes: Scope[], id: string) {
    const task = await this.prisma.task.findFirst({
      where: { AND: [{ id }, await this.taskWhere(v, scopes)] },
      include: { project: true },
    });
    if (!task) throw Errors.notFound('Task');
    return task;
  }

  async requireClient(v: AuthedViewer, scopes: Scope[], id: string) {
    const client = await this.prisma.client.findFirst({ where: { AND: [{ id }, await this.clientWhere(v, scopes)] } });
    if (!client) throw Errors.notFound('Client');
    return client;
  }
}
