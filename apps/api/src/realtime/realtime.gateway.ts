// Realtime (TechSpec 6.2): Socket.IO namespace /rt, one room per user. Connections authenticate
// with the session cookie and must come from the app's origin. Every payload is serialized for
// its one recipient by the Policy Serializer (RealtimeService), so each socket gets its own
// masked copy; nothing is broadcast to shared rooms.
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { serializeForViewer, type Presentable, type UnmaskedView } from '@opshub/policy';
import { REALTIME_EVENTS, REALTIME_PATH, SESSION_COOKIE } from '@opshub/shared';
import type { Namespace, Socket } from 'socket.io';
import { AuditService } from '../audit/audit.service';
import { SessionService } from '../auth/session.service';
import type { AuthedViewer } from '../common/request';
import { ENV, type Env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

export { REALTIME_PATH };

/** Events (TechSpec 6.2) this phase emits. Each is in the masking crawler (test/masking/sockets). */
export const SOCKET_EVENTS = REALTIME_EVENTS;
export type SocketEvent = (typeof SOCKET_EVENTS)[number];

const cookieValue = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
    ?.slice(name.length + 1);

@WebSocketGateway({ namespace: '/rt', path: REALTIME_PATH, serveClient: false })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly log = new Logger('Realtime');
  @WebSocketServer() server!: Namespace;

  constructor(
    private readonly sessions: SessionService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async handleConnection(socket: Socket) {
    const origin = socket.handshake.headers.origin;
    const allowed = [this.env.APP_URL, this.env.API_URL].map((u) => new URL(u).origin);
    if (origin && !allowed.includes(origin)) return socket.disconnect(true);
    const resolved = await this.sessions.resolve(decodeURIComponent(cookieValue(socket.handshake.headers.cookie, SESSION_COOKIE) ?? ''));
    if (!resolved) return socket.disconnect(true);
    socket.data.userId = resolved.viewer.userId;
    await socket.join(`user:${resolved.viewer.userId}`);
  }

  get ready() {
    return Boolean(this.server);
  }

  logError(event: string, err: unknown) {
    this.log.warn({ event, error: err instanceof Error ? err.name : 'Error' });
  }
}

@Injectable()
export class RealtimeService {
  constructor(
    private readonly gateway: RealtimeGateway,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async viewer(userId: string): Promise<AuthedViewer | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, roles: true, teamId: true, active: true, name: true, email: true } });
    return u?.active ? { userId: u.id, roles: u.roles, teamId: u.teamId, name: u.name, email: u.email } : null;
  }

  /**
   * Sends one event to one person, shaped for them. `build` gets that person's viewer, so data
   * that depends on who is looking (scopes, mention labels) is built per recipient too.
   */
  async emitTo(userId: string, event: SocketEvent, build: (v: AuthedViewer) => Promise<Presentable | null>): Promise<void> {
    if (!this.gateway.ready) return;
    try {
      const v = await this.viewer(userId);
      if (!v) return;
      const presentable = await build(v);
      if (!presentable) return;
      const unmasked: UnmaskedView[] = [];
      const payload = await serializeForViewer(presentable, v, { onUnmasked: (view) => unmasked.push(view) });
      if (unmasked.length) await this.audit.recordUnmasked(v.userId, unmasked, `socket:${event}`);
      this.gateway.server.to(`user:${userId}`).emit(event, payload);
    } catch (err) {
      this.gateway.logError(event, err);
    }
  }
}
