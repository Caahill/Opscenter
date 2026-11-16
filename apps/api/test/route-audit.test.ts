// Deny by default (AGENTS.md rule 2): a route without an access rule stops the app from starting.
import { Controller, Get } from '@nestjs/common';
import { present } from '@opshub/policy';
import { describe, expect, it } from 'vitest';
import { Public } from '../src/auth/access.decorators';
import { AckDto } from '../src/policy/dtos';
import { startApp } from './helpers';

@Controller('forgotten')
class ForgottenController {
  @Get()
  leak() {
    return { email: 'priya@demo.example.com' };
  }
}

@Controller('raw')
class RawController {
  @Get()
  @Public()
  raw() {
    return { email: 'priya@demo.example.com' };
  }

  @Get('ok')
  @Public()
  ok() {
    return present(AckDto, { ok: true });
  }
}

describe('route audit', () => {
  it('refuses to boot when a route has no @Requires/@Authenticated/@Public', async () => {
    await expect(startApp({ controllers: [ForgottenController] })).rejects.toThrow(
      /Routes without @Requires.*\n.*GET \/api\/v1\/forgotten/,
    );
  });

  it('refuses to send a raw object instead of a DTO', async () => {
    const ctx = await startApp({ controllers: [RawController] });
    try {
      const res = await ctx.http().get('/api/v1/raw').expect(500);
      expect(res.body.error.code).toBe('UNSERIALIZABLE_RESPONSE');
      expect(JSON.stringify(res.body)).not.toContain('priya');
      await ctx.http().get('/api/v1/raw/ok').expect(200, { ok: true });
    } finally {
      await ctx.close();
    }
  });
});
