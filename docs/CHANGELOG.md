# Changelog

> Append-only. Never delete or rewrite previous entries — correct forward with a new entry instead.

---

## 2026-07-09 — Quotation print/PDF redesign (repeating-header document)

**Feature**: Replaced the quotation's print/PDF output with a dedicated `PrintDocument.tsx` component modeled on a real customer-facing quotation template the user provided (photos of a printed 3-page quotation from another vendor's system). The new document is a single `<table>` with a repeating `<thead>` — company header (logo/name/address/tax ID), a blue "QUOTATION" ribbon, the full "ผู้ซื้อ" (buyer) block, the "ใบเสนอราคา" meta block, and the item-table column headers all re-render automatically on every printed page via the browser's native thead-repeat behavior. Item rows now show unit price and per-unit discount (amount + %) as separate columns, with sub-details rendered as a pin-icon bullet list. Totals gained a Thai-language amount-in-words line under the grand total. A three-column signature table (ผู้เสนอราคา / ผู้อนุมัติใบเสนอราคา / ผู้ยืนยันการสั่งซื้อ) replaces the old two-column signature block, adding a blank column for the customer's own hand signature (no backing data exists for that step). Added four new per-quote fields the reference document required: buyer contact email, delivery method, delivery address, and project name — all real, controlled, auto-hidden-when-empty like the existing document fields.

**Files Added**: `src/pages/quotation/PrintDocument.tsx`

**Files Modified**: `src/lib/quotes.tsx` (`Quote` gained `contactEmail`/`deliveryMethod`/`deliveryAddress`/`project`/`remarks`; new `bahtText()` Thai-number-to-words helper; seed data updated), `src/pages/quotation/QuoteDocument.tsx` (new form fields for the four additions; entire old print-only rendering — the navy header band's print visibility, the separate "print-only" meta grid, the remarks textarea, approval history, footer disclaimer — replaced with `print:hidden` on every screen-only section plus a single `<PrintDocument />` render at the end), `src/pages/quotation/LineItemsEditor.tsx` (now screen-only, `print:hidden` at its root; removed the old inline `hidden print:table-row` per-line print rendering, now superseded by `PrintDocument`)

**Files Removed**: none

**Reason**: User supplied three photos of an actual printed quotation from another system and asked for the app's print output to look like it — a real design target rather than an abstract request, so most of the work was translating that specific document's structure (repeating per-page header, per-unit discount column, pin-icon sub-detail bullets, Thai-words total, three-signature-column block) into this codebase's existing data model and conventions.

**Notes**:
- **Bug found and fixed as a side effect**: the "หมายเหตุ / เงื่อนไข" (remarks) textarea was `defaultValue`-only — a pure uncontrolled input with no `onChange` and never included in the save payload. Any text a user typed there was silently discarded on save and reset to the company default every time the document was reopened. Since the print redesign needed a real, persistable value to render, this was fixed properly (`Quote.remarks`, controlled, saved) rather than papered over — same pattern as the other document fields fixed in the 2026-07-08 PDF-polish pass.
- Chose the "one `<table>` with a repeating `<thead>`" technique specifically because it's the only reliable, native-browser way to repeat header content across print page breaks without JavaScript pagination hacks — verified by forcing a quote to 17 line items and confirming the header/buyer/meta block and column headers repeated correctly on page 2, with totals and the signature table appearing only once at the true end (not duplicated per page).
- **Known, accepted simplifications** (documented in [MODULES/Quotation.md](./MODULES/Quotation.md) and [UI_GUIDELINES.md](./UI_GUIDELINES.md) rather than silently left as gaps): the repeating header is identical on every page (the reference document shows a fuller header on page 1 and a condensed one on continuation pages — browser print can't vary `<thead>` content by page number); "Page X/Y" numbering was not implemented (no reliable cross-browser way to read total page count from CSS in a browser print/PDF context); the reference's separate "หมายเหตุ"/"Condition"/"Payment" sections were kept as one free-text `remarks` field (already supports multi-line text, avoiding a larger data-model change); the third signature column (ผู้ยืนยันการสั่งซื้อ, customer PO confirmation) always renders blank since no such workflow step/data exists yet — matches the established "blank line, never an error" fallback pattern.
- Verified via a scripted Playwright pass: fresh install → Setup Wizard → open a seeded quote → fill the four new fields → save → confirm they persist and render correctly in a real `page.pdf()` export (read back and visually checked, not just screenshotted) → forced the same quote to 17 lines to confirm multi-page header repetition. Zero console errors throughout. `tsc --noEmit`, `eslint .`, and `npm run build` all clean before and after.

---

## 2026-07-08 — RBAC, User Management, Approval Workflow & Notification System

**Feature**: A full client-side simulation of enterprise RBAC for a single-company (not multi-tenant) internal ERP: a first-run Initial Setup Wizard, multi-user accounts with hashed passwords and Position/Role separation, a 6-role/17-permission RBAC model with a permission-gated (fully-hidden, not just disabled) sidebar, a User Management admin page, a Role Management page (Super-Admin-only, hardcoded), a 9-status quotation approval workflow with append-only approval history and role-based notifications, an enterprise-style notification bell (no badge at 0 unread, red badge with count/99+ cap otherwise, dropdown panel), personal signature-image integration into the quotation PDF, and an append-only audit log. Company settings gained bank account, VAT rate, and Terms & Conditions fields, restricted to Super Admin. Public self-service sign-up was removed (enterprise ERPs don't allow it; accounts are Setup-Wizard- or admin-created only).

**Files Added**: `src/lib/permissions.ts`, `src/lib/roles.ts`, `src/lib/users.ts`, `src/lib/session.ts`, `src/lib/notifications.ts`, `src/lib/auditLog.ts`, `src/components/NotificationBell.tsx`, `src/pages/SetupWizardPage.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`

**Files Modified**: `src/lib/storage.ts` (`Company` gained `vatRate`/`bankName`/`bankAccountName`/`bankAccountNumber`/`bankBranch`/`termsAndConditions`; removed the old singleton `UserProfile` type + `loadUser`/`saveUser`/`initials`, superseded by `users.ts`), `src/lib/quotes.tsx` (`QuoteStatus` expanded from 4 to 9 values; new `ApprovalAction`/`ApprovalHistoryEntry`/`QuotePermissions` types, `workflowTransitions` state machine, `computeQuotePermissions()`, `loadQuotes`/`saveQuotes` — quotes are now persisted, closing a long-standing gap), `src/App.tsx` (rewired around a real session/current-user model, permission-filtered sidebar, bootstrap gate, notification/audit wiring), `src/pages/SignInPage.tsx` (real credential check against the `users` list, replacing the old "any input succeeds" flow), `src/pages/SettingsPage.tsx` (profile tab now self-service with read-only employee fields + picture/signature upload; Company tab hidden entirely unless `company:manage`; real password verification), `src/pages/quotation/{QuotationPage,QuoteDocument,QuoteList}.tsx` (workflow action buttons, approval-history panel, signature rendering, ownership/permission-gated field editing)

**Files Removed**: `src/pages/SignUpPage.tsx` (public self-registration removed by design — see Reason)

**Reason**: Explicit, detailed user request to implement enterprise-grade RBAC, user management, a quotation approval workflow, and a notification system, framed around this being a single-company internal system (not a SaaS product). Scoped to a client-side simulation rather than the real Phase 2 backend migration after confirming with the user — see the AskUserQuestion exchange at the start of this session; the alternative (starting the real Next.js/Prisma backend) was explicitly declined as out of scope for this pass.

**Notes**:
- **This is a Phase 1 simulation, not real security** — see the new "Current State" section at the top of [RBAC.md](./RBAC.md). Every check is client-side and every record lives in `localStorage`; devtools can bypass any of it. Positioned as a UI/UX/workflow-correct scaffold that maps closely onto the still-not-started Phase 2 server-enforced design.
- Permission model is a flat 17-key set (`quotations:view/create/edit/delete/approve/reject/export`, `products:view/create/edit/delete/export`, `dashboard:view`, `users:manage`, `roles:manage`, `company:manage`, `auditLog:view`) rather than fully generic per-module CRUD — chosen to match the spec's literal permission list while still giving real module-level sidebar differentiation.
- `roles:manage`/`company:manage` are additionally hardcoded to the Super Admin role (not just permission-gated) so an admin can never misconfigure a custom role into unlocking them — matches the spec's explicit "Only Super Admin may..." rules.
- Two-level sequential approval (Level 1 must approve before Level 2) was **not** implemented — the provided workflow diagram only has one "Pending Approval" step; both approver roles can independently approve/reject from that state. Documented as a known simplification.
- Product Library CRUD buttons are **not** individually permission-gated in this pass — only its sidebar entry (`products:view`). Documented as a known follow-up in [TODO.md](./TODO.md).
- **Bug found and fixed during verification**: the quotation status badge/toolbar froze at its value from the moment the document view was first opened, because it was read from `useState` initialized once at mount — a workflow-driven status change (e.g. Submit → Approve) updates the `quote` prop but the component doesn't remount (same `key`), so the old state never re-derived. Fixed by making `quoteStatus` a plain value derived from the `quote` prop every render instead of local state. Caught by a scripted end-to-end Playwright pass, not by `tsc`/`eslint` (both were clean throughout — this was a runtime-only bug).
- Verified end-to-end via a scripted Playwright pass driving a real Chromium browser through the full lifecycle across 3 distinct accounts: fresh install → Setup Wizard → Super Admin creates a Sales User and an Approver Level 1 → logout/login as Sales User → sidebar/company-tab correctly hidden → create + submit a quotation → logout/login as Approver → notification badge shows unread count → approve → approval history recorded → upload a signature → signature image appears on the approved quote → logout/login as Super Admin → audit log shows Login/User Created/Quotation Submitted/Quotation Approved entries. Zero console errors throughout. `tsc --noEmit`, `eslint .`, and `npm run build` all clean.

---

## 2026-07-08 — Quotation PDF polish

**Feature**: Company logo/stamp upload (Settings → Company Info), rendered in the quotation PDF header and signature block. Quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms, salesperson) converted from hardcoded placeholder text to real, controlled, per-quote `Quote` fields. Print/PDF output now automatically hides empty fields instead of printing blank rows. Salesperson field defaults to the signed-in user's name on new quotes, and the "ผู้เสนอราคา" signature line pre-fills that name in print. Added quotation item **tags** (chip input) and a **specifications** field (distinct from notes), the latter auto-copied from `Product.specifications` when adding a line via the product picker.

**Files Added**: none

**Files Modified**: `src/lib/storage.ts` (`Company.logoDataUrl`/`stampDataUrl`), `src/lib/quotes.tsx` (`Quote` gained `contactName`/`contactPhone`/`address`/`taxId`/`poRef`/`paymentTerms`/`issueDate`/`expiryDate`; `QuoteLine` gained `specifications`/`tags`; new `QuoteDraftFields` type, `todayIso()`/`plusDaysIso()`/`paymentTermsOptions` helpers), `src/pages/SettingsPage.tsx` (new `ImageUploadField` component, wired into the Company tab), `src/pages/quotation/QuoteDocument.tsx` (meta fields now controlled + a parallel print-only auto-hide-if-empty rendering via a new `PrintRow` helper; logo/stamp rendering; `user: UserProfile` prop), `src/pages/quotation/QuotationPage.tsx` (`user` prop threaded through, `handleSave` simplified around `QuoteDraftFields`), `src/pages/quotation/LineItemsEditor.tsx` (new `SpecificationsEditor`/`TagsEditor` components in the line-item expand panel, plus print rendering for both; `addLineFromProduct` now copies `specifications`), `src/App.tsx` (passes `user` into `QuotationPage`)

**Files Removed**: none

**Reason**: User requested Quotation PDF polish as the first slice of a larger "master prompt" continued-development request (see the [SESSION_LOG.md](./SESSION_LOG.md) 2026-07-08 entries) — chosen over Lead/Customer module and Company Settings expansion as the fastest, most self-contained improvement to the document actually sent to customers.

**Notes**: Images are stored as size-capped (1MB) base64 data URLs inside the existing `Company` `localStorage` entry — a deliberate interim choice (no object storage exists yet) called out in [PROJECT_STATUS.md](./PROJECT_STATUS.md) Technical Debt. Verified end-to-end via a scripted Playwright pass: logo/stamp upload → appear correctly in `emulateMedia('print')` output; a fresh quote with untouched contact fields correctly omits those rows in print while still showing populated ones (ID, dates, salesperson, payment terms); tags and specifications render as chips/italic text in both screen and print. Zero console errors; `tsc`/`eslint`/`build` all clean.

---

## 2026-07-08 — Reorganize pasted master-prompt requirements into TODO.md

**Feature**: User appended a large standing "continue building the ERP" charter directly into `docs/CLAUDE.md`. Extracted its actionable requirements into properly categorized `TODO.md` sections (PDF/Quotation polish, User Profile, Company Settings expansion, Dashboard rework, other) instead of leaving raw instruction text embedded in the current-state summary file.

**Files Added**: none

**Files Modified**: `docs/CLAUDE.md` (raw pasted block replaced with a short pointer to `TODO.md`), `docs/TODO.md` (new detailed items added)

**Files Removed**: none

**Reason**: `CLAUDE.md`'s own stated purpose (both in the user's original spec and its own header) is to stay concise and current — a raw instruction dump would go stale the moment any listed feature shipped, and duplicates content better suited to `TODO.md`/`PROJECT_STATUS.md`.

**Notes**: Nothing from the pasted content was dropped — every requirement (PDF logo/stamp, hide-empty-fields, no-placeholder-text, item tags/specifications, nested-sub-details question, user profile picture/signature upload, company bank account/VAT/T&C settings, dashboard KPI rework, sidebar "Coming Soon" policy, notifications, audit logs) is now a tracked `TODO.md` item.

---

## 2026-07-08 — Documentation system

**Feature**: Full project documentation under `/docs` (this system), plus a root `CLAUDE.md` pointer so Claude Code auto-loads project context at session start.

**Files Added**: `docs/CLAUDE.md`, `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, `docs/TODO.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/UI_GUIDELINES.md`, `docs/RBAC.md`, `docs/MODULES/{Dashboard,Quotation,Product,Lead,Customer,Auth,Settings}.md`, `CLAUDE.md` (root pointer)

**Files Modified**: none

**Files Removed**: none

**Reason**: So any future session (or person) can understand current project state without a re-explanation, per explicit request.

**Notes**: Documentation reflects actual current code, verified by reading the live source tree rather than working from memory. `Lead.md` and `Customer.md` are written as "not implemented" stubs — those modules don't exist in code yet, and the docs say so rather than inventing content.

---

## 2026-07-08 — Git init + push to GitHub

**Feature**: Initialized git repo, created `.gitignore`, made the initial commit, installed GitHub CLI, authenticated, created a private GitHub repo, and pushed.

**Files Added**: `.gitignore`

**Files Modified**: none

**Files Removed**: none

**Reason**: User requested the project be committed to their GitHub.

**Notes**: Repo: `https://github.com/Wisarutbuasumlee/tcs-erp` (private). Local git identity set locally (not globally) to the name/email the user provided. `gh auth login` required an interactive browser step the user completed themselves outside the assistant session (by design, to avoid any credential passing through conversation).

---

## 2026-07-08 — Quotation item notes, sub-details, PDF export, and full code review

**Feature**: Added per-line-item multi-line notes (with bullet/numbered-list toolbar) and unlimited, reorderable sub-details to quotation line items. Added print/PDF export (browser print, with a dedicated print-only rendering of notes/sub-details, indented and formatted). Performed a full project code review and fixed everything found.

**Files Added**: `src/lib/quotes.tsx`, `src/lib/salesTeam.ts`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,LineItemsEditor,InterestButtons,notesFormat}.tsx`, `src/pages/dashboard/DashboardPage.tsx`, `src/hooks/useToast.ts`, `src/components/Toast.tsx`, `eslint.config.js`

**Files Modified**: `src/App.tsx` (stripped down to the root shell + `React.lazy` page routing), `src/pages/products/ProductList.tsx` (lint fixes), `src/pages/SettingsPage.tsx` (typed icon list), `tsconfig.json` (`noUnusedLocals`/`noUnusedParameters` → `true`), `package.json` (added ESLint deps + `lint` script), `src/styles/index.css` (`@media print` page margin)

**Files Removed**: none (old inline `QuotationPage`/`DashboardPage` inside `App.tsx` were moved out, not deleted)

**Reason**: User requested the notes/sub-details feature for real business use (scope of work, warranty terms, install steps, etc. per line item), plus a mandatory full code review after implementation.

**Notes**:
- **Root-cause bug found and fixed**: `Quote` had no `lines` field at all — the quotation editor's line-item state was disconnected scratch space that was never actually saved back to the quote. Editing an existing quote's items and clicking "บันทึก" silently did nothing; every quote showed the same 3 hardcoded example lines regardless of which one you opened. Fixed by adding `lines`/`discount` to the `Quote` type and wiring Save/Duplicate/Send to actually persist.
- Wired the previously-inert toolbar buttons: **พิมพ์** (`window.print()`), **บันทึก** (create-or-update the quote), **คัดลอก** (clone with fresh line/sub-detail IDs, detail view only), **ส่งใบเสนอราคา** (save + bump draft→pending status).
- Client name field converted from uncontrolled (`defaultValue`) to controlled (`value`/`onChange`) so it actually saves. Other secondary fields (contact, phone, address, tax ID, PO ref, dates, payment terms) intentionally left as-is (cosmetic) — flagged in [PROJECT_STATUS.md](./PROJECT_STATUS.md) Technical Debt, not silently left broken.
- Fixed an operator-precedence bug in the product list's "sort by status" comparator (`Number(a.archived) - Number(b.archived) * dir` → parenthesized correctly).
- Enabled `noUnusedLocals`/`noUnusedParameters`, added ESLint (flat config, TS + react-hooks + react-refresh rules), fixed every finding (unused imports, `any` types replaced with real interfaces, unnecessary regex escapes, a missing `useMemo` dependency).
- Extracted `DashboardPage` out of `App.tsx` into its own module and lazy-loaded all four main pages — resolved a build-time "chunk larger than 500KB" warning by isolating `recharts` (~445KB) to a chunk that only loads when Dashboard is actually viewed.
- Verified everything end-to-end with a scripted Playwright pass (notes/bullets, sub-detail reorder, save, reopen-and-confirm-persisted, print preview, duplicate, create-new-quote-and-send) — zero console errors.

---

## 2026-07-08 — Product Management module

**Feature**: Full Product Library module — product + category CRUD, archive vs. permanent delete, duplicate, search/filter/sort/pagination, and a picker modal that lets Quotation line items snapshot a product's data.

**Files Added**: `src/lib/products.ts`, `src/pages/products/{ProductsPage,ProductList,ProductForm,CategoriesManager,ProductPickerModal}.tsx`, `src/components/ConfirmDialog.tsx`

**Files Modified**: `src/App.tsx` (added "คลังสินค้า" nav item + products/categories state, wired the picker into the Quotation line-items table)

**Files Removed**: none

**Reason**: User requested a Product Management module, explicitly separate from Quotation, with the rule that editing/archiving/deleting a product must never affect historical quotations.

**Notes**: Snapshot integrity holds because `QuoteLine` (at the time) stored plain primitive values with no reference back to a `Product` — picking a product just copies its name/unit/price into a new line item once. Verified via a scripted browser pass (create/duplicate/archive/delete-with-confirm/category CRUD/picker-into-quotation).

---

## 2026-07-08 — Sign in / Sign up / Settings

**Feature**: Full-screen Sign-in and Sign-up pages (navy/gold split layout, client-side validation, show/hide password, mock "forgot password"), a tabbed Settings page (Profile / Company Info / Security / Notifications), and a real auth gate wired into `App.tsx` (previously only scaffolded as unused files).

**Files Added**: `src/pages/{SignInPage,SignUpPage,AuthLayout,SettingsPage}.tsx`, `src/lib/storage.ts`

**Files Modified**: `src/App.tsx` (added `authed`/`authView`/`company`/`user` state, user dropdown menu with Settings/Log out, sidebar Settings entry, routing to Settings)

**Files Removed**: none

**Reason**: User requested sign-in/sign-up/settings; a first attempt had created the page files but never actually wired them into `App.tsx` (a real bug caught when the user reported "I can't find the sign-in page").

**Notes**: Company profile edited in Settings feeds live into the Quotation document header — verified via scripted flow (sign up → edit company address → open a quotation → confirm the new address appears).

---

## 2026-07-08 — Initial scaffold: Dashboard + Quotation (TCS ERP)

**Feature**: Initial project scaffold, ported and rebranded from a Figma Make prototype into a standalone Vite + React + TypeScript + Tailwind v4 app. Dashboard (KPIs, charts, leaderboard, orders, activity feed) and Quotation (list + printable document with line items, VAT) pages, trimmed to just those two modules, rebranded from placeholder "เน็กซัส ERP" to **TCS ERP / Thai Chemicals Storage**.

**Files Added**: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/{fonts,tailwind,theme,index}.css`

**Files Modified**: n/a (new project)

**Files Removed**: n/a (new project)

**Reason**: User wanted a real, runnable website built from a Figma Make design, scoped to Dashboard + Quotation only.

**Notes**: Design tokens (navy `#0b1d3a` / gold `#c9a84c`, Playfair Display / Inter / JetBrains Mono) ported verbatim from the Figma source; all sample data/company placeholders rebranded.
