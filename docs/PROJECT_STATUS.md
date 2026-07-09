# Project Status

> Maintained after every task. See [CLAUDE.md](./CLAUDE.md) for the standing update rule.

## Overall ERP Progress

**~26%** of the full long-term vision (Lead/Quotation/Customer/Product now, then HR/Accounting/Inventory/Warehouse/Purchasing/Project Management later, all on a real multi-user backend with RBAC). The jump from ~18% reflects the 2026-07-08 RBAC/user-management/approval-workflow/notifications/audit-log build — a large, previously "not started" bucket that is now functionally complete client-side.

Within **Phase 1 (frontend demo)** specifically, the scoped modules (Dashboard, Quotation, Product Library, Auth, Settings, User Management, Role Management, Notifications, Audit Log) are functionally complete for a client-only app: **~93%**.

## Current Phase

**Phase 1 — Frontend demo (client-only, no backend).**

## Completed Features

- ✅ Dashboard: KPI cards, revenue/expense area chart, category donut, sales leaderboard, orders table, activity feed (static sample data)
- ✅ Quotation list: search/filter by status, summary cards
- ✅ Quotation document: create/edit/duplicate, line items with qty/price/discount, quote-level discount + VAT (7%) calculation, remarks, signature blocks
- ✅ Quotation item notes (multi-line, bullet/numbered toolbar), unlimited sub-details (add/edit/delete/drag-to-reorder), **tags**, and a **specifications** field — all snapshot per line item, independent of the Product Library
- ✅ Print/PDF export via browser print, with a dedicated print-only rendering of notes/sub-details/tags/specifications (indented, formatted), **company logo in the header and stamp near the signature block, and empty document fields automatically hidden**
- ✅ **[2026-07-09] Print/PDF redesign**: the printed quotation is now a single repeating-header document (`PrintDocument.tsx`) modeled on a real vendor quotation the user provided — company/buyer/meta header and column headers repeat on every printed page, per-unit discount (amount + %) column, pin-icon sub-detail bullets, a Thai-words amount line under the grand total, and a three-column signature table (adds a blank customer-PO-confirmation column). Added buyer contact email, delivery method/address, and project as real per-quote fields. Fixed a latent bug where the remarks/terms textarea was uncontrolled and never actually saved.
- ✅ Quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms, salesperson) are real per-quote data now, not hardcoded placeholder text — salesperson defaults to the signed-in user's name on new quotes
- ✅ Product Library: CRUD, categories (create/rename/archive), archive vs. permanent delete (with confirmation), duplicate, search/filter/sort/pagination
- ✅ Quotation ↔ Product Library integration: pick-from-library modal that snapshots product data (including specifications) into a line item (never a live reference)
- ✅ Sign in / Sign up (client-only fake auth), Settings (profile, company info incl. logo/stamp upload, security mock, notification toggles)
- ✅ Company info (including logo/stamp) entered in Settings flows through live to the quotation document header/signature block
- ✅ **[2026-07-08] RBAC / User Management / Approval Workflow / Notifications / Audit Log** (client-side simulation, see [RBAC.md](./RBAC.md) for the "not real security" caveat):
  - First-run Initial Setup Wizard creates the one Super Admin account; every subsequent user is admin-created (public self-signup removed)
  - Multi-user accounts (`src/lib/users.ts`): employee ID, full name, username, email, hashed password, phone, department, position, role, active/inactive status, profile picture, signature image
  - 6 default roles (Super Admin, Administrator, Sales User, Approver Level 1, Approver Level 2, Viewer) with a 17-permission model (`src/lib/permissions.ts`); Role Management page (Super-Admin-only, hardcoded) for custom roles + a permission matrix editor; `roles:manage`/`company:manage` are structurally locked to the Super Admin role only
  - Sidebar menus are fully hidden (not just disabled) per permission; Settings' Company tab only renders for `company:manage`
  - User Management page: create/edit users, reset password, activate/deactivate, assign role/department/position; users can't edit their own role; hard-delete blocked for your own account and for the last remaining Super Admin
  - Quotation approval workflow: `Draft → Pending Approval → Approved → Sent to Customer → Customer Accepted/Rejected → Won/Lost` (+ `Cancelled`), permission- and ownership-gated action buttons, required-comment modal for rejections/cancellation, append-only approval history (user/role/action/comment/timestamp) rendered on the document
  - Signature integration: preparer/approver signature images (uploaded in Settings → Profile) render automatically on the quotation signature block, looked up by the quote's creator and the most recent "approved" history entry; falls back to a blank line, never an error, if no signature is set
  - Notification bell: no badge when unread = 0, red badge with count (99+ cap) otherwise; dropdown panel with mark-read/mark-all-read/delete/click-to-navigate; role-based delivery (submitter → all users with `quotations:approve`, high-value quotes ≥ ฿500,000 also notify Approver Level 2, approve/reject/customer-accept/customer-reject notify the quote's creator)
  - Append-only audit log (Login/Logout/User Created/Updated/Deactivated/Deleted/Password Reset/Profile Updated/Role changes/Quotation Created/Submitted/Approved/Rejected/Status Changed/Company Settings Updated), read-only UI, no delete/edit action exists for it
  - Verified end-to-end with a scripted Playwright pass covering the full lifecycle across 3 accounts (Super Admin → creates Sales User + Approver Level 1 → Sales User submits a quote → Approver approves it → signature appears → audit log shows every step); one real bug found and fixed during that pass (see Known Issues below)
- ✅ ESLint + strict TypeScript (`noUnusedLocals`/`noUnusedParameters`) wired in; `tsc`/`eslint`/`build` all pass clean
- ✅ Code-split by page via `React.lazy` (Dashboard's `recharts` dependency no longer bloats the main bundle)
- ✅ Git repo initialized, pushed to GitHub (`Wisarutbuasumlee/tcs-erp`, private)
- ✅ This documentation system

## In Progress

- Nothing actively in progress as of this writing — see Next Sprint below for what's queued.

## Pending Features

- Real, server-enforced backend (Next.js + Prisma + PostgreSQL + Auth.js) — architecture designed, **not started**, blocked on a user decision + Neon Postgres connection string. The client-side RBAC/approval/notification/audit-log system built 2026-07-08 is a UI/UX simulation of this, not a replacement for it — see [RBAC.md](./RBAC.md).
- Lead Management module — **not started**
- Customer Management module — **not started** (quotations currently carry only a free-text client name, no customer entity)
- Company bank account info, VAT rate, and Terms & Conditions are now editable fields on `Company` (Settings → Company Info, Super Admin only), but `Company.vatRate` is **not yet wired into the actual tax calculation** — `lib/quotes.tsx`'s `computeTotals()` still uses a fixed 7% constant. Low-risk, deliberately deferred (see [TODO.md](./TODO.md)).
- Two-level sequential approval (Approver Level 1 must approve before Level 2 can) is **not implemented** — both approver roles can independently approve/reject from "Pending Approval"; they're differentiated by seniority/assignment, not an enforced sequence.
- Notification click only navigates to the quotation **list**, not the specific quote's detail view — `QuotationPage`'s `view`/`selectedId` state isn't lifted to `App.tsx`, so deep-linking to a record isn't wired yet.
- Product Library has module-level (sidebar) permission gating but **not** button-level gating (create/edit/delete buttons inside Products aren't yet hidden per `products:create`/`products:edit`/`products:delete` — only the sidebar entry respects `products:view`).
- Dashboard's "ส่งออกรายงาน" (export report), "+ สร้างคำสั่งซื้อ" (create order), "ดูทั้งหมด" (view all orders) — reference an Orders/Reports module that doesn't exist yet, left inert by design
- Global header search — decorative, not wired to any data
- HR, Accounting, Inventory, Warehouse, Purchasing, Project Management modules — not started

## Upcoming Milestones

1. **Decide + start Phase 2 backend migration** (Next.js/Prisma/Postgres/Auth.js/RBAC) — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the proposed plan. This is now higher-leverage than before: the client-side RBAC/user model built 2026-07-08 maps closely onto the proposed Phase 2 schema (see [DATABASE.md](./DATABASE.md) Migration Notes), so the migration is mostly "move this logic server-side," not "design it from scratch."
2. **Lead & Customer Management module** — the original "Phase 1" scope from the initial ERP spec, still outstanding.
3. Wire `Company.vatRate` into `computeTotals()`, add button-level permission gating to Product Library, and lift `QuotationPage`'s selected-quote state to `App.tsx` so notifications can deep-link to a specific quote.

## Current Sprint

No formal sprint tracked yet — work has proceeded feature-by-feature per direct request. This section will start being populated once work resumes.

## Next Sprint

Not yet planned — depends on the Phase 2 backend decision (see [TODO.md](./TODO.md) High Priority).

## Known Risks

- **RBAC is not real security**: every permission check, the approval workflow, and the audit log are enforced entirely in the browser and stored in `localStorage`. Anyone with devtools can edit their own role, approve their own quotation, or rewrite the audit log. This is fine for an internal demo/prototype but **must not be treated as access control** if this app is ever exposed beyond a trusted local/demo context. See [RBAC.md](./RBAC.md).
- **Passwords are not securely hashed**: `hashPassword()` in `src/lib/users.ts` is a simple non-cryptographic checksum, explicitly documented as not real security — it only avoids storing raw plaintext strings, nothing more.
- **Single-browser multi-user simulation**: all "users" and their data live in one browser's `localStorage`. There's no real multi-device/multi-session support — testing "as two different users" means logging out and back in within the same browser, not two people using the app simultaneously.
- **Scope ambiguity**: the long-term ERP vision (server-enforced RBAC, multi-department, many modules) is far larger than what exists today. Expectations should be managed against [CLAUDE.md](./CLAUDE.md)'s "Current Development Phase" section.

## Technical Debt

- Print/PDF's repeating header is identical on every page rather than shrinking after page 1 (a browser print `<thead>` can't vary content by page number), and "Page X/Y" numbering isn't implemented (no reliable cross-browser way to read total page count from CSS in browser print/PDF) — both accepted simplifications, see [MODULES/Quotation.md](./MODULES/Quotation.md).
- Company logo/stamp/profile-picture/signature images are stored as base64 data URLs inside `localStorage`, capped at 1MB each client-side — fine for a demo, but `localStorage` has a ~5-10MB total quota per origin depending on browser, so this doesn't scale to real object storage; revisit when the Phase 2 backend exists.
- `Company.vatRate` is stored and editable but not yet read by `computeTotals()` — the 7% VAT calculation is still the `VAT_RATE` constant in `lib/quotes.tsx`.
- No sequential two-level approval enforcement (Approver Level 1 → Level 2) — both approver roles can approve independently from "Pending Approval".
- Notification clicks navigate to the quotation list, not the specific quote — deep-linking needs `QuotationPage`'s view state lifted to `App.tsx`.
- Product Library lacks button-level (create/edit/delete) permission gating — only its sidebar entry (`products:view`) is gated.
- `salesTeam` (sales leaderboard data) is shared, static sample data with no CRUD — will need to become real data once an HR/Sales-team entity exists.
- No automated tests exist anywhere in the project.
- No CI pipeline configured.
- Bundle: `DashboardPage` chunk is ~445KB (mostly `recharts`) — acceptable now that it's lazy-loaded and isolated from the main chunk, but worth revisiting if more chart-heavy modules are added.
