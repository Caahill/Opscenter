// Phase 1E inputs: billable flags, billing requests, Accounts processing and renewals.
import { z } from 'zod';
import { BILLING_REASONS, BILLING_STATUSES } from './enums';

const id = z.string().min(1).max(64);
const day = z.string().date();
const Money = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'must be an amount like 1200 or 1200.50');

/** TechSpec decision 4: INR by default, per request for the markets SySpree bills in. */
export const CURRENCIES = ['INR', 'AED', 'SAR', 'AUD', 'GBP', 'CAD', 'USD', 'NZD'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const MARKET_CURRENCY: Record<string, Currency> = { IN: 'INR', AE: 'AED', SA: 'SAR', AU: 'AUD', UK: 'GBP', CA: 'CAD', US: 'USD', NZ: 'NZD' };

export const BILLING_REASON_LABELS: Record<(typeof BILLING_REASONS)[number], string> = {
  ADDITIONAL_TASK: 'Additional work',
  RENEWAL: 'Renewal',
  NEW_PACKAGE: 'New package',
};

export const BILLING_STATUS_LABELS: Record<(typeof BILLING_STATUSES)[number], string> = {
  REQUESTED: 'Requested',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
};

export const FlagBillableInput = z.object({ note: z.string().trim().max(500).optional() });
export type FlagBillableInput = z.infer<typeof FlagBillableInput>;

export const ConfirmBillableInput = z.object({ decision: z.enum(['CONFIRM', 'REJECT']) });
export type ConfirmBillableInput = z.infer<typeof ConfirmBillableInput>;

export const CreateBillingRequestInput = z
  .object({
    projectId: id,
    reason: z.enum(BILLING_REASONS),
    description: z.string().trim().min(1).max(2000),
    amount: Money,
    currency: z.enum(CURRENCIES).optional(),
    /** Tasks this request bills; listing a flagged task confirms it. */
    taskIds: z.array(id).max(50).default([]),
  })
  .refine((v) => v.reason !== 'ADDITIONAL_TASK' || v.taskIds.length > 0, { message: 'taskIds: list the additional work being billed' })
  .refine((v) => v.reason !== 'RENEWAL', { message: 'reason: renewals are raised from the renewal (Renew)' });
export type CreateBillingRequestInput = z.infer<typeof CreateBillingRequestInput>;

/**
 * One PATCH for both sides (TechSpec 9.4). Accounts moves the status and records invoice details;
 * the PM edits or cancels while it is still Requested. The service checks who may do what.
 */
export const UpdateBillingRequestInput = z
  .object({
    status: z.enum(['INVOICED', 'PAID', 'CANCELLED']).optional(),
    invoiceNo: z.string().trim().min(1).max(60).optional(),
    invoicedAt: day.optional(),
    paidAt: day.optional(),
    cancelReason: z.string().trim().min(1).max(500).optional(),
    description: z.string().trim().min(1).max(2000).optional(),
    amount: Money.optional(),
    currency: z.enum(CURRENCIES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })
  .refine((v) => v.status !== 'INVOICED' || v.invoiceNo, { message: 'invoiceNo: needed to mark it invoiced' })
  .refine((v) => v.status !== 'CANCELLED' || v.cancelReason, { message: 'cancelReason: say why it is cancelled' });
export type UpdateBillingRequestInput = z.infer<typeof UpdateBillingRequestInput>;

export const ListBillingQuery = z.object({
  status: z.enum(BILLING_STATUSES).optional(),
  clientId: id.optional(),
  projectId: id.optional(),
});
export type ListBillingQuery = z.infer<typeof ListBillingQuery>;

export const BillingMessageInput = z.object({ body: z.string().trim().min(1).max(4000) });
export type BillingMessageInput = z.infer<typeof BillingMessageInput>;

/** PRD 4.3: the PM renews (raising a billing request and extending the term) or closes. */
export const RenewalDecisionInput = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('RENEW'),
    newEndDate: day,
    amount: Money,
    currency: z.enum(CURRENCIES).optional(),
    description: z.string().trim().max(2000).optional(),
  }),
  z.object({ decision: z.literal('CLOSE') }),
]);
export type RenewalDecisionInput = z.infer<typeof RenewalDecisionInput>;

export const ListRenewalsQuery = z.object({
  /** Days ahead; overdue renewals are always included. */
  within: z.coerce.number().int().min(1).max(365).default(30),
});
export type ListRenewalsQuery = z.infer<typeof ListRenewalsQuery>;
