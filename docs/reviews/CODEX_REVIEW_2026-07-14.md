# Codex Review Report — Quotation Templates by Job Type and Excel Import Audit

**Review date:** 2026-07-14  
**Evidence reviewed:** `public/Scope of work new template for air pollution control_Technic.xlsx`, template seed/API/UI/print code, data models, RBAC, Global Search, and documentation. No application code was changed.

## Executive Summary

**Not ready to treat as a fully reliable Excel-derived template system.** The wizard, real server-side template store, job-type mappings, quotation copy behavior, internal-note exclusion, and no-price handling are substantially implemented. The FRP Tank/FRP Lining split is correct. However, source content has been silently lost in two templates, the API does not enforce template-to-Job-Type consistency, and the “import” is a re-upsert of manually transcribed TypeScript seeds rather than a parse/hash of the supplied workbook.

## Critical Issues

None found. No internal notes were found reaching template-applied quote lines or the printed/PDF document, and no issuer-company selection was added.

## High Priority Issues

1. **Template Job Type is not server-side bound to the quote Job Type.** `POST /api/quotes` validates `jobTypeCode` and `quotationTemplateId` independently. `loadTemplateMaster()` omits the template’s `jobTypeCode`, and `validateQuotationTemplate()` cannot compare it to the validated quote Job Type. A direct API caller can create, for example, a TA quotation labelled with the LI template provenance, or any other mismatched pair. Enforce `template.jobTypeCode === quote.jobTypeCode` server-side.

2. **Workbook scope is silently missing from both Activated Carbon and Bag Filter templates.** In the supplied workbook, Activated Carbon row 7 and Bag Filter row 7 specify `Exhaust Duct, Elbow, Flange, Damper and accessories`. The matching `Main Ducting` seed items retain Stack/Ladder/Sampling-port lines but omit this source scope. This is a technical-scope loss, not merely a display choice; restore/classify it as a customer-visible specification.

3. **Real source defaults are discarded when applying templates.** Seed entries store literal workbook values such as `Brand: TCS`, `Material: Steel`, `Brand: Kruger or equivalent`, and `Static Pressure: 200 mm wg.` in `editableParameters.value`. Yet `applyTemplateToQuoteDraft()` always emits `Label: ______` and ignores `value`. This conflicts with the documented rule that non-placeholder real values remain specifications, and loses workbook content in the customer quotation. Preserve real values as editable prefilled content; only genuine placeholders should begin blank.

## Medium Priority Issues

1. **The import does not parse or hash the attached workbook.** `POST /api/quotation-templates/import` upserts `QUOTATION_TEMPLATE_SEEDS` and hashes canonical seed JSON, not the workbook bytes or parsed rows. Replacing the workbook file alone cannot trigger an update, parsing warning, or unrecognized-row report; `unrecognizedRows` is always empty. The current manual transcription is permitted as seed data, but does not satisfy a robust workbook-import/audit trail.

2. **No UI exposes import/report or template administration.** API/client wrapper methods exist, but no reviewed page invokes `importQuotationTemplates()` or presents the returned created/updated/skipped/warning report. Administrators need a controlled visible import/review surface or documented operational API procedure.

3. **Template provenance is metadata plus flattened quote lines, not a full structured template snapshot.** The quote stores `quotationTemplateId/Name/Version` and copied `lines`/terms; sections are represented by `isSectionHeader` lines. This safely prevents live master changes, but does not preserve `TemplateItem` hierarchy, `itemType`, original editable parameter metadata, source hash, or source-sheet snapshot on the quote. It is adequate for current PDF rendering but weak for future audit/reconstruction.

4. **Import concurrency/error semantics are incomplete.** The loop is find-then-insert/update, not an atomic MongoDB upsert. The unique index normally prevents duplicates, but a concurrent first import can return duplicate-key failure rather than a clean idempotent report. Index-creation failures are logged then treated as ensured. Use atomic upserts/duplicate-key recovery and report partial failures.

## Low Priority Issues

1. The template preview shows only the first six item names, so it cannot reliably expose omissions before Sales applies a template. Add an expandable full preview with section/item details.

2. The source contains typo/translation-sensitive content (for example `ยึกพุกเคมี` rendered as `Chemical anchors`). Preserve verbatim source text alongside normalized customer text for auditability.

## Excel Workbook Mapping Review

The supplied workbook contains exactly the four expected sheets: `Wet scrubber`, `Activated carbon`, `Bag filter`, and `FRP Tank and LI`. Seed metadata maps them as follows:

- `SC-WET-SCRUBBER` → SC / Wet Scrubber → `Wet scrubber`
- `SC-ACTIVATED-CARBON` → SC / Activated Carbon → `Activated carbon`
- `BF-BAG-FILTER` → BF / Bag Filter → `Bag filter`
- `TA-FRP-TANK` → TA / FRP Tank → `FRP Tank and LI`, rows 22–48
- `LI-FRP-LINING` → LI / FRP Lining → `FRP Tank and LI`, rows 0–21

The mapping is correct, but the two omitted ductwork rows and discarded literal defaults prevent a full-content pass.

## Job Type and Template Selection Review

**Pass in the UI.** New quotation creation opens a Job Type → Template → Preview wizard. TA/BF/LI auto-preview their single template; SC presents Wet Scrubber and Activated Carbon; unsupported types can start blank. Applying a template creates editable quote lines/terms. The UI prevents wrong combinations, but the API mismatch issue remains High Priority.

## FRP Tank / FRP Lining Split Review

**Pass.** The combined-sheet boundary is correctly applied: LI uses the pre-`FRP Tank` block (rows 0–21), including lining substrate/preparation/safety work; TA uses rows 22–48, including tank orientation, tank dimensions, accessories, transport, and installation. No Tank-only rows were found in LI and no Lining-only rows were found in TA.

## Template Content Completeness Review

**Partial.** Most source rows are represented as sections, items/sub-items, specifications, terms, or internal notes, and order is maintained by seed arrays. The missing `Exhaust Duct, Elbow, Flange, Damper and accessories` source row appears in both applicable sheets and is absent from both seeds. Real source values in editable parameters are also not carried to the applied quote.

## Row Classification Review

Sections, ordinary items, numbered sub-items, specifications, terms, and the three identified internal notes are classified thoughtfully. The source omission above demonstrates the classification process is not complete. Also, `TemplateItem.itemType` is not represented after copying into `QuoteLine`; sub-items become visually ordinary lines, which may be acceptable today but loses hierarchy semantics.

## Editable Placeholder Review

Genuine blanks/`xxx`/`xxxxxx` values are converted to editable quote sub-details and remain editable. Capacity, size, thickness, temperature, chemical, colour, motor and pressure placeholders are present in the reviewed templates. Real literal values should not be blanked as described in High Priority issue 3; `TemplateEditableParameter.value` itself also contradicts its interface documentation claiming it is always blank.

## Internal Notes and Customer Visibility Review

**Pass.** The three source internal notes are stored in `internalNotes`; `applyTemplateToQuoteDraft()` never copies item/template internal notes. Print/PDF renders only quote lines, specifications, sub-details, notes, and customer-facing terms, so source internal review notes do not appear. This behavior should be retained.

## Pricing Review

**Pass.** Workbook cost columns are blank. Templates have no price fields; applied lines deliberately receive `unitPrice: 0` and `discount: 0`, so Sales can price later and standard totals calculate from entered values. No internal material/labor cost is stored or printed. Zero is displayed rather than an invented price, which is acceptable as an editable quotation starting state.

## Template Data Model and API Review

The `quotation_templates` model includes code/name, Job Type, version, source file/sheet/hash, section/items, terms, internal notes, flags, and audit metadata. Reads use `quotations:create` or template-manage permission; import/patch use `quotationTemplates:manage`; summaries avoid returning full sections. Validation correctly re-derives template name/version from an existing non-deleted template. It needs the Job-Type binding and stronger import mechanics reported above.

## Import Idempotency Review

**Partial.** Repeating unchanged seed content skips by stable `templateCode` plus deterministic seed-content hash, so ordinary sequential re-import does not duplicate records. The report has created/updated/skipped fields. It is not an import of the workbook itself, cannot detect file revision, cannot generate real parse warnings/unrecognized rows, and is not atomic under concurrent imports.

## Quotation Snapshot Review

**Partial.** A template-created quote persists Job Type plus server-derived `quotationTemplateId`, name, and version, while the wizard copies independent quote lines/payment terms/remarks before save. Subsequent quote edits cannot update the template, and template edits cannot mutate saved lines. The metadata is immutable on PATCH, and existing quotes without it still work. The structured template hierarchy/source snapshot limitation is noted under Medium Priority issue 3.

## Existing Quotation Compatibility Review

**Pass.** New fields are optional. Old quote lines default `isSectionHeader` false, old quotes open/edit/print using existing fields, and templates are not required because blank-start remains supported.

## Product Master Safety Review

**Pass.** No template application writes to the Products collection. Seed items have no automatic `productId` assignment and technical specifications remain quote/template details rather than mass-created product master records.

## PDF / Print Review

**Pass with a content-completeness caveat.** Saved quote lines—not live master templates—drive print/PDF. Section headers render in order and are omitted when empty; item details/specifications/sub-details and customer-facing terms render; internal template notes cannot reach print. Standard table layout uses fixed columns and section headers span them. The missing and blanked workbook content will therefore also be missing/blank in PDFs until corrected.

## Global Search Integration Review

**Pass.** Template search is real server-side `quotation_templates` search, requires `quotations:create` or template-manage permission, filters active/non-deleted records, returns only summary fields, and deep-links to a preselected wizard preview. It finds template code/name/Job Type/description, covering TA/FRP Tank, SC/Wet Scrubber, SC/Activated Carbon, BF/Bag Filter, and LI/FRP Lining.

## RBAC and Security Review

Template import and mutation require `quotationTemplates:manage`; Sales can only browse active templates because they need `quotations:create`. Full template records containing internal notes are available to Sales through the wizard API, which is justified for quote authoring but means internal notes are exposed to authenticated Sales clients even though they are not copied/printed. If the internal review comments are sensitive beyond normal Sales visibility, return a sanitized customer-authoring template shape instead. No issuer-company requirement or selector was restored; customer selection remains on Customers.

## No Fake Data Review

No UI mock result array, invented Product Master data, or fabricated prices was found. Seeds are server-side and trace source filename/sheet. The manual seed transcription—not fake data—is the basis of the content-completeness/import-audit limitations above.

## Documentation Review

Documentation accurately describes mappings, internal-note exclusion, blank pricing, and manual seed re-import behavior. It incorrectly implies every non-placeholder literal stays a specification while source literals are stored as editable parameter values and then discarded on application. It also presents an idempotent “Excel import” more strongly than the code supports: the workbook is neither parsed nor hashed at import time, and parsing warnings cannot occur.

## Requirements Checklist

- [x] TA loads FRP Tank
- [x] SC offers Wet Scrubber
- [x] SC offers Activated Carbon
- [x] BF loads Bag Filter
- [x] LI loads FRP Lining
- [!] Excel sheets mapped correctly
- [x] FRP Tank and LI split correctly
- [!] Template row order preserved
- [!] Main items and specifications classified correctly
- [!] Editable placeholders remain editable
- [x] Internal notes hidden from customers
- [x] No invented prices
- [!] Import is idempotent
- [x] Template version stored
- [!] Quotation stores copied template snapshot
- [x] Master template edits do not change old quotations
- [x] Existing quotations still work
- [x] PDF uses quotation snapshot
- [x] Product Master is not polluted
- [x] No issuer company selection added
- [x] Customer workflow still works
- [ ] Build passes if checked
- [!] Documentation updated

## Suggested Fix Plan for Claude Code

1. Restore missing Excel source rows and correct literal-value handling; re-compare every sheet row-by-row.
2. Preserve the verified TA/LI split and add automated contract tests proving no cross-content/mismatched Job Type is possible.
3. Enforce template Job Type equals quotation Job Type in `POST /api/quotes`.
4. Keep copied quote content and internal-note exclusion; consider persisting a structured template snapshot/source hash for audit requirements.
5. Replace find-then-insert import logic with atomic upsert/duplicate-key recovery.
6. If workbook revision support is required, parse/hash the uploaded/supplied workbook and report actual warnings/unrecognized rows; otherwise explicitly label this as a curated-seed refresh, not workbook import.
7. Add an administrator UI or documented operational endpoint for import/report/activation actions.
8. Add full preview and PDF regression tests, including zero-price, empty-section, internal-note, and legacy-quote cases.
9. Retain customer selection and the absence of issuer-company UI/API requirements.

## Build Check

Commands attempted without modifying the project:

- `npm run lint` — did not start: `WSL 1 is not supported. Please upgrade to WSL 2 or above. Could not determine Node.js install directory.`
- `npm run build` — did not start, with the same Node/WSL error.

Likely cause: this review shell resolves to a Windows Node installation incompatible with WSL 1. Recommended fix: run in WSL2 or a Linux-compatible Node environment, then rerun lint and build.
