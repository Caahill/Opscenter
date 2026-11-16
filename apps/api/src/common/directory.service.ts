import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Staff display names for ids on records (PMs, assignees, authors). */
@Injectable()
export class DirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async names(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }
}
