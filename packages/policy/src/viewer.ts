import type { Role } from '@opshub/shared';

/** The authenticated user a response is being shaped for. */
export interface Viewer {
  userId: string;
  roles: readonly Role[];
  teamId: string | null;
}

/** Facts about the record that change what a viewer may see. */
export interface RecordContext {
  /** Assigned PM of the client this record belongs to. Missing means "not the viewer's client". */
  clientPmId?: string | null;
  /** Contact role, for the Accounts "billing contact only" rule. */
  contactRole?: string | null;
}

export const VIEWER_CLASSES = [
  'ADMIN',
  'PM_OWN',
  'PM_OTHER',
  'TEAM_LEADER',
  'TEAM_MEMBER',
  'ACCOUNTS',
  'HR',
] as const;
export type ViewerClass = (typeof VIEWER_CLASSES)[number];

/**
 * A person with several roles sits in several classes; the most permissive wins per field.
 * PM_OWN applies only when the viewer is the client's assigned PM (PRD edge case).
 */
export function viewerClasses(viewer: Viewer | null, ctx: RecordContext = {}): ViewerClass[] {
  if (!viewer) return [];
  const out: ViewerClass[] = [];
  for (const role of viewer.roles) {
    switch (role) {
      case 'ADMIN':
        out.push('ADMIN');
        break;
      case 'PM':
        out.push(ctx.clientPmId && ctx.clientPmId === viewer.userId ? 'PM_OWN' : 'PM_OTHER');
        break;
      case 'TEAM_LEADER':
        out.push('TEAM_LEADER');
        break;
      case 'TEAM_MEMBER':
        out.push('TEAM_MEMBER');
        break;
      case 'ACCOUNTS':
        out.push('ACCOUNTS');
        break;
      case 'HR':
        out.push('HR');
        break;
    }
  }
  return out;
}
