# Project Status

> Maintained after every task. See [CLAUDE.md](./CLAUDE.md) for the standing update rule.

## Overall ERP Progress

**~18%** of the full long-term vision (Lead/Quotation/Customer/Product now, then HR/Accounting/Inventory/Warehouse/Purchasing/Project Management later, all on a real multi-user backend with RBAC).

Within **Phase 1 (frontend demo)** specifically, the scoped modules (Dashboard, Quotation, Product Library, Auth shell, Settings) are functionally complete for a client-only app: **~90%**.

## Current Phase

**Phase 1 — Frontend demo (client-only, no backend).**

## Completed Features

- ✅ Dashboard: KPI cards, revenue/expense area chart, category donut, sales leaderboard, orders table, activity feed (static sample data)
- ✅ Quotation list: search/filter by status, summary cards
- ✅ Quotation document: create/edit/duplicate, line items with qty/price/discount, quote-level discount + VAT (7%) calculation, remarks, signature blocks
- ✅ Quotation item notes (multi-line, bullet/numbered toolbar) and unlimited sub-details (add/edit/delete/drag-to-reorder) — snapshot per line item, independent of the Product Library
- ✅ Print/PDF export via browser print, with a dedicated print-only rendering of notes/sub-details (indented, formatted)
- ✅ Product Library: CRUD, categories (create/rename/archive), archive vs. permanent delete (with confirmation), duplicate, search/filter/sort/pagination
- ✅ Quotation ↔ Product Library integration: pick-from-library modal that snapshots product data into a line item (never a live reference)
- ✅ Sign in / Sign up (client-only fake auth), Settings (profile, company info, security mock, notification toggles)
- ✅ Company info entered in Settings flows through live to the quotation document header
- ✅ ESLint + strict TypeScript (`noUnusedLocals`/`noUnusedParameters`) wired in; `tsc`/`eslint`/`build` all pass clean
- ✅ Code-split by page via `React.lazy` (Dashboard's `recharts` dependency no longer bloats the main bundle)
- ✅ Git repo initialized, pushed to GitHub (`Wisarutbuasumlee/tcs-erp`, private)
- ✅ This documentation system

## In Progress

- Nothing actively in progress as of this writing — see Next Sprint below for what's queued.

## Pending Features

- Real backend (Next.js + Prisma + PostgreSQL) — architecture designed, **not started**, blocked on a user decision + Neon Postgres connection string
- Real authentication + RBAC (9 roles, permission-based sidebar/route/action gating) — design proposed in [RBAC.md](./RBAC.md), **not implemented**
- Lead Management module — **not started**
- Customer Management module — **not started** (quotations currently carry only a free-text client name, no customer entity)
- Quote persistence — quotes currently live in React state only and reset on page reload (see Technical Debt)
- Secondary quotation document fields (contact person, phone, address, tax ID, PO reference, dates, payment terms) are visually editable but not saved anywhere
- Dashboard's "ส่งออกรายงาน" (export report), "+ สร้างคำสั่งซื้อ" (create order), "ดูทั้งหมด" (view all orders) — reference an Orders/Reports module that doesn't exist yet, left inert by design
- Global header search — decorative, not wired to any data
- Notification bell — decorative badge, no real notification feed
- HR, Accounting, Inventory, Warehouse, Purchasing, Project Management modules — not started

## Upcoming Milestones

1. **Decide + start Phase 2 backend migration** (Next.js/Prisma/Postgres/Auth.js/RBAC) — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the proposed plan.
2. **Lead & Customer Management module** — the original "Phase 1" scope from the initial ERP spec, still outstanding.
3. **Persist quotes** (either localStorage now, or directly to the real DB once Phase 2 starts).

## Current Sprint

No formal sprint tracked yet — work has proceeded feature-by-feature per direct request. This section will start being populated once work resumes.

## Next Sprint

Not yet planned — depends on the Phase 2 backend decision (see [TODO.md](./TODO.md) High Priority).

## Known Risks

- **Data loss on reload**: quotes are in-memory only. Anyone using this as a real demo will lose new/edited quotes on refresh. High-visibility risk if this is shown to stakeholders as "working."
- **No real auth**: the sign-in screen accepts any email/password. Must not be exposed outside a trusted local/demo context.
- **Scope ambiguity**: the long-term ERP vision (RBAC, multi-department, many modules) is far larger than what exists today. Expectations should be managed against [CLAUDE.md](./CLAUDE.md)'s "Current Development Phase" section.

## Technical Debt

- `Quote[]` state in `App.tsx` is not persisted to `localStorage` (unlike `Product`, `ProductCategory`, `Company`, `UserProfile`) — inconsistent persistence story across domains.
- Document meta-fields beyond client name (contact, phone, address, tax ID, PO ref, dates, payment terms) are uncontrolled/cosmetic inputs on `QuoteDocument.tsx` — not part of the `Quote` type, not saved.
- `salesTeam` (sales leaderboard data) is shared, static sample data with no CRUD — will need to become real data once an HR/Sales-team entity exists.
- No automated tests exist anywhere in the project.
- No CI pipeline configured.
- Bundle: `DashboardPage` chunk is ~445KB (mostly `recharts`) — acceptable now that it's lazy-loaded and isolated from the main chunk, but worth revisiting if more chart-heavy modules are added.
