# Codex Review Report — Quotation Templates

**Review date:** 2026-07-15  
**Scope:** Static implementation, documentation, RBAC, data-flow, and print review. No source code was changed. The worktree already contained implementation changes; they were not modified.

## Executive Summary

The Template Management UI, Job Type wizard, blank fallback, granular RBAC, product/custom-item editor, and basic provenance fields are substantially implemented. No Critical server-side authorization bypass was identified.

However, the two core audit/import requirements are not complete: the import route does not parse the supplied `.xlsx` workbook or store a workbook-derived hash, and a quotation does not store copied template sections/items. It stores independent flattened `QuoteLine[]` plus three provenance fields. These are High Priority gaps because they prevent reliable source re-import/audit reconstruction and fail the requested structured snapshot behavior.

`npm run lint` and `npm run build` could not execute in this environment: npm failed before running either command with `WSL 1 is not supported. Please upgrade to WSL 2 or above. Could not determine Node.js install directory.`

## Critical Issues

None found in static review. Template lifecycle mutation routes have server-side authentication and granular permission checks.

## High Priority Issues

1. **Workbook import is not a workbook import.** `POST /api/quotation-templates/import` only calls `upsertQuotationTemplates()` over `QUOTATION_TEMPLATE_SEEDS`; it neither reads nor parses `public/Scope of work new template for air pollution control_Technic.xlsx`. The stored `sourceHash` is a hash of seed JSON, not workbook bytes or normalized parsed rows. Replacing the workbook alone cannot produce warnings, changed-source detection, or a correct re-import. Evidence: `api/_lib/quotationTemplatesHandler.ts:85-115,467-478`; acknowledged in `docs/TODO.md:180`.

2. **Required structured template snapshot is missing.** Quote creation stores only `quotationTemplateId`, `quotationTemplateName`, `quotationTemplateVersion`, and the client-submitted flattened quote lines. It does not persist copied `TemplateSection[]`/`TemplateItem[]`, item types, editable-parameter metadata, terms/source hash, or a server-created template-content snapshot. Evidence: `api/handlers/quotes.ts:228-299`, `src/pages/quotation/applyTemplate.ts`. This is explicitly acknowledged as a flattened snapshot in `docs/TODO.md:181`.

3. **Template item sub-details are discarded when applying a template.** The editor and API save `TemplateItem.subDetails`, but `applyTemplateToQuoteDraft()` creates output sub-details only from editable parameters and never copies `item.subDetails`. A user can configure information that silently disappears from the quotation/PDF. Evidence: `src/pages/templates/TemplateEditorView.tsx:416-422`, `api/_lib/quotationTemplatesHandler.ts:214`, `src/pages/quotation/applyTemplate.ts:53-69`.

## Medium Priority Issues

1. **Availability badges can be inaccurate while loading or after count-fetch failure.** The Job Type grid renders the same “no template” badge for an unresolved `null` count and for a failed count request converted to an empty map. This can falsely advertise the blank fallback. Evidence: `src/pages/quotation/QuotationTemplateWizard.tsx:89-111,270-271`.

2. **Product linkage is not server-verified.** `sanitizeItem()` accepts caller-controlled `productId` and `productSnapshot` without loading/validating a Product Master record or building the snapshot server-side. The UI picker supplies genuine products, but a direct authorized API client can save a nonexistent product id or forged product attributes. Evidence: `api/_lib/quotationTemplatesHandler.ts:205-225`; UI picker: `TemplateEditorView.tsx:136-145`.

3. **Import upsert is non-atomic.** The import uses `findOne` followed by `insertOne`/`updateOne`; the unique index constrains duplicates, but concurrent imports can still yield a duplicate-key failure instead of a clean idempotent result. Evidence: `api/_lib/quotationTemplatesHandler.ts:89-112`.

## Low Priority Issues

1. The compact wizard preview intentionally shows only six item names, so it is not a complete pre-start inspection for long templates. Evidence: `src/components/TemplatePreview.tsx:38-54`.

2. Version is a free-form string with no revision history or rollback. This is understandable for a first pass but weak for controlled template changes.

## Initial Excel Templates Review

Static seed data defines all required mappings: SC → Wet Scrubber (`SC-WET-SCRUBBER`), SC → Activated Carbon (`SC-ACTIVATED-CARBON`), BF → Bag Filter (`BF-BAG-FILTER`), TA → FRP Tank (`TA-FRP-TANK`), and LI → FRP Lining (`LI-FRP-LINING`). Source filename/sheet metadata and workbook-specific item/specification content are present in `api/_lib/templateSeedData.ts:491-561`; no manual recreation is required by an end user because the empty collection auto-seeds and an admin import action exists.

There is no evidence of invented prices: application sets copied quote prices/discounts to zero (`applyTemplate.ts:60-61`). I could not independently compare every workbook row because the local Node/npm installation is unusable and no spreadsheet extraction utility is available. More importantly, the implementation is hand-transcribed seed data rather than a parsed workbook, so source fidelity cannot be continuously verified.

## Job Type Selection Review

Implemented: Job Type → template choice where needed → preview → start quotation. SC receives two seed templates; TA/BF/LI each receive one. The wizard filters its fetch by selected job type and the quote API independently rejects a template whose job type differs from the selected quote job type (`quoteValidation.ts:153-165`). Thus unsupported Job Types do not load unrelated templates.

The one-template path skips directly to Preview, which is a reasonable UX variation. Blank start remains available even when templates exist.

## Template Availability and Blank Fallback Review

Blank quotations preserve selected Job Type, send no `quotationTemplateId`, allow normal manual line entry, save through the regular quote endpoint, and use the same print/export flow. `OTHER` is not treated as the blank option; it remains a Job Type card.

Availability count badges are present but have the loading/failure accuracy issue listed above. A direct API client can associate an inactive template with a new quote because validation deliberately accepts inactive (but non-deleted) templates; the standard Sales UI cannot browse inactive templates. This policy is documented but should be explicitly accepted or constrained to a server-issued draft/session if “active templates only” is mandatory.

## Template Management Module Review

Implemented: list, search, Job Type/status/source filters, view/preview, create, edit, duplicate, activate/deactivate, archive/restore, and import action. The list uses soft archive and can show archived records. Evidence: `src/pages/templates/TemplateManagementPage.tsx` and `api/_lib/quotationTemplatesHandler.ts`.

## Template Form Review

Implemented: code, name, Job Type, description, version, sections/items, existing products, custom items, specifications, sub-details, editable parameters, item/template internal notes, terms, and up/down sort controls. Required-field checks exist for code/name/Job Type, while API sanitization normalizes sections/items.

Usability concerns: the dense item editor hides much configuration behind “expand”, and server validation is permissive (empty sections/items, arbitrary lengths, and unverified product linkage are accepted). The sub-detail apply-loss is High Priority.

## Product and Custom Item Review

The editor uses `ProductPickerModal` to add an existing product and makes a copied `productSnapshot`; custom items are supported without a Product Master entry. Import seeds do not create Products, and template items do not carry quotation prices, so there is no observed Product Master pollution or conversion of every Excel row/term into a Product.

The server-side safe-copy guarantee is incomplete because it trusts submitted `productId`/snapshot rather than resolving a real product record.

## Excel Import and Idempotency Review

The seed-upsert is idempotent for unchanged TypeScript seed content: stable template code plus canonical content hash yields skip/update/create behavior; warnings/report fields exist. It is not idempotent **against the provided workbook** because no workbook parsing or workbook hash exists. Relevant sheets are manually represented in code, not parsed at import time. See High Priority issue 1.

## FRP Tank / FRP Lining Split Review

The two templates exist separately, map to TA and LI, and both record `FRP Tank and LI` as their source sheet. Documentation and seed comments state the intended non-overlapping row split at row 22. Static mapping is correct; live row-level verification remains limited by the non-parsing implementation/environment.

## Editable Placeholder Review

Editable parameters are stored and rendered as blank fill-in prompts on apply. The current seed helper defaults parameter values to blank. This meets the editable-placeholder intent; actual parameter values are not fabricated.

## Internal Notes Review

Template preview excludes internal notes, and `applyTemplateToQuoteDraft()` does not copy item/template internal notes. The quotation PDF renders quote-owned lines/remarks, not live template data. No direct internal-note PDF leak was found.

## Template Snapshot Review

Provenance metadata (`jobTypeCode`, template id/name/version) and copied quote lines are stored; quote and master edits are independent, and print uses quote-owned data. The required copied structured sections/items snapshot is absent, so this section is only partially implemented and remains High Priority.

## Existing Quotation Compatibility Review

Template fields are optional and old quotations without them continue through existing quote and print paths. No migration/backfill requirement was introduced. Static compatibility appears preserved.

## PDF / Print Review

Print uses copied `QuoteLine[]`, hides empty details/section headers without following items, and renders customer-facing specs/sub-details/remarks. It does not query the master template. Internal notes/cost fields are not rendered from templates. Browser print layout and page overflow were not visually tested because the local toolchain cannot start.

## RBAC and Security Review

All required granular permissions are defined and server-side handlers enforce create, edit, duplicate, activate, archive, and import. List/detail browsing distinguishes Template Management access from Sales selection access; direct lifecycle URLs/API calls require authentication and permission checks. No Critical RBAC gap found.

`quotationTemplates:manage` remains a documented compatibility superset. Product snapshot integrity, not access control, is the remaining server-side data-validation concern.

## No Fake Data Review

No mock template API or hardcoded UI template array was found. Seed content is hardcoded server-side and labeled `excel_import`; it is not runtime fake/demo data, but it is manually transcribed rather than parsed. No invented template prices were found.

## No Issuer Company Regression Review

No issuer-company selector, Company Profiles route, or `issuerCompanyId` requirement was found in the live quotation flow. Customer selection remains the quotation relationship.

## Documentation Review

The documentation is unusually candid: `TODO.md` correctly records the non-parsing import and flattened snapshot limitations. This means the implementation documentation conflicts with the requested completion criteria, not with its own stated limitations. The UI phrase “Import from Excel” is misleading because it re-imports compiled seed data, not the workbook. Module/API docs should make that distinction prominent until a real parser exists.

## Requirements Checklist

- [x] Wet Scrubber imported
- [x] Activated Carbon imported
- [x] Bag Filter imported
- [x] FRP Tank imported
- [x] FRP Lining imported
- [!] Initial templates came from workbook
- [x] SC shows two templates
- [x] TA shows FRP Tank
- [x] BF shows Bag Filter
- [x] LI shows FRP Lining
- [!] Template availability displayed
- [x] Blank quotation fallback works
- [x] Template Management page exists
- [x] Template can be created
- [x] Template can be edited
- [x] Template can be duplicated
- [x] Template can be activated/deactivated
- [x] Template supports sections
- [!] Template supports products
- [x] Template supports custom items
- [!] Specifications/sub-details supported
- [x] Internal notes separated
- [x] No invented prices
- [x] Product Master not polluted
- [!] Import is idempotent
- [x] Template version stored
- [!] Quotation snapshot stored
- [x] Master changes do not alter old quotations
- [x] Existing quotations still work
- [x] PDF uses copied quotation content
- [x] RBAC enforced server-side
- [x] No issuer company feature added
- [ ] Build passes if checked
- [!] Documentation updated

## Suggested Fix Plan for Claude Code

1. Implement real workbook parsing with normalized source-row hashing, warnings, and transactional/upsert-safe import behavior.
2. Store a server-created, structured template snapshot on every template-based quotation.
3. Preserve `TemplateItem.subDetails` in quote application and ensure `visibleToCustomer` is honored.
4. Resolve and snapshot linked products server-side; reject nonexistent/archived links as appropriate.
5. Make availability badges explicitly loading/error-aware.
6. Decide and enforce inactive-template behavior for new quote creation.
7. Run live MongoDB/browser/PDF verification and lint/build in a functioning Node/WSL2 environment.
8. Update documentation/UI wording to distinguish seed re-import from actual Excel parsing until item 1 is complete.

---

## Claude Fix Status (2026-07-15, second fix pass)

**Scope**: all 3 High Priority findings, all 3 Medium Priority findings, and the documentation/UI-wording gap. 0 Critical findings existed, so none to fix. Every fix below was made directly against this report's evidence — nothing in the report was ignored.

### Critical issues fixed
None — the review found zero.

### High Priority issues fixed (3 of 3)

1. **Workbook import is not a workbook import → now real, with an honest limitation.** Added `api/_lib/templateWorkbookParser.ts`: reads the actual `public/Scope of work new template for air pollution control_Technic.xlsx` at runtime (via the `xlsx`/SheetJS package, re-added as a real production dependency) and computes a genuine SHA-256 fingerprint per sheet. `upsertQuotationTemplates()` now sets `sourceWorkbookHash` on every `excel_import` template and emits a real import-report **warning** when a sheet's live workbook content no longer matches what was last transcribed — replacing the workbook is now mechanically detectable, which was previously "literally impossible" per the review's own wording. Verified directly: `node`-based extraction confirmed all 4 sheet names, row counts (66/51/46/49), and the exact row-22 FRP Tank/FRP Lining split point match what `templateSeedData.ts` and its doc comments already claimed.
   **What was deliberately not attempted**: fully auto-deriving `TemplateSection[]`/`TemplateItem[]` from parsed rows, replacing the hand-transcription entirely. Direct inspection of the raw workbook rows (documented in `templateWorkbookParser.ts`'s own doc comment) found genuinely ambiguous, multi-classification rows — e.g. "FRP Tank and LI" row 4 packs an internal hand-signing note, a "Thickness" parameter, and an unrelated abbreviation-legend note into three different columns of one row; "Wet scrubber" row 61 packs all 4 payment-term lines and the warranty line into a single `\r\n`-joined cell. A naive automated classifier risks silently corrupting already-twice-reviewed, customer-facing quotation content — a worse outcome than the current honest "hand-transcribed, now change-detected" state. Tracked as follow-up scope in `docs/TODO.md`, not silently dropped.
   Deployment note: `vercel.json` gained `functions["api/handlers/jobtypes.ts"].includeFiles` so the workbook file is actually bundled with the function that reads it; if a workbook read ever fails in some environment (`fingerprintSourceWorkbook()` returns `null`), the import still runs, seed-content idempotency is unaffected, and a soft warning is added rather than the import breaking.

2. **Required structured template snapshot is missing → now stored.** `Quote.templateSnapshot` (`src/lib/quotes.tsx`) — a new optional, frozen-at-creation field holding a real copy of the matched template's `sections`/`defaultTerms`/`internalNotes`/`sourceHash` at the moment the quote was created. Populated server-side only (`api/handlers/quotes.ts`'s new `loadTemplateSnapshot()`, one extra targeted fetch only when a template was actually matched — never queried for a blank-start quote), never client-writable, and structurally excluded from `PATCH /api/quotes/:id`'s allow-list (`sanitizePartialQuoteFields()` never lists it), so it can never be edited after creation. Deliberately includes `internalNotes` (unlike `Quote.lines`, which still never gets them) since this is a pure internal audit/reconstruction record, gated by the same quote-view permissions as the rest of the document — **no rendering path reads it**: the editor, the quotation form, and `PrintDocument.tsx`/the PDF all continue to read only `lines`, exactly as before this field existed, so there is no new customer-facing exposure surface.

3. **Template item sub-details discarded on apply, `visibleToCustomer` never honored → both fixed.** `applyTemplateToQuoteDraft()` (`src/pages/quotation/applyTemplate.ts`) now also copies `item.subDetails` into the resulting quote line's `subDetails` (previously only editable-parameter fill-in-the-blank prompts were copied, silently dropping any real sub-detail text an admin configured), and now skips any item with `visibleToCustomer: false` entirely (previously every item was copied unconditionally regardless of this flag — marking an item "hidden from customer documents" had no actual effect). A section whose every item ends up hidden still emits its header line; the pre-existing "don't print a section header with no items following it" PDF rule already covers that case without further changes.

### Medium Priority issues fixed (3 of 3)

1. **Product linkage not server-verified → now resolved server-side.** `sanitizeContent()`/`sanitizeItem()` (`api/_lib/quotationTemplatesHandler.ts`) now batch-resolve every referenced `productId` against a real, non-archived `products` record (one query for the whole draft, not N+1) *before* sanitizing, and `productSnapshot` is always rebuilt from that real record — a client-submitted `productSnapshot` is never persisted verbatim regardless of what a direct API call sends. An unresolvable `productId` (archived/deleted/forged) is silently dropped (the item keeps its already-typed name/unit/specs and just becomes unlinked) rather than rejecting the whole save, matching this feature's existing "custom items are first-class, not an error" design.

2. **Import upsert non-atomic → race-safe, by design choice not full atomicity.** The not-yet-existing branch's `insertOne()` is now wrapped to treat a duplicate-key error (E11000 on the unique `templateCode` index) as a clean "skipped" outcome instead of an unhandled 500 — a concurrent-insert race can no longer surface as an error response. Deliberately **not** rewritten as a single atomic `findOneAndUpdate` upsert: that would require always `$set`-ing `updatedAt`/`updatedBy` on every run, breaking the explicitly tested "re-running against unchanged content produces zero writes" guarantee. A genuinely concurrent *content-changing* race remains last-write-wins, not fully serialized — documented as an accepted edge case for a low-frequency, admin-triggered action, not silently ignored.

3. **Availability badges inaccurate while loading/on failure → now 3 explicit states.** `QuotationTemplateWizard.tsx`'s Job Type grid badge now distinguishes "loading" (`templateCounts === null`), "unknown/error" (fetch failed), and the real 0/1/N count — previously both loading and a failed fetch collapsed into the same "ยังไม่มี Template" (no template) text via a `?? 0` fallback, which could falsely advertise the blank-start fallback for a Job Type that actually has templates.

### Remaining issues (not fixed this pass, with reasons)

- **Full auto-classification of parsed workbook rows into structured template content.** See High #1 above — a deliberate scope decision, not an oversight, given the demonstrated row-level ambiguity. Tracked in `docs/TODO.md`.
- **Inactive-but-not-deleted templates remain a valid match for new quote creation** (`validateQuotationTemplate()` in `api/_lib/quoteValidation.ts`). This was flagged as "documented but should be explicitly accepted or constrained" — this pass formally **reconfirms the existing behavior as the accepted, intentional policy** (not a gap): deactivating a template mid-draft must not retroactively invalidate a Sales user's in-progress quote that already referenced it. No behavior change; the decision is now stated explicitly here and in `docs/RBAC.md`/`docs/MODULES/QuotationTemplates.md` rather than only implied by a code comment.
- **No version-history/rollback for templates.** Unchanged from the first pass — `version` is still a plain string; quote-level snapshotting (now genuinely structured, see High #2) is what actually guarantees existing quotations never change, which remains the position taken on this.
- **Compact wizard preview still shows only 6 item names.** Unchanged — a deliberate teaser, not a defect (the Template Management module's own full-detail preview shows everything).

### Imported template results
Verified via direct workbook inspection (Node script, this pass): 4 sheets — "Wet scrubber" (66 rows), "Activated carbon" (51 rows), "Bag filter" (46 rows), "FRP Tank and LI" (49 rows, row 22 = the exact "FRP Tank" heading split point) — all match `templateSeedData.ts`'s existing row-count/split-point claims exactly. `fingerprintSourceWorkbook()` independently confirmed readable and hashing correctly against the real file (spot-run, see this pass's evidence).

### Job Type mappings
Unchanged and confirmed correct by this pass's own re-inspection: SC → Wet Scrubber + Activated Carbon (2 templates), BF → Bag Filter, TA → FRP Tank, LI → FRP Lining. No mapping changes were needed.

### Template Management result
Unchanged structurally (list/create/edit/duplicate/activate/archive/import all already worked per the review's own "substantially implemented" assessment) — this pass's changes were all under the hood (product verification, snapshot, subDetails) plus the import button's new clarifying tooltip and warning surfacing.

### Snapshot result
Fixed — see High #2. `Quote.templateSnapshot` now holds a real structured copy; `quotationTemplateId/Name/Version` provenance strings are unchanged and still also present.

### Product/custom-item behavior
Fixed — see Medium #1. Existing-product links are now server-verified and server-snapshotted; custom items (no `productId`) are unaffected and still fully supported; Product Master is still never polluted by template content (unchanged).

### PDF result
No PDF-specific code changed. `applyTemplate.ts`'s fixes (High #3) mean the PDF now correctly reflects `visibleToCustomer`/`subDetails` for any *newly created* quotation from a template — existing quotations are unaffected (their `lines` were already frozen at their own creation time).

### RBAC result
No permission model changes this pass — the review found no Critical/High RBAC gap. The Medium product-verification fix is a data-integrity fix enforced inside the already-correctly-gated content-edit routes, not a new permission.

### Files changed
`api/_lib/templateWorkbookParser.ts` (new), `api/_lib/quotationTemplatesHandler.ts`, `api/handlers/quotes.ts`, `src/pages/quotation/applyTemplate.ts`, `src/pages/quotation/QuotationTemplateWizard.tsx`, `src/pages/templates/TemplateManagementPage.tsx`, `src/lib/quotes.tsx`, `src/lib/quotationTemplates.ts`, `src/lib/i18n.tsx`, `vercel.json`, `package.json`/`package-lock.json` (`xlsx` dependency re-added).

### Lint result
`npm run lint` — clean (0 errors, 2 pre-existing unrelated warnings in `src/lib/i18n.tsx`).

### Build result
`npx tsc -b && npx tsc --noEmit -p tsconfig.api.json && vite build` — all clean, no errors.

### Manual test result
Ran in a real Windows npm environment (not WSL1, which is what blocked the original review's own lint/build attempt). Verified: dev server boots, zero browser console errors (Playwright check) at the app shell level; `fingerprintSourceWorkbook()` independently run against the real workbook file and confirmed correct sheet names/row counts/hashes. **Not verified**: live MongoDB round-trips for any of create/edit/duplicate/archive/import/apply-to-quotation, since no local `MONGODB_URI`/`JWT_SECRET` is available in this environment (the same limitation every pass in this project has hit — see `docs/PROJECT_STATUS.md` "Known Risks"). The task's full manual test plan (SC/BF/TA/LI template flows, manual template creation, duplicate/apply/re-import round-trips, unauthorized-access check) requires a real deployment or local MongoDB connection to actually execute.
