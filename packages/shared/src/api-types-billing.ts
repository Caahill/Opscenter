// Phase 1E response shapes. Amounts reach the client's PM, Admin and Accounts only; nobody here
// ever receives the project value.
import type { BillingReason, BillingStatus, Department, StatusType } from './enums';
import type { ContactView } from './api-types-work';

export interface BillingTaskView {
  id: string;
  title: string;
  statusType: StatusType;
  billableConfirmed: boolean;
}

export interface BillingMessageView {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface BillingRequestView {
  id: string;
  clientId: string;
  clientName: string;
  projectId: string;
  department: Department;
  packageName: string | null;
  reason: BillingReason;
  description: string;
  amount?: string;
  currency: string;
  status: BillingStatus;
  invoiceNo: string | null;
  invoicedAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  raisedById: string;
  raisedByName: string | null;
  pmName: string | null;
  taskCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingRequestDetailView extends BillingRequestView {
  tasks: BillingTaskView[];
  messages: BillingMessageView[];
  /** The client's billing contact (Accounts sees it in full; PRD OQ4 default). */
  billingContact: ContactView | null;
  /** What the viewer may do: PROCESS (Accounts, Admin), EDIT and CANCEL (the client's PM while Requested). */
  can: string[];
}

export interface RenewalView {
  projectId: string;
  clientId: string;
  clientName: string;
  department: Department;
  packageName: string | null;
  type: string;
  endDate: string;
  daysLeft: number;
  pmId: string;
  pmName: string | null;
  currency: string;
  /** The renewal already billed for this term, if any. */
  billingRequestId: string | null;
}

/** Task billing state for the task page: the request that bills it, for those who may see billing. */
export interface TaskBillingView {
  requestId: string;
  status: BillingStatus;
}
