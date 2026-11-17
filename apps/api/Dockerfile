# NestJS API: runs migrations (and the first-deploy demo seed on staging), then serves on $PORT.
# Built by Railway from the repo root: set RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile on the service.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.9
ENV CI=true NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@opshub/api
ENV NODE_ENV=production
CMD ["sh", "apps/api/scripts/start.sh"]
