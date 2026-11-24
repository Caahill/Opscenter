// Internal chat (PRD 5.1, 5.2, 5.5): direct messages, group chats people make themselves, a channel
// per team and an automatic channel per project. Members are SySpree staff only; clients never are. Access is membership, whatever the
// role: Admin does not read other people's direct messages. Mentions are re-resolved for each
// reader with their own permissions, so a link never shows what the reader could not open.
import { Injectable } from '@nestjs/common';
import type { ChatChannel, ChatMessage, Prisma } from '@opshub/db';
import { present, scopesFor, type Presentable } from '@opshub/policy';
import { DEPARTMENT_LABELS, MENTION_TOKEN, OPEN_STATUS_TYPES, parseMentions, type ChatHistoryQuery, type MentionType } from '@opshub/shared';
import { DirectoryService } from '../common/directory.service';
import { Errors } from '../common/errors';
import type { AuthedViewer } from '../common/request';
import { NotifyService } from '../notifications/notify.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../policy/scopes';
import { RealtimeService } from '../realtime/realtime.gateway';
import { scrub } from './scrub';
import { ChatChannelDto, ChatHistoryDto, ChatMessageDto, MentionOptionDto } from './dtos';

const OPEN = { notIn: ['DONE', 'STOPPED'] as Array<'DONE' | 'STOPPED'> };
type Mention = { type: MentionType; id: string };


@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scopes: ScopeService,
    private readonly directory: DirectoryService,
    private readonly notify: NotifyService,
    private readonly realtime: RealtimeService,
  ) {}

  // ---- Membership ----

  /** Projects a person works on: PM, the project's team, or an assignee on it. */
  private async projectWhere(v: AuthedViewer): Promise<Prisma.ProjectWhereInput> {
    const teamIds = await this.scopes.teamIds(v);
    return { statusType: OPEN, OR: [{ pmId: v.userId }, { teamId: { in: teamIds } }, { tasks: { some: { assigneeId: v.userId } } }] };
  }

  /** Team and project channels exist for everyone who belongs to them (created on first look). */
  private async ensureChannels(v: AuthedViewer) {
    const teamIds = await this.scopes.teamIds(v);
    const teams = await this.prisma.team.findMany({ where: { id: { in: teamIds } } });
    const projects = await this.prisma.project.findMany({ where: await this.projectWhere(v), include: { client: { select: { companyName: true } } }, take: 200 });
    await this.prisma.chatChannel.createMany({
      data: [
        ...teams.map((t) => ({ kind: 'TEAM', teamId: t.id, name: t.name })),
        ...projects.map((p) => ({ kind: 'PROJECT', projectId: p.id, name: `${p.client.companyName} · ${DEPARTMENT_LABELS[p.department]}` })),
      ],
      skipDuplicates: true,
    });
    return { teamIds, projectIds: projects.map((p) => p.id) };
  }

  private async canOpen(v: AuthedViewer, c: ChatChannel): Promise<boolean> {
    if (c.kind === 'DIRECT' || c.kind === 'GROUP') return Boolean(await this.prisma.chatMember.findUnique({ where: { channelId_userId: { channelId: c.id, userId: v.userId } } }));
    if (c.kind === 'TEAM') return (await this.scopes.teamIds(v)).includes(c.teamId!);
    return Boolean(await this.prisma.project.findFirst({ where: { AND: [{ id: c.projectId! }, await this.projectWhere(v)] }, select: { id: true } }));
  }

  /** Everyone in a channel now: who gets the live message and who may be mentioned. */
  async members(c: ChatChannel): Promise<string[]> {
    if (c.kind === 'DIRECT' || c.kind === 'GROUP') return (await this.prisma.chatMember.findMany({ where: { channelId: c.id } })).map((m) => m.userId);
    if (c.kind === 'TEAM') {
      const team = await this.prisma.team.findUnique({ where: { id: c.teamId! } });
      const users = await this.prisma.user.findMany({ where: { teamId: c.teamId!, active: true }, select: { id: true } });
      return [...new Set([...users.map((u) => u.id), ...(team?.leaderId ? [team.leaderId] : [])])];
    }
    const p = await this.prisma.project.findUnique({ where: { id: c.projectId! }, include: { team: { select: { leaderId: true } } } });
    if (!p) return [];
    const [teamUsers, assignees] = await Promise.all([
      p.teamId ? this.prisma.user.findMany({ where: { teamId: p.teamId, active: true }, select: { id: true } }) : [],
      this.prisma.task.findMany({ where: { projectId: p.id, assigneeId: { not: null } }, select: { assigneeId: true }, distinct: ['assigneeId'] }),
    ]);
    return [...new Set([p.pmId, ...(p.team?.leaderId ? [p.team.leaderId] : []), ...teamUsers.map((u) => u.id), ...assignees.map((a) => a.assigneeId!)])];
  }

  private async require(v: AuthedViewer, channelId: string): Promise<ChatChannel> {
    const c = await this.prisma.chatChannel.findUnique({ where: { id: channelId } });
    if (!c || !(await this.canOpen(v, c))) throw Errors.notFound('Channel');
    return c;
  }

  // ---- Channels ----

  async channels(v: AuthedViewer): Promise<Presentable[]> {
    const { teamIds, projectIds } = await this.ensureChannels(v);
    const rows = await this.prisma.chatChannel.findMany({
      where: { OR: [{ teamId: { in: teamIds } }, { projectId: { in: projectIds } }, { kind: { in: ['DIRECT', 'GROUP'] }, readers: { some: { userId: v.userId } } }] },
    });
    return Promise.all(rows.map((c) => this.presentChannel(v, c))).then((list) =>
      list.sort((a, b) => String((b.data as { lastMessageAt: Date | null }).lastMessageAt ?? '').localeCompare(String((a.data as { lastMessageAt: Date | null }).lastMessageAt ?? ''))),
    );
  }

  private async presentChannel(v: AuthedViewer, c: ChatChannel): Promise<Presentable> {
    const [read, last, members] = await Promise.all([
      this.prisma.chatMember.findUnique({ where: { channelId_userId: { channelId: c.id, userId: v.userId } } }),
      this.prisma.chatMessage.findFirst({ where: { channelId: c.id }, orderBy: { createdAt: 'desc' } }),
      this.members(c),
    ]);
    const unread = await this.prisma.chatMessage.count({ where: { channelId: c.id, authorId: { not: v.userId }, ...(read?.lastReadAt ? { createdAt: { gt: read.lastReadAt } } : {}) } });
    const other = c.kind === 'DIRECT' ? members.find((m) => m !== v.userId) ?? null : null;
    const [names, labels] = await Promise.all([this.directory.names([other, last?.authorId]), this.resolveMentions(v, last ? (last.mentions as unknown as Mention[]) : [])]);
    const preview = (body: string) => body.replace(MENTION_TOKEN, (_m, sigil: string, _label: string, type: string, id: string) => `${sigil}${labels.get(`${type}:${id}`)?.label ?? 'no access'}`);
    return present(ChatChannelDto, {
      id: c.id,
      kind: c.kind,
      name: c.kind === 'DIRECT' ? (names.get(other ?? '') ?? 'Direct message') : (c.name ?? ''),
      projectId: c.projectId,
      teamId: c.teamId,
      otherUserId: other,
      memberCount: members.length,
      memberIds: c.kind === 'GROUP' ? members : null,
      unread,
      lastMessageAt: last?.createdAt ?? null,
      lastMessagePreview: last ? `${names.get(last.authorId) ?? 'Someone'}: ${preview(last.body).slice(0, 80)}` : null,
    });
  }

  async direct(v: AuthedViewer, userId: string) {
    if (userId === v.userId) throw Errors.validation('userId: choose someone else');
    const other = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!other?.active) throw Errors.validation('userId: must be an active colleague');
    const directKey = [v.userId, userId].sort().join(':');
    const channel = await this.prisma.chatChannel.upsert({ where: { directKey }, update: {}, create: { kind: 'DIRECT', directKey } });
    await this.prisma.chatMember.createMany({ data: [{ channelId: channel.id, userId: v.userId }, { channelId: channel.id, userId }], skipDuplicates: true });
    return this.presentChannel(v, channel);
  }

  // ---- Groups ----

  /** Only active colleagues can be added to a group. */
  private async activeUserIds(ids: string[]): Promise<string[]> {
    const unique = [...new Set(ids)];
    const found = await this.prisma.user.findMany({ where: { id: { in: unique }, active: true }, select: { id: true } });
    if (found.length !== unique.length) throw Errors.validation('memberIds: every member must be an active colleague');
    return unique;
  }

  private async requireGroup(v: AuthedViewer, channelId: string): Promise<ChatChannel> {
    const c = await this.require(v, channelId);
    if (c.kind !== 'GROUP') throw Errors.validation('Only group chats can be changed this way');
    return c;
  }

  /** A group chat: the creator plus the colleagues they pick. Membership alone decides access. */
  async createGroup(v: AuthedViewer, name: string, memberIds: string[]) {
    const others = await this.activeUserIds(memberIds.filter((id) => id !== v.userId));
    if (others.length === 0) throw Errors.validation('memberIds: add at least one colleague');
    const channel = await this.prisma.chatChannel.create({ data: { kind: 'GROUP', name } });
    await this.prisma.chatMember.createMany({ data: [v.userId, ...others].map((userId) => ({ channelId: channel.id, userId, ...(userId === v.userId ? { lastReadAt: new Date() } : {}) })) });
    await this.announce(v, channel, `created the group "${name}"`, others);
    return this.presentChannel(v, channel);
  }

  async renameGroup(v: AuthedViewer, channelId: string, name: string) {
    const c = await this.requireGroup(v, channelId);
    const renamed = await this.prisma.chatChannel.update({ where: { id: c.id }, data: { name } });
    await this.announce(v, renamed, `renamed the group to "${name}"`);
    return this.presentChannel(v, renamed);
  }

  async addMembers(v: AuthedViewer, channelId: string, userIds: string[]) {
    const c = await this.requireGroup(v, channelId);
    const current = new Set(await this.members(c));
    const added = (await this.activeUserIds(userIds)).filter((id) => !current.has(id));
    if (added.length) {
      await this.prisma.chatMember.createMany({ data: added.map((userId) => ({ channelId: c.id, userId })), skipDuplicates: true });
      const names = await this.directory.names(added);
      await this.announce(v, c, `added ${added.map((id) => names.get(id) ?? 'a colleague').join(', ')}`, added);
    }
    return this.presentChannel(v, c);
  }

  /** Leaving removes the person's membership; they no longer see the group or its messages. */
  async leaveGroup(v: AuthedViewer, channelId: string) {
    const c = await this.requireGroup(v, channelId);
    await this.announce(v, c, 'left the group');
    await this.prisma.chatMember.delete({ where: { channelId_userId: { channelId: c.id, userId: v.userId } } });
  }

  /** A short line in the group from the person who made the change, sent live to every member. */
  private async announce(v: AuthedViewer, c: ChatChannel, text: string, notifyIds: string[] = []) {
    const msg = await this.prisma.chatMessage.create({ data: { channelId: c.id, authorId: v.userId, body: `_${text}_`, mentions: [] as unknown as Prisma.InputJsonValue } });
    if (notifyIds.length) {
      const author = (await this.directory.names([v.userId])).get(v.userId) ?? 'Someone';
      await this.notify.notify(notifyIds, { kind: 'MENTION', title: `${author} added you to "${c.name ?? 'a group'}"`, body: 'Open the chat to say hello.', link: `/chat/${c.id}` }, v.userId);
    }
    for (const userId of await this.members(c)) {
      await this.realtime.emitTo(userId, 'chat.message_new', async (viewer) => (await this.presentMessages(viewer, [msg]))[0]!);
    }
  }

  // ---- Messages ----

  /** Mention labels as this reader may see them; null where they could not open the record. */
  private async resolveMentions(v: AuthedViewer, mentions: Mention[]): Promise<Map<string, { label: string | null; href: string | null }>> {
    const ids = (t: MentionType) => mentions.filter((m) => m.type === t).map((m) => m.id);
    const can = (action: Parameters<typeof scopesFor>[1]) => scopesFor(v.roles, action);
    const [users, tasks, projects, clients] = await Promise.all([
      ids('user').length ? this.prisma.user.findMany({ where: { id: { in: ids('user') } }, select: { id: true, name: true } }) : [],
      ids('task').length && can('task.read').length
        ? this.prisma.task.findMany({ where: { AND: [{ id: { in: ids('task') } }, await this.scopes.taskWhere(v, can('task.read'))] }, select: { id: true, title: true } })
        : [],
      ids('project').length && can('project.read').length
        ? this.prisma.project.findMany({ where: { AND: [{ id: { in: ids('project') } }, await this.scopes.projectWhere(v, can('project.read'))] }, include: { client: { select: { companyName: true } } } })
        : [],
      ids('client').length && can('client.read').length
        ? this.prisma.client.findMany({ where: { AND: [{ id: { in: ids('client') } }, await this.scopes.clientWhere(v, can('client.read'))] }, select: { id: true, companyName: true } })
        : [],
    ]);
    const out = new Map<string, { label: string | null; href: string | null }>();
    for (const m of mentions) out.set(`${m.type}:${m.id}`, { label: null, href: null });
    for (const u of users) out.set(`user:${u.id}`, { label: u.name, href: null });
    for (const t of tasks) out.set(`task:${t.id}`, { label: t.title, href: `/tasks/${t.id}` });
    for (const p of projects) out.set(`project:${p.id}`, { label: `${p.client.companyName} · ${DEPARTMENT_LABELS[p.department]}`, href: `/projects/${p.id}` });
    for (const c of clients) out.set(`client:${c.id}`, { label: c.companyName, href: `/clients/${c.id}` });
    return out;
  }

  async presentMessages(v: AuthedViewer, rows: ChatMessage[]): Promise<Presentable[]> {
    const mentions = rows.flatMap((r) => r.mentions as unknown as Mention[]);
    const [resolved, names] = await Promise.all([this.resolveMentions(v, mentions), this.directory.names(rows.map((r) => r.authorId))]);
    return rows.map((r) =>
      present(ChatMessageDto, {
        id: r.id,
        channelId: r.channelId,
        authorId: r.authorId,
        authorName: names.get(r.authorId) ?? null,
        // The author's labels are replaced by the reader's; "no access" where they have none.
        body: r.body.replace(MENTION_TOKEN, (_m, sigil: string, _label: string, type: string, id: string) => `${sigil}[${resolved.get(`${type}:${id}`)?.label ?? 'no access'}](${type}:${id})`),
        mentions: (r.mentions as unknown as Mention[]).map((m) => ({ ...m, ...(resolved.get(`${m.type}:${m.id}`) ?? { label: null, href: null }) })),
        createdAt: r.createdAt,
      }),
    );
  }

  async history(v: AuthedViewer, channelId: string, q: ChatHistoryQuery) {
    const c = await this.require(v, channelId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { channelId, ...(q.before ? { createdAt: { lt: new Date(q.before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.limit + 1,
    });
    const page = rows.slice(0, q.limit).reverse();
    return present(ChatHistoryDto, {
      channel: await this.presentChannel(v, c),
      messages: await this.presentMessages(v, page),
      nextBefore: rows.length > q.limit ? page[0]!.createdAt : null,
    });
  }

  async post(v: AuthedViewer, channelId: string, raw: string) {
    const c = await this.require(v, channelId);
    const body = scrub(raw);
    const mentions = parseMentions(body);
    const msg = await this.prisma.chatMessage.create({ data: { channelId, authorId: v.userId, body, mentions: mentions as unknown as Prisma.InputJsonValue } });
    await this.markRead(v, channelId);
    const members = await this.members(c);
    const author = (await this.directory.names([v.userId])).get(v.userId) ?? 'Someone';
    const where = c.kind === 'DIRECT' ? 'a direct message' : c.kind === 'GROUP' ? `the group "${c.name ?? ''}"` : (c.name ?? 'chat');
    // Mentioned members are told; the text stays in the chat, where their own permissions apply.
    const mentioned = mentions.filter((m) => m.type === 'user' && members.includes(m.id)).map((m) => m.id);
    await this.notify.notify(mentioned, { kind: 'MENTION', title: `${author} mentioned you in ${where}`, body: 'Open the chat to reply.', link: `/chat/${c.id}` }, v.userId);
    for (const userId of members) {
      await this.realtime.emitTo(userId, 'chat.message_new', async (viewer) => (await this.presentMessages(viewer, [msg]))[0]!);
    }
    return (await this.presentMessages(v, [msg]))[0]!;
  }

  async markRead(v: AuthedViewer, channelId: string) {
    const lastReadAt = new Date();
    await this.prisma.chatMember.upsert({ where: { channelId_userId: { channelId, userId: v.userId } }, update: { lastReadAt }, create: { channelId, userId: v.userId, lastReadAt } });
  }

  async read(v: AuthedViewer, channelId: string) {
    await this.require(v, channelId);
    await this.markRead(v, channelId);
  }

  /** Unread messages across every channel the person is in (the Chat badge, the Member dashboard). */
  async unreadTotal(v: AuthedViewer): Promise<number> {
    const list = await this.channels(v);
    return list.reduce((n, c) => n + Number((c.data as { unread: number }).unread), 0);
  }

  /** Composer typeahead: people, and records the writer can open. */
  async mentionOptions(v: AuthedViewer, q: string) {
    const like = { contains: q, mode: 'insensitive' as const };
    const can = (action: Parameters<typeof scopesFor>[1]) => scopesFor(v.roles, action);
    const [users, tasks, projects, clients] = await Promise.all([
      this.prisma.user.findMany({ where: { active: true, name: like }, take: 6, orderBy: { name: 'asc' } }),
      can('task.read').length ? this.prisma.task.findMany({ where: { AND: [{ title: like, statusType: { in: [...OPEN_STATUS_TYPES] } }, await this.scopes.taskWhere(v, can('task.read'))] }, take: 5 }) : [],
      can('project.read').length
        ? this.prisma.project.findMany({ where: { AND: [{ client: { companyName: like }, statusType: OPEN }, await this.scopes.projectWhere(v, can('project.read'))] }, include: { client: { select: { companyName: true } } }, take: 5 })
        : [],
      can('client.read').length ? this.prisma.client.findMany({ where: { AND: [{ companyName: like }, await this.scopes.clientWhere(v, can('client.read'))] }, take: 5 }) : [],
    ]);
    return [
      ...users.map((u) => present(MentionOptionDto, { type: 'user', id: u.id, label: u.name, hint: null })),
      ...tasks.map((t) => present(MentionOptionDto, { type: 'task', id: t.id, label: t.title, hint: 'Task' })),
      ...projects.map((p) => present(MentionOptionDto, { type: 'project', id: p.id, label: `${p.client.companyName} · ${DEPARTMENT_LABELS[p.department]}`, hint: 'Project' })),
      ...clients.map((c) => present(MentionOptionDto, { type: 'client', id: c.id, label: c.companyName, hint: 'Client' })),
    ];
  }
}
