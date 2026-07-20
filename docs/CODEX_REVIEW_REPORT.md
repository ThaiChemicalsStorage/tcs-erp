# Codex Review Report

**Review date:** 2026-07-20
**Scope:** Review-only audit of the uncommitted FRP Lining (`LI`) quotation-template implementation. Application source, configuration, dependencies, tests, schemas, seed data, and package files were not modified.

## Executive Summary

**Recommendation: do not approve yet.** The implementation correctly introduces a reusable dynamic-field model, seeds a single `LI-FRP-LINING` v2.0 template, carries selected values into a server-created quotation snapshot, preserves the existing VAT calculation path, and applies existing template/quotation RBAC gates. The seed’s dropdown order, safety defaults, payment presets, default note, and most conditional rendering rules match the stated requirements by static inspection.

One High issue prevents acceptance: selecting **Concrete Surface Repair: No** does not remove Prepare Surface from customer output. The normal print/PDF renderer still emits the section header, the Prepare Surface line, and the literal `Concrete Surface Repair: No`. This directly contradicts the required customer-facing behavior and can expose an excluded scope/charge.

One Medium issue remains in master-template API validation: server sanitization accepts structurally invalid dynamic-field definitions (including empty option sets, duplicate keys, and dangling conditional references) rather than rejecting them. That makes the new generic admin feature able to persist templates whose UI, quote validation, and print behavior are inconsistent.

Static review completed; live database, authenticated browser, preview/print/PDF, RBAC execution, responsive/mobile, browser-console, import/idempotency, and all requested manual permutations were not executable in this environment. `npm run lint` and `npm run build` could not start because the host Node/npm launcher exits with `WSL 1 is not supported. Please upgrade to WSL 2 or above.`

Counts: **0 Critical, 1 High, 1 Medium, 0 Low.**

## Critical Issues

None found.

## High Priority Issues

### Prepare Surface remains in the customer document when Concrete Surface Repair is No

- **Severity:** High
- **File path:** `src/pages/quotation/PrintDocument.tsx`, `dynamicFieldPrintLines()` and `sectionHeaderHasItems()`; seed rule in `api/_lib/templateSeedData.ts`, Prepare Surface section
- **Component, function, route, or approximate line:** Print/PDF line loop around lines 200–255; `concreteSurfaceRepair` is a normal radio field around seed lines 504–510.
- **Observed behavior:** `visibleFields()` retains the radio field for either value. With `no`, `formatFieldDisplay()` produces `Concrete Surface Repair: No`; `lineHasDetails()` is true, so the detail row is printed. `sectionHeaderHasItems()` only checks whether the next line is non-header, so it also prints the `Prepare Surface` heading and priced item.
- **Expected behavior:** When No is selected, the entire Prepare Surface section must be absent from customer-facing Preview/Print/PDF: no heading, line, price row, `Concrete Surface Repair: No`, blank detail row, or residual spacing.
- **Business impact:** A quotation can show a surface-preparation scope and its charge after the salesperson explicitly excluded it. This is commercially misleading and risks disputes or incorrect quoted totals.
- **Security or data impact:** No privilege escalation. The snapshot retains the No selection correctly, but its customer rendering is wrong.
- **Reproduction steps:** Apply `LI-FRP-LINING`; expand Prepare Surface; select No; save/open the quote; use Print or PDF. Static trace predicts a Prepare Surface heading/line and a pinned `Concrete Surface Repair: No` detail.
- **Suggested fix direction:** Add an explicit, snapshot-backed section/line inclusion rule for this business condition and apply the same rule to all customer-facing renderers. Determine section eligibility before emitting both the header and item rows; do not rely only on field visibility. Retain the field in the editable quotation snapshot for internal editing/audit if needed.

## Medium Priority Issues

### Template API persists invalid dynamic-field schemas instead of validating their structure

- **Severity:** Medium
- **File path:** `api/_lib/quotationTemplatesHandler.ts`
- **Component, function, route, or approximate line:** `sanitizeDynamicField()` / `sanitizeVisibilityRule()` around lines 256–328; used by `POST/PATCH /api/quotation-templates` via `sanitizeContent()`.
- **Observed behavior:** The server accepts dropdown/radio/checkbox fields with `options: []`; does not reject duplicate field keys or option keys; and stores `visibleWhen.fieldKey`/`equalsAny` without verifying that the controlling field exists on the same item, has a compatible type, or declares the referenced options. It silently drops malformed option labels rather than returning a field-level validation error.
- **Expected behavior:** Server-side template payload validation must guarantee a usable schema: unique non-empty field/option keys, at least one option for option-based controls, valid same-item conditional references, and valid referenced option keys. Invalid admin input should return a clear 400/422 without modifying the master template.
- **Business impact:** An authorized template editor can save a template whose field is never visible, whose dropdown has no selectable value, or whose conditional behavior breaks after subsequent edits. That undermines the reusable master-template feature and can create bad quotation snapshots.
- **Security or data impact:** This is an integrity/validation weakness rather than an unauthorized access bypass. It persists malformed business configuration into MongoDB and can cause inconsistent client, server, and document behavior.
- **Reproduction steps:** With template-edit permission, submit a direct `PATCH /api/quotation-templates/:id` body containing one dynamic dropdown with no options, duplicate `key` values, or a text field with `visibleWhen: { fieldKey: "missing", equalsAny: ["x"] }`. Current sanitization accepts and stores it.
- **Suggested fix direction:** Validate the fully sanitized item schema as a second pass before persistence. Reject invalid structure with field-specific errors; keep IDs/keys stable and do not silently repair semantic configuration. Add unit tests for empty options, duplicate keys, dangling references, and invalid `equalsAny` values.

## Low Priority Issues

None found.

## Feature-Specific Review Sections

### Template identity, idempotency, and chargeable sections

Static review completed. The seed defines `templateCode: "LI-FRP-LINING"`, `templateName: "FRP Lining"`, `jobTypeCode: "LI"`, and version `2.0`. The existing importer keys on `templateCode`, has a unique MongoDB index, hashes the changed seed content, and updates/skips rather than creates on a repeated unchanged import. This is consistent with stable-code and no-duplicate requirements, but no live import/database verification was possible.

The three seeded sections are in required order: FRP Lining, Prepare Surface, Safety Cost and Accessories. Each produces an ordinary editable `QuoteLine`; `LineItemsEditor.tsx` exposes Unit and Selling Price (`unitPrice`) for each. Static behavior supports the existing line-item calculation model. The High issue above means Prepare Surface’s customer inclusion logic is not correct when No is chosen.

### FRP Lining fields

Static review completed. `FRP Lining for` is a dropdown in required order: New Concrete, Existing Concrete, Stainless Tank, Steel Tank, FRP Tank. Tank Size is a free-text field visible only for the three Tank values; Resin Type is a free-text field visible only for Vinyl Ester Resin. Thickness is a numeric value with `mm`, and client `min=0` plus server number validation rejects negatives. Corrosion Layer is a dropdown with Vinyl Ester, Iso Phthalic, Ortho Phthalic options. Chemical, Temperature, and Colour are editable text fields. `formatFieldDisplay()` omits blank values and `visibleFields()` omits hidden fields from printed details.

Rendered interaction and every option permutation were not tested in a browser.

### Prepare Surface

Static review confirms Surface Preparation Method is a dropdown with Grinding, Sandblasting, and Sandblasting SA2.5 in order; Concrete Surface Repair is implemented with radio inputs; and its details field is visible only for Yes. The required No customer-output behavior fails as documented in High Priority Issue 1. Consequently, the claimed absence of an empty heading/spacing is also not satisfied.

### Safety Cost and Accessories / Included / Excluded

Static review completed. The Standard Package string is seeded exactly as `Standard Package Included PPE, Blower, Gas Detector`. The checkbox options and order are Medical Certificate, Confined Space Certificate, Working at Height Certificate, SCBA, Tripod. Defaults match the requested selected/unselected states. Confined Space Role is conditional on the selected certificate and exposes exactly 1–4 Roles.

The shared formatter preserves option order and produces the required default static strings: `Included Medical Certificate, Working at Height Certificate` and `Excluded Confined Space Certificate, SCBA, Tripod`. It appends a role only to a checked Confined Space option, so an unchecked option’s stale role value is not customer-facing. Raw checkbox controls are not rendered by `PrintDocument.tsx`. Live checkbox, role, snapshot, and PDF tests remain unperformed.

### Notes and Conditions

Static review completed. The seed default note exactly matches the supplied Thai sentence. `ConditionAndNotesEditor.tsx` supports add, edit, remove, and up/down reorder of quote notes; quote writes allowlist/sanitize notes; blank notes are filtered from print; internal template notes are not passed to customer output. Application copies notes/condition values into the quote draft and the server does not accept template snapshot mutation on quote PATCH, supporting master/snapshot isolation.

VAT text is a customer-visible condition string and `computeTotals()`/server quote amount calculation are unchanged. Warranty starts blank, shows a red field-specific UI warning, remains non-blocking for Draft saving, and is omitted from print when blank. Delivery permits empty/null and server rejects negatives. The exact three Payment presets are seeded in order; choosing one replaces the editable quote-level payment text, and print emits the final text only.

Actual editing, reorder, draft-save, switching-preset, and print behavior was not executed.

### Snapshot, Preview, Print, and PDF

Static review completed. On quote create, the server loads the selected template and freezes `sections`, terms, internal notes, source hash, and conditions in `Quote.templateSnapshot`; dynamic values are validated against those frozen sections on create/PATCH/workflow. Existing quotes are rendered from their own snapshot, not a live template read. Quote PATCH uses an explicit allowlist and does not accept template provenance/snapshot fields. No destructive migration was found.

`TemplatePreview.tsx` is a master-definition preview. Customer document rendering flows through `PrintDocument.tsx`, which reads the snapshot sections passed by `QuoteDocument.tsx`. The print markup uses a table with header repetition compatible with multi-page browser print, but multi-page printing/PDF export itself was not manually tested. The High issue proves that customer output cannot yet be accepted.

## API / Database Review

Quote dynamic values are rebuilt from the frozen source item schema. Unknown dynamic keys do not persist; dropdown/radio values outside declared options are rejected; checked checkbox keys are filtered to declared options; number fields reject negatives; `deliveryDays` rejects negatives. Quote PATCH/create/workflow paths explicitly allowlist fields, preventing arbitrary MongoDB document-field injection through request-body spreading.

The new master template model stores sections, item fields/types/options/order/defaults/conditional rules, default notes, conditions, version, and status. The Medium finding means the structural validity of that model is insufficiently enforced. No destructive migration, new collection, or incompatible required property was found; all new fields are optional for older templates/quotes.

Direct API tests were reasoned through from source, not executed against a running API.

## RBAC / Security Review

Static review completed. UI gating in `App.tsx`/Template Management uses existing `quotationTemplates:*` permissions. Server routes independently require template create/edit/activate/archive/import/duplicate permissions, and the PATCH handler checks each touched dimension rather than trusting the UI. Quote updates require quotation edit plus owner/approver authority; template provenance/snapshot and protected workflow fields are not accepted in normal quote edits. Sales users can access active templates for quotation creation but not admin template content functions without the corresponding permission.

No new RBAC bypass or request-body mass-assignment of protected template status/version was found. Runtime role tests were not performed.

## UI / UX Review

Static review confirms field-control types: dropdowns for `>>` groups, radios for Yes/No, and fixed checkboxes for Safety. Dynamic controls are inside the line’s expandable details panel; conditional controls are filtered before render. Unit and Selling Price are available in the main line row. Warranty warning is red and field-specific. The existing shell remains; no full-page skeleton was added.

Usability risk: essential FRP controls are hidden behind the line’s note/details expander rather than shown with the main chargeable fields. This is not recorded as a separate defect without rendered testing, but should be assessed in manual desktop/mobile testing. Browser responsiveness, no-horizontal-scroll, shell loading order, console errors, and visual consistency were not verified.

## Performance Review

No evidence-based performance regression found. A quotation uses its frozen template snapshot, avoiding live master reads for existing quotes. Schema resolution is a small in-memory section/item scan during line render/validation; the three-item FRP seed makes its current cost negligible. Template product lookup remains batched. No duplicate snapshot write was found: one snapshot is produced on quote creation only. No client-side filtering of a large dataset or duplicate PDF calculation was introduced.

## Existing Data Compatibility Review

Static review completed. Dynamic fields, notes, and condition properties are optional, so templates and quotations created before this change remain readable. Historical quotations retain their own snapshot. The import updates the same natural key rather than deleting/recreating it. No destructive migration or update of historical quote records was added.

The new master-schema validation gap can affect newly edited templates; it does not itself mutate existing records.

## Documentation Review

Required project references were reviewed when present: root/docs CLAUDE guidance, PROJECT_STATUS, CHANGELOG, TODO, ARCHITECTURE, DATABASE, API, RBAC, UI guidelines, implementation checklist, current report, and the latest dated review reports. The FRP documentation is detailed and records the lack of live DB testing.

However, `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, and `docs/MODULES/QuotationTemplates.md` overstate completion by saying hidden fields leave no customer-facing heading/row and by treating the feature as cleanly verified against requirements. They do not account for the Prepare Surface No output path found above. Documentation should be corrected only after the implementation is corrected and manually verified.

## Requirements Checklist

- [x] Completed — FRP Lining Template exists under `LI`
- [!] Partially implemented — Template creation is idempotent
- [!] Partially implemented — No duplicate Template exists
- [x] Completed — Three chargeable sections support Unit and Selling Price
- [x] Completed — Every `>>` group uses a Dropdown
- [x] Completed — Tank Size conditional behavior is correct
- [x] Completed — Resin Type conditional behavior is correct
- [x] Completed — Concrete Surface Repair uses Radio controls
- [ ] Missing — Concrete Surface Repair is omitted when No is selected
- [x] Completed — Safety Checkboxes use correct defaults
- [x] Completed — Confined Space Role supports 1–4
- [x] Completed — Included output is correct
- [x] Completed — Excluded output is correct
- [x] Completed — Required output order is preserved
- [x] Completed — Notes are editable
- [x] Completed — VAT text does not change calculation logic
- [x] Completed — Empty Warranty shows a red warning
- [x] Completed — Draft saving works with empty Warranty
- [x] Completed — Delivery is editable
- [x] Completed — Payment contains all three presets
- [x] Completed — Payment text remains editable
- [x] Completed — Quotation snapshot is independent
- [x] Completed — Existing Templates remain compatible
- [!] Partially implemented — Preview works
- [!] Partially implemented — Print works
- [!] Partially implemented — PDF works
- [!] Partially implemented — RBAC is enforced
- [x] Completed — No fake or hardcoded business data was added
- [ ] Missing — Browser console has no new related errors
- [ ] Missing — Lint passes
- [ ] Missing — Build passes
- [!] Partially implemented — Documentation is updated

`[!]` for idempotency/no-duplicate, Preview/Print/PDF, and RBAC means source evidence is favorable but the required live verification was not performed; it is not a confirmed pass.

## Suggested Fix Plan for Claude Code

1. **High — customer output omission for Prepare Surface.**
   - **Root cause:** Customer rendering treats `concreteSurfaceRepair` as an ordinary visible radio field and section headers only know whether an adjacent line exists.
   - **File or module:** `templateSeedData.ts`, `templateDynamicFields.ts`, and `PrintDocument.tsx` (plus any screen-preview customer renderer).
   - **Recommended correction:** Model/derive a quote-snapshot-backed inclusion rule for the Prepare Surface section when the radio is No. Filter the section and its chargeable line before header, line, detail, and total-facing document composition. Preserve the selection internally as appropriate.
   - **Verification steps:** Test Yes with details, Yes without details, and No. Confirm No prints none of the heading, priced line, radio text, blank detail row, or spacing; verify totals/line numbering and multi-page layout.
   - **Regression risks:** Avoid suppressing unrelated sections, mutating the master template, or hiding the editable internal control unintentionally.

2. **Medium — validate template dynamic-field schemas at the API boundary.**
   - **Root cause:** `sanitizeDynamicField()` normalizes individual fields but never validates relationships across an item schema.
   - **File or module:** `api/_lib/quotationTemplatesHandler.ts`.
   - **Recommended correction:** Add a schema validation pass after item sanitization. Enforce unique field/option keys, nonempty option catalogs for option controls, valid same-item `visibleWhen` targets/options, and coherent checkbox Included/Excluded configuration. Return field-specific validation errors rather than silently persisting malformed semantics.
   - **Verification steps:** Add tests/direct API checks for each invalid form and for the valid LI seed; confirm invalid requests make no write and valid imports/edits remain idempotent.
   - **Regression risks:** Existing manually-authored templates might contain incomplete dynamic definitions. Audit/repair such records or apply compatibility handling before making validation strict.

3. **Verification and documentation after fixes.**
   - **Root cause:** Current implementation evidence is primarily static; prior claims cannot substitute for this review’s runtime evidence.
   - **File or module:** Test environment and the listed documentation files.
   - **Recommended correction:** In a Node-capable environment with authorized MongoDB access, run lint/build, import twice, execute all 23 requested manual tests, inspect browser console, test UI/API RBAC roles, and generate a multipage PDF.
   - **Verification steps:** Record actual request results and screenshots/output values, particularly snapshot isolation after a master-template edit.
   - **Regression risks:** Do not alter live master/historical data during verification; use a dedicated test template/quotation or restore-safe environment.

## Claude Fix Status

**Fix date:** 2026-07-20
**Scope:** Fixed the 1 High and 1 Medium issue this report identified in the uncommitted FRP Lining (`LI-FRP-LINING` v2.0) dynamic-field implementation. 0 Critical, 0 Low were reported — none to fix.

### Critical Issues Fixed

None reported.

### High Priority Issues Fixed

#### Prepare Surface remains in the customer document when Concrete Surface Repair is No

- **Root cause:** `formatFieldDisplay()` (`src/lib/templateDynamicFields.ts`) rendered every visible dropdown/radio field's raw current value unconditionally as `"{label}: {value}"`, with no way for a field's schema to say "this specific answer carries no informational content, never print it." Separately, `PrintDocument.tsx`'s per-line details `<tr>` was gated on `lineHasDetails()` (`src/lib/quotes.tsx`) — a general-purpose "does the on-screen editor's note icon light up" check that returns `true` for ANY raw dynamic-field value, including one whose customer-facing display is suppressed. Fixing only the display text without also fixing this gate would have left an empty, contentless details row printing on its own.
- **Files changed:** `src/lib/quotationTemplates.ts` (new `TemplateFieldOption.omitFromCustomerDisplay?: boolean`), `src/lib/templateDynamicFields.ts` (`formatFieldDisplay()` returns `null` when the selected option carries that flag), `api/_lib/templateSeedData.ts` (Concrete Surface Repair's `"no"` option sets `omitFromCustomerDisplay: true`), `api/_lib/quotationTemplatesHandler.ts` (`sanitizeFieldOption()` carries the new flag through), `src/pages/quotation/PrintDocument.tsx` (the details-row gate now checks actual printable content — `specifications`/`notes`/`subDetails`/the rendered dynamic-field lines — instead of `lineHasDetails()`), `src/pages/templates/TemplateEditorView.tsx` (the admin bulk-text options editor now preserves/edits the new flag via a `!` prefix convention, e.g. `!No`, so re-saving an unrelated change to the same field never silently drops it), `src/components/TemplatePreview.tsx` (annotates such options in the admin schema preview), `src/lib/i18n.tsx` (updated the options-textarea hint text for both languages).
- **Fix:** Selecting "No" for Concrete Surface Repair now omits that field's own `"Concrete Surface Repair: No"` line entirely from Preview/Print/PDF — no heading text, no stale detail row, no residual spacing. This is a fully generic mechanism (any current or future dropdown/radio option can opt in), not a one-off FRP-Lining-specific code path. The Prepare Surface item's priced line itself, and its "Surface Preparation Method" value, remain visible and billable — see "Codex Findings Determined Incorrect" below for why the whole section is deliberately NOT removed, which this report's own literal wording had called for.
- **Verification result:** Directly exercised the real `src/lib/templateDynamicFields.ts` and `api/_lib/templateSeedData.ts` modules (not a reimplementation) via a standalone `tsx` script against the actual `LI-FRP-LINING` v2.0 Prepare Surface schema, simulating Concrete Surface Repair = No, Yes (details blank), and Yes (details filled):
  - No → `["Surface Preparation Method: Sandblasting"]` — zero "Concrete Surface Repair" text, Surface Preparation Method still present.
  - Yes (blank details) → `["Surface Preparation Method: Sandblasting", "Concrete Surface Repair: Yes"]`.
  - Yes (details filled) → adds `"Concrete Surface Repair Details: Patch 3 cracks near drain"`.
  All three matched the required behavior exactly. `npm run lint` and `npm run build` (`tsc -b && tsc --noEmit -p tsconfig.api.json && vite build`) both pass clean. **Not independently re-verified this pass:** a live browser Print/PDF round-trip or a live MongoDB check — this sandbox still has no network path to MongoDB Atlas (`mcp__mongodb__list-databases` → "connection string is not valid"; no `MONGODB_URI`/`JWT_SECRET` in local `.env.local`), the same recurring limitation every prior pass in this project has hit and documented.

### Medium and Low Issues Fixed

#### Template API persists invalid dynamic-field schemas instead of validating their structure (Medium)

- **Root cause:** `sanitizeDynamicField()`/`sanitizeFieldOption()`/`sanitizeVisibilityRule()` (`api/_lib/quotationTemplatesHandler.ts`) each only ever inspected one field, one option, or one visibility rule in isolation — none had visibility into the rest of the item's field list, so none could catch a problem that only exists in the *relationship* between two fields on the same item (a duplicate key, a dangling cross-field reference, an option-based field with zero surviving options).
- **Files changed:** `api/_lib/quotationTemplatesHandler.ts` (new exported `validateDynamicFieldSchema(itemLabel, fields)`, called from `sanitizeItem()` whenever an item declares `dynamicFields`).
- **Fix:** A second validation pass now runs over an item's FULL sanitized `dynamicFields` array and throws a field-specific `400` (Thai message, naming the template item and field) instead of silently persisting: (a) a `dropdown`/`radio`/`checkboxGroup` field with zero options, (b) two fields on the same item sharing a `key`, (c) two options of the same field sharing a `key`, (d) a `visibleWhen.fieldKey` that doesn't name a real sibling field on the item, (e) `visibleWhen.equalsAny` values that don't match any real option key of the controlling field (when that field is option-based). Applies uniformly to both `POST /api/quotation-templates` and `PATCH /api/quotation-templates/:id` (both funnel through `sanitizeContent()` → `sanitizeSection()` → `sanitizeItem()`). No partial write: the whole request is rejected before anything is persisted if any single item in the payload fails.
- **Verification result:** Directly exercised the real (now-exported) `validateDynamicFieldSchema()` via a standalone `tsx` script against 7 cases: 5 malformed schemas — empty-options dropdown, duplicate field keys, duplicate option keys, dangling `visibleWhen.fieldKey`, `visibleWhen.equalsAny` referencing a nonexistent option — all 5 threw the expected `400` with a correctly field-specific message; 2 valid schemas — the real FRP Lining-shaped Prepare Surface fields, and an empty `dynamicFields` array — both passed with no throw. `npm run lint`/`npm run build` pass clean.

### Issues Not Fixed

None — both reported issues were reproduced and fixed (0 Critical, 0 Low were reported).

### Codex Findings Determined Incorrect

- **Finding:** "When No is selected, the entire Prepare Surface section must be absent from customer-facing Preview/Print/PDF: no heading, line, price row, `Concrete Surface Repair: No`, blank detail row, or residual spacing." (High Priority Issue 1's "Expected behavior.")
- **Evidence:** The governing task spec's own Acceptance Criteria checklist reads "Concrete Surface Repair is omitted when No is selected" — naming the *field*, not the section or its priced line. Inspecting the actual schema (`api/_lib/templateSeedData.ts`, Prepare Surface section) shows the "Prepare Surface" item carries TWO independent, unrelated dynamic fields on one priced line: `surfacePrepMethod` ("Surface Preparation Method" — Grinding/Sandblasting/Sandblasting SA2.5, the general, always-applicable surface-prep work) and `concreteSurfaceRepair` (a Yes/No flag specific to whether *additional* concrete repair is needed). These represent different scope: FRP Lining's own "FRP Lining for" dropdown (same template, FRP Lining section) includes Stainless Tank, Steel Tank, and FRP Tank options that have no concrete surface at all — for those jobs, Concrete Surface Repair is structurally "No"/not applicable, yet Surface Preparation Method (grinding/sandblasting of the metal/FRP surface) is still real, billable work that must still appear, with its price, on the customer document.
- **Correct business rule:** "No" omits only the Concrete Surface Repair field's own display line (and, unchanged from before this fix, its already-conditional `concreteSurfaceRepairDetails` field) — never the Prepare Surface section header, its priced line, or the Surface Preparation Method value/price.
- **Reason no broader code change was made:** Implementing the finding's literal "remove the whole section" reading would itself introduce a new, worse defect — silently zeroing out and hiding real, priced, always-applicable surface-preparation scope from the customer's quotation whenever Concrete Surface Repair happens to be No (which, per the above, is the *normal* case for 3 of the 5 "FRP Lining for" options). That would contradict both the acceptance checklist's own wording and ordinary FRP-lining business logic. The narrower fix implemented above resolves the actual, reproduced defect — "Concrete Surface Repair: No" wrongly appearing on the printed document — without introducing that regression.

### Files Changed

- `src/lib/quotationTemplates.ts`
- `src/lib/templateDynamicFields.ts`
- `api/_lib/templateSeedData.ts`
- `api/_lib/quotationTemplatesHandler.ts`
- `src/pages/quotation/PrintDocument.tsx`
- `src/pages/templates/TemplateEditorView.tsx`
- `src/components/TemplatePreview.tsx`
- `src/lib/i18n.tsx`
- `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, `docs/TODO.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/MODULES/QuotationTemplates.md`, `docs/CODEX_REVIEW_REPORT.md`, `docs/reviews/CODEX_REVIEW_2026-07-20.md` (documentation only)

### Lint Result

`npm run lint` (`eslint .`) — **PASS**. `0 errors, 2 warnings` — both pre-existing `react-refresh/only-export-components` warnings in `src/lib/i18n.tsx:1905,1912`, unrelated to this pass (same warnings present before this pass started).

### Build Result

`npm run build` (`tsc -b && tsc --noEmit -p tsconfig.api.json && vite build`) — **PASS**. No TypeScript errors in either the frontend or API project; Vite production build completes (`✓ built in ~3s`), no new chunk-size warnings.

### Manual Testing Result

- **Dropdowns / Radios / Checkbox defaults / Conditional fields / Included-Excluded output:** verified by directly executing the real `src/lib/templateDynamicFields.ts` + `api/_lib/templateSeedData.ts` modules with `tsx` against the actual `LI-FRP-LINING` v2.0 seed (not a reimplementation) — see High-fix verification above. All conditional-visibility and formatting rules produced exactly the required output, including the new suppression behavior.
- **Schema validation (Medium fix):** verified by directly executing the real, now-exported `validateDynamicFieldSchema()` against 5 malformed and 2 valid inputs — all 7 behaved as expected (see Medium-fix verification above).
- **Notes / Conditions / Pricing / Snapshot isolation / Preview / Print / PDF / RBAC / Browser console:** NOT independently re-verified this pass beyond static code reading (which found no additional defects in these areas beyond the two already reported and fixed above). This sandboxed session has no network path to MongoDB Atlas — `mcp__mongodb__list-databases` returned "The configured connection string is not valid," and no `MONGODB_URI`/`JWT_SECRET` exist in the local `.env.local` — so a live end-to-end browser round-trip (apply template → edit a quotation → Preview/Print/PDF → confirm master-template isolation) could not be run. This is the same recurring, previously-documented limitation every prior pass in this project has hit (see `docs/PROJECT_STATUS.md` "Known Risks") — not a new gap introduced by this fix pass.

Update the latest archive report in `docs/reviews/` — done: `docs/reviews/CODEX_REVIEW_2026-07-20.md` is kept byte-identical to this file after every review round (this project's established archive-report workflow), and this "Claude Fix Status" section is mirrored into it too.
