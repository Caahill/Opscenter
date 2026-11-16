import { describe, expect, it } from 'vitest';
import { PACKAGES, PIPELINES, PROJECT_TYPE_BY_DEPARTMENT } from './catalog';
import { SEED_USERS } from './seed-data';

describe('department catalog (PRD Department workflows)', () => {
  it('has a pipeline for all 9 departments, each ending in a DONE stage', () => {
    expect(Object.keys(PIPELINES)).toHaveLength(9);
    for (const stages of Object.values(PIPELINES)) {
      expect(stages.some((s) => s.statusType === 'DONE')).toBe(true);
      expect(new Set(stages.map((s) => s.name)).size).toBe(stages.length);
    }
  });

  it('never puts a person in a stage name', () => {
    const names = SEED_USERS.flatMap((u) => u.name.split(' ')).map((n) => n.toLowerCase());
    const people = [...names, 'pranita', 'pooja', 'utkarsha'];
    for (const stages of Object.values(PIPELINES)) {
      for (const s of stages) {
        const words = s.name.toLowerCase().split(/[^a-z]+/);
        expect(words.filter((w) => people.includes(w)), s.name).toEqual([]);
      }
    }
  });

  it('gives every retainer department a monthly cycle stage', () => {
    for (const [dept, type] of Object.entries(PROJECT_TYPE_BY_DEPARTMENT)) {
      const hasCycle = PIPELINES[dept as keyof typeof PIPELINES].some((s) => s.phase === 'CYCLE');
      expect(hasCycle, dept).toBe(type !== 'ONE_TIME');
    }
  });

  it('only references stages that exist in the package department pipeline', () => {
    for (const p of PACKAGES) {
      const stages = PIPELINES[p.department].map((s) => s.name);
      for (const t of p.setupTasks) if (t.stage) expect(stages, `${p.name}: ${t.title}`).toContain(t.stage);
    }
  });

  it('gives retainer packages monthly tasks', () => {
    for (const p of PACKAGES) {
      if (PROJECT_TYPE_BY_DEPARTMENT[p.department] !== 'ONE_TIME') expect(p.cycleTasks.length, p.name).toBeGreaterThan(0);
    }
  });
});
