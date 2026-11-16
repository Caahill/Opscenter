import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app';
import { loadEnv } from './config/env';

// Local runs read the repo-root .env; deployed environments inject variables directly.
const rootEnv = resolve(__dirname, '../../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

async function main() {
  const env = loadEnv();
  const app = await createApp(env);
  const port = Number(new URL(env.API_URL).port || 4000);
  await app.listen(port);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
