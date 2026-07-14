# TCS ERP — Project Knowledge Base

> **Start here.** This file is the entry point for understanding the project. Read this first, then follow the links below for depth on any specific area.

## Project Overview

**TCS ERP** (Thai Chemicals Storage ERP) is a Thai-language, internal business web app for a single chemical storage/distribution company (not a multi-tenant SaaS product). It's being built incrementally toward a full multi-module ERP (per the long-term vision in [PROJECT_STATUS.md](./PROJECT_STATUS.md)), starting with **Quotation management** and a **Product library**, plus the supporting shell (auth, settings, dashboard) and — as of 2026-07-08 — a full **RBAC / user management / quotation approval workflow / notifications / audit log** system. As of 2026-07-09 this system is **real, server-enforced** (Vercel Serverless Functions + MongoDB Atlas), not a client-side simulation — see [RBAC.md](./RBAC.md) for exactly what's enforced where.

- **Repo**: https://github.com/Wisarutbuasumlee/tcs-erp (private)
- **Live**: https://tcs-erp-nine.vercel.app (Vercel project `tcs-erp`, auto-deploy on push to `master`)
- **Language**: Thai UI throughout, English code/comments
- **Branding**: navy (`#0b1d3a`) + gold (`#c9a84c`), serif headings (Playfair Display), sans body (Inter), mono numbers (JetBrains Mono)

## Current Development Phase

**Real full-stack app, deployed and live.** As of 2026-07-09 the app is a Vite React frontend + **Vercel Serverless Functions (Node.js) backend + MongoDB Atlas database** — not client-only anymore. Data lives in MongoDB, not `localStorage` (see [DATABASE.md](./DATABASE.md) for the collections). Auth is real: bcrypt-hashed passwords, JWT sessions in an httpOnly cookie, and every request re-fetches the user fresh from MongoDB so a deactivated account is locked out on its very next request. RBAC is enforced **server-side** on every mutating API route (`requirePermission()` in `api/_lib/auth.ts`, reusing the same pure permission functions from `src/lib/roles.ts`) — this is genuinely no longer bypassable via devtools; the server is the source of truth. See [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md), [DATABASE.md](./DATABASE.md), and [RBAC.md](./RBAC.md) for full detail.

This supersedes the previously-proposed "Phase 2" stack (Next.js + Prisma + PostgreSQL + Auth.js) — that plan was **never built**; the migration that actually happened used a different, simpler stack (Vite unchanged + Vercel Functions + MongoDB) chosen for a faster path to a real backend without a frontend framework rewrite. The old proposal is kept in [ARCHITECTURE.md](./ARCHITECTURE.md) as a superseded historical record only — do not build against it.

Known, deliberate scope limitations (not bugs, see [RBAC.md](./RBAC.md) Known Gaps): no automated tests, no CI pipeline, no login rate limiting.

## Project Goals

1. Give TCS employees a working Quotation + Product Library tool today (done).
2. Re-platform onto a real multi-user backend with proper server-enforced RBAC — **done** (2026-07-09, Vercel Functions + MongoDB Atlas, not the originally-proposed Next.js/Prisma/Postgres stack — see Current Development Phase above).
3. Add further ERP modules (Lead/Customer management, HR, Accounting, Inventory, Warehouse, Purchasing, Project Management) on top of that foundation — **not started**.

## Folder Structure

```
ERP/
├── docs/                          # you are here
│   ├── CLAUDE.md                  # this file
│   ├── PROJECT_STATUS.md
│   ├── CHANGELOG.md
│   ├── TODO.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── API.md
│   ├── UI_GUIDELINES.md
│   ├── RBAC.md
│   └── MODULES/
│       ├── Dashboard.md
│       ├── Quotation.md
│       ├── Product.md
│       ├── Lead.md                # not yet implemented
│       ├── Customer.md            # not yet implemented
│       ├── Auth.md
│       ├── Settings.md
│       ├── UserManagement.md
│       ├── RoleManagement.md
│       ├── Notifications.md
│       ├── AuditLog.md
│       └── CompanyProfiles.md     # module removed 2026-07-14 — this file documents the removal, not a live module
├── api/                           # Vercel Serverless Functions backend (Node.js) — see ARCHITECTURE.md
│   ├── handlers/                  # api/handlers/{auth,users,roles,products,categories,notifications,quotes,jobtypes,customers}.ts — one file per resource, dispatches on parsed URL path, reached via vercel.json rewrites (the live routing). `company-profiles.ts` (added 2026-07-13) briefly shared its function slot with customer-data logic to stay under Vercel Hobby's 12-function cap; both the Company Profiles module and that file were removed 2026-07-14, freeing the slot, so `customers.ts` (api/_lib/customersHandler.ts) now has its own dedicated function file in its place — still exactly 12 of 12 function slots used (company + audit-log + dashboard + the 9 handlers/ files), see ARCHITECTURE.md.
│   ├── company/index.ts           # plain single-route file (GET/PUT)
│   ├── audit-log/index.ts         # plain single-route file (GET/POST)
│   ├── dashboard/index.ts         # plain single-route file (GET) — real KPI/chart aggregation, added 2026-07-09, majorly expanded 2026-07-10 (Executive Dashboard/CRM pass)
│   └── _lib/                      # shared server-only code: mongodb.ts, http.ts, auth.ts, collections.ts, rbacSeed.ts, systemSeed.ts, quoteWorkflow.ts
│       # Note: a duplicate `api/{auth,users,roles,products,categories,notifications,quotes}/[[...segments]].ts` catch-all layer existed
│       # pre-2026-07-09 but was confirmed dead (shadowed by vercel.json's rewrites — see ARCHITECTURE.md) and deleted.
├── vercel.json                    # rewrites mapping /api/<resource>[/:path*] to its handler file
├── tsconfig.api.json              # Node-target tsconfig covering api/ (separate from root tsconfig.json which covers src/)
├── src/
│   ├── App.tsx                    # root shell: sidebar, topbar, bootstrap/auth gate, page router (string switch, no react-router)
│   ├── main.tsx                   # entry point
│   ├── components/                # generic, reusable, cross-module UI
│   │   ├── ConfirmDialog.tsx
│   │   ├── Toast.tsx
│   │   ├── NotificationBell.tsx   # header bell + dropdown panel
│   │   ├── BrandMark.tsx          # single shared logo/wordmark component — added 2026-07-09, replaces 6 copy-pasted inline blocks
│   │   ├── EmptyState.tsx         # shared {icon,title,description,actionLabel?,onAction?,compact?} empty state — added 2026-07-10
│   │   ├── PageHeader.tsx         # shared {title,description?,actions?,path?} page header — added 2026-07-10, Dashboard only so far
│   │   ├── MetricInfoTooltip.tsx  # click-to-toggle info popover for KPI cards — added 2026-07-10
│   │   └── GuidedTour.tsx         # useGuidedTour() hook wrapping driver.js, first-time-only — added 2026-07-10
│   ├── hooks/
│   │   └── useToast.ts
│   ├── lib/                       # types + pure helpers + REST API calls (apiFetch), per domain
│   │   ├── apiClient.ts           # apiFetch<T>() — the one place every domain lib talks to the backend
│   │   ├── storage.ts             # Company (incl. bank/VAT/T&C fields, updatedAt/updatedBy)
│   │   ├── users.ts               # User (employee + account record), password hashing, uniqueness checks
│   │   ├── roles.ts               # Role, default role set, hasPermission()/userIsSuperAdmin()/roleNameFor()
│   │   ├── permissions.ts         # Permission union, labels, grouping, Super-Admin-only permissions
│   │   ├── session.ts             # real session (httpOnly JWT cookie) fetch/login/logout
│   │   ├── notifications.ts       # Notification type + per-event builders (submitted/approved/rejected/high-value/...)
│   │   ├── auditLog.ts            # append-only AuditLogEntry log + logAudit()
│   │   ├── products.ts            # Product, ProductCategory (now incl. createdBy/updatedBy)
│   │   ├── quotes.tsx             # Quote (+ approval workflow: statuses, ApprovalHistoryEntry, computeQuotePermissions; +jobTypeCode/jobTypeName/isPotentialOpportunity/followUpDate, added 2026-07-10)
│   │   ├── jobTypes.ts            # JobType master data + fetch/create/update — added 2026-07-10
│   │   ├── customers.ts           # Customer master data + CustomerSnapshot + fetch/create/update/archive — added 2026-07-14, replaces an earlier schema-only draft shape
│   │   ├── dashboard.ts           # fetchDashboardStats(filters) — real KPI/chart/pipeline/forecast/etc. data, added 2026-07-09, majorly expanded 2026-07-10, completed against business spec same day
│   │   └── i18n.tsx               # Thai/English translation context — added 2026-07-09, extended same day and again 2026-07-10 to cover the Executive Dashboard/Job Type pass, see TODO.md
│   ├── pages/
│   │   ├── SetupWizardPage.tsx / SignInPage.tsx / AuthLayout.tsx   # no public sign-up — see MODULES/Auth.md
│   │   ├── SettingsPage.tsx       # incl. language toggle (profile tab)
│   │   ├── dashboard/              # DashboardPage + ~17 subcomponents (ExecutiveSummaryCards, PipelineSteps, QuotationStatusSummary, SalesActivityAnalytics, SalesPerformancePanel, ActivityFollowUpSummary, JobTypeAnalytics, CustomerAnalytics, ActivityTimeline, FollowUpReminders, ApprovalDashboard, NotificationSummary, DashboardFilterBar, DashboardCharts, ChartCard, format/dateRanges helpers) — real MongoDB-backed Executive Dashboard, rebuilt 2026-07-10, completed against the full business spec, fixed against Codex review, then visually redesigned, then reorganized 2026-07-13 against the P'Keng/P'Kee requirement, see MODULES/Dashboard.md
│   │   ├── products/              # ProductsPage, ProductList, ProductForm, CategoriesManager, ProductPickerModal
│   │   ├── quotation/             # QuotationPage, QuoteList, QuoteDocument, LineItemsEditor, InterestButtons, notesFormat, CustomerSelector (added 2026-07-14, replaces the incorrect 2026-07-13 IssuerCompanySelector), PrintDocument
│   │   ├── customers/              # CustomersPage (added 2026-07-14) — Customer master-data admin (list + create/edit modal)
│   │   └── admin/                 # UserManagementPage, RoleManagementPage, AuditLogPage — the companyProfiles/ subfolder (added 2026-07-13) was deleted 2026-07-14, see MODULES/CompanyProfiles.md
│   └── styles/                    # fonts.css, tailwind.css, theme.css (design tokens), index.css
├── eslint.config.js
├── tsconfig.json
├── vite.config.ts
└── package.json
```

## Current Architecture (short version)

- **Vite 6 + React 18 + TypeScript 5.6 (strict) + Tailwind v4.** No UI kit dependency — all hand-rolled Tailwind utility classes matching the navy/gold design system.
- **No router.** `App.tsx` holds an `activeNav` string and switches between page components directly. Pages are `React.lazy`-loaded so each module (and its dependencies, e.g. `recharts` for Dashboard) is a separate JS chunk.
- **Real backend: Vercel Serverless Functions + MongoDB Atlas.** Every domain lib (`users.ts`, `roles.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.tsx`, `storage.ts`, `session.ts`, `dashboard.ts`, `jobTypes.ts`) calls a REST API (`src/lib/apiClient.ts`'s `apiFetch()`) instead of reading/writing `localStorage`. Data lives in MongoDB: 9 fully-wired collections (`users`, `roles`, `company`, `products`, `categories`, `notifications`, `audit_log`, `quotes`, `job_types` — the last added 2026-07-10) plus 15 schema-prepped collections added 2026-07-09 (CRM, org, files, settings scaffolding — no API routes/UI on top of most of them yet) — see [DATABASE.md](./DATABASE.md) for the full list and which is which.
- **Real auth.** A first-run Setup Wizard creates the one Super Admin account; every subsequent account is admin-created via User Management (no public self-signup). Sign-in checks username/email + password via `bcrypt.compare()` against a real bcrypt hash (cost 10) stored per user, server-side. Sessions are a JWT in an httpOnly, secure, `sameSite=lax` cookie (`tcs_erp_session`, 7-day expiry); every request re-fetches the user from MongoDB and checks `status === "active"`, so a deactivated user is locked out on their next request even though the JWT itself is still technically valid. RBAC permission checks run server-side on every mutating route — genuinely unbypassable via devtools now. See [RBAC.md](./RBAC.md).

Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Current Modules

| Module | Status | Summary | Docs |
|---|---|---|---|
| Dashboard | ✅ Built (real data), completed against business spec + independent review + 3 UI simplification passes + a data/filter-correctness fix pass + a P'Keng/P'Kee business-requirement completion pass | **Executive BI dashboard, rebuilt 2026-07-10, completed against the full business spec later the same day, fixed against an independent Codex review's findings in a third same-day pass, then visually redesigned in a fourth same-day pass** (tiered Primary/Secondary KPI cards replacing the old flat grid, `PipelineSteps.tsx` horizontal step cards replacing the broken funnel chart, a new Quotation Status Summary and Sales Activity Analytics section) — **then, 2026-07-13, five more user/review-driven fix passes**: three simplification passes after the tiered KPI cards repeatedly read as "too template-like" (reverted to a flat `KpiGrid`, then replaced that with a compact top overview in a fully-specified 7-section order), a sixth pass fixing 4 High Priority data/filter-correctness bugs an independent review found (Sales Activity expanded from 2 to all 5 event categories, filter-exception widgets now visibly labeled, `QuotationStatusSummary`'s count/value mismatch fixed at the source), then a **seventh pass** completing the Dashboard against a detailed P'Keng/P'Kee business-stakeholder requirement: reordered to its exact required 5-row layout (`ExecutiveSummaryCards` → `QuotationStatusSummary` → `SalesActivityAnalytics` → `ActivityTimeline`, with `SalesPerformancePanel`/`ActivityFollowUpSummary`/the forecast chart moved to supporting detail below), a helper caption added under all 4 KPI cards, a new per-salesperson Sales Activity breakdown table (`salesActivity.bySalesperson`, period × salesperson via a nested Map — not a joined/split string, since Thai names contain spaces), `ActivityTimeline` rebuilt as a table with clickable quotation-number links (new structured `relatedQuoteId`/`relatedCustomerName` audit-log fields), and the Win/Lose/Active/Non-Active mapping explicitly reconfirmed unchanged (user chose to keep today's definition over the requirement doc's conflicting proposal) — then an **eighth pass** fixing a follow-up independent review's 2 High Priority findings: `QuotationStatusSummary`'s Won/Lost/Active/Non-Active donut was double-counting Lost quotations (fixed by excluding Lost from `NON_ACTIVE_OUTCOME_STATUSES`, since Lost already has its own row — the 4 rows are now a true 100%-summing partition), and the rolling-trend widgets now state their actual anchor date instead of a generic disclaimer (department filtering's fragile free-text join, the review's 3rd finding, stays an open tracked TODO, not a quick fix) — see CHANGELOG.md for all passes. Date/salesperson/department filters apply server-side to most sections; a few (trend charts' start date, catalog/personal widgets, the forecast win-rate baseline) are deliberately exceptions for documented reasons and now say so in the UI — see UI_GUIDELINES.md "Filter Honesty." All data from real MongoDB aggregation via `GET /api/dashboard`, no hardcoded values, empty states throughout via `EmptyState.tsx`. Not yet browser-verified against live data (sandboxed-session network limitation, reproduced four times, not a defect — see PROJECT_STATUS.md); client bundle confirmed error-free via repeated Playwright checks against the real components with mock data. **2026-07-14, ninth pass**: every Dashboard monetary total is now pre-tax (before VAT), computed via the shared `computeQuoteAmountBeforeVat(lines, discountPct)` helper (`api/_lib/quoteAmounts.ts`) applied to each quote's own `lines`/`discount` — the same per-line reduction `computeQuoteAmount()` itself uses before adding VAT — instead of `Quote.amount`'s VAT-included grand total; all affected labels now say "ก่อนภาษี"/"(Before VAT)". **2026-07-14, tenth pass (independent Codex review fix)**: fixed 1 Critical + 3 High Priority issues the review found in the ninth pass's work — Sales Activity Analytics was Critically hidden from every default role without `auditLog:view` (now gated only by `dashboard:view`, matching every other required section); it also ignored the date-range filter's `from` entirely (now bounded via `bangkokDayBoundsUtc`, caption switches via a new `dateFiltered` prop); an empty database hid the required KPI cards behind one full-page empty state (now a compact inline banner, required sections always render). Also fixed Expected Sales's truthy-vs-`=== true` predicate. **2026-07-14, eleventh pass**: Company Profiles module fully removed (UI/routes/permissions), Dashboard pre-tax rule reworked from a VAT-reversal division to the items-based `computeQuoteAmountBeforeVat()` helper above, and page shells now render before data loads (progressive/shell-first loading, see UI_GUIDELINES.md). **2026-07-14, twelfth pass (independent Codex review fix)**: fixed 3 High + 3 Medium progressive-loading/data-quality/documentation issues the review found in the eleventh pass (zero Critical) — `App.tsx`'s remaining global `initialDataLoading` gate replaced with per-page `resourceStatus`/`NAV_RESOURCES` tracking so unrelated pages no longer wait on each other's boot data; Dashboard's post-approval/rejection refresh now shows a visible "กำลังอัปเดตข้อมูล..." indicator instead of silently leaving stale data on screen; `GET /api/dashboard`'s 4 optional sections (index creation, activity timeline, sales activity, approval dashboard, notifications) are now isolated in their own try/catch so one failure can't blank KPIs/pipeline/etc.; the first-load Dashboard skeleton now shows the real 4 required sections' actual titles/table headers instead of one generic block; the missing-`lines` pre-tax fallback is now documented + monitored via `console.warn`; stale docs pointing at the removed shared `company-profiles.ts` function file corrected. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Pre-Tax Amount Rule" and `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status." | [MODULES/Dashboard.md](./MODULES/Dashboard.md) |
| Quotation | ✅ Built, server-validated, server-authoritative audit trail | List + create/edit/duplicate quotes, line items with per-item notes and unlimited sub-details, print/PDF export, product-library picker, **9-status approval workflow** (Draft → Pending Approval → Approved → Sent to Customer → Customer Accepted/Rejected → Won/Lost, plus Cancelled) with approval history and signature-image integration. **2026-07-10**: added Job Type classification (13-entry master list, now required + server-validated on create), Potential Opportunity flag, and Follow-up Date — feed the rebuilt Dashboard above. **2026-07-10, Codex review fix**: every quote field is now validated server-side (`api/_lib/quoteValidation.ts`), `amount` is always server-derived from `lines`/`discount` (never client-writable), and quotation numbering is atomic (a `counters` collection, not scan-then-max+1). **2026-07-10, fifth pass**: audit-log entries for create/update/duplicate/every workflow transition are now written server-side (`writeQuoteAuditEntry()` in `api/handlers/quotes.ts`), not by the client after the fact — closing a forgery gap that let any authenticated caller fabricate audit entries the Dashboard's Sales Activity Analytics counted from; Reject/Customer-Reject/Cancel now require a comment server-side too. **2026-07-14, correction pass**: the 2026-07-13 "Issuer Company"/Company Profile selector described in past changelog entries below was built against a misunderstanding of the requirement and has been fully removed; replaced with a Customer selector (`customerId`/`customerSnapshot`, pick a saved [Customer](./MODULES/Customer.md) to autofill the Customer Information section) — see [MODULES/Quotation.md](./MODULES/Quotation.md) "Customer Selection." | [MODULES/Quotation.md](./MODULES/Quotation.md) |
| Product Library | ✅ Built | Product + category CRUD, archive (soft-delete), search/filter/sort/pagination, duplicate, feeds the Quotation line-item picker as independent snapshots | [MODULES/Product.md](./MODULES/Product.md) |
| Auth (Setup Wizard + Sign in) | ✅ Built (server-verified) | First-run Setup Wizard creates the Super Admin; bcrypt+JWT login verified server-side; no public self-signup | [MODULES/Auth.md](./MODULES/Auth.md) |
| Settings | ✅ Built | Self-service profile (incl. picture + signature upload), Super-Admin-only company info (incl. bank/VAT/T&C), security (real password change), notification toggles | [MODULES/Settings.md](./MODULES/Settings.md) |
| User Management | ✅ Built | Create/edit users, reset password, activate/deactivate, assign role/department/position | [MODULES/UserManagement.md](./MODULES/UserManagement.md) |
| Role Management | ✅ Built | Create/delete custom roles, edit permission matrix — Super Admin only | [MODULES/RoleManagement.md](./MODULES/RoleManagement.md) |
| Notifications | ✅ Built | Header bell with unread badge + panel, role-based delivery for quotation events, click deep-links to the specific quotation (2026-07-10). **2026-07-10, fifth pass**: added the 3 missing terminal-workflow notification types (Won/Lost/Cancelled). | [MODULES/Notifications.md](./MODULES/Notifications.md) |
| Audit Log | ✅ Built, quotation events non-forgeable | Append-only, read-only log of every sensitive action. **2026-07-10, fifth pass**: `POST /api/audit-log` now rejects the quotation module — those events can only be written by the quote handlers themselves. | [MODULES/AuditLog.md](./MODULES/AuditLog.md) |
| Lead Management | ⚠️ Schema only | MongoDB collections (`leads`, `lead_activities`) + indexes exist as of 2026-07-09 prod-readiness pass; no API routes or UI yet | [MODULES/Lead.md](./MODULES/Lead.md) |
| Customer Management | ✅ Built (2026-07-14) | Customer master data (company/contact/phone/email/address/tax ID/delivery/project fields), admin CRUD page (`src/pages/customers/CustomersPage.tsx`), 4 new permissions, and a selector on the Quotation form that autofills Customer Information from a saved customer. Redefines the earlier (2026-07-09) schema-only `customers` shape — no live data existed under it, so no migration was needed. `customer_contacts` remains schema-only. | [MODULES/Customer.md](./MODULES/Customer.md) |
| RBAC / Admin (server-enforced) | ✅ Built | 2026-07-09: migrated from client-side simulation to real server-side enforcement (Vercel Functions + MongoDB, bcrypt + JWT auth, `requirePermission()` on every mutating route) — see rows above for the UI/UX, unchanged by the migration | [RBAC.md](./RBAC.md) |
| Company Profiles | ❌ Removed (2026-07-14) | Built 2026-07-13 as business-identity master data (name/logo/address/tax ID/branch/bank accounts), briefly (2026-07-13–14) mis-wired into the Quotation form as an "issuer company" selector, then the same day reverted and replaced with the correct feature (a **Customer** selector — see [Customer Management](./MODULES/Customer.md) row above). Later on 2026-07-14 the standalone admin module itself was also removed on explicit instruction — this ERP only ever needs one issuer company, so a page for managing several was unused scope. UI/routes/permissions/i18n keys all removed; `company_profiles` MongoDB collection and any historical documents/audit entries left untouched (no destructive DB cleanup). See [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) for the full removal writeup and CHANGELOG.md for the itemized diff. | [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) |

## Coding Standards

- TypeScript `strict: true`, plus `noUnusedLocals`/`noUnusedParameters: true` — dead code is a build error, not a lint suggestion.
- ESLint flat config (`eslint.config.js`): `@eslint/js` + `typescript-eslint` recommended + `react-hooks` + `react-refresh`. Run via `npm run lint`.
- No comments unless they explain a non-obvious *why* (a workaround, a hidden constraint). Never comments that restate what the code does.
- One `lib/<domain>.ts` per data domain: types + sample/seed data + pure helper functions + (if applicable) `localStorage` load/save. Pages import from there, never redefine types locally.
- One `pages/<module>/` folder per module once it grows past a single file; a top-level `<Module>Page.tsx` manages view-switching state and composes smaller view components from the same folder.
- Reuse `components/ConfirmDialog.tsx` for any destructive-action confirmation and `components/Toast.tsx` + `hooks/useToast.ts` for transient success feedback — don't build a second one-off version of either.
- Reuse `components/BrandMark.tsx` for any logo/wordmark rendering — never re-inline a copy-pasted logo block.
- The app is Thai-language by default; `src/lib/i18n.tsx` (`useI18n()`/`t()` in components, `translate()` for plain non-component functions like `apiClient.ts`/`session.ts`) provides a full English alternative, toggled in Settings → Profile. As of 2026-07-09 essentially all UI chrome across every page is wired to the dictionary (~450 keys). Two categories are deliberately **not** translated, by design, not oversight: (1) **persisted data/seed content** — audit log entries, notification title/description/module text, default role/department/position descriptions, `Company` default values — these are business records or admin-editable content, not app chrome, and stay in whatever language they were authored in; (2) **`PrintDocument.tsx`**, the actual printed/PDF quotation sent to customers, which always renders in Thai regardless of the admin's own UI language preference (translating a real business document based on the preparer's UI setting would risk silently sending an English quotation to a Thai customer). New user-facing strings should always go through `t()`/`translate()` and the dictionary — never re-introduce a hardcoded literal.
- Every module's sidebar/nav visual language, table styling, form input styling, and button styling should match [UI_GUIDELINES.md](./UI_GUIDELINES.md) — copy an existing page's patterns rather than inventing new ones.
- **Before adding a value import to any `src/lib/*.ts(x)` file, check whether it's reachable from `api/`.** Several `src/lib/*` files (`roles.ts`, `users.ts`, `products.ts`, `permissions.ts`, `quotes.tsx`, `storage.ts`, `notifications.ts`, `auditLog.ts`) are transitively value-imported into the Vercel serverless bundle (shared types/defaults/pure helpers — e.g. `defaultRoles`, `ALL_PERMISSIONS`, `nowIso`). A new **value** import (not `import type`) added to one of those files must not itself pull in `src/lib/i18n.tsx`, `src/components/*`, or anything else JSX/React-only — even transitively — or every authenticated API route breaks at runtime with `ERR_MODULE_NOT_FOUND` (TypeScript compiles clean either way; this only fails at deploy). `import type` is always erased and always safe. This actually happened once (2026-07-09, see CHANGELOG) — `apiClient.ts` briefly imported `i18n.tsx`'s `translate()` and took down every authenticated route via `roles.ts` → `apiClient.ts` → `i18n.tsx`.

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
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Frontend/backend/db/api architecture (Vite + React frontend, Vercel Functions + MongoDB backend), folder & component organization, refactor decisions |
| [DATABASE.md](./DATABASE.md) | Real MongoDB collections and their shapes |
| [API.md](./API.md) | Real REST API: every route, method, auth/permission requirement |
| [UI_GUIDELINES.md](./UI_GUIDELINES.md) | Design tokens and component patterns |
| [RBAC.md](./RBAC.md) | Roles/permissions model and where each check is enforced (server-side, real) |
| [MODULES/](./MODULES/) | Per-module deep dive (Dashboard, Quotation, Product, Lead, Customer, Auth, Settings, CompanyProfiles) |

---

## ⚠️ Standing rule for every future session (read this)

**Documentation is part of the implementation, not a follow-up step.** After completing any implementation, bug fix, refactor, UI change, or architectural decision:

1. Update [PROJECT_STATUS.md](./PROJECT_STATUS.md) (progress %, completed/in-progress/pending).
2. Append an entry to [CHANGELOG.md](./CHANGELOG.md) — **never delete or rewrite previous entries**, only append.
3. Append a retrospective entry to [SESSION_LOG.md](./SESSION_LOG.md) at the end of the session (problems found/fixed, new TODOs, recommendations, completion estimate).
4. Update [TODO.md](./TODO.md) — move finished items to Completed, add newly discovered tasks.
5. Update the relevant file(s) under `MODULES/` for whatever module changed.
6. Update this file's module table / architecture summary if it materially changed.
7. Update [ARCHITECTURE.md](./ARCHITECTURE.md) if structure changed, [DATABASE.md](./DATABASE.md) if data shapes changed, [API.md](./API.md) if the client-operation surface changed, [RBAC.md](./RBAC.md) if permissions changed, [UI_GUIDELINES.md](./UI_GUIDELINES.md) if new UI patterns were introduced.
8. Before considering any task complete: `npx tsc --noEmit`, `npm run lint`, and `npm run build` must all pass clean.

A task is not done until the code works **and** the docs reflect it.

## Full target module list (long-term charter)

Dashboard, Leads, Customers, Products, Quotations, User Management (RBAC), Company Settings, User Profile, Notifications, Audit Logs. Status of each: see Current Modules table above and [PROJECT_STATUS.md](./PROJECT_STATUS.md). Detailed per-feature requirements for not-yet-built work (PDF polish, user profile uploads, expanded company settings, sidebar "coming soon" policy, dashboard KPI rework) live in [TODO.md](./TODO.md) — this file stays a summary, not the backlog itself.