import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { serializeForViewer, UnserializableResponseError, type UnmaskedView } from '@opshub/policy';
import { mergeMap, type Observable } from 'rxjs';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/errors';
import type { OpsRequest } from '../common/request';

/**
 * Field check (TechSpec 5.1 step 2). Every response passes through packages/policy before it is
 * serialized; restricted fields are removed, masked or replaced by labels for this viewer.
 */
@Injectable()
export class PolicySerializerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('PolicySerializer');

  constructor(private readonly audit: AuditService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<OpsRequest>();
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        const views: UnmaskedView[] = [];
        let out: unknown;
        try {
          out = await serializeForViewer(body, req.viewer ?? null, { onUnmasked: (v) => views.push(v) });
        } catch (err) {
          if (err instanceof UnserializableResponseError) {
            this.logger.error({ requestId: req.requestId, path: req.path, err });
            throw new AppError(500, 'UNSERIALIZABLE_RESPONSE', 'Something went wrong');
          }
          throw err;
        }
        if (views.length > 0 && req.viewer) {
          await this.audit.recordUnmasked(req.viewer.userId, views, req.route?.path ?? req.path);
        }
        return out;
      }),
    );
  }
}
