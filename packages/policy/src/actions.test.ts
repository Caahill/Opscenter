import { describe, expect, it } from 'vitest';
import { ROLES } from '@opshub/shared';
import { permissionsFor, ROLE_GRANTS, scopesFor } from './actions';
import { sanitizeForLog } from './sensitive';

describe('action grants', () => {
  it('has an entry for every role', () => {
    expect(Object.keys(ROLE_GRANTS).sort()).toEqual([...ROLES].sort());
  });

  it('only Admin manages users, teams and reads the audit log', () => {
    for (const role of ROLES) {
      const allowed = role === 'ADMIN';
      expect(scopesFor([role], 'user.manage').length > 0).toBe(allowed);
      expect(scopesFor([role], 'team.manage').length > 0).toBe(allowed);
      expect(scopesFor([role], 'audit.read').length > 0).toBe(allowed);
    }
  });

  it('HR has no client access', () => {
    expect(scopesFor(['HR'], 'client.read')).toEqual([]);
  });

  it('unions scopes across roles', () => {
    expect(scopesFor(['TEAM_MEMBER', 'TEAM_LEADER'], 'client.read').sort()).toEqual([
      'ASSIGNED',
      'OWN_TEAM',
    ]);
    expect(permissionsFor(['HR'])).toEqual(['user.read', 'team.read', 'leave.read', 'leave.manage', 'holiday.manage', 'capacity.read', 'dashboard.hr']);
  });
});

describe('dashboards (PRD 6.1, 6.2)', () => {
  it('each role has its own dashboard; only Admin sees the business overview', () => {
    expect(scopesFor(['ADMIN'], 'dashboard.admin')).toEqual(['ALL']);
    expect(scopesFor(['PM'], 'dashboard.pm')).toEqual(['OWN_CLIENTS']);
    expect(scopesFor(['TEAM_LEADER'], 'dashboard.tl')).toEqual(['OWN_TEAM']);
    expect(scopesFor(['ACCOUNTS'], 'dashboard.accounts')).toEqual(['BILLING']);
    expect(scopesFor(['HR'], 'dashboard.hr')).toEqual(['PEOPLE']);
    for (const role of ['PM', 'TEAM_LEADER', 'TEAM_MEMBER', 'ACCOUNTS', 'HR'] as const) expect(scopesFor([role], 'dashboard.admin')).toEqual([]);
    expect(permissionsFor(['TEAM_MEMBER']).filter((a) => a.startsWith('dashboard.'))).toEqual([]);
  });
});

describe('billing (PRD access matrix: billing requests)', () => {
  it('PMs raise on their own clients, Accounts processes, TL and Members only flag tasks', () => {
    expect(scopesFor(['PM'], 'billing.create')).toEqual(['OWN_CLIENTS']);
    expect(scopesFor(['ACCOUNTS'], 'billing.create')).toEqual([]);
    expect(scopesFor(['ACCOUNTS'], 'billing.update')).toEqual(['BILLING']);
    for (const role of ['TEAM_LEADER', 'TEAM_MEMBER', 'HR'] as const) expect(scopesFor([role], 'billing.read')).toEqual([]);
  });
});

describe('inbox (PRD access matrix: client email and WhatsApp threads)', () => {
  it('HR has no inbox; only Admin manages mailboxes', () => {
    expect(scopesFor(['HR'], 'inbox.read')).toEqual([]);
    for (const role of ROLES) expect(scopesFor([role], 'mailbox.manage').length > 0).toBe(role === 'ADMIN');
  });

  it('reads: PM all, TL linked projects, Member linked tasks, Accounts billing threads', () => {
    expect(scopesFor(['PM'], 'inbox.read')).toEqual(['ALL']);
    expect(scopesFor(['TEAM_LEADER'], 'inbox.read')).toEqual(['OWN_TEAM']);
    expect(scopesFor(['TEAM_MEMBER'], 'inbox.read')).toEqual(['ASSIGNED']);
    expect(scopesFor(['ACCOUNTS'], 'inbox.read')).toEqual(['BILLING']);
  });

  it('PM or TL confirm triage; only PMs and Admin link unmatched senders', () => {
    for (const role of ROLES) {
      expect(scopesFor([role], 'inbox.triage').length > 0).toBe(['ADMIN', 'PM', 'TEAM_LEADER'].includes(role));
      expect(scopesFor([role], 'inbox.link').length > 0).toBe(['ADMIN', 'PM'].includes(role));
    }
  });
});

describe('leave, capacity and planner (PRD access matrix)', () => {
  it('only HR and Admin record leave and holidays', () => {
    for (const role of ROLES) {
      const allowed = role === 'ADMIN' || role === 'HR';
      expect(scopesFor([role], 'leave.manage').length > 0).toBe(allowed);
      expect(scopesFor([role], 'holiday.manage').length > 0).toBe(allowed);
    }
  });

  it('leave: Admin and PM all, TL own team, Member own, Accounts none', () => {
    expect(scopesFor(['PM'], 'leave.read')).toEqual(['ALL']);
    expect(scopesFor(['TEAM_LEADER'], 'leave.read')).toEqual(['OWN_TEAM']);
    expect(scopesFor(['TEAM_MEMBER'], 'leave.read')).toEqual(['ASSIGNED']);
    expect(scopesFor(['ACCOUNTS'], 'leave.read')).toEqual([]);
  });

  it('capacity for everyone but Accounts; the weekly plan for PM and TL only', () => {
    expect(scopesFor(['ACCOUNTS'], 'capacity.read')).toEqual([]);
    expect(scopesFor(['TEAM_MEMBER'], 'capacity.read')).toEqual(['ASSIGNED']);
    expect(scopesFor(['HR'], 'capacity.read')).toEqual(['PEOPLE']);
    for (const role of ['TEAM_MEMBER', 'ACCOUNTS', 'HR'] as const) {
      expect(scopesFor([role], 'planner.read')).toEqual([]);
      expect(scopesFor([role], 'planner.manage')).toEqual([]);
    }
    expect(scopesFor(['TEAM_LEADER'], 'planner.manage')).toEqual(['OWN_TEAM']);
  });
});

describe('sanitizeForLog', () => {
  it('drops sensitive keys and masks strings', () => {
    expect(
      sanitizeForLog({
        userId: 'u1',
        email: 'priya@demo.example.com',
        nested: { password: 'x', note: 'call +91 98200 12345' },
      }),
    ).toEqual({ userId: 'u1', nested: { note: 'call [phone hidden]' } });
  });
});
