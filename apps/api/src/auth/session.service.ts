import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { SESSION_COOKIE, SESSION_IDLE_MS, SESSION_TOUCH_MS, type Role } from '@opshub/shared';
import type { CookieOptions, Response } from 'express';
import { ENV, type Env } from '../config/env';
import type { AuthedViewer } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';

const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async create(userId: string, userAgent?: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { id: sha256(token), userId, userAgent: userAgent?.slice(0, 200) },
    });
    return token;
  }

  /** Active session and user, or null if revoked, idle for 12 h, or the user is deactivated. */
  async resolve(token: string | undefined): Promise<{ sessionId: string; viewer: AuthedViewer } | null> {
    if (!token) return null;
    const id = sha256(token);
    const session = await this.prisma.session.findUnique({ where: { id }, include: { user: true } });
    if (!session || session.revokedAt || !session.user.active) return null;
    const now = Date.now();
    if (now - session.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
    if (now - session.lastSeenAt.getTime() > SESSION_TOUCH_MS) {
      await this.prisma.session.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
    }
    const u = session.user;
    return {
      sessionId: id,
      viewer: { userId: u.id, name: u.name, email: u.email, roles: u.roles as Role[], teamId: u.teamId },
    };
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return count;
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }

  setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }

  clearCookie(res: Response): void {
    const { maxAge: _maxAge, ...opts } = this.cookieOptions();
    res.clearCookie(SESSION_COOKIE, opts);
  }
}
