# Module: Quotation

## Purpose

Create, edit, duplicate, and print professional quotation documents for customers, with line items that can carry detailed notes and unlimited sub-details (scope of work, warranty terms, install steps, etc.) — the core "real business use" feature requested for this module.

## Business Flow

1. **List view** (`QuoteList.tsx`): browse all quotes, filter by status (ร่าง/รออนุมัติ/อนุมัติแล้ว/ยกเลิก), see summary cards (total, pending, approved, interested), mark customer interest (👍/👎) inline.
2. **Create**: "สร้างใบเสนอราคา" → blank document with a 3-line example template (two of which have sample notes/sub-details pre-filled to demonstrate the feature) → fill in client name, line items → "บันทึก" (save as draft/whatever status is picked) or "ส่งใบเสนอราคา" (save + bump ร่าง → รออนุมัติ).
3. **Edit existing**: click a row in the list → opens the same document view in "detail" mode, pre-loaded with that quote's actual saved `lines`/`discount`/`status`/`client` (see Known Issues history in [CHANGELOG.md](../CHANGELOG.md) — this used to be broken).
4. **Line items**: add manually ("เพิ่มรายการเอง") or pick from the Product Library ("เลือกจากคลังสินค้า", opens `ProductPickerModal` from the Product module) — picking a product **copies** its name/unit/price into a new line; the line is then a fully independent, editable record (see [Product.md](./Product.md) for the snapshot guarantee).
5. **Per-item notes & sub-details**: click the sticky-note icon on a line row to expand a panel with (a) a notes textarea + bullet/numbered-list toolbar buttons, (b) an unlimited list of sub-details, each addable/editable/deletable/drag-reorderable via a grip handle. A gold dot on the collapsed icon indicates the line has content.
6. **Duplicate**: "คัดลอก" (detail view only) clones the open quote into a new draft with a fresh ID and fresh line/sub-detail IDs (no shared references with the original).
7. **Print/PDF**: "พิมพ์ / PDF" calls `window.print()`. A dedicated print-only rendering shows each line's notes and sub-details as indented, formatted lists beneath the item (see [UI_GUIDELINES.md](../UI_GUIDELINES.md) Print/PDF section).

## Pages

- `src/pages/quotation/QuotationPage.tsx` (104 lines) — top-level container: view-switching (`list`/`new`/`detail`), owns the toast, wires Save/Duplicate/interest-change callbacks.
- `src/pages/quotation/QuoteList.tsx` (112 lines) — list view.
- `src/pages/quotation/QuoteDocument.tsx` (238 lines) — create/edit document view: toolbar (print/duplicate/save/send), document header, client/meta fields, remarks/signature blocks.
- `src/pages/quotation/LineItemsEditor.tsx` (312 lines) — the line-items table, notes editor, sub-details editor (drag-reorder), product picker trigger, totals, and the print-only static rendering.
- `src/pages/quotation/InterestButtons.tsx` (31 lines) — shared 👍/👎 toggle, used in both list and document views.
- `src/pages/quotation/notesFormat.tsx` (46 lines) — `<FormattedNotes>`: parses `• `/`1. ` prefixed lines into `<ul>`/`<ol>`, used by the print-only rendering.

## Components

`InterestButtons`, `FormattedNotes` (above) plus generic `ConfirmDialog`/`Toast` from `src/components/`.

## Database Tables

None (no real DB) — see [DATABASE.md](../DATABASE.md) for the current `Quote`/`QuoteLine`/`SubDetail` TypeScript shapes, which are the closest thing to a schema. **Quotes are not persisted to `localStorage`** — this is the biggest known gap, tracked in [PROJECT_STATUS.md](../PROJECT_STATUS.md).

## APIs

None — see [API.md](../API.md) for the current client-side operation list (create/update/duplicate/interest-change/send, all in `QuotationPage.tsx`/`QuoteDocument.tsx`).

## Permissions

None — see [RBAC.md](../RBAC.md). Every signed-in user has full create/edit/duplicate/send access to every quote.

## Current Features

- List with status filter + summary cards
- Full create/edit/duplicate flow, correctly persisting to the shared `quotes` state (in-memory)
- Line items: description/unit/qty/price/discount, auto-computed subtotal
- Quote-level discount % + 7% VAT, full totals breakdown
- Per-line notes (multi-line, bullet/numbered formatting) and unlimited sub-details (add/edit/delete/drag-reorder)
- Product Library picker for line items, with independent-snapshot guarantee
- Print/PDF export with proper notes/sub-details formatting
- Customer interest tracking (👍/👎), reflected on Dashboard

## Future Improvements

- Persist `quotes` to `localStorage` (or a real DB post-Phase-2) — see [TODO.md](../TODO.md) High Priority
- Persist secondary document fields (contact person, phone, address, tax ID, PO reference, dates, payment terms) — currently cosmetic
- Replace the client free-text field with a real Customer reference once [Customer.md](./Customer.md) exists
- Status workflow beyond the current 4 values (Waiting Approval, Approved, Sent, Viewed, Negotiation, Won, Lost, Expired, Cancelled were all in the original spec; only ร่าง/รออนุมัติ/อนุมัติแล้ว/ยกเลิก exist today) + status change history/audit trail
- Auto quotation numbering currently continues the seeded `QT-2567-00XX` sequence via `nextQuoteId()` — fine for a single session, needs a real sequence once multi-user/backend exists
- Real PDF generation (server-side) if browser print-to-PDF proves insufficient for production use

## Known Issues

- **[Fixed 2026-07-08]** Save/Duplicate/Send used to be completely non-functional because `Quote` had no `lines` field — see [CHANGELOG.md](../CHANGELOG.md) for the full root-cause writeup. Verified fixed via scripted browser testing.
- Data loss on page reload (quotes are in-memory only) — see Future Improvements above.
