import { Body, Controller, Get, Inject, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { present, type Scope } from '@opshub/policy';
import {
  ImportChatInput,
  LinkMessageInput,
  ListThreadsQuery,
  SearchQuery,
  SendMessageInput,
  TriageDecisionInput,
  type LinkMessageInput as LinkMessage,
  type ListThreadsQuery as ListThreads,
  type SearchQuery as Search,
  type TriageDecisionInput as TriageDecision,
} from '@opshub/shared';
import type { Response } from 'express';
import { Authenticated, CurrentViewer, GrantedScopes, Requires } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { ENV, type Env } from '../config/env';
import type { IncomingFile } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';
import { AckDto } from '../policy/dtos';
import { InboxSettingsDto } from './dtos';
import { whatsappTemplates } from './providers';
import { InboxService } from './inbox.service';
import { SearchService } from './search.service';
import { SendService } from './send.service';
import { TriageService } from './triage.service';
import { WhatsAppService } from './whatsapp.service';

const uploadLimits = (files: number) => ({ fileSize: Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024, files });

/** Multipart forms carry the JSON in a "payload" field next to the files. */
const fromForm = (body: unknown): unknown => {
  const payload = (body as { payload?: unknown } | null)?.payload;
  if (typeof payload !== 'string') return body;
  try {
    return JSON.parse(payload);
  } catch {
    return {};
  }
};

@Controller()
export class InboxController {
  constructor(
    private readonly inbox: InboxService,
    private readonly triage: TriageService,
    private readonly sender: SendService,
    private readonly whatsapp: WhatsAppService,
    private readonly search: SearchService,
    private readonly storage: StorageService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('inbox/threads')
  @Requires('inbox.read')
  threads(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Query(new ZodPipe(ListThreadsQuery)) q: ListThreads) {
    return this.inbox.threads(v, s, q);
  }

  @Get('inbox/threads/:key')
  @Requires('inbox.read')
  thread(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('key') key: string) {
    return this.inbox.thread(v, s, key);
  }

  @Post('inbox/threads/:key/read')
  @Requires('inbox.read')
  async markRead(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('key') key: string) {
    await this.inbox.markRead(v, s, key);
    return present(AckDto, { ok: true });
  }

  /** PRD 2.3: unknown senders wait here for a PM to link them. */
  @Get('inbox/unmatched')
  @Requires('inbox.link')
  unmatched(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[]) {
    return this.inbox.threads(v, s, { view: 'unmatched', limit: 50 });
  }

  @Get('inbox/settings')
  @Requires('inbox.read')
  settings() {
    return present(InboxSettingsDto, {
      gmailMode: this.env.GMAIL_MODE,
      whatsappMode: this.env.WHATSAPP_MODE,
      aiMode: this.env.AI_MODE,
      whatsappTemplates: whatsappTemplates(this.env),
    });
  }

  @Post('inbox/messages/:id/triage')
  @Requires('inbox.triage')
  decide(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(TriageDecisionInput)) body: TriageDecision) {
    return this.triage.decide(v, s, id, body);
  }

  @Post('inbox/messages/:id/link')
  @Requires('inbox.link')
  link(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(LinkMessageInput)) body: LinkMessage) {
    return this.inbox.link(v, s, id, body);
  }

  /** Always a download, never inline; files from clients are untrusted. */
  @Get('inbox/messages/:id/attachments/:index')
  @Requires('inbox.read')
  async attachment(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Param('index', ParseIntPipe) index: number, @Res() res: Response) {
    const a = await this.inbox.attachment(v, s, id, index);
    const d = await this.storage.download(a.key, a.fileName);
    if (d.kind === 'redirect') return res.redirect(d.url);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${a.fileName.replace(/["\\\r\n]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(d.size));
    d.stream.pipe(res);
  }

  /** Compose by contact id (TechSpec 5.5). JSON, or multipart with "payload" and "files". */
  @Post('inbox/send')
  @Requires('inbox.send')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: uploadLimits(10) }))
  send(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Body() body: unknown, @UploadedFiles() files: IncomingFile[] | undefined) {
    return this.sender.send(v, s, new ZodPipe(SendMessageInput).transform(fromForm(body)), files ?? []);
  }

  /** Route B: a WhatsApp chat export (.txt or .zip) for one client. */
  @Post('whatsapp/imports')
  @Requires('inbox.import')
  @UseInterceptors(FileInterceptor('file', { limits: uploadLimits(1) }))
  importChat(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Body() body: unknown, @UploadedFile() file: IncomingFile | undefined) {
    return this.whatsapp.importChat(v, s, new ZodPipe(ImportChatInput).transform(fromForm(body)), file);
  }

  /** Each result type is limited by the viewer's own scopes for it. */
  @Get('search')
  @Authenticated()
  find(@CurrentViewer() v: AuthedViewer, @Query(new ZodPipe(SearchQuery)) q: Search) {
    return this.search.search(v, q);
  }
}
