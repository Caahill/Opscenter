// pnpm import:clickup --dry-run [--out ./import-report] [--mapping tools/clickup-import/mapping.yaml]
// Phase 1B: dry run only. Write mode (staging, then production) arrives with Phase 1G.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ClickUpClient, type ClickUpTask } from './clickup';
import { loadMapping, type Mapping } from './mapping';
import { buildPlan } from './plan';
import { writeReport } from './report';

const root = resolve(__dirname, '../../..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** TechSpec 7.4: re-read the hierarchy and stop if a mapped list id no longer matches. */
export async function verifyHierarchy(client: ClickUpClient, mapping: Mapping): Promise<void> {
  const spaces = await client.spaces(mapping.workspace.teamId);
  if (!spaces.some((s) => s.id === mapping.workspace.spaceId)) {
    throw new Error(`Space ${mapping.workspace.spaceId} (${mapping.workspace.spaceName}) not found in workspace ${mapping.workspace.teamId}`);
  }
  const folders = await client.folders(mapping.workspace.spaceId);
  const lists = new Map<string, string>();
  for (const f of folders) for (const l of f.lists) lists.set(l.id, l.name);
  for (const l of await client.folderlessLists(mapping.workspace.spaceId)) lists.set(l.id, l.name);
  const missing = mapping.lists.filter((l) => !lists.has(l.id));
  if (missing.length) {
    throw new Error(`These mapped lists no longer exist in ClickUp; update mapping.yaml:\n${missing.map((l) => `  ${l.id} ${l.name}`).join('\n')}`);
  }
}

export async function dryRun(client: ClickUpClient, mapping: Mapping, outDir: string, log = console.warn) {
  await verifyHierarchy(client, mapping);
  const tasksByList = new Map<string, ClickUpTask[]>();
  for (const list of mapping.lists) {
    const tasks = await client.tasks(list.id);
    log(`${list.name}: ${tasks.length} tasks`);
    tasksByList.set(list.id, tasks);
  }
  const plan = buildPlan(mapping, tasksByList);
  const files = writeReport(plan, outDir, { generatedAt: new Date().toISOString(), lists: mapping.lists.length });
  log(`Report written to ${outDir}: ${files.join(', ')}`);
  return plan;
}

async function main() {
  if (!process.argv.includes('--dry-run')) {
    console.error('Only --dry-run is available in Phase 1B. The real import runs against staging, then production, in Phase 1G.');
    process.exit(2);
  }
  const token = process.env.CLICKUP_TOKEN;
  if (!token) {
    console.error('Set CLICKUP_TOKEN (a personal API token from an Admin account, for the import window only).');
    process.exit(2);
  }
  const mapping = loadMapping(arg('--mapping') ?? resolve(__dirname, '../mapping.yaml'));
  const outDir = resolve(process.env.INIT_CWD ?? process.cwd(), arg('--out') ?? 'import-report');
  await dryRun(new ClickUpClient(token), mapping, outDir);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
