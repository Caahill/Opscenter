# BullMQ worker: scheduled and queued jobs. No public port.
# Built by Railway from the repo root: set RAILWAY_DOCKERFILE_PATH=apps/worker/Dockerfile on the service.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.9
ENV CI=true NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@opshub/worker
ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/main.js"]
