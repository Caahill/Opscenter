import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import type pino from 'pino';
import type { OpsRequest } from './request';

const SAFE_ID = /^[\w-]{8,64}$/;

export function requestId() {
  return (req: OpsRequest, res: Response, next: NextFunction) => {
    const incoming = req.header('x-request-id');
    req.requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  };
}

/** Logs method, path, status and timing. Never bodies or query strings (AGENTS.md "Do not"). */
export function accessLog(logger: pino.Logger) {
  return (req: OpsRequest, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Number((process.hrtime.bigint() - start) / 1_000_000n),
        userId: req.viewer?.userId,
      });
    });
    next();
  };
}

/**
 * Cookie sessions are SameSite=Lax; as a second layer, state-changing requests that carry an
 * Origin header must come from the app itself.
 */
export function originCheck(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins.map((o) => new URL(o).origin));
  return (req: OpsRequest, res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/api/v1/webhooks/')) {
      return next();
    }
    const origin = req.header('origin');
    if (origin && !allowed.has(origin)) {
      res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Cross-site request blocked', requestId: req.requestId },
      });
      return;
    }
    next();
  };
}
