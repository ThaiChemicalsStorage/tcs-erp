# TCS ERP — Project Knowledge Base

> **Start here.** This file is the entry point for understanding the project. Read this first, then follow the links below for depth on any specific area.

> ⚠️ **Active coordination note (updated 2026-08-20 — merge of two parallel workstreams, read this if you're about to build anything in Accounting or Purchasing/Inventory):** the **Project module** (ใบเบิกของ/Material Requisition, ใบส่งผลิต/Job Order, PR/Purchase Request — see [MODULES/Project.md](./MODULES/Project.md)) is fully built, for the **"Project" department** (โปรเจกต์ — one of the 6 existing departments alongside Purchase/Factory/Technic/Service/Accounting). **The 4th document originally flagged in this note, ใบส่งมอบงาน (Work Handover Note), turned out not to be a separate document at all** — confirmed 2026-08-20 by two people on the business side that it's the same document the pre-existing **Delivery Order** module (FM-SL-05) already produces. A Work Handover Note module was briefly built (2026-08-19) as a first-draft/unverified structure to fill this perceived gap, then removed the same coordination cycle once the redundancy was confirmed — see [MODULES/Project.md](./MODULES/Project.md) "Work Handover Note — removed 2026-08-20" and CHANGELOG.md. This coordination risk is now **resolved**: Accounting's milestone-billing gate should gate on a signed Delivery Order, not a separate document type. **Accounting itself is further along than the Project-module branch's own snapshot of it knew** — Phase 1 (backend, live-verified 2026-08-17), Phase 1.5 (per-document-type sidebar pages, RE receipt, deposit-billed alert, monthly tax summary, 2026-08-18), plus same-day follow-ups (Product Stock + IV stock-cutting, Manual Tax Invoice creation, full i18n coverage) are all built — see [MODULES/Accounting.md](./MODULES/Accounting.md) for current status, not "UI paused." One real gap worth knowing about: Delivery Order's print document only ever prints a blank signature line for wet-ink signing — it does not capture/embed a real digital customer signature, unlike the removed Work Handover Note's `SignaturePad`-based capture. Not addressed yet; revisit if digital signature capture on delivery documents becomes a real requirement. **Not yet done as part of this merge**: actually wiring Accounting's milestone-billing gate to check a signed Delivery Order (still a manual checklist item today, per Accounting.md decision #6) — that's real follow-up work, tracked in [TODO.md](./TODO.md).

## Project Overview

**TCS ERP** (Thai Chemicals Storage ERP) is a Thai-language, internal business web app for a single chemical storage/distribution company (not a multi-tenant SaaS product). It's being built incrementally toward a full multi-module ERP (per the long-term vision in [PROJECT_STATUS.md](./PROJECT_STATUS.md)), starting with **Quotation management** and a **Product library**, plus the supporting shell (auth, settings, dashboard) and — as of 2026-07-08 — a full **RBAC / user management / quotation approval workflow / notifications / audit log** system. As of 2026-07-09 this system is **real, server-enforced** (Node.js API + MongoDB — today a standalone Express server on a self-hosted VPS), not a client-side simulation — see [RBAC.md](./RBAC.md) for exactly what's enforced where.

- **Repo**: https://github.com/Wisarutbuasumlee/tcs-erp (private)
- **Live**: **https://www.huma-erp.com/** — self-hosted VPS, HTTPS, the real production deployment since ~2026-08-07 — see [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md).
- **Language**: Thai UI throughout, English code/comments
- **Branding**: navy (`#0b1d3a`) + gold (`#c9a84c`), serif headings (Playfair Display), sans body (Inter), mono numbers (JetBrains Mono)

## Current Development Phase

**Real full-stack app, deployed and live.** As of 2026-07-09 the app is a Vite React frontend + Node.js backend + MongoDB database — not client-only anymore. **Cutover to real production happened ~2026-08-07**: the standalone Express server (`server/`, added 2026-08-06) now runs on a self-hosted VPS with its own domain + HTTPS, backed by a self-hosted MongoDB instance (not Atlas). The pre-cutover serverless demo is gone and every Vercel artifact was removed from the repo 2026-09-14 — the app has no Vercel dependency. Data lives in MongoDB, not `localStorage` (see [DATABASE.md](./DATABASE.md) for the collections). Auth is real: bcrypt-hashed passwords, JWT sessions in an httpOnly cookie, and every request re-fetches the user fresh from MongoDB so a deactivated account is locked out on its very next request. RBAC is enforced **server-side** on every mutating API route (`requirePermission()` in `api/_lib/auth.ts`, reusing the same pure permission functions from `src/lib/roles.ts`) — this is genuinely no longer bypassable via devtools; the server is the source of truth. See [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md), [DATABASE.md](./DATABASE.md), [RBAC.md](./RBAC.md), and [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) for full detail.

This supersedes the previously-proposed "Phase 2" stack (Next.js + Prisma + PostgreSQL + Auth.js) — that plan was **never built**; the migration that actually happened used a different, simpler stack (Vite unchanged + a Node.js REST API + MongoDB — first hosted as serverless functions, since ~2026-08-07 a standalone Express server) chosen for a faster path to a real backend without a frontend framework rewrite. The old proposal is kept in [ARCHITECTURE.md](./ARCHITECTURE.md) as a superseded historical record only — do not build against it.

Known, deliberate scope limitations (not bugs, see [RBAC.md](./RBAC.md) Known Gaps): automated test coverage is partial — a first vitest suite exists as of 2026-07-29 (`tests/`, `npm test`, 55 tests incl. an in-memory-MongoDB login integration test; per-route HTTP guards beyond `/api/auth/*` still untested). CI exists as of 2026-07-29 (`.github/workflows/ci.yml`, notify-only lint+typecheck+build+test on every push/PR to `master`). Login rate limiting exists as of 2026-07-29 (MongoDB-backed, 5 failures/identifier or 20/IP per 15 min → 429, see [RBAC.md](./RBAC.md)).

## Project Goals

1. Give TCS employees a working Quotation + Product Library tool today (done).
2. Re-platform onto a real multi-user backend with proper server-enforced RBAC — **done** (2026-07-09, Node.js API + MongoDB, not the originally-proposed Next.js/Prisma/Postgres stack — see Current Development Phase above).
3. Add further ERP modules (Lead/Customer management, HR, Accounting, Inventory, Warehouse, Purchasing, Project Management) on top of that foundation — **not started**.

## Folder Structure

**→ [`FOLDER_MAP.md`](./FOLDER_MAP.md)** — the annotated tree of `api/`, `server/`, and `src/`, with the
date and reason behind each folder. Read it before adding a file somewhere new, or when you cannot find
where an existing thing lives.

## Current Architecture (short version)

- **Vite 6 + React 18 + TypeScript 5.6 (strict) + Tailwind v4.** No UI kit dependency — all hand-rolled Tailwind utility classes matching the navy/gold design system.
- **No router — but page-level URL-hash persistence (2026-07-29).** `App.tsx` holds an `activeNav` string and switches between page components directly; `activeNav` is mirrored into `location.hash` (`#quotations`, ...) so refresh keeps the current page and browser Back/Forward work at page level (see [ARCHITECTURE.md](./ARCHITECTURE.md) — the open *document* is deliberately not in the URL). Pages are `React.lazy`-loaded so each module (and its dependencies, e.g. `recharts` for Dashboard) is a separate JS chunk.
- **Real backend: Node.js + self-hosted MongoDB, one runtime.** The `api/` handlers run under the standalone Express server in `server/` (`npm run dev` locally, `npm start` in production on the VPS — see [DEPLOYMENT.md](./DEPLOYMENT.md) and [ARCHITECTURE.md](./ARCHITECTURE.md) "Standalone Express server"). Every domain lib (`users.ts`, `roles.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.ts`, `storage.ts`, `session.ts`, `dashboard.ts`, `jobTypes.ts`) calls a REST API (`src/lib/apiClient.ts`'s `apiFetch()`) instead of reading/writing `localStorage`. Data lives in MongoDB: 9 fully-wired collections (`users`, `roles`, `company`, `products`, `categories`, `notifications`, `audit_log`, `quotes`, `job_types` — the last added 2026-07-10) plus 15 schema-prepped collections added 2026-07-09 (CRM, org, files, settings scaffolding — no API routes/UI on top of most of them yet) — see [DATABASE.md](./DATABASE.md) for the full list and which is which.
- **Real auth.** A first-run Setup Wizard creates the one Super Admin account; every subsequent account is admin-created via User Management (no public self-signup). Sign-in checks username/email + password via `bcrypt.compare()` against a real bcrypt hash (cost 10) stored per user, server-side. Sessions are a JWT in an httpOnly, secure, `sameSite=lax` cookie (`tcs_erp_session`, 7-day expiry); every request re-fetches the user from MongoDB and checks `status === "active"`, so a deactivated user is locked out on their next request even though the JWT itself is still technically valid. RBAC permission checks run server-side on every mutating route — genuinely unbypassable via devtools now. See [RBAC.md](./RBAC.md).

Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Current Modules

**→ [`MODULE_STATUS.md`](./MODULE_STATUS.md)** — one row per module: built / schema-only / removed, what
each one does, and the decisions behind it. **Check it before assuming a feature exists or does not** —
several modules were deliberately built and then withdrawn (ใบตรวจรับ/ใบรับวางบิล, ใบส่งมอบงาน, Company
Profiles), and that history lives only there.

## Coding Standards

- TypeScript `strict: true`, plus `noUnusedLocals`/`noUnusedParameters: true` — dead code is a build error, not a lint suggestion.
- No comments unless they explain a non-obvious *why* (a workaround, a hidden constraint). Never comments that restate what the code does.
- One `lib/<domain>.ts` per data domain: types + sample/seed data + pure helper functions + (if applicable) `localStorage` load/save. Pages import from there, never redefine types locally.
- One `pages/<module>/` folder per module once it grows past a single file; a top-level `<Module>Page.tsx` manages view-switching state and composes smaller view components from the same folder.
- Reuse `components/ConfirmDialog.tsx` for any destructive-action confirmation, `components/PromptDialog.tsx` for any single-value text prompt (never `window.prompt()` — see UI_GUIDELINES.md "Dialogs"), and `components/Toast.tsx` + `hooks/useToast.ts` for transient success feedback — don't build a second one-off version of any of them.
- **Any new document editor must wire up `hooks/useAutoSave.ts`** (`useAutoSave` + `useDraftBackup`) with `components/AutoSaveIndicator.tsx` and `components/DraftRecoveryBanner.tsx`, the same way the existing eight do — added 2026-08-25 in direct response to work being lost. Feed the hooks the *exact* payload the Save button sends (`toUpdateFields(draft)`), never the whole loaded record, or server-assigned fields like `updatedAt` make every save look like a change. Call the hooks **above** any loading/error early return. If the module has a server update route, add `isAutoSaveRequest(req)` to it too: suppress the audit entry, and reject non-Draft targets with 409.
- Reuse `components/BrandMark.tsx` for any logo/wordmark rendering — never re-inline a copy-pasted logo block.
- The app is Thai-language by default; `src/lib/i18n.tsx` (`useI18n()`/`t()` in components, `translate()` for plain non-component functions like `apiClient.ts`/`session.ts`) provides a full English alternative, toggled in Settings → Profile. As of 2026-07-09 essentially all UI chrome across every page was wired to the dictionary (~450 keys) — **except Accounting/Stock, added 2026-08-17/18 without any i18n wiring at all, a real gap closed 2026-08-18** (owner-reported: switching to English left the whole "บัญชี" section on-screen in Thai). ~1,692 keys total as of that fix. Two categories are deliberately **not** translated, by design, not oversight: (1) **persisted data/seed content** — audit log entries, notification title/description/module text, default role/department/position descriptions, `Company` default values, and (as of 2026-08-18) accounting document line-item text that's generated and stored server-side at issue time (e.g. a deposit-deduction line's `หักเงินมัดจำ(...)...%` description) — these are business records, not app chrome, and stay in whatever language they were authored in; (2) **`PrintDocument.tsx`** and its per-module counterparts (`ScopeOfWorkPrintDocument.tsx`, `DeliveryOrderPrintDocument.tsx`, `ServiceReportPrintDocument.tsx`, and — since 2026-08-18 — `ArDocumentPrintDocument.tsx`/`ArDocumentNcrPrintDocument.tsx`), the actual printed/PDF documents sent to or filed for customers, which always render in Thai regardless of the preparer's own UI language preference (translating a real business document based on the preparer's UI setting would risk silently sending an English document to a Thai customer, or filing an English tax document). New user-facing strings should always go through `t()`/`translate()` and the dictionary — never re-introduce a hardcoded literal.
- Every module's sidebar/nav visual language, table styling, form input styling, and button styling should match [UI_GUIDELINES.md](./UI_GUIDELINES.md) — copy an existing page's patterns rather than inventing new ones.
- **Before adding a value import to any `src/lib/*.ts(x)` file, check whether it's reachable from `api/`.** Several `src/lib/*` files (`roles.ts`, `users.ts`, `products.ts`, `permissions.ts`, `quotes.ts`, `bahtText.ts`, `quoteMath.ts`, `storage.ts`, `notifications.ts`, `auditLog.ts`) are transitively value-imported into the API bundle (shared types/defaults/pure helpers — e.g. `defaultRoles`, `ALL_PERMISSIONS`, `nowIso`). A new **value** import (not `import type`) added to one of those files must not itself pull in `src/lib/i18n.tsx`, `src/components/*`, or anything else JSX/React-only — even transitively — or every authenticated API route breaks at runtime with `ERR_MODULE_NOT_FOUND` (TypeScript compiles clean either way; this only fails at deploy). `import type` is always erased and always safe. This has bitten twice: 2026-07-09, when `apiClient.ts` briefly imported `i18n.tsx`'s `translate()` and took down every authenticated route via `roles.ts` → `apiClient.ts` → `i18n.tsx`; and 2026-08-21, when the one remaining `.tsx` in the graph (`quotes.tsx`, for its `statusIcon` JSX) crash-looped production in a container that shipped without `tsconfig.json`. **As of 2026-08-25 this rule is enforced, not just documented**: `tests/serverImportGraph.test.ts` walks the real graph from `api/`, follows only imports that survive compilation, and fails if any reachable file is a `.tsx` or imports `react`/`react-dom`/`lucide-react`. Run `npm test` and it will tell you before a deploy does.
- **Always `encodeURIComponent()` a document id (or any other business-id-shaped value) before interpolating it into a `src/lib/*.ts` API call's URL path — never assume it's already URL-safe.** Every `apiFetch()` call site building a path like `` `/quotes/${id}` `` must wrap the id: `` `/quotes/${encodeURIComponent(id)}` ``. This is not a hypothetical — it actually broke every quotation's save/duplicate/rewrite/print/workflow-action in production-shaped code for the entire life of the Quotation module until caught 2026-08-18: `Quote.id` is always formatted like `"Q#260817-0001"` (a literal `#`), and browsers strip everything from `#` onward as a URL *fragment* before `fetch()` ever sends the request — so the unencoded call silently hit e.g. `/api/quotes/Q` and 404'd, every time, for every quote, with `tsc`/`lint`/`build`/`test` all staying green throughout, because none of them execute a real browser `fetch()` against a real id shaped like this. The matching server-side half of this rule: any handler that reads a path segment via the shared `getPathSegments()` helper (`api/_lib/http.ts`) gets it already `decodeURIComponent()`-ed — don't decode it again.

## Design System

Navy/gold theme, Playfair Display (headings) / Inter (body) / JetBrains Mono (numbers, codes). Full token table, component patterns, spacing/typography rules: [UI_GUIDELINES.md](./UI_GUIDELINES.md).

## Current Progress

See [PROJECT_STATUS.md](./PROJECT_STATUS.md) for the maintained completion percentage, sprint status, risks, and technical debt.

## Documentation Index

| File | Purpose |
|---|---|
| [PROJECT_STATUS.md](./PROJECT_STATUS.md) | Progress %, what's done/in-progress/pending, risks, tech debt |
| [CHANGELOG.md](./CHANGELOG.md) | Dated history of every implemented change |
| [SESSION_LOG.md](./SESSION_LOG.md) | Higher-level retrospective per work session (problems found/fixed, recommendations, completion estimate) |
| [TODO.md](./TODO.md) | Prioritized task backlog |
| [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) | Module-by-module Completed/In Progress/Missing/Blocked audit view — added 2026-07-10 |
| [MODULE_STATUS.md](./MODULE_STATUS.md) | Per-module status table (built / schema-only / removed) + the decisions behind each — split out of this file 2026-09-21 |
| [FOLDER_MAP.md](./FOLDER_MAP.md) | Annotated tree of `api/`, `server/`, `src/` — split out of this file 2026-09-21 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Frontend/backend/db/api architecture (Vite + React frontend, Express + MongoDB backend), folder & component organization, refactor decisions |
| [DATABASE.md](./DATABASE.md) | Real MongoDB collections and their shapes |
| [API.md](./API.md) | Real REST API: every route, method, auth/permission requirement |
| [UI_GUIDELINES.md](./UI_GUIDELINES.md) | Design tokens and component patterns |
| [RBAC.md](./RBAC.md) | Roles/permissions model and where each check is enforced (server-side, real) |
| [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) | ✅ **Migration complete (~2026-08-07)** — real production now runs on a self-hosted VPS (own domain + HTTPS, self-hosted MongoDB), Vercel artifacts removed from the repo 2026-09-14 (step H). Records the migration plan, go-live checklist, and the "no vendor-locked services" portability rule (added 2026-07-24) |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Standalone-server install guide (added 2026-08-06): Express via `npm start`, PM2/systemd, nginx/Caddy + HTTPS, backups |
| [MODULES/](./MODULES/) | Per-module deep dive (Dashboard, Quotation, QuotationTemplates, ScopeOfWork, DeliveryOrder, Project, Production, Purchasing, Store, Product, Accounting, Service, CostControl, Lead, Customer, Auth, Settings, CompanyProfiles) |

---

## ⚠️ Standing rule for every future session (read this)

**Documentation is part of the implementation, not a follow-up step.** After completing any implementation, bug fix, refactor, UI change, or architectural decision:

1. Update [PROJECT_STATUS.md](./PROJECT_STATUS.md) (progress %, completed/in-progress/pending).
2. Append an entry to [CHANGELOG.md](./CHANGELOG.md) — **never delete or rewrite previous entries**, only append.
3. Append a retrospective entry to [SESSION_LOG.md](./SESSION_LOG.md) at the end of the session (problems found/fixed, new TODOs, recommendations, completion estimate).
4. Update [TODO.md](./TODO.md) — move finished items to Completed, add newly discovered tasks.
5. Update the relevant file(s) under `MODULES/` for whatever module changed.
6. Update [MODULE_STATUS.md](./MODULE_STATUS.md) / [FOLDER_MAP.md](./FOLDER_MAP.md) if a module's state or the folder layout materially changed, and this file's architecture summary if that did.
7. Update [ARCHITECTURE.md](./ARCHITECTURE.md) if structure changed, [DATABASE.md](./DATABASE.md) if data shapes changed, [API.md](./API.md) if the client-operation surface changed, [RBAC.md](./RBAC.md) if permissions changed, [UI_GUIDELINES.md](./UI_GUIDELINES.md) if new UI patterns were introduced.
8. Before considering any task complete: `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `npm test` must all pass clean. When a change touches tested logic (money math, RBAC rules, workflow transitions, Scope of Work validation, login), update/extend the matching `tests/` file in the same task.

A task is not done until the code works **and** the docs reflect it.

## Full target module list (long-term charter)

Dashboard, Leads, Customers, Products, Quotations, User Management (RBAC), Company Settings, User Profile, Notifications, Audit Logs. Status of each: see [MODULE_STATUS.md](./MODULE_STATUS.md) and [PROJECT_STATUS.md](./PROJECT_STATUS.md). Detailed per-feature requirements for not-yet-built work (PDF polish, user profile uploads, expanded company settings, sidebar "coming soon" policy, dashboard KPI rework) live in [TODO.md](./TODO.md) — this file stays a summary, not the backlog itself.