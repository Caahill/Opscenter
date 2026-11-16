import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Client, Prisma } from '@opshub/db';
import { present, scopesFor, type Scope } from '@opshub/policy';
import {
  MARKET_CALLING_CODES,
  type ContactRole,
  type CreateClientInput,
  type CreateContactInput,
  type ListClientsQuery,
  type UpdateClientInput,
  type UpdateContactInput,
} from '@opshub/shared';
import { Errors } from '../common/errors';
import { DirectoryService } from '../common/directory.service';
import type { AuthedViewer } from '../common/request';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { ProjectsQueries } from '../projects/projects.queries';
import { BillingService } from '../billing/billing.service';
import { CredentialsService } from '../credentials/credentials.service';
import { IngestService, MessagesQueries } from '../inbox/messages';
import { TasksQueries } from '../tasks/tasks.queries';
import { Client360Dto, presentClient, presentContact } from '../work/dtos';

const DEFAULT_LABELS: Record<ContactRole, string> = {
  DECISION_MAKER: 'Decision maker',
  MARKETING: 'Marketing contact',
  BILLING: 'Billing contact',
  TECHNICAL: 'Technical contact',
};

const OPEN = ['NOT_STARTED', 'ACTIVE', 'WAITING_ON_CLIENT', 'ON_HOLD'] as const;

interface SealedContact {
  keyId: string;
  nameEnc?: Uint8Array<ArrayBuffer>;
  emailEnc?: Uint8Array<ArrayBuffer> | null;
  emailHash?: string | null;
  phoneEnc?: Uint8Array<ArrayBuffer> | null;
  phoneHash?: string | null;
}

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly crypto: CryptoService,
    private readonly directory: DirectoryService,
    private readonly projects: ProjectsQueries,
    private readonly tasks: TasksQueries,
    private readonly credentials: CredentialsService,
    private readonly messages: MessagesQueries,
    private readonly ingest: IngestService,
    private readonly billing: BillingService,
  ) {}

  async list(v: AuthedViewer, scopes: Scope[], q: ListClientsQuery) {
    const where: Prisma.ClientWhereInput = {
      AND: [
        await this.scopes.clientWhere(v, scopes),
        q.search
          ? { OR: [{ companyName: { contains: q.search, mode: 'insensitive' } }, { website: { contains: q.search, mode: 'insensitive' } }] }
          : {},
        q.market ? { market: q.market } : {},
        q.status ? { status: q.status } : {},
        q.pmId ? { pmId: q.pmId } : {},
      ],
    };
    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { companyName: 'asc' },
      include: { _count: { select: { projects: true } } },
      take: 500,
    });
    const names = await this.directory.names(clients.map((c) => c.pmId));
    return clients.map((c) => presentClient(c, names, this.crypto));
  }

  async get(v: AuthedViewer, scopes: Scope[], id: string) {
    const client = await this.scopes.requireClient(v, scopes, id);
    const names = await this.directory.names([client.pmId]);
    return presentClient(client, names, this.crypto);
  }

  async create(v: AuthedViewer, scopes: Scope[], input: CreateClientInput) {
    const pmId = input.pmId ?? v.userId;
    if (!scopes.includes('ALL') && pmId !== v.userId) throw Errors.forbidden('Only the Admin can create a client for another PM');
    await this.assertPm(pmId);
    const id = randomUUID();
    const client = await this.prisma.client.create({
      data: {
        id,
        companyName: input.companyName,
        website: normalizeWebsite(input.website),
        market: input.market,
        pmId,
        salesOwnerId: input.salesOwnerId ?? null,
        tags: input.tags ?? [],
        emailDomains: input.emailDomains ?? [],
        taxIdEnc: input.taxId ? (await this.crypto.encrypt(input.taxId, 'pii', `client:${id}`)).ciphertext : null,
        contractValue: input.contractValue ?? null,
      },
    });
    return presentClient(client, await this.directory.names([pmId]), this.crypto);
  }

  async update(v: AuthedViewer, scopes: Scope[], id: string, input: UpdateClientInput) {
    await this.scopes.requireClient(v, this.manageScopes(scopes), id);
    if (input.pmId && !scopes.includes('ALL')) throw Errors.forbidden('Only the Admin can reassign the PM');
    if (input.pmId) await this.assertPm(input.pmId);
    const client = await this.prisma.client.update({
      where: { id },
      data: {
        companyName: input.companyName,
        website: input.website === undefined ? undefined : normalizeWebsite(input.website),
        market: input.market,
        status: input.status,
        pmId: input.pmId,
        salesOwnerId: input.salesOwnerId,
        tags: input.tags,
        emailDomains: input.emailDomains,
        taxIdEnc:
          input.taxId === undefined ? undefined : input.taxId ? (await this.crypto.encrypt(input.taxId, 'pii', `client:${id}`)).ciphertext : null,
        contractValue: input.contractValue,
      },
    });
    return presentClient(client, await this.directory.names([client.pmId]), this.crypto);
  }

  // ---- Contacts ----

  async listContacts(v: AuthedViewer, scopes: Scope[], clientId: string) {
    const client = await this.scopes.requireClient(v, scopes, clientId);
    const contacts = await this.prisma.contact.findMany({ where: { clientId }, orderBy: { role: 'asc' } });
    return contacts.map((c) => presentContact(c, client, this.crypto));
  }

  async createContact(v: AuthedViewer, scopes: Scope[], clientId: string, input: CreateContactInput) {
    const client = await this.scopes.requireClient(v, this.manageScopes(scopes), clientId);
    const id = randomUUID();
    const { nameEnc, ...sealed } = await this.sealContact(id, client, input);
    if (!nameEnc) throw Errors.validation('name: required');
    const contact = await this.prisma.contact
      .create({ data: { id, clientId, role: input.role, label: input.label ?? DEFAULT_LABELS[input.role], nameEnc, ...sealed } })
      .catch(duplicateContact);
    await this.relinkMessages(contact);
    return presentContact(contact, client, this.crypto);
  }

  async updateContact(v: AuthedViewer, scopes: Scope[], contactId: string, input: UpdateContactInput) {
    const existing = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!existing) throw Errors.notFound('Contact');
    const client = await this.scopes.requireClient(v, this.manageScopes(scopes), existing.clientId);
    const sealed = await this.sealContact(contactId, client, input);
    const contact = await this.prisma.contact
      .update({
        where: { id: contactId },
        data: {
          role: input.role,
          label: input.label ?? (input.role ? DEFAULT_LABELS[input.role] : undefined),
          ...sealed,
        },
      })
      .catch(duplicateContact);
    await this.relinkMessages(contact);
    return presentContact(contact, client, this.crypto);
  }

  /** A new address or number for a contact pulls in their unmatched messages (PRD edge case). */
  private async relinkMessages(contact: { id: string; clientId: string; emailHash: string | null; phoneHash: string | null }) {
    const fromHashes = [contact.emailHash, contact.phoneHash].filter((h): h is string => Boolean(h));
    if (fromHashes.length) await this.ingest.relink({ fromHashes }, { clientId: contact.clientId, contactId: contact.id, method: 'CONTACT' });
  }

  async deleteContact(v: AuthedViewer, scopes: Scope[], contactId: string) {
    const existing = await this.prisma.contact.findUnique({ where: { id: contactId } });
    if (!existing) throw Errors.notFound('Contact');
    await this.scopes.requireClient(v, this.manageScopes(scopes), existing.clientId);
    await this.prisma.contact.delete({ where: { id: contactId } });
  }

  /** Encrypts whatever contact fields are present; hashes support lookup without decrypting. */
  private async sealContact(id: string, client: Client, input: Partial<CreateContactInput>): Promise<SealedContact> {
    const aad = `contact:${id}`;
    const seal = async (value: string) => (await this.crypto.encrypt(value, 'pii', aad)).ciphertext;
    const out: SealedContact = { keyId: this.crypto.keyIdFor('pii') };
    if (input.name !== undefined) out.nameEnc = await seal(input.name);
    if (input.email !== undefined) {
      out.emailEnc = input.email ? await seal(input.email) : null;
      out.emailHash = input.email ? this.crypto.hash('email', input.email) : null;
    }
    if (input.phone !== undefined) {
      out.phoneEnc = input.phone ? await seal(input.phone) : null;
      out.phoneHash = input.phone ? this.crypto.hash('phone', input.phone, MARKET_CALLING_CODES[client.market]) : null;
    }
    return out;
  }

  // ---- Client 360 (PRD 1.2) ----

  async overview(v: AuthedViewer, scopes: Scope[], id: string) {
    const client = await this.scopes.requireClient(v, scopes, id);
    const projectScopes = scopesFor(v.roles, 'project.read');
    const taskScopes = scopesFor(v.roles, 'task.read');
    const credentialScopes = scopesFor(v.roles, 'credential.read');

    const [contacts, projects, openTasks, credentials, names, communications, billingRequests] = await Promise.all([
      this.prisma.contact.findMany({ where: { clientId: id }, orderBy: { role: 'asc' } }),
      projectScopes.length ? this.projects.list(v, projectScopes, { clientId: id }, { includeClosed: true }) : [],
      taskScopes.length
        ? this.tasks.list(v, taskScopes, { project: { clientId: id }, statusType: { in: [...OPEN] } }, 50)
        : [],
      credentialScopes.length ? this.credentials.listForClient(v, credentialScopes, id) : [],
      this.directory.names([client.pmId]),
      this.messages.recentForClient(v, id),
      this.billing.forClient(v, id),
    ]);

    const soon = Date.now() + 90 * 86_400_000;
    const renewals = projects.filter((p) => {
      const due = p.row.renewalDate ?? p.row.endDate;
      return p.row.statusType !== 'STOPPED' && p.row.type !== 'ONE_TIME' && due !== null && due.getTime() <= soon;
    });

    return present(
      Client360Dto,
      {
        client: presentClient(client, names, this.crypto),
        contacts: contacts.map((c) => presentContact(c, client, this.crypto)),
        projects: projects.map((p) => p.dto),
        openTasks,
        credentials,
        communications,
        billingRequests,
        renewals: renewals.map((p) => p.dto),
      },
      { clientPmId: client.pmId, entityId: client.id },
    );
  }

  private manageScopes(scopes: Scope[]): Scope[] {
    return scopes.filter((s) => s === 'ALL' || s === 'OWN_CLIENTS');
  }

  private async assertPm(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.active || !user.roles.includes('PM')) throw Errors.validation('pmId: must be an active Project Manager');
  }
}

function normalizeWebsite(website: string | null | undefined): string | null {
  if (!website) return null;
  return website.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '').toLowerCase();
}

function duplicateContact(err: unknown): never {
  if ((err as { code?: string }).code === 'P2002') {
    // Do not say which client already holds it.
    throw Errors.conflict('This email or phone number is already saved on a contact');
  }
  throw err;
}
