import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { present, type Scope } from '@opshub/policy';
import {
  CreateClientInput,
  CreateContactInput,
  CreateCredentialInput,
  CreateGrantInput,
  ListClientsQuery,
  UpdateClientInput,
  UpdateContactInput,
  type CreateClientInput as CreateClient,
  type CreateContactInput as CreateContact,
  type CreateCredentialInput as CreateCredential,
  type CreateGrantInput as CreateGrant,
  type ListClientsQuery as ListClients,
  type UpdateClientInput as UpdateClient,
  type UpdateContactInput as UpdateContact,
} from '@opshub/shared';
import type { Response } from 'express';
import { CurrentViewer, GrantedScopes, Requires } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { CredentialsService } from '../credentials/credentials.service';
import { AckDto } from '../policy/dtos';
import { ClientsService } from './clients.service';

@Controller()
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly credentials: CredentialsService,
  ) {}

  @Get('clients')
  @Requires('client.read')
  list(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Query(new ZodPipe(ListClientsQuery)) q: ListClients) {
    return this.clients.list(v, s, q);
  }

  @Post('clients')
  @Requires('client.manage')
  create(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Body(new ZodPipe(CreateClientInput)) body: CreateClient) {
    return this.clients.create(v, s, body);
  }

  @Get('clients/:id')
  @Requires('client.read')
  get(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    return this.clients.get(v, s, id);
  }

  @Patch('clients/:id')
  @Requires('client.manage')
  update(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(UpdateClientInput)) body: UpdateClient) {
    return this.clients.update(v, s, id, body);
  }

  /** Client 360 (PRD 1.2). */
  @Get('clients/:id/overview')
  @Requires('client.read')
  overview(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    return this.clients.overview(v, s, id);
  }

  @Get('clients/:id/contacts')
  @Requires('client.read')
  contacts(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    return this.clients.listContacts(v, s, id);
  }

  @Post('clients/:id/contacts')
  @Requires('client.manage')
  addContact(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(CreateContactInput)) body: CreateContact) {
    return this.clients.createContact(v, s, id, body);
  }

  @Patch('contacts/:id')
  @Requires('client.manage')
  updateContact(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(UpdateContactInput)) body: UpdateContact) {
    return this.clients.updateContact(v, s, id, body);
  }

  @Delete('contacts/:id')
  @Requires('client.manage')
  async deleteContact(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    await this.clients.deleteContact(v, s, id);
    return present(AckDto, { ok: true });
  }

  // ---- Credential vault (TechSpec 5.7) ----

  @Get('clients/:id/credentials')
  @Requires('credential.read')
  listCredentials(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    return this.credentials.listForClient(v, s, id);
  }

  @Post('clients/:id/credentials')
  @Requires('credential.manage')
  addCredential(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(CreateCredentialInput)) body: CreateCredential) {
    return this.credentials.create(v, s, id, body);
  }

  @Post('credentials/:id/reveal')
  @HttpCode(200)
  @Requires('credential.reveal')
  reveal(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    return this.credentials.reveal(v, s, id);
  }

  @Post('credentials/:id/grants')
  @Requires('credential.manage')
  grant(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(CreateGrantInput)) body: CreateGrant) {
    return this.credentials.grant(v, s, id, body);
  }

  @Delete('grants/:id')
  @Requires('credential.manage')
  async revoke(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    await this.credentials.revokeGrant(v, s, id);
    return present(AckDto, { ok: true });
  }
}
