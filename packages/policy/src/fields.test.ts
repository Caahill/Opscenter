import { describe, expect, it } from 'vitest';
import { FIELD_POLICY, resolveVisibility, type FieldKey } from './fields';
import type { Viewer } from './viewer';
import type { Role } from '@opshub/shared';

const PM_ID = 'u_pm';
const v = (roles: Role[], userId = 'u_other'): Viewer => ({ userId, roles, teamId: null });

const admin = v(['ADMIN']);
const pmOwn = v(['PM'], PM_ID);
const pmOther = v(['PM']);
const tl = v(['TEAM_LEADER']);
const member = v(['TEAM_MEMBER']);
const accounts = v(['ACCOUNTS']);
const hr = v(['HR']);
const ctx = { clientPmId: PM_ID };

// TechSpec 5.3, row by row.
const TABLE: Array<[FieldKey, string[]]> = [
  ['client.companyName', ['full', 'full', 'full', 'full', 'full', 'full', 'none']],
  ['client.contractValue', ['full', 'full', 'none', 'none', 'none', 'none', 'none']],
  ['project.value', ['full', 'full', 'none', 'none', 'none', 'none', 'none']],
  ['client.taxId', ['full', 'full', 'none', 'none', 'none', 'full', 'none']],
  ['client.emailDomains', ['full', 'full', 'none', 'none', 'none', 'none', 'none']],
  ['contact.email', ['full', 'full', 'label', 'label', 'label', 'none', 'none']],
  ['communication.from', ['full', 'full', 'label', 'label', 'label', 'label', 'none']],
  ['communication.body', ['full', 'full', 'masked', 'masked', 'masked', 'masked', 'none']],
  ['billingRequest.amount', ['full', 'full', 'none', 'none', 'none', 'amount', 'none']],
  ['leave.reason', ['full', 'none', 'none', 'none', 'none', 'none', 'full']],
  ['leave.kind', ['full', 'none', 'none', 'none', 'none', 'none', 'full']],
  ['leave.startDate', ['full', 'full', 'full', 'full', 'full', 'full', 'full']],
  ['billingRequest.description', ['full', 'full', 'none', 'none', 'none', 'full', 'none']],
  ['renewal.endDate', ['full', 'full', 'full', 'full', 'full', 'full', 'none']],
  ['communication.subject', ['full', 'full', 'masked', 'masked', 'masked', 'masked', 'none']],
  ['communication.cc', ['full', 'full', 'label', 'label', 'label', 'label', 'none']],
  ['thread.sender', ['full', 'full', 'full', 'full', 'full', 'full', 'none']],
  ['planner.tasks', ['full', 'full', 'full', 'full', 'full', 'full', 'none']],
  ['credential.secret', ['full', 'full', 'none', 'none', 'none', 'none', 'none']],
  ['chatMessage.body', ['full', 'full', 'full', 'full', 'full', 'full', 'full']],
  ['dashboard.unanswered', ['full', 'full', 'full', 'full', 'full', 'full', 'none']],
  ['dashboard.billingPending', ['full', 'none', 'none', 'none', 'none', 'none', 'none']],
  ['dashboard.billingByStatus', ['full', 'none', 'none', 'none', 'none', 'full', 'none']],
  ['dashboard.outThisWeek', ['full', 'full', 'full', 'full', 'full', 'full', 'full']],
];

describe('field policy table', () => {
  it.each(TABLE)('%s', (field, expected) => {
    const got = [admin, pmOwn, pmOther, tl, member, accounts, hr].map((viewer) =>
      resolveVisibility(field, viewer, ctx),
    );
    expect(got).toEqual(expected);
  });

  it('Accounts sees billing contacts in full and no other contact', () => {
    expect(resolveVisibility('contact.email', accounts, { contactRole: 'BILLING' })).toBe('full');
    expect(resolveVisibility('contact.email', accounts, { contactRole: 'MARKETING' })).toBe('none');
  });

  it('a PM without record context is treated as another PM (fails closed)', () => {
    expect(resolveVisibility('contact.email', pmOwn)).toBe('label');
  });

  it('anonymous viewers get public fields only', () => {
    expect(resolveVisibility('user.name', null)).toBe('full');
    expect(resolveVisibility('client.companyName', null)).toBe('none');
  });
});

describe('multi-role viewers', () => {
  it('PM + Team Leader sees unmasked data only on their own clients', () => {
    const both = v(['PM', 'TEAM_LEADER'], PM_ID);
    expect(resolveVisibility('contact.email', both, ctx)).toBe('full');
    expect(resolveVisibility('contact.email', both, { clientPmId: 'someone_else' })).toBe('label');
  });

  it('Team Member + PM role still masked on another PM client', () => {
    const both = v(['TEAM_MEMBER', 'PM'], 'u_x');
    expect(resolveVisibility('communication.body', both, ctx)).toBe('masked');
  });
});

describe('table hygiene', () => {
  it('every restricted contact-data field is audited', () => {
    for (const key of ['contact.name', 'contact.email', 'contact.phone', 'credential.secret', 'project.value'] as const) {
      expect(FIELD_POLICY[key]).toHaveProperty('audit', true);
    }
  });
});
