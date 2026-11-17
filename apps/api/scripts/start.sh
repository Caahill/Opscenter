#!/bin/sh
# Container start for the API (apps/api/Dockerfile): apply migrations, seed the demo data on the
# first staging deploy, then serve. A failed migration stops the deploy; Railway keeps the old one.
set -e
cd /app/packages/db
./node_modules/.bin/prisma migrate deploy
cd /app
if [ "$APP_ENV" = "staging" ] && [ "$SEED_DEMO" = "true" ]; then
  node apps/api/dist/seed/seed-if-empty.js
fi
exec node apps/api/dist/main.js
