import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@opshub/db';
import type { Response } from 'express';
import { AppError } from './errors';
import type { OpsRequest } from './request';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'RATE_LIMITED',
};

/** Every error leaves as { error: { code, message, requestId } } and never echoes input values. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<OpsRequest>();
    const res = http.getResponse<Response>();
    const { status, code, message } = this.describe(exception);

    if (status >= 500) {
      this.logger.error({ requestId: req.requestId, path: req.path, err: exception });
    }
    if (!res.headersSent) {
      res.status(status).json({ error: { code, message, requestId: req.requestId } });
    }
  }

  private describe(e: unknown): { status: number; code: string; message: string } {
    if (e instanceof AppError) return { status: e.getStatus(), code: e.code, message: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') return { status: 409, code: 'CONFLICT', message: 'A record with these details already exists' };
      if (e.code === 'P2025') return { status: 404, code: 'NOT_FOUND', message: 'Record not found' };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      if (status < 500) {
        // Framework messages (e.g. body parser) can quote input; use a generic one.
        const code = CODE_BY_STATUS[status] ?? 'BAD_REQUEST';
        return { status, code, message: code === 'NOT_FOUND' ? 'Not found' : 'Request could not be processed' };
      }
    }
    return { status: 500, code: 'INTERNAL', message: 'Something went wrong' };
  }
}
