import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { present, scopesFor, type Scope } from '@opshub/policy';
import {
  ChecklistItemInput,
  CommentInput,
  CreateTaskInput,
  ListTasksQuery,
  MyTasksQuery,
  UpdateChecklistItemInput,
  UpdateTaskInput,
  type CreateTaskInput as CreateTask,
  type ListTasksQuery as ListTasks,
  type MyTasksQuery as MyTasks,
  type UpdateTaskInput as UpdateTask,
} from '@opshub/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import { CurrentViewer, GrantedScopes, Requires } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { AckDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { uploadLimits } from '../projects/projects.controller';
import { ProjectsService, type IncomingFile } from '../projects/projects.service';
import { StorageService } from '../storage/storage.service';
import { TasksService } from './tasks.service';

@Controller()
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly projects: ProjectsService,
    private readonly scopes: ScopeService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Get('tasks')
  @Requires('task.read')
  list(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Query(new ZodPipe(ListTasksQuery)) q: ListTasks) {
    return this.tasks.list(v, s, q);
  }

  @Get('me/tasks')
  @Requires('task.read')
  mine(@CurrentViewer() v: AuthedViewer, @Query(new ZodPipe(MyTasksQuery)) q: MyTasks) {
    return this.tasks.mine(v, q);
  }

  @Post('tasks')
  @Requires('task.create')
  create(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Body(new ZodPipe(CreateTaskInput)) body: CreateTask) {
    return this.tasks.create(v, s, body);
  }

  @Get('tasks/:id')
  @Requires('task.read')
  get(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    return this.tasks.detail(v, s, id);
  }

  @Patch('tasks/:id')
  @Requires('task.update')
  update(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(UpdateTaskInput)) body: UpdateTask) {
    return this.tasks.update(v, s, id, body);
  }

  @Post('tasks/:id/checklist')
  @Requires('task.update')
  addChecklist(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(ChecklistItemInput)) body: z.infer<typeof ChecklistItemInput>) {
    return this.tasks.addChecklistItem(v, s, id, body.text);
  }

  @Patch('checklist/:id')
  @Requires('task.update')
  updateChecklist(
    @CurrentViewer() v: AuthedViewer,
    @GrantedScopes() s: Scope[],
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateChecklistItemInput)) body: z.infer<typeof UpdateChecklistItemInput>,
  ) {
    return this.tasks.updateChecklistItem(v, s, id, body);
  }

  @Delete('checklist/:id')
  @Requires('task.update')
  async deleteChecklist(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    await this.tasks.deleteChecklistItem(v, s, id);
    return present(AckDto, { ok: true });
  }

  /** Anyone who can see a task can comment on it. */
  @Post('tasks/:id/comments')
  @Requires('task.read')
  comment(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(CommentInput)) body: z.infer<typeof CommentInput>) {
    return this.tasks.comment(v, s, id, body.body);
  }

  @Post('tasks/:id/attachments')
  @Requires('task.update')
  @UseInterceptors(FileInterceptor('file', { limits: uploadLimits() }))
  async attach(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @UploadedFile() file: IncomingFile | undefined) {
    const task = await this.scopes.requireTask(v, s, id);
    // The task check above is the access decision; the project lookup reuses the same visibility.
    return this.projects.addAttachment(v, ['ALL'], task.projectId, file, task.id);
  }

  /** Streams locally or redirects to a 5-minute presigned link. Always a download, never inline. */
  @Get('attachments/:id')
  @Requires('project.read')
  async download(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Res() res: Response) {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a) throw Errors.notFound('Attachment');
    if (a.taskId) await this.scopes.requireTask(v, scopesFor(v.roles, 'task.read'), a.taskId);
    else await this.scopes.requireProject(v, s, a.projectId);
    const d = await this.storage.download(a.storageKey, a.fileName);
    if (d.kind === 'redirect') return res.redirect(d.url);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${a.fileName.replace(/["\\\r\n]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Length', String(d.size));
    d.stream.pipe(res);
  }
}
