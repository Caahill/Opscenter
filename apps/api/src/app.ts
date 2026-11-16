import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@opshub/shared';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import type { Env } from './config/env';
import { accessLog, originCheck, requestId } from './common/http.middleware';
import { createLogger, PinoNestLogger } from './logging/logger';
import { UNPREFIXED_PATHS } from './policy/route-audit';
import { RedisIoAdapter } from './realtime/redis-adapter';
import type { Type } from '@nestjs/common';

export async function createApp(env: Env, extra: { controllers?: Type[] } = {}): Promise<NestExpressApplication> {
  const logger = createLogger(env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env, extra), {
    logger: new PinoNestLogger(logger),
    bodyParser: false,
  });
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  // The raw bytes are kept for webhook signature checks (WhatsApp X-Hub-Signature-256).
  app.useBodyParser('json', {
    limit: '1mb',
    verify: (req: { rawBody?: Buffer }, _res: unknown, buf: Buffer) => {
      req.rawBody = buf;
    },
  });
  app.use(requestId());
  app.use(accessLog(logger));
  app.use(cookieParser());
  app.use(originCheck([env.APP_URL, env.API_URL]));
  app.setGlobalPrefix(API_PREFIX, { exclude: UNPREFIXED_PATHS });
  // Socket.IO fans out through Redis when it is reachable, so any API instance can reach a user.
  if (env.REDIS_URL && env.NODE_ENV !== 'test') {
    const adapter = new RedisIoAdapter(app);
    if (await adapter.connect(env.REDIS_URL)) app.useWebSocketAdapter(adapter);
  }
  app.enableShutdownHooks();
  return app;
}
