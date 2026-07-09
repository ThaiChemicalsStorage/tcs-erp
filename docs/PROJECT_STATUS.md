# Project Status

> Maintained after every task. See [CLAUDE.md](./CLAUDE.md) for the standing update rule.

## Overall ERP Progress

**~38%** of the full long-term vision (Lead/Quotation/Customer/Product now, then HR/Accounting/Inventory/Warehouse/Purchasing/Project Management later, all on a real multi-user backend with RBAC). The jump from ~34% reflects the 2026-07-09 production-readiness pass: real branding, a fully real (no fake data) Dashboard, and — critically — MongoDB schema/indexes now exist for every collection the long-term vision needs (CRM, org, files, settings), even though most don't have API routes/UI yet. Lead/Customer management moved from "not started" to "schema only," which is real progress but not the same as "built."

Within the currently-scoped modules (Dashboard, Quotation, Product Library, Auth, Settings, User Management, Role Management, Notifications, Audit Log), functional completeness is **~93%**, unchanged by the backend migration — the migration changed *where* logic runs (server vs. browser), not what any module does or looks like.

## Current Phase

**Real full-stack app, deployed and live.** Vite + React frontend, Vercel Serverless Functions (Node.js) backend, MongoDB Atlas database. Live at https://tcs-erp-nine.vercel.app. See [ARCHITECTURE.md](./ARCHITECTURE.md).

## Completed Features

- ✅ **[2026-07-09] Production-readiness pass**: branding, real Dashboard, MongoDB schema prep, dead-code removal, Thai/English i18n infrastructure:
  - Official logo (`public/logo.png`) + one shared `components/BrandMark.tsx` replacing 6 copy-pasted inline "ท" placeholder blocks — sidebar (incl. fixed collapsed-state centering), login page (desktop + mobile), browser favicon, quote/print document fallback headers, and 3 previously-blank loading screens
  - Dashboard rebuilt from 100% static sample data to 100% real MongoDB-backed data — see the Dashboard entry below and [MODULES/Dashboard.md](./MODULES/Dashboard.md)
  - New `GET /api/dashboard` endpoint (real KPI counts + aggregations), new `api/_lib/systemSeed.ts` (idempotent system/config seeding — permissions, departments, positions, notification types, system settings; explicitly **no** business data)
  - MongoDB schema prep: 15 new collections with real indexes (`permissions`, `sessions`, `departments`, `positions`, `customers`, `customer_contacts`, `leads`, `lead_activities`, `product_templates`, `quotation_comments`, `quotation_tags`, `notification_types`, `system_settings`, `uploads`, `attachments`) — see [DATABASE.md](./DATABASE.md); most have no API routes/UI yet, this is schema-ahead-of-feature prep, not new functionality
  - Real indexes added retroactively to the 8 already-live collections too (`products`, `categories`, `quotes`, `notifications`, `audit_log` — previously had none beyond default `_id`)
  - `createdAt`/`updatedAt`/`createdBy`/`updatedBy` audit fields added to `ProductCategory`, and `createdBy`/`updatedBy` added to `Product`/`Company`/`Quote` (as `updatedBy`) where missing — see [DATABASE.md](./DATABASE.md)
  - Deleted 25 confirmed-dead duplicate API files (`api/{auth,users,roles,products,categories,notifications,quotes}/*` — shadowed by `vercel.json` rewrites, `api/handlers/*.ts` was already the real live routing) and the fake `src/lib/salesTeam.ts` sample-data module (its one real dependent, `QuoteList.tsx`'s salesperson avatar, now uses a deterministic `avatarFor()` helper that works for any real name, not just 5 hardcoded fake ones)
  - New `src/lib/i18n.tsx` (Thai/English translation context, `localStorage`-persisted, toggle in Settings → Profile) — initially covered only Dashboard + empty states, **extended the same day to cover essentially the entire app's UI chrome** (sidebar, login/setup, Settings, Products, Quotations screen UI, User/Role Management, Audit Log — ~450 keys) after a user-reported follow-up; see the CHANGELOG entry "Translate the rest of the app's Thai UI". Persisted data/seed content and the printed/PDF quotation document (`PrintDocument.tsx`) remain Thai-only by design, not gaps.
  - Professional empty states (Thai/English) added to Dashboard, Products, Quotations, Notifications, Audit Log — distinguishing "truly empty collection" from "no results for current filter" where both existed
- ✅ **[2026-07-09] Real backend migration** (Vercel Serverless Functions + MongoDB Atlas), deployed live at https://tcs-erp-nine.vercel.app:
  - Real auth: bcrypt password hashing (cost 10), JWT sessions in an httpOnly/secure/`sameSite=lax` cookie, every request re-fetches the user fresh from MongoDB so deactivation takes effect immediately
  - Real, server-enforced RBAC: every mutating API route checks permissions server-side via `roleHasPermission`/`requirePermission`, reusing the exact same pure functions from `src/lib/roles.ts` — genuinely unbypassable via devtools now, not a client-side simulation
  - MongoDB collections: `users`, `roles`, `company`, `products`, `categories`, `notifications`, `audit_log`, `quotes` — see [DATABASE.md](./DATABASE.md)
  - 9 consolidated serverless function files (Vercel Hobby's 12-function cap) using two dispatch patterns, routed via an explicit `vercel.json` rewrite table after several routing-mechanism false starts — see [ARCHITECTURE.md](./ARCHITECTURE.md)
  - Full frontend rewrite of every domain lib (`users.ts`, `roles.ts`, `session.ts`, `storage.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.tsx`) from `localStorage` load/save to a real REST API via a new `src/lib/apiClient.ts`; `App.tsx` now boots asynchronously against `GET /api/auth/session`
  - Audit log integrity + notification privacy improvements: actor identity is always server-derived (never client-claimed), and `GET /api/notifications` is genuinely filtered server-side to the caller's own notifications
  - Old "Phase 2" proposal (Next.js + Prisma + PostgreSQL + Auth.js) formally superseded — never built, replaced by this simpler, faster-to-ship stack; kept in docs only as a historical record
  - Deployed via Vercel CLI (`vercel link`, `vercel env add`, `vercel deploy --prod`); GitHub repo already connected to the Vercel project for auto-deploy on push to `master`, though this has not yet been explicitly re-verified after a push (see [TODO.md](./TODO.md))
- ✅ Dashboard: 7 real KPI cards, real monthly revenue chart, real products-by-category donut, live quotation-interest summary — see the production-readiness entry above and [MODULES/Dashboard.md](./MODULES/Dashboard.md)
- ✅ Quotation list: search/filter by status, summary cards
- ✅ Quotation document: create/edit/duplicate, line items with qty/price/discount, quote-level discount + VAT (7%) calculation, remarks, signature blocks
- ✅ Quotation item notes (multi-line, bullet/numbered toolbar), unlimited sub-details (add/edit/delete/drag-to-reorder), **tags**, and a **specifications** field — all snapshot per line item, independent of the Product Library
- ✅ Print/PDF export via browser print, with a dedicated print-only rendering of notes/sub-details/tags/specifications (indented, formatted), **company logo in the header and stamp near the signature block, and empty document fields automatically hidden**
- ✅ **[2026-07-09] Print/PDF redesign**: the printed quotation is now a single repeating-header document (`PrintDocument.tsx`) modeled on a real vendor quotation the user provided — company/buyer/meta header and column headers repeat on every printed page, per-unit discount (amount + %) column, pin-icon sub-detail bullets, a Thai-words amount line under the grand total, and a three-column signature table (adds a blank customer-PO-confirmation column). Added buyer contact email, delivery method/address, and project as real per-quote fields. Fixed a latent bug where the remarks/terms textarea was uncontrolled and never actually saved.
- ✅ Quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms, salesperson) are real per-quote data now, not hardcoded placeholder text — salesperson defaults to the signed-in user's name on new quotes
- ✅ Product Library: CRUD, categories (create/rename/archive), archive vs. permanent delete (with confirmation), duplicate, search/filter/sort/pagination
- ✅ Quotation ↔ Product Library integration: pick-from-library modal that snapshots product data (including specifications) into a line item (never a live reference)
- ✅ Sign in, Settings (profile, company info incl. logo/stamp upload, real security/password change, notification toggles) — auth is real as of the 2026-07-09 backend migration, see the entry above
- ✅ Company info (including logo/stamp) entered in Settings flows through live to the quotation document header/signature block
- ✅ **[2026-07-08] RBAC / User Management / Approval Workflow / Notifications / Audit Log** (originally a client-side simulation; migrated 2026-07-09 to real server-side enforcement — see [RBAC.md](./RBAC.md) and the entry above; the UI/UX and permission model described below are unchanged by that migration):
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

- Lead Management module — **schema only** as of 2026-07-09 (`leads`/`lead_activities` collections + indexes exist, no API routes/UI) — see [MODULES/Lead.md](./MODULES/Lead.md)
- Customer Management module — **schema only** as of 2026-07-09 (`customers`/`customer_contacts` collections + indexes exist, no API routes/UI; quotations still carry only a free-text client name, no customer entity) — see [MODULES/Customer.md](./MODULES/Customer.md)
- ~~Full app-wide Thai/English translation~~ — **done 2026-07-09** (same-day follow-up pass), see CHANGELOG
- `product_templates` collection semantics are a starting interpretation, not confirmed — needs sign-off before UI is built against it
- Departments/positions seed list (ฝ่ายขาย/ฝ่ายจัดซื้อ/etc.) is a generic placeholder, not the real org structure — not yet wired into `User.department`/`User.position` (still free text)
- Company bank account info, VAT rate, and Terms & Conditions are now editable fields on `Company` (Settings → Company Info, Super Admin only), but `Company.vatRate` is **not yet wired into the actual tax calculation** — `lib/quotes.tsx`'s `computeTotals()` still uses a fixed 7% constant. Low-risk, deliberately deferred (see [TODO.md](./TODO.md)).
- Two-level sequential approval (Approver Level 1 must approve before Level 2 can) is **not implemented** — both approver roles can independently approve/reject from "Pending Approval"; they're differentiated by seniority/assignment, not an enforced sequence.
- Notification click only navigates to the quotation **list**, not the specific quote's detail view — `QuotationPage`'s `view`/`selectedId` state isn't lifted to `App.tsx`, so deep-linking to a record isn't wired yet.
- Product Library has module-level (sidebar) permission gating but **not** button-level gating (create/edit/delete buttons inside Products aren't yet hidden per `products:create`/`products:edit`/`products:delete` — only the sidebar entry respects `products:view`).
- Dashboard's "ส่งออกรายงาน" (export report), "+ สร้างคำสั่งซื้อ" (create order), "ดูทั้งหมด" (view all orders) — reference an Orders/Reports module that doesn't exist yet, left inert by design
- Global header search — decorative, not wired to any data
- HR, Accounting, Inventory, Warehouse, Purchasing, Project Management modules — not started

## Upcoming Milestones

1. **Lead & Customer Management module** — the original "Phase 1" scope from the initial ERP spec, still outstanding. Now the single largest untouched bucket, since the backend migration closed the other big one.
2. Close the remaining honest gaps from the backend migration: add login rate limiting, set up CI (typecheck/lint/build on push), verify GitHub auto-deploy is actually wired, add automated tests for the new API layer, rotate the MongoDB Atlas credential that was pasted into an AI chat session — see [TODO.md](./TODO.md) High Priority.
3. Wire `Company.vatRate` into `computeTotals()`, add button-level permission gating to Product Library, and lift `QuotationPage`'s selected-quote state to `App.tsx` so notifications can deep-link to a specific quote.

## Current Sprint

No formal sprint tracked yet — work has proceeded feature-by-feature per direct request. This section will start being populated once work resumes.

## Next Sprint

Not yet planned.

## Known Risks

- **No rate limiting on login** (`POST /api/auth/login`): a scripted brute-force attempt against a known username isn't throttled. Should be closed before this app is exposed beyond a trusted internal network. See [RBAC.md](./RBAC.md) Known Gaps and [TODO.md](./TODO.md).
- **A MongoDB Atlas database-user password was pasted into an AI chat session** during the 2026-07-09 backend migration's development. A credential rotation was recommended to the user as a follow-up; whether it has been done cannot be verified from the codebase — treat as an open, unconfirmed action item until explicitly checked off. See [TODO.md](./TODO.md).
- **No true session revocation**: sessions are JWTs (httpOnly cookie, 7-day expiry), not database-backed — a still-active account's leaked/stolen token remains valid until natural expiry; only a *deactivated* account is locked out immediately (every request re-checks `status` against MongoDB). Low risk in practice (httpOnly, never exposed to XSS-readable JS) but worth knowing precisely. See [RBAC.md](./RBAC.md) "What Was Achieved vs. the Old Proposed Design."
- **No automated tests, no CI pipeline**: nothing in this repo (frontend or the new API layer) is covered by tests, and nothing runs `tsc`/`eslint`/`build` automatically on push. A regression could reach `master` — and, since the GitHub repo is connected to Vercel for auto-deploy, potentially production — unnoticed. See [TODO.md](./TODO.md).
- **RBAC permission model is real but hardcoded**: the 17-key `Permission` union is still a TypeScript union, not admin-creatable rows — adding a genuinely new permission still requires a code change and redeploy, even though roles/permission-assignment are fully admin-editable at runtime. Not a security risk, but a scaling limitation worth knowing. See [RBAC.md](./RBAC.md).
- **Scope ambiguity**: the long-term ERP vision (multi-department, many more modules) is far larger than what exists today. Expectations should be managed against [CLAUDE.md](./CLAUDE.md)'s "Current Development Phase" section.

## Technical Debt

- Print/PDF's repeating header is identical on every page rather than shrinking after page 1 (a browser print `<thead>` can't vary content by page number), and "Page X/Y" numbering isn't implemented (no reliable cross-browser way to read total page count from CSS in browser print/PDF) — both accepted simplifications, see [MODULES/Quotation.md](./MODULES/Quotation.md).
- Company logo/stamp/profile-picture/signature images are stored as base64 data URLs (now inside MongoDB documents rather than `localStorage`), still capped at 1MB each client-side before upload — fine at current scale, but doesn't scale to a real object-storage (e.g. S3/Vercel Blob) approach; revisit if image volume/size grows.
- `Company.vatRate` is stored and editable but not yet read by `computeTotals()` — the 7% VAT calculation is still the `VAT_RATE` constant in `lib/quotes.tsx`.
- `quoteWorkflow.ts` (`api/_lib/`) is a deliberately duplicated copy of the workflow state machine in `src/lib/quotes.tsx` (not imported, since the source file has JSX) — the two must be kept in sync by hand if the workflow ever changes; a genuine, documented maintenance burden. See [ARCHITECTURE.md](./ARCHITECTURE.md).
- ~~No explicit MongoDB indexes beyond the default `_id` index~~ — **fixed 2026-07-09**: real indexes now exist across every collection (`ensureIndexes()`, `api/_lib/collections.ts`). See [DATABASE.md](./DATABASE.md).
- bcrypt cost factor is 10 (bcryptjs's default), not explicitly tuned during migration — worth a conscious revisit against login-latency budget.
- No sequential two-level approval enforcement (Approver Level 1 → Level 2) — both approver roles can approve independently from "Pending Approval".
- Notification clicks navigate to the quotation list, not the specific quote — deep-linking needs `QuotationPage`'s view state lifted to `App.tsx`.
- Product Library lacks button-level (create/edit/delete) permission gating — only its sidebar entry (`products:view`) is gated.
- ~~`salesTeam` (sales leaderboard data) is shared, static sample data~~ — **removed 2026-07-09** along with the fake Dashboard sales leaderboard that used it; `QuoteList.tsx`'s salesperson avatar now uses a deterministic hash-based color, no fake roster.
- No automated tests exist anywhere in the project.
- No CI pipeline configured.
- Bundle: `DashboardPage` chunk is ~430KB (mostly `recharts`, largely unchanged by the 2026-07-09 rewrite since the fake data itself was tiny) — acceptable now that it's lazy-loaded and isolated from the main chunk, but worth revisiting if more chart-heavy modules are added.
- Base64-in-document uploads (logo/stamp/profile picture/signature) have a practical 16MB MongoDB document ceiling — the new `uploads`/`attachments` collections (schema-only, 2026-07-09) are forward-looking scaffolding for a real blob-storage migration, not yet wired to anything.
- ~~`i18n.tsx` only covers strings the 2026-07-09 pass touched~~ — **resolved same day**: essentially all UI chrome now translated. Persisted data/seed content and the printed quotation document remain Thai-only, deliberately.
