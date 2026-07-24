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
│       ├── CompanyProfiles.md     # module removed 2026-07-14 — this file documents the removal, not a live module
│       ├── QuotationTemplates.md  # added 2026-07-14 — Create Quotation wizard's Job Type/Template data
│       ├── ScopeOfWork.md         # added 2026-07-15 — Scope of Work document generated from a quotation
│       └── DeliveryOrder.md       # added 2026-07-23 — Delivery Order document generated from a Scope of Work
├── api/                           # Vercel Serverless Functions backend (Node.js) — see ARCHITECTURE.md
│   ├── handlers/                  # api/handlers/{auth,users,roles,products,categories,notifications,quotes,jobtypes,customers}.ts — one file per resource, dispatches on parsed URL path, reached via vercel.json rewrites (the live routing). `company-profiles.ts` (added 2026-07-13) briefly shared its function slot with customer-data logic to stay under Vercel Hobby's 12-function cap; both the Company Profiles module and that file were removed 2026-07-14, freeing the slot, so `customers.ts` (api/_lib/customersHandler.ts) now has its own dedicated function file in its place — still exactly 12 of 12 function slots used (company + audit-log + dashboard + the 9 handlers/ files), see ARCHITECTURE.md. `customers.ts` itself now also dispatches `/api/search` (Global Search, added 2026-07-14, api/_lib/searchHandler.ts) on the raw pathname, the same multi-resource-sharing pattern it once used with `company-profiles.ts`. `quotes.ts` itself now also dispatches `/api/scope-of-works` (Scope of Work, added 2026-07-15, api/_lib/scopeOfWorkHandler.ts) and `/api/delivery-orders` (Delivery Order, added 2026-07-23, api/_lib/deliveryOrderHandler.ts) on the raw pathname, the same sharing pattern.
│   ├── company/index.ts           # plain single-route file (GET/PUT)
│   ├── audit-log/index.ts         # plain single-route file (GET/POST)
│   ├── dashboard/index.ts         # plain single-route file (GET) — real KPI/chart aggregation, added 2026-07-09, majorly expanded 2026-07-10 (Executive Dashboard/CRM pass)
│   └── _lib/                      # shared server-only code: mongodb.ts, http.ts, auth.ts, collections.ts, rbacSeed.ts, systemSeed.ts, quoteWorkflow.ts, quoteAmounts.ts, searchHandler.ts (Global Search, added 2026-07-14), templateSeedData.ts + quotationTemplatesHandler.ts (Quotation Templates, added 2026-07-14, mounted from api/handlers/jobtypes.ts) + templateWorkbookParser.ts (real `.xlsx` workbook fingerprinting, added 2026-07-15) + scopeOfWorkHandler.ts (Scope of Work, added 2026-07-15, mounted from api/handlers/quotes.ts) + deliveryOrderHandler.ts (Delivery Order, added 2026-07-23, also mounted from api/handlers/quotes.ts — see MODULES/DeliveryOrder.md) + email.ts (outbound email via Resend's REST API, added 2026-07-23 for Scope of Work's Document Recipients feature — see MODULES/ScopeOfWork.md)
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
│   │   ├── WhatsNewPanel.tsx      # header "มีอะไรใหม่" (What's New) sparkle icon + dropdown panel — added 2026-07-23, in-app update log, see this file's "Current Modules" table row "What's New (topbar)"
│   │   ├── GlobalSearch.tsx       # topbar search dropdown — Quotations/Customers/Products/pages/Users, added 2026-07-14, replaces a never-functional dead input
│   │   ├── BrandMark.tsx          # single shared logo/wordmark component — added 2026-07-09, replaces 6 copy-pasted inline blocks
│   │   ├── TemplatePreview.tsx    # shared Quotation Template preview rendering (compact + full) — added 2026-07-15, used by the wizard and Template Management
│   │   ├── EmptyState.tsx         # shared {icon,title,description,actionLabel?,onAction?,compact?} empty state — added 2026-07-10
│   │   ├── PageHeader.tsx         # shared {title,description?,actions?,path?} page header — added 2026-07-10, Dashboard only so far
│   │   ├── MetricInfoTooltip.tsx  # click-to-toggle info popover for KPI cards — added 2026-07-10
│   │   └── GuidedTour.tsx         # useGuidedTour() hook wrapping driver.js, first-time-only — added 2026-07-10
│   ├── hooks/useToast.ts
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
│   │   ├── quotationTemplates.ts  # QuotationTemplate types + fetch/import/setActive — added 2026-07-14, feeds the Create Quotation wizard
│   │   ├── scopeOfWork.ts         # ScopeOfWork types + fetch/create/update/finalize/duplicate/refresh/delete — added 2026-07-15, generated from a quotation
│   │   ├── deliveryOrder.ts       # DeliveryOrder types + fetch/create/update/finalize/refresh/delete — added 2026-07-23, generated from a Scope of Work
│   │   ├── revisionDiff.ts        # generateQuoteRevisionSummary()/generateScopeOfWorkRevisionSummary() — added 2026-07-23, auto-drafts a Thai bullet-list "what changed" summary into the revisionNote field, see MODULES/Quotation.md and MODULES/ScopeOfWork.md "Revision Note"
│   │   ├── whatsNew.ts            # WHATS_NEW_ENTRIES (hand-maintained, Thai-authored) + per-user localStorage "seen" tracking (hasUnseenWhatsNew()/markWhatsNewSeen(), same convention as tour.ts) — added 2026-07-23, backs WhatsNewPanel.tsx
│   │   ├── documentRequirements.ts # ChecklistOption/ChecklistGroup + buildDefaultChecklistGroups()/validateChecklistGroups() — added 2026-07-16, moved out of scopeOfWork.ts so Quotation's own new checklistGroups field can share the same model
│   │   ├── validation/            # quotationValidation.ts + scopeOfWorkValidation.ts + types.ts — added 2026-07-16, required-field/mandatory-selection validators shared verbatim between the frontend and the API bundle (see api/handlers/quotes.ts, api/_lib/scopeOfWorkHandler.ts)
│   │   ├── customers.ts           # Customer master data + CustomerSnapshot + fetch/create/update/archive — added 2026-07-14, replaces an earlier schema-only draft shape
│   │   ├── dashboard.ts           # fetchDashboardStats(filters) — real KPI/chart/pipeline/forecast/etc. data, added 2026-07-09, majorly expanded 2026-07-10, completed against business spec same day
│   │   ├── search.ts              # fetchGlobalSearch(query, signal) — GET /api/search, typed SearchResults, added 2026-07-14
│   │   └── i18n.tsx               # Thai/English translation context — added 2026-07-09, extended same day and again 2026-07-10 to cover the Executive Dashboard/Job Type pass, see TODO.md
│   ├── pages/
│   │   ├── SetupWizardPage.tsx / SignInPage.tsx / AuthLayout.tsx   # no public sign-up — see MODULES/Auth.md
│   │   ├── SettingsPage.tsx       # incl. language toggle (profile tab)
│   │   ├── dashboard/              # DashboardPage + ~17 subcomponents (ExecutiveSummaryCards, PipelineSteps, QuotationStatusSummary, SalesActivityAnalytics, SalesPerformancePanel, ActivityFollowUpSummary, JobTypeAnalytics, CustomerAnalytics, ActivityTimeline, FollowUpReminders, ApprovalDashboard, NotificationSummary, DashboardFilterBar, DashboardCharts, ChartCard, format/dateRanges helpers) — real MongoDB-backed Executive Dashboard, rebuilt 2026-07-10, completed against the full business spec, fixed against Codex review, then visually redesigned, then reorganized 2026-07-13 against the P'Keng/P'Kee requirement, see MODULES/Dashboard.md
│   │   ├── products/              # ProductsPage, ProductList, ProductForm, CategoriesManager, ProductPickerModal
│   │   ├── quotation/             # QuotationPage, QuoteList, QuoteDocument, LineItemsEditor, InterestButtons, CustomerSelector (added 2026-07-14, replaces the incorrect 2026-07-13 IssuerCompanySelector), PrintDocument, QuotationTemplateWizard + applyTemplate.ts (Create Quotation wizard, added 2026-07-14), ScopeOfWorkDocument + ScopeOfWorkItemsEditor + ScopeOfWorkPrintDocument (Scope of Work, added 2026-07-15 — reached via a "scopeOfWork" view state in QuotationPage when opened from a quotation; **2026-07-22: also reused directly by the new standalone scopeOfWork/ page below**, via an optional `backLabel` prop), ChecklistGroupCard (renamed 2026-07-16 from ScopeOfWorkChecklistGroup.tsx when Quotation briefly reused it for its own checklistGroups; that Quotation-side usage was removed again the same day, so this component is Scope-of-Work-only in practice today, just kept under its more generic name), DocumentRecipientsPicker (added 2026-07-23, real-people email routing for the `documentsToSend` checklist — see MODULES/ScopeOfWork.md "Document Recipients"), DeliveryOrderDocument + DeliveryOrderPrintDocument (Delivery Order, added 2026-07-23, generated from a Scope of Work via a "สร้าง/เปิดใบส่งมอบสินค้า" button on ScopeOfWorkDocument's toolbar — see MODULES/DeliveryOrder.md)
│   │   ├── scopeOfWork/            # ScopeOfWorkPage + ScopeOfWorkList (added 2026-07-22) — standalone "Scope of Work" sidebar module for browsing/opening existing records (creation still only via the Quotation-detail button above); reuses quotation/ScopeOfWorkDocument.tsx for the detail view
│   │   ├── deliveryOrder/          # DeliveryOrderPage + DeliveryOrderList (added 2026-07-23) — standalone "ใบส่งมอบสินค้า" sidebar module, same pattern as scopeOfWork/ above; reuses quotation/DeliveryOrderDocument.tsx for the detail view
│   │   ├── customers/              # CustomersPage (added 2026-07-14) — Customer master-data admin (list + create/edit modal)
│   │   ├── templates/              # TemplateManagementPage + TemplateEditorView (added 2026-07-15) — Quotation Template admin (list + create/edit with sections/items CRUD)
│   │   └── admin/                 # UserManagementPage, RoleManagementPage, AuditLogPage — the companyProfiles/ subfolder (added 2026-07-13) was deleted 2026-07-14, see MODULES/CompanyProfiles.md
│   └── styles/                    # fonts.css, tailwind.css, theme.css (design tokens), index.css
└── eslint.config.js / tsconfig.json / vite.config.ts / package.json
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
| Dashboard | ✅ Built (real data), completed against business spec + many review/fix passes | Executive BI dashboard backed by real MongoDB aggregation via `GET /api/dashboard` — compact KPI overview (**exactly 4 cards** in the top row, a documented business requirement), Quotation Status Summary, Sales Activity Analytics, Activity Timeline, plus supporting detail (Sales Performance, forecast, Scope of Work summary card). Every monetary total is **pre-tax** via the shared `computeQuoteAmountBeforeVat()` helper (see [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Pre-Tax Amount Rule"), and every quote-count/-value aggregate collapses a rewritten quotation's revision chain to its latest revision (`dedupeQuotesByRevisionChain()`, see "Revision Chain De-duplication"). Date/salesperson/department filters apply server-side to most sections; the deliberate exceptions say so in the UI — see [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Filter Honesty". Full pass-by-pass history (12+ passes, 2026-07-10 → 2026-07-23): [CHANGELOG.md](./CHANGELOG.md). | [MODULES/Dashboard.md](./MODULES/Dashboard.md) |
| Quotation | ✅ Built, server-validated, server-authoritative audit trail | List + create/edit/duplicate, line items with per-item notes and sub-details, print/PDF, product-library picker, **9-status approval workflow** with server-written (non-forgeable) audit entries. `amount` is always server-derived from `lines`/`discount`; numbering is atomic (a `counters` collection). Job Type classification is required + server-validated; the Create Quotation wizard applies templates (see Quotation Templates row). A Customer selector autofills from saved Customers. A "Rewrite/แก้ไข" action creates `{root}-R{n}` revisions, with an optional one-click auto-drafted Thai Revision Note (`src/lib/revisionDiff.ts`). Required-field *policy* is deliberately minimal (only `client` required — an explicit business decision); the validation *mechanism* (server 422, real `disabled` buttons) remains. `quotations:viewAll` gates seeing others' quotes (own-quotes-only without it) — **required a manual Role Management step on production**, see [RBAC.md](./RBAC.md). History: [CHANGELOG.md](./CHANGELOG.md). | [MODULES/Quotation.md](./MODULES/Quotation.md) |
| Product Library | ✅ Built | Product + category CRUD, archive (soft-delete), search/filter/sort/pagination, duplicate, feeds the Quotation line-item picker as independent snapshots | [MODULES/Product.md](./MODULES/Product.md) |
| Auth (Setup Wizard + Sign in) | ✅ Built (server-verified) | First-run Setup Wizard creates the Super Admin; bcrypt+JWT login verified server-side; no public self-signup. **2026-07-21**: `apiClient.ts` now translates the raw `"Not authenticated"` 401 server string (thrown whenever a session cookie is missing/expired/invalid — 7-day JWT, or the user deactivated/edited since login) into a real message ("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"/"Your session has expired — please sign in again") — previously leaked untranslated to the UI, reported by a user as a confusing "not authentication" toast on Approve. `App.tsx` still doesn't proactively re-check the session mid-page-view (tracked in `docs/TODO.md`). | [MODULES/Auth.md](./MODULES/Auth.md) |
| Settings | ✅ Built | Self-service profile (incl. picture + signature upload), Super-Admin-only company info (incl. bank/VAT/T&C), security (real password change), notification toggles | [MODULES/Settings.md](./MODULES/Settings.md) |
| User Management | ✅ Built | Create/edit users, reset password, activate/deactivate, assign role/department/position. **2026-07-23**: `department` changed from a free-text input (datalist autocomplete hints only) to a real `<select>` constrained to 6 values (Purchase/Project/Factory/Technic/Service/Accounting, `DOCUMENT_RECIPIENT_DEPARTMENTS` in `src/lib/documentRequirements.ts`) — links a user's department to Scope of Work's "เอกสารส่งถึง" document-routing checklist, see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients". A pre-existing free-text value is kept as a selectable "legacy value" fallback option rather than silently discarded. | [MODULES/UserManagement.md](./MODULES/UserManagement.md) |
| Role Management | ✅ Built | Create/delete custom roles, edit permission matrix — Super Admin only | [MODULES/RoleManagement.md](./MODULES/RoleManagement.md) |
| Notifications | ✅ Built | Header bell with unread badge + panel, role-based delivery for quotation events, click deep-links to the specific quotation (2026-07-10). **2026-07-10, fifth pass**: added the 3 missing terminal-workflow notification types (Won/Lost/Cancelled). **2026-07-23**: added `scope_of_work_document_sent`, the first notification type not tied to the quotation approval workflow — fired to explicitly-picked people (not a role) when Scope of Work's "ส่งอีเมลแจ้งผู้รับเอกสาร" runs, deep-links to that record on the standalone Scope of Work page via a new `relatedScopeId` field. See [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients". | [MODULES/Notifications.md](./MODULES/Notifications.md) |
| Audit Log | ✅ Built, quotation events non-forgeable | Append-only, read-only log of every sensitive action. **2026-07-10, fifth pass**: `POST /api/audit-log` now rejects the quotation module — those events can only be written by the quote handlers themselves. | [MODULES/AuditLog.md](./MODULES/AuditLog.md) |
| Lead Management | ⚠️ Schema only | MongoDB collections (`leads`, `lead_activities`) + indexes exist as of 2026-07-09 prod-readiness pass; no API routes or UI yet | [MODULES/Lead.md](./MODULES/Lead.md) |
| Customer Management | ✅ Built (2026-07-14) | Customer master data (company/contact/phone/email/address/tax ID/delivery/project fields), admin CRUD page (`src/pages/customers/CustomersPage.tsx`), 4 new permissions, and a selector on the Quotation form that autofills Customer Information from a saved customer. Redefines the earlier (2026-07-09) schema-only `customers` shape — no live data existed under it, so no migration was needed. `customer_contacts` remains schema-only. | [MODULES/Customer.md](./MODULES/Customer.md) |
| RBAC / Admin (server-enforced) | ✅ Built | 2026-07-09: migrated from client-side simulation to real server-side enforcement (Vercel Functions + MongoDB, bcrypt + JWT auth, `requirePermission()` on every mutating route) — see rows above for the UI/UX, unchanged by the migration | [RBAC.md](./RBAC.md) |
| Global Search (topbar) | ✅ Built (2026-07-14), fixed against an independent Codex review the same day | Replaces a never-functional dead search input. `GET /api/search?q=` searches Quotations/Customers/Products/pages/Users, every category independently RBAC-filtered server-side; results grouped in a debounced dropdown with keyboard nav and a Ctrl/Cmd+K shortcut. **Same-day fix pass**: added a server-side max query length (was unbounded, a real DoS/performance risk on the multi-collection regex scan) plus a matching client `maxLength`; added a real mobile/tablet entry point (`lg:hidden` full-screen search takeover — previously the whole feature was invisible below 1024px and Ctrl/Cmd+K silently focused a hidden input); a view-only Customer search result no longer deep-links into an editable form it shouldn't reach; added combobox/listbox ARIA semantics + active-row scroll. Not a standalone admin module — no dedicated page/permissions of its own, just a cross-cutting search over the modules above. See `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status." | [API.md](./API.md), [UI_GUIDELINES.md](./UI_GUIDELINES.md) |
| What's New (topbar) | ✅ Built (2026-07-23) | Direct user request for an in-app "update log" so users can see recent feature updates without asking anyone — a "มีอะไรใหม่" sparkle icon in the topbar (`src/components/WhatsNewPanel.tsx`, next to the notification bell) opens a dropdown of recent updates, newest first, each with a date and a short Thai bullet-list description. Content is a plain hand-maintained array (`WHATS_NEW_ENTRIES` in `src/lib/whatsNew.ts`) — no new MongoDB collection or API route; these are short end-user announcements, not the technical changelog (`docs/CHANGELOG.md`), so they're authored directly rather than auto-generated from it. A gold dot badge shows when there's an entry newer than the ones this specific user has already opened the panel to see — tracked per-user in `localStorage` (`hasUnseenWhatsNew()`/`markWhatsNewSeen()`), the same client-side-preference convention `tour.ts` already uses for guided-tour completion, not real business data so no schema/API change was warranted. Not a standalone admin module — no dedicated page/permissions, just a cross-cutting announcement panel like Global Search above. To add a new announcement: prepend an entry to `WHATS_NEW_ENTRIES`; only genuinely user-relevant features belong here, not every internal fix. | [UI_GUIDELINES.md](./UI_GUIDELINES.md) |
| Company Profiles | ❌ Removed (2026-07-14) | Built 2026-07-13 as business-identity master data (name/logo/address/tax ID/branch/bank accounts), briefly (2026-07-13–14) mis-wired into the Quotation form as an "issuer company" selector, then the same day reverted and replaced with the correct feature (a **Customer** selector — see [Customer Management](./MODULES/Customer.md) row above). Later on 2026-07-14 the standalone admin module itself was also removed on explicit instruction — this ERP only ever needs one issuer company, so a page for managing several was unused scope. UI/routes/permissions/i18n keys all removed; `company_profiles` MongoDB collection and any historical documents/audit entries left untouched (no destructive DB cleanup). See [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) for the full removal writeup and CHANGELOG.md for the itemized diff. | [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) |
| Quotation Templates | ✅ Built, incl. the full Template Management admin module | Create Quotation wizard (Job Type → Template → Preview → pre-filled form) + a full `จัดการ Template ใบเสนอราคา` admin module (sections/items CRUD, duplicate, activate/archive, 7 granular permissions). Templates live in `quotation_templates`, imported from the real source workbook via an idempotent content-hash-gated `POST /api/quotation-templates/import` (`api/_lib/templateWorkbookParser.ts` does real `.xlsx` parsing). Copy-on-apply is **"snapshot, never live reference"** — internal-staff notes never reach a customer quote, and `Quote.templateSnapshot` freezes the applied template's structure at creation time. Template product links are server-resolved/snapshotted, never trusted from the client. The wizard's Job Type grid uses a documented 4-way ordering partition (has-Template → no-Template → OTHER BF/SC/TA → generic OTHER). History incl. two same-day Codex-review fix passes: [CHANGELOG.md](./CHANGELOG.md). | [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) |
| Scope of Work | ✅ Built | Document type generated from a quotation, reproducing the reference PDF in `public/` — an **independent snapshot** (editing never touches the quotation; explicit "อัปเดตข้อมูลจากใบเสนอราคา" re-pull), **no pricing anywhere**, server-generated atomic scope number, 11 reusable checklist groups, strict required-field validation before Print/Finalize, Draft/Final lifecycle, Duplicate + Rewrite (`-R{n}` on `scopeNumber`) with auto-draftable Revision Note, and its own standalone sidebar page. 7 `scopeOfWork:*` permissions incl. `viewAll` (own-records-only without it) — **required a manual Role Management step on production**, see [RBAC.md](./RBAC.md). **Document Recipients**: the "เอกสารส่งถึง" checklist maps to real people via department-linked pickers; "ส่งอีเมลแจ้งผู้รับเอกสาร" emails recipients via Resend (**requires `RESEND_API_KEY` in env** — see [TODO.md](./TODO.md)), writes an in-app notification, and makes the record visible to recipients; the email's own deep-link limitation is documented. **Attachments** (≤2 MB/file, ≤5/record) store bytes in the `scope_attachment_files` MongoDB collection with unauthenticated capability-URL downloads — deliberately **not** Vercel Blob, see [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md); not carried over by Duplicate/Rewrite. History (10+ passes, 2026-07-15 → 2026-07-24): [CHANGELOG.md](./CHANGELOG.md). | [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) |
| Delivery Order | ✅ Built (2026-07-23) | "ใบส่งมอบสินค้าและบริการ" generated from a Scope of Work (independent snapshot; explicit re-pull reconciles installments by id), with its own standalone sidebar page. Printing is strictly **per payment milestone** — each installment card has its own print button producing an independent Delivery Note (own เลขที่/วันที่, ticked-items checklist, Remark); there is deliberately no whole-document print. Deposit installments are excluded via the exact-whole-label `isDepositLabel()` set ("Down Payment"/"Deposit"/"เงินมัดจำ"/"ชำระเงินล่วงหน้า") — **never substring/percentage-based**. The print layout is a visually-verified replica of the FM-SL-05 reference PDF, and the browser's print-dialog URL footer is suppressed via a component-scoped `@page { margin: 0 }` override (the one documented exception to the "browser headers/footers aren't app-controllable" rule — see [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Print / PDF"). 7 `deliveryOrder:*` permissions mirroring Scope of Work — **required a manual Role Management step on production**. No Duplicate/Rewrite and no required-field gate (both deliberate). History: [CHANGELOG.md](./CHANGELOG.md). | [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md) |

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
| [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) | ⚠️ **The Vercel deployment is a demo only** — the real production hosting will be a self-managed server (not yet started, deferred until development finishes). Records the agreed migration plan + the "no new Vercel-locked services" rule (added 2026-07-24, per direct user request to write this down so it never needs re-explaining) |
| [MODULES/](./MODULES/) | Per-module deep dive (Dashboard, Quotation, QuotationTemplates, ScopeOfWork, DeliveryOrder, Product, Lead, Customer, Auth, Settings, CompanyProfiles) |

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