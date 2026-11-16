import { defineConfig, devices } from '@playwright/test';
import { API_URL, childEnv, WEB_URL } from './e2e/env.mts';

// PRD acceptance criteria with click counts or flows (AGENTS.md "Tests you must write").
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: { baseURL: WEB_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `${API_URL}/healthz`,
      env: childEnv({ NODE_ENV: 'test' }),
      timeout: 60_000,
      reuseExistingServer: false,
    },
    {
      command: 'pnpm exec next start -p 3100',
      url: `${WEB_URL}/login`,
      env: childEnv({ NODE_ENV: 'production', NEXT_DIST_DIR: '.next-e2e' }),
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
