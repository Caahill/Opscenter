import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NextConfig } from 'next';

// Local runs read the repo-root .env; deployed environments inject variables directly.
const rootEnv = resolve(process.cwd(), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  // `next dev` (.next-dev), `next build` (.next) and the e2e stack (.next-e2e) each use their own
  // folder, so a build never breaks a running dev server.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  transpilePackages: ['@opshub/ui'],
  poweredByHeader: false,
  // The browser only ever talks to this origin; /api/v1 is proxied so the session cookie is
  // first-party. Deployed, API_URL is the API's private address, fixed at build time, and
  // `next start` forwards the live connection (websocket upgrade) through this rewrite too.
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
