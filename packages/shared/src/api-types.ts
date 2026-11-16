// Response shapes as the browser receives them, after the Policy Serializer.
// Restricted fields are optional because the serializer omits them for viewers with `none`.
import type { Department, Role } from './enums';

export interface ApiError {
  error: { code: string; message: string; requestId: string };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface UserView {
  id: string;
  email: string;
  name: string;
  roles: Role[];
  teamId: string | null;
  weeklyCapacityH: string;
  skills: string[];
  timezone: string;
  location: string;
  active: boolean;
  createdAt: string;
}

export interface MeView extends UserView {
  teamName: string | null;
  permissions: string[];
}

export interface TeamView {
  id: string;
  name: string;
  department: Department;
  leaderId: string | null;
  memberCount: number;
}

export interface AuditLogView {
  id: string;
  actorId: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string;
  meta: Record<string, unknown>;
  at: string;
}

export interface DevUserView {
  id: string;
  name: string;
  email: string;
  roles: Role[];
}

export interface PolicyPreviewView {
  viewerClasses: string[];
  client: {
    companyName?: string;
    website?: string;
    contractValue?: string;
    taxId?: string;
  };
  contacts: Array<{
    id: string;
    role: string;
    label: string;
    name?: string;
    email?: string;
    phone?: string;
  }>;
  message: { id: string; from?: string; body?: string };
  billingRequest: { id: string; reason: string; amount?: string; currency: string };
  leave: { id: string; userName: string; startDate: string; endDate: string; reason?: string };
}
