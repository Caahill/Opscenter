# Next.js web: the only public service. Listens on $PORT and proxies /api/v1 (and the live connection) to the API.
# Built by Railway from the repo root: set RAILWAY_DOCKERFILE_PATH=apps/web/Dockerfile on the service.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.9
ENV CI=true NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
# The /api/v1 rewrite to the API is fixed at build time, so API_URL must be known here.
# Railway passes service variables to the build only when they are declared as ARG.
ARG API_URL
ARG APP_ENV
ARG AUTH_MODE
RUN pnpm exec turbo run build --filter=@opshub/web
ENV NODE_ENV=production
CMD ["sh", "-c", "cd apps/web && exec ./node_modules/.bin/next start"]
