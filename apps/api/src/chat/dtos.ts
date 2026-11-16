// Phase 1F chat DTOs. Every property names a row in packages/policy fields.ts.
import { defineDto } from '@opshub/policy';

export const ChatChannelDto = defineDto('ChatChannel', {
  id: 'chatChannel.id',
  kind: 'chatChannel.kind',
  name: 'chatChannel.name',
  projectId: 'chatChannel.projectId',
  teamId: 'chatChannel.teamId',
  otherUserId: 'chatChannel.otherUserId',
  memberCount: 'chatChannel.memberCount',
  unread: 'chatChannel.unread',
  lastMessageAt: 'chatChannel.lastMessageAt',
  lastMessagePreview: 'chatChannel.lastMessagePreview',
});

export const ChatMessageDto = defineDto('ChatMessage', {
  id: 'chatMessage.id',
  channelId: 'chatMessage.channelId',
  authorId: 'chatMessage.authorId',
  authorName: 'chatMessage.authorName',
  body: 'chatMessage.body',
  mentions: 'chatMessage.mentions',
  createdAt: 'chatMessage.createdAt',
});

export const ChatHistoryDto = defineDto('ChatHistory', {
  channel: 'chatHistory.channel',
  messages: 'chatHistory.messages',
  nextBefore: 'chatHistory.nextBefore',
});

export const MentionOptionDto = defineDto('MentionOption', {
  type: 'mentionOption.type',
  id: 'mentionOption.id',
  label: 'mentionOption.label',
  hint: 'mentionOption.hint',
});
