// Run by `pnpm test:e2e` before Playwright: migrate and seed the e2e database, build the web app
// into .next-e2e. Non-destructive: the e2e database keeps earlier runs' data; tests use unique names.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { API_URL, childEnv, root } from './env.mts';

const run = (args: string[], cwd: string, extra: Record<string, string> = {}) =>
  execFileSync('pnpm', args, { cwd, stdio: 'inherit', env: childEnv(extra) });

run(['exec', 'prisma', 'migrate', 'deploy'], resolve(root, 'packages/db'));
run(['exec', 'tsx', 'src/seed.ts'], resolve(root, 'packages/db'));
run(['exec', 'tsx', 'src/seed/run-demo.ts'], resolve(root, 'apps/api'), { NODE_ENV: 'test' });
run(['exec', 'next', 'build'], resolve(root, 'apps/web'), { NEXT_DIST_DIR: '.next-e2e', API_URL, NODE_ENV: 'production' });
