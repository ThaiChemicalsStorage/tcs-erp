# TODO

> Grouped by priority. Move items to Completed as they land; add newly discovered items as they're found. See [CLAUDE.md](./CLAUDE.md) for the standing update rule.

## High Priority

- [ ] **Decide on Phase 2 backend migration** (Next.js + Prisma + PostgreSQL + Auth.js + RBAC) — architecture proposed, needs a go-ahead and a Neon Postgres connection string before any code can be written. See [ARCHITECTURE.md](./ARCHITECTURE.md). Now higher-leverage than before: the client-side `User`/`Role`/`Permission`/`Notification`/`AuditLog` model built 2026-07-08 maps closely onto the proposed Phase 2 schema (see [DATABASE.md](./DATABASE.md) Migration Notes) — this decision unlocks turning the existing simulation into real, server-enforced security rather than designing RBAC from scratch.
- [ ] **Lead & Customer Management module** — original Phase-1 scope from the initial ERP spec, not yet built. Needs its own data model (separate from the free-text client name currently on `Quote`) and a decision on whether it's built client-side first (like Product) or waits for the real backend. Quotation's "customer selection" (pick an existing customer instead of typing a free-text name) is blocked on this.
- [ ] Wire `Company.vatRate` (Settings → Company Info) into `computeTotals()` in `lib/quotes.tsx` — currently stored/editable but the actual 7% VAT calculation still uses the hardcoded `VAT_RATE` constant.
- [ ] Add button-level (create/edit/delete) permission gating to Product Library — currently only the sidebar entry respects `products:view`; the create/edit/delete buttons inside `ProductsPage`/`ProductList` aren't gated by `products:create`/`products:edit`/`products:delete`.
- [ ] Lift `QuotationPage`'s `view`/`selectedId` state up to `App.tsx` so a notification click can deep-link straight to the specific quote's detail view — currently it only navigates to the quotation list module.

## Medium Priority — PDF / Quotation document polish (2026-07-08 request)

- [x] Company **logo** upload (Settings → Company Info) + render in the quotation PDF header, replacing the text-only "TCS ERP" wordmark when set
- [x] Company **stamp** upload (optional), rendered near the "ผู้อนุมัติ" signature block when set
- [x] **Prepared By**: "พนักงานขาย" is now a real controlled field, bound to `Quote.salesperson`, defaulting to the signed-in user's name on new quotes; the "ผู้เสนอราคา" signature line pre-fills that name in print instead of dots. (Actual signature **image** upload is still pending — see User Profile below; this only covers the name.)
- [x] **Hide empty fields automatically** in the PDF/print view — verified: a fresh quote with no contact/phone/address/tax ID/PO filled in prints none of those rows
- [x] **Do not display placeholder text** in the PDF — `ผู้ติดต่อ`/`เบอร์โทร`/`ที่อยู่`/`เลขประจำตัวผู้เสียภาษี`/`อ้างอิง PO`/`เงื่อนไขการชำระเงิน`/`วันที่ออกเอกสาร`/`วันหมดอายุ` are now real controlled fields on `Quote`, saved per-quote, not hardcoded example values
- [x] Quotation item **tags** — chip input in the line-item expand panel, rendered as pills on screen and in print
- [x] Quotation item **specifications** field (distinct from notes) — added to `QuoteLine`; copied from `Product.specifications` automatically when a line is added via the product picker
- [ ] "Nested" sub-details — **decision made**: keeping the flat reorderable list. Re-open only if a concrete business case for sub-sub-details shows up; not building speculative tree UI for it now.

## Medium Priority — Print/PDF redesign (2026-07-09 request)

- [x] Repeating-header print document matching a real vendor quotation reference (`src/pages/quotation/PrintDocument.tsx`) — company/buyer/meta header + column headers repeat every page via `<thead>`, verified with a forced multi-page export
- [x] Per-unit discount (amount + %) column on printed line items
- [x] Pin-icon sub-detail bullets in print
- [x] Thai-words amount line under the grand total (`bahtText()`)
- [x] Three-column signature table (adds a blank "ผู้ยืนยันการสั่งซื้อ" customer-confirmation column)
- [x] Buyer contact email, delivery method, delivery address, project fields
- [x] Fixed: remarks/terms textarea was uncontrolled and never persisted — now a real `Quote.remarks` field
- [ ] "Page X/Y" numbering — not implemented; no reliable cross-browser way to read total page count from CSS in a browser print/PDF context
- [ ] Condensed header on continuation pages (page 2+) — not implemented; a browser print `<thead>` can't vary content by page number, only revisit if this becomes a real requirement (would need a JS-driven pagination approach, a bigger change)

## Medium Priority — User Profile (2026-07-08 request)

- [x] Profile picture upload — `ImageUploadField` in Settings → Profile, saved on `User.profilePictureDataUrl`
- [x] Signature **image** upload, auto-used in quotation PDFs — `User.signatureDataUrl`, rendered on the quote's preparer/approver signature block by looking up the creator and the most recent approval-history entry; falls back to a blank line if unset, never an error

## Medium Priority — Company Settings expansion (2026-07-08 request)

- [x] Company logo + stamp management — done (see PDF polish above)
- [x] Bank account info fields — `Company.bankName`/`bankAccountName`/`bankAccountNumber`/`bankBranch`, Super Admin only
- [x] VAT rate as a configurable setting — `Company.vatRate` field exists and is editable, **but not yet read by the actual calculation** (see High Priority above — `computeTotals()` still uses the fixed `VAT_RATE` constant)
- [x] Terms & Conditions as an editable company-level default — `Company.termsAndConditions`, used as the default value of the quotation remarks textarea when set

## Medium Priority — RBAC / User Management / Approval Workflow / Notifications (2026-07-08 request)

- [x] Initial Setup Wizard (first-run only, creates the Super Admin, never reappears once any user exists) — `src/pages/SetupWizardPage.tsx`
- [x] Multi-user accounts with hashed passwords, Employee ID/Department/Position/Role, active/inactive status — `src/lib/users.ts`; public self-signup removed
- [x] RBAC: 6 default roles, 17-permission model, fully-hidden (not disabled) permission-gated sidebar — `src/lib/{roles,permissions}.ts`
- [x] User Management page (create/edit/reset password/activate/deactivate/assign role-department-position) — `src/pages/admin/UserManagementPage.tsx`
- [x] Role Management page (Super-Admin-only hardcoded, create/delete custom roles, permission matrix editor, system roles read-only) — `src/pages/admin/RoleManagementPage.tsx`
- [x] Quotation approval workflow (Draft → Pending Approval → Approved → Sent to Customer → Customer Accepted/Rejected → Won/Lost, + Cancelled), append-only approval history — `src/lib/quotes.tsx`, `src/pages/quotation/QuoteDocument.tsx`
- [x] Notification bell (correct 0/badge/99+ behavior) + panel + role-based delivery for quotation events — `src/components/NotificationBell.tsx`, `src/lib/notifications.ts`
- [x] Append-only, read-only audit log — `src/lib/auditLog.ts`, `src/pages/admin/AuditLogPage.tsx`
- [ ] Sequential two-level approval (Approver Level 1 must approve before Level 2 can) — **not implemented**, both approver roles currently have independent approve/reject rights from "Pending Approval". Only revisit if a concrete business need surfaces.

## Medium Priority — Other

- [x] Persist the secondary quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms) — done as part of the PDF polish work above, now real fields on `Quote`
- [ ] **Dashboard KPI rework** (2026-07-08 request): replace current KPIs (revenue, active orders, inventory value, headcount) with Total Customers / Active Leads / Quotations / Won-Lost Deals / Revenue / Recent Activities / Follow-ups / Pipeline — **blocked on Lead & Customer module existing first**, since most of these KPIs have no underlying data yet
- [ ] **Dashboard date-range filter** (Today/Last 3/7/14/30 days/This Month/This Year/Custom Range) driving all KPIs/charts — not built at all currently, every metric is hardcoded to "ธ.ค. 2567"
- [ ] **Sidebar "Coming Soon" entries** for the remaining not-yet-built modules (Leads, Customers) so the roadmap is visible instead of those modules simply not appearing — needs a design decision on whether a "Coming Soon" nav item just shows a placeholder page or is hidden until closer to ready. (User Management, Role Management, Notifications, and Audit Logs are no longer in this bucket — all four shipped 2026-07-08 as real, permission-gated modules.)
- [x] Notifications module — real feed behind the header bell (`src/components/NotificationBell.tsx`), correct unread-count badge, role-based delivery for quotation events
- [x] Audit Logs module — now meaningful since real multi-user accounts exist; append-only, read-only
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
- [x] RBAC / User Management / Approval Workflow / Notifications / Audit Log (client-side simulation, 2026-07-08): Setup Wizard, multi-user accounts, 6 roles / 17 permissions, permission-gated sidebar, User Management + Role Management admin pages, 9-status quotation approval workflow with history, signature-image integration, notification bell + role-based delivery, append-only audit log, quotes now persist to `localStorage`, Company gained bank/VAT/T&C fields (Super Admin only)
