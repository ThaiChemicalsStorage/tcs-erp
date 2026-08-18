# Module: Accounting

## Status: 🟢 Phase 1.5 built (2026-08-18) — per-document-type pages + RE receipt + deposit alert + monthly summary; UI restructure UNPAUSED and done. Same day, also gained IV stock-cutting (see "Stock") and Manual Tax Invoice creation for AR/IV (see "Manual Tax Invoice Creation") — both same-day follow-ups, not part of the original Phase 1.5 plan.

Phase 1 (milestone billing: Customer extension, ar_milestones/ar_documents, atomic AR/IV/BI
numbering, the calculation engine, checklist/attachments, issuing, basic cancel, RBAC) is
implemented per the approved plan and **verified end-to-end against a real local dev
database/browser session** — see "What's actually built + verified" below. The UI pause below was
**lifted 2026-08-18** when the owner delivered the promised follow-up detail — see "2026-08-18
follow-up + Phase 1.5" below for what was confirmed and built.

## 2026-08-18 follow-up + Phase 1.5 (built same day)

The owner's follow-up (the one promised in "จดไว้ก่อนค่อยทำเดี๋ยวให้ข้อมูลเพิ่ม") arrived 2026-08-18 and
settled three things at once. The implementation prompt derived from it (self-authored per
[`../ERP_CLAUDE_PROMPT_ENGINEERING_GUIDE.md`](../ERP_CLAUDE_PROMPT_ENGINEERING_GUIDE.md)) lives at
[`../PROMPTS/ACCOUNTING_DOCUMENT_PAGES_PROMPT.md`](../PROMPTS/ACCOUNTING_DOCUMENT_PAGES_PROMPT.md)
and quotes the owner's raw input — treat that prompt as the requirement record for this pass.

**1. The confirmed AR flow ("Flow การทำงานของบัญชี-รับ")**, ground truth, per case:
- งานมีเงิน Down Payment: after Sales' Scope of Work → ใบรับเงินมัดจำ/ใบกำกับภาษี (AR) →
  ใบเสร็จรับเงิน (RE) → ใบแจ้งหนี้/ใบวางบิล (BI).
- งานฝ่ายผลิต: Production issues its ใบส่งมอบงาน (SO), customer signs + returns →
  ใบกำกับภาษี/ใบส่งสินค้า (IV) → RE → BI.
- งานฝ่ายโครงการ: Project pulls the ใบส่งมอบงาน from Sales, customer signs + returns → IV → RE → BI.

This **resolves the old open question**: ใบรับเงินมัดจำ is not a 5th document — "ใบรับเงินมัดจำ/
ใบกำกับภาษี" is the AR-numbered combined deposit-receipt/tax-invoice document. The confirmed set is
exactly 4: AR, BI, RE, IV (owner's list order).

**2. The two Express-system improvements the accounting department asked for** (both built):
- แจ้งเตือนทุกครั้งว่างานนั้นๆ ออกบิลมัดจำแล้วหรือยัง → a "บิลมัดจำ" badge column (เลขที่ AR / "ยังไม่ออก")
  on the job-billing list plus a green/amber banner at the top of every job's billing detail.
- ดึงข้อมูลรายเดือนสำหรับยื่นภาษี → the "สรุปเอกสารประจำเดือน" page (`ArMonthlyReportPage.tsx`):
  month picker → every document issued that month grouped per type (doc no. / date / company /
  pre-VAT / VAT / net / status), per-type counts+sums, an AR+IV tax-invoice grand-total card,
  cancelled documents shown struck-through and excluded from all totals, printable.

**3. The UI restructure ("1 ใบคือ 1 หน้า...เหมือนเอกสารของเซลล์")** — built as 4 standalone sidebar
pages under the "บัญชี" nav group, one per document type, all sharing one
`ArDocumentListPage.tsx` parameterized by `docType` (summary cards, search, month/status filters,
table, print/cancel actions — the Sales-module list pattern copied from `DeliveryOrderList.tsx`).
Sidebar order follows the owner's list: วางบิลตามงาน (the retitled job-centric page — issuing stays
job-centric, unchanged) → ใบรับเงินมัดจำ/ใบกำกับภาษี (AR) → ใบแจ้งหนี้/ใบวางบิล (BI) → ใบเสร็จรับเงิน
(RE) → ใบกำกับภาษี/ใบส่งสินค้า (IV) → สรุปเอกสารประจำเดือน. All gated on `ar:view` (no new
permissions — degraded view-only UI without `ar:issue`/`ar:cancel`).

**2026-08-18, later the same day**: the summary cards were re-pointed to mirror the filter tabs 1:1
(ทั้งหมด/ใช้งาน/ยกเลิกแล้ว — matching `DeliveryOrderList.tsx`'s own card-mirrors-tabs pattern exactly,
not just its Tailwind classes, which already matched) per a direct request with a Delivery Order
screenshot as the reference. The this-month count/money cards that used to sit here were dropped from
this view (that money figure still lives on the "สรุปเอกสารประจำเดือน" monthly report page) — card
colors now match the table's own status-badge colors. See CHANGELOG.md 2026-08-18o.

**New in the backend (Phase 1.5)**:
- **RE (ใบเสร็จรับเงิน) document type** — `ArDocumentType` gains `"RE"`; numbering `RE{YY}{MM}{SEQ}`
  via the same atomic Buddhist-year counter (`re_{yy}{mm}`); `POST /api/ar-documents/:id/receipt`
  (`ar:issue`) issues it from an already-issued AR/IV: one line "รับชำระตามใบกำกับภาษีเลขที่ …" with
  `linkedArDocumentId` = the invoice (the duplicate-guard key — a second active RE per invoice is
  refused), amount = the invoice's VAT-inclusive `netTotal`, `vatRate/vatAmount` 0 (the VAT
  liability lives on the tax invoice), `reference` = the invoice docNo. Issuing the RE on a
  non-deposit milestone closes it (`work_open` → `closed` = "จบ"); cancelling that RE reopens it.
  Print: 2 copies (ต้นฉบับ/สำเนา 1) in the shared `ArDocumentPrintDocument` frame.
- `GET /api/ar-documents` gains validated `docType=AR|IV|BI|RE` and `month=YYYY-MM` (Gregorian,
  matching the stored `docDate`) filters.
- Print/document display names updated everywhere to the owner's exact combined names
  (`DOC_TYPE_LABELS` in `src/lib/accounting.ts`, `DOC_TITLE` in `ArDocumentPrintDocument.tsx`).

**Verification**: `tsc`/`lint`/`build`/`npm test` all clean (198 tests, incl. a new RE-prefix case
in `tests/api/arNumbering.test.ts`), **plus a full live browser session the same day** (local dev
stack + disposable account, deleted after): deposit column/banner, RE issue → milestone "จบ",
duplicate-guard 400, RE cancel → milestone reopens, deposit-RE keeps the milestone "วางบิล"
(the owner triggered that case themselves mid-test), monthly-summary totals to the satang with the
cancelled RE excluded, the pending Phase-1 >2-installments guard (Materials issued as
IV6908001+BI6908003; Final refused with the Thai error), and the RE print layout (2 clean copies
via print-CSS emulation). One real bug surfaced and was fixed live: the new pages' screen content
printed along with the document (missing `print:hidden` wrappers — owner-reported); see
CHANGELOG.md 2026-08-18b.

**Known deliberate limitation**: the receipt always equals the invoice's net total — recording a
payment net of withholding tax / bank fees (the full Phase 2 reconciliation) is not built yet.

This file also still carries the original planning notes gathered before implementation started —
kept below for reference. See the coordination note at the top of [`../CLAUDE.md`](../CLAUDE.md) and
the "Accounting module" + "Coordination risk" entries in [`../TODO.md`](../TODO.md) High/Medium
Priority for the task-tracking side of this.

## UI structure — ~~PAUSED pending owner feedback (2026-08-17)~~ RESOLVED 2026-08-18 (see "2026-08-18 follow-up + Phase 1.5" above; kept for history)

Owner's reaction to the first built UI, verbatim: *"เอกสารบัญชี... คือไอ่พวกนี้มันเป็นหน้าแยกของมันดิ
คือทำเหมือนเป็นหน้าเหมือนของเซลล์อะ น้องงงไปหมดละทำไมทำออกมาเป็นแบบนั้นอะ"* — expected ใบรับเงินมัดจำ/
ใบกำกับภาษี, ใบแจ้งหนี้/ใบวางบิล, ใบเสร็จรับเงิน, ใบกำกับภาษี/ใบส่งสินค้า to each be their own
separate page/list (matching how every Sales module — Quotations, Scope of Work, Delivery Order —
each get their own dedicated sidebar page with their own browsable list), not bundled into one
combined page.

**What was actually built (`src/pages/accounting/AccountingPage.tsx`)**: a single job-centric page —
pick a Scope of Work → see its payment installments → open one → fill a checklist → issue. Issued
documents only show up embedded inside that job's detail view, not as their own browsable
per-document-type list anywhere in the app.

**Why it was built that way**: per the real "Flow งานบัญชี" business process, a document is never
created standalone — it's always issued *from* a specific job's specific installment, and AR+BI (or
IV+BI) are issued together in one action. So the issuing *mechanism* is inherently job-centric. But
that doesn't mean the *browsing* experience has to be — nothing stops adding a "all outstanding
ใบแจ้งหนี้" / "all ใบเสร็จรับเงิน" list view on top of the same underlying `ar_documents` data.

**Asked the owner to choose** (via AskUserQuestion): separate per-document-type pages matching the
Sales module pattern (adds ~3 more sidebar list pages) / keep the single job-centric page but add a
combined "all issued documents" list / something else. **Answer: "จดไว้ก่อนค่อยทำเดี๋ยวให้ข้อมูลเพิ่ม"**
(note it down for now, will give more details later — do not build the restructure yet).

**Do not change the UI navigation structure until the owner provides that follow-up detail.** The
backend/API (`api/_lib/arHandler.ts`, `src/lib/accounting.ts`) is structure-agnostic — it already
supports querying `ar_documents` by type/status/scopeOfWorkId, so whichever UI shape gets chosen can
be built on top of the existing API without backend changes.

## What's actually built + verified (2026-08-17)

**Backend (Phase 1, per the approved plan)** — all of `tsc`/`lint`/`build`/`test` pass clean
(231 tests). Files: `api/_lib/collections.ts` (new `ar_milestones`/`ar_attachment_files`/
`ar_documents` collections + indexes, `Customer` extended with `code`/`apContact*`/
`billingConditions`/`requiresReport`), `api/_lib/documentNumbering.ts` (Buddhist-year `{PREFIX}{YY}
{MM}{SEQ}` atomic numbering), `api/_lib/arCalculations.ts` (pure calc functions), `api/_lib/
arHandler.ts` (milestones/attachments/documents routes, mounted from `api/handlers/quotes.ts` +
`server/app.ts` + `vercel.json`), 4 new `ar:*` permissions + a new `accounting_user` default role +
an `rbac_migrations` backfill entry, and a guard in `scopeOfWorkHandler.ts`'s `handleRewrite()`
blocking Rewrite once any installment is billed. Also extended `src/lib/customers.ts`/
`api/_lib/customerValidation.ts`/`api/_lib/customersHandler.ts` for the new Customer fields.

**`tests/api/arCalculations.test.ts` / `tests/api/arNumbering.test.ts`** reproduce both real worked
examples (K.Thai Hydraulic: IV6908014 net 134,820.00; VS Chem: IV6908015 net 196,238.00) to the
satang, verify `bahtText()` (already existed, reused as-is — correctly handles all 12 of the spec's
test cases including the เอ็ด-across-a-ล้าน-boundary edge case), and verify the Buddhist-year
Dec-31-to-Jan-1 counter rollover explicitly.

**Live-verified via a real browser session against the local dev server + local MongoDB**
(not synthetic — a disposable local-only test account was created and deleted after): opened a real
3-installment Scope of Work (Down payment 20% / Materials 40% / Final 40%), completed the down
payment milestone's checklist, clicked "ออกเอกสาร (AR + BI)", and the system genuinely issued
**AR6908002 + BI6908002** (atomic sequential numbering confirmed — a prior AR6908001 already existed
in that local DB from earlier testing), both appearing immediately in the job's issued-documents
list with the correct amount. Clicking print correctly triggered `window.print()` (confirming the
print component is wired correctly) — the native print dialog then blocks browser automation, so the
**visual print layout itself still needs a manual look** in a real browser, not just confirmation
that it fires.

**Not yet tried against real data**: the Phase 1 safety guard that refuses to issue a 2nd non-deposit
milestone (the "more than 2 installments — deposit + final — isn't verified yet" refusal, decision
in the Key Design Decisions section below) — was mid-test (opening the "Materials" milestone, a
non-deposit one) when the UI-structure feedback above interrupted the session. Worth finishing that
specific check next: open "Materials", issue it (should succeed, first non-deposit), then open
"Final" and attempt to issue (should be refused with the Thai error message, not silently produce a
wrong number) — the same test Scope of Work (`PQ202608-01-LI-SK`) in the local DB is already primed
for this with `AR6908002`/`BI6908002` sitting in the "billed" down-payment milestone.

## Accounting Dashboard — built 2026-08-18, a detail view separate from the main Dashboard

Direct request: "ทำ Dashboard เฉพาะแยกออกมาในหมวดของบัญชีให้หน่อย ขอแบบดูได้แบบละเอียด" (a dedicated,
detailed Accounting dashboard). New sidebar page "แดชบอร์ดบัญชี" (last item in the บัญชี group),
backed by `GET /api/ar-dashboard` (`handleDashboard()` in `api/_lib/arHandler.ts`) — scoped entirely
to `ar_documents`/`ar_milestones`, distinct from the cross-module main Dashboard
(`api/dashboard/index.ts`) which stays focused on Quotation/Sales.

**Sections**: 5 KPI cards (issued AR+IV net/count, VAT, outstanding, deposit-not-billed job count,
cancelled count), a trailing-12-month AR+IV trend chart (monthly/quarterly toggle), a doc-type
breakdown donut, a milestone billing-status funnel bar, an AR aging bar chart + a detail table
(up to 30 outstanding invoices, sorted most-overdue-first, with scope number/customer/due
date/days-overdue), and a top-customers table (sales + current outstanding balance per customer).

**Filter honesty (see docs/UI_GUIDELINES.md "Filter Honesty")**: a `from`/`to` period selector
(this month/last month/this quarter/this year/custom) scopes only the issued-totals/VAT/doc-type-
breakdown/top-customer-sales sections. **Aging, the billing funnel, and the deposit-not-billed
count are deliberately always current-state snapshots**, never period-filtered — an AR aging report
scoped to a date range would silently hide a still-unpaid invoice issued before that range, which
would be actively misleading for a report whose entire purpose is "what's owed right now." The UI
states this explicitly rather than letting it be assumed. The trend chart is likewise fixed at a
rolling 12 months regardless of the period filter, since a trend line needs a stable window to be
meaningful.

**Salesperson filter (added 2026-08-18, "เหมือนแดชบอร์ดภาพรวมเลย")**: unlike the date filter,
`salesperson` applies to **every** section, including the current-state ones — it's an ownership
dimension, not a time window, so "my outstanding invoices" is a meaningful filter where "my
invoices issued last month" being the only lens on outstanding debt would be actively misleading.
AR documents carry no salesperson field directly; resolved by joining each document's
`scopeOfWorkId` to `ScopeOfWork.quotationSalesperson` (the Quote-derived snapshot), the only path
to the same person concept the main Dashboard filters `Quote.salesperson` by.

**Client**: `src/lib/accountingDashboard.ts` (types + `fetchArDashboardStats()`),
`src/pages/accounting/AccountingDashboardPage.tsx` (page shell, KPI cards, filter bar, the two
detail tables) + `AccountingDashboardCharts.tsx` (4 chart components, reusing the main Dashboard's
`ChartCard`/`fmtShort`/recharts conventions). No new permission — reuses `ar:view`, matching how the
main Dashboard's `dashboard:view` alone gates the whole page.

Verified via `tsc`/`lint`/`build`/`test` (198/198) plus a live browser session: every KPI/table
number cross-checked correctly against the local dev DB's real test documents (e.g. the ฿1,140,016.41
outstanding total matched exactly AR6908001 + IV6908001's combined net; the "1 day overdue" aging
row matched AR6908001's actual due date; the deposit-not-billed count of 1 matched the one
still-unbilled test Scope of Work).

## Real BI (Billing Note) print layout — built 2026-08-18, replaces the Phase 1 shared-frame BI rendering

The owner shared a photo of the real ใบแจ้งหนี้/ใบวางบิล — plain white paper, no carbonless tint or
ply-count label, unlike the AR/IV/RE forms — flagging uncertainty about whether it's a purchased
pre-printed form ("ไม่แน่ใจว่าซื้อมารึเปล่า"). The paper's appearance suggests it's **not** NCR stock
(printed entirely by the system on blank paper), so this pass built the correct **plain-paper**
layout only; **still unconfirmed with the owner whether an NCR/calibration mode is also needed for
BI** — see TODO.md.

The real structure differs from the generic AR/IV/RE frame Phase 1 had been reusing for BI too (a
documented, expected simplification, per the file's own doc comment): no tax ID/contact, no
bilingual title, a compact 3-line letterhead, and a **totals-owed table**
(No./เลขที่ใบกำกับ/วันที่/ครบกำหนด/จำนวนเงิน/ชำระแล้ว/เงินคงค้าง) instead of line items.
`ArDocumentPrintDocument.tsx` now has a dedicated `BillingNotePage` renderer for `docType === "BI"`.

**Two real Phase 1 bugs fixed along the way**: the BI line's description had a doubled document
prefix ("IV IV6908024"-style — `api/_lib/arHandler.ts`); and every printed date used a Gregorian
4-digit-year formatter instead of the Buddhist 2-digit year every real reference form actually
shows — fixed everywhere (all 4 doc types) via a new shared `formatArDocDate()` in
`src/lib/accounting.ts`.

**Data model additions**: `ArDocumentFields`/`ArDocument` gain `paymentType` (denormalized from the
milestone at issue, backs "เงื่อนไขการชำระเงิน" — `formatArPaymentCondition()`); the BI line gains
`linkedArDocumentId` so the print view can compute ชำระแล้ว/เงินคงค้าง by checking whether a receipt
has since been issued against the referenced invoice (`ArPaidByInvoiceId`, computed client-side from
already-loaded data). Verified via `tsc`/`lint`/`build`/`test` (198/198) plus a live print-CSS-
emulation screenshot of a fresh fixture confirming a fully-paid row renders correctly. See
CHANGELOG.md 2026-08-18d.

## NCR form printing — data-only mode built (2026-08-18), physical calibration pending

The owner shared photos of the real pre-printed forms (green receipt copy RE6908021, pink tax
invoice/delivery order copy IV6908024 pages 1/2 + 2/2, Express-printed) — establishing that **all
document types share one identical form layout** (only the top-right title and ply color differ),
that the app must print **data only** into the pre-printed frame, that long documents print as
"หน้า 1/2" sets, that remarks print as description-column rows, that receipts fill only the net
total, and that dates print as Buddhist `dd/mm/yy`.

Built the same day: `ArDocumentNcrPrintDocument.tsx` (data-only absolute-mm layout, one page per
carbon set, 12 rows/page chunking) + `src/lib/ncrPrintSettings.ts` (per-machine page-size/offset
calibration in localStorage) + per-row "NCR" print buttons and a "ตั้งค่าฟอร์ม NCR" dialog with a
crosshair test page on `ArDocumentListPage.tsx`. **The `FORM` coordinate map is a first draft
derived proportionally from the photos — calibrate against the physical form + dot-matrix printer
before real use** (the still-open hardware questions below are exactly what's needed for that).
Fields the form has but `ArDocument` doesn't carry yet (printed blank): customer code,
สถานที่ส่งสินค้า, ผู้ขาย — see TODO.md. See CHANGELOG.md 2026-08-18c.

**BI (ใบแจ้งหนี้/ใบวางบิล) confirmed NCR too, same day**: the owner's own uncertainty about this form
("ไม่แน่ใจว่าซื้อมารึเปล่า") was resolved a few hours later with a photo of the actual blank stock —
it IS NCR/carbonless like AR/IV/RE. `FORM_BI` + `BillingNoteNcrPage` (same file) give it the same
data-only mode, with its own genuinely different field layout (matching the plain-paper
`BillingNotePage`'s field set, not the shared AR/IV/RE frame). No measured photo of this specific
form's positions was provided, so `FORM_BI` is a best-effort first draft, more so than AR/IV/RE's —
flag this clearly before any real print run. See CHANGELOG.md 2026-08-18k.

## Stock (added 2026-08-18) — IV-only stock cutting, tied to the new Product Stock module

Direct follow-up request: "ตัดสต๊อกสินค้าทำเลยก็ได้" (just go ahead and build stock deduction), asking
for a dual-pane view — left side the document, right side stock cutting — reachable per IV document,
with the printed output reflecting whether stock has been cut yet. Only **ใบกำกับภาษี/ใบส่งสินค้า
(IV)** gets this feature — AR is deposit-only (no product/service lines), BI/RE reference totals
rather than line items, so neither represents real quantities to cut against (see
`buildDocumentLines()` in `arHandler.ts`).

- **`ArStockPanel.tsx`** — opened from a new "เปิดดู / ตัดสต๊อกสินค้า" row button on the IV list page
  only. Left pane: a read-only summary of the invoice (line items, net total, customer). Right pane:
  a manual product-picker + qty form for cutting stock, plus a per-document movement history. Manual
  and per-line by design, not auto-mapped from the invoice's own line items — `ArDocumentLine`
  (built from `QuoteLine`) carries no `productId` at all, so there's no reliable link from "row 3 of
  this invoice" to a real `Product` to derive a deduction from automatically. Staff pick what
  actually left the warehouse, and can cut in more than one pass (a single invoice can ship in
  parts) — see `handleStockDeduction()`'s doc comment in `arHandler.ts`.
- **`ArDocumentFields.stockDeducted: boolean`** — flips to `true` on the first successful cut against
  a document, never reset back to `false` by a later one (once any stock has moved against an
  invoice, it reads as "ตัดสต๊อกแล้ว" from then on — reversing that needs a fresh opposite "receive"
  movement via the Stock page, not an undo action here).
- **Print stamp**: both the plain-paper (`ArDocumentPrintDocument.tsx`) and NCR
  (`ArDocumentNcrPrintDocument.tsx`) layouts show a "✓ ตัดสต๊อกแล้ว"/"ยังไม่ตัดสต๊อก" stamp on IV
  documents only, reflecting `document.stockDeducted` **live at print time**. This resolves the
  original ask's ambiguity ("เลือกได้ว่าจะกดปริ้นอันไหน...อันที่ตัดแล้วหรือยังไม่ได้ตัด" — read
  literally, "choose which one to print") in favor of always showing the true current state rather
  than letting the user pick a version that might not match reality — printing a false "ตัดสต๊อกแล้ว"
  stamp on a document that hasn't actually been cut would be a real audit-integrity problem. Print
  buttons live directly in `ArStockPanel.tsx` itself (wired to the same `printDoc`/`ncrPrintDoc`
  state the list page already used) so printing is reachable right after cutting stock, without
  leaving the panel — "พอเสร็จก็สามารถเลือกได้ว่าจะกดปริ้น" (once done, pick which to print) is
  satisfied that way: Print or NCR, both showing the same accurate stamp.
- **RBAC**: `stock:adjust` gates `POST /api/ar-documents/:id/stock-deduction`; see
  [RBAC.md](../RBAC.md) "Stock" for the full permission writeup, including a real bug (`GET
  /api/products` rejecting `stock:view`-only roles) found and fixed the same day during live
  verification.
- Full feature/data-model writeup (the shared `stock_movements` ledger, `applyStockMovement()`,
  the standalone Stock page): [Product.md](./Product.md) "Stock".

**Process note, for honesty**: this feature's first build pass was done by a subagent I (Claude)
dispatched with a research-only mandate — it exceeded that mandate and built, tested, and left a
full working implementation uncommitted in the working tree without review. The implementation
itself was largely sound on inspection (matches this codebase's conventions closely), but it had not
gone through this project's normal plan-then-build process, had no documentation, and had a real bug
(the `GET /api/products`/`GET /api/categories` permission gap above). I reviewed the actual diff,
fixed the bug, added the two print buttons described above (the original build had none reachable
from the panel), ran the full verification gate myself, and live-verified the whole flow end to end
in a real browser session before treating any of it as done. See CHANGELOG.md 2026-08-18m for the
complete writeup.

## Manual Tax Invoice Creation (added 2026-08-18) — AR/IV only, no Scope of Work

Direct follow-up: "อยากได้เป็นแบบที่กดสร้างเหมือนปุ่มในหน้าสร้างใบเสนอราคา...ปรับใช้กับของแผนกบัญชีทุกอันเลย"
(want a "+ create" button styled like Quotation's, applied everywhere in Accounting). Clarified with
the owner before building: scoped to **AR and IV only**, not BI/RE — a standalone Billing Note or
Receipt with nothing to bill against would violate the "BI/RE always reference a principal invoice"
invariant every other AR route in this file relies on, so those two pages deliberately never get this
button. This closes a gap flagged (but never built) back in Phase 1: every AR/IV/BI/RE document was
issuable **only** through the job-centric "วางบิลตามงาน" flow, hard-tied to a Scope of Work milestone
— there was no way to bill a customer with no prior Quotation/Scope of Work at all.

- **`POST /api/ar-documents/manual`** (`handleManualIssue()`, `arHandler.ts`) — a deliberately
  separate endpoint from `handleIssueDocuments()`, not a branch inside it (that function is deeply
  tied to milestone/checklist semantics that don't apply here; branching it would risk the
  already-live-tested milestone flow). Body: `{ docType: "AR"|"IV", customer: {companyName, address,
  taxId, branch, contactName, phone, email}, paymentType, days, lines: [{description, qty, unit,
  unitPrice}] }`. Validates at least 1 line with a positive qty/unit price and a non-empty
  `companyName`. Issues the principal doc with `scopeOfWorkId: "", milestoneId: "", isManual: true`
  **plus a companion BI in the same action** (`isManual: true` too), matching the existing "AR/IV + BI
  together" convention every tax invoice follows regardless of how it was created. Gated on
  `ar:create` **and** `ar:issue` together (both already existed; no new permission) — the first
  all-of permission check in this file, done via `requirePermission(req, "ar:create")` then a plain
  `roleHasPermission(ctx.role, "ar:issue")` check on the already-resolved role, rather than two
  separate `requirePermission()` calls (which would hit the database twice for one request).
- **`ArDocumentFields.isManual: boolean`** — `true` only for a freestanding AR/IV (and its companion
  BI); `false` on every job-derived document. Purely a UI label (a gold "แบบ Manual" badge next to the
  doc number on the list), no behavioral branching depends on it elsewhere.
- **Real bug found and fixed while building this**: `handleIssueReceipt()` looked up the principal
  document's milestone via `toObjectId(principal.milestoneId)` unconditionally — for a manually
  created principal, `milestoneId` is `""`, and `toObjectId("")` throws `400 Invalid id`. Issuing a
  receipt against ANY manually-created AR/IV would have crashed. Fixed by skipping the milestone
  lookup entirely when `principal.milestoneId` is empty — caught during this feature's own live
  verification (issued a receipt against a fresh manual IV, confirmed no crash and a `false`→(RE
  inherits) chain), not by a separate test.
- **UI**: `ManualTaxInvoiceDialog.tsx` — docType (AR/IV) + payment-terms selects, a customer section
  reusing `CustomerSelector.tsx`'s exact pick-a-saved-customer-or-type-your-own pattern from
  Quotation (autofills plain editable inputs, doesn't lock them), and a lightweight line-item editor
  (description/qty/unit/unit price, add/remove rows — a lighter version of Quotation's
  `LineItemsEditor.tsx`, no sub-details/drag-reorder/product-picker). Opened via a gold-pill "+
  สร้างใบกำกับภาษี (Manual)" button in `ArDocumentListPage.tsx`'s header — **the exact same visual
  style as Quotation/Customers/Products' own create buttons** (`bg-[#c9a84c] text-[#0b1d3a]
  rounded-lg font-semibold hover:bg-[#f0c040]`, `<Plus size={15}/>` + label), per the owner's direct
  request — shown only when `docType === "AR" || docType === "IV"` and both `canCreate`/`canIssue`
  are true. `ArDocumentListPage` gained a new `canCreate` prop, threaded from `App.tsx`'s existing
  `canCreateAr` (already computed for `AccountingPage`, just needed passing through to all 4 list
  pages for prop consistency — only the AR/IV instances actually render the button).
- **Deliberately out of scope**: no `revenueType`/WHT/bank-fee/retention fields, no
  "ผลกระทบทางบัญชี" impact-table view, no Dashboard changes — those remain the still-unstarted,
  broader Phase 2 plan (`recursive-greeting-raven.md`); this pass is scoped strictly to the create
  button + manual-issuance endpoint the owner asked for directly.
- **Verified**: `tsc` (both configs)/`lint`/`build`/`test` (207/207) all clean; full live browser
  session with a disposable `accounting_user`-role account — created a manual IV against a
  freshly-typed customer, confirmed the companion BI appeared with the correct reference/amount,
  confirmed the "แบบ Manual" badge and "—" job-number fallback render correctly, and confirmed issuing
  a receipt against the manual IV succeeds (exercising the `milestoneId` fix above). Confirmed the
  button does **not** appear on the BI/RE pages.

## Why this came up

The accounting department has already **purchased pre-printed multi-part NCR (carbonless copy)
continuous forms** and intends to print onto them using a **dot-matrix (impact) printer** — a hard
requirement, not a preference, since only mechanical impact transfers ink through the carbon layers
to the copies underneath (laser/inkjet only print the top sheet).

## Document types mentioned (owner, 2026-08-17)

Two separate lists were given in conversation — kept both verbatim since the second list adds a
document (ใบรับเงินมัดจำ) not in the first, and it's unclear yet whether these are the same 4-part
form restated or a slightly different/overlapping set:

**First mention:**
- ใบแจ้งหนี้ / ใบวางบิล (Invoice / Billing Note)
- สำเนาใบเสร็จรับเงิน (Receipt copy)
- สำเนาใบกำกับภาษี (Tax Invoice copy)
- ใบส่งสินค้า (Delivery Note)

**Second mention:**
- ใบรับเงินมัดจำ / ใบกำกับภาษี (Deposit Receipt / Tax Invoice)
- ใบแจ้งหนี้ / ใบวางบิล (Invoice / Billing Note)
- ใบเสร็จรับเงิน (Receipt)
- ใบกำกับภาษี / ใบส่งสินค้า (Tax Invoice / Delivery Note)

**~~Needs clarifying with accounting~~ — RESOLVED 2026-08-18**: the owner's follow-up confirmed the
set is exactly the second list's 4 documents; "ใบรับเงินมัดจำ/ใบกำกับภาษี" is one combined AR-numbered
document (the deposit-stage tax invoice), not a 5th document. See "2026-08-18 follow-up + Phase 1.5"
at the top of this file.

Of these, only **ใบส่งสินค้า** has any existing equivalent in the ERP today — the Delivery Order
module (`deliveryOrder`, see [DeliveryOrder.md](./DeliveryOrder.md)) — and even that prints its own
plain-paper layout today, not this NCR form. **Invoice/Billing Note, Receipt, Tax Invoice, and
Deposit Receipt have zero data model, workflow, or UI in the ERP.**

## Real business-process reference: "Flow งานบัญชี.(13.8.69).xlsx"

The owner dropped 3 reference files into `public/` (untracked, not committed — see below):
`Flow งานบัญชี.(13.8.69).xlsx` and two example billing-note PDFs (scanned images, couldn't be read
in this environment — no PDF renderer installed — but presumably useful later for the physical
print-position-calibration phase). The spreadsheet has 2 sheets, each a freeform flowchart (not a
data table) describing the company's actual real-world accounting process end to end. Summarized
below; **treat this as ground truth for how the business actually works**, more authoritative than
anything inferred from the document-type list alone.

### Sheet "บัญชีรับ" (Accounts Receivable)

**Actors, left to right**: ลูกค้า (Customer) → ฝ่ายขาย (Sales) → ฝ่ายผลิต (Production) →
**ฝ่ายโครงการ (Project department — the "Project" dept from the coordination-risk note)** →
ฝ่ายบัญชี/บัญชีรับ (Accounting/AR) → **โปรแกรมบัญชี "Express"** (a real third-party Thai accounting
software the company already uses — not something this ERP replaces, more likely something the new
Accounting module's data needs to end up compatible with or feed into eventually) → ฝ่ายการเงิน
(Finance) → Cloud data.

**Flow, condensed:**
1. Sales agrees product + price with customer (their own separate "Jubili" sales system was
   mentioned, not this ERP), sends to Accounting.
2. Accounting checks documents, checks the delivery/installment schedule (% split across
   installments), **keys the Scope of Work into "Cloud A"** — this is a direct reference to the
   ERP's *existing* Scope of Work module by name.
3. A billing-status lifecycle is tracked per job: **"ยังไม่ได้วางบิล" (not yet billed) → "วางบิล"
   (billed — deposit/first installment) → "งานยังไม่จบ" (work not done) → "จบ" (done)**.
4. Contracts/POs need documentation; service contracts over ฿1,000,000 require an
   อากรแสตมป์ (stamp duty) — ฿1 per ฿1,000 of contract value, either physical stamp or online
   filing with the Revenue Department depending on value. Some contracts require a bank guarantee
   (หนังสือค้ำประกัน), tracked and followed up for return once the guarantee period ends.
5. Production plans production/prepares materials (P1/P2/P3 = requisition codes for
   Sheet/Assembly/Steel), requests more via PR if short (PR.FAC code).
6. Project department plans installation/service, prepares goods (PR.PED code if short),
   **issues its own delivery note using an ISO-controlled form** ("ใบส่งมอบ2") once
   goods/materials are on-site.
7. **Each installment's billing is gated on a signed "ใบส่งมอบงาน" (Job/Work Delivery Note) —
   the customer signs it, the original goes to Accounting, and only then can the NEXT installment
   be billed.** This is the concrete mechanism behind the coordination-risk concern: the Project
   department's ใบส่งมอบงาน (being built by the other developer) is a hard *upstream dependency*
   for the Accounting module's per-installment billing trigger, not just a loosely related
   document.
8. Accounting issues, in order per installment: **AR** (ใบกำกับภาษีขาย / sales tax invoice, 4
   copies incl. original) → **BI** (ใบวางบิล / billing note, 2 copies incl. original) → once paid,
   **RE** (ใบเสร็จรับเงิน / receipt, 2 copies incl. original). Later installments' tax invoices use
   an **IV** number instead of AR. Deposit/down-payment tax invoices get their own numbering
   sequence, referenced in the flow as under the AR series ("เมื่อออกใบกำกับภาษีขาย Down payment
   ใส่เลขที่ AR…") — this is likely where "ใบรับเงินมัดจำ" from the second document list fits in,
   pending confirmation with accounting.
9. Retention money withheld by the customer (เงินประกันผลงาน), withholding tax
   (ภาษีหัก ณ ที่จ่าย), and bank transfer fees are all tracked and reconciled against bank
   statements ("เช็ค Statement กับสลิปโอนเงิน").
10. Up to (at least) 4 installments seen in the example flow, with one installment type gated on
    "Test run" completion by the Technical department before the delivery note can be issued.
11. Explicit notes at the end of the sheet: every customer's exact documentation requirements
    differ (always confirm with the customer's own accounting/purchasing dept before billing);
    some jobs need a Report attached to the billing packet; some customers pay by cheque and need
    coordination for out-of-area pickup; AR actively tracks Production/Project's plans to avoid
    missing a billing window; AR follows up customer payment for cash flow; Cloud status is kept
    updated throughout.

### Sheet "บัญชีจ่าย" (Accounts Payable)

**Actors**: Supplier/ผู้รับเหมา (Supplier/Contractor) → แผนกจัดซื้อ (Purchasing) →
ฝ่ายผลิต/คลังสินค้า (Production/Warehouse) → ฝ่ายโครงการ (Project) → ฝ่ายบัญชี/บัญชีจ่าย
(Accounting/AP) → โปรแกรมบัญชี Express → ฝ่ายการเงิน (Finance).

**Flow, condensed:**
1. Purchasing issues a PO to a supplier/contractor (with or without a deposit); for service
   contracts, stamp duty applies the same way as on the AR side.
2. Warehouse/Production receives goods, checks against PO + tax invoice, signs receipt, keys into
   the accounting system as **RR** (goods receipt), sends the full document set to AP.
3. Project department handles contractor payments for installation/service work — the supervising
   engineer signs the contractor's own **ใบส่งมอบงาน** (yes, the same document name/concept as the
   AR side, but here it's the *contractor's* proof of work delivered *to* the company, not the
   company's proof of work delivered to the customer) before it can be forwarded to AP.
4. AP checks document completeness, verifies against PO terms and amount, issues a withholding tax
   certificate if the payment is for services, then **accrues the payable ("ตั้งหนี้") under one of
   several transaction-type codes depending on document type and originating department**: RM
   (contractor payable), RD (shipping company payable), RI (goods-receipt document set), RO
   (general expenses — every department *except* Project), **RP (general expenses — Project
   department only, kept as a distinct code)**, RH (Technical department expenses), RX (factory
   expenses), BR (bill received in the accounting system), OE (misc. — employee advances, tax
   filings, social security, factory loan payments, external commissions, office rent).
5. **Fixed payment cycles** (worth preserving exactly, since a future scheduling/reminder feature
   would key off these): "รอบ Supplier" (Supplier round) — paid the 10th of every month; "รอบเงินสดย่อย"
   (petty cash round) — paid the 1st and 3rd Friday of every month; "รอบวันที่ 15" and
   "รอบวันที่ 30" — fixed-amount recurring expenses (advances, tax, social security, factory loan,
   commissions on the 15th; rent/cleaning/salaries at month-end). Document cutoff for a given
   payment round closes a few days before the round's actual pay date (e.g. close intake for
   the 3rd-Friday round on the 1st Friday).
6. Notes: e-Withholding Tax (Revenue Department online system) is used for some customers instead
   of physical withholding certificates; documents from any expense that's already been paid out of
   pocket by an employee get reimbursed via the OE flow; every document must carry a Job number and
   payer name written on it before entering the system.

## Data-model implications (not decided, just observations from the flow)

- **Job/installment as the real unit of billing** — not the whole Scope of Work at once.
  `ScopeOfWork` already has a payment-schedule/installment concept (see
  [ScopeOfWork.md](./ScopeOfWork.md)) that Delivery Order already reads per-installment
  (`deriveInstallmentsFromScope()`) — an Invoice/Billing Note module would very plausibly need to
  hang off the *same* per-installment structure, not duplicate it.
- **The "ใบส่งมอบงาน per installment, signed by customer, triggers next billing" gate** is a real
  workflow rule the software should probably enforce or at least surface, not just a paper-process
  convention — worth deciding whether the Accounting module blocks creating an installment's
  Invoice/Billing Note until that installment's Job Delivery Note exists and is marked
  customer-signed.
- **Numbering series matter and are already named**: AR/IV (tax invoice, by installment stage),
  BI (billing note), RE (receipt) on the AR side; RR/RM/RD/RI/RO/RP/RH/RX/BR/OE/AE-ish on the AP
  side. If this ERP's Accounting module ever needs to stay consistent with the existing "Express"
  accounting software's own numbering (unconfirmed whether that's a goal), these codes are the
  ground truth for what each transaction type is actually called internally.
- **Retention money, withholding tax, and bank-guarantee tracking** are real, separately-tracked
  follow-up items on the AR side — not just line items on an invoice, but their own
  needs-follow-up-until-resolved state (similar in shape to Scope of Work's existing "PO Chasing"
  follow-up pattern, see [ScopeOfWork.md](./ScopeOfWork.md) "PO Chasing").

## Open questions (for the accounting department, before any real scoping)

- Is ใบรับเงินมัดจำ a genuinely separate document from ใบเสร็จรับเงิน, or the same receipt concept
  applied specifically to a deposit/down-payment?
- Dot-matrix printer make/model, and whether it's already on hand or still being procured.
- Exact NCR form dimensions (continuous-feed width, likely ~9.5") and a measurement of each field's
  position on a real blank form, for the print-calibration phase.
- Should this module's numbering/data stay consistent with (or eventually integrate with) the
  existing "Express" accounting software, or is it meant to be fully independent record-keeping
  inside this ERP?
- Exact trigger conditions per document (does an Invoice/Billing Note require its installment's Job
  Delivery Note to exist first, as the paper process implies?).

## Coordination with the parallel "Project department" workstream

See the coordination-risk entry in [`../TODO.md`](../TODO.md) High Priority and the callout at the
top of [`../CLAUDE.md`](../CLAUDE.md). The Flow spreadsheet confirms this is a real, not
hypothetical, dependency: the Project department's **ใบส่งมอบงาน (Job/Work Delivery Note)** — one of
the 4 document types the other developer is building — is the direct upstream trigger for each
installment's billing on the Accounting side. Whoever builds each side needs to agree on the
document's shape/ID before either side hard-codes an assumption about it.

## Source files

`reference/accounting/Flow งานบัญชี.(13.8.69).xlsx`,
`reference/accounting/เอกสารวางบิล บจก.เค.ไทย ไฮดรอลิค งวดที่ 2 60__PO_KT.pdf`,
`reference/accounting/เอกสารวางบิล บจก.วีเอสเคม งวดที่ 2.2_70__POD326101972.pdf` — originally dropped
into `public/` by the owner (which is served as public static assets in production — a real
data-exposure risk since these contain real customer billing data), **moved to `reference/` on the
owner's instruction 2026-08-17** and added to `.gitignore` (`reference/`) so they can never end up
committed/deployed by accident. This doc is the durable, safe-to-commit summary of what's in them.

## Pages / Components / APIs / Permissions / Database Tables / Current Features

- **Pages** (`src/pages/accounting/`): `AccountingPage.tsx` (วางบิลตามงาน — job-centric issuing +
  deposit-billed column/banner + inline "ออกใบเสร็จ"), `ArDocumentListPage.tsx` (shared per-docType
  list page, mounted 4× from `App.tsx` as arDeposit/arBilling/arReceipt/arTaxInvoice with
  `key={docType}`), `ArMonthlyReportPage.tsx` (สรุปเอกสารประจำเดือน),
  `AccountingDashboardPage.tsx` + `AccountingDashboardCharts.tsx` (แดชบอร์ดบัญชี, 2026-08-18),
  `ArDocumentPrintDocument.tsx` (multi-copy print frame for all 4 doc types),
  `ArDocumentNcrPrintDocument.tsx` (data-only NCR print mode),
  `ArStockPanel.tsx` (dual-pane IV view/stock-cutting, 2026-08-18 — see "Stock" above).
- **APIs** (`api/_lib/arHandler.ts`, mounted from `api/handlers/quotes.ts`/`server/app.ts`):
  `/api/ar-milestones` (list/open/patch/refresh/attachments), `/api/ar-documents`
  (list w/ `scopeOfWorkId`/`status`/`docType`/`month` filters, issue AR-or-IV+BI, get one,
  `POST /:id/receipt`, `POST /:id/cancel`, `POST /:id/stock-deduction` — 2026-08-18),
  `/api/ar-dashboard` (KPI/trend/aging/funnel aggregation).
- **Permissions**: `ar:view` / `ar:create` / `ar:issue` / `ar:cancel` (unchanged since Phase 1 —
  Phase 1.5 added no permissions); `stock:adjust` gates the new stock-deduction route (2026-08-18,
  shared with the standalone Stock module — see [Product.md](./Product.md)/[RBAC.md](../RBAC.md)).
- **Collections**: `ar_milestones`, `ar_documents` (docType `AR|IV|BI|RE`, gained `stockDeducted`
  2026-08-18), `ar_attachment_files`, counters `ar_/iv_/bi_/re_{yy}{mm}`, plus the shared
  `stock_movements` ledger (2026-08-18, not Accounting-owned — see [Product.md](./Product.md)).
- **Domain lib**: `src/lib/accounting.ts`.

## Known Issues

- Receipt amount is always the tax invoice's full net total — no WHT/bank-fee reconciliation yet
  (deliberate Phase 2 scope, see the 2026-08-18 section above).
- The Phase 1 ">2 installments" issuing guard still applies (unchanged by Phase 1.5, now
  live-verified — see CHANGELOG.md 2026-08-18b).
- Print layout is verified for structure/content via emulation, not yet pixel-compared against the
  reference PDFs in `reference/accounting/` — do that before the NCR/dot-matrix phase.
