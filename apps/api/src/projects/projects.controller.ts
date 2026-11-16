import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Scope } from '@opshub/policy';
import {
  CreateProjectInput,
  HandoffInput,
  ListProjectsQuery,
  MoveStageInput,
  StopProjectInput,
  UpdateChecklistItemInput,
  UpdateProjectInput,
  type CreateProjectInput as CreateProject,
  type HandoffInput as Handoff,
  type ListProjectsQuery as ListProjects,
  type MoveStageInput as MoveStage,
  type StopProjectInput as StopProject,
  type UpdateProjectInput as UpdateProject,
} from '@opshub/shared';
import type { z } from 'zod';
import { CurrentViewer, GrantedScopes, Requires } from '../auth/access.decorators';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { ProjectsService, type IncomingFile } from './projects.service';

export const uploadLimits = () => ({ fileSize: Number(process.env.MAX_UPLOAD_MB ?? 25) * 1024 * 1024, files: 1 });

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @Requires('project.read')
  list(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Query(new ZodPipe(ListProjectsQuery)) q: ListProjects) {
    return this.projects.list(v, s, q);
  }

  @Post()
  @Requires('project.manage')
  create(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Body(new ZodPipe(CreateProjectInput)) body: CreateProject) {
    return this.projects.create(v, s, body);
  }

  @Get(':id')
  @Requires('project.read')
  get(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string) {
    return this.projects.detail(v, s, id);
  }

  @Patch(':id')
  @Requires('project.manage')
  update(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(UpdateProjectInput)) body: UpdateProject) {
    return this.projects.update(v, s, id, body);
  }

  @Post(':id/move-stage')
  @HttpCode(200)
  @Requires('project.manage')
  move(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(MoveStageInput)) body: MoveStage) {
    return this.projects.moveStage(v, s, id, body);
  }

  @Post(':id/stop')
  @HttpCode(200)
  @Requires('project.manage')
  stop(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(StopProjectInput)) body: StopProject) {
    return this.projects.stop(v, s, id, body);
  }

  @Post(':id/handoff')
  @HttpCode(200)
  @Requires('project.manage')
  handoff(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @Body(new ZodPipe(HandoffInput)) body: Handoff) {
    return this.projects.handoff(v, s, id, body);
  }

  @Patch(':id/checklist/:itemId')
  @Requires('project.manage')
  checklist(
    @CurrentViewer() v: AuthedViewer,
    @GrantedScopes() s: Scope[],
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(new ZodPipe(UpdateChecklistItemInput)) body: z.infer<typeof UpdateChecklistItemInput>,
  ) {
    if (body.done === undefined) throw Errors.validation('done: required');
    return this.projects.setChecklistItem(v, s, id, itemId, body.done);
  }

  @Post(':id/attachments')
  @Requires('project.manage')
  @UseInterceptors(FileInterceptor('file', { limits: uploadLimits() }))
  attach(@CurrentViewer() v: AuthedViewer, @GrantedScopes() s: Scope[], @Param('id') id: string, @UploadedFile() file: IncomingFile | undefined) {
    return this.projects.addAttachment(v, s, id, file);
  }
}
