# TODO

> Grouped by priority. Move items to Completed as they land; add newly discovered items as they're found. See [CLAUDE.md](./CLAUDE.md) for the standing update rule.

## High Priority

- [ ] **Decide on Phase 2 backend migration** (Next.js + Prisma + PostgreSQL + Auth.js + RBAC) — architecture proposed, needs a go-ahead and a Neon Postgres connection string before any code can be written. See [ARCHITECTURE.md](./ARCHITECTURE.md).
- [ ] **Persist `Quote[]` state** — currently in-memory only, resets on reload. At minimum mirror the existing `localStorage` pattern used by Product/Category/Company/User until a real DB exists.
- [ ] **Lead & Customer Management module** — original Phase-1 scope from the initial ERP spec, not yet built. Needs its own data model (separate from the free-text client name currently on `Quote`) and a decision on whether it's built client-side first (like Product) or waits for the real backend. Quotation's "customer selection" (pick an existing customer instead of typing a free-text name) is blocked on this.
- [ ] **User Management / RBAC module** — see [RBAC.md](./RBAC.md), fully designed, not started, blocked on the Phase 2 backend decision above (real RBAC needs server-side enforcement, which needs a backend).

## Medium Priority — PDF / Quotation document polish (2026-07-08 request)

- [ ] Company **logo** upload (Settings → Company Info) + render in the quotation PDF header, replacing the current text-only "TCS ERP" wordmark
- [ ] Company **stamp** upload (optional), rendered near the signature block
- [ ] **Prepared By**: tie the "ผู้เสนอราคา" signature line to the actual signed-in user (name + their uploaded signature, see User Profile below) instead of a static blank line
- [ ] **Hide empty fields automatically** in the PDF/print view (e.g. don't print "อ้างอิง PO" row at all if empty) — currently every field prints even if blank
- [ ] **Do not display placeholder text** in the PDF — currently several document fields (ผู้ติดต่อ, เบอร์โทร, ที่อยู่, เลขประจำตัวผู้เสียภาษี on `QuoteDocument.tsx`) show hardcoded example values ("คุณสมชาย วงศ์ดี", "081-234-5678", ...) regardless of the actual quote — these need to become real per-quote fields (ties into the "secondary quotation fields" item below) rather than looking like real data when they're just static placeholders
- [ ] Quotation item **tags** (not currently modeled — separate from notes/sub-details)
- [ ] Quotation item **specifications** field (distinct from notes) — Product already has a `specifications` field; decide whether a quote line inherits/overrides it or needs its own
- [ ] "Nested" sub-details — current sub-details are a flat reorderable list (see [Quotation.md](./MODULES/Quotation.md)); re-confirm whether true nesting (sub-details of sub-details) is actually needed or the flat list satisfies the real business case before building tree UI

## Medium Priority — User Profile (2026-07-08 request)

- [ ] Profile picture upload
- [ ] Signature upload, auto-used in quotation PDFs (empty signature line if none set) — depends on file storage, which doesn't exist yet (no backend/object storage — client-only `localStorage` can't hold images at scale, needs the Phase 2 backend or a client-side size-limited data-URL approach as an interim)

## Medium Priority — Company Settings expansion (2026-07-08 request)

- [ ] Company logo + stamp management (ties into PDF items above)
- [ ] Bank account info field(s)
- [ ] VAT rate as a configurable setting — currently hardcoded `VAT_RATE = 7` in `src/lib/quotes.tsx`
- [ ] Terms & Conditions as an editable company-level default (currently hardcoded static text in `QuoteDocument.tsx`'s remarks textarea)

## Medium Priority — Other

- [ ] Persist the secondary quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms) — currently cosmetic/uncontrolled inputs, see PDF polish items above for why this now also matters for correct PDF output
- [ ] **Dashboard KPI rework** (2026-07-08 request): replace current KPIs (revenue, active orders, inventory value, headcount) with Total Customers / Active Leads / Quotations / Won-Lost Deals / Revenue / Recent Activities / Follow-ups / Pipeline — **blocked on Lead & Customer module existing first**, since most of these KPIs have no underlying data yet
- [ ] **Dashboard date-range filter** (Today/Last 3/7/14/30 days/This Month/This Year/Custom Range) driving all KPIs/charts — not built at all currently, every metric is hardcoded to "ธ.ค. 2567"
- [ ] **Sidebar "Coming Soon" entries** for not-yet-built modules (Leads, Customers, User Management, Notifications, Audit Logs) so the roadmap is visible instead of those modules simply not appearing — needs a design decision on whether a "Coming Soon" nav item just shows a placeholder page or is hidden until closer to ready
- [ ] Notifications module (real feed behind the header bell, currently a static badge)
- [ ] Audit Logs module — meaningful once RBAC/multi-user exists (an audit log with one client-only fake user has limited value)
- [ ] Decide the real behavior for Dashboard's "ส่งออกรายงาน" (export report) and "+ สร้างคำสั่งซื้อ" (create order) buttons — currently inert since there's no Reports/Orders module
- [ ] Wire the global header search (currently decorative on every page)
- [ ] Add automated tests (none exist yet) — at minimum unit tests for `lib/quotes.tsx` totals math and `lib/products.ts` CRUD helpers
- [ ] Add a CI pipeline (lint + typecheck + build on push)

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
