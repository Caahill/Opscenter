import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { present } from '@opshub/policy';
import {
  ChatHistoryQuery,
  ChatMessageInput,
  DirectChannelInput,
  MentionSearchQuery,
  type ChatHistoryQuery as ChatHistory,
  type ChatMessageInput as ChatMessage,
  type DirectChannelInput as DirectChannel,
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
