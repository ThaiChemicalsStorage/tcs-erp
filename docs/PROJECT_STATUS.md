# Project Status

> Maintained after every task. See [CLAUDE.md](./CLAUDE.md) for the standing update rule.

## Overall ERP Progress

**~42%** of the full long-term vision (Lead/Quotation/Customer/Product now, then HR/Accounting/Inventory/Warehouse/Purchasing/Project Management later, all on a real multi-user backend with RBAC — the Accounting bucket genuinely started 2026-08-17/18 with the AR/Milestone-Billing module's Phase 1 + 1.5, nudging this number for the first time in a while). The 2026-07-10 Executive Dashboard/Job Type pass, its completion pass, an independent Codex review + fix pass, a UI/UX redesign + enhancement pass, and an audit-integrity/workflow-gap fix pass (all 2026-07-10) are quality/correctness/design work on top of existing Quotation data, not new module scope, so none of them move this number much on their own.

Within the currently-scoped modules (Dashboard, Quotation, Product Library, Auth, Settings, User Management, Role Management, Notifications, Audit Log, Customer Management (2026-07-14), Scope of Work (2026-07-15), and — new as of 2026-07-23 — Delivery Order), functional completeness is **~98%**. **Company Profiles is no longer one of these modules** — built 2026-07-13, briefly (and incorrectly) wired into the Quotation form, corrected the same week, and then **removed from the user-facing ERP entirely** on 2026-07-14 (this ERP only ever needs one issuer company; see [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md)). The correct requirement — a Customer selector on the Quotation form — is its own module (Customer Management, genuinely new module scope) — see [MODULES/Customer.md](./MODULES/Customer.md). The Dashboard's data/correctness layer is thoroughly reviewed; its presentation layer went through 3 same-day user-driven iterations on 2026-07-13 after the 2026-07-10 redesign's KPI card treatment repeatedly read as too "template-like": first a revert of the two-tier hero/mini-card split back to one flat 22-card grid, then — after further feedback that even the flat grid was still cluttered — a reorganization into 4 primary KPI cards plus 3 new compact panels (Sales Performance rates/cycle-times, Activity & Follow-up counts, and the existing Quotation Status Summary gaining a Percentage column), with every other redesign-added section (pipeline step cards, Sales Activity Analytics, rankings, actionable approval/follow-up lists) kept exactly as-is below an "In-Depth Detail" divider. See CHANGELOG.md for the full iteration history. A first real pass at app-wide UX (shared `PageHeader`/`EmptyState`/`MetricInfoTooltip` components, a `driver.js` guided tour, grouped sidebar nav, clearer required-field/validation messaging) landed too, though it's a bounded subset of a much larger brief. A fifth pass then closed the quotation module's audit-trail integrity gap (audit entries are now server-authoritative, not client-forgeable) and two smaller workflow gaps (required rejection comments, missing terminal-workflow notifications) flagged by an independent re-review — see Known Risks and TODO.md for what's still open. Remaining gaps are genuine business decisions or pre-existing, already-tracked scope (PDF/Excel export beyond CSV, real Lead/Customer entities, full onboarding-tour/PageHeader rollout to every page, automated tests/CI), not defects. The whole Dashboard/Quotation surface still needs a live-data browser verification pass — not because of any known defect, but because every session that's attempted this had no network path to MongoDB Atlas from its sandboxed environment (see Known Risks — reproduced four times now).

## Current Phase

**Real full-stack app, deployed and live in production.** Vite + React frontend, Node.js backend, self-hosted MongoDB database. **Since the ~2026-08-07 cutover, the primary and only runtime is a standalone Express server (`server/`, `npm start`) on a self-hosted VPS** with its own domain + HTTPS — the earlier Vercel Serverless Functions deployment (https://tcs-erp-nine.vercel.app) that served as the pre-cutover demo is decommissioned. See [ARCHITECTURE.md](./ARCHITECTURE.md), [DEPLOYMENT.md](./DEPLOYMENT.md), and [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md).

## Completed Features

- ✅ **[2026-08-26b] Customer approval page shows อ้างอิงโปรเจกต์/รหัสงาน; "ลูกค้า" → "ชื่อบริษัท";
  checklist detail panel no longer collides with its own item.** The project/job reference was
  never missing from the API — `buildApprovalPublicPayload()` always sent it and the client type
  always declared it; only `CustomerApprovalPage.tsx`'s field list omitted it. It is often the
  customer's only link between our SR number and a PO on their side, so it now renders in the
  editor's field order and in `font-mono`, matching the printed report. Separately, the checklist
  item's disclosure row had `pb-3` and no top padding, leaving the textarea 0.3px under the item
  row above it — now `pt-2 pb-4` (~16px above, ~24px below), so the panel reads as belonging to its
  item. Verified in Playwright; tsc/lint/build/304 tests clean.

- ✅ **[2026-08-26] The sidebar's scrollbar stopped being the brightest thing on the navy rail.**
  Reported with a screenshot: a full-height white OS track with Windows arrow buttons running down
  the sidebar. The app had no scrollbar styling anywhere, and the sidebar is its only scroll region
  on a dark surface, so the default track read as a seam splitting the rail off from the page. New
  `.sidebar-scroll` class (`src/styles/index.css`) on the sidebar `<nav>`: transparent track, arrow
  buttons suppressed, a 6px `rounded-full` thumb in the rail's own `--sidebar-foreground` ink at
  28% → 45% on rail hover → 62% on thumb hover, plus the Firefox `scrollbar-width`/`scrollbar-color`
  pair. Not gold (Rare Gold Rule) and not hidden-until-hover. Verified in Playwright on the running
  app — expanded rail, collapsed `w-16` rail, and the hover step — with `tsc`, lint, build and the
  full 304-test suite clean. Light-surface scroll regions were deliberately left on the OS default;
  that decision is logged in TODO.md rather than swept in.

- ✅ **[2026-08-25b] The API bundle no longer contains a single line of JSX, and a test keeps it that way.**
  Closed the 🔴 left over from the 2026-08-21 production crash-loop. Walking the real import graph
  showed only **one** runtime import forced the server to load a `.tsx`
  (`api/_lib/arHandler.ts` → `bahtText`); everything else was `import type`, which is erased. Fixed
  at the root rather than the minimum: `statusIcon` → `src/pages/quotation/statusIcons.tsx`,
  `bahtText` → a dependency-free `src/lib/bahtText.ts`, and `src/lib/quotes.tsx` → `src/lib/quotes.ts`
  (re-exporting `bahtText`, so no frontend call site changed). New
  `tests/serverImportGraph.test.ts` walks the graph from `api/` and fails on any reachable `.tsx` or
  React-package import — **verified by deliberately breaking it and watching it go red**. Side
  effect: `npm run lint` warnings 35 → 3, since most were `react-refresh/only-export-components`
  firing on a file that should never have been `.tsx`. Verified live in a browser (status icons
  still render in list and detail; the print document's Thai baht-words line is still correct) and
  by hitting `GET /api/ar-documents` to force the server to actually load `arHandler.ts` at runtime.

- ✅ **[2026-08-25] Auto-save across every document editor, and discounts enterable in baht.**
  Two owner requests. **Auto-save** is shared infrastructure (`src/hooks/useAutoSave.ts` +
  `AutoSaveIndicator`/`DraftRecoveryBanner`) in two layers: a `localStorage` snapshot that survives a
  closed tab or a click onto another page — the only layer that can protect a brand-new quotation
  with no server record yet, which is the case that was actually reported — and a silent Draft-only
  server PATCH for records that already exist. Wired into all 8 document editors (Quotation, Scope of
  Work, Delivery Order, Material Requisition, Job Order, Purchase Request, Production Order, Service
  Report). `?autoSave=1` is enforced server-side, not just in the UI: no audit-log entry, and 409 on
  anything past Draft. **Discounts** gained an optional `discountMode: "percent" | "amount"` on both
  `Quote` and `QuoteLine`; absent means percent, so no historical total moved and no migration ran.
  While threading it through, the quotation money math was consolidated from two mirrored copies into
  one React-free module (`src/lib/quoteMath.ts`, re-exported by `api/_lib/quoteAmounts.ts`), and a
  real latent defect was fixed: `api/_lib/arHandler.ts` computed invoice line amounts with a
  hardcoded `(1 - discount/100)` and would have billed the wrong figure once baht discounts existed.
  Verified in the running app end-to-end (totals, the auto-save chip, the recovery banner, and an
  audit log confirmed to have zero new rows from auto-saves), not just via tsc/lint/build/test. This
  is quality/feature work on existing modules, so the ~42% / ~98% figures above are unmoved.

- ✅ **[2026-08-21] User manual brought back in sync with the app, and its toolchain fixed.**
  `public/manual.html` had been frozen at its 2026-08-14 edition against an app that had since grown
  5 modules. Restructured 15 → 20 chapters, regrouped to mirror the real sidebar, 12 new screenshots,
  7 new FAQ rows. No product code changed, so the ~42% / ~98% figures above are unmoved — this is
  documentation catching up, not new scope. Three real bugs in `docs/manual/generate-pdf.mjs` were
  fixed alongside it (it rendered the superseded `docs/manual/user-manual.html`, wrote its output
  back into unauthenticated `public/`, and loaded over `file://` so every figure printed blank);
  that superseded source and its `docs/manual/images/` folder were then deleted, leaving exactly one
  manual. **Two claims to be careful with**, both corrected during review: the old
  `คู่มือการใช้งาน TCS ERP.pdf` was *moved* by `c2f91b5` to gitignored
  `reference/company/`, not destroyed; and the long-repeated "the automated browser cannot reach
  this machine's dev server" premise is **false** — Playwright drove `localhost:3000` fine, so the
  ~40 TODO.md items resting on it mean "not yet attempted", not "not possible". Still unverified:
  `generate-pdf.mjs` has not been run end-to-end (needs `npm install --no-save puppeteer-core`).
  See CHANGELOG.md 2026-08-21 and TODO.md.

- ✅ **[2026-08-20j] Delivery Order can be routed to departments — and the department master data
  turns out to be unusable as-is.** Sales ticks which departments a delivery note goes to; everyone
  in those departments sees it on their own list (view + print only, enforced by a single
  dispatcher-level guard that holds even against a role granted `:edit`/`:finalize`/`:delete`) and
  gets a deep-linked notification. `deliveryOrder` now also sits in the โปรเจกต์ and ผลิต nav groups —
  the same module, not a copy. **The blocking finding**: this app carries two department lists that
  share not one value — the hardcoded `DOCUMENT_RECIPIENT_DEPARTMENTS` behind Scope of Work's
  checklist, and the real `departments` collection behind `User.department`. Scope of Work never had
  to reconcile them because it routes to user ids. Checked against the database: **no ฝ่ายผลิต and no
  ฝ่ายโปรเจกต์ row exists**, and current users hold legacy values (`"Purchase"`, `"Technic"`) matching
  no row — so routing reaches nobody until an admin sets the real departments up. Because that
  failure is silent, the route returns `recipientCount` and the UI warns explicitly when it is 0.
  Also worth recording: the owner's opening message read as "undo the Project/Production record
  separation"; asking instead of acting revealed they meant the opposite, and **no MR/PR code
  changed**. `tsc` ×2 / `lint` 0 errors / `build` / **261 tests**; i18n parity 2,139.
  See CHANGELOG.md 2026-08-20j and [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md).

- ✅ **[2026-08-20i] Reviewed the Production module and fixed 9 defects — four of them critical.**
  Done on the owner's own instruction to review the work afterwards. The worst was a **permission
  leak**: `buildSimpleOwnershipClause()` and the new department filter both return a top-level `$or`,
  and the list query spread them into one object, so the department clause silently overwrote the
  ownership one — every user without `:viewAll` could read everyone else's Material Requisitions and
  Purchase Requests. Also fixed: `toObjectId("")` throwing *after* a write had already landed on
  production-owned documents (4 call sites); `roles.ts` containing **zero** `productionOrder:` grants,
  so the whole ผลิต module was invisible even to Administrator (an earlier scripted edit had failed
  silently on CRLF — the `2026-08-20h` "permissions added" claim was wrong); documents still editable
  while awaiting approval, letting content change underneath the approver; and three FM-PD-02
  signature blocks that could never be filled because they are signed *after* approval, now saved via
  a dedicated non-Final-locked route. Raising an MR/PR from a Production Order now requires that order
  to be Final and checks `productionOrder:view` — pinned by a new test, verified by removing the gate
  and watching it fail. One finding was deliberately **not** fixed: single-document `GET` routes have
  no ownership scoping, but that is the pre-existing pattern in all four sibling modules, so it is
  logged in TODO.md for an explicit owner decision instead of changed unilaterally.
  `tsc` (both configs) / `lint` (0 errors) / `build` / **252 tests** all clean; i18n parity 2,131.
  Two existing tests failed on the new Final gate and were rewritten to walk the real approval
  workflow rather than relaxed. See CHANGELOG.md 2026-08-20i.

- ✅ **[2026-08-20h] Production (ผลิต) department module + approval workflow on four documents.**
  Built the new **ใบสั่งผลิต** (Production Order, FM-PD-02 — transcribed from a scanned form by
  extracting and rendering its embedded bitmap, since the PDF has no text layer), gave **ใบเบิก-คืนวัสดุ
  / ใบขอซื้อ / ใบสั่งงาน / ใบสั่งผลิต** a real ร่าง→รออนุมัติ→อนุมัติ workflow with approve / reject
  (reason required) / withdraw buttons behaving exactly like Scope of Work, and separated the two
  departments' records via `ownerDepartment` so Project and Production share document *types* but
  never see each other's data. ใบส่งมอบงาน was deliberately **not** rebuilt — it is the existing
  Delivery Order module, per the 2026-08-20 business-side confirmation. 7 new `productionOrder:*`
  permissions with their own Role Management group. Documents stored before this change keep working:
  every new field is optional and a missing `ownerDepartment` counts as Project-owned, with a test
  pinning exactly that (silently hiding existing records would have been the worst failure here).
  Also fixed a test-harness gap found along the way — `makeReqRes()` never populated `req.query`, so
  any handler reading a query string crashed under test while working fine in both real runtimes.
  `tsc` (both configs) / `lint` (0 errors) / `build` / **251 tests** all clean; i18n parity 2,129.
  **Not click-tested in a browser** — the automated browser cannot reach this machine's dev server,
  so the ผลิต pages, the approve buttons and the FM-PD-02 print layout need a manual pass (TODO.md).
  See [MODULES/Production.md](./MODULES/Production.md) and CHANGELOG.md 2026-08-20h.

- ✅ **[2026-08-20e] Audited Accounting + Project against the owner's real spec; Project gained its own
  "+ สร้าง" flows.** The owner supplied both departments' full business specs for the first time and
  asked whether what was built matches. **Confirmed correct**: all 4 accounting document types and
  their AR-vs-IV branching, both Express improvement requests (deposit alert, monthly tax summary),
  the Project module's 3 sourcing branches, and — the spec's own bolded requirement — leftover
  material returned on the **same** ใบเบิก-คืนวัสดุ, still editable after Final. **Fixed**: deposit
  milestones no longer require a signed delivery note (spec case 1 bills the deposit before anything
  is delivered — staff were being forced to tick an untrue box), and the Project module's only entry
  point no longer renders in Thai in English mode. **Built**: a "+ สร้าง" button with a source picker
  on all 4 Project pages (previously creatable only from inside a Project's item table) — pick a
  Scope of Work for a Project, or Project → pending item for the 3 sub-documents.
  **Still open, needs the owner's input** (unbuilt features rather than defects): Cost Control is
  absent from the code entirely, team work-distribution is unmodelled, and the accounting document
  **order** still doesn't match (spec reads `AR/IV → RE → BI`; code issues BI together with the
  AR/IV) — left alone deliberately because it changes live document numbering. `tsc` (both
  configs)/`lint`/`build`/`test` (238/238) clean. See CHANGELOG.md 2026-08-20e and TODO.md.

- ✅ **[2026-08-20c] Home-screen icon ("Add to Home Screen") — no app store needed.** Direct request
  for a phone home-screen icon that opens the app without going through the App Store/Play Store. Added
  a Web App Manifest (`public/manifest.webmanifest`, navy `#0b1d3a` theme, `display: "standalone"`) +
  generated icon set (`public/icons/`, from the existing logo re-composited onto a solid navy
  background so it reads cleanly on any launcher) + the matching `index.html` `<link>`/meta tags.
  Deliberately **no service worker/offline caching** — this is a live, frequently-updated internal ERP,
  and stale cached data would be a worse failure mode than requiring a network connection. Purely
  static-asset changes, no code/data changes; `npm run build` confirmed clean. See
  [ARCHITECTURE.md](./ARCHITECTURE.md) "Home-screen icon" and CHANGELOG.md 2026-08-20c.

- ✅ **[2026-08-20] วางบิลตามงาน becomes a create flow, no more auto-pulled job table.** Direct
  owner request: every accounting document should be click-to-create-yourself, never auto-pulled — a
  job showing up in a list doesn't mean it's actually billable yet (still waiting on the customer's
  PO, or the customer's documents aren't complete). `AccountingPage.tsx`'s landing view used to fetch
  and render every Scope of Work as a clickable table on page load; that table is gone, replaced by a
  "+ สร้างวางบิล" button opening a search-and-pick `ScopeOfWorkPickerDialog` (same visual pattern as
  `ManualTaxInvoiceDialog.tsx`'s own "+ สร้าง" dialogs) — the job list is now fetched only when this
  dialog opens, not on page mount. Clarified with the owner first (`AskUserQuestion`): replace the
  auto-list entirely, and keep the existing PO-copy/delivery-note issuing checklist unchanged.
  `tsc`/`lint`/`build`/`test` all pass clean. See [MODULES/Accounting.md](./MODULES/Accounting.md)
  "2026-08-20 — วางบิลตามงาน becomes a create flow" and CHANGELOG.md 2026-08-20a.

- ✅ **[2026-08-20b] RE (ใบเสร็จรับเงิน) page gains its own "+ ออกใบเสร็จ" create entry point.** Direct
  follow-up: owner asked why the BI list page has no create button, pointing to how other ERPs (Odoo)
  let you pick a source document to generate a new one. Researched Odoo's actual pattern before
  building: the "create from another document" action lives on the *source* document (SO → "Create
  Invoice"; Invoice → "Register Payment"), not as a picker on the target's own create button — and this
  codebase already implements that for receipts via the per-row "ออกใบเสร็จ" button that's existed on
  every AR/IV list row since Phase 1.5. BI genuinely can't fit the pattern (always issued together with
  its AR/IV, never standalone), but the RE page itself had no matching entry point, so added a
  "+ ออกใบเสร็จ" button there that opens a search-and-pick dialog over unpaid AR/IV invoices, reusing
  the existing `issueArReceipt()` flow — no backend changes. `tsc`/`lint`/`build`/accounting tests all
  pass clean. See CHANGELOG.md 2026-08-20b.

- ✅ **[2026-08-18] Accounting/Stock i18n gap closed.** Owner-reported: switching to English left the
  entire Accounting section on-screen in Thai (sidebar nav translated, page content didn't — the
  module was simply never wired to `useI18n()`/`t()` when built). Fixed across all 8 on-screen
  Accounting/Stock files (~261 new key pairs, 1,431 → 1,692 total); the two print-only components
  stay Thai-only, same convention as `PrintDocument.tsx`. One real bug caught only via live browser
  testing (not `tsc`/lint/build/test): a heading built by concatenating two translated fragments
  rendered "Stock Adjustment HistoryRecent" in English (fine in Thai, which compounds with no space) —
  fixed with a single full-phrase key instead. `tsc`/`lint`/`build`/`test` (207/207) clean, extensive
  live verification across every affected page incl. an RBAC-boundary check. See
  [CHANGELOG.md](./CHANGELOG.md) 2026-08-18p.

- ✅ **[2026-08-18] Manual Tax Invoice creation (AR/IV).** Direct request for a "+ create" button
  matching Quotation's own style, applied to Accounting — clarified scope first (every doc type vs.
  AR/IV only) since BI/RE always reference a principal invoice and can't stand alone; confirmed
  AR/IV only. New `POST /api/ar-documents/manual` issues a freestanding principal doc (no Scope of
  Work) plus a companion BI, gated on `ar:create` **and** `ar:issue` together (the first all-of
  permission check in `arHandler.ts`). Real bug found and fixed while building: issuing a receipt
  against any manually-created document would have crashed (`toObjectId("")` on an empty
  `milestoneId`) — caught during this feature's own live verification. `tsc`/`lint`/`build`/`test`
  (207/207) all pass clean, plus a full live browser session with a disposable
  `accounting_user`-role test account. See [MODULES/Accounting.md](./MODULES/Accounting.md) "Manual
  Tax Invoice Creation" and CHANGELOG.md 2026-08-18n.

- ✅ **[2026-08-18] Product Stock module + Accounting IV stock-cutting.** Direct follow-up request
  for stock deduction: a lightweight, shared `Product.stockQty` + append-only `stock_movements`
  ledger (`applyStockMovement()`, atomic conditional-filter deduction — no negative stock, no
  transaction needed), a standalone "สต๊อกสินค้า" page, and a dual-pane `ArStockPanel.tsx` on the Tax
  Invoice (IV) list for manually cutting stock per line (no auto-mapping — no `productId` link exists
  anywhere in the Quotation → AR/IV chain). Not a full Inventory module (no POs, no
  warehouse/location tracking). Two new `stock:view`/`stock:adjust` permissions, granted to
  administrator/accounting_user (+ `stock:view` to viewer) via the same `RBAC_MIGRATIONS` mechanism
  as every prior permission addition. **Notable process footnote**: the first build pass was done by
  a subagent given an explicit research-only mandate that it exceeded on its own initiative — it
  designed, built, and live-tested the whole feature unsupervised. Caught and reviewed by hand
  (not trusting the subagent's own summary) before anything was treated as done; one real bug found
  and fixed in the process (`GET /api/products`/`GET /api/categories` rejected `stock:view`-only
  roles — fixed via a new `requireOneOfPermissions()` helper). `tsc`/`lint`/`build`/`test` (207/207) all
  pass clean, plus a full live browser session with a disposable `accounting_user`-role test account.
  See [MODULES/Product.md](./MODULES/Product.md) "Stock", [MODULES/Accounting.md](./MODULES/Accounting.md)
  "Stock", and CHANGELOG.md 2026-08-18m.

- ✅ **[2026-08-18] Accounting Dashboard.** Direct request for a dedicated, detailed Accounting
  detail view separate from the main cross-module Dashboard. New "แดชบอร์ดบัญชี" sidebar page +
  `GET /api/ar-dashboard`: KPI cards (issued AR+IV/VAT/outstanding/deposit-not-billed jobs/
  cancelled), a rolling-12-month AR+IV trend chart, a doc-type breakdown donut, an AR aging chart +
  detail table, a milestone billing-status funnel, and a top-customers table. Deliberately splits
  "period-filtered" (issued totals/VAT/breakdown/top-customer sales) from "always current-state"
  (outstanding/aging/funnel/deposit count) sections, surfaced explicitly in the UI per "Filter
  Honesty." No new permission (reuses `ar:view`). `tsc`/`lint`/`build`/`test` (198/198) all pass
  clean, plus a live browser session confirming every number against real test data. See
  [MODULES/Accounting.md](./MODULES/Accounting.md) and CHANGELOG.md 2026-08-18f.

- ✅ **[2026-08-17 + 2026-08-18] Accounting (Accounts Receivable / Milestone Billing) — Phase 1 +
  Phase 1.5.** The first genuinely new module of the long-term charter's "Accounting" bucket.
  **Phase 1 (2026-08-17)**: `ar_milestones`/`ar_documents`/`ar_attachment_files` collections, atomic
  Buddhist-year `{PREFIX}{YY}{MM}{SEQ}` document numbering matching the company's real "Express"
  accounting software, per-milestone checklist + evidence attachments, job-centric issuing (AR or IV
  + companion BI in one action, amounts reproduced to the satang against 2 real customer billing
  sets), basic cancel, 4 `ar:*` permissions + a seeded `accounting_user` role, and a Scope of Work
  Rewrite guard once billing exists — live-verified end-to-end (real AR6908002/BI6908002 issued via
  the actual UI). **Phase 1.5 (2026-08-18, from the owner's follow-up that unpaused the UI
  restructure)**: each document type is now its own sidebar page ("1 ใบคือ 1 หน้า" — AR/BI/RE/IV via
  one shared `ArDocumentListPage.tsx`), a new **RE (ใบเสร็จรับเงิน)** document type issued once per
  paid tax invoice (closes its milestone; cancel reopens it), a deposit-billed alert on the
  job-billing list + detail, and a monthly "สรุปเอกสารประจำเดือน" page for VAT-filing checks.
  Self-authored implementation prompt (per `ERP_CLAUDE_PROMPT_ENGINEERING_GUIDE.md`) recorded at
  [PROMPTS/ACCOUNTING_DOCUMENT_PAGES_PROMPT.md](./PROMPTS/ACCOUNTING_DOCUMENT_PAGES_PROMPT.md).
  `tsc`/`lint`/`build`/`test` (198/198) all pass clean, and the whole Phase 1.5 surface (plus the
  pending Phase-1 >2-installments guard) was **live-verified the same day** in a real browser
  session against the local dev stack — one owner-reported print-bleed bug found and fixed during
  that pass (see CHANGELOG.md 2026-08-18b). Also same day: a **data-only NCR form print mode**
  (print onto the pre-purchased carbonless forms — per-machine mm calibration settings + crosshair
  test page; first-draft coordinates from the owner's photos of the real forms, physical
  calibration still pending — CHANGELOG.md 2026-08-18c). See
  [MODULES/Accounting.md](./MODULES/Accounting.md).
- ❌ **[2026-08-20] Work Handover Note module removed — confirmed redundant with Delivery Order.**
  Direct confirmation from two people on the business side: the document this module built
  (ใบส่งมอบงาน) is the same document the pre-existing **Delivery Order** module (FM-SL-05) already
  produces, not a distinct 4th Project-module document type. Removed cleanly: `src/lib/workHandover.ts`,
  `api/_lib/workHandoverHandler.ts` + its mount point, `src/pages/workHandover/`, the entry-point
  button on `ProjectDocument.tsx`, all 7 `workHandover:*` RBAC permissions, all i18n keys, the guided
  tour, and `tests/api/workHandover.test.ts` are all gone; the `work_handover_notes` MongoDB
  collection is left alone (empty/unused, no destructive DB cleanup). **One real gap surfaced by
  this review, worth tracking**: Delivery Order's print document only ever prints a blank signature
  line for wet-ink signing — unlike Work Handover Note, it does not capture/embed a real digital
  customer signature via `SignaturePad`. Not addressed as part of this removal; revisit if digital
  signature capture on delivery documents becomes a real requirement. See CHANGELOG.md, TODO.md, and
  [MODULES/Project.md](./MODULES/Project.md) "Work Handover Note — removed 2026-08-20".

- 🟡 **[2026-08-19, removed 2026-08-20 — see entry above] Work Handover Note (ใบส่งมอบงาน) — the 4th
  Project-module document type, first-draft/unverified.** Direct instruction to build the previously-deferred document Accounting's
  milestone-billing gate is waiting on (see `docs/MODULES/Accounting.md`). ⚠️ **Unlike Material
  Requisition/Job Order/Purchase Request, no reference PDF exists for this document** — the structure
  (customer/site/work-completed-date header, free-typed work-delivered lines, preparer + customer
  signature blocks via the existing `SignaturePad` component) is inferred purely from the document's
  known *purpose*, not transcribed from a real paper form; `documentCode` is deliberately left `null`
  (never invented) pending the real form. Signing (`isSigned`/`signedAt`) — not a Draft/Final
  "finalize" lock — is the meaningful state transition, matching customer acceptance rather than
  internal approval; a new `workHandover:sign` permission replaces the `:finalize` every other
  Project-module document has. **Deliberately does NOT auto-update any Scope of Work billing status**
  — the Accounting module doesn't exist yet, so this stays a manual signal a human checks. Full stack:
  `src/lib/workHandover.ts`, `api/_lib/workHandoverHandler.ts` (mounted from `api/handlers/quotes.ts`,
  same 12-function-slot sharing as the other 3), new `work_handover_notes` collection, 7 new
  `workHandover:*` permissions (Administrator/Super Admin only by default, same precedent as the rest
  of the module), standalone `src/pages/workHandover/` page + list + document + print, entry point via
  a "Create/Open Work Handover Note" button on `ProjectDocument.tsx`, full i18n from the start
  (40 new key pairs), and a `useModuleTour()` guided tour. 8 new integration tests
  (`tests/api/workHandover.test.ts`) covering the no-invented-documentCode guarantee, the
  sign-requires-signature gate, the edit-locked-after-sign rule, and that multiple notes can exist per
  Project. `tsc` (both configs)/`lint`/`build`/`test` all pass clean (219/219, up from 211). See
  [MODULES/Project.md](./MODULES/Project.md) "Work Handover Note (first draft, unverified)",
  CHANGELOG.md. **Marked 🟡, not ✅** — the structure genuinely needs verification against the real
  paper form once available, and has not had a live-browser walkthrough this session.

- ✅ **[2026-08-18] Project module Stage 6: live browser verification, 3 real bugs found and fixed.**
  Actually clicked through creating/viewing all 4 document types in a real browser, Thai and English.
  Found and fixed: (1) every quotation save/duplicate/rewrite/print/workflow-action was silently
  broken app-wide — `Quote.id` always contains a literal `#`, stripped by browsers as a URL fragment
  before every id-taking `fetch()` call ever reached the network; fixed across all 18 affected
  `src/lib/*.ts` files plus the shared server-side `getPathSegments()` decoder. (2) Material
  Requisition/Job Order/Purchase Request were all permanently unsavable after creation — a
  full-ISO-timestamp field seeded at creation always failed its own `YYYY-MM-DD`-only validator on
  save; fixed in all 3 handlers. (3) a free-typed line description could silently clip mid-word in
  English mode; fixed with a minimum column width. Also found and documented (not fixed — belongs to
  the Scope of Work module): `ScopeOfWorkItem.id` regenerates on every quotation refresh, so
  Project's own item-link-preservation promise rarely holds in practice. 7 new regression tests
  (`tests/api/pathSegments.test.ts` + 3 in `projectAtomicity.test.ts`). `tsc`/`lint`/`build`/`test`
  all pass clean (211/211, up from 204). See [MODULES/Project.md](./MODULES/Project.md), CHANGELOG.md.

- ✅ **[2026-08-18] Project module Stage 5: Job Order + Purchase Request frontend, plus a full i18n
  retrofit of the whole module.** Job Order (FM-PJ-01) and Purchase Request (FMPU05) gained full
  CRUD wrappers + standalone sidebar pages (backend already existed from Stage 3), and Project +
  Material Requisition — shipped Thai-hardcoded in Stage 4 — were retrofitted onto the app's real
  `useI18n()`/`t()` system alongside them (232 new th+en key pairs, verified for full key parity via
  a dedicated script, not just tsc's key-existence check). All 4 print documents and the seeded
  catalog/checklist content deliberately stay fixed-Thai, matching confirmed precedent from Scope of
  Work/Delivery Order. All 4 document types (Project, Material Requisition, Job Order, Purchase
  Request) are now frontend-complete. `tsc`/`lint`/`build`/`test` (204/204, up from 197) all pass
  clean; no live-browser English-mode walkthrough was possible this session (standing sandboxed
  limitation). See [MODULES/Project.md](./MODULES/Project.md), CHANGELOG.md.

- ✅ **[2026-08-14] Departments (manageable) + Sales Teams + tiered visibility (own/team/department/
  all).** Direct business request: Sales has 2 teams, each with its own team lead who should only
  see their own team's records. Wired up the previously schema-only `departments` MongoDB
  collection (real admin CRUD page, `departments:manage` permission) and added a new `teams`
  collection (sub-grouping within a department, `teams:manage`) — `src/pages/admin/
  DepartmentManagementPage.tsx`. Extended Quotations/Scope of Work/Delivery Order's existing binary
  `view`/`viewAll` model with 6 new `{module}:viewTeam`/`{module}:viewDepartment` permissions and a
  shared `buildOwnershipClause()`/`resolveVisibilityScope()` cascade (`api/_lib/visibility.ts`, new
  file), also wired into the Dashboard's own-data scoping (`ownDataOnly` joined by a new
  `visibilityScope` field). User Management's department `<select>` now sources from this real
  collection instead of a hardcoded constant; a new team `<select>` sets `User.teamId`. No new
  default role — a Super Admin creates the actual team-lead roles via existing Role Management once
  deployed (flagged in TODO.md, same manual-step pattern every prior permission-adding pass has
  needed). New `tests/api/visibility.test.ts` (in-memory MongoDB, 14 tests: the 4-tier cascade's
  actual query results, team-vs-department priority, per-module isolation, no-team fallback). See
  [MODULES/Department.md](./MODULES/Department.md), [RBAC.md](./RBAC.md) "Departments + Teams +
  Tiered Visibility". `tsc`/`lint`/`build`/`test` (166/166, up from 152) all pass clean. See
  CHANGELOG.md.

- ✅ **[2026-08-14] Dashboard VAT toggle + Service summary card + browser-side image compression
  across every upload site.** Three features. (1) The 2026-07-14 "always pre-tax" Dashboard rule
  became a user-selectable pre-tax/post-tax toggle (`?vat=pre|post` on `GET /api/dashboard`, a new
  shared `Toggle.tsx` component, coverage extended to the CSV/Excel exports) — still a single
  global 7% `VAT_RATE`, never per-company. (2) Service — previously the only document module with
  zero Dashboard presence — gained a `serviceSummary` card (Total/Draft/Completed/Cancelled/
  This-Month), same own-data-only-scoped, unfiltered-by-date pattern as the existing Scope of
  Work/Delivery Order cards. (3) New shared `src/lib/imageCompression.ts` (WebP re-encode via
  Canvas API, no new npm dependency) applied at all 4 image-upload sites: profile/logo/stamp
  (`ImageUploadField.tsx`), signature upload mode + a PNG→WebP switch in `SignaturePad.tsx`'s draw
  mode, Service checklist Abnormal-item photos (`serviceReports.ts`), and Scope of Work's one
  mixed-file-type attachment site (only compresses when the file is an image). See
  [MODULES/Dashboard.md](./MODULES/Dashboard.md) "VAT Toggle", [MODULES/Service.md](./MODULES/Service.md)
  "Dashboard visibility"/"Photos", [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Attachments",
  and [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Client-Side Image Compression". `tsc`/`lint`/`build`/
  `test` (152/152) all pass clean. See CHANGELOG.md.

- ✅ **[2026-08-13] Signature capture: Settings gets draw-or-upload; Service customer sign-off stays draw-only.**
  Direct user request — Settings → Profile's "Personal Signature" was upload-only while the
  Service module's customer sign-off was draw-only; the user wanted `src/components/
  SignaturePad.tsx` extended with a Draw/Upload segmented toggle rather than building a second
  component (upload mode reuses `ImageUploadField.tsx`'s file-type/1MB validation inline). A new
  `requireName` prop (default `true`) hides the signer-name input for Settings' reuse, where the
  signer is always the logged-in user. First pass gave both Settings and Service the toggle since
  both share the component; the user then clarified only Settings should offer Upload — a
  customer signing a report must draw, not attach an image file — so a second `allowUpload` prop
  (default `true`) now gates whether the toggle renders at all, and `ServiceReportEditor.tsx` /
  `CustomerApprovalPage.tsx` both pass `allowUpload={false}`. `SettingsPage.tsx`'s signature field
  renders `SignaturePad` (both props at their defaults) instead of `ImageUploadField`. Verified
  in-browser both before and after the correction (draw + save + reload-persist + upload-mode
  confirm in Settings; confirmed Service's sign-off card shows no toggle after the fix);
  `tsc`/`lint`/`build`/`test` (152/152) all pass clean. See CHANGELOG.md.

- ✅ **[2026-08-10] Service Report customer approval via time-boxed link + LINE OA.** "ส่งให้ลูกค้า
  อนุมัติ" mints a 7-day capability link; the customer reviews/signs/approves (or rejects with a
  required reason) on the session-free `/approve` page from their phone; paired customers get the
  link pushed into LINE automatically (one-time `TCS-XXXXX` pairing code + signed webhook,
  Express-only). Approve writes the existing on-site sign-off fields, so the printed report shows
  the signature either way. 6 new integration tests (`tests/api/serviceApproval.test.ts`).
  **Owner setup + live LINE round-trip still pending** — see TODO.md High Priority.

- ✅ **[2026-08-07] Document-recipient delivery is in-app-notification-only — email sending removed
  entirely (supersedes the same-day Gmail entry below).** Direct user request
  ("ตัดการส่งอีเมลออกไปเลยเหลือไว้แค่ส่งในระบบพอ") after the per-user Gmail App Password setup
  proved too hard for staff. The send button ("ส่งแจ้งเตือนผู้รับเอกสาร") now only writes bell
  notifications + the audit entry and makes the record visible to recipients. Deleted:
  `api/_lib/email.ts`, `api/_lib/emailCredentials.ts`, `EMAIL_CRED_SECRET`, the Settings App
  Password card, `POST /api/users/:id/email-test`, `hasEmailAppPassword`, email threading, the
  nodemailer dependency. "ผู้รับเพิ่มเติม" any-user recipients kept. Manual ch.6 rewritten. See
  CHANGELOG.md 2026-08-07.
- ✅ **[2026-08-07, superseded the same day — see the entry above] Scope of Work email is person-to-person from each sender's own Gmail (Resend
  removed) + "ผู้รับเพิ่มเติม" any-user recipients.** Direct user request: "ใครส่งให้คนไหนก็คือใช้
  อีเมลของคนนั้น" — the "ส่งอีเมลแจ้งผู้รับเอกสาร" email now goes out from the clicking user's OWN
  Gmail (nodemailer + Gmail SMTP; per-user App Passwords stored AES-256-GCM-encrypted in
  `users.emailAppPasswordEnc`, keyed by the new `EMAIL_CRED_SECRET` env var; self-service setup +
  test-send in ตั้งค่า → ความปลอดภัย, strictly self-only even for admins), so recipients can reply
  to the sender directly. Recipients are no longer department-limited: a new checklist-independent
  "ผู้รับเพิ่มเติม" (`additional`) key lets any employee be picked (searchable box in the picker),
  and the recipient-visibility filters (list/search/dashboard) were extended so those recipients
  can find the record. Resend (`RESEND_API_KEY`/`EMAIL_FROM`, incl. the pending sender-domain
  verification task) is gone entirely. 21 new tests (105 total). **Real SMTP delivery not yet
  live-verified** (no Gmail credential exists in the sandbox — nodemailer mocked in tests; tracked
  in TODO.md). See CHANGELOG.md 2026-08-07.
- ✅ **[2026-08-07] Page tours mark "seen" on automatic appearance, not on dismissal.** A user who
  let the tour sit and navigated away produced no completion event (the unmount path suppresses
  one), so it auto-played again. `useModuleTour`'s auto-fire now marks the moment the tour renders;
  `start()` returns a boolean so a tour whose anchors aren't in the DOM is never marked unseen-but-
  suppressed. The manual replay now writes nothing at all — a real behaviour change, since it
  previously marked on dismissal and could cost a user their automatic first play.
  `useDriverTour`'s dismissal tracking and the main first-login tour are untouched.
- ✅ **[2026-08-07] Fixed: guided tours re-auto-played on every visit (StrictMode ref latch).**
  Reported as a Service regression; actually a one-line effect lifecycle fault in `useDriverTour`
  affecting **every page tour since 2026-07-29**, and **only in development builds** (React
  StrictMode's mount→cleanup→mount double-invoke is dev-only, so production was never affected).
  `unmountingRef` was set `true` on cleanup and never reset on setup, so it latched after
  StrictMode's simulated unmount — `onFinish` never fired, `markPageTourCompleted()` never wrote,
  and the auto-start effect re-armed on every mount. The storage layer, the `autoStart` gating, and
  the localStorage write were all checked and cleared. +7 tests (142 total) pinning the storage half.
  The regression itself remains uncovered — no DOM test environment exists; recorded in TODO.md.
- ✅ **[2026-08-07] Guided-tour audit + the Service module's missing tours.** Investigated a user
  report of a help icon that "disappeared". Both suspected causes were clean: the main tour's replay
  lives permanently in the user menu, and `hasPageTourCompleted()` gates only the auto-fire, never
  any render path (verified across all 11 pages). The real gap was that the **Service module had no
  tour at all** — built after the tour system, and `docs/CLAUDE.md` wrongly described
  `TourReplayButton` as living inside `GuidedTour.tsx`, so its author found no such export. Added
  tours + always-visible replay buttons to ServiceList, ServiceReportEditor, and
  ServiceTemplateManagement (+32 i18n keys), and corrected the doc entry that caused the omission.
- ✅ **[2026-08-07] Reverted: Dashboard is visible again in the Service Engineer's sidebar.** The
  "engineers see only บริการ" requirement rested on unclear internal communication. One line —
  `ROLE_HIDDEN_NAV_KEYS.service_engineer` drops `"dashboard"`, keeps `"customers"` — reverts the
  sidebar item, the Global Search shortcut, and the landing page together. No RBAC change either
  way, since the original was visibility-only and `dashboard:view` was never revoked. The role lands
  on the Dashboard at sign-in again, following automatically from `homeNav`.
- ✅ **[2026-08-07] Service Engineer's sidebar trimmed (Customers only, after the Dashboard revert above).** Visibility
  change, **not** a permission removal — `customers:view` stays granted because the Service Report
  editor's `CustomerSelector` needs it. `ROLE_HIDDEN_NAV_KEYS` + `isNavHiddenForRole()`
  (`src/lib/roles.ts`), applied in the sidebar, the landing page, and Global Search's page results.
  The landing-page part mattered: `activeNav` defaulted to `"dashboard"` and the role still holds
  `dashboard:view`, so hiding the nav item alone would have left it signing in onto a page with no
  way back. Scoped to the one role by key, per the owner's call. +6 tests (135 total), including a
  guard that the underlying grants are still held.
- ✅ **[2026-08-07] Rename a checklist item/heading in place while filling out a Service Report.**
  Per-report customization could add and remove but not reword, so fixing wording meant delete +
  re-add — which minted a new key and discarded that item's recorded status/detail/photos. New
  shared `src/components/InlineEditableLabel.tsx`: double-click (mouse) / tap (touch) / Enter-Space
  (keyboard), commit on Enter or blur, Escape cancels, blank reverts. No visible icon by request, so
  the trigger is a real focusable button with an `aria-label` and the gesture is stated once above
  the checklist. **No server change was needed** — `sanitizeServiceTemplateSections()` already keyed
  off `key` and took labels from the payload. A rename keeps the key, so recorded values survive
  untouched. +6 tests (129 total).
- ✅ **[2026-08-07] Service Report customer signature capture (on-site).** First item off the
  Service module's Phase 2 roadmap. New `src/components/SignaturePad.tsx` — canvas capture on
  pointer events (one code path for mouse/finger/stylus), `touch-action: none`, devicePixelRatio
  scaling, and a locked preview after confirm so an accidental swipe can't alter a signature already
  given. Three new `service_reports` fields wired through the existing `PATCH` route with the shared
  `validateImageDataUrl()`; **`customerSignedAt` is server-stamped, never client-supplied**, and
  re-stamped only when the image itself changes. Signing neither gates nor is gated by completion —
  a customer often isn't on site. The printed report's customer column now mirrors the engineer
  column. +8 tests (123 total). Remote signing via LINE remains a later phase, with a deliberately
  inert placeholder button in the UI.
- ✅ **[2026-08-07] Fixed: uploading a checklist photo reverted every unsaved Service Report edit.**
  User-reported. The photo routes return the whole report, and the editor applied it through the
  same helper the Save path uses — so the server's last-saved item statuses overwrote everything
  changed since the last Save (an item just marked Abnormal snapping back to Normal as its upload
  finished; the photo itself always attached fine). Now `mergeServerPhotosIntoChecklist()`
  (`src/lib/serviceReports.ts`) copies back photo metadata only, matching the server's own rule that
  photos change solely through the dedicated routes. `templateSnapshot.sections` is left alone too,
  or unsaved locally-added groups/items would vanish the same way. No API change — the response
  already carried the new photo. +6 tests (115 total), leading with the reported scenario verbatim.
- ✅ **[2026-08-07] Permission dependencies — a declared, enforced guard against half-granted
  permission sets.** Generalizes a finding from the pass below: `serviceTemplates:view` isn't a
  sensible companion to the Service grants, it's *required* (the report editor's boot fetch calls
  `fetchServiceTemplates()` for viewing as much as creating, so a role without it gets a dead screen,
  not a missing button). `PERMISSION_DEPENDENCIES` + `withPermissionDependencies()`
  (`src/lib/permissions.ts`) declare the coupling; `sanitizeRolePermissions()` (`src/lib/roles.ts`)
  is shared by `POST`/`PATCH /api/roles` and the Role Management matrix so the server and UI can't
  drift. The matrix ticks dependencies as you tick the parent and **pins** them (disabled + lock +
  a title naming what requires them) while anything still needs them — otherwise an admin could
  untick, save, and have the server silently put it back. The map is deliberately narrow: only
  hard-failing boot fetches, not merely-unreachable buttons. +14 tests (109 total), incl. 6 that
  create real custom roles through the API — the gap a defaultRoles-only assertion left open.
- ✅ **[2026-08-07] Service Engineer role + automatic RBAC catch-up for provisioned databases.**
  Closed the ⚠️ ACTION REQUIRED item the Service module opened, and with it a pattern every module
  since Scope of Work had inherited: because `seedDefaultRolesIfEmpty()` only fires on an *empty*
  `roles` collection, each new permission set needed a Super Admin to hand-click it into production
  via Role Management. Now `bootstrapRbac()` (`api/_lib/rbacSeed.ts`, called from `GET /api/roles`
  and the Setup Wizard) inserts any later-added default role (`syncDefaultRoles()`, additive only —
  existing roles are never rewritten) and applies **once-only, recorded** permission backfills
  (`RBAC_MIGRATIONS` → the new `rbac_migrations` collection), so a permission an admin deliberately
  revokes stays revoked — the failure mode a naive re-sync-on-boot would have introduced. Ships
  with the 7th default role, **Service Engineer** (own reports only:
  `service:view/create/edit/complete/print` + `serviceTemplates:view` + `customers:view` +
  `dashboard:view`) — before this, only Super Admin/Administrator could create a Service Report, so
  real field use was blocked. +11 tests (95 total), incl. a 9-test in-memory-MongoDB suite that
  reproduces the actual production scenario. `tsc` (both configs)/`lint`/`build`/`test` clean.
  Still a human call: which employees get the role. See CHANGELOG.md 2026-08-07 and
  [RBAC.md](./RBAC.md) "Rollout".
- ✅ **[2026-08-06] Docker stack (same session as the Express migration).** `docker compose up -d
  --build` runs the whole system self-contained: the app image (committed `Dockerfile`), its own
  MongoDB (named volume, fresh-DB Setup Wizard path), and nginx HTTPS termination (committed
  `nginx/` config; certs folder mounted read-only and self-git-ignored). The compose file itself
  is **deliberately untracked** per owner request — reference copy in
  [DEPLOYMENT.md](./DEPLOYMENT.md) "Docker". Verified with a real boot on the dev machine. Also
  fixed `.gitignore` swallowing `.env.example`. Same-day follow-up: **MongoDB authentication** —
  root user from `.env` (`MONGO_USER`/`MONGO_PASS`), app URI carries the credentials, verified
  unauth-blocked + auth-ok on a fresh volume; cert filenames standardized to the owner's
  `huma-erp.com.pem`/`.key` naming. Second same-day follow-up (server prep): nginx config is now
  **baked into a custom image** (`nginx/Dockerfile` COPYs `nginx/nginx.conf`; compose uses
  `build: ./nginx`) — only the certs folder remains a volume mount, and `nginx/.dockerignore`
  keeps keys out of the build context.
- ✅ **[2026-08-06] Standalone Express server — the app now runs without Vercel.** On the owner's
  explicit go-ahead, all 3 steps of [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md)'s plan
  were executed: `server/` (Express `createApp()` mounting the **unchanged** `api/` handlers via a
  routing table replicating `vercel.json`'s rewrites, 25 MB JSON limit, static `dist/` + SPA
  fallback), `.env.example`, and [DEPLOYMENT.md](./DEPLOYMENT.md) (PM2/systemd, nginx/Caddy +
  HTTPS, backups). `npm run dev` now runs the full stack locally (Express API :3001 + Vite :3000
  with `/api` proxy — first time ever without `vercel dev`); new `npm start` is the production
  process. +7 real-HTTP integration tests (`tests/api/expressServer.test.ts`, 84 total).
  `tsc`/`lint`/`build`/`test` clean + live boot smoke-tested. The Vercel demo keeps deploying
  unchanged; decommissioning it is [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) step H
  at cutover time.
- ✅ **[2026-08-06] New Service module (Phase 1) + same-day photo attachments and print.**
  Brand-new field-service checklist + report module ("บริการ"), created directly against a Customer
  (not derived from a Quotation, unlike every other document type). Explicitly phased with the
  owner's agreement given the full target spec's size (30+ criteria incl. mobile UX, signature
  capture, LINE OA) — Phase 1 shipped: data model, two checklist templates seeded from real
  reference files (`public/รายการตรวจเช็ค.pdf`, `public/Service.xlsx`), atomic `SR-{year}-{seq}`
  numbering, a desktop-first editor, RBAC (own standalone "บริการ" permission group), navigation.
  The same day, per direct follow-up request via `/impeccable design`, two Phase 2/3 items were
  pulled forward: photo attachments required on Abnormal checklist items (Binary-in-Mongo +
  capability-URL, same pattern as Scope of Work's attachments) and a printable A4-portrait report
  (browser-native print CSS — no PDF library exists in this app). A real invalid-`<tbody>`-nesting
  bug and a checklist-error-highlighting UX gap were both found and fixed during this pass.
  `tsc`/`lint`/`build`/`test` (70/70) all clean; **verified live twice** via `vercel dev` + a real
  browser session (nav/permissions/template seeding/report creation/snapshot-freeze/validation/
  audit-log after Phase 1; real file-input photo upload + native print-dialog invocation after the
  pull-forward). Remaining phases (signature capture, mobile/iPad UX, customer acceptance, LINE OA)
  are not yet built — see [MODULES/Service.md](./MODULES/Service.md) roadmap. No seeded role except
  Super Admin/Administrator can create a report yet — a manual Role Management grant is needed on
  an already-provisioned deployment, same standing requirement every prior module has had. See
  CHANGELOG.md and SESSION_LOG.md for the full writeup.
- ✅ **[2026-08-04] Website/Facebook/Line added to Company Settings + all 3 print letterheads.**
  Direct user question, prompted by comparing the printed Quotation header against the company's real
  letterhead graphic — investigation found `website` was hardcoded blank everywhere (no Settings field
  fed it despite the type having a slot), Facebook/Line had no field at all, and **Scope of Work's
  print view had no company letterhead whatsoever**. Delivery Order separately had these 3 fields
  fully hardcoded, disconnected from Settings. Added `website`/`facebookName`/`lineId` to `Company` +
  3 new Settings inputs; new shared `components/PrintSocialIcons.tsx` (de-duplicated from Delivery
  Order); wired into Quotation's and (newly-built) Scope of Work's letterheads, and swapped into
  Delivery Order's in place of its hardcoded equivalents (name/address/tel/email deliberately stay
  hardcoded — different shape than Settings provides). Scope of Work required threading a new
  `company` prop through both its entry points for the first time. `tsc`/`lint`/`build`/`test`
  (56/56) all clean; **not yet verified live** — flagged as priority follow-up, especially for Scope
  of Work's brand-new letterhead section. See CHANGELOG.md, [MODULES/Settings.md](./MODULES/Settings.md),
  and each document's own MODULES page.
- ✅ **[2026-08-04] Scope of Work print: same browser date/URL header-footer fix.** Follow-up in the
  same session, user-requested check of whether Scope of Work/Delivery Order had the same issue as
  the Quotation fix below. Delivery Order already didn't (fixed 2026-07-24). Scope of Work's print
  view shares Quotation's exact flowing-table shape, so the identical `@page { margin: 0 }` +
  `12mm`-padding-compensation fix was applied there too, and its own stale print-hint tooltip/i18n
  keys removed. `tsc`/`lint`/`build`/`test` (56/56) all clean; not yet verified live (same gap as
  below). See CHANGELOG.md and [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).
- ✅ **[2026-08-04] Quotation print: browser date/URL header-footer suppressed.** Direct user report
  with a screenshot. Previously (2026-07-16) confirmed to be the browser's own uncontrollable
  "Headers and footers" print option, worked around only with a tooltip. Delivery Order's 2026-07-24
  `@page { margin: 0 }` trick genuinely suppresses it, but was withheld from Quotation at the time
  because its `PrintDocument.tsx` is one flowing multi-page `<table>` where zero margin costs
  continuation pages their top/bottom inset. Surfaced that trade-off via `AskUserQuestion` instead of
  deciding it silently; user chose zero-margin + compensating padding. Implemented: component-scoped
  `@page { margin: 0 }` plus `12mm` compensating padding (table left/right, `<thead>` letterhead top —
  both repeat every printed page — and the final signature row's bottom, covering the last page).
  Removed the now-stale print-hint tooltip/i18n keys. `tsc`/`lint`/`build`/`test` (56/56) all pass
  clean; **not yet verified live** (no test credentials available this session) — flagged as a
  priority follow-up given this is a visual print-layout change. See CHANGELOG.md and
  [UI_GUIDELINES.md](./UI_GUIDELINES.md)/[MODULES/Quotation.md](./MODULES/Quotation.md).
- ✅ **[2026-08-04] Revision Note becomes an accumulating R1/R2/... history (Quotation + Scope of
  Work).** Direct user request: the 2026-07-23 auto-generated Revision Note used to overwrite the
  note with only the current revision's diff against its immediate predecessor, losing what earlier
  revisions had recorded once you moved past them. New `appendRevisionNoteEntry()` in
  `src/lib/revisionDiff.ts` prefixes each generated diff with `R{n} - ` and appends it onto the
  predecessor's own `revisionNote` instead of replacing it, so the field reads as a running `R1 -
  ...`, `R2 - ...`, ... log across the whole rewrite chain every time the auto-summary button is
  pressed. Same field/UI, still one-shot/manually-editable. `tsc`/`lint`/`build`/`test` (56/56) all
  pass clean; not yet verified live via `vercel dev`. See CHANGELOG.md and
  [MODULES/Quotation.md](./MODULES/Quotation.md)/[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md)
  "Revision Note".
- ✅ **[2026-07-30] Authentication UI accessibility hardening pass.** An `/impeccable audit` of
  `SignInPage.tsx`/`AuthLayout.tsx`/`App.tsx`'s session-check presentation — the single page every
  user passes through before reaching anything else, and another module never touched by any earlier
  accessibility pass this session — found and fixed: both login fields lacked `htmlFor`/`id` label
  association; the password show/hide toggle had zero accessible name at all (not even `title`);
  the session-loading screen (`BootLoading`) was a silently-pulsing logo with no text/ARIA signal;
  the login-failure error message had no `role="alert"`; `AuthLayout.tsx` had no `<main>` landmark;
  and the heading hierarchy was backwards (a hidden-below-`lg` marketing headline was the page's only
  `<h1>`, swapped so the real "Sign In" heading now owns it). UI-files only — authentication APIs,
  credential handling, session behavior, redirects, and security controls all untouched, nothing
  weakened. Verified live via `vercel dev`: field label associations, toggle `aria-label`/
  `aria-pressed` state changes, the error's `role="alert"`, and the page's `<h1>`/`<main>` all
  confirmed via direct DOM inspection. `lint`/`build`/`test` (56/56) all clean. See CHANGELOG.md.
- ✅ **[2026-07-30] Admin module accessibility hardening pass.** An `/impeccable audit` of User
  Management, Role Management, and Audit Log — another module never touched by any earlier
  accessibility pass this session — found and fixed: the Reset Password modal (was a hand-rolled div
  with zero dialog semantics — now uses `useDialogA11y`, matching `ProductPickerModal.tsx`); the
  status/role/action pill contrast bug recurring in 3 separate places across all three pages, plus a
  4th instance as plain text (the "System" role badge, ≈2.37:1 contrast) — all darkened to the
  already-established formula (`#866d28`/`#207e52`/`#657085`); ~13 form fields across the User and
  Role create/edit forms with zero `htmlFor`/`id` label association; plus P2s — `aria-label`s on
  title-only row actions, `role="status"` on the Audit Log's loading indicator. UI-files only —
  authentication, RBAC, role definitions, permission enforcement, audit-log integrity, APIs, and
  MongoDB data all untouched, no permission weakened or changed. Verified live via `vercel dev`:
  computed pill colors, modal dialog semantics + Escape-to-close, and all field label associations
  confirmed across all three pages. `lint`/`build`/`test` (56/56) all clean. See CHANGELOG.md.
- ✅ **[2026-07-30] Quotation Template Management accessibility hardening pass.** An `/impeccable
  audit` of the complete workflow (`TemplateManagementPage.tsx`/`TemplateEditorView.tsx` — list,
  filters, create/edit, section/item editors, product selector, reorder, dialogs) found this was the
  one module never touched by any of this session's earlier accessibility passes. Fixed: the Preview
  and Duplicate modals (were hand-rolled divs with zero dialog semantics — now use `useDialogA11y`,
  matching `ProductPickerModal.tsx`); hover-only (`opacity-0`) row actions in the list; at least 9
  icon-only editor buttons (section/item reorder, delete, delete-term, remove-sub-detail) with **no
  accessible name at all**, worse than the title-only gap fixed elsewhere; zero `htmlFor`/`id` label
  association across all 6 main editor fields; plus P2s — `aria-label`s on title-only row actions,
  `role="status"`/`role="alert"` on loading/error states. UI-files only — template data, Excel-import
  content, Job Type mappings, versioning, quotation-snapshot independence, APIs, MongoDB, and RBAC
  all untouched. Verified live via `vercel dev`: both modals' dialog semantics and Escape-to-close
  confirmed by DOM inspection, all 6 field label pairs confirmed matched, and a full-page scan (111
  icon-only buttons) confirmed zero remaining unlabeled buttons anywhere. `lint`/`build`/`test`
  (56/56) all clean. See CHANGELOG.md.
- ✅ **[2026-07-30] Scope of Work full-workflow re-audit + accessibility fix pass.** A follow-up
  `/impeccable audit` of the complete Scope of Work workflow (list, quotation-selection entry point,
  create/edit, document info, checklists, items, notes, signatures, validation, approval actions,
  loading/empty/error states) found `ScopeOfWorkDocument.tsx`'s loading/error branches had no way
  back at all (P0, fixed with the same back-button toolbar proven on `DeliveryOrderDocument.tsx`);
  `ScopeOfWorkList.tsx` — untouched by the earlier same-day document-only pass — still had the
  pre-2026-07-29 status-pill contrast bug and keyboard-inaccessible rows (P1, fixed identically to
  `DeliveryOrderList.tsx`); and several P2s: `ScopeOfWorkPage.tsx` loading/error ARIA, a `role="alert"`
  on the shared `ValidationSummary` component (used across Quotation/Scope of Work/Delivery Order),
  an undersized "ยังไม่มี PO" badge bumped to match the Status Pill spec, and — a larger scope than
  Delivery Order's list-only i18n — the entire Scope of Work list *and* document translated via ~90
  new `scopeOfWork.*`/`scopeOfWorkDoc.*` i18n keys (status labels, toast messages, and checklist
  content deliberately left untranslated, matching established precedent and the "checkbox business
  rules" preservation constraint). Verified live via `vercel dev`: computed pill colors, keyboard row
  activation, the previously-dead-end loading state now showing a working back button, a delete
  dialog opened/cancelled cleanly, and full Thai/English toggling on both the list and document.
  `lint`/`build`/`test` (56/56) all clean. See CHANGELOG.md.
- ✅ **[2026-07-30] Delivery Order standalone list/page module accessibility hardening pass.**
  `/impeccable audit` of `src/pages/deliveryOrder/` (distinct from `DeliveryOrderDocument.tsx`,
  already hardened in the Quotation/Scope of Work/Delivery Order pass below) found and this pass
  fixed every P1/P2 finding, UI-files only — one-Delivery-Note-per-milestone printing, deposit
  exclusion, selected-item isolation, milestone-specific validation, APIs, MongoDB data, RBAC, and
  business logic all untouched. Fixed: `DeliveryOrderList.tsx`'s status-pill contrast (same
  pre-2026-07-29 one-hex formula, all 3 statuses failing AA); table rows not keyboard-operable at
  all (added `tabIndex`/`role="button"`/`onKeyDown`/`aria-label`); `DeliveryOrderPage.tsx`'s loading
  skeleton with zero text/ARIA signal (added `role="status" aria-live="polite"` + `sr-only` label);
  the entire module hardcoded Thai-only despite the app's live language toggle (added ~15
  `deliveryOrder.*` i18n keys, reusing `quotation.filterAll` rather than duplicating it — the 3
  status-label literals stay hardcoded, matching `DeliveryOrderDocument.tsx`'s own precedent).
  Verified live via `vercel dev`: computed pill text color, keyboard Enter-activation opening the
  detail view, the loading state's ARIA attributes, and full English-language rendering via the
  Settings language toggle. `lint`/`build`/`test` (56/56) all clean. See CHANGELOG.md.
- ✅ **[2026-07-30] Products module accessibility hardening pass.** `/impeccable audit` found and this
  pass fixed every P1/P2 finding, UI-files only: `CategoriesManager.tsx` had reintroduced the
  status-pill contrast bug a fourth time by hand-rolling its own pill instead of reusing `StatusBadge`
  (now fixed by reuse); `ProductPickerModal` (the Quotation line-item catalog picker) had zero dialog
  semantics — split into a wrapper+form so `useDialogA11y` only runs while open; `ProductForm` had
  zero label association on all 7 fields (verified fixed via `element.labels` in the live DOM) and,
  uniquely among this app's forms, no busy-guard on Save at all (added); `ProductList`'s row actions
  were hover-only invisible and its sortable column headers had zero keyboard support (both fixed,
  verified live that sorting still works via the new keyboard-focusable buttons). Verified live via
  `vercel dev` end-to-end, including opening the picker from an actual Quotation. `lint`/`build`/
  `test` (56/56) all clean. See CHANGELOG.md.
- ✅ **[2026-07-30] Customers module accessibility hardening pass.** `/impeccable audit` found and this
  pass fixed every P1/P2 finding, UI-files only: `StatusBadge.tsx`'s active/inactive/archived pills
  (contrast as low as 2.44:1, same pre-2026-07-29 formula fixed elsewhere) darkened to AA; the
  create/edit `CustomerFormModal` (zero label association, no dialog semantics) wired to the shared
  `useDialogA11y` hook with real `id`/`htmlFor` pairs on all 9 fields; the list's hover-only row
  actions and a bare `grid-cols-2` fixed to match established patterns. Verified live in-browser
  (accessibility tree, Escape-to-close, focus-visible row actions), plus `lint`/`build`/`test`
  clean. See CHANGELOG.md.
- ✅ **[2026-07-30] Quotation/Scope of Work/Delivery Order accessibility + correctness hardening pass.**
  Two `/impeccable audit` passes (Quotation editor, then the full Quotation→Scope of Work→Delivery
  Order chain) found and this pass fixed every P1/P2 finding, UI-files only — no business logic,
  calculations, RBAC, validation, workflow, numbering, or schemas touched. Fixed: status-pill
  contrast in the two documents that still had the pre-2026-07-29 one-hex formula; zero `htmlFor`/
  `id` label association across all three documents' main forms; a double-submit risk on Save and
  every Confirm/Prompt dialog (new shared `busy` prop); drag-only reordering with no keyboard path
  in two editors (new up/down buttons); `ConfirmDialog`/`PromptDialog` had no `role="dialog"`/
  Escape/focus-trap (new shared `useDialogA11y` hook); the 9 `opacity-0`-hover icon actions the
  2026-07-29 pass had already banned but not fully swept; every card/section title promoted from a
  styled `<p>` to a real heading; `Toast` gained `aria-live`; an optimistic "Saved" toast that could
  briefly lie about success; a silent blank-form fallback for a deep-linked quote the user can't
  access; a hand-rolled dialog duplicating `PromptDialog`; `DeliveryOrderDocument`'s loading/error
  states hiding the only way back; a per-keystroke `JSON.stringify` performance issue. Deferred (a
  product decision, not a mechanical fix): no URL routing below the module level. `npm run lint`/
  `build`/`test` (56/56) all clean after. See CHANGELOG.md.
- ✅ **[2026-07-29] Impeccable design-system setup + Dashboard accessibility/responsive/UX hardening pass.**
  First `/impeccable` run on this project: `init` → `PRODUCT.md` (users, positioning, and a
  standing "Permanent UI and Impeccable Rules" policy the owner dictated), `document` → `DESIGN.md`
  + `.impeccable/design.json` scanned from the existing navy/gold system. Then a full
  audit→harden→adapt→polish→typeset→critique cycle on the Dashboard: status-pill text contrast
  (as low as 2.1:1) darkened to WCAG AA 4.5:1 app-wide (`src/lib/quotes.tsx`'s `statusStyle` +
  `ApprovalDashboard.tsx`'s stat tiles); 5 unlabeled filter controls got `aria-label`s; the app's
  first `prefers-reduced-motion` rule; 6 grids that skipped straight to `xl:` (1280px) now step at
  `lg:`, closing a real gap at the 1024–1279px range common on real laptops; 4 stray font sizes
  normalized to the documented 12px floor. A dual-agent critique (independent design review +
  detector/browser evidence, isolated sub-agents) then found the Approve button committed an
  irreversible workflow transition with zero confirmation — scored 19/40, P0 — fixed with a
  `ConfirmDialog` (naming quote ID + client, rendered via `createPortal` since a `<tr>` can't
  directly host it) and toast messages that now name the quotation ID. See CHANGELOG.md and the
  persisted critique at `.impeccable/critique/`.
- ✅ **[2026-07-29] "ทวงเลข PO" is now its own grantable permission (`scopeOfWork:chasePo`).**
  Owner request the same day the feature shipped: the chase button/route no longer piggybacks on
  `scopeOfWork:view` — it requires an explicit Role Management grant (defaults: Administrator +
  both Approver levels; Sales User/Viewer deliberately excluded). ⚠️ Joins the pending manual
  production grant batch (now 4 sets — see [TODO.md](./TODO.md)); until ticked, only Super Admin
  can chase. Tests extended to 56. What's New entry added. See [RBAC.md](./RBAC.md), CHANGELOG.md.
- ✅ **[2026-07-29] Refresh keeps the current page (URL-hash persistence).** Direct user request —
  `activeNav` now mirrors into `location.hash` (`#quotations`, ...), read back on load and
  `hashchange`: refresh stays on the same page, browser Back/Forward navigate between pages,
  page-level URLs are shareable. Deliberately page-level only ("level 2" — restoring the open
  document — tracked in [TODO.md](./TODO.md)); permission gating unchanged. What's New entry
  added. `tsc`/`lint`/`test`/`build` clean; live refresh/Back-Forward click-through pending. See
  [ARCHITECTURE.md](./ARCHITECTURE.md) and CHANGELOG.md.
- ✅ **[2026-07-29] Document-editor tours (rollout complete) + same-day review fix pass.**
  QuoteDocument (3 steps), ScopeOfWorkDocument (4 — incl. the manual-number/PO-after-Final rules
  and the recipients flow), DeliveryOrderDocument (2 — per-installment printing). The follow-up
  review pass fixed the auto-fire gating (QuoteDocument now `autoStart: isDetail` — it was firing
  over the blank create form and burning the one-time flag; DeliveryOrder additionally waits for
  `installments.length > 0` so the step never narrates cards over the "no installments" warning),
  stopped unmount from counting as "seen" (GuidedTour.tsx `unmountingRef`), moved the What's New
  entry to index 0 so the gold-dot badge actually fires, and extracted the shared
  `TourReplayButton`. Coverage now: main tour + 11 pages + 3 document editors — only the unbuilt
  Leads module lacks a tour. See CHANGELOG.md.
- ✅ **[2026-07-29] Dashboard page tour.** 5 deeper steps (export/filters/KPI cards incl. the
  pre-VAT + revision-dedup rules/status summary/in-depth section) + replay button;
  `useModuleTour` gained an `autoStart` option so it never races the main first-sign-in tour on
  the same page. See CHANGELOG.md.
- ✅ **[2026-07-29] Guided tours completed for every page.** Third same-day tour pass (owner:
  "ทำให้หมด"): Customers, Quotation Templates, User Management, Role Management, Audit Log, and
  Settings (incl. a dedicated signature-upload step — it feeds printed documents) — every page in
  the app now has a one-time auto-tour + HelpCircle replay button; only Leads remains (no page
  exists). 32 new th/en keys. See CHANGELOG.md.
- ✅ **[2026-07-29] Guided tour steps for Scope of Work + Delivery Order.** Same-day extension of
  the module-tour infra to the two remaining document list pages (4 + 3 steps, incl. a dedicated
  step for the "เฉพาะที่ยังไม่มี PO" toggle), HelpCircle replay buttons, `currentUserId` threaded
  through both page shells, 14 new th/en i18n keys. Customers list is the only cheap follow-up
  left; Leads still has no page. See CHANGELOG.md.
- ✅ **[2026-07-29] Guided tour steps for Quotation + Products.** New `useModuleTour()` hook
  (per-page driver.js walkthrough, auto-starts once per user on first visit, per-tour localStorage
  seen-tracking, HelpCircle replay button in the page header): Quotation list (create button →
  summary cards → filters → table) and Products list (add product → categories → toolbar →
  table), 4 steps each, th/en. Closes the two buildable targets of the 2026-07-10 "extend the
  guided tour" TODO item; SOW/DO/Customers pages can now be added cheaply, Leads still has no
  page. What's New entry added. `tsc`/`lint`/`test`/`build` clean; live click-through pending
  (see CHANGELOG.md). See [TODO.md](./TODO.md).
- ✅ **[2026-07-29] UX polish pass + user manual 29/07 edition.** Killed all three
  `window.prompt()` usages via a new shared `PromptDialog.tsx` (styled reject-reason and
  duplicate-number prompts on Scope of Work/Delivery Order); notification delete button now
  visible without hover (was undiscoverable on touch); removed the misleading do-nothing
  "จดจำฉันไว้ในระบบ" login checkbox — the latter two were long-tracked 2026-07-13 Codex UX
  backlog items. User manual updated (login lockout, manual document numbers, approval workflow,
  PO chasing) and the PDF regenerated via a new committed `docs/manual/generate-pdf.mjs` script;
  screenshots deliberately unchanged (recapture is already go-live step G). What's New entry
  added. `tsc`/`lint`/`test`/`build` all clean. See CHANGELOG.md and
  [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Dialogs".
- ✅ **[2026-07-29] First automated test suite (vitest, 55 tests, wired into CI).** `tests/` +
  `npm test`: quotation money math with client/server formula parity (`computeTotals` vs
  `quoteAmounts.ts` — fails the moment the two drift), default-role RBAC grants + permission
  edge cases (unknown role denies, "named Super Admin" ≠ super admin), quotation workflow state
  machine (terminal statuses have no exit, no Draft→Approved shortcut) + per-action
  authorization, `computeQuotePermissions` ownership rules (own-Draft vs colleague's-Draft,
  submitter-can't-approve), revision-chain parsing/dedup, Scope of Work required-field
  validation (incl. the new manual-number rules), and a **real login integration test** running
  the actual `api/handlers/auth.ts` (bcrypt, JWT cookie, and all the new rate-limiting cases:
  5-failure lockout not bypassable with the correct password, clear-on-success, 20-per-IP sweep
  cap, suspended-account neither-records-nor-clears, TTL index present) against an in-memory
  MongoDB (`mongodb-memory-server` — no real database touched). CI runs the suite on every
  push/PR with the mongod binary cached. Coverage is a deliberate first slice — per-route HTTP
  guards beyond `/api/auth/*` still open, see [TODO.md](./TODO.md). See CHANGELOG.md.
- ✅ **[2026-07-29] Login rate limiting.** `POST /api/auth/login` now records failed attempts in a
  new TTL-purged `login_attempts` MongoDB collection and throttles over a 15-minute sliding
  window: ≥5 failures for one identifier, or ≥20 from one IP, → 429 with a Thai
  "รอประมาณ X นาที" message + `Retry-After` header. Success clears the identifier's failures; a
  correct-password-but-suspended attempt neither records nor clears; the check runs before the
  bcrypt compare so locked-out requests stay cheap. MongoDB-backed deliberately (portable to the
  future server, no per-instance memory, no Vercel-locked KV). Closes a Known Gap open since the
  2026-07-09 migration. `tsc`/`lint`/`build` clean; live 429 behavior not yet verified (see
  [TODO.md](./TODO.md)). See [RBAC.md](./RBAC.md), [API.md](./API.md), CHANGELOG.md.
- ✅ **[2026-07-29] "ทวง PO" — chase missing customer PO numbers.** Full 2026-07-24 proposal
  built on the owner's go-ahead: "ยังไม่มี PO" badge + PO column + filter toggle + summary card
  on the Scope of Work list; a "ทวงเลข PO" button sending a repeatable, audit-logged in-app
  notification (new `scope_of_work_po_chase` type) to the record's resolved salesperson
  (name-match → seller link → creator); a Dashboard "ยังไม่มีเลข PO" counter tile. Companion
  blocker fixed: PO number/recipients/message/attachments are now editable on
  PendingApproval/Final records (`FOLLOW_UP_FIELDS` exemption — a PO usually arrives after
  approval; document content stays locked), which also un-broke "ส่งอีเมลแจ้งผู้รับเอกสาร" on
  Final records. Time-based auto-chasing stays deferred to post-migration (needs cron). What's
  New entry added. `tsc`/`lint`/`build` clean; live verification tracked in [TODO.md](./TODO.md).
  See [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "PO Chasing" and CHANGELOG.md.
- ✅ **[2026-07-29] CI pipeline (GitHub Actions).** `.github/workflows/ci.yml` runs
  `npm run lint` + `tsc --noEmit` (both tsconfigs) + `npm run build` on every push/PR to
  `master` (Node 24, `npm ci`, npm cache). Notify-only by design — it does not block the Vercel
  auto-deploy, it makes a broken push loudly visible (red ✗ on the commit) so it can be reverted
  fast; platform-neutral per the no-Vercel-locked-services rule. Closes the long-standing
  TODO.md High Priority item; the companion "verify auto-deploy is wired" item was also closed
  (confirmed in practice since 2026-07-23). See CHANGELOG.md.
- ✅ **[2026-07-29] Scope of Work: manual-ONLY document number entry.** Executes the spec the owner
  recorded 2026-07-24 ("ระบบไม่ต้องสร้างเลขเองดิ"); the open format question was answered this
  session: completely free-form. The system no longer generates scope numbers — the user types the
  number at creation (new modal field) and on Duplicate (prompt); server enforces non-blank +
  uniqueness (friendly 409 + unique-index backstop, defensively created at runtime since the
  Setup-Wizard-only `ensureIndexes()` never ran on production); editable while Draft only; Rewrite
  still auto-appends `-R{n}`; `yearMonth`/`jobSequence`/`secondaryCode` became legacy fields (old
  records keep their auto numbers, no migration); the legacy `{yearMonth, jobSequence}` unique
  index is dropped at runtime (also fixes a latent fresh-setup Rewrite bug). What's New entry
  added. `tsc`/`lint`/`build` all pass clean; live verification tracked in [TODO.md](./TODO.md).
  See [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Scope Number / Job Code" and CHANGELOG.md.
- ✅ **[2026-07-24] Notifications update automatically — no more manual page refresh.** Direct user
  report ("ต้องกดรีก่อนรอบนึงแจ้งเตือนถึงจะขึ้น"): `App.tsx` now polls `GET /api/notifications`
  every 45 s while signed in, plus an immediate refetch on tab focus / hidden→visible; pauses
  while the tab is hidden. Polling (not SSE/WebSocket) deliberately — portable to the future
  self-managed server per the standing rule; SSE recorded as a post-migration upgrade in
  [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md). What's New entry added. See
  [MODULES/Notifications.md](./MODULES/Notifications.md) and CHANGELOG.md.
- ✅ **[2026-07-24] Delivery Order print rebuilt to visually match the FM-SL-05 reference PDF.**
  `DeliveryOrderPrintDocument.tsx` rebuilt from scratch against a page-image inspection of all 3
  reference pages (`public/ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM บริษัท อีจ.pdf`): black-on-white
  Times/Noto-Serif-Thai formal document with English letterhead + Facebook/LINE/website row, thin
  black bordered table with empty filler rows anchoring the Remark near the page bottom, borderless
  two-column signature block, FM-SL-05 footer. Fully data-driven (no sample values hardcoded); one
  independent document per eligible milestone preserved. Found and fixed a real font-loading bug
  (display:none print DOM meant Thai serif never downloaded → silent system-font fallback). Visually
  verified by generating real A4 PDFs via headless Chrome against a temporary harness and comparing
  side-by-side with the reference across 6 iterations, incl. a 3-page stress test. Same day, an
  earlier pass made printing strictly per-milestone (per-card Print buttons, broadened deposit
  exclusion to Deposit/เงินมัดจำ/ชำระเงินล่วงหน้า). See
  [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md) and CHANGELOG.md.
- ✅ **[2026-07-23] Fix: Delivery Order signature line duplicated "บริษัท".**
  Investigated a user-reported "print produces nothing" bug via a live click-through reproduction
  (Chrome browser automation against a local harness with a mocked backend, real components) —
  couldn't reproduce that specific symptom, but found and fixed a real duplicated-text bug in the
  signature block along the way. `tsc`/`lint`/`build` all pass clean. See
  [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md); follow-up ask to the user tracked in
  [TODO.md](./TODO.md).
- ✅ **[2026-07-23] Fix: Delivery Order excludes the Down Payment installment.**
  Same-day follow-up after the Delivery Order module shipped — a deposit paid before any goods are
  delivered has nothing to "deliver," so it never gets a page on this document. Excluded both at
  create/refresh time and defensively on every read (self-heals an already-created record without a
  migration script). `tsc`/`lint`/`build` all pass clean; verified via a standalone Node script. See
  [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md).
- ✅ **[2026-07-23] New module: Delivery Order (generated from Scope of Work).**
  Direct user request — a new "ใบส่งมอบสินค้าและบริการ" document type generated from an existing
  Scope of Work, reproducing a company reference PDF exactly: customer info pulled from the
  Quotation (via the Scope of Work), items pulled from the Scope of Work, split into one printed
  page per payment installment with a checkbox list of which items go on each page. New standalone
  sidebar module (`src/pages/deliveryOrder/`), 7 new `deliveryOrder:*` permissions mirroring Scope
  of Work's own grants. `tsc`/`lint`/`build` all pass clean; snapshot/reconcile logic verified via a
  standalone Node script. **Requires a manual Role Management step on production** (same
  `defaultRoles`-only-seeds-once caveat as every permission added this session). See
  [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md).
- ✅ **[2026-07-23] Scope of Work: Document Recipients custom message + formal email restyle.**
  Direct user request with a screenshot of the plain original email. New "ข้อความเพิ่มเติมถึงผู้รับ"
  textarea (`ScopeOfWork.documentRecipientMessage`) renders as a highlighted note above the
  auto-generated email summary; the email itself was fully restyled to a formal navy/gold
  inline-styled layout (header band, label/value table, gold CTA button, footer disclaimer).
  `tsc`/`lint`/`build` all pass clean; HTML-generation logic (placement, blank-message omission,
  multi-line handling, XSS-escaping) verified via a standalone Node script. See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients".
- ✅ **[2026-07-23] In-app "What's New" update log.**
  Direct user request for an update log — clarified as an in-app feature. New topbar sparkle icon
  (`WhatsNewPanel.tsx`) next to the notification bell opens a dropdown of recent user-facing
  feature updates (newest first, dated, short Thai bullet points), sourced from a plain
  hand-maintained `WHATS_NEW_ENTRIES` array (`src/lib/whatsNew.ts`) rather than a new DB
  collection/API route. Gold dot badge for "unseen since last opened," tracked per-user in
  `localStorage` (same convention as `tour.ts`'s guided-tour tracking). `tsc`/`lint`/`build` all
  pass clean. See [UI_GUIDELINES.md](./UI_GUIDELINES.md) "What's New Panel."
- ✅ **[2026-07-23] Auto-generated Revision Note (Quotation + Scope of Work).**
  Direct user request for an auto-generated "what changed" comment on a rewritten document. Both
  `QuoteDocument.tsx` and `ScopeOfWorkDocument.tsx` gained a "หมายเหตุการแก้ไข (Revision Note)" card
  (revisions only) with a one-shot "สร้างสรุปการแก้ไขอัตโนมัติ" button that diffs the current draft
  against its immediate predecessor and fills a freely-editable `<textarea>` with a Thai bullet-list
  summary of every changed field/line-item/checklist-selection/payment-installment/document-recipient
  — never automatic, so it can never silently overwrite a user's own edits. New shared, framework-
  agnostic `src/lib/revisionDiff.ts`; new `revisionNote: string` field on both `Quote` and
  `ScopeOfWork`. `tsc`/`lint`/`build` all pass clean; diff logic verified via a standalone `tsx`
  script against mock data (not a live browser click-through — Playwright still disconnected this
  session). See [MODULES/Quotation.md](./MODULES/Quotation.md) "Business Flow" item 6b and
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Revision Note".
- ✅ **[2026-07-23] Fix: "อื่น ๆ" no longer displaced by the backfilled Accounting checklist option.**
  Direct user report — on an existing Scope of Work record, "เอกสารส่งถึง"'s backfilled "Accounting"
  option landed *after* "อื่น ๆ" instead of before it, since the backfill logic just appended
  missing options at the end. Fixed by rebuilding each backfilled group's options in the current
  builder's canonical order instead. `tsc`/`lint`/`build` all pass clean, plus a standalone Node
  logic simulation confirmed the exact fix against a legacy-shaped record. See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Checklist Groups".
- ✅ **[2026-07-23] Scope of Work: clearer Document Recipients checkbox UX.**
  Direct user report that the picker's color-only toggle-chip design was confusing — replaced with
  real checkboxes (matching `ChecklistGroupCard.tsx`'s existing convention directly above it) plus
  a per-department "เลือกแล้ว N คน" selected-count badge. `tsc`/`lint`/`build` all pass clean. See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients".
- ✅ **[2026-07-23] Scope of Work: in-app notification + recipient list visibility.**
  Direct same-day follow-up after the user confirmed real email delivery works in production —
  a document recipient now also gets an in-app bell notification (new `scope_of_work_document_sent`
  type, deep-links straight to the record) and can find the record on their own Scope of Work
  list/search even without `scopeOfWork:viewAll` and without having created it (a new
  `documentRecipients`-matching clause on both query filters). Closes a real gap the previous
  own-records-only viewing pass introduced: a non-creator recipient previously had no standing way
  to find a document sent to them again after the one-time link. `tsc`/`lint`/`build` all pass
  clean. Known, deliberately-not-fixed limitation: the *email's* own link still can't deep-link
  (no app-wide URL router exists) — only the in-app notification can. See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients".
- ✅ **[2026-07-23] Scope of Work: real Document Recipients + email routing — `RESEND_API_KEY` now set, confirmed working live.**
  Per direct user request, the "เอกสารส่งถึง" checklist gained a 6th option (Accounting) and is now
  backed by real people: `User.department` changed from free text to a controlled `<select>`
  matching the checklist's own department labels exactly, a new `DocumentRecipientsPicker.tsx`
  lets the preparer pick real staff per checked department, and a new "ส่งอีเมลแจ้งผู้รับเอกสาร"
  button emails them via a new `api/_lib/email.ts` (Resend REST API, no SDK dependency). No PDF
  attachment (this app has no server-side PDF generation) — a plain HTML notification with a link
  back into the app. `tsc`/`lint`/`build` all pass clean; the recipient-picker UI verified via a
  temporary dev harness (candidate filtering + multi-department selection both confirmed correct,
  zero console errors). **Confirmed live 2026-07-23, same day**: the user added `RESEND_API_KEY`
  to Vercel, redeployed (verified `READY`/`production` via the Vercel MCP tools), tested via
  Resend's sandbox sender against their own confirmed email address, and received the email —
  the send pipeline genuinely works end-to-end in production, not just locally-typechecked. See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients".
- ⚠️ **[2026-07-23] Scope of Work: own-records-only viewing (`scopeOfWork:viewAll`) — requires a manual production step.**
  Per direct user request, mirrors Quotation's `quotations:viewAll`: a role holding `scopeOfWork:view`
  but not the new `scopeOfWork:viewAll` now only sees its own records on the standalone Scope of Work
  list page and in Global Search. The by-quotation existence check, single-record `GET`, and
  duplicate/rewrite's source-record read are deliberately left unfiltered (see
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) for why — filtering those risks either a
  duplicate-creation trap or a broken "link exists but 403s" UX). Default grants mirror Quotation's
  exactly. `tsc`/`lint`/`build` all pass clean; no new client-side rendering logic, so no dev harness
  needed — verified by tracing the query composition against the already-shipped `quotations:viewAll`
  equivalent. **Action required**: existing production role documents won't automatically gain the
  new permission — see [TODO.md](./TODO.md).
- ✅ **[2026-07-23] Scope of Work: Cash/Credit dropdown + separate days field for payment installments.**
  Direct same-day follow-up to the multi-installment pass below — replaced each row's free-text
  payment method with a structured Cash/Credit `<select>` dropdown plus a separate day-count input
  (`paymentType`/`days` instead of `method: string`), since the user clarified they wanted a
  selectable choice, not typed text. `days` applies to either Cash or Credit (matches the user's own
  "Cash 30 days" example). Asked the user to pick between 3 reasonable UI shapes before building.
  `tsc`/`lint`/`build` all pass clean; interaction-verified via a temporary dev harness — reproduced
  the user's own 3-installment example exactly (byte-for-byte matching formatted output). See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).
- ✅ **[2026-07-23] Scope of Work: multi-installment payment schedule + 3 quick-select presets.**
  Per direct user request, replaced the fixed 2-row down-payment/final-payment payment schedule
  with an arbitrary-length `installments` array (each row has its own label/percentage/method), so
  a genuine 3+-installment plan with mixed payment terms is now representable. 3 preset buttons
  ("40% Down Payment (Cash) / 60% After Job Complete (Cash)", "30%/70% with Credit 30 Days", "100%
  After Job Complete (Credit 30 Days)") fill in a common schedule with one click; every row stays
  freely editable/removable afterward. Existing pre-2026-07-23 records are read-compatible via a
  new `normalizePaymentConditions()` (no migration script needed). `tsc`/`lint`/`build` all pass
  clean; interaction-verified via a temporary dev harness mounting the real editor component (preset
  apply + manual add-row both confirmed correct, zero console errors) — live-data verification
  blocked by the standing sandboxed-environment limitation. See [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).
- ✅ **[2026-07-23] Dashboard: Scope of Work document count card.** Per direct user request, the
  Dashboard's supporting-detail section gained a new `ScopeOfWorkSummary.tsx` card (Total/Draft/
  Final Scope of Work document counts, company-wide, unfiltered) — deliberately not a 5th
  `ExecutiveSummaryCards` tile, since that row is a documented "exactly 4 cards" requirement.
  `GET /api/dashboard` gained a matching `scopeOfWork: { total, draft, final } | null` field,
  gated by `scopeOfWork:view` (same pattern as the existing `approvalDashboard` section).
  `tsc`/`lint`/`build` all pass clean. Live browser/API verification against real MongoDB data
  could not be completed this session — same sandboxed-environment limitation as every entry
  below. See [MODULES/Dashboard.md](./MODULES/Dashboard.md).
- ✅ **[2026-07-22] Scope of Work: Rewrite action + Salesperson filter, mirroring Quotation's own features.**
  New "แก้ไข" (Rewrite) toolbar button (`ScopeOfWorkDocument.tsx`, gated by `scopeOfWork:create`) and
  `POST /api/scope-of-works/:id/rewrite` — creates a new revision with `{root}-R{n}` applied to
  `scopeNumber` (not `_id`, since a Scope of Work's `_id` is a real MongoDB `ObjectId`, unlike Quote's
  business-key `_id`), reusing `getRevisionRoot()` from `api/_lib/quoteRevisions.ts` rather than a
  duplicated copy. Also added a Salesperson filter dropdown + table column to the standalone list
  page (`quotationSalesperson` was already snapshotted server-side but never surfaced on the list
  shape or filterable). Fixed a pre-existing staleness gap in `ScopeOfWorkPage.tsx`'s "back to list"
  action (now re-fetches) while in the area. Self-review (`npm run lint`) caught a real
  `react-hooks/rules-of-hooks` violation (a new `useState` placed after existing early returns) before
  it shipped — fixed by moving it up with the component's other hooks. `tsc`/`lint`/`build` all pass
  clean; the list's new column/filter verified visually via a mock-data harness, the Rewrite button
  verified by code inspection against the already-shipped Duplicate button's identical structure. See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).
- ✅ **[2026-07-22] Fixed the Scope of Work page crashing to a blank white screen (real user-reported bug, same day it shipped).**
  Root cause: `toListItem()` had no fallback for missing MongoDB fields, and `JSON.stringify()`
  drops `undefined`-valued keys entirely — the client found a key genuinely absent and crashed
  during render, and since the app had **no error boundary anywhere**, the crash blanked the whole
  screen instead of showing an error. Fixed the missing fallbacks (both server and client side) and
  added the app's first-ever `ErrorBoundary` (`src/components/ErrorBoundary.tsx`) so any future
  crash of this kind degrades to a recoverable error screen instead. Reproduced the original crash
  in a harness and confirmed the fix holds. `tsc`/`lint`/`build` all pass clean. See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) and [ARCHITECTURE.md](./ARCHITECTURE.md).
- ✅ **[2026-07-22] Scope of Work got its own standalone sidebar page.** Previously only reachable
  via a button on the Quotation detail page; now also a top-level "Scope of Work" nav entry (icon
  `ClipboardList`, gated by `scopeOfWork:view`) for browsing/opening existing records — creation is
  unchanged, still only via the Quotation-detail button. New `src/pages/scopeOfWork/` folder
  (`ScopeOfWorkList.tsx` mirrors `QuoteList.tsx`'s summary-cards/search/filter/table pattern;
  `ScopeOfWorkPage.tsx` owns list↔detail state and reuses the existing `ScopeOfWorkDocument.tsx`
  for the detail view). `GET /api/scope-of-works` gained a "list everything company-wide" mode
  (`quotationId` now optional). `tsc`/`lint`/`build` all pass clean; the list UI was visually
  verified against a mock-data harness. **Not done**: live-deployment verification of the full
  page/API integration — same sandboxed-session limitation as every entry below. Also investigated
  (not fixed, no code-level issue found): a "website link" the user saw on the printed Scope of
  Work document — almost certainly the browser's own native print header, which already has an
  explanatory tooltip next to the print button; see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).
- ⚠️ **[2026-07-22] Added `quotations:viewAll` permission + Salesperson filter — requires a manual production step.**
  A role holding `quotations:view` without the new `quotations:viewAll` now only sees its own
  quotations (server-enforced on `GET /api/quotes` and Global Search's Quotation results); Sales
  User doesn't get it by default (own-only, as intended), Administrator/Approver 1/Approver
  2/Viewer do. New Salesperson filter dropdown added to the Quotation list, next to Job Type.
  `tsc`/`lint`/`build` clean; the Salesperson dropdown was visually verified against a mock-data
  harness. **Action required**: because `defaultRoles` only seeds once on first-run setup, this
  production deployment's *existing* role documents will not automatically gain
  `quotations:viewAll` — **a Super Admin must manually check it for Administrator/Approver Level
  1/Approver Level 2/Viewer in Role Management**, or every current Approver loses the ability to
  see quotations they need to approve. See [RBAC.md](./RBAC.md) "Quotation Own-Quotes-Only
  Viewing" and [TODO.md](./TODO.md).
- ✅ **[2026-07-22] Fixed Dashboard double-counting rewritten quotations (real user-reported bug).**
  Every Dashboard metric that counts/sums "quotations" was counting each revision of a rewritten
  quote as an independent additional quotation instead of the same one, superseded — e.g. a
  ฿100,000 quotation rewritten twice inflated the total pre-tax value by 3×. New shared
  `dedupeQuotesByRevisionChain()` (`api/_lib/quoteRevisions.ts`, reusing the same `-R<digits>`
  suffix parsing `handleRewrite()` already used) applied to every quote-count/-value data source in
  `api/dashboard/index.ts` — the shared `docs` array (fixes every KPI/pipeline/salesPerformance/
  customerAnalytics/jobTypeAnalytics/forecast/approvalDashboard field at once), follow-ups,
  repeat-customer classification, forecast win rate, monthly closing rate, and revenue trend (the
  latter four converted from MongoDB `$group` aggregates to raw fetches, since dedup must run
  before any status-based counting). `tsc`/`lint`/`build` all pass clean; core dedup logic
  sanity-checked via a throwaway Node script against a synthetic revision chain. **Not done**: live
  verification against real rewritten quotation data — same sandboxed-session limitation as every
  entry below. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Revision Chain
  De-duplication."
- ✅ **[2026-07-22] Quotation Rewrite/Revision feature added.** New "Rewrite"/"แก้ไข" toolbar button
  on the Quotation detail view (next to the existing Duplicate button, same `quotations:create`
  gate) creates a new revision of the open quote and navigates straight to it — modeled directly on
  Duplicate's clone semantics, but the new quote's `_id` is a revision-numbered id derived from the
  source's own id (`{root}-R{n}`, e.g. `QT-2567-0041-R1`, then `-R2`, ...) instead of an unrelated
  fresh sequence number. Rewriting an already-rewritten quote correctly advances the number (never
  `-R1-R1`) since the root is always recovered by stripping the source id's own trailing `-R<n>`
  suffix — no new schema field was needed. New `POST /api/quotes/:id/rewrite` route, atomic
  per-chain revision counter (`quote_revision_{root}` in the existing `counters` collection, same
  pattern as `nextQuoteId()`), bounded 3-attempt insert retry, distinct `"Quotation Rewritten"`
  audit action, and a button-level busy-state guard against double-clicks. `tsc --noEmit` (both
  `tsconfig.json` and `tsconfig.api.json`), `lint` (0 errors), and `build` all pass clean; client
  bundle confirmed to load with zero console errors in a local dev server. **Not done**: a full
  logged-in click-through against live data — same sandboxed-session no-MongoDB-network limitation
  as every entry below (Vercel CLI also not installed, so `vercel dev` wasn't an option either); the
  logic was instead verified by tracing it line-by-line against the already-shipped, equivalent-shape
  Duplicate action. See CHANGELOG.md, [MODULES/Quotation.md](./MODULES/Quotation.md), API.md,
  DATABASE.md, RBAC.md.
- ✅ **[2026-07-20, Codex review round 4] Live verification closes the FRP Lining rollback's last
  gap; discovers an unpushed commit.** A third independent review flagged (High) that the FRP Lining
  v2.0→v1.0 rollback was code/seed-only, with no confirmation the live MongoDB record matched. Logged
  into the real production app with the user's go-ahead and confirmed directly: `LI-FRP-LINING` was
  already genuine v1.0 content (version 1.0, 17 items, original tax-note wording), last edited
  `14 ก.ค. 2569` for all 5 templates — the audit log showed no import ran between the v2 deploy and
  its revert, so the live record never actually diverged. Ran the import live anyway for a formal
  record: `200 OK`, all 5 templates `skipped` (zero writes, timestamps unchanged), confirming exact
  sync. Separately discovered the Cancel/Back button rollback commit (`8cfc9fe`) was never pushed —
  a live DOM check showed production still rendering the old (pre-rollback) button classes verbatim.
  Not pushed this pass either, per the established "push only when asked" convention — see TODO.md.
  No console errors observed; `lint`/`build` unchanged/clean (no code modified this pass). See
  CHANGELOG.md and `docs/CODEX_REVIEW_REPORT.md` "Claude Fix Status."
- ✅ **[2026-07-20, second rollback] Cancel/Back button visibility improvement reverted.** Per an
  explicit rollback request, restored every Cancel/Close/Back control (14 call sites, 13 files) to
  its exact pre-2026-07-16 low-contrast style, deleted the `src/lib/buttonStyles.ts` helper it
  introduced, and removed the matching section from `docs/UI_GUIDELINES.md`. A safety backup branch
  (`backup-before-button-rollback-2026-07-20`) was created first; a full `git revert` of the
  original commit was attempted but aborted when it proposed deleting
  `docs/reviews/CODEX_REVIEW_2026-07-20.md` (a file that commit created but which has since become
  the shared canonical review archive for unrelated later work) — a surgical, file-by-file
  restoration was used instead, each change verified against `git show`/`git diff` output, never
  guessed. `git diff <pre-change-commit>` on every affected file produces either zero output (11 of
  13 files) or shows only unrelated, legitimate later changes (the other 2) — confirming an exact,
  complete restoration. Only visual style changed; no navigation/behavior/API/RBAC was touched.
  `lint`/`build` pass clean. See CHANGELOG.md for the full writeup.
- ✅ **[2026-07-20, rollback] FRP Lining v2.0 / generic Dynamic Fields system reverted.** Per an
  explicit rollback request, `git revert`ed the two commits that introduced this work (not a broad
  `git reset --hard` — full history preserved). Verified scope before reverting (both commits
  touched only Quotation-Template/Quote files, nothing in Dashboard/Warehouse/Customers/Scope of
  Work/RBAC) and verified the result after (`git diff --stat` against the last pre-FRP-Lining-v2.0
  commit produces zero output — byte-identical). `LI-FRP-LINING` is back to its original v1.0
  Excel-transcribed content; the generic `TemplateDynamicField` schema, `Quote.notes`/
  `vatConditionText`/`warrantyText`/`deliveryDays`, and the two files this system added are all
  removed. The other 4 seeded templates and every other Quotation Template feature (list/create/
  edit/duplicate/activate/archive/import/apply-to-quotation/snapshot/RBAC) are unaffected — they
  never used any of the reverted schema. `lint`/`build` pass clean. **Not done this pass**: the live
  MongoDB `quotation_templates` record for `LI-FRP-LINING` was not re-imported against this reverted
  seed (no live database credentials in this session) — see TODO.md for that required follow-up. Any
  quotation already created from v2.0 (unverifiable without DB access) remains fully readable/
  printable regardless, per the existing frozen-snapshot architecture. See CHANGELOG.md for the full
  writeup.
- ✅ **[2026-07-20] Cancel/Back visibility — Codex-review fix pass.** Fixed all issues (0 Critical, 1 High,
  3 Medium, 1 Low) an independent review found in the 2026-07-16 pass below: two `QuotationTemplateWizard.tsx`
  "Choose another Job Type" recovery buttons still had the old low-contrast/no-focus treatment (High); the
  shared focus ring's `ring-[#c9a84c]/50` measured below WCAG's 3:1 contrast minimum, fixed to solid navy
  `ring-[#0b1d3a]` (~17:1) (Medium); several compact Cancel/Back controls and one icon-only Close had touch
  targets as small as ~16–32px, bumped closer to ~32–38px without changing visual button size for icon-only
  controls (Medium); two more modal × Close buttons (`CustomersPage.tsx`, `TemplateManagementPage.tsx`) lacked
  an accessible name/focus style, now fixed to match `ProductPickerModal.tsx`'s pattern (Medium); the
  duplicated class strings behind all of the above were extracted into a new `src/lib/buttonStyles.ts` so future
  fixes apply in one place (Low). No behavior/navigation/API/RBAC change. `tsc`/`lint`/`build` all pass clean;
  Playwright-verified in a local dev server (states render correctly, 0 console errors) — full logged-in
  click-through blocked by the same no-MongoDB-network sandboxed-session limitation noted below. See
  CHANGELOG.md and `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status."
- ✅ **[2026-07-16, same day, later still] Cancel/Back button visibility improved app-wide.** Purely
  visual, no behavior change: every Cancel/Close button (`ConfirmDialog` and every form/modal footer
  across Customers, Products, Users, Roles, Templates, Quotation, Scope of Work, Approval Dashboard)
  now uses a clearer border, subtle background tint, higher-contrast text, and a visible keyboard-focus
  ring instead of the old near-invisible `border-border`/`text-muted-foreground` combination (measured
  under WCAG AA contrast at the app's actual 12–14px button sizes). Bare breadcrumb-style "Back" links
  (Product/Quotation/Scope of Work/Template Editor toolbars, Create Quotation wizard steps) — previously
  plain text with zero button chrome — now get the same treatment as a subtle bordered chip. One
  icon-only Close (×) button (`ProductPickerModal`) gained an `aria-label`. See CHANGELOG.md and
  [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Buttons" for the exact classes and which buttons were
  deliberately left unchanged (the red "Cancel Quotation" destructive workflow action; every
  non-Cancel/Back secondary button like Export/Duplicate/Retry).
- ✅ **[2026-07-16, same day] Quotation fields made optional again; Document Requirements and Delivery removed.**
  A newer business decision explicitly overrides the two required-field validation passes
  immediately below: Quotation must not force every field to be completed, and its "ข้อกำหนดเอกสาร
  และการส่งมอบ" section is removed entirely. `quotationRequiredFields` now only requires `client`
  (the customer name — the same single field this codebase required before any of this validation
  work started; no new mandatory field was invented). `jobTypeCode` stays required only at creation,
  as it always was, via a separate server check. Line items are no longer required either (no
  minimum count, no required per-line fields) — reverted to the original behavior. Quotation's
  `checklistGroups` field, its UI section, and all its client/server validation were removed; the
  shared `ChecklistGroupCard`/`documentRequirements.ts` infrastructure is untouched and still fully
  used by Scope of Work. **Scope of Work's own UI, schema, validation, print/PDF, and permissions
  had no changes this pass** — corrected wording (2026-07-16, Codex review Low Priority fix; the
  original phrasing here said "zero changes"/"no file touched," which was imprecise: one file,
  `api/_lib/scopeOfWorkHandler.ts`, *was* intentionally edited). The one actual edit is
  `deriveFromQuotation()`, which now always calls `buildDefaultChecklistGroups()` instead of trying
  to copy a `quote.checklistGroups` that no longer exists — a compatibility adjustment forced by the
  Quotation-side removal, not a Scope of Work feature change; new Scope of Work records still start
  with the same unchecked default checklist they always did before the now-removed cross-feature
  existed. No destructive migration — a stray legacy `checklistGroups` property on an already-saved
  Quotation is simply never read/written by any current code path.
  `tsc`/`lint`/`build` all pass clean; no live-deployment verification (same sandboxed-session
  limitation as every recent pass). See CHANGELOG.md for the full itemized diff.
- ✅ **[2026-07-16, same-day Codex-review fix pass] Quotation + Scope of Work validation — checklist snapshot bug and 4 Medium-severity gaps fixed.**
  An independent review of the required-field validation pass below found 0 Critical, 2 High, and 4
  Medium Priority issues — all fixed same day. **High #1**: creating a Scope of Work discarded the
  source Quotation's own checklist selections (reset to blank defaults instead of copying them) —
  fixed by deep-copying `quote.checklistGroups` at creation only, matching the required
  Quotation-to-Scope snapshot behavior. **High #2**: the "Other requires detail" rule was
  server-enforced but had no reachable input in the UI for `safety`/`transportation`/`namePlate`/
  `documentsToSend` (only Logo's detail field actually rendered) — fixed by initializing the missing
  `note` field on all four (plus Safety's "TOR" option, per the spec's literal wording), with
  backfill for already-saved records. **Medium fixes**: real HTML `disabled` on gated action
  buttons (previously dimmed/guarded only); semantic (not just non-blank) date validation at
  finalization; server-returned `422` field/group errors now merged into the on-screen validation
  instead of only a toast; every visible field (including numeric/date ones previously omitted) now
  explicitly classified in the central required/optional config. Deliberately did not invent new
  business option catalogs for billing/ปจ.2/delivery "Other" conditional details the review also
  flagged — no confirmed business rule exists for them yet, tracked in TODO.md instead of
  fabricated. `tsc`/`lint`/`build` all pass clean; no live-deployment verification (same sandboxed
  limitation as every recent pass). See CHANGELOG.md and `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix
  Status."
- ✅ **[2026-07-16] Quotation + Scope of Work — required-field/mandatory-selection validation.**
  Both documents previously enforced almost nothing (Quotation: only `client`/`jobTypeCode` on
  create; Scope of Work: only `secondaryCode`) — every other field, and all 11 checklist groups,
  could be saved, submitted, approved, and even **printed** completely blank. Added a shared,
  centrally-configured validation architecture (`src/lib/validation/quotationValidation.ts`/
  `scopeOfWorkValidation.ts`, `src/lib/documentRequirements.ts`) that runs identically client- and
  server-side (same functions, value-imported into both bundles). Quotation gained a new
  `checklistGroups` field (the same "ข้อกำหนดเอกสารและการส่งมอบ" — Safety/ขนส่ง/Logo/เงื่อนไขการ
  วางบิล/เอกสารส่งถึง/Nameplate/เงื่อนไขการส่งมอบงาน/ปจ.2 — checklist Scope of Work already had) and
  a brand-new server print endpoint (`POST /api/quotes/:id/print` — there was no server-side print
  route at all before). Server blocks Submit/Approve/Send-to-customer/Won/Lost/Print/Finalize with a
  structured `422 DOCUMENT_INCOMPLETE` (`fieldErrors`/`groupErrors`) when incomplete; Draft/reject/
  cancel remain unaffected. Frontend shows red-asterisk required labels, inline Thai field errors, a
  top-of-form validation summary, and a completion-percentage indicator, reusing one shared
  `ChecklistGroupCard` component (renamed from Scope-of-Work-only `ScopeOfWorkChecklistGroup.tsx`)
  for both documents. Old records normalize missing checklist groups on read (never silently
  mutated) and simply display as incomplete rather than crashing. `tsc`/`lint`/`build` all pass
  clean; no live-deployment browser verification yet (see Known Risks). See CHANGELOG.md for the
  full itemized writeup, including deliberate scope decisions (business option catalogs mostly kept
  as-is, reject/cancel exempted from the completeness gate, summary-level scroll instead of
  per-field focus).
- ✅ **[2026-07-15, Codex-review fix pass] Scope of Work — contact/salesperson snapshot, required job-code suffix, Global Search integration.**
  An independent review of the Scope of Work module below found 0 Critical, 3 High Priority, and
  several Medium/Low Priority issues — all 3 High Priority (plus the actionable Medium/Low ones)
  fixed same day. **High #1**: the quotation's real contact name and assigned salesperson were
  previously dropped from the snapshot entirely (`seller` always defaulted to the creating user
  instead) — fixed via `customerSnapshot.contactName`, a new frozen `quotationSalesperson` field,
  and a `seller` default that now prefers `quote.salesperson` (with a real-user lookup for the
  signature image). **High #2**: the job code's 4th segment (`secondaryCode`) was always blank on
  creation, so the generated code never actually matched the required 4-part format — fixed by
  requiring the user to supply it at creation time (a small prompt), without inventing what the
  value itself should mean. **High #3**: Scope of Work had no Global Search integration at all —
  fixed with a new `scopeOfWorks` result group searchable by scope number/quotation number/
  customer/Job Type/PO/status. **Medium fixes**: explicit `@page { size: A4 portrait }`; item rows
  now grouped with their spec/remark row into one unbreakable `<tbody>` each (closing a real
  multi-page-split risk); `refresh` now also requires `quotations:view`; a bounded duplicate-key
  retry added to create/duplicate; the delete confirmation no longer overpromises a restore
  capability that doesn't exist. `tsc`/`lint`/`build` all pass clean on both passes; still no
  live-deployment manual verification (see Known Risks). See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) and `docs/CODEX_REVIEW_REPORT.md`'s "Claude
  Fix Status."
- ✅ **[2026-07-15] Scope of Work — new document type generated from a quotation.** Reproduces the
  reference PDF's printed structure (header fields, 11 checklist groups, numbered item table,
  payment conditions, ผู้ขาย/ผู้อนุมัติ signatures) as an editable document reached from a new
  "สร้าง Scope of Work"/"เปิด / แก้ไข Scope of Work" action on Quotation Detail — not a new sidebar
  module. Auto-fills customer/item/Job Type/PO data from the source quotation as an independent
  snapshot (editing it never touches the quotation, later quotation edits never silently change an
  already-created Scope of Work); blue-handwritten-style fields (shipping/billing contact,
  signatures, delivery date) start blank/editable, never defaulted from the sample PDF. Server-
  generated `PQ{YYYYMM}-{jobSequence}-{jobTypeCode}-{secondaryCode}` scope number via an atomic
  per-month counter (`secondaryCode` is a plain editable field with its business meaning still
  unconfirmed — see TODO.md). Draft/Final lifecycle, "ทำสำเนา"/"อัปเดตข้อมูลจากใบเสนอราคา" actions,
  print/PDF output with no pricing anywhere, 6 new RBAC permissions enforced server-side with an
  owner-or-finalize edit/delete rule, and audit logging for every action. `tsc`/`lint`/`build` all
  pass clean; no live-deployment manual verification yet (see Known Risks). See
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).
- ✅ **[2026-07-15, second Codex-review fix pass] Quotation Templates — real workbook parsing, structured snapshot, subDetails/visibleToCustomer fix, server-verified product links.**
  An independent review of the Template Management pass below found 0 Critical, 3 High, and 3
  Medium Priority issues — all fixed same day. **High #1**: `POST /api/quotation-templates/import`
  now actually reads the real `.xlsx` workbook (`api/_lib/templateWorkbookParser.ts`, `xlsx`/
  SheetJS re-added as a real production dependency) and hashes its content per sheet, so replacing
  the workbook is now genuinely detectable — a real import-report warning fires when a sheet's live
  content no longer matches the last hand-transcription. Full auto-classification of parsed rows
  into structured template content was deliberately not attempted (direct inspection of the real
  workbook found rows that pack multiple different classifications into different columns of a
  single row — see MODULES/QuotationTemplates.md for the concrete evidence — a naive classifier
  risks silently corrupting already-reviewed customer-facing content). **High #2**: `Quote.
  templateSnapshot` added — a real structured copy of the matched template's sections/terms/
  internal-notes/source-hash frozen at quote-creation time, alongside the existing provenance
  strings; never client-writable, never editable after creation, never read by any rendering path
  (PDF/editor still only read `lines`, unchanged). **High #3**: `applyTemplateToQuoteDraft()` now
  copies `item.subDetails` (previously silently dropped — an admin's configured sub-detail text
  never reached the quotation) and skips any item with `visibleToCustomer: false` (previously
  ignored entirely — the "hide from customer" checkbox had zero actual effect). **Medium fixes**:
  template item product links are now server-resolved against real Product Master records (a
  client-submitted `productSnapshot` is never trusted verbatim); a concurrent import race can no
  longer surface as an unhandled duplicate-key 500; the wizard's Job Type availability badges now
  distinguish loading/error/real-count instead of collapsing all three into "no template." The
  inactive-but-not-deleted-template policy was formally reconfirmed (not changed) as intentional.
  `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `lint`, `build` all pass clean; a local
  dev-server + Playwright check confirmed zero console errors; `fingerprintSourceWorkbook()`
  independently verified against the real workbook file. See `docs/CODEX_REVIEW_REPORT.md`'s
  "Claude Fix Status" for the full writeup.
- ✅ **[2026-07-15] Quotation Templates — Template Management module.** Closed the gap the
  2026-07-14 pass's own docs flagged ("No admin UI exists yet for managing templates beyond the raw
  API"). New `จัดการ Template ใบเสนอราคา` page (sidebar under งานขาย): list (search/filters/columns
  per spec) + create/edit form (sections/items CRUD, reorder via up/down buttons, select-existing-
  product-via-`ProductPickerModal`-vs-add-custom-item, specifications/sub-details/editable
  parameters/internal notes/terms editing), duplicate (deep-clones with fresh ids, always created
  Draft/Inactive, original untouched), activate/deactivate, archive/restore. RBAC expanded from one
  coarse `quotationTemplates:manage` into 7 granular permissions
  (`view/create/edit/duplicate/activate/archive/import`), with `:manage` kept as a documented
  backward-compatible superset so no existing role assignment silently loses access. Server-side
  audit logging added for every template lifecycle event, plus a new distinction on the
  quote-creation audit entry between "Quotation Created from Template" and "Quotation Created
  (Blank)". Job Type grid now shows template-availability badges, and a permission-gated "create
  Template for this Job Type" action was added to the wizard's empty-state/template-choice screens.
  `QuotationTemplate` gained `sourceType` (excel_import/manual) and `TemplateItem` gained an
  optional `productSnapshot`. A shared `TemplatePreview` component now backs both the wizard's
  preview step and the new module's own preview action. `tsc -b`, `tsc --noEmit -p
  tsconfig.api.json`, `lint`, `build` all pass clean; a local dev-server + Playwright check confirmed
  the client bundle loads with zero console errors (no local MongoDB credentials, so live-DB
  round-trips remain unverified — see MODULES/QuotationTemplates.md "Known Limitations").
- ✅ **[2026-07-14, Codex review fix pass] Fixed 3 High Priority Quotation Templates issues from an independent review of the pass below.** Zero Critical issues found. **High #1**: `POST /api/quotes` validated `jobTypeCode` and `quotationTemplateId` completely independently, so a direct API caller (bypassing the wizard's UI-level guardrails) could create a quotation whose Job Type and attached template didn't actually match — `validateQuotationTemplate()` (`api/_lib/quoteValidation.ts`) gained a required 3rd `quoteJobTypeCode` parameter and now throws a `400` if the matched template's own `jobTypeCode` differs from the quote's; `TemplateMasterEntry`/`loadTemplateMaster()` (`api/handlers/quotes.ts`) now project/return `jobTypeCode` to support the check. **High #2**: the `SC-ACTIVATED-CARBON` and `BF-BAG-FILTER` templates' "Main Ducting" item was missing a real source specification line present in the source workbook (row 5 of both sheets) — re-verified directly against `public/Scope of work new template for air pollution control_Technic.xlsx` before fixing, then added as each item's first `specifications` entry in `api/_lib/templateSeedData.ts`. **High #3**: 9 real, non-placeholder literal values (e.g. `Brand: TCS`, `Material: Steel`, `Static Pressure: 200 mm wg.`) were stored in `TemplateEditableParameter.value`, but `applyTemplateToQuoteDraft()` (`src/pages/quotation/applyTemplate.ts`) always renders every editable parameter as a blank fill-in-the-blank prompt regardless of `value` — so these real defaults were silently discarded on template apply, contradicting the interface's own "always blank at template-definition time" doc comment. Fixed by reclassifying all 9 from `editableParameters` to plain `specifications` text (matching a classification rule the seed file's own top-of-file comment already stated but the original data violated) — `TemplateEditableParameter.value` is now verified genuinely always blank across all 5 templates, and the real defaults now survive into the applied quotation as ordinary editable specification text. `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass clean; seed data changes verified via a `tsx` sanity script run against the actual template objects. **Not changed** (explicitly out of scope — task was "fix Critical/High," 0 Critical found): `POST /api/quotation-templates/import` still upserts hand-transcribed seed data rather than parsing/hashing the `.xlsx` file itself; no admin UI for triggering import/activating templates; the quote's template snapshot is flattened `QuoteLine[]` metadata, not a full structured section/item hierarchy; the import loop is find-then-insert/update rather than a single atomic upsert; template preview still shows only the first 6 item names — all tracked in TODO.md. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, IMPLEMENTATION_CHECKLIST.md. See `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" section.
- ✅ **[2026-07-14] Quotation Templates + Create Quotation wizard.** Sales users now go through a
  wizard (Job Type → Template → Preview → the normal quotation form, pre-filled but fully editable)
  when creating a new quotation, instead of always starting blank. Template content — 5 templates
  (`SC-WET-SCRUBBER`/`SC-ACTIVATED-CARBON`/`BF-BAG-FILTER`/`TA-FRP-TANK`/`LI-FRP-LINING`) across 4
  source sheets — was extracted from a real Excel workbook the company provided
  (`public/Scope of work new template for air pollution control_Technic.xlsx`), not invented; no
  prices were ever fabricated (every copied line still gets `unitPrice: 0`/`discount: 0`, filled in
  by Sales afterward). New `quotation_templates` MongoDB collection, idempotent SHA-256-hash-gated
  import (`POST /api/quotation-templates/import`, `upsertQuotationTemplates()`), `GET
  /api/quotation-templates[/:id]` and `PATCH /api/quotation-templates/:id` (all sharing
  `api/handlers/jobtypes.ts`'s function slot — Vercel Hobby's 12-function cap is still fully used,
  same established sharing pattern `/api/search` uses with `customers.ts`). New
  `quotationTemplates:manage` permission (Administrator by default, not Super-Admin-exclusive; Sales
  template-browsing reuses the existing `quotations:create`, same carve-out pattern established for
  Customers). New optional, backward-compatible `Quote.quotationTemplateId/Name/Version` (frozen
  provenance metadata, server-derived and never editable after creation) and
  `QuoteLine.isSectionHeader` fields — every pre-existing quotation is completely unaffected, these
  fields are simply `undefined` on them. Template→quote conversion
  (`src/pages/quotation/applyTemplate.ts`) is a one-time copy, never a live reference — editing a
  quotation can never write back to its template, and editing a template later never changes
  quotations already created from it — and **never copies `internalNotes`** (real internal-staff
  review comments extracted from the source workbook, e.g. "รบกวนพี่หมูรีวิวต่อว่าต้องใส่ PP
  washable ไหม") into a customer-facing quotation or its PDF, by design. Section-header divider
  lines render as a full-width bold row (no unit/qty/price/discount columns) in both
  `LineItemsEditor.tsx` and `PrintDocument.tsx`, skipped in item numbering, and silently omitted
  from print if left with no items under them. New "Template ใบเสนอราคา" Global Search result group,
  projecting only `templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/`description` server-side
  (never `sections`/`internalNotes`), deep-linking straight into the wizard's Preview step for that
  template. Removed the `xlsx` npm package from `package.json` — it was only ever used for one-time
  offline Excel analysis via ad-hoc Node scripts during development, never imported by any runtime
  `api/`/`src/` code. `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and
  `npm run build` all pass clean. **Not done**: no live MongoDB/Vercel access was available this
  session, so the real DB-backed behavior (an actual import run, real API round-trips, the wizard's
  live fetch/preview/apply flow, Global Search actually returning template results) has not been
  manually tested end-to-end in a browser — same sandboxed-session network limitation as every prior
  pass (see Known Risks below); no UI screenshot/visual verification of the wizard's 3 screens or the
  section-header divider rendering; if the source Excel workbook is ever revised,
  `api/_lib/templateSeedData.ts` needs manual re-transcription and re-import — there is no live
  xlsx-parsing-at-runtime anywhere in this app. Docs updated: this file, CLAUDE.md, CHANGELOG.md,
  DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md,
  MODULES/QuotationTemplates.md (new).
- ✅ **[2026-07-14, Codex review fix pass] Fixed 2 High Priority Global Search issues + 2 directly-relevant Medium findings from an independent review of the pass below.** Zero Critical issues found (no unauthorized data exposure — every result category is genuinely filtered server-side before its query runs). **High #1**: `GET /api/search` had a 2-character minimum but no maximum query length, letting an authenticated caller force an expensive multi-collection regex scan with an oversized term — added `MAX_QUERY_LENGTH = 100` server-side (`400` if exceeded) plus a matching client-side `maxLength` on the search inputs. **High #2**: Global Search had no visible affordance at all below the `lg` (1024px) breakpoint, and Ctrl/Cmd+K silently focused an invisible input there — added a real `lg:hidden` mobile trigger button opening a full-screen search takeover that reuses the exact same search state/logic as the desktop dropdown, with Ctrl/Cmd+K now checking `window.matchMedia` to target whichever UI is actually visible. **Medium**: a view-only Customer search result (`customers:view` without `customers:edit`) previously deep-linked straight into the editable form, bypassing the same gate the page's own list UI already respects — now lands on the filtered list instead (Products intentionally left as-is: it has no button-level edit gating at all today, a pre-existing documented gap the search feature doesn't worsen); added combobox/listbox ARIA semantics (`role`/`aria-expanded`/`aria-controls`/`aria-activedescendant`/`aria-selected`) and active-row scroll-into-view. `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint` (clean, 2 pre-existing unrelated warnings), `npm run build` all pass clean. **Not done**: no live-database/browser verification, including of the new mobile UI at real device widths (same sandboxed-session network limitation as every prior pass); Low Priority findings (English quotation-status aliases, "matched by" field disclosure) and automated test coverage (this project has no test infrastructure anywhere, a longstanding separate decision) deliberately left unaddressed. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, `CODEX_REVIEW_REPORT.md`'s new "Claude Fix Status" section. See CHANGELOG.md for the full itemized breakdown.
- ✅ **[2026-07-14] Implemented a real, permission-aware Global Search** replacing the topbar search box, which had never worked (a bare `<input>` with no `value`/`onChange`, plus a generic-template placeholder mentioning purchase orders/vendors this ERP doesn't have). New `GET /api/search?q=` (`api/_lib/searchHandler.ts`, sharing `api/handlers/customers.ts`'s function file — Vercel Hobby's 12-function cap is still fully used) searches Quotations, Customers, Products (`view` permission each), application pages/menus (permission-filtered per page), and Users (`users:manage` only) — every category independently RBAC-filtered server-side, an unauthorized category simply returns empty, indistinguishable from a genuine zero-result search. Quotation results carry the before-VAT amount via the same shared `computeQuoteAmountBeforeVat()` helper the Dashboard uses. New `src/components/GlobalSearch.tsx`: debounced (300ms) dropdown grouped by category, keyboard nav (arrows/Enter/Escape), Ctrl/Cmd+K shortcut, previous results stay visible with a small spinner during refetch (not a blank flash), loading/empty/error states, simple substring highlighting. Clicking a Customer/Product/User result opens that record's edit form directly (new `initialEditId` deep-link prop on `CustomersPage.tsx`/`ProductsPage.tsx`/`UserManagementPage.tsx`, mirroring `QuotationPage.tsx`'s existing `initialQuoteId` pattern); "Create Quotation"/"Add Customer"/"Product Categories" page results jump straight into that action. New MongoDB indexes on the searched fields (`ensureSearchIndexes()`, same lazy/idempotent pattern as the Dashboard's own index-ensure function). `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint` (clean, 2 pre-existing unrelated warnings), `npm run build` all pass clean. **Not done**: recent-search history (explicitly optional per the requirement, skipped to keep scope contained), MongoDB Atlas Search (not introduced — full collection scans per category are acceptable at this ERP's real data volume; documented as a scaling limitation, not fixed). ~~a mobile/narrow-viewport search UI~~ — **superseded the same day**: a follow-up independent review flagged the missing mobile UI as High Priority; a real `lg:hidden` mobile search entry point was added later on 2026-07-14 (see the newer dated entry above). No live-database/browser verification (same sandboxed-session network limitation as every prior pass). Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md. See CHANGELOG.md for the full itemized breakdown.
- ✅ **[2026-07-14, Codex review fix pass] Fixed 3 High Priority progressive-loading issues + 3 Medium findings from an independent review of the pass below.** Zero Critical issues found (Company Profiles removal, the before-VAT rule, and Expected Sales all passed review as-is). **High #1**: `App.tsx` still globally blocked every prop-driven page (Quotations/Products/Customers/Users/Roles/Settings) behind one `initialDataLoading` flag shared by all 9 boot resources — replaced with per-resource `resourceStatus` tracking + a `NAV_RESOURCES` map naming which resources each page actually needs, so e.g. Products no longer waits on unrelated `notifications`/`quotes`/`users` fetches. **High #2**: Dashboard's post-approval/rejection refresh (`refreshAfterAction`) left stale stats on screen with zero visible indication — now sets `loading` too, surfacing a small "กำลังอัปเดตข้อมูล..." indicator next to the page title while the previous data stays visible. **High #3**: `GET /api/dashboard` was one failure domain — any rejected optional query (index creation, activity timeline, sales activity, approval dashboard, notifications) 500'd the entire response, blanking KPIs along with it; each of those four sections is now isolated in its own try/catch, degrading to `null`/a safe default instead. **Medium**: first-load Dashboard skeleton rebuilt to show the real 4 required sections' actual titles/table headers (via `ChartCard`/`t()`) instead of one generic block; the `computeQuoteAmountBeforeVat()` missing-`lines` fallback is now documented (was previously claimed to "never occur") and flagged via `console.warn` if it ever fires; stale `docs/MODULES/Customer.md`/`docs/TODO.md`/`docs/PROJECT_STATUS.md`/`docs/ARCHITECTURE.md` references to the old shared `company-profiles.ts` function file and "Company Profiles remains available" wording corrected. `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint` (clean, 2 pre-existing unrelated warnings), `npm run build` all pass clean. **Not done**: no live-database/browser verification (same sandboxed-session network limitation as every prior pass). Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md, MODULES/Customer.md, ARCHITECTURE.md, `CODEX_REVIEW_REPORT.md`'s new "Claude Fix Status" section. See CHANGELOG.md for the full itemized breakdown.
- ✅ **[2026-07-14] Removed Company Profiles module; reworked Dashboard to a true items-based pre-tax calculation; progressive/shell-first loading for App boot + Dashboard.** Three-part pass.
  **(1) Company Profiles removed.** The admin module (list/create/edit/archive/set-default for
  multi-issuer-company master data) is gone from the user-facing app: `src/pages/admin/companyProfiles/`
  and `src/lib/companyProfiles.ts` deleted; the "ข้อมูลบริษัท" nav item, `NavKey`, permission
  booleans, and render case removed from `src/App.tsx`; `api/handlers/company-profiles.ts` and
  `api/_lib/companyProfileValidation.ts` deleted, `vercel.json`'s `/api/company-profiles*` rewrites
  removed entirely (the route now 404s — no function serves it); `companyProfilesCollection()`/
  `CompanyProfileFields` removed from `api/_lib/collections.ts`; `companyProfiles:view/create/edit/
  archive/delete/setDefault` removed from the `Permission` union/`ALL_PERMISSIONS`/labels/groups
  and from the Administrator default role; ~110 `companyProfiles.*`/`permission.companyProfiles*`/
  `empty.companyProfiles.*`/`nav.companyProfiles` i18n keys removed (Thai + English). The
  customer-data logic that had been sharing `company-profiles.ts`'s serverless function (to stay
  under Vercel Hobby's 12-function cap) now has its own dedicated `api/handlers/customers.ts` file,
  since removing this module freed the slot. **`company_profiles` MongoDB collection and any
  existing documents/audit-log entries were deliberately left untouched** — no destructive database
  cleanup. An existing custom role that already had a `companyProfiles:*` permission string stored
  keeps it (inert, harmless — `api/handlers/roles.ts` never validated permission strings against
  `ALL_PERMISSIONS`, so nothing breaks). See [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md).
  **(2) Dashboard pre-tax amounts reworked to compute from line items, not `amount / 1.07`.** New
  shared `api/_lib/quoteAmounts.ts` (`computeQuoteAmountBeforeVat()`/`computeQuoteAmountWithVat()`)
  — the authoritative before-VAT figure is now recomputed directly from each quote's own
  `lines`/`discount` (the same inputs used to derive the persisted VAT-included `amount`), not
  backed out by dividing the grand total by a fixed VAT rate. `api/_lib/quoteValidation.ts`'s
  `computeQuoteAmount()` now delegates to the shared helper too, so create/edit and Dashboard use
  the identical formula. `api/dashboard/index.ts`'s 3 raw-`amount`-reading queries (`docs`,
  `followUpDocsRaw`, `wonRevenueDocsRaw`) now project `lines`/`discount` instead of `amount` and
  compute pre-tax via the shared helper. Every `DashboardStats` field keeps its existing shape/keys
  (no client changes needed for the computation itself). Also closed 3 real Dashboard label gaps
  found by an audit of all 18 monetary-value widgets: `SalesPerformancePanel`'s Average Deal Size
  label gained "(ก่อนภาษี)"/"(Before VAT)"; `PipelineSteps`' `ChartCard` caption switched to the
  already-correctly-worded (but previously dead, empty-state-only) `dashboard.pipeline.sub` string;
  `FollowUpReminders` gained a "มูลค่าที่แสดงเป็นยอดก่อนภาษี"/"Amounts shown are before VAT" caption
  under its title (its per-row `฿` amount had no label of any kind before). The other 15 widgets
  (KPI cards, Status Summary, ranking/analytics tables, all charts, CSV export) already carried the
  qualifier from an earlier pass — confirmed, not re-labeled.
  **(3) Progressive/shell-first loading.** `src/App.tsx`'s boot sequence: the sidebar/header shell
  now renders as soon as the session check resolves, not after a further 9-way `Promise.all` of
  every domain fetch (`fetchUsers`/`fetchRoles`/`fetchCompany`/`fetchProducts`/`fetchCategories`/
  `fetchNotifications`/`fetchQuotes`/`fetchJobTypes`/`fetchCustomers`) also completes — each of
  those 9 fetches now fires and updates its own state independently (`Promise.allSettled` only
  tracks *when everything has settled*, gating nothing individually), so the slowest one no longer
  holds up the others. Pages purely prop-driven off that bulk fetch (Quotations/Products/Customers/
  Users/Roles) show a lightweight `SectionLoading` placeholder ("กำลังโหลดข้อมูล...") instead of
  either blocking the shell or rendering a false "no records yet" empty state while it's in flight;
  Dashboard and Audit Log render immediately since they fetch independently already. Fixed a
  previously-documented, real gap: the boot session-check had no error handling at all (a thrown
  network error left the app stuck on the loading splash forever) — now shows a retryable
  `BootError` screen. `DashboardPage.tsx`: the page title/description/filter bar now render
  unconditionally (even before the very first `/api/dashboard` fetch resolves), extracted the
  data-driven widget tree into a `DashboardContent` subcomponent so only that part — not the whole
  page — shows a (now smaller, content-scoped) loading skeleton on first load; the pre-existing
  keep-previous-data-visible-during-refetch behavior on filter change (a small spinner in the
  header, not a full-page reset) was already correct and is unchanged.
  **Verification**: `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
  all pass clean; the production bundle's `CompanyProfilesPage`/`ImageUploadField`-for-company-profiles
  chunks are gone and the main `index.js` chunk shrank (~342KB → ~324KB gzipped-adjacent). **Not
  done**: no live-database/live-browser walkthrough — same sandboxed-session network limitation as
  every prior pass (see Known Risks below); no per-widget progressive rendering *within* an
  already-loaded Dashboard (all 18 widgets still render together once `stats` arrives — only the
  *page shell vs. first-load content* boundary was addressed, not every individual section);
  Quotations/Products/Users/Roles/Customers/Settings pages still have no independent loading state
  of their own beyond the new shared `SectionLoading` placeholder (deliberately not redesigned —
  see "Do not redesign unrelated pages"). Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md,
  DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md
  (rewrite).
- ✅ **[2026-07-14, Codex review fix pass] Fixed 2 High Priority customer-autofill/snapshot gaps + documentation/naming cleanup.** An independent Codex review of the correction pass below found the core requirement met (issuer UI gone, real `customers` API wired, `customerId`/`customerSnapshot` persisted) but 2 High Priority functional gaps and Medium doc/naming issues, zero Critical. Fixed: (1) `customerSnapshot` was written but never read — `QuoteDocument.tsx` now seeds every Customer Information field from `quote.customerSnapshot` first, falling back to the quote's legacy top-level fields, then empty (the specified snapshot-first order), without a further live customer-master lookup (which would defeat the snapshot's whole purpose); (2) selecting a customer only conditionally copied `deliveryMethod`/`project`/`deliveryAddress` (only when truthy), leaving stale values from a prior customer/manual entry — now all nine fields are assigned unconditionally, including blanks. Also removed dead `IssuerCompanySnapshot`/`issuerDisplayFromProfile()`/`issuerDisplayFromSnapshot()` from `src/lib/companyProfiles.ts`, renamed the still-legitimate single-company header type `IssuerCompanyDisplay` → `CompanyHeaderInfo` and moved it to `src/lib/storage.ts` (next to its actual data source, `Company`, away from the Company Profiles module it kept getting confused with), and corrected several stale present-tense doc passages (`docs/MODULES/CompanyProfiles.md`'s "Quotation Integration" section and Audit Logging paragraph, `docs/CLAUDE.md`'s Company Profiles table row status label, `docs/MODULES/Quotation.md`'s "Customer Selection" section, plus doc comments in `companyProfiles.ts`/`auditLog.ts`/`company-profiles.ts`) that Codex read as presenting the removed issuer feature as still current. `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass clean. **Not done**: no live-database browser verification (same sandboxed-session limitation as every prior pass); Low Priority items (20-result client-side selector cap, chip showing only company name) deliberately left as-is per the review's own framing. Docs updated: this file, CLAUDE.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md, CODEX_REVIEW_REPORT.md ("Claude Fix Status" section).
- ✅ **[2026-07-14, correction pass] Removed the incorrect "Issuer Company" Quotation feature; built the correct Customer Management module.** The 2026-07-13 eleventh/twelfth-pass work wired a `CompanyProfile`-based "issuer company" selector into the Quotation form — built against a misunderstanding of the actual requirement (this ERP only ever has one issuer company). Fully reverted: `IssuerCompanySelector.tsx` deleted, the `companyProfiles`/`canViewCompanyProfiles`/`onNavigateToCompanyProfiles` props removed from `QuotationPage.tsx`/`QuoteDocument.tsx`, `resolveIssuerCompanyUpdate()` and every issuer-branch removed from `api/handlers/quotes.ts`, `Quote.issuerCompanyId`/`issuerCompanySnapshot` removed from the client type (old quote documents may still carry stray values, simply unread now). The [Company Profiles](./MODULES/CompanyProfiles.md) admin module itself was, at the time of this pass, untouched and still available for future use — it's just no longer read anywhere in the Quotation flow. **Superseded later the same day: the module itself was subsequently removed from the user-facing ERP too** (see the newer dated entry above and [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) "Removed (2026-07-14)") — a page for managing multiple issuer companies was unused scope once this ERP was confirmed to only ever need one. Built in its place: a real **Customer Management** module — `Customer`/`CustomerSnapshot` types (`src/lib/customers.ts`), a redefined `customers` MongoDB collection (replacing an unused 2026-07-09 CRM-flavored schema with one matching the Quotation form's actual fields), a `CustomersPage.tsx` admin list+form (nav "ลูกค้า"), 4 new permissions (`customers:view/create/edit/archive`), and a `CustomerSelector.tsx` on the Quotation form ("เลือกลูกค้า / บริษัท") that searches by company name/contact/phone/email/tax ID and autofills the Customer Information section — fields remain freely editable afterward and never write back to the customer master record. `POST/PATCH /api/quotes` and `POST /api/quotes/:id/workflow` gained `resolveCustomerIdUpdate()`/`buildCustomerSnapshot()`: `customerId` (optional) is validated server-side if sent, and `customerSnapshot` is **always** server-built from the submitted Customer Information fields (autofilled-then-edited or fully manual) — never client-supplied. Changing the linked customer on an existing quote is Draft-only, same rule the old issuer feature had. The new `/api/customers` routes shared the `company-profiles` serverless function (dispatched by pathname inside `api/handlers/company-profiles.ts`) rather than adding a 13th function file, since Vercel Hobby's 12-function cap was already reached — **superseded later the same day**: once Company Profiles was removed, `customers.ts` got its own dedicated `api/handlers/customers.ts` function file in the freed slot instead, still exactly 12 of 12 used. `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all pass clean. **Not done**: no live-database browser verification (same sandboxed-session network limitation as every prior pass — see Known Risks); no "บันทึกเป็นลูกค้าใหม่" (save-as-new-customer-from-the-quotation-form) convenience feature, explicitly flagged optional/future in the requirement. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Customer.md (rewrite), MODULES/Quotation.md, MODULES/CompanyProfiles.md.
- ✅ **[2026-07-14, second same-day pass] Dashboard Codex-review fix pass — Critical + High Priority.** An independent Codex review of the Pre-Tax Amount pass (`docs/CODEX_REVIEW_REPORT.md`) found 1 Critical and 3 High Priority issues, all fixed: (1) **Critical** — Sales Activity Analytics (`api/dashboard/index.ts`'s `salesActivity`) was gated behind `auditLog:view`, silently hiding the required section from the default Sales User/Approver/Viewer roles (all `dashboard:view`, none `auditLog:view`); fixed by computing it for any `dashboard:view` caller, while `activityTimeline` (the raw audit-log feed) correctly stays `auditLog:view`-gated. (2) **High** — Sales Activity ignored the date-range filter's `from`; fixed by bounding its query with `bangkokDayBoundsUtc(from, to)`, same as `activityTimeline` already did, with the section's caption now switching between "rolling trend" and "filtered to selected range" text depending on whether a filter is active. (3) **High** — an empty database replaced the entire page with one full-page `EmptyState`, hiding the required KPI cards instead of showing them at zero; fixed by removing that page-wide gate (every section already degrades gracefully per-widget) and adding a compact inline "no data yet" banner instead. Also fixed a folded-in Medium finding: Expected Sales's `isPotentialOpportunity` check is now strict `=== true`, not truthy. The remaining High finding (no soft-delete predicate on Dashboard quote queries) was addressed via documentation, not a code filter — confirmed by grep that `Quote` has no such field anywhere in its schema today, so filtering on one would be dead/speculative code; documented as a formal decision instead, with instructions for when a real field is eventually added. `tsc`/`lint`/`build` all pass clean; verified via a temporary isolated Playwright preview specifically targeting each finding (a "simulating a Sales User" render confirming Sales Activity Analytics now appears, both `dateFiltered` states, and the new compact banner) — all correct, zero console errors. Same sandboxed-session no-live-database limitation as every prior pass. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md, CODEX_REVIEW_REPORT.md's new "Claude Fix Status" section.
- ✅ **[2026-07-14] Dashboard Pre-Tax Amount pass.** A follow-up P'Keng/P'Kee requirement: every Dashboard monetary total must be pre-tax (before VAT), never `Quote.amount`'s persisted VAT-included grand total. Added `preTaxAmount(amount) = amount / 1.07` (`api/dashboard/index.ts`) — exact, not approximate, since `VAT_RATE` (7%) has always been a single fixed constant applied to every quote, never a per-quote override. Normalized `docs[].amount` once right after the filtered fetch, so every downstream KPI/pipeline/salesPerformance/customerAnalytics/jobTypeAnalytics/forecast/approval-pending-list computation inherits the conversion automatically; the two aggregations reading from separate queries (`revenueTrend`, `followUps`) convert explicitly at their own read sites. No response field renamed, only values changed. Every affected Thai/English label now says "ก่อนภาษี"/"(Before VAT)" — the 4 KPI card titles/helpers use the requirement's exact wording, `QuotationStatusSummary`'s value column is `มูลค่ารวมก่อนภาษี`, supporting-detail tables/charts/CSV headers gained a suffix. The required 4-card KPI summary, Win/Lose/Active/Non-Active status summary, and weekly/monthly/quarterly/yearly Sales Activity Analytics with a salesperson filter tracking new/edited quotation counts were already in place from the 2026-07-13 passes — this pass verified they were all present and focused solely on the amount-calculation rule. `tsc`/`lint`/`build` all pass clean; same sandboxed-session no-live-database limitation as every prior pass (see Known Risks) — verified instead via a temporary isolated Playwright preview of the real KPI/status-summary/activity components with mock data (deleted after use), confirming labels, values, and weekly/monthly/quarterly/yearly tab switching all render correctly with zero console errors. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.
- ✅ **[2026-07-13, twelfth same-day pass] Fixed Codex-review Company Profile header-integration issues.** An independent review of the eleventh pass (`docs/CODEX_REVIEW_REPORT.md`) found **zero Critical and zero High Priority issues** — the requested selector/snapshot/RBAC/audit/print flow was already correct end-to-end (confirmed: profiles persist in MongoDB, the selector renders with the exact Thai title, the id is included in the draft, the server resolves/validates/snapshots it, existing quotes display their snapshot first, no fake data or hardcoded header anywhere). It found one concrete, in-scope Medium-severity defect: the issuer display's fallback chain (`QuoteDocument.tsx`) skipped trying the default active company profile before falling back to the legacy `company` singleton, when a quote's `issuerCompanyId` referenced a profile that had since been deactivated/archived with no snapshot to fall back on. Fixed by inserting the default active profile as an intermediate fallback step (snapshot → referenced live profile → **default active profile** → legacy singleton), matching the review's exact requested order; `hasIssuerProfile` (driving the no-issuer warning) now also recognizes this fallback as a real, non-fake resolution. Also corrected a documentation-mismatch finding: stale "prep only, not yet wired" wording left in `src/lib/quotes.tsx`/`src/lib/companyProfiles.ts` doc comments and in `MODULES/CompanyProfiles.md`'s introductory paragraphs (which directly contradicted that same file's own later "Quotation Integration" section) — both now describe the live, wired-in integration, and the fallback-chain description was expanded to the accurate 4 steps. The review's remaining Medium/Low items (issuer still optional on Draft, full profile payload on the selector list, header-preview-as-card layout, English-address print variant, no dedicated default-profile endpoint) were left unchanged, each with a documented reason — they're existing business decisions, non-urgent optimizations, or explicitly out of this task's header-integration-only scope (no print-layout expansion, no live-database integration tests possible in this sandboxed session). `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `lint`, `build` all pass clean; verified via an isolated Playwright preview mounting the real `QuoteDocument` with a quote reproducing the exact Medium #1 scenario — confirmed the header now correctly shows the default active profile instead of the legacy singleton, with no warning banner, and the customer form below still works, at 1440px and 390px. See CHANGELOG.md for full detail. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md, CODEX_REVIEW_REPORT.md.
- ✅ **[2026-07-13, eleventh same-day pass] Wired Company Profiles into Quotation creation — company selection, server-frozen snapshots, Draft-only issuer changes, print/PDF integration.** Closes the gap the ninth/tenth passes deliberately left open. The Quotation form (`QuoteDocument.tsx`) now shows an `IssuerCompanySelector` above the customer section ("ออกใบเสนอราคาในนามบริษัท"): preselects the default (or sole) active company profile, requires an explicit choice among 2+, shows a permission-gated empty state with zero, and updates a live header preview (logo/name/address/phone/fax/email/website/tax ID/branch, blank fields hidden) the moment a different profile is picked. `POST/PATCH /api/quotes` and `POST /api/quotes/:id/workflow` (`api/handlers/quotes.ts`) gained `resolveIssuerCompanyUpdate()`: the client only ever sends `issuerCompanyId`; the server validates the referenced profile exists and is active/not-archived (`400` otherwise) and builds `issuerCompanySnapshot` from it server-side — never trusting a client-supplied snapshot, and never re-deriving it from a live profile after the fact, so editing a company profile's address/logo/etc. later cannot silently change what an already-saved quotation displays (same non-live-reference guarantee as `QuoteLine`/`Product` and `jobTypeCode`/`JobType`). Issuer changes are locked to Draft status (`400` otherwise) on both the plain edit and workflow-transition routes, with a distinct `"Quotation Issuer Company Changed"` audit entry (reusing `relatedCompanyProfileId`/`relatedCompanyProfileName`) written when `PATCH` specifically changes it. `PrintDocument.tsx` (the actual printed/PDF document) switched from a `company: Company` prop to `issuer: IssuerCompanyDisplay`, resolved by `QuoteDocument.tsx` through a snapshot → live-selected-profile → legacy-`company`-singleton fallback chain — so the printed header is never hardcoded, never blank, and never breaks for a quotation that predates this feature. `GET /api/company-profiles` was relaxed to accept either `companyProfiles:view` (full list) or `quotations:create` (active-and-not-deleted-only) so a Sales user can populate the selector without holding any Company Profile management permission. A quote with no issuer company resolved shows a warning banner but is **not** blocked from saving (a deliberate, documented choice — matches this app's existing Draft-tolerates-blank-fields pattern). `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all pass clean; verified via an isolated Playwright preview of the real `IssuerCompanySelector` component covering 0/1/2+ active profiles, the Draft-only locked state, and the no-issuer warning banner, at 1440px and 390px. **Known limitations, left deliberately undone**: `quotationPrefix`/`quotationNumberFormat` per company profile still don't compose with `nextQuoteId()`'s single global atomic sequence; no hard block on a Draft with no issuer selected; `handleWorkflow` doesn't (yet) write its own distinct issuer-change audit entry the way `PATCH` does; no live-database manual walkthrough (same sandboxed-network limitation as every pass this session). See CHANGELOG.md for full detail. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md.
- ✅ **[2026-07-13, tenth same-day pass] Fixed Codex-review Critical/High Company Profiles issues.** An independent review of the ninth pass's Company Profiles module found zero Critical issues (server-side RBAC is correctly enforced on every route) and 3 High Priority ones, all fixed: (1) a current default company could be deactivated without reassignment — PATCH now blocks it, matching the existing archive rule; (2) the one-default invariant was unsafe under concurrent requests — a new MongoDB partial unique index (`{isDefault:1}` where true) now guarantees it at the database level, with both create and set-default cleanly catching the resulting race instead of corrupting data or 500ing; (3) audit entries were client-authored and forgeable — moved server-side into `api/handlers/company-profiles.ts` itself (`writeCompanyProfileAuditEntry()`), with structured `relatedCompanyProfileId`/`relatedCompanyProfileName` linkage, mirroring the 2026-07-10 quotation audit-integrity fix. Separately (and more severe in practice than Codex's own Medium hedge on it): the ninth pass's unconditional `fetchCompanyProfiles()` call in `App.tsx`'s shared boot `Promise.all` broke sign-in for every role except Super Admin/Administrator (Sales User/Approver/Viewer lack `companyProfiles:view` by default, so the 403 rejected the whole boot fetch and — with no surrounding try/catch — left users stuck on the loading spinner forever) — fixed with a `.catch(() => [])` fallback. Also fixed several Medium/Low findings: an inactive first-created-and-thus-default profile, a missing deactivate confirmation dialog, missing createdBy/updatedBy in the detail view, blank bank-account rows being accepted, and icon-only buttons lacking `aria-label`s. Corrected 3 documentation claims the review caught as mismatched with the actual code (bank accounts capped at 10 not "unlimited," the default invariant's real database-level guarantee, audit entries now server-authoritative not client-triggered). `tsc`/`lint`/`build` all pass clean; verified via an isolated Playwright preview confirming the new deactivate-confirmation dialog and the detail view's user-name resolution (incl. correct fallback for a deleted account) both work. No live-database concurrency test was possible in this sandboxed session — flagged in TODO.md. See CHANGELOG.md for full detail. Docs updated: this file, CLAUDE.md, TODO.md, DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, and `CODEX_REVIEW_REPORT.md`'s new "Claude Fix Status" section.
- ✅ **[2026-07-13, ninth same-day pass] Added the Company Profiles module — multi-company quotation-issuer master data, prep only.** New admin module (add/edit/view/activate-deactivate/archive/set-default) for the business identities a quotation can eventually be issued under — company name/logo/address/tax ID/branch/bank accounts/quotation prefix-terms-footer/stamp. New `company_profiles` MongoDB collection (empty, no seed/fake data), new `api/handlers/company-profiles.ts` (the 12th and final Vercel function under the Hobby-plan cap), 6 new permissions (`companyProfiles:view/create/edit/archive/delete/setDefault`, deliberately **not** Super-Admin-locked like `company:manage` — Administrator can be granted broader access via Role Management), a sectioned create/edit form with client+server validation matching the requested exact Thai error copy, a searchable/filterable list, a read-only detail view, and a new sidebar entry under "การจัดการระบบ." Server-enforced default-profile invariants: the first profile ever created is auto-default, setting a new default atomically unsets the previous one, the current default can't be archived directly. **Deliberately not built this pass**: any Quotation-form integration — `Quote` gained two optional, currently-unused prep fields (`issuerCompanyId`/`issuerCompanySnapshot`, snapshot-at-issue-time by design) but nothing sets them yet; the pre-existing single-company `company` singleton (Settings → Company Info) remains the live source for the printed document. Extracted `src/components/ImageUploadField.tsx` from what was previously duplicated-in-waiting inside `SettingsPage.tsx`, now shared between Company Settings and this new module. `tsc`/`lint`/`build` all pass clean; verified via an isolated Playwright preview of the real list/form/detail components with mock data (a default profile with 2 bank accounts, an inactive profile, an archived profile) at 1440px and 390px — confirmed the exact empty-state copy, the exact required-field/format-validation error messages, the unsaved-changes discard dialog, and every status badge render correctly. No live-database click-through — same sandboxed-session network limitation as every pass this session. See CHANGELOG.md for full detail. Docs updated: this file, CLAUDE.md, TODO.md, DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, ARCHITECTURE.md, MODULES/CompanyProfiles.md (new), MODULES/Quotation.md.
- ✅ **[2026-07-13, eighth same-day pass] Fixed Codex-review High Priority Dashboard status/filter issues.** A follow-up independent review of the seventh pass's work found zero Critical issues (confirming the 4 required KPI cards, Expected Sales' `isPotentialOpportunity`-only rule, Sales Activity's weekly/monthly/quarterly/yearly views, the salesperson filter, Created/Edited activity counts, and "no fake data" were all already correct) and 3 High Priority issues, 2 fixed: (1) `QuotationStatusSummary`'s Win/Lose/Active/Non-Active donut/table was double-counting Lost quotations (`เสียโอกาส` was in both the Lose row and the Non-Active row), so the 4 rows' counts exceeded `totalQuotations` and the Percentage column didn't sum to 100% — fixed at the source (`NON_ACTIVE_OUTCOME_STATUSES` in `api/dashboard/index.ts` no longer includes Lost, since Lost already has its own row), making Win+Lose+Active+Non-Active a true partition everywhere those fields are used (the donut, `SalesPerformancePanel`, CSV export); (2) Sales Activity Analytics/Revenue Trend's "rolling trend" captions now state their actual anchor date ("— ending [date]", the filter's `to` or today) instead of a generic disclaimer. The third High Priority issue (department filtering as a fragile free-text name join) was deliberately left alone — fixing it needs a real `Department`/`salespersonUserId` schema change already tracked as a "Business decision needed" TODO item, wasn't named in this pass's explicit fix list (salesperson filtering was, and was independently confirmed correct), and isn't a quick fix. `tsc`/`lint`/`build` all pass clean; verified via an isolated Playwright preview with mock data constructed so the 4 status rows sum to exactly `totalQuotations` — confirmed percentages now sum to 100% (previously >100%) and both anchor-date captions render correctly, at 1440px and 390px. See CHANGELOG.md for full detail. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, MODULES/Dashboard.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.
- ✅ **[2026-07-13, seventh same-day pass] Dashboard completed against the P'Keng/P'Kee business-stakeholder requirement.** A detailed spec listing the exact required Dashboard content, exact Thai copy, and an exact 5-section page order (Header+Filters → Executive KPI Summary → Quotation Status Summary → Sales Activity Analytics → Recent Activity Details). Clarified one real conflict with the user before touching code — the spec's Win/Lose mapping would have counted "Customer Accepted"/"Customer Rejected" as Win/Lose, contradicting every other Win Rate/Closed Sales/Revenue Trend calculation on the page (which only count formally-closed ปิดการขายสำเร็จ/เสียโอกาส); user chose to **keep today's definition everywhere**, so no status-mapping logic changed. Delivered: exact-text corrections (page subtitle, Closed Sales label, Quotation Status Summary title/subtitle, Sales Activity subtitle); a one-line helper caption under all 4 `ExecutiveSummaryCards` (previously only Expected Sales had one); the page reordered to the exact required 5 rows, with `SalesPerformancePanel`/`ActivityFollowUpSummary`/`ExpectedSalesForecastChart` moved into "supporting detail" below (nothing deleted, same data); a genuinely new per-salesperson breakdown table in Sales Activity Analytics (ช่วงเวลา/พนักงานขาย/เปิดใบเสนอราคาใหม่/แก้ไขใบเสนอราคาเก่า/กิจกรรมรวม, `api/dashboard/index.ts`'s `salesActivity.bySalesperson`, bucketed via a nested Map, not a joined/split string, since Thai names contain spaces); `ActivityTimeline.tsx` rebuilt as a table with a clickable quotation-number link, backed by new optional structured `relatedQuoteId`/`relatedCustomerName` fields written by `writeQuoteAuditEntry()` on every quote-workflow audit entry (backward-compatible — older/non-quote entries render "—"); a new `{ action: 1, createdAt: -1 }` audit_log index for the wider 5-action Sales Activity scan. The requirement's suggested `quotations.salespersonId`/`departmentId`/`createdAt` indexes don't apply — this schema has no such fields (documented gaps, see TODO.md), so no phantom indexes were added. `tsc`/`lint`/`build` all clean; verified via an isolated Playwright preview of the real components with mock data (incl. 2 salespeople with space-containing Thai names, specifically exercising the bucketing fix) at 1440px and 390px. See CHANGELOG.md for full detail. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.
- ✅ **[2026-07-13, sixth same-day pass] Fixed all Codex-review High Priority Dashboard data/filter issues.** An independent follow-up Codex review found zero Critical issues (confirming the 4-card summary, funnel removal, Expected Sales, and sidebar fix are all already correct) and 4 High Priority data-correctness bugs, all fixed: (1) Sales Activity Analytics now tracks all 5 requested event categories (Created/Edited/Status Changed/Approval Requested/Approval Completed, was 2), rendered as a stacked bar chart; (2) the Sales Activity/Revenue Trend "rolling window ignores the filter's start date" behavior is now stated in the UI instead of silent; (3) every other deliberately-unfiltered widget (Products by Category, Notification Summary, the forecast's win-rate baseline) now says so explicitly rather than looking accidentally unfiltered; (4) `QuotationStatusSummary`'s count/value population mismatch fixed at the source — `api/dashboard/index.ts` now computes `lostValue`/`activeQuotationsValue`/`nonActiveQuotationsValue` with the *exact same* predicates as their matching counts, so the panel no longer approximates from `pipeline` data (that prop was dropped from the component). No filtering/business logic removed — only fixed a real inconsistency (#4) and added UI-visible labels (#2, #3) per the review's own suggested options. `tsc` (both frontend and `tsconfig.api.json`), `lint`, `build` all pass clean; verified via an isolated Playwright preview of the real components with mock data reflecting the new `DashboardKpis` fields, at 1440px and 390px. See CHANGELOG.md for full detail. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.
- ✅ **[2026-07-13, fifth same-day pass] Dashboard reordered into the full 7-section structure.** A fully-specified follow-up to the fourth pass, naming the exact 7 top-level sections and order wanted (Header+Filters, Executive Summary, Quotation Status, Sales Performance, Sales Activity Analytics, Tasks/Follow-up/Approvals, Recent Activities). `SalesActivityAnalytics` (existing component, unchanged internally) promoted from the "supporting detail" area up into the top overview, between Sales Performance and Tasks/Follow-up. `SalesPerformancePanel.tsx` gained Active/Non-Active Quotations (now 8 metrics, was 6) per the requested example table. Expected Sales helper text reworded to lead with the requested exact phrase while keeping the "regardless of status" accuracy qualifier. Verified already-true from prior passes: exact page title/subtitle match, the old broken funnel chart stays gone (`PipelineSteps.tsx`, the "Option A" horizontal-step-card replacement, untouched since 2026-07-10), sidebar/font fixes unchanged (confirmed via `git diff --stat`), every section already has its own empty-state guard (no fake data/broken charts). `tsc`/`lint`/`build` clean; verified via an isolated Playwright preview of all 7 real section components composed in the requested order, at 1440px and 390px. **Not done, flagged for a future pass**: Sales Activity Analytics still tracks only 2 event categories (Created/Edited) against the 5 named in the request (also Status Changed/Approval Requested/Approval Completed) — feasible (the underlying audit-log actions already distinguish these) but requires an `api/dashboard/index.ts` aggregation change with no live-data path to verify in this sandboxed session. See CHANGELOG.md for full detail. Docs updated: this file, CLAUDE.md, CHANGELOG.md, TODO.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.
- ✅ **[2026-07-13, fourth same-day pass] Dashboard overview simplified into 5 compact sections.** Further direct user feedback: even the flat 22-card `KpiGrid.tsx` from the pass below still "feels like a generated template... everything looks equally important." Explicit request: 4 primary KPI cards only, everything else reorganized into compact panels across 5 named sections (Executive Summary, Quotation Status, Sales Performance, Activity & Follow-up, Recent Work), with all existing calculations preserved. `KpiGrid.tsx` deleted; replaced by `ExecutiveSummaryCards.tsx` (4 cards: Total Quotations/Value, Closed/Expected Sales), `SalesPerformancePanel.tsx` (new — Win/Lose/Conversion Rate, Average Deal Size/Approval Time/Closing Time as a compact label/value grid), and `ActivityFollowUpSummary.tsx` (new — Pending Approvals/Overdue Follow-ups/Expired Quotations/New Customers as a compact clickable-where-possible tile row). `QuotationStatusSummary.tsx` gained a Percentage column. 4 fields (`totalCustomers`/`totalLeads`/`totalProducts`/`repeatCustomers`) no longer get individual dashboard tiles — not in the requested spec, still computed server-side unchanged, visible via `CustomerAnalytics.tsx`/the Products page instead. Page reorganized: the 5 requested sections now sit at the top in the requested order, everything that already existed (charts, pipeline, rankings, actionable approval/follow-up lists, notification summary) moved below an "In-Depth Detail" divider, content unchanged — none of it was the "too many large cards" complaint. Filter bar tightened (less padding, smaller controls). `tsc`/`lint`/`build` clean; verified via an isolated Playwright preview of the real components at 1440px/390px. See CHANGELOG.md for full detail. Docs updated: this file, CHANGELOG.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.
- ✅ **[2026-07-13, third same-day pass] Dashboard KPI hierarchy reverted to a flat grid.** Direct user feedback: the 2026-07-10 redesign's two-tier KPI cards (6 large "hero" cards + 9 dense mini-cards) "feels strange, too template-like, and not suitable for this ERP" — explicit instruction not to keep redesigning the Dashboard. Clarified scope with the user first (full technical revert, which would have dropped Sales Activity Analytics/Quotation Status Summary entirely since those didn't exist pre-redesign, vs. restyle-only keeping every current section) — user chose restyle-only. `PrimaryKpiCards.tsx` + `SecondaryKpiSummary.tsx` deleted, merged into one flat `KpiGrid.tsx` (uniform card size, single `grid-cols-2 xl:grid-cols-4` grid, matching the original pre-redesign visual style) — and as a bonus, restored 7 KPI fields (Lose Rate, Conversion Rate, Average Approval Time, Expired Quotations, New/Repeat Customers, Total Leads) that the redesign had silently stopped rendering even though the API never stopped computing them, so the grid now shows all 22 available metrics again (was 15). `QuotationStatusSummary`, `PipelineSteps`, `SalesActivityAnalytics`, all charts/tables/rankings/approvals/follow-ups were explicitly **not** touched — those aren't the "huge KPI card" complaint and the user asked to keep them working. The sidebar-overflow/mobile-drawer/font fixes from the two prior same-day passes were already correct and needed no rework (confirmed via `git diff --stat` showing zero changes to those files). `tsc`/`lint`/`build` all pass clean; verified via an isolated Playwright preview of the real `KpiGrid` component at 1440px and 390px. Docs updated: this file, CHANGELOG.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.
- ✅ **[2026-07-13, second same-day pass] Codex UI/UX review — Critical + High Priority fixes.** An independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the sidebar-overflow pass earlier the same day confirmed that fix but found 3 Critical + 5 High Priority issues on top of it: no responsive mobile sidebar (a permanent 256px/64px rail on any screen size), a topbar that didn't degrade below ~900px, 7 unqualified two-column grids in the quotation editor (plus more in the admin/setup forms), overly dense/mono-heavy typography, truncated text with no full-value fallback, and page headers that didn't wrap. All fixed this pass: a real off-canvas mobile drawer (backdrop, Escape-to-close, `md:` breakpoint), a topbar that hides non-essential chrome progressively (`sm:`/`lg:` breakpoints) instead of clipping, every flagged form grid converted to `grid-cols-1 sm:grid-cols-2`, a centralized `--font-sans` design token (plus a latent bug fix — `font-mono` was never actually wired to JetBrains Mono despite being imported and documented as the numbers/codes font), a collapsible Dashboard secondary-KPI section, `title=` tooltips on every flagged truncated element, and `flex-wrap` page headers across 5 admin/quotation list pages. `tsc`/`lint`/`build` all pass clean; verified via a second isolated Playwright preview harness at 390/768/820/1280/1440px (the 820px check caught a real bug — the topbar user-name block was wrapping into 4 lines at that width — fixed by moving its breakpoint from `md:` to `lg:`). Medium/Low findings (decorative search, hover-only delete, non-functional "Remember me", non-semantic notification rows, no focus-visible audit) intentionally deferred, not defects introduced by this pass. See [CHANGELOG.md](./CHANGELOG.md) for the full itemized list. Docs updated: this file, CHANGELOG.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.
- ✅ **[2026-07-13] Sidebar header overflow fix + typography/overflow pass.** Fixed the reported bug: `BrandMark.tsx`'s "Thai Chemicals Storage ERP" wordmark used `whitespace-nowrap` with no truncation/wrap fallback, so it rendered past the sidebar's edge instead of wrapping — now wraps to 2 lines cleanly (`break-words line-clamp-2`) at expanded (256px), collapsed (64px), and mobile (390px) widths, verified visually via an isolated Playwright preview harness (deleted after use — the full app can't reach `bootStatus: "ready"` in this sandboxed session without a live backend, same limitation as every prior pass). Sidebar nav labels now truncate with ellipsis instead of silently overflowing; collapsed nav buttons gained hover tooltips; the sidebar now defaults to collapsed on load on narrow viewports (`window.innerWidth < 768`) rather than always expanded. Added `Noto Sans Thai` as a font-family fallback everywhere `Inter`/`Playfair Display` are set (body text and all 31 heading call sites) — Thai text inside Playfair Display headings was previously falling back to an arbitrary browser serif at a mismatched weight; now renders in Noto Sans Thai consistently. Base body line-height raised to 1.6. Fixed 4 tables (`QuoteList`/`ProductList`/`AuditLogPage`/`UserManagementPage`) that were missing the `overflow-x-auto` wrapper every other table already had, plus added truncation+tooltips to long client/product-name columns. `tsc`/`lint`/`build` all clean. **Not done**: no real off-canvas mobile drawer nav (explicitly out of scope, see UI_GUIDELINES.md "Responsive Rules"); no full accessibility audit. Docs updated: this file, CHANGELOG.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.
- ✅ **[2026-07-10, fifth pass] Audit integrity + workflow gap fix pass.** Responds to an independent Codex re-review's Critical/High findings. Quotation audit-log entries (Created/Updated/Submitted/Approved/Rejected/Status Changed) are now written server-side by `api/handlers/quotes.ts` itself from the authenticated session, not by the client calling the generic `POST /api/audit-log` after the fact — which any authenticated caller could previously bypass to forge fake entries, corrupting the Dashboard's Sales Activity Analytics (which counts exactly those `action` strings from `audit_log`). `POST /api/audit-log` now rejects the `"ใบเสนอราคา"` module outright. Reject/Customer-Reject/Cancel workflow actions now require a non-empty comment server-side (previously UI-only). Added the 3 workflow notifications (Won/Lost/Cancelled) that a quote's creator previously never received. `tsc`/`lint`/`build` all clean; `vercel dev` + a Playwright check confirmed no new console errors (same pre-existing MongoDB DNS limitation as every prior pass, reproduced a fourth time) and surfaced one unrelated pre-existing gap (logged in TODO.md, not fixed here — see Known Risks). See [CHANGELOG.md](./CHANGELOG.md) and [CODEX_REVIEW_REPORT.md](./CODEX_REVIEW_REPORT.md)'s "Claude Fix Status — Addendum Follow-up" for the full itemized list. Docs updated: this file, CHANGELOG.md, TODO.md, IMPLEMENTATION_CHECKLIST.md, CLAUDE.md, MODULES/{Quotation,Notifications,AuditLog,Dashboard}.md.
- ✅ **[2026-07-10, fourth pass] Dashboard UI/UX redesign + app-wide UX enhancement pass.** Two combined requests: a full Dashboard visual/layout redesign, and a broader "make the ERP easier for a first-time employee to use" pass. See [CHANGELOG.md](./CHANGELOG.md) for the itemized list. Highlights: the previous flat ~20-card KPI grid split into `PrimaryKpiCards`/`SecondaryKpiSummary` (6 headline metrics vs. everything else, in clearly different visual weights); the `recharts` `FunnelChart` pipeline (overlapping Thai labels) replaced with `PipelineSteps.tsx` (connected horizontal step cards); a new consolidated `QuotationStatusSummary` (Win/Lose/Active/Non-Active); a new `SalesActivityAnalytics` section (quotation Created/Updated trend, weekly/monthly/quarter/yearly); the whole page reordered into the requested section order with 3 redundant charts removed (not just reordered — the `DashboardPage` bundle chunk actually shrank, from ~505KB to ~478KB, below Vite's 500KB warning for the first time). App-wide: new shared `EmptyState`/`PageHeader`/`MetricInfoTooltip` components, sidebar nav regrouped into Main/Sales/Inventory/Administration, a `driver.js`-powered guided tour (Start/Skip banner + restartable from a new "Help" menu item), required-field indicators + inline client-side validation on the Quotation/Product/User forms, and an unsaved-changes browser warning on the Quotation form. `tsc`/`lint`/`build` all pass clean; a Playwright pass confirmed the client bundle (incl. the new components and `driver.js`) loads with zero unrelated console errors, but full live-data browser verification remains blocked by the same sandboxed-network limitation as the prior two passes (see Known Risks). Explicitly **not** done this pass (see CHANGELOG.md "Not done" for the full list): onboarding tour steps for modules that don't have pages yet (Leads/Customers/Approvals), `PageHeader` rollout beyond the Dashboard, a full accessibility audit, in-app (non-browser) unsaved-changes interception. Docs updated: this file, CHANGELOG.md, TODO.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, CLAUDE.md, MODULES/Dashboard.md.
- ✅ **[2026-07-10, third pass] Codex review fix pass — quote validation, Dashboard filter honesty, RBAC/upload hardening, doc accuracy.** An independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) audited the app end-to-end and found 2 Critical + 6 High + 6 Medium issues; all Critical/High and the safely-scoped Medium items are fixed — see [CHANGELOG.md](./CHANGELOG.md) for the itemized list. Highlights: `api/_lib/quoteValidation.ts` (new) validates every quote field server-side and always derives `amount` from `lines`/`discount` (never client-writable); the Dashboard's Customer Interest panel and Activity Timeline now genuinely respect the active filters (previously silently didn't); Job Type is now required and server-validated on new quotes; Expected Sales now matches its literal documented rule; a Dashboard CSV export exists; notification clicks deep-link to the specific quote; quotation numbering is now atomic (`counters` collection); uploads are validated (MIME/size). Four module docs (`RoleManagement.md`/`Settings.md`/`UserManagement.md`/`Notifications.md`) that still described the pre-2026-07-09 client-only architecture were corrected. `tsc`/`lint`/`build` all pass clean; live verification blocked by the same sandboxed-network limitation as the prior pass (see Known Risks). Docs updated: this file, CHANGELOG.md, TODO.md, DATABASE.md, API.md, RBAC.md, IMPLEMENTATION_CHECKLIST.md, the 4 module docs above, MODULES/Quotation.md, MODULES/Dashboard.md, and `CODEX_REVIEW_REPORT.md`'s new "Claude Fix Status" section.
- ✅ **[2026-07-10, second pass] Dashboard completion pass — closes the gap against the full Executive Dashboard business spec.** A full audit (read-only, comparing the actual code against the documented requirements rather than trusting the prior pass's own summary) found the first Dashboard rebuild was substantial but genuinely incomplete against the spec in specific, verifiable ways — all fixed this pass:
  - **Pending Approvals**: new `kpis.pendingApprovals` KPI card (visible to any `dashboard:view` holder, distinct from the approvers-only detail view) + a real actionable list on the Approval Dashboard widget (Quotation No./Customer/Salesperson/Amount/Submitted Date) with inline Approve/Reject buttons, reusing the same `performWorkflowAction()`/`POST /api/quotes/:id/workflow` the Quotation module's own approval UI calls. Reject requires a comment (inline textarea), matching the existing workflow rule. Gated by `quotations:approve` (list) and `quotations:reject` (Reject button specifically, server-computed as `canReject`).
  - **Non-Active Jobs** KPI added, and **Active Jobs** redefined to also exclude expired-but-unclosed quotes — matching the spec's Active/Non-Active definitions instead of the previous Active/Expired-only pair.
  - **Average Closing Time** now averages both Won *and* Lost outcomes (previously Won-only), matching the spec's literal "time between creation and Won/Lost status."
  - **Total Quotation Value** exposed alongside Won Value on Sales Performance, Customer Analytics, and Job Type Analytics (previously only the Won subset was returned, under-reporting real pipeline value) — all three tables were also expanded to their full spec column set (e.g. Sales Ranking gained Lost/Pending/Avg. Deal Size/Total Value, all sortable; Customer Analytics gained Last Quotation Date + a 4th "Most Repeat" ranking tab; Job Type Analytics gained Avg. Deal Size and became a real sortable table).
  - **Revenue Trend** gained a weekly/monthly/quarterly/yearly grouping toggle (was monthly-only) — new `revenueTrend` API field, bucketed server-side from the same underlying won-quote rows.
  - **Job Type Distribution** chart added (quotation *count* by job type — previously only revenue-by-job-type existed); **Revenue by Job Type** now shows Total + Won Value as grouped bars for *all* active job types (previously a top-10-cutoff revenue-only chart that could silently hide real job types).
  - **Department filter** added (`User.department`, free text, joined to `Quote.salesperson` — documented caveat, no real Department entity exists yet) — composes with the salesperson filter rather than one overwriting the other.
  - **Follow-up Reminders** now respects the date-range filter (previously deliberately date-range-agnostic); Revenue Trend/Monthly Closing Rate/forecast baseline's trailing window now anchors its *end* to the selected `to` date (or today) rather than always "now," so the date filter measurably changes their query too, without collapsing a multi-point trend chart to a single day.
  - Two new MongoDB indexes (`isPotentialOpportunity`, `client` on `quotes`) — created defensively inside the Dashboard route itself (once per warm serverless instance), since `ensureIndexes()`'s one-time Setup Wizard path is unreachable on an already-provisioned deployment and would otherwise never actually run in production.
  - `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all clean. **Live browser/API verification against real data could not be completed** — see Known Risks for the specific, reproducible environment limitation (not a defect in this pass's code).
  - Docs updated: this file, CHANGELOG.md, TODO.md, DATABASE.md, API.md, MODULES/Dashboard.md, IMPLEMENTATION_CHECKLIST.md, SESSION_LOG.md.
- ✅ **[2026-07-10] Executive Dashboard, Sales Analytics & Job Type pass** — implemented and passing `tsc`/`lint`/`build` clean; **not yet verified against live data in a browser** (see Known Risks below for why, and what's needed to close that out):
  - **Job Type master data**: new `job_types` MongoDB collection (13 seeded defaults — TA, STA, LI, SC, BF, GA, BI, VT, WTP, OTHER TA, OTHER SC, OTHER BF, OTHER), `GET/POST/PATCH /api/jobtypes` (`quotations:view` to read, `company:manage` to manage — no new `Permission` added), `src/lib/jobTypes.ts`. Every quotation now carries `jobTypeCode`/`jobTypeName` (snapshotted, not a live reference), shown/edited on the form, filterable/searchable in the list, printed on the PDF.
  - **Potential Opportunity** checkbox and **Follow-up Date** field added to `Quote` — feed the Dashboard's Expected Sales KPI/forecast and Today/Overdue/Upcoming follow-up reminders respectively.
  - **Dashboard fully rebuilt** into a real Executive BI page: ~20 KPIs (up from 7), a sales pipeline funnel with click-through to a filtered quotation list, date-range + salesperson filters, Sales Performance table + Executive Ranking (top 10, sortable), Job Type and Customer analytics, a live-computed sales forecast, follow-up reminders, an approval dashboard (approvers only), a notification summary, an activity timeline (`auditLog:view` holders only), and 9 charts (revenue trend, quotation trend, sales-by-employee, revenue-by-job-type, status donut, win/lose donut, expected-sales forecast, monthly closing rate, products-by-category) — all live MongoDB aggregation, zero hardcoded/template values, `DashboardPage.tsx` split into 13 subcomponents under `src/pages/dashboard/`. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) for the full breakdown and the documented data-model simplifications (pipeline starts at "Draft" not "Lead"; customer analytics group by free-text client name; a couple of charts are best-effort approximations) — these were deliberate scoping decisions, not oversights.
  - **Deliberately deferred**: Report Export (PDF/Excel/CSV — needs a new dependency, should be built against this now-stable shape) and real Lead/Customer entities (already a separately tracked, much larger backlog item) — both explicitly scoped out of this pass rather than attempted and left half-done.
  - A lightweight `quotationListFilter` was lifted to `App.tsx` so Dashboard pipeline/follow-up clicks open a pre-filtered quotation list — full per-quote deep-linking (the pre-existing `QuotationPage` view/selectedId gap) is still not done.
  - Docs updated per the standing rule: this file, CHANGELOG.md, TODO.md, DATABASE.md, API.md, RBAC.md, MODULES/Quotation.md, MODULES/Dashboard.md (full rewrite), CLAUDE.md.
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

- **Live-data verification of the 2026-07-10 Executive Dashboard/Job Type pass** — `tsc`/`lint`/`build` all pass clean. A full 10-angle multi-agent code review of the feature was completed 2026-07-10 (see CHANGELOG) and found/fixed 10 real bugs (a systemic timezone bug affecting every date computation, a filter-coverage gap on 2 chart aggregations, a KPI/panel disagreement, a stuck-loading-forever regression, an empty-state gate conflating "no results for this filter" with "no data at all," falsy-zero display bugs across 4 widgets, a Job Type snapshot that was silently overwriting itself, a Dashboard-click-through filter that was lost after opening one quote, a seed-data race condition, and a misplaced type). All fixes verified via `tsc`/`lint`/`build`. **What the review could not do**: exercise the feature in a real browser against real MongoDB data — no local DB credential and no safe non-production environment were available in that session. Needs either the user to test locally/on a preview deploy, or explicit sign-off to test against production with cleanup.

## Pending Features

- Lead Management module — **schema only** as of 2026-07-09 (`leads`/`lead_activities` collections + indexes exist, no API routes/UI) — see [MODULES/Lead.md](./MODULES/Lead.md)
- ~~Customer Management module — schema only~~ — **built 2026-07-14** (redefined the unused schema, added API/UI/Quotation-selector integration), see [MODULES/Customer.md](./MODULES/Customer.md)
- ~~Full app-wide Thai/English translation~~ — **done 2026-07-09** (same-day follow-up pass), see CHANGELOG
- `product_templates` collection semantics are a starting interpretation, not confirmed — needs sign-off before UI is built against it
- Departments/positions seed list (ฝ่ายขาย/ฝ่ายจัดซื้อ/etc.) is a generic placeholder, not the real org structure — not yet wired into `User.department`/`User.position` (still free text)
- Company bank account info, VAT rate, and Terms & Conditions are now editable fields on `Company` (Settings → Company Info, Super Admin only), but `Company.vatRate` is **not yet wired into the actual tax calculation** — `lib/quotes.tsx`'s `computeTotals()` still uses a fixed 7% constant. Low-risk, deliberately deferred (see [TODO.md](./TODO.md)).
- Two-level sequential approval (Approver Level 1 must approve before Level 2 can) is **not implemented** — both approver roles can independently approve/reject from "Pending Approval"; they're differentiated by seniority/assignment, not an enforced sequence.
- Notification click only navigates to the quotation **list**, not the specific quote's detail view — `QuotationPage`'s `view`/`selectedId` state isn't lifted to `App.tsx`, so deep-linking to a record isn't wired yet. (A narrower `quotationListFilter` **was** lifted 2026-07-10 for the Dashboard's pipeline/follow-up click-through — that only pre-applies a list filter, not a specific-record deep link; the notification-click gap itself is unchanged.)
- Report Export (PDF/Excel/CSV) for the Dashboard — explicitly deferred from the 2026-07-10 pass; needs a new dependency for Excel and a new print layout for PDF, should be built against the now-stable dashboard response shape.
- Product Library has module-level (sidebar) permission gating but **not** button-level gating (create/edit/delete buttons inside Products aren't yet hidden per `products:create`/`products:edit`/`products:delete` — only the sidebar entry respects `products:view`).
- Dashboard's "ส่งออกรายงาน" (export report), "+ สร้างคำสั่งซื้อ" (create order), "ดูทั้งหมด" (view all orders) — reference an Orders/Reports module that doesn't exist yet, left inert by design
- Global header search — decorative, not wired to any data
- HR, Accounting, Inventory, Warehouse, Purchasing, Project Management modules — not started

## Upcoming Milestones

1. **Lead & Customer Management module** — the original "Phase 1" scope from the initial ERP spec, still outstanding. Now the single largest untouched bucket, since the backend migration closed the other big one.
2. Close the remaining honest gaps from the backend migration: ~~add login rate limiting~~ (done 2026-07-29), ~~set up CI~~ (done 2026-07-29), ~~verify GitHub auto-deploy~~ (confirmed in practice), add automated tests for the new API layer (**started 2026-07-29** — 55 tests incl. a login integration test; per-route HTTP coverage still open), ~~rotate the MongoDB Atlas credential that was pasted into an AI chat session~~ (**moot as of the ~2026-08-07 server migration** — Atlas isn't used in production anymore) — see [TODO.md](./TODO.md) High Priority.
3. Wire `Company.vatRate` into `computeTotals()`, add button-level permission gating to Product Library, and lift `QuotationPage`'s selected-quote state to `App.tsx` so notifications can deep-link to a specific quote.

## Current Sprint

No formal sprint tracked yet — work has proceeded feature-by-feature per direct request. This section will start being populated once work resumes.

## Next Sprint

Not yet planned.

## Known Risks

- **The 2026-08-14j Service create-without-template + detail-field change has not been exercised against a live browser/database** — verified via `tsc`/`lint`/`build`/`test` (152/152) and code review only. Specifically unverified: choosing "ไม่ใช้ Template" and creating actually produces a report with one empty "general" section, and "+เพิ่มหัวข้อ"/"+เพิ่มรายการ" successfully build out a checklist from there; a template-less report saves/reopens/prints without error (print document only reads `sections`, never `templateName`, so this should be safe, but genuinely unconfirmed); the detail textarea's neutral (non-red) styling and generic placeholder actually render correctly for Normal items. See [CHANGELOG.md](./CHANGELOG.md) 2026-08-14j.
- **The 2026-08-14h Service checklist photo/kind-switch change has not been exercised against a live browser** — verified via `tsc`/`lint`/`build`/`test` (152/152, no test exercises this UI) and code review only. Specifically unverified: attaching a photo to a Normal item actually uploads and displays correctly (the upload route/handler were already exercised by the pre-existing Abnormal path, so this is low-risk, but genuinely unconfirmed for the Normal case specifically); the kind-switch toggle correctly re-renders the row (checkbox pair ↔ measurement input) without losing whatever was already entered; switching an item to `measurement` kind and back to `normalAbnormal` preserves its previously-recorded status/photos exactly. See [CHANGELOG.md](./CHANGELOG.md) 2026-08-14h.
- **The 2026-08-14g Quotation numbering format change (`Q#YYMMDD-NNNN`) has not been exercised against a live browser/database** — verified via `tsc`/`lint`/`build`/`test` (152/152) and code review only. Specifically unverified against real data: creating a quote actually produces `Q#YYMMDD-0001` on the first quote of a real day and increments correctly for a second same-day quote; the counter genuinely resets on an actual day boundary (Bangkok-local midnight); Rewrite on a new-format id still produces `Q#YYMMDD-NNNN-R1` correctly; the client-side create-screen preview (`src/lib/quotes.tsx`'s `nextQuoteId()`) shows a number that's at least plausible (it's a preview, not authoritative, so exact match to what the server reserves isn't guaranteed under concurrent creates — same caveat the old implementation already had). See [CHANGELOG.md](./CHANGELOG.md) 2026-08-14g.
- **The 2026-08-14f Dashboard filter-bar layout fix (department/salesperson + VAT toggle grouping) is not yet re-checked in a live browser** — fixed via `tsc --noEmit` reasoning about the CSS (two sibling `sm:ml-auto` flex children merged into one shared container) plus the earlier session's screenshot as the repro, but no follow-up screenshot confirmed the fix visually. See [CHANGELOG.md](./CHANGELOG.md) 2026-08-14f.
- ~~**No rate limiting on login**~~ — **closed 2026-07-29**: `POST /api/auth/login` now throttles via the TTL-purged `login_attempts` MongoDB collection (≥5 failures/identifier or ≥20/IP per 15 min → 429 + `Retry-After`). Not yet verified against the live deployment (see [TODO.md](./TODO.md)). See [RBAC.md](./RBAC.md) Known Gaps.
- ~~**A MongoDB Atlas database-user password was pasted into an AI chat session** during the 2026-07-09 backend migration's development.~~ — **moot as of the ~2026-08-07 server migration, confirmed 2026-08-17**: production no longer uses MongoDB Atlas at all — the self-hosted VPS talks to a self-hosted MongoDB instead. Not yet separately confirmed: whether the self-hosted MongoDB's own root credentials have ever been exposed the same way. See [TODO.md](./TODO.md).
- **No true session revocation**: sessions are JWTs (httpOnly cookie, 7-day **rolling** expiry since 2026-07-31 — see [RBAC.md](./RBAC.md)), not database-backed — a still-active account's leaked/stolen token remains valid until natural expiry (and, since expiry now slides on activity, an actively-replayed leaked token no longer dies after a fixed 7 days); only a *deactivated* account is locked out immediately (every request re-checks `status` against MongoDB). Low risk in practice (httpOnly, never exposed to XSS-readable JS) but worth knowing precisely. See [RBAC.md](./RBAC.md) "What Was Achieved vs. the Old Proposed Design."
- **Automated test coverage is partial** (was "none" until 2026-07-29): a first real vitest suite (55 tests, `tests/`, `npm test`) now covers quotation money math (incl. client/server formula parity), default-role RBAC grants + permission edge cases, the quotation workflow state machine + per-action authorization, ownership rules, revision-chain parsing/dedup, Scope of Work validation, and a full `/api/auth/login` integration test (bcrypt/JWT/rate limiting against an in-memory MongoDB) — and CI runs it on every push/PR (`.github/workflows/ci.yml`, notify-only: it doesn't block the Vercel auto-deploy). Still uncovered: HTTP-level guards on every route other than `/api/auth/*`, products CRUD helpers, all UI components. See [TODO.md](./TODO.md).
- **RBAC permission model is real but hardcoded**: the `Permission` union (45 keys as of 2026-07-29) is still a TypeScript union, not admin-creatable rows — adding a genuinely new permission still requires a code change and redeploy, even though roles/permission-assignment are fully admin-editable at runtime. Not a security risk, but a scaling limitation worth knowing. See [RBAC.md](./RBAC.md).
- **Scope of Work (2026-07-15, incl. the same-day Codex-review fix pass) is unverified against a live deployment/browser** — same sandboxed-session no-live-database limitation as every prior pass (see the entry two lines below). `secondaryCode`'s business *meaning* is also still an open, explicitly-flagged question (its presence is now required, per the fix pass, but not its meaning), not a code defect — see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) and [TODO.md](./TODO.md).
- **Scope ambiguity**: the long-term ERP vision (multi-department, many more modules) is far larger than what exists today. Expectations should be managed against [CLAUDE.md](./CLAUDE.md)'s "Current Development Phase" section.
- **All five 2026-07-10 Dashboard/Quotation passes remain unverified against live browser/data**: `tsc`/`lint`/`build` pass clean every time and the code was carefully self-reviewed (each successive pass additionally ran a read-only audit against the actual code — not the prior pass's own summary — and found/fixed real gaps), but no session has managed a full live browser click-through yet. The first pass had no local DB credential/safe test environment available at all. The second through fifth passes **did** have local credentials (`.vercel/.env.development.local`, pulled via a prior `vercel link`) and got as far as running `vercel dev` locally with the real API — but every MongoDB-touching route 500'd all four times with `querySrv ECONNREFUSED _mongodb._tcp.tcsdb.zdnus3w.mongodb.net`: the sandboxed session's Node process cannot resolve MongoDB Atlas's `mongodb+srv://` DNS SRV record, even though the OS-level `nslookup` resolves it fine and raw TCP to the resolved shard host succeeds — reproduced identically on a pre-existing, untouched route (`GET /api/auth/session`) all four times, confirming it's a persistent environment/network limitation, not a defect in any pass's code. The fourth and fifth passes additionally used Playwright to confirm the client bundle itself loads and initializes with zero unrelated console errors up to the login gate, which is the most this environment can verify without real data access. The fifth pass's browser check also surfaced a real, pre-existing, unrelated gap: `App.tsx`'s session-fetch boot effect has no error handling, so the app gets stuck on its loading spinner instead of falling back to the sign-in screen when that fetch throws — logged in [TODO.md](./TODO.md), not fixed (out of scope for a Critical/High-issues fix pass). Treat all Dashboard/Job Type/Quotation-validation/UX-redesign/audit-integrity functionality as implemented-and-carefully-reviewed-but-not-yet-battle-tested until a live pass (e.g. from an unrestricted network, or against a Vercel preview deployment) confirms it end-to-end.
- **Customer analytics (Dashboard) group by the free-text `Quote.client` string**, not a real Customer entity — name variations/typos will undercount repeat customers and split one real customer across rows. Documented in [MODULES/Dashboard.md](./MODULES/Dashboard.md), not silently assumed; will resolve once real Lead/Customer entities exist. Dashboard **department filtering has the same free-text-join limitation** against `Quote.salesperson`/`User.department` — see [TODO.md](./TODO.md) "Business decision needed" items for what a real fix requires.
- **`GET /api/users` exposes the full user directory (PII, no secrets) to any authenticated user** — re-assessed by the 2026-07-10 Codex review rather than blindly restricted, since the app relies on the full directory in ways a naive fix would likely break. Tracked as an explicit business-decision item in [TODO.md](./TODO.md), not a silent gap.
- **Quotation Rewrite/Revision (2026-07-22) is unverified against a live deployment/browser** — same sandboxed-session no-MongoDB-network limitation as every prior pass above. `tsc`/`lint`/`build` pass clean and the client bundle loads with zero console errors, but the 8 manual test scenarios in the original feature request (first/second/third rewrite, data-copy fidelity, original-record integrity, repeated-click guard, RBAC, error handling) have not been click-through-verified against real data. See [MODULES/Quotation.md](./MODULES/Quotation.md).
- **The Dashboard revision-chain de-duplication fix (2026-07-22) is unverified against real rewritten quotation data in a live deployment** — same sandboxed-session limitation. The dedup logic itself was sanity-checked via a synthetic throwaway script, and every downstream widget's arithmetic is unchanged (only which documents feed it changed), but the actual end-to-end numbers (e.g. total pre-tax value with a real rewrite chain in the data) have not been confirmed against a live MongoDB instance. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Revision Chain De-duplication."
- **`quotations:viewAll` (2026-07-22) requires a manual Role Management step this production deployment has not had yet** — until a Super Admin checks it for Administrator/Approver Level 1/Approver Level 2/Viewer, those roles' *existing* users will see only their own quotations after this ships (since `defaultRoles` isn't re-applied to already-seeded role documents), breaking approvers' ability to see quotations they need to review. This is a required action item, not a passive risk — see [TODO.md](./TODO.md) High Priority (top item) and [RBAC.md](./RBAC.md) "Quotation Own-Quotes-Only Viewing."
- **The new Scope of Work standalone page (2026-07-22) is still not fully verified against a live deployment** — the list page did reach real production data once and crashed (see the fix entry above, now resolved and re-confirmed in a harness); the list↔detail navigation and reusing `ScopeOfWorkDocument.tsx` outside its original Quotation-embedded context still haven't been exercised against real data from this sandboxed session. Worth a real click-through once network access allows it, precisely because the list page alone already surfaced one real bug. See [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).
- **Scope of Work's new Rewrite action (2026-07-22) is unverified against a live deployment/browser** — same sandboxed-session no-MongoDB-network limitation as Quotation's own Rewrite feature above. `tsc`/`lint`/`build` pass clean and the button's wiring/gating was verified by code inspection against the already-shipped, already-verified Duplicate button, but the actual end-to-end scope-number-revision/audit-log/data-copy behavior has not been click-through-verified against real data. See [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

## Technical Debt

- Print/PDF's repeating header is identical on every page rather than shrinking after page 1 (a browser print `<thead>` can't vary content by page number), and "Page X/Y" numbering isn't implemented (no reliable cross-browser way to read total page count from CSS in browser print/PDF) — both accepted simplifications, see [MODULES/Quotation.md](./MODULES/Quotation.md).
- Company logo/stamp/profile-picture/signature images are stored as base64 data URLs (now inside MongoDB documents rather than `localStorage`), still capped at 1MB each client-side before upload — fine at current scale, but doesn't scale to a real object-storage (e.g. S3/Vercel Blob) approach; revisit if image volume/size grows.
- `Company.vatRate` is stored and editable but not yet read by `computeTotals()` — the 7% VAT calculation is still the `VAT_RATE` constant re-exported by `lib/quotes.ts` from `lib/quoteMath.ts`.
- `quoteWorkflow.ts` (`api/_lib/`) is a deliberately duplicated copy of the workflow state machine in `src/lib/quotes.ts` — the two must be kept in sync by hand if the workflow ever changes; a genuine, documented maintenance burden. **The stated reason changed on 2026-08-25**: it used to be "the source file has JSX", which stopped being true when `statusIcon` moved out and `quotes.tsx` became `quotes.ts`. What remains is weaker — importing the frontend module by value would pull `apiClient.ts` into a Node function for three constants — so collapsing the duplicate is now a real option. See [ARCHITECTURE.md](./ARCHITECTURE.md).
- ~~No explicit MongoDB indexes beyond the default `_id` index~~ — **fixed 2026-07-09**: real indexes now exist across every collection (`ensureIndexes()`, `api/_lib/collections.ts`). See [DATABASE.md](./DATABASE.md).
- bcrypt cost factor is 10 (bcryptjs's default), not explicitly tuned during migration — worth a conscious revisit against login-latency budget.
- No sequential two-level approval enforcement (Approver Level 1 → Level 2) — both approver roles can approve independently from "Pending Approval".
- Notification clicks navigate to the quotation list, not the specific quote — deep-linking needs `QuotationPage`'s view state lifted to `App.tsx`.
- Product Library lacks button-level (create/edit/delete) permission gating — only its sidebar entry (`products:view`) is gated.
- ~~`salesTeam` (sales leaderboard data) is shared, static sample data~~ — **removed 2026-07-09** along with the fake Dashboard sales leaderboard that used it; `QuoteList.tsx`'s salesperson avatar now uses a deterministic hash-based color, no fake roster.
- ~~No automated tests exist anywhere in the project~~ — **first suite landed 2026-07-29** (55 vitest tests incl. an in-memory-MongoDB login integration test, run by CI); route-level/UI coverage still open, see TODO.md.
- ~~No CI pipeline configured~~ — **fixed 2026-07-29**: `.github/workflows/ci.yml` (lint + typecheck ×2 + build + `npm test` on every push/PR to `master`, notify-only). See CHANGELOG.md.
- Bundle: `DashboardPage` chunk **shrank** to ~478KB gzipped ~126KB after the 2026-07-10 UI/UX redesign pass (down from ~502KB/~132KB) — 3 redundant charts were removed as part of decluttering, more than offsetting the new components added, and it's now under Vite's 500KB raw-size warning threshold for the first time. The main `index.js` chunk grew (~263KB → ~303KB) since `driver.js` and the new shared components (`GuidedTour`/`EmptyState`/`PageHeader`/`MetricInfoTooltip`) are used directly in `App.tsx`, not lazy-loaded — worth revisiting with route-level code-splitting if the main chunk keeps growing.
- Base64-in-document uploads (logo/stamp/profile picture/signature) have a practical 16MB MongoDB document ceiling — the new `uploads`/`attachments` collections (schema-only, 2026-07-09) are forward-looking scaffolding for a real blob-storage migration, not yet wired to anything.
- ~~`i18n.tsx` only covers strings the 2026-07-09 pass touched~~ — **resolved same day**: essentially all UI chrome now translated. Persisted data/seed content and the printed quotation document remain Thai-only, deliberately.
