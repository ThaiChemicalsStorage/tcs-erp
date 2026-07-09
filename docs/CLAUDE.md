# TCS ERP — Project Knowledge Base

> **Start here.** This file is the entry point for understanding the project. Read this first, then follow the links below for depth on any specific area.

## Project Overview

**TCS ERP** (Thai Chemicals Storage ERP) is a Thai-language, internal business web app for a single chemical storage/distribution company (not a multi-tenant SaaS product). It's being built incrementally toward a full multi-module ERP (per the long-term vision in [PROJECT_STATUS.md](./PROJECT_STATUS.md)), starting with **Quotation management** and a **Product library**, plus the supporting shell (auth, settings, dashboard) and — as of 2026-07-08 — a full **RBAC / user management / quotation approval workflow / notifications / audit log** system, simulated entirely client-side (see [RBAC.md](./RBAC.md) for what "simulated" means and why).

- **Repo**: https://github.com/Wisarutbuasumlee/tcs-erp (private)
- **Language**: Thai UI throughout, English code/comments
- **Branding**: navy (`#0b1d3a`) + gold (`#c9a84c`), serif headings (Playfair Display), sans body (Inter), mono numbers (JetBrains Mono)

## Current Development Phase

**Phase 1 — Frontend demo, client-only.** Everything currently runs as a Vite React SPA with **no backend and no database**. Data lives in React state, most of it mirrored to `localStorage` (see [DATABASE.md](./DATABASE.md) for exactly what is and isn't persisted). As of 2026-07-08 the app has a real multi-user login (hashed passwords, active/inactive accounts), role-based permissions, a quotation approval workflow, notifications, and an audit log — but all of it is **enforced client-side only** (any check can be bypassed via devtools, since there's no server to be the source of truth). Treat it as a UI/UX simulation of enterprise RBAC, not a secure system — see [RBAC.md](./RBAC.md).

A **Phase 2 architecture** (Next.js + Prisma + PostgreSQL + real RBAC) was designed and agreed on stack-wise, but **has not been started** — no Next.js project exists yet, no database is provisioned. See [ARCHITECTURE.md](./ARCHITECTURE.md) and [RBAC.md](./RBAC.md) for the proposed design, clearly marked as not-yet-implemented. Do not assume any backend/API/RBAC code exists until this migration actually happens.

## Project Goals

1. Give TCS employees a working Quotation + Product Library tool today (done, client-only).
2. Re-platform onto a real multi-user backend (Next.js/Prisma/Postgres) with proper RBAC — **pending decision, not started**.
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
│       └── AuditLog.md
├── src/
│   ├── App.tsx                    # root shell: sidebar, topbar, bootstrap/auth gate, page router (string switch, no react-router)
│   ├── main.tsx                   # entry point
│   ├── components/                # generic, reusable, cross-module UI
│   │   ├── ConfirmDialog.tsx
│   │   ├── Toast.tsx
│   │   └── NotificationBell.tsx   # header bell + dropdown panel
│   ├── hooks/
│   │   └── useToast.ts
│   ├── lib/                       # types + sample data + pure helpers + localStorage I/O, per domain
│   │   ├── storage.ts             # Company (incl. bank/VAT/T&C fields)
│   │   ├── users.ts               # User (employee + account record), password hashing, uniqueness checks
│   │   ├── roles.ts               # Role, default role set, hasPermission()/userIsSuperAdmin()/roleNameFor()
│   │   ├── permissions.ts         # Permission union, labels, grouping, Super-Admin-only permissions
│   │   ├── session.ts             # current-session userId load/save/clear
│   │   ├── notifications.ts       # Notification type + per-event builders (submitted/approved/rejected/high-value/...)
│   │   ├── auditLog.ts            # append-only AuditLogEntry log + logAudit()
│   │   ├── products.ts            # Product, ProductCategory
│   │   ├── quotes.tsx             # Quote (+ approval workflow: statuses, ApprovalHistoryEntry, computeQuotePermissions)
│   │   └── salesTeam.ts           # shared sample sales-team data (Dashboard + Quotation)
│   ├── pages/
│   │   ├── SetupWizardPage.tsx / SignInPage.tsx / AuthLayout.tsx   # no public sign-up — see MODULES/Auth.md
│   │   ├── SettingsPage.tsx
│   │   ├── dashboard/DashboardPage.tsx
│   │   ├── products/              # ProductsPage, ProductList, ProductForm, CategoriesManager, ProductPickerModal
│   │   ├── quotation/             # QuotationPage, QuoteList, QuoteDocument, LineItemsEditor, InterestButtons, notesFormat
│   │   └── admin/                 # UserManagementPage, RoleManagementPage, AuditLogPage
│   └── styles/                    # fonts.css, tailwind.css, theme.css (design tokens), index.css
├── eslint.config.js
├── tsconfig.json
├── vite.config.ts
└── package.json
```

## Current Architecture (short version)

- **Vite 6 + React 18 + TypeScript 5.6 (strict) + Tailwind v4.** No UI kit dependency — all hand-rolled Tailwind utility classes matching the navy/gold design system.
- **No router.** `App.tsx` holds an `activeNav` string and switches between page components directly. Pages are `React.lazy`-loaded so each module (and its dependencies, e.g. `recharts` for Dashboard) is a separate JS chunk.
- **No backend.** All "APIs" are plain function calls in `lib/*.ts`. Product/Category/Company/Users/Roles/Notifications/AuditLog/Quotes all persist to `localStorage` now (quotes gained persistence as part of the 2026-07-08 RBAC work — previously they didn't).
- **Real-ish client-side auth.** A first-run Setup Wizard creates the one Super Admin account; every subsequent account is admin-created via User Management (no public self-signup). Sign-in checks username/email + password against a hashed (not cryptographically, see [RBAC.md](./RBAC.md)) password stored per user. Still not real security — it's all enforced and stored in the browser, trivially bypassable via devtools. No server exists to be the actual source of truth.

Full detail: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Current Modules

| Module | Status | Summary | Docs |
|---|---|---|---|
| Dashboard | ✅ Built | KPI cards, revenue/expense chart, category donut, sales leaderboard, orders table, activity feed — all static sample data | [MODULES/Dashboard.md](./MODULES/Dashboard.md) |
| Quotation | ✅ Built | List + create/edit/duplicate quotes, line items with per-item notes and unlimited sub-details, print/PDF export, product-library picker, **9-status approval workflow** (Draft → Pending Approval → Approved → Sent to Customer → Customer Accepted/Rejected → Won/Lost, plus Cancelled) with approval history and signature-image integration | [MODULES/Quotation.md](./MODULES/Quotation.md) |
| Product Library | ✅ Built | Product + category CRUD, archive (soft-delete), search/filter/sort/pagination, duplicate, feeds the Quotation line-item picker as independent snapshots | [MODULES/Product.md](./MODULES/Product.md) |
| Auth (Setup Wizard + Sign in) | ✅ Built (client-side, not secure) | First-run Setup Wizard creates the Super Admin; real (client-checked) username/password login; no public self-signup | [MODULES/Auth.md](./MODULES/Auth.md) |
| Settings | ✅ Built | Self-service profile (incl. picture + signature upload), Super-Admin-only company info (incl. bank/VAT/T&C), security (real password change), notification toggles | [MODULES/Settings.md](./MODULES/Settings.md) |
| User Management | ✅ Built | Create/edit users, reset password, activate/deactivate, assign role/department/position | [MODULES/UserManagement.md](./MODULES/UserManagement.md) |
| Role Management | ✅ Built | Create/delete custom roles, edit permission matrix — Super Admin only | [MODULES/RoleManagement.md](./MODULES/RoleManagement.md) |
| Notifications | ✅ Built | Header bell with unread badge + panel, role-based delivery for quotation events | [MODULES/Notifications.md](./MODULES/Notifications.md) |
| Audit Log | ✅ Built | Append-only, read-only log of every sensitive action | [MODULES/AuditLog.md](./MODULES/AuditLog.md) |
| Lead Management | ❌ Not started | Planned per original ERP spec | [MODULES/Lead.md](./MODULES/Lead.md) |
| Customer Management | ❌ Not started | Planned per original ERP spec | [MODULES/Customer.md](./MODULES/Customer.md) |
| RBAC / Admin (server-enforced) | ❌ Not started | Client-side simulation built (see rows above); real server-enforced version still pending the Phase 2 Next.js migration decision | [RBAC.md](./RBAC.md) |

## Coding Standards

- TypeScript `strict: true`, plus `noUnusedLocals`/`noUnusedParameters: true` — dead code is a build error, not a lint suggestion.
- ESLint flat config (`eslint.config.js`): `@eslint/js` + `typescript-eslint` recommended + `react-hooks` + `react-refresh`. Run via `npm run lint`.
- No comments unless they explain a non-obvious *why* (a workaround, a hidden constraint). Never comments that restate what the code does.
- One `lib/<domain>.ts` per data domain: types + sample/seed data + pure helper functions + (if applicable) `localStorage` load/save. Pages import from there, never redefine types locally.
- One `pages/<module>/` folder per module once it grows past a single file; a top-level `<Module>Page.tsx` manages view-switching state and composes smaller view components from the same folder.
- Reuse `components/ConfirmDialog.tsx` for any destructive-action confirmation and `components/Toast.tsx` + `hooks/useToast.ts` for transient success feedback — don't build a second one-off version of either.
- Every module's sidebar/nav visual language, table styling, form input styling, and button styling should match [UI_GUIDELINES.md](./UI_GUIDELINES.md) — copy an existing page's patterns rather than inventing new ones.

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
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Frontend/backend/db/api architecture, folder & component organization, refactor decisions |
| [DATABASE.md](./DATABASE.md) | Current client-side data shapes + proposed future Prisma schema |
| [API.md](./API.md) | Current client-side "operations" + proposed future API design |
| [UI_GUIDELINES.md](./UI_GUIDELINES.md) | Design tokens and component patterns |
| [RBAC.md](./RBAC.md) | Current (none) + proposed roles/permissions design |
| [MODULES/](./MODULES/) | Per-module deep dive (Dashboard, Quotation, Product, Lead, Customer, Auth, Settings) |

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