# SySpree Ops Hub - Documentation Pack

Ops Hub is SySpree Digital's internal operations app. It replaces the ClickUp workspace with one system for department pipelines, client and project management, a unified client inbox (Gmail + WhatsApp) with AI triage, team capacity and leave, billing triggers for Accounts, internal chat and an admin dashboard. Client contact data and project value are visible only to Project Managers and Admin.

Owner: Caahill Murzello, Director of Operations · Pack version 1.0 · 25 Oct 2026

## Files

| File | For | What it covers |
| --- | --- | --- |
| `00_README.md` | Everyone | This index, reading order, status |
| `01_PRD.md` | Management, PMs, engineering | Problem, goals, ClickUp baseline, roles and access matrix, data model, department pipelines, requirements with acceptance criteria, metrics, phasing, open questions |
| `02_TechSpec.md` | Engineering | Stack, architecture, Prisma schema, authorization and masking design, API, Gmail / WhatsApp / AI / ClickUp integrations, jobs, business rules, testing |
| `03_Hosting_Architecture_Guide.md` | Engineering, Admin | Environments, Lean and Standard hosting on AWS Mumbai, security, external setup (Google Cloud, Meta, Anthropic), CI/CD, backups, runbooks |
| `04_QuickStart.md` | Developers | Local setup in about 15 minutes, seed users per role, commands, testing integrations |
| `05_AGENTS.md` | AI coding agents, developers | Non-negotiable data rules, repo map, conventions, domain rules, required tests. Copy to repo root as `AGENTS.md` |
| `06_Build_Plan.md` | Management, engineering | Phase-by-phase build plan: Phase 0 decisions, Phase 1 milestones 1A to 1G with exit criteria, Phase 2 and 3, dependencies, verification |
| `DESIGN.md` | UI work | Supplied by SySpree separately. Agents must follow it |

Live, commentable PRD: https://claude.ai/artifact/WDxzV6EoHG74VUeU8Smt42

## Reading order

- **Approving the project:** 01_PRD (Overview, Goals, Roles, Phasing, Open questions).
- **Building it:** 01_PRD → 02_TechSpec → 05_AGENTS → DESIGN.md → 04_QuickStart → 06_Build_Plan.
- **Running it:** 03_Hosting_Architecture_Guide.

## Where to put the files in the repo

```
opshub/
  AGENTS.md          <- copy of 05_AGENTS.md
  docs/
    00_README.md
    01_PRD.md
    02_TechSpec.md
    03_Hosting_Architecture_Guide.md
    04_QuickStart.md
    05_AGENTS.md
    06_Build_Plan.md
    DESIGN.md
```

## Status

| Item | State |
| --- | --- |
| ClickUp audit (14 lists, all status settings) | Done, 25 Oct 2026 |
| PRD | Draft v1, awaiting review |
| TechSpec | Draft v1, awaiting engineering review |
| Hosting guide | Draft v1 |
| Build plan | Draft v1 |
| DESIGN.md | Received 25 Oct 2026 (ClickUp marketing extraction; tokens applied, logo marks not used) |
| Code | Phase 1A built 26 Oct 2026 (auth, roles, masking, audit log). Phase 1B built 3 Nov 2026 (clients, pipelines, projects, tasks, boards, ClickUp dry run). Phase 1C built 9 Nov 2026 (leave, holidays, capacity, TL weekly planner, leave alerts). Phase 1D built 9 Nov 2026 against fake Gmail, WhatsApp and Claude (unified inbox, triage into tasks, compose by contact, search, Route B import); live checks need staging credentials. Phase 1E built 10 Nov 2026 (billable flags, billing requests, Accounts workspace, renewal alerts). Phase 1F built 10 Nov 2026 (internal chat with mentions, live updates, alerts with email digest, push and settings, role dashboards); push and SMTP still need a staging check. See 06_Build_Plan "Check it locally" |

## Decisions needed before build starts

1. WhatsApp: apply for Official Business Account status (Route A groups) or run Route B forwarding only. PRD open question 1.
2. Custom build (this pack's default) or configure an existing platform. PRD open question 2.
3. Phase 1 launch date and budget. PRD open question 3.
4. What Accounts may see (billing contact email, amounts). PRD open question 4.
5. Hosting region and data residency (default: AWS Mumbai). PRD open question 8.

Full list: PRD "Open questions" and TechSpec section 15.
