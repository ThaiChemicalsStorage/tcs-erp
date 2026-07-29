# Module: Quotation

## Purpose

Create, edit, duplicate, and print professional quotation documents for customers, with line items that can carry unlimited sub-details (scope of work, warranty terms, install steps, etc.) and tags — the core "real business use" feature requested for this module. **2026-07-21**: per-line Notes and Specifications were removed entirely (see item 5 below) — sub-details/tags are now the only per-line "extra content" mechanism.

## Business Flow

1. **List view** (`QuoteList.tsx`): browse all quotes, filter by status (all 9 values — see Approval Workflow below), see summary cards (total, pending, approved, interested), mark customer interest (👍/👎) inline. **Search (added 2026-07-22)**: a text search box matches No./Client/Salesperson/PO No. (case-insensitive substring, any field), purely client-side over the already-fetched list, same as the existing status/Job Type/client-chip filters. **Salesperson filter (added 2026-07-22)**: a dropdown next to the Job Type filter, listing whichever salesperson names actually appear in the fetched `quotes` (not a separate master list — `salesperson` is a free-text snapshot, same as everywhere else it's used); purely client-side, same pattern as every other filter here. **Own-quotes-only viewing (added 2026-07-22, see [RBAC.md](../RBAC.md) "Quotation Own-Quotes-Only Viewing")**: what actually populates `quotes` (and therefore this whole list/search/filter set) now depends on a new `quotations:viewAll` permission — a caller without it only ever receives their own quotations from the server (`GET /api/quotes`), so the Salesperson filter naturally narrows to just themselves in that case, with no separate client-side gating needed. **Revision count summary card (added 2026-07-22)**: a 6th summary card, "ใบแก้ไข"/"Revisions", counts how many quotes in the list are themselves a rewrite (`isRevisionQuote(id)` in `src/lib/quotes.tsx`, a client-side `-R\d+$` id-suffix check mirroring the server-authoritative one in `api/_lib/quoteRevisions.ts`) — purely a display convenience, no new data fetched.
2. **Create**: "สร้างใบเสนอราคา" → blank document with a 3-line example template (two of which have sample sub-details pre-filled to demonstrate the feature) → fill in client name, line items → "บันทึกร่าง" (save, always as Draft — the old "pick a starting status" segmented control was removed 2026-07-08 in favor of always starting at Draft and moving forward through the real workflow).
3. **Edit existing**: click a row in the list → opens the same document view in "detail" mode, pre-loaded with that quote's actual saved `lines`/`discount`/`status`/`client`/`approvalHistory` (see Known Issues history in [CHANGELOG.md](../CHANGELOG.md) — Save/Duplicate used to be broken).
4. **Line items**: add manually ("เพิ่มรายการเอง") or pick from the Product Library ("เลือกจากคลังสินค้า", opens `ProductPickerModal` from the Product module) — picking a product **copies** its name/unit/price into a new line; the line is then a fully independent, editable record (see [Product.md](./Product.md) for the snapshot guarantee).
5. **Per-item sub-details & tags**: sub-details live directly in the table (restyled 2026-07-21, see below) — click the Pin icon on a line row to append a new "pinned" row directly beneath it (gold-tinted highlight, Pin icon, auto-focused input), addable/editable/deletable/drag-reorderable via a grip handle, no card to open. Picking a product from the catalog, or applying a Quotation Template, seeds this same list — a product's `specifications` text, or a template item's specification lines, becomes an initial pinned sub-detail row instead of being lost (see below). Tags remain behind the separate sticky-note icon, which expands a small panel with just a tags chip input. Each of the two icons carries its own gold dot/fill when its own category of content is non-empty (Pin for sub-details, sticky-note for tags) — independent of each other, and independent of the other icon's expand/collapsed state. **2026-07-21, Notes/Specifications removed**: per direct user request ("เอาหมายเหตุ ข้อกำหนดเฉพาะ เอาออกไปเลยส่วนนั้นไม่ใช้แล้ว" — remove Notes/Specifications, unused), the `QuoteLine.notes`/`.specifications` fields and their editors (a notes textarea with bullet/numbered-list toolbar buttons, a separate specifications textarea) were removed entirely — from the data model, the editor UI, print output, server-side validation, and the Scope of Work snapshot mapping. This was **not** a simple UI hide: `applyTemplate.ts`'s template-item specifications and the product-picker's `Product.specifications` copy both used to land in the now-removed `QuoteLine.specifications` field, so both were remapped to fold into `subDetails` instead (each spec line becomes its own pinned sub-detail row) — preserving that customer-visible content rather than silently dropping it. `ScopeOfWorkItem.remark` (a separate, independent field in the Scope of Work module, itself unaffected) now starts blank instead of seeding from the removed `line.notes` when a Scope of Work is generated from a quotation — see [ScopeOfWork.md](./ScopeOfWork.md) "Item layout." Old quotations already saved with `notes`/`specifications` text in MongoDB keep that data in the raw document (no migration/deletion ran) but it's no longer surfaced anywhere in the app — an accepted, explicitly confirmed tradeoff, not an oversight.
6. **Duplicate**: "คัดลอก" (detail view only) clones the open quote into a new draft with a fresh ID, fresh line/sub-detail IDs, a fresh `createdByUserId` (the duplicating user), and an empty `approvalHistory` (no shared references with the original).
6a. **Rewrite/Revision (added 2026-07-22)**: "แก้ไข"/"Rewrite" (detail view only, same
`quotations:create`-gated visibility as Duplicate, right next to it in the toolbar) clones the open
quote exactly like Duplicate — fresh line/sub-detail IDs, status reset to Draft, fresh
`createdByUserId`, empty `approvalHistory`, source quote never modified — but assigns a
**revision-numbered id derived from the quote being rewritten** instead of an unrelated new sequence
number: `{root}-R{n}`, e.g. rewriting `QT-2567-0041` creates `QT-2567-0041-R1`; rewriting that `-R1`
creates `-R2`, never `-R1-R1` (the root is always found by stripping any existing trailing
`-R<digits>` suffix off the id actually being rewritten, before reserving the next number). The
revision number is reserved atomically server-side (`POST /api/quotes/:id/rewrite`,
`handleRewrite()`) via the same `counters` collection pattern `nextQuoteId()` already uses — see
[API.md](../API.md) and [DATABASE.md](../DATABASE.md). No new field tracks the parent/revision
relationship on `Quote` itself; it's encoded entirely in the new id string. Clicking the button
navigates straight to the newly created revision (same `key`-remount-on-`selectedId`-change pattern
Duplicate already uses — no new page/route). The button disables itself for the duration of the
request to guard against a rapid double-click creating two revisions.
6b. **Revision Note (added 2026-07-23)**: a revision (any quote whose id ends in `-R<digits>`)
gains a new "หมายเหตุการแก้ไข (Revision Note)" card with a "สร้างสรุปการแก้ไขอัตโนมัติ" button —
per direct user request ("อยากได้แบบ Comment auto...ว่าแก้ตรงไหนไปสามารถทำได้ไหม...ให้ตรวจดูว่า
แก้ตรงไหนไปละเป็นข้อความ auto ไปก่อนละค่อยแบบถ้าผู้ใช้อยากเพิ่มหรืออยากแก้ก็สามารถแก้เองได้"). Clicking
it compares the live on-screen draft against the record this revision was rewritten from (its
immediate predecessor, not necessarily the chain's root — `getRevisionPredecessorId()` in the new
`src/lib/revisionDiff.ts`, already available client-side without a fetch since every quote this
user can see is already loaded app-wide) and fills the note's `<textarea>` with a Thai bullet-list
summary of every changed field, generated by `generateQuoteRevisionSummary()` — client name,
project, address, tax ID, contact info, delivery method/address, PO ref, payment terms, issue/
expiry dates, salesperson, Job Type, discount, Potential Opportunity, follow-up date, remarks,
linked-customer changes, and a line-by-line diff of `lines` (added/removed/changed rows, matched by
array position — line ids are regenerated on every Rewrite, so an id-based match would falsely
report every line as both removed and added). **Explicitly one-shot, never automatic**: the button
only fires when clicked, so it can never silently overwrite a note the user has already started
editing — the generated text is just a starting draft dropped into the same freely-editable
textarea, exactly like any other field. New `Quote.revisionNote: string` field, always blank on a
brand-new quote/Duplicate/fresh Rewrite (never inherited from the source). See
[ScopeOfWork.md](./ScopeOfWork.md) "Revision Note" for the identical feature there.
7. **Document fields**: client name, contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms, and salesperson are all real, controlled, per-quote fields (not hardcoded placeholder text — fixed 2026-07-08). Salesperson defaults to the signed-in user's name on a new quote. Fields are only editable (`disabled={!permissions.canEdit}` on each input) when `computeQuotePermissions()` grants edit rights for the current status/user — see Approval Workflow below.
7a. **Job Type, Potential Opportunity, Follow-up Date** (added 2026-07-10, for the Executive Dashboard/CRM pass): every quote carries a `jobTypeCode`/`jobTypeName` (picked from the Job Type master list — `src/lib/jobTypes.ts`, `GET/POST/PATCH /api/jobtypes`, 13 seeded defaults: TA/STA/LI/SC/BF/GA/BI/VT/WTP/OTHER TA/OTHER SC/OTHER BF/OTHER — snapshotted at save time, same non-live-reference rationale as the Product picker), an `isPotentialOpportunity` checkbox ("sales thinks this is likely to close" — feeds the Dashboard's Expected Sales KPI/forecast, literally `isPotentialOpportunity = true` with no other condition, per the business spec), and a `followUpDate` (feeds the Dashboard's Today/Overdue/Upcoming follow-up reminders). All three are shown/edited in the same meta-fields grid as Payment Terms, filterable/searchable in the list view (Job Type dropdown filter + column, Potential Opportunity summary card), and printed on the PDF (`ประเภทงาน` field, auto-hidden if unclassified — Potential Opportunity/Follow-up Date are internal-only, not printed on the customer-facing document). **Job Type is required on every new quote as of 2026-07-10 (Codex review fix)**: the create form no longer offers a blank "unclassified" choice (a disabled placeholder is shown until a real selection is made), and `POST /api/quotes` rejects a missing/blank `jobTypeCode` server-side, matching a valid `job_types` master record (`jobTypeName` is always re-derived from that record, never trusted from the client). Editing an *existing* quote still tolerates a blank Job Type (legacy data predating this field) — only a non-blank value is validated for membership, so an unrelated field edit on an old unclassified quote isn't blocked.
7b. **Readability pass (2026-07-21)**: the on-screen editing page (`QuoteDocument.tsx`,
`LineItemsEditor.tsx`, `CustomerSelector.tsx`, `InterestButtons.tsx` — not `PrintDocument.tsx`, which
is unaffected) had its text sizes bumped one tier per direct user request: former `text-[10px]`/
`text-[11px]` eyebrow/header/meta labels are now `text-xs` (12px), and former `text-xs` (12px)
body/input/button/badge text is now `text-sm` (14px). See [UI_GUIDELINES.md](../UI_GUIDELINES.md)
Typography for the accepted tradeoff (some previously-distinct size tiers now read closer together)
and CHANGELOG.md for the full instance count.
8. **Print/PDF**: "พิมพ์ / PDF" calls `window.print()`. The printed document (`src/pages/quotation/PrintDocument.tsx`, added 2026-07-09, modeled on a real customer-facing quotation template) is a single `<table>` with a repeating `<thead>` — the company header (logo, name, address, tax ID), the blue "QUOTATION" ribbon, the full "ผู้ซื้อ" (buyer) block, the "ใบเสนอราคา" meta block (quote number/dates/payment terms/salesperson), and the item-table column headers all re-render on every printed page automatically via the browser's native thead-repeat behavior — verified via a forced 2-page print (see [CHANGELOG.md](../CHANGELOG.md)). Each line shows unit price and **per-unit discount (amount + %)** as separate columns, with sub-details/tags indented beneath (sub-details as a pin-icon bullet list; notes/specifications no longer exist, see item 5 above). Totals include a **Thai-words amount line** under the grand total (`bahtText()`, see [DATABASE.md](../DATABASE.md)). A three-column signature table (ผู้เสนอราคา / ผู้อนุมัติใบเสนอราคา / ผู้ยืนยันการสั่งซื้อ) closes the document — the third (customer PO confirmation) column has no backing data and is always blank for hand-signing. **Any document field left empty is automatically omitted from the printed output** rather than printing a blank row (see [UI_GUIDELINES.md](../UI_GUIDELINES.md) Print/PDF section). Known simplification: the repeating header is identical on every page (the reference design this was modeled on shrinks it on continuation pages); browser print has no reliable way to vary `<thead>` content by page number, so a fuller, consistent header was kept on all pages instead. Page numbers ("Page X/Y") are also omitted — browser print/PDF has no supported way to read total page count from CSS.

## Customer Selection (added 2026-07-14, replacing an earlier — incorrect — "Issuer Company" feature)

**Correction**: a 2026-07-13 pass built an `IssuerCompanySelector` here — letting the user pick
which saved [Company Profile](./CompanyProfiles.md) "issues" a quotation — against a
misunderstanding of the actual requirement. This ERP only ever issues quotations under a single
company identity (Settings → Company Info); there is no per-quote issuer selection, and that UI has
been fully removed from this form. The real requirement was a **Customer** selector: pick a saved
customer/company the quotation is *for*, and autofill the Customer Information fields from it. See
[Customer.md](./Customer.md) for the full module writeup.

A `CustomerSelector` ("เลือกลูกค้า / บริษัท") sits at the top of the Customer Information section,
searching saved [Customer](./Customer.md) records by company name/contact name/phone/email/tax ID.
Selecting one autofills all nine Customer Information fields unconditionally — `client`/
`contactName`/`contactPhone`/`contactEmail`/`address`/`taxId`/`deliveryMethod`/`project`/
`deliveryAddress` — **including any that are blank on the selected customer** (fixed 2026-07-14,
Codex review High #2: previously `deliveryMethod`/`project`/`deliveryAddress` were only copied when
truthy, so selecting a customer with no delivery info silently left stale values from whichever
customer/manual entry was previously on screen). All nine remain freely editable afterward, and
editing them never writes back to the Customer master record. Clearing the selection (×) reverts to
a plain manually-entered quote without discarding whatever's already been typed.

On save, `customerId` (if a customer is linked) is sent to the server; `api/handlers/quotes.ts`
validates it exists and isn't archived, and **always** builds `customerSnapshot` — a frozen copy of
the Customer Information fields actually submitted, whether autofilled-then-possibly-edited or
entirely manual — server-side, never trusting a client-supplied snapshot. **Changing the linked
customer is Draft-only**, same rule the earlier issuer feature had: both `PATCH /api/quotes/:id` and
`POST /api/quotes/:id/workflow` reject (`400`) a request that tries to change `customerId` once
`quote.status !== "ร่าง"`. The selector itself is disabled in the UI once a quote has left Draft,
with a Thai "เปลี่ยนลูกค้าที่เลือกได้เฉพาะสถานะร่างเท่านั้น" note explaining why.

**`customerSnapshot` is read first when reopening a quotation** (fixed 2026-07-14, Codex review
High #1). `QuoteDocument.tsx` seeds each Customer Information field's `useState` from
`quote.customerSnapshot` first, falling back to the quote's legacy top-level field (`quote.client`,
`quote.contactName`, etc.) when no snapshot exists, and finally to an empty string — exactly the
specified (1) snapshot → (2) legacy field → (3) empty order, using `??` so a real empty string
stored in the snapshot is respected rather than incorrectly falling through. `PrintDocument.tsx`
inherits this automatically since it renders the same already-snapshot-seeded component state, not
a second, independently-initialized copy. This resolver deliberately does **not** fall back to a
*live* lookup of the current customer master record by `customerId` — that would silently overwrite
whatever the user already typed/edited on this quote with today's master data, exactly the
"editing copied data must not retroactively change the quotation" guarantee `customerSnapshot`
exists to provide. In practice `customerSnapshot` and the legacy top-level fields are kept in sync
on every save that touches a customer field (see `api/handlers/quotes.ts`'s
`CUSTOMER_FIELD_KEYS`/`WORKFLOW_CUSTOMER_FIELD_KEYS` refresh logic), so this mainly matters as a
defensive/correctness guarantee rather than a case that visibly changes today's rendered values.

Old quotations saved under the 2026-07-13 issuer feature simply have a stray, unread
`issuerCompanyId`/`issuerCompanySnapshot` pair and no `customerId`/`customerSnapshot` — they fall
through to their existing legacy top-level fields (step 2 of the resolver above) and display/edit
normally, no backfill needed.

## Approval Workflow (added 2026-07-08 — see [RBAC.md](../RBAC.md) for the full model)

`QuoteStatus` has 9 values: **Draft** (ร่าง) → **Pending Approval** (รออนุมัติ) → **Approved** (อนุมัติแล้ว) → **Sent to Customer** (ส่งให้ลูกค้าแล้ว) → **Customer Accepted** (ลูกค้ายอมรับ) → **Won** (ปิดการขายสำเร็จ), or **Customer Rejected** (ลูกค้าปฏิเสธ) → **Lost** (เสียโอกาส); plus a standalone **Cancelled** (ยกเลิก) reachable from Draft/Pending/Approved. Toolbar action buttons (Submit/Approve/Reject/Send to Customer/Customer Accepted/Customer Rejected/Won/Lost/Cancel) are rendered only when `computeQuotePermissions()` grants them — combining the signed-in user's RBAC permission (`quotations:create/edit/approve/reject/delete`) with **ownership** (`quote.createdByUserId === currentUser.id`, with approvers/admins able to act on quotes they don't own). Reject/Customer-Reject/Cancel open a modal requiring a comment; other transitions allow an optional one — **as of 2026-07-10 (fifth pass) this is also enforced server-side** (`COMMENT_REQUIRED_ACTIONS` in `api/_lib/quoteWorkflow.ts`, checked in `handleWorkflow`), not just by the modal's own client-side check, since a direct API call previously bypassed it. Every transition appends an `ApprovalHistoryEntry` (never removed) rendered as "ประวัติการอนุมัติ" beneath the document, and fires the relevant role-based notification (see [Notifications.md](./Notifications.md); as of 2026-07-10 fifth pass, `marked_won`/`marked_lost`/`cancelled` notify the creator too, previously silently didn't). **Known simplification**: Approver Level 1 and Level 2 are not sequenced — either can approve/reject independently from Pending Approval; there is no enforced two-stage gate.

## Required-Field Validation (added 2026-07-16, relaxed back to a minimal set later the same day)

**Current behavior (2026-07-16, same day, latest business decision — overrides everything below):**
Quotation must not force every field to be completed, and incomplete Drafts must remain fully
supported. Only `client` (customer name) is required — the exact same single field this codebase
required before any required-field validation work started; no new mandatory field was invented to
replace the ones removed. `jobTypeCode` remains required **only at creation** (a separate,
pre-existing server check, `validateJobType(..., { required: true })` in `POST /api/quotes` —
never re-enforced on edit/submit/print). Line items are **not required** at all — no minimum count,
no required per-line fields; a quote may be submitted/printed with zero or blank line items, exactly
as before required-field validation existed. The **"ข้อกำหนดเอกสารและการส่งมอบ" (Document
Requirements and Delivery) section was removed from Quotation entirely** — no `checklistGroups`
field, no UI card, no client/server validation for it anywhere in this module.

Enforced via the same shared, pure functions as before (`src/lib/validation/quotationValidation.ts`,
value-imported into both the Vite frontend bundle and the API's Node bundle) — only the underlying
`quotationRequiredFields` *policy* shrank; the mechanism (client-side live validation, a server-side
re-check before Print/every non-Draft-preserving workflow transition, a `422 DOCUMENT_INCOMPLETE`
response, real `disabled` gated buttons, `mergeServerValidationErrors()` surfacing a server-only
rejection inline) is unchanged. **Save Draft/Save remain unaffected** either way — a Draft (or any
status, via the plain `PATCH` route) may stay incomplete indefinitely, always could.

A quote saved during the ~1 day this pass's stricter policy (and its removed checklist section)
existed may still carry a stray `checklistGroups` property in MongoDB — no destructive migration was
run; it's simply never read, written, or displayed by any current code path.

**Scope of Work's own required-field validation, UI, schema, print/PDF, and permissions are
unaffected by this rollback** (8 mandatory checklist groups, header fields, items,
payment-percentage rule — all untouched; see [ScopeOfWork.md](./ScopeOfWork.md) "Required-Field
Validation"). One adjacent file needed a compatibility edit — `api/_lib/scopeOfWorkHandler.ts`'s
`deriveFromQuotation()` now always builds a fresh default checklist instead of trying to copy a
Quotation field that no longer exists — see "Snapshot Behavior" in that same doc. The shared
`src/lib/documentRequirements.ts`/`ChecklistGroupCard.tsx` infrastructure this Quotation feature
briefly reused is also untouched and still fully exercised by Scope of Work.

### History (superseded, kept for context)

Earlier the same day, this section briefly required 12 fields (`client`, `salesperson`,
`contactName`, `contactPhone`, `address`, `deliveryMethod`, `deliveryAddress`, `project`,
`paymentTerms`, `issueDate`, `expiryDate`, `jobTypeCode`), at least one non-blank line item per
`validateQuotationLines()`, and 8 mandatory checklist groups (Safety, ขนส่ง, Logo, เงื่อนไขการวางบิล,
เอกสารส่งถึง, Nameplate, เงื่อนไขการส่งมอบงาน, ปจ.2) with conditional "Other"/"TOR" detail rules —
a same-day Codex review found and fixed 2 High + 4 Medium issues in that implementation (checklist
snapshot bug, unreachable detail inputs, non-`disabled` buttons, non-semantic date checks, un-merged
server errors, incomplete central-config coverage). All of that was then walked back by the newer
business decision above. See CHANGELOG.md for both the original pass and this rollback, in full.

## Signature Integration

The preparer's signature is looked up via `quote.createdByUserId`; the approver's via the most recent `"approved"` entry in `approvalHistory`. Both render as an `<img>` (the user's `signatureDataUrl`, uploaded in Settings → Profile) on the document's signature block, falling back to the original blank signature line if the user hasn't uploaded one — never an error.

## Pages

- `src/pages/quotation/QuotationPage.tsx` — top-level container: view-switching (`list`/`new`/`detail`), owns the toast, computes per-quote permissions (`computeQuotePermissions`), wires Save/Duplicate/Rewrite/interest-change/workflow-action callbacks, triggers notification refresh after a workflow action. **As of 2026-07-10 (fifth pass) it no longer builds/dispatches audit-log entries itself** — those are now written authoritatively server-side by `api/handlers/quotes.ts` for every mutation (create/update/duplicate/rewrite/workflow), since the client-side version was forgeable (any authenticated caller could POST the generic audit endpoint directly with fabricated text). See [AuditLog.md](./AuditLog.md).
- `src/pages/quotation/QuoteList.tsx` — list view, filter tabs for all 9 statuses.
- `src/pages/quotation/QuoteDocument.tsx` — create/edit document view: toolbar (print/duplicate/rewrite/save/workflow actions), document header (with logo), client/meta fields (controlled, real per-quote data, disabled when the user lacks edit rights, + a parallel print-only auto-hide-if-empty rendering via the local `PrintRow` helper), approval-history panel, remarks/signature blocks (with stamp + signature images), and the reject/reason comment modal.
- `src/pages/quotation/LineItemsEditor.tsx` — the line-items table, pinned sub-details editor (drag-reorder), tags editor, product picker trigger, totals, and the print-only static rendering. **2026-07-21**: the notes editor and specifications editor were removed (see "Per-item sub-details & tags" above); `notesFormat.tsx`, formerly used only by the print rendering of `line.notes`, was deleted as dead code the same day.
- `src/pages/quotation/InterestButtons.tsx` — shared 👍/👎 toggle, used in both list and document views.
- `src/pages/quotation/PrintDocument.tsx` (added 2026-07-09) — the entire printed/PDF document: repeating header (company + buyer + quote meta + column headers via `<thead>`), item rows with per-unit discount and pin-icon sub-detail bullets, totals with Thai-words amount, remarks/terms, and the three-column signature table. Fully separate from the on-screen editing components — `QuoteDocument`/`LineItemsEditor` are `print:hidden` and only used for editing.

## Components

`InterestButtons`, `FormattedNotes` (above) plus generic `ConfirmDialog`/`Toast` from `src/components/`.

## Database Tables

The `quotes` MongoDB collection (see [DATABASE.md](../DATABASE.md) for the `Quote`/`QuoteLine`/`SubDetail`/`ApprovalHistoryEntry` shapes) — keyed by the human-readable business ID (e.g. `"QT-2567-0041"`) as the literal MongoDB `_id`, not an `ObjectId`. Migrated 2026-07-09 from `localStorage` (`tcs_erp_quotes`, fixed 2026-07-08) to real server-side persistence. The `job_types` collection (added 2026-07-10, see [DATABASE.md](../DATABASE.md) "`JobType`") backs the Job Type dropdown.

**2026-07-14**: `Quote.customerId`/`customerSnapshot` (replacing the short-lived, incorrect `issuerCompanyId`/`issuerCompanySnapshot` pair from 2026-07-13) are now wired — see "Customer Selection" above and [Customer.md](./Customer.md) for the full flow. Existing quotations from before this pass simply have both fields unset; they display and edit normally via their existing free-text fields and are otherwise completely unaffected — no backfill/migration was run or needed.

## APIs

`GET/POST /api/quotes`, `PATCH /api/quotes/:id`, `POST /api/quotes/:id/duplicate`, `POST /api/quotes/:id/workflow` — see [API.md](../API.md) Quotations section for the full route table, auth requirements, and server-side ownership/workflow validation. `GET/POST/PATCH /api/jobtypes` (added 2026-07-10) — see [API.md](../API.md) Job Types section.

## Permissions

Client-side RBAC (see [RBAC.md](../RBAC.md)) via `computeQuotePermissions(quote, isNew, currentUser, roles)`: combines `quotations:view/create/edit/delete/approve/reject/export` with ownership (`quote.createdByUserId`). Sales roles can create/edit/submit their own quotes but not approve; approver roles can view/edit/approve/reject any quote; only users with `quotations:delete` can cancel.

## Current Features

- List with status filter (all 9 statuses) + summary cards
- Full create/edit/duplicate flow, persisted to MongoDB via a real REST API (server-enforced permission + ownership checks on every mutation, see [API.md](../API.md))
- Line items: description/unit/qty/price/discount, auto-computed subtotal
- Quote-level discount % + 7% VAT, full totals breakdown
- Unlimited per-line sub-details (add/edit/delete/drag-reorder, rendered as pinned rows) and tags. **2026-07-21**: per-line notes and specifications were removed entirely (unused feature, see "Per-item sub-details & tags" above)
- Product Library picker for line items (copies name/unit/price; a product's specifications text becomes an initial pinned sub-detail row), with independent-snapshot guarantee
- Real per-quote document fields (contact/phone/address/tax ID/PO ref/dates/payment terms/salesperson) — no hardcoded placeholder text
- **9-status approval workflow** with permission+ownership-gated action buttons, required-comment modal for rejections/cancellation (server-enforced too, as of 2026-07-10), and an append-only approval-history panel
- **Server-authoritative audit trail** (added 2026-07-10, fifth pass) — every create/update/duplicate/workflow transition writes its own `audit_log` entry from the authenticated session identity, and the generic `POST /api/audit-log` rejects the quotation module outright, so these events can no longer be forged by a direct API call
- **Signature-image integration** — preparer/approver signatures render automatically from the uploaded `User.signatureDataUrl`, falling back to a blank line
- **Role-based notifications** fired on every workflow transition (see [Notifications.md](./Notifications.md))
- Print/PDF export via a dedicated repeating-header document (`PrintDocument.tsx`) matching a real customer-facing quotation layout: company/buyer/meta header repeats on every page, per-unit discount column, pin-icon sub-details, Thai-words total, three-column signature block, auto-hidden empty fields
- Buyer contact email, delivery method/address, and project fields (real per-quote data, auto-hidden in print when empty)
- Customer interest tracking (👍/👎), reflected on Dashboard
- **Job Type classification** (added 2026-07-10) — dropdown from a 13-entry master list, searchable/filterable in the list view, printed on the PDF, feeds the Dashboard's Job Type Analytics
- **Potential Opportunity checkbox** (added 2026-07-10) — sales-marked "likely to close," feeds the Dashboard's Expected Sales KPI/forecast
- **Follow-up Date field** (added 2026-07-10) — feeds the Dashboard's Today/Overdue/Upcoming follow-up reminders; clicking a reminder opens the quotation list pre-filtered to that customer
- **Customer selection** (added 2026-07-14, replacing an earlier incorrect "Issuer Company" feature) — pick a saved [Customer](./Customer.md) to autofill the Customer Information fields instead of retyping them; server-built `customerSnapshot` at save time, Draft-only changes to the linked customer — see "Customer Selection" above
- **Print-hint tooltip** (added 2026-07-16) — a small info icon next to the Print/PDF button (inside the `print:hidden` toolbar, so it never appears in the printed output) telling the user to disable "Headers and footers" in their browser's print settings if they don't want the browser's own injected website URL/print date to appear — the app itself never renders a URL, this is a browser print-dialog setting the app cannot override; see [UI_GUIDELINES.md](../UI_GUIDELINES.md) "Print / PDF"

## Future Improvements

- Wire `Company.vatRate` into the VAT calculation (currently `computeTotals()` still uses the fixed `VAT_RATE` constant)
- ~~Replace the client free-text field with a real Customer reference once Customer.md exists~~ — **done 2026-07-14**: `client`/`contactName`/etc. can now be autofilled from (and linked to, via `customerId`) a saved [Customer](./Customer.md) record, though the fields themselves remain free text/editable afterward rather than becoming fully derived — see "Customer Selection" above
- "บันทึกเป็นลูกค้าใหม่" (save the manually-typed Customer Information as a new Customer record, inline from the Quotation form) — explicitly flagged as a future nice-to-have in the 2026-07-14 requirement, not built (kept simple/safe) — a Sales user creates customers via the [Customers admin page](./Customer.md) today
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

## Guided Tour (2026-07-29)

The quotation **editor** (`QuoteDocument.tsx`) has its own 3-step driver.js tour (tourKey
`quotationDoc` via `useModuleTour()`, per-user "seen" tracking in `src/lib/tour.ts`), separate
from the QuoteList page tour. Steps/anchors: `[data-tour="qdoc-actions"]` (the action toolbar),
`[data-tour="qdoc-customer"]` (the customer selector), `[data-tour="qdoc-items"]` (the
`LineItemsEditor` wrapper, `print:hidden`). The one-time auto-fire is gated
`{ autoStart: isDetail }` — the quote arrives via props (no fetch race), but in **create** mode
the actions step would describe `isDetail`-gated buttons (duplicate/rewrite/create-SOW/workflow)
that aren't rendered, so the tour only auto-offers on a saved quotation; the shared
`TourReplayButton` in the toolbar replays it any time, in both modes. Renaming/moving any
`data-tour` anchor breaks the corresponding step silently (missing anchors are filtered out at
start) — keep them in sync with the steps array in `QuoteDocument.tsx`.
