# TODO

> Grouped by priority. Move items to Completed as they land; add newly discovered items as they're found. See [CLAUDE.md](./CLAUDE.md) for the standing update rule.

## High Priority

- [ ] **Decide on Phase 2 backend migration** (Next.js + Prisma + PostgreSQL + Auth.js + RBAC) — architecture proposed, needs a go-ahead and a Neon Postgres connection string before any code can be written. See [ARCHITECTURE.md](./ARCHITECTURE.md).
- [ ] **Persist `Quote[]` state** — currently in-memory only, resets on reload. At minimum mirror the existing `localStorage` pattern used by Product/Category/Company/User until a real DB exists.
- [ ] **Lead & Customer Management module** — original Phase-1 scope from the initial ERP spec, not yet built. Needs its own data model (separate from the free-text client name currently on `Quote`) and a decision on whether it's built client-side first (like Product) or waits for the real backend.

## Medium Priority

- [ ] Persist the secondary quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms) — currently cosmetic/uncontrolled inputs.
- [ ] Decide the real behavior for Dashboard's "ส่งออกรายงาน" (export report) and "+ สร้างคำสั่งซื้อ" (create order) buttons — currently inert since there's no Reports/Orders module.
- [ ] Wire the global header search (currently decorative on every page).
- [ ] Build a real notification feed behind the header bell (currently a static badge).
- [ ] Add automated tests (none exist yet) — at minimum unit tests for `lib/quotes.tsx` totals math and `lib/products.ts` CRUD helpers.
- [ ] Add a CI pipeline (lint + typecheck + build on push).

## Low Priority

- [ ] Dark mode — `theme.css` only defines the light palette currently; Tailwind's `dark:` variant isn't wired up.
- [ ] Revisit `DashboardPage` bundle size (~445KB gzipped ~119KB, mostly `recharts`) if more chart-heavy modules get added.
- [ ] `salesTeam` sample data has no CRUD — fine for now, will need a real entity once HR/Sales-team management exists.

## Completed

- [x] Initial Vite + React + TS + Tailwind v4 scaffold, rebranded from Figma Make source to TCS ERP
- [x] Dashboard module (KPIs, charts, leaderboard, orders, activity feed)
- [x] Quotation module: list, create/edit, VAT/discount totals, print
- [x] Sign in / Sign up / Settings pages, wired into a real (client-only) auth gate
- [x] Product Library module: CRUD, categories, archive, duplicate, search/filter/sort/pagination
- [x] Quotation ↔ Product Library picker integration (snapshot semantics)
- [x] Quotation item notes (bullet/numbered toolbar) + unlimited reorderable sub-details
- [x] PDF/print export with proper indentation for notes/sub-details
- [x] Fixed: quotation Save/Duplicate/Send were non-functional (root-cause `Quote.lines` was never wired up)
- [x] ESLint + strict unused-code checks added and all findings fixed
- [x] Code-split by page via `React.lazy`, resolved bundle-size warning
- [x] Git repo initialized and pushed to GitHub (`Wisarutbuasumlee/tcs-erp`, private)
- [x] Full documentation system under `/docs`
