# Session Log

> Append-only retrospective summary at the end of each work session. Distinct from [CHANGELOG.md](./CHANGELOG.md) (which logs individual changes as they happen) — this is a higher-level "what happened this session and what's next" note. Never delete previous entries.

---

## Session — 2026-07-09 (Quotation print/PDF redesign)

### What was implemented
- User provided photos of a real, 3-page printed quotation from another vendor's system and asked for this app's print output to match it
- Built a new dedicated `src/pages/quotation/PrintDocument.tsx`: a single `<table>` with a repeating `<thead>` so the company/buyer/meta header and item-table column headers repeat on every printed page — verified by forcing a quote to 17 line items and confirming the header repeated correctly on page 2 while totals/signatures appeared only once at the true end
- Added per-unit discount (amount + %) as its own printed column, pin-icon sub-detail bullets, a Thai-language amount-in-words line under the grand total (new `bahtText()` helper), and a three-column signature table (adds a blank customer-PO-confirmation column with no backing data)
- Added four new real per-quote fields the reference document needed: buyer contact email, delivery method, delivery address, project name
- Retired the old scattered print-markup approach in `QuoteDocument.tsx`/`LineItemsEditor.tsx` (interleaved `print:hidden`/`hidden print:table-row` pairs) in favor of: screen-only components marked `print:hidden` at their root, and one dedicated print-only component rendering everything from the same data

### Files Modified
`src/pages/quotation/PrintDocument.tsx` (new), `src/lib/quotes.tsx`, `src/pages/quotation/{QuoteDocument,LineItemsEditor}.tsx`, `docs/{DATABASE,MODULES/Quotation,UI_GUIDELINES}.md`. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Chose the "one `<table>` with a repeating `<thead>`" technique specifically because browsers natively repeat `<thead>` content across print page breaks — the only reliable way to get a repeating header without a JavaScript pagination library. Documented as the new established pattern in [UI_GUIDELINES.md](./UI_GUIDELINES.md) for any future multi-page printed document.
- Kept the reference document's separate "หมายเหตุ"/"Condition"/"Payment" sections as one free-text `remarks` field rather than splitting the data model further — the existing multi-line textarea already lets the user type the same structure, and a bigger schema change wasn't warranted for this pass.
- Did not attempt to replicate the reference's page-1-only full header / condensed continuation-page header, or its "Page X/Y" numbering — both are effectively unsupported by browser-native print CSS without a heavier JS-driven pagination approach. Documented as accepted simplifications rather than silently deviating from the reference.

### Problems Found
- **Pre-existing bug surfaced by this work**: the "หมายเหตุ / เงื่อนไข" (remarks) textarea was `defaultValue`-only — a fully uncontrolled input, never wired to `onChange` or to the save payload. Anything a user typed was silently discarded on save and reset to the company default every time the document was reopened.

### Problems Fixed
Added a real `Quote.remarks` field, made the textarea controlled, and wired it through `save()` like every other document field — same treatment as the contactName/phone/address fields fixed in the 2026-07-08 PDF-polish pass. Verified via a scripted Playwright pass: filled the new fields on a seeded quote, saved, confirmed persistence, and inspected a real `page.pdf()` export directly (not just a screenshot) to confirm print fidelity, then forced 17 line items to confirm multi-page header repetition. Zero console errors; `tsc --noEmit`/`eslint .`/`npm run build` all clean before and after.

### New TODO Items
"Page X/Y" numbering and condensed continuation-page headers — both logged as known, deliberately-not-implemented items in [TODO.md](./TODO.md) rather than silent gaps.

### Future Recommendations
1. If a future request needs page numbers or a genuinely different first-page-vs-continuation-page header, that requires a JS-driven print/pagination approach (e.g. a headless-Chromium PDF generation step measuring page breaks) — flag this as a larger scope change up front rather than trying to force it via CSS alone.
2. The Phase 2 backend decision and Lead/Customer Management remain the two largest untouched buckets — this session was a scoped, self-contained document-quality pass, not a dent in either of those.

### Estimated Completion Percentage
~27% of the full long-term ERP vision (a document-quality/correctness pass on an existing module, plus a real bug fix); ~93% of the currently-scoped Phase 1 frontend-only modules — unchanged from the prior session since this didn't add new module coverage. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08 (RBAC / User Management / Approval Workflow / Notifications)

### What was implemented
- Full client-side RBAC simulation: Initial Setup Wizard (first-run only, creates the Super Admin), multi-user accounts (`src/lib/users.ts`) with hashed passwords, Position vs. Role separation, active/inactive status; public self-signup removed
- 6-role/17-permission model (`src/lib/roles.ts`, `src/lib/permissions.ts`) with a fully-hidden (not disabled) permission-gated sidebar
- User Management page (create/edit/reset password/activate/deactivate/assign role-department-position, self-role-edit blocked) and Role Management page (Super-Admin-only hardcoded gate, permission matrix editor, system roles read-only)
- Quotation approval workflow: `QuoteStatus` expanded 4 → 9 values, a `workflowTransitions` state machine, permission+ownership-computed action buttons, required-comment modal for reject/cancel, append-only approval history
- Personal signature-image upload (Settings → Profile), auto-rendered on the quotation's preparer/approver signature blocks by looking up the creator and the latest "approved" history entry; empty line (no error) when unset
- Notification bell + panel (`src/components/NotificationBell.tsx`): correct 0-unread/badge/99+ behavior, role-based delivery for submit/approve/reject/high-value/customer-accept/customer-reject events
- Append-only audit log page, read-only, no edit/delete UI
- Company Settings gained bank info/VAT rate/Terms & Conditions fields, restricted to Super Admin; quotes now persist to `localStorage` (previously in-memory only)
- Full documentation pass across all `docs/` files per the standing rule

### Files Modified
`src/App.tsx`, `src/lib/{storage,quotes,permissions,roles,users,session,notifications,auditLog}.ts(x)`, `src/pages/{SignInPage,SettingsPage}.tsx`, `src/pages/quotation/{QuotationPage,QuoteDocument,QuoteList}.tsx`, `src/pages/SetupWizardPage.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`, `src/components/NotificationBell.tsx`. `src/pages/SignUpPage.tsx` removed. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Scoped to a **client-side simulation** rather than the real Phase 2 backend migration — confirmed explicitly with the user via a clarifying question at the start of the session (Phase 1 simulation vs. starting real Next.js/Prisma/Postgres backend), since the request's security language ("unbypassable," "tamper-proof") isn't achievable without a server, and building that server is a much larger, separately-scoped effort.
- Flat 17-permission model (`module:action` keys) rather than a fully generic per-module CRUD matrix — matches the spec's literal permission list (View/Create/Edit/Delete/Approve/Reject/Export/Manage Users/Manage Roles/Manage Permissions/Manage Company Settings) while still giving real module-level sidebar differentiation.
- `roles:manage`/`company:manage` are hardcoded to the Super Admin role in addition to being permission-gated, so a misconfigured custom role can never accidentally unlock them — directly implements the spec's "Only Super Admin may..." rules as code, not just convention.
- No sequential two-level approval — the given workflow diagram has a single "Pending Approval" step; Approver Level 1 and Level 2 both get independent approve/reject rights from that state rather than a hard first-then-second gate. A deliberate scope cut, documented rather than silently skipped.
- Reused every existing pattern rather than inventing new ones: `ImageUploadField` for the signature upload, `ConfirmDialog`/`Toast`/`useToast` for confirmations and feedback, the `load*`/`save*` + `update*` `localStorage` convention for every new domain, the `lib/<domain>.ts` + `pages/<module>/` folder convention for the new `pages/admin/` module.

### Problems Found
- **Status badge/toolbar froze after a workflow transition**: `QuoteDocument`'s `quoteStatus` was `useState`-initialized once at mount from the `quote` prop; since the component doesn't remount when only the quote's status changes (same `key`, same `selectedId`), approving/submitting a quote updated the underlying data but the visible status pill and available action buttons kept showing the pre-transition state. Found via the scripted Playwright pass (status stayed on "ร่าง" after a successful submit), not by `tsc`/`eslint` — a pure runtime/React-lifecycle bug.
- Fresh-review during doc updates surfaced two intentionally-deferred gaps worth flagging clearly rather than silently leaving open: `Company.vatRate` is editable but not yet wired into `computeTotals()`, and Product Library only has sidebar-level (not button-level) permission gating.

### Problems Fixed
The status-badge bug — changed `quoteStatus` from local `useState` to a value derived directly from the `quote` prop on every render (see [CHANGELOG.md](./CHANGELOG.md)). Re-verified via the same Playwright script after the fix: status correctly shows "รออนุมัติ" then "อนุมัติแล้ว" at each step. `tsc --noEmit`, `eslint .`, `npm run build` all clean before and after.

### New TODO Items
Wire `Company.vatRate` into `computeTotals()`; add button-level (create/edit/delete) permission gating to Product Library; lift `QuotationPage`'s view/selectedId state to `App.tsx` so notification clicks can deep-link to the specific quote instead of just the list; consider sequential two-level approval if a real business need for it shows up. All added to [TODO.md](./TODO.md).

### Future Recommendations
1. The Phase 2 backend decision is even more clearly the highest-leverage next step now — the client-side `User`/`Role`/`Permission`/`Notification`/`AuditLog` shapes built this session map closely onto the already-proposed Prisma schema (see [DATABASE.md](./DATABASE.md) Migration Notes), so migrating this specific subsystem should be closer to "move the same logic server-side" than a redesign.
2. Don't let this session's "RBAC" language create false confidence — it must be described accurately to any stakeholder as a UI/workflow simulation, not access control, until Phase 2 lands.
3. Lead & Customer Management remains the other big untouched bucket from the original spec — still a reasonable next priority conversation with the user.

### Estimated Completion Percentage
~26% of the full long-term ERP vision (a genuinely large slice landed this session); ~93% of the currently-scoped Phase 1 frontend-only modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08 (continued: master-prompt triage + PDF polish)

### What was implemented
- Discovered and triaged a large "master prompt" the user pasted directly into `docs/CLAUDE.md` — extracted its requirements into `TODO.md`, kept `CLAUDE.md` concise
- Asked the user to prioritize among the huge resulting backlog (Leads/Customers, RBAC, PDF polish, User Profile uploads, Company Settings expansion, Dashboard rework) rather than attempting all of it at once
- Built the chosen priority: **Quotation PDF polish** — company logo/stamp upload, real per-quote document fields (killed the last hardcoded-placeholder-text issue), auto-hide-empty-fields in print, salesperson bound to the real signed-in user, item tags, item specifications field

### Files Modified
`docs/CLAUDE.md`, `docs/TODO.md`, `src/lib/storage.ts`, `src/lib/quotes.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor}.tsx`, `src/App.tsx` — see [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Images (logo/stamp) stored as size-capped (1MB) base64 data URLs inside the existing `localStorage`-backed `Company` record — an explicit, documented interim choice given no object storage exists yet, not a silent hack.
- Kept quotation sub-details as a flat, reorderable list rather than building nested tree UI — the master prompt asked to "re-confirm" whether nesting was needed, and no concrete business case for it surfaced, so the simpler existing implementation was kept and the decision was documented rather than deferred indefinitely.
- Standing documentation instructions (the "master prompt") were deliberately NOT left inline in `docs/CLAUDE.md` — moved to `TODO.md` so the entry-point doc stays accurate as items ship, per `CLAUDE.md`'s own stated purpose.

### Problems Found
- Several `QuoteDocument.tsx` fields (contact person, phone, address, tax ID) were hardcoded example values shown regardless of which quote was open — effectively fake data masquerading as real, which the user's master prompt explicitly flagged as unacceptable for a PDF sent to a real customer.
- The "พนักงานขาย" (salesperson) field in the document view was a completely disconnected hardcoded input, not bound to `Quote.salesperson` at all, despite that field already existing on the `Quote` type and being used correctly elsewhere (the quote list).

### Problems Fixed
Both of the above — see [CHANGELOG.md](./CHANGELOG.md) 2026-07-08 "Quotation PDF polish" entry. Verified via scripted Playwright pass covering logo/stamp upload, print-media rendering, and empty-field auto-hiding on a fresh quote. Zero console errors; `tsc`/`eslint`/`build` all clean.

### New TODO Items
Signature **image** upload (name is wired, image is not), bank account info, configurable VAT rate, company-level default Terms & Conditions — all added to `TODO.md` under their respective sections.

### Future Recommendations
1. The remaining backlog buckets (Leads/Customers, RBAC, User Profile uploads, Dashboard rework) are all still open — next session should re-run the same prioritization conversation rather than assuming an order.
2. Signature image upload and Dashboard KPI rework are both explicitly blocked on other work (file storage / Phase 2 backend, and the Lead & Customer module, respectively) — don't attempt them in isolation.
3. The `ImageUploadField` pattern built for company logo/stamp (`SettingsPage.tsx`) is directly reusable for the future User Profile picture/signature upload — no need to design a second pattern.

### Estimated Completion Percentage
~19% of the full long-term ERP vision (small increment — this was a document-quality/correctness pass on an existing module, not new module coverage); ~92% of the currently-scoped Phase 1 frontend-only modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08

### What was implemented
- Initial Vite + React + TS + Tailwind v4 scaffold, ported/rebranded from a Figma Make design to **TCS ERP**
- Dashboard module (KPIs, charts, sales leaderboard, orders, activity feed)
- Quotation module: list, create/edit/duplicate, VAT + discount totals, print
- Sign in / Sign up / Settings, wired into a real (client-only) auth gate
- Product Library module: CRUD, categories, archive/delete, duplicate, search/filter/sort/pagination
- Quotation ↔ Product Library picker integration
- Quotation item **notes** (bullet/numbered toolbar) + unlimited, drag-reorderable **sub-details**
- **PDF/print export** with dedicated indented formatting for notes/sub-details
- Full code review pass: ESLint added, strict unused-code checks enabled, all findings fixed, bundle-size warning resolved via code-splitting
- Git repository initialized and pushed to GitHub (`Wisarutbuasumlee/tcs-erp`, private)
- This documentation system

### Files Modified
See per-entry detail in [CHANGELOG.md](./CHANGELOG.md) — too many across the session to usefully summarize here without duplicating it. High-level: everything under `src/` was either created or touched at least once; `App.tsx` went from a ~1000-line monolith to a ~200-line shell as modules were extracted.

### Architectural Decisions
- No router — a single `activeNav` string switch in `App.tsx` (documented, with the tradeoff, in [ARCHITECTURE.md](./ARCHITECTURE.md))
- No component library — hand-built Tailwind, matching the ported Figma design system exactly
- One `lib/<domain>.ts` + `pages/<module>/` per data domain, established as the repo convention
- `React.lazy` + `Suspense` per top-level page, specifically to isolate `recharts` to the Dashboard chunk
- Client-only for now; a full Next.js/Prisma/Postgres/RBAC Phase 2 was *designed* but deliberately *not started*, pending a user decision (see [ARCHITECTURE.md](./ARCHITECTURE.md), [RBAC.md](./RBAC.md))

### Problems Found
- **Quotation Save/Duplicate/Send were completely non-functional** — `Quote` had no `lines` field, so the editor's line-item state was never connected to the record being viewed. Every quote showed the same 3 hardcoded example lines regardless of which was opened.
- Sign-in/Settings pages existed as files but were never wired into `App.tsx` in an earlier attempt (caught when the user reported "I can't find the sign-in page")
- Operator-precedence bug in the product list's status-column sort comparator
- No lint tooling existed at all prior to this session's code-review pass
- 709KB single JS chunk (bundle-size warning) due to `recharts` being bundled into the main chunk unconditionally

### Problems Fixed
All of the above — see [CHANGELOG.md](./CHANGELOG.md) for the detailed per-fix writeup. Verified via `tsc --noEmit`, `eslint .`, `npm run build`, and multiple scripted Playwright passes (zero console errors) covering: full quotation lifecycle including notes/sub-details, product CRUD, settings, auth flow.

### New TODO Items
See [TODO.md](./TODO.md) — highlights: decide on Phase 2 backend migration, persist `Quote[]` to `localStorage`, build Lead & Customer Management.

### Future Recommendations
1. Don't build further client-side modules (Lead/Customer/etc.) on the current no-persistence-for-quotes foundation without first fixing quote persistence — it'll compound the same class of bug.
2. The Phase 2 backend decision is the single highest-leverage next step — most other "future improvements" across every module doc are blocked or made redundant by it (real persistence, real auth, real RBAC, real multi-user).
3. Keep following the `lib/<domain>.ts` + `pages/<module>/` convention for anything new — it made the Quotation/Dashboard extraction refactors mechanical rather than risky, and it's the same shape the proposed Next.js `modules/` structure expects.

### Estimated Completion Percentage
~18% of the full long-term ERP vision; ~90% of the currently-scoped Phase 1 frontend-only modules (Dashboard, Quotation, Product, Auth, Settings). See [PROJECT_STATUS.md](./PROJECT_STATUS.md).
