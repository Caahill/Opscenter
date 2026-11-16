// Runs PostgreSQL 17 without Docker, for machines where Docker is not installed.
// Same credentials and port as docker-compose.yml, so DATABASE_URL in .env.example works unchanged.
// Data lives in .local-postgres/ (git-ignored). Stop with Ctrl+C.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

const databaseDir = new URL('../.local-postgres', import.meta.url).pathname;
const firstRun = !existsSync(databaseDir);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'opshub',
  password: 'opshub',
  port: 5432,
  persistent: true,
  onLog: () => {},
});

if (firstRun) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('opshub');
} catch {
  // already exists
}
console.log('PostgreSQL ready on localhost:5432 (user opshub, db opshub). Ctrl+C to stop.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
