# Prompt: Accounting Document Pages (แยกหน้าเอกสารบัญชี 4 ประเภท + ใบเสร็จรับเงิน + แจ้งเตือนบิลมัดจำ + สรุปประจำเดือน)

> Self-authored implementation prompt, written per
> [`../ERP_CLAUDE_PROMPT_ENGINEERING_GUIDE.md`](../ERP_CLAUDE_PROMPT_ENGINEERING_GUIDE.md) from the
> owner's 2026-08-18 follow-up detail (the follow-up that unpauses the Accounting UI restructure
> paused 2026-08-17 — see [`../MODULES/Accounting.md`](../MODULES/Accounting.md) "UI structure —
> PAUSED"). The owner's raw input is quoted in §1–§2; everything else is derived from it plus the
> existing codebase.

You are working on an existing ERP application (TCS ERP — see `docs/CLAUDE.md` first).

Your task is to implement: **Accounting Document Pages — Phase 1.5**

## 1. Current Problem

Phase 1 of the Accounting (AR/milestone-billing) module shipped as a single job-centric page:
pick a Scope of Work → open an installment → checklist → issue AR/IV + BI together. Issued
documents are only visible embedded inside that job's detail view.

The owner rejected that information architecture, verbatim (2026-08-17): each accounting document
type must be its own separate page with its own browsable list, "เหมือนเอกสารของเซลล์"
(like the Sales modules — Quotation, Scope of Work, Delivery Order each have a dedicated sidebar
page). Confirmed again 2026-08-18: "1 ใบคือ 1 หน้า...เหมือนเอกสารของเซลล์ที่จัดการได้ก่อนหน้านี้"
— the restructure is now unpaused.

Additionally, the accounting department named two pain points with their current "Express"
accounting software that this module must solve:

1. No alert for whether a given job already has its deposit bill issued
   ("ให้มีการแจ้งเตือนทุกครั้งว่างานนั้นๆ มีการออกบิลมัดจำไปแล้วหรือยัง").
2. No monthly pull of "which document numbers were issued this month, for which company, on which
   date, how many in total, what grand total" for tax-filing checks
   ("เพื่อในการตรวจเช็คเวลาส่งยื่นภาษี").

Finally, the confirmed document set includes **ใบเสร็จรับเงิน (Receipt)**, which has no data model,
numbering, issuing flow, or UI at all in Phase 1 (only AR/IV/BI exist).

## 2. Business Requirement

The owner's stated AR flow (2026-08-18, ground truth — supersedes ambiguity in earlier notes):

- **งานมีเงิน Down Payment**: after Sales' Scope of Work arrives, Accounting issues, in order:
  ใบรับเงินมัดจำ/ใบกำกับภาษี (AR) → ใบเสร็จรับเงิน (RE) → ใบแจ้งหนี้/ใบวางบิล (BI).
- **งานฝ่ายผลิต**: Production issues its ใบส่งมอบงาน (SO), customer signs and returns it, then
  Accounting issues: ใบกำกับภาษี/ใบส่งสินค้า (IV) → ใบเสร็จรับเงิน (RE) → ใบแจ้งหนี้/ใบวางบิล (BI).
- **งานฝ่ายโครงการ**: Project pulls the ใบส่งมอบงาน from Sales, customer signs and returns it, then
  the same IV → RE → BI sequence.

The confirmed 4 document types (each = its own page):

1. ใบรับเงินมัดจำ / ใบกำกับภาษี (deposit receipt / tax invoice — numbering prefix **AR**)
2. ใบแจ้งหนี้ / ใบวางบิล (invoice / billing note — prefix **BI**)
3. ใบเสร็จรับเงิน (receipt — prefix **RE**, new)
4. ใบกำกับภาษี / ใบส่งสินค้า (tax invoice / delivery note — prefix **IV**)

Accounting staff need to browse/search/print/cancel each document type independently, be warned
about deposit-billing status on every job, and reconcile a month's documents when filing VAT.

## 3. Users

- **Accounting users** (`accounting_user` default role): full `ar:view/create/issue/cancel`.
- Any custom role holding a subset of `ar:*` — pages must degrade correctly (view-only without
  issue/cancel buttons).
- Sales/other departments: no access unless granted `ar:view`.

## 4. Scope

### In Scope
- New document type **RE (ใบเสร็จรับเงิน)** end-to-end: type unions, `RE{YY}{MM}{SEQ}` Buddhist-year
  atomic numbering (reusing `nextArDocNumber`), issue endpoint (from an issued AR/IV, duplicate-
  guarded), print layout (2 copies: ต้นฉบับ/สำเนา 1), milestone lifecycle effect (non-deposit
  milestone → "closed"/จบ on receipt; reopened if the receipt is cancelled).
- **4 per-document-type sidebar pages** under the "บัญชี" nav group, one per document type, matching
  the Sales-module list-page pattern (summary cards, search, filters, table, actions). One shared
  component parameterized by `docType` — not 4 copies.
- **Deposit-billed alert**: a "บิลมัดจำ" column (ออกแล้ว + เลขที่ / ยังไม่ออก) on the job list of the
  existing job-centric page, plus a green/amber banner in the job's detail view.
- **Monthly summary page** ("สรุปเอกสารประจำเดือน"): month picker → all documents issued that month,
  grouped per type, each row = docNo/date/company/value/VAT/net/status, per-type counts and sums,
  a tax-invoice (AR+IV) grand-total card (pre-VAT / VAT / net, excluding cancelled), printable.
- `GET /api/ar-documents` gains `docType` and `month` query filters (server-side, validated).
- Document display names updated everywhere to the owner's exact names (list above).
- i18n nav keys (Thai + English), What's New entry (Thai), docs + tests per the standing rule.

### Out of Scope
- Changing the issuing mechanism (still job-centric: AR/IV + BI issue together from a milestone —
  the restructure is about *browsing*, not issuing; the API is already structure-agnostic).
- The ใบส่งมอบงาน (Job Delivery Note) gate on billing — blocked on the parallel Project-department
  workstream (see the coordination note in `docs/CLAUDE.md`); the checklist item stands in for it.
- NCR/dot-matrix print calibration (needs physical form measurements — still an open question).
- Accounts Payable (บัญชีจ่าย) entirely.
- Support for >2-installment billing math (Phase 1 guard stays).
- Editing issued documents (issue/cancel only, per the never-delete rule).

## 5. Existing System Investigation (done before coding — findings)

- Backend: `api/_lib/arHandler.ts` (mounted from `api/handlers/quotes.ts`, `server/app.ts`,
  `vercel.json` — `/api/ar-documents` subpaths need no new mounting), `api/_lib/documentNumbering.ts`
  (atomic Buddhist-year counters), `api/_lib/collections.ts` (`ArDocumentFields`, never-delete rule).
- Frontend: `src/lib/accounting.ts` (domain lib), `src/pages/accounting/AccountingPage.tsx`
  (job-centric page), `ArDocumentPrintDocument.tsx` (multi-copy print frame, reusable for RE as-is).
- Pattern to copy: `src/pages/deliveryOrder/DeliveryOrderPage.tsx` + `DeliveryOrderList.tsx`
  (standalone list page: summary cards, search, filter pills, table styling).
- Reusable components: `EmptyState`, `PromptDialog` (cancel reason), `ConfirmDialog` (receipt
  confirmation), `Toast`/`useToast`.
- RBAC: 4 existing `ar:*` permissions suffice — **no new permissions, no RBAC migration needed**.
- Nav: `App.tsx` NavKey/navItems/NAV_GROUPS/NAV_LABEL_KEYS + lazy page imports; labels via i18n.

## 6. Required Behavior

- Sidebar group "บัญชี" (order per the owner's list): วางบิลตามงาน (existing page, retitled) →
  ใบรับเงินมัดจำ/ใบกำกับภาษี → ใบแจ้งหนี้/ใบวางบิล → ใบเสร็จรับเงิน → ใบกำกับภาษี/ใบส่งสินค้า →
  สรุปเอกสารประจำเดือน. All gated on `ar:view`.
- Each document page: search (docNo/customer/scope no.), month filter, status filter
  (ทั้งหมด/ใช้งาน/ยกเลิกแล้ว), summary cards (ทั้งหมด, ออกเดือนนี้, ยอดรวมเดือนนี้, ยกเลิกแล้ว),
  table rows with print + cancel actions.
- AR/IV pages additionally show receipt linkage per row (เลขที่ RE หรือ "ยังไม่ออก") and an
  "ออกใบเสร็จ" button (`ar:issue`) on issued, not-yet-receipted rows — confirm dialog states the
  invoice number and amount and that it must only be issued once payment is received.
- RE page shows the referenced tax-invoice number per row.
- Receipt issuing is also available inline in the job detail's issued-documents list.
- Cancel requires a reason (PromptDialog) → `ar:cancel`; cancelled docs stay visible, struck from
  totals.
- Deposit alert: job list column + per-job banner as in §4.
- Monthly page defaults to the current month; totals always exclude cancelled documents and say so.

## 7. UI/UX Requirements

Match the existing design system exactly (navy/gold, Playfair/Inter/JetBrains Mono, table/card/
filter-pill patterns copied from `DeliveryOrderList.tsx` — see `docs/UI_GUIDELINES.md`). Thai UI.
Every page: loading skeleton, empty state (with guidance on where documents come from), error state
with retry, success toasts. Tables horizontally scrollable on small screens (`overflow-x-auto`).
Print views: unchanged multi-copy A4 pattern; monthly summary printable via `window.print()` with
non-print chrome hidden.

## 8. Database Requirements

No new collections. `ar_documents.docType` union gains `"RE"`. RE rows reuse `ArDocumentFields`
verbatim: `reference` = tax-invoice docNo, one line with `linkedArDocumentId` = tax-invoice `_id`
(the duplicate-guard key), `vatRate: 0`/`vatAmount: 0` (VAT liability lives on the tax invoice),
`netTotal` = invoice's VAT-inclusive net, `amountTextTh` via existing `bahtText()`. Counter key
`re_{yy}{mm}` in the existing `counters` collection.

## 9. API Requirements

- `POST /api/ar-documents/:id/receipt` — `ar:issue`; 400 if target is not AR/IV, is cancelled, or
  already has an active RE; writes an audit entry; returns the new document.
- `GET /api/ar-documents?docType=AR|IV|BI|RE&month=YYYY-MM` — `ar:view`; both filters validated
  (400 on bad values), combinable with existing `scopeOfWorkId`/`status`.
- Cancel route (existing): additionally reopens a non-deposit milestone ("closed" → "work_open")
  when the cancelled document is its RE.

## 10. RBAC / Permissions

Existing only: `ar:view` (all 6 pages), `ar:issue` (receipt buttons), `ar:cancel` (cancel buttons),
`ar:create` (unchanged, job-page checklist). All enforced server-side via `requirePermission()`;
UI hides what the role can't do.

## 11. Validation

Server: receipt preconditions (§9), month format `^\d{4}-\d{2}$`, docType whitelist, cancel reason
required. Client: cancel-reason required in dialog, receipt behind an explicit confirm.

## 12. Loading / Empty / Error States

Per §7 — all three per page, plus toast on every failed action with the server's Thai message
(`ApiError`).

## 13. PDF / Export

RE print: 2 copies (ต้นฉบับ/สำเนา 1) in the shared `ArDocumentPrintDocument` frame, title
"ใบเสร็จรับเงิน / RECEIPT". Doc titles for AR/IV/BI updated to the owner's exact combined names.
Monthly summary: browser-print of the on-screen table. (Real NCR calibration remains out of scope.)

## 14. External Integrations

None (no LINE/email in this task).

## 15. Security

Session + permission gated as everywhere else; no new public routes; cancelled/issued documents
immutable (no delete anywhere); audit entries for receipt issue and cancel.

## 16. Technical Constraints

- No fake/hardcoded production data; everything from MongoDB via the existing REST patterns.
- Reuse existing architecture (shared list component; no new deps; no router changes beyond nav).
- Do not modify unrelated modules; do not touch the >2-installment guard or issuing math.
- `src/lib/accounting.ts` is not API-bundle-reachable, but keep it JSX-free per the standing rule.

## 17. Testing

- Extend `tests/api/arNumbering.test.ts` to cover the RE prefix.
- Full gate: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm test` — all clean.
- Manual (documented as pending if not this session): live-issue an RE against the primed local
  Scope of Work `PQ202608-01-LI-SK`, verify the deposit banner + monthly summary against it.

## 18. Definition of Done

- 4 document pages + monthly page + retitled job page all reachable from the sidebar per role.
- RE issuable exactly once per active tax invoice; milestone closes/reopens correctly.
- Deposit alert visible in both the job list and job detail.
- Monthly summary answers the owner's exact question (doc numbers, company, dates, count, totals)
  with cancelled documents excluded from totals.
- All 4 checks in §17 pass; docs updated per the standing rule (CHANGELOG, PROJECT_STATUS, TODO,
  SESSION_LOG, API.md, DATABASE.md, MODULES/Accounting.md, docs/CLAUDE.md table); Thai What's New
  entry added; no commit (auto-commits paused by owner 2026-08-17).
