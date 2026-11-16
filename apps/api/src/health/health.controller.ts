import { Controller, Get } from '@nestjs/common';
import { present } from '@opshub/policy';
import { Public } from '../auth/access.decorators';
import { HealthDto } from '../policy/dtos';
import { PrismaService } from '../prisma/prisma.service';

/** Uptime check target (Hosting guide 9). Served at /healthz, outside /api/v1. */
@Controller('healthz')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return present(HealthDto, { status: 'ok' });
  }
}
