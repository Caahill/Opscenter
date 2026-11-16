import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@opshub/db';
import { present, type Scope } from '@opshub/policy';
import type { CreateCredentialInput, CreateGrantInput } from '@opshub/shared';
import { AuditService } from '../audit/audit.service';
import { ActivityService } from '../common/activity.service';
import { DirectoryService } from '../common/directory.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { CredentialRevealDto, presentCredential } from '../work/dtos';

export const GRANT_DAYS = 7;
const OPEN = ['NOT_STARTED', 'ACTIVE', 'WAITING_ON_CLIENT', 'ON_HOLD'] as const;

interface SecretPayload {
  username: string;
  password: string;
  notes?: string;
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly activity: ActivityService,
    private readonly directory: DirectoryService,
  ) {}

  private isOwner(scopes: Scope[]) {
    return scopes.includes('ALL') || scopes.includes('OWN_CLIENTS');
  }

  /** Labels only. TL and Member see the credentials granted to them, with their own grants. */
  async listForClient(v: AuthedViewer, scopes: Scope[], clientId: string) {
    const owner = this.isOwner(scopes);
    const now = new Date();
    const rows = await this.prisma.credential.findMany({
      where: { AND: [{ clientId }, this.scopes.credentialWhere(v, scopes)] },
      include: {
        client: { select: { pmId: true } },
        grants: {
          where: { revokedAt: null, expiresAt: { gt: now }, ...(owner ? {} : { userId: v.userId }) },
          orderBy: { expiresAt: 'asc' },
        },
      },
      orderBy: { label: 'asc' },
    });
    const taskIds = rows.flatMap((r) => r.grants.map((g) => g.taskId));
    const tasks = await this.prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, title: true } });
    const titles = new Map(tasks.map((t) => [t.id, t.title]));
    const names = await this.directory.names(rows.flatMap((r) => r.grants.map((g) => g.userId)));
    return rows.map((r) =>
      presentCredential({ ...r, grants: r.grants.map((g) => ({ ...g, taskTitle: titles.get(g.taskId) ?? null })) }, r.client.pmId, names),
    );
  }

  async create(v: AuthedViewer, scopes: Scope[], clientId: string, input: CreateCredentialInput) {
    const client = await this.scopes.requireClient(v, scopes.filter((s) => s === 'ALL' || s === 'OWN_CLIENTS'), clientId);
    const id = randomUUID();
    const payload: SecretPayload = { username: input.username, password: input.password, notes: input.notes };
    const sealed = await this.crypto.encrypt(JSON.stringify(payload), 'vault', `credential:${id}`);
    const cred = await this.prisma.credential.create({
      data: { id, clientId, system: input.system, label: input.label, secretEnc: sealed.ciphertext, keyId: sealed.keyId },
    });
    await this.audit.record(v.userId, 'CREDENTIAL_CREATED', 'Credential', id, { clientId, system: input.system });
    return presentCredential({ ...cred, grants: [] }, client.pmId, new Map());
  }

  /** TechSpec 5.7: returned once, never cached, always logged. TL/Member need an active grant. */
  async reveal(v: AuthedViewer, scopes: Scope[], id: string) {
    const cred = await this.prisma.credential.findFirst({
      where: { AND: [{ id }, this.scopes.credentialWhere(v, scopes)] },
      include: { client: { select: { pmId: true } } },
    });
    if (!cred) throw Errors.notFound('Credential');

    let viaGrant: string | null = null;
    if (!this.isOwner(scopes)) {
      const grant = await this.prisma.credentialGrant.findFirst({
        where: { credentialId: id, userId: v.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      });
      const task = grant ? await this.prisma.task.findUnique({ where: { id: grant.taskId } }) : null;
      if (!grant || !task || !OPEN.includes(task.statusType as (typeof OPEN)[number])) throw Errors.notFound('Credential');
      viaGrant = grant.id;
    }

    const secret = JSON.parse(await this.crypto.decrypt({ ciphertext: cred.secretEnc, keyId: cred.keyId }, `credential:${id}`)) as SecretPayload;
    await this.audit.record(v.userId, 'REVEAL_CREDENTIAL', 'Credential', id, { clientId: cred.clientId, grantId: viaGrant });
    return present(
      CredentialRevealDto,
      { username: secret.username, password: secret.password, notes: secret.notes ?? null },
      { clientPmId: cred.client.pmId, entityId: id },
    );
  }

  async grant(v: AuthedViewer, scopes: Scope[], credentialId: string, input: CreateGrantInput) {
    const cred = await this.prisma.credential.findFirst({
      where: { AND: [{ id: credentialId }, this.scopes.credentialWhere(v, scopes)] },
      include: { client: { select: { pmId: true } } },
    });
    if (!cred) throw Errors.notFound('Credential');
    const task = await this.prisma.task.findUnique({ where: { id: input.taskId }, include: { project: true } });
    if (!task || task.project.clientId !== cred.clientId) throw Errors.validation('taskId: must be a task on this client');
    if (!OPEN.includes(task.statusType as (typeof OPEN)[number])) throw Errors.invalidState('The task is closed');
    const user = await this.prisma.user.findUnique({ where: { id: input.userId } });
    if (!user || !user.active) throw Errors.validation('userId: must be an active user');

    const expiresAt = new Date(Date.now() + GRANT_DAYS * 86_400_000);
    const grant = await this.prisma.$transaction(async (tx) => {
      const g = await tx.credentialGrant.create({
        data: { credentialId, userId: input.userId, taskId: input.taskId, expiresAt, grantedById: v.userId },
      });
      await this.audit.record(v.userId, 'CREDENTIAL_GRANTED', 'Credential', credentialId, { grantId: g.id, userId: input.userId, taskId: input.taskId }, tx);
      await this.activity.log(
        { kind: 'CREDENTIAL_GRANTED', actorId: v.userId, projectId: task.projectId, taskId: task.id, to: { userId: input.userId, label: cred.label } },
        tx,
      );
      return g;
    });
    const names = await this.directory.names([grant.userId]);
    return presentCredential({ ...cred, grants: [{ ...grant, taskTitle: task.title }] }, cred.client.pmId, names);
  }

  async revokeGrant(v: AuthedViewer, scopes: Scope[], grantId: string) {
    const grant = await this.prisma.credentialGrant.findUnique({ where: { id: grantId } });
    if (!grant) throw Errors.notFound('Grant');
    const cred = await this.prisma.credential.findFirst({
      where: { AND: [{ id: grant.credentialId }, this.scopes.credentialWhere(v, scopes)] },
    });
    if (!cred) throw Errors.notFound('Grant');
    if (grant.revokedAt) return;
    await this.prisma.credentialGrant.update({ where: { id: grantId }, data: { revokedAt: new Date() } });
    await this.audit.record(v.userId, 'CREDENTIAL_GRANT_REVOKED', 'Credential', grant.credentialId, { grantId });
  }

  /** Task-close hook (TechSpec 5.7): grants end when their task closes. */
  static revokeForTask(tx: Pick<Prisma.TransactionClient, 'credentialGrant'>, taskId: string) {
    return tx.credentialGrant.updateMany({ where: { taskId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
