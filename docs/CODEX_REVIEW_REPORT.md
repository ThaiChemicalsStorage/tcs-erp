# Codex Review Report — Scope of Work Module

**Review date:** 2026-07-15  
**Scope:** Static code/documentation audit of the new Scope of Work module. Application source was not modified.

## Executive Summary

The module is substantially implemented: a Scope of Work can be created from a quotation, copied data is stored as an independent snapshot, items are editable, server-side sequence allocation and unique indexes are present, checklist state is saved, signatures are supported, and API permissions are enforced.

There are no confirmed Critical issues. Three High Priority gaps prevent full acceptance: the quotation contact and salesperson are not retained in the Scope of Work snapshot, the required suffix code is an ungoverned optional free-text field and is omitted on creation, and Global Search has no Scope of Work integration. A visual PDF/browser-print test and lint/build could not be run because this WSL1 environment has no usable `node` binary and no PDF rendering utility.

## Critical Issues

None confirmed. The server uses an atomic MongoDB counter and unique indexes on both `scopeNumber` and `{yearMonth, jobSequence}`. This prevents duplicate persisted codes under normal concurrent creation. The create/duplicate handlers should still translate a rare `E11000` error into a controlled retry/conflict response, but the database constraint prevents the duplicate itself.

## High Priority Issues

1. **Quotation contact and salesperson are not pulled/stored.** `buildCustomerSnapshot()` stores company/address/tax/phone/email/project, but not `quote.contactName`; shipping and billing contacts/phones start blank. `seller` is set to the user who creates the Scope of Work, not `quote.salesperson`. This fails the stated data-pull requirement for customer contact and salesperson, and loses the generic quotation contact even though it is real quotation data. Evidence: `api/_lib/scopeOfWorkHandler.ts`, `ScopeOfWorkCustomerSnapshot`, `buildCustomerSnapshot()`, and `handleCreate()`.
2. **Suffix code does not meet the required configured job-code format.** New documents generate `PQ{YYYYMM}-{sequence}-{jobTypeCode}` because `secondaryCode` is always blank. The final segment is an editable, free-text field explicitly marked as an unresolved business question; it is not server-configured or validated as a suffix policy. The required format includes `-{suffixCode}` (for example `-SK`). Evidence: `computeScopeNumber()`, `handleCreate()`, and `docs/MODULES/ScopeOfWork.md` “Open Business Question”.
3. **Scope of Work is absent from Global Search.** The search result contract, handler collections, projections, UI groups, and indexes contain quotations/customers/products/templates/pages/users only. It cannot be searched by Scope number, quotation number, customer, Job Type, PO, or status. Evidence: `src/lib/search.ts` and `api/_lib/searchHandler.ts`.

## Medium Priority Issues

1. **A4 portrait is not explicitly specified or visually verified.** The only shared print rule is `@page { margin: 12mm; }`; there is no `size: A4 portrait`. Actual browser/PDF output was not testable here.
2. **Multi-page item detail can split poorly.** Main item rows have `breakInside: avoid`, but their following specifications/remarks row does not. A description/specification block can split across pages. The table header is correctly in `<thead>`, so it should repeat in compliant browsers.
3. **No explicit source-quotation authorization is checked on refresh.** Create checks `quotations:view`; refresh reads the linked quotation after only Scope edit/ownership authorization. With the current broad quotation-view model this is not an observed exposure, but future quotation record-level access would need the same source access check.
4. **Some required section terminology is not directly represented.** The code has billing-contract conditions and payment conditions, but no separately named “Contract inspection” group. Confirm this mapping against the reference/business terminology.

## Low Priority Issues

1. Delete confirmation says a deleted document can be restored by an administrator, but no restore endpoint/UI was found.
2. The print checkbox uses a literal `✓` in a custom box. This avoids browser-native checkbox rendering differences, but should be tested in target PDF printers/fonts.

## Reference PDF Layout Review

The supplied PDF is present as a one-page PDF: `public/Scope Of Work PQ202607-174-LI-SK บริษัท เค ไทย ไฮดรอลิค จำกัด.pdf`. This environment lacks PDF rendering/extraction tools, so an independent visual inspection of its actual pixels, handwritten annotations, and exact A4 geometry was not possible.

The implementation’s documented/reference mapping and print component include the expected title, two-column header, checklist grid, four-column item table, notes, and seller/approver signature table. The print component deliberately excludes blue handwritten values and pricing. The outstanding visual acceptance items are exact field/section parity, column spacing, A4 portrait, checkbox glyph output, and multipage output.

## Quotation Data Pull Review

Implemented from the selected quotation: customer company/address/tax/phone/email/project (customer snapshot first), quotation number, PO, Job Type code/name, delivery address, payment terms, remarks, item description, specifications, sub-details, quantity, unit, and line notes.

Missing/incorrect: `contactName` is not copied; shipping/billing contact fields are blank rather than populated from the available generic contact; no quotation salesperson snapshot exists and seller becomes the creating user. No unrelated collection is used for the copied quotation data.

## Customer and Item Snapshot Review

Implemented. `quotationId`, a copied `customerSnapshot`, copied item/specification data, copied Job Type, PO, remarks, payment description, and edited Scope of Work fields are persisted. Later quotation/customer/product changes do not update an existing Scope of Work unless a user explicitly calls refresh; Final records cannot refresh. The customer snapshot is sourced from `quote.customerSnapshot` before legacy quote fields, avoiding issuer company/Profile confusion.

## Job-Code Generation Review

Implemented: generation is server-side; `nextJobSequence()` uses MongoDB `findOneAndUpdate` with `$inc`/upsert; year/month comes from the Scope issue date; Job Type is copied from the quotation; unique indexes protect `scopeNumber` and `{yearMonth, jobSequence}`; the number is locked on Final except through a new duplicate.

Partial: suffix is not configurable as a governed setting and is blank by default, so the generated code does not initially match the required four-segment format. Creation/update/duplicate do not catch/retry a duplicate-key failure, although the uniqueness constraints stop duplicate storage.

## Handwritten/Editable Field Review

No hardcoded blue handwritten sample contacts, phone numbers, dates, notes, or signatures were found. Drawing/delivery/shipping/billing fields are blank and editable; approver starts blank; payment percentages start blank; print renders live values or blanks. Seller is populated from the authenticated creator, which is real ERP data rather than a sample signature.

## Checkbox and Radio Review

Safety, document destination/type, transportation, logo, name plate, Test Report type/level, billing-contract conditions, delivery document format, and payment conditions exist. Single-selection groups use radio inputs in the editor and are server-clamped to one checked value; multiple groups use checkboxes. The server persists only known group/option keys and print renders custom square/check-mark symbols, not browser-native controls.

Partial: LI/TA receive predefined Test Report suggestions, which are intentional but should be business-approved as non-random defaults; actual print state could not be exercised. “Contract inspection” is not explicitly named.

## Item and Manual Item Review

Implemented. Quotation order is preserved, section headers are retained, and descriptions, quantities, units, specifications/sub-details, and customer-facing line notes are copied. Users can add, edit, delete, duplicate, and drag-reorder manual items/specification lines. Price, discount, VAT, internal tags, and internal notes are not copied or printed.

## Print / PDF Review

Implemented structurally: print-only document, title, two-column header, custom checkbox symbols, item table, remarks, signature table, `<thead>` header, and hidden editor/toolbars. Blank values render as blank lines rather than sample placeholders; pricing/internal data has no print path.

Partial/unverified: no explicit A4 portrait page size; no browser/PDF visual run; no practical multi-page test; specification rows may split from their item row. The reference PDF could not be rendered in this environment.

## Signature Review

Implemented. Seller and approver blocks have names, dates, optional linked-user saved signature images, and blank signature/date lines when absent. No sample handwritten signature is copied. Note that seller defaults to the creating user rather than the quotation salesperson (High Priority data mapping issue).

## RBAC and Security Review

Implemented server-side as `scopeOfWork:view`, `create`, `edit`, `finalize` (the approve equivalent), `print`, and `delete`; the requested `approve`/`manage` names do not exist literally. Direct API endpoints enforce these permissions, edit/delete additionally enforce owner-or-finalize-holder access, Final locks edits, and creation also requires `quotations:view`. Rewrites route Scope APIs to the authenticated quotations handler.

No confirmed direct URL/API RBAC bypass was found by static review. Runtime authorization tests were not possible without a working application/database.

## Existing Quotation Regression Review

Static review indicates quotation routes remain separate and Scope creation reads/copies rather than mutates the quotation. Existing quotations with usable fields can create a Scope; zero-item quotations have an editor warning and manual-item option. The quotation toolbar opens the most recently updated Scope when one exists. Concurrent/duplicate creation results in distinct server-assigned codes; multiple Scope documents per quotation are intentionally supported via duplicate.

Live quotation open/edit/save regression testing was not possible in this environment.

## Global Search Integration Review

Missing. No Scope of Work collection/query/result/UI/RBAC search branch exists, so none of the required six search keys are supported.

## No Fake Data Review

No sample PDF handwritten values were hardcoded into the Scope model, API defaults, or print component. Checklist labels are fixed document structure, not customer data. Customer/job/item fields are quotation-derived; seller is authenticated-user data. The only concern is omission of real quotation `contactName`/`salesperson`, not fabricated values.

## Documentation Review

Strong module/API/RBAC documentation exists and candidly records the unresolved suffix and contact-mapping decisions. That documentation confirms, rather than resolves, the two High Priority requirement gaps. Add the Global Search status and final business policy for suffix/contact/seller mapping.

## Requirements Checklist

- [x] Scope of Work can be created from quotation
- [x] Customer name pulled from quotation
- [x] Job Type pulled from quotation
- [x] Items pulled from quotation
- [x] Quantity/unit pulled correctly
- [x] New manual items supported
- [!] Job code generated correctly
- [x] Job code unique and server-generated
- [x] Blue handwritten values not hardcoded
- [!] Missing fields editable
- [!] Checkbox sections implemented
- [x] Checkbox states saved
- [!] Checkbox states print correctly
- [x] Internal cost/notes hidden
- [x] Snapshot stored
- [x] Quotation changes do not mutate old Scope of Work
- [x] Seller signature section exists
- [x] Approver signature section exists
- [!] A4 print layout works
- [!] Multi-page layout works
- [x] RBAC enforced
- [!] Existing quotations still work
- [ ] Build passes if checked
- [!] Documentation updated

## Suggested Fix Plan for Claude Code

1. Define and server-enforce the suffix source/configuration; generate the complete four-part code on creation and handle duplicate-key errors predictably.
2. Add a frozen quotation contact and salesperson snapshot; decide how generic contact maps to shipping/billing fields without inventing data.
3. Preserve the current snapshot/explicit-refresh behavior and add automated tests proving quotation/customer edits do not mutate old Scope documents.
4. Keep internal prices/notes excluded and add a print regression test confirming this.
5. Add/confirm the exact required contract-inspection/checklist mapping and test saved/printed radio/checkbox states.
6. Set `@page` explicitly to A4 portrait; test one-page and long multi-page PDF output and keep item/spec blocks together.
7. Add Scope of Work Global Search queries/results for number, quotation, customer, Job Type, PO, and status, behind `scopeOfWork:view`.
8. Add API/RBAC integration tests for all endpoints and source-quotation access.
9. Clarify delete/restore UX and seller workflow.
10. Update module/API/RBAC documentation after the above decisions, then run lint/build in a Node-capable environment.

## Verification Limits

`npm run lint` and `npm run build` were attempted but could not execute: `node` is not installed/usable here and npm reports WSL1 is unsupported. PDF visual review was blocked because `pdfinfo`, `pdftotext`, and a PDF renderer were unavailable. These are verification limitations, not passing results.

---

## Claude Fix Status (2026-07-15)

Fix pass against this report's findings, run in a Node-capable environment (so — unlike the review
itself — `tsc`/`lint`/`build` were actually executable here). Full itemized diff in `CHANGELOG.md`'s
"2026-07-15 — Scope of Work: Codex review fix pass" entry; full field-level writeup in
`docs/MODULES/ScopeOfWork.md`.

### Critical issues fixed

None reported by this review (0 Critical found) — nothing to fix in this category. The review's
one Critical-adjacent recommendation (translate a rare `E11000` duplicate-key error into a
controlled response instead of an unhandled 500) was still implemented defensively: `handleCreate`/
`handleDuplicate` (`api/_lib/scopeOfWorkHandler.ts`) now retry up to 3 times, re-reserving a fresh
sequence number each time, before returning a clean `409` if every attempt collides.

### High Priority issues fixed (3 of 3)

1. **Quotation contact/salesperson not pulled/stored** — fixed. `ScopeOfWorkCustomerSnapshot`
   gained `contactName` (frozen from `quote.customerSnapshot.contactName`/`quote.contactName`);
   `ScopeOfWork` gained a new frozen, non-editable `quotationSalesperson` field (from
   `quote.salesperson`, refreshed only by the explicit refresh action); the default `seller`
   signatory now prefers `quote.salesperson` (resolving a matching real user by `fullName` for the
   print signature-image link) instead of unconditionally defaulting to the creating user.
2. **Suffix code didn't meet the required job-code format** — fixed. `secondaryCode` is now a
   **required** field on `POST /api/scope-of-works` (server-validated non-empty; a client prompt in
   `QuoteDocument.tsx` collects it before the create call fires), so every newly-generated
   `scopeNumber` always has its full 4-segment format from the moment of creation. Its business
   *meaning* is deliberately still not invented — see "Remaining issues" below.
3. **No Global Search integration** — fixed. `GET /api/search` gained a `scopeOfWorks` result group
   (`searchScopeOfWorks()`, `api/_lib/searchHandler.ts`), gated by `scopeOfWork:view`, matching all
   6 keys the review named (scope number, quotation number, customer, Job Type, PO, status).
   `GlobalSearch.tsx` renders it; clicking a result opens the source quotation then that Scope of
   Work's editor (new deep-link state in `App.tsx`/`QuotationPage.tsx`).

### Medium/Low issues also fixed this pass

- A4 portrait made explicit (`@page { size: A4 portrait; margin: 12mm; }`, `src/styles/index.css`).
- Item rows and their own following specification/remark row are now grouped into one unbreakable
  `<tbody style="break-inside: avoid">` each (`ScopeOfWorkPrintDocument.tsx`) — closes the
  "specification block can split from its item row across a page break" finding.
- `refresh` now also requires `quotations:view` (previously only Scope of Work edit/ownership
  authorization was checked before reading the linked quotation — matches `create`'s existing rule).
- Delete-confirmation wording corrected to stop implying a restore capability that doesn't exist.

### Remaining issues (not fixed, by design or deferred)

- **`secondaryCode`'s business *meaning*** is still unconfirmed — its *presence* is now required
  (this pass), but what it should represent, or whether it should be a selectable list instead of
  free text, remains an open question for the business, per the original task's explicit
  instruction not to invent one. See `MODULES/ScopeOfWork.md` "Open Business Question."
- **No restore endpoint/UI** for a soft-deleted Scope of Work (Low Priority) — the misleading UI
  text was fixed, but a real restore action was not added this pass (no confirmed need yet).
- **No separately-named "Contract inspection" checklist group** (Medium) — this pass followed the
  reference PDF as the literal source of truth for exact labels/grouping (per the original task
  instruction), which has no directly equivalent printed group; the spec's suggested category list
  and the PDF's actual groups don't map 1:1. Flagged for business confirmation, not resolved by
  invention.
- **No un-finalize action** — unchanged from the original pass; "ทำสำเนา" remains the documented way
  to keep working from a copy of a `Final` record.
- **No automated API/RBAC integration tests** — this project has no automated test infrastructure
  anywhere (a longstanding, separately-tracked decision, not something this single fix pass should
  introduce in isolation).

### Job-code implementation

`PQ{yearMonth}-{jobSequence}-{jobTypeCode}-{secondaryCode}`, entirely server-generated. `jobSequence`
is an atomically-reserved per-calendar-month counter (`scope_{yearMonth}` in the shared `counters`
collection, `$inc`/upsert via `findOneAndUpdate` — same pattern as quotation numbering). Uniqueness
is guaranteed by a unique `{yearMonth, jobSequence}` index (the `scopeNumber` unique index is a
defense-in-depth backstop, not the primary mechanism). `secondaryCode` is now required at creation
(this pass's High #2 fix) and freely editable afterward. Editing `issueDate` into a different
calendar month re-reserves a fresh sequence number for that month, closing a real collision risk the
original implementation itself already anticipated and fixed before this review ran. A bounded
retry (up to 3 attempts) now wraps the insert against the near-impossible case of a duplicate-key
race (this pass's addition).

### Quotation fields pulled

Company name, contact name (this pass's fix), address, tax ID, phone, email, project name (all via
`customerSnapshot`, snapshot-first with a legacy-field fallback), salesperson (new
`quotationSalesperson` field, this pass's fix), quotation number, PO reference, Job Type code/name,
delivery address, payment terms (into `paymentConditions.description`), remarks, and every line
item's description/specifications/sub-details/quantity/unit/notes. Never pulled: unit price,
discount, VAT, internal tags, internal notes — Scope of Work never carries pricing or internal data.

### Editable fields

Drawing code, delivery date, delivery location, shipping/billing contact name+phone, secondary code
(post-creation), checklist checked/note state, all item fields (add/remove/duplicate/reorder/edit),
payment conditions (percentages/method/description/notes), remarks, seller/approver (name/linked
user/date). Read-only/system-derived: scope number, quotation number, customer snapshot fields
(refreshed only via the explicit refresh action), `quotationSalesperson`.

### Checkbox implementation

11 groups (`buildDefaultChecklistGroups()`), `"single"` (radio-style, server-clamped to at most one
checked option) or `"multiple"` (independent checkboxes) selection types, server-side key/label/
selectionType integrity (a client can only toggle `checked`/set a group's `note`, never inject new
structure). Persisted on every `PATCH`; print renders a literal `✓`-in-a-box glyph per option, not a
native form control, so checked/unchecked state renders identically across browsers/PDF exporters.

### Snapshot behavior

Unchanged from the original pass, confirmed still correct by this review: creation copies (never
live-references) the quotation's data; editing a Scope of Work never touches the quotation; later
quotation/customer/product edits never silently change an already-created Scope of Work; only the
explicit "อัปเดตข้อมูลจากใบเสนอราคา" action re-pulls quotation-derived fields on demand (now also
refreshing `quotationSalesperson`, this pass's addition), gated by the same authorization `create`
requires (this pass's Medium fix).

### Print/PDF behavior

A4 portrait now explicit; checklist checked state renders via custom glyphs; no pricing/internal
notes anywhere in the print path; item+detail row pairs now grouped so a page break can't split
them (this pass's fix); shared `<thead>` still repeats every page. Not independently re-verified in
an actual browser/PDF renderer this pass either (no such tooling available in this environment) —
still a documented, open manual-verification item.

### Signature behavior

`seller` now defaults from the quotation's real assigned salesperson (with a real-user lookup for
the signature image) instead of unconditionally the creating user (this pass's fix); `approver`
still always starts blank — never an invented approval. Both remain fully editable. No sample
handwritten signature is ever copied from the reference PDF.

### RBAC result

No change to the permission model itself — the review found no confirmed bypass. One gap closed:
`refresh` now requires `quotations:view` in addition to its existing Scope of Work edit/ownership
check (this pass's Medium fix), matching `create`'s existing requirement. The review's note that
"approve"/"manage" aren't literal permission names is accurate and intentional — `scopeOfWork:finalize`
is the approve-equivalent action, and there is no `scopeOfWork:manage` superset (the task's
requested permission list was exactly the 6 granular ones).

### Files changed (this fix pass)

`src/lib/scopeOfWork.ts`, `api/_lib/scopeOfWorkHandler.ts`, `api/_lib/searchHandler.ts`,
`src/lib/search.ts`, `src/components/GlobalSearch.tsx`, `src/App.tsx`,
`src/pages/quotation/QuotationPage.tsx`, `src/pages/quotation/QuoteDocument.tsx`,
`src/pages/quotation/ScopeOfWorkDocument.tsx`, `src/pages/quotation/ScopeOfWorkPrintDocument.tsx`,
`src/styles/index.css`, `src/lib/i18n.tsx`, plus documentation
(`docs/MODULES/ScopeOfWork.md`, `docs/{CLAUDE,PROJECT_STATUS,CHANGELOG,TODO,DATABASE,API,RBAC,
UI_GUIDELINES,IMPLEMENTATION_CHECKLIST}.md`, this file).

### Lint result

`npm run lint` — clean (0 errors; 2 pre-existing warnings in `src/lib/i18n.tsx` unrelated to this
module, present before this pass).

### Build result

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, and `npm run build` (which itself runs
`tsc -b && tsc --noEmit -p tsconfig.api.json && vite build`) all pass clean.

### Manual test result

Not performed — this environment has no `MONGODB_URI`/live database access and no browser, the same
sandboxed-session limitation documented across every prior pass in this repo (see
`PROJECT_STATUS.md` "Known Risks"). All fixes above are verified by `tsc`/`lint`/`build` passing
clean and by direct code reading against this report's specific findings, not by exercising the
running application. The 25-step manual verification checklist from the fix task (create from a
quotation, verify pulled data, generate/verify job codes under concurrency, checkbox persistence,
print/PDF comparison against the reference, unauthorized-access test, etc.) remains an open,
explicitly-tracked TODO item.
