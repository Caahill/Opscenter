# AGENTS.md - SySpree Ops Hub

Instructions for AI coding agents (Claude Code and others) and human contributors working in this repo. Copy this file to the repo root as `AGENTS.md`. Read it fully before your first change.

## What this is

Ops Hub is SySpree Digital's internal operations app replacing ClickUp: department pipelines, client and project management, a unified client inbox (Gmail + WhatsApp) with AI triage, capacity and leave, billing triggers, internal chat and dashboards. Users are SySpree staff only (about 50). Clients never log in.

Source of truth, in order:

1. `docs/01_PRD.md` - what to build and why, acceptance criteria
2. `docs/02_TechSpec.md` - how: stack, schema, policy, APIs, jobs
3. `docs/DESIGN.md` - UI, components, tokens, copy style (supplied by SySpree; follow it exactly)
4. `docs/03_Hosting_Architecture_Guide.md` - environments and infra
5. This file - working rules

If these conflict, stop and ask. Do not pick one silently.

## Non-negotiable rules

These protect client data. Breaking one is a blocking defect regardless of anything else in the PR.

1. **Never return a Prisma entity from a controller.** Map to a DTO and let the Policy Serializer apply field rules. New fields on any DTO must be added to `packages/policy/fields.ts` in the same PR.
2. **Deny by default.** Every route needs `@Requires(action, scope)`. A route without it fails CI.
3. **Client contact data, project value and credentials are restricted.** Only Admin and the client's assigned PM see them unmasked. Everyone else gets labels or nothing. See TechSpec section 5.3.
4. **Never put client emails, phone numbers, credentials or project values in:** logs, error messages, Sentry, analytics, websocket payloads to non-full viewers, notification text, AI prompts, test snapshots, fixtures or seed files with real data. Use `@Sensitive` on DTO fields so the logger drops them.
5. **Scope in SQL, not after.** Filter by the user's scope in the query `WHERE`. Do not fetch and filter in memory.
6. **Compose by contact id.** Outbound email and WhatsApp payloads from the UI carry `contactIds`, never raw addresses. The API resolves addresses at send time.
7. **AI sees masked text only.** Triage prompts use `bodyMasked`. AI suggestions never create or change tasks without a human confirmation.
8. **Credentials:** reveal through `POST /credentials/:id/reveal` only, never cached, always audit logged. Grants expire at task close or 7 days.
9. **No real client data outside production.** Seed and fixtures use invented companies (`Demo Co`, `Example Pty Ltd`) and `example.com` addresses.
10. **Webhooks verify before they store.** Gmail Pub/Sub token audience and WhatsApp `X-Hub-Signature-256` checks come first in the handler.

## Repo map

```
apps/web        Next.js UI. No business rules, no permission decisions.
apps/api        NestJS REST + Socket.IO. Guards, Policy Serializer, webhooks.
apps/worker     BullMQ jobs (gmail.sync, wa.ingest, triage.classify, cycle.generate, ...)
packages/db     Prisma schema, migrations, seed
packages/policy Roles, scopes, field policies, masking functions
packages/shared Zod schemas, DTO types, enums
packages/integrations  gmail, whatsapp, claude, clickup clients
packages/ui     Components built to DESIGN.md
tools/clickup-import   One-time migration CLI
infra/          Terraform
docs/           PRD, TechSpec, Hosting, QuickStart, DESIGN.md
```

## Commands

```bash
pnpm install
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm dev                 # web :3000, api :4000, worker
pnpm lint && pnpm typecheck
pnpm test                # unit + API
pnpm test:masking        # masking contract suite, must pass
pnpm test:e2e            # Playwright
```

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:masking` before you say a task is done. Report the actual output, including failures.

## How to work

- Read the relevant PRD requirement and TechSpec section before writing code. Quote the requirement id (e.g. "PRD 2.4 Triage into tasks") in the PR description.
- Small PRs: one requirement or one slice of one. Schema change + migration + policy entries + tests in the same PR.
- Follow the Phase 1 build order in TechSpec section 14. Do not start a later step that depends on an unfinished earlier one (nothing touching client data before the policy layer and masking harness exist).
- Prefer editing existing modules over adding new patterns. If you need a new dependency, say why in the PR.
- When a requirement is ambiguous, check the PRD open questions and TechSpec decisions table. If it is not covered, ask instead of guessing.

## Coding conventions

- TypeScript strict, no `any` (use `unknown` and narrow). Zod at every boundary (HTTP body, webhook, job payload, AI output).
- Names: files `kebab-case.ts`, classes `PascalCase`, variables `camelCase`, DB tables singular `PascalCase` via Prisma.
- Dates: store UTC, render in the user's time zone, display format `DD MMM YYYY`.
- Money: `Decimal`, never float. Always with a currency code.
- Jobs: idempotent by external id or natural key, retry with backoff, dead-letter on final failure.
- Migrations: expand then contract. No destructive change in the same release that stops using a column.
- Errors: `{ error: { code, message, requestId } }`. Never echo restricted values.

## Domain rules agents get wrong

- **Departments are fixed enums** (PRE_SALES, ONBOARDING, WEB_DEV, AMC, SPEED_AUDIT, SEO, GOOGLE_ADS, SOCIAL_MEDIA, GRAPHIC_DESIGN). Stages are data, editable by Admin.
- **Six status types only:** NOT_STARTED, ACTIVE, WAITING_ON_CLIENT, ON_HOLD, DONE, STOPPED. Do not add more. Stage names are free text but must never contain a person's name; owners are assignees.
- **STOPPED needs a stop reason.** ON_HOLD and WAITING_ON_CLIENT pause SLA timers.
- **Client is the top record.** One client, many projects (one per service). Never model a client as a task.
- **Hand-off creates a new project** linked by `parentProjectId`. Never move or copy tasks between departments.
- **Retainers (SEO, Google Ads, Social Media, AMC) generate monthly cycle tasks** from the package on `cycleDay`. Keyed by `projectId + cycleMonth` so reruns do not duplicate.
- **A confirmed billable task cannot close** until a billing request lists it.
- **A PM sees unmasked data only on their own clients.** Holding the PM role is not enough.
- **WhatsApp groups (Route A) are Phase 2 behind flag `wa_groups`.** Official API only: max 8 participants, groups created by Ops Hub. Never add unofficial WhatsApp Web automation.

## Tests you must write

For any endpoint or event that returns client-related data:

1. Allowed and denied cases for all six roles (and PM own client vs other client).
2. Add the endpoint to the masking contract crawler (`apps/api/test/masking/endpoints.ts`).
3. For new masking patterns, unit tests per market format (IN, AE, SA, AU, UK, CA, US, NZ phone numbers).

For PRD acceptance criteria with click counts or timings, add a Playwright test that asserts them.

## UI work

- Follow `docs/DESIGN.md` for layout, components, tokens and copy. If DESIGN.md is missing or silent on something, use existing `packages/ui` components and ask before inventing a new pattern.
- Masked values render as their label or placeholder token, styled per DESIGN.md. Never render a masked field as blank without the label.
- UI copy: plain, short, no em dashes or en dashes (use a hyphen or rephrase).
- The UI must not hide data the API sent as a security measure. If the API sent it, assume the user may see it; if they should not, fix the policy.

## Commits and PRs

- Conventional commits: `feat(inbox): triage confirm endpoint (PRD 2.4)`.
- PR template sections: Requirement, What changed, Policy fields touched, Tests added, Screenshots (UI), Migration notes.
- Do not merge with failing `test:masking`, even "temporarily".

## Do not

- Do not commit `.env`, tokens, keys, real client names or real client data.
- Do not disable tests, lint rules or type checks to get green.
- Do not log request or response bodies for `/inbox`, `/clients`, `/contacts`, `/credentials`, `/billing-requests`, `/webhooks`.
- Do not call external APIs (Gmail, WhatsApp, Claude, ClickUp) from tests; use the fakes in `packages/integrations/*/fake`.
- Do not run the ClickUp import against local or with write mode outside staging and production.
- Do not change pipelines, roles or the field policy table without updating the PRD or TechSpec reference in the same PR.
