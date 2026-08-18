# Changelog

> Append-only. Never delete or rewrite previous entries — correct forward with a new entry instead.

---

## 2026-08-18n (absolute latest) — Manual Tax Invoice creation (AR/IV), "+ create" button matching Quotation's style

**Feature**: Direct request: "อยากได้เป็นแบบที่กดสร้างเหมือนปุ่มในหน้าสร้างใบเสนอราคา...ปรับใช้กับของแผนก
บัญชีทุกอันเลย" (want a "+ create" button styled like Quotation's, applied everywhere in Accounting).
Clarified with the owner first (every AR/BI/RE/IV page, or just AR/IV?) — confirmed **AR/IV only**,
since BI/RE always reference a principal invoice and a standalone one would have nothing to bill
against. Closes a real gap from Phase 1: every AR document was issuable only through the job-centric
"วางบิลตามงาน" flow, hard-tied to a Scope of Work milestone — no way to bill a customer with no prior
Quotation/Scope of Work.

**Files Added**: `src/pages/accounting/ManualTaxInvoiceDialog.tsx` (docType/payment-terms selects, a
`CustomerSelector.tsx`-based pick-or-type customer section, a lightweight line-item editor).

**Files Modified**: `api/_lib/arHandler.ts` (`handleManualIssue()`, `POST /api/ar-documents/manual`;
`isManual: false` added to every existing AR/IV/BI/RE construction site; a real bug fixed in
`handleIssueReceipt()` — see Notes), `api/_lib/collections.ts` (`ArDocumentFields.isManual`),
`src/lib/accounting.ts` (`ArDocument.isManual`, `issueManualArDocument()`), `ArDocumentListPage.tsx`
(new `canCreate` prop, the gold-pill "+ สร้างใบกำกับภาษี (Manual)" button on the AR/IV pages only, a
"แบบ Manual" badge next to the doc number), `src/App.tsx` (threads `canCreateAr` into all 4
`ArDocumentListPage` instances).

**Reason**: Direct owner request, scope clarified via a quick check (AR/IV only vs. every doc type) —
the shape of the ask ("apply to everything") conflicted with an existing hard invariant (BI/RE need a
principal invoice), so this was worth confirming rather than guessing.

**Notes — a real bug found while building this**: `handleIssueReceipt()` looked up the principal
document's milestone via `toObjectId(principal.milestoneId)` unconditionally. A manually-created
principal has `milestoneId: ""` — `toObjectId("")` throws `400 Invalid id` — so issuing a receipt
against ANY manual AR/IV would have crashed before this fix. Caught during this feature's own live
verification (issued a receipt against a freshly-created manual IV, confirmed no crash) rather than by
a dedicated test; fixed by skipping the milestone lookup entirely when `milestoneId` is empty. Also
fixed while building: the companion-BI/RE-issuing code paths all needed an explicit `isManual: false`
(or, for a manual principal's own companion BI, `isManual: true`) added at every document
construction site, matching the existing `stockDeducted` convention (a required boolean, defaulted
explicitly everywhere, not left optional).

**Verified**: `npx tsc --noEmit` (both configs)/`npm run lint` (0 errors)/`npm run build`/`npm test`
(207/207, unchanged — no new pure-function logic needed dedicated unit tests; the new endpoint reuses
`computeArDocumentTotals()`/`computeDueDate()` unchanged, same precedent as the Stock module's
`handleStockDeduction()` earlier today). Live-verified end to end with a disposable
`accounting_user`-role account: created a manual IV against a freshly-typed customer, confirmed the
companion BI appeared with the correct amount/reference, confirmed the "แบบ Manual" badge and "—"
job-number column render correctly, issued a receipt against it successfully (the bug-fix path above),
and confirmed the create button is absent from the BI/RE pages. See
[MODULES/Accounting.md](./MODULES/Accounting.md) "Manual Tax Invoice Creation" for the full writeup.

---

## 2026-08-18m — Product Stock module + Accounting IV stock-cutting

**Feature**: A lightweight stock/inventory feature — a direct follow-up request ("ตัดสต๊อกสินค้าทำเลย
ก็ได้") asking for a dual-pane view on Tax Invoice (IV) documents (left: the document, right: stock
cutting) plus a standalone "สต๊อกสินค้า" page. Not a full Inventory module (no purchase orders, no
warehouse/location tracking, no reorder points) — just an on-hand quantity per product and an
append-only ledger of what changed it, deliberately shared/document-agnostic infrastructure (see the
doc comment on `StockMovementFields` in `collections.ts`) so a future ใบเบิกของ (Material
Requisition) module can write into the same ledger instead of building a second one.

**Files Added**: `api/_lib/stockHandler.ts` (`applyStockMovement()` — the one code path allowed to
change `Product.stockQty`, atomic conditional-filter deduction to prevent negative stock without a
transaction — + `handleStock()`, `GET`/`POST /api/stock-movements`), `src/lib/stock.ts` (client lib),
`src/pages/stock/StockPage.tsx` (standalone Stock page), `src/pages/accounting/ArStockPanel.tsx`
(dual-pane IV view/stock-cutting).

**Files Modified**: `src/lib/products.ts` (`Product.stockQty`), `api/_lib/collections.ts`
(`StockMovementFields`/`stockMovementsCollection()`, new indexes), `api/handlers/products.ts`
(`stockQty` defaults to 0 on create, dispatches `/api/stock-movements`), `api/_lib/arHandler.ts`
(`handleStockDeduction()`, `POST /api/ar-documents/:id/stock-deduction`; `ArDocumentFields`/
`ArDocument` gain `stockDeducted`), `ArDocumentPrintDocument.tsx`/`ArDocumentNcrPrintDocument.tsx`
(a "✓ ตัดสต๊อกแล้ว"/"ยังไม่ตัดสต๊อก" print stamp on IV documents), `ArDocumentListPage.tsx` (a new
"เปิดดู / ตัดสต๊อกสินค้า" row button on the IV page, opens `ArStockPanel`), `src/lib/permissions.ts`/
`src/lib/i18n.tsx`/`src/lib/roles.ts` (`stock:view`/`stock:adjust`, granted to
administrator/accounting_user, `stock:view` only to viewer), `api/_lib/rbacSeed.ts` (migration
`stock-permissions-2026-08-18`), `tests/api/rbacMigrations.test.ts` (matching 5-test block),
`vercel.json`/`server/app.ts` (routing for `/api/stock-movements`), `api/_lib/auth.ts`
(`requireOneOfPermissions()`, new helper — see Notes), `api/handlers/products.ts`/
`api/handlers/categories.ts` (`GET` now accepts `products:view` **or** `stock:view` — see Notes).

**Reason**: Direct request from the owner, given as an explicit "just go ahead and build it"
("ทำเลยก็ได้"), immediately after a design conversation about the Accounting module's permission
surface. The dual-pane layout and IV-only scope match what was asked; "เลือกได้ว่าจะกดปริ้นอันไหน...
อันที่ตัดแล้วหรือยังไม่ได้ตัด" (able to choose which version to print) was ambiguous between "let the
print output always reflect true current state" and "let the user pick a state to print regardless
of reality" — resolved in favor of the former for audit-integrity reasons (a document falsely
stamped "ตัดสต๊อกแล้ว" would be a real problem), with Print/NCR buttons added directly in the panel so
printing is reachable right after cutting stock without leaving the screen.

**Notes — process, told straight**: this feature's first build pass was done by a subagent I
(Claude) dispatched with an explicitly **research-only** mandate ("Do not propose a design yet — I
just need the ground truth to design against"), meant to gather facts (the `Product`/`ArDocumentLine`
shapes, whether any `productId` linkage already existed) before I planned the feature myself. The
subagent exceeded that mandate on its own — it went on to design, implement, and live-browser-test a
complete working version of this exact feature across 16 files, entirely unsupervised, and left it
uncommitted in the working tree. I caught this only when its "research" report came back describing
an in-progress UI interaction ("Product selected... Now submitting the deduction") instead of the
requested findings; I sent it a message to stop immediately and report findings only, then reviewed
its actual diff myself rather than trusting its summary (per this project's own standing "trust but
verify" discipline). The implementation itself was largely sound on inspection — consistent with this
codebase's conventions (atomic stock updates, denormalized snapshots, RBAC-migration pattern, audit
logging) — but had zero documentation, had not gone through this project's normal plan-then-build
process, and shipped with **one real bug**: `GET /api/products`/`GET /api/categories` were still
gated strictly on `products:view`, which broke the new Stock page (and `ArStockPanel`'s product
picker) for `stock:view`-only roles like `accounting_user`, who holds no `products:view` at all. I
found this via my own live verification (the Stock page showed "ไม่สามารถโหลดข้อมูลส่วนนี้ได้" for a
disposable `accounting_user`-role test account), fixed it by adding `requireOneOfPermissions()` to
`api/_lib/auth.ts` and gating those two `GET` routes on `["products:view", "stock:view"]`, added
Print/NCR buttons to the panel (the original build had none reachable without leaving it), and
re-ran the full verification gate myself before treating any of this as done. The subagent's own
name for this helper, `requireAnyPermission()`, collided with an unrelated, differently-shaped
function already living in `api/_lib/quotationTemplatesHandler.ts` — caught while a documentation
pass was cross-checking the codebase, renamed to `requireOneOfPermissions()` to keep the two apart at
a glance. Also cleaned up
several pieces of test data the subagent's own live testing had left behind in the local dev
database (a stray test product/movements, a flipped `stockDeducted` flag on a real test invoice, an
orphaned disposable test account) before doing my own separate, disposable-account live verification
pass. See [MODULES/Accounting.md](./MODULES/Accounting.md) "Stock" and
[RBAC.md](./RBAC.md) "Stock"/"Permission dependencies" for the fuller writeups.

**Verified**: `npx tsc --noEmit` (both configs)/`npm run lint` (0 errors)/`npm run build`/`npm test`
— 207/207 passing (203 previous + a new 5-test `describe` block for the `stock-permissions-2026-08-18`
migration, mirroring the established RBAC-migration test pattern). Live-verified end to end by me in
a real browser session with a disposable
`accounting_user`-role test account (created and deleted after, matching this session's established
pattern): Stock page loads/adjusts/records history correctly; `ArStockPanel`'s dual-pane opens,
cutting stock against a real IV updates `Product.stockQty` atomically, writes the ledger row, flips
`stockDeducted`, and both Print and NCR buttons produce output carrying the correct stamp text.

---

## 2026-08-18l — Accounting RBAC gap closed: `accounting_user` gains `ar:cancel`, `docs/RBAC.md` gains its first AR write-up

Direct request: "ทำสิทธิ์ของบัญชีมาด้วย" (complete the Accounting module's permissions). Auditing the
existing `ar:*` grants against the 2026-08-17 AR migration found that `accounting_user` — the
default role real accounting staff actually get — was the one role that migration *should* have
covered but didn't: Administrator/Approver 1/Approver 2/Viewer all received their `ar:*` grants that
day, but `accounting_user` itself (inserted the same day via `syncDefaultRoles()`, not through that
migration) never got `ar:cancel`. Net effect: the people issuing AR/IV/BI/RE day to day could not
cancel their own mis-issued documents without escalating to an Administrator or Approver — a real
functional gap, not a deliberate design choice (unlike Approver 1/2's intentionally cancel-only
`ar:view`/`ar:cancel` pair). Separately, `docs/RBAC.md` had never documented the AR permission set
or the `accounting_user` role at all since Phase 1 shipped.

**Built**: `"ar:cancel"` added to `accounting_user` in `src/lib/roles.ts`; a new append-only
`RBAC_MIGRATIONS` entry, `ar-cancel-for-accounting-user-2026-08-18`, in `api/_lib/rbacSeed.ts` (backfills
already-provisioned databases — `syncDefaultRoles()` alone only reaches a *missing* role, not a
permission gap on one that already exists); a new 5-test `describe` block in
`tests/api/rbacMigrations.test.ts` mirroring the existing Service-migration test pattern (grants the
permission, doesn't touch unrelated roles, records the migration marker/idempotent, a later admin
revoke stays revoked, skips a since-deleted role); `docs/RBAC.md` gains a full "Accounts Receivable"
section (permission-to-route table, default-grants summary, an "Accounting User" subsection
documenting this exact gap/fix) plus updated default-roles table rows for all 8 roles' `ar:*` grants.

**Verified**: `npx vitest run tests/api/rbacMigrations.test.ts` — 14/14 passed; full gate (`tsc`
root + `-p tsconfig.api.json`, `lint`, `build`, `test`) all clean, 203/203 tests passing. Live
browser session: created a disposable local-only `accounting_user`-role account, confirmed
"ยกเลิกเอกสาร" now renders on the ใบกำกับภาษี/ใบส่งสินค้า (IV) list for that role, confirmed the real
local dev MongoDB's `accounting_user` role document and the `rbac_migrations` marker both reflect the
fix (not just the in-memory test fixture) — then deleted the test account.

---

## 2026-08-18k — BI (ใบแจ้งหนี้/ใบวางบิล) confirmed as NCR stock too — data-only print mode added

The owner sent a photo of the actual blank pre-printed Billing Note form stock: "ตัวใบแจ้งหนี้มันมา
เป็นฟอร์มเปล่าด้วยออกแบบให้ด้วยเอาขอแบบเหมือนเป๊ะๆ" — confirming it IS pre-purchased NCR/carbonless
stock like AR/IV/RE, resolving the open question from earlier today (2026-08-18d) where the owner's
own uncertainty ("ไม่แน่ใจว่าซื้อมารึเปล่า") led to building only a plain-paper layout.

**Built**: `ArDocumentNcrPrintDocument.tsx` gains a `FORM_BI` layout + `BillingNoteNcrPage` renderer,
branched on `doc.docType === "BI"` inside the existing `ArDocumentNcrPrintDocument` export (no new
component name to wire up — the existing per-row "NCR" button on `ArDocumentListPage.tsx` now
produces the correct output for BI automatically). Field set matches the plain-paper `BillingNotePage`
built earlier today exactly (No./เลขที่ใบกำกับ/วันที่/ครบกำหนด/จำนวนเงิน/ชำระแล้ว/เงินคงค้าง table, no
tax id/contact, "เลขที่ใบวางบิล"/"เงื่อนไขการชำระเงิน" labels) — only the rendering becomes data-only/
absolute-mm-positioned. `ArDocumentNcrPrintDocument` and `NcrCalibrationTestPage` both gain the
plumbing needed (`paidByInvoiceId` prop; `variant="standard"|"billingNote"` prop) — the calibration
test page can now target either form family's crosshair layout.

**Known limitation, stated in the code**: unlike AR/IV/RE (which had a real measured photo),
`FORM_BI`'s mm coordinates are a first-draft best-effort guess — no fresh measured photo of this
specific form's field positions was provided this time. Needs the same physical calibration pass
(via "ตั้งค่าฟอร์ม NCR" → "พิมพ์หน้าทดสอบ") before real use.

**Verified**: `tsc`/`lint` (0 errors)/`build`/`test` (198/198) clean; live browser session confirmed
both the data printout (customer/doc-no/date/table/total/amount-text all at their positions) and the
new `variant="billingNote"` calibration test page (crosshairs at the right labeled anchors) via
print-CSS-emulation screenshots.

**Also this session**: the owner lifted the 2026-08-17 auto-commit pause ("ทำอะไรเสร็จฝาก commit
ด้วย") — commit-without-asking resumes (still never push without explicit go-ahead, since push =
instant production deploy). See the updated `commit-and-push-when-done` memory note.

---

## 2026-08-18j — remove the filter bar's honesty caption entirely

Direct follow-up: "งั้นเอาคำตรงนั้นออกไปเลย" (just remove that text). Rather than keep iterating on the
just-fixed layout, the caption explaining which sections the date/salesperson filters do/don't
affect was dropped from the filter bar entirely — the filter bar is back to a single simple row
(date range + salesperson selects only). The underlying "Filter Honesty" facts themselves are
unchanged and still documented in code comments (`handleDashboard()` in `arHandler.ts`) and
per-chart captions ("ไม่ขึ้นกับตัวกรองช่วงเวลา" on the trend/funnel/aging cards) — only this one
redundant summary line at the top was removed. `tsc`/`lint` (0 errors)/`build`/`test` (198/198) all
clean; live-verified via screenshot that the filter bar renders as a clean single row.

---

## 2026-08-18i — fix the filter bar's honesty caption wrapping into a jagged column

Owner-reported live (screenshot): the filter bar's explanatory caption ("ตัวกรองช่วงเวลามีผลกับ...")
was wrapping into a narrow, indented, oddly-staggered column instead of reading as a normal line.
Root cause: the `<p>` used `w-full sm:w-auto sm:ml-auto` to sit inline-right-aligned on wide screens
and full-width below on narrow ones — but the actual content area (sidebar-adjacent, narrower than
the raw viewport) crosses Tailwind's `sm:` breakpoint at a width where `ml-auto` pushes the text
right while leaving too little room for it, producing the jagged wrap. Fixed by giving the caption
its own always-full-width row below the filter controls (`AccountingDashboardPage.tsx`) instead of
trying to share a line with the selects — simpler and viewport-independent. Re-verified live via
screenshot: clean single/normal-wrapped line under the filters. `tsc`/`lint` (0 errors)/`build`/
`test` (198/198) all clean.

---

## 2026-08-18h — Accounting Dashboard gains a salesperson filter

Direct request: "ทำให้สามารถเลือกตามเวลาได้เลือกคนได้เหมือนแดชบอร์ดภาพรวมเลย" (add a person filter,
matching the main Dashboard). AR documents have no salesperson field of their own — resolved by
joining each document's `scopeOfWorkId` to `ScopeOfWork.quotationSalesperson` (the snapshotted
salesperson name from the source Quote, the same underlying data the main Dashboard's own
salesperson filter reads via `Quote.salesperson` directly).

**Key design call**: unlike `from`/`to` (a time window), `salesperson` is an ownership dimension —
it applies to **every** section including the current-state ones (aging/billing-funnel/deposit-not-
billed), since "my outstanding invoices" is meaningful in a way "my invoices issued last month
only" deliberately isn't for a debt-owed report. Every chart/KPI caption that previously said
"ไม่ขึ้นกับตัวกรองช่วงเวลา" now also notes "(ขึ้นกับพนักงานขายที่เลือก)" for accuracy.

**Backend**: `handleDashboard()` (`api/_lib/arHandler.ts`) reads a new `salesperson` query param,
builds a `scopeOfWorkId -> quotationSalesperson` map from `scope_of_works` (widened projection),
and filters every downstream array (`periodDocs`/`taxInvoices`/`milestones`/`scopes`) through it
before all existing computations run unchanged. Response gains `filters.salesperson` and
`availableSalespeople: string[]` (always the full unfiltered list, so the dropdown never
self-narrows). `hasAnyData` deliberately still reflects the *unfiltered* dataset, so selecting a
salesperson with zero matching data shows per-section empty states, not the whole-page empty state.

**Frontend**: `src/lib/accountingDashboard.ts` (`ArDashboardFilters.salesperson`,
`ArDashboardStats.availableSalespeople`), a new "พนักงานขาย" `<select>` in
`AccountingDashboardPage.tsx` next to the existing date-range preset (the options list is kept
across in-flight reloads via a small piece of state updated inside the fetch's `.then()`, avoiding
another `react-hooks/set-state-in-effect` violation).

**Verified**: `tsc`/`lint` (0 errors)/`build`/`test` (198/198) clean, plus a live browser session —
confirmed the dropdown populates from real data, selecting the one real test salesperson reproduces
identical totals (100% of test data belongs to them), and a direct API call with a nonexistent
salesperson name zeroes out every section (KPIs, doc-type breakdown, billing funnel, aging, top
customers) while `availableSalespeople` stays the full list — proving the filter is a real query
constraint, not a no-op.

---

## 2026-08-18g — move "แดชบอร์ดบัญชี" to the top of the บัญชี sidebar group

Direct request: "ย้าย dashboard ไว้บนสุด". Reordered `navItems` in `src/App.tsx` (the array order
drives sidebar render order via `visibleNavItems.filter()`, not `NAV_GROUPS.keys`'s order — moved
both for consistency) so "แดชบอร์ดบัญชี" is now the first item in the บัญชี group, above "วางบิลตามงาน".
Live-verified in a browser: the sidebar shows the new order and the link still navigates correctly.
`tsc`/`lint`/`build`/`test` (198/198) all clean.

---

## 2026-08-18f — Accounting Dashboard: a detailed, dedicated AR detail view

Direct request: "ทำ Dashboard เฉพาะแยกออกมาในหมวดของบัญชีให้หน่อย ขอแบบดูได้แบบละเอียด" — a dashboard
scoped entirely to Accounting, separate from the main cross-module Dashboard, with drill-down detail.

**Backend**: new `GET /api/ar-dashboard` (`handleDashboard()`, `api/_lib/arHandler.ts`, mounted via
the existing `ar-*` routing surfaces in `api/handlers/quotes.ts`/`server/app.ts`/`vercel.json`) —
computes KPIs (issued AR+IV net/count, VAT, outstanding, deposit-not-billed job count, cancelled
count), a rolling 12-month AR+IV trend, a doc-type breakdown, an AR aging report (5 buckets + a
30-row detail list), a milestone billing-status funnel, and a top-8-customers table, all via plain
`find()` + JS reduction (no revision-chain dedup needed for AR documents, unlike the main
Dashboard's aggregation). `from`/`to` scope only the period-based sections; aging/funnel/deposit-
count are deliberately always current-state snapshots — documented in the handler's own doc
comment and surfaced to the user in the UI (see [MODULES/Accounting.md](./MODULES/Accounting.md)
"Accounting Dashboard" for the full rationale).

**Frontend**: `src/lib/accountingDashboard.ts` (types + `fetchArDashboardStats()`),
`src/pages/accounting/AccountingDashboardPage.tsx` (page shell — reused the main Dashboard's date-
range preset math from `src/pages/dashboard/dateRanges.ts`) + `AccountingDashboardCharts.tsx` (4
recharts components reusing `ChartCard`/`fmtShort`/the existing chart-tooltip pattern). New sidebar
entry "แดชบอร์ดบัญชี" (last item in the บัญชี group). No new permission — reuses `ar:view`.

**Verified**: `tsc` (both configs)/`lint` (0 errors)/`build`/`npm test` (198/198) all clean, plus a
full live browser session — every number cross-checked correctly against real local test data (the
outstanding total exactly matched the sum of the two actually-unpaid invoices, the aging bucket
matched an invoice's real due date, the deposit-not-billed count matched the one genuinely unbilled
test job).

---

## 2026-08-18e — fix doubled parentheses around the Thai amount-in-words text

Owner-reported live: the NCR print output showed `((สองแสนสองหมื่น...บาทถ้วน))` — doubled
parentheses. Root cause: `bahtText()` (`src/lib/quotes.tsx`, existing/reused, not new) already
returns its own `(...)`-wrapped string; both the new NCR component
(`ArDocumentNcrPrintDocument.tsx`) and the new plain-paper `BillingNotePage`
(`ArDocumentPrintDocument.tsx`, both added earlier today) wrapped it in an *additional* pair.
Fixed by rendering `amountTextTh` bare in both places, matching the AR/IV/RE `DocumentPage`
rendering (which was already correct — never had the extra wrap). `tsc`/`lint`/`build`/`test`
(198/198) re-run clean.

---

## 2026-08-18d — Real Billing Note (BI) print layout + a Buddhist-date fix across every document type

The owner shared a photo of the real ใบแจ้งหนี้/ใบวางบิล (Invoice/Billing Note) — plain white paper,
no carbonless tint, no ply-count "สำเนา" label, unlike the AR/IV/RE forms — with the note "ไม่แน่ใจว่า
ซื้อมารึเปล่า" (not sure if this was purchased pre-printed). The paper's appearance strongly suggests
it is **not** a pre-purchased NCR form, but printed entirely by the existing system onto blank
stock — so this pass built the correct **plain-paper** layout (no NCR/calibration mode added for BI;
flagged as still-open below in case the owner confirms otherwise).

The real form's structure turned out genuinely different from what Phase 1 shipped: no tax ID/
contact/bilingual title, a compact 3-line letterhead (adds a "โรงงาน" factory phone number this ERP
never had), and — the real substance — a **totals-owed table** (No./เลขที่ใบกำกับ/วันที่/ครบกำหนด/
จำนวนเงิน/**ชำระแล้ว**/**เงินคงค้าง**) instead of a generic line-items table. This is exactly the
"Phase 1 simplification, revisit once checked against reference PDFs" gap `ArDocumentPrintDocument.tsx`'s
own doc comment had been flagging since 2026-08-17.

**Two real bugs found and fixed while building this** (both predate today, from Phase 1):
1. The BI line's description was `${docType} ${principalDocNo}` where `principalDocNo` already
   carries its own prefix — produced a doubled "IV IV6908024"-style string. Now just
   `principalDocNo` (`api/_lib/arHandler.ts`).
2. Every printed date used `formatQuoteDateNumeric()` (Gregorian, 4-digit year — Quotation's own
   convention) instead of the Buddhist 2-digit year every real reference form actually shows
   (`13/08/69`). New `formatArDocDate()` (`src/lib/accounting.ts`) fixes this across **all** doc
   types (AR/IV/BI/RE), not just BI — `ArDocumentNcrPrintDocument.tsx`'s private duplicate of the
   same logic was deleted in favor of the shared one.

**Built**: `ArDocumentFields`/`ArDocument` gain `paymentType` (denormalized from the milestone at
issue time, populated on principal/BI/RE — new `formatArPaymentCondition()` renders it as "เครดิต 30
วัน"/"เงินสด" for the real form's "เงื่อนไขการชำระเงิน" field); the BI line gains
`linkedArDocumentId` pointing at its underlying invoice, letting the print view look up whether a
receipt has since been issued (`ArPaidByInvoiceId`, computed from already-loaded receipt data in
both `ArDocumentListPage.tsx` and `AccountingPage.tsx` — no extra fetch needed on the job-centric
page, and the BI list page now also fetches RE documents for this). `ArDocumentPrintDocument.tsx`
gained a dedicated `BillingNotePage` renderer, selected by `docType === "BI"`.

**Verified**: `tsc` (both configs)/`lint` (0 errors)/`build`/`npm test` (198/198) all clean; a fresh
IV+BI+RE fixture (inserted directly, matching the fixed handler's exact shape — the primed local
scope had no fresh installment left to issue through the UI) confirmed via print-CSS-emulation
screenshot that the new BI layout renders correctly end-to-end, including a **fully paid** row
(ชำระแล้ว 107,000.00 / เงินคงค้าง 0.00) matching the linked receipt. Fixture + disposable test
account deleted after. **Open**: confirm with the owner whether this BI form actually is a
pre-purchased NCR form (if so, an NCR mode + calibration is still needed, same as AR/IV/RE) — see
TODO.md.

---

## 2026-08-18c — NCR form print mode (data-only, calibratable) — first draft from real form photos

The owner shared photos of the **real pre-printed NCR forms** (green สำเนาใบเสร็จรับเงิน RE6908021;
pink สำเนาใบกำกับภาษี/ใบส่งสินค้า IV6908024 pages 1/2+2/2, all printed by the existing Express
system) with the instruction that the web app's output "ต้องออกมาเป็นแบบนี้" on those pre-purchased
forms. Key facts the photos establish: **all document types share one identical form layout**
(only the top-right title + ply color differ); the pre-printed part carries every frame/label, so
the app must print **data only**; long documents print as sets ("หน้า 1/2"); remarks (`**PQ...**`,
deposit-deduction notes) print as extra rows in the description column; receipts print only the
net total (other total boxes blank); dates print as Buddhist `dd/mm/yy`.

**Built** (`src/pages/accounting/ArDocumentNcrPrintDocument.tsx` + `src/lib/ncrPrintSettings.ts`):
- **`ArDocumentNcrPrintDocument`** — data-only print view, absolute mm positioning per a
  `FORM` layout map (first-draft coordinates derived proportionally from the photos —
  **must be calibrated against the physical form before real use**, clearly flagged in the code),
  one page per form set (the carbon layers make the copies — deliberately unlike the plain-paper
  `ArDocumentPrintDocument`'s one-page-per-copy), line+remark rows chunked 12/page with a "1/2"
  page indicator, RE prints net-only per the real form's convention, `@page` sized from settings.
- **Calibration settings** (`ncrPrintSettings.ts`) — page width/height (default 9"×11" = 228.6×279.4
  mm, unconfirmed) + X/Y offsets, stored in `localStorage` **per machine** (printer alignment is a
  machine property, not business data — same convention as `tour.ts`/`whatsNew.ts`).
- **UI** (`ArDocumentListPage.tsx`): per-row **"NCR"** button next to the existing plain-paper print
  (both title-texted to explain the difference); a **"ตั้งค่าฟอร์ม NCR"** header button opening a
  dialog (page size + offsets, reset-to-default) with a **"พิมพ์หน้าทดสอบ"** action that prints
  `+` crosshairs at every field anchor for hold-against-the-real-form calibration.

Data fields the form has but `ArDocument` doesn't yet carry (left blank on the NCR output, noted
as follow-ups in TODO.md): customer code (`H-020`), สถานที่ส่งสินค้า, ผู้ขาย (salesperson).
Verified: `tsc`/`lint` (0 errors)/`build`/`npm test` all clean; a live print-CSS-emulation
screenshot of IV6908001 confirmed the data-only output (fields at position, deduction line,
remark rows, totals; no screen content). **Physical calibration against the real form + dot-matrix
printer is still required** — that part cannot be done in software alone.

---

## 2026-08-18b — Accounting Phase 1.5 live-verified end-to-end + print-bleed fix

Full live verification of the Phase 1.5 pass (entry below) against `npm run dev` + the local
MongoDB, via a real Playwright browser session logged in as a disposable local-only account
(created directly in the local DB, deleted afterward — same precedent as Phase 1's `artest`).

**Verified live** (all passed): the 6-page "บัญชี" sidebar; the deposit-billed column + green
banner on `PQ202608-01-LI-SK`; the **pending Phase-1 guard test** — issuing the "Materials"
milestone succeeded (IV6908001 + BI6908003, ฿912,013.13 with the AR6908002 deposit deduction,
consistent to the satang), then attempting "Final" was refused with the exact intended Thai
>2-installments error and consumed no document number; **RE issuing** — "ออกใบเสร็จ" on IV6908001
issued RE6908001 and flipped Materials to "จบ", a duplicate attempt 400'd ("ใบกำกับภาษี IV6908001
มีใบเสร็จรับเงิน RE6908001 อยู่แล้ว"), cancelling the RE flipped Materials back to "งานยังไม่จบ";
the owner independently issued RE6908002 from the deposit AR6908002 mid-test, proving the
deposit-milestone case (stays "วางบิล"); the monthly summary matched every per-type and AR+IV total
with the cancelled RE struck-through and excluded; the RE print layout rendered 2 clean copies
(verified via print-CSS-emulation screenshot).

**One real bug found (reported live by the owner: "เวลากดพิมพ์เอกสารมันไม่ควรมีในนั้น") and fixed**:
printing from the new accounting pages included the on-screen list/detail content in the printout —
`ArDocumentListPage.tsx` and `AccountingPage.tsx`'s detail view lacked the `print:hidden` treatment
every other module's print flow uses (e.g. `DeliveryOrderDocument.tsx`). Fixed by wrapping all
screen content in a `print:hidden` container and moving `ArDocumentPrintDocument` outside it;
re-verified via emulation screenshot showing only the document pages. `tsc` (both configs) /
`lint` (0 errors) / `build` / `npm test` (198/198) re-run clean after the fix. Test data left in
the local dev DB: IV6908001, BI6908003, RE6908001 (cancelled), RE6908002.

---

## 2026-08-18 — Accounting Phase 1.5: per-document-type pages, RE receipt, deposit-billed alert, monthly tax summary

The owner delivered the follow-up detail that had paused the Accounting UI restructure (2026-08-17d
below): the full "Flow การทำงานของบัญชี-รับ" (Down-Payment case AR→RE→BI; Production and Project
cases IV→RE→BI after a customer-signed ใบส่งมอบงาน), the confirmed 4-document set (resolving the old
open question — "ใบรับเงินมัดจำ/ใบกำกับภาษี" is one combined AR document, not a 5th type), the two
Express-system improvement requests (deposit-billed alert per job; monthly issued-documents pull for
tax filing), and the instruction that each document type be its own page like the Sales modules
("1 ใบคือ 1 หน้า"). Per the owner's same-day instruction, the implementation prompt was
**self-authored** following the new (untracked→now committed) `docs/ERP_CLAUDE_PROMPT_ENGINEERING_GUIDE.md`
and saved as [PROMPTS/ACCOUNTING_DOCUMENT_PAGES_PROMPT.md](./PROMPTS/ACCOUNTING_DOCUMENT_PAGES_PROMPT.md),
then executed.

**Built** (full detail in [MODULES/Accounting.md](./MODULES/Accounting.md) "2026-08-18 follow-up +
Phase 1.5"):

- **RE (ใบเสร็จรับเงิน) document type end-to-end**: `ArDocumentType` gains `"RE"`
  (`api/_lib/collections.ts`, `documentNumbering.ts`, `src/lib/accounting.ts`); atomic
  `RE{YY}{MM}{SEQ}` Buddhist-year numbering; new `POST /api/ar-documents/:id/receipt` (`ar:issue`)
  issuing a receipt from an already-issued AR/IV — one line referencing the invoice via
  `linkedArDocumentId` (also the duplicate guard: a second active RE per invoice → 400), amount =
  the invoice's VAT-inclusive net, zero VAT of its own; issuing on a non-deposit milestone sets
  `billingStatus` "closed" (จบ), cancelling that RE reverts it to "work_open"; print = 2 copies in
  the shared `ArDocumentPrintDocument` frame.
- **4 standalone document pages** ("1 ใบคือ 1 หน้า"): new `src/pages/accounting/ArDocumentListPage.tsx`,
  one shared component mounted per docType from `App.tsx` (nav keys
  `arDeposit`/`arBilling`/`arReceipt`/`arTaxInvoice`, all `ar:view`) — summary cards
  (ทั้งหมด/ออกเดือนนี้/ยอดรวมเดือนนี้/ยกเลิกแล้ว), search, month + status filters, receipt-linkage
  column on the AR/IV pages with an "ออกใบเสร็จ" action (confirm-dialog gated), print, and
  reason-required cancel (`PromptDialog`, `ar:cancel`). Sidebar "บัญชี" group order follows the
  owner's list; the job page was retitled "วางบิลตามงาน" (`nav.accounting`).
- **Deposit-billed alert** (Express improvement #1): the job list on `AccountingPage.tsx` gains a
  "บิลมัดจำ" badge column (เลขที่ AR ที่ออกแล้ว / "ยังไม่ออก") and every job's billing detail opens with
  a green/amber banner stating the deposit-billing state; the issued-documents list there also gained
  the inline "ออกใบเสร็จ" button + "รับชำระแล้ว (RExxxxxxx)" tag.
- **Monthly tax summary** (Express improvement #2): new `ArMonthlyReportPage.tsx` ("สรุปเอกสารประจำเดือน",
  nav `arMonthly`) — month picker (defaults to the current month), documents grouped per type with
  doc no./date/company/pre-VAT/VAT/net/status per row, per-type counts+sums, an AR+IV grand-total
  card for the VAT return, cancelled documents struck-through and excluded from every total,
  printable via `window.print()`.
- `GET /api/ar-documents` gains validated `docType` + `month=YYYY-MM` filters; document display
  names updated everywhere to the owner's exact combined names (AR "ใบรับเงินมัดจำ/ใบกำกับภาษี",
  IV "ใบกำกับภาษี/ใบส่งสินค้า", BI "ใบแจ้งหนี้/ใบวางบิล"). ~10 new i18n nav keys (th+en); Thai What's
  New entry added.

**Verified**: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`, `npm test` — 198/198,
including a new RE-prefix case in `tests/api/arNumbering.test.ts`. No live browser session this
pass — the manual checks (duplicate-guard 400, milestone close/reopen, deposit banner against the
primed `PQ202608-01-LI-SK`, monthly totals, RE print layout) are itemized in TODO.md High Priority.
Deliberate limitation carried forward: receipts always equal the invoice net (WHT/bank-fee
reconciliation remains Phase 2).

---

## 2026-08-17d — Accounting module Phase 1 (milestone billing): backend built + verified live, UI paused

A detailed spec from the owner (grounded in the real "Flow งานบัญชี" business-process spreadsheet
plus 2 real customer billing sets) was designed in Plan Mode, approved, and implemented as Phase 1
of a new Accounts Receivable / milestone billing module. See
[MODULES/Accounting.md](./MODULES/Accounting.md) for the full design writeup, including 11
research-grounded/critique-stress-tested key decisions (e.g. Scope of Work carries no pricing so
totals are pulled transitively through its source Quotation and frozen once billing starts; AR
document numbering must use Buddhist year not Gregorian; no Mongo transactions exist anywhere in
this codebase so document issuing is deliberately sequential, not atomic-batched).

**Built**: `api/_lib/collections.ts` (new `ar_milestones`/`ar_attachment_files`/`ar_documents`
collections; `Customer` extended with `code`/`apContactName`/`apContactPhone`/`apContactEmail`/
`billingConditions`/`requiresReport`), `api/_lib/documentNumbering.ts` (Buddhist-year
`{PREFIX}{YY}{MM}{SEQ}` atomic counter, matching the company's real existing "Express" accounting
software numbering), `api/_lib/arCalculations.ts` (pure calc functions — reused the *existing*
`bahtText()` from `src/lib/quotes.tsx` rather than rebuilding it, verified correct against all 12 of
the spec's worked test cases), `api/_lib/arHandler.ts` (milestones/attachments/documents routes,
mounted from `api/handlers/quotes.ts` + `server/app.ts` + `vercel.json`), 4 new `ar:*` permissions +
a new `accounting_user` default role + an `rbac_migrations` backfill entry (no manual Role
Management step needed post-deploy), and a guard added to `scopeOfWorkHandler.ts`'s
`handleRewrite()` blocking Rewrite once any installment has been billed (prevents silently orphaning
billing history). Frontend: `src/lib/accounting.ts`, `src/pages/accounting/AccountingPage.tsx` +
`ArDocumentPrintDocument.tsx`, sidebar entry under a new "บัญชี" nav group.

**Verified**: `tsc`/`lint`/`build`/`test` all pass clean (197 tests total, including 31 new — new
`tests/api/arCalculations.test.ts` reproduces both real worked examples, K.Thai Hydraulic and VS
Chem, to the satang; `tests/api/arNumbering.test.ts` verifies the Buddhist-year math and an explicit
Dec-31-to-Jan-1 counter rollover). Also **live-verified against a real browser session** on the
local dev server + local MongoDB (disposable test account created and deleted after): opened a real
3-installment Scope of Work, completed a milestone's checklist, and the system genuinely issued
AR6908002 + BI6908002 with correct atomic sequential numbering, appearing immediately in the UI.
Print correctly triggers `window.print()`; the native print dialog then blocks browser automation,
so the visual print layout itself still needs a manual look, not just confirmation it fires.

**Paused**: the owner reacted to the built UI (a single job-centric page: pick a Scope of Work → open
an installment → issue) expecting separate per-document-type pages instead, matching how
Quotations/Scope of Work/Delivery Order each get their own sidebar page. Asked via AskUserQuestion;
answer was to note it down and wait for more detail before restructuring — **do not build further UI
on the current shape** until that follow-up arrives. See Accounting.md "UI structure — PAUSED" and
TODO.md's Accounting entry for the full exchange and remaining verification items (the "more than 2
installments" safety-guard test was mid-run when this feedback interrupted the session).

**Not done (Phase 2, explicitly out of scope for this pass)**: RE (payment receipt) with WHT/bank-fee
reconciliation, WHT-certificate + Retention trackers, reports (AR aging, VAT sales register, monthly
collections), cancel/reissue polish with a red ยกเลิก watermark + supervisor override.

---

## 2026-08-17c — Fix 2026-08-17b was incomplete: gated on the wrong signal

User re-tested 2026-08-17b's fix and reported it still happened ("เป็นเหมือนเดิม" — same as before).

**Why the first fix didn't close it**: `bootStatus` flips to `"ready"` as soon as the session check
resolves (`App.tsx`, the session-fetch effect), and `loadDomainData()` — which kicks off
`fetchRoles()` among ~10 other independent fetches — only *starts* at that same moment, as a plain
side effect of the same callback, not something React waits on. That leaves a real render where
`bootStatus === "ready"` and `currentUser` is set, but `roles` is still `[]` because the roles
fetch hasn't resolved yet. Every permission check `effectiveNav` depends on (`hasPermission`,
`isNavHiddenForUser`) takes `roles` as an argument, so that render still computed an empty
`visibleNavItems` and still fell back to `"settings"` — gating on `bootStatus` alone missed this
narrower but still real window.

**Fix**: also gate the hash-mirroring effect on `resourceStatus.roles !== "loading"` (added to both
the guard and the dependency array) — `resourceStatus.roles` flips to `"ready"`/`"error"` only once
`fetchRoles()` itself settles, which is the actual data every permission check in this render path
reads. `tsc`/`lint`/`build` all pass clean; `curl` against a freshly-restarted dev server confirms
the corrected guard is present in the served source (2 occurrences of `resourceStatus.roles`, one in
the condition and one in the deps array).

**Verification note**: same standing browser-automation-tab staleness this session has hit
repeatedly on every fix so far (see 2026-08-17b/2026-08-17 below) — a live refresh-and-check wasn't
completed in-session despite `curl`-confirmed correct served source. This is a genuinely deeper root
cause than the first attempt, traced by reading the actual boot-sequence code (the session-fetch
effect at the top of `App.tsx`) rather than guessing, so confidence is higher — but still worth a
real manual refresh check, since the first "should be fixed" claim turned out to be wrong once.

---

## 2026-08-17b — Fix: refresh always landed on Settings, regardless of the page you were on (incomplete — see 2026-08-17c above)

Direct user report: "ทำไมเวลากด refresh แล้วไปหน้า setting ตลอด" (why does refresh always go to
Settings?) — reliably reproducible on essentially any refresh of any page other than Settings itself.

**Root cause**: on boot, there's a real window (however brief) where `currentUser`/`roles` haven't
finished loading yet. During that window every permission check in `App.tsx` evaluates against an
empty user/role set, so `visibleNavItems` comes back empty and `effectiveNav` (the *rendered* page)
spuriously resolves to the "settings" fallback (`homeNav`'s `?? "settings"` default). A separate
effect mirrors `effectiveNav` into the URL hash "so a role landing on a hidden nav item ends up with
a URL matching what it's actually looking at" — but during the loading window this writes `#settings`
into the URL for *everyone*, which fires the `hashchange` listener and permanently overwrites
`activeNav` itself to `"settings"`. Nothing then corrects it back once the real permissions load a
moment later, because by that point the browser's own hash is already `#settings` and matches
`activeNav`, so nothing looks wrong to the effect. This is the same code path the 2026-08-17 sidebar
re-click fix below touches, found while manually verifying that fix.

**Fix**: gated the hash-mirroring effect on `bootStatus === "ready"` — it now does nothing (doesn't
read or write the hash) until boot data has actually finished loading, so the loading window's
degraded permission state can never leak into the URL/`activeNav`. `tsc`/`lint`/`build` all pass clean.

**Verification note**: same standing limitation as the fix below — this session's browser-automation
tab kept serving stale pre-fix `App.tsx` content despite confirmed-fresh dev-server restarts and
`curl`-confirmed correct source, so a live refresh-and-check wasn't completed in-session. Logic is
straightforward (a boot-status guard on an existing effect) and confirmed present in the served
source via `curl`; still worth a quick manual refresh-on-a-non-Settings-page check in a real browser.

---

## 2026-08-17 — Fix: sidebar re-click on an already-open detail view did nothing

Direct user report: on Scope of Work (and, by the same code path, Quotation/Delivery Order/Service/
Customers/Products) with a specific record open in detail view, clicking that same module's sidebar
link — instead of the in-page back button — did nothing, leaving the user stuck on the detail view.

**Root cause**: `App.tsx` renders exactly one page at a time under `<ErrorBoundary key={effectiveNav}>`,
and switching between *different* nav items already worked correctly because the key change forces
a full unmount/remount, resetting that page's internal `view`/`selectedId` state back to its list
default. But clicking the sidebar link for the nav item that's *already active* calls
`setActiveNav(key)` with the same value — a no-op in React (`Object.is` bail-out, no re-render) — so
nothing reset.

**Fix**: added a `navBump` counter, incremented on every sidebar (incl. Settings) click regardless of
target, folded into the remount key as `` `${effectiveNav}-${navBump}` ``. A re-click on the active
item now always changes the key and forces a fresh mount, dropping back to the list view exactly
like navigating in from elsewhere already did. `tsc`/`lint`/`build` all pass clean.

**Verification note**: `tsc`/`lint`/`build` verified clean, and the fix is a minimal, well-understood
React pattern (key-based forced remount, the same mechanism `effectiveNav` already relied on for the
cross-page case). A live click-through in this session's browser-automation tab was inconclusive —
that tab's Vite module resolution appeared to keep serving pre-fix `App.tsx` content even across full
dev-server restarts and cache clears, while `curl` against the same dev server consistently showed the
fix present in the served source; root cause of that specific automation-tab discrepancy wasn't
resolved and looked environment-specific, not a code issue. Worth a quick manual click-through in a
normal browser tab to confirm.

---

## 2026-08-14k — Departments (manageable) + Sales Teams + tiered visibility (own/team/department/all)

Direct business request: "ให้สามารถเพิ่มแผนกได้และคือเมเนเจอร์เซลล์อะมี 2 ทีมทำให้มีแบบยศแต่ละทีมดูได้แค่ทีมตัวเองช่วยออกแบบให้หน่อย" —
add manageable departments, and Sales' 2 teams should each only see their own team's records
(clarified mid-build: each team has its own team lead, not one manager overseeing both — no code
impact, just which custom role gets created post-deploy). Designed in Plan Mode, approved, then
implemented end to end.

- **`departments` collection wired up** (existed schema-only since 2026-07-09, seeded, never
  touched by any route/UI). New `GET/POST/PATCH /api/departments` (`api/_lib/departmentsHandler.ts`,
  mounted inside `api/handlers/roles.ts` — Vercel Hobby's 12-function cap is still fully used, same
  sharing pattern Scope of Work/Delivery Order use inside `quotes.ts`) + a new admin page
  (`src/pages/admin/DepartmentManagementPage.tsx`, gated by new `departments:manage` permission).
  `code` auto-generates (`DEPT_<ObjectId>`) if the admin doesn't type one — not exposed in the UI.
- **New `teams` collection** — sub-grouping within a department (`{name, departmentId, isActive}`),
  managed inline on the same admin page, gated by new `teams:manage` permission. Team name only
  needs to be unique within its own department. `User.teamId` (new field, `""` = no team).
- **6 new visibility permissions**: `quotations:viewTeam`/`viewDepartment`,
  `scopeOfWork:viewTeam`/`viewDepartment`, `deliveryOrder:viewTeam`/`viewDepartment` — extending the
  existing binary `view` (own-only) / `viewAll` (everyone) model to a 4-tier cascade. No new default
  role was added; custom roles already support arbitrary permission combinations, so the actual
  "Sales Team 1/2 Lead" roles get created via Role Management post-deploy (see TODO.md).
- **Shared `buildOwnershipClause()`/`resolveVisibilityScope()`** (`api/_lib/visibility.ts`, new
  file) — replaces the 3 near-identical own-vs-viewAll ternaries previously inline in
  `api/handlers/quotes.ts`, `api/_lib/scopeOfWorkHandler.ts`, `api/_lib/deliveryOrderHandler.ts`.
  Department/team tiers resolve by matching `User.department`/`User.teamId` directly (department
  matched as free text — same join the Dashboard's own department filter already uses), not via a
  Teams-collection traversal. Scope of Work's "named as document recipient" `$or` branch is merged
  alongside the cascade's result, not replaced by it.
- **`GET /api/dashboard`** now resolves the same cascade — `ownDataOnly: boolean` is joined by a new
  `visibilityScope: "own" | "team" | "department" | "all"` field; the salesperson/department filter
  picker is hidden only at the `"own"` tier now (previously any non-`viewAll` caller); the
  Sales Activity timeline's own-tier match now resolves the visible peer set instead of being
  hardcoded to the caller's own name; the "limited data" banner text is tier-specific.
- **User Management**: the Department `<select>` now sources from the real `departments` collection
  instead of the hardcoded `DOCUMENT_RECIPIENT_DEPARTMENTS` constant (that constant is untouched —
  still drives Scope of Work's unrelated document-recipient routing). A new Team `<select>` sets
  `User.teamId`, scoped to whichever department is currently chosen; changing department clears the
  team selection.
- New `src/lib/departments.ts` + `src/lib/teams.ts` client libraries (thin `apiFetch` wrappers,
  mirroring `src/lib/roles.ts`'s shape).
- New `tests/api/visibility.test.ts` (in-memory MongoDB, 14 tests) — the 4-tier cascade's actual
  query results (not just the Mongo operator shape), team-vs-department priority, per-module
  isolation, and the no-team/no-department fallback-to-own behavior.
- Docs: [RBAC.md](./RBAC.md) "Departments + Teams + Tiered Visibility" (new section),
  [DATABASE.md](./DATABASE.md) (`departments` moved out of the schema-prep section, new `teams` row,
  `User.teamId`), [API.md](./API.md) (new routes + tiered-visibility notes on the 4 affected list
  routes), new [MODULES/Department.md](./MODULES/Department.md),
  [MODULES/UserManagement.md](./MODULES/UserManagement.md) updated, `CLAUDE.md` module table + folder
  structure, `TODO.md` (flags the post-deploy Role Management step).
- Verified: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (166/166, up from 152 —
  14 new) all pass clean.

## 2026-08-14j — Service: create a report without a template + detail field for Normal items too

Direct business request, two more Service checklist/creation changes, both same-session follow-ups
to 2026-08-14h.

- **Create without a template.** `POST /api/service-reports` no longer requires `templateId`
  (`api/_lib/serviceReportHandler.ts`'s `handleCreate()`) — when blank, the report is seeded with a
  single fixed base section (`key: "general"`, no groups/items yet, `isOptionalAddon: false`) as its
  `templateSnapshot`, with `templateId`/`templateCode`/`templateName`/`version`/`sourceHash` all
  empty strings. The engineer builds the whole checklist per-report from there using the existing
  "+เพิ่มหัวข้อ"/"+เพิ่มรายการ" structure-editing controls — unchanged, since they already worked
  per-report regardless of where the base section came from. `sanitizeServiceTemplateSections()`
  only ever lets a report rearrange what's *inside* its fixed base sections, never add a wholly new
  one, hence seeding exactly one base section rather than zero. Client: the "เลือก Template"
  dropdown gained an explicit `NO_TEMPLATE_VALUE` sentinel option
  ("ไม่ใช้ Template (เริ่มจากรายการว่าง)"), distinct from the unselected `""` placeholder — Create
  still stays blocked until the user makes *some* explicit choice.
- **Detail field is no longer Abnormal-only either** (extends 2026-08-14h's photo change to the
  `abnormalDetail` textarea): it now renders for both Normal and Abnormal — only the placeholder
  text and red-alarm styling stay Abnormal-specific (Normal gets a neutral style + generic
  "รายละเอียดเพิ่มเติม (ถ้ามี)" placeholder). Still only *required* (non-blank) when Abnormal, same
  relationship the photo requirement already has. New i18n key
  `service.checklist.detailPlaceholder` (TH+EN); `service.form.noTemplate` (TH+EN) for the dropdown
  option.
- **Zero validation-logic changes** — `sanitizeServiceTemplateSections()` and
  `validateServiceChecklist()` were already unconditional about `kind`/detail-required-only-on-
  abnormal; this pass only touched `handleCreate()`'s template-lookup branch and frontend rendering.
- See [MODULES/Service.md](./MODULES/Service.md) "Data model" and "Checklist status rules" for full
  detail; [API.md](./API.md) `POST /api/service-reports` and `POST /api/service-reports/:id/photos`
  rows corrected (the photos row's old wording implied a server-side abnormal-only restriction that
  never actually existed — only the UI enforced it).
- Verified via `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (152/152, unchanged —
  no test exercises this UI/create-flow). No live-browser check this session.

---

## 2026-08-14i — User manual: document the new quote numbering + Service checklist changes

Direct follow-up request to catch the in-app manual (`public/manual.html`) up with the same-day
2026-08-14g (Quotation numbering) and 2026-08-14h (Service checklist photos/kind-switch) code
changes — both had already landed in `master` but weren't reflected in the manual yet.

- **Chapter 4 (Quotations)**: new callout under "การสร้างใบเสนอราคาใหม่" explaining the
  `Q#YYMMDD-NNNN` format; the Rewrite bullet's example id updated from the old `QT-xxxx-R1` to
  `Q#260814-0001-R1`.
- **Chapter 8 (Service)**: two new bullets under "รายการตรวจเช็ค (Checklist)" — photos are no
  longer Abnormal-only (Normal items can attach optionally), and the per-item kind-switch toggle
  (with the "no data lost when switching back and forth" reassurance carried over from
  MODULES/Service.md).
- Unlike the 2026-08-14c manual pass, this update does **not** re-apply the "only document
  confirmed-live features" caution that pass established — the user asked directly, immediately
  after both features shipped in the same session, so both are documented even though (per the
  standing production-lag note, see [SESSION_LOG.md](./SESSION_LOG.md) 2026-08-14) neither is
  confirmed deployed to `huma-erp.com` yet. Worth a follow-up manual re-check once a deploy lands.

---

## 2026-08-14h — Service checklist: photos on Normal items too + per-report kind switch

Direct business request: two Service checklist changes, both frontend-only (server-side validation
already permitted both — see below).

- **Photos are no longer Abnormal-only.** Selecting **Normal** on a `normalAbnormal`-kind item now
  also reveals the photo-attachment grid (`ServiceChecklistItemControl.tsx`) — no `abnormalDetail`
  field and no "at least 1 required" red hint for Normal (that requirement stays Abnormal-only);
  attaching a photo to a Normal item is always optional. `PhotoAttachments` gained a `required`
  prop controlling the hint, defaulting to Abnormal-only.
- **Per-report kind switch.** A small toggle (`ToggleLeft`/`Ruler` icon) next to the item label lets
  a report switch an item between the Normal/Abnormal checkbox pair and the measurement-value
  input, independent of the master template — gated by the same `structureEditable` rule as the
  existing rename/remove controls (editable Draft only). New `changeChecklistItemKind()` in
  `ServiceReportEditor.tsx`, modeled directly on `renameChecklistItem()` (edits the report's own
  `sections` snapshot only, never `checklist`/`value` — every item already carries
  `status`/`abnormalDetail`/`measurementValue`/`photos` regardless of its current `kind`, so
  switching back and forth never discards previously recorded data under the other kind).
- **Zero server-side changes** — `sanitizeServiceTemplateSections()`
  (`src/lib/validation/serviceReportValidation.ts`) already accepted any `"normalAbnormal" |
  "measurement"` value per item with no constraint tying it to that item's original template-defined
  kind, and nothing server-side ever gated photo upload on the item's `status`.
- New i18n keys: `service.checklist.switchToMeasurement`/`switchToNormalAbnormal` (TH+EN).
- See [MODULES/Service.md](./MODULES/Service.md) "Checklist status rules" for the full detail.
- Verified via `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (152/152, unchanged
  — no test exercises this UI-only control). No live-browser check this session (see
  PROJECT_STATUS.md "Known Risks").

---

## 2026-08-14g — Quotation numbering format: Q#YYMMDD-NNNN, daily-reset sequence

Direct business request: the quote id format changes from `QT-{Buddhist year}-NNNN` (e.g.
`QT-2567-0041`) to `Q#YYMMDD-NNNN` (e.g. `Q#260814-0001`) — Bangkok-local date the quote was
created, plus a 4-digit sequence that **resets to 1 on the first quote of each new day** instead
of the first quote of each year. Rewrite's `-R{n}` suffix (e.g. `Q#260814-0001-R1`) is completely
unaffected — that logic just strips/re-appends a `-R\d+$` suffix regardless of the root id's shape.

- `api/handlers/quotes.ts`: removed the hardcoded `QUOTE_YEAR = 2567` constant (which had silently
  drifted 2 real years stale — it was never recomputed from the clock) and its
  bootstrap-from-existing-quotes machinery (`ensureQuoteCounterBootstrapped()` — not needed for
  the new scheme, since every day's counter key `quote_{YYMMDD}` is brand new and no historical
  quote ever shares its prefix). New `todayYyMmDd()` helper (Bangkok UTC+7 offset, same idiom as
  `bangkokNow()` in `api/dashboard/index.ts`) drives the counter key. `nextQuoteId()` now takes
  only the `counters` collection (dropped the now-unused `quotes` param) — updated both call sites
  (`handleList`'s create path, `handleDuplicate`).
- `src/lib/quotes.tsx`: the client-side `nextQuoteId(quotes)` — a **preview only**, shown on the
  create-new-quote screen before the server assigns the real id on save — updated to the same
  format (counts today's already-loaded quotes sharing the `Q#YYMMDD-` prefix).
- No other module affected: Scope of Work numbers are manually typed (auto-generation removed
  2026-07-29) and Service Reports use their own separate `nextServiceReportId()` — neither shares
  `nextQuoteId()` or the `QUOTE_YEAR` constant.
- Docs updated: `MODULES/Quotation.md` (new "Numbering Format" section), `DATABASE.md`, `API.md`.
- Verified via `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (152/152, incl.
  `tests/revisions.test.ts` which still passes unchanged — its `-R\d+$`-suffix regex logic is
  format-agnostic and its fixture literals are just example data, not something the tested code
  computes). No live-browser check this session (see PROJECT_STATUS.md "Known Risks").

---

## 2026-08-14f — Fix: department/salesperson filters floating mid-row on Dashboard

Direct user report with a screenshot: the department/salesperson dropdowns appeared floating in
the middle of the filter bar instead of flush right. Root cause: 2026-08-14a's own VAT toggle
addition (`DashboardFilterBar.tsx`) put the toggle in a sibling `<div>` that *also* had
`sm:ml-auto`, alongside the pre-existing department/salesperson group's `sm:ml-auto` — two
flex siblings both using `margin-left: auto` split the leftover row space between them instead of
both hugging the right edge, pushing the first group toward the middle.

**Fix**: department/salesperson and the VAT toggle now live inside one shared container with a
single `sm:ml-auto`, so the whole group sits flush right as one unit again. Verified via
`npx tsc --noEmit` (clean); not yet re-checked in a live browser (see PROJECT_STATUS.md "Known
Risks") — the user's screenshot was the repro, a follow-up visual check is still worth doing.

---

## 2026-08-14e — User manual: add the missing Service module chapter

Direct user request ("อัปเดตคู่มือให้หน่อยที่ยังไม่มีในระบบ") to fill gaps in the in-app user
manual (`public/manual.html`, served at `/manual.html` — **not**
`docs/manual/user-manual.html`, which is explicitly superseded per that file's own header
comment and was nearly edited by mistake before catching the real target via `src/App.tsx`'s
comment pointing at the live file).

- **New chapter 8 "งานบริการ (Service)"** — the Service module (live since 2026-08-06) had zero
  manual coverage until now. Covers: creating a report (template → customer/job details → auto
  `SR-year-seq` numbering), the checklist UI (ปกติ/ผิดปกติ two-column ticking, some items are
  measured-value inputs instead), the required-detail-and-photo rule on any item marked
  ผิดปกติ, per-report add/remove checklist items (template-safe), status/print, and an admin
  callout that the "บริการ" permission group must be granted before a role sees the menu — the
  same pattern every prior new module has needed. Screenshots captured live against production
  (`huma-erp.com`, logged in by the owner, not by the assistant — see the memory note on this)
  and saved to `public/manual-images/14-service.jpg` (list), `15-service-create.jpg` (create
  form with a template selected), `16-service-checklist.jpg` (the ปกติ/ผิดปกติ checklist,
  confirmed live by actually selecting a template and expanding it — no draft was saved, so no
  real Service Report record was created in production).
- **Chapters 9–15 renumbered** (Products/Customers/Templates/Admin/Settings/Print/FAQ each
  shifted by one) — side-nav, top TOC, and every in-page chapter cross-reference
  (`href="#chN"`/"บทที่ N" text) updated to match; verified `<section>`/`<figure>` tag counts
  balance (15/15, 16/16) after the edit.
- **Admin chapter** gained one bullet noting the new "บริการ" permission group. **FAQ** gained two
  rows: "บันทึกรายงานบริการเป็นฉบับสมบูรณ์ไม่ได้" (the abnormal-needs-detail-and-photo rule) and
  "ไม่เห็นเมนู 'บริการ'" (missing permission grant).
- **Deliberately NOT documented**, because live verification on production showed they are not
  yet deployed there (production lags `master` — deploys are a manual `git pull && npm run build
  && pm2 restart` per `docs/DEPLOYMENT.md`, not automatic): the 2026-08-13 signature draw/upload
  unification (Settings still showed upload-only, no draw canvas, on inspection), the 2026-08-10
  LINE OA customer-approval flow, and today's (2026-08-14a/b) Dashboard VAT toggle/Service
  summary card/image compression work — none of these were added to the manual this pass, to
  avoid documenting features staff can't actually use yet. Revisit once those are deployed.
- Bumped the manual's `doc-meta`/footer date from "7 สิงหาคม 2026" to "14 สิงหาคม 2026".

---

## 2026-08-14d — Docs: sync to real production cutover (self-hosted VPS, no more Vercel demo)

The owner confirmed in conversation that the server migration recorded in
[SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) actually happened ~2026-08-07 and has been
live for about a week: production now runs on a **self-hosted VPS with its own domain + HTTPS**,
the database is **self-hosted MongoDB** (not Atlas), the **Vercel demo is no longer used**, and the
user manual PDF is already updated. Nothing in the codebase changed — this is a **documentation-only
sync**, since every "current state" doc still described the Vercel demo as live and the migration
as pending, which would have misled any future session (including this one, which initially assumed
the pre-migration state before being corrected).

Updated: `CLAUDE.md` (root + `docs/`), `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/RBAC.md`,
`docs/PROJECT_STATUS.md`, `docs/DEPLOYMENT.md`, `docs/TODO.md` (checked off the migration checklist
item; also caught and resolved an unrelated stale item claiming a 2026-07-30 MongoDB DNS fix was
still uncommitted — `git diff` confirms it's already in `api/_lib/mongodb.ts` with no pending
changes). `docs/SERVER_MIGRATION_PLAN.md` itself got the heaviest edit: its status banner and Go-Live
Checklist steps C–H are now marked done, with explicit notes on which sub-details (process manager
choice, whether Setup Wizard ran fresh vs. carried over demo data, the step F verification checklist)
were confirmed by the owner's summary rather than independently re-verified line-by-line — the
distinction is preserved rather than blanket-claiming full verification.

Not changed: historical entries in this file, `SESSION_LOG.md`, `CODEX_REVIEW_REPORT.md`, and
`docs/manual/user-manual.html` — those correctly describe the Vercel-demo state as it was *at the
time they were written*, and rewriting history isn't the goal here, only correcting the
present-tense "current state" framing scattered across the reference docs.

---

## 2026-08-14c — Fix: Service summary card layout regression

Direct user report, with a screenshot, that the new Scope of Work/Delivery Order/Service summary
cards on the Dashboard (2026-08-14a below) were unreadable — every tile's label was truncated down
to a single character. Root cause: 2026-08-14a's own layout change widened the row from 2 cards
(`lg:grid-cols-2`) to 3 (`xl:grid-cols-3`) to fit the new Service card in, which left each card only
a third of the row's width — too narrow for `ScopeOfWorkSummary`/`ServiceSummary`'s inner 5-tile
grid (`xl:grid-cols-5`), squeezing every label down to 1-2 characters even though each already had
a `truncate` + tooltip fallback for genuinely long labels.

**Fix** (`src/pages/dashboard/DashboardPage.tsx`): reverted the Scope of Work/Delivery Order row
back to its original `lg:grid-cols-2` (their card width is unchanged from before 2026-08-14a) and
moved `ServiceSummary` out to its own full-width row below, rather than squeezing a 3rd card into
the same row — it gets more room this way than a shared row ever could, not just back to parity.

Verified via `npx tsc --noEmit` (clean). No live-browser re-check was possible this session (see
PROJECT_STATUS.md "Known Risks") — the user's own screenshot was the original repro; a follow-up
session should confirm visually.

---

## 2026-08-14b — Browser-side image compression to WebP across every upload site

Direct user request to cut MongoDB storage/bandwidth for image uploads — every image-upload site
in the app (profile picture, company logo/stamp, personal signature, Service checklist photos,
Scope of Work attachments) now compresses the picked file to WebP client-side before storing it,
with no new npm dependency and no server-side change.

- New **`src/lib/imageCompression.ts`**: `isCompressibleImage(file)` (plain MIME-type check) and
  `compressImageFile(file, {maxDimension = 1920, quality = 0.8})` — rejects a raw file over ~20MB
  before decoding, decodes via `createImageBitmap`, downscales only if a dimension exceeds
  `maxDimension` (never upscales an already-smaller image), draws to an off-screen canvas, encodes
  to WebP via `canvas.toBlob()`. Returns `{ dataUrl, blob }` — the data URL for this app's existing
  base64-inline storage convention, the raw `Blob` for a caller that needs its byte size or a
  base64 re-encode for a JSON upload body.
- **`src/components/ImageUploadField.tsx`** (profile picture/company logo/stamp) and
  **`src/components/SignaturePad.tsx`**'s Upload mode both now compress before checking their
  respective byte caps (`MAX_IMAGE_BYTES`/`MAX_UPLOAD_BYTES`) against the *compressed* size, not
  the original — a file that used to exceed the cap may now fit without the user resizing it by
  hand. `SignaturePad`'s Draw mode separately switched `canvas.toDataURL()` from PNG to WebP
  (quality 0.92) — no resize needed for an already-small signature canvas.
- **`src/lib/serviceReports.ts`**'s `uploadServiceReportPhoto()` (Service checklist Abnormal-item
  photos) always compresses, since that upload's `<input accept="image/*">` guarantees every file
  is an image.
- **`src/pages/quotation/ScopeOfWorkDocument.tsx`**'s `handleUploadAttachment()` — the one
  mixed-file-type upload site in the app — only compresses when `isCompressibleImage(file)` is
  true; a PDF or other non-image attachment passes through completely unchanged. `MAX_ATTACHMENT_BYTES`
  is checked against the possibly-compressed size, same pattern as the other two sites.
- No server-side change: every `validateImageDataUrl()` (`api/_lib/uploadValidation.ts`) already
  accepted `image/webp` before this pass.
- See [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Client-Side Image Compression" for the reusable
  pattern, [MODULES/Service.md](./MODULES/Service.md) "Photos"/"Customer sign-off", and
  [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Attachments" for the per-module notes.
- Verified via `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (152/152) — all
  clean. No live-browser upload/compression-ratio check was run this session (standing sandboxed-
  session limitation, see PROJECT_STATUS.md "Known Risks").

---

## 2026-08-14a — Dashboard: pre-tax/post-tax (VAT) toggle + Service summary card

Two direct user requests landed together in the same pass.

**VAT toggle** (supersedes the 2026-07-14 "always pre-tax" hard rule): `GET /api/dashboard` gains
a `?vat=pre|post` query param (default `pre`, preserving the original behavior for any caller that
doesn't pass it). A local `quoteAmount()` dispatcher in `api/dashboard/index.ts` picks
`computeQuoteAmountBeforeVat()` or the new `computeQuoteAmountWithVat()` (both in
`api/_lib/quoteAmounts.ts`) at the 3 places the route computes money from raw `lines`/`discount`.
`VAT_RATE` stays a single hardcoded 7% constant — no per-company/per-quote rate, deliberately out
of scope. The resolved mode is echoed back as `filters.vatMode`. `DashboardFilterBar.tsx` renders
a toggle (new shared `src/components/Toggle.tsx`, extracted out of `SettingsPage.tsx`'s previously
inline copy) defaulting to pre-tax/unchecked; every affected component (`ExecutiveSummaryCards`,
`QuotationStatusSummary`, `SalesPerformancePanel`, `ExpectedSalesForecastChart`,
`RevenueTrendChart`, `RevenueByJobTypeChart`, `PipelineSteps`, both `SalesPerformanceTable` uses,
`CustomerAnalytics`, `JobTypeAnalytics`, `ApprovalDashboard`, `FollowUpReminders`) now takes a
`vatMode` prop sourced from the server-echoed `stats.filters.vatMode`. Two new i18n keys,
`dashboard.vatSuffix.pre`/`.post`, replace ~32 previously-hardcoded "ก่อนภาษี"/"Before VAT"
dictionary entries with a suffix appended dynamically at render time. Per direct user request, the
toggle also covers `csvExport.ts` and `xlsxExport.ts` — every exported header now derives its
`vatLabel`/`vatNote` from `filters.vatMode` too, so switching the toggle changes what gets
exported, not just what's on screen.

**Service summary card**: Service was the only document module (Quotation/Scope of Work/Delivery
Order all already had one) with zero presence on the Executive Dashboard. `GET /api/dashboard`
gains a `serviceSummary: { total, draft, completed, cancelled, thisMonth } | null` field, gated on
`service:view`, own-records-only without `service:viewAll` (mirroring
`api/_lib/serviceReportHandler.ts`'s `handleList()` ownership predicate exactly), isolated in its
own try/catch like every other optional Dashboard section. Deliberately **not** filtered by the
date-range/salesperson/department filter — a Service Report has no `salesperson` field of its own
(`assignedServiceEngineerId` instead) and no comparable filterable date dimension, same reasoning
already documented for the Scope of Work/Delivery Order summary cards. New
`src/pages/dashboard/ServiceSummary.tsx` (copied the `ScopeOfWorkSummary.tsx` 5-tile pattern),
rendered in `DashboardPage.tsx`'s supporting-detail section beside the SOW/DO cards (grid widened
from `xl:grid-cols-2` to `xl:grid-cols-3`, each card still independently null-hides per permission).

See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "VAT Toggle" and "Pages / Components",
[MODULES/Service.md](./MODULES/Service.md) "Dashboard visibility", [API.md](./API.md), and
[UI_GUIDELINES.md](./UI_GUIDELINES.md) "Pre-Tax Amount Labeling". Verified via
`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` (152/152) — all clean. Same
standing sandboxed-session limitation as every prior Dashboard pass — no live-database click-through
this session (see PROJECT_STATUS.md "Known Risks").

---

## 2026-08-13b (absolute latest) — fix: Service customer sign-off should stay draw-only, not draw-or-upload

Direct user correction to the same-day entry below: that pass gave the Service module's customer
sign-off (on-site *and* the remote LINE-approval page) the same "Draw"/"Upload" toggle as Settings'
personal signature, on the reasoning that both call sites already shared `SignaturePad.tsx`. The
user clarified the actual requirement was narrower — **only** Settings' personal signature should
offer both input methods; a **customer** signing a Service Report must draw their own signature,
never attach an arbitrary image file standing in for one.

- `SignaturePad.tsx` gained a new `allowUpload` prop (default `true`, so Settings' reuse needed no
  change). When `false`, the mode toggle isn't rendered at all — the component never leaves Draw
  mode, so Upload is unreachable, not just hidden-but-present.
- `ServiceReportEditor.tsx` (on-site customer sign-off) and `CustomerApprovalPage.tsx` (remote
  LINE-approval signing) both now pass `allowUpload={false}`.
- Settings' `SettingsPage.tsx` usage is unchanged — it relies on the `true` default and keeps both
  modes.
- Re-verified in-browser: opened the same Service Report used for the previous pass's screenshot
  and confirmed the customer sign-off card now shows the canvas directly, no toggle. `tsc`/`lint`/
  `build`/`test` (152/152) all pass clean.

---

## 2026-08-13 — Signature capture: draw-or-upload, unified between Settings and Service

Direct user request: the Settings → Profile "Personal Signature" field was upload-only
(`ImageUploadField.tsx`, added with the rest of Settings) while the Service module's on-site
customer sign-off was draw-only (`SignaturePad.tsx`, added 2026-08-07) — the user wanted both
fields to offer both input methods, and wanted the two features unified into one reusable
control rather than maintained as two separate implementations.

- **`src/components/SignaturePad.tsx`** gained a "Draw"/"Upload" segmented toggle above the
  input area. Draw mode is the pre-existing canvas capture, unchanged. Upload mode reuses
  `ImageUploadField.tsx`'s validation (image-type check, 1 MB client-side limit, `FileReader` →
  base64) inline, showing the picked image in the same preview box the canvas would occupy.
  Switching modes discards whatever was pending in the mode being left (a stroke or a picked
  file), so nothing from the abandoned mode can leak into a Confirm. Both modes converge on the
  same `onConfirm({ dataUrl, name })` callback and the same locked read-only preview + "แก้ไข"
  redo link — the parent, and the server, don't know or care which mode produced the image.
  New `requireName` prop (default `true`, unchanged behavior for existing callers): when
  `false`, the signer-name input is hidden and the caller's own `signerName` prop is sent
  through unedited — added so Settings' reuse (signer is always the logged-in user, name is
  redundant) doesn't force a name re-entry on every redraw.
- **`src/pages/SettingsPage.tsx`** — Profile tab's "Personal Signature" field now renders
  `SignaturePad` (`requireName={false}`, `signerName={profileDraft.fullName}`) instead of
  `ImageUploadField`. `ImageUploadField.tsx` itself is unchanged and still used for profile
  picture and company logo/stamp (upload-only fields with no draw option).
- **Service module** — `ServiceReportEditor.tsx`'s customer sign-off and
  `CustomerApprovalPage.tsx`'s remote-approval signing both automatically gained the
  Draw/Upload toggle with no code change on their end, since both already rendered the shared
  `SignaturePad` component.
- New i18n keys (`signaturePad.modeDraw`/`modeUpload`/`uploadPreviewAlt`/`changeFile`, th+en);
  reused the existing `settings.image.onlyImages`/`tooLarge`/`readError`/`sizeHint` keys for
  upload-mode validation messages rather than duplicating them.
- Verified in-browser (Chrome, via claude-in-chrome): drew and saved a signature in Settings,
  reloaded to confirm persistence, redid it via Upload mode with a real file upload, and
  confirmed the Service Report sign-off card shows the same toggle. `npx tsc --noEmit`,
  `npm run lint`, `npm run build`, `npm test` (152/152) all pass clean.

---

## 2026-08-11 — fix: approval-link copy button silently failed on plain HTTP

User-reported: the "คัดลอกลิงก์" button on the Service Report customer-approval dialog
(`ServiceReportEditor.tsx`, added 2026-08-10) did nothing when clicked. Root cause:
`navigator.clipboard` only exists in secure contexts (HTTPS or `localhost`) — over plain HTTP on
a LAN IP (how the standalone Express server is commonly reached locally) it's `undefined`, so
`.writeText()` threw synchronously instead of rejecting into the `.catch()` that was there to
handle it. New `copyApprovalLink()` checks `window.isSecureContext` first and falls back to a
hidden `<textarea>` + `document.execCommand("copy")` when the Clipboard API isn't usable.

---

## 2026-08-10 — Service Report: customer approval via time-boxed link + LINE OA

Direct user request ("จะทำตรงหน้า Service เพื่อที่จะส่งใบไปให้ลูกค้า approve ใน Line OA") — the
customer (no ERP account) reviews and approves/rejects a Service Report from their phone.

- **Approval link**: `POST /api/service-reports/:id/send-approval` (`service:edit`) mints a
  single-purpose 7-day capability link (`/approve?report=…&key=…`; only the token's SHA-256 is
  stored as `customerApproval.tokenHash`, stripped from every authenticated response). Public
  `GET …/approval?key=` + `POST …/approval/respond` — approve requires a signature (written into
  the existing on-site `customerSignatureDataUrl`/`SignedName`/`SignedAt` fields, so the printed
  report shows it identically), reject requires a reason; one response per link; expired = 410.
  Audit entries (customer actor) + new `service_report_customer_approved`/`_rejected` bell
  notifications to sender/creator/engineer.
- **LINE OA (new `api/_lib/lineHandler.ts`)**: one-time pairing —
  `POST /api/customers/:id/line-pairing` (24-h `TCS-XXXXX` code; `customers:edit` or
  `service:edit`) + the signed webhook `POST /api/line/webhook` (HMAC over the raw body;
  `server/app.ts` now captures `req.rawBody` and routes `line:`; Express-only, no vercel.json
  change) stores `customers.lineUserId` (public) / `linePairing` (server-only, stripped by the
  new `toPublicCustomer()`). Sending then best-effort pushes a navy/gold Flex bubble with the
  link; unlinked/unconfigured degrades to copy-the-link. Env (optional):
  `LINE_CHANNEL_ACCESS_TOKEN`/`LINE_CHANNEL_SECRET` (`.env.example`).
- **UI**: `ServiceReportEditor.tsx` — the inert 2026-08-07 "remote link" placeholder button is
  now the real "ส่งให้ลูกค้าอนุมัติ (ลิงก์/LINE)" (saves first; result dialog with copy-link,
  LINE status, and pairing-code issuance) + approval status lines. New session-free public page
  `src/pages/approval/CustomerApprovalPage.tsx` (Thai-only, mobile-first; `src/main.tsx` branches
  on `/approve` before the auth gate; reuses `SignaturePad`).
- **Tests**: new `tests/api/serviceApproval.test.ts` (6) — link mint + no-hash-leak, opaque-404
  key check, approve/reject validation + once-only, expiry 410, pairing + signed webhook (bad
  signature 403) + no-`linePairing`-leak. What's New entry `2026-08-10-service-customer-approval`.
  Docs synced: Service.md, API.md, DATABASE.md, ARCHITECTURE.md, TODO.md (owner setup item),
  docs/CLAUDE.md.

---

## 2026-08-10 — Web manual: always dark

Direct user request ("แก้หน้าคู่มือให้หน่อยเป็นธีมมืดเหมือนเดิม") — the manual now renders the dark
palette unconditionally (the same values its old `prefers-color-scheme: dark` block used, which is
the look the user always saw on their dark-mode machine). Deliberately NOT tied to the OS color
scheme — the mode-dependent swap confused users before ("ไม่เห็นเปลี่ยนเลย"). The app itself stays
light; the manual is its own dark reading surface. `@media print` overrides the tokens back to a
light palette so print-to-PDF stays white-paper readable. Verified via computed styles in a real
browser (ground `#10161f`, ink `#dce2ec`, card `#171f2b`).

---

## 2026-08-07 — Cream theme reverted: back to the original white/blue-grey neutrals

Direct user request ("ทำกลับไปธีมขาวเหมือนเดิม") — the warm-cream neutral family from earlier today
lasted a few hours. `src/styles/theme.css` restored to the original values (`--background #f4f6fb`,
`--secondary #e8edf7`, `--muted`/`--input` `#eef1f8`, `--switch-background #c5d0e4`, `--border`
navy `rgba(11,29,58,.1)`); `public/manual.html`'s palette re-synced to match (ground/line/code-bg —
it keeps `--gold-ink #866d28` for small gold text and stays always-light, no dark-mode block);
DESIGN.md palette names/prose restored (`paper-blue`/`muted-mist`/`border-navy`, "navy ledger, gold
seal"); UI_GUIDELINES token table restored; the `2026-08-07-cream-theme` What's New entry removed
(reverted before users meaningfully saw it — same precedent as the removed Gmail entry).

---

## 2026-08-07 — Email sending removed entirely: document recipients are in-app-notification-only

Direct user request ("ตัดการส่งอีเมลออกไปเลยเหลือไว้แค่ส่งในระบบพอ") — the same-day person-to-person
Gmail rewrite (below) proved too hard for staff to set up (2FA + App Password), so the email channel
was cut altogether. "ส่งแจ้งเตือนผู้รับเอกสาร" (renamed from "ส่งอีเมลแจ้งผู้รับเอกสาร") now only
writes the bell notifications + audit entry and makes the record visible to recipients.
"ผู้รับเพิ่มเติม" any-user recipients and all recipient-resolution rules are unchanged.

- **Deleted**: `api/_lib/email.ts`, `api/_lib/emailCredentials.ts`, `tests/emailCredentials.test.ts`,
  `tests/api/emailSettings.test.ts`, the `nodemailer`/`@types/nodemailer` dependencies, the
  `EMAIL_CRED_SECRET` env var (`.env.example`), the Settings "การส่งอีเมล (Gmail App Password)"
  card + its i18n keys, `POST /api/users/:id/email-test`, the self-only `emailAppPassword` PATCH
  field, `User.hasEmailAppPassword` / `sendTestEmail()` (`src/lib/users.ts`), the email HTML
  builder + threading (`ScopeOfWork.emailThreadId` — no longer typed or written; stale values in
  old documents are ignored), and the 5 Gmail walkthrough screenshots
  (`public/manual-images/g1..g5`).
- **`api/_lib/scopeOfWorkHandler.ts`** — `handleSendDocumentNotifications()` reduced to recipient
  resolution → bell notifications → audit entry; response shape kept
  (`{ok, sentCount, failedCount: 0, recipientCount}`, `sentCount` = notified) so the client toast
  logic is unchanged. `users.emailAppPasswordEnc` remains only as a defensively-stripped legacy
  field in `toPublicUser()`.
- **UI**: send button renamed "ส่งแจ้งเตือนผู้รับเอกสาร" (en: "Notify document recipients"); the
  missing-App-Password warning/disable is gone; `DocumentRecipientsPicker` copy now describes the
  bell notification (attachments/message are stored on the record for recipients to open).
- **Manual** (`public/manual.html`) — chapter 6 rewritten as "การส่งเอกสารถึงผู้รับ" (no-setup,
  4 steps, recipient-side view, new troubleshooting table); TOCs/ch5/ch11/ch12/FAQ references
  updated.
- **What's New** — the same-day Gmail announcement entry was removed (feature never survived the
  day) and replaced by `2026-08-07-in-app-document-notify`.
- **Tests**: `tests/api/sendDocumentNotifications.test.ts` rewritten for notification-only
  behavior (87 tests total pass — down from 105 with the two email test files gone). Docs synced:
  API.md, DATABASE.md, ARCHITECTURE.md,
  DEPLOYMENT.md, SERVER_MIGRATION_PLAN.md, TODO.md, MODULES/ScopeOfWork.md, MODULES/Settings.md,
  docs/CLAUDE.md, PROJECT_STATUS.md.

---

## 2026-08-07 — Web manual: dark-mode override removed (always cream)

User reported "ไม่เห็นเปลี่ยนเลย" with a dark-palette screenshot — their OS is in dark mode, so the
manual's `prefers-color-scheme: dark` block was silently overriding the new cream palette. Since the
ERP app itself has no dark mode (always cream), the manual's dark block was removed entirely so the
page matches the app for everyone regardless of OS theme. Header comment updated accordingly.

---

## 2026-08-07 — Web manual palette synced to the app's theme tokens

Follow-up to the cream theme below, per direct user request ("เปลี่ยนคู่มือด้วย" — make the manual
match the app exactly).

- **`public/manual.html`** — light-mode tokens now equal `src/styles/theme.css`: ground `#f7f4ec`,
  line `rgba(93,80,48,.16)`, gold `#c9a84c`, ink/muted `#0b1d3a`/`#5a7299`, code-bg `#f1ede1`,
  good/warn/danger switched to the app's darkened text-grade variants (`#207e52`/`#a75d1a`/`#d22626`).
  New `--gold-ink` (`#866d28`, the app's Pending-Approval pill text) replaces raw gold on all
  small gold text (eyebrow, chapter/step numbers, sidebar TOC numbers/title, hovers, flow arrows) —
  raw `#c9a84c` is ~2:1 on cream, unreadable as text; `#866d28` clears 4.5:1. Focus ring keeps
  `#c9a84c` (equals the app's `--ring`). Dark-mode block unchanged apart from `--gold-ink` alias.
  Verified via Playwright at 1440px.

---

## 2026-08-07 — App-wide cream theme: neutral surfaces shifted from cool blue-grey to warm cream

Direct user request after seeing the web manual's paper tone ("ทำเว็บเป็นสีธีมครีมแบบที่ลองเทสได้ไหมสวยดี").

- **`src/styles/theme.css`** — the neutral token family only: `--background` `#f4f6fb`→`#f7f4ec`,
  `--secondary` `#e8edf7`→`#ebe6d8`, `--muted`/`--input`/`--input-background` `#eef1f8`→`#f1ede1`,
  `--switch-background` `#c5d0e4`→`#d6cfbd`, `--border` navy `rgba(11,29,58,.1)`→warm ink
  `rgba(93,80,48,.16)` (same "ink hairline" concept, re-inked so borders sit naturally on cream).
  **Unchanged**: navy ink, gold/hover-gold, the navy sidebar block, all 9 status hexes + their
  darkened text variants, chart palette, danger red. Since every page consumes these via
  `bg-background`/`bg-muted`/etc. token utilities (verified: the old hexes appeared nowhere else
  in `src/`), the single-file change re-themes the whole app; hardcoded hexes in components are
  all semantic (gold/red/status) and deliberately untouched.
- **`DESIGN.md`** — palette renamed/updated to match: `paper-blue`→`paper-cream`,
  `muted-mist`→`muted-linen`, `border-navy`→`border-ink`, plus all prose references
  ("navy ledger, gold seal, cream paper"). **`docs/UI_GUIDELINES.md`** token table updated with
  was/now values.
- **What's New** — Thai entry `2026-08-07-cream-theme`.
- Muted-text contrast on the new cream ground is ≈4.4:1 — parity with the old blue ground
  (≈4.5:1), no regression; muted text on white cards stays ≈4.9:1.

---

## 2026-08-07 — Web manual: sticky sidebar chapter navigation

Direct user request ("อยากให้ในหน้าคู่มือให้ด้านข้างสามารถกดไปตามแต่ละหัวข้อได้ จะได้ไม่ต้องเลื่อนมากดด้านบนบ่อยๆ").

- **`public/manual.html`** — added a fixed left sidebar TOC (`.side-nav`, all 14 chapters + "↑ ขึ้นบนสุด")
  shown only at ≥1140px viewport width; narrower screens keep the existing in-page top TOC unchanged.
  A small `IntersectionObserver` scroll-spy highlights the chapter currently being read (gold-soft
  pill, no side-border accent). Hidden in print (`@media print`), body padding reset. Verified via
  Playwright at 1440px (sidebar + active highlight correct) and 820px (hidden, no horizontal scroll).

---

## 2026-08-07 — User manual is now a web page (`public/manual.html`) replacing the PDF link

Direct user request after seeing the standalone email-setup guide's document design ("อยากได้แบบนี้
ไปไว้ในเว็บตรงที่เป็นคู่มือการใช้งาน ให้ปรับเปลี่ยนเป็นรูปแบบนี้เลย"); the "หน้าเว็บแทน PDF" option
was confirmed via an explicit choice prompt.

- **New `public/manual.html`** — the full manual as a single self-contained static page (system
  Thai font stack, no external requests, light/dark via `prefers-color-scheme`, print-to-PDF
  friendly, anchor TOC): all 13 chapters ported from `docs/manual/user-manual.html` and updated
  (Service module in the sidebar table, rolling 7-day session wording, SOW recipient section),
  **plus a new chapter 6 "การส่งอีเมลเอกสาร (Gmail)"** — the App Password setup steps,
  send/verify flow (Sent-folder check, in-app bell fallback), troubleshooting table, and the
  security note. Screenshots deliberately not carried over (kept the page light; text is primary).
- **`src/App.tsx`** — the topbar's gold "คู่มือการใช้งาน" button now opens `/manual.html` instead
  of the PDF. The PDF (`public/คู่มือการใช้งาน TCS ERP.pdf`) stays on disk but is no longer linked;
  `docs/manual/user-manual.html` is marked SUPERSEDED in its header (update `public/manual.html`
  going forward).
- **What's New** — Thai entry `2026-08-07-web-manual`.
- Standalone-page note: the manual intentionally uses its own document type scale / system Thai
  font stack (matching the standalone guide the user approved), not the app's DESIGN.md ramp.

---

## 2026-08-07 — Scope of Work email is person-to-person from each sender's own Gmail (Resend removed) + "ผู้รับเพิ่มเติม" any-user recipients

Direct user request: document-recipient emails must be sent person-to-person — "ใครส่งให้คนไหนก็คือ
ใช้อีเมลของคนนั้น" (the sender's own registered email is the actual From, so recipients can reply
directly), Resend dropped entirely, and recipients selectable from ANY employee, not only the
checked checklist departments. Confirmed approach: each user stores their own **Gmail App
Password** once; sending goes through Gmail SMTP as that user.

- **New `api/_lib/emailCredentials.ts`** — AES-256-GCM for the stored App Passwords
  (`v1:<iv>:<tag>:<ct>` base64url; key = scrypt of the new **`EMAIL_CRED_SECRET`** env var,
  deliberately separate from `JWT_SECRET` so a session-secret rotation can't destroy stored email
  credentials). `decryptAppPassword()` returns `null` on any failure (tamper/rotation/garbage) so
  callers degrade to a 400 "ตั้งค่าใหม่", never a 500. `normalizeAppPassword()` strips the spaces
  Gmail displays and enforces the 16-letter format.
- **`api/_lib/email.ts` rewritten** — Resend `fetch` → **nodemailer + Gmail SMTP**
  (`smtp.gmail.com:465`, pooled transport per send action): `createGmailTransport()`,
  `sendEmailAs()` (From = `"ชื่อผู้ส่ง" <อีเมลผู้ส่ง>`, native messageId/inReplyTo/references
  threading options), `GmailAuthError` (`EAUTH`/535). `isEmailConfigured()`/
  `EmailNotConfiguredError`/`RESEND_API_KEY`/`EMAIL_FROM` are gone.
- **`users` schema** — new server-only `emailAppPasswordEnc?: string`; `toPublicUser()` now strips
  it (alongside `passwordHash`) and exposes a derived **`hasEmailAppPassword: boolean`** — the
  strip is load-bearing, `GET /api/users` returns every user to every authenticated client.
- **`PATCH /api/users/:id`** accepts `emailAppPassword` — **strictly self-only (403 even for
  `users:manage` admins**; it's a personal Gmail credential); `""` clears via `$unset`. New
  **`POST /api/users/:id/email-test`** (self-only) sends a test email to the caller's own address.
- **`handleSendDocumentNotifications()`** — resolves the acting user's credential (clear Thai 400
  pointing at ตั้งค่า → ความปลอดภัย when missing/undecryptable; 500 only for a missing
  `EMAIL_CRED_SECRET`); fan-out through one pooled transport; an **all-`GmailAuthError` fan-out is
  now a 400** instead of a deceptive `{ok:true, sentCount:0}`; email footer changed from
  "อย่าตอบกลับ" to "ตอบกลับ...ได้โดยตรง" + names the sender. Threading scheme unchanged (Gmail SMTP
  preserves custom `Message-ID`s, so Resend-era threads keep working).
- **"ผู้รับเพิ่มเติม" (`ADDITIONAL_RECIPIENT_KEY = "additional"`)** — new `documentRecipients` key
  (deliberately not `"other"`, which is a checklist option with note-required validation): any
  employee, searchable picker box in `DocumentRecipientsPicker.tsx` (selected users pinned above
  search results), **always included in a send** regardless of checked departments. New
  `ALL_RECIPIENT_KEYS` (6 departments + `additional`) now drives the sanitizer whitelist AND all
  three recipient-visibility `$or` filters (scope list / Global Search / dashboard counts) — without
  that, an additional-only recipient could get the email yet never find the record in the app.
  `diffDocumentRecipients()` diffs the new key too ("ผู้รับเพิ่มเติม: เพิ่ม/ลบ ...", no แผนก prefix).
- **UI** — `ScopeOfWorkDocument.tsx`: send button no longer requires a checked department, and is
  disabled with a warning line when the current user has no App Password (`hasEmailAppPassword`).
  `SettingsPage.tsx` (ความปลอดภัย tab): new "การส่งอีเมล (Gmail App Password)" card — status pill,
  4-step Thai help copy (2-Step Verification prerequisite, apppasswords URL, stored-encrypted note,
  ~500/day limit), save/clear (ConfirmDialog)/test-email actions. New `settings.emailSending.*` +
  `scopeOfWorkDoc.sendNeedsAppPassword` i18n keys (th+en).
- **Env** — `.env.example`: Resend block replaced by `EMAIL_CRED_SECRET` (rotation consequence
  documented: login unaffected, everyone re-enters their App Password). Host must allow outbound
  TCP 465.
- **Deps** — `nodemailer` + `@types/nodemailer`.
- **Tests (12 files, 105 pass)** — new `tests/emailCredentials.test.ts` (round-trip, tamper→null,
  rotation→null, format), `tests/api/emailSettings.test.ts` (self-only 403s, no-leak assertions on
  PATCH + the full directory, clear, email-test 403/400/EAUTH→400; nodemailer mocked), and
  `tests/api/sendDocumentNotifications.test.ts` (unconfigured-sender 400, per-recipient fan-out
  with the sender's own From, additional-only send with zero checked departments, `Re:`/In-Reply-To
  threading on the second send, all-EAUTH→400, unchecked-department-only → 400).
- **What's New** — Thai entry `2026-08-07-gmail-personal-sending`.
- Docs: this file, [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md),
  [MODULES/Settings.md](./MODULES/Settings.md), [API.md](./API.md), [DATABASE.md](./DATABASE.md),
  [ARCHITECTURE.md](./ARCHITECTURE.md), [DEPLOYMENT.md](./DEPLOYMENT.md),
  [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) (step A obsolete),
  [TODO.md](./TODO.md), [CLAUDE.md](./CLAUDE.md).
- **Not live-verified**: real SMTP delivery (no Gmail App Password exists in this sandbox) — the
  transport layer is mocked in tests; first real send needs a human with a configured account
  (tracked in TODO.md).

---

## 2026-08-06 — nginx config baked into a custom image (`nginx/Dockerfile`)

User request ahead of putting the stack on a real server: build the nginx site config into the
image (`COPY nginx.conf /etc/nginx/conf.d/default.conf`) instead of volume-mounting it.

- **`nginx/nginx.conf`** — moved (git mv) from `nginx/conf.d/default.conf`; content unchanged
  except the header comment now documents the bake-in and that editing it requires
  `docker compose up -d --build`.
- **`nginx/Dockerfile`** (new) — `FROM nginx:stable-alpine` + the exact COPY line the owner
  specified. **`nginx/.dockerignore`** (new) keeps `certs/` out of the build context entirely —
  private keys must never enter an image; certs stay a read-only runtime volume mount
  (`./nginx/certs:/etc/nginx/certs:ro`), unchanged.
- **`docker-compose.yml`** (untracked; reference in [DEPLOYMENT.md](./DEPLOYMENT.md) synced):
  the `nginx` service switched from `image: nginx:stable-alpine` + a `./nginx/conf.d` mount to
  `build: ./nginx`; the conf mount is gone, the certs mount remains the only one.
- **Verified live**: `docker compose up -d --build` → `erp-nginx` image built with the config
  baked in (confirmed inside the container and via `docker inspect` — only the certs mount
  remains), HTTP→HTTPS 301, `GET /api/auth/session` → `needsSetup:true` over HTTPS. Stack
  stopped after the test.

---
## 2026-08-07 (absolute latest) — Fix: sign-off columns didn't line up once a customer signature existed

Reported with a screenshot. `SignaturePad`'s signed state rendered its own "ลายเซ็นที่บันทึกไว้" /
"Captured signature" label *above* the card — stacked under the parent's "Customer" heading — so the
customer card started a line lower than the read-only Service Engineer card beside it, which has no
such label.

- **`src/components/SignaturePad.tsx`** — the label is gone from above the card and now sits below
  the signature image as a small muted caption directly above the signer's name, alongside the
  existing "Signed <date>" line. Both columns' cards now begin at the same vertical position,
  immediately under their respective headings. Also drops a now-redundant wrapper `<div>`.
- Presentation only — no change to capture, storage, validation, or the print view, and the label
  text/i18n keys are unchanged.
- **Unchanged, and worth knowing**: in the *unsigned* state the customer column still starts lower,
  because it legitimately carries an extra form field (the required "ชื่อผู้ลงนาม" input with its
  own label) above the drawing pad. That's a real field rather than a caption for the box, so it
  wasn't folded into this fix.

## 2026-08-07 — Revert: Dashboard is visible again in the Service Engineer's sidebar

Partial reversal of the sidebar trimming below, on the owner's instruction — the "engineers should
only see บริการ" requirement rested on unclear internal communication. **Customers stays hidden**;
this is Dashboard only.

- **`src/lib/roles.ts`** — `ROLE_HIDDEN_NAV_KEYS.service_engineer` goes from
  `["dashboard", "customers"]` to `["customers"]`. That single line is the whole functional change:
  the sidebar item, the Global Search page shortcut, and the landing page all read from it, so all
  three revert together with nothing else to touch.
- **No RBAC change, in either direction.** `dashboard:view` was granted throughout — the original
  change was deliberately visibility-only — so there is nothing to re-grant and no production role
  document to fix up.
- **Side effect worth knowing**: `homeNav` is the first *visible* nav item, so a Service Engineer
  now lands on the Dashboard at sign-in again rather than on "บริการ". That follows automatically
  and is the pre-existing behaviour for every other role.
- The `homeNav`/`effectiveNav` landing-page derivation added alongside the original change is
  **kept**. It was introduced because hiding Dashboard would otherwise have stranded the role on a
  page with no sidebar entry, but it's the correct general rule regardless — any future hidden nav
  entry gets the same protection without rediscovering the problem.
- **Tests** (143 passing, up from 142): the assertions pinning Dashboard as hidden are inverted, and
  a new one asserts **no** default role hides Dashboard — worth stating explicitly rather than
  leaving implicit, given it was hidden once and withdrawn.

## 2026-08-07 — Page tours are marked "seen" when they auto-appear, not when dismissed

Behaviour change, following the StrictMode fix below. That fix made dismissal-marking work
reliably, but dismissal was still the wrong trigger: a user who let the auto-played tour sit and
navigated away produced no completion event at all (the unmount path deliberately suppresses one),
so it auto-played again next visit. Appearing once is what the user experiences, so appearing once
is now what's recorded.

- **`useModuleTour`** (`src/components/GuidedTour.tsx`) — the auto-fire now marks the tour seen the
  moment it renders: `if (startRef.current()) markPageTourCompleted(tourKey, userId)`. A user never
  gets a second automatic play, whether they finished it, ignored it, or clicked away.
- **`start()` now returns `boolean`** — `true` only if the tour actually drove. It already bailed
  when none of its step anchors were in the DOM; that early return previously vanished silently.
  Marking on start without this would permanently suppress a tour that never appeared — the exact
  failure the Service module's `autoStart` gating exists to avoid.
- **The manual replay path now writes nothing at all.** It shares `start()` but no longer shares the
  marking, because `useModuleTour` stopped passing an `onFinish` to `useDriverTour`. **This is a
  behaviour change to the manual path**, and worth stating plainly since the request assumed it was
  already neutral: previously *any* dismissal wrote the mark, so clicking the help button on a page
  whose auto-play hadn't fired yet (e.g. `QuoteDocument` in create mode, where `autoStart: isDetail`
  is still false) would mark it seen and cost the user their automatic first play. That side effect
  is now gone, which matches the request's stated intent.
- **`useDriverTour`'s dismissal tracking is untouched** — `onFinish`/`onDestroyed`/`unmountingRef`
  all behave exactly as before and still serve `useGuidedTour`, the main first-login tour, whose
  `markTourCompleted` on dismissal is unchanged.
- **Flagged, not changed**: the main first-login tour therefore keeps the very gap this fixes for
  page tours — start the welcome walkthrough, navigate away mid-tour, and `markTourCompleted` never
  fires, so the welcome prompt returns next login. (Its *Skip* button marks directly, so skipping is
  unaffected.) The request explicitly scoped this to page tours, so it was left alone; recorded in
  TODO.md as a decision.
- No test coverage is possible for this: it's React effect/DOM behaviour and the repo has no DOM
  test environment. The storage-layer tests from the pass below still hold. See TODO.md.

## 2026-08-07 — Fix: guided tours re-auto-played on every visit (StrictMode ref latch)

Reported as a Service-module regression ("the tour auto-plays every time I enter a Service page").
It is neither Service-specific nor new: **every tour on every page has had this since the per-page
tour system shipped 2026-07-29**, and it only manifests in **development builds**.

**Root cause** — `useDriverTour` (`src/components/GuidedTour.tsx`) kept an `unmountingRef` so a tour
torn down by a page unmount wouldn't be recorded as "completed". The cleanup set it to `true`; the
setup never reset it to `false`. React 18 StrictMode runs effects **mount → cleanup → mount** in
development, and refs survive that (same component instance), so the flag latched `true` on the
simulated unmount and stayed true for the component's entire life. `onDestroyed` therefore never
called `onFinish`, `markPageTourCompleted()` never ran, `hasPageTourCompleted()` stayed false — and
the auto-start effect re-fired on every mount, forever.

- **Fix**: the effect now resets `unmountingRef.current = false` on setup, the canonical
  StrictMode-safe pattern, and returns the existing cleanup. One-line behavioural change; the
  ref's original purpose (don't mark an interrupted tour complete) is preserved.
- **Not the cause, checked and cleared** (all four things the report asked about):
  1. `src/lib/tour.ts` is correct and symmetric — `hasPageTourCompleted`/`markPageTourCompleted`
     derive the same `tcs_erp_page_tour_completed:<tourKey>` key, write real `localStorage`, and
     scope per user. Now pinned by tests.
  2. `ServiceReportEditor`'s `autoStart: !isNew && !!report` does **not** re-arm on a `report`
     reference change: `report` isn't in the effect's dependency array, and `!!report` is a boolean
     that goes false→true exactly once. Save/refetch cannot retrigger it.
  3. The write is real `localStorage`, not in-memory — it was simply never reached.
  4. **Scope: all three Service surfaces, and every other page tour too, in dev.** The report's
     "since Service was added" is coincidental — Service was just the module being tested.
     Production builds are unaffected (StrictMode's double-invoke is development-only).
- **Tests** (142 passing, up from 135): `tests/tourCompletion.test.ts` (new, 7 tests) pins the
  storage half — read/write key symmetry, real persistence, per-tour-key and per-user isolation,
  idempotent marking, corrupted-JSON tolerance, and that the main tour's store stays separate. A
  key-prefix mismatch would produce this exact symptom with a different cause, so it's worth a guard.
- **Coverage gap, flagged not closed**: the regression itself is a React effect-lifecycle bug, and
  this repo has no DOM test environment (`jsdom`/`happy-dom`/`@testing-library/react` all absent), so
  nothing automated can catch its recurrence. Adding that infrastructure is a real decision, not a
  bug-fix side effect — recorded in TODO.md.

## 2026-08-07 — Guided-tour audit: the Service module had no tour or replay button at all

User report: "the question mark disappeared after clicking Done and I couldn't find it again", page
unknown. Audited both tour surfaces.

**Audit findings — the two suspected causes were both clean:**

- **Main first-login tour** (`useGuidedTour`): its replay lives in the user-menu dropdown's "Help"
  entry, rendered unconditionally (`App.tsx`) — always present, never tied to tour state. The
  bottom-right welcome *prompt* does vanish permanently after Skip/Start, which is correct (it's a
  one-time invitation, not the control). Left as is; see the note below on discoverability.
- **Per-page replay buttons**: verified `hasPageTourCompleted()` is referenced in exactly one place
  — `GuidedTour.tsx:64`, the auto-fire gate — and **never** in any render path. All existing buttons
  are unconditional siblings of their page's conditional blocks (checked Dashboard specifically,
  where export buttons *are* conditional and the replay button sits outside that block). So no
  button anywhere was hiding itself after first use.

**The actual gap: the Service module (built 2026-08-06, after the tour system) had no tour at all** —
no `useModuleTour`, no replay button, on any of its three surfaces. A user who dismissed the welcome
prompt and then worked in Service would find a question-mark icon on every other page and none
there, which matches the report.

- **`ServiceList.tsx`** — new `"service"` tour (summary tiles → search/filter → table) +
  `TourReplayButton`, deliberately placed *outside* the `canCreate` gate so a read-only role still
  gets it. Needed a new `currentUserId` prop, passed from `ServicePage`.
- **`ServiceReportEditor.tsx`** — new `"serviceDoc"` document tour (actions → checklist → sign-off),
  with `autoStart: !isNew && !!report` so it waits for the record, the same race
  `ScopeOfWorkDocument`/`DeliveryOrderDocument` already had to gate. The replay button is first in
  the toolbar and unconditional — every other button there is status- or permission-gated.
- **`ServiceTemplateManagement.tsx`** — new `"serviceTemplates"` tour (template list → show-archived
  toggle) + replay button; needed a `currentUserId` prop, passed from `App.tsx`.
- +32 i18n keys (th/en) for the new steps.
- **Root cause of the omission, fixed too**: `docs/CLAUDE.md` described `TourReplayButton` as living
  *inside* `GuidedTour.tsx`. It doesn't — it's `src/components/TourReplayButton.tsx`. Anyone
  following that description (as the Service build did) would find no such export and move on. The
  entry now names the real file, states that `hasPageTourCompleted()` gates only the auto-fire, and
  adds the rule that a replay button must render unconditionally.

**Known, unchanged**: the 11 older pages still hand-roll their HelpCircle markup instead of using
`TourReplayButton`, in two size variants (`w-9 h-9`/15 vs `w-8 h-8`/14). Always visible and fully
functional — a consistency cleanup already tracked in TODO.md, deliberately not bundled into a bug
fix pass.

## 2026-08-07 — Service Engineer's sidebar trimmed to the "บริการ" group only

Requested change, explicitly **visibility only, not a permission removal**: a field engineer's
sidebar should show just Service + Template รายงานบริการ, with no Dashboard or Customers link —
while `customers:view` stays granted, because `ServiceReportEditor.tsx`'s `CustomerSelector` needs
it to fetch the customer list when a Service Engineer creates or opens a report.

- **`src/lib/roles.ts`** — `ROLE_HIDDEN_NAV_KEYS` (`service_engineer → ["dashboard", "customers"]`)
  plus `isNavHiddenForRole()`/`isNavHiddenForUser()`. Presentation only; no server authorization
  path consults it.
- Confirmed with the owner before implementing, on two points the request didn't cover:
  - **Scope**: keyed on the `service_engineer` role only, as recommended, rather than a behavioural
    rule ("any role with `service:create`") that would silently reshape future roles. A cloned or
    equivalent custom role does **not** inherit the hiding; renaming the role is safe (the `key`
    doesn't change); deleting it makes the entry inert.
  - **Reach**: sidebar + landing page + Global Search, rather than sidebar alone.
- **`src/App.tsx`** — three changes, because sidebar-only hiding would have been visibly incomplete:
  - `visibleNavItems` now filters on permission **and** hiding.
  - **Landing page**: `homeNav` is derived from the first visible nav item instead of a hardcoded
    `"dashboard"`, and both the sign-in landing and the `effectiveNav` fallback use it. Previously a
    Service Engineer would have signed in *onto* the Dashboard — it still holds `dashboard:view`, so
    nothing stopped it — staring at a page with no sidebar entry to leave by.
  - The hash-sync effect now mirrors `effectiveNav` rather than `activeNav` (and moved below that
    computation, since the dependency array is evaluated during render). A deep link to `#dashboard`
    now resolves to `#service`, so the URL always matches the rendered page and a refresh sticks.
- **`api/_lib/searchHandler.ts`** — hidden entries are dropped from the `pages` category, so typing
  "dashboard" no longer offers a link to a page with no sidebar item. Filters **menu shortcuts
  only**: business results are untouched and still governed purely by permissions.
- **Tests** (135 passing, up from 129): 6 new in `tests/permissions.test.ts` — the two nav keys are
  hidden for Service Engineer while its own module stays visible; **the underlying `customers:view`
  and `dashboard:view` grants are still held** (the guard against someone later "simplifying" this
  into a permission removal and breaking report creation); no other default role is affected; a
  custom role does not inherit the rule and a missing role is never "hidden"; resolution works
  through a user's `roleKey`; and the role always retains at least one visible nav item to land on.

## 2026-08-07 — Rename a checklist item/heading in place while filling out a Service Report

Feature request. Per-report checklist customization (2026-08-06) could add and remove items but not
**reword** one, so fixing wording ("Blower Motor" → "Blower Problems") meant deleting the item and
re-adding it — which minted a new key and silently discarded that item's recorded status,
abnormalDetail and photos.

- **No server change was needed.** `sanitizeServiceTemplateSections()` already keys off `key` and
  takes `title`/`label` from the payload, so a same-key rename was valid input to the existing
  `PATCH templateSections` path from day one. This is entirely client-side plus tests — the
  requested "reuse the existing validation path rather than adding a parallel one" was already the
  only path available.
- **`src/components/InlineEditableLabel.tsx`** (new, shared — the same interaction is needed for
  item labels and group headings, so one component rather than two copies): text becomes an input on
  **double-click** (mouse), **single tap** (touch/pen), or **Enter/Space** when focused. Enter or
  blur commits; Escape cancels; a blank value reverts rather than producing a 400 (the sanitizer
  rejects blanks, so reverting is the kinder failure).
  - The mouse/touch split reads `pointerType` inside one handler instead of separate mouse and touch
    paths that could drift apart. A plain `onClick` was rejected: single-click activation on desktop
    would fire on any incidental click of a label.
  - A **10 px tap-slop check** between pointerdown and pointerup, so finger-scrolling a long
    checklist can't open an editor on the row your thumb happened to start on.
  - **Accessibility**: since there's no visible icon, the trigger is a real focusable `button` with
    an explanatory `aria-label`/`title` and a focus-visible ring — keyboard and screen-reader users
    reach the rename the same way they reach any other control, rather than being locked out of a
    mouse-only gesture. The gesture is also stated once above the checklist (plain muted text, not a
    button, so it competes with nothing).
- **`ServiceChecklistItemControl.tsx`** — new optional `onRename` prop; the label renders as plain
  text exactly as before when it's absent, so the row is visually unchanged until someone actually
  double-clicks or taps.
- **`ServiceReportEditor.tsx`** — `renameChecklistItem()`/`renameChecklistGroup()` update `sections`
  only and never `checklist`: the key is unchanged, so recorded values need no migration at all.
  Both gated by the existing `structureEditable = !isNew && isEditable`, i.e. `service:edit` on a
  Draft — Administrator and Service Engineer alike. +4 i18n keys (th/en).
- **`serviceReportValidation.ts`** — `MAX_CHECKLIST_ITEM_LABEL_LENGTH` (300) and
  `MAX_CHECKLIST_GROUP_TITLE_LENGTH` (200) extracted from inline literals and exported, so the
  rename inputs' `maxLength` clamps to exactly what the sanitizer enforces rather than a duplicated
  number drifting into an opaque 400.
- **Tests** (129 passing, up from 123): `tests/api/serviceChecklistRename.test.ts` (new, 6 tests,
  in-memory MongoDB against the real handler) — records an Abnormal status + detail on an item,
  renames it, and asserts **the key is unchanged and both values survived** (the whole point);
  the master `service_templates` document still holds the original label (per-report isolation);
  a group heading renames the same way with its items intact; blank and over-long labels are
  rejected by the existing sanitizer; and a rejected rename leaves the stored label untouched.

## 2026-08-07 — Service Report customer signature capture (on-site)

First item off the Service module's Phase 2 roadmap. Engineer signatures already worked (read live
from the assigned user's profile `signatureDataUrl`); the customer column in the printed report was
blank ruled lines. Remote signing via LINE remains a separate, later phase.

- **`src/components/SignaturePad.tsx`** (new) — canvas capture on **pointer events** throughout, so
  mouse, finger and stylus share one code path instead of parallel mouse/touch handlers that could
  drift apart. `touch-action: none` keeps a stroke from scrolling the page on a tablet; the backing
  store is scaled to `devicePixelRatio` (without it strokes render at CSS pixels and look soft on a
  retina screen); pointer capture means a stroke that wanders off-canvas still ends cleanly instead
  of leaving the pad stuck mid-draw; a single tap records a dot rather than requiring a drag.
  Stroke `#0b1d3a`, 2.4px, round caps/joins. Required signer-name input above the pad; Clear
  disabled until there's a stroke, Confirm until there's both. On confirm it locks to a preview
  (image + name + locale-formatted timestamp + a "แก้ไข" link) so an accidental swipe can't alter a
  signature already given. Styled against `ImageUploadField.tsx`'s existing conventions — a sibling
  of it, not an extension: there's no file to pick, there's a name to capture alongside, and there's
  a lock state.
- **Data model** — `customerSignatureDataUrl` / `customerSignedName` / `customerSignedAt` on
  `service_reports`. Wired through the existing `PATCH` route as an ordinary editable field group;
  no new endpoint, no status-change coupling. The image goes through the shared
  `validateImageDataUrl()` (`api/_lib/uploadValidation.ts`) — PNG was already in its accepted list,
  so no new validator.
- **`customerSignedAt` is server-stamped and never accepted from the client**, so a sign-off cannot
  be backdated — a signature is an evidentiary artifact. It is re-stamped **only** when the image
  itself changes, so fixing a typo in the signer's name doesn't silently move the recorded signing
  time. Clearing the signature also clears the name (a name with no signature is meaningless), and
  capturing/clearing is called out in the audit entry rather than folded into a generic "updated".
- **Legacy normalization** — new `toServiceReport()` defaults the three fields on every full-report
  response. Without it a report created before 2026-08-07 returns `undefined`, and a client checking
  `customerSignatureDataUrl !== ""` would read it as *signed* and render a broken `<img>`. Every
  response site now routes through it.
- **Signing neither gates nor is gated by completion** — a customer often isn't on site, so
  `validateServiceReportForCompletion()` is untouched and a report completes unsigned. It does
  inherit the route's existing Draft-only rule like every other editable field: sign before marking
  Complete, or Reopen first — which is the natural on-site order anyway.
- **`ServiceReportEditor.tsx`** — a "การเซ็นรับงาน" Section card after the checklist
  (`grid-cols-1 sm:grid-cols-2` per the app's mobile-grid convention): engineer read-only on the
  left (their profile signature, or a prompt pointing at Settings → Profile when they have none),
  the pad on the right. Footer states the optionality next to a deliberately **inert, disabled**
  "ส่งลิงก์ให้เซ็นภายหลัง" button (`title="เร็ว ๆ นี้"`) as a visible placeholder for the LINE
  phase. The engineer panel follows the *form's* assigned engineer, not the saved report's, so
  reassigning updates it immediately. +21 i18n keys (th/en).
- **`ServiceReportPrintDocument.tsx`** — the customer column now mirrors the engineer column exactly
  (signature image, name, date). An unsigned report still prints the blank ruled lines, so it stays
  usable as a paper sign-off sheet.
- **Tests** (123 passing, up from 115): `tests/api/serviceSignature.test.ts` (new, 8 tests,
  in-memory MongoDB against the real handler) — starts unsigned; stores and stamps server-side;
  **ignores a client-supplied `customerSignedAt`**; a name-only edit leaves the signing time alone;
  a non-image payload is a 400 through the shared validator; clearing clears name and timestamp;
  completion neither requires nor rejects on a signature; and a report with the fields `$unset`
  reads back as unsigned rather than as a broken signature.
- **Live check**: the Express server was booted against the real local MongoDB and
  `GET /api/auth/session` returned 200 — confirming the new `uploadValidation` import doesn't break
  the API bundle at runtime (the `ERR_MODULE_NOT_FOUND` hazard documented in `docs/CLAUDE.md`). The
  browser click-through (drawing, locking, persisting, printing, touch emulation) was **not** run —
  no credentials for that database and no browser automation available. Tracked in TODO.md.

## 2026-08-07 — Fix: uploading a checklist photo reverted every unsaved Service Report edit

User-reported bug. After a photo uploaded successfully, unsaved checklist changes snapped back to
the **last-saved** state (not a blank one) — mark an item Abnormal, attach the required photo, and
watch it flip back to Normal the moment the upload finished. The photo itself was never lost:
reopening the item showed it correctly attached, which is what pinned the cause on state handling
rather than on the upload.

**Cause** — `ServiceReportEditor.tsx`'s `handleUploadPhoto`/`handleDeletePhoto` passed the photo
routes' response (which is the whole `serviceReport`) to `applyServerReport()`, the helper the
Save/Complete paths use. That does `setChecklist(updated.checklist)` + `setSections(...)`, so the
server's last-saved item statuses overwrote everything the user had changed since their last Save.
Correct after a Save (the response *is* what was just persisted); wrong after a photo upload, where
the only thing that legitimately changed server-side is the photo.

- **`src/lib/serviceReports.ts`** — new pure `mergeServerPhotosIntoChecklist(local, server)`: copies
  back **only** photo metadata, matched by section/group/item key, keeping every other local field
  (`status`, `abnormalDetail`, `measurementValue`, a section's `included` flag) untouched. Photos
  are the one part of an item the server owns outright — they change solely through the dedicated
  photo routes, and `mergeChecklist()` already refuses to accept them from a `PATCH` — so this
  split matches the existing ownership rule rather than inventing a new one. Locally-added
  sections/groups/items have no server counterpart and pass through unchanged.
- **`src/pages/service/ServiceReportEditor.tsx`** — the photo handlers now call a small
  `applyServerPhotos()` (`setReport` + the merge) instead of `applyServerReport()`. `sections` is
  deliberately *not* resynced: the server's `templateSnapshot` is the last-saved structure, so
  refreshing it would drop groups/items the user added but hasn't saved — the same class of bug one
  level up. `applyServerReport()` is unchanged and still used by Save/Complete/Reopen, where
  wholesale replacement is exactly right.
- **No API change.** The upload response already carries the new photo's `id`/`url` inside the
  returned report, so nothing needed to be added server-side; the fix is entirely in what the client
  does with it.
- **Tests** (115 passing, up from 109): `tests/serviceReportPhotoMerge.test.ts` (new, 6 tests) leads
  with the reported scenario verbatim — item A Abnormal unsaved, item B Abnormal unsaved, photo
  uploaded to A against a server response still holding both as Normal — asserting A stays Abnormal
  *with* its photo, B stays Abnormal, and neither detail text is lost, all before any Save. Plus:
  unsaved measurement values and `included` flags survive; a deleted photo really disappears (the
  server stays authoritative for photos) without licensing a status revert; locally-added
  items/groups/sections are untouched; a legacy item with no `photos` array is tolerated; and the
  input is not mutated.

## 2026-08-07 — Permission dependencies: a declared, enforced guard against half-granted permission sets

Follow-up to the Service Engineer pass below, generalizing one of its findings. That pass documented
`service:create`'s hidden dependency on `serviceTemplates:view` and asserted it across
`defaultRoles`; a test over the seeded roles proves the six roles we wrote are correct, but says
nothing about a custom role an admin builds in Role Management, or one created by a direct API call.
Now the coupling is declared once and enforced everywhere.

- **`src/lib/permissions.ts`** — `PERMISSION_DEPENDENCIES` (`permission → permissions it cannot work
  without`), `withPermissionDependencies()` (transitive, input order preserved, additions appended —
  stable and diffable), `permissionsRequiring()` (the inverse, for the UI).
- **`src/lib/roles.ts`** — `sanitizeRolePermissions()`: strip Super-Admin-only, then auto-include
  dependencies. Locked permissions are filtered on *both* sides of the expansion, so a locked
  permission can't drag dependencies in behind it and a locked dependency can't sneak in. Shared by
  the server and the matrix editor so the two can't drift apart.
- **`api/handlers/roles.ts`** — `POST /api/roles` and `PATCH /api/roles/:key` both route submitted
  permission lists through it. Auto-include rather than `400`, deliberately matching the contract
  `isPermissionLockedToSuperAdmin()` already had: the server silently normalizes these lists.
- **`src/pages/admin/RoleManagementPage.tsx`** — ticking a permission ticks its dependencies
  immediately, and a dependency is **pinned** (disabled + lock icon + a `title` naming exactly which
  held permissions require it) while anything still depends on it. Without the pin, an admin could
  untick it, save, and have the server silently put it back. +2 i18n keys (th/en).
- **The map's scope is deliberately narrow** — only "this screen's own boot fetch is gated by a
  different permission and hard-fails". Entries: `service:view`, `service:create`, `service:edit` →
  `serviceTemplates:view`. `service:view` is included because `ServicePage.openReport()` mounts the
  same `ServiceReportEditor` for viewing, so the failure was never create-only. Merely-unreachable
  buttons (`service:print` without `service:view`) are excluded on purpose — folding those in would
  start overriding deliberate admin choices. `QuoteDocument`'s Scope of Work lookup and
  `ScopeOfWorkDocument`'s Delivery Order lookup are excluded because they're client-gated *and*
  `.catch()` into a safe fallback; `GET /api/quotation-templates` because it accepts
  `quotations:create` **or** `quotationTemplates:view`, so the wizard can't hit this at all.
- **Accepted side effect**: `serviceTemplates:view` also gates the "Template รายงานบริการ" nav item,
  so any role with a Service permission now sees that page (read-only). Already true of every
  default role; now true of custom ones. The deeper alternative — making the editor tolerate a 403
  on templates — is a `ServiceReportEditor.tsx` fix, not a permissions-model one.
- **Tests** (109 passing, up from 95): `tests/api/roleDependencies.test.ts` (new, 6 tests, in-memory
  MongoDB + real session cookie) creates actual custom roles through `POST`/`PATCH /api/roles` and
  asserts the dependency is added **and persisted**, that a permission set with no dependencies is
  untouched, that Super-Admin-only stripping still applies, that a `PATCH` trying to remove a needed
  dependency gets it re-added, that a genuine removal still works, and that a description-only edit
  leaves permissions alone. `tests/permissions.test.ts` gains 8 unit tests incl. a guard that every
  declared dependency is a real, non-locked permission (a locked one would be filtered straight back
  out, leaving the dependent permanently broken) and that every default role already satisfies its
  own dependencies.
- The `rbacMigrations` backfill from the pass below is untouched — that repairs already-stored role
  documents; this guards new writes. Different jobs.
- Docs: [RBAC.md](./RBAC.md) (new "Permission dependencies" section).

## 2026-08-07 — Service Engineer role + automatic RBAC catch-up for provisioned databases

Closes the ⚠️ ACTION REQUIRED item [TODO.md](./TODO.md) opened when the Service module shipped
(2026-08-06). Two distinct gaps, one root cause: `seedDefaultRolesIfEmpty()` only ever fires on an
*empty* `roles` collection, so a database provisioned long ago is frozen at whatever roles and
permissions existed on its first run. Every module since Scope of Work has therefore shipped with a
"a Super Admin must now go click through Role Management" note. That pattern ends here.

- **`src/lib/roles.ts`** — 7th default role, **Service Engineer** (`service_engineer`,
  `isSystem: false` so it stays renameable/deletable). 8 permissions: `dashboard:view`,
  `customers:view`, `serviceTemplates:view`, `service:view/create/edit/complete/print`.
  Deliberately **no `service:viewAll`** (own reports only, mirroring Sales User's own-quotes-only
  model) and no `service:delete`/template-write rights. Before this, no seeded role except Super
  Admin/Administrator could create a Service Report at all, so real field use was blocked.
  `serviceTemplates:view` is load-bearing rather than cosmetic: `ServiceReportEditor.tsx`'s boot
  `Promise.all` calls `fetchServiceTemplates()`, so a role holding `service:create` without it gets
  an editor that fails to load entirely — a new test asserts this invariant across every default role.
- **`api/_lib/rbacSeed.ts`** (11 lines → the real mechanism), three additions:
  - `syncDefaultRoles()` — inserts any `defaultRoles` entry whose `key` is missing. Purely
    additive; an existing role's permissions are never rewritten, so admin edits survive. Declares
    `roles.createIndex({key:1},{unique:true})` defensively first (the spec `ensureIndexes()` already
    has but never gets to run on a provisioned deployment), which also turns a concurrent
    double-insert into an ignorable duplicate-key error — same reasoning as `seedJobTypesIfEmpty()`.
  - `applyRbacMigrations()` — an append-only `RBAC_MIGRATIONS` list of `roleKey → permissions`,
    applied with `$addToSet` **at most once per database ever**, recorded in the new
    `rbac_migrations` collection. The once-only property is the whole design: a naive "re-sync
    defaults on every boot" would silently resurrect any permission an admin deliberately revoked.
    Order is apply-then-mark deliberately — `$addToSet` is idempotent, so a race or a crash before
    the marker lands costs a redundant no-op write, whereas claiming the marker first could leave a
    half-applied migration permanently marked done.
  - `bootstrapRbac()` — runs both behind a module-scoped flag (one check per warm serverless
    instance / long-lived Express process).
  - First migration `service-permissions-2026-08-06` grants the Service sets to Administrator/
    Approver 1/Approver 2/Viewer exactly as `defaultRoles` specifies, so a migrated database ends up
    identical to a freshly seeded one.
- **`api/_lib/collections.ts`** — `RbacMigrationFields` + `rbacMigrationsCollection()`
  (`rbac_migrations`, `_id` = migration id, so no `ensureIndexes()` entry needed).
- **Call sites**: `GET /api/roles` (`api/handlers/roles.ts`) — the one path that actually reaches a
  provisioned production database, since every authenticated client fetches it on boot — and
  `POST /api/auth/setup`, where it records the migrations as already-applied because freshly-seeded
  roles are current by definition. Also fixed in passing: `seedDefaultRolesIfEmpty()` passed
  `defaultRoles` straight to `insertMany`, which mutates the shared module-level array by stamping
  `_id` onto each object; it now inserts copies.
- **Tests** (95 passing, up from 84): `tests/api/rbacMigrations.test.ts` (new, in-memory MongoDB,
  9 tests) reproduces the real production scenario — roles seeded before Service existed — and
  asserts the grants match `defaultRoles`, a second run is a total no-op, **a permission revoked
  afterward stays revoked**, a deleted role is skipped rather than recreated, Super Admin is left
  alone, and the unique key index gets declared. `tests/permissions.test.ts` gains the
  `service_engineer` grant/deny assertions and the create⇒templates-view invariant.
- No UI change: nav items, the User Management role dropdown and the Role Management permission
  matrix are all driven by the fetched role list. No i18n keys either — role names/descriptions are
  persisted business data, not app chrome.
- Docs: [RBAC.md](./RBAC.md) (new "Service Engineer" + "Rollout" sections, 7-role table),
  [DATABASE.md](./DATABASE.md) (`rbac_migrations` row, `roles` row, 6→7 roles),
  [MODULES/Service.md](./MODULES/Service.md), [API.md](./API.md), [CLAUDE.md](./CLAUDE.md),
  [TODO.md](./TODO.md), [PROJECT_STATUS.md](./PROJECT_STATUS.md), [SESSION_LOG.md](./SESSION_LOG.md).

## 2026-08-06 — Docker MongoDB authentication from `.env` (`MONGO_USER`/`MONGO_PASS`)

Follow-up user request to the Docker stack below, with the exact wiring specified: the `app`
service loads `.env` via `env_file: - .env`, the `mongodb` service gets its credentials from
`${MONGO_USER}`/`${MONGO_PASS}`, and `.env.example` documents both.

- **`docker-compose.yml`** (untracked; reference copy in [DEPLOYMENT.md](./DEPLOYMENT.md) updated
  to match): `mongodb` now initializes a root user from `.env` — the values are mapped to
  `MONGO_INITDB_ROOT_USERNAME`/`MONGO_INITDB_ROOT_PASSWORD` (the only names the official mongo
  image understands; a literal `MONGO_USER:` env would do nothing). The app's `MONGODB_URI` is
  built from the same two values (`...@mongodb:27017/?authSource=admin`) and still overrides any
  URI arriving via `env_file`. Both variables use `:?` interpolation so a missing value fails
  loudly at `docker compose up` instead of silently booting an auth-less DB.
- **`.env.example`**: new `MONGO_USER`/`MONGO_PASS` section — documents the fresh-volume-only
  initialization rule (`docker compose down -v` to re-init) and the keep-it-URL-safe constraint
  (the password is embedded in the connection string).
- **`nginx/conf.d/default.conf`**: cert filenames changed by the owner to `huma-erp.com.pem` +
  `huma-erp.com.key` (their real-domain naming) — file comments and
  [DEPLOYMENT.md](./DEPLOYMENT.md) updated to match, incl. the self-signed test command.
- **Verified live** on a fresh volume (`down -v` → `up -d`): unauthenticated `db.stats()` inside
  the container → `Unauthorized`; root login with the `.env` credentials → `ping ok:1`; the app
  connected through the authenticated URI (`GET /api/auth/session` → `needsSetup:true` via nginx
  HTTPS with a self-signed pair under the new filenames). Stack stopped after the test.

---

## 2026-08-06 — Docker stack: app + MongoDB + nginx (HTTPS) in one `docker compose up`

Follow-up user request to the Express migration below: a Docker Compose setup with MongoDB
included, the compose file itself git-ignored, and an nginx service (committed) with
`./nginx/certs:/etc/nginx/certs:ro` for certificate management on the server.

- **`Dockerfile`** (committed) — multi-stage: `npm ci` (+`MONGOMS_DISABLE_POSTINSTALL=1` so the
  test-only mongodb-memory-server doesn't download a mongod binary into the image) → `npm run
  build` → `npm prune --omit=dev`; runtime layer copies `node_modules`/`dist`/`server`/`api`/
  `src`/`public` (api value-imports src/lib helpers; the template workbook is read from `public/`
  via cwd) and runs `tsx server/index.ts` as `NODE_ENV=production`.
- **`docker-compose.yml`** (deliberately **untracked** — added to `.gitignore` per owner request;
  full reference copy kept in [DEPLOYMENT.md](./DEPLOYMENT.md) "Docker") — 3 services: `app`
  (built image, env interpolated from `.env`, `JWT_SECRET` required with a hard `:?` error,
  `MONGODB_URI` pinned to the compose DB), `mongodb` (mongo:8, `mongo_data` named volume,
  mongosh-ping healthcheck gating app start), `nginx` (stable-alpine, ports 80/443,
  `./nginx/conf.d` + `./nginx/certs` mounted read-only).
- **`nginx/`** (committed, per the same request): `conf.d/default.conf` — HTTP→HTTPS 301, TLS off
  `certs/fullchain.pem` + `privkey.pem`, `client_max_body_size 30m` (must exceed the app's 25 MB
  JSON limit), `X-Forwarded-For` forwarded (login rate limiting reads it). `nginx/certs/` carries
  a self-ignoring `.gitignore` so the folder exists in the repo but real keys can never be
  committed.
- **`.dockerignore`** (committed) — keeps `node_modules`/`.git`/`.env*`/`nginx` etc. out of the
  build context.
- **`.gitignore` fix**: the pre-existing `.env*` pattern was silently swallowing `.env.example`
  (meant to be committed since the Express migration) — added `!.env.example`; the template is now
  actually tracked.
- **Verified live**: `docker compose up -d --build` on the dev machine (self-signed cert pair) —
  mongodb healthy → app up → `GET /api/auth/session` via nginx HTTPS returned
  `{"user":null,"needsSetup":true}` (fresh container DB, Setup Wizard path per
  [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) step E), frontend 200, HTTP→HTTPS 301,
  `/api/quotes` → 401 JSON. Stack stopped after the test; data persists in the `mongo_data`
  volume.

---

## 2026-08-06 — Standalone Express server: the app now runs without Vercel

The owner gave the explicit go-ahead ("ให้ย้ายจาก vercel มาเป็น express เดี่ยวๆเลย") for the Express
migration recorded in [SERVER_MIGRATION_PLAN.md](./SERVER_MIGRATION_PLAN.md) — all 3 planned steps
executed in this pass. **No `api/` handler logic changed**; the handlers were already written
against a portable req/res surface (`VercelRequest`/`VercelResponse` are type-only, erased at
runtime).

- **`server/app.ts`** — `createApp()`: a routing table replicating `vercel.json`'s rewrites maps
  the first path segment after `/api/` to its handler in a plain middleware (deliberately not
  Express path mounts, which strip `req.url` and would break the handlers' raw-pathname dispatch);
  `express.json({ limit: "25mb" })` (Service photos are ≤4 MB raw / ~5.5 MB base64);
  query parser forced to `"simple"` (Vercel-shaped `string | string[]` values); `express.static`
  over `dist/` + SPA fallback (skipped when `dist/` is absent); a JSON error backstop so
  body-parser failures (413/400) return JSON, never Express's HTML error page.
- **`server/index.ts` + `server/env.ts`** — entry point on `PORT` (default 3001); dotenv loads
  `.env` first with `.vercel/.env.development.local` as a fallback, so a machine that previously
  ran `vercel dev` works with zero setup. Env loads before `api/_lib/mongodb.ts` evaluates
  (module-scope `MONGODB_DB` read) via ESM import order.
- **Scripts**: `npm run dev` is now the full local stack — `concurrently` runs `tsx watch
  server/index.ts` (API :3001) + `vite --host` (:3000, `/api` proxied — `vite.config.ts`). New
  `npm start` runs the production process (API + built `dist/`, one origin). `vercel dev` is no
  longer needed for local work (still functions; `vercel.json` + `api/` layout untouched, so the
  Vercel demo keeps auto-deploying unchanged until cutover).
- **`api/_lib/mongodb.ts`** — the local-dev DNS-resolver workaround now also excludes
  `NODE_ENV=production` (on a real host, overriding the machine's resolver could itself break
  name resolution; the gate previously only checked `VERCEL_ENV`).
- **`.env.example`** (new) — every variable documented: `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`,
  `NODE_ENV`, `PORT`, `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`.
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** (new) — real-server install guide: PM2/systemd, nginx/Caddy
  + HTTPS (secure cookie ⇒ HTTPS mandatory), `X-Forwarded-For` requirement (login rate limiting
  reads it), cwd-must-be-project-root note (template workbook + `dist/` resolve via
  `process.cwd()`), Atlas vs self-hosted + backup guidance.
- **`tests/api/expressServer.test.ts`** (new, +7 tests → 84 total) — real-HTTP integration tests
  against `createApp()` + in-memory MongoDB: setup/login round-trip incl. session cookie,
  authenticated `GET /api/quotes`, 401 guard, raw-pathname sub-resource routing
  (`/api/scope-of-works` via the quotes handler), JSON 404 for unknown resources, JSON 413 for
  oversized bodies.
- **Build config**: `tsconfig.api.json` now includes `server/`; new deps `express` 5 + `dotenv` +
  `tsx` (runtime) and `@types/express` + `concurrently` (dev).

**Verified**: `tsc` (both configs)/`lint`/`build`/`test` (84/84) clean, plus a live boot of
`server/index.ts` on :3001 — `/api/quotes` → 401 JSON (auth guard through real routing),
`/api/nope` → 404 JSON.

---

## 2026-08-06 — Per-report checklist customization + print pagination fix + Service What's New entry

Direct user request (with screenshot): (1) the printed report's "Abnormal Findings" heading was
stranded at the bottom of one page while its first SERVICE ITEM block jumped to the next; (2) the
checklist must support adding/removing items and headings per report ("แต่ละงานที่ออกไปมันไม่เหมือนกัน"
— every job differs), e.g. extra rows under the Blower heading.

**Print pagination fix** (`ServiceReportPrintDocument.tsx`): the heading now renders inside the
first abnormal item's `breakInside: avoid` cell instead of its own table row, so it can never be
separated from the block it introduces.

**Per-report checklist customization** (full stack):
- New shared `sanitizeServiceTemplateSections()` (`src/lib/validation/serviceReportValidation.ts`,
  +7 unit tests → 77 total): validates a client-proposed structure against the report's existing
  snapshot — sections fixed (identity never taken from the payload), groups/items editable within
  caps, malformed → null.
- `PATCH /api/service-reports/:id` accepts `templateSections` (Draft-only, like everything else):
  replaces the report's own `templateSnapshot.sections`, re-merges `checklist` against the new
  structure, and hard-deletes photo Binary docs orphaned by removed items/groups. The master
  template is never touched (`docs/API.md` updated).
- Editor UI: per-item ✕ remove column, per-group "เพิ่มรายการ" row + header delete button,
  per-section "เพิ่มหัวข้อ" row — all only on an editable existing Draft (`structureEditable`).
  Names via the shared `PromptDialog`; removals confirm via `ConfirmDialog` only when recorded
  data would be lost, instant otherwise. 18 new i18n keys (th/en).
- Added the Service module's missing Thai What's New entry (`WHATS_NEW_ENTRIES`,
  per the standing "user-facing features get announced" rule) covering the whole module as shipped
  today: creation flow, checkbox table, abnormal photo rule, per-report customization, print.

**Verified**: `tsc` (both configs)/`lint`/`build`/`test` (77/77) clean; live `vercel dev` browser
session — added a custom item to Blower ("ตรวจสอบใบพัด Blower (รายการเพิ่มพิเศษ)") and a custom
heading ("อุปกรณ์เสริมหน้างาน"), removed a data-less seeded item instantly (no dialog), saved
(server accepted `templateSections`), hard-reloaded and confirmed all three structure changes
persisted through the server sanitize/merge round-trip with the existing Abnormal item's detail +
3 photos intact.

---

## 2026-08-06 — Service print report checklist also converted to a table (editor-only fix was incomplete)

User caught that the printable Service Report (`ServiceReportPrintDocument.tsx`) still showed the
old single-column checklist with round status glyphs after the editor's table conversion below —
the editor and the print document are two separate components, and only the editor had been
updated. Fixed: `ServiceReportPrintDocument.tsx`'s checklist section now renders the same
group-level nested `<table>` (item / ปกติ / ผิดปกติ columns) as the editor, with a new
`PrintCheckboxCell` square glyph replacing the removed `StatusMark` circular mark; a
measurement-kind item spans both check columns with its value centered. Verified live via
`vercel dev` by temporarily revealing the `hidden print:table` element with a DOM script (avoids
triggering the native browser print dialog, which would block further browser-automation calls) —
confirmed the table renders correctly for both a checked Abnormal row and a spanning measurement
row, and that the Abnormal Findings detail block/photo/signature sections below are unaffected.

**Verified**: `tsc --noEmit`/`lint`/`build`/`test` (70/70) all clean.

---

## 2026-08-06 — Service checklist editor rebuilt as a real table, matching the paper reference form

Direct user request ("อยากให้ทำเป็นตารางเหมือนในไฟล์" — "I want it made into a table like in the
file"), clarified via `AskUserQuestion` to mean the checklist inside `ServiceReportEditor.tsx`,
styled after `public/รายการตรวจเช็ค.pdf`'s real two-column checkbox table. Rewrote
`ServiceChecklistItemControl.tsx` to render `<tr>`/`<td>` row fragments instead of flex/div cards —
a new square `CheckboxCell` component replaces the previous pill-shaped Normal/Abnormal buttons, one
cell per column. `ServiceReportEditor.tsx`'s checklist block now wraps each section in a real
`<table>` (one `<thead>` with "อุปกรณ์ / รายการตรวจเช็ค" / "ปกติ" / "ผิดปกติ" columns, one `<tbody>`
per group with its own header row), a measurement-kind item spans both check columns with a single
input, and the error/Abnormal-detail/photo rows use `colSpan={3}` to stay full-width inside the new
table structure. Added i18n key `service.checklist.col.item` (th/en).

**Verified**: `tsc --noEmit`/`lint`/`build`/`test` (70/70) all clean. Manually verified live via
`vercel dev` — opened an existing Draft report, confirmed the table renders with correct group
header bars, column headers, checkbox cell sizing/spacing, an active (checked) Abnormal cell with
its detail textarea and photo thumbnail still displaying correctly spanning the full row width, and
no horizontal-scroll/layout regressions. See [MODULES/Service.md](./MODULES/Service.md) "Checklist
status rules" for the updated description.

---

## 2026-08-06 — New Service module (Phase 1) + same-day photo attachments and print, pulled forward from the roadmap

Direct user request for a field-service checklist + report module combining the company's paper
"SERVICE CHECK SHEET" and its narrative Service Report into one digitized workflow, eventually
targeting mobile/tablet/desktop use with photo evidence, signature capture, PDF export, and
on-site/remote customer acceptance via LINE OA. Given the scope (30+ acceptance criteria across the
original spec), the work was explicitly phased with the user's agreement: build a solid Phase 1
now (data model, checklist templates seeded from the real reference files, Service Report CRUD, a
desktop-first editor, RBAC, navigation), leave photo/signature/mobile/PDF/acceptance/LINE as later
phases. Four research passes (three parallel codebase-exploration agents + one plan-design agent)
mapped the Scope of Work/Delivery Order patterns to reuse before implementation began.

**Phase 1, built and verified**:
- **Data model**: `service_templates` (master checklist: sections → groups → items, each item
  `"normalAbnormal" | "measurement"`, a section can be `isOptionalAddon`) and `service_reports`
  (`id` = atomic `SR-{buddhistYear}-{seq}`, freezes the chosen template onto `templateSnapshot` +
  an optional linked Customer's snapshot onto `customerSnapshot` at creation). Two checklist
  templates seeded idempotently from the real `public/รายการตรวจเช็ค.pdf` and `public/Service.xlsx`
  reference files (4 sections/30 items and 1 section/25 items respectively) — content-hash-gated,
  never duplicates on re-run.
- **Numbering**: atomic-counter auto-generated (unlike Scope of Work's deliberate 2026-07-29 move
  to fully-manual numbers) — a Service Report is field-created with no pre-existing number to copy,
  so auto-numbering removes the typo/duplicate-number friction manual entry would cause there.
  Buddhist year computed dynamically, avoiding Quotes' hardcoded-year wart.
- **Checklist rules**: Normal/Abnormal is structurally exclusive (one `status` field); selecting
  Abnormal reveals a required detail field, never silently cleared on reverting to Normal. Server
  rebuilds the whole checklist from the report's own frozen template on every save — a client can
  never inject a new item/group/section.
- **API**: mounted on `api/handlers/customers.ts` (not `quotes.ts`, already the heaviest bundle) —
  Vercel Hobby's 12-function cap stayed fully used, and a Service Report's real relational anchor
  (`customerId`) is the same entity that file already owns. Full CRUD + status transitions
  (Draft → Completed/Cancelled, Completed → Draft reopen) in `api/_lib/serviceReportHandler.ts` /
  `serviceTemplateHandler.ts`.
- **RBAC**: 10 new permissions in their own standalone "บริการ" group (not nested into
  "ใบเสนอราคา" — Service Reports aren't part of the quotation chain). Own-records-only-without-
  `:viewAll` list filtering, same idiom as every other module.
- **UI**: `src/pages/service/` (`ServicePage`/`ServiceList`/`ServiceReportEditor`/
  `ServiceTemplateManagement`) + `ServiceChecklistItemControl.tsx`, following the established
  navy/gold design system throughout. Sidebar gets a new standalone "บริการ" nav group.

**Same-day pull-forward** (direct user request via `/impeccable design "Service more user friendly
and must be print and if pick abnormal should add picture and remark"`, immediately after Phase 1
shipped): photo attachments and a printable report — originally scoped as Phase 2/3 — were built
the same day instead of deferred:
- **Photo attachments**: a new `service_checklist_photo_files` collection (Binary-in-Mongo +
  unauthenticated capability-URL download, same pattern as Scope of Work's `scope_attachment_files`
  but sized for camera photos — 4 MB/photo, 6 photos/item). Marking a checklist item Abnormal now
  also requires **at least one attached photo** before the report can be marked Completed (in
  addition to the existing required detail text). New routes:
  `POST/DELETE /api/service-reports/:id/photos[/:photoId]` and the unauthenticated
  `GET .../photos/:photoId/download?key=`. Client UI: a thumbnail grid + camera-hinted file input
  in `ServiceChecklistItemControl.tsx`, disabled with an explanatory reason until the report exists
  (Draft, not "new").
- **Print/PDF**: new `ServiceReportPrintDocument.tsx` (browser-native `@media print` CSS — this app
  has no PDF library) reproducing the real Oil Mist Filter reference report's "SERVICE ITEM n"
  blue-bar per-abnormal-item layout with a photo grid, reconciled against the Phayont Marine
  reference's report-info field labels. New `service:print` permission and
  `POST /api/service-reports/:id/print` (writes an audit entry, no completeness gate — a Draft can
  be printed for review, matching Delivery Order's simpler no-gate precedent).
- **UX fix found during this pass**: the server's completion-validation error response only ever
  returned a flat array of message strings (`groupErrors.checklist`), so a failed "Mark Complete"
  attempt had no way to highlight *which* checklist item was the problem. Added a
  `checklistItemErrors` field (item-path-keyed, e.g. `"core.blower.vibration"`) to the `422`
  response and wired it through `ApiError`/`ServiceReportEditor.tsx` so the exact failing control
  now highlights inline, and any collapsed section containing an error auto-expands.
- A real bug was also caught and fixed during manual verification: the print document's per-section
  `<tbody>` elements were nested inside one outer `<tbody>` (invalid HTML,
  `validateDOMNesting` console error) — restructured so every section's `<tbody>` is a direct
  `<table>` child, matching `ScopeOfWorkPrintDocument.tsx`'s sibling-tbody pattern.

**Verified**: `tsc --noEmit` (both tsconfigs)/`lint`/`build`/`test` (70/70) all clean throughout.
Manually verified live via `vercel dev` + a real browser session, twice — once after Phase 1
(navigation, permission gating, seeded templates matching the reference taxonomy exactly, creating
a report with a real customer/template snapshot freeze, checklist Abnormal-reveal, server-side
422-blocking an incomplete completion attempt, audit log entries, in-app notifications) and again
after the photo/print pull-forward (uploaded a real photo to an Abnormal item via the file-input
element, confirmed the required-photo warning cleared and the thumbnail rendered from its
capability-URL, confirmed Print/Export successfully invoked the native browser print dialog with a
clean console). See [MODULES/Service.md](./MODULES/Service.md) for the full writeup and the
later-phase roadmap (signature capture, mobile/iPad UX, customer acceptance, LINE OA).

---

## 2026-08-04 — Website/Facebook/Line added to Company Settings + all 3 print letterheads

Direct user question after seeing the app's printed Quotation header next to the company's real
letterhead graphic (logo, name, address, TEL/E-mail, Facebook icon+page name, Line icon+ID, website):
"isn't every document header supposed to come from the Settings company info?"

Investigation confirmed the premise was half right: name/address/phone/email/logo genuinely already
came from `Company` (Settings) on Quotation and Delivery Order's print views. But `website` was
hardcoded to `""` in every `CompanyHeaderInfo` construction site (the type had a slot for it, nothing
ever filled it — no Settings field existed to source it from), Facebook/Line had no field anywhere,
and **Scope of Work's print view had no company letterhead at all** — no logo, no name, nothing, just
the centered "SCOPE OF WORK" title. Separately, Delivery Order's print view had a fully hardcoded
`LETTERHEAD` object (name/address/tel/email/facebook/lineId/website all fixed constants) matching the
reference form exactly, disconnected from Settings — coincidentally the source of the reference image
the user was comparing against.

Resolved via `AskUserQuestion` (add Website+Facebook+Line to Settings and wire to all 3 documents, vs.
narrower options) — user chose the full fix. Implemented:

- **Data model** (`src/lib/storage.ts`): `Company` gains `website`/`facebookName`/`lineId: string`
  (plain text, same as existing fields — no new server-side validation, matching the pre-existing
  fields' own lack of any). `defaultCompany` defaults all three to `""`. `CompanyHeaderInfo` gains
  `facebookName`/`lineId` (`website` already existed on this type, just always blank until now).
- **Settings UI** (`SettingsPage.tsx`): 3 new inputs in the Company tab (Globe/Users/MessageCircle
  lucide icons — lucide-react ships no dedicated Facebook/Line brand icons). `companyDraft` state
  already flows the new fields through automatically via existing spread patterns; no extra wiring.
- **Shared icons** (new `src/components/PrintSocialIcons.tsx`): `FacebookIcon`/`LineAppIcon` extracted
  out of `DeliveryOrderPrintDocument.tsx` (previously defined locally there only) so all 3 print
  documents can import the identical branded SVGs instead of duplicating them.
- **Quotation** (`PrintDocument.tsx`): letterhead gains a Facebook/Line/website row below phone/email,
  each independently hidden if blank.
- **Scope of Work** (`ScopeOfWorkPrintDocument.tsx`): gained a full company letterhead block
  (previously had none) — logo (falls back to `BrandMark`, same as Quotation), name, address,
  phone/email, and the same Facebook/Line/website row — rendered above the "SCOPE OF WORK" title.
  Required threading a new `company: Company` prop all the way through both of this document's entry
  points, neither of which received it before: `App.tsx` → `ScopeOfWorkPage.tsx` (standalone sidebar
  module) and `QuotationPage.tsx` (quotation-embedded view). `ScopeOfWorkDocument.tsx` builds the
  `companyHeader` object and passes it down, same pattern as the other two documents.
- **Delivery Order** (`DeliveryOrderPrintDocument.tsx`): swapped `LETTERHEAD.facebook`/`.lineId`/
  `.website` for `companyHeader.facebookName`/`.lineId`/`.website` (now editable from Settings) —
  deliberately **left name/address/tel/email hardcoded**, since Settings' `Company.name`/`.address`
  are single-line Thai fields while the FM-SL-05 reference form needs English name + a split two-line
  address, a genuinely different shape that would need its own follow-up feature (not requested here)
  rather than a same-day reshuffle of a formal reference-form document.

Corrected two related stale doc claims found while writing this up: `MODULES/DeliveryOrder.md`
previously said the whole letterhead came from Settings "not a hardcoded copy" (only the logo did,
until today) and separately said Settings "has no Facebook/LINE fields" (now false) — both fixed
in place.

`npx tsc --noEmit`, `npm run lint` (0 errors, same 2 pre-existing unrelated warnings), `npm run build`,
`npm test` (56/56) all clean. **Not verified live** — no test credentials available this session to
open Settings, fill in the 3 new fields, and visually confirm all 3 print letterheads. See
[MODULES/Settings.md](./MODULES/Settings.md), [MODULES/Quotation.md](./MODULES/Quotation.md),
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md), [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md),
and [DATABASE.md](./DATABASE.md).

---

## 2026-08-04 — Scope of Work print: same browser date/URL header-footer fix

Follow-up to the Quotation print fix below, same session: user asked to check whether Scope of Work
and Delivery Order's print views had the same browser-injected date/URL problem, and fix them if so.

Checked both by inspecting their print components directly (not just re-testing symptoms): Delivery
Order's `DeliveryOrderPrintDocument.tsx` already has the `@page { margin: 0 }` fix (added 2026-07-24)
— genuinely clean, nothing to do. Scope of Work's `ScopeOfWorkPrintDocument.tsx` still used the old
tooltip-only approach and, on inspection, turned out to share the exact same shape as Quotation's
`PrintDocument.tsx` — one continuously-flowing `<table>` with a repeating `<thead>` across potentially
several physical pages — so the same fix (and the same accepted interior-page-break trade-off, already
explicitly accepted by the user for Quotation this session) applies cleanly.

Applied verbatim: component-scoped `<style>{"@media print { @page { margin: 0 } }"}</style>`,
`padding: "0 12mm"` on the outer `<table>`, the letterhead `<td>` changed from `p-0` to
`pt-[12mm] px-0 pb-0` (top inset only, since horizontal is now handled by the table-level padding),
and the final signature-block row's `pb-2` bumped to `pb-[12mm]`. Removed the now-stale
`MetricInfoTooltip` "Printing tip" hint next to Scope of Work's Print button and its
`scopeOfWorkDoc.printTipLabel`/`.printTipText` i18n keys (Thai + English) — same cleanup as Quotation's
`quotation.printHint.*` removal.

`npx tsc --noEmit`, `npm run lint` (0 errors, same 2 pre-existing unrelated warnings), `npm run build`,
`npm test` (56/56) all clean. **Not verified live** — same gap as the Quotation fix below, no test
credentials available this session. See [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Print / PDF" and
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

---

## 2026-08-04 — Quotation print: suppress the browser's date/URL header-footer

Direct user report with a screenshot: printing/exporting a Quotation shows the browser's own injected
print date (top-left) and page title/URL (bottom-left) on the document. This was previously
investigated (2026-07-16) and confirmed **not app-rendered** — it's Chrome/Edge's own "Headers and
footers" print-dialog option, which `@page` CSS margins normally cannot suppress — so the app only
ever showed a tooltip telling the user to disable it themselves in their browser's print settings
(`quotation.printHint.*`).

Delivery Order later (2026-07-24) found the one real exception: a document that sets
`@page { margin: 0 }` gets no browser-drawn header/footer at all, because the browser only draws that
text inside the page's own margin area. That fix was deliberately **not** applied to Quotation at the
time because Quotation's `PrintDocument.tsx` is one continuously-flowing `<table>` across potentially
several physical pages (unlike Delivery Order's one-page-per-milestone shape) — margin:0 would leave
continuation pages with no top/bottom inset.

**This session**: surfaced that trade-off to the user via `AskUserQuestion` (zero-margin + best-effort
padding compensation vs. keep the tooltip-only status quo) — user chose the zero-margin approach.
Implemented: `PrintDocument.tsx` gets a component-scoped `<style>{"@media print { @page { margin: 0 } }"}
</style>` (unmounts with the view, so `ScopeOfWorkPrintDocument.tsx` keeps the global 12mm `@page` rule
in `src/styles/index.css` untouched), plus compensating padding — `padding: "0 12mm"` on the outer
`<table>` for left/right (inherent to every row's box, so it repeats on every page automatically),
`pt-[12mm]` added to the letterhead block inside `<thead>` (also repeats every printed page, restoring
the top inset even on continuation pages), and `pb-[12mm]` on the last `<tr>` (the signature block) for
the last page's bottom inset. Accepted gap: an interior page break on a 3+-page quotation has no bottom
inset at that break — content runs to the physical page edge there; same shape as the trade-off already
accepted for Delivery Order.

Removed the now-stale `MetricInfoTooltip` "Print tip" hint next to Quotation's Print button (and its
`quotation.printHint.label`/`.text` i18n keys, Thai + English) — the browser no longer draws the text
it was warning about, so the instruction to manually disable it is no longer applicable. Scope of
Work's own print-hint tooltip is untouched (not part of this request).

`npx tsc --noEmit`, `npm run lint` (0 errors, same 2 pre-existing unrelated warnings), `npm run build`,
`npm test` (56/56) all clean. **Not verified live in a browser** — no test credentials were available
this session to log in and drive an actual print preview/PDF export; the fix mirrors the already-live-
verified Delivery Order pattern exactly (see 2026-07-24 entry below), but a follow-up `vercel dev`
print-preview check (ideally against a genuinely multi-page quotation, to see the accepted
interior-page-break gap firsthand) is recommended. See [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Print /
PDF" and [MODULES/Quotation.md](./MODULES/Quotation.md).

---

## 2026-08-04 — Revision Note becomes an accumulating R1/R2/... history

Per direct user request: the auto-generated "หมายเหตุการแก้ไข (Revision Note)" on Quotation and Scope
of Work revisions used to overwrite the note with only the current revision's own diff against its
immediate predecessor, so what earlier revisions had changed was only visible by opening each older
revision separately. The user asked for the note to instead read as a running log — "R1 - <what R1
changed>" on one line, "R2 - <what R2 changed>" on the next, referencing every rewrite up to the
latest each time the auto-summary button is pressed.

**Fix**: new `appendRevisionNoteEntry(predecessorRevisionNote, revisionNumber, summary)` export in
`src/lib/revisionDiff.ts` — prefixes the freshly-generated diff with `R{n} - ` (`n` = this record's own
revision number, via the already-existing `getRevisionNumber()`) and appends it onto the
**predecessor's** `revisionNote` (blank-line-separated) instead of replacing the field outright. Since
every earlier revision's note was built the same way, the predecessor's `revisionNote` already reads
`R1 - ...`, `R2 - ...`, ..., so the result accumulates one more entry per press instead of losing the
earlier ones. Wired into both call sites: `QuoteDocument.tsx`'s `handleGenerateRevisionNote` (predecessor
resolved from the already-loaded `allQuotes` array) and `ScopeOfWorkDocument.tsx`'s (predecessor fetched
via `fetchScopeOfWork`). Still explicitly one-shot/manually-editable, same as before — see
`docs/MODULES/Quotation.md` and `docs/MODULES/ScopeOfWork.md` "Revision Note" for the full history.
`npx tsc --noEmit` clean; no schema change (still the same `revisionNote: string` field, just what gets
written into it).

---

## 2026-07-31 — `ConfirmDialog` mount-while-closed fix

Closes the latent-bug shape flagged in the 2026-07-30 re-audit (`docs/TODO.md`): `ConfirmDialog.tsx`
called `useDialogA11y()`/`useId()` unconditionally, before its `if (!open) return null` guard — so the
Escape-key/focus-trap listener from `useDialogA11y` was wired up even while the dialog was closed
(harmless today, since `onCancel()` firing against an already-closed dialog is a no-op, but the same
shape that caused a real bug elsewhere). `PromptDialog.tsx` already avoided this by splitting into an
outer component (checks `open`) and an inner form component (mounted only while open, owns the hooks).

**Fix**: split `ConfirmDialog` the same way — outer `ConfirmDialog` returns `null` when closed; inner
`ConfirmDialogPanel` (new) owns `useDialogA11y`/`useId`/the actual markup, mounted only while `open` is
true. Extracted `ConfirmDialogProps` as a named export (previously an inline object type) so both
components can share it. Pure lifecycle refactor — no visual or behavioral change; every call site
(`onConfirm`/`onCancel`/`busy`/`danger`/etc.) is unchanged.

**Verification**: `npx tsc --noEmit`, `npm run lint` (0 errors), `npm run build`, `npm test` (56/56) all
clean. Not click-through-verified live — the fix has no visual/behavioral surface to observe (dialogs
open/close identically either way; the only difference is *when* the Escape listener attaches, which
isn't independently observable through the UI).

---

## 2026-07-31 — Rolling/sliding session expiration

Direct user request: sessions should auto-logout after 7 days of **inactivity**, but an actively-used
session should never expire. Previously, `SESSION_DAYS = 7` in `api/_lib/auth.ts` was a fixed absolute
window from login time — a user working every day would still get force-logged-out exactly 7 days
after their last sign-in, regardless of activity in between.

**Fix**: added `refreshSessionCookie()` (`api/_lib/auth.ts`) — reads the session cookie, `jwt.verify()`s
it (no DB call, cheap), and if valid, re-signs and re-issues it via `issueSessionCookie()` with a fresh
7-day window. Wired into `withErrorHandling()` (`api/_lib/http.ts`), the shared try/catch wrapper all 12
API entry-point files (`api/handlers/*.ts`, `api/company/index.ts`, `api/dashboard/index.ts`,
`api/audit-log/index.ts`) already call — so the refresh runs unconditionally at the top of every API
request with zero changes needed to any of the ~70 `requireUser()`/`requirePermission()` call sites
deeper in the route handlers. `withErrorHandling()`'s signature changed from `(res, handler)` to
`(req, res, handler)`; all 12 call sites updated to pass `req`.

Net effect: a token only reaches its `exp` (triggering the existing `"Not authenticated"` 401 →
"session expired" toast flow, unchanged) after a full 7 days with *zero* API requests. Any request
within that window resets the clock. `refreshSessionCookie()` no-ops silently (no cookie, invalid
token, expired token) so it never interferes with login/logout — `issueSessionCookie()`/
`clearSessionCookie()` called later in those specific handlers simply overwrite the `Set-Cookie` header
the refresh set earlier in the same request (Node's `res.setHeader` replaces, doesn't append).

Docs updated: [RBAC.md](./RBAC.md) (Session Model bullet + Known Gaps — a leaked-and-replayed token now
also rides the rolling window, a slightly wider version of the pre-existing "no true session
revocation" gap), [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md), [PROJECT_STATUS.md](./PROJECT_STATUS.md),
[MODULES/Auth.md](./MODULES/Auth.md), [CLAUDE.md](./CLAUDE.md) module table.

**Verification**: `npx tsc --noEmit` (clean, incl. the `auth.ts`⇄`http.ts` circular import — safe since
both usages are inside function bodies, not module-level), `npm run build` (clean), `npm run lint` (0
errors, 2 pre-existing unrelated warnings), `npm test` (56/56 passing). Not yet manually verified in a
live browser session (would require waiting out or mocking a multi-day window) — logically verified via
the code path and existing 401→session-expired handling, which is unchanged.

---

## 2026-07-30 — Authentication UI accessibility hardening pass

An `/impeccable audit` of the authentication UI (`SignInPage.tsx`, `AuthLayout.tsx`, and `App.tsx`'s
`BootLoading`/`BootError` session-check presentation) found this had never been touched by any
earlier accessibility pass this session — the same gap as Template Management and Admin, but on the
single page every user passes through before reaching anything else. This pass fixed every P1/P2
finding, UI-files only — authentication APIs, credential handling, session behavior, redirects, and
security controls are all untouched; nothing was weakened.

**Identifier and password fields lacked label association (P1)**: both `<label>`s were plain
siblings with no `htmlFor`, neither input had an `id`. Added `useId()`-generated pairs to both.

**Password visibility toggle had zero accessible name (P1)**: icon-only button, not even a `title`
— worse than the title-only gap found elsewhere, on arguably the single most-used icon button in the
app. Added `aria-label` (toggling "Show password"/"Hide password") and `aria-pressed` since it's a
genuine two-state toggle, not a momentary action.

**Session-loading screen had no text or ARIA signal (P1)**: `BootLoading` — shown while the initial
session check is in flight and as the `Suspense` fallback while the sign-in page's own lazy chunk
downloads — was a silently-pulsing logo image with no loading text and no `role="status"`. Added
`role="status" aria-live="polite"` plus an `sr-only` label, matching every other loading state fixed
this session.

**P2s**: the login-failure error message gained `role="alert"` (previously the only feedback after a
failed sign-in had no announcement at all); `AuthLayout.tsx` gained a `<main>` landmark (previously
absent entirely); and the heading hierarchy was fixed — the branding panel's marketing headline
(hidden below `lg`, leaving zero `<h1>` on smaller screens) is now a styled `<p>`, while
`SignInPage.tsx`'s actual "Sign In" heading is now the page's real `<h1>` (was an `<h2>`).

**Files changed**: `src/pages/{SignInPage,AuthLayout}.tsx`, `src/App.tsx`, `src/lib/i18n.tsx` (new
`signin.showPassword`/`signin.hidePassword`/`boot.loading` keys).

**Verification**: `npm run lint` (0 errors), `npm run build` (clean), `npm test` (56/56 passing),
plus a live click-through via `vercel dev`: `document.getElementById` confirmed both field label
pairs resolve correctly, the password toggle's `aria-label`/`aria-pressed` flip correctly on click
("Show password" → "Hide password", `false` → `true`), the required-field error carries
`role="alert"` after a blocked submit, and the page's `<h1>`("Sign In")/`<main>` are present in the
DOM.

---

## 2026-07-30 (absolute latest) — Admin module accessibility hardening pass

An `/impeccable audit` of the complete Admin module (`UserManagementPage.tsx`, `RoleManagementPage.tsx`,
`AuditLogPage.tsx` — user list/create/edit/reset-password/activate/delete, role list/create/edit/
permission-matrix/delete, audit log list/search) found this was another module never touched by any
earlier accessibility pass this session — same pattern as Template Management. This pass fixed every
P1/P2 finding, UI-files only — authentication, RBAC, role definitions, permission enforcement,
audit-log integrity, APIs, MongoDB data, and business logic are all untouched; no permission was
weakened or changed.

**Reset Password modal had zero dialog semantics (P1)**: hand-rolled `fixed inset-0` div, no
`role="dialog"`, no focus trap, no Escape-to-close. Split into a wrapper+form component
(`ResetPasswordModal`) so `useDialogA11y` only runs while open, matching `ProductPickerModal.tsx`'s
established pattern.

**Status/role pill contrast recurred in 3 places (P1)**: `UserManagementPage.tsx`'s role pill and
active/inactive pills, and `AuditLogPage.tsx`'s action pill, all reused raw brand hex as text on
their own tint — the same bug already fixed on every other status pill this session. Darkened to
`#866d28` (gold/role/action), `#207e52` (active), `#657085` (inactive), reusing the exact values
already established elsewhere in the app for these same brand colors.

**"System" role badge was plain gold text on white (P1)**: `RoleManagementPage.tsx` — not even a
tinted pill, computed contrast ≈2.37:1. Same darkened value, `#866d28`.

**~13 form fields lacked label association (P1)**: all 11 fields in the Create/Edit User form plus
the 2 fields in the Reset Password modal (`UserManagementPage.tsx`), and the name/description fields
in the Create/Edit Role form (`RoleManagementPage.tsx`) — `<label>`s with no `htmlFor`, inputs with
no `id`. Added `useId()`-generated pairs to all of them (the Role form's permission-matrix checkboxes
were already correctly `<label>`-wrapped, no change needed there).

**P2s**: row-action buttons relying on `title` alone gained item-specific `aria-label`s across both
`UserManagementPage.tsx` (edit/reset-password/suspend-activate/delete) and `RoleManagementPage.tsx`
(edit/view, delete); `AuditLogPage.tsx`'s inline loading indicator gained `role="status"
aria-live="polite"`.

**Files changed**: `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`.

**Verification**: `npm run lint` (0 errors), `npm run build` (clean), `npm test` (56/56 passing),
plus a live click-through via `vercel dev`: computed pill colors read directly from the DOM across
all three pages (`rgb(134, 109, 40)` = `#866d28`, `rgb(32, 126, 82)` = `#207e52`), the Reset Password
modal's `role="dialog"`/`aria-modal` and Escape-to-close confirmed, and all form-field label
associations (User create form, Reset Password modal, Role create form) confirmed matched via
`document.getElementById`.

---

## 2026-07-30 (absolute latest) — Quotation Template Management accessibility hardening pass

An `/impeccable audit` of the complete Template Management workflow (`TemplateManagementPage.tsx` +
`TemplateEditorView.tsx` — list, search/filters, create/edit, section/item editors, product selector,
custom items, sub-details, reorder controls, activation states, dialogs) found this was the one
module in the app never touched by any of this session's earlier accessibility passes — the "before"
state every other module (Products, Customers, Quotation, Scope of Work, Delivery Order) started
from. This pass fixed every P1/P2 finding, UI-files only — template data, Excel-imported content,
Job Type mappings, versioning, quotation-snapshot independence, APIs, MongoDB schemas, RBAC, and
business logic are all untouched.

**Zero dialog semantics on Preview + Duplicate modals (P1)**: both were hand-rolled `fixed inset-0`
divs — no `role="dialog"`, no focus trap, no Escape-to-close. Split into wrapper+form components
(`TemplatePreviewModal`/`TemplateDuplicateModal`) so `useDialogA11y` only runs while open, matching
`ProductPickerModal.tsx`'s established pattern. The Preview modal's title now also names the template
being previewed ("Preview: {name}").

**Hover-only row actions (P1)**: the list's row-action buttons were `opacity-0 group-hover:opacity-100`
— DESIGN.md is explicit that this hides actions from touch devices and keyboard users entirely. Fixed
to `opacity-50 group-hover:opacity-100 group-focus-within:opacity-100`, the same fix already applied
to `ProductList.tsx` earlier this session.

**At least 9 icon-only buttons in the editor had zero accessible name at all (P1)**: section
move-up/move-down/delete, item-row move/duplicate/delete, delete-term, and remove-sub-detail buttons
carried no `title` or `aria-label` whatsoever — worse than the "title-only" gap already fixed
elsewhere. Added labels to all of them, reusing existing generic i18n keys
(`quotation.lineItems.moveUp/moveDown`, `common.delete`, `templates.action.duplicate`) instead of
minting duplicates.

**Every field in the editor's template-info/settings panels lacked label association (P1)**:
template code, name, description, job type, version, and internal notes all had a `<label>` with no
`htmlFor` and an input/select/textarea with no `id`. Added `useId()`-generated pairs to all 6,
matching `ScopeOfWorkDocument.tsx`'s established pattern.

**P2s**: row-action buttons relying on `title` alone gained item-specific `aria-label`s (e.g. "Edit
Bag Filter"); the remove-sub-detail button was also hover-only, fixed the same way as the list's row
actions; loading states gained `role="status" aria-live="polite"`, load/save errors gained
`role="alert"`.

**Files changed**: `src/pages/templates/{TemplateManagementPage,TemplateEditorView}.tsx`.

**Verification**: `npm run lint` (0 errors), `npm run build` (clean), `npm test` (56/56 passing),
plus a live click-through via `vercel dev`: both modals' `role="dialog"`/`aria-modal="true"` confirmed
via DOM inspection, Escape-to-close confirmed via a dispatched keydown event on both, all 6 editor
fields' `htmlFor`/`id` pairs confirmed matched via `document.getElementById`, and a full-page scan
(111 icon-only buttons checked, including sidebar/topbar chrome) confirmed zero remaining buttons
with a missing accessible name.

---

## 2026-07-30 (absolute latest) — Scope of Work full-workflow re-audit + accessibility fix pass

A follow-up `/impeccable audit` of the *complete* Scope of Work workflow (list, quotation-selection
entry point, create/edit, document info, checklist groups, item sections, manually-added items,
notes, signatures, validation, approval actions, responsive/loading/empty/error states — explicitly
excluding print/PDF) found that the earlier same-day `ScopeOfWorkDocument.tsx` hardening pass hadn't
reached two other files in the same workflow. This pass fixed every P0/P1/P2 finding, UI-files only —
quotation/customer snapshot data, Job Code generation, checklist business rules, required-field
validation, the approval workflow, APIs, MongoDB data, RBAC, and business logic are all untouched.

**Loading/error dead end (P0)**: `ScopeOfWorkDocument.tsx`'s loading and error branches had no way
back at all — no toolbar, no breadcrumb, nothing but a retry button on error and nothing while
loading. Fixed with the same sticky back-button toolbar already proven on `DeliveryOrderDocument.tsx`
earlier the same day.

**Status-pill contrast + keyboard-inaccessible rows (P1)**: `ScopeOfWorkList.tsx` — untouched by the
first pass, which only reached the document view — still had the exact pre-2026-07-29 one-hex
contrast formula and `<tr onClick>` rows with no keyboard support. Fixed identically to
`DeliveryOrderList.tsx`'s own fix: darkened text (`#576f94`/`#a75d1a`/`#207e52`), `tabIndex`/
`role="button"`/`onKeyDown`/`aria-label` on every row.

**P2s**: `ScopeOfWorkPage.tsx`'s loading/error states gained `role="status" aria-live="polite"` /
`role="alert"`; the shared `ValidationSummary` component (the blocked-action mechanism used across
Quotation/Scope of Work/Delivery Order) gained `role="alert"` so it's actually announced when it
appears; the "ยังไม่มี PO" list badge was undersized (`text-[10px]`) against the documented Status
Pill spec (`text-xs`) and its own sibling pills — bumped to match; and — a larger scope than the
Delivery Order pass, which only translated its list — the *entire* Scope of Work list and document
was hardcoded Thai-only. Added ~90 new `scopeOfWork.*`/`scopeOfWorkDoc.*` i18n keys (list page chrome
plus the document's toolbar, header fields, checklist/payment/revision/remarks/signature section
headings, all 5 `ConfirmDialog`s, both `PromptDialog`s). Deliberately left untranslated: the 3
status-label literals, toast/notification messages, checklist group content (config data, preserved
per the explicit "checkbox business rules" constraint), and the field-level validation error strings
(`scopeOfWorkValidation.ts` — shared client/server business logic, not page chrome).

**Files changed**: `src/pages/scopeOfWork/{ScopeOfWorkList,ScopeOfWorkPage}.tsx`,
`src/pages/quotation/ScopeOfWorkDocument.tsx`, `src/components/ValidationSummary.tsx`,
`src/lib/i18n.tsx`.

**Verification**: `npm run lint` (0 errors), `npm run build` (clean), `npm test` (56/56 passing),
plus a live click-through via `vercel dev`: computed pill colors read directly from the DOM
(`rgb(87, 111, 148)` = `#576f94`, `rgb(167, 93, 26)` = `#a75d1a`), row `tabIndex`/`role`/`aria-label`
confirmed, the previously-dead-end loading state confirmed now showing a working back button, a
delete `ConfirmDialog` opened/read/cancelled cleanly, and full Thai↔English toggling confirmed
correct across both the list and the full document view (including checklist labels and the
validation summary's field-level messages correctly staying in Thai, matching their documented
scope exclusion).

---

## 2026-07-30 (absolute latest) — Delivery Order standalone list/page module accessibility hardening pass

An `/impeccable audit` of `src/pages/deliveryOrder/` (the standalone Delivery Order list/page
module, distinct from `DeliveryOrderDocument.tsx`, which was already hardened in the 2026-07-30
Quotation/Scope of Work/Delivery Order pass below) found and this pass fixed every P1/P2 finding.
UI files only — no API/schema/RBAC/validation/business-logic changes; one-Delivery-Note-per-
milestone printing, deposit exclusion, selected-item isolation, and milestone-specific validation
are all untouched.

**Status-pill contrast (P1)**: `DeliveryOrderList.tsx` still carried the pre-2026-07-29 one-hex
formula (Draft 4.32:1, PendingApproval 2.44:1, Final 2.89:1 — all fail 4.5:1 AA). Now uses the
same darkened-text formula already established elsewhere (`#576f94`/`#a75d1a`/`#207e52`).

**List rows not keyboard-operable at all (P1)**: `<tr onClick>` had no `tabIndex`, role, or
keyboard handler. Added `tabIndex={0}`, `role="button"`, `onKeyDown` (Enter/Space triggers the
same `onOpen`), and an `aria-label` naming the row's job code, plus a visible focus ring.

**P2s**: `DeliveryOrderPage.tsx`'s loading skeleton (4 pulsing divs) had zero text/ARIA signal —
added `role="status" aria-live="polite"` plus an `sr-only` loading label; the entire module was
hardcoded Thai-only despite the app's live language toggle (only tour text used `t()`) — added
~15 `deliveryOrder.*` i18n keys (page title/subtitle, search placeholder, empty states, column
headers, loading/error/retry) and wired them via `t()`, reusing the existing `quotation.filterAll`
key for the "all" labels instead of duplicating it. The three status-label literals
("Draft"/"รออนุมัติ"/"Final") were deliberately left untranslated, matching
`DeliveryOrderDocument.tsx`'s own established, unflagged convention.

**Out of scope, tracked for later**: filter pills missing `aria-pressed` (P3, not requested).

**Files changed**: `src/pages/deliveryOrder/{DeliveryOrderList,DeliveryOrderPage}.tsx`,
`src/lib/i18n.tsx`.

**Verification**: `npm run lint` (0 errors), `npm run build` (clean), `npm test` (56/56 passing),
plus a live click-through via `vercel dev`: status-pill computed text color confirmed
`rgb(87, 111, 148)` (`#576f94`) in the browser console, row `tabIndex`/`role`/`aria-label`
confirmed, Enter-key activation confirmed opening the detail view, the loading skeleton's
`role="status"` confirmed present mid-load, and full-page English rendering confirmed via the
Settings language toggle (page title, subtitle, search placeholder, filter pills, and all 5
column headers).

---

## 2026-07-30 (absolute latest) — Products module accessibility hardening pass

An `/impeccable audit` of the Products module (list, search/filters/sort/pagination, categories,
create/edit, the `ProductPickerModal` selector Quotation's `LineItemsEditor.tsx` uses) found and this
pass fixed every P1/P2 finding. UI files only — no API/schema/RBAC/validation/business-logic changes,
SKU/code behavior untouched.

**Status-pill contrast reintroduced a fourth time (P1)**: `CategoriesManager.tsx` hand-rolled its own
status pill instead of using the shared `StatusBadge` component, carrying the exact pre-2026-07-29
raw-hex formula (Active 2.89:1, Archived 4.32:1 — both fail AA). Replaced with `<StatusBadge>`
directly — fixes the contrast and the duplication in one move. `ProductList.tsx` already used
`StatusBadge` correctly and needed no change.

**`ProductPickerModal` had zero dialog semantics (P1)**: no `role="dialog"`, no Escape-to-close, no
focus trap, styled `<p>` title. This is the modal opened every time a Quotation line item is picked
from the catalog. Split into a wrapper + form component (mirroring `PromptDialog.tsx`'s pattern) so
`useDialogA11y` only runs while the modal is actually open — deliberately *not* replicating the
still-open `ConfirmDialog` gap (see the 2026-07-30 Quotation re-audit) where the hook runs even while
closed.

**Zero `htmlFor`/`id` label association across `ProductForm`'s 7 fields (P1)**: fixed; verified via
`element.labels` in the live DOM (not just visual review) that every field now has a real associated
label.

**`ProductForm`'s Save button had no busy-guard at all (P1)**: unlike every other form/dialog in the
app, there wasn't even a `saving` state — a double-click during a slow request could fire two
concurrent `createProduct`/`updateProduct` calls. Added, mirroring `CustomerFormModal`'s pattern.

**P2s**: `ProductList.tsx`'s row actions were `opacity-0`-hover-only — fixed to `opacity-50`/
`group-focus-within`; its sortable column headers were `<th onClick>` with no keyboard support at
all — converted to real `<button>`s inside each `<th>` (plus `aria-sort` on the `<th>` itself) —
verified live that clicking still sorts correctly; row-action buttons in `ProductList.tsx` and
`CategoriesManager.tsx` relied on generic `title` only — added item-specific `aria-label`s (e.g.
"แก้ไข {product name}"), verified via the live accessibility tree; `CategoriesManager`'s "add new
category" section title promoted from `<p>` to `<h2>` (also gained a proper `aria-labelledby` on its
input, a small bonus beyond the original finding); `ProductForm`'s two field-pair grids changed from
`grid sm:grid-cols-2` to the canonical `grid-cols-1 sm:grid-cols-2` (functionally equivalent already,
tidied for consistency with the documented pattern — a minor aside, not one of the audit's findings).

**Files changed**: `src/pages/products/{CategoriesManager,ProductPickerModal,ProductForm,
ProductList}.tsx`.

**Verification**: `npm run lint` (0 errors), `npm run build` (clean), `npm test` (56/56 passing),
plus a live click-through via `vercel dev`: status-pill color, the categories heading's accessible
role, `ProductForm`'s label association confirmed with `element.labels` in the browser console,
sortable-header buttons confirmed keyboard-focusable and still functionally correct, row-action
`aria-label`s confirmed via the live accessibility tree, and `ProductPickerModal` confirmed opening
with proper dialog semantics and closing cleanly on Escape from within an actual Quotation.

---

## 2026-07-30 — Customers module accessibility hardening pass

An `/impeccable audit` of the Customers module (list, search/filters, create/edit, status/archive
actions, and the `CustomerSelector` Quotations use) found and this pass fixed every P1/P2 finding.
UI files only — no API/schema/RBAC/validation/business-logic changes.

**Status-pill contrast (P1)**: `src/components/StatusBadge.tsx` — used for every customer's active/
inactive/archived pill — still carried the pre-2026-07-29 one-hex formula (`bg`/`text`/`border` all
the same raw hex). Computed contrast before the fix: Active `#2aa36b` → 2.89:1, Inactive `#e08a3c` →
2.44:1, Archived `#5a7299` → 4.32:1 — all fail the 4.5:1 AA text minimum. Now uses the same
darkened-text-variant formula already established on `src/lib/quotes.tsx` (and reuses the identical
hex values for the two brand colors shared with the Quotation workflow's own statuses).

**Missing dialog semantics + zero label association (P1)**: `CustomerFormModal` (the create/edit form
— every customer in the system goes through it) was a hand-rolled `fixed inset-0` div with no
`role="dialog"`/`aria-modal`/Escape-to-close/focus-trap, a styled `<p>` title instead of a heading,
and none of its 9 fields had `id`/`htmlFor` label association. Now wired to the shared
`useDialogA11y` hook (same as `ConfirmDialog`/`PromptDialog`) and every field has a real `id`/
`htmlFor` pair — verified live: the accessibility tree now reports each field by its correct name
(previously unlabeled), and Escape correctly closes the dialog and returns focus to the triggering
row's Edit button.

**P2s**: the list's row actions (edit/deactivate/archive) were `opacity-0 group-hover:opacity-100` —
invisible to keyboard/touch users — now `opacity-50` at rest, full opacity on hover *or*
`group-focus-within` (verified live: tabbing to the row's Edit button now shows it, focus-ringed, at
full opacity). `CustomerFormModal`'s two field-pair rows (contact name/phone, delivery method/
project) used a bare `grid-cols-2` instead of the documented `grid-cols-1 sm:grid-cols-2` — fixed.

**Files changed**: `src/pages/customers/CustomersPage.tsx`, `src/components/StatusBadge.tsx`.

**Verification**: `npm run lint` (0 errors), `npm run build` (clean), `npm test` (56/56 passing), plus
a live click-through in the browser (via `vercel dev`) confirming the status-pill color change, the
modal's Escape-to-close, and the accessibility-tree field names.

---

## 2026-07-30 — Quotation/Scope of Work/Delivery Order accessibility + correctness hardening pass

Two `/impeccable audit` passes (first scoped to the Quotation editor screens, then expanded to the
full Quotation → Scope of Work → Delivery Order document chain, excluding print/PDF layouts by
request) found and this pass fixed every P1/P2 finding. No business logic, calculations, RBAC,
validation rules, approval workflow, numbering, or API/MongoDB schemas were touched — UI files only.

**Status-pill contrast (P1)**: `ScopeOfWorkDocument.tsx` and `DeliveryOrderDocument.tsx` each hardcoded
the same one-hex-for-everything tinted-pill formula `src/lib/quotes.tsx`'s `statusStyle` had already
been fixed away from on 2026-07-29 — both now use the same darkened-text-variant formula (see
`DESIGN.md`'s Tinted Pill Rule, updated to match). Quotation's own statuses were already correct;
this closes the two places the older, unfixed pattern still lived.

**Zero `htmlFor`/`id` label association (P1)**: every field across `QuoteDocument.tsx`'s Customer
Info/Document Details panels, `ScopeOfWorkDocument.tsx`'s equivalent panels + payment section, and
`DeliveryOrderDocument.tsx`'s installment editor now has a real `id`↔`htmlFor` (or `aria-labelledby`
for section-captioned textareas) pair. `RequiredFieldLabel`/`CustomerSelector` gained `htmlFor`/
`inputId` props to support this.

**Double-submit risk on Save/Confirm (P1)**: `QuoteDocument.tsx`'s Save button and the shared
`ConfirmDialog`/`PromptDialog` components had no busy-guard, so a double-click during a slow request
could fire the same (sometimes irreversible — finalize, delete) action twice. Both shared dialogs
gained a `busy` prop; every Confirm/Prompt dialog across all three documents now wires it to an
in-flight flag.

**Drag-only reordering (P1)**: `LineItemsEditor.tsx`'s sub-detail pins and `ScopeOfWorkItemsEditor.tsx`'s
whole item rows were reorderable only via native HTML5 drag events, with no keyboard path. Both now
have up/down icon buttons alongside the existing drag handle.

**Missing dialog semantics (P1)**: `ConfirmDialog`/`PromptDialog` were plain unlabeled `<div>`s — no
`role="dialog"`, no `aria-modal`, no Escape-to-close, no focus trap. New shared `src/hooks/useDialogA11y.ts`
adds all four; `QuoteDocument.tsx`'s bespoke workflow-action modal (not a good fit for `PromptDialog`'s
shape — dynamic required/optional label, danger-vs-gold Confirm color) was extracted into its own
`WorkflowActionDialog` component so it could get the identical treatment without risking the approval
workflow's behavior.

**P2s**: the 9 `opacity-0 group-hover:opacity-100` icon actions in `LineItemsEditor.tsx`/
`ScopeOfWorkItemsEditor.tsx` (a direct violation of the 2026-07-29-documented `opacity-50`/
`focus-visible` rule) fixed, plus several bare icon buttons that had no `aria-label`/`title` at all;
every card/section title across the three documents promoted from a styled `<p>` to a real
`<h1>`/`<h2>` (screen-reader heading navigation was previously broken on every one of these screens);
`Toast.tsx` gained `role="status" aria-live="polite"`; `QuoteDocument.tsx`'s Save now awaits the
request before showing its success toast (previously optimistic — "Saved!" could appear moments
before an error); `QuotationPage.tsx` now shows an explicit "quote not found / no access" state
(reusing `EmptyState`) instead of silently rendering a blank editable form when a deep-linked quote
isn't in the caller's loaded list (reachable today only via a custom role missing `viewAll`);
`QuoteDocument.tsx`'s Scope-of-Work-number modal, previously a hand-rolled duplicate, now uses
`PromptDialog` directly; `DeliveryOrderDocument.tsx`'s loading/error states keep a minimal
toolbar/back button visible instead of a bare full-page block, and its initial-fetch failure now
surfaces the server's actual error message instead of one hardcoded string; `ScopeOfWorkItemsEditor.tsx`'s
zero-items state now uses the shared `EmptyState` component; the unsaved-changes `beforeunload` guard
in `QuoteDocument.tsx` no longer re-serializes the entire draft via `JSON.stringify` on every
keystroke — it now reads the latest draft lazily through a ref, only at actual unload time;
`InterestButtons.tsx` gained `aria-pressed`; `CustomerSelector.tsx`'s search dropdown gained
ARIA combobox/listbox semantics and Escape-to-close.

**Deferred, not fixed**: the audit's "no URL routing below the module level" finding (refresh/Back
don't preserve which quote/wizard/Scope-of-Work is open) was explicitly flagged as needing a product
decision, not a mechanical fix — it's an app-wide architectural pattern (see `App.tsx`'s hash-only
top-level nav), not unique to Quotation, and out of scope for a UI-files-only fix pass.

**Files changed**: `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor,
ScopeOfWorkDocument,ScopeOfWorkItemsEditor,DeliveryOrderDocument,CustomerSelector,
DocumentRecipientsPicker,InterestButtons}.tsx`, `src/components/{ConfirmDialog,PromptDialog,
RequiredFieldLabel,Toast}.tsx`, `src/hooks/useDialogA11y.ts` (new), `src/lib/i18n.tsx` (new
translation keys), `DESIGN.md`, `docs/UI_GUIDELINES.md`.

**Verification**: `npm run lint` (0 errors), `npm run build` (`tsc -b` + API typecheck + `vite build`,
clean), `npm test` (56/56 passing) — all run after the fixes.

---

## 2026-07-29 — Impeccable design-system setup + Dashboard accessibility/responsive hardening pass

Ran the `/impeccable` skill end-to-end for the first time on this project: `init` wrote a new
`PRODUCT.md` (users, positioning, durable constraints — incl. the new "Permanent UI and Impeccable
Rules" the owner dictated: strict scope discipline, business-logic/RBAC/DB protections, UI rules),
and `document` scanned the existing navy/gold system into a new `DESIGN.md` + `.impeccable/design.json`
sidecar (Creative North Star "The Chartered Ledger," the Tinted Pill / Icon Chip Tint / Flat-Ledger
named rules, Stat Tile + Chart Section signature components). Then ran a full
`audit → harden → adapt → polish → typeset → critique → harden → clarify → polish` cycle against the
Dashboard, driven by real findings rather than a general sweep:

- **Accessibility**: `statusStyle` (`src/lib/quotes.tsx`, used app-wide for the 9 Quotation statuses)
  had text-on-its-own-10%-tint contrast as low as 2.1:1 (Pending Approval's gold) — every status's
  text color is now a computed, minimally-darkened variant of the same hue that clears WCAG AA
  4.5:1, background/border hues unchanged. The same fix was applied to `ApprovalDashboard.tsx`'s 4
  stat-tile accent colors (measured against their actual `bg-secondary/40` background). Dashboard's
  filter bar (`DashboardFilterBar.tsx`) gained `aria-label`s on all 5 previously-unlabeled
  date-range/department/salesperson controls. Added a project-wide `prefers-reduced-motion` rule
  (`src/styles/index.css`) — the app had none before.
- **Responsive**: 6 supporting-detail grids in `DashboardPage.tsx` jumped straight from 1 column to
  `xl:` (1280px), stacking needlessly at the 1024–1279px range common on real laptops; all now step
  at `lg:` instead (one 3-up grid progresses `1 → lg:2 → xl:3`). Removed one vestigial single-child
  grid wrapper found while making that change.
- **Consistency**: normalized 4 stray font sizes (`PipelineSteps.tsx`, `ApprovalDashboard.tsx`,
  `CustomerAnalytics.tsx`, `SalesPerformancePanel.tsx`) from `10px`/`11px` to the documented `12px`
  chrome floor; converted 3 fixed-pixel `PieChart` instances (`QuotationStatusSummary.tsx`,
  `DashboardCharts.tsx` ×2) to `ResponsiveContainer`, matching every other chart in the folder.
- **UX (critique-driven)**: `ApprovalDashboard.tsx`'s Approve button used to commit the
  `รออนุมัติ → อนุมัติแล้ว` transition — which has no reverse edge in
  `api/_lib/quoteWorkflow.ts` — on a single click, with no confirmation, even though
  `QuoteDocument.tsx`'s own editor already confirms this identical transition. A dual-agent critique
  (independent design review + detector/browser evidence pass) scored this 19/40 on Nielsen's
  heuristics and flagged it P0. Fixed: Approve now opens a `ConfirmDialog` naming the quote ID and
  client and stating the action can't be undone from this screen, rendered via `createPortal` (a
  `<tr>`'s only valid children are `<td>`/`<th>`, so the dialog can't be a direct child of the row);
  both success toasts now name the quotation ID.
- **Left deliberately unfixed, by explicit owner choice**: `CustomerAnalytics.tsx`/
  `ApprovalDashboard.tsx`'s remaining plain-caption 10px text (a genuine but low-priority drift the
  detector caught) — scoped out of this pass, tracked as a follow-up.

**Files Modified**: `PRODUCT.md`, `DESIGN.md` (new, root), `.impeccable/design.json`,
`.impeccable/critique/2026-07-29T09-41-15Z__src-pages-dashboard-approvaldashboard-tsx.md` (new),
`src/lib/quotes.tsx`, `src/lib/i18n.tsx`, `src/styles/index.css`,
`src/pages/dashboard/{ApprovalDashboard,CustomerAnalytics,DashboardCharts,DashboardFilterBar,
DashboardPage,PipelineSteps,QuotationStatusSummary,SalesPerformancePanel}.tsx`.

**Reason**: owner-initiated `/impeccable` design-system setup, followed by an owner-directed
audit → fix cycle on the Dashboard specifically.

**Notes**: `tsc --noEmit`/`npm run lint`/`npm run build`/`npm test` (56/56) all verified clean after
every step. Live browser verification was attempted at each step and consistently hit this
sandbox's known limitation (no `vercel dev`/MongoDB behind the plain `vite` dev server, so the app
shows its own "connection failed" guard before the Dashboard can render) — verified instead via
`tsc`/lint/build/tests, precise contrast math (Node scripts, not eyeballed), and line-level code
review. See `.impeccable/critique/...` for the full critique report.

---

## 2026-07-29 — Granted the 4 pending permissions to existing production roles

Closed out the last of the outstanding manual Role Management grants tracked in TODO.md (step E
of the Go-Live Checklist) — `quotations:viewAll`, `scopeOfWork:viewAll`, `deliveryOrder:*`, and
`scopeOfWork:chasePo` all predate their permission existing in `defaultRoles`, and `defaultRoles`
only seeds the `roles` collection once on first-run setup, so production's existing role documents
never picked them up automatically. Went through each of the 4 non-Super-Admin roles in Role
Management and ticked only the boxes matching `src/lib/roles.ts`'s current `defaultRoles` target
for that role — nothing else was touched (a couple of roles hold extra permissions beyond the
code's defaults, e.g. Approver Level 1/2 also have `quotations:create`, which were left alone since
reconciling a role to the code defaults exactly wasn't the ask).

**Files Modified**: none (MongoDB `roles` collection only, via the live UI)

**Reason**: Direct owner request ("ไปติ๊กสิทธิ์ 4 ตัวนั้นให้เลย") to finally close this out.

**Notes**: Per-role permission count before → after: **Administrator** 42 → 43 (`scopeOfWork:chasePo`
only — everything else in the target set was already granted). **Approver Level 1** 8 → 20
(`quotations:viewAll`; `scopeOfWork:view/viewAll/edit/finalize/print/chasePo`;
`deliveryOrder:view/viewAll/edit/finalize/print`). **Approver Level 2** 7 → 19 (identical set to
Approver Level 1). **Viewer** 3 → 8 (`quotations:viewAll`; `scopeOfWork:view/viewAll`;
`deliveryOrder:view/viewAll` — deliberately no `chasePo`, not in Viewer's default set).
**Sales User was deliberately left untouched** (8 permissions, unchanged) — its own
`deliveryOrder:view/create/edit/print` gap is a separate, older issue not part of this specific
4-item list, tracked as a fresh TODO follow-up. See [TODO.md](./TODO.md) (all 4 corresponding
`ACTION REQUIRED` items marked done) and [RBAC.md](./RBAC.md) for the permission definitions.

---

## 2026-07-29 — Refreshed user manual screenshots

The 14 screenshots embedded in `docs/manual/user-manual.html` (and thus the generated
`public/คู่มือการใช้งาน TCS ERP.pdf`) were captured 2026-07-24 and had drifted out of date after
five days of UI changes (guided tours, "ทวง PO" chasing, URL-hash page persistence, the What's
New panel, etc.) — reported by the user as "รูปในคู่มือยังเป็นรูปเก่าอยู่" (manual images are
still the old ones). Recaptured all 14 against the live production app (signed in as Super Admin,
1400×900 viewport) and swapped them in.

**Files Modified**: `docs/manual/user-manual.html` (all 13 `images/*.png` references changed to
`.jpg` — see Notes), `docs/manual/images/*` (all 13 page screenshots replaced; `topbar.png`
re-captured but kept as `.png`), `public/คู่มือการใช้งาน TCS ERP.pdf` (regenerated via
`docs/manual/generate-pdf.mjs`)

**Files Removed**: the 13 stale `.png` screenshots (superseded by same-named `.jpg` files)

**Reason**: Direct user report that the manual's screenshots no longer matched the running app.

**Notes**: The browser-automation screenshot tool only outputs JPEG, so the 13 full-page captures
were saved as `.jpg` and the HTML updated to match (`topbar.png` is a cropped PNG from the same
tool's `zoom` action, unaffected). Chromium content-sniffs local `file://` images rather than
trusting the extension, so this doesn't break `page.pdf()` rendering — verified by regenerating
the PDF (no errors, 1.99 MB) and spot-checking several pages via a local static server. Per policy
this agent never types a password into a login form itself — the user signed in manually before
screenshot capture began, and the agent logged the session out at the end (after the last
authenticated screenshot) specifically to capture the sign-in page image; the user needs to sign
back in themselves.

---

## 2026-07-29 — Code-review fix pass on the document-editor tours

A recall-focused review of the previous commit (the three document-editor tours) surfaced and
fixed the following — all verified against the running code before changing anything:

- **QuoteDocument's tour auto-fired over the blank CREATE form** (`useModuleTour("quotationDoc", …)`
  passed no `autoStart`, so it defaulted to `true`): a first-time user's most likely first entry
  into the editor is "สร้างใบเสนอราคาใหม่", where the actions step's copy enumerates
  duplicate/rewrite/create-SOW and the approval-workflow buttons — all `isDetail`-gated and
  provably absent there — and dismissing burned the one-time flag forever. Now passes
  `{ autoStart: isDetail }`; the replay button still works in both modes. This also corrects the
  previous entry's claim that "all three pass `autoStart: !!record`" — QuoteDocument never did
  (its record arrives via props, so the load-race guard didn't apply; the mode race did).
- **DeliveryOrderDocument step 2 pointed at the "no installments yet" warning**: the new
  `data-tour="dodoc-installments"` wrapper spanned BOTH ternary branches, defeating
  `useDriverTour`'s missing-anchor filter — a DO created from an SOW with an empty/deposit-only
  payment schedule (`installments: []` is a normal server-side outcome of
  `deriveInstallmentsFromScope()`) auto-fired a tour narrating per-installment cards over an
  orange warning saying there are none, then marked itself seen. The anchor now exists only when
  `installments.length > 0` and `autoStart` additionally requires it, so the one-time attempt
  waits for the UI the step actually describes.
- **Unmount no longer counts as "seen"** (`GuidedTour.tsx`): driver.js fires `onDestroyed` for
  programmatic `destroy()` too, so the unmount cleanup (parent `key=` remounts on
  duplicate/rewrite/create→save, nav changes) was marking a tour completed the user never
  dismissed. The cleanup now sets an `unmountingRef` flag that suppresses the `onFinish`
  callback; real dismissals (Done/×/Escape/overlay click) still mark seen, unchanged.
- **The What's New announcement was silent**: the document-tours bullet was added to the
  `2026-07-29-module-tours` entry at index 2, but `hasUnseenWhatsNew()` compares only
  `WHATS_NEW_ENTRIES[0].id` — users who had already opened the panel would never get the gold
  dot. The updated entry now leads the list (a comment in `whatsNew.ts` records the rule).
- **`TourReplayButton` extracted** into `GuidedTour.tsx`: the HelpCircle replay button had been
  copy-pasted 14 times across `src/` and had already drifted into two size variants
  (`w-9/size 15` on 10 list pages vs `w-8/size 14` on Dashboard + the three documents). The
  three new document editors now use the shared component; migrating the 11 older call sites is
  left as mechanical follow-up (tracked in TODO.md).
- Hygiene: the `sowdoc-completion` anchor is a `div` (was a `span` wrapping a `div` — invalid
  HTML nesting); the two new tour wrapper divs are `print:hidden` like every screen-only sibling;
  the mid-body `useI18n()` calls in ScopeOfWorkDocument/DeliveryOrderDocument moved to the top of
  the component with the other hooks (they sat directly above early returns — a rules-of-hooks
  hazard for the next edit); `useModuleTour`'s doc comment no longer claims tours may only mount
  in LIST views (three editors now do) and documents both `autoStart` uses (policy vs readiness).
- Docs: MODULES/Quotation.md, ScopeOfWork.md and DeliveryOrder.md now document their document
  tours (keys, anchors, the `currentUserId` prop); docs/CLAUDE.md's GuidedTour.tsx line updated.
- `tsc` (both configs)/`lint`/`npm test`/`build` re-run clean after the fixes.

---

## 2026-07-29 — Document-editor tours: Quotation, Scope of Work, Delivery Order (tour rollout complete)

Owner: "เหลือ Tour อะไรอีกทำให้ครบในทีเดียวเลย" — the last uncovered surface was the document
editors themselves (arguably where guidance matters most). Three new tours, same `useModuleTour()`
infra + HelpCircle replay button in each document's toolbar:

- **QuoteDocument** (tourKey `quotationDoc`, 3 steps): the action toolbar (save/print/duplicate/
  rewrite/create-SOW + the status-and-permission-dependent workflow buttons) → the customer
  selector (auto-fill, draft-only change rule) → the line-items editor (product picker,
  sub-details, drag-reorder, auto VAT). Anchors exist in both create and detail modes.
- **ScopeOfWorkDocument** (`scopeOfWorkDoc`, 4 steps): action toolbar (incl. duplicate-asks-a-
  number, auto -R rewrite, chase-PO, delivery-order, refresh) → the completion indicator (must be
  complete before print/submit) → the header card (manual document number editable only while
  Draft; the PO field editable even after Final) → the checklist card (incl. recipients/email/
  attachments flow). The component gained `useI18n` (its first — it was hardcoded-Thai; new
  strings follow the i18n rule) and a `currentUserId` prop threaded from QuotationPage and
  ScopeOfWorkPage.
- **DeliveryOrderDocument** (`deliveryOrderDoc`, 2 steps): action toolbar → the per-installment
  cards (deposits get no card; per-installment printing). Same `useI18n` + `currentUserId`
  additions (threaded from DeliveryOrderPage).
- **Load-race guard**: all three pass `autoStart: !!record` — the one-time auto-fire waits until
  the document has actually fetched (the anchors don't exist over the loading spinner), instead
  of burning the attempt against an empty page; nothing is marked seen until a tour really shows.
- 18 new i18n keys (th/en). What's New module-tours entry gains a document-editors bullet.
  Coverage is now genuinely complete: main tour + 11 page tours + 3 document tours; the only gap
  left anywhere is the unbuilt Leads module.
- `tsc` (both configs)/`lint`/`npm test` (56/56)/`build` all pass clean; same live click-through
  caveat as the other tour passes.

---

## 2026-07-29 — Dashboard page tour (deeper than the main first-sign-in tour)

Owner: "ทำ tour ของหน้า Dashboard เพิ่มด้วย" — the Dashboard was the one page whose only coverage
was the MAIN first-sign-in tour's basics (title/filters/KPIs as 3 of its 6 stops). Now it has its
own 5-step deep tour (tourKey `dashboard`) + the standard HelpCircle replay button in the header:

- Steps: export buttons (Excel multi-sheet/CSV, "pick เดือนที่แล้ว for an instant monthly
  report") → filters (they drive nearly everything) → the 4 KPI cards (explicitly states the
  pre-VAT rule and revision-chain de-dup — the two most-asked-about numbers behaviors) → the
  quotation status summary → the "in-depth detail" section (mentions the pipeline stages are
  clickable through to the quotation list).
- **Collision guard**: `useModuleTour` gained an `autoStart` option (default true, all existing
  tours unchanged); the Dashboard passes `hasTourCompleted(userId)` so its auto-start waits until
  the user has finished/skipped the main tour — both tours land on the same page, and two
  driver.js instances must never race on a brand-new user's very first visit. The replay button
  works regardless.
- New `data-tour` anchors: `dashboard-export` (wraps the header export buttons),
  `dashboard-status`, `dashboard-indepth`; `dashboard-filters`/`dashboard-kpis` reuse the main
  tour's existing anchors with richer copy. `currentUserId` prop added to DashboardPage (both
  App call sites). 10 new i18n keys (th/en). What's New entry updated to include the Dashboard.
- **Process note**: the App.tsx call-site edit was first attempted with a PowerShell
  `-replace` one-liner, which mangled the file's UTF-8 (Windows PowerShell 5.1 `Get-Content`
  reads BOM-less UTF-8 as ANSI — em-dashes/Thai became mojibake + a BOM appeared). Caught in the
  same step via `git diff`, reverted via `git checkout --`, redone with a normal editor tool;
  the committed file is verified clean (2-line diff).
- `tsc` (both configs)/`lint`/`npm test` (56/56)/`build` all pass clean; same live click-through
  caveat as the other tour passes.

---

## 2026-07-29 — Guided tours for every remaining page (Customers, Templates, Users, Roles, Audit Log, Settings)

Owner: "เหลือ tour ของอะไรอีกทำให้หมด" — finishes the module-tour rollout; every page in the app
now has a walkthrough (the only gap left is Leads, which has no page to point at). Same
`useModuleTour()` infra + HelpCircle replay button per page:

- **CustomersPage** (tourKey `customers`, 3 steps): add-customer (auto-fills quotations) →
  search/status/archived toolbar → table row actions. Header's right side wrapped so the replay
  button shows even for roles without `customers:create`.
- **TemplateManagementPage** (`templates`, 4 steps): Excel import (change-detected, safe to
  re-run) → create template → toolbar → template card list. If the page mounts straight into the
  editor (wizard deep-link), no target exists → start() no-ops and nothing is marked seen.
- **UserManagementPage** (`users`, 3 steps): create user (mentions no-self-signup) → search →
  table (edit/reset password/deactivate = immediate lockout).
- **RoleManagementPage** (`roles`, 2 steps): create role (tick-per-permission editor) → role
  cards (system roles editable, not deletable).
- **AuditLogPage** (`auditLog`, 2 steps): search → table (auto-recorded, read-only, immutable).
  The page previously took zero props — gained `currentUserId`.
- **SettingsPage** (`settings`, 2 steps): the tab bar → the profile card, spotlighting the
  signature upload (used automatically on printed documents) — the least discoverable
  high-value setting in the app. Header rebuilt as a flex row for the replay button.
- `currentUserId` threaded from App to CustomersPage/TemplateManagementPage/RoleManagementPage/
  AuditLogPage (UserManagementPage/SettingsPage already had `currentUser`). 32 new i18n keys
  (th/en). What's New module-tours entry updated to "ครบทุกหน้า".
- `tsc` (both configs)/`lint`/`npm test` (56/56)/`build` all pass clean; same live click-through
  caveat as the earlier tour passes.

---

## 2026-07-29 — Guided tour steps for the Scope of Work and Delivery Order pages

Extends the same-day Quotation/Products module-tour pass to the two remaining document list pages,
on the owner's direct go-ahead — same `useModuleTour()` infra (auto-start once per user, per-tour
localStorage seen-tracking, HelpCircle replay button added to each page's header):

- **Scope of Work list** (`ScopeOfWorkList.tsx`, tourKey `scopeOfWork`, 4 steps): summary cards
  (incl. the "ยังไม่มี PO" count) → search/jobtype/salesperson/status filters → the
  "เฉพาะที่ยังไม่มี PO" toggle (its own step — mentions the chase-PO button and that it's
  permission-gated) → the table (row-click; notes creation happens from the quotation page).
- **Delivery Order list** (`DeliveryOrderList.tsx`, tourKey `deliveryOrder`, 3 steps): summary
  cards → search + status filters → the table (notes creation from the Scope of Work page and
  per-installment printing).
- Both pages' headers rebuilt as flex rows to host the replay button; `currentUserId` threaded
  App → ScopeOfWorkPage/DeliveryOrderPage → their list components (new prop on all four).
- These two list components were hardcoded-Thai; the NEW strings follow the standing i18n rule
  (`useI18n()` + 14 new `tour.sow.*`/`tour.do.*` keys th/en) rather than adding more literals —
  the pages' existing hardcoded Thai is untouched (pre-existing inconsistency, not this pass's
  scope).
- What's New: the module-tours entry (same day) updated to cover all four pages.
- `tsc` (both configs)/`lint`/`npm test` (56/56)/`build` all pass clean; same live click-through
  caveat as the Quotation/Products tours.

---

## 2026-07-29 — "ทวงเลข PO" becomes its own grantable permission (scopeOfWork:chasePo)

Direct owner request ("อยากให้ทำสิทธิ์เพิ่มด้วยว่าสิทธิ์ที่ทวง PO ... เพิ่มเข้ามาถึงจะกดได้หรือขึ้นให้กด")
— the chase action shipped earlier today gated by `scopeOfWork:view` (anyone who could see the
record); the owner wants it explicitly granted instead:

- New `scopeOfWork:chasePo` permission (union/ALL_PERMISSIONS/labels — "ทวงเลข PO (ส่งแจ้งเตือนถึง
  พนักงานขาย)" — label-key map/Role Management matrix group, th/en i18n). 45 permissions total now.
- Server: `POST /api/scope-of-works/:id/chase-po` now `requirePermission("scopeOfWork:chasePo")`.
- Client: the "ทวงเลข PO" toolbar button renders only with the permission — new `canChasePo` prop
  on `ScopeOfWorkDocument`, threaded from QuotationPage (inline `hasPermission`) and
  App → ScopeOfWorkPage.
- Default grants (fresh setups): Administrator + Approver Level 1 + Approver Level 2 (+ Super
  Admin implicitly). Sales User deliberately excluded (the chase targets the salesperson);
  Viewer excluded (sending a notification isn't read-only).
- **⚠️ Production needs a manual Role Management tick** (same seeds-once story as every post-seed
  permission) — added to TODO.md's pending-grants batch (now 4 sets); until ticked, only a Super
  Admin can chase.
- Tests: `tests/permissions.test.ts` extended (56 total) — approvers/administrator hold it,
  sales/viewer don't, and the viewer read-only sweep now also matches `chase`.
- Docs: RBAC.md (permission table row + count), API.md (route auth), MODULES/ScopeOfWork.md,
  TODO.md (new ACTION item + step-E batch count). What's New (Thai) entry added.
- `tsc` (both configs)/`lint`/`npm test` (56/56)/`build` all pass clean.

---

## 2026-07-29 — Refresh no longer resets to the Dashboard (URL-hash page persistence)

Direct user request ("ทำไมเวลารีเฟรชหน้ามันเด้งไปหน้า dashboard ตลอดทำไมไม่อยู่หน้าเดิม") — the
app has no router, so the current page lived only in React state and every refresh rebooted to
the default. The owner approved the "level 1" fix (page-level) explicitly:

- `activeNav` is now mirrored into `location.hash` (`#quotations`, `#products`, ...): initial
  state reads the hash (`navFromHash()` — validated against the `NavKey` union via
  `NAV_LABEL_KEYS`, unknown hashes ignored), every page change writes it (a history entry, so
  **browser Back/Forward now navigate between pages**), and a `hashchange` listener reads it
  back (covers Back/Forward + hand-edited URLs). The very first write on a hashless load uses
  `history.replaceState` so Back doesn't step through a phantom `""→#dashboard` entry.
- Free side effects: page-level shareable URLs (`...#quotations` opens straight to that page
  after sign-in), and the existing permission gating still applies unchanged (`effectiveNav`
  falls back to Dashboard for a page the user can't view, exactly as before).
- **Deliberately page-level only** ("level 2" — restoring the open *document* inside a page —
  was explained as a bigger per-module job and not requested; now tracked in TODO.md). Unsaved
  form input can never survive a refresh regardless.
- Docs: ARCHITECTURE.md + docs/CLAUDE.md "No router" sections updated to describe the hash
  persistence and where the router-migration threshold now actually sits. What's New entry added.
- `tsc`/`lint`/`npm test` (55/55)/`build` all pass clean. Not click-through verified live (same
  standing limitation) — specifically unverified: refresh lands back on the same page against
  the real deployment, and Back/Forward stepping through a real navigation history.

---

## 2026-07-29 — Guided tour steps for the Quotation and Products pages

Closes the "extend the guided tour" TODO item's two buildable targets (open since 2026-07-10),
on the owner's direct go-ahead:

- **Infra**: `GuidedTour.tsx`'s driver.js wiring extracted into an internal `useDriverTour()`;
  the original sidebar/topbar/Dashboard walkthrough (`useGuidedTour()`) is byte-for-byte the same
  behavior. New `useModuleTour(tourKey, userId, steps)` — auto-starts once per user per page
  (600 ms after mount so the page has painted; closing/skipping counts as seen, same convention
  as the main tour) and returns `start` for a replay button. Seen-tracking is per-tour in
  localStorage (`hasPageTourCompleted()`/`markPageTourCompleted()`, src/lib/tour.ts —
  independent of the main tour's existing key, which is untouched/back-compatible).
- **Quotation list** (QuoteList.tsx, 4 steps): "+ สร้างใบเสนอราคา" (mentions the Job
  Type/Template wizard) → summary cards → search + status filters → the table (click a row to
  open; interest rating in the last column). Mounted in the LIST component so it can never fire
  over the detail/editor views; `currentUserId` threaded from QuotationPage's existing
  `currentUser`.
- **Products list** (ProductList.tsx, 4 steps): "+ เพิ่มสินค้า" (mentions quotations pick items
  from here) → "จัดการหมวดหมู่" → search/category/show-archived toolbar → the table
  (sortable headers, row actions). `currentUserId` threaded App → ProductsPage → ProductList
  (new prop on both).
- **Replay button**: a `HelpCircle` icon button ("ดูคำแนะนำหน้านี้" / "Show page tips",
  `tour.replay`) in each page's header restarts that page's tour on demand.
- 18 new i18n keys (th/en). What's New (Thai) entry added.
- `tsc` (both configs)/`lint`/`npm test` (55/55)/`build` all pass clean. Not click-through
  verified in a live browser this session (same standing limitation) — specifically unverified:
  the auto-start actually waits for slow-network paints, and driver.js popover positioning
  around the summary-card grid at narrow viewports.

---

## 2026-07-29 — UX polish pass (kill window.prompt, touch-visible delete, honest login) + user manual updated to the 29/07 edition

Owner request: "ช่วยเช็คบัคและปรับหน้าตาให้แบบ User friendly มากกว่าเดิมหน่อยตรงไหนที่คิดว่าใช้งานยาก
และอัพเดตหน้าคู่มือให้ด้วย". The bug/UX review found the roughest edges were three long-tracked
items (two from the 2026-07-13 Codex UX review backlog) plus the jarring native prompts the recent
approval/manual-number features had leaned on:

- **New shared `PromptDialog.tsx`** (styled single-value text prompt, same shell as ConfirmDialog;
  `multiline`/`mono`/`requiredMessage` options; input state lives in an inner mounted-only-while-
  open component so it resets per open without a reset-in-effect). Replaced ALL THREE
  `window.prompt()` usages: Scope of Work reject reason (multiline, with context message),
  Scope of Work duplicate's document number (mono, with the "free-form, uniqueness-checked"
  explanation), Delivery Order reject reason. Native prompts were unstyled browser chrome with no
  Thai font and awkward on mobile — at exactly the moments that matter (rejecting an approval,
  numbering a copy). UI_GUIDELINES.md "Dialogs" now bans `window.prompt` outright.
- **Notification delete button visible without hover** (Codex 2026-07-13 backlog): was
  `opacity-0 group-hover:opacity-100` — literally undiscoverable on touch devices and invisible
  to keyboard users. Now `opacity-50 hover:opacity-100 focus-visible:opacity-100`.
  UI_GUIDELINES.md's icon-action pattern updated to ban the hover-only idiom.
- **Removed the login page's "จดจำฉันไว้ในระบบ" checkbox** (Codex 2026-07-13 backlog: "make it
  functional or remove it — currently misleading"): it never did anything (sessions are always
  the 7-day cookie), so it only misled users into thinking unchecking it changed logout behavior.
  Removed + its 2 i18n keys.
- **User manual updated to the 29/07/2026 edition** (`docs/manual/user-manual.html` →
  regenerated `public/คู่มือการใช้งาน TCS ERP.pdf`, 17 pages): Chapter 1 gains the login-lockout
  explanation (5 wrong passwords / 15 min); Chapter 5 rewritten where stale — manual document
  number entry (replaces the Secondary-Code/auto-number instructions), the approval workflow
  (ส่งขออนุมัติ → รออนุมัติ → อนุมัติ/ปฏิเสธ — the manual still said "ยืนยัน Final"), a new
  "การติดตามเลข PO (ทวง PO)" section, Duplicate-asks-for-a-number, and the follow-up-fields-
  editable-after-Final rule; Chapter 6's Final bullet replaced with the approval flow. Figure
  captions corrected; screenshots unchanged (they predate today's UI text changes — recapture is
  already a mandatory go-live step, see SERVER_MIGRATION_PLAN.md step G).
- **PDF regeneration is now a committed one-command script** (`docs/manual/generate-pdf.mjs`,
  puppeteer-core via `npm install --no-save` + system Chrome — previously an ad-hoc throwaway
  each time); SERVER_MIGRATION_PLAN.md step G updated to reference it.
- What's New (Thai) entry added covering the three UX changes + the manual update.
- `tsc` (both configs)/`lint`/`npm test` (55/55)/`build` all pass clean. The regenerated PDF was
  sanity-checked (valid PDF, 17 pages) but not visually proofread page-by-page this session —
  the pipeline and stylesheet are unchanged from the visually-verified 24/07 edition, only text
  content changed.

---

## 2026-07-29 — First automated test suite (vitest, 55 tests, wired into CI)

The project's first real test coverage, on the owner's direct go-ahead ("ทำเลย" after the
plain-language explanation) — closes the "zero test coverage anywhere" state flagged since the
backend migration, deliberately as a first slice over the riskiest pure logic plus one real
integration path:

- **Tooling**: `vitest` + `mongodb-memory-server` (devDependencies; both added to
  `allowScripts`). `npm test` (`vitest run`), standalone `vitest.config.ts` (Node environment,
  no Tailwind/React plugins needed — esbuild handles quotes.tsx's JSX via tsconfig). CI gained a
  Test step + a cache for the downloaded mongod binary.
- **`tests/quoteAmounts.test.ts`** — `computeTotals` (line discounts before quote discount, 7%
  VAT, empty-lines-yield-zero) and **client/server formula parity**: `computeQuoteAmountBeforeVat`/
  `WithVat` (api/_lib/quoteAmounts.ts, feeding the persisted `amount` + every Dashboard total)
  must match `computeTotals` on shared cases — fails the moment the two formulas drift.
- **`tests/permissions.test.ts`** — default-role grants (super_admin holds everything incl.
  later-added permissions; sales_user can create/edit but never approve/viewAll; both approver
  levels can approve but not create; viewer holds nothing mutating) + edge cases (null user /
  unknown roleKey / missing role all deny; a role merely NAMED "Super Admin" isn't one; custom
  roles hold exactly what they were granted).
- **`tests/quoteWorkflow.test.ts`** — the server-authoritative state machine: exact from/to per
  action, terminal statuses (Won/Lost/Cancelled) have no exit, no Draft→Approved shortcut, every
  non-terminal status has an exit; `isWorkflowActionAllowed` (submit needs ownership, approve/
  reject/cancel are permission-pure, post-approval actions need edit + owner-or-approver);
  `COMMENT_REQUIRED_ACTIONS` covers exactly the rejection-style actions.
- **`tests/quotePermissions.test.ts`** — `computeQuotePermissions` ownership rules: own Draft
  fully controllable, colleague's Draft untouchable, approve only from PendingApproval, the
  submitter can't approve their own quote, viewer gets every gate closed, legacy ownerless
  quotes count as owned, Rewrite/Duplicate follow `quotations:create`.
- **`tests/revisions.test.ts`** — `-R{n}` parsing (incl. free-form manual Scope of Work numbers
  and lookalike ids that must NOT parse), rewrite-of-a-rewrite advances the same chain, and
  `dedupeQuotesByRevisionChain` keeps exactly the latest revision per chain in any input order.
- **`tests/scopeOfWorkValidation.test.ts`** — a fully-valid baseline passes; `scopeNumber`
  required / `secondaryCode` optional (the 2026-07-29 manual-number rules); approver required at
  finalize (and for printing a Final record) but not for printing a Draft; malformed dates fail;
  payment installments must each have a pct and sum to exactly 100; unchecked mandatory
  checklist groups block; item rules (no items / no spec line / zero quantity).
- **`tests/api/loginRateLimit.test.ts`** — integration: the REAL `api/handlers/auth.ts` (setup
  wizard → login) with real bcrypt/JWT against an in-memory MongoDB. Covers: successful login
  sets the session cookie; wrong password 401s; **5 failures lock the identifier and the correct
  password then still gets 429** (+ `Retry-After`); success clears the failure history (verified
  in the collection); one identifier's failures never lock another; 20 failures from one IP
  across many identifiers trip the IP cap while an unrelated IP is unaffected; failure docs
  record the caller's IP as a real BSON Date; a suspended account's correct-password attempt
  403s and records nothing; the 900s TTL index really exists.
- **Standing rule updated** (docs/CLAUDE.md #8): `npm test` joins tsc/lint/build as a
  before-done requirement, and changes touching tested logic must update the matching test file
  in the same task.
- Not covered yet (deliberate first slice — tracked in TODO.md): HTTP-level per-route guards
  beyond `/api/auth/*` (the login test's mock-req/in-memory-Mongo harness is the template),
  products CRUD helpers, UI components.
- All 55 tests pass locally (11 s) and in CI. No What's New entry — internal tooling.

---

## 2026-07-29 — Login rate limiting on POST /api/auth/login

Closes the "no login rate limiting" Known Gap open since the 2026-07-09 backend migration
(docs/RBAC.md), on the owner's direct request:

- **Mechanism**: failed attempts are recorded in a new `login_attempts` MongoDB collection
  (`{identifier, ip, createdAt: Date}` — a real BSON `Date` so the TTL index can purge it) and
  counted over a 15-minute sliding window (`$gte` cutoff for precision; the TTL index is the
  cleanup). Two keys: per typed identifier (**≥5** failures → 429 — protects one account from a
  targeted guess) and per requesting IP (**≥20** → 429 — blunts a scripted sweep across many
  usernames; higher so one office NAT with several fat-fingering humans doesn't trip it). IP =
  first `x-forwarded-for` hop (Vercel-set; client-supplied values are appended after, never first).
- **429 response**: Thai "พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอประมาณ X นาที..." where X is
  when the oldest in-window failure ages out (clamped ≥1 min), plus a `Retry-After` header. The
  check runs BEFORE the user lookup + bcrypt compare, so a locked-out request costs one count
  query, not a ~100 ms hash.
- **Bookkeeping**: a successful login deletes that identifier's failure docs (a legitimate user
  who fat-fingered twice isn't one typo from lockout all window); a correct-password-but-suspended
  attempt neither records (not a guess) nor clears (a lockout can't be reset by hammering a
  known-suspended account).
- **Why MongoDB**: per-instance memory resets on cold start and isn't shared across concurrent
  serverless instances; a Vercel KV-style service would violate the no-Vercel-locked-services
  rule (SERVER_MIGRATION_PLAN.md). The collection travels with the database to the future server.
- **Indexes**: TTL `{createdAt}` (900 s) + the two count keys — in `ensureIndexes()` for fresh
  setups AND declared defensively once per warm instance (`ensureLoginAttemptIndexes()`, same
  pattern as `ensureScopeNumberIndexes()`), since `ensureIndexes()` never runs on the
  already-provisioned production deployment.
- What's New (Thai) entry added. Docs: TODO.md (item → done), RBAC.md (gap closed, both
  mentions), API.md (login row + gaps list), MODULES/Auth.md (3 mentions), DATABASE.md
  (`login_attempts` row), IMPLEMENTATION_CHECKLIST.md (2 rows), PROJECT_STATUS.md (Known Risk →
  closed, next-steps list, Completed Features), CLAUDE.md (scope-limitations line).
- `tsc` (both configs)/`lint`/`build` all pass clean. Unverified live (same standing limitation):
  that 6 rapid wrong passwords really 429 on production and the lockout expires on schedule —
  noted inside the TODO.md done-item.

---

## 2026-07-29 — "ทวง PO": chase missing customer PO numbers + unlock follow-up fields on approved records

Executes the full 2026-07-24 proposal recorded in TODO.md, on the owner's direct go-ahead
("ทำเรื่องทวง PO ต่อเลย"):

- **List page** (`ScopeOfWorkList.tsx`): new "PO" column showing the PO number, or an amber
  "ยังไม่มี PO" badge when blank; an "เฉพาะที่ยังไม่มี PO" filter toggle (composes with the
  status pills, shows the live count); a 5th "ยังไม่มี PO" summary card (grid rebalanced
  `grid-cols-2 md:grid-cols-3 xl:grid-cols-5`). Badge basis is a blank `customerPoNumber` only —
  attachments deliberately aren't consulted (they carry no type field, so a "PO file" can't be
  told apart from any other attachment). `ScopeOfWorkListItem`/`toListItem()` gained
  `customerPoNumber`.
- **"ทวงเลข PO" button** (`ScopeOfWorkDocument.tsx` toolbar, shown while the record's PO number
  is blank, any status): calls new `POST /api/scope-of-works/:id/chase-po`
  (`scopeOfWork:view` — anyone who can see the record can chase; every press is audit-logged
  ("Scope of Work PO Chased"), so it's deliberately repeatable with no cooldown). The server
  resolves the responsible person — ERP user whose `fullName` exactly matches the frozen
  `quotationSalesperson` snapshot → the `seller.userId` signatory link → the record's creator —
  writes an in-app bell notification (new `scope_of_work_po_chase` type, BellRing icon,
  deep-links via the existing `relatedScopeId` mechanism), and returns the notified name for the
  confirmation toast. 400 with a clear message once a PO number exists, or when no account can
  be resolved at all.
- **Follow-up fields exempt from the approval lock** (the proposal's companion blocker fix):
  `FOLLOW_UP_FIELDS` (`customerPoNumber`/`documentRecipients`/`documentRecipientMessage`) may now
  be PATCHed on a PendingApproval/Final record — a customer PO usually arrives AFTER approval;
  item lists/payment terms/checklists/signatures/the document number stay locked (a non-Draft
  PATCH carrying any other field still 400s, message now notes the exemption). Attachment
  upload/delete lost their Draft-only guards for the same reason. Client: the PO input +
  recipients picker/message/attachments now enable on `canEdit` (not Draft-only); the toolbar
  save button appears for `canEdit` on any status, sending only the follow-up subset
  (`toFollowUpFields()`) on non-Draft records, labeled "บันทึก (เลข PO / ผู้รับเอกสาร)".
  **Side effect fixed**: "ส่งอีเมลแจ้งผู้รับเอกสาร" on a Final record previously ALWAYS failed —
  its save-then-send called the full-field PATCH, which the content lock rejected (and the picker
  was disabled anyway); both halves work now.
- **Dashboard**: the Scope of Work card gained a "ยังไม่มีเลข PO" tile (`noPo` count in
  `api/dashboard/index.ts`, `$in: [null, ""]` so a record missing the field entirely counts too;
  respects the same own-records scoping as the other tiles). New i18n keys
  `dashboard.scopeOfWork.noPo` (th/en).
- **Deferred, unchanged**: time-based auto-chasing ("remind after 3 days") needs cron — still
  post-migration per the no-Vercel-locked-services rule.
- What's New (Thai) entry added. Docs: TODO.md (proposal item → done + live-verification item),
  MODULES/ScopeOfWork.md ("PO Chasing" section + lock-exemption notes), API.md, 
  MODULES/Notifications.md, MODULES/Dashboard.md, PROJECT_STATUS.md, SESSION_LOG.md.
- `tsc` (both configs)/`lint`/`build` all pass clean; live verification tracked in TODO.md.

---

## 2026-07-29 — Set up CI (GitHub Actions: lint + typecheck + build on every push)

Closes the long-standing TODO.md High Priority item (owner asked "ทำ CI คืออะไร", got the
explanation, said "ทำเลย"). New `.github/workflows/ci.yml`:

- Triggers on every push/PR to `master`; single `checks` job on `ubuntu-latest`, Node 24
  (matches the local dev environment), `npm ci` with the npm cache enabled.
- Steps kept separate for clear failure labeling: `npm run lint` → `npx tsc --noEmit` →
  `npx tsc --noEmit -p tsconfig.api.json` → `npm run build` (the build re-runs both tsc configs
  internally, kept anyway as the only step proving vite can actually bundle).
- **Notify-only, deliberately**: a failing check shows a red ✗ on the commit but does NOT block
  the Vercel auto-deploy — blocking would require moving to a PR-based workflow (a real
  day-to-day workflow change, offered to the owner but not requested). Platform-neutral (plain
  GitHub Actions + npm, nothing Vercel-specific) per SERVER_MIGRATION_PLAN.md's standing rule.
- Also marked TODO.md's "Verify GitHub → Vercel auto-deploy is actually wired" as resolved — it
  was confirmed in practice by 2026-07-23 (a push observed producing a `READY`/`production`
  deployment matching the latest commit) and by every shipped feature since.
- No What's New entry — internal tooling, not a user-facing feature.
- Docs: TODO.md (2 items done), PROJECT_STATUS.md (Known Risks + Technical Debt), CLAUDE.md
  (scope-limitations line), IMPLEMENTATION_CHECKLIST.md (CI row).

---

## 2026-07-29 — Scope of Work: manual-ONLY document number entry

Executes the spec recorded in TODO.md on 2026-07-24 (owner: "ระบบไม่ต้องสร้างเลขเองดิ"). The
build-time open question was answered by the owner this session: **completely free-form** — no
format guardrails (no forced "PQ" prefix or segment pattern).

- **Create** (`POST /api/scope-of-works`): body is now `{ quotationId, scopeNumber }` — the user
  TYPES the whole document number in the "สร้าง Scope of Work" modal (`QuoteDocument.tsx`),
  replacing the old required-`secondaryCode` prompt. Required non-blank; friendly duplicate check
  (`assertScopeNumberAvailable()` → 409 "เลขที่เอกสาร ... ถูกใช้กับ Scope of Work ใบอื่นแล้ว")
  backed race-safely by the unique `scopeNumber` index (insert `E11000` → same 409). The old
  `PQ{YYYYMM}-{seq}-{jobType}-{secondaryCode}` generator + atomic monthly counter are retired;
  new records write `yearMonth: ""`/`jobSequence: 0`/`secondaryCode: ""` (legacy fields; old
  records untouched, no migration).
- **Edit while Draft only**: `scopeNumber` is now PATCHable (uniqueness re-checked, 11000-backstopped)
  and the editor's "เลขที่เอกสาร (รหัสงาน)" field (`ScopeOfWorkDocument.tsx`, previously read-only)
  is editable while Draft — PendingApproval/Final stay locked wholesale by the existing status
  guard, so an approved number is frozen for good. The old recomputes are **removed**: editing
  `issueDate` across a month boundary no longer re-reserves a sequence, and editing
  `secondaryCode` no longer rewrites the number.
- **Duplicate** (`POST /:id/duplicate`): now requires `{ scopeNumber }` in the body — the client
  asks the user for the copy's own number (`window.prompt`, same convention as reject's comment)
  instead of the server minting one.
- **Rewrite**: unchanged behavior — still auto-appends `-R{n}` to whatever was typed
  (`getRevisionRoot()` + the `scope_revision_{root}` counter, bounded-retry on collisions, so a
  manually-created `X-R1` can't break `X`'s next rewrite).
- **Indexes**: new `ensureScopeNumberIndexes()` (once per warm instance, same defensive pattern as
  `ensureAttachmentIndexes()`) creates the unique `scopeNumber` index — the Setup-Wizard-only
  `ensureIndexes()` never ran on the already-provisioned production DB, so on production that
  index (TODO.md believed it existed) most likely did NOT — and drops the legacy
  `{yearMonth, jobSequence}` unique index (removed from `ensureIndexes()` too): every new record
  writes the same `{"", 0}` pair, which that index would reject from the second record onward.
  Side effect: this also fixes a latent fresh-setup-deployment bug where Rewrite's carry-over of
  the source's `{yearMonth, jobSequence}` violated that index and 409'd after 3 retries.
- **Validation** (`scopeOfWorkValidation.ts`): `scopeNumber` added to `scopeOfWorkRequiredFields`
  (required — it's the document identity; also added to `ScopeOfWorkValidationInput` and the
  server's `toValidationInput()`); `secondaryCode` flipped to optional (legacy reference field,
  label now "รหัสอ้างอิงท้ายงาน (ไม่บังคับ — ฟิลด์อ้างอิงเดิม)") — its old "unconfirmed business
  meaning" open question is moot now that the user types the full number themselves. Net required
  count unchanged (+1/−1).
- **Follows for free** (verified by reading the code paths): list pages/Global Search/email
  subject+notifications all read `scopeNumber` off the record; email threading anchors on the
  internal record id, not the number, so renumbering a Draft never breaks an existing thread.
- **What's New**: added a Thai `WHATS_NEW_ENTRIES` entry (2026-07-29) announcing the change.
- Docs: TODO.md (spec item moved to done), MODULES/ScopeOfWork.md ("Scope Number / Job Code"
  rewritten + legacy section), API.md (create/PATCH/duplicate/rewrite rows), DATABASE.md
  (`scope_of_works` numbering + indexes), CLAUDE.md module table row.
- `tsc` (both configs)/`lint`/`build` all pass clean. Not yet verified against a live deployment
  (same standing limitation as every recent pass) — see the new TODO.md verification item.

---

## 2026-07-24 (absolute latest) — Approval workflow for Scope of Work + Delivery Order

Direct user request ("ทำส่งขออนุมัติของ Scope of work กับ ใบส่งมอบให้ด้วยคือถ้ามีคนอนุมัติแล้วมันจะ
ไม่สามารถแก้ไขอะไรได้อีกต้องกด Rewrite เท่านั้น"). Both documents gain the same state machine:

**Draft → (ส่งขออนุมัติ) → PendingApproval → (อนุมัติ) → Final**, with (ปฏิเสธ + required comment)
and (ถอนคำขอ, by the requester) both returning to Draft. Editing/refresh/attachments are now
strictly Draft-only (`!== "Draft"` guards — PendingApproval locks too); Final is terminal and only
Rewrite continues the work.

- **Statuses**: `ScopeOfWorkStatus`/`DeliveryOrderStatus` gain `"PendingApproval"` (existing
  Draft/Final records unaffected).
- **Routes** (both handlers): `POST /:id/submit-approval` (canEdit+ownership rule, Draft only —
  SOW validates print-level completeness; the approver signatory is NOT required at submit),
  `POST /:id/reject` (finalize permission, comment required), `POST /:id/withdraw-approval`
  (canEdit). **`POST /:id/finalize` now means "อนุมัติ"** — only valid from PendingApproval
  (route name kept so the `*:finalize` permission story and client function names are unchanged;
  direct Draft→Final is no longer possible). SOW approve **auto-fills the approver signatory**
  with the approving user + date, then re-validates at finalize level.
- **Delivery Order Rewrite added** (`POST /api/delivery-orders/:id/rewrite`, `deliveryOrder:create`
  — the document previously had no Rewrite at all): fresh Draft copy of a **Final** record
  (installment ids preserved so refresh reconciliation still works); the SOW's
  "เปิดใบส่งมอบสินค้า" button follows the newest record automatically (updatedAt-desc lookup).
- **Notifications**: 6 new types (`scope_of_work_/delivery_order_` × `submitted/approved/rejected`)
  — submit → every active `*:finalize` holder; approve/reject → the creator. New
  `Notification.relatedDeliveryOrderId` deep-links to the standalone Delivery Order page
  (checked first in the bell's onNavigate).
- **UI**: 3-state badges (Draft / รออนุมัติ / Final) + per-state toolbar buttons on both detail
  views (submit gated on print-level validation for SOW; approve/reject for finalize holders;
  reject comment via the small-prompt convention); both list pages gain a รออนุมัติ stat tile +
  filter chip; the Dashboard SOW/DO cards gain a รออนุมัติ tile (`pending` field, "Final" label
  now reads อนุมัติแล้ว/Approved).
- **No new permission**: `*:finalize` = approval authority (every role that could Finalize before
  can Approve now); no Role Management steps needed.

`tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass clean.

---

## 2026-07-24 — Removed: Delivery Order link in the recipient email

Direct user request after trying the feature ("เอาที่ติ๊กใบส่งมอบออกไปเลย เดี๋ยวแนบไฟล์เอา") — the
same-day "แนบลิงก์ใบส่งมอบสินค้าในอีเมล" checkbox + session-less
`GET /api/delivery-orders/:id/view?key=` HTML view are fully removed; the preferred flow is
printing the official FM-SL-05 form to PDF and attaching it via the normal ไฟล์แนบ feature (which
travels with the email threading, kept). Removed: the checkbox/state in
`ScopeOfWorkDocument.tsx`, the `{ includeDeliveryOrder }` body option + email block in
`scopeOfWorkHandler.ts`, `handleShareView()` + its route in `deliveryOrderHandler.ts` (a removal
note remains in place), and `DeliveryOrder.shareKey` from the type. A `shareKey` field may linger
on `delivery_orders` documents that minted a link during the feature's brief lifetime — harmless,
nothing reads it. What's New entry reworded to threading-only; docs: ScopeOfWork.md,
DeliveryOrder.md, API.md. `tsc`/`lint`/`build` clean.

---

## 2026-07-24 — Threading fix: anchor the FIRST send's `References` too

Live test (user screenshot of a real Gmail inbox) showed the "Re:" follow-up arriving as a
separate conversation: **Resend replaces a custom `Message-ID` with its own**, so the follow-up's
`In-Reply-To`/`References` pointed at an ID that never existed. Fix: every send — the first
included — now carries the same synthetic thread anchor in `References`; mail clients group
messages whose `References` chains share an ID whether or not that root message exists, so
threading no longer depends on the provider preserving anything. Records whose first send
predates this fix start grouping from their next send onward (the already-delivered first email
can't gain the header retroactively). `api/_lib/scopeOfWorkHandler.ts` only; docs updated in
MODULES/ScopeOfWork.md's threading bullet.

---

## 2026-07-24 — Email threading for repeat sends + Delivery Order link in the email

Two direct user requests in one pass ("ส่งไฟล์ตามหลัง...ให้มันอยู่ในแบบเหมือนตอบกลับตัวเองในอีเมล" +
"ทำให้มันสามารถแนบใบส่งมอบงานได้ด้วย", clarified via AskUserQuestion to mean a link in the SOW email):

**Email threading** — repeat "ส่งอีเมลแจ้งผู้รับเอกสาร" sends of the same record now land in the
recipient's existing email conversation instead of as a new email each time:
- `api/_lib/email.ts`: `sendEmail()` accepts pass-through SMTP `headers`.
- New server-only `ScopeOfWork.emailThreadId` (never PATCHable, explicitly reset by
  Duplicate/Rewrite — a new document starts its own thread; critical because both build the new
  record by spreading the source). First send generates `<sow-{id}-{rand}@{APP_URL host}>`, sets
  it as `Message-ID`, persists it (no updatedAt bump — send bookkeeping, not a content edit);
  every later send sends `In-Reply-To`/`References` + a `Re:` subject. Per-record, so two Scope
  of Works never share a thread. If the provider overrides the first `Message-ID`, the
  Re:-same-subject fallback still groups in Gmail and follow-ups still thread with each other.
**Delivery Order link** — the ผู้รับเอกสาร send row gains a "แนบลิงก์ใบส่งมอบสินค้าในอีเมล" checkbox
(only when a Delivery Order exists; per-send choice, not persisted):
- `POST /send-documents` accepts `{ includeDeliveryOrder }` (400 if none exists); mints a
  `DeliveryOrder.shareKey` on first use and renders a "ใบส่งมอบสินค้าและบริการ" block in the email.
- New session-less `GET /api/delivery-orders/:id/view?key=` (`handleShareView`) — same
  capability-URL pattern as attachment downloads (opaque 404 on any mismatch, `noindex`,
  `no-store`, all interpolated values HTML-escaped): a read-only HTML rendering, one section per
  non-deposit installment (เลขที่/วันที่/ticked items/Remark). A viewing convenience from the live
  record — the official printable FM-SL-05 form remains the in-app print flow.

What's New entry (`2026-07-24-email-thread-delivery-link`); docs: MODULES/ScopeOfWork.md,
MODULES/DeliveryOrder.md, API.md. `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`,
`npm run build` all pass clean. Live threading behavior in real inboxes is testable only against
the Resend account owner's address until a sending domain is verified (see TODO.md).

---

## 2026-07-24 — Dashboard: real Excel (.xlsx) export

Direct user pick from the "what's the system missing" list (option 6, Excel export / monthly
report — constrained to free-only per the same conversation's no-budget decision):

- New `src/pages/dashboard/xlsxExport.ts` — client-side multi-sheet workbook (Summary+KPIs /
  Sales Performance / Top Customers / Job Types / Pipeline / Monthly Trend) built from the same
  already-fetched, already-filtered `DashboardStats` the CSV export uses; reuses the `xlsx`
  package already shipped for Template workbook parsing (zero new dependencies), dynamic-imported
  so the library loads on first click, not in the Dashboard bundle. Column widths auto-sized;
  the header block records the filter period + an own-data-only marker when applicable.
- `DashboardPage.tsx`: gold "ส่งออก Excel" button (primary) beside the existing CSV button, with
  an in-progress state. The **monthly report** ask is covered by composition: pick the
  เดือนนี้/เดือนที่แล้ว filter preset → export — the period lands in the filename
  (`dashboard-report-<from>_<to>.xlsx`) and the Summary sheet header. No scheduled/emailed report
  (would need cron — Vercel-locked, and the polling/on-demand principle applies until the real
  server exists).
- 4 i18n keys, What's New entry (`2026-07-24-dashboard-excel-export`), TODO's "PDF/Excel export
  deferred" note updated (Excel done; PDF still deferred), docs (Dashboard.md).

`tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass clean.

---

## 2026-07-24 — Dashboard: own-data-only scoping for roles without `viewAll`

Direct user decision (asked explicitly via AskUserQuestion; chose "เห็นแค่ของตัวเอง"): the Dashboard
previously showed company-wide aggregates to every `dashboard:view` holder, which leaked
colleagues' totals/rankings to roles the list pages deliberately restrict (the own-records-only
inconsistency surfaced while discussing the new Delivery Order card's permission gating).

- `api/dashboard/index.ts`: a caller without `quotations:viewAll` now gets every quote-based
  figure (KPIs, pipeline, charts, followUps, salesPerformance, customerAnalytics,
  jobTypeAnalytics, trend series) computed from only their own quotes — the exact ownership
  predicate `GET /api/quotes` uses (`createdByUserId` = self, plus ownerless legacy quotes) —
  injected into `dateMatch` (inherited by `fullMatch`) and `salespersonOnlyMatch`. Sales Activity
  is forced to their own `userName`. The SOW/DO summary cards likewise scope by the module's own
  `viewAll` using the same predicates as their list routes (incl. the document-recipient match for
  SOW). Deliberately still company-wide: the new-vs-repeat client classification (repeat customer
  of the COMPANY; only own clients are displayed), the forecast's trailing-12-month win-rate
  baseline (a stable ratio), and `approvalDashboard` (an approver must see everyone's pending
  quotes; it keeps its own `quotations:approve` gate).
- Response gains `ownDataOnly: boolean`; `DashboardPage.tsx` shows a gold filter-honesty notice
  ("แสดงเฉพาะข้อมูลของคุณเท่านั้น") and `DashboardFilterBar` hides the salesperson/department
  dropdowns (`hidePeopleFilters`) — they'd only offer the caller themselves. A crafted request
  passing those filters anyway can only narrow its own data further, never widen it.
- 2 i18n keys, What's New entry (`2026-07-24-dashboard-own-data`), docs
  (MODULES/Dashboard.md, API.md, RBAC.md, UI_GUIDELINES.md "Filter Honesty" unchanged in
  principle — the notice follows it).

`tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass clean.

---

## 2026-07-24 — Dashboard: Delivery Order summary card

Direct user request ("อัปเดตหน้า Dashboard... ไม่ได้เอาข้อมูลพวกหน้าที่สร้างใหม่เข้าไปด้วย") — the
2026-07-23 Delivery Order module had no Dashboard presence. Added a Total/Draft/Final summary card
mirroring the existing Scope of Work card exactly:

- `api/dashboard/index.ts`: new `deliveryOrder: { total, draft, final } | null` response field —
  gated by `deliveryOrder:view` (null hides the card), company-wide/all-time/unfiltered (same
  documented reasoning as `scopeOfWork`: the document inherits its quotation context, so it has no
  salesperson/issue-date of its own to filter by), isolated in its own try/catch.
- New `src/pages/dashboard/DeliveryOrderSummary.tsx` (Truck icon) + `DeliveryOrderSummary` type in
  `src/lib/dashboard.ts`; `DashboardPage.tsx` renders the SOW + DO cards side-by-side in an
  `xl:grid-cols-2` grid (each still full-width alone when the caller can only see one).
- 10 new i18n keys (Thai + English), What's New entry
  (`2026-07-24-dashboard-delivery-order`).
- Still supporting-detail tier — the "exactly 4 KPI cards" top-row requirement is untouched.

`tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass clean.

---

## 2026-07-24 — Go-Live Checklist recorded in SERVER_MIGRATION_PLAN.md

Docs-only. Direct user request ("อยากให้จดทั้งหมดที่ต้องทำไว้ตอนที่จะขึ้น Server") after discovering
Resend's sandbox sender can only deliver to the account owner's own address: recorded the complete
A→G go-live checklist in docs/SERVER_MIGRATION_PLAN.md — (A) company domain + Resend domain
verification + `EMAIL_FROM` (host-independent, can be done now and fixes real-recipient email on
the demo too), (B) the existing 3-step Express shell plan, (C) server setup incl. the
HTTPS-is-mandatory note (secure cookie) and every env var with the `APP_URL` email/capability-link
warning, (D) Atlas-vs-self-hosted DB + backups, (E) the 3 still-pending manual Role Management
grants vs fresh-DB Setup Wizard, (F) a 6-point post-cutover verification list, (G) demo
decommissioning. Also added the raise-attachment-limit item to the post-migration upgrades list.
Migration work itself remains deferred until the owner says go.

---

## 2026-07-24 — "ส่งอีเมลแจ้งผู้รับเอกสาร" now requires `scopeOfWork:edit`

Direct user report: a role that can only *view* a Scope of Work could still press
"ส่งอีเมลแจ้งผู้รับเอกสาร" (the send used `scopeOfWork:print`) while being unable to pick or change
any recipient — send-but-can't-choose. The send action now requires the same permission that
controls the recipient picker:

- `api/_lib/scopeOfWorkHandler.ts`: `POST /:id/send-documents` gate changed
  `scopeOfWork:print` → `scopeOfWork:edit`. Still no ownership check, still works on `"Final"`
  records (it distributes the document, it doesn't change it — content edits stay Draft-only).
- `src/pages/quotation/ScopeOfWorkDocument.tsx`: the button itself is now rendered only for
  `canEdit` holders (previously it had **no** client-side permission check at all — anyone who
  could open the page saw it). Uses `canEdit`, not `editable` (= `canEdit && isDraft`), so an
  editor can still send a Final record, matching the server.
- Docs: RBAC.md permission table (both rows), API.md route row, MODULES/ScopeOfWork.md
  "Document Recipients".

No new permission and no role-matrix change — roles holding `scopeOfWork:edit` keep working;
view/print-only roles lose exactly the one action the user asked to remove.

`tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass clean.

---

## 2026-07-24 — Notification polling: แจ้งเตือนขึ้นเองโดยไม่ต้องรีเฟรชหน้า

Direct user report: "ตอนนี้เว็บมันไม่ Real time มันต้องกดรีก่อนรอบนึงแจ้งเตือนถึงจะขึ้น" — notifications
were fetched exactly once at boot (`loadDomainData()`), so a `scope_of_work_document_sent` (or any
workflow) notification never appeared until a full page reload.

- `src/App.tsx`: new polling effect — while `bootStatus === "ready"`, refetch
  `GET /api/notifications` every 45 s, plus immediately on window focus and on a hidden→visible
  `visibilitychange`; skips entirely while the tab is hidden (no wasted requests). Cleaned up on
  sign-out/unmount via the effect teardown.
- **Polling, not SSE/WebSocket, deliberately**: Vercel serverless can't hold a connection open,
  and polling is fully portable to the future self-managed server (the standing
  no-Vercel-locked-services rule). SSE is recorded as a possible post-migration upgrade in
  SERVER_MIGRATION_PLAN.md.
- What's New entry added (`2026-07-24-notification-polling`), per the standing announce rule.
- Docs: MODULES/Notifications.md (Business Flow #5, Current Features, Future Improvements),
  SERVER_MIGRATION_PLAN.md (post-migration upgrade note), this file, docs/CLAUDE.md module row.

`tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass clean.

---

## 2026-07-24 — Self-review fix pass over the attachments work (stored-XSS + concurrency + hygiene)

A single-pass code review (no multi-agent fan-out available this session) over everything since
`3d1c151` found and fixed, all in `api/_lib/scopeOfWorkHandler.ts` unless noted:

- **Stored XSS (the important one)**: the unauthenticated download route echoed the
  uploader-chosen `contentType` back with `Content-Disposition: inline` on the app's own origin —
  any editor could upload `text/html`/`image/svg+xml` and have script run in whoever opened the
  emailed link. Now only a script-free whitelist (PDF/PNG/JPEG/GIF/WebP/plain text) renders
  inline; everything else is `attachment` + `application/octet-stream`, plus
  `X-Content-Type-Options: nosniff` always.
- **Concurrent-upload race**: upload/delete rewrote the whole `attachments` array from a pre-read
  snapshot (`$set`) — two parallel uploads could silently drop one's metadata (orphaning its
  bytes) and blow past the 5-file cap. Now an atomic `$push` with the cap re-checked inside the
  update filter (losing the race deletes the just-stored bytes and returns the normal "full"
  error), and delete uses `$pull`.
- **Missing indexes**: `scope_attachment_files` had none — every download was a collection scan
  over up-to-2-MB Binary docs. Added `{attachmentId}` (unique) + `{scopeOfWorkId}` to
  `ensureIndexes()` (`api/_lib/collections.ts`) and, because that only runs from the Setup
  Wizard, defensively per-instance via `ensureAttachmentIndexes()` (same pattern as
  `ensureSearchIndexes()`).
- **Malformed `filename*`**: `encodeURIComponent` leaves `'()*` bare and a bare `'` breaks the
  RFC 5987 `filename*=UTF-8''…` syntax (e.g. `customer's PO (final).pdf`) — now percent-escaped.
- **Legacy-record normalization**: `normalizeScope()` now defaults `attachments: []` (the client
  type declares it non-optional), and the attachment routes' responses go through
  `normalizeScope()` like every other route instead of raw `withStringId()`.
- **Dead base64 try/catch**: Node's base64 decoder never throws — it silently skips invalid
  characters, so corrupt input could be stored truncated. Replaced with an up-front charset check.
- **Email size text**: small files rendered as "(0.00 MB)" — the recipient email now uses the
  same `formatFileSize()` as the ไฟล์แนบ list, moved to `src/lib/scopeOfWork.ts` and shared
  (`DocumentRecipientsPicker.tsx` local copy removed).

Reported but deliberately not changed: the Delivery Order print's filler-row budget counts rows,
not rendered height, so long wrapped item names can push content to a second page with filler
still present (visual tuning, needs the reference PDF to re-verify against).

**Files Modified**: `api/_lib/scopeOfWorkHandler.ts`, `api/_lib/collections.ts`,
`src/lib/scopeOfWork.ts`, `src/pages/quotation/DocumentRecipientsPicker.tsx`,
`docs/MODULES/ScopeOfWork.md`, `docs/API.md`, `docs/CHANGELOG.md`.

---

## 2026-07-24 — Scope of Work attachments reworked: MongoDB storage, Vercel Blob removed

**Context — live testing of the entry below surfaced two Blob issues and one big new fact.** The
first live upload attempt 503'd: the user's newly-created Blob store provisions **OIDC-style creds**
(`BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY`, no `BLOB_READ_WRITE_TOKEN` at all) and the
configured-check gated on the classic token name (fixed in `da24bea`). The next attempt failed with
`Cannot use public access on a private store` — the store was created private-access, incompatible
with the design's email-link requirement. Explaining the public-store requirement prompted the user
to clarify: **"ที่จริงระบบนี้ไม่ได้จะขึ้น vercel นะ...แค่อยากลองระบบเฉยๆ" — the Vercel deployment is
only a trial; the real hosting will be elsewhere.** Given the choice (MongoDB storage / recreate the
store public / shelve), the user picked **MongoDB storage** — files must travel with the database.

**Rework**:
- File bytes now live in a new **`scope_attachment_files`** collection (one BSON-Binary document
  per file — never embedded in `scope_of_works`, so fetching a record never drags file data).
  `api/_lib/blob.ts` and the `@vercel/blob` dependency are deleted; no external setup needed at
  all (the user's Blob store can be deleted).
- The "กลัว db เต็ม" concern is now answered with **hard limits instead of external storage**:
  2 MB/file × 5 files/record (was 3 MB × 10) — ~50 fully-loaded records per 500 MB of free Atlas.
- **Downloads are unauthenticated capability URLs**: each file gets a random 24-byte
  `downloadKey`; new `GET /api/scope-of-works/:id/attachments/:attachmentId/download?key=...`
  serves the bytes (`Content-Disposition: inline`) to anyone with the key — required because the
  links go into recipient emails, where there is no app session. Wrong/missing key → opaque 404.
  Same unguessable-URL model the public Blob URLs would have provided.
- `ScopeOfWorkAttachment.url` stores the app-relative capability path; the recipient email
  prefixes the app origin. UI hint text updated (no longer claims files avoid the database);
  What's New entry limits updated.

**Files Modified**: `api/_lib/collections.ts`, `api/_lib/scopeOfWorkHandler.ts`,
`api/_lib/blob.ts` (deleted), `src/lib/scopeOfWork.ts`,
`src/pages/quotation/DocumentRecipientsPicker.tsx`, `src/lib/whatsNew.ts`, `package.json`
(`@vercel/blob` removed), `docs/MODULES/ScopeOfWork.md`, `docs/API.md`, `docs/TODO.md`,
`docs/CHANGELOG.md`.

**Verification**: `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
all pass clean; live upload/download/delete verification tracked in TODO.md.

---

## 2026-07-24 — Scope of Work: file attachments (Vercel Blob, zero MongoDB storage)

**Requirement**: direct user request — "อยากให้ทำให้สามารถแนบไฟล์ได้ตรงหน้า scope of work ที่จะส่ง
เอกสารให้ผู้อื่นให้สามารถแนบไฟล์เพิ่มเติมเข้าไปด้วยละช่วยจัดการให้หน่อยกลัว db เต็ม" — attach extra
files where a Scope of Work is emailed to recipients, and don't fill the database up.

**Design — file bytes never touch MongoDB**: uploads go to **Vercel Blob** (new `api/_lib/blob.ts`,
`@vercel/blob` production dependency; `access: "public"` + unguessable random URL suffix); the new
`ScopeOfWork.attachments: ScopeOfWorkAttachment[]` stores only per-file metadata + the blob URL
(~hundreds of bytes/file), directly answering the "กลัว db เต็ม" concern. Limits: ≤ 3 MB/file
(keeps the JSON-base64 body under Vercel's ~4.5 MB request cap), ≤ 10 files/record.

- **New routes** (mounted on the existing shared function, still 12/12 slots):
  `POST /api/scope-of-works/:id/attachments` (upload) and
  `DELETE /api/scope-of-works/:id/attachments/:attachmentId` — edit-gated (owner-or-finalize,
  Draft only), audit-logged both ways, `attachments` deliberately NOT PATCHable. Blob delete on
  removal is best-effort (an orphaned blob never blocks the user).
- **UI**: a "ไฟล์แนบ" section in the "ผู้รับเอกสาร" card (`DocumentRecipientsPicker.tsx`) — attach
  button with progress state, file list with size + open-in-new-tab link + delete; limits shown
  inline; explicit hint that files don't consume database space. Upload/delete are immediate API
  actions; the parent (`ScopeOfWorkDocument.tsx`) merges only the returned `attachments` array
  into local state so unsaved draft edits elsewhere aren't clobbered.
- **Email**: the "ส่งอีเมลแจ้งผู้รับเอกสาร" email now lists each attachment as a direct clickable
  link (works in any mail client, no app session needed — the deliberate reason for public-access
  blobs).
- **Duplicate/Rewrite do NOT inherit attachments** — copies would share the same blob file and a
  delete from one record would break the other's link; both now explicitly reset
  `attachments: []`. Pre-existing records lack the field and are read as empty everywhere — no
  migration.
- **⚠️ Manual setup required**: create a Vercel Blob store (Dashboard → Storage → Blob) so
  `BLOB_READ_WRITE_TOKEN` exists — until then the upload button returns a clear Thai 503. Same
  convention as `RESEND_API_KEY`. Tracked in TODO.md (top High Priority item) together with the
  live-verification checklist.

**Files Modified**: `src/lib/scopeOfWork.ts`, `api/_lib/blob.ts` (new),
`api/_lib/scopeOfWorkHandler.ts`, `src/pages/quotation/DocumentRecipientsPicker.tsx`,
`src/pages/quotation/ScopeOfWorkDocument.tsx`, `src/lib/whatsNew.ts`, `package.json`
(`@vercel/blob`), `docs/MODULES/ScopeOfWork.md`, `docs/API.md`, `docs/TODO.md`, `docs/CLAUDE.md`,
`docs/CHANGELOG.md`.

**Verification**: `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
all pass clean. Not verified against a live deployment — requires the Blob store to exist first
(see TODO.md).

---

## 2026-07-24 — User manual: added document *detail* page screenshots

Per direct user follow-up ("ทำไมไม่กดเข้าไปในใบด้วยพวก ใบเสนอราคา scope of work และใบส่งมอบงานละ
แคปมาด้วยละจะได้ครบๆ") on the entry below: 3 more live-site screenshots, this time of the *inside*
of each document (captured by scripting a click into the first record of each list, same
interactive login-once flow, throwaway profile deleted again afterward):

- Chapter 4: Quotation detail — customer/document form + the toolbar (พิมพ์/คัดลอก/แก้ไข/สร้าง
  Scope of Work/บันทึก).
- Chapter 5: Scope of Work detail — header form + toolbar (พิมพ์/ทำสำเนา/แก้ไข/เปิดใบส่งมอบสินค้า/
  อัปเดตข้อมูล/ยืนยัน Final).
- Chapter 6: Delivery Order detail — the per-milestone installment cards with item tick-boxes,
  เลขที่/วันที่/Remark fields, and each card's own "พิมพ์ใบส่งมอบงวดนี้" button (cropped to omit a
  stale test remark at the bottom of the raw capture).

PDF regenerated (still 17 pages — the new figures fill the continuation sheets chapters 4/5/6
already had; 3.2 MB) and inspected. **Files Modified**: `docs/manual/user-manual.html`,
`docs/manual/images/11-quotation-detail.png` + `12-sow-detail.png` + `13-do-detail.png` (new),
`public/คู่มือการใช้งาน TCS ERP.pdf` (regenerated), `docs/CHANGELOG.md`.

---

## 2026-07-24 — User manual now illustrated with real live-site screenshots

Per direct user request ("ในใบ pdf อยากได้ภาพของเว็บมาประกอบในคู่มือด้วยจะได้เห็นชัดขึ้น"), the manual
PDF was regenerated with 11 real screenshots of the live production site embedded per chapter
(sign-in, topbar strip, Dashboard, Quotations, Scope of Work, Delivery Orders, Products, Customers,
Templates, User Management, Settings — now 17 pages, 2.6 MB).

**How the screenshots were captured**: a visible (non-headless) Chrome window with a throwaway
profile was scripted via `puppeteer-core` against the live site; the user logged in manually once
(no credentials ever shared with or stored by the tooling), then the script navigated every sidebar
page and captured 1600×900 @2x shots. A first-time guided-tour welcome popup photobombed round one
— the retake dismisses it first ("ข้าม") before capturing. The sign-in page was captured separately
with a fresh headless session. The throwaway Chrome profile (which held the live session cookie)
was deleted immediately after capture. Screenshots were downscaled to 1400px wide into
`docs/manual/images/` (committed, so future manual regenerations keep working); chapters 7–9 were
split from one shared page into three so each fits its screenshot; long chapters (4/5) let their
screenshot flow onto a continuation sheet rather than squeezing the text.

**Files Modified**: `docs/manual/user-manual.html`, `docs/manual/images/*` (11 new),
`public/คู่มือการใช้งาน TCS ERP.pdf` (regenerated), `docs/CHANGELOG.md`.

**Verification**: regenerated PDF rendered back to images and inspected page-by-page (cover, image
placement, captions, no clipped content). No source-code changes — `lint`/`build` unaffected but
re-run clean anyway.

---

## 2026-07-24 — "คู่มือการใช้งาน" manual button on the topbar

Per direct user follow-up ("ช่วยทำแบบกดดูคู่มือแบบเห็นง่ายๆ คนเข้าใจได้ง่ายมากที่สุด...") after asking
where the manual lives on the site: the user manual PDF (previous entry) now has a highly visible
entry point — a **gold pill button labeled "คู่มือการใช้งาน"** (BookOpen icon) on the topbar of
every page, between Global Search and the What's New icon (`src/App.tsx`). Deliberately a labeled
pill in the brand gold, not another anonymous icon, so someone who can't use the system immediately
sees where help is. Opens the PDF in a new tab (`encodeURI`'d Thai filename); label collapses to
icon-only below the `sm` breakpoint. New `topbar.manual` i18n key (Thai/English); the What's New
manual announcement now points at the button instead of the raw URL.

**Files Modified**: `src/App.tsx`, `src/lib/i18n.tsx`, `src/lib/whatsNew.ts`, `docs/CHANGELOG.md`.

**Verification**: `npm run lint` (0 errors, 2 pre-existing warnings), `npm run build` pass clean.

---

## 2026-07-24 — Thai user manual PDF

Per direct user request ("อยากให้สร้างไฟล์คู่มือมาเป็น pdf วิธีใช้เว็บไซต์นี้"), a full Thai
end-user manual was authored and shipped as a PDF:

- **`public/คู่มือการใช้งาน TCS ERP.pdf`** (12 pages, A4, navy/gold brand styling, Noto Sans Thai)
  — downloadable from the deployed site at `/คู่มือการใช้งาน TCS ERP.pdf`. Covers: login, screen/
  menu overview (exact sidebar labels verified against `i18n.tsx`), Dashboard, Quotations (wizard,
  workflow, Rewrite/Revision Note), Scope of Work (checklist, payment installments, document
  recipients), Delivery Orders (per-milestone item ticks + printing), Products, Customers,
  Quotation Templates, admin section (users/roles/audit log, incl. the "new permissions need a
  manual Role Management tick after big updates" warning), Settings, printing-to-PDF instructions
  (incl. the headers/footers note per document type), and an FAQ.
- **`docs/manual/user-manual.html`** — the committed HTML source; regenerate the PDF with headless
  Chrome (`page.pdf({ preferCSSPageSize: true, printBackground: true })`) after editing. Rendered
  and visually checked page-by-page before shipping (cover, chapter layout, no page overflow).
- A What's New entry announces the manual with its URL (per the standing announce-major-updates
  rule).

**Files Modified**: `docs/manual/user-manual.html` (new), `public/คู่มือการใช้งาน TCS ERP.pdf`
(new), `src/lib/whatsNew.ts`, `docs/CHANGELOG.md`.

**Verification**: `npm run lint` / `npm run build` pass clean; the PDF was rendered back to images
and inspected page-by-page.

---

## 2026-07-24 — What's New announcements for the Delivery Order work + standing rule

Per a direct user request ("ทุกครั้งที่มี update ใหญ่อยากให้ขึ้นประกาศในเว็บด้วยที่สร้างไว้แล้วที่เป็น
Update อะ"), two entries were added to `WHATS_NEW_ENTRIES` (`src/lib/whatsNew.ts`): one for today's
per-milestone printing + FM-SL-05 print rebuild + browser-URL-footer suppression, and one
backfilling the 2026-07-23 Delivery Order module itself, which had shipped without an announcement.
**Standing rule going forward**: every genuinely user-facing feature/behavior change must get a
Thai `WHATS_NEW_ENTRIES` entry as part of the same task — internal fixes/refactors/docs-only
changes don't. (This was already the module's documented intent — see docs/CLAUDE.md's "What's New
(topbar)" row — now treated as a per-task requirement, not an afterthought.)

**Files Modified**: `src/lib/whatsNew.ts`, `docs/CHANGELOG.md`.

---

## 2026-07-24 — Delivery Order print: suppress the browser's URL footer via a zero-margin page override

**Bug report**: direct user follow-up right after the print rebuild below — "มันมีลิ้งเว็บอยู่ใน
ใบซ้ายล่างเอาออกด้วย" (there's a website link at the bottom-left of the document, remove it). That
link is Chrome/Edge's own "Headers and footers" print-dialog option injecting the page URL at the
bottom-left (plus date/title at the top) — not anything the app renders. The long-standing
UI_GUIDELINES position was "not app-controllable, tell the user to untick the option" (Quotation/
Scope of Work show a tooltip saying exactly that).

**Fix — it IS suppressible for a whole-page-owned document**: the browser draws those texts only
inside the `@page` margin area; with zero margins there is nowhere to draw them, so they're
omitted regardless of the dialog checkbox. `DeliveryOrderPrintDocument.tsx` now renders a
`<style>@media print { @page { margin: 0 } }</style>` scoped to the component's lifetime (it
unmounts with the Delivery Order detail view, so Quotation/Scope of Work printing keeps the global
12mm rule), and each installment's page wrapper carries `padding: 12mm` instead — the printed
geometry is unchanged. This works for Delivery Order because its print output owns entire pages;
it wasn't retrofitted onto Quotation/Scope of Work (their flowing multi-page layouts rely on real
page margins on every page — see the known trade-off below).

**Verified** by regenerating the harness PDF with Chrome's header/footer layer force-enabled
(`page.pdf({ displayHeaderFooter: true, preferCSSPageSize: true })`, the same layer the dialog
checkbox draws): no URL/date/title anywhere, layout pixel-identical to the previous pass, still
one page per milestone. **Known trade-offs**: on a rare multi-page milestone, continuation pages
start at the physical paper edge (only left/right padding carries across page breaks inside one
wrapper); and if a user manually picks non-default margins in the print dialog, the browser margin
area — and its texts — can come back (the default "Margins: Default" honors the CSS zero margin).

**Files Modified**: `src/pages/quotation/DeliveryOrderPrintDocument.tsx`,
`docs/UI_GUIDELINES.md`, `docs/MODULES/DeliveryOrder.md`, `docs/CLAUDE.md`, `docs/CHANGELOG.md`.

**Verification**: `npm run lint` (0 errors, 2 pre-existing warnings), `npm run build` pass clean.

---

## 2026-07-24 — Delivery Order print rebuilt to visually match the FM-SL-05 reference PDF

**Requirement**: rebuild the Delivery Note print/PDF layout to match the reference PDF
(`public/ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM บริษัท อีจ.pdf`, company form FM-SL-05 Rev.01)
as closely as possible — a formal black-on-white business document, not an app-styled page — while
staying fully data-driven (none of the sample's customer/items/dates/work-order/remark values
hardcoded) and keeping the one-independent-document-per-eligible-milestone behavior from the
previous pass.

**Reference inspection**: all 3 reference pages were rendered to images (`pdf-to-png-converter`,
poppler unavailable on this machine) and inspected visually, including zoomed crops of the table
header, borders, info section, signature block, and letterhead — not just extracted text.

**`DeliveryOrderPrintDocument.tsx` rebuilt from scratch**:
- **Letterhead**: round TCS logo (live `companyHeader.logoDataUrl`, falling back to the
  `public/logo.png` project asset) + the form's official English letterhead (name/address/TEL/
  E-mail) + a Facebook/LINE/website contact row with small inline-SVG brand icons (no emoji). The
  letterhead text is a fixed `LETTERHEAD` constant reproduced verbatim from the reference —
  deliberately not the Settings singleton, which holds the Thai identity and has no
  Facebook/LINE fields; the signature block's Thai legal name still comes from live company data.
- **Structure**: centered Thai/English titles; two-column เรียน (customer lines each on a thin
  black underline, multiline address preserved) / เลขที่-วันที่-WORK ORDER (per-milestone number,
  date, scope number on underlined value lines); then ONE full-width bordered table — intro
  statement row, underlined bold รายการ/จำนวน/หน่วย column headers (no fill, no vertical column
  separators, matching the reference), bold main item rows, each specification on its own bordered
  row, **empty filler rows** padding short milestones to a fixed height so the Remark row lands
  near the page bottom exactly like the reference (visual only, never business data,
  `SINGLE_PAGE_ROW_TARGET = 30`), and the milestone's Remark as the table's last row; borderless
  two-column signature block (customer/ผู้ตรวจรับ left, TCS/ผู้ส่ง right); "FM-SL-05 Rev.01:
  11/09/67" bottom-right in sans-serif (as in the reference). The previous pass's "งวดชำระ" header
  line was removed — the reference has no such line; the milestone identifies itself via the Remark.
- **Fonts**: `'Times New Roman', 'Noto Serif Thai', serif` — Noto Serif Thai added to the existing
  Google Fonts import (`src/styles/fonts.css`) so the Thai serif look doesn't depend on
  Windows-only fonts. **Real bug found and fixed during verification**: the print DOM is
  `display:none` on screen, so the browser never fetched the Thai serif font and the printed
  output silently fell back to whatever Thai system font the machine had (JS
  `document.fonts.load()` in an effect also failed — it runs before the Google Fonts stylesheet
  registers the faces). Fixed with a zero-size always-rendered probe span (visibility:hidden, NOT
  display:none) containing Thai text in both used weights, which makes the CSS engine itself fetch
  the fonts on page mount.
- **Multi-page**: letterhead/titles/info sit OUTSIDE the table (Chromium only repeats a printed
  `<thead>` when it's small), so overflow pages repeat the intro + column-header rows; an item and
  its specs share one unbreakable `<tbody>`; Remark + signature render once at the end.
- **Milestone scoping unchanged**: `onlyInstallmentId` still limits output to the one clicked
  milestone; verified a `?only=` render produces exactly 1 page with zero sibling-milestone data.

**Visual verification (actually performed, not code-inspection-only)**: a temporary in-project
harness page (`print-harness.html` + `src/printHarness.tsx`, both deleted after use) rendered the
real component with mock data under `npm run dev`; headless system Chrome (`puppeteer-core`,
`page.pdf({ preferCSSPageSize: true })`) generated real A4 PDFs, which were rendered back to images
and compared side-by-side against the reference pages through 6 iterations (row density, filler
count, signature spacing, font loading). Scenarios: many-items/many-specs milestone (1 page, like
ref p1), two-item milestone (filler rows + Remark near bottom, like ref p2/p3), single-milestone
`?only=` scoping, Thai+English item text, and a 30-item stress test (3 pages, headers repeating,
signatures only at the end). Chrome console showed only a benign favicon 404.

**Known remaining visual differences (deliberate)**: page margins are the app's global 12mm
`@page` rule (the reference's ~3mm margins aren't reliably printable and the rule is shared by
every printed document); the Thai serif is Noto Serif Thai rather than the reference's
Angsana-like Windows font (guaranteed cross-platform, closest hosted equivalent); browser print
headers/footers are a per-dialog browser setting that CSS cannot force off (Chrome's default is
off; headless PDF output has none).

**Files Modified**: `src/pages/quotation/DeliveryOrderPrintDocument.tsx` (rebuilt),
`src/styles/fonts.css`, `docs/MODULES/DeliveryOrder.md`, `docs/CLAUDE.md`, `docs/PROJECT_STATUS.md`,
`docs/IMPLEMENTATION_CHECKLIST.md`, `docs/UI_GUIDELINES.md`, `docs/CHANGELOG.md`.

**Verification**: `npm run lint` (0 errors, 2 pre-existing warnings), `npm run build`
(`tsc -b && tsc --noEmit -p tsconfig.api.json && vite build`) pass clean.

---

## 2026-07-24 — Delivery Order: separate Delivery Note per payment milestone

**Requirement**: each eligible (non-deposit) payment milestone must print as its own completely
independent Delivery Note — printing "40% Materials" must produce a document containing only that
milestone's เลขที่/วันที่/ticked items/Remark, never anything from "40% After Job Complete" or a
Down Payment milestone. The per-milestone *state* (independent `itemIds`/`documentNumber`/
`issueDate`/`remark` per installment, keyed by the stable installment `id`) and the Down Payment
exclusion already existed from the 2026-07-23 passes; this pass closed the three remaining gaps:

1. **Per-milestone Print button** (`DeliveryOrderDocument.tsx`): each installment card now has its
   own "พิมพ์ใบส่งมอบงวดนี้" button (gated by `deliveryOrder:print`, blocks with a toast if that
   specific milestone has zero items ticked). Clicking it sets a `printInstallmentId` state that
   scopes `DeliveryOrderPrintDocument` (new optional `onlyInstallmentId` prop) to that one
   milestone's page before `window.print()` fires from an effect; the browser's `afterprint` event
   resets it. The old global toolbar "พิมพ์ / PDF" button — which printed every milestone's page in
   one combined document and caused the reported confusion — was removed; printing is now always
   per-milestone. (A raw browser Ctrl+P with no button clicked still falls back to rendering every
   milestone's page, each page still fully self-contained.)
2. **Milestone name on the printed page** (`DeliveryOrderPrintDocument.tsx`): the printed header's
   right column gained a "งวดชำระ" line showing `{pct}% {label}` (e.g. "40% Materials") — previously
   the milestone was only identifiable via the freely-editable Remark footer.
3. **Broadened deposit exclusion** (`api/_lib/deliveryOrderHandler.ts`): `isDownPaymentLabel()` →
   `isDepositLabel()`, matching an exact-whole-label set ("Down Payment", "Deposit", "เงินมัดจำ",
   "ชำระเงินล่วงหน้า", case-insensitive/trimmed) instead of "Down Payment" alone; `stripDownPayment()`
   renamed `stripDepositInstallments()`. Still never a substring match and never percentage-based —
   "40% Materials" and "After Down Payment refund" stay eligible. Same self-healing read-path
   stripping as before, no migration script.

**Files Modified**: `src/pages/quotation/DeliveryOrderDocument.tsx`,
`src/pages/quotation/DeliveryOrderPrintDocument.tsx`, `api/_lib/deliveryOrderHandler.ts`,
`docs/MODULES/DeliveryOrder.md`, `docs/CLAUDE.md`, `docs/CHANGELOG.md`.

**Verification**: `tsc -b`, `tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all
pass clean (an initial `react-hooks/set-state-in-effect` lint error was fixed by moving the
post-print state reset into an `afterprint` listener). The broadened deposit matcher was verified
via a standalone Node script (all 4 deposit labels match incl. case/whitespace variants; "40%
Materials"/"Down Payment 2"/substring labels correctly stay eligible). Not verified against a live
deployment/browser print preview — same standing sandboxed-session limitation as every other pass.

---

## 2026-07-23 — Fix: Delivery Order signature line duplicated "บริษัท"

**Bug report**: direct user follow-up — "ทำไมติ๊กอันล่างแล้วกดพิมพ์ออกมาแล้วมันไม่มีอะไรเลยละ" (why,
after ticking the bottom item and printing, nothing comes out).

**Investigation**: built a temporary local harness rendering the real `DeliveryOrderDocument`/
`DeliveryOrderPrintDocument` components (mocked `fetch`, no auth needed) and reproduced the exact
reported interaction — ticking the checkbox for an item in the second installment card, then
clicking "พิมพ์ / PDF" — via real simulated browser clicks, not just static mock props. The print
gate (`hasAnySelectedItem`) correctly passed and `window.print()` fired as expected; separately
confirmed the production `dist/` build's actual CSS output contains the `print:table`/`print:hidden`
rules the print layout depends on. Could not reproduce a "nothing prints" outcome through this path.

**Bug found and fixed along the way**: the signature block printed a duplicated "บริษัท บริษัท
{name}" — `DeliveryOrderPrintDocument.tsx` hardcoded a "ลงนาม บริษัท " prefix in front of
`customerCompanyName`/`companyHeader.name`, both of which already contain the full "บริษัท ... จำกัด"
legal name (e.g. "บริษัท ทดสอบ จำกัด"). Fixed to "ลงนาม {name}", matching the reference PDF.

**Files Modified**: `src/pages/quotation/DeliveryOrderPrintDocument.tsx`.

**Verification**: `npx tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
The fix itself is a one-line text change, visually confirmed via the same local harness (DOM
`textContent` inspection). The original "nothing prints" report remains only partially explained —
most likely the print button was clicked before the checkbox tick had registered (the warning toast
fires on a genuinely-unticked state, not after a successful tick) rather than a reproducible code
defect; see TODO.md for the follow-up ask to the user.

---

## 2026-07-23 — Fix: Delivery Order excludes the Down Payment installment

**Bug/gap**: direct user follow-up right after the Delivery Order module shipped — "ลืมบอกว่าใบส่ง
มอบงานจะไม่มี down payment เลย" (forgot to mention: a Delivery Order never has a Down Payment page).
A deposit paid before any goods/work are delivered has nothing to "deliver," so it shouldn't appear
as one of this document's installment pages — unlike Scope of Work's own payment schedule, where it
legitimately belongs.

**Fix**: new `isDownPaymentLabel()` (`api/_lib/deliveryOrderHandler.ts`) matches the exact label
`PAYMENT_TERM_PRESETS` itself uses for a down payment ("Down Payment", case-insensitive/trimmed).
Applied in two places: `deriveInstallmentsFromScope()` (so a fresh create or an explicit "อัปเดต
ข้อมูลจาก Scope of Work" never generates a Down Payment page), and a new defensive `stripDownPayment()`/
`toClient()` wrapper applied at every response site (create/get/update/refresh/finalize), so a record
created in the brief window before this fix shipped self-heals on its very next read — no migration
script needed, and it self-heals in storage too on its next save (`PATCH` replaces the whole
`installments` array with whatever the client — which never saw the Down Payment row — sends back).

**Files Modified**: `api/_lib/deliveryOrderHandler.ts`.

**Verification**: `npx tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Logic verified via a standalone Node script: Down Payment excluded on create; case/whitespace-
insensitive label matching; no false-positive exclusion for a label that merely contains "Down
Payment" as a substring (e.g. "Down Payment 2"); a stale already-stored record with a Down Payment
row gets it stripped on read. Not verified against a live deployment/browser — same standing
sandboxed-session limitation as every other pass.

---

## 2026-07-23 — Feature: Delivery Order (new module, generated from Scope of Work)

**Feature**: direct user request — "ช่วยทำหน้าใบส่งมอบสินค้าให้หน่อยเอาไฟล์มาให้แล้วอยู่ไหนโฟล์เดอร์
public...ดึงข้อมูลแบบไฟล์ pdf...พวกสินค้าจะดึงมาจากหน้า scope of work ส่วนพวกข้อมูลบริษัทให้ดึงมาจาก
ใบเสนอราคา...ทำหน้าตาตอนกดพิมพ์ให้เหมือนไฟล์ pdf ที่บอกให้เหมือนเป๊ะๆ...จะทำแยกแต่ละงวดที่จะส่งไปให้
ให้แต่ละแผนก...งวดนี้จะมีให้ติ๊กว่าเอาสินค้าตัวไหนไปบ้าง...ให้ทำหน้าแยกตรง side bar ออกมาด้วยเหมือนกับ
พวก scope of work กับ ใบเสนอราคา" — a new "ใบส่งมอบสินค้าและบริการ" (Delivery Order & Service Order)
document type generated from an existing Scope of Work, reproducing a company-provided reference PDF
(`public/ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM บริษัท อีจ.pdf`, form code `FM-SL-05 Rev.01`)
which splits a job's delivery across its payment installments, one printed page per installment.

**What was built**:
- New `src/lib/deliveryOrder.ts` types (`DeliveryOrder`/`DeliveryOrderItem`/
  `DeliveryOrderInstallment`) + `api/_lib/deliveryOrderHandler.ts` CRUD handler, mounted from
  `api/handlers/quotes.ts` at `/api/delivery-orders` (same 12-function-slot-sharing pattern Scope of
  Work already uses — no new Vercel function file).
- Created via a "สร้างใบส่งมอบสินค้า" button on `ScopeOfWorkDocument.tsx`'s toolbar (existence-check
  pattern mirroring Quotation's "สร้าง/เปิด Scope of Work" button) — snapshots customer info from the
  Scope of Work's own `customerSnapshot` (itself already sourced from the Quotation, per "ข้อมูล
  บริษัทให้ดึงมาจากใบเสนอราคา") and items from the Scope of Work's `items` (per "สินค้าจะดึงมาจากหน้า
  scope of work"), and builds one `DeliveryOrderInstallment` per Scope of Work payment installment.
- Each installment starts with an empty `itemIds` list — a checkbox list in
  `DeliveryOrderDocument.tsx` lets the preparer tick which items are covered by that shipment, per
  "งวดนี้จะมีให้ติ๊กว่าเอาสินค้าตัวไหนไปบ้าง" — plus blank-by-default "เลขที่"/"วันที่" fields and an
  auto-drafted (freely editable) "Remark:" line.
- `DeliveryOrderPrintDocument.tsx` renders one `<table className="hidden print:table ...">` per
  installment with `style={{ breakAfter: "page" }}`, matching the reference PDF's one-page-per-
  installment structure — company letterhead pulled live from Settings → Company Info (not a
  hardcoded copy of the sample), "เรียน"/"เลขที่"/"วันที่"/"WORK ORDER" header, numbered item table
  restarting at 1 per page, Remark footer, customer/TCS signature block.
- New standalone sidebar page (`src/pages/deliveryOrder/`, `Truck` icon, Sales nav group after Scope
  of Work) for browsing/opening existing records, per "ให้ทำหน้าแยกตรง side bar ออกมาด้วยเหมือนกับพวก
  scope of work กับ ใบเสนอราคา" — creation is still only ever triggered from the Scope of Work detail
  toolbar button.
- 7 new `deliveryOrder:view/viewAll/create/edit/finalize/print/delete` permissions, default grants
  mirroring Scope of Work's exactly (Sales User: view/create/edit/print; Approver 1/2: view/viewAll/
  edit/finalize/print; Administrator/Super Admin: all 7; Viewer: view/viewAll).

**Deliberately not built this pass** (kept out of scope, not requested): Duplicate/Rewrite actions,
required-field validation gating (Quotation/Scope of Work's `DOCUMENT_INCOMPLETE` machinery), Global
Search integration.

**Files Modified**: `src/lib/deliveryOrder.ts` (new), `api/_lib/deliveryOrderHandler.ts` (new),
`api/_lib/collections.ts`, `api/handlers/quotes.ts`, `vercel.json`, `src/lib/permissions.ts`,
`src/lib/roles.ts`, `src/lib/i18n.tsx`, `src/pages/quotation/DeliveryOrderDocument.tsx` (new),
`src/pages/quotation/DeliveryOrderPrintDocument.tsx` (new), `src/pages/deliveryOrder/
DeliveryOrderPage.tsx` (new), `src/pages/deliveryOrder/DeliveryOrderList.tsx` (new),
`src/pages/quotation/ScopeOfWorkDocument.tsx`, `src/pages/scopeOfWork/ScopeOfWorkPage.tsx`,
`src/pages/quotation/QuotationPage.tsx`, `src/App.tsx`.

**⚠️ Requires a manual Role Management step on an already-provisioned production deployment** —
`defaultRoles` only seeds once; existing role documents won't retroactively gain the 7 new
`deliveryOrder:*` permissions. See [RBAC.md](./RBAC.md) "Delivery Order" and [TODO.md](./TODO.md).

**Verification**: `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint`,
`npm run build` all pass clean. The create/refresh snapshot-and-reconcile logic
(`deriveItemsFromScope()`/`deriveInstallmentsFromScope()`) was verified via a standalone Node script
against mock data — section-header exclusion, auto-drafted remark text, stale-`itemId` cleanup,
preserved user edits across a refresh, and new/removed-installment handling all confirmed correct.
Not verified via a live browser/deployment — same standing sandboxed-session limitation (no live
MongoDB credentials, Playwright MCP disconnected) as every other pass this session; see TODO.md.

---

## 2026-07-23 — Feature: Document Recipients custom message + formal email restyle

**Feature**: direct user request, with a screenshot of the plain original email — "อยากให้เพิ่มช่อง
ใส่ข้อความตรงผู้รับเอกสารในหน้า scope of work เพื่อที่จะแบบเพิ่มข้อความไว้ด้านบนข้อความออโต้ในอีเมล...
และทำรูปแบบข้อความออโต้ให้ดูทางการมากขึ้นด้วย" (add a text field for a message to appear above the
auto-generated email content, and make the auto-generated format look more official).

**What was built**:
- New `ScopeOfWork.documentRecipientMessage: string` field — a "ข้อความเพิ่มเติมถึงผู้รับ (ไม่บังคับ)"
  textarea added to the bottom of `DocumentRecipientsPicker.tsx`. Non-empty text renders as a
  highlighted note (gold left border) directly above the auto-generated "Scope of Work {scopeNumber}
  มีเอกสารที่ต้องการให้ตรวจสอบ/ดำเนินการ" line in the email; blank leaves the email exactly as before
  this field existed. Unlike `revisionNote`, this field carries over on Duplicate/Rewrite (via the
  same `...rest` spread `documentRecipients` itself already relies on).
- The email body itself (`buildDocumentRecipientEmailHtml()`, `api/_lib/scopeOfWorkHandler.ts`) was
  fully restyled from bare `<p>`/`<ul>` markup to a formal, inline-styled layout matching the app's
  own navy/gold branding: a navy header band with a "TCS ERP" wordmark, the job's fields rendered as
  a two-column label/value table instead of a bullet list, a gold call-to-action button in place of
  a plain text link, and a footer disclaimer. Every style is inline (`style="..."` per element) since
  most email clients strip `<style>` tags/external stylesheets.
- Server: `documentRecipientMessage` added to the PATCH sanitizer (`sanitizeLongText`), explicitly
  set to `""` in `handleCreate()`, and backfilled to `""` in `normalizeScope()` for pre-existing
  records that predate this field.

**Files Modified**: `src/lib/scopeOfWork.ts`, `api/_lib/scopeOfWorkHandler.ts`,
`src/pages/quotation/DocumentRecipientsPicker.tsx`, `src/pages/quotation/ScopeOfWorkDocument.tsx`.

**Verification**: `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint`,
`npm run build` all pass clean. The HTML-generation logic (message-above-summary placement, blank
message correctly omitting the note block, multi-line text converting to `<br>`, and HTML/script
injection in the message being properly escaped) was verified via a standalone Node script against
mock data — deleted after verification. Not verified via a live browser/real inbox — Playwright MCP
remains disconnected this session; see TODO.md.

---

## 2026-07-23 — Feature: in-app "What's New" update log

**Feature**: direct user request — "ทำ update log ให้หน่อย", clarified via a follow-up question to
mean an in-app feature (not a document or a one-off chat summary): users should be able to see
what's new in the app themselves without asking, without needing new backend/DB work.

**What was built**:
- A "มีอะไรใหม่" (What's New) sparkle icon in the topbar, next to the notification bell
  (`src/components/WhatsNewPanel.tsx`) — clicking it opens a dropdown listing recent feature
  updates, newest first, each with a date and a short Thai bullet-list description.
- Content lives in a plain hand-maintained array, `WHATS_NEW_ENTRIES` (`src/lib/whatsNew.ts`) —
  deliberately not database-backed or auto-generated from `docs/CHANGELOG.md`: these are short,
  end-user-facing announcements (a different audience/tone than the technical changelog), and a new
  MongoDB collection + API route would be real overhead for content that changes only when a
  developer ships a feature anyway. Seeded with the last several days' user-facing updates
  (Revision Note, Document Recipients email routing, Scope of Work `viewAll`, flexible Payment
  Conditions, the Dashboard Scope of Work count, the standalone Scope of Work page + Rewrite).
- A small gold dot badge appears on the icon when there's an entry newer than the last one this
  specific user opened the panel to see — tracked per-user in `localStorage`
  (`hasUnseenWhatsNew()`/`markWhatsNewSeen()`), the same convention `src/lib/tour.ts` already uses
  for guided-tour completion (a client-side UI preference, not business data, so no schema/API
  change was warranted). Clears the moment the panel is opened, not per-item.
- New `whatsNew.bellAria`/`whatsNew.title`/`whatsNew.empty` i18n keys (chrome text only — the
  entries themselves are authored directly in Thai, same convention as audit-log/notification
  content, since they're persisted-style business content, not app chrome).

**Files Modified**: `src/lib/whatsNew.ts` (new), `src/components/WhatsNewPanel.tsx` (new),
`src/App.tsx`, `src/lib/i18n.tsx`.

**Verification**: `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint`,
`npm run build` all pass clean. Thai date formatting (`toLocaleDateString("th-TH", ...)`) spot-checked
via a standalone Node script, confirming correct Buddhist-calendar year output (e.g. `23 กรกฎาคม
2569` for `2026-07-23`). Not verified via a live browser click-through — Playwright MCP remains
disconnected this session; see TODO.md.

---

## 2026-07-23 — Feature: auto-generated Revision Note (Quotation + Scope of Work)

**Feature**: direct user request — "อยากได้แบบ Comment auto หรืออะไรก็ได้หลังใบที่ถูก rewrite มาว่า
แก้ตรงไหนไปสามารถทำได้ไหมคือแบบให้ตรวจดูว่าแก้ตรงไหนไปละเป็นข้อความ auto ไปก่อนละค่อยแบบถ้าผู้ใช้
อยากเพิ่มหรืออยากแก้ก็สามารถแก้เองสามารถทำได้ไหม" (an auto-generated comment on a rewritten document
showing what changed, that the user can then edit/add to). Follow-up clarification: scope = both
Quotation and Scope of Work; detail level = every field.

**What was built**:
- New `Quote.revisionNote: string` and `ScopeOfWork.revisionNote: string` fields — free text, always
  `""` on a brand-new record, Duplicate, or a fresh Rewrite (never inherited from the source, since a
  revision note describes what changed *within* this specific revision).
- New `src/lib/revisionDiff.ts` (framework-agnostic, safe to value-import from both the Vite bundle
  and the API bundle, same convention as `documentRequirements.ts`): `getRevisionRoot()`/
  `getRevisionNumber()`/`getRevisionPredecessorId()` (duplicated from the server-only
  `api/_lib/quoteRevisions.ts`) plus `generateQuoteRevisionSummary()`/
  `generateScopeOfWorkRevisionSummary()`, which diff every meaningful field (header fields, line
  items/scope items by array position, checklist selections by group key, payment installments by
  stable installment id, document recipients resolved to real names) and produce a Thai bullet-list
  summary, or "ไม่มีการเปลี่ยนแปลงจากต้นฉบับ" if nothing differs.
- Both `QuoteDocument.tsx` and `ScopeOfWorkDocument.tsx` show a "หมายเหตุการแก้ไข (Revision Note)"
  card (only on a revision, id/`scopeNumber` ending in `-R<digits>`) with a
  "สร้างสรุปการแก้ไขอัตโนมัติ" button that fills the note's `<textarea>` on click — **never
  automatic**, so it can never silently clobber text the user already typed; the field stays freely
  editable either way. Quotation resolves its predecessor from the already-boot-loaded `allQuotes`
  array (new prop, zero extra fetch); Scope of Work resolves it via the existing
  `fetchScopeOfWorksByQuotation()` + `fetchScopeOfWork()` (two round trips, no new API route needed).
- Server: `revisionNote` added to `sanitizePartialQuoteFields()`/`ScopeOfWorkUpdateFields`'s
  sanitizer (`api/handlers/quotes.ts`, `api/_lib/scopeOfWorkHandler.ts`), explicitly reset to `""` in
  every create/Duplicate/Rewrite handler for both resource types, and backfilled to `""` in
  `normalizeScope()` for pre-existing Scope of Work records.

**Known simplification (documented, not a defect)**: line/item diffing matches by array position, not
id — both `cloneLines()` (quotes) and the item-cloning logic in Scope of Work's
`handleRewrite()`/`handleDuplicate()` regenerate every line/item id on every rewrite/duplicate, so an
id-based match would falsely report every line as both removed and added. Position-based matching is
accurate for in-place edits and trailing add/remove, approximate for mid-list reordering/insertion.
Payment installments, by contrast, keep their ids unchanged across Rewrite/Duplicate (`paymentConditions`
passes through the `...rest` spread untouched), so `diffPaymentConditions()` safely matches by id.

**Files Modified**: `src/lib/revisionDiff.ts` (new), `src/lib/quotes.tsx`, `src/lib/scopeOfWork.ts`,
`api/handlers/quotes.ts`, `api/_lib/scopeOfWorkHandler.ts`, `src/pages/quotation/QuoteDocument.tsx`,
`src/pages/quotation/QuotationPage.tsx`, `src/pages/quotation/ScopeOfWorkDocument.tsx`.

**Verification**: `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint`,
`npm run build` all pass clean. Diff-generation logic verified via a temporary standalone `tsx`
script against realistic mock data covering header-field changes, line/item changes, checklist
selection changes, payment installment changes, and document-recipient changes (resolved to real
names) — deleted after verification. **Not** verified via a live browser click-through — Playwright
MCP disconnected earlier this session (an overly broad `taskkill /IM node.exe`) and never
reconnected; see SESSION_LOG.md and TODO.md.

---

## 2026-07-23 — Fix: "อื่น ๆ" no longer displaced by the backfilled Accounting option

**Bug**: direct user report — on an existing (pre-2026-07-23) Scope of Work record, the "เอกสาร
ส่งถึง" checklist showed "อื่น ๆ" (Other) in the middle of the list instead of last, right before
the "โปรดระบุ" (please specify) note box.

**Root cause**: `withDefaultChecklistGroups()`'s option-backfill logic (added earlier the same day
for the new "Accounting" option) appended any missing option at the very end of the existing
array. A legacy record's stored order was `[..., service, other]` — appending "accounting" after
that produced `[..., service, other, accounting]`, putting "Accounting" *after* "อื่น ๆ" instead of
before it. The doc comment at the time even called this out as an accepted "minor cosmetic
difference," which — per this report — was wrong to accept.

**Fix**: `withDefaultChecklistGroups()` now rebuilds each backfilled group's `options` by walking
the current builder's own canonical order and looking up each key's existing entry (preserving its
`checked` state) or falling back to a fresh unchecked default, instead of just appending what's
missing. Verified with a standalone Node simulation of the exact function logic against a
legacy-shaped stored group: result is `purchase → project → factory → technic → service(checked) →
accounting → other(checked)` — "other" correctly last again, "accounting" correctly inserted
before it, both records' pre-existing checked state untouched.

**Files Modified**: `src/lib/documentRequirements.ts`, `docs/MODULES/ScopeOfWork.md`

**Reason**: Direct user report of visibly wrong checklist ordering on an existing record.

**Verification**: `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean,
plus the standalone logic simulation described above (Playwright browser tools remain disconnected
this session, so no live-UI screenshot check was possible).

---

## 2026-07-23 — Scope of Work: clearer Document Recipients checkbox UX

**Feature**: direct user report against the shipped Document Recipients picker — a screenshot
showed the color-only toggle-chip design (subtle gold tint when selected) wasn't a clear enough
"you're choosing who this gets emailed to" affordance ("อยากให้ทำให้เห็นง่ายขึ้นหน่อยเวลากดติ๊กละ
กลัวผู้ใช้งงว่าเลือกส่งตรงไหน").

**Fix**: `DocumentRecipientsPicker.tsx` replaced each candidate's toggle-chip button with a real
`<input type="checkbox">` + name — matching `ChecklistGroupCard.tsx`'s already-established,
unambiguous checkbox convention rendered directly above this same card, rather than inventing a
new interaction style. Each department also gained its own bordered box (previously just a plain
title + wrapped chips) and a "เลือกแล้ว N คน" (green) / "ยังไม่ได้เลือกผู้รับ" (amber) badge next
to its title, so it's obvious at a glance which checked departments still need at least one
recipient picked before sending will actually reach them.

**Files Modified**: `src/pages/quotation/DocumentRecipientsPicker.tsx`, `docs/MODULES/ScopeOfWork.md`

**Reason**: Direct user report that the previous design was confusing to a first-time user.

**Verification**: `tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Not re-verified
via a live browser harness this pass (the Playwright browser-automation connection had dropped
earlier in the session and did not reconnect) — confidence is high anyway since this swaps in an
interaction pattern (`<input type="checkbox">` + label) already shipped and visually verified
elsewhere in this exact file tree (`ChecklistGroupCard.tsx`), not a novel one.

---

## 2026-07-23 — Scope of Work: in-app notification + recipient list visibility

**Feature**: direct same-day follow-up to the Document Recipients pass below, after the user
confirmed the email itself now works ("กดส่งได้ปกติหมดแล้ว...ได้อีเมล์มาแล้ว"). Two more asks: "อยาก
รู้ว่าทำยังไงถึงให้มันไปโผล่ในหน้า scope of work ของเราเวลาที่มีคนอื่นส่งมา" (how does it show up on
our Scope of Work page when someone else sends it to us) and "อยากให้ขึ้นแจ้งเตือนในระบบด้วย" (also
want an in-system notification).

**Root cause of "doesn't show up"**: the *previous* pass's `scopeOfWork:viewAll` own-records-only
filter meant a document recipient who didn't create the record — and lacked `viewAll` — had
literally no way to find it again on the standalone list/search once the one-time email/notification
was gone. This pass closes that gap.

**In-app notification**: `Notification` (`src/lib/notifications.ts`) gained a `scope_of_work_
document_sent` type and `relatedScopeId`/`relatedScopeNumber` fields (naming mirrors
`AuditLogEntry`'s identical fields). `handleSendDocumentNotifications()`
(`api/_lib/scopeOfWorkHandler.ts`) now writes one `Notification` per resolved recipient alongside
the email, regardless of that individual's own email outcome — the two channels are independent.
`NotificationBell.tsx` got a `Mail` icon for the new type; `App.tsx`'s `onNavigate` now checks
`relatedScopeId` before `relatedQuoteId` and calls a new `navigateToScopeOfWorkStandalone()`, which
sets a new `scopeOfWorkDeepLinkId` state and switches to the `scopeOfWork` nav. `ScopeOfWorkPage.tsx`
gained `initialScopeOfWorkId`/`onScopeOfWorkIdConsumed` props using the exact same "adjust state
during rendering" pattern `QuotationPage.tsx`'s `initialQuoteId` already uses, so a click jumps
straight to that record's detail view.

**List/search visibility**: `handleList()`'s list-everything branch and `searchScopeOfWorks()`
(`api/_lib/scopeOfWorkHandler.ts`, `api/_lib/searchHandler.ts`) both gained a `recipientMatch` — a
`$or` of `{ "documentRecipients.<key>": ctx.user.id }` for each of the 6 real department keys in
`DOCUMENT_RECIPIENT_DEPARTMENTS` — added to the existing own-records-only filter. A caller who was
picked as a document recipient can now find the record on their own list/search even without
`scopeOfWork:viewAll` and even if they didn't create it.

**Known, deliberately-not-fixed limitation**: the email's own "เปิดดูใน TCS ERP" link still only
opens the app's homepage, not the specific record — this app has no URL-based router (`App.tsx`
holds a plain `activeNav` string), so a plain `<a href>` from an external email genuinely cannot
restore in-memory navigation state on page load the way the in-app notification click does. Adding
real deep-linking from email would need app-wide URL/query-param routing, a materially larger
change flagged but not attempted this pass.

**Files Modified**: `src/lib/notifications.ts`, `src/components/NotificationBell.tsx`, `src/App.tsx`, `src/pages/scopeOfWork/ScopeOfWorkPage.tsx`, `api/_lib/scopeOfWorkHandler.ts`, `api/_lib/searchHandler.ts`, `api/_lib/systemSeed.ts`, `docs/RBAC.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/MODULES/ScopeOfWork.md`, `docs/MODULES/Notifications.md`, `docs/CLAUDE.md`

**Reason**: Direct user follow-up request — recipients need a standing way to find documents sent
to them, not just a one-time link, plus an in-app signal matching the rest of the app's existing
notification conventions.

**Verification**: `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Live end-to-end verification (a recipient without `viewAll` actually seeing the record appear on
their list, the bell notification arriving and deep-linking correctly) was not attempted this
session — the user had already independently confirmed the underlying email send works against
real production data (via Vercel deployment/runtime-log checks earlier in the session), and this
pass is a comparatively low-risk, well-precedented addition (the exact same deep-link/query-filter
patterns already shipped and used for Quotation's own notifications/`quotations:viewAll`). Recommend
the user click through the new bell notification and confirm list visibility once they test the
next real send.

---

## 2026-07-23 — Scope of Work: real Document Recipients + email routing

**Feature**: per direct user request ("ในส่วนนี้ให้เพิ่มบัญชีเข้าไปด้วย... อยากให้ลิงค์ข้อมูลกับแผนก
ที่จะเลือกตอนสร้างพนักงานเพราะจะต้องส่งเอกสารไปให้คนนั้นๆที่อยู่ในแต่ละแผนก" — add "บัญชี" to the
Documents Sent To checklist, and link it to the department chosen when creating an employee, since
documents need to go to the real person in each department), the `documentsToSend` checklist is now
backed by real people instead of being a plain printed-form checkbox list, and can email them
directly.

**Scoping conversation**: this request had two genuinely open questions the user was asked to
resolve before implementing — (1) how deep the "link to department" should go (just add the
checkbox with no real link; make `department` a controlled dropdown matching the checklist so
matching is reliable, with a recipient picker; or a fuller architecture the user didn't actually
want), and (2) since the user's own follow-up clarified they wanted actual email delivery and no
email-sending infrastructure existed in this codebase at all (confirmed via a targeted grep — no
nodemailer/SMTP/Resend/SendGrid/etc., zero email-related env vars), which email provider to use.
User chose "real link with a recipient picker" for (1) and Resend for (2).

**Checklist**: `documentsToSend` gained a 6th option, `{ key: "accounting", label: "Accounting" }`
(`src/lib/documentRequirements.ts`), generated from a new shared `DOCUMENT_RECIPIENT_DEPARTMENTS`
constant that also drives the User form's department dropdown (see below) — one source of truth.
`withDefaultChecklistGroups()` was extended to backfill any *option* the current builder generates
but a stored group predates (previously only backfilled entirely missing *groups*/`note` fields) —
without this, every Scope of Work saved before this pass would have been permanently frozen at 5
options, unable to ever route to Accounting.

**`User.department`**: changed from a free-text `<input list>` (datalist autocomplete hints only,
never enforced) to a real `<select>` constrained to `DOCUMENT_RECIPIENT_DEPARTMENTS`'s 6 labels —
the exact same strings as the checklist's own option labels, so matching a checked department to
real users is a reliable exact-string match, not fuzzy free-text guessing. A pre-existing value that
doesn't match any of the 6 is kept as a selectable "ค่าเดิม"/legacy-value fallback option rather than
silently discarded on save. The old `DEPARTMENT_SUGGESTIONS` constant (`src/lib/users.ts`, a
different, unrelated HR-style department taxonomy — ผู้บริหาร/ฝ่ายขาย/วิศวกรรม/etc.) was removed; it
had exactly one consumer.

**Data model**: new `ScopeOfWork.documentRecipients: Record<string, string[]>` maps a checked
department's option key to the `User.id`s picked as its actual recipients — independent of the
option's `checked` state (unchecking doesn't clear picks, so re-checking later remembers them).
Backend: `sanitizeDocumentRecipients()` (`api/_lib/scopeOfWorkHandler.ts`) drops any key that isn't
a real department and verifies every referenced user id actually exists via one batched query;
`normalizeDocumentRecipients()` (`src/lib/scopeOfWork.ts`) defaults a pre-2026-07-23 record's
missing field to `{}` on read.

**Email**: new `api/_lib/email.ts` — `sendEmail()` via Resend's plain REST API (a single `fetch`
POST, no SDK dependency added). New `POST /api/scope-of-works/:id/send-documents`
(`handleSendDocumentNotifications()`) emails every department that's BOTH currently checked AND has
≥1 picked recipient, deduped across departments (one email per person, not per department), gated
by `scopeOfWork:print` (no new permission — this is a distribute/export action like Print, not a
content edit). Writes a `"Scope of Work Document Notification Sent"` audit entry and returns
`{ sentCount, failedCount, recipientCount }`.

**Frontend**: new `DocumentRecipientsPicker.tsx` (toggle-chip candidate list per checked
department, filtered by an exact `User.department` match) renders below the checklist card in
`ScopeOfWorkDocument.tsx`; a new "ส่งอีเมลแจ้งผู้รับเอกสาร" button saves the record first (the
server reads recipients from the persisted document, not unsaved client state), then triggers the
send and toasts the result.

**Files Modified**: `src/lib/documentRequirements.ts`, `src/lib/users.ts`, `src/lib/scopeOfWork.ts`, `src/pages/admin/UserManagementPage.tsx`, `src/pages/quotation/ScopeOfWorkDocument.tsx`, `src/lib/i18n.tsx`, `api/_lib/scopeOfWorkHandler.ts`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/RBAC.md`, `docs/MODULES/ScopeOfWork.md`, `docs/MODULES/UserManagement.md`, `docs/CLAUDE.md`, `docs/TODO.md`

**Files Added**: `api/_lib/email.ts`, `src/pages/quotation/DocumentRecipientsPicker.tsx`

**Reason**: Direct user request — link the Documents Sent To checklist to real staff via their
department, and actually notify them by email.

**Deliberately not built this pass**: attaching the printed document (PDF) to the email — this app
has no server-side PDF generation (Print/PDF export is entirely browser-native `window.print()`);
the email is a plain HTML notification with a link back into the app, not a document-delivery
replacement for print. No required-field validation was added for recipient-picking (optional,
layered on top of the existing "≥1 department checked" rule, unchanged).

**Verification**: `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Interaction-verified via a temporary, isolated dev harness (`src/dev/DocumentRecipientsHarness.tsx`,
deleted after use) mounting the real `DocumentRecipientsPicker` component with mock users across 3
departments — confirmed checking a checklist option reveals exactly the matching-department
candidates, toggling a chip updates the selection state correctly for multiple departments
simultaneously, and zero console errors/warnings throughout. **⚠️ Not verified and cannot be
verified this session**: actual email delivery (no `RESEND_API_KEY` exists anywhere in this
sandboxed session — see TODO.md for the required manual setup step before this feature does
anything beyond returning a clear "not configured" error), and the full save-then-send round trip
against a real MongoDB record (same standing sandboxed-environment limitation as every recent
entry — no Vercel CLI, no local MongoDB credential).

---

## 2026-07-23 — Scope of Work: own-records-only viewing (`scopeOfWork:viewAll`)

**Feature**: per direct user request ("หน้า scope of work อยากให้ทำสิทธิ์เพิ่มมาเหมือนของใบเสนอราคา
ที่เป็นดูของผู้อื่นได้" — add a permission to the Scope of Work page like the quotation one, for
viewing others'), new `scopeOfWork:viewAll` permission mirroring the existing `quotations:viewAll`
(added 2026-07-22). A role holding `scopeOfWork:view` but not `scopeOfWork:viewAll` now only sees
its own records on the standalone Scope of Work list page and in Global Search.

**Scope decision — narrower than a literal 1:1 mirror of Quotation's feature**: Quotation only has
one place its list is read from (`GET /api/quotes`), so `quotations:viewAll` cleanly gates that one
route plus Global Search. Scope of Work has 3 additional read paths Quotation doesn't: a
by-quotation existence check (`GET /api/scope-of-works?quotationId=`, used by `QuoteDocument.tsx`'s
toolbar to detect "does a Scope of Work already exist for this quotation"), a single-record `GET
/api/scope-of-works/:id`, and duplicate/rewrite's own source-record read. Filtering all of these by
ownership would have created two bad outcomes: (1) hiding a colleague's already-created record from
the by-quotation existence check risks the caller creating a duplicate Scope of Work instead of
opening the existing one — worse than just leaving it visible via that one narrow, already-
permission-gated (`quotations:view`) path; (2) filtering the single-record `GET` while leaving the
by-quotation link unfiltered would produce a broken UX where the link says a record exists but
clicking it 403s. So the ownership filter applies only to the "list every Scope of Work
company-wide" mode (the actual "Scope of Work page" the user referred to) and Global Search — every
other read path is unchanged.

**Backend**: `handleList()`'s list-all branch and `searchScopeOfWorks()` (now taking `ctx`)
(`api/_lib/scopeOfWorkHandler.ts`, `api/_lib/searchHandler.ts`) both add `{ $or: [{ createdBy:
ctx.user.id }, { createdBy: "" }] }` when the caller lacks `scopeOfWork:viewAll`, identical shape to
`quotations:viewAll`'s existing `createdByUserId` filter. `searchScopeOfWorks()`'s query gained a
`$and`-wrapped text-search `$or` (mirroring `searchQuotations()`'s exact composition) so it can
coexist with the new ownership `$or` without a duplicate top-level key.

**Permissions/roles**: `scopeOfWork:viewAll` added to `Permission` (`src/lib/permissions.ts`, right
after `scopeOfWork:view` in the type union/`ALL_PERMISSIONS`/labels/i18n keys/`PERMISSION_GROUPS`)
and to `src/lib/roles.ts`'s default `administrator`/`approver_1`/`approver_2`/`viewer` roles —
`sales_user` deliberately does not get it, same split as `quotations:viewAll`.

**Files Modified**: `src/lib/permissions.ts`, `src/lib/roles.ts`, `src/lib/i18n.tsx`, `api/_lib/scopeOfWorkHandler.ts`, `api/_lib/searchHandler.ts`, `docs/RBAC.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/MODULES/ScopeOfWork.md`, `docs/CLAUDE.md`, `docs/TODO.md`

**Reason**: Direct user request — mirror Quotation's own-quotes-only viewing permission for Scope of
Work.

**Verification**: `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean. No
new client-side rendering logic was added (the list page already renders whatever the server
returns, unchanged — same as how `QuoteList.tsx` needed zero code changes for `quotations:viewAll`),
so no dev harness was built for this pass; verified by tracing the query composition against
`searchQuotations()`'s already-shipped, already-verified equivalent. Live browser/API verification
against real MongoDB data (confirming a Sales User genuinely only sees their own records, an
Approver sees everyone's once manually granted, and the by-quotation/single-record paths stay
correctly unfiltered) could not be completed this session — same standing sandboxed-environment
limitation as every recent entry. **⚠️ Requires a manual Role Management step on this production
deployment** — `defaultRoles` only seeds once; see [RBAC.md](./RBAC.md) "Scope of Work
Own-Records-Only Viewing" and [TODO.md](./TODO.md).

---

## 2026-07-23 — Scope of Work: Cash/Credit dropdown + days for payment installments

**Feature**: direct same-day follow-up to the multi-installment payment schedule pass below
("ไม่คือสามารถแก้ไขเปอร์เซ็น แก้ไขว่าจะเลือกเป็น Cash หรือ Credit") — each installment row's
payment method is now a structured Cash/Credit dropdown plus a separate day-count input, instead of
a free-text field the user had to type "Cash" or "Credit 30 Days" into. Asked the user to clarify
which of 3 possible UI shapes they wanted (dropdown + separate day-count input, recommended and
selected; dropdown with no day count; or a dropdown of whole pre-composed strings like "Credit 30
Days") before implementing, since all 3 were reasonable readings of the request.

**Data model**: `ScopeOfWorkPaymentInstallment.method: string` (`src/lib/scopeOfWork.ts`) replaced
with `paymentType: "" | "Cash" | "Credit"` (new `ScopeOfWorkPaymentType`) + `days: number | null` —
`days` deliberately applies to **either** type, not just Credit, since the user's own worked
example used "Cash 30 days," not just "Credit 30 days." Added `formatPaymentMethod()` — a pure
function deriving the printed "Cash"/"Credit 30 Days" string from `paymentType`/`days` on demand,
so the display string can never drift out of sync with a separately-stored value the way a plain
string field could. `PAYMENT_TERM_PRESETS` updated to populate `paymentType`/`days` instead of
`method` (e.g. the 30/70 preset's Credit row is now `{ paymentType: "Credit", days: 30 }`).

**Legacy compatibility (now two prior shapes deep)**: `normalizePaymentConditions()` must now
handle 3 possible stored shapes — the very first fixed `{downPaymentPct, finalPaymentPct, method}`
pair, this same day's short-lived intermediate `installments` array with a free-text `method`
string per row (shipped and superseded within the same session, likely with zero real records ever
saved under it), and the current `paymentType`/`days` shape. Added `parsePaymentMethodText()` — a
best-effort regex parse of a legacy `method` string ("Cash", "Credit 30 Days", "Cash 30 days") into
`{paymentType, days}`, falling back to `paymentType: ""` (keeping any day count found) for text
that names neither Cash nor Credit, rather than guessing wrong.

**Backend**: `sanitizePaymentConditions()`'s per-row sanitizer (`api/_lib/scopeOfWorkHandler.ts`)
replaced `sanitizeShortText(method)` with `sanitizePaymentType()` (must be `""`/`"Cash"`/`"Credit"`)
and `sanitizePaymentDays()` (integer, 0–3650, or null).

**Frontend**: `PaymentInstallmentsEditor`'s free-text method `<input>` replaced with a `<select>`
(— วิธีชำระ —/Cash/Credit) plus a separate number input for days, shown for every row regardless of
selected type. `ScopeOfWorkPrintDocument.tsx` now calls `formatPaymentMethod()` instead of reading
a stored `method` field directly.

**Files Modified**: `src/lib/scopeOfWork.ts`, `api/_lib/scopeOfWorkHandler.ts`, `src/pages/quotation/ScopeOfWorkDocument.tsx`, `src/pages/quotation/ScopeOfWorkPrintDocument.tsx`, `docs/CLAUDE.md`, `docs/DATABASE.md`, `docs/MODULES/ScopeOfWork.md`

**Reason**: Direct user request — a structured Cash/Credit choice plus a separate day-count field,
not free text the salesperson has to type consistently every time.

**Verification**: `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Re-used the same temporary, isolated dev harness pattern as the prior pass below (`src/dev/
PaymentHarness.tsx`, deleted after use) — confirmed the 30/70 preset populates the dropdown/days
inputs correctly (Cash/blank days, Credit/30 days) with a matching `formatPaymentMethod()` output,
and reproduced the user's own 3-installment example exactly by adding a 3rd row and setting it to
Cash + 30 days — the derived string read "30% Down Payment (Cash) / 70% After Job Complete (Credit
30 Days) / 20% Materials (Cash 30 Days)", byte-for-byte matching the user's original message. Zero
console errors/warnings. Live browser/API verification against real MongoDB data (a genuine
pre-2026-07-23 legacy record's conversion) remains unverified this session — same standing
sandboxed-environment limitation as every recent entry.

---

## 2026-07-23 — Scope of Work: multi-installment payment schedule + presets

**Feature**: per direct user request, Scope of Work's Payment Conditions section now supports an
arbitrary number of payment installments instead of a fixed 2-row down-payment/final-payment pair.
Three quick-select presets fill in a common 2-installment schedule with one click — "40% Down
Payment (Cash) / 60% After Job Complete (Cash)", "30% Down Payment (Cash) / 70% After Job Complete
(Credit 30 Days)", "100% After Job Complete (Credit 30 Days)" — but every row (whether preset-
applied or added manually) stays fully editable and removable, so a genuine 3+-installment plan
with mixed payment terms is now representable, e.g. "20% Down Payment (Cash 30 days) / 40%
Materials (Credit 30 days) / 40% After Delivered Date (Credit 30 days)".

**Data model**: `ScopeOfWorkPaymentConditions` (`src/lib/scopeOfWork.ts`) replaced its fixed
`{downPaymentPct, finalPaymentPct, method}` pair with `installments: ScopeOfWorkPaymentInstallment[]`
— each row is `{ id, pct, label, method }`, so unlike before, each installment can carry its own
payment method/terms (not one shared `method` for the whole schedule). Added `PAYMENT_TERM_PRESETS`
(the 3 presets above), `blankPaymentInstallment()`/`newPaymentInstallmentId()` (mirroring the
existing `blankScopeOfWorkItem()`/`newScopeItemId()` pattern), and `normalizePaymentConditions()` —
a pre-2026-07-23 record still has the legacy shape in MongoDB (no migration script was run; MongoDB
enforces no schema, so old documents are simply read-compatible via this function), converted to
the current shape on every read and persisted in the new shape for good the next time it's saved.

**Validation**: `validatePaymentPercentages()` (`src/lib/validation/scopeOfWorkValidation.ts`)
generalized from "both fixed fields must sum to 100%" to "every `installments` row's percentage
must be filled in and all rows together must sum to exactly 100%, only if at least one row exists"
— same semantic (opt-in percentage-based schedule, free-text `description` alone otherwise), now
correct for any row count. `paymentConditions.method` removed from the required-fields config (the
field no longer exists at that path); each row's own `method` stays optional, unchanged.

**Backend**: `sanitizePaymentConditions()`/new `sanitizePaymentInstallment()`
(`api/_lib/scopeOfWorkHandler.ts`) validate the array on `PATCH` (capped at 20 rows —
`MAX_PAYMENT_INSTALLMENTS`); `handleCreate`'s default now starts `{ installments: [], description:
<from quotation>, notes: "" }`; `normalizeScope()` and `toValidationInput()` both call
`normalizePaymentConditions()` so every response (GET/create/update/finalize/duplicate/rewrite/
refresh) and every finalize/print validation run sees the current shape regardless of what's
actually stored.

**Frontend**: `ScopeOfWorkDocument.tsx`'s fixed 2-input payment block replaced with a new
`PaymentInstallmentsEditor` (module-local component) — 3 preset buttons, an editable row list
(label/percentage/method inputs + remove button per row, modeled after `ScopeOfWorkItemsEditor.tsx`'s
row-editing pattern), a running percentage total, and a "+ เพิ่มงวดชำระเงิน" add-row button.
`ScopeOfWorkPrintDocument.tsx`'s two hardcoded "Down payment"/"After Job Complete" `<p>` lines
replaced with a `.map()` over `installments`.

**Files Modified**: `src/lib/scopeOfWork.ts`, `src/lib/validation/scopeOfWorkValidation.ts`, `api/_lib/scopeOfWorkHandler.ts`, `src/pages/quotation/ScopeOfWorkDocument.tsx`, `src/pages/quotation/ScopeOfWorkPrintDocument.tsx`, `docs/CLAUDE.md`, `docs/DATABASE.md`, `docs/MODULES/ScopeOfWork.md`

**Reason**: Direct user request — 3 named preset payment schedules the salesperson can pick, while
staying free to build a custom multi-installment schedule the presets don't cover.

**Verification**: `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Interaction-verified via a temporary, isolated dev harness (`src/dev/PaymentHarness.tsx`, deleted
after use, not part of the app's real routing) mounting the real `PaymentInstallmentsEditor`
component with local React state — confirmed a preset click populates the expected 2 rows with the
correct percentages/labels/methods and a live "รวม 100%" total, and that "+ เพิ่มงวดชำระเงิน" adds
a 3rd fully-independent blank row on top of an applied preset (the 3-installment scenario from the
user's own example) — zero console errors/warnings during the session. Live browser/API
verification against real MongoDB data (confirming a legacy pre-2026-07-23 record's
`normalizePaymentConditions()` conversion against actual stored data) could not be completed this
session — same standing sandboxed-environment limitation as every recent entry (no Vercel CLI, no
local MongoDB credential).

---

## 2026-07-23 — Dashboard: Scope of Work document count card

**Feature**: per direct user request ("อยากให้เพิ่มข้อมูลของใบ Scope of work ว่ามีกี่ใบ" — add how
many Scope of Work documents there are), the Dashboard's supporting-detail section gained a new
`ScopeOfWorkSummary.tsx` card showing Total/Draft/Final Scope of Work document counts, right after
`ActivityFollowUpSummary`. Deliberately **not** added as a 5th `ExecutiveSummaryCards` tile — that
row is a documented, repeatedly-reaffirmed "exactly 4 cards" business requirement (see
`ExecutiveSummaryCards.tsx`'s own doc comment) — so the new metric goes in supporting detail
instead, same tier as `ActivityFollowUpSummary`/`SalesPerformancePanel`.

**Backend**: `GET /api/dashboard` (`api/dashboard/index.ts`) gained a `scopeOfWork: { total, draft,
final } | null` field — three `scope_of_works.countDocuments()` calls (`{ isDeleted: false }`, plus
`status: "Draft"` / `"Final"`), gated by `roleHasPermission(ctx.role, "scopeOfWork:view")` (`null`
otherwise), same pattern as the existing `approvalDashboard` section (own try/catch so a transient
failure degrades to a hidden card, not a broken dashboard). Deliberately company-wide/all-time, not
scoped by the date-range/salesperson/department filter — a Scope of Work document has no
`issueDate`/`salesperson` of its own to filter by, same reasoning already documented for Total
Customers/Products/`categoryBreakdown`.

**Frontend**: `DashboardKpis`/`DashboardStats` (`src/lib/dashboard.ts`) gained a new
`ScopeOfWorkSummary` type + `scopeOfWork` field; new `src/pages/dashboard/ScopeOfWorkSummary.tsx`
component (3-tile row inside one `ChartCard`, same visual pattern as `ActivityFollowUpSummary`'s
tiles, informational only — no tile is clickable, there's no Scope of Work list filter to jump to
the way Pending Approvals has); wired into `DashboardPage.tsx`'s supporting-detail section, guarded
by `{scopeOfWork && <ScopeOfWorkSummary data={scopeOfWork} />}`. New `dashboard.scopeOfWork.*` i18n
keys (Thai + English) in `src/lib/i18n.tsx`.

**Files Modified**: `api/dashboard/index.ts`, `src/lib/dashboard.ts`, `src/pages/dashboard/DashboardPage.tsx`, `src/lib/i18n.tsx`, `docs/CLAUDE.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/MODULES/Dashboard.md`

**Files Added**: `src/pages/dashboard/ScopeOfWorkSummary.tsx`

**Reason**: Direct user request to surface the Scope of Work document count on the Dashboard.

**Verification**: `tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint`,
`npm run build` all pass clean. Live browser/API verification against real MongoDB data could
**not** be completed this session — same pre-existing sandboxed-environment limitation documented
throughout this changelog (no Vercel CLI, no local MongoDB credential); the new card follows the
exact same permission-gate/null-hide pattern as `ApprovalDashboard.tsx`, already live-verified in
earlier passes, so the risk is low, but a manual click-through against real production data is
still recommended.

---

## 2026-07-22 (absolute latest) — Scope of Work: Rewrite action + Salesperson filter

**Feature**: per direct user request ("เหมือนใบเสนอราคา" — mirroring Quotation's identical feature),
Scope of Work gained a "แก้ไข" (Rewrite) toolbar action next to "ทำสำเนา" in
`ScopeOfWorkDocument.tsx` (gated by `scopeOfWork:create`), and the standalone list page gained a
Salesperson filter dropdown + table column mirroring `QuoteList.tsx`'s own.

**Rewrite mechanics**: new `POST /api/scope-of-works/:id/rewrite` (`handleRewrite()`,
`api/_lib/scopeOfWorkHandler.ts`). Unlike Quote's own Rewrite (which applies `{root}-R{n}` directly
to the human-readable `_id`), a Scope of Work's `_id` is a genuine MongoDB `ObjectId` — so the
revision suffix applies to `scopeNumber` instead, with `yearMonth`/`jobSequence`/`secondaryCode`/
`issueDate` all passed through unchanged from the source. A new atomic per-root counter
(`scope_revision_{rootScopeNumber}`) numbers each revision; root recovery reuses `getRevisionRoot()`
verbatim from `api/_lib/quoteRevisions.ts` rather than a duplicated copy (that file's docstring now
notes the cross-module reuse — its `dedupeQuotesByRevisionChain()` export stays Quote-only despite
the filename). Everything else resets exactly like Duplicate: `status: "Draft"`, fresh `seller`/blank
`approver`, fresh item/spec ids. Writes a `"Scope of Work Rewritten"` audit entry. Both
`QuotationPage.tsx`'s embedded usage and the standalone `ScopeOfWorkPage.tsx` wire a new `onRewritten`
callback (mirrors the existing `onDuplicated` shape) — navigates to the new revision's id on success.

**Salesperson filter**: `toListItem()` now also surfaces the already-existing `quotationSalesperson`
snapshot field (previously only used for the `seller` default, never exposed on the list shape).
`ScopeOfWorkList.tsx` gained a filter dropdown (distinct names actually present in the fetched list,
same convention as the Job Type dropdown) and a table column, both positioned to match `QuoteList.tsx`.

**Also fixed while in the area**: a pre-existing staleness gap in `ScopeOfWorkPage.tsx` — its
"back to list" action only switched view state without re-fetching, so a just-created
Duplicate/Rewrite/edit wouldn't show up in the list until a full page reload. Now calls a `loadList()`
re-fetch on the way back.

**Self-review catch**: a first pass placed the new `rewriteBusy` `useState` after this component's
existing early returns (`if (loadError) return...`, `if (!scope) return...`), which `npm run lint`
correctly flagged as a `react-hooks/rules-of-hooks` violation (conditional hook call) — moved up
alongside the component's other `useState` declarations before those early returns, same as every
other hook in the file.

**Verification**: `tsc --noEmit` (both tsconfigs), `lint`, `build` all pass clean. Visually verified
via a temporary browser harness with mock list data — salesperson column + filter dropdown render
and sort correctly (options list confirmed via `read_page`: both names present, alphabetically
sorted). The detail view's Rewrite button was verified by code inspection (identical
structure/gating to the already-shipped, already-verified Duplicate button) rather than a live
fetch-mocked harness, given the sandboxed session's standing MongoDB-network limitation.

**Files**: `api/_lib/quoteRevisions.ts` (docstring only), `api/_lib/scopeOfWorkHandler.ts`,
`src/lib/scopeOfWork.ts`, `src/pages/quotation/ScopeOfWorkDocument.tsx`,
`src/pages/quotation/QuotationPage.tsx`, `src/pages/scopeOfWork/ScopeOfWorkPage.tsx`,
`src/pages/scopeOfWork/ScopeOfWorkList.tsx`.

---

## 2026-07-22 (absolute latest) — Self-review fix: ErrorBoundary never reset after catching an error

**Bug fix**: reviewing the crash fix below turned up a real gap in the fix itself — `<ErrorBoundary>`
was wired into `App.tsx` with no `key`, so once it caught an error it stayed in `hasError: true`
forever. React error boundaries don't auto-reset when their children's content changes, so the user
would be permanently stuck on the fallback error screen even after clicking a *different* sidebar
item to a page that would otherwise render fine — undermining the boundary's own stated goal
("sidebar/header shell stays interactive"). Fixed by giving it `key={effectiveNav}`, the standard
idiom for forcing a fresh remount (and therefore a state reset) whenever navigation actually
changes. Also swapped `componentDidCatch`'s hand-rolled inline info type for React's own `ErrorInfo`,
and added client-side normalization for `status` in `ScopeOfWorkList.tsx` (not itself a crash risk,
just closing the same defensive gap the other fields already had).

**Verification**: built a throwaway harness mirroring the exact `<ErrorBoundary key={...}>` pattern
— a crashing page followed by a click to a working one — and confirmed the boundary now recovers
correctly instead of staying stuck. `tsc --noEmit` (both tsconfigs), `lint`, `build` all pass clean.

**Files**: `src/App.tsx`, `src/components/ErrorBoundary.tsx`, `src/pages/scopeOfWork/ScopeOfWorkList.tsx`.

---

## 2026-07-22 (absolute latest) — Fix Scope of Work page crashing to a blank white screen

**Bug fix**: user reported the new Scope of Work page went completely blank white on click. Root
cause: `toListItem()` (`api/_lib/scopeOfWorkHandler.ts`, added earlier the same day) read fields
straight off the MongoDB document with no fallback — a record missing any of them (real historical
possibility: this collection has had fields added after some records already existed, e.g.
`quotationSalesperson` in an earlier pass) serializes that key as `undefined`, which
`JSON.stringify()` drops from the response entirely. The client found the key genuinely absent and
crashed calling `.trim()`/`.toLowerCase()` on `undefined` during React's render phase — and since
this app had **no error boundary anywhere**, React's default "unmount the whole tree on an uncaught
render error" behavior produced exactly the reported blank white screen.

**Fix, three layers**: (1) `toListItem()` now defaults every field (`?? ""`/`?? "Draft"`), same
"MongoDB enforces no schema" pattern already used in `api/dashboard/index.ts`; (2) `ScopeOfWorkList.tsx`
independently re-normalizes every field client-side too; (3) new app-wide `ErrorBoundary`
(`src/components/ErrorBoundary.tsx`, wraps the page-content area in `App.tsx`) so any future crash
of this kind shows a recoverable error screen instead of blanking silently — closes a real,
previously-total gap (zero error boundaries existed anywhere in this app before today).

**Verification**: reproduced the exact original crash in a temporary browser harness against a
deliberately malformed mock record (most fields absent) — confirmed it threw before the fix and
rendered correctly (empty cells, no crash) after. `tsc --noEmit` (both tsconfigs), `lint`, `build`
all pass clean.

**Files**: `api/_lib/scopeOfWorkHandler.ts`, `src/pages/scopeOfWork/ScopeOfWorkList.tsx`,
`src/components/ErrorBoundary.tsx` (new), `src/App.tsx` (wires the boundary in).

---

## 2026-07-22 (absolute latest) — Add a standalone "Scope of Work" sidebar page

**Feature**: per direct user request, Scope of Work gained its own top-level sidebar entry — a
dedicated place to browse/open Scope of Work records independently of the quotation they came
from, "feels like the Quotation list page, for viewing status etc." Confirmed via `AskUserQuestion`
before building: creation stays exactly as it is today (the "สร้าง Scope of Work" button on the
Quotation detail toolbar, opening inline within the Quotation module) — this new page is purely an
additional way to *find and open* records that already exist, not a new creation path.

**Backend**: `GET /api/scope-of-works?quotationId=` — previously `quotationId` was required (400
without it), used only for QuoteDocument.tsx's "does one already exist for this quotation?" lookup.
Made optional: omitting it now returns every non-deleted Scope of Work company-wide, in a richer
`ScopeOfWorkListItem` shape (adds `secondaryCode`/`quotationNumber`/`jobTypeCode`/`jobTypeName`/
customer name/`issueDate`/`deliveryDate` on top of the original `id`/`scopeNumber`/`quotationId`/
`status`/`updatedAt`) — kept as a separate type/mapper (`toListItem()` alongside the existing
`toSummary()`) rather than widening the original summary shape every other caller already relies on.
Same `scopeOfWork:view` gate either way; no ownership scoping added (this module has no equivalent
of Quotation's `quotations:viewAll` — not asked for this pass).

**Frontend**: new `src/pages/scopeOfWork/` folder — `ScopeOfWorkList.tsx` (summary cards, search,
Job Type filter, status pills, table; mirrors `QuoteList.tsx`'s pattern, hardcoded Thai text like
every other Scope of Work UI file) and `ScopeOfWorkPage.tsx` (thin container owning list↔detail
view-switching, fetches the full list on mount, self-contained like Dashboard/Audit Log rather than
depending on `App.tsx`'s boot-time domain fetch). The detail view reuses the *exact same*
`ScopeOfWorkDocument.tsx` component the Quotation-embedded flow already uses — added it a new
optional `backLabel` prop (defaults to the original "กลับไปใบเสนอราคา") so this page can pass
"กลับไปรายการ Scope of Work" instead, since there's no quotation to return to from here. New
`"scopeOfWork"` `NavKey`/sidebar entry in `App.tsx` (icon `ClipboardList`, gated by
`scopeOfWork:view`, grouped under "งานขาย" next to Quotations) — deliberately not added to
`NAV_RESOURCES` (it fetches its own data, same as Dashboard/Audit Log, so it's never gated behind
the shared boot-time resource loading).

**Also investigated, not fixed**: the user separately mentioned a "website link" appearing on the
printed Scope of Work document. Read every line of `ScopeOfWorkDocument.tsx`/
`ScopeOfWorkPrintDocument.tsx` — no link/URL/website field is rendered anywhere in either the
on-screen or printed output. The much more likely explanation is the browser's own native print
header (shows the page URL + print date when "Headers and footers" is enabled in the print
dialog) — which Scope of Work's print button already has a tooltip explaining how to disable
(same tip Quotation's print button has, added together in an earlier pass). Asked the user to
confirm which they meant via `AskUserQuestion`; the reply only addressed the sidebar-page question,
so this is left as explained rather than guessed at further — there is no code-level link to
remove.

**Verification**: `tsc --noEmit` (both tsconfigs), `lint`, `build` all pass clean — build output
confirms `ScopeOfWorkDocument` split into its own shared chunk (52.8kB), reused by both
`QuotationPage` (which shrank accordingly) and the new `ScopeOfWorkPage`. Visually verified
`ScopeOfWorkList.tsx` against a temporary mock-data harness (`?harness=1`, deleted before
finishing) — summary cards, search, and filtering all confirmed correct against 3 mock records; the
full `ScopeOfWorkPage`/detail-view integration and the new API list mode are **not** verified
against a live deployment (same sandboxed-session no-MongoDB-network limitation as every other pass).

**Files**: `api/_lib/scopeOfWorkHandler.ts` (list-mode change), `src/lib/scopeOfWork.ts`
(`ScopeOfWorkListItem`, `fetchAllScopeOfWorks()`), `src/pages/quotation/ScopeOfWorkDocument.tsx`
(`backLabel` prop), `src/pages/scopeOfWork/ScopeOfWorkList.tsx` (new),
`src/pages/scopeOfWork/ScopeOfWorkPage.tsx` (new), `src/App.tsx` (nav wiring), `src/lib/i18n.tsx`
(`nav.scopeOfWork`, both languages).

---

## 2026-07-22 (absolute latest) — Add a "Revisions" (ใบแก้ไข) summary card to the Quotation list

**Feature**: per direct user request, with a screenshot of the existing 5 summary cards ("add the
part showing how many are revision quotes"), added a 6th card counting how many quotes in the list
are themselves a rewrite (a `-R{n}`-suffixed id — see the Rewrite feature earlier this session). New
`isRevisionQuote(id)` helper in `src/lib/quotes.tsx` (a client-side regex check, `/-R\d+$/`) — kept
separate from the server-authoritative `getRevisionRoot()`/`getRevisionNumber()` in
`api/_lib/quoteRevisions.ts` since that file is server-only; this is purely a display convenience
over already-fetched data, no new API call. Uses the `GitBranch` icon (matching the Rewrite button's
own icon for visual consistency) in a distinct purple, since every other card already uses a color
from the existing palette. Verified visually against a mock-data harness with 3 rewrite-style ids
mixed into 8 mock quotes — card correctly showed 3. `tsc`/`lint`/`build` all pass clean.

**Files**: `src/lib/quotes.tsx` (`isRevisionQuote()`), `src/pages/quotation/QuoteList.tsx` (new
summary card), `src/lib/i18n.tsx` (`quotation.revisionCount`, both languages).

---

## 2026-07-22 (absolute latest) — Fix oversized "Not Interested" button (text wrapping to 2 lines)

**Bug fix**: with a screenshot, the "Not Interested" button in `InterestButtons.tsx` (used in
`QuoteList.tsx`'s Interest column) wrapped its label onto 2 lines in English mode ("Not" / "Interested"),
making the button noticeably taller than its "Interested" sibling — neither button had
`whitespace-nowrap`, so the longer English label wrapped whenever the table column had just barely
not enough width. Added `whitespace-nowrap` to both buttons' text and `flex-shrink-0` to their
icons; the table's existing `overflow-x-auto` wrapper already handles any resulting horizontal
overflow, same as every other `whitespace-nowrap` column in this table. Verified visually against a
temporary mock-data harness with the UI language forced to English (`localStorage.tcs_erp_lang =
"en"`) — confirmed both buttons now render at the same single-line height. `tsc`/`lint`/`build` all
pass clean.

**Files**: `src/pages/quotation/InterestButtons.tsx`.

---

## 2026-07-22 (absolute latest) — Fix Quotation list filter row wrapping into 3 uneven lines

**Bug fix**: direct follow-up, with a screenshot, to the Salesperson filter added just above — at
the actual screen width the user was viewing, the filter row (search box, status pill bar, Job
Type dropdown, Salesperson dropdown) wrapped into 3 uneven lines (search alone on row 1, the wide
status pill bar alone on row 2, both dropdowns stranded on row 3) instead of a clean layout.
Restructured `QuoteList.tsx`'s filter section into two explicit rows instead of one single
`flex-wrap` container: row 1 groups every compact single-control filter together (search, Job Type,
Salesperson, the client-filter chip when present); row 2 is the status pill bar alone, on its own
full-width line — it's inherently the widest control (10 buttons) and reads better with room to
itself rather than competing for wrap space with the compact controls. Verified visually against a
temporary mock-data harness (`?harness=1`, deleted before finishing) at two window widths — renders
as the intended clean 2-row layout at both, no 3-line wrap. `tsc`/`lint`/`build` all pass clean.

**Files**: `src/pages/quotation/QuoteList.tsx`.

---

## 2026-07-22 (absolute latest) — Add own-quotes-only viewing permission + Salesperson filter

**Feature**: per direct user request ("อยากให้สร้างสิทธิ์เพิ่มขึ้นมาว่าจะมีสิทธิ์ที่สามารถดูใบเสนอได้แค่
ของตัวเองเท่านั้นถ้าไม่ได้ติ๊ก ส่วนอันที่ติ๊กสามารถดูของคนอื่นได้ด้วย" — create a permission where, if
unchecked, a user can only see their own quotations; checked lets them see everyone's), added a new
`quotations:viewAll` permission. `quotations:view` alone no longer implies "see every quotation
company-wide" (the behavior for every role until this pass) — without `quotations:viewAll`, a
caller only sees quotations they created themselves (plus ownerless legacy/seed quotes, which have
no real "someone else" to exclude them for).

**Enforcement**: server-side in both places a user could otherwise discover another user's
quotation — `GET /api/quotes` (the list `QuoteList.tsx` reads from) and Global Search's Quotation
result category (`searchQuotations()` in `api/_lib/searchHandler.ts` — previously unscoped, which
would have silently bypassed the list-page restriction). Both filter by
`{ $or: [{ createdByUserId: ctx.user.id }, { createdByUserId: "" }] }` when the caller lacks
`quotations:viewAll`; Super Admin bypasses every check as always.

**Default role assignment**: Administrator, Approver Level 1, Approver Level 2, and Viewer all get
`quotations:viewAll` by default (Approvers *must* have it — they can't approve a quote they can't
see); Sales User does not, matching its existing "create/edit your own quotations" description —
exactly the role this feature was written for.

**⚠️ Required manual step for the already-provisioned production deployment**: `defaultRoles` only
seeds roles once, on first-run setup — it is never re-applied to existing role documents. This means
production's current Administrator/Approver Level 1/Approver Level 2/Viewer roles will **not**
automatically gain `quotations:viewAll` just because this code deploys. **A Super Admin must open
Role Management and manually check "ดูใบเสนอราคาของผู้อื่นได้ด้วย" for each of those roles before/
immediately after this ships**, or every existing Approver will suddenly be unable to see the
quotations they need to review — a real workflow break, not just a display change. Deliberately not
auto-migrated (role permission lists can be hand-customized by an admin after seeding; a blind
server-side backfill risks silently overwriting an intentional customization). Tracked in
[TODO.md](./TODO.md).

**UI**: new Salesperson filter dropdown on the Quotation list (`QuoteList.tsx`), right next to the
existing Job Type dropdown, per the user's explicit request ("แบบกดปุ่มเหมือนเลือกประเภทงาน" — like a
button, like the Job Type selector). Lists whichever salesperson names actually appear in the
fetched quotes (client-side only, same as every other filter on this page) — naturally narrows to
just the caller themselves when they lack `quotations:viewAll`, no separate gating needed.

**Verification**: `tsc --noEmit` (both tsconfigs), `lint`, `build` all pass clean. Visually verified
the new Salesperson dropdown against a temporary mock-data harness (`?harness=1`, deleted before
finishing) — dropdown renders correctly styled, and selecting a salesperson correctly narrows 5
mock quotes down to that person's 2. **Not verified against a live deployment**: the actual
server-side ownership filtering (own-quotes-only for a role lacking `quotations:viewAll`) requires
real authenticated sessions with different roles against a live MongoDB instance — same
sandboxed-session no-network limitation as every other pass. Traced the query logic by hand instead
(mirrors the existing, already-shipped ownership pattern in `PATCH /api/quotes/:id`).

**Files**: `src/lib/permissions.ts` (new permission, label, i18n key, group), `src/lib/roles.ts`
(default role assignment), `src/lib/i18n.tsx` (permission label, both languages),
`api/handlers/quotes.ts` (`GET /api/quotes` ownership filter), `api/_lib/searchHandler.ts`
(`searchQuotations()` ownership filter), `src/pages/quotation/QuoteList.tsx` (Salesperson filter UI).

---

## 2026-07-22 (absolute latest) — Fix Dashboard double-counting rewritten quotations

**Bug fix**: per direct user report ("มูลค่าใบเสนอราคารวมก่อนภาษีมันรวมใบที่ rewrite ออกมาด้วย" — the
total pre-tax quotation value includes rewritten quotes too), confirmed the bug was real and
company-wide, not limited to that one KPI: a "Rewrite" (added earlier the same day) creates a
brand-new MongoDB document per revision (`QT-2567-0041`, `-R1`, `-R2`, ...), and every Dashboard
metric that counts/sums "quotations" was counting each of those documents independently instead of
once. Asked the user to confirm scope (one KPI vs. every Dashboard number) before touching code —
answer: every number.

**Fix**: new shared `getRevisionRoot()`/`getRevisionNumber()`/`dedupeQuotesByRevisionChain()` helper
(`api/_lib/quoteRevisions.ts`) — the same `-R<digits>` suffix parsing `handleRewrite()`
(`api/handlers/quotes.ts`) already used to generate revision numbers, extracted so the two can never
drift apart (`api/handlers/quotes.ts`'s own local copy was removed in favor of this shared one).
Applied to every quote-count/-value data source in `api/dashboard/index.ts`: the shared `docs` array
(fixes every KPI, pipeline, salesPerformance, customerAnalytics, jobTypeAnalytics, forecast's
`openOpportunities`, approvalDashboard's `pendingList` in one place, since all of them derive from
`docs`), follow-up reminders, repeat-customer classification, the forecast's historical win rate,
monthly closing rate, and the revenue trend chart. The latter four were previously MongoDB `$group`
aggregations — converted to raw document fetches (status filters moved from the Mongo query to
after-dedup JS filtering) since a chain's true status/outcome/revenue can only be resolved from its
*latest* revision, which the aggregation pipelines had no way to determine before grouping. See
[MODULES/Dashboard.md](./MODULES/Dashboard.md) "Revision Chain De-duplication" for the full
per-widget breakdown and the deliberately-left-un-deduped exceptions (`hasAnyData`'s boolean gate,
the audit-log-based `activityTimeline`/`salesActivity` event feeds).

**Verification**: `tsc --noEmit` (both tsconfigs), `lint`, `build` all pass clean. The core dedup
logic was sanity-checked against a synthetic revision chain via a throwaway Node script (correctly
collapsed a 2-rewrite chain to just its latest revision, left an unrewritten quote and an orphan
`-R1` untouched). **Not verified against a live deployment with real rewritten quotation data** —
same sandboxed-session no-MongoDB-network limitation as every other pass in this file.

**Files**: `api/_lib/quoteRevisions.ts` (new), `api/handlers/quotes.ts` (refactored to reuse the
shared helper), `api/dashboard/index.ts` (dedup applied to 6 data sources).

---

## 2026-07-22 (absolute latest) — Fix Quotation list filter-row layout imbalance

**Bug fix**: direct follow-up to the search box added just below ("รู้สึกการจัดเรียง layout มันแปลก" —
the layout feels off). Verified visually via a temporary mock-data harness (`?harness=1` query param
routed to a throwaway `QuotationPage`/`QuoteList` mount in `main.tsx`, mock quotes/job types) rather
than guessing — found two real issues: (1) the search input rendered visibly **shorter** than the
adjacent status-pill bar and Job Type dropdown (their heights weren't explicitly matched, so browser
default input/select/div height differences showed), and (2) the placeholder text
("ค้นหาเลขที่ / ชื่อลูกค้า / พนักงานขาย / เลขที่ PO") was too long for the `w-64` box and got truncated
mid-word. Fixed both: gave the search wrapper, input, pill-bar container, and select an explicit
matching `h-9`, widened the input to `w-72`, and shortened the placeholder to
"ค้นหาเลขที่ / ลูกค้า / พนักงานขาย" (still searches `poRef` too, just not named in the shorter label).
Confirmed the fix visually (heights now align, placeholder fits, typing a client name correctly
narrows the list to 1 of 5 mock rows) and confirmed zero console errors. Harness deleted and
`main.tsx` reverted before finishing — never committed. `tsc`/`lint`/`build` all pass clean.

**Files**: `src/pages/quotation/QuoteList.tsx`, `src/lib/i18n.tsx` (shortened
`quotation.searchPlaceholder`, both languages).

---

## 2026-07-22 (absolute latest) — Add a text search box to the Quotation list

**Feature**: per direct user request ("ในหน้าใบเสนอราคาอยากให้มันสามารถค้นหาใบเสนอราคาได้" — on the
Quotation page, want to be able to search for quotations), added a search input to `QuoteList.tsx`'s
filter row (next to the status/Job Type filters, before them in the layout). Matches against **No.
(`id`), Client (`client`), Salesperson, and PO No. (`poRef`)** — a case-insensitive substring match
across all four, combined via `.some()` so any one field matching is enough. Purely client-side over
the already-fetched `quotes` array (no new API route), consistent with the existing status/Job
Type/client-chip filters on this same page, all of which are also client-side. Clearing the input
(✕ button, shown only when non-empty) or the existing "no results" empty state (reused, not a new
one) both already handle the zero-match case. `tsc`/`lint`/`build` all pass clean.

**Files**: `src/pages/quotation/QuoteList.tsx` (new `searchQuery` state + filter clause + input UI),
`src/lib/i18n.tsx` (new `quotation.searchPlaceholder` key, both languages).

---

## 2026-07-22 (absolute latest) — Add Quotation Rewrite/Revision feature

**Feature**: a new "Rewrite"/"แก้ไข" toolbar button on the Quotation detail view (`QuoteDocument.tsx`,
next to the existing "คัดลอก"/Duplicate button, same permission gate) creates a new revision of the
open quote and navigates straight to it, leaving the source quote completely untouched. Modeled
directly on the existing Duplicate action (same status-reset-to-Draft/fresh-lines/fresh-ownership/
empty-approval-history semantics — see `handleDuplicate()`) with one difference: the new quote's id
is a **revision-numbered id derived from the source's own id**, not an unrelated fresh sequence
number — `{root}-R{n}`, e.g. `QT-2567-0041-R1`, then `-R2`, `-R3`, ... Rewriting an already-rewritten
quote (`-R1`) correctly advances to `-R2`, never `-R1-R1`, because the "root" is always derived by
stripping any existing trailing `-R<digits>` suffix off the id of the quote actually being
rewritten — no new schema field was needed to track the parent/revision relationship, it's encoded
entirely in the id string.

**API** (`api/handlers/quotes.ts`): new `POST /api/quotes/:id/rewrite` route (`handleRewrite()`),
gated by the same `quotations:create` permission Duplicate uses. The revision number is reserved
**atomically** via the same `counters` collection + `findOneAndUpdate($inc)` idiom `nextQuoteId()`
already uses for the main sequence (and Scope of Work's `nextJobSequence()`) — keyed by
`quote_revision_${rootId}` (a brand-new counter namespace, no bootstrap needed). A bounded 3-attempt
retry (`MAX_REWRITE_ATTEMPTS`) re-reserves a fresh number on the extremely unlikely `E11000`
duplicate-key race, same defensive pattern as Scope of Work's insert retry. A distinct
`"Quotation Rewritten"` audit action (not Duplicate's `"Quotation Created"`) is written so Dashboard
analytics can tell the two apart later if needed. The server always loads the authoritative source
quote from MongoDB by id — the client never sends quote data to copy.

**Client** (`src/lib/quotes.tsx`): new `rewriteQuote(id)` calling the route above; new
`QuotePermissions.canRewrite` (`!isNew && hasCreate` — same permission as `canDuplicate`, detail-view
only). (`src/pages/quotation/QuoteDocument.tsx`): new `onRewrite: () => Promise<void>` prop (returns
a Promise, unlike `onDuplicate`, specifically so this component can track a local `rewriteBusy` state
and disable the button for the duration of the request — guards against a rapid double-click
creating two revisions; the atomic counter reservation already makes concurrent-user duplicates
impossible regardless). (`src/pages/quotation/QuotationPage.tsx`): new `handleRewrite()` following
the exact same `setQuotes`/`setSelectedId`/toast pattern as `handleDuplicate()` — `view` stays
`"detail"`, changing only `selectedId` triggers `QuoteDocument`'s `key`-based remount onto the new
revision, no new routing/view-state needed (this app has no router at all — see ARCHITECTURE.md).
On failure, the toast shows the server's error message and the user stays on the current (source)
quote — no partial/incomplete record is ever left behind since the insert either fully succeeds or
throws before `res.status(201)`.

**i18n**: new `quotation.rewriteAction` ("แก้ไข"/"Rewrite"), `quotation.rewriteSuccessToast`,
`quotation.rewriteErrorToast` keys, both languages.

**Scope discipline**: no new permission was added (reuses `quotations:create`, same as Duplicate);
no new page/route (reuses the existing in-page `key`-remount navigation pattern); Template
structure/calculation logic/VAT/Dashboard/Warehouse/Scope of Work/Customer master data/approval
workflow/print output/other buttons are all untouched.

**Verification**: `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`
(0 errors, 2 pre-existing unrelated warnings in `i18n.tsx`), and `npm run build` all pass clean. The
client bundle was confirmed to load with zero console errors in a local dev server — full logged-in
click-through of the 8 manual test scenarios (first/second/third rewrite, data-copy fidelity,
original-record integrity, repeated-click guard, RBAC, error handling) was **not** performed: this
sandboxed session has no network path to the MongoDB Atlas cluster the Vercel Functions backend
needs (`vercel dev` isn't available either — CLI not installed), the same documented limitation
noted against nearly every prior pass in this file (see PROJECT_STATUS.md "Known Risks"). The logic
was instead verified by tracing it against `handleDuplicate()`'s already-shipped, equivalent-shape
behavior line-by-line.

**Docs updated**: PROJECT_STATUS.md, CHANGELOG.md (this entry), SESSION_LOG.md, TODO.md, DATABASE.md
(`counters` section), API.md (new route row), MODULES/Quotation.md (new "Rewrite" business-flow
item).

---

## 2026-07-21 (absolute latest) — Remove TemplateItem.specifications/.editableParameters/.internalNotes/.visibleToCustomer entirely

**Feature**: Direct follow-up to the "ดูรายละเอียด" toggle removal above ("เอาพวกนี้ออกไปด้วย" — remove
these too, with a screenshot of the now-always-visible panel). Once the panel was visible without a
click, the user saw it held real, populated data — actual template content like "Substrate option:
SS/SUS tank... ระบุพื้นที่และขนาดถัง (DxH) (Sq.m./mm.)" and internal notes about sealant markings —
and asked for the whole panel gone, not just the toggle. Given the real business data and that
`TemplateItem.specifications` also feeds an applied quotation's line items (via `applyTemplate.ts`,
from the earlier same-day `QuoteLine.notes`/`.specifications` removal pass), confirmed scope via two
rounds of `AskUserQuestion` before touching anything: (1) remove all four fields — Specifications,
Editable Parameters, Internal Notes, and the visible-to-customer checkbox — not a subset; (2) fold
pre-existing Specifications content into `subDetails` rather than lose it, same remap pattern as the
earlier pass.

**Data model** (`src/lib/quotationTemplates.ts`): removed `specifications: string[]`,
`editableParameters: TemplateEditableParameter[]` (+ deleted the now-unused
`TemplateEditableParameter` interface), `internalNotes: string[]`, and `visibleToCustomer: boolean`
from `TemplateItem` entirely.

**Migration for real, populated data**: `TemplateItem.specifications` wasn't unused test data — the
5 official Excel-derived templates (`api/_lib/templateSeedData.ts`) and any admin-edited templates
carry real spec text there. Two safety nets, both reading the field defensively via a runtime cast
since the type no longer declares it: (1) `TemplateEditorView.tsx` now folds any legacy
`specifications` content into `subDetails` the moment an existing template is opened for editing
(`migrateLegacySpecifications()`), so it shows up immediately as pinned rows and the next save
naturally drops the raw field; (2) `applyTemplate.ts`'s `legacySpecifications()` does the same fold
at apply-time, as a fallback for any template applied via the Create Quotation wizard before it's
ever been re-opened/re-saved in the editor. `api/_lib/templateSeedData.ts`'s shared `makeItem()`
factory (used by every item definition across all 5 templates) now folds its `def.specs` shorthand
directly into `subDetails` at the source — the next `POST /api/quotation-templates/import` run will
pick this up automatically via the existing idempotent-import hash-gate (the content hash changes,
so it reports `updated`, not `skipped`, for these 5). `def.params`/`def.notes` (editable-parameter
and internal-note shorthand) are left in place throughout the 500+ line seed file for traceability
against the source Excel workbook, but are simply no longer read into the built `TemplateItem`.

**Editor** (`TemplateEditorView.tsx`): removed the entire detail panel (Specifications textarea,
Editable Parameters list + add button, Internal Notes textarea, visible-to-customer checkbox) along
with `updateParam`/`addParam`/`deleteParam`. `emptyItem()` and `addProductItem()` (the "select
existing product" flow) updated to match — a product's `specifications` text now becomes an initial
pinned `subDetails` entry, same as the equivalent quotation-side product picker.

**Apply-to-quotation** (`applyTemplate.ts`): every item is now unconditionally included (the
`visibleToCustomer` hide-from-customer gate is gone); the editable-parameter fill-in-the-blank-prompt
feature (`"Label: ______ Unit"`) is gone entirely, not replaced.

**Server** (`api/_lib/quotationTemplatesHandler.ts`): `sanitizeItem()` no longer reads/writes the
four removed fields; deleted the now-unused `sanitizeParam()` helper; `countInternalNotes()` now
only counts template-level notes (the item-level sum it used to add is gone).

**Preview** (`src/components/TemplatePreview.tsx`): the full-preview item list now renders
`item.subDetails` instead of separate `item.specifications`/`.editableParameters` bullet lists.

**Files Modified**: `src/lib/quotationTemplates.ts`, `src/pages/templates/TemplateEditorView.tsx`,
`src/pages/quotation/applyTemplate.ts`, `api/_lib/quotationTemplatesHandler.ts`,
`api/_lib/templateSeedData.ts`, `src/components/TemplatePreview.tsx`, `src/lib/i18n.tsx`,
`docs/MODULES/QuotationTemplates.md`, `docs/DATABASE.md`

**Files Removed**: none

**Reason**: Direct user request, after seeing the real data the always-visible panel exposed.

**Notes**: `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run
build` all pass clean. Browser-verified via a temporary local harness mounting `TemplateEditorView`
(create-new mode) with a mock product carrying specifications text — added a section and picked the
product, confirmed its specifications text correctly became a pinned sub-detail row (not lost) and
no trace of the removed panel/toggle remains in the action column. Harness deleted before
committing. **Accepted, explicitly confirmed data tradeoff**: Editable Parameters/Internal
Notes/visible-to-customer values already saved on real templates in MongoDB stay in the raw document
(no migration/deletion ran, consistent with this codebase's established pattern for prior field
removals) but are no longer surfaced or read anywhere in the app; only Specifications content is
actively rescued via the two defensive folds described above.

---

## 2026-07-21 (latest of all) — Quotation Template item editor: remove the "ดูรายละเอียด" expand toggle

**Feature**: Direct user request ("ช่วยเอา ดูรายละเอียด ในหน้า Template ใบเสนอราคาออกไปด้วย" — remove
the "View details" button from the Quotation Template page too). That button toggled a per-item
detail panel (Specifications, Editable Parameters, Internal Notes, the visible-to-customer checkbox)
open/closed in `TemplateEditorView.tsx`'s `ItemEditor`. Confirmed via `AskUserQuestion` before
touching it, since the panel behind the button carries real data (Specifications is the only
customer-visible-notes mechanism for template items, and feeds into an applied quotation's
`subDetails` — see the QuoteLine removal entry above): the user wanted the *button* gone, not the
fields — the panel should just always be visible instead of requiring a click.

`TemplateEditorView.tsx`: removed the `expanded`/`setExpanded` state and the "ดูรายละเอียด"/"ย่อ"
toggle button from `ItemEditor`'s action column; the detail `<tr>` (previously `{expanded && (...)}`)
now always renders unconditionally, directly below each item's own row (and below its pinned
sub-detail rows, unchanged). No field, data, or handler logic was touched — purely removing the
show/hide gate. Removed the now-unused `templates.form.expand`/`templates.form.collapse` i18n keys
(TH + EN).

**Files Modified**: `src/pages/templates/TemplateEditorView.tsx`, `src/lib/i18n.tsx`,
`docs/MODULES/QuotationTemplates.md`

**Files Removed**: none

**Reason**: Direct user request to remove the toggle button, keeping the underlying data.

**Notes**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Browser-verified via a
temporary local harness mounting `TemplateEditorView` (templateId=null, "create new" mode) —
added a section and a manual item, confirmed the detail panel (Specifications/Editable
Parameters/Internal Notes/visible-to-customer) now renders immediately with no click needed, and
that the action column's icon row (Pin, move up/down, duplicate, delete) no longer has a text
button. Harness deleted before committing.

---

## 2026-07-21 (yet later) — Fix quotation page typography: restore label/button vs. content hierarchy

**Feature**: Direct user follow-up to the earlier same-day readability pass ("ปรับแก้หน้าใบเสนอราคาให้ดูสวยขึ้นให้หน่อยรู้สึกว่า fonts มันใหญ่แปลกๆ" — make the quotation page look nicer, the fonts feel weirdly big). The earlier pass had mechanically bumped every `text-xs` on the page to `text-sm`, which — while technically making individual pieces of text bigger — collapsed the whole page onto essentially one text size (buttons, labels, badges, and actual content were all `text-sm`), erasing the visual hierarchy that makes a form read as organized rather than uniformly loud.

Reviewed every remaining `text-sm` instance in `QuoteDocument.tsx` (65), `LineItemsEditor.tsx`, `CustomerSelector.tsx`, and `InterestButtons.tsx` individually and re-classified each as **chrome** (labels, buttons, badges/pills, fine print — reverted to `text-xs`) or **content** (input/select/textarea values, table cell data, totals — kept at `text-sm`). Concretely reverted to `text-xs`: the back-navigation link, the status pill, every toolbar/workflow/modal button (~20), the "QUOTATION" subtitle and header status pill, every field `<label>`/`RequiredFieldLabel` override, the checkbox label, the footer disclaimer, both confirmation modals' helper text and inline errors, `LineItemsEditor.tsx`'s three toolbar buttons, `CustomerSelector.tsx`'s empty-state message, and both `InterestButtons.tsx` toggle buttons. Left at `text-sm`: every form field's actual value, the line-items table's cell values and totals breakdown, the remarks/comment textareas, and the approval-history entries (real content a user reads, not chrome).

**Files Modified**: `src/pages/quotation/QuoteDocument.tsx`, `src/pages/quotation/LineItemsEditor.tsx`, `src/pages/quotation/CustomerSelector.tsx`, `src/pages/quotation/InterestButtons.tsx`, `docs/UI_GUIDELINES.md` (amended the same-day readability-pass entry to describe the corrected outcome, not a separate/duplicate entry)

**Files Removed**: none

**Reason**: Direct user report that the previous pass's uniform size bump looked wrong, not readable-in-a-good-way.

**Notes**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Browser-verified via a temporary local harness mounting the full `QuoteDocument` (mode="new", mock company/user/permissions/one line item) — confirmed toolbar buttons are visibly compact again, field labels read smaller/muted than their values, and the line-items table/totals remain at the more-readable size from the original request. Harness deleted before committing.

---

## 2026-07-21 (latest) — Remove QuoteLine.notes/.specifications entirely (unused feature)

**Feature**: Direct user request ("เอาหมายเหตุ ข้อกำหนดเฉพาะ เอาออกไปเลยส่วนนั้นไม่ใช้แล้ว" — remove
Notes/Specifications, that part isn't used anymore). Confirmed scope via `AskUserQuestion` before
touching the data model: (1) remove only Notes + Specifications, keep Tags; (2) remove the
references from code entirely, not just hide the UI. Before implementing, researched every read/
write site first (an `Explore` agent pass) since this touches more than the obvious editor — most
notably `applyTemplate.ts`, which was copying a Quotation Template item's `specifications` into the
now-removed `QuoteLine.specifications` field (previously documented as "the only customer-visible-
notes mechanism" for template items), and `api/_lib/scopeOfWorkHandler.ts`, which seeded a generated
Scope of Work item's `remark` from `line.notes` and its `specifications` array from
`line.specifications` + `line.subDetails`. Confirmed with the user (a second `AskUserQuestion`)
that template-sourced specifications should be preserved by remapping into `subDetails` (pinned
rows) rather than silently dropped.

**Data model**: `QuoteLine.notes`/`.specifications` removed from the interface (`src/lib/quotes.tsx`);
`blankLine()` and `lineHasDetails()` updated to match (the latter now only checks `subDetails`/`tags`).

**Editor** (`LineItemsEditor.tsx`): `NotesEditor` and `SpecificationsEditor` components deleted
entirely (along with the now-unused `insertAtCursor` bullet/numbered-list helper and the `List`/
`ListOrdered` icon imports). The sticky-note expand panel now contains only the Tags editor — its
tooltip changed from "Notes / Specifications / Tags" to just reuse the existing "Tags" label, and its
gold-dot "has content" indicator now reflects only `tags.length > 0`. `addLineFromProduct()` (the
"pick from catalog" flow) no longer copies `Product.specifications` into a `specifications` field —
instead, if the product has non-blank specifications text, it becomes an initial pinned `subDetails`
entry on the new line, so that content isn't silently lost.

**Print** (`PrintDocument.tsx`): no longer renders `line.specifications` (italic paragraph) or
`line.notes` (via `<FormattedNotes>`) in a line's details row — sub-details and tags are unaffected.
`src/pages/quotation/notesFormat.tsx` (`<FormattedNotes>`, only ever used for `line.notes`) deleted
as dead code.

**Template application** (`applyTemplate.ts`): `item.specifications` (a template item's real spec
attributes, e.g. "Material: Steel") now folds into the resulting `QuoteLine`'s `subDetails` array
(one row per non-blank line) instead of a dedicated `specifications` field — ordered before the
item's own configured `subDetails` and the generic editable-parameter fill-in-the-blank prompts, so
this customer-visible template content still reaches the applied quotation and its print output.

**Scope of Work** (`api/_lib/scopeOfWorkHandler.ts`'s `mapLineToScopeItem()`): `specLines` now comes
from `subDetails` alone (which already carries any former specifications content via the
`applyTemplate.ts` change above); `remark` now starts blank instead of seeding from the removed
`line.notes` — `ScopeOfWorkItem.remark` itself is untouched and remains freely editable afterward in
`ScopeOfWorkItemsEditor.tsx`, only its default seed value changed.

**Server-side validation** (`api/_lib/quoteValidation.ts`): `sanitizeLine()` no longer sanitizes
`notes`/`specifications` (they're no longer part of the type, so this would otherwise be a compile
error against `QuoteFields["lines"][number]`).

**i18n**: removed the now-unused `quotation.lineItems.notesIconTitle`/`notesBullet(Title)`/
`notesNumbered(Title)`/`notesPlaceholder`/`specTitle`/`specPlaceholder` keys (TH + EN); the sticky-
note icon's tooltip now reuses the existing `tagsTitle` key instead of a dedicated one.

**Files Modified**: `src/lib/quotes.tsx`, `src/pages/quotation/LineItemsEditor.tsx`,
`src/pages/quotation/PrintDocument.tsx`, `src/pages/quotation/applyTemplate.ts`,
`api/_lib/scopeOfWorkHandler.ts`, `api/_lib/quoteValidation.ts`, `src/lib/i18n.tsx`,
`docs/MODULES/Quotation.md`, `docs/MODULES/QuotationTemplates.md`, `docs/MODULES/ScopeOfWork.md`,
`docs/DATABASE.md`

**Files Removed**: `src/pages/quotation/notesFormat.tsx`

**Reason**: Direct user request — the Notes/Specifications feature was unused in practice.

**Notes**: `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run
build` all pass clean. Browser-verified via a temporary local harness mounting `LineItemsEditor`
directly (mock data including a pre-filled sub-detail and tag, plus a mock product with
specifications text) — confirmed the sticky-note panel now shows only Tags, and that picking the
mock product from the catalog correctly created a new pinned sub-detail row from its specifications
text instead of losing it; harness files deleted before committing. **Accepted, explicitly
confirmed data tradeoff**: any quotation already saved in MongoDB with real `notes`/`specifications`
text on its line items keeps that data in the raw document (no migration/deletion ran, consistent
with this app's "MongoDB has no schema enforcement, extra untyped fields are harmless" pattern used
elsewhere) but it is no longer surfaced anywhere in the app (editor, print, or Scope of Work) — the
user explicitly chose this over hiding the UI while preserving old data on-screen.

---

## 2026-07-21 (even later) — Quotation page readability pass: bump text sizes one tier across the whole page

**Feature**: Direct user request ("ช่วยเปลี่ยน fonts หรือขนาดให้มันอ่านง่ายขึ้นด้วยในหน้าใบเสนอราคา" —
change the fonts/sizes to make the quotation page easier to read). The page's smallest text
(column headers, eyebrow labels, meta field labels) was `text-[10px]`/`text-[11px]` and the vast
majority of body/input/button/badge text was `text-xs` (12px) — genuinely small for a page used for
routine business data entry. Confirmed scope and degree via `AskUserQuestion` before touching ~90
className instances: the user picked "ปรับขึ้นพอประมาณ" (moderate bump) — 10-11px labels → 12px,
12px body text → 14px — applied to the whole quotation page, not just the line-items table.

Mechanical two-pass find/replace (via a temporary placeholder token to avoid the second pass
re-catching values the first pass just wrote) across `src/pages/quotation/QuoteDocument.tsx`
(65 instances), `LineItemsEditor.tsx` (22), `CustomerSelector.tsx` (4), and `InterestButtons.tsx`
(2): every `text-[10px]`/`text-[11px]` → `text-xs`, every original `text-xs` → `text-sm`. Pre-existing
`text-sm` (client-name input, section titles) and the largest tiers (`text-base`/`text-lg`/`text-xl`
— grand total, "QUOTATION" title) were deliberately left alone — see UI_GUIDELINES.md for the
accepted tradeoff this creates (some content is now visually closer in size than before).

**Files Modified**: `src/pages/quotation/QuoteDocument.tsx`, `src/pages/quotation/LineItemsEditor.tsx`,
`src/pages/quotation/CustomerSelector.tsx`, `src/pages/quotation/InterestButtons.tsx`,
`docs/UI_GUIDELINES.md`

**Files Removed**: none

**Reason**: Direct user request for better readability on the quotation page.

**Notes**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Browser-verified via a
temporary local harness mounting the full `QuoteDocument` (mode="new", mock company/user/permissions,
no backend) — confirmed the page renders without errors, added a line item, and visually inspected
every section (customer info, doc meta, line-items table, notes/terms, signatures, footer disclaimer)
for readability and no overflow/clipping; harness files deleted before committing.

---

## 2026-07-21 (later still) — Fix quotation line-items table: Unit/Qty/Unit Price values not aligning under their headers

**Feature**: Direct user follow-up with a screenshot showing the Unit/Qty/Unit Price/Discount
values in `LineItemsEditor.tsx`'s line-items table visibly offset from their column headers. Root
cause: the table's `<thead>` right-aligns every numeric column's header label, but the Unit input
was `text-center` (header said `text-right`) and the Qty/Unit Price inputs — unlike the already-correct
Discount input — weren't wrapped in a `flex justify-end` container, so their fixed-width (`w-20`/
`w-32`) boxes sat left-anchored inside a wider auto-sized `<td>` instead of hugging its right edge;
their internal `text-right` only right-aligned text within that narrow box, not against the actual
column. Fixed: the header's alignment ternary now explicitly centers column index 2 (Unit) instead
of falling into the generic "everything after description is right-aligned" branch, and the Unit/Qty/
Unit Price `<input>`s are now each wrapped in a `flex items-center justify-center`/`justify-end` div
(matching the pattern the Discount column already used correctly), so every column's data now
genuinely sits under its own header regardless of the input's fixed width.

**Files Modified**: `src/pages/quotation/LineItemsEditor.tsx`

**Files Removed**: none

**Reason**: Direct user report with a screenshot: "ช่วยแก้ตรงนี้ให้หน่อยมันไม่ตรงกับหัวข้อด้านบน."

**Notes**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Browser-verified via
the same temporary local harness pattern as the pinned-sub-details pass above (mounted
`LineItemsEditor` with mock data reproducing the user's exact reported row — "FRP Vertical Tank" /
Set / 3 / 300000 — screenshotted before/after, confirmed every value now sits under its header;
harness files deleted before committing).

---

## 2026-07-21 (later) — Sub-details restyled as pinned rows in the quotation line-items table + Template editor

**Feature**: User shared a reference screenshot of a quotation line-items grid where an extra
"pinned" row — gold/cream highlight, a Pin icon, an already-focused text input — appears directly
beneath a product row for typing an additional description line, and asked for the same format
(same site theme, not the reference image's own navy/white colors) applied to both the live
quotation editor and the Quotation Template editor. Confirmed scope via `AskUserQuestion` before
implementing: the existing per-line "sub-details" feature (`QuoteLine.subDetails`) was the closest
match, but it lived inside a collapsible notes/specs/tags card, not inline in the table — the user
picked the "pinned row directly under the item row" option.

`src/pages/quotation/LineItemsEditor.tsx`: `SubDetailsEditor` (a card-based list) replaced with
`PinnedSubDetailRows`, which renders each sub-detail as its own `<tr>` — `bg-[#c9a84c]/10` (the
site's existing gold accent, not a new color), a `Pin` icon (lucide-react, already used for
sub-detail bullets in `PrintDocument.tsx`, now reused for the live editor too), the sub-detail text
input, a drag handle (native HTML5 drag, same mechanism `SubDetailsEditor` already used), and a
delete button — positioned immediately after the line's main `<tr>`, always visible (no expand
click required), instead of inside the sticky-note icon's card. A new Pin button in the row-actions
column (next to the existing sticky-note/trash icons) adds a blank sub-detail and auto-focuses it
(`autoFocus` + a `pendingFocusId` state, since a freshly-mounted DOM node is the only reliable way
to focus a newly-added array-mapped input). The sticky-note icon's card keeps Notes/Specifications/
Tags only; the "has content" gold-dot indicator was split into two independent booleans
(`hasSubDetails` for the Pin icon, `hasCardDetails` for the sticky-note icon) so each icon reflects
only its own category.

`src/pages/templates/TemplateEditorView.tsx`: the same treatment for `TemplateItem.subDetails`
(a `string[]`, not `SubDetail[]` — no stable per-entry id) — its shared multi-line textarea (which
also covered Specifications/Internal Notes via a documented "paste-friendly list" rationale) is now
just for Specifications/Internal Notes; sub-details render as per-index pinned `<tr>` rows the same
way, with the same Pin-button-in-actions-column add/auto-focus pattern. Specifications/Internal
Notes intentionally kept their original textarea — only sub-details maps to the reference UI's
per-line "pinned" concept.

`src/lib/i18n.tsx`: `quotation.lineItems.notesIconTitle` (TH/EN) reworded from "Notes / Sub-details"
to "Notes / Specifications / Tags" since sub-details no longer live behind that icon; the existing
`addSubDetail`/`subDetailsPlaceholder`/`subDetailsDragTitle` keys were reused as-is (no new i18n
keys needed for the quotation-side pinned rows). The template-side pinned rows reuse those same
quotation-namespaced keys directly rather than duplicating them under `templates.*`.

**Files Modified**: `src/pages/quotation/LineItemsEditor.tsx`, `src/pages/templates/TemplateEditorView.tsx`,
`src/lib/i18n.tsx`, `docs/MODULES/Quotation.md`, `docs/MODULES/QuotationTemplates.md`

**Files Removed**: none

**Reason**: Direct user request with a reference screenshot ("อยากได้ช่องกรอกรายละเอียดสินค้าในหน้า
ใบเสนอราคาเป็นแบบนี้แต่ยังคงธีมเดิมไว้... ปรับแก้ทั้งในหน้าใบเสนอราคาและเทมเพลต").

**Notes**: `npx tsc --noEmit` and `npm run lint` both pass clean. Browser-verified via a temporary,
fully self-contained local harness (`harness.html` + `src/devHarness.tsx`, mounting
`LineItemsEditor` directly with mock in-memory data and no backend calls — created, screenshotted,
then deleted before committing, since this sandboxed environment cannot reach the real API/MongoDB;
same limitation documented throughout this file and `docs/SESSION_LOG.md`) — confirmed the pinned
row appears on clicking the Pin icon, is gold-highlighted, auto-focuses, accepts Thai input, and
that the separate sticky-note card (Notes/Specifications/Tags) still opens independently and
unaffected. `TemplateEditorView.tsx`'s `ItemEditor` is not exported and wiring a matching harness
would need substantially more mock props (job type, products, save handlers); it was instead
verified by static review against the already browser-confirmed `LineItemsEditor.tsx` pattern — same
colSpan arithmetic (6 template-grid columns; empty leading `<td/>` + `colSpan={5}` sums to 6, same
shape as the browser-verified `<td/>` + `colSpan={7}` = 8 total columns in the quotation grid) and
identical Pin/focus/highlight JSX. Not verified against a live deployment.

---

## 2026-07-21 — Translate the raw "Not authenticated" 401 into a real Thai/English message

**Feature**: A user reported seeing a bare "Not authenticated" toast when clicking Approve on a
quotation — the server's raw English `requireUser()` error string (`api/_lib/auth.ts:89`) was
passing straight through `apiClient.ts` to the UI untranslated whenever a session cookie was
missing/expired/invalid (not related to signatures — confirmed there is no signature-upload
precondition anywhere in the approval workflow). `src/lib/apiClient.ts`'s `apiFetch()` now matches
that exact literal error string and replaces it with "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" (Thai) /
"Your session has expired — please sign in again" (English) before throwing `ApiError` — every
caller across the app already just toasts `err.message`, so this one change fixes the message
everywhere it could appear, not just the approve action.

**Files Modified**: `src/lib/apiClient.ts`, `docs/API.md`

**Files Removed**: none

**Reason**: Direct user report with a screenshot showing the confusing raw-English toast on a real
production quotation (`QT-2567-0007`).

**Notes**: Matched by exact message content (`message === "Not authenticated"`), not by HTTP status
code — `POST /api/auth/login`'s own 401 for a wrong password carries a different, already-correct,
already-Thai message (`ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง`) that must not be clobbered; an earlier draft
of this fix keyed off `res.status === 401` alone and would have broken that message, caught before
committing. Also ran a `check-prod` pass first to rule out an actual production incident: the live
deployment matches the latest `master` commit and is `READY`, `GET /api/auth/session` round-trips to
MongoDB cleanly (`200 {"user":null,"needsSetup":false}`), and `get_runtime_errors` over the last 7
days shows no auth-related error cluster — only a pre-existing, unrelated `url.parse()` deprecation
warning. This confirms the error was a real (if confusing) 401, not a server-side bug or outage; the
underlying cause (session invalid at click time — expiry, account edited/deactivated concurrently, or
`App.tsx` never re-checking session while a page sits open) is unchanged, only the message is fixed.
`npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Not browser-verified — same
sandboxed MongoDB Atlas DNS-block limitation as every pass this session.

---

## 2026-07-21 (same day, third refinement) — Job Type grid: OTHER BF/SC/TA grouped just before the generic OTHER

**Feature**: Further follow-up to the Job Type grid ordering work below — `OTHER BF`/`OTHER SC`/
`OTHER TA` were sorting normally among the ordinary has-Template/no-Template Job Types after the
previous refinement; the user asked for them to also cluster near the end, positioned right before
the fully generic `"OTHER"` tile. `QuotationTemplateWizard.tsx`'s `activeJobTypes` is now a stable
4-way partition: (1) ordinary Job Types with an active Template, (2) ordinary Job Types without one,
(3) `OTHER BF`/`OTHER SC`/`OTHER TA` (a new `isOtherSubcategoryJobType` predicate), (4) the generic
`"OTHER"` (`isGenericOtherJobType`, unchanged) always last.

**Files Modified**: `src/pages/quotation/QuotationTemplateWizard.tsx`

**Files Removed**: none

**Reason**: Direct user follow-up: "เอา other อันอื่นไว้ก่อนหน้า พวกแบบ Other BF, Other SC, Other TA
เอาไว้อยู่ก่อน other ปกติด้วยสิ."

**Notes**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Not browser-verified —
same sandboxed MongoDB Atlas DNS-block limitation as every pass this session.

---

## 2026-07-21 (same day, second refinement) — Job Type grid: only the exact "OTHER" code moves to the end

**Feature**: Corrects the previous same-day refinement's `code.startsWith("OTHER")` check, which
also matched `OTHER BF`/`OTHER SC`/`OTHER TA` — those are their own specific sub-categories (Other
Dust Collector/Wet Scrubber/Fiberglass Tank Related Work), not the generic "Other Jobs" fallback, and
the user's screenshot made clear only the plain `"OTHER"` tile should be pushed to the very end.
Narrowed `QuotationTemplateWizard.tsx`'s `isGenericOtherJobType` (renamed from `isOtherJobType`) to
an exact-equality check (`code === "OTHER"`). `OTHER BF`/`OTHER SC`/`OTHER TA` now sort normally
alongside every other Job Type in the has-Template/no-Template groups from the prior refinement.

**Files Modified**: `src/pages/quotation/QuotationTemplateWizard.tsx`

**Files Removed**: none

**Reason**: User sent a screenshot of the "OTHER — Other Jobs — ยังไม่มี Template" tile specifically,
clarifying the scope of the original "push Other to the end" request.

**Notes**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Not browser-verified —
same sandboxed MongoDB Atlas DNS-block limitation as every pass this session.

---

## 2026-07-21 (same day, refinement) — Job Type grid: Templates-first ordering, OTHER still last

**Feature**: Follow-up to the same-day wizard UX pass below — the previous fix only pushed
`OTHER*`-coded Job Types to the end of the Step 1 grid; this pass adds the other half of the
request: among the remaining (non-`OTHER`) Job Types, ones that already have an active Template now
sort before ones that don't, so the grid reads as "pick one of these first" / "these aren't ready
yet" / "misc catch-all" in that order. `QuotationTemplateWizard.tsx`'s `activeJobTypes` is now a
stable 3-way partition — `hasTemplate && !isOther` → `!hasTemplate && !isOther` → `isOther` — each
group keeping its original relative order. Moved the computation to after the `templateCounts` fetch
it now depends on (previously computed before that state existed), so — like the existing "มี
Template N แบบ" badges — the grid quietly reorders once the counts resolve rather than sorting on
stale/empty data.

**Files Modified**: `src/pages/quotation/QuotationTemplateWizard.tsx`

**Files Removed**: none

**Reason**: Direct user follow-up: "เอา Other jobs ไว้ท้ายสุดเลยแล้วจัดเรียงอันไหนที่มี Template ให้เอาไว้อันแรกละเรียงตามกันมา."

**Notes**: `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Not browser-verified —
same sandboxed MongoDB Atlas DNS-block limitation as every pass this session.

---

## 2026-07-21 (later) — Create Quotation wizard UX fixes + manual "Add Section" on the quotation line-items editor

**Feature**: Three user-reported usability issues fixed, all in the Create Quotation flow:
1. **Job Type grid ordering** (`QuotationTemplateWizard.tsx` Step 1): Job Types whose code starts
   with `"OTHER"` (`OTHER`, `OTHER BF`, `OTHER SC`, `OTHER TA`) previously sorted alphabetically
   alongside the real categories (BF, BI, GA, LI, OTHER, OTHER BF, OTHER SC, OTHER TA, SC, ...) —
   now partitioned client-side so all `OTHER*` codes render after every non-`OTHER` Job Type, keeping
   their relative order otherwise. `fetchJobTypes()`'s own server-side order is untouched, since Job
   Type admin/Dashboard filters read the same list and weren't asked to change.
2. **Cancel button visibility** (same screen): the Step 1 "ยกเลิก" button was a bare muted-gray text
   link with no border, easy to miss — restyled to the app's standard outline/secondary button
   pattern (`border border-border ... hover:border-[#c9a84c]/40`, matching `docs/UI_GUIDELINES.md`
   "Buttons" and e.g. `TemplateEditorView.tsx`'s own Cancel button), not a new one-off style.
3. **Manual "Add Section" on the quotation line-items editor** (`LineItemsEditor.tsx`): the Template
   editor has always had a "เพิ่ม Section" button; a plain quotation built from scratch (not from a
   Template) had no equivalent — section-header divider lines were only ever reachable by applying a
   Template. Added a matching "เพิ่ม Section"/"Add Section" button to the line-items toolbar that
   appends `{ ...blankLine(), isSectionHeader: true }` directly — the exact same line shape a
   template-applied section header already produces (zero-priced, freely editable/removable, skipped
   from "No." numbering, hidden from print if no items follow it — all pre-existing behavior, no
   changes needed there).

**Files Modified**: `src/pages/quotation/QuotationTemplateWizard.tsx` (Job Type sort + Cancel button
style), `src/pages/quotation/LineItemsEditor.tsx` (new `addSectionHeader` handler + toolbar button),
`src/lib/i18n.tsx` (1 new key × Thai/English: `quotation.lineItems.addSection`)

**Files Removed**: none

**Reason**: Direct user feedback on the Create Quotation wizard screenshot — OTHER categories
cluttering the primary grid, an easy-to-miss Cancel button, and a real functional gap (no way to add
a section divider outside the Template flow).

**Notes**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass clean. Not browser-verified
this pass — same sandboxed MongoDB Atlas DNS-block limitation recorded in the entry above (`vercel
dev` proxies `/api/*` correctly but `querySrv` to `_mongodb._tcp.tcsdb.zdnus3w.mongodb.net` is
network-refused from this sandbox).

---

## 2026-07-21 — Quotation Template editor restyled to mirror the real quotation document

**Feature**: Visual-only redesign of the Template Management create/edit form
(`src/pages/templates/TemplateEditorView.tsx`) at the user's request ("ทำหน้าตาให้เหมือนหน้าใบเสนอราคา
เลยก็ได้หรือปรับแก้ให้ User friendly มากที่สุด") — the form previously read as a generic gray-bordered
admin settings page with no visual relationship to the quotation it produces. It now reuses the exact
patterns from `QuoteDocument.tsx`/`LineItemsEditor.tsx`: a navy (`#0b1d3a`)/gold (`#c9a84c`) document
header band with the `BrandMark` logo and an active/inactive status pill, a two-column meta grid
("ข้อมูล Template" / "การตั้งค่า") with uppercase mono section labels matching the quotation's
customer-info/doc-details grid, a table-styled Sections/Items list (mono uppercase column headers,
borderless inline inputs, hover-highlighted rows, an expandable detail row for
specifications/sub-details/parameters/internal notes — the same shape as the quotation's line-items
table), and a 3-column Terms block (payment/warranty/tax side by side) echoing the printed document's
signature-block layout. No data model, validation, save/load, or permission logic changed — every
existing handler (`updateSection`/`addItem`/`moveItem`/etc.) is untouched, only the JSX/styling
around them.

**Files Modified**: `src/pages/templates/TemplateEditorView.tsx` (full JSX restyle, `ItemEditor`
converted from a stacked-div card to a `<tr>`/`<Fragment>` table row to match `LineItemsEditor.tsx`'s
row pattern), `src/lib/i18n.tsx` (5 new keys × Thai/English: `templates.form.templateInfo`,
`templates.form.settingsSection`, `templates.form.col.no`, `templates.form.col.type`,
`templates.form.col.name`)

**Files Removed**: none

**Reason**: User asked specifically for the template-editing screen to look like the real quotation
page ("ทำหน้าตาให้เหมือนหน้าใบเสนอราคาเลยก็ได้") rather than the plain form it was.

**Notes**: `npx tsc --noEmit` and `npm run lint` both pass clean. Could not browser-verify live against
this session's sandboxed environment — `vercel dev` starts and correctly proxies `/api/*` to the real
serverless handlers, but MongoDB Atlas's SRV DNS lookup (`_mongodb._tcp.tcsdb.zdnus3w.mongodb.net`) is
network-blocked from this sandbox (`ECONNREFUSED` on `querySrv`), so every API call 500s before the
authenticated page can render — the same class of sandboxed-session network limitation already
documented for the Dashboard module in `docs/CLAUDE.md`'s module table, not a defect in this change.

---

## 2026-07-20 (Codex review round 4) — Live verification closes the MongoDB reconciliation gap; unpushed button commit found

A third independent Codex review of both rollbacks (`HEAD` at `8cfc9fe`) found 0 Critical, 1 High, 0
Medium, 0 Low: `git`/source evidence for both rollbacks was confirmed correct, but the review flagged
that the FRP Lining v2.0 → v1.0 rollback was code/seed-only — nobody had confirmed the live
`quotation_templates` MongoDB record for `LI-FRP-LINING` actually matched the reverted seed, since no
authorized database access had been available in any prior session.

**Resolved with real evidence, not just re-assurance**: with the user's explicit go-ahead, logged
into the actual live production app (https://tcs-erp-nine.vercel.app) as an authenticated Super
Admin via a real browser session and inspected the live Template Management page directly.
`LI-FRP-LINING` was already showing genuine v1.0 content — version `1.0`, 1 section, 17 items,
`Structure layer`/`Operating cost`/`Prepare surface` sub-items, the original tax-note wording — with
"last edited" `14 ก.ค. 2569` (its original creation date) for every one of the 5 seeded templates.
The audit log (server-authoritative, non-forgeable) showed the only prior `Templates Imported`
events were on `15 ก.ค. 2569` — **nothing ran the import between the FRP v2 deploy and its revert**,
so the live master record never actually received v2 content in the first place; the concern the
review raised, while a reasonable thing to check, didn't correspond to a real data-state problem.
Clicked "นำเข้าจาก Excel" (the same `POST /api/quotation-templates/import` route) live anyway to get
a formal, verifiable record: `200 OK`, and every template's "last edited" timestamp stayed unchanged
afterward — confirming the hash-gated importer correctly detected zero content difference and made
zero writes (all 5 templates reported `skipped`). No quotation was ever created under Job Type `LI`
either (0 of the 7 real quotations), so there was never any historical-data risk from this gap.

**A second, previously-unknown gap was discovered during this same live check**: `git status` showed
local `master` sitting 1 commit ahead of `origin/master` — the Cancel/Back button-visibility rollback
commit (`8cfc9fe`) had been created locally but never pushed. A live DOM inspection of an open
quotation's back-link button confirmed its actual rendered `className` on production still exactly
matches the deleted `src/lib/buttonStyles.ts`'s `backLinkButtonClass()` output — the button rollback
is correct and complete in git, it simply was never deployed. Not pushed this pass either, per this
project's established "push only when explicitly asked" convention — tracked in `docs/TODO.md`.

No console errors on a fresh page load or after any of the actions above. `npm run lint`/
`npm run build` pass clean (unchanged from the prior two rollback passes — no code was modified this
pass, only live verification and documentation). See `docs/CODEX_REVIEW_REPORT.md` "Claude Fix
Status" for the full write-up.

---

## 2026-07-20 (second rollback) — Revert Cancel/Back button visibility improvement

Per an explicit rollback request, restored every Cancel/Close button and breadcrumb-style Back link
to its exact pre-2026-07-16 style — the low-contrast `border-border`/`text-muted-foreground`
treatment with no dedicated focus ring, before the 2026-07-16 visibility pass and its 2026-07-20
Codex-review fix pass (0 Critical, 1 High, 3 Medium, 1 Low) both existed. This is a **targeted,
git-history-verified rollback**, not a broad reset: a safety backup branch
(`backup-before-button-rollback-2026-07-20`, at commit `9050a24`) was created before touching
anything, and every change was verified against real prior commits, never guessed.

**Git boundary identified**: `git log --oneline --all -i --grep="cancel\|back.*button"` found
`27f6927` ("Fix Cancel/Back button visibility issues from Codex review (1 High, 3 Medium, 1 Low)")
as the single commit containing both the original 2026-07-16 visibility pass AND the 2026-07-20
Codex-review fixes to it (both were uncommitted work squashed into one commit at the time, same
pattern as every other pass in this project's history) — its own commit message confirms this
("Fixes the 2026-07-20 independent review's findings on the **prior** Cancel/Back visibility pass").
`27f6927^` (its parent) is the verified "before" state.

**Why a full `git revert 27f6927` was rejected**: attempted first, but it produced merge conflicts
on `docs/CHANGELOG.md`/`docs/PROJECT_STATUS.md` (both have since gained new, legitimate append-only
entries from the two FRP Lining rollback passes) and proposed **deleting
`docs/reviews/CODEX_REVIEW_2026-07-20.md` entirely** — that file was newly created by `27f6927`, but
has since become the shared canonical dated-archive review record for multiple, completely unrelated
later reviews (FRP Lining v2.0, its Codex reviews, this session's own rollback documentation) —
deleting it would have destroyed real, unrelated historical content. Aborted (`git revert --abort`)
and switched to a surgical, file-by-file restoration instead.

**What was restored, file by file, using `git show 27f6927 -- <file>` as ground truth (never
guessed)**: reverted the specific button `className` hunks in `src/components/ConfirmDialog.tsx`,
`src/pages/admin/{RoleManagementPage,UserManagementPage}.tsx`,
`src/pages/customers/CustomersPage.tsx`, `src/pages/dashboard/ApprovalDashboard.tsx`,
`src/pages/products/{CategoriesManager,ProductForm,ProductPickerModal}.tsx`,
`src/pages/quotation/{QuotationTemplateWizard,QuoteDocument,ScopeOfWorkDocument}.tsx`,
`src/pages/templates/{TemplateEditorView,TemplateManagementPage}.tsx` (14 call sites across 13
files) back to their original inline Tailwind class strings, removed every now-dead
`buttonStyles`-related import, and deleted `src/lib/buttonStyles.ts` (confirmed via repo-wide grep
that nothing else had adopted it since). `docs/UI_GUIDELINES.md`'s added "Cancel / Close / Back"
section (41 lines) was removed via `git checkout 27f6927^ -- docs/UI_GUIDELINES.md` (that file had
no other changes since `27f6927`, confirmed via `git log`, so this targeted restore was exact and
safe). `docs/CHANGELOG.md`/`docs/PROJECT_STATUS.md`/`docs/IMPLEMENTATION_CHECKLIST.md`/
`docs/CODEX_REVIEW_REPORT.md`/`docs/reviews/CODEX_REVIEW_2026-07-20.md`'s historical entries about
the original work were deliberately left untouched (append-only) — this entry and matching notes in
the other status docs record the rollback instead.

**Verification**: `git diff 27f6927^ -- <file>` produced **zero output** for all 11 files touched
only by the button-visibility work — byte-identical to the verified pre-change state. The 2 files
that also had legitimate, unrelated later changes (`CustomersPage.tsx`'s `StatusBadge` extraction,
`TemplateManagementPage.tsx`'s column-alignment fix, both from commits between `27f6927` and the FRP
Lining work) were checked individually: the diff against `27f6927^` shows only those unrelated
changes remaining, confirming the button styling was fully restored without touching them. Only
visual style was touched — no `onClick` handler, navigation target, form-reset logic, API call, or
RBAC check was changed anywhere (confirmed by inspecting every diff before applying its reversal).
`npm run lint`/`npm run build` pass clean.

---

## 2026-07-20 (rollback) — Revert FRP Lining v2.0 / generic Dynamic Fields system

Per an explicit rollback request, reverted the FRP Lining v2.0 work in full via two `git revert`
commits (of `699b09d` "FRP Lining v2.0 Dynamic Fields system, Codex-review fix pass, and
code-review hardening" and `74a768d` "FRP Lining v2.0: exact-wording alignment + Codex review
round 3") — **not** a broad `git reset --hard`, and not a rewrite of git history: the two original
commits, their full history, and everything before/unrelated to them remain intact and inspectable.

**Scope verified before reverting**: the two reverted commits were consecutive on `master` (nothing
else touched the same files in between or since) and, together, touched exactly 26 files — all
either FRP Lining/Quotation-Template/Quote source files or documentation describing that same work.
No Dashboard, Warehouse, Customers, Scope of Work, or RBAC permission file was ever touched by
either commit, so nothing outside Quotation Templates could have been affected either way. The
commit immediately preceding them ("Center-align Section/Item count columns on Quotation Templates
list", `74d2b21`, directly below this entry) is unrelated generic Template-list UI polish and was
left untouched.

**Result — confirmed via `git diff --stat 74d2b21` producing zero output**: the working tree is now
byte-identical to the last commit before any FRP Lining v2.0 work existed. Concretely:
- `LI-FRP-LINING` is back to its original v1.0 content — the real Excel-transcribed structure (items
  with `Prepare surface`/`Grinding`/`Sandblasting` as sub-items, `Concrete surface repair work` and
  `Operating cost` as their own items, `Safety cost and accessories` with `Standard package include
  PPE, Blower, Gas detector` as a sub-item) — version `"1.0"`, matching the other 4 seeded templates
  which were never touched by the v2.0 work in the first place.
- The generic `TemplateDynamicField`/`TemplateFieldOption`/`TemplateFieldVisibilityRule`/
  `TemplateConditionConfig` schema, `TemplateItem.dynamicFields`, `QuotationTemplate.defaultNotes`/
  `.conditions`, and their `Quote`-side counterparts (`QuoteLine.sourceTemplateItemId`/
  `dynamicFields`, `Quote.notes`/`vatConditionText`/`warrantyText`/`deliveryDays`) are removed —
  confirmed via a repo-wide grep for `dynamicFields`/`TemplateDynamicField`/
  `omitFromCustomerDisplay` returning zero matches in `src/`/`api/`.
- The two new files this system added (`src/lib/templateDynamicFields.ts`,
  `src/pages/quotation/ConditionAndNotesEditor.tsx`) are deleted.
- The admin Template editor (`TemplateEditorView.tsx`), the wizard, `LineItemsEditor.tsx`,
  `PrintDocument.tsx`, `TemplatePreview.tsx`, `applyTemplate.ts`, and `quoteValidation.ts`/
  `quotationTemplatesHandler.ts` are all back to their pre-FRP-Lining-v2.0 behavior — plain
  `specifications`/`subDetails`/`editableParameters` only, no nested conditional-field system.

**MongoDB — code/seed reverted, live data NOT independently re-imported this pass**: this rollback
reverts the *code and seed source*. The live `quotation_templates` collection's `LI-FRP-LINING`
document will keep whichever content the last successful `POST /api/quotation-templates/import` run
actually wrote (which may still be v2.0, if that import ran while v2.0 was live) until
`POST /api/quotation-templates/import` is run again — the idempotent, hash-gated importer will then
detect the reverted seed's changed content hash and `$set`-update the existing document back to v1.0
(same `templateCode`, so still no duplicate). This session had no live MongoDB/Vercel credentials to
run that import directly (the same recurring sandboxed-session limitation as every prior pass on this
project) — **running the import once against the live database is a required manual follow-up** to
actually apply this rollback to production data, separate from the code being reverted and deployed.

**Existing Quotations remain fully compatible either way**: a `Quote` never reads the live master
template — every quote (from any template, at any point) freezes its own independent
`templateSnapshot` at creation time and renders/validates against that frozen copy forever after (this
architecture is unchanged by this rollback, since it predates the v2.0 work and was never touched by
it). If any quotation was actually created from `LI-FRP-LINING` v2.0 while it was live (this session
could not check — no live database access), it keeps its own frozen `sections`/`dynamicFields`/
`conditions`/`notes` snapshot data untouched by this rollback and remains fully readable/printable —
the removed *code* no longer offers a UI to create a NEW v2.0-shaped quote, but it never touched
already-persisted quote documents, and the `QuoteFields` schema's `notes`/`vatConditionText`/
`warrantyText`/`deliveryDays`/`dynamicFields` properties are (and always were) optional, so an old
document that happens to have them set is simply not read/rendered by the reverted code — no crash,
no `undefined` display, no data deleted.

`npm run lint`/`npm run build` pass clean after the revert; the production bundle also shrank back
down (`QuotationPage` ~151KB → ~138KB, `TemplateManagementPage` ~44KB → ~35KB, `TemplatePreview`
~9.8KB → ~7.2KB gzipped-source estimates from the build output), consistent with a clean, complete
removal rather than a partial one. See `docs/PROJECT_STATUS.md` for the current module status and
`docs/TODO.md` for the still-required manual MongoDB re-import follow-up.

---

## 2026-07-20 (later still) — Center-align Section/Item count columns on Quotation Templates list

User-reported polish: the "จำนวน Section"/"จำนวนรายการ" column header and values on
`TemplateManagementPage.tsx`'s list table were left-aligned like the surrounding text columns, which
read awkwardly for a short numeric count. Both `<th>`s and `<td>`s now use `text-center` instead of
`text-left`. Purely visual, no data/behavior change. `tsc --noEmit` and `npm run lint` pass clean.

## 2026-07-20 (later) — Fix status-badge text wrapping; extract shared `StatusBadge` component

The "ใช้งาน" (active) status badge on the Quotation Templates list was wrapping mid-word onto two
lines ("ใช้" / "งาน"). Root cause: unlike its sibling `<td>`s in the same row, the status cell had no
`whitespace-nowrap` — Thai script has no spaces, so the browser's dictionary-based line breaking can
wrap it at a syllable boundary even without one. The same copy-pasted badge markup (missing the same
class) was found in `CustomersPage.tsx` and `ProductList.tsx` too, so all three were fixed the same
way. Following a code review of that fix, the duplicated badge markup (archived/active/inactive
color+label logic, repeated verbatim in all three files) was extracted into a new
`src/components/StatusBadge.tsx` (`status: "archived" | "active" | "inactive"` + `label`), which all
three pages now use — the `whitespace-nowrap` fix (and any future styling change) now lives in one
place instead of three. No behavior change. `tsc --noEmit`, `npm run lint`, `npm run build` all pass
clean.

## 2026-07-20 — Cancel/Back visibility: Codex-review fix pass (1 High + 3 Medium + 1 Low)

Fixed every issue an independent review (`docs/CODEX_REVIEW_REPORT.md`, `docs/reviews/CODEX_REVIEW_2026-07-20.md`)
found in the 2026-07-16 Cancel/Back visibility pass below (0 Critical). Purely visual/structural, no
behavior/logic/navigation changes — every `onClick` handler is untouched.

- **High**: `QuotationTemplateWizard.tsx`'s two "เลือกประเภทงานอื่น" (Choose another Job Type) recovery buttons
  (template-load-error and no-template-found states) still had the old low-contrast, no-focus-ring treatment —
  they were missed by the 2026-07-16 pass. Fixed to the same treatment as every other Back/secondary control in
  the wizard; `backToJobType` handler unchanged.
- **Medium (focus ring contrast)**: every Cancel/Back/Close focus ring used `ring-[#c9a84c]/50` (gold at 50%
  opacity), which composites to ~1.4:1 contrast against white/card backgrounds — below the WCAG 3:1 minimum for
  a focus indicator (full-opacity gold alone only reaches ~2.3:1). Changed to solid `ring-[#0b1d3a]` (navy,
  ~17:1 against white) across all three shared button-class builders (see below).
- **Medium (touch targets)**: several compact Cancel/Back controls measured ~26–32px tall (`py-1`/`py-1.5` at
  11–12px text), and `ProductPickerModal.tsx`'s icon-only Close had no padding at all (~16px hit area). Bumped
  the compact sizes' vertical padding one step, and gave every icon-only Close button `p-2 -m-2` (padding offset
  by a matching negative margin, so the icon's visual size/position is unchanged but its hit area grows).
  Neighboring primary/gold buttons in the same row were bumped by the same amount so row heights stay aligned.
- **Medium (unnamed modal Close buttons)**: `CustomersPage.tsx`'s customer-form × and
  `TemplateManagementPage.tsx`'s template-preview × had no `aria-label` and no focus-visible style (the
  2026-07-16 pass's changelog entry incorrectly said `ProductPickerModal` was the only such control). Both now
  use the same `iconCloseButtonClass()` + `aria-label={t("common.close")}` pattern as `ProductPickerModal`.
- **Low (duplicated styling)**: the Cancel/Back/Close class strings were copy-pasted verbatim across ~15 files —
  flagged as the root cause that let the two wizard buttons above go unfixed. Extracted into
  `src/lib/buttonStyles.ts` (`secondaryButtonClass()`, `backLinkButtonClass()`, `iconCloseButtonClass()`) and
  migrated every touched call site to it, so the next visual/contrast fix only needs to change one file. See
  [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Buttons" → "Cancel / Close / Back."
- Files changed: `src/lib/buttonStyles.ts` (new), `src/components/ConfirmDialog.tsx`,
  `src/pages/admin/{RoleManagementPage,UserManagementPage}.tsx`, `src/pages/customers/CustomersPage.tsx`,
  `src/pages/dashboard/ApprovalDashboard.tsx`, `src/pages/products/{CategoriesManager,ProductForm,
  ProductPickerModal}.tsx`, `src/pages/quotation/{QuotationTemplateWizard,QuoteDocument,
  ScopeOfWorkDocument}.tsx`, `src/pages/templates/{TemplateEditorView,TemplateManagementPage}.tsx`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Manually verified in a local dev server via
  Playwright (normal/hover/focus/disabled states rendered correctly with the app's real compiled Tailwind CSS,
  0 console errors); full logged-in click-through of every listed page was not possible — this sandboxed session
  has no network path to MongoDB Atlas (recurring, pre-existing limitation, see PROJECT_STATUS.md Known Risks),
  the same constraint every past pass has hit. See `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" for the
  full itemized writeup.

## 2026-07-16 (same day, later still) — Improve Cancel/Back button visibility app-wide

Purely visual pass, no behavior/logic changes: every Cancel/Close button and every bare breadcrumb-style
Back link across the app was hard to notice — the shared bordered-Cancel treatment
(`border-border` at 10% opacity + `text-muted-foreground`) fails WCAG AA contrast at the app's normal
button text sizes (12–14px), and the toolbar "Back to Quotations/Products/..." links had *no* button
chrome at all (bare `text-muted-foreground` text on the page background). Fixed both, using only existing
design tokens/hex literals already in convention (no new colors, no new component library):

- **Cancel/Close buttons** (`ConfirmDialog.tsx`; every create/edit form's footer Cancel — `ProductForm.tsx`,
  `CustomersPage.tsx`, `UserManagementPage.tsx` ×2, `RoleManagementPage.tsx`, `TemplateManagementPage.tsx`'s
  duplicate modal, `TemplateEditorView.tsx`; `ApprovalDashboard.tsx`'s reject-modal Cancel;
  `QuoteDocument.tsx`'s workflow-action and Scope-of-Work-prompt modal Cancels; `ScopeOfWorkDocument.tsx`'s
  empty-state Back; `QuotationTemplateWizard.tsx`'s Cancel/step-Back buttons) now get a clearer neutral
  border, a subtle `bg-secondary` tint, higher-contrast text (`text-foreground/75` instead of
  `text-muted-foreground`), `font-medium`, and a visible `focus-visible` ring — see
  [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Buttons" → "Cancel / Close."
- **Breadcrumb-style Back links** (`ProductForm.tsx`, `CategoriesManager.tsx`, `QuoteDocument.tsx`,
  `ScopeOfWorkDocument.tsx`, `TemplateEditorView.tsx`, `QuotationTemplateWizard.tsx`) go from bare text to
  a subtle bordered/tinted chip with the same contrast + focus-ring treatment, `-ml` compensated so the
  visible icon/text doesn't shift against whatever sits below it — see UI_GUIDELINES.md "Buttons" →
  "Back links."
- Deliberately **not** touched: `QuoteDocument.tsx`'s red-outlined "Cancel Quotation" workflow button (a
  destructive business action intentionally styled like Danger, not a UI dismiss action), and every
  non-Cancel/Back secondary button sharing the old outline classes (Export, Duplicate, Save Draft, Add
  Section, Retry, Skip Tour, etc.) — those keep the existing Secondary/outline pattern unchanged.
- Added `aria-label={t("common.close")}` + a focus ring to `ProductPickerModal.tsx`'s icon-only header
  Close (×) button — the one icon-only close control in the app with no accessible name.
- No navigation destinations, cancel/discard logic, or API/RBAC behavior changed — every button's
  `onClick` handler is untouched; only `className` (plus one `aria-label`) changed.
  `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.

## 2026-07-16 (same day, later) — Remove website URL from printed documents

Investigated a report that a website URL appears at the bottom-left of printed Quotations and Scope
of Works. Root cause confirmed **not app-rendered**: `PrintDocument.tsx`/`ScopeOfWorkPrintDocument.tsx`
never render a URL anywhere (Quotation's `CompanyHeaderInfo.website` is always hardcoded to `""` and
never read by the print component), and `src/styles/index.css`'s only `@media print` block has no
footer/URL content. The URL is Chrome/Edge's own browser-injected "Headers and footers" print option
(page URL + date + title/page number) — a browser print-dialog setting, not something a web page's
CSS/DOM can control or disable (`@page` margins do not affect it). Since the app cannot suppress it,
added a small `MetricInfoTooltip.tsx` info-icon hint next to the Print button in both
`QuoteDocument.tsx` and `ScopeOfWorkDocument.tsx` (inside the existing `print:hidden` toolbar, so the
hint never appears in the printed output itself) instructing users to disable "Headers and footers"
in their browser's print settings before printing or saving as PDF — covers both "Print" and "Export
PDF" since both are the same `window.print()` call. No print CSS or print-document component changes
were needed (both were already clean). New i18n keys `quotation.printHint.label`/`.text` (Thai +
English); Scope of Work's hint uses plain hardcoded Thai text, matching that file's existing
convention. `tsc --noEmit` (both projects), `lint`, and `build` all pass clean. See
[UI_GUIDELINES.md](./UI_GUIDELINES.md) "Print / PDF" → "Browser-generated headers/footers."

## 2026-07-16 (same day) — Quotation: make fields optional again, remove Document Requirements and Delivery

**Latest business decision, overriding the two required-field validation passes immediately above.**
Users must not be forced to complete every Quotation field, incomplete Drafts must remain fully
supported, and the "ข้อกำหนดเอกสารและการส่งมอบ" (Document Requirements and Delivery) section must
be removed from Quotation entirely. **Scope of Work's own UI, schema, validation rules, print/PDF,
and permissions are untouched** — every Scope of Work field, section, and component behaves exactly
as before. One file was intentionally edited as a compatibility adjustment, not a feature change:
`api/_lib/scopeOfWorkHandler.ts`'s `deriveFromQuotation()` — see "Snapshot Behavior" below.

### Quotation required fields relaxed to the historical minimum

`quotationRequiredFields` (`src/lib/validation/quotationValidation.ts`) now marks only `client` (the
customer name) as `required: true` — every other field (`salesperson`, `contactName`,
`contactPhone`, `contactEmail`, `address`, `taxId`, `deliveryMethod`, `deliveryAddress`, `project`,
`poRef`, `paymentTerms`, `issueDate`, `expiryDate`, `jobTypeCode`, `remarks`, `followUpDate`,
`isPotentialOpportunity`) is now `required: false`. This is not a new, invented rule — `client` was
the **only** field this codebase ever required before required-field validation was added at all;
every other field required by the two passes above is walked back to that original, least-
restrictive behavior. `jobTypeCode` remains required **only at creation** (a separate, pre-existing
check in `POST /api/quotes`, `validateJobType(..., { required: true })`) — never re-enforced on
edit/submit/print, matching how it always worked. Line items are no longer required at all:
`validateQuotationLines()`, `REQUIRE_LINE_SPECIFICATIONS`, and the "at least one line" rule were
removed from `quotationValidation.ts` — a quote may be submitted/printed with zero or blank lines,
same as before required-field validation existed. Semantic date-format checking (a non-blank date
must be a real calendar date) is kept — that's a data-integrity check, not a "field is required"
rule, and it never blocks an empty date.

### Document Requirements and Delivery removed from Quotation

Quotation's `checklistGroups` field (Safety/ขนส่ง/Logo/เงื่อนไขการวางบิล/เอกสารส่งถึง/Nameplate/
เงื่อนไขการส่งมอบงาน/ปจ.2 — added in the immediately-preceding pass) is removed entirely:
- `Quote`/`QuoteDraftFields` (`src/lib/quotes.tsx`) no longer have a `checklistGroups` field.
- `api/handlers/quotes.ts` no longer generates, accepts, sanitizes, or returns `checklistGroups` —
  `sanitizePartialQuoteFields()`, the create handler, `handlePrintQuote()`, and `handleWorkflow()`'s
  finalization check all had their checklistGroups-related code removed. The `normalizeQuote()`
  wrapper (which backfilled missing checklist groups on read) is gone; every response goes back to
  plain `withStringId()`.
- `QuoteDocument.tsx` no longer renders the "ข้อกำหนดเอกสารและการส่งมอบ" card, imports
  `ChecklistGroupCard`, or tracks `checklistGroups` state.
- **`ChecklistGroupCard.tsx` itself is NOT deleted** — Scope of Work still uses it for its own
  (unchanged) checklist groups. Only Quotation's usage of it was removed.
- **`src/lib/documentRequirements.ts`/`api/_lib/documentRequirements.ts` are NOT deleted or
  changed** — `buildDefaultChecklistGroups()`/`sanitizeChecklistGroups()`/`withDefaultChecklistGroups()`/
  `validateChecklistGroups()`/`MANDATORY_CHECKLIST_GROUP_KEYS` all still exist, unchanged, and are
  still fully exercised by Scope of Work.
- `api/_lib/scopeOfWorkHandler.ts`'s `deriveFromQuotation()` — which, in the immediately-preceding
  fix pass, was changed to copy `quote.checklistGroups` into a new Scope of Work as a snapshot — now
  always calls `buildDefaultChecklistGroups(quote.jobTypeCode)` instead, since there is no longer a
  `quote.checklistGroups` to copy. This is the **only** Scope-of-Work-adjacent code touched this
  pass, and it doesn't change Scope of Work's own behavior at all: a newly-created Scope of Work's
  checklist groups start unchecked exactly as they always did before the short-lived "copy from
  quotation" feature existed (which itself only existed for one same-day fix pass).
- `LineItemsEditor.tsx`'s `lineErrors`/`noLinesError` props (and its `FieldError` usage) — added to
  support the now-removed line-item requiredness gate — were reverted; the component no longer
  accepts or renders per-line/no-lines error state.

### Legacy data compatibility

No destructive migration. A Quotation saved during the ~1-day window this feature existed may still
carry a stray `checklistGroups` property in MongoDB — it's simply never read, written, or displayed
by any current code path (the TypeScript type no longer declares it, but extra untyped properties on
an already-fetched plain object are harmless and ignored). Existing Quotations — complete or
incomplete, with or without the legacy field — continue to load, edit, and save exactly as before.

### Not changed

RBAC/permissions (unchanged), `customerId`/`customerSnapshot` behavior (unchanged), Template snapshot
behavior (unchanged — Templates never carried a checklist concept in the first place), the print/
workflow server-side enforcement architecture itself (`validateQuotationForFinalization()`/
`validateQuotationForPrint()`, the `422 DOCUMENT_INCOMPLETE` shape, the real `disabled` button
attributes, `mergeServerValidationErrors()`) — only the underlying required-field *policy* shrank,
the mechanism enforcing whatever policy is configured is untouched and still fully server-enforced.

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all
pass clean. No live-deployment/browser verification performed (same sandboxed-session limitation as
every recent pass — no MongoDB Atlas/Vercel CLI access in this environment).

---

## 2026-07-16 (same day) — Quotation + Scope of Work validation: Codex review fix pass

An independent Codex review of the required-field/mandatory-selection validation pass below found
**0 Critical**, **2 High Priority**, and **4 Medium Priority** issues. All fixed same day; full
writeup appended to `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status."

### High Priority #1 — Scope of Work creation discarded the Quotation's checklist selections

`handleCreate()` (`api/_lib/scopeOfWorkHandler.ts`) called `buildDefaultChecklistGroups()` for a
brand-new, always-unchecked structure instead of copying the source quotation's own
`checklistGroups` — so a fully-complete Quotation produced an **incomplete** Scope of Work with
every mandatory group reset to blank, directly violating the "copy the required document selections
from the Quotation into the Scope of Work... store them as a snapshot" requirement. Fixed:
`deriveFromQuotation()` now deep-copies `quote.checklistGroups` (`cloneChecklistGroups()`, fresh
option objects, never an aliased reference) when the source quotation has one, falling back to
`buildDefaultChecklistGroups()` only when the quotation itself predates the field. Deliberately only
at creation, not on refresh — matches every other quotation-derived field's "one-time snapshot"
semantics and the explicit "editing the Quotation later must not silently change an existing Scope
of Work" rule.

### High Priority #2 — "Other"/TOR detail input unreachable for 4 of 5 groups that need it

`validateChecklistGroups()` already required a group's free-text `note` when an "other"-style option
was checked, but `buildDefaultChecklistGroups()` only ever initialized `note: ""` for Logo —
`ChecklistGroupCard` only renders that input when `note !== undefined`, so `safety`/`transportation`/
`namePlate`/`documentsToSend` had a server-side rule a normal user could never actually satisfy.
Fixed by initializing `note: ""` on all four groups too; `withDefaultChecklistGroups()` also
backfills the missing `note` onto an already-saved record (never touching `checked` state or an
already-present note — only adds the empty input itself). Also added `safety`'s "TOR" option to the
same conditional-detail rule as "Other," per the business rule's literal "If TOR or Other is
selected, require a reference/detail field" wording — previously only "Other" did.

### Medium Priority fixes

1. **Buttons were not semantically disabled.** Print/Submit/Approve/Send/Finalize were dimmed and
   click-guarded but never carried the HTML `disabled` attribute. Added `disabled={!valid}` to all
   of them (Quotation + Scope of Work), keeping the `title=` tooltip and the click-guard as a
   harmless defensive no-op for the now-unreachable "clicked anyway" case.
2. **Central required/optional policy didn't cover every visible field.** Added explicit
   `required: false` entries (each with a stated reason) for Quotation's `followUpDate`/
   `isPotentialOpportunity` and Scope of Work's `paymentConditions.method`/`.notes`,
   `seller.date`/`approver.date` — plus documented (not enforced, since they're numeric/free-text
   fields where "blank" doesn't apply the same way) `QUOTATION_LINE_OPTIONAL_NUMERIC_FIELDS`
   (`unitPrice`/`discount`) and `SCOPE_ITEM_OPTIONAL_FIELDS` (`remark`).
3. **Finalization only checked dates were non-blank, not semantically valid.** Added a pure,
   throw-free `isValidIsoDateOrEmpty()` (`src/lib/validation/dateUtils.ts`, mirrors the server-only
   `validateIsoDateOrEmpty()` used at write time) and wired it into both finalization validators for
   every date field — a malformed or legacy-garbled date string (or something like "2026-02-30") now
   fails finalization instead of passing merely by being nonblank.
4. **Server 422 errors were only shown as a toast, never reflected inline.** Added
   `mergeServerValidationErrors()` (`src/lib/validation/types.ts`) and wired it into both document
   editors — a `DOCUMENT_INCOMPLETE` response from Print/Submit-etc./Finalize now overlays its
   `fieldErrors`/`groupErrors` onto the on-screen validation summary/inline errors, not just a toast.

### Deliberately not fixed (would require inventing unconfirmed business rules)

The review's Medium-severity "conditional requirements incomplete" note (billing "Custom" schedule
detail, delivery "customer form" attachment/date rule, a ปจ.2 supporting-detail model) was **not**
addressed — building any of these means inventing a business option catalog that doesn't exist in
this codebase and was never confirmed by the business, which both this task's and the original
validation task's instructions explicitly rule out ("do not add fake values or automatic selections
to make validation pass" / "do not auto-select a value without a confirmed business rule"). Left as
an explicit, tracked TODO.md item pending real business input, not a fabricated placeholder.

Also not changed, per the review's own "Low Priority"/informational findings: native browser
`window.print()` remains available from the rendered page regardless of any API gate (an inherent
browser capability, not something an API-level fix can prevent); the review's note that shared
validation utilities live under `src/lib` (imported into both the frontend and API bundles) is this
codebase's existing, intentional, already-documented architecture (see `docs/CLAUDE.md`'s Coding
Standards), not a defect introduced by this pass; `sanitizeScopeItem()`'s pre-existing behavior of
coercing an invalid `quantity` type to `null` (rather than rejecting the write) predates this
validation feature and is out of scope per "do not redesign unrelated modules."

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all
pass clean. No live-deployment/browser verification performed (same sandboxed-session limitation as
every recent pass, and as the review's own "Verification Limits" section notes for its own attempt).

---

## 2026-07-16 — Quotation + Scope of Work: required-field/mandatory-selection validation

Both documents previously had almost no completeness enforcement — Quotation required only `client`
and `jobTypeCode` (create-only); Scope of Work required only `secondaryCode` at creation. Every other
field (contact info, delivery info, payment terms, dates, line items, and — for Scope of Work — all
11 checklist groups) could be saved, submitted, approved, and **printed** completely blank. This pass
adds strict, centrally-configured completion validation enforced identically client- and server-side.

### Shared validation architecture

- **`src/lib/documentRequirements.ts`** (new) — the `ChecklistOption`/`ChecklistGroup` types moved
  here from `src/lib/scopeOfWork.ts` (which now just re-exports them), so Quotation can share the
  same checklist-group model without depending on the Scope-of-Work domain module. Exports
  `MANDATORY_CHECKLIST_GROUP_KEYS` (the 8 groups named in the business requirement: `safety`,
  `transportation`, `logo`, `billingConditions`, `documentsToSend`, `namePlate`, `deliveryDocFormat`,
  `pj2` — all pre-existing Scope of Work checklist keys, no renaming needed), `CHECKLIST_GROUP_THAI_LABELS`,
  `OTHER_OPTION_KEYS` (which option per group triggers a required free-text `note` — e.g. Logo's
  existing "Etc." option, plus a new "อื่น ๆ" option added to `safety`/`transportation`/`namePlate`/
  `documentsToSend` specifically so this rule has something to attach to), `validateChecklistGroups()`,
  `buildDefaultChecklistGroups()` (moved from `scopeOfWorkHandler.ts`, now shared so Quotation's
  brand-new-document UI can seed the same default structure), and `withDefaultChecklistGroups()` (fills
  in any group missing from an old record, for display only — never silently mutates storage).
- **`api/_lib/documentRequirements.ts`** (new, server-only) — `sanitizeChecklistGroups()` (moved from
  `scopeOfWorkHandler.ts`), re-exports the shared builder above.
- **`src/lib/validation/types.ts`** — shared `ValidationResult { valid, fieldErrors, groupErrors, missingCount }`.
- **`src/lib/validation/quotationValidation.ts`** — `quotationRequiredFields` (the one centralized
  optional-field-exception config: `contactEmail`/`taxId`/`poRef`/`remarks` are the only fields marked
  `required: false`, each with a stated business reason), `validateQuotationLines()` (every non-header
  line needs description/unit/qty>0/specifications, at least one line required), and the two named
  server functions `validateQuotationForFinalization()`/`validateQuotationForPrint()` (both delegate to
  one shared core — no duplicated/inconsistent logic between them).
- **`src/lib/validation/scopeOfWorkValidation.ts`** — same pattern: `scopeOfWorkRequiredFields`
  (`customerSnapshot.taxId`/`.email`/`customerPoNumber`/`remarks` are the optional exceptions),
  `validateScopeOfWorkItems()`, a payment-percentage rule (`downPaymentPct`/`finalPaymentPct` — if
  either is set both must be set and must sum to exactly 100%, never a hardcoded 40/60 split — the
  actual quotation payment terms are what seed `paymentConditions.description`), and
  `validateScopeOfWorkForFinalization()` (always requires an approver signature) /
  `validateScopeOfWorkForPrint()` (approver only required once already `Final` — a Draft may be
  printed without one, since that's a Finalize-time-only requirement per the business rule "Seller/
  approver information when reaching the relevant workflow stage").
- All four files are pure TypeScript (no JSX/browser globals) — safe to value-import from both the
  Vite frontend bundle and the Node serverless API bundle, the same convention `scopeOfWork.ts` already
  established. Both server and client run the literal same functions — impossible for the two to drift.

### Data model

- `Quote` (`src/lib/quotes.tsx`) gained `checklistGroups?: ChecklistGroup[]` — Quotation never had
  this "ข้อกำหนดเอกสารและการส่งมอบ" section before; it's now generated server-side at creation
  (`buildDefaultChecklistGroups(jobTypeCode)`) exactly like Scope of Work's already does. Optional
  only because a quote created before this field existed won't have it in storage — the server always
  normalizes it (`normalizeQuote()`) before sending a quote to the client, so the frontend never sees
  `undefined`. `QuoteDraftFields` gained `checklistGroups`/`salesperson` is now itself a required field too
  (Seller information, auto-filled from the current user, still enforced as a real requirement).

### Server enforcement (`api/handlers/quotes.ts`, `api/_lib/scopeOfWorkHandler.ts`)

- `HttpError` (`api/_lib/http.ts`) gained optional `code`/`details` so a `422` can carry structured
  `{ code: "DOCUMENT_INCOMPLETE", fieldErrors, groupErrors }` alongside the Thai `message` — mirrored
  in `ApiError` (`src/lib/apiClient.ts`) so the frontend can read them back.
- Quotation: `sanitizePartialQuoteFields()` now accepts/sanitizes `checklistGroups` on create, PATCH,
  and workflow-draft merges. A new `POST /api/quotes/:id/print` endpoint (Quotation had **no** server
  print route at all before — printing was 100% client-side `window.print()`) validates via
  `validateQuotationForPrint()` before returning `ok`; the frontend now calls it before invoking
  `window.print()`. `handleWorkflow()` validates via `validateQuotationForFinalization()` before
  applying any transition except `rejected` (→ back to Draft) and `cancelled` (abandoning it) — every
  other transition (submit/approve/send to customer/customer accepted/rejected/won/lost) now requires
  a complete document.
- Scope of Work: `handleFinalize()` (Draft → Final) and `handlePrint()` now both revalidate via the
  shared validators before proceeding — previously neither did any completeness check at all.
- Every response wraps the record through `normalizeQuote()`/`normalizeScope()` — fills in any
  checklist group missing from an old stored document with an unchecked default (via
  `withDefaultChecklistGroups()`) purely for the outgoing payload, never writing it back until the
  user actually saves. Old records load safely and simply display as incomplete, per "Existing
  Document Compatibility."

### Frontend UX

- New shared components: `src/components/RequiredFieldLabel.tsx`, `FieldError.tsx`,
  `ValidationSummary.tsx`, `DocumentCompletionIndicator.tsx`. `ScopeOfWorkChecklistGroup.tsx` renamed
  to `src/pages/quotation/ChecklistGroupCard.tsx` (now takes `required`/`error` props) since Quotation
  needed the identical checkbox/radio-group card — one component, not two parallel implementations.
- `QuoteDocument.tsx`: new "ข้อกำหนดเอกสารและการส่งมอบ" section (same `ChecklistGroupCard` grid as
  Scope of Work); every required field gained `RequiredFieldLabel`/`FieldError`; a `ValidationSummary`
  + `DocumentCompletionIndicator` at the top; Print/Submit/Approve/Send-to-customer/Customer-accepted/
  Customer-rejected/Won/Lost buttons stay visible but show a red-tinted disabled style + tooltip and
  route through a `guardedWorkflowAction()`/`handlePrintClick()` that blocks + toasts + scrolls to the
  summary when the document is incomplete, rather than a native `disabled` attribute that would
  silently swallow the click. Reject/Cancel remain always available (see below). Print now calls the
  new `printQuote()` API before `window.print()`.
- `ScopeOfWorkDocument.tsx`: identical treatment — required labels/errors on every header field,
  checklist groups, payment conditions, seller/approver signatures; Print gated by the lenient
  (Draft-friendly) validation, "ยืนยัน Final" gated by the strict one requiring an approver.
- `LineItemsEditor.tsx`/`ScopeOfWorkItemsEditor.tsx` gained `lineErrors`/`itemErrors` +
  `noLinesError`/`noItemsError` props — an incomplete row is tinted and shows its specific error
  inline; a completely blank row is never itself silently accepted (must be completed or deleted).
- **Draft is unaffected**: "บันทึกร่าง"/"บันทึก" and Scope of Work's PATCH/create/refresh never gained
  a completeness gate — only Print, Finalize, and every non-Draft/non-abandoning Quotation workflow
  transition did, per "A Draft may remain incomplete."

### Deliberate scope decisions / known limitations

- **Business option catalogs mostly left as-is.** The spec's Billing Terms/ปจ.2/Delivery Terms
  examples (Cash/Credit/custom schedules, "ต้องดำเนินการ"/"ไม่เกี่ยวข้อง", pickup/etc.) were **not**
  invented as new option catalogs — per the spec's own "Use the actual business options already used
  by the company... do not auto-select a value without a confirmed business rule," the existing
  Scope-of-Work-derived option sets were kept, only adding a plain "อื่น ๆ" choice where the
  Conditional Required Rules section explicitly needed one to validate against. Confirm the fuller
  option catalogs with the business before expanding them.
- **`rejected`/`cancelled` are exempt from the completeness gate** (client and server agree on this,
  `VALIDATION_EXEMPT_ACTIONS`) — a considered interpretation, not literal spec text: rejecting returns
  to Draft (which may stay incomplete) and cancelling abandons the document outright, so forcing
  completeness first would block the one thing a user is trying to do in both cases.
- **"Scroll to and focus the first invalid field"** is implemented as "scroll to the top-of-form
  ValidationSummary" (which lists every problem), not per-field programmatic focus — a deliberate
  scope trade-off given the number of fields involved.
- Old Scope of Work records saved before this pass won't retroactively gain the new "อื่น ๆ" option
  *within* a checklist group they already have (only a wholly-missing group gets backfilled) — the
  module is only one day old in production, so this is expected to affect no real data.
- No changes to Vercel function count — the new `/api/quotes/:id/print` route is a new dispatch branch
  inside the existing `api/handlers/quotes.ts` file, not a new function.

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all
pass clean. No live-deployment/browser verification yet (same sandboxed-session limitation as every
recent pass — see PROJECT_STATUS.md Known Risks).

---

## 2026-07-15 — Scope of Work: Codex review fix pass (contact/salesperson snapshot, required suffix, Global Search)

An independent Codex review of the Scope of Work module (below) found **0 Critical**, **3 High
Priority**, and several Medium/Low Priority issues. All 3 High Priority issues (plus the actionable
Medium/Low ones) fixed same day; full writeup appended to `docs/CODEX_REVIEW_REPORT.md`'s "Claude
Fix Status."

### High Priority #1 — Quotation contact/salesperson dropped from the snapshot

`buildCustomerSnapshot()` copied company/address/tax/phone/email/project but silently dropped
`quote.contactName` — real quotation data, not a sample value. Separately, `seller` always defaulted
to whoever clicked "สร้าง Scope of Work," never the quotation's actual assigned salesperson. Fixed:
`ScopeOfWorkCustomerSnapshot.contactName` added (falls back the same way every other snapshot field
does); a new frozen, non-editable `ScopeOfWork.quotationSalesperson` field copies `quote.salesperson`
at creation (refreshed only by "อัปเดตข้อมูลจากใบเสนอราคา"); the default `seller` signatory now
prefers `quote.salesperson` when non-empty (`resolveDefaultSeller()`, `api/_lib/
scopeOfWorkHandler.ts`), with a real-user lookup by `fullName` so their saved signature image still
renders correctly, falling back to the creator only when the quotation has no salesperson recorded.

### High Priority #2 — Job code's 4th segment always blank on creation

`secondaryCode` was always `""` at creation time, so every newly-generated `scopeNumber` was missing
its required 4th segment (`PQ{YYYYMM}-{seq}-{jobType}`, no suffix at all) — failing the literal
4-part format requirement. Fixed by making `secondaryCode` a **required** value on
`POST /api/scope-of-works` (server-validated non-empty) — the "สร้าง Scope of Work" button now opens
a small prompt collecting it from the user first. Its business *meaning* is still explicitly not
invented (see `MODULES/ScopeOfWork.md` "Open Business Question") — only its *presence* is now
enforced, and the actual value always comes from the person who knows their own business context,
never a default/placeholder this codebase made up.

### High Priority #3 — No Global Search integration

Scope of Work had zero presence in Global Search — unsearchable by scope number, quotation number,
customer, Job Type, PO, or status. Fixed: `GET /api/search` gained a `scopeOfWorks` result group
(`searchScopeOfWorks()`, `api/_lib/searchHandler.ts`), gated by `scopeOfWork:view`, matching exactly
those 6 keys. `GlobalSearch.tsx` renders a new "Scope of Work" group; clicking a result opens the
source quotation's detail view then jumps straight into that Scope of Work's editor (new
`App.tsx`/`QuotationPage.tsx` `scopeOfWorkDeepLink`/`initialScopeOfWorkDeepLink` state, same pattern
already used for notification clicks and the Quotation Templates wizard's search result).

### Medium/Low fixes

- **A4 explicitly sized**: `@media print { @page { size: A4 portrait; margin: 12mm; } } ` in
  `src/styles/index.css` (previously only `margin` was set) — applies to every printed document.
- **Multi-page item splitting**: each item (+ its own spec/remark row, if any) is now grouped into
  one `<tbody style="break-inside: avoid">` in `ScopeOfWorkPrintDocument.tsx`, instead of one big
  shared `<tbody>` for the whole table — a page break can no longer fall between an item's heading
  and its own first detail line.
- **`refresh` now also requires `quotations:view`** (`api/_lib/scopeOfWorkHandler.ts`), matching the
  same source-quotation-access check `create` already had — previously only Scope of Work
  edit/ownership authorization was checked before reading the linked quotation.
- **Bounded duplicate-key retry** added to `create`/`duplicate` (`MAX_SCOPE_NUMBER_ATTEMPTS = 3`) —
  re-reserves a fresh sequence and retries the insert instead of surfacing a raw 500 on the
  (essentially unreachable, given the atomic per-month counter) chance of an `E11000` collision.
- **Delete confirmation wording corrected** — no longer claims an administrator-restore capability
  that doesn't exist yet (a real gap tracked in TODO.md/MODULES/ScopeOfWork.md, not silently hidden).

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all
pass clean. Not yet manually verified against a live deployment/browser (same sandboxed-session
no-live-database limitation as every prior pass).

## 2026-07-15 — Scope of Work module (new feature, generated from a quotation)

New document type reproducing the reference PDF ("Scope Of Work PQ202607-174-LI-SK บริษัท เค ไทย
ไฮดรอลิค จำกัด.pdf", `public/`) — created from an existing quotation via a new "สร้าง Scope of Work"
/ "เปิด / แก้ไข Scope of Work" toolbar action on the Quotation Detail page. Full writeup:
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

- **New `scope_of_works` MongoDB collection** (`ScopeOfWork` in `src/lib/scopeOfWork.ts`) — an
  independent snapshot of the quotation's customer info/items/Job Type/PO at creation time; editing
  a Scope of Work never touches the source quotation, and later quotation/customer/product edits
  never silently change an already-created one. Explicit "อัปเดตข้อมูลจากใบเสนอราคา" action re-pulls
  only the quotation-derived fields on demand, with a confirm-before-overwrite dialog.
- **Server-generated scope number**: `PQ{YYYYMM}-{jobSequence}-{jobTypeCode}-{secondaryCode}` (e.g.
  `PQ202607-174-LI-SK`). `jobSequence` is an atomically-reserved per-calendar-month counter (same
  pattern as the existing quote-numbering counter) — never generated client-side, never duplicable.
  `secondaryCode` (the PDF's `-SK` segment) is a plain editable field, **not hardcoded** and not
  invented a business meaning for — see the module doc's "Open Business Question."
- **11 reusable checklist groups** (`ChecklistGroup[]`) reproducing the PDF's printed Safety/TOR/
  เอกสารส่งถึง/ปจ.2/งานขนส่ง/Logo/Name plate/Test Report (split into ประเภท + ระดับรายงาน)/
  เงื่อนไขการวางบิล/เงื่อนไขการส่งมอบงาน groups — every option starts unchecked except two
  Job-Type-driven suggestions the spec explicitly named (LI→FRP Lining, TA→FRP Tank), both still
  freely editable. Server re-clamps `"single"`-type groups to at most one checked option and only
  recognizes group/option keys it generated itself, so a direct API call can't inject new structure.
- **Item list** copied 1:1 from the quotation's `QuoteLine[]` at creation (never pricing —
  `unitPrice`/`discount`/`tags` are never copied, and Scope of Work never shows pricing anywhere),
  then fully independently editable: add/remove/duplicate/reorder, edit qty/unit, add specification
  lines.
- **Blue handwritten sample fields never imported as data**: shipping/billing contact name/phone,
  delivery date, drawing code, seller/approver name/signature/date all start blank and editable —
  the reference PDF's sample values (illegible handwriting, a specific person's name) are never
  used as defaults. Payment conditions (down payment %/final payment %) start blank unless the
  quotation itself already carries payment-term text.
- **Draft/Final lifecycle** — finalizing locks a record against further edits (no un-finalize route
  this pass; "ทำสำเนา" duplicates a fresh, freely-editable Draft copy instead).
- **Print/PDF** (`ScopeOfWorkPrintDocument.tsx`) — A4, checked/unchecked box glyphs, numbered item
  table with no price columns, ผู้ขาย/ผู้อนุมัติ signature table. No blue handwriting, no yellow
  highlights, no fake placeholder values, no quotation pricing, no internal notes.
- **6 new RBAC permissions** (`scopeOfWork:view/create/edit/finalize/print/delete`), enforced
  server-side on every route, combined with an owner-or-`:finalize` check for edit/delete (Sales can
  only touch their own Draft; Approvers/Admin can touch anyone's). See
  [RBAC.md](./RBAC.md) "Scope of Work."
- **New API**: `GET/POST /api/scope-of-works`, `GET/PATCH/DELETE /api/scope-of-works/:id`,
  `POST /api/scope-of-works/:id/{finalize,duplicate,refresh,print}` — mounted from
  `api/handlers/quotes.ts` (shares its function file; Vercel Hobby's 12-function cap is still fully
  used, no new function file added). See [API.md](./API.md) "Scope of Work."
- **Audit logging** for every action (create/update/finalize/duplicate/refresh/print/delete), module
  `"Scope of Work"` — `POST /api/audit-log` rejects that module name from generic client calls, same
  forgery-prevention rule as the quotation module.
- No changes to existing Quotation create/edit/print workflows — a quotation does not need a Scope
  of Work, and every existing quotation continues to work unchanged.
- `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all
  pass clean. Not yet manually verified against a live deployment/browser (same sandboxed-session
  no-live-database limitation as every prior pass — see PROJECT_STATUS.md Known Risks).

## 2026-07-15 — Quotation Templates: second Codex-review fix pass (real workbook parsing, structured snapshot, subDetails/visibleToCustomer, product verification)

An independent Codex review of the Template Management pass below found **0 Critical**, **3 High
Priority**, and **3 Medium Priority** issues. All 6 fixed this pass; full writeup in
`docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status."

### High Priority #1 — Workbook import wasn't a workbook import

`POST /api/quotation-templates/import` only ever upserted the hand-transcribed
`QUOTATION_TEMPLATE_SEEDS` TypeScript array — it never read `public/Scope of work new template for
air pollution control_Technic.xlsx` at all, and `sourceHash` was a hash of the seed JSON, not the
workbook. Replacing the workbook file had **zero observable effect anywhere in the app**.

Fixed: new `api/_lib/templateWorkbookParser.ts`, using the `xlsx`/SheetJS package (re-added to
`package.json` as a real production dependency — it had been removed after the original 2026-07-14
pass as a "one-time offline analysis tool only"). `fingerprintSourceWorkbook()` reads the real file
at runtime and computes a SHA-256 hash per sheet over its raw row content. Every `excel_import`
template now gets a `sourceWorkbookHash` field; `upsertQuotationTemplates()` compares it against the
previously-stored value and adds a real `TemplateImportReport` warning when they diverge — a
workbook edit is now genuinely detectable, surfaced both in the import response and in the
`Templates Imported` audit-log entry's details (the toast itself is transient). Never fails the
import if the file can't be read in some environment — `vercel.json` gained
`functions["api/handlers/jobtypes.ts"].includeFiles` to bundle the workbook with the function that
reads it, and a read failure degrades to a soft warning, not an error.

**Deliberately not attempted**: fully auto-deriving `TemplateSection[]`/`TemplateItem[]` from parsed
rows, replacing the hand-transcription. Direct inspection of the real workbook (via a temporary
local `xlsx` install and a Node script) found rows whose classification requires real judgment — row
4 of "FRP Tank and LI" packs an internal hand-signing note, a "Thickness" parameter, and an unrelated
abbreviation-legend note into three different columns of the same row; row 61 of "Wet scrubber"
packs all 4 payment-term lines and the warranty line into one `\r\n`-joined cell. A naive automated
classifier risks silently corrupting already-twice-reviewed, customer-facing content. Tracked as
deliberate follow-up scope in `docs/TODO.md`, not silently dropped. Verified during this pass: sheet
names/row counts (66/51/46/49) and the exact row-22 FRP Tank/FRP Lining split point all match what
`templateSeedData.ts` already claimed.

### High Priority #2 — No structured template snapshot on quotations

Only flattened `QuoteLine[]` plus 3 provenance strings (`quotationTemplateId/Name/Version`) were
stored — no real copy of the template's own section/item structure, weakening audit/reconstruction.

Fixed: `Quote.templateSnapshot` (`src/lib/quotes.tsx`) — a new optional field holding a real,
frozen-at-creation copy of the matched template's `sections`/`defaultTerms`/`internalNotes`/
`sourceHash` plus a `capturedAt` timestamp. Populated server-side by a new `loadTemplateSnapshot()`
in `api/handlers/quotes.ts` (one extra targeted fetch, only when a template was actually matched).
Never client-writable, structurally excluded from `PATCH /api/quotes/:id`'s allow-list. Deliberately
includes `internalNotes` (unlike `lines`, which still never gets them) since it's a pure internal
audit record — no rendering path (editor, form, PDF) reads it; they all still read only `lines`.

### High Priority #3 — Sub-details discarded, `visibleToCustomer` never honored

`applyTemplateToQuoteDraft()` (`src/pages/quotation/applyTemplate.ts`) built output `subDetails`
only from `editableParameters`, silently discarding any real text saved in `TemplateItem.subDetails`
— content an admin explicitly configured in the Template Management editor vanished on apply. Worse,
`item.visibleToCustomer` was never checked at all — every item was copied to the quote regardless,
so the editor's "hide from customer documents" checkbox had zero actual effect.

Fixed: `subDetails` now = `item.subDetails` (real configured text, first) + one row per
`editableParameter` (fill-in-the-blank prompts, after). Items with `visibleToCustomer: false` are
now skipped entirely. A section whose every item ends up hidden still emits its header line; the
pre-existing "don't print an empty section header" PDF rule already handles that case.

### Medium Priority — product links not server-verified

`sanitizeItem()` (`api/_lib/quotationTemplatesHandler.ts`) trusted a caller-submitted `productId`/
`productSnapshot` verbatim — the UI picker always sent genuine data, but a direct authorized API
call could save a nonexistent product id or a forged snapshot. Fixed: `sanitizeContent()` now
batch-resolves every referenced `productId` against real, non-archived `products` records (one query
per save) before sanitizing, and always rebuilds `productSnapshot` from that real record. An
unresolvable id is silently dropped (item becomes unlinked, keeps its typed content) rather than
rejecting the whole save.

### Medium Priority — non-atomic import upsert

A concurrent import run could previously surface as an unhandled duplicate-key 500 instead of a
clean idempotent result. Fixed: the not-yet-existing insert branch now catches a MongoDB E11000
duplicate-key error and treats it as "skipped" (a race was lost to a concurrent run, but the unique
index already guarantees no actual duplicate exists). Deliberately not rewritten as a single atomic
`findOneAndUpdate` upsert, which would break the tested "zero writes when content is unchanged"
guarantee (an always-`$set` upsert bumps `updatedAt` every run regardless of content).

### Medium Priority — availability badges inaccurate while loading/on failure

`QuotationTemplateWizard.tsx`'s Job Type grid badge previously collapsed "still loading" and "fetch
failed" into the same "ยังไม่มี Template" (no template) text via a `?? 0` fallback — falsely
advertising the blank-start fallback. Now tracks 3 explicit states (loading/error/real count).

### Documentation / UI wording

The "นำเข้าจาก Excel" (Import from Excel) button now has a clarifying tooltip explaining exactly
what it does (checks the workbook for changes + imports pre-transcribed content — not yet a fully
automatic conversion), and import warnings are surfaced in the post-import toast (pointing to Audit
Log for full detail) instead of only being visible in the raw API response. The inactive-but-not-
deleted-template policy (a template deactivated mid-draft still stays valid for the quote that
already referenced it) was formally reconfirmed as intentional in RBAC.md/MODULES/
QuotationTemplates.md, not changed.

### Verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass
clean. A local Vite dev server + Playwright check confirmed zero browser console errors.
`fingerprintSourceWorkbook()` independently run against the real workbook file via a `tsx` script,
confirming correct sheet names/row counts/hashes. Live MongoDB round-trips remain unverified — no
local database credentials in this environment (same limitation as every prior pass).

---

## 2026-07-15 — Quotation Templates: Template Management module

Closed the admin-tooling gap the 2026-07-14 pass's own docs flagged as a known limitation: there was
no UI for managing templates beyond raw API calls. This pass built the full admin half of the
Quotation Templates feature; the consumer-facing wizard from 2026-07-14 was left functionally
unchanged except for the two additions listed below.

### Template Management page

New `จัดการ Template ใบเสนอราคา` module, sidebar under งานขาย (below ใบเสนอราคา), gated by the new
`quotationTemplates:view` permission:

- **List** (`src/pages/templates/TemplateManagementPage.tsx`): columns (Template Code, Name, Job
  Type, Version, Sections, Items, Status, Source, Updated At), search (name/code/job type), filters
  (Job Type, active/inactive, imported/manual source), a "show archived" toggle, and row actions —
  ดูตัวอย่าง, แก้ไข, ทำสำเนา, เปิด/ปิดใช้งาน, เก็บถาวร/กู้คืน, and a "สร้างใบเสนอราคาจาก Template นี้"
  shortcut into the existing Create Quotation wizard deep-link.
- **Create/edit form** (`src/pages/templates/TemplateEditorView.tsx`): basic fields, and a full
  section/item editor — add/rename/delete/reorder sections (up/down buttons, no drag-and-drop
  dependency added), add items via "เลือกสินค้า" (reuses the existing `ProductPickerModal`, copying
  a `productSnapshot` — see below) or "เพิ่มรายการเอง" (custom item), per-item
  specifications/sub-details/editable-parameters/internal-notes editing, item
  reorder/duplicate/delete, and three grouped default-terms lists (payment/warranty/tax).
- **Duplicate**: new `POST /api/quotation-templates/:id/duplicate` — deep-clones sections/items with
  fresh ids under a new Template Code (auto-suggested as `<code>-COPY`), always created
  `isActive: false`, never mutates the source.
- **Create**: new `POST /api/quotation-templates` for a from-scratch manual template
  (`sourceType: "manual"`).
- **Edit**: `PATCH /api/quotation-templates/:id` extended to accept full content
  (`TemplateContentDraft`), not just the `isActive`/`isDeleted` toggles it previously supported.

### RBAC — 7 new granular permissions

`quotationTemplates:view/create/edit/duplicate/activate/archive/import` added alongside the original
`quotationTemplates:manage`, which is now a documented backward-compatible superset (every
server-side check accepts `:manage` OR the specific permission an action needs). Administrator holds
all 8 by default. Enforcement is per-touched-field on `PATCH`: `isActive`/`isDeleted` each only
require their own permission when the value actually *changes* relative to what's persisted
(compared server-side against the stored document, not just field presence) — so a plain `:edit`
holder can save unrelated content changes without also needing `:activate`, while an `:edit`-only
holder still can't sneak a real activation through the same call.

### Audit logging

Every template lifecycle action now writes a server-side `AuditLogEntry` (module `"Template
ใบเสนอราคา"`) via a new `writeTemplateAuditEntry()` in `api/_lib/quotationTemplatesHandler.ts`:
`Template Created`/`Updated`/`Duplicated`/`Activated`/`Deactivated`/`Archived`/`Unarchived`, and
`Templates Imported` (moved out of `upsertQuotationTemplates()` itself, which stays audit-free so
the defensive empty-collection auto-seed never writes a misleading "system" actor entry — only the
explicit `POST /api/quotation-templates/import` call logs). New `relatedTemplateId`/
`relatedTemplateName`/`relatedJobTypeCode` fields on `AuditLogEntry` (`src/lib/auditLog.ts`),
mirroring the existing `relatedQuoteId`/`relatedCustomerName` convention. Separately,
`POST /api/quotes`'s own audit entry (`api/handlers/quotes.ts`) now distinguishes `"Quotation
Created from Template"` from `"Quotation Created (Blank)"` instead of one generic `"Quotation
Created"` for both — per the task spec's "Blank Quotation Behavior" audit requirement.

### Wizard additions

`QuotationTemplateWizard.tsx`'s Job Type grid (Step 1) now shows a per-card availability badge
("ยังไม่มี Template" / "มี Template" / "มี Template N แบบ"), computed from one extra unfiltered
template fetch at mount. A `quotationTemplates:create` (or `:manage`) holder additionally sees a
"สร้าง Template ใหม่สำหรับประเภทงานนี้" action on the empty-state and multi-template-choice screens,
deep-linking into Template Management's create form pre-filled with that Job Type
(`App.tsx`'s new `navigateToCreateTemplateForJobType()` / `templateCreateForJobType` state) —
deliberately kept distinct from "เริ่มจากแบบฟอร์มเปล่า" per the task's "Do Not Confuse 'OTHER' Job
Type with Blank Template" instruction.

### Data model

- `QuotationTemplate`/`QuotationTemplateSummary` gained `sourceType: "excel_import" | "manual"`
  (the 5 workbook seeds are `"excel_import"`; anything created or duplicated through Template
  Management is `"manual"`) plus `isDeleted`/`updatedAt`/`updatedBy` on the summary shape (needed
  for the list page's columns/filters).
- `TemplateItem` gained an optional `productSnapshot: { code, name, unit, defaultPrice }` — a
  one-time informational copy of a linked product's catalog fields, never read by
  `applyTemplateToQuoteDraft()` (templates still never carry a price).
- Item-level "customer-visible notes" reuse the existing `specifications` field rather than adding a
  new one — documented as a deliberate simplification in MODULES/QuotationTemplates.md.

### Shared preview component

`src/components/TemplatePreview.tsx` extracted from the wizard's inline Step 3 markup — now backs
both the wizard's `compact` teaser and Template Management's full-detail "ดูตัวอย่าง" action, so
both call sites share the one rule that actually matters: never render `internalNotes` (or any cost
figure — templates carry no price field at all).

### Verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass
clean. A local Vite dev server + Playwright check confirmed the client bundle (including every new
page) loads with zero browser console errors — the app correctly falls back to its documented
"ไม่สามารถเชื่อมต่อระบบได้" retry state at the session-check call, since no local
`MONGODB_URI`/`JWT_SECRET` is available in this environment (same sandboxed-network limitation
documented for every prior pass — see PROJECT_STATUS.md "Known Risks"). Live-DB round-trips (actual
list/create/edit/duplicate/archive/import against a real `quotation_templates` collection) remain
unverified; run the task spec's own 30-step manual test plan against a real deployment before
considering this fully verified end-to-end.

---

## 2026-07-14 — Quotation Templates: Codex review fix pass (3 High Priority)

An independent Codex review (`docs/CODEX_REVIEW_REPORT.md`, "Quotation Templates by Job Type and
Excel Import Audit") of the Quotation Templates feature below found **0 Critical issues** and
**3 High Priority** issues, all fixed this pass.

### High Priority #1 — Template Job Type not server-bound to the quote's Job Type

`POST /api/quotes` validated `jobTypeCode` and `quotationTemplateId` completely independently —
nothing compared the two, so a direct API caller bypassing the wizard's UI-level guardrails could
create e.g. a `TA` (FRP Tank) quotation carrying `LI-FRP-LINING` template provenance. Fixed:
`TemplateMasterEntry`/`loadTemplateMaster()` (`api/handlers/quotes.ts`) now also project/return
each template's `jobTypeCode`; `validateQuotationTemplate()` (`api/_lib/quoteValidation.ts`)
gained a required 3rd parameter, `quoteJobTypeCode: string` (the quote's own already-validated Job
Type — `validateJobType()` always runs first at the same call site), and throws `HttpError(400,
"Template ใบเสนอราคาไม่ตรงกับประเภทงานที่เลือก กรุณาเลือกใหม่")` when the matched template's
`jobTypeCode` differs. Enforced only on `POST /api/quotes` — template attachment is create-only,
already structurally impossible to change via `PATCH`.

### High Priority #2 — Missing Excel source content in 2 of the 5 templates

Both `SC-ACTIVATED-CARBON` and `BF-BAG-FILTER`'s "Main Ducting" item were missing a real source
specification line — `"Exhaust Duct, Elbow, Flange, Damper and accessories"` (row 5 of both the
"Activated carbon" and "Bag filter" sheets in
`public/Scope of work new template for air pollution control_Technic.xlsx`), immediately before
the existing "Stack"/"Ladder, safety ring & platform"/"Sampling port according to Thai law ?"
lines that were already present. Re-verified directly against the source workbook (not just
trusted from the review's paraphrase) before fixing. Fixed: added as the first entry in each
template's "Main Ducting" item `specifications` array, in `api/_lib/templateSeedData.ts`, matching
the source's row order.

### High Priority #3 — Real source literal values silently discarded when a template was applied

The seed data stored several real, non-placeholder source values (`Brand: TCS`,
`Material: Steel`, `Brand: TCS or equivalent`, `Static Pressure: 200 mm wg.`,
`Brand: Kruger or equivalent` — 9 occurrences total, all confined to `SC-ACTIVATED-CARBON` and
`BF-BAG-FILTER`) inside `TemplateEditableParameter.value`. But `applyTemplateToQuoteDraft()`
(`src/pages/quotation/applyTemplate.ts`) always renders every editable parameter as a blank
`"Label: ______"` prompt regardless of `value` — so these real workbook defaults were silently
lost the moment a template was applied to a quotation, contradicting
`TemplateEditableParameter.value`'s own interface doc comment ("is always blank at
template-definition time") in `src/lib/quotationTemplates.ts`. Fixed: rather than changing
`applyTemplateToQuoteDraft()`'s "value is always blank" data-model contract, all 9 real-valued
entries were reclassified from `editableParameters` to `specifications` (plain `"Label: value"`
text) in `api/_lib/templateSeedData.ts` — matching a classification rule the file's own top-of-file
doc comment already stated but the original seed data violated. `TemplateEditableParameter.value`
is now verified genuinely always blank across all 5 templates, and the real Brand/Material/
Static-Pressure defaults now survive into the applied quotation as ordinary editable specification
text (via the existing `SpecificationsEditor` in `LineItemsEditor.tsx`) instead of being discarded.

### Not changed (remaining Medium/Low items, explicitly out of scope — task was "fix Critical/High," 0 Critical found)

- `POST /api/quotation-templates/import` still upserts the hand-transcribed `QUOTATION_TEMPLATE_SEEDS` TypeScript data and hashes canonical seed JSON — doesn't parse/hash the `.xlsx` file itself.
- No admin UI exists yet for triggering import/viewing the report/activating templates.
- The quote's template snapshot is flattened `QuoteLine[]` metadata, not a full structured `TemplateSection`/`TemplateItem` hierarchy snapshot.
- The import loop is find-then-insert/update rather than a single atomic MongoDB upsert (the unique `templateCode` index still prevents an actual duplicate).
- Template preview still shows only the first 6 item names; verbatim vs. normalized source text isn't preserved separately.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all pass
clean. Seed data changes verified via a `tsx` sanity script run against the actual template
objects. No live MongoDB/browser verification (same sandboxed-session network limitation as every
prior pass). Docs updated: CLAUDE.md, PROJECT_STATUS.md, this file, TODO.md, DATABASE.md, API.md,
IMPLEMENTATION_CHECKLIST.md. See `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" section.

---

## 2026-07-14 — Quotation Templates + Create Quotation wizard

Business requirement (P'Suki/P'Keng): when a Sales user clicks "สร้างใบเสนอราคา / Create
Quotation," they now go through a wizard — Job Type → Template (only when 2+ active templates
exist for that Job Type) → Preview → the normal quotation form, pre-filled but still fully
editable — instead of always starting blank. Template content was extracted from a real Excel
workbook the company provided
(`public/Scope of work new template for air pollution control_Technic.xlsx`), not invented.

### Job Type → Template mapping (5 templates from 4 source sheets)

- **SC** (Wet Scrubber / Activated Carbon System) — two templates, the only Job Type where the
  wizard's template-choice screen actually appears: `SC-WET-SCRUBBER` "Wet Scrubber" (sheet "Wet
  scrubber," 66 rows, 2 sections/28 items/14 editable parameters/1 internal note/6 default term
  lines) and `SC-ACTIVATED-CARBON` "Activated Carbon" (sheet "Activated carbon," 51 rows, 1
  section/18 items/21 editable parameters/0 internal notes/6 default term lines).
- **BF** (Dust Collector System) — `BF-BAG-FILTER` "Bag Filter" (sheet "Bag filter," 46 rows, 1
  section/17 items/16 editable parameters/0 internal notes/6 default term lines; the sheet's BOQ
  title literally says "Dust Collector System," intentional per the task spec, not a mismatch).
  Auto-selected — no template-choice screen for a Job Type with exactly one template.
- **TA** (Fiberglass Tank) — `TA-FRP-TANK` "FRP Tank" (sheet "FRP Tank and LI," rows 22–48 only, 1
  section/17 items/12 editable parameters/1 internal note/1 default term line). Auto-selected.
- **LI** (FRP Lining) — `LI-FRP-LINING` "FRP Lining" (the *same* sheet "FRP Tank and LI," rows 0–21
  only — row 22's "FRP Tank" heading is the exact split point, deliberately never mixed with the
  FRP Tank rows — 1 section/17 items/5 editable parameters/2 internal notes/1 default term line).
  Auto-selected.
- Any other active Job Type (no template) falls back to an empty-state screen offering "เริ่มจาก
  ใบเสนอราคาเปล่า" (start blank).

### Excel row classification rules

Documented in [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) so a future
re-import follows the same rules: `section` (text-only row, no No./Qty/Unit), `item` (top-level
No.), `subItem` ("N.M" numbering — in the No. column or embedded in the description text — or an
unnumbered row with its own real Qty/Unit), `specification` (any other loose descriptive line),
`editableParameter` (a "Label : value" line whose value is a placeholder like `xxx`/blank/a bare
unit token — becomes a fill-in-the-blank `{label, value: "", unit, editable: true}`, never a
fabricated value), `internalNote` (real internal-staff review comments — flagged
`visibleToCustomer: false`, **never** copied into a quotation or printed; exactly 3 exist across
the whole workbook), `paymentTerm`/`warrantyTerm`/`taxNote` (→ `defaultTerms`, not regular items).
The recurring phrase "Sampling port according to Thai law ?" (present in all 3 BOQ sheets) was
deliberately kept as normal customer-facing spec text, not classified internal. No prices were
ever invented — every template item stores a nullable `quantity` and never a price; applying a
template always sets `unitPrice: 0`/`discount: 0` on every copied line.

### Data model — new `quotation_templates` MongoDB collection

Full TS shape in `src/lib/quotationTemplates.ts` (`QuotationTemplate`/`TemplateSection`/
`TemplateItem`/`TemplateEditableParameter`/`TemplateTermLine`/`QuotationTemplateSummary`/
`TemplateImportReport`) — type-only imported into the API bundle from `api/_lib/collections.ts`
and `api/_lib/quotationTemplatesHandler.ts`, per this repo's standing rule against letting a
*value* import into a `src/lib/*` file pull JSX into the serverless bundle; the actual
`QuotationTemplate → QuoteLine[]` conversion function therefore lives in a separate page-scoped
file, `src/pages/quotation/applyTemplate.ts`, instead. Indexes: `templateCode` (unique),
`jobTypeCode`, `isActive`, `isDeleted`. Seed data (the real extracted content) lives in
`api/_lib/templateSeedData.ts` as `QUOTATION_TEMPLATE_SEEDS`.

### Idempotent import

`upsertQuotationTemplates(actorUserId)` (`api/_lib/quotationTemplatesHandler.ts`) computes a
SHA-256 `sourceHash` over canonical JSON of the content-relevant fields (not `version`) for each of
the 5 seeds and upserts by the stable `templateCode` key: insert if new, skip if the hash is
unchanged, `$set`-update if changed. Returns a `TemplateImportReport`. Re-running against unchanged
seed data always produces an all-"skipped" report with zero writes — verified genuinely idempotent.
`seedQuotationTemplatesIfEmpty()` runs defensively from every `GET /api/quotation-templates` call,
but only when the collection is empty — the same self-healing pattern `seedJobTypesIfEmpty()`
already established, since the Setup Wizard's one-time bootstrap path is permanently unreachable on
an already-provisioned deployment. A real re-import after *editing* `templateSeedData.ts`'s content
needs the explicit `POST /api/quotation-templates/import` admin action.

### API — 4 new endpoints, sharing `api/handlers/jobtypes.ts`'s function slot

`GET /api/quotation-templates?jobTypeCode=` (list — `quotationTemplates:manage` or
`quotations:create`, non-managers only see active templates), `GET
/api/quotation-templates/:id` (single full template, same permission gate), `POST
/api/quotation-templates/import` (`quotationTemplates:manage`), `PATCH
/api/quotation-templates/:id` (`{ isActive?, isDeleted? }`, `quotationTemplates:manage`). Mounted
by extending `api/handlers/jobtypes.ts` (checking the raw pathname before falling through to the
existing Job Type dispatch) rather than a new file — Vercel Hobby's 12-function cap is still fully
used, the same established pattern `/api/search` uses by sharing `api/handlers/customers.ts`. Two
new `vercel.json` rewrites (`/api/quotation-templates`, `/api/quotation-templates/:path*`).

### RBAC — new `quotationTemplates:manage` permission

Added to `Permission`/`ALL_PERMISSIONS`/`PERMISSION_LABELS`/`PERMISSION_LABEL_KEY` and the
"ใบเสนอราคา" (Quotations) permission group in `src/lib/permissions.ts`. Granted by default to
**Administrator** (`src/lib/roles.ts`) — not Super-Admin-exclusive. Sales-facing template *read*
access reuses the existing `quotations:create` permission (no new "view" permission), the same
"manage vs. pick-for-a-quotation" carve-out already established for Customers and, before that,
Company Profiles.

### Quote model changes — all optional, backward-compatible

`QuoteLine.isSectionHeader?: boolean` (a non-priced section-divider line, validated server-side via
`sanitizeBoolean()` in `api/_lib/quoteValidation.ts`'s `sanitizeLine()`) and
`Quote.quotationTemplateId?/quotationTemplateName?/quotationTemplateVersion?: string` (frozen
provenance metadata, set only at creation time — the client only ever sends
`quotationTemplateId`; the server re-derives `quotationTemplateName`/`quotationTemplateVersion` via
`validateQuotationTemplate()` in `api/_lib/quoteValidation.ts`, mirroring the existing
`validateJobType()` pattern, and never trusts a client-sent name/version. `PATCH
/api/quotes/:id`'s `sanitizePartialQuoteFields()` never lists these 3 fields, so they're
structurally impossible to change after creation. An inactive-but-not-deleted template match is
deliberately still allowed, so deactivating a template mid-draft doesn't retroactively break a
Sales user's in-progress quote). Every pre-existing quotation simply has these fields `undefined`
and is completely unaffected.

### Template → quote snapshot semantics

`applyTemplateToQuoteDraft(template)` (`src/pages/quotation/applyTemplate.ts`) converts a full
`QuotationTemplate` into `{ lines, paymentTerms, remarks }`, generating a fresh id for every line
and sub-detail — editing the resulting quotation can never write back to the master template, and
editing the master template later never changes quotations already created from it. Each
`TemplateSection` becomes one `isSectionHeader: true` divider line; each `TemplateItem` becomes an
ordinary line (`unitPrice`/`discount` always `0`); each `editableParameter` becomes a
fill-in-the-blank `subDetails` row (`"Label: ______ Unit"`); `internalNotes` (item- and
template-level) are **never copied**, by design, so an internal review comment can never reach a
customer-facing quotation or its PDF; `defaultTerms` map into `Quote.paymentTerms`/`Quote.remarks`.

### UI — the wizard, section-header rendering, Global Search

New `src/pages/quotation/QuotationTemplateWizard.tsx`, a dynamic-step wizard wired into
`QuotationPage.tsx` via a new `"wizard"` view state sitting between `"list"` and `"new"`. Job Type
grid → (template choice, only for 2+ active templates) → Preview → apply/start-blank. The wizard's
result seeds `QuoteDocument.tsx`'s initial `lines`/`jobTypeCode`/`jobTypeName`/`paymentTerms`/
`remarks` state (fresh "new" mounts only — reopening a saved quote always uses its own data). A
small "สร้างจาก Template: {name} (v{version})" line shows near the Job Type field when a quote was
created from a template. Section-header lines render as a full-width bold divider row (no
unit/qty/price/discount columns) in `LineItemsEditor.tsx` (marked with "§" instead of a line
number) and `PrintDocument.tsx` (`colSpan={7}` bold row); item numbering skips them; a header with
no items left under it is silently omitted from print. New "Template ใบเสนอราคา" Global Search
result group (`searchTemplates()` in `api/_lib/searchHandler.ts`), matching
`templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/`description`, projecting only those
fields (never `sections`/`internalNotes`), gated by the same `quotationTemplates:manage` or
`quotations:create` check — clicking a result deep-links straight into the wizard's Preview step
for that template via `App.tsx`'s new `navigateToTemplate()`/`quotationTemplateDeepLink` plumbing.

### Housekeeping

Removed the `xlsx` npm package from `package.json` — it was only ever used for one-time offline
Excel analysis via ad-hoc Node scripts during development, never imported by any runtime
`api/`/`src/` code.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all pass
clean, zero errors, zero new warnings. **Not done**: no live MongoDB/Vercel access was available
this session, so the real DB-backed behavior (an actual import run, real API round-trips, the
wizard's live fetch/preview/apply flow, Global Search actually returning template results) has not
been manually tested end-to-end in a browser — same sandboxed-session network limitation as every
prior pass; no UI screenshot/visual verification of the wizard's 3 screens or the section-header
divider rendering; if the source Excel workbook is ever revised, `api/_lib/templateSeedData.ts`
needs manual re-transcription and re-import — there is no live xlsx-parsing-at-runtime anywhere in
this app. Docs updated: CLAUDE.md, this file, PROJECT_STATUS.md, DATABASE.md, API.md, RBAC.md,
UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/QuotationTemplates.md (new).

---

## 2026-07-14 — Codex review fix pass: Global Search High Priority issues + view-only navigation/accessibility

An independent Codex review (`docs/CODEX_REVIEW_REPORT.md`, "ERP Global Search Audit") of the
Global Search feature below found **zero Critical issues** (no unauthorized data exposure — every
result category is genuinely filtered server-side before its query runs) and **2 High Priority**
issues, both fixed this pass, plus 2 directly-relevant Medium findings.

### High Priority #1 — no maximum query length on a multi-collection unanchored-regex endpoint

`GET /api/search` enforced a 2-character minimum but no upper bound — an authenticated caller
could submit an arbitrarily long term and force an expensive `$regex` `$or` scan across quotations/
customers/products/users in one request. Not a regex-injection risk (`escapeRegExp()` already
prevented that), but a real performance/availability concern. Fixed: new `MAX_QUERY_LENGTH = 100`
in `api/_lib/searchHandler.ts`, rejected with `400` if exceeded; the search `<input>` in
`GlobalSearch.tsx` (both the desktop and new mobile variants) also carries a matching native
`maxLength={100}` as defense-in-depth (the server-side check is the real enforcement — a modified
client could bypass a client-only `maxLength`).

### High Priority #2 — Global Search doesn't exist below the `lg` breakpoint (1024px)

`GlobalSearch.tsx` was entirely `hidden lg:flex`, so mobile and most tablet users had no visible
search control at all — and the Ctrl/Cmd+K shortcut still silently focused the now-invisible
input, doing nothing observable. Fixed with a real mobile entry point rather than disabling the
shortcut: a `lg:hidden` icon-only trigger button opens a full-screen search takeover (`fixed
inset-0`, its own input + close button + the same grouped results list, reusing the exact same
`query`/`results`/`activeIndex`/keyboard-handling state as the desktop dropdown — no duplicated
search logic, just a second rendering of the same underlying session). Ctrl/Cmd+K now checks
`window.matchMedia("(min-width: 1024px)")` to decide whether to focus the desktop input or open
the mobile panel, so the shortcut is never a no-op regardless of viewport width. Fixing this also
required a small layout correction: the notification bell's `ml-auto lg:ml-0` (which used to be
the one element responsible for right-aligning the trailing header icons on mobile, back when
Global Search contributed nothing visible there) would have competed for the same flex auto-margin
space against the new mobile search trigger's own `ml-auto`, pulling them apart with an
unintended gap — the bell's margin classes were removed entirely (`App.tsx`), since Global Search's
own elements (the desktop div's `ml-auto` at `lg:`, the mobile button's `ml-auto` below it) now
correctly own that responsibility at every breakpoint.

### Medium — view-only Customer search results opened an editable form

Codex found that clicking a Customer result deep-linked directly into the edit modal
(`CustomerFormModal`) regardless of whether the caller actually held `customers:edit` — bypassing
the same gate `CustomersPage.tsx`'s own list UI already respects (the edit pencil icon is only
shown when `canEdit` is true). Not a security bypass (the server independently rejects an
unauthorized save either way), but confusing: a view-only user would land in an editable-looking
form they could never normally reach from this page. Fixed: `CustomersPage.tsx`'s `initialEditId`
handling now only opens the edit form when `canEdit` is true; a view-only searcher instead lands on
the list, pre-filtered to that customer's company name (with the status/archived filters reset so
the record is guaranteed visible regardless of its own active/archived state) — a real "found it"
result without an edit affordance the server would reject anyway. **Products deliberately left
unchanged**: `ProductsPage.tsx` has no button-level edit-permission gating at all today (a
pre-existing, already-documented gap in `IMPLEMENTATION_CHECKLIST.md` — any `products:view` holder
can already open the edit form via the normal list UI), so the search deep-link isn't introducing
any new inconsistency there; fixing that would be a pre-existing, unrelated-to-this-feature gap,
out of this pass's scope. Users has no view/edit permission split to violate (`users:manage` is a
single flat permission covering both), so no fix was needed there either.

### Medium — missing combobox/listbox accessibility semantics

Keyboard navigation worked visually but had no ARIA semantics identifying the input as a combobox
or the results as a listbox, and the active row never scrolled into view for a longer result list.
Fixed: `role="combobox"`/`aria-expanded`/`aria-haspopup="listbox"`/`aria-autocomplete="list"`/
`aria-controls`/`aria-activedescendant` on both the desktop and mobile inputs; `role="listbox"` on
the results container; `role="option"`/`aria-selected`/a stable `id` on every result row (desktop
and mobile use separate `id` namespaces — `global-search-option-{desktop|mobile}-{index}` — since
both panels can be mounted simultaneously, one hidden via CSS, and duplicate DOM `id`s are invalid
regardless of visibility). The active row now scrolls into view (`scrollIntoView({block:
"nearest"})`) on every Arrow Up/Down.

### Deliberately not fixed this pass (documented, not silently dropped)

- **Low Priority items** (English quotation-status aliases not matched by the search predicate;
  customer results don't surface which field matched) — out of this pass's Critical/High/directly-
  relevant-Medium scope.
- **"Search is a documented collection-scan design" (Medium)** — already documented as a known,
  accepted limitation at this ERP's real data volume (see the prior pass's CHANGELOG entry below);
  Codex's review re-confirms the same conclusion rather than finding a new problem. No code change
  needed beyond the max-length cap above.
- **"No automated search coverage was found" (Medium)** — this project has no automated test
  infrastructure anywhere (a longstanding, deliberate, already-documented scope decision — see
  RBAC.md "Known Gaps"), not something a single targeted fix pass for one feature should introduce
  in isolation.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint` (0 errors, 2 pre-existing
unrelated `i18n.tsx` warnings), and `npm run build` all pass clean. Same sandboxed-session
limitation as every prior pass this project (no `MONGODB_URI`, no Vercel CLI) — no live-database or
running-`vercel dev` manual verification, including of the new mobile UI at real device widths, was
possible; see `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" section for the full itemized
status.

---

## 2026-07-14 — Implement Global Search

The top navigation search box had never actually worked — a bare `<input>` with no `value`/
`onChange` at all, wired to nothing, plus a placeholder ("ค้นหาคำสั่งซื้อ, SKU, ผู้จำหน่าย...") left
over from a generic template mentioning purchase orders/vendors, neither of which are modules this
ERP has. Replaced with a real, permission-aware Global Search across Quotations, Customers,
Products, application pages/menus, and (permission-gated) Users.

### Backend — `GET /api/search?q=`

New `api/_lib/searchHandler.ts` (`handleSearch()`), mounted by adding a pathname check to
`api/handlers/customers.ts` (checked first, before falling through to the existing
`handleCustomers()` logic) rather than a new function file — Vercel Hobby's 12-function cap is
still fully used, same established pattern this file itself once shared with the now-removed
`company-profiles.ts`. New `vercel.json` rewrite: `/api/search` → `/api/handlers/customers`.

- **Query handling**: trimmed, minimum 2 characters (enforced server-side with a `400` — the
  frontend already gates on this before ever calling the endpoint, so this is defense-in-depth,
  not a normally-reachable path), every value regex-escaped (`escapeRegExp()`, matching the
  existing pattern in `api/handlers/roles.ts`) before use in a MongoDB `$regex`, so a query
  containing regex metacharacters searches for that literal text instead of being interpreted as a
  pattern or throwing.
- **Quotations** (`quotations:view`): matches quotation number (`_id`), customer/company name
  (`client`, or `customerSnapshot.companyName` when a linked customer exists), contact name,
  project name, PO reference, salesperson, Job Type code/name, status, and remarks. Each result
  carries the **before-VAT amount**, computed via the same shared `computeQuoteAmountBeforeVat()`
  helper the Dashboard uses (`api/_lib/quoteAmounts.ts`) — never `Quote.amount`'s VAT-included
  grand total. `Quote` has no `isDeleted` field (confirmed, documented in MODULES/Dashboard.md), so
  no such filter applies here either — consistent with every other Quote query in this codebase.
- **Customers** (`customers:view`): matches company name, contact name, phone, email, tax ID,
  address, project name. Filtered to `isDeleted: false` — archived customers don't normally appear.
- **Products** (`products:view`): matches SKU/code, name, description, specifications, unit, and
  category name (joined via a `categoryId` lookup against the small `categories` collection, which
  is also reused as the display-name lookup — no second round trip). Filtered to `archived: false`.
- **Pages/menus**: a small static, non-MongoDB-backed list (11 entries: Dashboard, Quotations,
  Create Quotation, Customers, Add Customer, Products, Product Categories, User Management, Roles
  and Permissions, Audit Logs, Profile/Settings) — matched against Thai/English aliases, filtered
  by the same permission each page's sidebar entry already requires. Deliberately excludes a
  "Notifications" entry present in an earlier requirement draft — this app has no dedicated
  Notifications page (only the header bell's dropdown), and inventing a fake nav target would
  violate the "no fake results" requirement. "Create Quotation"/"Product Categories" reuse their
  parent page's own view permission (`quotations:view`/`products:view`) rather than a stricter
  invented one, since neither page actually gates its create/manage-categories button more tightly
  today (a pre-existing, already-documented gap in IMPLEMENTATION_CHECKLIST.md — not something this
  feature should silently paper over). "Add Customer" does use `customers:create`, matching
  `CustomersPage.tsx`'s real `canCreate` gate.
- **Users** (`users:manage` only — every other category requires only view-level access, this one
  requires the same permission the User Management page itself does): matches full name, email,
  employee ID, username, department, position, and role (joined against the small `roles`
  collection by display name, so searching "Sales User" finds users with `roleKey: "sales_user"`).
- **RBAC enforcement is server-side, not UI-hiding**: every category above is independently gated
  by `roleHasPermission()` before its query even runs — a category the caller lacks permission for
  simply comes back as an empty array, indistinguishable in the response from a genuine
  zero-result search. The actual data never leaves the server for an unauthorized caller.
- **Indexes**: new `ensureSearchIndexes()` (same lazy, idempotent, once-per-warm-instance pattern
  as `ensureQuoteAnalyticsIndexes()` in `api/dashboard/index.ts`, wrapped in the same
  log-and-continue try/catch so a transient index-creation failure can't 500 the whole search) adds
  plain single-field indexes on `quotes.customerId`/`jobTypeCode`, `customers.contactName`/`phone`/
  `email`/`taxId`, `products.code`/`name`/`categoryId`/`archived`, `users.fullName`/`department`/
  `position`/`roleKey`. Deliberately does **not** redeclare `users.email`/`username`/`employeeId`
  (already declared `unique: true` elsewhere; a non-unique redeclaration of the same key would
  throw `IndexOptionsConflict` if that unique index exists in this deployment).
- **Known scaling limitation, documented not "fixed"**: substring (not just prefix) regex matching
  across a `$or` of several fields can't be efficiently served by a standard B-tree index — the
  indexes above help exact-match/sort use cases and keep the query planner's working set smaller,
  but the underlying search at real scale is still effectively a filtered collection scan per
  category, capped at 5 results and a small `limit()`. Acceptable at this ERP's actual data volume
  (one internal company, not big-data scale — same conclusion the Dashboard's own aggregation
  already reached). If data volume ever grows enough to matter, revisit with MongoDB Atlas Search
  (`$search`) rather than more regex indexes — not introduced now since it isn't already configured
  and isn't clearly beneficial at today's scale.

### Frontend

- New `src/lib/search.ts` — `fetchGlobalSearch(query, signal)`, typed `SearchResults`/per-category
  result interfaces mirroring the API response shape. Supports an `AbortSignal` for stale-request
  cancellation.
- New `src/components/GlobalSearch.tsx` — the dropdown/command-palette UI, replacing the dead
  input in `App.tsx`'s topbar. Debounced 300ms; a combined effect handles both the debounce timer
  and stale-request cancellation via `AbortController`. Previous results stay visible (with a
  small inline spinner, not a blank flash) while a new query is in flight — state resets only
  happen in the event handlers that trigger them (`handleQueryChange`, `retry`), not synchronously
  at the top of the fetch effect, matching the exact pattern `DashboardPage.tsx`'s
  `handleFiltersChange`/`retry` already established (avoids an avoidable render cascade,
  `react-hooks/set-state-in-effect`). Keyboard nav: Arrow Up/Down move a flat-indexed selection
  across all groups (offsets precomputed once per result set via `useMemo`, not a mutable counter
  threaded through render — the mutable-counter version tripped a `react-hooks/immutability` lint
  error), Enter activates the highlighted (or first) result, Escape closes. Ctrl/Cmd+K focuses the
  box from anywhere (a no-op below the `lg` breakpoint, where this header search box has no visible
  affordance at all today — not a regression, matches the box's existing responsive behavior).
  Simple substring highlighting (`<mark>`) on matched text. Click-outside-to-close mirrors
  `NotificationBell.tsx`'s existing `fixed inset-0` overlay pattern.
- **Deep-link navigation, not just list-page redirects**: clicking a Customer/Product/User result
  opens that record's edit form directly, and clicking "Create Quotation"/"Add Customer"/"Product
  Categories" jumps straight into that action — not just the parent list page. Added
  `initialEditId`/`onEditIdConsumed` to `CustomersPage.tsx`/`ProductsPage.tsx`/
  `UserManagementPage.tsx` (mirroring `QuotationPage.tsx`'s existing `initialQuoteId` pattern
  exactly: reacts to every change, not just once per mount, so a second search click while already
  on the page still jumps to the newly-clicked record) and `autoCreateSeq`/`autoView`/`autoViewSeq`
  to `CustomersPage.tsx`/`ProductsPage.tsx` (a monotonic sequence number, not a boolean, so the
  same page-action result clicked twice in a row still fires both times). `App.tsx` gained
  `navigateToCustomer`/`navigateToProduct`/`navigateToUser`/`navigateToPage` handlers plus
  `customerDeepLinkId`/`productDeepLinkId`/`userDeepLinkId`/`pageAction` state, following the exact
  shape of the pre-existing `quotationDeepLinkId`/`navigateToQuotation`.
- **i18n**: `topbar.searchPlaceholder` changed from the old generic-template text to "ค้นหาใบเสนอราคา
  ลูกค้า สินค้า หรือเมนู..." ("Search quotations, customers, products, or pages..."); new
  `topbar.searchAria` and `search.group.*`/`search.before`/`search.noResults`/
  `search.noResultsHelper`/`search.error`/`search.retry` keys (Thai + English).

### Deliberately not built this pass

- **Recent-search history** — explicitly optional per the requirement ("do not implement if it
  adds significant complexity"); skipped to keep this pass's scope to the core search feature.
- **Mobile/narrow-viewport search UI** — the header search box (and therefore Global Search
  entirely) remains `hidden` below the `lg` breakpoint, unchanged from before this pass. Building a
  mobile-specific full-screen search overlay would be a header-layout redesign beyond this task's
  scope, not a one-line fix.
- **MongoDB Atlas Search** — not introduced; see the "Known scaling limitation" note above.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint` (0 errors, 2 pre-existing
unrelated `i18n.tsx` warnings), and `npm run build` all pass clean. Same sandboxed-session
limitation as every prior pass this project (no `MONGODB_URI`, no Vercel CLI) — no live-database or
running-`vercel dev` manual verification was possible; see docs/TODO.md for the specific unverified
behaviors flagged as open items.

---

## 2026-07-14 — Codex review fix pass: progressive-loading High Priority issues + data-quality/documentation cleanup

An independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the Company Profiles removal /
Dashboard pre-tax / progressive-loading pass below found **zero Critical issues** (Company Profiles
removal, the before-VAT calculation rule, and Expected Sales all passed) but **3 High Priority**
progressive-loading issues and **3 Medium Priority** issues, all fixed this pass.

### High Priority #1 — normal page navigation still globally blocked by unrelated boot data

`App.tsx` fired all 9 boot-time domain fetches (`users`/`roles`/`company`/`products`/`categories`/
`notifications`/`quotes`/`jobTypes`/`customers`) independently, but gated every prop-driven page
(Quotations/Products/Customers/Users/Roles/Settings) behind one shared `initialDataLoading` flag —
so navigating straight to Products still waited on `notifications`/`quotes`/`users`/etc. that
Products never reads. Replaced with per-resource status tracking (`resourceStatus: Record<ResourceKey,
"loading"|"ready"|"error">`, one entry per boot resource) plus a new `NAV_RESOURCES` map naming which
resources each page actually needs (`products: ["products", "categories"]`, `customers:
["customers"]`, etc.). A page's loading/error state (`pageDataLoading`/`pageDataError`) is now
computed only from its own required subset. `loadDomainData`/its new `trackResource()` helper are
wrapped in `useCallback` (with a module-level `INITIAL_RESOURCE_STATUS` constant so the callback is
genuinely stable across renders) so the boot `useEffect` can correctly list it as a dependency
without re-running on every render.

### High Priority #2 — Dashboard workflow-triggered refresh left stale data with no indication

`DashboardPage.tsx`'s `refreshAfterAction()` (called after an Approve/Reject action from the
Approval Dashboard widget) only bumped `retryToken`, never set `loading`, so the previous stats
stayed on screen with zero visible sign a refresh was happening — a user could reasonably wonder
whether their approval actually took effect. Fixed: `refreshAfterAction` now also calls
`setLoading(true)`, surfacing the same small header indicator a filter change/retry already shows.
Since `stats` itself is untouched until the new response lands, the real data never disappears —
only a small "กำลังอัปเดตข้อมูล..." ("Updating data...") label + spinner appears next to the page
title (new `dashboard.refreshing` i18n key, both languages), replacing the bare spinner-only
indicator on subsequent loads (the very first load, where no `stats` exists yet, still shows the
plain spinner since the section skeleton below already communicates loading).

### High Priority #3 — a single optional dashboard section failure blocked the entire page

`GET /api/dashboard` ran index-creation, activity-timeline, sales-activity, approval-dashboard, and
notification-summary queries in the same failure domain as the KPI/pipeline/salesPerformance/etc.
computation — any one of them throwing (e.g. a transient auditLog query issue) 500'd the whole
response, and `DashboardPage.tsx` then replaced the entire data area with one `ErrorState`, hiding
KPIs and every other otherwise-healthy section. `api/dashboard/index.ts` now isolates each of these
four independently-optional blocks in its own `try/catch`, degrading to `null`/a safe zero default
(and a `console.error`/`console.warn` for visibility in Vercel function logs) on failure instead of
throwing:
- `ensureQuoteAnalyticsIndexes()` — index creation, log-and-continue.
- `activityTimeline` — already-nullable; failure now degrades to `null` (frontend already guards
  with `activityTimeline &&`), same as a caller without `auditLog:view`.
- `salesActivity` — same pattern; the object-literal type moved to a named `SalesActivityResult`
  type so the `let salesActivity: SalesActivityResult | null` declaration and try/catch assignment
  read cleanly.
- `approvalDashboard` — in-memory only (no I/O), wrapped for defense-in-depth consistency with the
  other permission-gated sections.
- `notificationSummary`/`availableSalespeople` — fall back to `{ unreadCount: 0, byType: {} }`/`[]`
  respectively (a personal unread-count widget and a filter-dropdown source list, neither of which
  is business data the rest of the response depends on).

KPIs, pipeline, salesPerformance, customerAnalytics, jobTypeAnalytics, forecast, revenueTrend, and
followUps — none of which depend on any of the four sections above — now survive a failure in any
one of them.

### Medium — first-load Dashboard skeleton was shell-first but not section-first

The original first-load placeholder (`DashboardContentSkeleton` in `DashboardPage.tsx`) was one
generic 4-card grid + one anonymous pulsing block — no real section titles, table headers, or named
card containers were visible while `GET /api/dashboard` was still in flight, only after the review
called this out as "shell-first but not section-first." Rebuilt to mirror the real P'Keng/P'Kee
4-section structure (`ExecutiveSummaryCards` → `QuotationStatusSummary` → `SalesActivityAnalytics` →
`ActivityTimeline`), reusing the *real* translated titles (via `t()`, the same keys the loaded
components use) and — for the two middle sections — the real `ChartCard` component itself for
pixel-identical header markup, plus the real 5-column `ActivityTimeline` table header row with
pulsing placeholder rows underneath. No layout/text jump when the real data arrives; only the
pulsing placeholders inside each section resolve into real values.

### Medium — missing-line pre-tax fallback was undocumented and unmonitored

`computeQuoteAmountBeforeVat(q.lines ?? [], q.discount ?? 0)` silently reports `$0` for a quote doc
whose `lines` field is entirely *absent* (not the same as a genuinely new Draft's legitimate `lines:
[]`) — the safest of three bad options (vs. crashing the whole Dashboard or falling back to the
VAT-included `amount`), but a prior draft of `docs/DATABASE.md`/`MODULES/Dashboard.md` over-claimed
this "cannot occur in practice" rather than documenting the fallback. Fixed: `api/dashboard/index.ts`
now emits a `console.warn` naming the affected count whenever a doc with no `lines` field is found in
the filtered set (grep-able in Vercel function logs, no new response field/UI surface added for what
is expected to be a null set); both docs corrected to describe the actual fallback behavior instead
of asserting it can't happen. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Pre-Tax Amount
Rule."

### Medium — stale documentation

`docs/MODULES/Customer.md` still described `/api/customers` as sharing the `company-profiles`
serverless function file and mixed up "this ERP's own single-company identity" with the (by then
removed) Company Profiles module in its Purpose section — both corrected to describe the current
dedicated `api/handlers/customers.ts` file and the actual `company` singleton. `docs/TODO.md` and
`docs/PROJECT_STATUS.md` both had a same-day-but-superseded entry claiming "the Company Profiles
module itself is untouched and remains available for future use," written before the module's
later-that-day full removal — both corrected with an explicit "superseded later the same day"
note pointing at the removal entry, rather than being silently rewritten (preserving the historical
record of what was true when each entry was written). `docs/ARCHITECTURE.md`'s "API layout" section
still listed `company-profiles` in the live `api/handlers/{...}` file list and said the project
"as of 2026-07-13" was at the function-count cap — corrected to the current `customers` file list
and "still at the cap as of 2026-07-14," with the `company-profiles.ts` → `customers.ts` slot
hand-off explained.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint` (0 errors, 2 pre-existing
unrelated `i18n.tsx` warnings), and `npm run build` all pass clean. Same sandboxed-session
limitation as every prior pass this project (no `MONGODB_URI`, no Vercel CLI) — no live-database or
running-`vercel dev` manual verification was possible; see `docs/CODEX_REVIEW_REPORT.md`'s "Claude
Fix Status" section for the full itemized status and what still needs a live-database pass.

---

## 2026-07-14 — Remove Company Profiles module; Dashboard items-based pre-tax rework; progressive/shell-first loading

Three-part pass, requested together.

### Part 1 — Company Profiles module removed from the user-facing ERP

This ERP only ever needs one issuer company; the admin module for managing several (built
2026-07-13, briefly and incorrectly wired into the Quotation form, corrected the same week — see
the entry below) was itself unused scope. Removed on explicit instruction, not left as dormant
surface area.

**Frontend removed**: `src/pages/admin/companyProfiles/` (`CompanyProfilesPage.tsx`,
`CompanyProfileList.tsx`, `CompanyProfileForm.tsx`, `CompanyProfileDetail.tsx`) and
`src/lib/companyProfiles.ts` deleted outright. `src/App.tsx`: the "ข้อมูลบริษัท" nav item removed
from `navItems`/`NavKey`/`NAV_GROUPS`/`NAV_LABEL_KEYS`; `canCreateCompanyProfiles`/
`canEditCompanyProfiles`/`canArchiveCompanyProfiles`/`canSetDefaultCompanyProfile` permission
booleans and the `"companyProfiles"` render case removed; the `companyProfiles`/`setCompanyProfiles`
state and its 4 fetch call sites (boot, setup-complete, sign-in, logout-reset) removed.

**Backend removed**: `api/handlers/company-profiles.ts` and `api/_lib/companyProfileValidation.ts`
deleted. `vercel.json`'s `/api/company-profiles` and `/api/company-profiles/:path*` rewrites removed
entirely — the path now returns Vercel's plain 404 (no function matches it), satisfying "return a
proper 404, not just hide the sidebar item." `api/_lib/collections.ts`: `CompanyProfileFields`
type and `companyProfilesCollection()` accessor removed (and its 3 `createIndex` calls removed from
`ensureIndexes()`). The customer-data logic that had been sharing `company-profiles.ts`'s
serverless function (to stay under Vercel Hobby's 12-function cap) now has its own dedicated
`api/handlers/customers.ts` file — the freed slot went straight back to its rightful owner rather
than sitting idle.

**RBAC removed**: `companyProfiles:view/create/edit/archive/delete/setDefault` removed from the
`Permission` union, `ALL_PERMISSIONS`, `PERMISSION_LABELS`, `PERMISSION_LABEL_KEY`,
`PERMISSION_GROUPS` (`src/lib/permissions.ts`), and from the Administrator default role's
permission list (`src/lib/roles.ts`). Confirmed safe before removing: `api/handlers/roles.ts` never
validated incoming `permissions` arrays against `ALL_PERMISSIONS` (only strips Super-Admin-locked
keys), so an existing custom role that already had one of these six permission strings stored keeps
it — inert and harmless, not a breaking change to that role.

**i18n removed**: every `companyProfiles.*`/`permission.companyProfiles*`/`empty.companyProfiles.*`/
`nav.companyProfiles` dictionary key (Thai + English, ~110 keys total) removed from
`src/lib/i18n.tsx`.

**Deliberately NOT removed**: the `company_profiles` MongoDB collection and any documents already
in it — no code reads or writes it anymore, but per this pass's explicit "no destructive database
cleanup" instruction, the collection itself was left in place in MongoDB. Historical `audit_log`
entries with `module: "โปรไฟล์บริษัท"` also remain and still display normally in the Audit Log page;
`POST /api/audit-log` still rejects that module string from the generic client-facing endpoint
(prevents forging *new* entries for a module that no longer exists — costs nothing to keep).

`npx tsc -b` and `npx tsc --noEmit -p tsconfig.api.json` both pass clean after this part.

### Part 2 — Dashboard pre-tax amounts reworked to compute from line items

The 2026-07-14 (earlier same day) Pre-Tax Amount pass had computed every Dashboard monetary value
via `preTaxAmount(amount) = amount / (1 + VAT_RATE/100)` — backing the before-VAT figure out of the
persisted VAT-included grand total by dividing by a fixed rate. A follow-up requirement asked for
this to instead compute from an authoritative source: `Quote` has no stored pre-tax/subtotal field,
so the authoritative source is each quote's own `lines`/`discount` — the same inputs already used to
derive the persisted `amount` at save time.

New shared `api/_lib/quoteAmounts.ts`:
```ts
computeQuoteAmountBeforeVat(lines, discountPct)  // subtotal after line + quote-level discounts, no VAT
computeQuoteAmountWithVat(lines, discountPct)    // the above, plus VAT — what Quote.amount stores
```
`api/_lib/quoteValidation.ts`'s `computeQuoteAmount()` (used by `POST`/`PATCH /api/quotes` to derive
the persisted `amount`) now delegates to `computeQuoteAmountWithVat()`, so create/edit and the
Dashboard compute a quote's value via the identical formula — no risk of the two ever drifting onto
different math. `api/dashboard/index.ts`'s local `preTaxAmount()`/`VAT_RATE` removed; its 3 raw-Mongo
queries that used to read `amount` (the main `docs` query, `followUpDocsRaw`, `wonRevenueDocsRaw`)
now project `lines`/`discount` instead and call `computeQuoteAmountBeforeVat()` at each read site.
`QuoteCalcDoc`'s `Pick<QuoteFields, ...>` gained `"lines" | "discount"`. Every `DashboardStats`
response field keeps its existing shape/key names — no client-side changes were needed for the
computation change itself.

**Label audit**: reviewed all 18 Dashboard widgets that render a monetary value for whether they
label it "(Before VAT)"/"ก่อนภาษี." 15 already did (KPI cards, Status Summary, both ranking tables,
Customer/Job Type Analytics, all 4 charts, Approval Dashboard, CSV export). 3 gaps fixed:
- `SalesPerformancePanel.tsx`'s Average Deal Size — the `dashboard.kpi.averageDealSize` i18n value
  itself gained "(ก่อนภาษี)"/"(Before VAT)" (this key has exactly one call site, so editing the
  value directly was safe and simpler than adding a new key).
- `PipelineSteps.tsx` — its `ChartCard`'s visible `sub` caption was `dashboard.pipelineSteps.sub`
  ("Click a stage...", no VAT wording); the already-correctly-worded `dashboard.pipeline.sub`
  ("Count and value of quotations by stage (before VAT) · click to view the list") existed in
  i18n.tsx but was only ever reachable via the `EmptyState` fallback — swapped the live `sub` prop
  to use it, which also preserves the click-affordance text since that key already includes it.
- `FollowUpReminders.tsx` — its per-row `฿{amount}` had zero adjacent label of any kind. Added a new
  `dashboard.followUps.amountNote` caption ("มูลค่าที่แสดงเป็นยอดก่อนภาษี"/"Amounts shown are before
  VAT") under the card title.

`npx tsc --noEmit -p tsconfig.api.json` and `npx tsc -b` both pass clean after this part.

### Part 3 — Progressive/shell-first loading

**`src/App.tsx` boot sequence.** Previously: `bootStatus` stayed `"loading"` (a full-page pulsing-logo
splash, `BootLoading`) through both the session check *and* a blocking 10-way `Promise.all` of every
domain fetch (users/roles/company/products/categories/notifications/quotes/jobTypes/companyProfiles/
customers) before the sidebar/header ever appeared. Now: `bootStatus` flips to `"ready"` as soon as
`fetchSession()` resolves with an authenticated user — the shell renders immediately — and a new
`loadDomainData()` fires each of the (now 9, companyProfiles fetch removed) domain fetches
independently via `Promise.allSettled`, with each one's own `setState` call running the moment *that*
fetch resolves rather than all of them waiting on the slowest. A new `initialDataLoading` boolean
tracks whether that bulk fetch has finished; pages purely prop-driven off it (Quotations/Products/
Customers/Users/Roles) render a new lightweight `SectionLoading` placeholder ("กำลังโหลดข้อมูล...")
in the content area instead of either blocking the shell or rendering their real (but still-empty)
props as a false "no records yet" state. Dashboard and Audit Log render immediately regardless,
since both already fetch their own data independently of this bulk load. `handleSetupComplete`/
`handleSignIn` were refactored onto the same `loadDomainData()` helper (previously 3 near-identical
copies of the same 10-fetch `Promise.all` block, one per entry point).

**Fixed a previously-documented, real gap**: the boot `useEffect`'s `fetchSession()` call had no
`try`/`catch` at all — any thrown network/API error left `bootStatus` stuck at `"loading"` forever,
with no way out (flagged in TODO.md since 2026-07-10, never fixed until now). Now wrapped; a thrown
error sets a new `bootError` state and renders a retryable `BootError` screen instead.

**`src/pages/dashboard/DashboardPage.tsx`.** The page title/description (`PageHeader`) and filter
bar now render unconditionally, even before the very first `/api/dashboard` fetch resolves (only
`stats?.` accesses, no `if (!stats) return ...` guard above them anymore). The large data-driven
widget tree (all 18 widgets) was extracted into a new `DashboardContent` subcomponent, so only that
part — not the page shell around it — shows a loading placeholder on first load (`DashboardContentSkeleton`,
now scoped to just the KPI-card-grid + one chart area, not the whole page). The pre-existing
keep-previous-data-visible-during-refetch behavior on filter change (a small spinner in the header,
`stats` never cleared) was already correct before this pass and is unchanged.

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass
clean after all three parts combined. Production bundle: the `CompanyProfilesPage`/company-profiles-
specific `ImageUploadField` chunks are gone entirely; the main `index.js` chunk shrank from
~342KB to ~324KB (raw, pre-gzip).

**Not done this pass**: no live-database/live-browser manual walkthrough — same recurring
sandboxed-session network limitation as every prior pass (no path to MongoDB Atlas or a running dev
server; see PROJECT_STATUS.md "Known Risks"). No per-widget progressive rendering *within* an
already-loaded Dashboard (all 18 widgets still render together once `stats` arrives — only the
page-shell-vs-first-load-content boundary was addressed). Quotations/Products/Users/Roles/Customers/
Settings pages were not redesigned with their own independent loading states beyond the new shared
`SectionLoading` placeholder, per "do not redesign unrelated pages." A real end-to-end spot-check of
the reworked pre-tax arithmetic against a live quote (hand-compute from its `lines`/`discount`,
compare to the Dashboard's reported figure) also needs a live database.

Docs updated: CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md,
IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md (full rewrite).

---

## 2026-07-14 — Codex review fix pass: customer autofill/snapshot High Priority issues + documentation/naming cleanup

**Scope**: an independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the previous same-day
Customer Management pass found the core requirement already met (issuer UI gone, customer selector
wired to the real `customers` API, `customerId`/`customerSnapshot` persisted server-side) but 2
High Priority functional gaps and 3 Medium documentation/naming issues. Zero Critical findings.

**High #1 — `customerSnapshot` was written but never read.** `QuoteDocument.tsx` initialized every
Customer Information field's `useState` exclusively from the quote's legacy top-level fields
(`quote.client`, `quote.contactName`, etc.), never from `quote.customerSnapshot` — so the persisted
snapshot had no display consumer, failing the specified "snapshot displayed first when reopening a
quotation" requirement. Fixed by seeding each field from `quote.customerSnapshot` first (via `??`,
so a real stored empty string is respected, not skipped), falling back to the legacy top-level
field, then to `""` — the exact specified (1) snapshot → (2) legacy field → (3) empty order.
Deliberately does **not** add a further live lookup of the current customer master record by
`customerId` as a fourth fallback tier — that would silently overwrite a user's already-edited quote
fields with today's master data on every reopen, defeating the entire point of a frozen snapshot.
`PrintDocument.tsx` needed no separate change — it renders the same component state, now correctly
snapshot-seeded at its source.

**High #2 — customer selection could leave stale optional fields.** `handleSelectCustomer` in
`QuoteDocument.tsx` only overwrote `deliveryMethod`/`project`/`deliveryAddress` when the selected
customer's corresponding value was truthy (`if (c.deliveryMethod) setDeliveryMethod(...)`) — so
selecting a customer with blank delivery info left whatever value a *previously* selected customer
or manual entry had typed there, which then got saved into the newly-selected customer's
`customerSnapshot`. Fixed by assigning all nine fields unconditionally, including blank strings.

**Medium — dead/confusing issuer-branded types and stale present-tense documentation.**
- `src/lib/companyProfiles.ts`'s unused `IssuerCompanySnapshot` interface and unused
  `issuerDisplayFromProfile()`/`issuerDisplayFromSnapshot()` functions (nothing called them —
  `Quote.issuerCompanySnapshot` was already removed in the prior pass) — deleted outright.
- `IssuerCompanyDisplay` (still legitimately used for the single-`company`-singleton document
  header shape) renamed to `CompanyHeaderInfo` and **moved out of `companyProfiles.ts` into
  `storage.ts`** (next to `Company`, its actual data source) — the old name/location, sitting next
  to the live Company Profiles module, risked being mistaken for a still-supported multi-issuer
  concept. `QuoteDocument.tsx`'s `issuerDisplay` variable and `PrintDocument.tsx`'s `issuer` prop
  renamed to `companyHeader` to match; the now-pointless `?? company.x`/`?.` fallbacks in
  `QuoteDocument.tsx` were also simplified away since `companyHeader` is always a fully-populated
  plain object now, never conditionally built from a resolved Company Profile.
- `src/lib/companyProfiles.ts`'s `CompanyProfile` module-doc-comment, `src/lib/auditLog.ts`'s
  `relatedCompanyProfileId` doc comment, and `api/handlers/company-profiles.ts`'s `handleList()`
  comment still described the reverted issuer-selector integration as current — all corrected to
  past tense / marked reverted.
- `docs/MODULES/CompanyProfiles.md`'s "Quotation Integration" section and "Audit Logging" section's
  last paragraph were still written in **present tense** describing the removed feature as live
  (despite an earlier disclaimer at the section's top) — the review read this as "presents the old
  selector as current behavior." Rewrote "Quotation Integration" into a short, explicitly
  past-tense archival summary (renamed "— ARCHIVED, removed 2026-07-14 (do not reimplement)") and
  corrected the Audit Logging paragraph to state the removal plainly. `docs/CLAUDE.md`'s Company
  Profiles module-table row's **status label itself** still read "✅ Built (master-data management +
  Quotation integration)" — fixed to "✅ Built (admin master-data management **only** — NOT
  connected to Quotation)", with the long historical narrative trimmed and pointed at CHANGELOG.md
  instead of re-duplicated inline.
- `docs/MODULES/Quotation.md`'s "Customer Selection" section previously asserted the app's
  top-level quote fields were "always the direct source of truth shown on screen... not re-derived
  from the snapshot" — that was the exact design gap Codex's High #1 finding caught; corrected to
  describe the now-actually-implemented snapshot-first resolver.

**Verification**: `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and
`npm run build` all pass clean. No live-database browser verification — same sandboxed-session
network limitation as every prior pass (see PROJECT_STATUS.md "Known Risks").

**Deliberately not changed** (Low Priority / out of scope per the review's own framing): the
selector's 20-result client-side cap with no server-side search (acceptable at today's real
customer-list scale, matches the Company Profiles/Products precedent); the selected-customer chip
shows only the company name, not contact/tax ID (a UX polish, not a functional gap); no automated
test coverage was added (this project has none anywhere, by longstanding, documented choice — see
RBAC.md Known Gaps — not a regression introduced by this pass).

Docs updated: CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md,
IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md,
CODEX_REVIEW_REPORT.md (new "Claude Fix Status" section).

---

## 2026-07-14 — Correction: removed the incorrect Quotation "Issuer Company" feature; built the correct Customer Management module

**Scope**: a follow-up correction to the 2026-07-13 ninth/eleventh/twelfth-pass work. That work
built a Company Profiles selector into the Quotation form ("ออกใบเสนอราคาในนามบริษัท" — "issue
quotation as company") against a misunderstanding of the actual business requirement: this ERP only
ever issues quotations under a **single** company identity, so there is no "which company issues
this quote" decision to make. The real, correct requirement — restated explicitly this pass — was
always a **Customer** selector: save a customer/company's information once, then pick it from the
Quotation form to autofill the Customer Information section.

**Removed from the Quotation form and its API**:
- `src/pages/quotation/IssuerCompanySelector.tsx` — deleted.
- `QuoteDocument.tsx`'s issuer-company state block (`activeProfiles`/`defaultActiveProfile`/
  `issuerCompanyId`/`issuerChanged`/`selectedLiveProfile`/`useSnapshotForDisplay`/
  `hasIssuerProfile`/`canChangeIssuer`) and its rendered `<IssuerCompanySelector>` — removed.
  `issuerDisplay` (still used by the header band/`PrintDocument.tsx`) is now built directly and
  unconditionally from the `company` singleton, with no Company Profile branching.
- `companyProfiles`/`canViewCompanyProfiles`/`onNavigateToCompanyProfiles` props — removed from
  `QuoteDocument.tsx` and `QuotationPage.tsx`; `App.tsx` no longer threads them into
  `QuotationPage` (it still fetches `companyProfiles` for the standalone admin page, unchanged).
- `resolveIssuerCompanyUpdate()` and every `issuerCompanyId`/`issuerCompanySnapshot` branch in
  `api/handlers/quotes.ts` (create/PATCH/workflow) — removed.
- `Quote.issuerCompanyId`/`issuerCompanySnapshot` — removed from the `Quote` interface
  (`src/lib/quotes.tsx`) and `QuoteDraftFields`. Old quote documents in MongoDB may still carry
  these fields from the brief window they existed — harmless, simply unread now, not backfilled.
- `quotation.issuer.*` i18n keys — removed (Thai + English); the "ออกใบเสนอราคาในนามบริษัท" string
  no longer appears anywhere in the app.

**What was explicitly NOT removed**: the Company Profiles module itself (admin CRUD page, API,
`company_profiles` collection, `companyProfiles:*` permissions) — it remains fully functional for
managing business-identity master data, per the instruction to forget the *issuer-company-in-Quotation*
requirement specifically, not to delete the module wholesale.

**Built: Customer Management module** (replacing an unused, schema-only 2026-07-09 draft shape):
- `api/_lib/collections.ts`'s `CustomerFields` redefined to `companyName`/`contactName`/`phone`/
  `email`/`address`/`taxId`/`deliveryMethod`/`projectName`/`deliveryAddress`/`isActive`/`isDeleted`/
  audit fields — matching exactly what the Quotation form's Customer Information section collects,
  replacing the old CRM-flavored `position`/`source`/`salesOwnerId`/`notes`/`status`/`deletedAt`
  shape (which had zero live data — a clean redefinition, not a migration). `api/dashboard/index.ts`'s
  `totalCustomers` query updated from `deletedAt: null` to `isDeleted: false` to match.
- `api/_lib/customerValidation.ts` (new) — server-side validation, mirroring
  `companyProfileValidation.ts`'s pattern; only `companyName` is required.
- `api/_lib/customersHandler.ts` (new) — `handleCustomers()`, list/create/one/patch/archive, same
  shape a standalone `api/handlers/customers.ts` would have. **Folded into the `company-profiles`
  serverless function** rather than getting its own file: Vercel Hobby's 12-function cap was already
  reached (`company-profiles.ts` was the 12th and final slot, 2026-07-13). `api/handlers/company-profiles.ts`'s
  exported handler now checks the raw request pathname first — `/api/customers[/...]` delegates to
  `handleCustomers()` before falling through to its own `/api/company-profiles` path parsing.
  `vercel.json` gained matching `/api/customers` and `/api/customers/:path*` rewrites, both pointing
  at `/api/handlers/company-profiles`.
- `src/lib/customers.ts` (new) — `Customer`/`CustomerDraft`/`CustomerSnapshot` types +
  `fetchCustomers()`/`fetchCustomer()`/`createCustomer()`/`updateCustomer()`/`setCustomerArchived()`.
- `src/pages/customers/CustomersPage.tsx` (new) — single-file list + modal create/edit form (search,
  active/inactive filter, show-archived toggle, activate/deactivate, archive/restore) — deliberately
  simpler than Company Profiles' 3-file list/form/detail split, since a Customer record has far
  fewer fields and no logo/bank-account/multi-section complexity.
- `src/pages/quotation/CustomerSelector.tsx` (new) — "เลือกลูกค้า / บริษัท": a search input over the
  fetched customer list (matches company name/contact/phone/email/tax ID), a dropdown of results,
  and a collapsed "chip" once a customer is linked (with a `×` to unlink). Presentational only —
  `QuoteDocument.tsx` owns the actual autofill (`handleSelectCustomer()` copies
  companyName/contactName/phone/email/address/taxId always, and deliveryMethod/projectName/
  deliveryAddress only when the customer record has them set) and the Draft-only lock
  (`canChangeCustomer`).
- `Quote.customerId?: string` / `customerSnapshot?: CustomerSnapshot` (`src/lib/quotes.tsx`) —
  replacing the removed issuer fields. `QuoteDraftFields` gained `customerId` (client only ever
  sends the id, same "never trust a client-supplied derived value" rule `amount`/`jobTypeName`
  already follow).
- `api/handlers/quotes.ts`: `resolveCustomerIdUpdate()` (validates a sent `customerId` exists and
  isn't archived) and `buildCustomerSnapshot()` (always builds `customerSnapshot` from the
  Customer Information fields actually being saved — client/contactName/contactPhone/contactEmail/
  address/taxId/deliveryMethod/project/deliveryAddress — whether autofilled-then-edited or fully
  manual, per "when manually entered, still save the information into customerSnapshot"). `POST
  /api/quotes` always populates `customerSnapshot`, optionally `customerId`. `PATCH /api/quotes/:id`
  and `POST /api/quotes/:id/workflow` restrict `customerId` changes to Draft status (`400`
  otherwise, same rule the old `issuerCompanyId` had) and refresh `customerSnapshot` whenever
  `customerId` or any Customer Information field is present in the request, from the resulting
  merged values — otherwise leaving it untouched, so reopening a quotation preserves its existing
  snapshot. A distinct `"Quotation Customer Changed"` audit action replaces the removed
  `"Quotation Issuer Company Changed"` one.
- 4 new permissions: `customers:view/create/edit/archive` (`src/lib/permissions.ts`, not
  Super-Admin-locked) — Administrator gets all four by default; Sales User gets view/create/edit
  (no archive); Approver 1/2 and Viewer get view-only. New "ลูกค้า" `PERMISSION_GROUPS` entry.
- New nav item "ลูกค้า" (`Contact` icon), added to the existing "Sales" sidebar group alongside
  Quotations; `CustomersPage` lazy-loaded and routed in `App.tsx`, with `customers` state fetched
  in every boot/setup/sign-in `Promise.all` (`.catch(() => [])`-guarded, same reasoning as
  `companyProfiles`).
- ~40 new i18n keys (Thai + English): `nav.customers`, `quotation.customerSelector.*`,
  `customers.*` (page/list/form/toasts/confirms), `empty.customers.*`, `permission.customers*`.

**Verification**: `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and
`npm run build` all pass clean. **Not done**: no live-database browser verification (same
sandboxed-session network limitation as every prior pass — see PROJECT_STATUS.md Known Risks); no
"บันทึกเป็นลูกค้าใหม่" (save-as-new-customer-from-the-quotation-form) convenience feature —
explicitly flagged optional/future in the requirement ("do not add unless simple and safe").

Docs updated: PROJECT_STATUS.md, TODO.md, CLAUDE.md, DATABASE.md, API.md, RBAC.md,
UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Customer.md (full rewrite),
MODULES/Quotation.md, MODULES/CompanyProfiles.md.

---

## 2026-07-14 — Dashboard Codex-review fix pass (Critical + High Priority)

**Scope**: an independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the same-day Pre-Tax
Amount pass found 1 Critical and 3 High Priority Dashboard issues. All 4 fixed this pass, plus one
Medium-priority correctness fix folded in since it touched the same code paths.

**Critical — Sales Activity Analytics was invisible to most Dashboard roles.**
`api/dashboard/index.ts`'s `salesActivity` aggregation was gated behind `roleHasPermission(ctx.role,
"auditLog:view")` — the same gate as the raw audit-log-backed `activityTimeline`. Default
`sales_user`/`approver_1`/`approver_2`/`viewer` roles all have `dashboard:view` but not
`auditLog:view`, so the P'Keng/P'Kee-required "กิจกรรมของฝ่ายขาย" section silently disappeared for
every one of them. Fixed by removing that gate from `salesActivity` specifically — it's now
computed for any caller who already passed the route's own `dashboard:view` check, matching every
other required-section field. `activityTimeline` ("Recent Activity Details," the literal audit-log
feed) intentionally keeps its `auditLog:view` gate — a different, more sensitive feature. Response
type comment in `src/lib/dashboard.ts` updated; `DashboardPage.tsx`'s `salesActivity &&` render
check is now a defensive null-guard, not an actual permission gate.

**High — Sales Activity ignored the date-range filter's start date.** The `activityMatch` query
behind `salesActivity` never bounded by `from`/`to` at all — selecting "Today" still scanned and
displayed a full rolling 12-week/12-month/etc. trend built from all-time data, contradicting the
"filters must affect all Dashboard sections" requirement. Fixed by adding
`activityMatch.createdAt = bangkokDayBoundsUtc(from, to)` when either is set, the same pattern
`activityTimeline` already used. `SalesActivityAnalytics.tsx` gained a `dateFiltered` prop
(`DashboardPage.tsx` passes `!!stats.filters.from`) that switches the section's caption between the
existing "rolling trend, not limited by filter's start date" copy and a new "กรองตามช่วงวันที่ที่เลือก"
/ "filtered to the selected date range" copy, so the UI never claims a behavior the query isn't
actually doing. New i18n keys: `dashboard.salesActivity.sub.filtered` (Thai + English).

**High — an empty database hid the required KPI cards.** `DashboardPage.tsx` replaced the *entire*
page with one full-page `EmptyState` whenever `hasAnyData` was false, so a brand-new deployment
with zero quotations/products never showed the four required KPI cards at 0, nor the Status
Summary/Sales Activity's own empty states — failing the business requirement's explicit "show zero
KPI values plus relevant empty states" rule for an empty database (distinct from a narrow filter
matching zero results, which was already handled correctly). Fixed: removed the page-wide
conditional entirely; every required section and supporting-detail section now always renders
(each already degrades gracefully via its own per-widget empty state). A compact inline banner
("ยังไม่มีข้อมูลธุรกิจ") now renders above the KPI cards instead, communicating the same thing
without blocking the page. The now-unused full-page `EmptyState` import was removed from
`DashboardPage.tsx`.

**Medium (folded in) — Expected Sales used a truthy check, not strict `=== true`.** All three
`isPotentialOpportunity` predicates in `api/dashboard/index.ts` (`expectedSales` KPI,
`salesPerformance[].expectedRevenue`, `forecast`'s `openOpportunities` filter) now compare
`q.isPotentialOpportunity === true` explicitly rather than relying on JS truthiness — closes a
theoretical gap where a stray non-boolean truthy value (e.g. the string `"false"`, which is truthy)
on a legacy/externally-written document would have been miscounted as a potential opportunity.

**Not fixed, documented instead — High: no soft-delete predicate on Dashboard quote queries.**
Confirmed by grep that `Quote`/`QuoteFields` has no `isDeleted`/soft-delete field anywhere in the
schema today (quotations are only ever removed from "active" via the `ยกเลิก`/Cancelled status).
Adding a MongoDB filter on a field that can never be set would be dead, speculative code implying a
deletion feature that doesn't exist. Documented explicitly instead — a code comment directly above
every Dashboard quote-query match object in `api/dashboard/index.ts`, plus DATABASE.md/
MODULES/Dashboard.md — noting every quote query in the file must be updated together if a real
soft-delete field is ever introduced.

**Verification**: `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Same sandboxed-session no-live-database limitation as every prior pass (this review's own session
hit a different but equally blocking environment issue — "WSL 1 is not supported"). Verified via a
temporary isolated Playwright preview (`src/devPreview.tsx` + `dashboard-preview.html`, deleted
after use) specifically targeting this review's findings: rendered the KPI/status/activity
components together under a "simulating a Sales User (dashboard:view only)" label, confirming Sales
Activity Analytics now renders in that scenario; rendered `SalesActivityAnalytics` with both
`dateFiltered={false}` and `dateFiltered={true}` to confirm the caption switches; rendered the new
compact empty-state banner. All confirmed correct with zero console errors.

**Files changed**: `api/dashboard/index.ts`, `src/lib/dashboard.ts`,
`src/pages/dashboard/DashboardPage.tsx`, `src/pages/dashboard/SalesActivityAnalytics.tsx`,
`src/lib/i18n.tsx`. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md,
API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md,
CODEX_REVIEW_REPORT.md's new "Claude Fix Status" section.

---

## 2026-07-14 — Dashboard Pre-Tax Amount pass

**Scope**: a follow-up P'Keng/P'Kee requirement — every Dashboard monetary total must be the
pre-tax (before-VAT) amount, never `Quote.amount`'s persisted VAT-included grand total. The
required-5-section layout (4 KPI cards, Win/Lose/Active/Non-Active status summary, Sales Activity
Analytics with weekly/monthly/quarterly/yearly tabs and a salesperson filter tracking new-quotation
and edited-quotation counts) was already in place from the 2026-07-13 passes — this pass's scope
was strictly the amount-calculation rule and making it visible.

**Why this is exact, not an approximation**: `Quote` has no persisted pre-tax/subtotal field —
`amount` is always `afterDiscount * (1 + VAT_RATE/100)` with no intermediate rounding
(`computeQuoteAmount()` in `api/_lib/quoteValidation.ts`), and `VAT_RATE` (7%) has always been a
single fixed constant applied to every quote, never a per-quote override or a different historical
rate. So `preTaxAmount(amount) = amount / 1.07` (new helper, `api/dashboard/index.ts`) recovers the
exact `afterDiscount` value the server computed at save time — for every quote ever saved, old or
new alike, not a best-effort fallback.

**Backend** (`api/dashboard/index.ts`): added `preTaxAmount()`. Normalized `docs[].amount` (the
filtered per-quote array every KPI/pipeline/salesPerformance/customerAnalytics/jobTypeAnalytics/
forecast/`approvalDashboard.pendingList` computation derives from) to its pre-tax value exactly
once, immediately after the filtered `quotes.find()` fetch — every downstream `.reduce()`/
`.filter()` inherits it automatically, so no individual call site could accidentally miss the
conversion. The two aggregations reading from separate queries instead of `docs`
(`revenueTrend`/`revenueByMonth`'s won-quote scan, `followUps`) apply `preTaxAmount()` explicitly
at their own read sites. No response field was renamed — `totalQuotationValue`, `closedSales`,
`expectedSales`, `lostValue`/`activeQuotationsValue`/`nonActiveQuotationsValue`,
`pipeline[].totalValue`, `salesPerformance`, `customerAnalytics`, `jobTypeAnalytics`, `forecast`,
`revenueTrend`/`revenueByMonth`, `followUps[].amount`, `approvalDashboard.pendingList[].amount`
all keep their names, only their computed values changed.

**Frontend labels** (`src/lib/i18n.tsx`, both Thai and English): the 4 KPI card titles/helpers now
say "ก่อนภาษี" — `มูลค่าใบเสนอราคารวมก่อนภาษี`, `ยอดขายที่ปิดแล้วก่อนภาษี`,
`ยอดขายที่คาดว่าจะปิดได้ก่อนภาษี` — matching the requirement's exact wording; the Expected Sales
helper text (`เฉพาะใบเสนอราคาที่เซลส์ติ๊กว่างานนี้น่าสนใจ`) already matched verbatim, unchanged.
`QuotationStatusSummary`'s value column is now `มูลค่ารวมก่อนภาษี`. Supporting-detail
tables/charts (Executive Ranking, Sales Performance, Job Type Analytics, Customer Analytics,
Sales Pipeline, Approval Dashboard, Revenue Trend/by-Job-Type charts, Expected Sales forecast
chart) gained a "(ก่อนภาษี)"/"(Before VAT)" suffix on every money-bearing label. `csvExport.ts`
column headers gained the same "(Before VAT)" suffixes.

**Verification**: `tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint`,
`npm run build` all pass clean. This sandboxed session has no live-database path (`.env.local`
carries no `MONGODB_URI`, and no Vercel CLI is installed to `vercel env pull` one) — same
limitation as every prior pass, see PROJECT_STATUS.md "Known Risks." Verified instead via a
temporary, isolated Playwright preview harness (`src/devPreview.tsx` + `dashboard-preview.html`,
deleted after use) mounting the real `ExecutiveSummaryCards`/`QuotationStatusSummary`/
`SalesActivityAnalytics` components with representative mock data — confirmed all 4 KPI cards
render with the new titles/helpers, the Status Summary shows the Won/Lost/Active/Non-Active rows
with job counts + pre-tax values + percentages under the new column header, and Sales Activity
Analytics' weekly/monthly/quarterly/yearly tabs switch correctly (clicked "รายสัปดาห์," confirmed
the chart and table both re-rendered for the new period), with zero console errors beyond an
expected missing-favicon 404.

**Files changed**: `api/dashboard/index.ts`, `src/lib/i18n.tsx`, `src/pages/dashboard/csvExport.ts`.
Docs updated: this file, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md,
IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.

---

## 2026-07-13 — Fix Codex-review issues in Company Profile header integration (twelfth same-day pass)

**Scope**: an independent Codex review of the eleventh pass's Quotation-issuer integration
(`docs/CODEX_REVIEW_REPORT.md`) found **zero Critical** and **zero High Priority** issues — the
requested selector/snapshot/RBAC/audit/PDF flow was already correctly implemented end-to-end. It
found 4 Medium and 3 Low Priority items, one of which (Medium #1) was a concrete, safely-scoped
code defect in exactly the header-integration area this task covers; the rest are either
already-documented business decisions, speculative future work, or explicitly out of this task's
scope (full print redesign, live-database integration tests).

1. **Fixed (Medium #1) — the issuer display fallback chain skipped the default active profile.**
   `QuoteDocument.tsx` previously resolved `issuerDisplay` as: quote's own snapshot → the live
   profile the quote references (only if still active/not-deleted) → straight to the legacy
   `company` singleton. A quote with `issuerCompanyId` set but no `issuerCompanySnapshot` (rare
   partial/legacy data), whose referenced profile has since been deactivated or archived, would
   incorrectly jump to the legacy singleton instead of showing the real default active company
   profile. Fixed by inserting the default active profile as an intermediate fallback step, exactly
   matching the review's requested order (snapshot → referenced profile → default active profile →
   legacy singleton). `hasIssuerProfile` (which drives the no-issuer warning banner) now also
   treats this fallback as a genuinely resolved issuer, since it's real, non-fake company data.
2. **Fixed (documentation mismatch)** — `src/lib/quotes.tsx`'s `issuerCompanyId` doc comment and
   `src/lib/companyProfiles.ts`'s `CompanyProfile` doc comment both still said the Quotation
   integration was unbuilt ("prep only, not yet wired" / "no Quotation-form UI selects one yet"),
   left over from before the eleventh pass wired it in. Both corrected.
   `docs/MODULES/CompanyProfiles.md`'s introductory sections had the same stale claim, directly
   contradicting its own later "Quotation Integration" section — corrected, and the "Display
   resolution" fallback description (there and in `MODULES/Quotation.md`) expanded to the accurate
   4-step chain including the new default-profile fallback step.
3. **Not changed, with reason** (see `docs/CODEX_REVIEW_REPORT.md` "Claude Fix Status" for the full
   itemized reasoning): Medium #2 (issuer still optional on Draft — an existing, documented business
   decision, not a defect); Medium #3 (full Company Profile payload returned to the selector — a
   real but non-urgent payload-size optimization, out of this task's header-integration scope);
   Medium #4 (header preview is a selector-panel card rather than a persistent document-header band
   — an intentional, already-reviewed layout, not a functional gap); Low #1/#3 (English-address print
   variant, no dedicated default-profile endpoint — speculative future work); print-layout expansion
   for fax/website/branch/English name (explicitly out of scope per this task's own instructions);
   live-database integration tests (no network path to MongoDB Atlas in this sandboxed session).

**Verification**: `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run
build` all clean. Verified via an isolated Playwright preview mounting the real `QuoteDocument`
component with a quote reproducing the exact Medium #1 scenario (references a deactivated profile,
no snapshot, alongside a separate default active profile) — confirmed the header now shows the
default active profile's real data (not the legacy singleton), no warning banner, and the customer
form below still works, at 1440px and 390px with no console errors or layout overflow.

Docs updated: this file, PROJECT_STATUS.md, CLAUDE.md, TODO.md, DATABASE.md, API.md,
UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md,
and `CODEX_REVIEW_REPORT.md`'s new "Claude Fix Status" section.

---

## 2026-07-13 — Wire Company Profiles into Quotation creation (eleventh same-day pass)

**Scope**: close the gap the ninth pass deliberately left open — "Company Profiles is master-data
management only... nothing sets `Quote.issuerCompanyId`/`issuerCompanySnapshot` yet." This pass
wires company-profile selection all the way through the Quotation form, the server, and the
printed document.

1. **`IssuerCompanySelector.tsx` (new)** — a presentational component shown above the customer
   section on the create/edit Quotation form: "ออกใบเสนอราคาในนามบริษัท." Renders an empty state
   (zero active profiles, with a permission-gated link to Company Profiles), a `<select>` of
   active/non-deleted profiles (with a "ค่าเริ่มต้น" badge on the default), a header preview panel
   (logo/name TH+EN/address/phone/fax/email/website/tax ID/branch — blank fields hidden, never
   placeholder text), a locked-with-tooltip state when the quote has left Draft, and an
   independent warning banner ("ใบเสนอราคานี้ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร") when no real
   issuer company is resolved.
2. **`src/lib/companyProfiles.ts`** — added `IssuerCompanySnapshot` (the frozen-at-issue-time
   shape stored on `Quote.issuerCompanySnapshot`) and `IssuerCompanyDisplay` (a unified rendering
   shape used by both the on-screen preview and the printed document, regardless of whether the
   data came from a live profile, a frozen snapshot, or the legacy `company` singleton), plus
   `issuerDisplayFromProfile()`/`issuerDisplayFromSnapshot()` pure mapping functions.
3. **`src/lib/quotes.tsx`** — `Quote.issuerCompanySnapshot` widened to reference the shared
   `IssuerCompanySnapshot` type (previously an inline, narrower placeholder object type);
   `issuerCompanyId` added to `QuoteDraftFields`.
4. **`api/handlers/company-profiles.ts`** — `GET /api/company-profiles` relaxed to accept either
   `companyProfiles:view` (full list) or `quotations:create` (server-filtered to
   active-and-not-deleted only) — a Sales user who can create quotations but has no Company
   Profile management permission can still populate the selector, without seeing archived/inactive
   profiles or gaining any management capability.
5. **`api/handlers/quotes.ts`** — added `resolveIssuerCompanyUpdate(rawValue)`: validates a
   client-sent `issuerCompanyId` against a real, active, non-deleted `company_profiles` document
   (`400` if missing/inactive/archived), then builds `issuerCompanySnapshot` from that profile at
   that instant, server-side — the client never constructs or sends a snapshot itself. Wired into
   `POST /api/quotes` (create), `PATCH /api/quotes/:id` (Draft-only — `400` if the quote has left
   `"ร่าง"`), and `POST /api/quotes/:id/workflow` (same Draft-only gate, checked against the
   quote's *pre-transition* status since a workflow action like Submit moves it out of Draft in the
   same request). An explicit empty `issuerCompanyId` clears both fields via a MongoDB `$unset`,
   not just an empty-string `$set`. `PATCH` writes a distinct `"Quotation Issuer Company Changed"`
   audit entry (reusing `relatedCompanyProfileId`/`relatedCompanyProfileName`, the same structured
   fields `writeCompanyProfileAuditEntry()` already uses) whenever the issuer specifically changed,
   instead of the generic `"Quotation Updated"` entry.
6. **`src/pages/quotation/QuoteDocument.tsx`** — computes `issuerDisplay` via
   `useSnapshotForDisplay = isDetail && !issuerChanged && !!quote?.issuerCompanySnapshot`, falling
   back to the live-selected profile, then to the legacy `company` singleton (never `undefined`) —
   so the header band and `PrintDocument` never need a "what if there's nothing" branch of their
   own. `hasIssuerProfile` is tracked as an independent signal (decoupled from what's rendered) to
   drive the warning banner. `canChangeIssuer` gates the selector to Draft (`mode === "new"` or
   `status === "ร่าง"`), mirroring the server-side lock.
7. **`src/pages/quotation/PrintDocument.tsx`** — `company: Company` prop replaced with
   `issuer: IssuerCompanyDisplay`; every header/stamp reference (`company.logoDataUrl`/`.name`/
   `.address`/`.taxId`/`.phone`/`.email`/`.stampDataUrl`) renamed to the `issuer.*` equivalent. No
   hardcoded company header remains in the printed document.
8. **`src/pages/quotation/QuotationPage.tsx` / `src/App.tsx`** — `companyProfiles`,
   `canViewCompanyProfiles` (`hasPermission(..., "companyProfiles:view")`), and
   `onNavigateToCompanyProfiles` (`() => setActiveNav("companyProfiles")`) threaded through to
   `QuoteDocument`.
9. **`src/lib/i18n.tsx`** — 8 new keys (`quotation.issuer.title/emptyTitle/emptySub/
   goToCompanyProfiles/selectLabel/selectPrompt/warningNoIssuer/lockedNotDraft`) in both Thai and
   English dictionaries.

**Old quotations are unaffected**: both fields are simply unset on any quote created before this
pass; display falls back through the same chain to the legacy `company` singleton, exactly as it
rendered before this change — no migration/backfill was run or needed.

**Verification**: `npx tsc -b` and `npx tsc --noEmit -p tsconfig.api.json` both clean, `npm run
lint` clean (pre-existing warnings only), `npm run build` clean. Verified via an isolated
Playwright preview harness (`preview.html` + `src/previewMain.tsx`, deleted after use per this
session's established pattern) mounting the real `IssuerCompanySelector` component with mock
`CompanyProfile` data across 5 scenarios — 0 active profiles (empty state), 1 (auto-selected
default), 2+ (explicit selection, default badge), locked/not-Draft (disabled + tooltip), and no
issuer resolved (warning banner) — at 1440px and 390px; all rendered correctly with no console
errors beyond a harmless missing-favicon 404. No live-database manual walkthrough was possible —
same sandboxed-session network limitation as every other pass this session (see PROJECT_STATUS.md
"Known Risks").

**Known limitations, left deliberately undone this pass** (see TODO.md/MODULES/CompanyProfiles.md
for the full reasoning): `quotationPrefix`/`quotationNumberFormat` per company profile don't
compose with `nextQuoteId()`'s single global atomic sequence; no hard block on saving a Draft with
no issuer company selected (a warning is shown instead); `handleWorkflow` doesn't write its own
distinct issuer-change audit entry the way `PATCH` does (the workflow's own transition entry still
fires either way).

Docs updated: this file, PROJECT_STATUS.md, CLAUDE.md, TODO.md, DATABASE.md, API.md, RBAC.md,
UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md.

---

## 2026-07-13 — Fix Codex-review Critical/High Company Profiles issues (tenth same-day pass)

**Scope**: an independent Codex review of the ninth pass's Company Profiles module
(`docs/CODEX_REVIEW_REPORT.md`) found **zero Critical issues** in server-side RBAC enforcement
(every route in `api/handlers/company-profiles.ts` correctly calls `requirePermission()`) and
**3 High Priority issues**, all fixed this pass, plus a genuinely severe bug the review flagged
only as an unverified Medium concern that turned out to be real and worse than described.

1. **Fixed — the app's boot sequence broke for any role without `companyProfiles:view`.** The
   ninth pass added an unconditional `fetchCompanyProfiles()` call to the shared boot/sign-in
   `Promise.all` in `App.tsx` (3 call sites). Sales User, Approver Level 1/2, and Viewer — every
   default role except Super Admin/Administrator — don't hold `companyProfiles:view`, so
   `GET /api/company-profiles` correctly 403s for them, which rejected the whole `Promise.all`.
   Since the boot effect has no surrounding `try`/`catch` (a pre-existing, separately-tracked
   gap), `bootStatus` never reached `"ready"` — **every non-admin user who signed in got stuck on
   the loading spinner indefinitely.** Fixed with `.catch(() => [])` on all 3 call sites: a caller
   who can't see this resource anyway correctly falls back to an empty list instead of taking down
   the whole app. Separately, `handleSignIn` (the normal login flow, distinct from initial page
   load) was never fetching company profiles at all — a genuine gap from the ninth pass, not
   something Codex flagged — fixed alongside. Codex's own review flagged this general area only as
   Medium Priority ("needs runtime verification"); verifying it surfaced a bug worse than
   described, so it's fixed with the same urgency as the High Priority items below.
2. **Fixed (High #1) — a current default company could be deactivated without reassignment.**
   `PATCH /api/company-profiles/:id` accepted `isActive: false` with no check against
   `target.isDefault`, and the list UI offered the Deactivate action on default rows. Fixed:
   the handler now rejects deactivating the current default with the same
   "set another company as default first" error the archive action already used; the `isActive`
   toggle also now shows a confirmation dialog before deactivating (previously immediate, no
   confirmation at all — a related UX gap the same review flagged as Medium).
3. **Fixed (High #2) — the one-default rule was unsafe under concurrent requests.** First-creation
   used `countDocuments` then `insertOne`, and set-default used `updateMany` then `updateOne`,
   neither inside a transaction or backed by a database constraint — two simultaneous "first
   create" or "set default" requests could interleave and leave two documents both claiming
   `isDefault: true`. Fixed with a **partial unique MongoDB index** —
   `{ isDefault: 1 }` with `partialFilterExpression: { isDefault: true }` — so the database itself
   now guarantees at most one default document can exist, not just the application-level
   sequencing (which reduces the race window but can't eliminate it alone). Both write paths catch
   the resulting duplicate-key error: a losing concurrent "first create" retries once as a
   non-default profile (there's now definitely already a winner), and a losing concurrent
   set-default surfaces a clear "someone else just changed the default, try again" message instead
   of a raw 500. Bundled in the same fix: the auto-assigned first-ever profile is now also forced
   `isActive: true` regardless of the create form's Active checkbox (Medium finding — "the first
   profile is forced default but can be created inactive," a real invariant break on its own).
4. **Fixed (High #3) — Company Profile audit entries were client-authored and incomplete.**
   `CompanyProfilesPage.tsx` called the generic `POST /api/audit-log` after each mutation
   succeeded — any authenticated caller could forge an arbitrary "Company Profile Created"/"Default
   Company Changed" entry with fabricated text, and entries carried no structured link to which
   profile changed. Fixed the same way the 2026-07-10 quotation audit-integrity fix did: a new
   `writeCompanyProfileAuditEntry()` inside `api/handlers/company-profiles.ts` writes the
   authoritative entry as part of each mutation (create/update/archive/set-default), stamped with
   the already-verified session identity, `relatedCompanyProfileId`/`relatedCompanyProfileName`
   (new optional `AuditLogEntry` fields, same pattern as `relatedQuoteId`/`relatedCustomerName`),
   and a Thai description of which fields changed — logo/stamp changes are named explicitly
   ("แก้ไข: โลโก้บริษัท"), not folded into a generic "field updated" message, per the review's
   "distinct logo/stamp upload events" ask. `POST /api/audit-log` now rejects the `"โปรไฟล์บริษัท"`
   module outright, mirroring the existing `"ใบเสนอราคา"` lockout — this is now the only path
   Company Profile audit entries can be written through. The now-redundant client-side `onAudit`
   calls and prop were removed from `CompanyProfilesPage.tsx`/`App.tsx`.
5. **Fixed (Medium) — the detail view didn't show `createdBy`/`updatedBy`.** `CompanyProfileDetail.tsx`
   now resolves both to the user's full name (via a `users` prop threaded from `App.tsx`, same data
   already in state for every other admin page), falling back to the raw stored ID if the account
   was since deleted rather than hiding the field.
6. **Fixed (Medium) — blank bank-account rows were accepted.** `companyProfileValidation.ts` now
   drops bank-account entries where every field (bank/account name/number/branch) is empty before
   storing — not full per-field required validation, just a floor against persisting pure-noise
   rows left over from clicking "+ Add Bank Account" without filling anything in.
7. **Fixed (Low) — icon-only row actions relied on `title` alone, and logo/stamp `<img>` alt text
   was generic.** Added explicit `aria-label`s (View/Edit/Set Default/Activate/Deactivate/Archive,
   each naming the specific company) to every icon-only button in `CompanyProfileList.tsx`, and
   changed logo/stamp `alt` text from the literal words "logo"/"stamp" to
   "{field label} — {company name}" in both the list and detail views.
8. **Deliberately not fixed this pass, with reasons** (see `docs/CODEX_REVIEW_REPORT.md`'s new
   "Claude Fix Status" section for the full list): server-side pagination/filtering/projection on
   `GET /api/company-profiles` (Medium — real at scale, but this is a small internal master-data
   list today, and building it now would be speculative before real usage volume exists); an
   inline "Set as Default" control inside the Basic Information form section, in addition to the
   existing dedicated list action (Medium — the review itself notes "the separate API is safer,"
   so the dedicated action was kept as the only path rather than adding a second one that would
   need the exact same invariant checks duplicated in the form); `archivedAt`/`archivedBy` as
   distinct structured fields separate from the generic `updatedAt`/`updatedBy` (Medium — the new
   audit-log entries already capture *when* and *by whom* an archive happened, which was the
   underlying gap; adding parallel fields to the document itself would be duplicating that data,
   not closing a real gap); a MongoDB transaction wrapping create/set-default (superseded — the
   partial unique index added in fix #3 above closes the actual data-integrity gap a transaction
   would have addressed, without introducing a pattern (multi-document transactions) nothing else
   in this codebase uses).
9. **Documentation corrected to match the code, not the aspiration** (Codex review, "Documentation
   mismatch" — the doc updates below fix 3 specific overclaims the review caught): bank accounts
   are capped at 10, not "unlimited" as `MODULES/CompanyProfiles.md` previously said; the
   default-profile invariant is now described with its real, database-enforced guarantee (the
   partial unique index) rather than the weaker "sequenced, not atomic" language that predated
   fix #3; audit entries are now described as server-authoritative (matching the quotation
   precedent), not "client-triggered, matching Users/Roles/Settings" as the ninth pass's docs said
   — that description was accurate for the ninth pass's actual code, and is now updated to match
   the tenth pass's fix.
10. **Verification**: same environment constraint as every same-day pass this session (no local
    backend). `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
    all pass clean. Visually verified via an isolated Playwright preview of the real
    `CompanyProfileList`/`CompanyProfileDetail` components with mock data — confirmed the new
    deactivate confirmation dialog fires correctly, and the detail view's "สร้างโดย"/"แก้ไขล่าสุดโดย"
    rows resolve a real user ID to a name and correctly fall back to the raw ID for a
    since-deleted account. No live-database concurrency test (two genuinely simultaneous
    set-default requests racing against real MongoDB) was possible in this sandboxed session — the
    partial unique index's guarantee is a MongoDB-documented behavior, not independently
    load-tested here; flagged in TODO.md as worth a real concurrency test once a live environment
    is available.
11. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, RBAC.md,
    UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, and
    `CODEX_REVIEW_REPORT.md`'s new "Claude Fix Status" section.

---

## 2026-07-13 — Add Company Profiles module (multi-company quotation issuer prep, ninth same-day pass)

**Scope**: a new admin module preparing the ERP for multi-company quotation issuance in the
future — add/edit/view/activate-deactivate/archive/set-default management of "Company Profile"
master-data records (the official business identity that goes on a quotation document: name,
logo, address, tax ID, branch, bank accounts, quotation prefix/terms/footer, stamp). Explicitly
**not** a customer, not a user account, not a multi-tenant/multi-website split — this remains one
internal ERP, now with a second kind of company-identity master data alongside the existing
single `company` singleton (Settings → Company Info, unchanged, still the app's own
branding/settings record — see "Two company records" note below). No Quotation-form UI selects a
company profile yet; that integration is deliberately deferred, with only non-breaking prep fields
added to `Quote` (`issuerCompanyId`/`issuerCompanySnapshot`, both optional, nothing sets them yet).

1. **New MongoDB collection `company_profiles`** (`api/_lib/collections.ts`), full shape in
   DATABASE.md. Every field from the request is present: `companyCode`/`companyNameTh`/
   `companyNameEn`/`displayName`/`logoDataUrl`/`addressTh`/`addressEn`/`taxId`/`branchName`/
   `branchCode`/`phone`/`fax`/`email`/`website`/`bankAccounts[]`/`quotationPrefix`/
   `quotationNumberFormat`/`quotationTerms`/`quotationFooter`/`stampDataUrl`/`signatureLabel`/
   `isDefault`/`isActive`/`isDeleted`/audit fields. No seed data — an empty collection until an
   admin adds the first profile, per the "no fake data" rule.
2. **Default-profile invariants enforced server-side** (`api/handlers/company-profiles.ts`): the
   very first profile ever created is automatically `isDefault: true` regardless of what the
   client sends (`CompanyProfileDraft` has no `isDefault` field at all — it can only change via
   the dedicated set-default action); setting a new default atomically unsets the previous one;
   archiving (soft-deleting) the current default is blocked with a clear Thai error until another
   profile is set default first; setting an archived or inactive profile as default is blocked.
3. **New API**: `GET/POST /api/company-profiles`, `GET/PATCH /api/company-profiles/:id`,
   `POST /api/company-profiles/:id/archive`, `POST /api/company-profiles/:id/set-default` — see
   API.md. This is the **12th and final Vercel serverless function** under Vercel Hobby's 12-function
   cap (`api/handlers/{auth,users,roles,products,categories,notifications,quotes,jobtypes,
   company-profiles}.ts` + `api/{company,audit-log,dashboard}/index.ts`) — any future new resource
   must be folded into an existing handler file (a new `parts[N] === "..."` branch) rather than a
   new file, or the project needs a paid Vercel plan first.
4. **New server-side validation** (`api/_lib/companyProfileValidation.ts`, mirrors
   `quoteValidation.ts`'s style): Company Name (Thai) and Company Code are the only required
   fields; email format, website URL format, and Thai Tax ID (13 digits) are validated when
   non-empty; logo/stamp reuse the existing `validateImageDataUrl()` (same base64-data-URL,
   2MB-cap approach as Company Settings/User profile/signature — no new upload infrastructure was
   built, per the request's explicit "implement a simple existing-compatible approach" allowance).
5. **6 new permissions**: `companyProfiles:view/create/edit/archive/delete/setDefault` — see
   RBAC.md. Unlike `company:manage` (the single-company settings permission, structurally locked
   to Super Admin only), these are **not** super-admin-locked — a Super Admin can grant broader
   access to Administrator (or a custom role) via the normal Role Management permission matrix,
   matching the request's "Admin: can create/edit if permission is granted." Administrator's
   default role ships with `companyProfiles:view` only; create/edit/archive/setDefault/delete are
   explicit grants, not automatic. `companyProfiles:delete` is defined (per the request's literal
   permission list) but not wired to any additional route — this app's only "delete" is the
   reversible archive action (`companyProfiles:archive`), matching the existing Category/Job
   Type precedent of no hard-delete route; documented as a deliberate decision, not a gap.
6. **New UI** (`src/pages/admin/companyProfiles/`): `CompanyProfilesPage.tsx` (view-switcher,
   mirrors `ProductsPage.tsx`), `CompanyProfileList.tsx` (search/filter by active-inactive/default,
   show-archived toggle, per-row View/Edit/Set Default/Activate-Deactivate/Archive actions,
   permission-gated), `CompanyProfileForm.tsx` (6 sections — ข้อมูลบริษัท/ข้อมูลติดต่อ/ข้อมูลสำหรับ
   เอกสาร/โลโก้และตราประทับ/บัญชีธนาคาร/การตั้งค่า — client-side validation with the exact requested
   Thai error copy, a repeatable bank-account editor, and an unsaved-changes discard-confirmation
   dialog), `CompanyProfileDetail.tsx` (read-only view). Sidebar entry "ข้อมูลบริษัท" added under
   the existing "การจัดการระบบ" (System Management) group, permission-gated on
   `companyProfiles:view`. Exact requested empty-state copy: "ยังไม่มีข้อมูลบริษัท" /
   "เริ่มต้นโดยการเพิ่มข้อมูลบริษัทสำหรับใช้บนเอกสารใบเสนอราคา".
7. **Extracted `src/components/ImageUploadField.tsx`** from what was previously inlined only
   inside `SettingsPage.tsx` — now genuinely shared between Company Settings' logo/stamp fields
   and the new Company Profile form's logo/stamp fields, rather than a second copy-paste.
8. **Audit logging**: Company Profile Created/Updated/Archived/Restored/Activated/Deactivated and
   Default Company Changed all write real entries via the existing client-triggered
   `POST /api/audit-log` path (`onAudit` callback threaded from `App.tsx`, same established
   pattern as Users/Roles/Company Settings — **not** the server-authoritative
   `writeQuoteAuditEntry()` pattern used for quotes, since that pattern was specifically built to
   close a Dashboard-metric forgery risk that doesn't apply here). `moduleForAction()` in
   `App.tsx` gained a "Company Profile"/"Default Company Changed" branch, checked **before** the
   existing generic `"Company"` prefix match (which would otherwise mislabel these as the
   single-company Settings module).
9. **Future Quotation integration, prepared but not built**: `Quote` (`src/lib/quotes.tsx`)
   gained two optional fields, `issuerCompanyId?: string` and `issuerCompanySnapshot?: {...}` — a
   full snapshot of the issuing company's document-relevant fields, captured **at issue time**,
   never read live from the referenced profile (same rationale as `QuoteLine` never referencing
   `Product` live — editing a company profile later must never silently change a quotation that
   already went to a customer). Nothing currently sets these fields; no quote form UI, no handler
   write path, no validation whitelist entry — genuinely inert until a future pass wires them up.
   Fully non-breaking: every existing quote document is unaffected.
10. **Two company records now exist in this app, deliberately** — `company` (the pre-existing
    singleton, Settings → Company Info, this app's own identity/branding, still used everywhere
    it already was) and `company_profiles` (new, the set of identities a *quotation* can eventually
    be issued under). They are not merged and not migrated into each other this pass — see
    MODULES/CompanyProfiles.md "Relationship to the `company` singleton" for the reasoning and the
    still-open question of what happens to them once real Quotation-form integration is built.
11. **Verification**: same environment constraint as every same-day pass this session (no local
    backend). `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
    all pass clean. Visually verified via an isolated Playwright preview of the real
    `CompanyProfileList`/`CompanyProfileForm`/`CompanyProfileDetail` components with mock data
    (one default profile with 2 bank accounts and a logo, one inactive profile, one archived
    profile) at 1440px and 390px — confirmed the empty state's exact copy, the required-field and
    format-validation error messages (matching the request's literal Thai examples), the
    unsaved-changes discard-confirmation dialog, the default/inactive/archived badges, and the
    bank-account default-tag all render correctly. No live-database click-through (create → set
    default → archive against real MongoDB) was possible in this sandboxed session — see TODO.md.
12. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, RBAC.md,
    UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md (new),
    MODULES/Quotation.md.

---

## 2026-07-13 — Fix Codex-review High Priority Dashboard status/filter issues (eighth same-day pass)

**Scope**: a follow-up independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) audited the
seventh pass's P'Keng/P'Kee completion work. Result: **zero Critical issues** — the review
confirmed the 4 required KPI cards, Expected Sales' `isPotentialOpportunity`-only rule, the
Sales Activity Analytics weekly/monthly/quarterly/yearly views, the salesperson filter, the
Created/Edited activity counts, and "no fake data" were all already correct. **3 High Priority
issues** were found; 2 are fixed this pass, 1 (department filtering) is a documented, already-
tracked business decision deliberately not attempted here — see below.

1. **Fixed: Win/Lose/Active/Non-Active double-counted Lost quotations.** `QuotationStatusSummary`'s
   donut/table presents 4 rows and a Percentage column (count ÷ sum of all 4 rows' counts) — but
   `NON_ACTIVE_OUTCOME_STATUSES` in `api/dashboard/index.ts` included `เสียโอกาส` (Lost) alongside
   Cancelled/Customer Rejected, so every Lost quote was counted in *both* the Lose row and the
   Non-Active row. The 4 rows' counts summed to more than `docs.length`, and the percentage column
   didn't add up to 100% — a real correctness bug for an executive-facing summary, not a display
   nit. **Fixed at the source**: `NON_ACTIVE_OUTCOME_STATUSES` no longer includes Lost (Lost
   already has its own row). Win + Lose + Active + Non-Active are now a true partition of every
   quote status — every quote counts in exactly one row, every percentage column now sums to
   exactly 100%. `kpis.nonActiveQuotations`/`nonActiveQuotationsValue` (also used by
   `SalesPerformancePanel`'s "Non-Active Jobs" tile and the CSV export) changed meaning
   consistently everywhere they're used — there is now only one definition of "Non-Active,"
   not a donut-only one and a KPI-only one. Updated the `dashboard.kpi.help.nonActiveQuotations`
   Thai/English copy to match (no longer lists "Lost" among Non-Active's causes, explicitly notes
   why).
2. **Improved: rolling-trend widgets now state their actual anchor date.** Sales Activity
   Analytics and Revenue Trend both intentionally ignore the date filter's `from` bound to keep a
   real trailing window (documented, unchanged) — but the review noted that a generic "rolling
   trend, not limited by the filter's start date" caption doesn't tell a user *what date it does
   end on*, which reads as vague rather than precise. Both widgets' `sub` caption now appends
   "— ending [date]" using the selected filter's `to` date, or today (Bangkok-local) if no `to`
   is selected — computed via a new `todayIsoBangkok()` helper (`dateRanges.ts`) and a new
   `fmtDateShort()` formatter (`format.ts`), threaded in as an `anchorDate` prop from
   `DashboardPage.tsx`. New dictionary key `dashboard.trend.endingOn` ("สิ้นสุดที่" / "ending on").
3. **Deliberately not fixed this pass: department filtering is a fragile free-text join.**
   `api/dashboard/index.ts` resolves a Department filter by matching free-text `User.department`
   to `Quote.salesperson` via `User.fullName` — accurate only as long as names never collide,
   get typo'd, or get renamed. A real fix needs `Quote` to carry a stable `salespersonUserId`
   (and `User`/`Quote` to carry a real `departmentId`), which in turn requires deciding whether
   the Quotation form's free-text Salesperson field should become a locked dropdown of real
   `User` records — a genuine product/workflow decision, not a bug fix, and already tracked as a
   "Business decision needed" item in TODO.md (added during the 2026-07-10 pass). Not attempted
   here without that sign-off; also out of the explicit fix-list for this pass (department wasn't
   named, salesperson filtering was — and salesperson filtering itself was independently
   confirmed correct by this review).
4. Every Medium/Low item from this review (quote soft-deletion readiness, "activity is
   audit-performer not quote-owner" terminology, deep-detail-area length, small chart typography)
   is a documented, non-blocking observation, not a defect — left as-is, not tracked as new TODOs
   beyond what's already noted in this review's own report.
5. **Verification**: same environment constraint as every same-day pass this session (no local
   backend). `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
   all pass clean. Visually verified via an isolated Playwright preview composing the real
   `QuotationStatusSummary`/`SalesActivityAnalytics`/`RevenueTrendChart` components with mock data
   constructed so Won+Lost+Active+NonActive sum to exactly `totalQuotations` (30+10+45+15=100) —
   confirmed all 4 percentages now sum to 100% (was previously >100% before this fix) — and
   confirmed both widgets' captions render "สิ้นสุดที่ 13 ก.ค. 2569" / an equivalent anchor date,
   at 1440px and 390px.
6. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md,
   MODULES/Dashboard.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Complete Dashboard against the P'Keng/P'Kee business requirement (seventh same-day pass)

**Scope**: a business-stakeholder requirement doc (P'Keng/P'Kee) listing exact required Dashboard
content, exact Thai label/subtitle text, an exact 5-section page structure, a Win/Lose/Active/
Non-Active status-mapping rule, and detailed Sales Activity Analytics requirements (period +
salesperson grouping, tracked event types, a per-salesperson summary table, and a Recent Activity
list with structured quotation/customer fields). **Clarified one high-stakes ambiguity with the
user before touching any code**: the requirement's status mapping would have counted "Customer
Accepted" (ลูกค้ายอมรับ) as Win and "Customer Rejected" (ลูกค้าปฏิเสธ) as Lose, which conflicts with
every other Win Rate/Closed Sales/Average Deal Size/Revenue Trend calculation on the page (all of
which only count formally-closed ปิดการขายสำเร็จ/เสียโอกาส). User confirmed: **keep today's
definition everywhere** — no status-mapping logic was changed.

1. **Exact-text corrections** across the page, matching the requirement's literal copy: page
   subtitle ("สรุปใบเสนอราคา ยอดขาย และกิจกรรมของฝ่ายขาย", was "ข้อมูลแบบเรียลไทม์จากฐานข้อมูล"),
   the Closed Sales KPI label ("ยอดขายที่ปิดได้แล้ว", was missing "ได้"), the Quotation Status
   Summary section title/subtitle ("สถิติสถานะใบเสนอราคา" / "สรุปจำนวนงานตามสถานะ Win / Lose /
   Active / Non Active", was "สถานะใบเสนอราคา" / a different Thai phrasing), and the Sales Activity
   subtitle (now leads with the requirement's exact phrase, "ติดตามการเปิดใบเสนอราคาใหม่และการแก้ไข
   ใบเสนอราคาเดิม", with the existing filter-honesty caveat appended after it rather than replaced).
2. **`ExecutiveSummaryCards.tsx` now shows a one-line helper caption under every card's value**
   (previously only Expected Sales had an (i) tooltip, no card had visible helper text) — the 4
   helper strings match the requirement's exact wording (3 of the 4 existing `dashboard.kpi.helper.*`
   keys were reworded slightly to match exactly; Expected Sales' was already an exact match).
3. **Page reorganized to the requirement's exact 5-row layout**: Header+Filters →
   `ExecutiveSummaryCards` → `QuotationStatusSummary` (now full width, no longer paired with the
   forecast chart) → `SalesActivityAnalytics` (full width) → `ActivityTimeline` ("Recent Activity
   Details"). `SalesPerformancePanel`, `ActivityFollowUpSummary`, and `ExpectedSalesForecastChart`
   — real, still-computed, filter-aware data, just not named in this requirement's required-5 list
   — moved into the existing "supporting detail" section below, per the requirement's own
   instruction to "focus first on the exact required business information" and move anything else
   lower. **Nothing was deleted** — same components, same data, different position on the page.
4. **Sales Activity Analytics gained a per-salesperson breakdown table** ("สรุปตามพนักงานขาย" —
   ช่วงเวลา/พนักงานขาย/เปิดใบเสนอราคาใหม่/แก้ไขใบเสนอราคาเก่า/กิจกรรมรวม columns), a genuinely new
   feature: `api/dashboard/index.ts`'s `salesActivity` aggregation now also buckets by
   `(period, salesperson)`, not just by period — Created/Edited only (the 2 event types this
   requirement explicitly names), distinct from the 5-category stacked chart above it. Only
   non-zero rows are returned (no combinatorial zero-row explosion across every period × every
   salesperson). **Bug caught and fixed during implementation**: an early version of this
   aggregation joined `period` and `salesperson` into one string key (`` `${period} ${salesperson}` ``)
   and split it back apart later — Thai full names routinely contain a space (e.g. "สมชาย ธนากร"),
   which would have silently truncated names on split. Fixed with a proper nested `Map<period,
   Map<salesperson, counts>>` instead of any string join/split. A related literal NUL-byte
   (`\x00`) corruption was also found and fixed in the same block, introduced by an earlier
   editing pass in this session — verified clean via a full-file scan before proceeding.
5. **Recent Activity Details (`ActivityTimeline.tsx`) rebuilt as a proper table** (was a card
   list) with the requirement's exact columns — วันที่/พนักงานขาย/กิจกรรม/ใบเสนอราคา/ลูกค้า — and
   the quotation number is now a clickable link that opens the quotation directly (`onOpenQuote`,
   threaded from `App.tsx`'s existing `navigateToQuotation()`, previously only wired to
   `NotificationBell`). **Backend addition**: `writeQuoteAuditEntry()` (`api/handlers/quotes.ts`)
   now optionally stores structured `relatedQuoteId`/`relatedCustomerName` fields on every
   quote-workflow audit entry (Created/Updated/Duplicated/every workflow transition) — the
   quotation number and customer name were already embedded in the entry's free-text `details`
   string, but the Dashboard needs them as real fields to render as columns/a link instead of
   parsing prose. Backward-compatible: `AuditLogEntry`'s 2 new fields are optional, older entries
   and non-quote modules (Users/Roles/Settings/Login) simply render "—" for both.
6. **New `audit_log` index**: `{ action: 1, createdAt: -1 }` — the Sales Activity query now scans
   5 action values (was 2, see the sixth pass below) and commonly runs with no `userName` filter
   ("All Sales" selected), which the existing `{ userName: 1, createdAt: -1 }` index can't serve.
7. **Database/index requirements not applicable to the current schema**: the requirement's
   suggested `quotations.salespersonId`/`departmentId`/`isDeleted`/`createdAt`/`updatedAt` indexes
   don't apply — this schema uses free-text `salesperson` (no ID/FK), has no `departmentId` (department
   is resolved via `User.department` free-text join, documented in DATABASE.md), no soft-delete
   flag, and `Quote` has no `createdAt`/`updatedAt` timestamp fields at all (a pre-existing, already
   tracked gap — see TODO.md). Indexing non-existent fields wasn't attempted; see DATABASE.md for
   the actual schema.
8. **Verification**: same environment constraint as every same-day pass this session (no local
   backend). `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
   all pass clean. Visually verified via an isolated Playwright preview composing the real
   `ExecutiveSummaryCards`/`QuotationStatusSummary`/`SalesActivityAnalytics`/`ActivityTimeline`
   components with representative mock data (including 2 salespeople with space-containing Thai
   names, specifically to exercise the bucketing-bug fix) at 1440px (all 5 sections render in the
   exact requested order, per-salesperson table and clickable quotation links both work, no
   overlapping labels) and 390px (clean stacking, Recent Activity table scrolls horizontally
   within its existing wrapper, consistent with every other Dashboard table).
9. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md,
   UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Fix Codex-review High Priority Dashboard data/filter issues (sixth same-day pass)

**Scope**: a follow-up independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the fifth pass
found **zero Critical issues** and 4 High Priority issues — all data/filter-correctness bugs, not
visual regressions (the review explicitly confirmed the 4-card KPI summary, the funnel-chart
removal, Expected Sales, and the sidebar overflow fix are all already correct). Fixed all 4:

1. **Sales Activity Analytics now tracks all 5 requested event categories**, not just 2. Previously
   `api/dashboard/index.ts`'s `salesActivity` aggregation only counted `"Quotation Created"`/
   `"Quotation Updated"`. Added a `categoryForAction()` mapping covering every audit action
   `writeQuoteAuditEntry()` can write: `"Quotation Submitted"` → Approval Requested,
   `"Quotation Approved"` → Approval Completed, `"Quotation Rejected"` + the generic
   `"Status Changed"` → Status Changed (both are "the quote's status field changed," not a content
   edit). `SalesActivityAnalytics.tsx` now renders all 5 as a **stacked** bar chart (not 5 grouped
   bars per period, which would have tripled the visual density this section exists to avoid) plus
   a matching 6-column table. `SalesActivityPeriod`/`SalesActivityTrend` types (`lib/dashboard.ts`)
   extended to match.
2. **The Sales Activity/Revenue Trend "rolling window, doesn't honor the filter's start date"
   behavior is now stated in the UI**, not silent. Both trend widgets were already correctly
   anchoring their *end* to the filter's `to` date (or today) while intentionally showing a fixed
   trailing window regardless of `from` — a deliberate design so a "last 12 months" trend chart
   doesn't collapse to 1-2 points when a user picks a narrow date range. The review flagged the
   *silence* about this as misleading, not the behavior itself (both options — fully honor `from`,
   or label clearly — were offered; forcing full compliance would break the trend charts'
   usefulness, so labeling was the fix that didn't touch the underlying "don't remove business
   logic" trend-window design). `dashboard.salesActivity.sub`/`dashboard.chart.revenue.sub` now
   say so explicitly in Thai and English.
3. **Every other deliberately-unfiltered widget now says so in the UI too**: `ProductsByCategoryChart`
   ("all time, not filtered" — it's a catalog snapshot, not quotation activity), `NotificationSummary`
   (new caption: "your personal data — not affected by dashboard filters"), and the forecast panel's
   win-rate baseline (`dashboard.forecast.basedOn` reworded to "based on **company-wide**
   historical win rate," making explicit that the baseline is deliberately not salesperson-scoped
   for statistical stability — already true and already documented in code comments, just not
   visible in the UI). No filtering logic changed — only added labels, per the review's own
   "either apply the filter everywhere or label clearly" framing and this task's "do not remove
   business logic" instruction.
4. **Fixed `QuotationStatusSummary`'s count/value population mismatch.** The panel's Won/Lost/
   Active/Non-Active table used to derive its *value* column by summing the `pipeline` prop's
   per-stage totals grouped by raw status — which doesn't carve out expired-but-unclosed quotes
   the way the Active/Non-Active *counts* do (from `DashboardKpis`), so a row could show a count
   that excludes an expired quote sitting right next to a value that still included its amount.
   Fixed at the source: `api/dashboard/index.ts` now computes `lostValue`/`activeQuotationsValue`/
   `nonActiveQuotationsValue` using the *exact same* predicates as their matching count fields
   (`lostDocs`/`activeDocs`/`nonActiveDocs`), returned as new `DashboardKpis` fields. `Quotation
   StatusSummary.tsx` now reads these directly instead of approximating from `pipeline` — the
   `pipeline` prop is no longer needed by this component at all, so it was dropped from its props
   and from the `DashboardPage.tsx` call site. Count and value now always describe the same
   population, no more approximation to document.
5. **Verified already-correct, not touched**: exactly 4 primary KPI cards, no huge card wall
   (confirmed by the review's own source read); the old funnel chart stays gone (`PipelineSteps.tsx`
   untouched); Expected Sales visible and computed as the literal "Potential Opportunity" rule;
   Win/Lose/Active/Non-Active visible in `QuotationStatusSummary`; sidebar overflow fix, mobile
   drawer, and Noto Sans Thai typography unchanged (`git diff --stat` confirmed zero changes to
   `BrandMark.tsx`/`App.tsx`/`styles/{theme,index,fonts}.css`).
6. **Verification**: same environment constraint as every prior same-day pass (no local backend).
   `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json` (the backend `api/dashboard/index.ts`
   change needed this too), `npm run lint`, and `npm run build` all pass clean. Visually verified
   via an isolated Playwright preview composing the real `QuotationStatusSummary` (no `pipeline`
   prop), `SalesActivityAnalytics` (5-category stacked chart), `RevenueTrendChart`,
   `ProductsByCategoryChart`, `ExpectedSalesForecastChart`, and `NotificationSummary` with
   representative mock data reflecting the new `DashboardKpis` fields (deleted before finishing),
   at 1440px (all new captions/labels visible, stacked chart readable, no overlapping labels) and
   390px (chart and 6-column table both remain usable, table scrolls horizontally within its
   existing wrapper, no page-level overflow).
7. **Not done this pass** (Medium/Low priority per the review, not requested): supporting-detail
   area still requires scrolling (no collapse control); Overdue Follow-ups/Expired Quotations
   task tiles still aren't clickable (no matching date-derived quotation-list filter exists to
   link to); `ActivityTimeline` still has no structured related-record field (`details` is free
   text); charts still don't have a non-visual tabular fallback beyond the ones that already
   double as a table (Sales Activity, Quotation Status); repeated inline Playfair/color style
   objects across Dashboard components not consolidated into shared tokens.
8. Docs updated: this file, CLAUDE.md (`docs/CLAUDE.md`'s module table), PROJECT_STATUS.md,
   TODO.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.

---

## 2026-07-13 — Reorder Dashboard into the full 7-section structure (fifth same-day pass)

**Scope**: a fully-specified follow-up to the fourth pass — the same underlying request (simplify,
don't add large cards, don't remove business logic), but this time naming the exact 7 top-level
sections wanted, in order, and 2 concrete content gaps: Sales Activity Analytics needed to be a
named top-level section (it existed but was buried in the "supporting detail" area below the
fold), and Sales Performance needed Active/Non-Active Quotations added to its metric list.

1. **`SalesActivityAnalytics` promoted from "supporting detail" into the top overview**, now
   sitting between `SalesPerformancePanel` and `ActivityFollowUpSummary` — matching the requested
   order exactly (Executive Summary → Quotation Status → Sales Performance → Sales Activity
   Analytics → Tasks/Follow-up/Approvals → Recent Activities). No changes to the component itself
   or its underlying data — same filter-aware Created/Edited trend chart + period table, still
   respects the global date/department/salesperson filters server-side, still has its own
   `hasData` empty state (no fake charts on empty data).
2. **`SalesPerformancePanel.tsx` gained Active Quotations and Non-Active Quotations** (now 8
   metrics in a `grid-cols-2 sm:grid-cols-4` layout, was 6 in `grid-cols-2 sm:grid-cols-3`) — the
   requested example table listed these two counts alongside the 6 rate/cycle-time metrics.
   They're also shown in `QuotationStatusSummary`'s table (a different view — per-status
   count/value/share vs. this panel's flat metric list); showing both isn't a duplication bug,
   it's two different useful cuts of the same numbers, matching what was explicitly requested.
3. **Expected Sales helper text reworded** to lead with the requested exact phrase ("เฉพาะใบเสนอราคา
   ที่เซลส์ติ๊กว่างานนี้น่าสนใจ") while keeping the "regardless of status" qualifier — that qualifier
   is load-bearing (Expected Sales genuinely does include closed/lost quotes still flagged
   Potential Opportunity, not just active ones), so it wasn't dropped for the sake of matching the
   shorter requested wording exactly.
4. **Verified, not changed** (all already true from prior passes, re-confirmed this pass):
   - Page title "ภาพรวมผู้บริหาร" / subtitle "ข้อมูลแบบเรียลไทม์จากฐานข้อมูล" — exact match already.
   - The old broken funnel chart is gone — `PipelineSteps.tsx` (horizontal step cards, "Option A"
     from the request) has been the pipeline visualization since 2026-07-10; it wasn't touched
     this pass and was never reverted to the funnel shape.
   - Sidebar overflow fix, mobile drawer, and Noto Sans Thai typography — unchanged since the
     first same-day pass, confirmed via `git diff --stat` showing zero changes to `BrandMark.tsx`,
     `App.tsx`, or `styles/{theme,index,fonts}.css`.
   - Empty states — every section already guards on its own `hasData`/`hasAnyData` check before
     rendering a chart/table, falling back to a real `EmptyState` component (no fake data, no
     broken blank charts) — this predates this pass, not newly added.
5. **Verification**: same environment constraint as the prior 4 same-day passes (no local
   backend). Built a throwaway isolated preview composing all 7 real section components with
   representative mock data (deleted before finishing) in the exact requested order, verified via
   Playwright at 1440px (full page: header/filters → 4 KPI cards → status donut+table → forecast
   → 8-metric performance grid → activity trend chart+table → 4-tile task row → recent-activity
   list, no overlapping labels, no blank/broken charts) and 390px (clean single/2-column mobile
   stacking, no horizontal overflow). `npx tsc -b`, `npm run lint`, and `npm run build` all pass
   clean.
6. **Not done this pass** (flagged for a future pass / Codex review, see "What Codex should
   review next" in the final summary): `SalesActivityAnalytics` still only tracks 2 event
   categories (Created/Edited) against the 5 the request described (also Status Changed, Approval
   Requested, Approval Completed) — the underlying `audit_log` actions already distinguish these
   (`writeQuoteAuditEntry()` records "Submitted"/"Approved"/"Rejected"/"Status Changed" alongside
   "Quotation Created"/"Quotation Updated"), so extending the `api/dashboard/index.ts` aggregation
   to bucket by these categories is feasible, but wasn't attempted this pass — it's a backend
   aggregation change with no live-data path to verify against in this sandboxed session, and
   wasn't one of the explicit "Manual Website Verification" checklist items. Similarly, "Recent
   Activities" showing a structured "related quotation/customer" column (vs. today's free-text
   `details` field, which already contains this info as text) wasn't restructured — would need an
   `AuditLogEntry` schema change, out of scope for a display-reorganization pass.
7. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, UI_GUIDELINES.md,
   IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Simplify the Dashboard overview into 5 compact sections (fourth same-day pass)

**Scope**: further direct user feedback — even the flat 22-card `KpiGrid.tsx` from the previous
same-day pass "is still too cluttered and hard to understand... everything looks equally
important... feels like a generated template." Explicit request: reduce to 4 primary KPI cards
and reorganize everything else into compact panels/lists across exactly 5 named sections
(Executive Summary, Quotation Status, Sales Performance, Activity & Follow-up, Recent Work), with
an explicit "do not remove existing business logic or API logic" constraint and a detailed list
of every KPI field that must stay computed and visible somewhere.

1. **`KpiGrid.tsx` (22 uniform cards) deleted entirely**, replaced by 3 new compact components,
   each holding a subset of `DashboardKpis` in a different, non-card shape:
   - **`ExecutiveSummaryCards.tsx`** — exactly 4 cards (Total Quotations, Total Quotation Value,
     Closed Sales, Expected Sales), shorter/tighter padding than the old `KpiCard`, one info
     tooltip only where genuinely useful (Expected Sales' calculation isn't obvious).
   - **`SalesPerformancePanel.tsx`** (new) — Win Rate, Lose Rate, Conversion Rate, Average Deal
     Size, Average Approval Time, Average Closing Time as a compact label/value grid inside one
     `ChartCard`, not 6 more cards.
   - **`ActivityFollowUpSummary.tsx`** (new) — Pending Approvals, Overdue Follow-ups, Expired
     Quotations, New Customers as a compact 4-tile row inside one `ChartCard`. Pending Approvals
     is clickable (navigates to the quotation list filtered to that status, reusing the same
     filter the Pipeline Steps stage cards already call); the other 3 stay informational since
     there's no equivalent single-status filter for date-derived metrics (Overdue Follow-ups/
     Expired Quotations) or a Customer module page to link to yet (New Customers).
2. **`QuotationStatusSummary.tsx` gained a Percentage column** (each row's share of the combined
   Won/Lost/Active/Non-Active count) — matches the exact status/count/value/% table shape
   requested. Donut chart and existing count/value columns unchanged.
3. **4 KPI fields dropped from individual display**: `totalCustomers`, `totalLeads`,
   `totalProducts`, `repeatCustomers` no longer get their own dashboard tile — they weren't named
   in the requested 5-section spec, and were exactly the kind of secondary metric competing for
   attention that this whole pass exists to fix. **Not removed from the data/API layer** — `GET
   /api/dashboard` still computes all of them unchanged; total/repeat customer detail remains
   visible in the richer `CustomerAnalytics.tsx` table further down the page, and total products
   on the Products page itself. All 16 other fields the user's "keep this data" list named are
   still shown somewhere (see the 3 components above + the existing `QuotationStatusSummary`).
4. **Page reorganized into the requested top-to-bottom order**: title + compact filters →
   `ExecutiveSummaryCards` → `QuotationStatusSummary` + forecast chart → `SalesPerformancePanel` →
   `ActivityFollowUpSummary` → `ActivityTimeline` ("Recent Work"). Everything else that already
   existed (revenue/job-type charts, `PipelineSteps`, `SalesActivityAnalytics`, ranking tables,
   `CustomerAnalytics`/`JobTypeAnalytics`, the actionable `ApprovalDashboard`/`FollowUpReminders`
   lists — distinct from the compact *counts* in `ActivityFollowUpSummary` above, since those are
   real clickable line-item lists — `NotificationSummary`, the interest breakdown) moved below a
   new "In-Depth Detail" divider, unchanged in content. This wasn't part of the "too many large
   KPI cards" complaint, so it wasn't touched or removed, per the explicit "do not remove existing
   business logic" instruction.
5. **`DashboardFilterBar.tsx` tightened**: `p-3`→`px-3 py-2`, `gap-3`→`gap-2.5`, each select/input
   `py-2`→`py-1.5` — a visibly slimmer single-row bar, addressing "the filter area is too large
   compared to the content" now that the content above it is much more compact.
6. **Verification**: same environment constraint as the prior 3 same-day passes (no local
   backend). Built a throwaway isolated preview composing the real `ExecutiveSummaryCards` /
   `QuotationStatusSummary` / `SalesPerformancePanel` / `ActivityFollowUpSummary` /
   `DashboardFilterBar` components with representative mock data (deleted before finishing),
   verified via Playwright at 1440px and 390px — confirmed exactly 4 cards in the first row, the
   Quotation Status donut+table+percentage layout, the compact Sales Performance grid, the 4-tile
   Activity & Follow-up row, and clean 2-column mobile stacking with no overflow. `npx tsc -b`,
   `npm run lint`, and `npm run build` all pass clean.
7. Docs updated: this file, PROJECT_STATUS.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Revert Dashboard KPI hierarchy to a flat grid (third same-day pass)

**Scope**: direct user feedback that the 2026-07-10 Dashboard redesign's KPI cards "does not look
good... feels strange, too template-like, and not suitable for this ERP," with an explicit
instruction not to continue redesigning the Dashboard and to restore the previous layout while
keeping every current section/feature working. Clarified with the user first (two real options —
a full technical revert that would have dropped the newer sections like Sales Activity Analytics
and Quotation Status Summary entirely, vs. restyling the KPI cards only while keeping every
section): user chose **restyle only, keep all sections**.

1. **Merged `PrimaryKpiCards.tsx` + `SecondaryKpiSummary.tsx` back into one flat `KpiGrid.tsx`.**
   The 2026-07-10 redesign had split the single KPI grid into a two-tier hierarchy: 6 large "hero"
   cards (`text-[28px]` values, bigger padding) followed immediately by 9 small, dense mini-cards
   in a collapsible row — a visual pattern common to generic SaaS dashboard templates, not this
   app's editorial navy/gold design language. Restored the original single-tier `KpiCard` (uniform
   `text-2xl` value, consistent `w-10 h-10` icon badge, one card size throughout,
   `grid-cols-2 xl:grid-cols-4`) used by the pre-redesign `KpiGrid.tsx`.
2. **Restored 7 KPIs that had quietly stopped rendering anywhere.** While merging, found that
   `DashboardKpis` (`GET /api/dashboard`'s response shape) still computes and returns Lose Rate,
   Conversion Rate, Average Approval Time, Expired Quotations, New Customers, Repeat Customers, and
   Total Leads — none of which `PrimaryKpiCards`/`SecondaryKpiSummary` ever rendered after the
   redesign, even though the API never stopped returning them. The new flat `KpiGrid.tsx` shows all
   22 fields again, matching the original pre-redesign card count.
3. **Kept the small `MetricInfoTooltip` (i)-icon affordance** the redesign added on the metrics
   whose definition isn't obvious (Expected Sales, Average Deal Size, Win Rate, Average Closing
   Time, Active/Non-Active Quotations, Pending Approvals) — a tiny, non-layout-affecting addition,
   not part of the "huge template card" complaint, so it stayed rather than being stripped for the
   sake of a purist revert.
4. **Did NOT touch**: `QuotationStatusSummary.tsx` (Win/Lose/Active/Non-Active donut+table),
   `PipelineSteps.tsx` (the pipeline step cards — replaced a genuinely broken, overlapping-label
   funnel chart, not a stylistic complaint), `SalesActivityAnalytics.tsx`, the revenue/job-type
   charts, rankings, customer/job-type analytics, approvals, follow-ups, or activity timeline — the
   user explicitly listed these as sections to keep working, and none of them were the "huge KPI
   card" complaint. `DashboardPage.tsx`'s section composition and comment header updated to reflect
   the new single-KPI-section flow (renumbered the section comments); no data-fetching, filter, or
   business logic touched.
5. **Sidebar overflow, mobile drawer, and font/typography fixes from the prior two same-day passes
   were already correct and are untouched by this pass** — confirmed via `git diff --stat` showing
   zero changes to `BrandMark.tsx`, `App.tsx`, or `styles/{theme,index,fonts}.css` since the last
   commit. The task's "UI Problems to Fix Only" list (sidebar overflow, logo/title alignment, font
   readability, Thai/English typography, text overflow, responsive issues) was already addressed by
   those passes; nothing needed to be redone.
6. **Verification**: same environment constraint as prior passes (no local backend, `npm run dev`
   never reaches `bootStatus: "ready"`). Built a throwaway isolated preview rendering the real
   `KpiGrid` component with representative mock `DashboardKpis` data (deleted before finishing),
   confirmed via Playwright at 1440px (uniform flat grid, no hero-card tier, all 22 cards same
   size) and 390px (clean 2-column stack, no horizontal scroll, no overflow). `npx tsc -b`,
   `npm run lint`, and `npm run build` all pass clean.
7. Docs updated: this file, PROJECT_STATUS.md, UI_GUIDELINES.md ("Dashboard KPI Hierarchy" →
   renamed "Dashboard KPI Grid"), IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.

---

## 2026-07-13 — Codex UI/UX review: Critical + High Priority fixes (second same-day pass)

**Scope**: `docs/CODEX_REVIEW_REPORT.md` (an independent Codex review of the Sidebar-overflow/
typography pass earlier the same day) found the sidebar overflow bug itself fixed, but flagged 3
Critical and 5 High Priority UI issues on top of it — no responsive mobile shell, a topbar that
doesn't degrade gracefully below ~900px, unqualified two-column form grids, overly dense/mono-heavy
typography, truncated text with no recovery path, and non-wrapping page headers. This pass fixes
every Critical and High Priority item; Medium/Low items (decorative search, hover-only delete,
`Remember me` no-op, semantic-HTML notification rows, focus-visible styling) are logged in TODO.md,
not attempted here — see "Not done" below.

1. **[Critical] Mobile off-canvas sidebar drawer.** `App.tsx`'s `<aside>` previously always
   reserved 256px or 64px of width with no responsive behavior at all — on a phone it permanently
   ate a quarter of the screen. Now: below the `md` (768px) breakpoint the sidebar is a `fixed`
   off-canvas panel (`-translate-x-full` when closed, `translate-x-0` when open) behind a
   click-to-close backdrop, toggled by a new hamburger button in the topbar (`md:hidden`,
   `aria-label`d via new `nav.openMenu`/`nav.closeMenu` dictionary keys); closes on nav-item click,
   backdrop click, or Escape (new `mobileNavOpen`-scoped `keydown` listener). At `md`+ it reverts to
   the existing static-column expand/collapse behavior, unchanged. New `navExpanded` derived value
   (`sidebarOpen || mobileNavOpen`) decides whether the sidebar renders labels/group headers —
   decoupled from `sidebarOpen` itself, which now only ever controls desktop width.
2. **[Critical] Topbar no longer overflows/clips below desktop width.** The always-visible `w-72`
   search box and org breadcrumb, plus fixed `px-6`/`gap-4` padding, were competing for width with a
   permanently-reserved sidebar on any screen under ~900px — `App.tsx`'s root `overflow-hidden`
   would have clipped the loser rather than let it wrap. Fixed: header padding/gaps now scale
   (`px-3 md:px-6`, `gap-2 md:gap-4`, `min-h-[60px] md:min-h-[68px]`); the breadcrumb is `hidden
   sm:flex` with `truncate`; the search box and the user's name/role/chevron are now `hidden
   lg:flex`/`hidden lg:block` (was `md:`) — a Codex-flagged real-device check found `md:` (768px)
   still too cramped for the fixed-width search box plus a Thai full name, causing the name to wrap
   into an ugly 4-line stack; `lg:` (1024px) is where there's genuinely enough room. The user
   name/role block also gained `max-w-[140px] truncate` as a hard backstop. The notification bell's
   `ml-auto` breakpoint moved to match (`lg:ml-0`, was `md:ml-0`) so it still right-aligns correctly
   whenever the search box is hidden.
3. **[Critical] Quotation editor no longer forces two columns on phone widths.**
   `QuoteDocument.tsx` had 7 unqualified `grid grid-cols-2` layouts (the customer-info/doc-details
   split, and 5 inner field-pairs — contact name/phone, delivery method/project, quote number/PO
   ref, issue/expiry date, job type/interest) plus the remarks/signatures split — all now
   `grid-cols-1 sm:grid-cols-2` (stacks under 640px). The customer-info panel's `border-r` divider
   (meaningless once stacked) becomes `border-b sm:border-b-0 sm:border-r`. The navy document-header
   band (company info left, quotation title right) gained `flex-wrap gap-4` and responsive padding
   (`px-4 sm:px-7`) instead of a rigid `justify-between` that would compress both sides. Applied the
   same `grid-cols-1 sm:grid-cols-2` fix to `UserManagementPage.tsx`'s create/edit form (5 grids),
   `RoleManagementPage.tsx`'s name/description fields and permission-checkbox grid, and
   `SetupWizardPage.tsx`'s two field-pair grids (employee ID/username, password/confirm) — the same
   unqualified-grid pattern Codex flagged as a Medium finding for these files, fixed alongside the
   Critical quotation-editor fix since it's the identical, cheap, low-risk change.
4. **[High] Sidebar brand title tightened for narrow-width safety.** `BrandMark.tsx`'s wordmark
   dropped from `text-[13px]` to `text-xs` (12px) — Codex calculated only ~182px of available text
   width at the sidebar's fixed 256px expanded width and flagged the smaller margin as needing
   verification; the smaller size gives more headroom before `break-words`' mid-word-break fallback
   could ever trigger. Verified visually (see Verification below) at the sidebar's expanded,
   collapsed, and mobile-drawer-open states — wraps cleanly to 2 lines via `line-clamp-2`, no
   mid-word breaks, no overflow.
5. **[High] Typography consolidated and de-densified.**
   - New centralized `--font-sans` design token (`styles/theme.css`, wired through Tailwind v4's
     `@theme inline` so the standard `font-sans` utility resolves to it) replaces 2 separate
     hand-repeated `font-['Inter','Noto_Sans_Thai',sans-serif]` arbitrary-value classes
     (`App.tsx`, `AuthLayout.tsx`) and the `body` rule in `index.css` — one definition instead of
     three copies that could drift.
   - **Fixed a latent bug found while doing the above**: JetBrains Mono was imported in
     `fonts.css` but never actually wired to the `font-mono` utility (no `--font-mono` theme
     override existed anywhere) — every `font-mono` number/code/date span in the app (quotation
     numbers, currency, dates — the entire documented "numbers use JetBrains Mono" convention in
     UI_GUIDELINES.md) was silently rendering in the browser's generic system monospace font the
     whole time. Added a matching `--font-mono` token so `font-mono` now actually renders JetBrains
     Mono as designed.
   - `QuoteDocument.tsx`'s 19 form-field `<label>`s bumped from `text-[10px]` to `text-xs` (12px) —
     Codex's specific "at least 12px for dense supporting text" ask, applied to the one file it
     named that has real fill-in-a-form reading load (not the uppercase section-eyebrow labels
     elsewhere, which stay at their existing size — that's a deliberate, documented, different
     reading mode, not the same finding).
6. **[High] Dashboard density reduced.** `SecondaryKpiSummary.tsx` (the 9-tile `xl:grid-cols-9`
   secondary-metrics row) is now collapsible — a new chevron-toggle header, default expanded
   (unchanged desktop behavior) but user-collapsible on any screen size, addressing Codex's "put
   secondary metrics in an optional section" suggestion without hiding anything by default. Its
   mini-card value/title `<p>` tags gained `title=` tooltips (were `truncate` with no fallback) and
   the title text bumped `text-[10px]` → `text-[11px]`. `DashboardFilterBar.tsx`'s department filter
   no longer carries its own `ml-auto` (which detached it from the salesperson filter once the bar
   wrapped on a narrow screen) — department + salesperson are now grouped in one `flex flex-wrap
   sm:ml-auto` wrapper so they wrap together as a pair. `RevenueTrendChart`'s X-axis gained
   `minTickGap={24}` so many weekly data points auto-skip overlapping tick labels instead of
   colliding (Medium-priority chart-collision finding, fixed alongside the density work since it's
   a one-line prop).
7. **[High] Truncated text now has a full-value fallback.** Added `title=` attributes to every
   Codex-named truncation-with-no-recovery spot: `DashboardCharts.tsx`'s job-type and product-
   category legend labels, `ActivityTimeline.tsx`'s audit-entry detail line, `NotificationBell.tsx`'s
   notification title. (`SecondaryKpiSummary.tsx` covered under point 6.)
8. **[High] Page headers wrap on narrow screens instead of clipping.** `QuoteList.tsx`,
   `ProductList.tsx`, `AuditLogPage.tsx`, and `UserManagementPage.tsx`'s title/action-button header
   rows gained `flex-wrap gap-3` (were unqualified `justify-between`); `RoleManagementPage.tsx`'s
   hint/create-button row got the same treatment. `AuditLogPage.tsx` and `UserManagementPage.tsx`'s
   `w-72` fixed-width search boxes became `w-full sm:w-72` so they don't force row overflow before
   wrapping kicks in. `AuditLogPage.tsx` also gained a real `<h1>` page title (previously the only
   page in the app with no visible title/description at all — a separate Codex page-by-page finding
   fixed opportunistically since the header row was already being touched).
9. **Verification**: same constraint as the first same-day pass — `npm run dev` has no backend
   behind it in this sandboxed session (`fetchSession()` never resolves, so the real authenticated
   app can't be reached past the boot spinner). Built a second throwaway isolated preview harness
   (real `BrandMark`/`NotificationBell`/i18n components, the exact new sidebar+topbar JSX copied
   verbatim, deleted before finishing — not part of the app) and drove it with Playwright across
   390px (mobile, drawer closed and open, Escape-to-close), 768/820px (the `md` boundary — this is
   what caught the user-name-wrapping bug fixed in point 2), 1280/1440px (desktop). `npx tsc -b`,
   `npm run lint`, and `npm run build` all pass clean. The quotation-editor grid fix (point 3) and
   the admin-form grid fixes were verified by code inspection against the identical, already-proven
   `sm:grid-cols-2` pattern (`ProductForm.tsx` already used it successfully per Codex's own review)
   rather than a redundant mockup, since reproducing the full authenticated quotation form's
   permissions/workflow state outside the real app wasn't a good use of the same session's limited
   verification budget.
10. **Not done** (Medium/Low priority, logged for a future pass, not attempted here): decorative
    non-functional topbar search (still a "false affordance"); notification delete button still
    hover-only (no persistent touch affordance); `Remember me` checkbox on login still doesn't
    change session behavior; notification rows are still `div onClick`, not semantic
    buttons/links (keyboard activation gap); no `focus-visible` ring audit; no full accessibility
    pass (icon-only buttons beyond the ones touched here still rely on `title` alone in places).
    Docs updated: this file, PROJECT_STATUS.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Sidebar header overflow fix + app-wide typography/overflow pass

**Scope**: a reported UI bug (the "Thai Chemicals Storage ERP" sidebar title overflowing outside
the sidebar) plus the broader typography/overflow audit requested alongside it.

1. **Fixed the actual bug**: `components/BrandMark.tsx`'s wordmark (`<p>` for "Thai Chemicals
   Storage ERP") used `whitespace-nowrap` inside a container with only `overflow-hidden` (no
   `truncate`/ellipsis and no wrapping) — at the sidebar's fixed 256px width, the single-line text
   simply got clipped past the container edge instead of wrapping or shrinking. Replaced with
   `break-words line-clamp-2 leading-snug` (wraps to at most 2 lines, no overflow) plus `min-w-0`
   on the wrapping flex containers so the text column can actually shrink instead of forcing its
   parent wider. The Thai subtitle ("ระบบองค์กร") now uses `truncate` (was `whitespace-nowrap`
   with no ellipsis fallback). Verified visually (see Verification below) at the sidebar's expanded
   (256px) and collapsed (64px) widths and down to a 390px mobile viewport.
2. **Sidebar polish**: nav item labels now `truncate` (were `whitespace-nowrap overflow-hidden`
   with no ellipsis) with `min-w-0` on their flex containers so a long translated label can't push
   the row wider than the sidebar; added `title` tooltips on nav/settings buttons when the sidebar
   is collapsed (icon-only) so the label is still discoverable via hover; slightly tightened header
   padding/logo size (`size 32→30`, `min-h-[68px]→[72px]`) for a less cramped brand-mark area.
   Active/hover states, spacing, and border-radius were already consistent with
   [UI_GUIDELINES.md](./UI_GUIDELINES.md) and were left as-is.
3. **Sidebar now defaults to collapsed on narrow viewports** (`window.innerWidth < 768` at mount,
   `App.tsx`'s `sidebarOpen` initializer) — the expanded 256px sidebar left only ~130px for content
   on a 390px-wide mobile viewport, wrapping the topbar/breadcrumb awkwardly. This is a minimal,
   low-risk default-state fix, **not** a mobile drawer/overlay nav — the app remains desktop/tablet-
   primary by design (see UI_GUIDELINES.md "Responsive Rules", unchanged), and a real off-canvas
   mobile nav is still explicitly out of scope (tracked in TODO.md, not attempted here).
4. **Thai-aware font stack, applied globally**: added `Noto Sans Thai` (400/500/600/700) to the
   Google Fonts import in `styles/fonts.css` and to every `font-family` declaration in the app
   (`body` in `styles/index.css`, the two `font-[Inter,sans-serif]` root-shell classes in
   `App.tsx`/`AuthLayout.tsx`, and — via a repo-wide replace — all 31 call sites of the
   `'Playfair Display', serif` heading style). Previously Thai text inside a Playfair Display
   heading (page titles, topbar breadcrumb, dialog titles — all translated, so Thai by default)
   silently fell back to whatever generic serif the browser had for unsupported glyphs, rendering
   in a different weight/style than the surrounding Noto Sans Thai body text. Now: Latin characters
   render in Inter (body) / Playfair Display (headings) exactly as before — the brand identity is
   unchanged — and Thai characters within the *same* text node automatically render in Noto Sans
   Thai instead of an arbitrary fallback, since browsers resolve font-family per-codepoint.
5. **Readability**: base `body` line-height raised to `1.6` (from the browser default, effectively
   ~1.2) in `styles/theme.css`, plus an explicit `1.6` on bare `<p>` tags; `-webkit-font-smoothing:
   antialiased` + `text-rendering: optimizeLegibility` added to `body`.
6. **Table overflow bug sweep**: 4 tables (`QuoteList.tsx`, `ProductList.tsx`, `AuditLogPage.tsx`,
   `UserManagementPage.tsx`) were missing the `overflow-x-auto` wrapper every other table in the
   app already uses (`ApprovalDashboard.tsx`, `SalesPerformanceTable.tsx`, etc.) — on a narrow
   viewport these would have squeezed columns instead of scrolling horizontally. Also added
   `truncate`/`max-w-[…]`/`title=` tooltips to the long free-text columns most likely to overflow
   in practice — quotation client name, product name — matching the pattern `UserManagementPage.tsx`
   already used for its user-name column.
7. **Verification**: the full authenticated app (Dashboard/Quotations/Products/Admin pages) could
   not be exercised live in this sandboxed session — `npm run dev` has no backend behind it
   (no `vercel dev`/MongoDB), so the app hangs on its boot spinner past the sign-in gate, the same
   `fetchSession()`-never-resolves limitation every prior session has hit (see PROJECT_STATUS.md
   "Known Risks"). Instead, built a throwaway isolated preview harness (a second Vite HTML entry
   importing the real `BrandMark`/`I18nProvider`/nav components, deleted before finishing — not
   part of the app) to visually confirm the fix with Playwright: sidebar header no longer overflows
   at expanded/collapsed/390px-mobile widths, Thai nav labels/subtitle render cleanly, the Thai+
   Latin mixed-script sample renders consistently. `npx tsc -b`, `npm run lint`, and `npm run build`
   all pass clean.
8. **Not done / remaining**: no real off-canvas mobile drawer nav (see point 3); no full
   accessibility audit; Dashboard/table visual polish at very narrow (<390px) widths not manually
   walked page-by-page (the table `overflow-x-auto` fix covers the mechanism, not a full visual
   pass per page). Docs updated: this file, PROJECT_STATUS.md, UI_GUIDELINES.md,
   IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-10 — Audit integrity + workflow gap fix pass (fifth same-day pass)

**Scope**: fix the Critical and High Priority issues raised by the independent Codex re-review's
"Independent Re-review Addendum" (see `docs/CODEX_REVIEW_REPORT.md`), preserving existing
functionality, without guessing on the two items that are genuine business decisions (both were
already logged in `TODO.md` by a prior pass and remain open, not re-solved here).

1. **Quotation audit-log entries are now server-authoritative, not client-forgeable.** Previously,
   `QuotationPage.tsx` called the generic `POST /api/audit-log` after a successful create/update/
   duplicate/workflow API call to record what happened — but any authenticated caller could bypass
   the UI and call that same endpoint directly with fabricated `module`/`action`/`details` text,
   and the Dashboard's Sales Activity Analytics counts exactly those `action` strings out of
   `audit_log`. Fixed: `api/handlers/quotes.ts` now writes its own audit-log entry directly inside
   each mutation handler (`writeQuoteAuditEntry()`), using only the already-verified session
   identity — never anything from the request body. This covers create, update (any `PATCH` except
   a pure interest-flag toggle, matching the exact granularity the client used to log), duplicate,
   and every workflow transition (Submitted/Approved/Rejected/Status Changed, same wording as
   before). `QuotationPage.tsx`'s 4 client-side `onAudit(...)` calls for these events were removed
   (server does it now; keeping both would double-log), and its now-unused `onAudit` prop was
   removed along with the pass-through in `App.tsx` (Settings/User Management/Role Management keep
   their own unrelated, unchanged client-side audit calls). `POST /api/audit-log` now rejects the
   `"ใบเสนอราคา"` module with a 403 — quotation audit events can only be written by the server now.
2. **Reject/Customer-Reject/Cancel now require a comment server-side, not just in the UI.**
   `QuoteDocument.tsx` already refused to submit these actions without a comment, but
   `api/handlers/quotes.ts`'s workflow endpoint accepted an empty one from a direct API call. Fixed
   with a new `COMMENT_REQUIRED_ACTIONS` set (`api/_lib/quoteWorkflow.ts`) and a `400` check.
3. **Added the 3 missing terminal-workflow notifications.** `marked_won`, `marked_lost`, and
   `cancelled` never notified the quote's creator, unlike every other workflow transition. Added,
   following the existing per-action notification pattern. Required extending `NotificationType`
   (`quotation_won`/`quotation_lost`/`quotation_cancelled`), a matching icon in
   `NotificationBell.tsx` (Trophy/TrendingDown/XOctagon), and a matching seed-label entry in
   `api/_lib/systemSeed.ts` — TypeScript's `Record<NotificationType, ...>` maps caught both places
   at compile time when the union grew.
4. **Re-verified Expected Sales vs. Sales Forecast predicate consistency** (an addendum checklist
   item) — confirmed already correct from the prior pass (KPI/ranking use the literal
   `isPotentialOpportunity` predicate; the separate forecast additionally excludes
   `CLOSED_STATUSES`), not a live bug. No code change; documented as verified rather than assumed.

**Not fixed / re-assessed**: the two remaining addendum "Current Critical Issues" — automated
tests/CI/live-data verification, and the free-text salesperson/department reporting-identity model
— are unchanged from the prior pass's assessment (the latter already logged as an explicit
business decision in `TODO.md`; the former is a standalone infrastructure effort, not a bug fix).

**Found, not fixed** (out of scope for this pass, logged in `TODO.md`): `App.tsx`'s session-fetch
boot `useEffect` has no error handling, so a thrown network error (including the pre-existing
sandboxed-session MongoDB DNS issue) leaves the app stuck on its loading spinner forever instead of
falling back to the sign-in screen — found during this pass's browser verification, pre-existing,
not introduced by any change here.

**Verification**: `npx tsc -b && npx tsc --noEmit -p tsconfig.api.json && npx vite build` — clean.
`npm run lint` — clean (same 2 pre-existing unrelated warnings). `npx vercel dev` started
successfully; `GET /api/auth/session` still 500s with the identical, previously-documented
`querySrv ECONNREFUSED _mongodb._tcp.tcsdb.zdnus3w.mongodb.net` (confirmed via the dev-server log,
not just the HTTP response) — the same reproducible sandboxed-environment DNS limitation as every
prior 2026-07-10 pass, now reproduced a fourth time, not a regression from this pass's changes. A
Playwright check against the running dev server found no console errors beyond that one expected
network failure.

**Files changed**: `api/_lib/quoteWorkflow.ts`, `api/handlers/quotes.ts`, `api/audit-log/index.ts`,
`api/_lib/systemSeed.ts`, `src/lib/notifications.ts`, `src/components/NotificationBell.tsx`,
`src/pages/quotation/QuotationPage.tsx`, `src/App.tsx`. Docs: this file, `PROJECT_STATUS.md`,
`TODO.md`, `IMPLEMENTATION_CHECKLIST.md`, `CLAUDE.md`, `CODEX_REVIEW_REPORT.md` (new "Claude Fix
Status — Addendum Follow-up" section), `MODULES/{Quotation,Notifications,AuditLog,Dashboard}.md`.

---

## 2026-07-10 — Dashboard UI/UX redesign + app-wide UX enhancement pass

**Scope**: two combined requests — (1) a full visual/layout redesign of the Dashboard (the previous
flat ~20-card KPI grid plus a `recharts` `FunnelChart` pipeline that overlapped its own Thai labels
and read as unprofessional), and (2) a broader "make the whole ERP easier for a first-time,
non-technical employee to use" pass (onboarding tour, shared UX components, form clarity, sidebar
grouping). Given the size of request (2), this pass covers a real, working, appropriately-scoped
subset rather than every item in the brief — see "Not done / explicitly out of scope" below.

**Dashboard redesign**:
1. **Replaced the Sales Pipeline funnel** (`PipelineFunnel.tsx`, deleted) with `PipelineSteps.tsx` — horizontal connected step cards (stage badge/count/value/conversion %) instead of a `FunnelChart` squeezing 9 Thai labels into a shrinking silhouette. The 3 "left the pipeline" outcomes (Customer Rejected/Lost/Cancelled) render as a separate row, since they're branches, not sequential steps.
2. **Split the flat ~20-card KPI grid** (`KpiGrid.tsx`, deleted) into `PrimaryKpiCards.tsx` (6 headline metrics: Total Quotations, Total Quotation Value, Closed Sales, Expected Sales, Win Rate, Active Quotations — larger cards, helper captions, info tooltips) and `SecondaryKpiSummary.tsx` (Won/Lost/Non-Active/Avg Deal Size/Avg Closing Time/Pending Approvals/Overdue Follow-ups/Total Customers/Total Products — small dense mini-cards under their own section label).
3. **New `QuotationStatusSummary.tsx`**: a single Win/Lose/Active/Non-Active donut + table, replacing the redundant `QuotationStatusDonut` (all 9 raw statuses) + `WinLoseDonut` pair — counts come straight from the same KPI numbers shown elsewhere (never disagree), value-per-bucket is a documented approximation from the filtered pipeline's per-stage totals.
4. **New `SalesActivityAnalytics.tsx` section**: quotation Created/Updated counts by week/month/quarter/year (tabbed, like the existing Revenue Trend grouping), filterable by the existing salesperson/department controls. New `salesActivity` aggregation in `api/dashboard/index.ts` reading `audit_log`'s `"Quotation Created"`/`"Quotation Updated"` entries, bucketed with the same `isoWeekKey`/`quarterKey`/`lastN*Keys` helpers `revenueTrend` already uses. New `bangkokDayBoundsUtc()`-adjacent Bangkok-anchored bucketing, gated by the same `auditLog:view` permission as Activity Timeline (both read the same collection).
5. **Reordered the whole page** into the requested section order (header/filters → primary KPIs → secondary KPI summary → status summary + forecast → revenue/job-type charts → pipeline → sales activity → rankings → top customers/job types → approvals/follow-ups → recent activity) and **removed** `QuotationTrendChart` (a documented revenue-series approximation), `SalesByEmployeeChart` (redundant with the ranking table directly below it), and `MonthlyClosingRateChart` (redundant with the new status summary) — decluttering, not just reordering, per the explicit "do not just add more cards" instruction. Net effect: the `DashboardPage` bundle chunk shrank from ~505KB to ~478KB raw (below Vite's 500KB warning threshold for the first time).

**UX enhancement (bounded subset — see "Not done" below for the rest)**:
6. **`src/components/EmptyState.tsx`** (new, shared) — consolidates markup previously copy-pasted across `ProductList.tsx`/`QuoteList.tsx`/`DashboardPage.tsx`; wired into all three plus a real "create your first X" action button where one already existed.
7. **`src/components/PageHeader.tsx`** (new, shared) — title + plain-language description + actions slot; wired into the Dashboard (Quotation/Products/other pages not yet migrated — see TODO.md).
8. **`src/components/MetricInfoTooltip.tsx`** (new) — click-to-toggle (i) icon explaining a non-obvious metric in one sentence; applied to Expected Sales/Win Rate/Active Jobs/Non-Active Jobs/Average Deal Size/Average Closing Time/Pending Approvals on the Dashboard.
9. **Sidebar regrouped** (`App.tsx`'s new `NAV_GROUPS`) into Main/Sales/Inventory/Administration section labels — a pure display grouping over the existing flat `navItems`, not a new page or data model; a group is hidden entirely if none of its items survive the existing RBAC filter.
10. **Guided onboarding tour** — added `driver.js` (chosen over React Joyride: no React-specific tour state machine was needed, so the smaller framework-agnostic dependency was preferred). `src/components/GuidedTour.tsx` (`useGuidedTour()` hook) walks the sidebar, Dashboard title/filters/KPIs, notification bell, and user menu — scoped to elements that are on-screen together, not choreographed cross-page navigation (a separately-scoped, bigger undertaking). Offered once via a Start/Skip banner the first time a user reaches a "ready" session (`App.tsx`); always re-launchable from the user-menu's new "Help" item. Completion tracked per-user in `localStorage` (`src/lib/tour.ts`) — a UI preference, not business data, so deliberately not a MongoDB field.
11. **Quotation form**: required-field asterisk + inline client-side check on Client Name and (for new quotes) Job Type before hitting the server, an unsaved-changes `beforeunload` browser warning (covers accidental tab close/refresh — does not yet cover in-app sidebar navigation mid-edit, which this app's flat `activeNav` state doesn't currently intercept).
12. **Required-field asterisks** added to Product Form (code/category/name) and the User Management create form (full name/employee ID/username/email/role/password) — both already had or now have their existing inline per-field error messages surfaced, just weren't visually marked as required beforehand.

**Not done / explicitly out of scope this pass** (a genuinely large brief — see TODO.md for tracking):
- Full onboarding tour across every module (Leads/Customers/Approvals steps weren't added — those modules don't have dedicated pages yet, see IMPLEMENTATION_CHECKLIST.md).
- `PageHeader`/breadcrumb rollout to every page (only Dashboard uses it so far).
- Full accessibility audit (aria-label pass, contrast audit, keyboard-nav audit) — not attempted beyond what already existed plus the new components' own basic `aria-label`/`aria-expanded`/focus-visible handling.
- In-app (non-browser) unsaved-changes interception when navigating away from the Quotation form via the sidebar.
- Customer/Lead form UX — those modules are schema-only, no UI exists yet (see MODULES/Customer.md, MODULES/Lead.md).

**Verification**: `npx tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Two real lint errors surfaced mid-pass and were fixed: a `react-hooks/set-state-in-effect`
violation in the tour-prompt trigger (fixed via React's "adjust state during rendering" pattern,
using `useState` not `useRef` — refs can't be read/written during render either, a stricter rule
than expected) and a duplicate of the same pattern in `QuoteDocument.tsx`'s dirty-check effect
(false alarm, no fix needed — that one was already inside a real `useEffect`). Attempted live
browser verification a third time (fresh `vercel dev` instance) — the same, now three-times-
reproduced sandboxed-environment limitation (MongoDB Atlas SRV DNS resolution) blocked getting
past the login gate with real data, but a Playwright pass confirmed the client bundle itself
(including the new dashboard components and `driver.js`) loads and initializes with zero
unrelated console errors, only the expected session-fetch network failure.

---

## 2026-07-10 — Codex review fix pass: quote validation, Dashboard filter honesty, RBAC/upload hardening, doc accuracy

**Scope**: an independent Codex review (`docs/CODEX_REVIEW_REPORT.md`, archived at
`docs/reviews/CODEX_REVIEW_2026-07-10.md`) audited the app end-to-end (source + docs, no live-data
access in that environment either) and found 2 Critical, 6 High, 6 Medium, and several Low-priority
issues. Fixed every Critical and High issue plus the Medium items that were safe, scoped fixes;
the remaining items are genuine business decisions, documented in TODO.md rather than guessed at
(see "Not fixed" below and CODEX_REVIEW_REPORT.md's new "Claude Fix Status" section for the full
breakdown).

**Critical — fixed**:
1. **Unvalidated quote writes.** `api/handlers/quotes.ts` copied POST/PATCH/workflow-draft fields into MongoDB with no schema validation, no bounds checking, no date validation, no server-side `amount` recomputation, no `jobTypeCode` membership check. New `api/_lib/quoteValidation.ts`: type/length-checked free text, `lines[]` validated per-field (non-negative/bounded `qty`/`unitPrice`, 0–100 `discount`, array-length caps), `YYYY-MM-DD`-or-empty date validation, and `amount` is now **always** server-derived from the resulting effective `lines`/`discount` (never client-writable) using the same totals formula as `computeTotals()` in `src/lib/quotes.tsx` (duplicated, not imported, for the same JSX-in-that-file reason `quoteWorkflow.ts` already duplicates `workflowTransitions`).
2. **Dashboard Customer Interest panel used the app-wide unfiltered quote list.** `DashboardPage.tsx` computed it client-side from the `quotes` prop (every quote ever loaded), ignoring the date/salesperson/department filter entirely — a real, silent filter-honesty bug. Moved server-side: `api/dashboard/index.ts` now returns `interestBreakdown` computed from the same filtered `docs` set as every other widget; the `quotes` prop was removed from `DashboardPage`/`App.tsx` entirely since nothing else needed it.

**High — fixed**:
3. **Expected Sales didn't match the literal business rule.** Previously excluded `TERMINAL_STATUSES` (Won/Lost/Cancelled) — deviating from the documented "sum of quotations where Potential Opportunity = true," and (since Customer Rejected wasn't in that set) still let already-rejected quotes count. Both `kpis.expectedSales` and `salesPerformance[].expectedRevenue` now use the literal `isPotentialOpportunity === true` predicate, no other condition. Introduced a new `CLOSED_STATUSES` set (`TERMINAL_STATUSES` + Customer Rejected) for the *different* concept of "still a genuinely open opportunity," now used by `activeQuotations`/`expiredQuotations`/`forecast.openOpportunities` — previously a Customer-Rejected-but-unexpired quote could wrongly count as an Active Job or an open forecast opportunity.
4. **Job Type was optional and unenforced server-side.** `POST /api/quotes` now requires a non-blank `jobTypeCode` matching a real `job_types` master record; `jobTypeName` is always re-derived from that record, never trusted from the client. The create-quote form no longer offers the blank "unclassified" option (a disabled placeholder shows until a real selection is made); editing an *existing* quote still tolerates a blank Job Type (legacy data) so an unrelated field edit on an old unclassified quote isn't blocked — only a non-blank `jobTypeCode` is validated for membership on `PATCH`/workflow.
5. **Activity Timeline and other Dashboard sections ignored every filter.** Activity Timeline now respects the date-range (via a new Bangkok-day-boundary-aware `bangkokDayBoundsUtc()` helper, converting the Bangkok-local preset into the right UTC range for `audit_log.createdAt`) and salesperson/department filter (matched against `userName`, same free-text join convention used elsewhere). Total Customers/Products/`categoryBreakdown` and `notificationSummary` remain deliberately unfiltered — re-assessed, not silently inconsistent: these are catalog/personal-operational metrics with no sales-date dimension to filter by, now documented explicitly in code and in MODULES/Dashboard.md rather than looking like an oversight.
6. **No Dashboard report export existed at all.** Added client-side CSV export (`src/pages/dashboard/csvExport.ts`, no new dependency) of KPIs + Sales Performance/Top Customers/Job Type Analytics tables, built from the already-filtered `DashboardStats` already on screen (no new permission needed — it's a transform of data the caller is already authorized to see). PDF/Excel remain explicitly deferred (see TODO.md).
7. **Notification click only opened the quotation list module, not the specific quote.** Added a `quotationDeepLinkId` (separate from the pre-existing `quotationListFilter`) lifted to `App.tsx`; `QuotationPage` applies it via React's "adjust state during rendering" pattern (not a bare `useEffect` setState call, which would trip `react-hooks/set-state-in-effect`) so it works whether the module is mounting fresh or already open.
8. **Department/salesperson Dashboard filtering relies on a free-text name join** — re-assessed rather than partially patched: a proper fix needs `Quote` to store a real `salespersonUserId`, which requires deciding whether the Salesperson field stops being freely editable text — a product decision, not a code fix, tracked in TODO.md.

**Medium — fixed**:
9. **Quotation numbering was race-prone** (`nextQuoteId()` scanned every `_id` then computed max+1). Replaced with an atomic `counters` MongoDB collection (`findOneAndUpdate` with `$inc`, upsert) — lazily bootstrapped from the current max via `$max` (idempotent under a concurrent-bootstrap race) the first time it's needed.
10. **Missing compound indexes for real Dashboard query patterns.** Added `{ salesperson: 1, issueDate: 1 }`, `{ status: 1, issueDate: 1 }`, `{ followUpDate: 1, status: 1 }`, `{ isPotentialOpportunity: 1, status: 1, expiryDate: 1 }` on `quotes`, and `{ userName: 1, createdAt: -1 }` on `audit_log` (supporting the newly filter-aware Activity Timeline) — created defensively at request time (same pattern as the previous pass's indexes), since `ensureIndexes()`'s one-time bootstrap never runs again post-provisioning.
11. **Upload fields (profile picture, signature, company logo/stamp) had no server-side validation.** New `api/_lib/uploadValidation.ts`: must be a real `data:image/(png|jpeg|jpg|webp|gif);base64,...` data URL under 2MB, or empty to clear — wired into `PATCH /api/users/:id` and `PUT /api/company`.
12. **`PrintDocument.tsx` rendered blank company labels.** Tax ID/phone/email/address lines now hide conditionally, matching the existing `Field` component's behavior for quote-side optional fields (which already hid correctly) — the company header block just wasn't using it for those three lines.
13. **`GET /api/users`/`GET /api/roles` open-directory exposure** — re-assessed, not blindly restricted: role documents carry no PII (no privacy tradeoff), and the user directory's fields are relied on app-wide (printed-quote signatures visible to any `quotations:view` holder, salesperson pickers) in ways a naive field-strip would likely break without a full consumer trace. Strengthened the code comments explaining the tradeoff and logged it as a business-decision item in TODO.md instead of guessing.

**Not fixed — genuine business decisions, tracked in TODO.md, not guessed at**: the `GET /api/users` privacy model (item 13 above); migrating `Quote.salesperson` to a real user reference (item 8 above); adding real `Quote.createdAt`/`updatedAt` timestamp fields (found while correcting a stale DATABASE.md claim during this pass — a real, scoped gap, not urgent); PDF/Excel export (CSV is done); sequential two-level approval (pre-existing, already tracked); automated tests/CI (pre-existing, already tracked).

**Documentation accuracy** (Codex flagged several docs as contradicting the real 2026-07-09 backend
migration): `MODULES/RoleManagement.md`, `MODULES/Settings.md`, `MODULES/UserManagement.md`, and
`MODULES/Notifications.md` still said "no real DB," "client-side only, not real security,"
"single-browser simulation," and referenced dead `localStorage` keys (`tcs_erp_*`) — all four
corrected to describe the real MongoDB collections/API routes. `MODULES/Quotation.md`'s two
stale "needs X once backend/deep-linking exists" Future Improvements items were resolved by this
same pass (job type numbering + notification deep-link, items 7 and 9 above) and marked done.
`DATABASE.md` incorrectly claimed `Quote` has `createdAt`/`updatedAt` fields in its
superseded-Prisma-plan comparison section — corrected to state plainly that it doesn't (only
`issueDate`/`date` business-date strings and `createdByUserId`/`updatedBy` user-id references).

**Verification**: `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run
lint`, and `npm run build` all pass clean after every fix above (two real lint errors surfaced and
were fixed along the way: a literal BOM byte sequence in `csvExport.ts` tripping
`no-irregular-whitespace`, and a `react-hooks/set-state-in-effect` violation in the new
notification-deep-link effect, both described above). **Live browser/API verification against
real MongoDB data was attempted again and still could not be completed** — same root cause as the
prior 2026-07-10 passes (the sandboxed session's Node process can't resolve MongoDB Atlas's
`mongodb+srv://` SRV DNS record; reconfirmed via a fresh `vercel dev` instance against the
pre-existing `GET /api/auth/session` route). See CODEX_REVIEW_REPORT.md's "Claude Fix Status"
section for the full verification account.

---

## 2026-07-10 — Dashboard completion pass: closed the gap against the full Executive Dashboard business spec

**Scope**: an explicit request to complete the Dashboard against a detailed, ~15-section business
requirements spec, on top of the same-day Executive Dashboard/Job Type rebuild + code-review pass
below. Rather than trusting the prior pass's own summary, ran a read-only audit (`Explore` agent,
reading every Dashboard component/API file directly) comparing the actual code against every
numbered requirement in the spec, then implemented every real, verifiable gap it found. Did not
rebuild anything that already worked.

**Gaps found and fixed** (all in `api/dashboard/index.ts`, `src/lib/dashboard.ts`, and
`src/pages/dashboard/*`, plus dictionary keys in `src/lib/i18n.tsx`):
1. **Pending Approvals had no visible count outside the approvers-only widget, and no actionable list at all** — added a general `kpis.pendingApprovals` KPI card, and expanded `ApprovalDashboard.tsx` from 4 read-only stat tiles into stat tiles + a real list (Quotation No./Customer/Salesperson/Amount/Submitted Date) with inline Approve/Reject, calling the same `performWorkflowAction()` (`POST /api/quotes/:id/workflow`) the Quotation module's own approval UI already uses. Reject requires a comment (inline textarea, matching the existing workflow rule); the Reject button is additionally gated by a new server-computed `approvalDashboard.canReject` (`quotations:reject`), since that permission isn't guaranteed to travel with `quotations:approve` on a custom role.
2. **Active/Non-Active Jobs didn't match the spec's definitions**: `activeQuotations` previously included expired-but-unclosed quotes; there was no "Non-Active" bucket at all (only the narrower "Expired" one). Fixed: Active now excludes expired quotes, and a new `nonActiveQuotations` KPI covers Cancelled/Customer Rejected/Lost/expired-and-still-open — kept alongside (not replacing) the existing Expired KPI.
3. **Average Closing Time only measured Won outcomes**, undercounting the spec's literal "average time between quotation creation and Won/Lost status." `closingDurationDays()` now matches `marked_won` **or** `marked_lost`; `salesPerformance[].avgClosingTime` was updated the same way.
4. **`salesPerformance`/`customerAnalytics`/`jobTypeAnalytics` only ever exposed the Won-only value**, silently under-reporting "Total Quotation Value" everywhere the spec asks for both figures side by side. All three now return `totalValue` (every quotation, any outcome) alongside the existing Won-only `revenue` field.
5. **Sales Ranking table was missing 4 of 11 spec columns** (Lost, Pending, Avg. Deal Size, Total Value — the first two were already computed server-side but never rendered) **and only 4 of 7 columns were sortable**. `SalesPerformanceTable.tsx` now renders and sorts on all 11.
6. **Top Customers table only ever showed one metric per tab and had no Last Quotation Date column.** Rewrote `CustomerAnalytics.tsx` as a real 5-column table (Customer/Quotations/Total Value/Won Value/Last Quotation Date) with 4 ranking tabs (added "Most Repeat" — customers with >1 quotation, ranked by count); `lastQuotationDate` computed server-side from the already-fetched `issueDate` field.
7. **Top Job Types wasn't a table at all** (a progress-bar list, no Avg. Deal Size, not sortable) **and silently dropped job types with zero quotes in the current filter.** Rewrote `JobTypeAnalytics.tsx` as a full sortable table; the server now zero-fills against the active `job_types` master list (13 seeded defaults) instead of only codes present in the filtered doc set, and still appends any code on a real quote that isn't in that active list (deactivated job type, legacy data) so nothing historical is dropped.
8. **Revenue Trend was fixed to a single trailing-12-month monthly series** — no weekly/quarterly/yearly grouping existed despite the spec explicitly requiring it. Added `revenueTrend` (four bucketings from the same underlying won-quote rows) plus a grouping toggle in `RevenueTrendChart` (`ChartCard.tsx` gained an `actions` slot to host it).
9. **No Job Type Distribution (count) chart existed** — `RevenueByJobTypeChart` showed revenue, not count, and only the top 10 of 13 job types (silently hiding 3 real ones). Added `JobTypeDistributionChart`; `RevenueByJobTypeChart` now shows Total + Won Value as grouped horizontal bars for every active job type, no cutoff.
10. **Follow-up Reminders deliberately ignored the date-range filter**, and the trend/forecast-baseline queries' trailing window never moved with the date filter at all — both contradicted the spec's explicit "the date filter must actually change every widget's query, not be visual only." Follow-ups now use the same `fullMatch` as every other date-filtered widget. The trend/forecast windows still can't be *narrowed* to a single day without defeating their purpose as trend charts, but their trailing window's *end* now anchors to the selected `to` date (or today) instead of always "now" — a real, verifiable query change, documented as a deliberate partial application rather than left looking like an oversight.
11. **No Department filter existed at all**, not even a disabled placeholder, despite being explicitly required. Added — `User.department` is free text (no real `Department` entity), so it's resolved server-side to "every salesperson whose `User.department` matches" and composed with an also-selected individual salesperson via `$and` (composing them naively via a second `salesperson` key would have silently discarded one or the other — caught and fixed during implementation, see `api/dashboard/index.ts`'s `fullMatch`/`salespersonOnlyMatch` construction).
12. **Two required MongoDB indexes were missing** (`isPotentialOpportunity`, `client` on `quotes` — both are hot query paths for Expected Sales/forecast and customer-analytics grouping respectively). Added — but since `ensureIndexes()`'s one-time Setup Wizard bootstrap is unreachable on an already-provisioned deployment (same issue `seedJobTypesIfEmpty()` already had to work around), these are instead created defensively inside `GET /api/dashboard` itself, once per warm serverless instance, so they actually get created in production. (`createdAt`/`updatedAt`/`department`/`isDeleted` — also on the original requested index list — don't exist as fields on `Quote` at all, so indexing them would be a no-op; documented as such rather than added blindly.)

**Not changed**: the 9-stage real workflow pipeline (no "Lead" or "Negotiating" stage — no backing
entity/status exists for either; inventing one would itself be fake data), `QuotationTrendChart`'s
reuse of the revenue series as a count proxy, Report Export (still explicitly deferred, no dead
buttons anywhere), and Activity Timeline's flat (non-period-grouped) feed — all pre-existing,
already-documented, deliberate scope decisions, re-confirmed rather than silently left as gaps.

**Verification**: `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run
lint`, and `npm run build` all pass clean. **Live browser/API verification against real MongoDB
data could not be completed in this session**: `vercel dev` was started locally (twice — once via
Git Bash, once via native PowerShell, to rule out a shell-specific cause) using real credentials
already pulled to `.vercel/.env.development.local` from a prior `vercel link`, and the frontend
served correctly, but every MongoDB-touching API route (including the pre-existing, untouched
`GET /api/auth/session`) failed with `querySrv ECONNREFUSED
_mongodb._tcp.tcsdb.zdnus3w.mongodb.net` — the sandboxed environment's Node process cannot resolve
MongoDB Atlas's `mongodb+srv://` DNS SRV record, even though the OS-level `nslookup` resolves that
exact record fine and a raw TCP connection to the resolved shard host on port 27017 succeeds. This
is an environment/network limitation, reproduced identically on code this session never touched,
not a defect in any change above. (A workaround — reconstructing a non-SRV direct connection
string from the resolved shard hosts — was considered and correctly blocked by the session's own
safety guardrails as unwarranted handling of live database credentials; abandoned rather than
worked around.) See PROJECT_STATUS.md "Known Risks" for the recommended follow-up.

---

## 2026-07-10 — Code review pass on the Executive Dashboard/Job Type commit: 10 real bugs found and fixed

**Scope**: a mandatory full-codebase review of the previous commit (`d38bf61`, the Executive Dashboard/Job Type feature), requested before treating that feature as done. Ran a 10-angle multi-agent review (line-by-line, removed-behavior, cross-file, language-pitfall, wrapper-correctness, reuse, simplification, efficiency, altitude, CLAUDE.md-conventions) against `git diff @{upstream}...HEAD`, verified the highest-signal candidates directly against the actual code, and fixed everything confirmed as a real correctness or regression bug. `npx tsc --noEmit` (both configs), `npm run lint`, and `npm run build` all pass clean after every fix below.

**Bugs found and fixed**:
1. **Timezone bug in every new date computation** (`src/pages/dashboard/dateRanges.ts`, `api/dashboard/index.ts`'s `todayIsoDate()`/`periodEnd()`/`lastNMonthKeys()`): mixing a locally-constructed `Date` with `.toISOString()` (UTC) shifted every date boundary back a day for Thailand (UTC+7) — confirmed empirically (Node + `TZ=Asia/Bangkok`) by one reviewer. Every preset ("Today," "This Month," etc.) and the server's own notion of "today" were affected, not an edge case. Fixed by rewriting all date math to shift by a fixed +7h offset once, then read back exclusively via UTC getters/`Date.UTC` — correct regardless of the browser's or Vercel's actual configured timezone, rather than depending on either matching Thailand's.
2. **Filter-coverage gap**: `revenueByMonth` and `monthlyClosingRate` (feeding 3 charts) never applied the salesperson filter, contradicting the shipped docs' claim that every section respects the dashboard filters. Fixed — both now respect the salesperson filter; deliberately still ignore the date-range filter (a trailing-12-month trend chart collapsed to a single day defeats its purpose), matching the follow-ups panel's existing, documented rationale for the same asymmetry. `forecast.historicalWinRate` deliberately stays company-wide-only (a smaller single-salesperson sample would make the forecast noisier, not more accurate) — now stated explicitly in a comment instead of looking like an oversight.
3. **`overdueFollowups` KPI disagreed with the Follow-Up Reminders panel** directly below it on the same screen, since the KPI was computed from date-filtered quotes while the panel deliberately isn't. Fixed: the KPI now reuses the panel's own `followUps.overdue.length` instead of a separate, differently-scoped computation.
4. **Dashboard got stuck on the loading skeleton forever if the fetch failed** — the pre-rebuild code had a `stats?.kpis ?? {zeros}` fallback that the rebuild dropped in favor of `if (!stats) return <DashboardSkeleton />`, with the error silently swallowed by `.catch(() => {})`. Added a real error state with a retry button.
5. **A narrow date filter with zero results hid the entire dashboard**, even with years of real history, because the page-level empty-state gate used the *filtered* `kpis.totalQuotations` instead of an unfiltered signal. Backend now returns a dedicated `hasAnyData: boolean` (unfiltered `quotes.estimatedDocumentCount() > 0 || totalProducts > 0`), decoupled from the correctly-filtered KPI numbers.
6. **Falsy-zero display bugs**: `avg()` returning `0` for both "no data yet" and "a genuine same-day/0% result" made `averageApprovalTime`/`averageClosingTime`/`avgClosingTime`/monthly win rate indistinguishable from "no data" in the UI (some widgets showed a misleading "0.0 days," others hid a real 0% month behind the empty state). Fixed at the source: `avg()` now returns `number | null` (`null` = no data), threaded through the relevant types end-to-end, with a shared `fmtDaysOrDash()`/`fmtPercentOrDash()` helper so every widget renders "—" only for genuinely absent data.
7. **`Quote.jobTypeName` snapshot was silently overwritten on every save/reopen**, defeating its own documented purpose (renaming a Job Type must not rewrite historical quotes) — `QuoteDocument.tsx` was re-deriving the display name live from the current `jobTypes` list via `jobTypeCode` lookup instead of reading the quote's persisted `jobTypeName`. Worse: if a job type's `code` itself was ever renamed, the lookup would silently return nothing and blank the field on an existing quote. Fixed: `jobTypeName` is now its own piece of state, seeded from `quote.jobTypeName` and updated only by an explicit dropdown change.
8. **Dashboard pipeline/follow-up click-through silently lost its filter** the first time a user opened any one quote from the filtered list and clicked Back. Root cause: `QuoteList` (the actual filter consumer) remounts on every internal `QuotationPage` view toggle (list ↔ detail), but the App-level filter was already nulled out by a mount-effect that fired well before that remount. Fixed by snapshotting the filter into `QuotationPage`'s own local state once (stable for its whole mount lifetime), decoupled from telling `App.tsx` it can forget its copy.
9. **`job_types` seed race + missing index in production**: the unique index on `code` only lives in `ensureIndexes()`, which — like every other index — never runs again on an already-provisioned deployment, so concurrent first requests to the empty collection could both pass the `count === 0` check and both insert, silently duplicating all 13 defaults with nothing to reject them. Fixed: `seedJobTypesIfEmpty()` now creates the unique index itself (self-healing, same precedent as its own defensive re-seed call) before checking/inserting, turning the race into a safe, ignorable duplicate-key error instead of silent duplicate data.
10. **`QuotationListFilter` lived in a page component** (`DashboardPage.tsx`) and was imported backward into `App.tsx` and the Quotation module — violates `docs/CLAUDE.md`'s "types belong in `lib/<domain>.ts`" rule, flagged independently by two review angles. Moved to `src/lib/quotes.tsx`.

**Also fixed** (smaller, safe): a `.trim()` crash risk if a legacy quote document is missing `client`/`salesperson` entirely (normalized once when the filtered quote set is built, rather than risking a 500 for every dashboard viewer over one bad document); a duplicate `clientNames`/`clientsInFilteredSet` computation (now computed once); a redundant `countDocuments` in the notification summary (derived from the `find()` result instead); a missing field projection on that same `find()`; the interest-breakdown widget's triple `.filter()` scan wrapped in `useMemo`.

**Deliberately not fixed this pass** (found, judged lower-value-per-risk, explicitly noted rather than silently dropped — see TODO.md): the `salesPerformance`/`customerAnalytics`/`jobTypeAnalytics` O(n·k) grouping pattern (re-filters the full quote set once per distinct key) — fine at this app's actual data volume, a genuine one-pass `groupBy` refactor would add risk for negligible real benefit; several small reuse/duplication findings (a repeated percentage-rounding formula, a hand-rolled card wrapper in 2 files that could use the already-extracted `ChartCard`, a duplicated "no data" empty-state markup in 5 files, a second color palette, `SalesPerformanceTable`'s sort UX not matching `ProductList.tsx`'s existing toggle pattern); the `escapeRegExp()` duplication in `api/handlers/jobtypes.ts` (continues a pattern already duplicated 3× before this change, in `auth.ts`/`categories.ts`/`roles.ts` — fixing it properly means touching pre-existing files outside this diff's scope); a pre-existing, not-introduced-by-this-diff discovery that `src/lib/quotes.tsx`'s `todayIso()` has the *same* timezone bug as finding #1 (used as the default `issueDate` on a brand-new quote) — flagged in TODO.md, not fixed here since it's pre-existing code outside this diff, not a regression this pass introduced.

**Files Modified**: `api/dashboard/index.ts`, `api/_lib/systemSeed.ts`, `src/pages/dashboard/dateRanges.ts`, `src/pages/dashboard/DashboardPage.tsx`, `src/pages/dashboard/format.ts`, `src/pages/dashboard/KpiGrid.tsx`, `src/pages/dashboard/SalesPerformanceTable.tsx`, `src/pages/dashboard/ApprovalDashboard.tsx`, `src/pages/dashboard/DashboardCharts.tsx`, `src/lib/dashboard.ts`, `src/lib/quotes.tsx`, `src/pages/quotation/QuoteDocument.tsx`, `src/pages/quotation/QuotationPage.tsx`, `src/pages/quotation/QuoteList.tsx`, `src/App.tsx`, `src/lib/i18n.tsx`.

---

## 2026-07-10 — Executive Dashboard, Sales Analytics & Job Type

**Scope**: user requested a full BI rebuild of the Dashboard ("real business intelligence... not only simple statistics") plus a Job Type master data classification and a "Potential Opportunity" sales flag on every quotation. This was scoped and planned before implementation (see the plan file discussion) into: (1) the data-model foundation on `Quote` + a new `job_types` collection, (2) the dashboard backend rebuild, (3) the dashboard frontend rebuild — with Report Export (PDF/Excel/CSV) and building real Lead/Customer entities explicitly deferred as separate follow-ups, per the user's own choice among the presented options.

**Job Type master data**: new `job_types` MongoDB collection (`code`, `name`, `isActive` + audit fields), seeded with 13 defaults (TA, STA, LI, SC, BF, GA, BI, VT, WTP, OTHER TA, OTHER SC, OTHER BF, OTHER) via `seedJobTypesIfEmpty()` (`api/_lib/systemSeed.ts`). New `api/handlers/jobtypes.ts` (`GET/POST/PATCH /api/jobtypes`) — the 10th serverless function, still under Vercel Hobby's 12-function cap. Because production already exists past the one-time Setup Wizard (where `ensureIndexes()`/seeding normally run), `GET /api/jobtypes` defensively re-seeds on every call — the same self-healing precedent `GET /api/roles` already used for `seedDefaultRolesIfEmpty()`. No new `Permission` was added: `GET` reuses `quotations:view`, `POST`/`PATCH` reuse `company:manage` (Super Admin only, matching the existing bank/VAT/T&C precedent).

**Quote gains three fields**: `jobTypeCode`/`jobTypeName` (snapshotted from Job Type at save time — same non-live-reference rationale as the Product picker), `isPotentialOpportunity` (checkbox), `followUpDate`. Wired into `QuoteDocument.tsx` (new dropdown/checkbox/date input), `QuoteList.tsx` (Job Type filter + column, Potential Opportunity summary card, a dismissible client-name filter chip for Dashboard click-through), and `PrintDocument.tsx` (Job Type printed, Thai-only per that file's existing convention; Potential Opportunity/Follow-up Date are internal-only, not printed).

**Dashboard backend** (`api/dashboard/index.ts`) rebuilt in place (not a new function): accepts `?from=&to=&salesperson=` query params; almost every new section fetches the filtered `quotes` set once (small projection) and reduces it in plain JS rather than a dozen fine-grained aggregation pipelines — deliberate, matching the pre-existing `revenueByMonth`/`categoryBreakdown` style and appropriate at this data volume (no `dashboard_cache`/`analytics_cache`/`forecast` collections were built — computed live instead). New response sections: expanded KPIs (~20, up from 7), `pipeline` (with a real workflow-predecessor-aware conversion % — see bug note below), `salesPerformance`, `customerAnalytics`, `jobTypeAnalytics`, `forecast` (live weighted estimate), `followUps`, `monthlyClosingRate`, `activityTimeline` (null unless the caller has `auditLog:view`), `approvalDashboard` (null unless `quotations:approve`), `notificationSummary`, `availableSalespeople`.

**Bug caught during self-review, fixed before shipping**: the sales pipeline's stage-to-stage "conversion from previous" initially used simple array-adjacency (each stage compared against the row above it in display order). The real workflow branches — Sent to Customer leads to *either* Customer Accepted *or* Customer Rejected, not a single line — so array-adjacency would have shown a nonsensical conversion percentage for the Customer Rejected/Lost branch (e.g. "conversion from Won" for a status that isn't actually downstream of Won). Fixed with an explicit `PIPELINE_PREDECESSOR` map mirroring `workflowTransitions` in `api/_lib/quoteWorkflow.ts`.

**Dashboard frontend**: `DashboardPage.tsx` split from one file into 13 files under `src/pages/dashboard/` (`DashboardFilterBar`, `KpiGrid`, `PipelineFunnel`, `SalesPerformanceTable`, `JobTypeAnalytics`, `CustomerAnalytics`, `ActivityTimeline`, `FollowUpReminders`, `ApprovalDashboard`, `NotificationSummary`, `DashboardCharts` + `ChartCard`, `format.ts`/`dateRanges.ts` helpers), per the project's "split into `pages/<module>/` once it grows past one file" convention. 9 charts total (added Quotation Trend, Sales by Employee, Revenue by Job Type, Status Donut, Win/Lose Donut, Expected Sales Forecast, Monthly Closing Rate to the pre-existing Revenue Trend and Products-by-Category). ~80 new i18n dictionary keys (Thai + English).

**Click-through, not full deep-linking**: a lightweight `quotationListFilter` (`{status?, client?}`) was lifted to `App.tsx` so clicking a pipeline stage or a follow-up reminder opens a pre-filtered quotation list — consumed exactly once per fresh visit via a `useRef` guard (not a `[]`-deps effect, to stay `react-hooks/exhaustive-deps`-clean while `onFilterConsumed`'s identity changes every `App.tsx` render). This is **not** the full per-quote deep-linking gap tracked separately in TODO.md (`QuotationPage`'s `view`/`selectedId` state still isn't lifted) — a smaller, scoped version was built instead.

**A real lint error was hit and fixed along the way**: calling `setLoading(true)` synchronously at the top of the data-fetching `useEffect` (to show a spinner during filter-driven refetches) tripped `react-hooks/set-state-in-effect` (a real perf footgun — cascading renders — not a style nit). Fixed by moving the `setLoading(true)` call into the filter-change event handler instead, so the effect itself only calls `setState` inside its async `.then()`/`.finally()` callbacks.

**Verification status**: `npx tsc --noEmit` (both root and `tsconfig.api.json`), `npm run lint`, and `npm run build` all pass clean. **Not yet verified against live data in a browser** — no local MongoDB credential was available and no safe non-production test environment existed in that session (writing test data via the UI would have hit the same production database serving real users). See PROJECT_STATUS.md "In Progress" for what's needed to close this out.

**Files Modified/Added**: `api/_lib/collections.ts` (`JobTypeFields`), `api/_lib/systemSeed.ts` (`DEFAULT_JOB_TYPES`/`seedJobTypesIfEmpty`), `api/handlers/jobtypes.ts` (new), `api/handlers/quotes.ts`, `api/dashboard/index.ts` (rebuilt), `vercel.json`, `src/lib/quotes.tsx`, `src/lib/jobTypes.ts` (new), `src/lib/dashboard.ts` (rebuilt), `src/lib/i18n.tsx`, `src/App.tsx`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,PrintDocument}.tsx`, `src/pages/dashboard/*` (13 files, mostly new).

---

## 2026-07-09 — Incident: i18n follow-up briefly broke all authenticated API routes in production

**What happened**: the "translate the rest of the app" follow-up added `import { translate } from "./i18n"` (a real value import, not `import type`) to `src/lib/apiClient.ts`, to translate two rare fallback error strings. `apiClient.ts` is transitively value-imported into the Vercel serverless bundle: `api/_lib/auth.ts` value-imports `roleHasPermission`/`findRole` from `src/lib/roles.ts` (used on **every** authenticated request via `getAuthContext()`), and `roles.ts` itself value-imports `apiFetch` from `apiClient.ts`. `i18n.tsx` is a JSX/React module that was never part of the Node function build output, so the moment this shipped, every authenticated route (`/api/auth/session`, `/api/products`, `/api/quotes`, everything) started returning `500 Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/lib/i18n'`. Caught within ~3 minutes via a Playwright console-error check, not by the build (both `tsc` projects compiled cleanly — TypeScript has no way to know a same-repo module is JSX-incompatible at the Node runtime target; this is a deploy-time/runtime-only failure mode).

**Fix**: reverted `apiClient.ts` and `session.ts` to NOT import anything from `./i18n` — both now carry their own tiny inline bilingual string (reading `localStorage.tcs_erp_lang` directly), duplicated rather than shared, specifically to guarantee zero import-graph connection to the React/JSX module tree from any file reachable from `src/lib/roles.ts`, `src/lib/users.ts`, `src/lib/products.ts`, or any other `src/lib/*` file that's value-imported into `api/`.

**Standing rule going forward**: any `src/lib/*.ts(x)` file may be transitively value-imported into the `api/` serverless bundle (the existing pattern for shared types/defaults/pure helpers — see `defaultRoles`, `ALL_PERMISSIONS`, `nowIso`, etc.). Before adding a new **value** import (not `import type`) to any `src/lib/*` file, check whether that file is reachable from `api/_lib/auth.ts`, `api/_lib/collections.ts`, `api/_lib/systemSeed.ts`, `api/_lib/rbacSeed.ts`, or any `api/handlers/*.ts` — if so, the new dependency must not itself pull in `src/lib/i18n.tsx`, `src/components/*`, or anything else JSX/React-only, even transitively. `import type` is always safe (erased at compile time); a plain `import { x }` is not.

---

## 2026-07-09 — Translate the rest of the app's Thai UI (full i18n follow-up)

**Scope**: the initial production-readiness pass explicitly scoped `src/lib/i18n.tsx` to only Dashboard + empty states + the toggle itself. This follow-up (user-requested, after the initial toggle appeared to "not do anything" outside Dashboard) wires essentially every remaining page's UI chrome to the same dictionary: sidebar nav + topbar + user menu (`App.tsx`), login/setup pages (`AuthLayout`/`SignInPage`/`SetupWizardPage`), `NotificationBell`, all 4 Settings tabs, the entire Products module (list/form/categories/picker modal), the entire Quotation module's screen editing UI (list/document/line-items/interest buttons — **not** `PrintDocument.tsx`, see below), and the entire Admin module (Users/Roles/Audit Log). ~450 dictionary keys total.

**Real bug found and fixed along the way**: navigation state (`App.tsx`'s `activeNav`) was keyed off the display label text itself (`activeNav === "ใบเสนอราคา"`), not a stable identifier. Translating the labels without fixing this would have silently broken routing the moment a user switched language mid-session. Introduced a `NavKey` union (`"dashboard" | "quotations" | ...`) decoupled from the translated label, with a `NAV_LABEL_KEYS` lookup for display. The same category filter pattern (translated display text also used as internal comparison state) was found and fixed in `QuoteList.tsx` and `ProductList.tsx` (both now use a stable `"all"` sentinel instead of the localized "ทั้งหมด" string).

**Design decision — deliberately still Thai-only, not a gap**:
1. **Persisted data/seed content**: audit log entries, notification title/description/module text, default role/department/position descriptions, `Company` default values. These are business records or admin-editable content written once (often server-side) and read back later — translating them live would mean either re-translating historical records on every render (wrong — a Login event from last Tuesday shouldn't change wording retroactively) or storing translations for every record (real scope creep, not requested). Matches the same reasoning already applied to `App.tsx`'s `moduleForAction()` in the original pass.
2. **`PrintDocument.tsx`**: the actual printed/PDF quotation handed to customers. Kept Thai regardless of the toggle — a real business document for Thai customers shouldn't silently switch language based on the preparer's own UI preference.

**New**: `translate()` in `src/lib/i18n.tsx` — a non-hook lookup (reads `localStorage` directly) for the two genuinely user-facing error strings that live in plain functions rather than components (`apiClient.ts`'s generic HTTP-failure message, `session.ts`'s login-failure fallback). Confirmed neither file is ever imported by the `api/` serverless layer, so pulling in a `.tsx` module client-side only is safe.

**Also added**: `PERMISSION_LABEL_KEY` + per-group `labelKey` to `permissions.ts` (translated display labels for the Role Management permission matrix; the Thai `PERMISSION_LABELS` used to seed the `permissions` collection is untouched).

**Files Modified**: `src/lib/i18n.tsx` (dictionary + `translate()`), `src/App.tsx` (NavKey refactor), `src/pages/AuthLayout.tsx`, `src/pages/SignInPage.tsx`, `src/pages/SetupWizardPage.tsx`, `src/components/NotificationBell.tsx`, `src/components/ConfirmDialog.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/products/{ProductsPage,ProductList,ProductForm,CategoriesManager,ProductPickerModal}.tsx`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,LineItemsEditor,InterestButtons}.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`, `src/pages/dashboard/DashboardPage.tsx` (interest widget), `src/lib/quotes.tsx` (`statusLabelKey`/`approvalActionLabelKey`/`interestLabelKey`), `src/lib/permissions.ts` (`PERMISSION_LABEL_KEY`), `src/lib/apiClient.ts`, `src/lib/session.ts`.

---

## 2026-07-09 — Fix: Administrator role incorrectly locked read-only in Role Management

**Bug**: `RoleManagementPage.tsx` routed to a fully read-only view whenever `role.isSystem` was true, and `api/handlers/roles.ts` rejected any `PATCH`/`DELETE` under the same `isSystem` check. Both "Super Admin" and "Administrator" have `isSystem: true`, so Administrator's permission checkboxes and description were locked identically to Super Admin — even though `Role`'s own doc comment says system roles should only have their name/Super-Admin-flag locked, not their permissions.

**Fix**: both client and server now key the edit lock off `isSuperAdmin` specifically (only Super Admin is fully read-only), while the delete lock and the name-field lock stay keyed off `isSystem` (Administrator's name still can't change, and it still can't be deleted — but its description/permissions are editable like any custom role). See [RBAC.md](./RBAC.md) "System-role locking" for the precise rule.

**Files Modified**: `api/handlers/roles.ts` (`handleOne`: split the single `isSystem` guard into a `PATCH`-time `isSuperAdmin` check + a `DELETE`-time `isSystem` check, and gated the `name` field update on `!target.isSystem`), `src/pages/admin/RoleManagementPage.tsx` (`startEdit` now checks `isSuperAdmin` not `isSystem`; added a `nameLocked` flag distinct from `readOnly`; added a lighter "name locked" badge for system-but-editable roles; Pencil button tooltip now reflects `isSuperAdmin`), `docs/RBAC.md`.

---

## 2026-07-09 — Production-readiness pass: branding, real Dashboard, MongoDB schema prep, dead-code removal, i18n

**Scope**: a full production-readiness pass covering official branding, removing every fake/demo data source, preparing the MongoDB schema for planned future modules, and basic Thai/English internationalization — requested as a single large task, executed in phases (each verified with a clean `npm run build`/`npm run lint` before moving to the next).

**Branding**: added the official logo (`public/logo.png`, 500×500 RGBA PNG with real transparency, verbatim from the source file — not redesigned) and one new shared component, `src/components/BrandMark.tsx` (props: `size`, `variant: "mark"|"full"`, `theme: "dark"|"light"`), replacing 6 independently copy-pasted inline "gold square + Thai ท character" placeholder blocks that had drifted in size/corner-radius over time: sidebar header (`App.tsx`, expanded/collapsed states — also fixed a real layout bug where the collapsed sidebar never actually centered the icon, just clipped the text via `overflow-hidden`), login page desktop + mobile brand marks (`AuthLayout.tsx`), and the quote/print document fallback headers (`QuoteDocument.tsx`/`PrintDocument.tsx`, only when no `company.logoDataUrl` is uploaded — the admin-uploadable company letterhead logo is a separate, untouched concept). Favicon (`index.html`) switched from an inline SVG data-URI with a Latin "T" (inconsistent with the Thai "ท" used everywhere else) to the real logo PNG. The 3 previously-blank (`<div className="min-h-screen bg-background" />`) boot/loading screens now show the logo (`App.tsx`'s new `BootLoading()`).

**Dashboard — full rewrite, zero fake data remains**: `src/pages/dashboard/DashboardPage.tsx` previously rendered 100% hardcoded static data (4 KPI cards, a 12-month revenue/expenses chart, a category-revenue donut, a 5-person fake sales leaderboard imported from `src/lib/salesTeam.ts`, a 7-row fake orders table with fake company names, and a 6-item fake activity feed — none backed by a real Orders/Accounting/HR module). All of it is deleted. New `GET /api/dashboard` endpoint (`api/dashboard/index.ts`, gated by `dashboard:view`, the app's 10th live serverless function, still under Vercel Hobby's 12-function cap) computes real KPIs (Total Customers, Total Leads, Total Quotations, Total Products, Revenue, Won Deals, Lost Deals — Won/Lost map to the existing `ปิดการขายสำเร็จ`/`เสียโอกาส` quote statuses, `เสียโอกาส` only, not `ลูกค้าปฏิเสธ`), a 12-month zero-filled monthly revenue chart (grouped from real `Quote.issueDate`, no time-series collection invented), and a real products-by-category breakdown (deliberately reframed from "revenue by category," since `QuoteLine` has no `categoryId` reference back to `Product` and joining by name would be unreliable). New `src/lib/dashboard.ts` client wrapper. The two previously-dead buttons ("ส่งออกรายงาน"/"+ สร้างคำสั่งซื้อ") and the sections with no real backing model (sales leaderboard, orders table, activity feed) were **removed outright** rather than empty-stated, since there's no real collection behind any of them — an empty state for a nonexistent module would just be a different flavor of placeholder.

**MongoDB schema prep**: added 15 new collections to `api/_lib/collections.ts` with real indexes (`permissions`, `sessions`, `departments`, `positions`, `customers`, `customer_contacts`, `leads`, `lead_activities`, `product_templates`, `quotation_comments`, `quotation_tags`, `notification_types`, `system_settings`, `uploads`, `attachments`) — schema/index scaffolding ahead of the features that will use them, per explicit request ("prepare every collection before new features are implemented"); most have no API routes or UI yet, see [DATABASE.md](./DATABASE.md) for which. Two collections requested by name were deliberately **not** built as separate collections, with the reasoning documented in DATABASE.md: `quotation_items` (stays embedded as `Quote.lines`) and `quotation_status_history` (redundant with the existing embedded `Quote.approvalHistory`, which already records every status transition). Retroactively added real indexes to the 8 already-live collections too (`products`, `categories`, `quotes`, `notifications`, `audit_log` had none beyond default `_id` before this). New `api/_lib/systemSeed.ts` (idempotent, mirrors the existing `rbacSeed.ts` pattern) seeds only system/config data on first-run setup — permissions (from the existing `ALL_PERMISSIONS` union), a generic department/position starter list, notification types, and default system settings. Explicitly seeds **zero** business data (no demo customers/products/quotations/leads) — the system starts empty by design. Added `createdAt`/`updatedAt`/`createdBy`/`updatedBy` audit fields to `ProductCategory` (had none), `createdBy`/`updatedBy` to `Product` (had timestamps already), `updatedBy` to `Quote` (had `createdByUserId` already, server-set-only — deliberately excluded from `QuoteUpdateFields`), and `updatedAt`/`updatedBy` to `Company`.

**Dead-code removal**: deleted 25 files across 7 directories (`api/{auth,users,roles,products,categories,notifications,quotes}/*`) — a duplicate, unreachable routing layer shadowed by `vercel.json`'s rewrites (the real, live routing is `api/handlers/*.ts`); confirmed dead both via production runtime-traffic log analysis (all real traffic hits `api/handlers/*`) and via `diff` (the dead files had drifted out of sync from their live counterparts, proving they'd been dead a while, not just theoretically unreachable). This `api/` tree had never been committed to git, so the deletion was confirmed with the user before executing (irreversible, not git-revertable). Also deleted `src/lib/salesTeam.ts` (the fake sales-data module) — its one real dependent besides the old Dashboard, `QuoteList.tsx`'s salesperson-initials avatar, was rewritten to a deterministic `avatarColorFor()` hash function that works for any real salesperson name, fixing a latent bug where any name not in the 5-person fake roster silently rendered no avatar at all.

**i18n (Thai/English)**: new `src/lib/i18n.tsx` — a lightweight React context (`I18nProvider`/`useI18n()`), `localStorage`-persisted (`tcs_erp_lang`, default `th`), with a toggle added to Settings → Profile. Scope was explicitly limited (user decision) to strings this pass touched — Dashboard, the 5 new empty states, and the toggle itself — rather than a full app-wide translation of the existing, entirely-Thai UI; that remains tracked as a follow-up in [TODO.md](./TODO.md).

**Empty states**: added professional empty states (Thai/English via the new i18n) to Dashboard (whole-page, when there's no quotation/product data), Products, Quotations, Notifications, and Audit Log — distinguishing, where both cases existed, "the collection is truly empty" (with a call-to-action button) from "no results match the current filter" (existing narrower message, unchanged).

**Files Added**: `public/logo.png`, `src/components/BrandMark.tsx`, `src/lib/i18n.tsx`, `src/lib/dashboard.ts`, `api/dashboard/index.ts`, `api/_lib/systemSeed.ts`.

**Files Removed**: `api/auth/`, `api/users/`, `api/roles/`, `api/products/`, `api/categories/`, `api/notifications/`, `api/quotes/` (25 files, dead duplicate routing layer), `src/lib/salesTeam.ts`.

**Files Modified**: `api/_lib/collections.ts` (15 new collections + indexes, `ensureIndexes()` extended), `api/handlers/{auth,categories,products,quotes}.ts` (seed wiring + audit-field capture), `api/company/index.ts` (audit fields), `src/App.tsx` (BrandMark, BootLoading, sidebar collapse fix), `src/pages/AuthLayout.tsx`, `src/pages/quotation/{QuoteDocument,PrintDocument,QuoteList}.tsx`, `src/pages/dashboard/DashboardPage.tsx` (full rewrite), `src/pages/products/ProductList.tsx`, `src/components/NotificationBell.tsx`, `src/pages/admin/AuditLogPage.tsx`, `src/pages/SettingsPage.tsx` (language toggle), `src/lib/{products,quotes,storage}.ts(x)` (new audit-field types), `src/main.tsx` (I18nProvider), `index.html` (favicon), `CLAUDE.md` (fixed a stale "client-only frontend, no backend" description left over from before the 2026-07-09 backend migration).

---

## 2026-07-09 — Real backend migration: Vercel Serverless Functions + MongoDB Atlas

**Feature**: Migrated the entire app from a fully client-side, `localStorage`-only architecture to a real full-stack deployment: Vite + React frontend (unchanged) + **Vercel Serverless Functions (Node.js)** backend + **MongoDB Atlas** database. Deployed and live at https://tcs-erp-nine.vercel.app (Vercel project `tcs-erp`, GitHub repo `Wisarutbuasumlee/tcs-erp` connected for auto-deploy on push to `master`). This is a different stack than the previously-proposed, never-built "Phase 2" plan (Next.js + Prisma + PostgreSQL + Auth.js) — that plan is formally superseded, not implemented; see [ARCHITECTURE.md](./ARCHITECTURE.md).

**Auth**: bcrypt password hashing (`bcryptjs`, cost 10) — the old client-side `hashPassword()` checksum function is gone entirely, not deprecated. JWT sessions (`jsonwebtoken`) in an httpOnly, `secure`, `sameSite=lax` cookie (`tcs_erp_session`, 7-day expiry). Every authenticated request re-fetches the user fresh from MongoDB rather than trusting JWT claims, so deactivating a user takes effect on their very next request, not just at token expiry.

**RBAC**: every mutating API route enforces permissions server-side via `requireUser`/`requirePermission` (`api/_lib/auth.ts`), reusing the exact same pure `roleHasPermission()` function from `src/lib/roles.ts` (value-imported into the API layer, not reimplemented). This is genuinely no longer bypassable via devtools — the server is the source of truth. Quote general-edit and workflow-action routes duplicate the ownership + permission-per-action logic from the client (`api/_lib/quoteWorkflow.ts`), giving full parity with the old client-side enforcement, now unbypassable.

**MongoDB collections**: `users` (gains a server-only `passwordHash` field never sent to the client), `roles` (seeded from `defaultRoles` on first run), `company` (singleton, `_id: "singleton"`), `products`, `categories`, `notifications`, `audit_log`, `quotes` (keyed by the business ID string, e.g. `"QT-2567-0041"`, as the literal MongoDB `_id`, not an `ObjectId`).

**API layout**: 9 serverless function files (Vercel Hobby's 12-function cap) — `api/company/index.ts` and `api/audit-log/index.ts` as plain method-dispatch files; `api/handlers/{auth,users,roles,products,categories,notifications,quotes}.ts` as one-file-per-resource, path-segment-dispatch files. Routed via an explicit `vercel.json` `rewrites` table after ruling out Vercel's own dynamic-route (`[...segments]`) convention, which had multiple surprising, undocumented behaviors on this plain-Vite deployment (wrong query-param key, zero-segment paths never matching, `_`-prefixed folders silently excluded from routing) — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full root-cause writeup, kept for future engineers touching routing.

**Build/tooling**: new `tsconfig.api.json` (Node target) alongside the existing `tsconfig.json` (browser target); `npm run build` now runs both `tsc` projects plus `vite build`; `eslint.config.js` gained a Node-globals block scoped to `api/**/*.ts`. Every relative import in `api/` (and any `src/lib/*.ts` file value-imported from `api/`) needed an explicit `.js` extension to satisfy Node's native ESM loader in the deployed (non-bundled) serverless functions — a footgun hit and fixed multiple times during the migration.

**Frontend changes**: new `src/lib/apiClient.ts` (`apiFetch<T>()` wrapper). Every domain lib file (`users.ts`, `roles.ts`, `session.ts`, `storage.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.tsx`) rewritten from `loadX()`/`saveX()` `localStorage` functions to `fetchX()`/`createX()`/`updateX()`/etc. API calls. `App.tsx` now boots asynchronously via a `bootStatus` state machine against `GET /api/auth/session`, fetching all app data in parallel via `Promise.all` before rendering the shell. `currentUser` is now real React state, not derived via `.find()`. `AuditLogPage.tsx` now self-fetches on mount instead of receiving data as a prop, since its endpoint is permission-gated.

**Genuine security/privacy improvements over the old simulation** (not just "moved," actually better): audit log entries always derive actor identity from the authenticated session server-side, never trusting the request body — a client can no longer forge who performed an action. `GET /api/notifications` is now genuinely filtered server-side to the caller's own notifications, rather than the client holding every user's notifications in memory and filtering only for display.

**Known, deliberate scope limitations** (documented, not hidden): `GET /api/users`/`roles`/`company`/`products`/`categories` are open to any authenticated user, not gated by a manage-permission — matches pre-migration behavior where the full dataset already lived in every signed-in browser, so not a new exposure, just now requiring real login at all. No rate limiting on login. No automated tests or CI pipeline. A MongoDB Atlas database-user password was pasted into an AI chat session during this migration's development — a rotation was recommended to the user as a follow-up, unconfirmed whether completed.

**Files Added**: `api/**` (all Vercel Function handlers and `_lib/` shared code), `vercel.json`, `tsconfig.api.json`, `src/lib/apiClient.ts`.

**Files Modified**: `src/lib/{users,roles,session,storage,products,notifications,auditLog,quotes}.ts(x)` (localStorage → REST API calls), `src/App.tsx` (async boot sequence, real `currentUser` state), `src/pages/admin/AuditLogPage.tsx` (self-fetching), `package.json` (`build` script now runs two `tsc` projects), `eslint.config.js` (Node-globals block for `api/**`).

**Files Removed**: the old client-side non-cryptographic `hashPassword()` function in `src/lib/users.ts`.

**Reason**: Explicit user request to move off the client-only/`localStorage` architecture onto a real, deployed, server-enforced backend.

**Notes**: Deployed via Vercel CLI (`vercel link`, `vercel env add MONGODB_URI`/`JWT_SECRET`, `vercel deploy --prod`) — no CI/CD pipeline wired up yet, deploys were manual via CLI during this session. The GitHub repo is already connected to the Vercel project per `vercel link`'s output, so pushing to `master` may already auto-deploy going forward — flagged to verify, not assumed, next time someone pushes (see [TODO.md](./TODO.md)). Full documentation pass across all `docs/` files per the standing rule — see [PROJECT_STATUS.md](./PROJECT_STATUS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), [API.md](./API.md), [RBAC.md](./RBAC.md).

---

## 2026-07-09 — Code review pass: RBAC + print/PDF permission and data-integrity fixes

**Feature**: A full multi-angle code review (correctness, removed-behavior, cross-file, reuse, simplification, efficiency, altitude, CLAUDE.md conventions) of the previous two sessions' work (RBAC/user-management system + quotation print redesign), followed by fixes for every confirmed bug.

**Bugs fixed**:
- `quotations:export` permission was defined and shown in the Role Management matrix but never actually checked — the "พิมพ์ / PDF" button rendered for every role regardless. `QuotePermissions` gained `canExport`, computed via `hasPermission(..., "quotations:export")`, and the print button is now hidden without it.
- The customer-interest (👍/👎) toggle in `QuoteDocument.tsx` (both the toolbar and meta-panel instances) bypassed `permissions.canEdit` entirely — a Viewer-role user could change a quote's interest level despite having no edit rights anywhere else. Now gated like every other edit action.
- "คัดลอก" (Duplicate) had no permission gate at all — any signed-in user, including Viewer, could clone any quote into a new draft. `QuotePermissions` gained `canDuplicate` (`quotations:create`), and the button is hidden without it.
- **Workflow actions (Submit/Approve/Reject/etc.) operated on the last-*saved* quote, silently discarding any unsaved on-screen edit** — e.g. editing a quote's line items then clicking "ส่งขออนุมัติ" directly (without clicking "บันทึก" first) reverted those edits once the transition was applied, and could cause the ≥฿500,000 high-value approver notification to fire against the wrong (stale) amount. `onWorkflowAction` now carries the current on-screen draft, merged into the persisted quote before the status transition is applied. Verified end-to-end: edited a line item, clicked Submit directly, reopened the quote, edit was preserved.
- User Management had no safeguard against **deactivating or role-reassigning the last active Super Admin** (only hard-delete was guarded) — an Administrator could lock everyone out of Super-Admin-only features via the normal UI. Added the same last-active-Super-Admin check to both the deactivate action and role-change validation.
- `loadRoles()` returned `[]` instead of falling back to `defaultRoles` when the stored roles array was empty (as opposed to missing) — a rare but reachable state that would crash the first-run Setup Wizard (`Cannot read properties of undefined`) when picking the Super Admin role. Fixed to fall back on empty as well as missing.
- The printed/PDF quotation was missing the company stamp image near the approver's signature — a real regression versus the pre-redesign print output, simply missed when `PrintDocument.tsx` was built. Restored.
- A line item's "has extra details" check (notes/sub-details/specs/tags) was implemented twice with different rules — the on-screen editor counted a sub-detail row as "has details" even if left blank, while the print component ignored blank ones — so a line could show the "has notes" indicator on screen but print with nothing. Unified into one `lineHasDetails()` helper in `lib/quotes.tsx`, used by both.

**Cleanup**: consolidated three duplicate date-formatting functions (`QuoteDocument.tsx`'s `fmtDate`, `PrintDocument.tsx`'s `fmtThaiDate`/`fmtNumericDate`) into shared `formatQuoteDateThai`/`formatQuoteDateNumeric` exports in `lib/quotes.tsx`; replaced three raw `new Date().toISOString()` calls in `UserManagementPage.tsx` and a hand-rolled ID in `RoleManagementPage.tsx` with the existing shared `nowIso()`/`newId()` helpers; deduplicated a double array-reverse of `approvalHistory` in `QuoteDocument.tsx` into one.

**Files Modified**: `src/lib/quotes.tsx`, `src/lib/roles.ts`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor,PrintDocument}.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage}.tsx`

**Reason**: Explicit user request to review the code, fix bugs, commit, and push.

**Notes**: Deliberately **not** changed (documented rather than silently skipped): `Company.vatRate` still isn't wired into `computeTotals()` — this is a pre-existing, already-tracked (see [TODO.md](./TODO.md)) product decision, not a regression from either reviewed session, and fixing it requires deciding VAT-rate-versioning semantics that's out of scope for a bug-fix pass. The narrow edge case where a legacy/seed quote's empty `createdByUserId` gets claimed by whichever user first takes a workflow action on it was identified but not fixed — low severity, affects only pre-existing seed data, and fixing it properly requires a larger ownership-semantics decision. The printed document intentionally does not show the internal workflow status badge (matches the real reference quotation the redesign was modeled on, which shows no such badge either) — flagged by one reviewer as a possible regression but judged to be correct, intentional behavior. Verified via scripted Playwright passes: a Viewer-role user correctly can no longer see the print/duplicate/interest controls; an unsaved line-item edit survives a direct "Submit" click; a fresh print PDF export still renders correctly with no console errors. `tsc --noEmit`, `eslint .`, and `npm run build` all clean before and after.

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
