// packages/shared mirrors the Prisma enums for code that must not import Prisma (the web app).
import { $Enums } from '@prisma/client';
import * as shared from '@opshub/shared';
import { describe, expect, it } from 'vitest';

const PAIRS: Array<[keyof typeof $Enums, readonly string[]]> = [
  ['Role', shared.ROLES],
  ['Department', shared.DEPARTMENTS],
  ['StatusType', shared.STATUS_TYPES],
  ['ProjectType', shared.PROJECT_TYPES],
  ['Health', shared.HEALTHS],
  ['Priority', shared.PRIORITIES],
  ['TaskType', shared.TASK_TYPES],
  ['TaskSource', shared.TASK_SOURCES],
  ['Channel', shared.CHANNELS],
  ['Direction', shared.DIRECTIONS],
  ['TriageState', shared.TRIAGE_STATES],
  ['BillingReason', shared.BILLING_REASONS],
  ['BillingStatus', shared.BILLING_STATUSES],
  ['ClientStatus', shared.CLIENT_STATUSES],
  ['StopReason', shared.STOP_REASONS],
];

describe('shared enums match the Prisma schema', () => {
  it.each(PAIRS)('%s', (name, values) => {
    expect([...values].sort()).toEqual(Object.values($Enums[name]).sort());
  });
});
