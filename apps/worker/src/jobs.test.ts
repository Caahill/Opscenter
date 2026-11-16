import { describe, expect, it, vi } from 'vitest';
import { JOBS, type JobContext } from './jobs';

describe('grants.expire', () => {
  it('revokes only unrevoked grants past expiry, stamped with the run time', async () => {
    const now = new Date('2026-10-26T10:00:00Z');
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    const ctx = { prisma: { credentialGrant: { updateMany } }, now: () => now } as unknown as JobContext;

    expect(await JOBS['grants.expire'].run(ctx, {})).toEqual({ revoked: 2 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { revokedAt: null, expiresAt: { lte: now } },
      data: { revokedAt: now },
    });
  });

  it('runs hourly; cycle generation runs daily at 00:30 IST', () => {
    expect(JOBS['grants.expire'].cron).toBe('0 * * * *');
    expect(JOBS['cycle.generate'].cron).toBe('30 0 * * *');
    expect(JOBS['search.reindex'].cron).toBe('0 3 * * *');
  });
});
