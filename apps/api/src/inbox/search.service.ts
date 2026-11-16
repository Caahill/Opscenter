// Search (TechSpec 10, PRD 2.2): full-text over masked message text and client names, plus task and
// client matches. The viewer's scope is part of the SQL statement, never applied afterwards.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@opshub/db';
import { present, scopesFor } from '@opshub/policy';
import type { SearchQuery } from '@opshub/shared';
import { ClientsService } from '../clients/clients.service';
import type { AuthedViewer } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService, type CommunicationScope } from '../policy/scopes';
import { TasksQueries } from '../tasks/tasks.queries';
import { COMM_INCLUDE, SearchResultsDto } from './dtos';
import { MessagesQueries } from './messages';

/** The same rule as ScopeService.communicationWhereFrom, as SQL over "Communication" c and "Mailbox" m. */
export function communicationScopeSql(s: CommunicationScope): Prisma.Sql {
  if (s.all) return Prisma.sql`(c."clientId" IS NOT NULL OR c."mailboxId" IS NULL OR m."ownerUserId" IS NULL OR m."ownerUserId" = ${s.userId})`;
  const parts: Prisma.Sql[] = [];
  if (s.projectIds.length) parts.push(Prisma.sql`c."projectId" = ANY(${s.projectIds}::text[])`);
  if (s.teamClientIds.length) parts.push(Prisma.sql`(c."projectId" IS NULL AND c."clientId" = ANY(${s.teamClientIds}::text[]))`);
  if (s.taskIds.length) parts.push(Prisma.sql`c."taskId" = ANY(${s.taskIds}::text[])`);
  if (s.billing) parts.push(Prisma.sql`(c."category" = 'BILLING' AND c."triageState" = 'CONFIRMED')`);
  if (s.threadKeys.length) parts.push(Prisma.sql`(c."channel" = 'EMAIL' AND c."threadKey" = ANY(${s.threadKeys}::text[]))`);
  return parts.length ? Prisma.sql`(${Prisma.join(parts, ' OR ')})` : Prisma.sql`FALSE`;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly messages: MessagesQueries,
    private readonly tasks: TasksQueries,
    private readonly clients: ClientsService,
  ) {}

  async search(v: AuthedViewer, q: SearchQuery) {
    const started = Date.now();
    const want = (t: 'communication' | 'task' | 'client') => q.type === 'all' || q.type === t;
    const inboxScopes = scopesFor(v.roles, 'inbox.read');
    const taskScopes = scopesFor(v.roles, 'task.read');
    const clientScopes = scopesFor(v.roles, 'client.read');

    const [communications, tasks, clients] = await Promise.all([
      want('communication') && inboxScopes.length ? this.communications(v, q) : [],
      want('task') && taskScopes.length
        ? this.tasks.list(
            v,
            taskScopes,
            {
              OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }],
              ...(q.clientId ? { project: { clientId: q.clientId } } : {}),
              ...(q.projectId ? { projectId: q.projectId } : {}),
            },
            20,
          )
        : [],
      want('client') && clientScopes.length ? this.clients.list(v, clientScopes, { search: q.q }).then((r) => r.slice(0, 20)) : [],
    ]);
    return present(SearchResultsDto, { communications, tasks, clients, tookMs: Date.now() - started });
  }

  private async communications(v: AuthedViewer, q: SearchQuery) {
    const scope = await this.scopes.communicationScope(v, scopesFor(v.roles, 'inbox.read'));
    const filters: Prisma.Sql[] = [];
    if (q.clientId) filters.push(Prisma.sql`c."clientId" = ${q.clientId}`);
    if (q.projectId) filters.push(Prisma.sql`c."projectId" = ${q.projectId}`);
    if (q.channel) filters.push(Prisma.sql`c."channel" = ${q.channel}::"Channel"`);
    if (q.triageState) filters.push(Prisma.sql`c."triageState" = ${q.triageState}::"TriageState"`);
    // Columns hold UTC without a zone; compare in UTC, never in the database session's time zone.
    const utc = (d: Date) => Prisma.sql`(${d}::timestamptz AT TIME ZONE 'UTC')`;
    if (q.from) filters.push(Prisma.sql`c."sentAt" >= ${utc(new Date(`${q.from}T00:00:00.000Z`))}`);
    if (q.to) filters.push(Prisma.sql`c."sentAt" < ${utc(new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + 86_400_000))}`);
    if (q.senderRole) filters.push(Prisma.sql`c."contactId" IN (SELECT id FROM "Contact" WHERE role = ${q.senderRole})`);
    const hits = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT c.id FROM "Communication" c
      LEFT JOIN "Mailbox" m ON m.id = c."mailboxId"
      WHERE c."searchVector" @@ websearch_to_tsquery('english', ${q.q})
        AND ${communicationScopeSql(scope)}
        ${filters.length ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty}
      ORDER BY c."sentAt" DESC
      LIMIT 50`;
    if (!hits.length) return [];
    // Loaded again through the Prisma scope as well, so both renderings must agree to show a row.
    const scopeWhere = this.scopes.communicationWhereFrom(scope);
    const rows = await this.prisma.communication.findMany({
      where: { AND: [{ id: { in: hits.map((h) => h.id) } }, scopeWhere] },
      include: COMM_INCLUDE,
      orderBy: { sentAt: 'desc' },
    });
    return (await this.messages.summaries(v, scopeWhere, rows, 50)).items;
  }
}
