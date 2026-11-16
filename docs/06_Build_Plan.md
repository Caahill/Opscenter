# SySpree Ops Hub - Build Plan

Version 1.0 · 25 Oct 2026 · Reads with: `01_PRD.md` (requirements), `02_TechSpec.md` (section 14 build order), `05_AGENTS.md` (working rules).

## Context

`docs/` holds a complete spec pack (PRD, TechSpec, Hosting guide, QuickStart, AGENTS rules) for **Ops Hub**, SySpree's internal app replacing ClickUp: department pipelines, client 360, a masked unified inbox (Gmail + WhatsApp) with AI triage, capacity/leave, billing triggers, chat and dashboards. No code exists yet (workspace contains only `docs/`, not a git repo). This plan turns the pack into an ordered build: what ships in each phase, which PRD requirements it covers, what must be true to exit the phase, and what runs in parallel.

Guiding constraints taken from the docs:
- TechSpec §14 build order is binding; **nothing that returns client data is built before the policy layer and masking contract harness exist** (AGENTS.md).
- Every phase gate = `pnpm lint && pnpm typecheck && pnpm test && pnpm test:masking` green, plus the phase's Playwright acceptance tests.
- Integrations are built against fakes first (`GMAIL_MODE/WHATSAPP_MODE/AI_MODE=fake`), live only on staging.
- Phase 1 schema already carries Phase 2 fields (`dependsOnId`, `unlockAfterDays`, `Holiday`, `health`, `wa_groups` flag) so Phase 2 needs no disruptive migrations.

Durations are indicative, assuming 2-3 engineers with agent assistance; real dates depend on PRD open question 3 (launch date and budget).

---

## Phase 0 - Decisions and external setup (week 0, before code)

**Decisions to close** (from README / PRD open questions):
| # | Decision | Blocks | Default if not answered |
|---|---|---|---|
| OQ2 | Custom build vs configure a platform | Everything | Custom build (TechSpec default) |
| OQ3 | Phase 1 launch date and budget | Scheduling, Lean vs Standard hosting | Lean staging, Standard prod |
| OQ4 | What Accounts sees (billing contact email, amounts) | Field policy table row, Phase 1E | Billing contact + amount on requests |
| OQ8 | Data residency | Infra | AWS Mumbai `ap-south-1` |
| OQ1 | WhatsApp OBA / Route A | Phase 2 only | Phase 1 ships 1:1 + Route B |
| OQ6, OQ7, OQ10 | Mailboxes, capacity hours, member send rights | 1C / 1D config | support@, development@, PM mailboxes; 40h; member send off |

**Long-lead external tasks to start now** (they take weeks):
- Meta Business portfolio verification + register SySpree number on Cloud API; start OBA application if Route A is wanted.
- Google Cloud projects `opshub-staging` / `opshub-prod` (Gmail + Pub/Sub APIs, Internal OAuth consent).
- AWS accounts (staging, prod) with SSO+MFA; Anthropic keys per env with spend limits; review Anthropic data-use terms.
- Request `DESIGN.md` from SySpree (needed before UI work in Phase 1B).
- Start the **2-week metrics baseline** (PRD Success metrics) during the build, not at the end.

**Exit:** OQ2/3/4/8 answered or defaults accepted in writing; DESIGN.md ETA known; Meta verification submitted.

---

## Phase 1 - MVP: replace ClickUp

### 1A Foundations + policy layer (TechSpec §14 steps 1-2) - ~3 weeks
- `git init`; monorepo scaffold per TechSpec §3 (pnpm + Turborepo; `apps/web|api|worker`, `packages/db|policy|shared|integrations|ui`, `tools/clickup-import`, `infra/`); copy `docs/05_AGENTS.md` → `AGENTS.md`.
- `docker-compose.yml` (Postgres 17, Redis 7, MinIO, Mailpit), `.env.example` per QuickStart §4, `pnpm keys:generate`, all QuickStart §7 scripts.
- CI (GitHub Actions): lint, typecheck, unit, API, `test:masking` as required check; lint rule that fails any route missing `@Requires`.
- Prisma: full schema from TechSpec §4 in the first migration (incl. Phase 2 fields).
- Auth: Google OIDC (domain allowlist) + `AUTH_MODE=dev` seed-user picker; 12h inactivity sessions; 2FA enforcement check for Admin/PM/Accounts.
- Users, Teams, multi-role, deactivate; `AuditLog` + `ActivityLog` writers.
- `packages/policy`: roles, scopes (§5.2), `fields.ts` (§5.3), `label()`, `maskBody()` with per-market phone patterns (IN, AE, SA, AU, UK, CA, US, NZ).
- API: `@Requires` guard (deny by default), **Policy Serializer** global interceptor, error shape (§6.3), redacting logger honoring `@Sensitive`.
- Crypto service: envelope encryption (`KMS_MODE=local` / AWS KMS, separate PII and vault keys), HMAC hashing with pepper for `emailHash`/`phoneHash`.
- **Masking contract harness** (`apps/api/test/masking/endpoints.ts`): seeds Demo Co data, crawls every GET + websocket event per role, fails on leaked email/phone/credential/value strings.

**Exit:** all 6 seed users log in; harness runs green on a stub endpoint; unit tests for every mask pattern per market; CI blocks a PR without `@Requires`.

**Status: built 26 Oct 2026.** Lint, typecheck, 207 unit and API tests, and the 48-check masking suite pass locally. The masking suite was shown to fail when a leak was planted on purpose. Not yet run in GitHub Actions (no remote yet). Google sign-in and AWS KMS are coded and unit-tested but untested against the real services.

**Check it locally (about 10 minutes):**
1. `pnpm install`, then `pnpm keys:generate --write`.
2. Start PostgreSQL: `docker compose up -d`, or `pnpm db:local` in its own terminal if Docker is not installed.
3. `pnpm db:migrate && pnpm db:seed`, then `pnpm dev`, and open http://localhost:3000.
4. Sign in as each seed user from the login page. The header shows your roles; Home lists the actions the API grants you.
5. Open **Policy preview** as Manoj Member, Meera PM, Pavan PM, Anil Accounts and Hema HR. Same Demo Co record, different views: labels and `[phone hidden]` for most roles, everything for Pavan (the client's PM), billing contact and amount only for Accounts, leave reason only for HR and Admin.
6. As Asha Admin: invite a user, change their roles, deactivate them (they are signed out at once), set a team leader, then find all of it in **Audit log**, alongside the unmasked views from step 5.
7. As Manoj Member, open `/admin/users`: access is refused, and the API returns 403 for the same actions.
8. Run the gate: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:masking`.

### 1B Core domain: clients, pipelines, projects, tasks (steps 3-4) - ~4 weeks
- Clients, Contacts (encrypted), client 360 `GET /clients/:id/overview` (PRD 1.2).
- Credential vault: create, `POST /credentials/:id/reveal` (once, uncached, audited), per-task grants, `grants.expire` job + task-close revoke.
- Pipelines/Stages/Packages + seed of the 9 department pipelines and packages from PRD "Department workflows"; Admin edit with versioning (changes apply to new projects); stage-name person-name validation.
- Projects: create, `move-stage` (checklist warn + logged override, `stageEnteredAt` reset), `stop` (reason required), `handoff` incl. multi-project onboarding hand-off (PRD 1.3, TechSpec §9.2-9.3).
- Tasks: all PRD 1.5 fields, subtasks, checklist, comments, attachments (S3/MinIO presigned), dependencies field; `GET /me/tasks`.
- Boards `GET /boards/:department` board/list/calendar + filters (PRD 1.1).
- Templates + `cycle.generate` job, idempotent on `projectId + cycleMonth` (PRD 1.4).
- UI (needs DESIGN.md + `packages/ui`): app shell, department boards, client 360, project page, task drawer, My Tasks.
- **Parallel track starts:** ClickUp import CLI dry-run (`--dry-run` report: summary, mapping-gaps, clients-dedup, pii-extractions) using TechSpec §7.4 ids and `mapping.yaml`.
- **Parallel track starts:** Terraform staging (Lean is acceptable) so dry runs and E2E have a home.

**Exit (Playwright):** PM sees all 9 pipelines and moves a project with log; client with SEO+Ads+AMC shows 3 projects on one page; hand-off needs no manual copy; package start creates setup tasks and cycle job creates monthly tasks; member updates status/progress in ≤2 clicks. Every new endpoint in the masking crawler with 6-role allow/deny tests.

**Status: built 3 Nov 2026.** All exit criteria pass locally:
- Playwright: 7 of 7. Every PRD 1.1 to 1.5 acceptance criterion above, plus a UI masking check.
- API: 325 tests, including a role-by-route matrix (280 checks) that pins allowed, refused (403) and hidden (404) for every route.
- Masking suite: 168 checks. It now also proves the crawl reaches every restricted demo value, so it cannot pass by seeing only empty pages.
- `cycle.generate` is tested against a database: right day, reruns, on-hold projects skipped, day 31 in short months.
- ClickUp import dry run: built and tested on invented data (16 tests). It needs a ClickUp token to run against the real workspace.

Not done in 1B: Terraform for staging moves to 1G. It cannot be checked locally, and the e2e stack covers what staging was for at this point.

Changes beyond the TechSpec, recorded there in section 4:
- A project status field, so "waiting on client" and "on hold" can be set at any stage.
- Stage checklist items per project.
- Task comments and attachments as tables.
- A `ProjectCycle` table that makes monthly generation idempotent.
- File storage on local disk for machines without MinIO.

**Check it locally (about 15 minutes):**
1. Start Postgres (`pnpm db:local` or `docker compose up -d`), then `pnpm db:migrate && pnpm db:seed`. The seed now loads the 9 pipelines, 10 packages and 3 demo clients: Demo Co, Example Pty Ltd and Sample Trading LLC.
2. `pnpm dev` and open http://localhost:3000. Home lists the Phase 1B checks for whoever is signed in.
3. As Pavan PM:
   - On **Boards > SEO**, drag Demo Co to the next stage. The incomplete checklist asks before overriding, and the project's activity log records the move.
   - Open **Clients > Demo Co**: SEO, Google Ads and AMC on one page, the AMC renewal, contacts in full, and the hosting login (reveal it; the audit log records it).
   - Open Sample Trading LLC's onboarding project and hand off to SEO and Google Ads. Two projects appear with their setup tasks, and onboarding closes.
   - Start a new project from a package and see its setup tasks.
   - Grant the Demo Co hosting login to Manoj for one task.
4. As Manoj Member:
   - Open **My tasks** and change a status (two clicks) and progress (one click).
   - Open Demo Co: contacts show labels, never details.
   - Reveal the granted login. Mark that task Done and the reveal is refused.
5. As Asha Admin, open **Pipelines**: add or rename a stage (try a staff name to see it refused), then check that existing projects keep their old stages. In **Packages**, edit a monthly task list.
6. `pnpm jobs:run cycle.generate` creates this month's retainer tasks for projects whose cycle day is today (add a date, e.g. `2026-11-15`, to try another day).
7. `pnpm test:e2e` runs the Playwright suite on its own database and ports. The first time, run `pnpm --filter @opshub/web exec playwright install chromium` first.
8. Optional: `CLICKUP_TOKEN=... pnpm import:clickup --dry-run --out ./import-report` reads the real workspace and writes the mapping, de-duplication and PII reports (masked previews only). Nothing is written to Ops Hub.

### 1C Leave and capacity (step 5) - ~2 weeks
- Leave CRUD (reason encrypted, HR/Admin only), `Holiday` model (India seed optional; full holiday calendars are P1).
- Capacity service per TechSpec §9.1 (6-day week default, half days, unestimated list); `GET /capacity`, over-capacity warning on assign.
- TL weekly planner `GET /planner/:teamId`, `POST /planner/:teamId/moves` with drag between members/days and priority (PRD 1.6).
- `leave.impact` job: notify TL + affected PMs with one-click reassign (PRD 3.2).

**Exit:** leave entered by HR reflects in planner/capacity within 1 minute (Playwright); TL rebalances a member on leave without leaving the planner.

**Status: built 9 Nov 2026.** All exit criteria pass locally:
- Playwright: 11 of 11, of which 4 are new. HR records leave and the planner and capacity show it straight away. The TL drags a task off the person on leave, or uses Move to change the person, day and priority. The leave alert reassigns a task in one click. Assigning to someone over capacity shows a warning. The suite passes twice in a row on the same database.
- API: 435 tests, 14 of them new for leave, capacity, the planner and alerts. The role-by-route matrix now covers the 1C routes, including a TL getting 404 on another team's planner.
- Masking suite: 210 checks across 6 new GET routes. The demo leave reason ("Dental surgery recovery") must be found by Admin and HR and never by anyone else.
- Capacity maths: 18 unit tests, covering ISO weeks across year ends, half days, holidays, and leave on a holiday.
- `leave.impact`: 4 tests against a database (who is alerted, reruns, date changes, deleted and past leave).

Decisions taken while building, recorded in TechSpec section 9.1:
- A task counts on its planner day if it has one, otherwise on its due date.
- A day lost to both leave and a holiday counts once.
- Half days are single-day leave.
- The planner shows all seven days; Sunday has no hours.
- Whether leave was sick leave is shown to HR and Admin only, like the reason.
- `leave.impact` runs inside the API right after each leave write, so the alert does not wait for Redis. The worker runs the same function as a job for reruns.
- A small `Notification` table holds in-app alerts. Phase 1F adds email digests, push and settings to it.
- `User.location` (default IN) decides which office holidays apply. Three fixed national holidays are seeded for 2026 and 2027; HR adds the rest on the Leave page.
- A second SEO member, Sana Member (`member2.seo@dev.local`), joins the seed users so the TL has someone to move work to.

**Check it locally (about 15 minutes):**
1. Run `pnpm db:migrate && pnpm db:seed`. The seed adds Sana Member, the office holidays and a demo leave for Manoj Member later this week, with SEO work due during it. Tara Lead and Pavan PM get an alert.
2. Run `pnpm dev` and sign in. Home lists the Phase 1C checks for whoever is signed in.
3. As Tara Lead:
   - Open **Planner**. Manoj is shaded "On leave" on his leave days and shows red over capacity.
   - Drag one of his cards to Sana, or use **Move** to choose the person, day and priority.
   - Open **Alerts**, then the leave alert. Each task has a suggested teammate; **Reassign** moves it in one click.
4. As Hema HR:
   - Open **Leave** and record leave for Sana next week, with a reason.
   - The reason shows for HR and Admin only. Tara and Pavan see the dates but not the reason or the kind of leave.
   - Add an office holiday; available hours drop for everyone at that location.
   - HR sees **Capacity** but not the planner or any task.
5. As Pavan PM:
   - Open **Capacity** to see every team's hours.
   - On a task, pick Manoj as assignee for a date this week; a warning says he is over capacity, and you can still assign.
6. As Manoj Member, **Leave** and **Capacity** show only his own. As Anil Accounts, neither page is available.
7. `pnpm jobs:run leave.impact <leaveId>` re-sends a leave's alert. It is safe to run repeatedly.
8. `pnpm test:e2e` runs the browser suite.

### 1D Unified inbox: Gmail, WhatsApp, AI triage (steps 6-7) - ~5 weeks
- `packages/integrations/{gmail,whatsapp,claude}` with real + `fake` clients.
- Gmail: mailbox OAuth connect (refresh token encrypted), `users.watch` + Pub/Sub push to `/webhooks/gmail` (OIDC audience verified first), `gmail.sync` (+5 min safety poll), `gmail.watch.renew`, `gmail.backfill` (3 years default), send with MIME threading.
- Ingest pipeline: compute and store `bodyMasked` at ingest, encrypt original; auto-link by `emailHash` → domain → `UNMATCHED`; Unmatched queue + `POST /inbox/messages/:id/link`; re-link when PM adds a personal address.
- Compose by `contactIds` only; reject raw addresses unless viewer has `full`.
- Inbox UI: threads, compose/reply/forward, templates, attachments filed to project; `tsvector` search scoped in SQL (`search.reindex`).
- WhatsApp 1:1: verify challenge + `X-Hub-Signature-256` before store, `wa.ingest` with media to S3, outbound free-form in window / templates outside.
- Route B: `POST /whatsapp/imports` parser (12h/24h, multi-line, media zip, dedupe hash), fixture `fixtures/whatsapp/sample-export.txt`.
- `triage.classify`: masked input only, Haiku → Sonnet retry on confidence < 0.6 or Zod failure, store suggestion; confirm/edit/dismiss UI with stored outcomes for accuracy tracking (PRD 2.4).

**Exit:** reply from Gmail and from Ops Hub appear in one thread both sides (staging, live test mailbox); change request becomes a task with original message in ≤3 clicks; 2023 email found by client + keyword in <10 s (p95 < 800 ms); Team Member sees no client address in UI, API, page source or download; masking crawler covers inbox endpoints and `inbox.*` socket events.

**Status: built 9 Nov 2026, against the fake Gmail, WhatsApp and Claude clients.** The live clients are written but not yet run against Google, Meta or Anthropic. That needs the staging credentials from Phase 0, so the live acceptance checks (a real test mailbox, the Meta test number) are still open. Locally:
- Playwright: 17 of 17, of which 6 are new:
  - A change request becomes a task with its file attached in 3 clicks.
  - A reply sent from Ops Hub and the client's answer land in one thread.
  - The 2023 email is found by "Demo renewal" in under 10 seconds.
  - A Team Member sees no address or number in the page, the page source or the API.
  - An unmatched sender is linked and saved as a contact.
  - A WhatsApp chat export is imported.
  - The suite passes twice in a row on the same database.
- API: 561 tests, 22 of them new for the inbox:
  - Signature and token checks happen before anything is stored.
  - Linking works by contact, by domain and by thread; webmail and staff-only mail are handled.
  - Triage can create a task, attach to one, edit or dismiss, and the TL's scope applies.
  - Compose by contact id; typed addresses and personal mailboxes are refused for everyone but the client's PM and Admin.
  - Team Member sending works only where the PM turned it on.
  - WhatsApp's 24-hour window is enforced.
  - Re-linking, search scope, Route B de-duplication, masked views and attachment access are covered.
  - The role-by-route matrix (480 checks) includes every inbox route.
- Masking suite: 301 checks, including 13 inbox and search URLs over demo mail that holds an address, a phone number and a login.
- `packages/integrations`: 15 tests (MIME and threading, the WhatsApp signature, webhook and chat-export parsing in Android and iOS formats, triage prompt and output checks).
- Websocket events (`inbox.*`) arrive with Socket.IO in 1F; the crawler covers them then. (Done in 1F: `inbox.message_new`.)

Decisions taken while building, recorded in TechSpec 7 and 10:
- Inbox jobs run in the API process. They need the PII key and file storage, so they run on BullMQ when Redis is up and in-process otherwise. The worker keeps `search.reindex`.
- Unmatched mail in a PM's own mailbox is seen only by that PM, not by other PMs or Admin (PRD OQ6). Staff-only mail is not stored.
- Webmail domains (gmail.com, outlook.com and the like) never link by domain. Those senders must be saved as contacts, which also re-links their earlier messages.
- A TL sees untriaged mail from clients their team works for, and triaged mail on their team's projects. Accounts sees confirmed billing threads.
- Route B imports triage messages from the last 14 days. Older ones are stored as history only.
- Team Members may email a client only where the PM ticks "Team Members may email this client" on the project (PRD OQ10 default off).
- Names in signatures are not masked; TechSpec 5.4 masks addresses, numbers and logins. Files attached by clients cannot be masked, so they download only for people who can see the message.

**Check it locally (about 20 minutes):**
1. Run `pnpm db:migrate && pnpm db:seed`. The seed adds a shared mailbox (`support@syspree.example`) and Demo Co mail:
   - a change request containing a phone number and a login;
   - a message already on Manoj's SEO task;
   - a 2023 renewal email;
   - a WhatsApp question;
   - an unmatched sender.
   It also adds a personal mailbox for Pavan with one private unmatched message.
2. As Pavan PM, open **Inbox**:
   - Open "Diwali banner": the real address, number and login show, because Demo Co is Pavan's client.
   - Click **Create task**. The task opens with the client message on it.
3. Still as Pavan, reply in a thread, then use **Dev: simulate the client's reply** under it. Both messages show in the one thread. **Dev: simulate a client message** at the bottom of the Inbox starts new email or WhatsApp threads; give it an attachment name and the file is filed to the project when you triage.
4. Open **Search** and type "Demo renewal": the 2023 email comes up.
5. Open **Unmatched**, open "Partnership enquiry" and link it to a client. Tick "Save the sender as a contact" to do this on your own client.
6. Use **Import WhatsApp chat** with `fixtures/whatsapp/sample-export.txt`. Upload it again: nothing is duplicated.
7. Sign in as each of the other roles:
   - **Meera PM:** Demo Co mail with labels ("Demo Co · Marketing contact") and "[phone hidden]" / "[credential hidden]".
   - **Tara Lead:** Demo Co mail, masked, and can triage it.
   - **Manoj Member:** only the FAQ message on his task. On the SEO project, Pavan can tick "Team Members may email this client".
   - **Anil Accounts:** only the 2023 billing email.
   - **Hema HR:** no inbox.
8. As Asha Admin, open **Admin > Mailboxes**. With `GMAIL_MODE=fake` you add mailboxes directly; with `live` the button signs in with Google.
9. Run `pnpm test:e2e` for the browser suite.

Live setup on staging follows QuickStart section 8. Set `GMAIL_MODE=live` with the Pub/Sub topic and push service account, `WHATSAPP_MODE=live` with the Meta app values, and `AI_MODE=live` with `ANTHROPIC_API_KEY`.

### 1E Billing (step 8) - ~2 weeks
- Billable flag (any user) + PM confirm/reject; billing requests with amount + currency (`Decimal`); `PATCH` for Accounts status/invoice fields; state machine per TechSpec §9.4.
- Rule: `billableConfirmed` task cannot move to `DONE` without a billing request listing it.
- `renewal.alerts` (30 and 7 days) to PM + Accounts; Renew raises billing request, Close ends project.
- Accounts workspace with per-request PM messaging. Field policy row applied per OQ4 answer.

**Exit:** confirmed billable task blocked from closing until request exists; renewal alerts fire in a time-travel test; Accounts sees amount but never project value.

**Status: built 10 Nov 2026.** All exit criteria pass locally:
- Playwright: 21 of 21, of which 3 are new:
  - A member flags a task, the PM confirms it, closing is refused, the PM raises a billing request from the project page, and the task then closes.
  - Accounts invoices, records payment and messages the PM; the project value never appears on the request or project page.
  - The PM renews a retainer from Renewals due and Accounts receives the RENEWAL request.
  - The suite passes twice in a row on the same database.
- API: 644 tests, 11 of them new for billing:
  - Flag, confirm and reject, and the close rule.
  - The state machine, including refused moves.
  - PM edit or cancel until invoiced.
  - Messages scrubbed of contact details.
  - Accounts seeing the amount and billing contact but no project value.
  - Renew is once per term; Close ends the project.
  - The role-by-route matrix covers every billing route.
- Masking suite: 336 checks, including the billing and renewal routes over a demo request carrying the 15,750 amount.
- `renewal.alerts`: 4 time-travel tests against a database (quiet beyond 30 days, 30-day alert once, 7-day alert with catch-up, a new term starts over, closed projects skipped).

Decisions taken while building, recorded in TechSpec 9.4:
- Listing a task on a request confirms it as billable.
- A task can be on only one live request.
- A cancelled request no longer counts, so its tasks must be billed again before closing.
- The PM edits or cancels a request only while it is Requested. Once invoiced, only Accounts cancels it, as a credit note.
- Currency defaults from the client's market (INR, AED, SAR, AUD, GBP, CAD, USD, NZD).
- The term end is the renewal date if set, else the end date.
- Renew needs the new end date and amount; it bills the term once (a retry is refused) and moves the end date. Close marks the project Done.
- Notifications are in the app only. The email to Accounts arrives with the Phase 1F digest (built 10 Nov 2026).
- Notification text never carries amounts.
- Once a client has a billing request, Accounts can open that client and project: the existing BILLING scope. It still sees only the billing contact, and never the project value.

**Check it locally (about 15 minutes):**
1. `pnpm db:migrate && pnpm db:seed`. The seed adds:
   - a Demo Co billing request (INR 15,750) for an extra landing page, with a message from Accounts;
   - an SEO task flagged as extra work for Pavan to confirm;
   - today's renewal alerts, if the Demo Co AMC ends within 30 days.
2. As Manoj Member, open a task and click **Flag as extra work**.
3. As Pavan PM:
   - Open the task: **Confirm billable**.
   - As Manoj, try to mark it Done: it is refused.
   - Back as Pavan, click **Raise one** (or use the **Billing** card on the project page), list the task, enter an amount and send it to Accounts. Manoj can now close the task.
4. As Anil Accounts, open **Billing**:
   - Open the Demo Co request. The amount and the billing contact show; the project value does not.
   - **Mark invoiced** with an invoice number, then **Mark paid**.
   - Message the PM. Pavan gets an alert.
5. Open **Renewals due**. As Pavan, **Renew** a retainer (new end date and amount): it becomes a billing request in Accounts' Requested list. **Close** ends the project and tells Accounts.
6. `pnpm jobs:run renewal.alerts 2026-12-01` sends the alerts as if it were that day. A rerun on the same day adds nothing.
7. `pnpm test:e2e` runs the browser suite.

### 1F Chat, notifications, dashboards (steps 9-10) - ~3 weeks
- Chat: direct, team channels, auto project channels; mentions of user/task/project/client resolved with the viewer's permissions; clients never members.
- Socket.IO `/rt` with Redis adapter; per-recipient serialized payloads.
- Notifications: in-app, `digest.email` (Mailpit locally), PWA push, per-user settings; all text masked.
- Dashboards: Admin overview + PM / TL / Member / Accounts / HR (PRD 6.1-6.2).

**Exit:** masking crawler covers every socket event and notification channel; each role dashboard matches its scope.

**Status: built 10 Nov 2026.** All exit criteria pass locally. Push and SMTP are coded and unit-tested against fakes, not yet against a real push service or mail relay (staging):
- Playwright: 27 of 27, of which 4 are new:
  - A PM opens a direct message to a member and mentions them through the typeahead. The member sees the message arrive without reloading, with a pasted number hidden, and gets the alert. The reply arrives live the other way.
  - A simulated client email alerts its PM live, and the inbox list updates without reloading.
  - Notification settings save per category and survive a reload; **Send me a test** arrives as an alert; the dev outbox sends the digest.
  - Home shows Admin, PM, Member and HR each their own dashboards, and HR no client names.
  - The suite passes twice in a row on the same database.
- API: 770 tests, of which 19 are new for Phase 1F:
  - Channel membership, including Admin having no access to channels it is not in, and direct messages readable by their two people only.
  - Pasted numbers, addresses and logins masked on write.
  - Mention labels resolved per reader ("no access" for a task on another PM's client), in history and in the channel preview; a label typed into a token never reaches readers; typeahead limited to the writer's records.
  - Unread counts per person.
  - Settings per person, push to devices with gone devices removed, assignment and client-message alerts with labels and masked text only, the digest once per alert honouring email choices.
  - Each dashboard built from its role's scope (the PM sees their own clients only, the TL their own team).
  - The role-by-route matrix covers the new routes.
- Masking suite: 440 checks. 413 crawl the GET routes, including chat history over a demo message that pastes Demo Co's login, number and address, every dashboard and the dev outbox. 27 are socket checks: a socket per role, all three events triggered with restricted values in the text, and every payload checked. A connection without a session, or from another origin, is refused.
- Worker: 16 tests, 3 new for push, digest and due reminders.

Decisions taken while building, recorded in TechSpec 6.1, 6.2 and 8:
- Chat access is membership only, for every role. Admin does not read direct messages or channels it is not in.
- Project channels exist for open projects. Members are the PM, the project's team and leader, and anyone with a task on it.
- Sockets use one room per person, and every payload is built for its one reader. There are no shared rooms.
- Alerts are always in the app. Email (one digest a day at 18:30 IST) and push are chosen per category. Defaults push only the time-sensitive ones (mentions, assignments, client messages, billing).
- Alerts the worker writes appear on the next page load, with push within a minute; the API's own alerts arrive live.
- Locally the browser connects to the API port directly (`REALTIME_URL`), because the Next.js rewrite does not carry websockets.
- Masking hides addresses, numbers and logins, not names typed into free text. Decided 10 Nov 2026: names stay as written for now (TechSpec 5.6).

**Check it locally (about 15 minutes):**
1. `pnpm db:migrate && pnpm db:seed`. The seed adds a message in the Demo Co SEO project channel that pastes the client's login, number and address; they show hidden for everyone. If push keys are missing, run `pnpm keys:generate --write` and restart `pnpm dev`.
2. Open two browsers (or a normal and a private window). Sign in as Pavan PM in one and Manoj Member in the other.
3. As Pavan, open **Chat**:
   - Open **Demo Co · SEO** and check the demo message.
   - Pick Manoj under **Message a colleague**. Type `@Man`, choose Manoj, add a phone number and send. In Manoj's window the message arrives without reloading, the number reads `[phone hidden]`, and an alert pops up.
4. In a project channel, mention a task with `#`. As someone who cannot open it, the mention reads "no access".
5. As Pavan, open **Inbox** and open a thread, then **Dev: simulate the client's reply**. The alert "New email from Demo Co" pops up. In another window the inbox list updates by itself.
6. As Pavan, assign a task to Manoj from the project page: Manoj gets an alert straight away.
7. **Notification settings**:
   - Turn email off for one category and save.
   - **Turn on push** (allow notifications), then **Send me a test**: a system notification appears.
   - **Send the digest now** shows the email under Local outbox. It is also in `.local-mail/`, or run `pnpm jobs:run digest.email`.
8. **Home** as each seed user:
   - Admin: the business overview (departments and stages, team load, unanswered messages, billing outstanding).
   - Pavan: your clients (triage, extra work to confirm, waiting on the client, renewals) and your work.
   - Tara Lead: team load, the week's plan, overdue work and who is out.
   - Manoj: today, this week, overdue and unread counts.
   - Anil Accounts: billing by status and amounts.
   - Hema HR: who is out this week and next, and holidays.
9. `pnpm test:e2e` runs the browser suite.

### 1G Migration, hardening, launch (step 11 + infra) - ~3-4 weeks
- Production infra: Standard option (ECS Fargate, RDS Multi-AZ, ElastiCache, S3 SSE-KMS, WAF, KMS keys, Secrets Manager) via Terraform; CI/CD to staging with E2E, manual approval to prod (blue/green).
- Observability: OpenTelemetry, Sentry (PII-free), alerts from Hosting §9; `/healthz` uptime check.
- ClickUp import: Admin reviews `mapping.yaml`; PMs review dedupe and PII extraction reports; real run on staging (anonymised) then production; archive stopped/closed work read-only; resumable attachment batches.
- Hardening: k6 load test (1,000 clients, 50 users, 5 years mail, <2 s), security review, restore drill, secrets rotation runbook.
- Rollout: 2-week parallel run (all new client messages in Ops Hub) → cutover → ClickUp read-only → close at day 30. Revoke ClickUp token.

**Exit:** PRD Phase 1 acceptance criteria all green on staging; restore drill passed; 30-day metrics review scheduled.

---

## Phase 2 - Automation (after MVP is live)
- WhatsApp client groups via Route A behind `wa_groups` (needs OBA; ≤8 participants; groups created by Ops Hub; invite links sent 1:1).
- Response SLA (`sla.response`, 4 working hours) - PRD 2.8.
- Health rules (`health.evaluate`: stage SLA, 5 working days waiting on client, >3 overdue) - PRD 1.8.
- Recurring and dependent tasks (`tasks.unlock`, e.g. blog keywords 70 days after baseline) - PRD 1.7.
- Trend dashboards - PRD 6.3; accounting CSV export (Zoho/Tally connector after OQ9) - PRD 4.5.
- Remaining P1s: holiday calendars per location (PRD 3.4), chat search and file sharing into tasks (PRD 5.4).
- 90-day metrics review against PRD targets.

## Phase 3 - Extend
- Skill-based assignee suggestions (PRD 3.5), Microsoft 365 / Slack Connect / contact forms (PRD 2.9), native mobile apps, client portal (separate PRD).

---

## Dependency summary
```
Phase 0 ─▶ 1A ─▶ 1B ─┬▶ 1C ─────────────┐
                    ├▶ 1D ─▶ 1E ─▶ 1F ─┼▶ 1G ─▶ Phase 2 ─▶ Phase 3
                    └▶ ClickUp dry runs + staging infra (parallel) ┘
```
1C and 1D can run in parallel with two engineers once 1B lands. DESIGN.md gates UI from 1B onward; backend in 1A can proceed without it.

## Verification
- Per PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:masking` (report real output); new endpoints/events added to the masking crawler with 6-role + PM own/other client cases.
- Per phase: the Playwright acceptance tests listed under each Exit, run locally with `pnpm test:e2e` and on staging in CI.
- Live integrations checked on staging only (test mailbox, Meta test number, staging Anthropic key), per QuickStart §8.
- Pre-launch: k6 load test, restore drill, ClickUp dry-run reports signed off, audit log shows zero unmasked views by non-PM roles during parallel run.

