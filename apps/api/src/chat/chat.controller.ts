import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { present } from '@opshub/policy';
import {
  ChatHistoryQuery,
  ChatMessageInput,
  CreateGroupInput,
  DirectChannelInput,
  GroupMembersInput,
  MentionSearchQuery,
  RenameGroupInput,
  type ChatHistoryQuery as ChatHistory,
  type ChatMessageInput as ChatMessage,
  type CreateGroupInput as CreateGroup,
  type DirectChannelInput as DirectChannel,
  type GroupMembersInput as GroupMembers,
  type RenameGroupInput as RenameGroup,
  type MentionSearchQuery as MentionSearch,
} from '@opshub/shared';
import { Authenticated, CurrentViewer } from '../auth/access.decorators';
import type { AuthedViewer } from '../common/request';
import { ZodPipe } from '../common/zod.pipe';
import { AckDto } from '../policy/dtos';
import { ChatService } from './chat.service';

/** Every signed-in person chats; what they can open is decided by channel membership (chat.service). */
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('channels')
  @Authenticated()
  channels(@CurrentViewer() v: AuthedViewer) {
    return this.chat.channels(v);
  }

  @Post('direct')
  @Authenticated()
  direct(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(DirectChannelInput)) body: DirectChannel) {
    return this.chat.direct(v, body.userId);
  }

  @Post('groups')
  @Authenticated()
  createGroup(@CurrentViewer() v: AuthedViewer, @Body(new ZodPipe(CreateGroupInput)) body: CreateGroup) {
    return this.chat.createGroup(v, body.name, body.memberIds);
  }

  @Patch('channels/:id')
  @Authenticated()
  renameGroup(@CurrentViewer() v: AuthedViewer, @Param('id') id: string, @Body(new ZodPipe(RenameGroupInput)) body: RenameGroup) {
    return this.chat.renameGroup(v, id, body.name);
  }

  @Post('channels/:id/members')
  @Authenticated()
  addMembers(@CurrentViewer() v: AuthedViewer, @Param('id') id: string, @Body(new ZodPipe(GroupMembersInput)) body: GroupMembers) {
    return this.chat.addMembers(v, id, body.userIds);
  }

  @Delete('channels/:id/members/me')
  @Authenticated()
  async leaveGroup(@CurrentViewer() v: AuthedViewer, @Param('id') id: string) {
    await this.chat.leaveGroup(v, id);
    return present(AckDto, { ok: true });
  }

  @Get('channels/:id/messages')
  @Authenticated()
  history(@CurrentViewer() v: AuthedViewer, @Param('id') id: string, @Query(new ZodPipe(ChatHistoryQuery)) q: ChatHistory) {
    return this.chat.history(v, id, q);
  }

  @Post('channels/:id/messages')
  @Authenticated()
  post(@CurrentViewer() v: AuthedViewer, @Param('id') id: string, @Body(new ZodPipe(ChatMessageInput)) body: ChatMessage) {
    return this.chat.post(v, id, body.body);
  }

  @Post('channels/:id/read')
  @Authenticated()
  async read(@CurrentViewer() v: AuthedViewer, @Param('id') id: string) {
    await this.chat.read(v, id);
    return present(AckDto, { ok: true });
  }

  @Get('mention-options')
  @Authenticated()
  mentionOptions(@CurrentViewer() v: AuthedViewer, @Query(new ZodPipe(MentionSearchQuery)) q: MentionSearch) {
    return this.chat.mentionOptions(v, q.q);
  }
}
