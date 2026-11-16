// Dry-run behaviour on invented data (AGENTS.md rule 9: no real client data in fixtures).
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dryRun } from '../src/cli';
import { ClickUpClient, type ClickUpTask, type Fetcher } from '../src/clickup';
import { loadMapping, resolveStatus } from '../src/mapping';
import { clientKey, domainFromName } from '../src/normalize';
import { buildPlan } from '../src/plan';

const mapping = loadMapping(resolve(__dirname, '../mapping.yaml'));
const task = (id: string, name: string, status: string, extra: Partial<ClickUpTask> = {}): ClickUpTask => ({ id, name, status: { status }, ...extra });

describe('client names', () => {
  it.each([
    ['https://www.alpha-example.com.au/', 'alpha-example.com.au'],
    ['alpha-example.com.au', 'alpha-example.com.au'],
    ['http://Beta-Example.co.uk/services?x=1', 'beta-example.co.uk'],
    ['www.gamma.example', 'gamma.example'],
  ])('%s -> %s', (name, domain) => expect(domainFromName(name)).toBe(domain));

  it('falls back to a company key for names that are not URLs', () => {
    expect(domainFromName('Delta Traders Pvt Ltd')).toBeNull();
    expect(clientKey('Delta Traders Pvt. Ltd.').key).toBe(clientKey('delta traders').key);
  });
});

describe('status mapping (TechSpec 7.4)', () => {
  it('turns a person in a status name into an assignee hint', () => {
    expect(resolveStatus(mapping, 'SEO', 'Create Baseline - Utkarsha')).toMatchObject({ stage: 'Baseline report', assigneeHint: 'Utkarsha' });
    expect(resolveStatus(mapping, 'WEB_DEV', 'Mockup / Figma - Pranita')).toMatchObject({ stage: 'Design (Figma)', assigneeHint: 'Pranita' });
  });

  it('keeps Google Ads working stages open (ClickUp files them under Done)', () => {
    expect(resolveStatus(mapping, 'GOOGLE_ADS', 'Ads Live')).toMatchObject({ stage: 'Live optimisation', statusType: 'ACTIVE' });
  });

  it('treats every flavour of stopped work the same', () => {
    for (const s of ['Stop Work', 'Stopped Work', 'Project Stopped']) {
      expect(resolveStatus(mapping, 'SOCIAL_MEDIA', s)).toMatchObject({ statusType: 'STOPPED', stageUnknown: true });
    }
  });

  it('maps completion to the last Done stage of the department', () => {
    expect(resolveStatus(mapping, 'GRAPHIC_DESIGN', 'Complete')).toMatchObject({ stage: 'Final files delivered', statusType: 'DONE' });
  });

  it('reports statuses it does not know instead of guessing', () => {
    expect(resolveStatus(mapping, 'SEO', 'Something new')).toBeNull();
  });
});

describe('buildPlan', () => {
  const lists = new Map<string, ClickUpTask[]>([
    ['11936099', [task('a1', 'https://alpha-example.com.au/', 'Active AMC'), task('a2', 'alpha-example.com.au', 'Project Closed')]],
    ['9802117', [task('g1', 'www.alpha-example.com.au', 'Ads Live'), task('g2', 'beta.example', 'Mystery status')]],
    [
      '49349407',
      [
        task('s1', 'beta.example', 'Implementation - Pooja', {
          text_content: 'Contact owner@beta.example or +44 7700 900123\nWP login - username: betaadmin password: Tr0ub4dor!',
        }),
        task('s2', 'Kickoff notes', 'On Page', { parent: 's1' }),
      ],
    ],
  ]);
  const plan = buildPlan(mapping, lists);

  it('merges one client across lists by domain', () => {
    const alpha = plan.clients.find((c) => c.key === 'alpha-example.com.au')!;
    expect(alpha.projects).toBe(3);
    expect(alpha.lists.sort()).toEqual(['AMC', 'Google Ads']);
  });

  it('archives finished work and keeps subtasks off the project list', () => {
    expect(plan.projects.find((p) => p.taskId === 'a2')).toMatchObject({ archived: true, statusType: 'DONE' });
    expect(plan.projects.map((p) => p.taskId)).not.toContain('s2');
    expect(plan.subtasks).toBe(1);
  });

  it('collects unmapped statuses as gaps', () => {
    expect(plan.gaps).toEqual([{ listName: 'Google Ads', department: 'GOOGLE_ADS', clickupStatus: 'Mystery status', tasks: 1 }]);
  });

  it('finds contact details and logins, and previews them masked', () => {
    expect(plan.extractions.map((e) => e.kind).sort()).toEqual(['credential', 'email', 'phone']);
    const text = JSON.stringify(plan.extractions);
    expect(text).not.toContain('owner@beta.example');
    expect(text).not.toContain('900123');
    expect(text).not.toContain('Tr0ub4dor');
    expect(text).toContain('o***@beta.example');
  });
});

describe('dry run against a fake ClickUp', () => {
  function fakeClickUp(listIds: string[], tasks: Record<string, ClickUpTask[]>): Fetcher {
    return async (url) => {
      const path = url.replace('https://api.clickup.com/api/v2', '');
      let body: unknown;
      if (path.startsWith('/team/')) body = { spaces: [{ id: mapping.workspace.spaceId, name: mapping.workspace.spaceName }] };
      else if (path.includes('/folder?')) body = { folders: [{ id: 'f1', name: 'All', lists: listIds.map((id) => ({ id, name: id })) }] };
      else if (path.includes('/list?')) body = { lists: [] };
      else {
        const id = path.split('/')[2]!;
        const page = Number(new URL(`http://x${path}`).searchParams.get('page'));
        body = { tasks: page === 0 ? (tasks[id] ?? []) : [], last_page: true };
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => body };
    };
  }

  it('writes the four report files with masked values only', async () => {
    const ids = mapping.lists.map((l) => l.id);
    const client = new ClickUpClient('token', fakeClickUp(ids, { '49349407': [task('s1', 'beta.example', 'On Page', { text_content: 'pass: hunter2hunter2' })] }));
    const out = mkdtempSync(join(tmpdir(), 'opshub-import-'));
    await dryRun(client, mapping, out, () => {});
    expect(readFileSync(join(out, 'summary.md'), 'utf8')).toContain('Projects: 1');
    for (const f of ['mapping-gaps.csv', 'clients-dedup.csv', 'pii-extractions.csv', 'projects.csv']) {
      expect(readFileSync(join(out, f), 'utf8')).not.toContain('hunter2hunter2');
    }
    expect(readFileSync(join(out, 'pii-extractions.csv'), 'utf8')).toContain('[credential,');
  });

  it('stops when a mapped list no longer exists in ClickUp', async () => {
    const ids = mapping.lists.map((l) => l.id).filter((id) => id !== '7777694');
    const client = new ClickUpClient('token', fakeClickUp(ids, {}));
    await expect(dryRun(client, mapping, mkdtempSync(join(tmpdir(), 'opshub-import-')), () => {})).rejects.toThrow(/7777694 Web Development/);
  });
});
