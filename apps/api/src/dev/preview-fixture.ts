// Invented Demo Co data for the dev policy preview and the masking contract suite.
// Every value here is fake (AGENTS.md rule 9). `visibleTo` is what TechSpec 5.3 allows.
import type { ViewerClass } from '@opshub/policy';

export const DEMO_CLIENT = {
  id: 'demo-client',
  companyName: 'Demo Co',
  website: 'demo.example.com',
  contractValue: '2417350.00',
  taxId: '27AAAPD1234C1ZV',
};

export const DEMO_CONTACTS = [
  {
    id: 'demo-contact-marketing',
    role: 'MARKETING',
    label: 'Marketing contact',
    name: 'Priya Demo',
    email: 'priya@demo.example.com',
    phone: '+91 98200 12345',
  },
  {
    id: 'demo-contact-billing',
    role: 'BILLING',
    label: 'Billing contact',
    name: 'Arjun Demo',
    email: 'billing@demo.example.com',
    phone: '+971 50 765 4321',
  },
] as const;

export const DEMO_MESSAGE = {
  id: 'demo-message-1',
  from: 'priya@demo.example.com',
  body:
    'Hi team, please swap the homepage banner for the Diwali offer.\n' +
    'Call me on +91 98200 12345 or write to priya@demo.example.com.\n' +
    'Hosting login - username: demoadmin password: Hunter2!',
};

export const DEMO_BILLING = { id: 'demo-billing-1', reason: 'ADDITIONAL_TASK', amount: '15750.00', currency: 'INR' };

export const DEMO_LEAVE = {
  id: 'demo-leave-1',
  userName: 'Manoj Member',
  startDate: '2026-11-03',
  endDate: '2026-11-05',
  reason: 'Dental surgery recovery',
};

/** Restricted strings the masking crawler searches for in every response. */
export const SENSITIVE_FIXTURES: Array<{
  what: string;
  needle: string;
  visibleTo: ViewerClass[];
  /** Another spelling of a value served in a different format; never expected in a response. */
  alternateForm?: boolean;
}> = [
  { what: 'marketing contact email', needle: 'priya@demo.example.com', visibleTo: ['ADMIN', 'PM_OWN'] },
  { what: 'marketing contact phone', needle: '98200 12345', visibleTo: ['ADMIN', 'PM_OWN'] },
  { what: 'marketing contact phone digits', needle: '9820012345', visibleTo: ['ADMIN', 'PM_OWN'], alternateForm: true },
  { what: 'marketing contact name', needle: 'Priya Demo', visibleTo: ['ADMIN', 'PM_OWN'] },
  { what: 'billing contact email', needle: 'billing@demo.example.com', visibleTo: ['ADMIN', 'PM_OWN', 'ACCOUNTS'] },
  { what: 'billing contact phone', needle: '765 4321', visibleTo: ['ADMIN', 'PM_OWN', 'ACCOUNTS'] },
  { what: 'billing contact name', needle: 'Arjun Demo', visibleTo: ['ADMIN', 'PM_OWN', 'ACCOUNTS'] },
  { what: 'hosting password', needle: 'Hunter2', visibleTo: ['ADMIN', 'PM_OWN'] },
  { what: 'hosting username', needle: 'demoadmin', visibleTo: ['ADMIN', 'PM_OWN'] },
  { what: 'contract value', needle: '2417350', visibleTo: ['ADMIN', 'PM_OWN'] },
  { what: 'tax id', needle: '27AAAPD1234C1ZV', visibleTo: ['ADMIN', 'PM_OWN', 'ACCOUNTS'] },
  { what: 'billing amount', needle: '15750', visibleTo: ['ADMIN', 'PM_OWN', 'ACCOUNTS'] },
  { what: 'leave reason', needle: 'Dental surgery', visibleTo: ['ADMIN', 'HR'] },
  // Demo Co project values (apps/api/src/seed/demo-seed.ts); Demo Co's PM is pm@dev.local.
  // Decimals serialize without trailing zeros ("45000"), so match the bare number.
  { what: 'SEO project value', needle: '45000', visibleTo: ['ADMIN', 'PM_OWN'] },
  { what: 'AMC project value', needle: '60000', visibleTo: ['ADMIN', 'PM_OWN'] },
];
