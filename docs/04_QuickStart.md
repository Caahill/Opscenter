# SySpree Ops Hub - QuickStart

Get Ops Hub running locally in about 15 minutes, with seed data for every role.
Reads with: `02_TechSpec.md` (architecture), `05_AGENTS.md` (rules before you code).

---

## 1. Prerequisites

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 24 LTS | `node -v` |
| pnpm | 9+ | `pnpm -v` (install: `corepack enable`) |
| Docker + Docker Compose | Current | `docker compose version` (optional: see "No Docker?" in section 3) |
| Git | Any recent | `git --version` |
| ngrok or Cloudflare Tunnel | Optional | Only for testing Gmail and WhatsApp webhooks |

---

## 2. Clone and install

```bash
git clone <repo-url> opshub
cd opshub
corepack enable
pnpm install
pnpm keys:generate --write   # creates .env from .env.example and fills the three local keys
```

---

## 3. Start local services

```bash
docker compose up -d
```

| Service | Port | Purpose |
| --- | --- | --- |
| PostgreSQL | 5432 | App database (`opshub` / `opshub`) |
| Redis | 6379 | Queues and websockets |
| MinIO | 9000 (API), 9001 (console) | S3-compatible storage, bucket `opshub-local` |
| Mailpit | 8025 (UI), 1025 (SMTP) | Catches digest emails when `MAIL_MODE=smtp` (optional locally) |

**No Docker?** Run `pnpm db:local` in its own terminal instead. It starts PostgreSQL 17 on port 5432 with the same credentials, data in `.local-postgres/`. Also set `STORAGE_DRIVER=fs` in `.env`, so attachments go to `apps/api/.local-storage/` instead of MinIO. Without Redis the worker logs "worker idle"; run jobs by hand with `pnpm jobs:run <job>`. Mailpit is not needed: with `MAIL_MODE=file` (the default) digest emails are written to `.local-mail/` as `.eml` files, and Notification settings shows them under **Local outbox (dev)**.

---

## 4. Environment variables

`.env` from `.env.example`. Minimum for local:

```dotenv
# Core
NODE_ENV=development
APP_URL=http://localhost:3000
API_URL=http://localhost:4000
DATABASE_URL=postgresql://opshub:opshub@localhost:5432/opshub
REDIS_URL=redis://localhost:6379

# Storage (MinIO)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=opshub-local
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
STORAGE_DRIVER=s3           # s3 (MinIO, AWS) | fs (local disk, for machines without Docker)

# Encryption (local only: static dev keys; staging and prod use KMS)
KMS_MODE=local
LOCAL_PII_KEY=<run: pnpm keys:generate>
LOCAL_VAULT_KEY=<run: pnpm keys:generate>
HASH_PEPPER=<run: pnpm keys:generate>

# Auth
AUTH_MODE=dev                # dev = pick a seed user at login; google = real OIDC
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_ALLOWED_DOMAINS=syspreedigital.com,syspreesolutions.com

# Integrations (leave blank to use fakes)
GMAIL_MODE=fake              # fake | live
GMAIL_PUBSUB_TOPIC=
WHATSAPP_MODE=fake           # fake | live
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
AI_MODE=fake                 # fake | live
ANTHROPIC_API_KEY=
AI_TRIAGE_MODEL=claude-haiku-5-5
AI_FALLBACK_MODEL=claude-sonnet-5-5
CLICKUP_TOKEN=
MAIL_MODE=file               # file = .eml files in .local-mail/ | smtp = Mailpit locally, the relay in production
SMTP_URL=smtp://localhost:1025
MAIL_FROM=Ops Hub <opshub@syspree.example>
PUSH_VAPID_PUBLIC_KEY=       # web push keys; pnpm keys:generate --write fills both
PUSH_VAPID_PRIVATE_KEY=
PUSH_SUBJECT=mailto:ops@syspree.example
REALTIME_URL=                # optional: where the browser opens its live connection; defaults to API_URL locally, this origin in production
```

Generate local keys:

```bash
pnpm keys:generate           # prints the three random 32-byte base64 keys and a web push key pair to paste into .env
pnpm keys:generate --write   # or fills any empty ones in .env directly
```

Never commit `.env`. Never put real client data in a local database.

---

## 5. Database and seed

```bash
pnpm db:migrate      # apply Prisma migrations
pnpm db:seed         # departments, 9 pipelines, packages, demo clients, one user per role
```

The seed loads the pipelines and packages defined in `01_PRD.md` (Department workflows) and creates demo clients with fake contacts, so masking can be checked straight away. It also seeds fixed-date India office holidays and, once per database, a demo leave for Manoj Member with SEO work due during it, so the planner and the leave alert have something to show. A demo inbox follows: a shared mailbox `support@syspree.example`, Demo Co email and WhatsApp messages (including a 2023 email for search) and an unmatched sender.

---

## 6. Run

```bash
pnpm dev             # web on :3000, api on :4000, worker, all with hot reload
```

Open http://localhost:3000. With `AUTH_MODE=dev`, the login page lists seed users:

| Seed user | Role | Use it to check |
| --- | --- | --- |
| admin@dev.local | Admin | Everything, admin dashboard, audit log |
| pm@dev.local | Project Manager | Unmasked contacts on own clients, billing requests, triage |
| pm2@dev.local | Project Manager | Masked data on clients assigned to another PM |
| tl.seo@dev.local | Team Leader (SEO) | Weekly planner, leave alerts, masked inbox |
| member.seo@dev.local | Team Member (SEO) | My tasks, masked thread view, own leave and load |
| member2.seo@dev.local | Team Member (SEO) | Someone for the TL to move work to on the planner |
| accounts@dev.local | Accounts | Billing queue (invoice, paid, messages), renewal alerts; sees amounts, never project values |
| hr@dev.local | HR | Leave entry, holidays, who is out, capacity |

Quick masking check: log in as `member.seo@dev.local`, open **Policy preview** in the sidebar, and confirm you see `Demo Co · Marketing contact` and `[email hidden]`, never an address. Sign out, log in as `pm@dev.local` (the client's PM) and the same page shows the real values. The same check works in the inbox: as `member.seo@dev.local`, open **Inbox** and the FAQ message on your task shows `Demo Co · Marketing contact` and `[phone hidden]`; as `pm@dev.local`, open "Diwali banner" and the real address, number and login show.

**Chat, alerts and push (Phase 1F):** Chat lists your direct messages, your team channel and a channel for each project you work on. Messages, alerts and new inbox mail arrive live (the browser connects to the API on :4000 directly). Notification settings chooses email and push per alert. **Turn on push** works on `localhost` in Chrome, Edge and Firefox (Safari needs the app added to the Dock or Home Screen). **Send the digest now** under Local outbox (dev) writes the 18:30 IST digest straight away, or run `pnpm jobs:run digest.email`.

**Inbox without real accounts:** with `GMAIL_MODE`, `WHATSAPP_MODE` and `AI_MODE` set to `fake`, the bottom of the Inbox has **Dev: simulate a client message**, and every thread has **Dev: simulate the client's reply**. Both go through the same verified webhook paths as the real services, and triage runs straight away.

---

## 7. Common commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run web, api and worker |
| `pnpm build` | Production build of all apps |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm test` | Unit + API tests |
| `pnpm test:masking` | Masking contract suite (required to pass before any PR) |
| `pnpm test:e2e` | Playwright on its own stack (API :4100, web :3100, `<db>_e2e` database); never touches your dev data. First time: `pnpm --filter @opshub/web exec playwright install chromium` |
| `pnpm db:local` | PostgreSQL without Docker |
| `pnpm db:migrate:new <name>` | Create a migration |
| `pnpm db:studio` | Prisma Studio for local data |
| `pnpm db:reset` | Drop, migrate and re-seed (local only) |
| Admin → Mailboxes → Sync now | Pull new Gmail messages for a mailbox now (no Redis needed) |
| `pnpm jobs:run <job> [arg]` | Run a worker job once without Redis, e.g. `cycle.generate 2026-11-15`, `leave.impact <leaveId>` or `renewal.alerts 2026-12-01` |
| `pnpm import:clickup --dry-run` | ClickUp import report without writing |

---

## 8. Testing live integrations locally (optional)

Start a tunnel so Google and Meta can reach your machine:

```bash
ngrok http 4000
```

**Gmail (live):** set `GMAIL_MODE=live` and the Google OAuth values from a *staging* Google Cloud project, with `<API_URL>/api/v1/mailboxes/oauth/callback` as an authorised redirect URI. Create a Pub/Sub topic (`GMAIL_PUBSUB_TOPIC`, with `gmail-api-push@system.gserviceaccount.com` as publisher) and a push subscription to `https://<tunnel>/api/v1/webhooks/gmail` with authentication on; put its service account in `GMAIL_PUBSUB_SERVICE_ACCOUNT` and the audience in `GMAIL_PUBSUB_AUDIENCE`. Connect a test mailbox, not a real client mailbox, from Admin → Mailboxes → Connect with Google. Without Redis there is no 5-minute poll; use Sync now.

**WhatsApp (live):** set `WHATSAPP_MODE=live` with the Meta test number credentials. Set the webhook URL to `https://<tunnel>/api/v1/webhooks/whatsapp` and the verify token to `WHATSAPP_VERIFY_TOKEN`. Message the test number from your own phone.

**WhatsApp Route B import:** no live setup needed. Upload a chat export from Inbox → Import WhatsApp chat, for example `fixtures/whatsapp/sample-export.txt`. Approved templates for replies after 24 hours go in `WHATSAPP_TEMPLATES` (`name:language,...`).

**AI triage (live):** set `AI_MODE=live` and `ANTHROPIC_API_KEY` (staging key). Only seeded, fake messages should be sent from local.

---

## 9. ClickUp import dry run

```bash
CLICKUP_TOKEN=<token> pnpm import:clickup --dry-run --out ./import-report
```

Produces `import-report/summary.md` (counts per list and status), `mapping-gaps.csv` (statuses with no mapping), `clients-dedup.csv` (merged domains), `pii-extractions.csv` (what would be moved to the vault, as masked previews) and `projects.csv` (the per-task mapping). The mapping lives in `tools/clickup-import/mapping.yaml`; the run stops if a mapped list id no longer exists. Run real imports only against staging or production, never local.

---

## 10. Troubleshooting

| Symptom | Fix |
| --- | --- |
| `ECONNREFUSED 5432` | `docker compose ps`; restart with `docker compose up -d` |
| Prisma client out of date | `pnpm db:generate` |
| Login page empty | `AUTH_MODE=dev` missing, or seed not run |
| Masked fields show `[decrypt error]` | Keys in `.env` changed after seeding; run `pnpm db:reset` |
| Jobs not running | Worker not started; check `pnpm dev` output for `worker ready` |
| Webhook 401 | Signature secret mismatch; check `WHATSAPP_APP_SECRET` or Pub/Sub audience |
| `pnpm db:local` fails with `Library not loaded: libicudata` | Run `pnpm rebuild @embedded-postgres/darwin-arm64` once, then retry |
| Prisma refuses `migrate reset` "invoked by Claude Code" | Prisma blocks AI agents from wiping a database. Run `pnpm db:reset` yourself; it is local only |
| Every page shows an error and the API log says `Cannot find module` | The API dev server stopped. Restart `pnpm dev`. Since 10 Nov, `pnpm dev` compiles the API to `apps/api/dist-dev` and the web app to `apps/web/.next-dev`, so `pnpm build` and `pnpm test:e2e` no longer break a running dev server |
| Inbox shows no new mail locally | In fake mode mail only arrives through the dev simulator on the Inbox page; in live mode use Admin → Mailboxes → Sync now and check the mailbox's error chip |
| WhatsApp reply refused with "More than 24 hours" | Outside the customer service window only approved templates may be sent: set `WHATSAPP_TEMPLATES` |
| Messages and alerts only show after a reload | The live connection could not reach the API. Check the API is on `API_URL` and that `APP_URL` matches the address in the browser (the API refuses other origins) |
| **Turn on push** says the browser cannot receive push | `PUSH_VAPID_PUBLIC_KEY` is empty (run `pnpm keys:generate --write` and restart), or the page is not on `localhost` or HTTPS |
| API tests fail with `ECONNREFUSED` | Tests use a separate `opshub_test` database on the same server; start Postgres first |
