import type { Request } from 'express';
import type { Role } from '@opshub/shared';
import type { Scope, Viewer } from '@opshub/policy';

export interface AuthedViewer extends Viewer {
  name: string;
  email: string;
  roles: Role[];
}

export interface OpsRequest extends Request {
  requestId: string;
  viewer?: AuthedViewer;
  /** Scopes the viewer holds for the route's @Requires action; services filter by these in SQL. */
  grantedScopes?: Scope[];
  sessionId?: string;
  /** Raw JSON body bytes, for webhook signature checks. */
  rawBody?: Buffer;
}
