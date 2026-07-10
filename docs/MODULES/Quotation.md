# Module: Quotation

## Purpose

Create, edit, duplicate, and print professional quotation documents for customers, with line items that can carry detailed notes and unlimited sub-details (scope of work, warranty terms, install steps, etc.) — the core "real business use" feature requested for this module.

## Business Flow

1. **List view** (`QuoteList.tsx`): browse all quotes, filter by status (all 9 values — see Approval Workflow below), see summary cards (total, pending, approved, interested), mark customer interest (👍/👎) inline.
2. **Create**: "สร้างใบเสนอราคา" → blank document with a 3-line example template (two of which have sample notes/sub-details pre-filled to demonstrate the feature) → fill in client name, line items → "บันทึกร่าง" (save, always as Draft — the old "pick a starting status" segmented control was removed 2026-07-08 in favor of always starting at Draft and moving forward through the real workflow).
3. **Edit existing**: click a row in the list → opens the same document view in "detail" mode, pre-loaded with that quote's actual saved `lines`/`discount`/`status`/`client`/`approvalHistory` (see Known Issues history in [CHANGELOG.md](../CHANGELOG.md) — Save/Duplicate used to be broken).
4. **Line items**: add manually ("เพิ่มรายการเอง") or pick from the Product Library ("เลือกจากคลังสินค้า", opens `ProductPickerModal` from the Product module) — picking a product **copies** its name/unit/price into a new line; the line is then a fully independent, editable record (see [Product.md](./Product.md) for the snapshot guarantee).
5. **Per-item notes, sub-details, tags & specifications**: click the sticky-note icon on a line row to expand a panel with (a) a notes textarea + bullet/numbered-list toolbar buttons, (b) an unlimited list of sub-details, each addable/editable/deletable/drag-reorderable via a grip handle, (c) a specifications textarea (distinct from notes — auto-copied from `Product.specifications` when the line came from the product picker), (d) a tags chip input. A gold dot on the collapsed icon indicates the line has content.
6. **Duplicate**: "คัดลอก" (detail view only) clones the open quote into a new draft with a fresh ID, fresh line/sub-detail IDs, a fresh `createdByUserId` (the duplicating user), and an empty `approvalHistory` (no shared references with the original).
7. **Document fields**: client name, contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms, and salesperson are all real, controlled, per-quote fields (not hardcoded placeholder text — fixed 2026-07-08). Salesperson defaults to the signed-in user's name on a new quote. Fields are only editable (`disabled={!permissions.canEdit}` on each input) when `computeQuotePermissions()` grants edit rights for the current status/user — see Approval Workflow below.
7a. **Job Type, Potential Opportunity, Follow-up Date** (added 2026-07-10, for the Executive Dashboard/CRM pass): every quote carries a `jobTypeCode`/`jobTypeName` (picked from the Job Type master list — `src/lib/jobTypes.ts`, `GET/POST/PATCH /api/jobtypes`, 13 seeded defaults: TA/STA/LI/SC/BF/GA/BI/VT/WTP/OTHER TA/OTHER SC/OTHER BF/OTHER — snapshotted at save time, same non-live-reference rationale as the Product picker), an `isPotentialOpportunity` checkbox ("sales thinks this is likely to close" — feeds the Dashboard's Expected Sales KPI/forecast, literally `isPotentialOpportunity = true` with no other condition, per the business spec), and a `followUpDate` (feeds the Dashboard's Today/Overdue/Upcoming follow-up reminders). All three are shown/edited in the same meta-fields grid as Payment Terms, filterable/searchable in the list view (Job Type dropdown filter + column, Potential Opportunity summary card), and printed on the PDF (`ประเภทงาน` field, auto-hidden if unclassified — Potential Opportunity/Follow-up Date are internal-only, not printed on the customer-facing document). **Job Type is required on every new quote as of 2026-07-10 (Codex review fix)**: the create form no longer offers a blank "unclassified" choice (a disabled placeholder is shown until a real selection is made), and `POST /api/quotes` rejects a missing/blank `jobTypeCode` server-side, matching a valid `job_types` master record (`jobTypeName` is always re-derived from that record, never trusted from the client). Editing an *existing* quote still tolerates a blank Job Type (legacy data predating this field) — only a non-blank value is validated for membership, so an unrelated field edit on an old unclassified quote isn't blocked.
8. **Print/PDF**: "พิมพ์ / PDF" calls `window.print()`. The printed document (`src/pages/quotation/PrintDocument.tsx`, added 2026-07-09, modeled on a real customer-facing quotation template) is a single `<table>` with a repeating `<thead>` — the company header (logo, name, address, tax ID), the blue "QUOTATION" ribbon, the full "ผู้ซื้อ" (buyer) block, the "ใบเสนอราคา" meta block (quote number/dates/payment terms/salesperson), and the item-table column headers all re-render on every printed page automatically via the browser's native thead-repeat behavior — verified via a forced 2-page print (see [CHANGELOG.md](../CHANGELOG.md)). Each line shows unit price and **per-unit discount (amount + %)** as separate columns, with notes/sub-details/specifications/tags indented beneath (sub-details as a pin-icon bullet list). Totals include a **Thai-words amount line** under the grand total (`bahtText()`, see [DATABASE.md](../DATABASE.md)). A three-column signature table (ผู้เสนอราคา / ผู้อนุมัติใบเสนอราคา / ผู้ยืนยันการสั่งซื้อ) closes the document — the third (customer PO confirmation) column has no backing data and is always blank for hand-signing. **Any document field left empty is automatically omitted from the printed output** rather than printing a blank row (see [UI_GUIDELINES.md](../UI_GUIDELINES.md) Print/PDF section). Known simplification: the repeating header is identical on every page (the reference design this was modeled on shrinks it on continuation pages); browser print has no reliable way to vary `<thead>` content by page number, so a fuller, consistent header was kept on all pages instead. Page numbers ("Page X/Y") are also omitted — browser print/PDF has no supported way to read total page count from CSS.

## Approval Workflow (added 2026-07-08 — see [RBAC.md](../RBAC.md) for the full model)

`QuoteStatus` has 9 values: **Draft** (ร่าง) → **Pending Approval** (รออนุมัติ) → **Approved** (อนุมัติแล้ว) → **Sent to Customer** (ส่งให้ลูกค้าแล้ว) → **Customer Accepted** (ลูกค้ายอมรับ) → **Won** (ปิดการขายสำเร็จ), or **Customer Rejected** (ลูกค้าปฏิเสธ) → **Lost** (เสียโอกาส); plus a standalone **Cancelled** (ยกเลิก) reachable from Draft/Pending/Approved. Toolbar action buttons (Submit/Approve/Reject/Send to Customer/Customer Accepted/Customer Rejected/Won/Lost/Cancel) are rendered only when `computeQuotePermissions()` grants them — combining the signed-in user's RBAC permission (`quotations:create/edit/approve/reject/delete`) with **ownership** (`quote.createdByUserId === currentUser.id`, with approvers/admins able to act on quotes they don't own). Reject/Customer-Reject/Cancel open a modal requiring a comment; other transitions allow an optional one. Every transition appends an `ApprovalHistoryEntry` (never removed) rendered as "ประวัติการอนุมัติ" beneath the document, and fires the relevant role-based notification (see [Notifications.md](./Notifications.md)). **Known simplification**: Approver Level 1 and Level 2 are not sequenced — either can approve/reject independently from Pending Approval; there is no enforced two-stage gate.

## Signature Integration

The preparer's signature is looked up via `quote.createdByUserId`; the approver's via the most recent `"approved"` entry in `approvalHistory`. Both render as an `<img>` (the user's `signatureDataUrl`, uploaded in Settings → Profile) on the document's signature block, falling back to the original blank signature line if the user hasn't uploaded one — never an error.

## Pages

- `src/pages/quotation/QuotationPage.tsx` — top-level container: view-switching (`list`/`new`/`detail`), owns the toast, computes per-quote permissions (`computeQuotePermissions`), wires Save/Duplicate/interest-change/workflow-action callbacks, builds and dispatches notifications and audit entries per transition.
- `src/pages/quotation/QuoteList.tsx` — list view, filter tabs for all 9 statuses.
- `src/pages/quotation/QuoteDocument.tsx` — create/edit document view: toolbar (print/duplicate/save/workflow actions), document header (with logo), client/meta fields (controlled, real per-quote data, disabled when the user lacks edit rights, + a parallel print-only auto-hide-if-empty rendering via the local `PrintRow` helper), approval-history panel, remarks/signature blocks (with stamp + signature images), and the reject/reason comment modal.
- `src/pages/quotation/LineItemsEditor.tsx` — the line-items table, notes editor, sub-details editor (drag-reorder), specifications editor, tags editor, product picker trigger, totals, and the print-only static rendering.
- `src/pages/quotation/InterestButtons.tsx` — shared 👍/👎 toggle, used in both list and document views.
- `src/pages/quotation/notesFormat.tsx` — `<FormattedNotes>`: parses `• `/`1. ` prefixed lines into `<ul>`/`<ol>`, used by the print-only rendering.
- `src/pages/quotation/PrintDocument.tsx` (added 2026-07-09) — the entire printed/PDF document: repeating header (company + buyer + quote meta + column headers via `<thead>`), item rows with per-unit discount and pin-icon sub-detail bullets, totals with Thai-words amount, notes/condition, and the three-column signature table. Fully separate from the on-screen editing components — `QuoteDocument`/`LineItemsEditor` are `print:hidden` and only used for editing.

## Components

`InterestButtons`, `FormattedNotes` (above) plus generic `ConfirmDialog`/`Toast` from `src/components/`.

## Database Tables

The `quotes` MongoDB collection (see [DATABASE.md](../DATABASE.md) for the `Quote`/`QuoteLine`/`SubDetail`/`ApprovalHistoryEntry` shapes) — keyed by the human-readable business ID (e.g. `"QT-2567-0041"`) as the literal MongoDB `_id`, not an `ObjectId`. Migrated 2026-07-09 from `localStorage` (`tcs_erp_quotes`, fixed 2026-07-08) to real server-side persistence. The `job_types` collection (added 2026-07-10, see [DATABASE.md](../DATABASE.md) "`JobType`") backs the Job Type dropdown.

## APIs

`GET/POST /api/quotes`, `PATCH /api/quotes/:id`, `POST /api/quotes/:id/duplicate`, `POST /api/quotes/:id/workflow` — see [API.md](../API.md) Quotations section for the full route table, auth requirements, and server-side ownership/workflow validation. `GET/POST/PATCH /api/jobtypes` (added 2026-07-10) — see [API.md](../API.md) Job Types section.

## Permissions

Client-side RBAC (see [RBAC.md](../RBAC.md)) via `computeQuotePermissions(quote, isNew, currentUser, roles)`: combines `quotations:view/create/edit/delete/approve/reject/export` with ownership (`quote.createdByUserId`). Sales roles can create/edit/submit their own quotes but not approve; approver roles can view/edit/approve/reject any quote; only users with `quotations:delete` can cancel.

## Current Features

- List with status filter (all 9 statuses) + summary cards
- Full create/edit/duplicate flow, persisted to MongoDB via a real REST API (server-enforced permission + ownership checks on every mutation, see [API.md](../API.md))
- Line items: description/unit/qty/price/discount, auto-computed subtotal
- Quote-level discount % + 7% VAT, full totals breakdown
- Per-line notes (multi-line, bullet/numbered formatting), unlimited sub-details (add/edit/delete/drag-reorder), specifications, and tags
- Product Library picker for line items (copies name/unit/price/specifications), with independent-snapshot guarantee
- Real per-quote document fields (contact/phone/address/tax ID/PO ref/dates/payment terms/salesperson) — no hardcoded placeholder text
- **9-status approval workflow** with permission+ownership-gated action buttons, required-comment modal for rejections/cancellation, and an append-only approval-history panel
- **Signature-image integration** — preparer/approver signatures render automatically from the uploaded `User.signatureDataUrl`, falling back to a blank line
- **Role-based notifications** fired on every workflow transition (see [Notifications.md](./Notifications.md))
- Print/PDF export via a dedicated repeating-header document (`PrintDocument.tsx`) matching a real customer-facing quotation layout: company/buyer/meta header repeats on every page, per-unit discount column, pin-icon sub-details, Thai-words total, three-column signature block, auto-hidden empty fields
- Buyer contact email, delivery method/address, and project fields (real per-quote data, auto-hidden in print when empty)
- Customer interest tracking (👍/👎), reflected on Dashboard
- **Job Type classification** (added 2026-07-10) — dropdown from a 13-entry master list, searchable/filterable in the list view, printed on the PDF, feeds the Dashboard's Job Type Analytics
- **Potential Opportunity checkbox** (added 2026-07-10) — sales-marked "likely to close," feeds the Dashboard's Expected Sales KPI/forecast
- **Follow-up Date field** (added 2026-07-10) — feeds the Dashboard's Today/Overdue/Upcoming follow-up reminders; clicking a reminder opens the quotation list pre-filtered to that customer

## Future Improvements

- Wire `Company.vatRate` into the VAT calculation (currently `computeTotals()` still uses the fixed `VAT_RATE` constant)
- Replace the client free-text field with a real Customer reference once [Customer.md](./Customer.md) exists
- Sequential two-level approval (Approver Level 1 must approve before Level 2) — currently both approver roles have independent rights; see [RBAC.md](../RBAC.md) Known Simplifications
- ~~Notification clicks still only navigate to the quotation list, not a specific quote's detail view~~ — **fixed 2026-07-10** (Codex review pass): a `quotationDeepLinkId` (separate from the pre-existing `quotationListFilter` used by the Dashboard's pipeline/follow-up click-through) is now lifted to `App.tsx` and consumed by `QuotationPage`, which switches straight to that quote's detail view. See [Notifications.md](./Notifications.md).
- ~~Auto quotation numbering... needs a real sequence once multi-user/backend exists~~ — **fixed 2026-07-10** (Codex review pass): `nextQuoteId()` now reserves numbers atomically via a `counters` MongoDB collection (`findOneAndUpdate` with `$inc`, upsert), replacing the previous scan-all-quotes-then-max+1 approach that could race two concurrent creates into the same id. See [DATABASE.md](../DATABASE.md).
- Real PDF generation (server-side) if browser print-to-PDF proves insufficient for production use

## Known Issues

- **[Fixed 2026-07-08]** Save/Duplicate/Send used to be completely non-functional because `Quote` had no `lines` field — see [CHANGELOG.md](../CHANGELOG.md) for the full root-cause writeup. Verified fixed via scripted browser testing.
- **[Fixed 2026-07-08]** Contact person/phone/address/tax ID/salesperson document fields used to show hardcoded example values regardless of which quote was open — see [CHANGELOG.md](../CHANGELOG.md) "Quotation PDF polish" entry.
- **[Fixed 2026-07-08]** The status badge/toolbar froze at whatever value it had when the document was first opened, because it lived in local `useState` that didn't re-derive when a workflow transition changed `quote.status` without remounting the component. Fixed by deriving `quoteStatus` from the `quote` prop directly. See [CHANGELOG.md](../CHANGELOG.md).
- **[Fixed 2026-07-08]** Quotes previously reset to seed data on every reload (in-memory only) — now persisted to `localStorage`.
- **[Fixed 2026-07-09]** The "หมายเหตุ / เงื่อนไข" (remarks) textarea was `defaultValue`-only (uncontrolled) — any edit was silently lost on save and reset to the company default on every reopen. Fixed by adding a real `Quote.remarks` field, wired through `save()` like every other document field.
