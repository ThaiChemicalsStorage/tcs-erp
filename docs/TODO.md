# TODO

> Grouped by priority. Move items to Completed as they land; add newly discovered items as they're found. See [CLAUDE.md](./CLAUDE.md) for the standing update rule.

## High Priority

- [ ] **Decide on Phase 2 backend migration** (Next.js + Prisma + PostgreSQL + Auth.js + RBAC) — architecture proposed, needs a go-ahead and a Neon Postgres connection string before any code can be written. See [ARCHITECTURE.md](./ARCHITECTURE.md).
- [ ] **Persist `Quote[]` state** — currently in-memory only, resets on reload. At minimum mirror the existing `localStorage` pattern used by Product/Category/Company/User until a real DB exists.
- [ ] **Lead & Customer Management module** — original Phase-1 scope from the initial ERP spec, not yet built. Needs its own data model (separate from the free-text client name currently on `Quote`) and a decision on whether it's built client-side first (like Product) or waits for the real backend. Quotation's "customer selection" (pick an existing customer instead of typing a free-text name) is blocked on this.
- [ ] **User Management / RBAC module** — see [RBAC.md](./RBAC.md), fully designed, not started, blocked on the Phase 2 backend decision above (real RBAC needs server-side enforcement, which needs a backend).

## Medium Priority — PDF / Quotation document polish (2026-07-08 request)

- [x] Company **logo** upload (Settings → Company Info) + render in the quotation PDF header, replacing the text-only "TCS ERP" wordmark when set
- [x] Company **stamp** upload (optional), rendered near the "ผู้อนุมัติ" signature block when set
- [x] **Prepared By**: "พนักงานขาย" is now a real controlled field, bound to `Quote.salesperson`, defaulting to the signed-in user's name on new quotes; the "ผู้เสนอราคา" signature line pre-fills that name in print instead of dots. (Actual signature **image** upload is still pending — see User Profile below; this only covers the name.)
- [x] **Hide empty fields automatically** in the PDF/print view — verified: a fresh quote with no contact/phone/address/tax ID/PO filled in prints none of those rows
- [x] **Do not display placeholder text** in the PDF — `ผู้ติดต่อ`/`เบอร์โทร`/`ที่อยู่`/`เลขประจำตัวผู้เสียภาษี`/`อ้างอิง PO`/`เงื่อนไขการชำระเงิน`/`วันที่ออกเอกสาร`/`วันหมดอายุ` are now real controlled fields on `Quote`, saved per-quote, not hardcoded example values
- [x] Quotation item **tags** — chip input in the line-item expand panel, rendered as pills on screen and in print
- [x] Quotation item **specifications** field (distinct from notes) — added to `QuoteLine`; copied from `Product.specifications` automatically when a line is added via the product picker
- [ ] "Nested" sub-details — **decision made**: keeping the flat reorderable list. Re-open only if a concrete business case for sub-sub-details shows up; not building speculative tree UI for it now.

## Medium Priority — User Profile (2026-07-08 request)

- [ ] Profile picture upload
- [ ] Signature **image** upload, auto-used in quotation PDFs — the *name* is now wired (see PDF polish above); the image itself still depends on file storage, which doesn't exist yet (no backend/object storage — client-only `localStorage` can't hold images at scale, needs the Phase 2 backend or a client-side size-limited data-URL approach as an interim, same pattern now proven out for company logo/stamp in `SettingsPage.tsx`'s `ImageUploadField`)

## Medium Priority — Company Settings expansion (2026-07-08 request)

- [x] Company logo + stamp management — done (see PDF polish above)
- [ ] Bank account info field(s)
- [ ] VAT rate as a configurable setting — currently hardcoded `VAT_RATE = 7` in `src/lib/quotes.tsx`
- [ ] Terms & Conditions as an editable company-level default (currently hardcoded static text in `QuoteDocument.tsx`'s remarks textarea)

## Medium Priority — Other

- [x] Persist the secondary quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms) — done as part of the PDF polish work above, now real fields on `Quote`
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
- [x] Quotation PDF polish: company logo/stamp upload, real per-quote contact/document fields (no more hardcoded placeholder text), auto-hide-empty-fields in print, salesperson bound to the signed-in user, item tags, item specifications field
