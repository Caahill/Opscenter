import { describe, expect, it } from 'vitest';
import { mentionToken, parseMentions } from './schemas-chat';
import { workingHoursBetween } from './working-time';

const ist = (s: string) => new Date(`${s}+05:30`);

describe('working hours (Mon to Sat, 09:00 to 18:00 IST)', () => {
  it('counts only inside the working day', () => {
    expect(workingHoursBetween(ist('2026-11-10T10:00:00'), ist('2026-11-10T14:30:00'))).toBe(4.5);
    expect(workingHoursBetween(ist('2026-11-10T07:00:00'), ist('2026-11-10T10:00:00'))).toBe(1);
    expect(workingHoursBetween(ist('2026-11-10T17:00:00'), ist('2026-11-11T10:00:00'))).toBe(2);
  });

  it('skips Sundays and is zero backwards', () => {
    // Saturday 16:00 to Monday 11:00: 2 h on Saturday + 2 h on Monday.
    expect(workingHoursBetween(ist('2026-11-14T16:00:00'), ist('2026-11-16T11:00:00'))).toBe(4);
    expect(workingHoursBetween(ist('2026-11-10T12:00:00'), ist('2026-11-10T11:00:00'))).toBe(0);
  });
});

describe('chat mention tokens', () => {
  it('round-trips and de-duplicates', () => {
    const body = `Hi ${mentionToken('user', 'u1', 'Asha [Admin]')}, see ${mentionToken('task', 't1', 'Fix footer')} and ${mentionToken('user', 'u1', 'Asha')}`;
    expect(body).toContain('@[Asha Admin](user:u1)');
    expect(parseMentions(body)).toEqual([
      { type: 'user', id: 'u1' },
      { type: 'task', id: 't1' },
    ]);
  });
});
