import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Masking contract suite (TechSpec 11). Required CI check: a PR that fails it cannot merge.
export default defineConfig({
  plugins: [swc.vite()],
  test: {
    include: ['test/masking/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
