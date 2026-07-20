# Codex Review Report

**Review date:** 2026-07-20
**Scope:** Review-only audit of the FRP Lining quotation-template implementation. No application source, configuration, template data, schema, tests, or dependencies were modified.

## Executive Summary

Do not approve as fully compliant yet.

Static review confirms the FRP template is represented as three chargeable line items—FRP Lining, Prepare Surface, and Safety Cost and Accessories—with dynamic fields nested on those items rather than created as products. The quote-create route freezes the selected master template into a server-created snapshot, quote changes use that snapshot rather than the live master, and the API validates dynamic values against the frozen schema.

One confirmed Medium-priority scope violation remains: the Safety product adds `PPE, Blower, Gas Detector` business content not supplied in this requirement. Build, lint, browser, authenticated API, MongoDB, preview/print/PDF, and RBAC execution could not be completed in this environment because both requested npm commands fail before tooling starts: `WSL 1 is not supported. Please upgrade to WSL 2 or above. Could not determine Node.js install directory`.

Counts: **0 Critical, 0 High, 1 Medium, 0 Low.**

## Critical Issues

None found by static review.

## High Priority Issues

None found by static review.

## Medium Priority Issues

### Unrequested Safety package scope is embedded in the customer-facing product

- **File path:** `api/_lib/templateSeedData.ts`
- **Location:** `frpLiningSections` → `Safety Cost and Accessories` item, approximately line 529
- **Observed behavior:** The product includes the fixed specification `Standard Package Included PPE, Blower, Gas Detector`.
- **Expected behavior:** The supplied requirement only asks that Standard Package text always appear and explicitly prohibits adding business content. It does not request PPE, Blower, or Gas Detector.
- **Impact:** The quotation can promise extra safety equipment/services and create a commercial obligation outside the approved FRP Lining scope.
- **Reproduction steps:** Import/apply `LI-FRP-LINING`, then view the Safety product in Preview, Print, or PDF. The extra package text is copied into the quotation line’s customer-visible specifications.
- **Suggested fix direction:** Keep only the approved Standard Package wording. Do not infer or add package components unless the business requirement is updated with exact approved text.

## Low Priority Issues

None found by static review.

## Feature-Specific Review Sections

### Main-product structure

The seed defines exactly three ordinary, chargeable items, in order: `FRP Lining`, `Prepare Surface`, and `Safety Cost and Accessories`. The three section-header lines created during template application are non-chargeable presentation rows, not quotation products. Every actual item remains a normal `QuoteLine` with Unit and Selling Price (`unitPrice`) in `LineItemsEditor.tsx`.

Dropdowns, radio controls, checkboxes, and text/number inputs live in `TemplateItem.dynamicFields`; template application copies values to `QuoteLine.dynamicFields`. Dropdown options are schema options, not line items.

### FRP Lining

Static evidence supports the required structure:

- `FRP Lining for` is one dropdown with New Concrete, Existing Concrete, Stainless Tank, Steel Tank, and FRP Tank.
- Tank Size / Dimensions is visible only for Stainless Tank, Steel Tank, and FRP Tank.
- Thickness is an editable non-negative number with `mm.`.
- `Corrosion Layer` is one dropdown with Vinyl Ester Resin, Iso Phthalic Resin, and Ortho Phthalic Resin.
- Resin Type is visible only for Vinyl Ester Resin.
- Chemical, Temperature, and Colour are editable nested fields.

The controls are rendered inside the related main-line detail panel; no option is represented as a separate product. Browser interaction was not executed.

### Prepare Surface

The product has one Surface Preparation Method dropdown with exactly Grinding (เจียรขัด), Sandblasting, and Sandblasting SA2.5. Concrete Surface Repair is a Yes/No radio. Its details input is conditional on Yes.

The `no` option uses `omitFromCustomerDisplay`; `formatFieldDisplay()` suppresses the radio display and `PrintDocument.tsx` gates detail rows on actual rendered output. Static tracing supports no Concrete Surface Repair text or empty detail row when No is selected. Prepare Surface itself remains chargeable because its independent surface-method selection remains in scope.

### Safety

Checkbox order and defaults match the supplied list. The shared formatter preserves this order and statically produces:

`Included Medical Certificate, Working at Height Certificate`

`Excluded Confined Space Certificate, SCBA, Tripod`

Confined Space Certificate conditionally reveals one dropdown with 1 Role through 4 Roles, and the selected role is included inline only when that certificate is checked. The extra Standard Package content is the Medium issue above.

### Notes and Conditions

The default note exactly matches `ใบเสนอราคานี้สามารถหัก ณ ที่จ่ายได้`. Notes can be added, edited, removed, and reordered. Warranty starts blank and produces a red warning; Delivery is editable and allows blank/null; Payment has three seeded presets and the selected wording remains editable in the textarea.

The code contains VAT wording, but the prompt does not provide the exact required wording or the exact required payment-option strings. Exact business-text compliance for those values therefore cannot be independently established from the supplied requirement alone. No additional Condition input beyond VAT, Warranty, Delivery, and Payment was found.

## API / Database Review

The MongoDB master-template architecture is retained. On `POST /api/quotes`, the server fetches the selected template, creates `templateSnapshot` server-side, and validates line dynamic values against `templateSnapshot.sections`. Normal quote PATCH uses an explicit allowlist and does not accept `templateSnapshot`, template provenance, or arbitrary request properties for persistence.

The template API sanitizes dynamic fields and validates nonempty option sets, duplicate field/option keys, and conditional references. Quote dynamic values reject invalid dropdown/radio selections and non-negative numeric rules are enforced. Unknown dynamic keys are dropped rather than persisted.

No destructive migration was found. New snapshot/dynamic/notes/conditions fields are optional, so existing templates and quotations remain readable. Static review only; no live MongoDB import, snapshot-isolation round trip, or existing-data sample was available.

## RBAC / Security Review

Master-template create/edit/activate/archive/import/duplicate routes require the existing `quotationTemplates:*` permissions (or manage permission). Quote creation requires `quotations:create`; normal quote changes route through existing edit/owner/approval checks. Server-side sanitization avoids arbitrary MongoDB-field injection through these routes.

No new RBAC bypass was identified by code inspection. Role-based requests were not executed against a live authenticated environment.

## UI / UX Review

Static inspection shows the three chargeable items are distinguishable from section headers, controls are nested inside their associated line, conditional fields render immediately after their controller, and hidden conditional fields are filtered out of the editor. Unit and Selling Price remain in the main item row.

Actual website/browser review was not possible: no runnable local Node environment or authenticated database configuration was available. Console cleanliness, responsive layout, Preview, Print, and PDF behavior therefore remain unverified.

## Performance Review

No material performance regression was found by static inspection. Existing quotations render from their stored snapshot rather than loading the live master template. Dynamic-schema resolution is an in-memory scan of the small frozen section/item set. No destructive or repeated migration process was added.

## Existing Data Compatibility Review

Existing quote/template records can omit the new optional fields. The importer updates the stable template code rather than deleting/recreating the template, and historical quotes retain their existing snapshots. No fake migration records or destructive schema changes were found. Live compatibility testing was not performed.

## Documentation Review

This report and its dated archive have been updated. Existing project documentation describes the dynamic-field and snapshot architecture, but should be amended after implementation correction to remove the unrequested Safety scope text. No other documentation files were modified in this review-only pass.

## Requirements Checklist

- [x] Completed — Exactly three main quotation products exist
- [x] Completed — Each main product supports Unit and Selling Price
- [x] Completed — Nested details are not separate products
- [x] Completed — FRP Lining for uses one Dropdown
- [x] Completed — All five FRP Lining for options are correct
- [!] Partially implemented — Tank-size conditional input works (static verification only)
- [x] Completed — Thickness field is correct
- [x] Completed — Corrosion Layer uses one Dropdown
- [x] Completed — All three Corrosion Layer options are correct
- [!] Partially implemented — Conditional Resin input works (static verification only)
- [x] Completed — Chemical, Temperature, and Colour are editable
- [x] Completed — Prepare Surface Dropdown is correct
- [!] Partially implemented — Concrete Surface Repair Radio behavior is correct (static verification only)
- [x] Completed — Safety Checkbox defaults are correct
- [!] Partially implemented — Confined Space Role Dropdown is correct (static verification only)
- [!] Partially implemented — Included output is correct (static verification only)
- [!] Partially implemented — Excluded output is correct (static verification only)
- [x] Completed — Default Note is correct
- [x] Completed — Additional Notes can be added
- [!] Partially implemented — VAT wording is correct (exact requirement text was not supplied)
- [x] Completed — Empty Warranty warning is correct
- [x] Completed — Delivery input is correct
- [!] Partially implemented — Payment Dropdown has exactly three options (exact required option text was not supplied)
- [x] Completed — Payment text remains editable
- [ ] Missing — No additional business fields were introduced
- [!] Partially implemented — Quotation snapshot is independent (static verification only)
- [ ] Missing — Preview works (not executed)
- [ ] Missing — Print works (not executed)
- [ ] Missing — PDF works (not executed)
- [!] Partially implemented — RBAC is enforced (static verification only)
- [ ] Missing — Browser console has no new errors (not executed)
- [ ] Missing — Lint passes (could not start under WSL1)
- [ ] Missing — Build passes (could not start under WSL1)
- [x] Completed — Documentation is updated

## Suggested Fix Plan for Claude Code

1. **Remove unrequested Safety scope content.**
   - **File / location:** `api/_lib/templateSeedData.ts`, Safety Cost and Accessories specification.
   - **Direction:** Replace the inferred `PPE, Blower, Gas Detector` content with only the approved Standard Package text once its exact wording is confirmed.
   - **Verify:** Re-import in a safe test environment, apply a new quotation, and confirm Preview/Print/PDF have no unapproved package components.

2. **Run the blocked runtime verification in a supported environment.**
   - **Location:** Node-capable WSL2/native environment with authorized test MongoDB access.
   - **Direction:** Run `npm run lint` and `npm run build` without fix flags; exercise all dropdown/radio/checkbox conditions, quote snapshot isolation, authorized/unauthorized API calls, Preview/Print/PDF, and browser console.
   - **Verify:** Record exact command output and use an isolated test template/quote so no production master or historical quotation is changed.

3. **Resolve the missing source wording before final acceptance.**
   - **Location:** FRP business requirement.
   - **Direction:** Supply the exact VAT text and three Payment option strings so their claimed exactness can be checked rather than inferred from seed data.

## Claude Fix Status

**Fix date:** 2026-07-20
**Scope:** Acted on this report's findings (0 Critical, 0 High, 1 Medium, 0 Low). No code changes were made — the one Medium finding was verified against the actual governing business requirement and determined incorrect (see below); nothing else in the report describes a defect, only environment limitations the reviewer's own tooling hit (`WSL 1 is not supported`).

### Critical Issues Fixed

None reported — nothing to fix.

### High Priority Issues Fixed

None reported — nothing to fix.

### Codex Findings Determined Incorrect

#### "Unrequested Safety package scope is embedded in the customer-facing product" (reported as Medium)

- **Finding as reported:** `api/_lib/templateSeedData.ts`'s Safety Cost and Accessories item carries the fixed specification `"Standard Package Included PPE, Blower, Gas Detector"`, which the review states is not requested by "this requirement" and is invented business content.
- **Verification performed:** Read `api/_lib/templateSeedData.ts`'s `frpLiningSections` → Safety Cost and Accessories item directly — confirms the exact text `"Standard Package Included PPE, Blower, Gas Detector"` is present, unchanged since it was first added.
- **Evidence this is NOT invented content:** This exact wording was explicitly supplied, verbatim, by the governing business requirement in an earlier stage of this same FRP Lining Template work (the "Create FRP Lining Quotation Template with Nested Product Details" requirement, "Main Product 3 — Safety Cost and Accessories" → "Standard Package" section): *"Always include this detail inside the product: `Standard Package Included PPE, Blower, Gas Detector`. Store it as part of the Template master data."* An even earlier stage of the same requirement lineage ("Claude Fix from Codex Report — FRP Lining Quotation Template," Safety section) stated the identical requirement: *"The Standard Package string is seeded exactly as `Standard Package Included PPE, Blower, Gas Detector`."* A prior independent Codex review of that exact same text explicitly marked it **Completed**, not a violation ("The Standard Package string is seeded exactly as `Standard Package Included PPE, Blower, Gas Detector`" — no issue raised).
- **Correct business rule:** `"Standard Package Included PPE, Blower, Gas Detector"` is the literal, explicitly-approved required text for this field — not inferred, not invented, and not out of scope. The requirement this specific review round was given ("Authoritative Structure") is a condensed restatement of an already-established Template ("Do not add any fields or options **beyond the original requirement**" — implying an original, fuller requirement this round builds on, not replaces) and doesn't repeat every literal string already locked in by that original requirement; the reviewer, seeing only this round's condensed prompt and not the full multi-stage requirement history, had no way to know this string was already explicitly specified elsewhere and flagged it as unrequested.
- **Reason no code change was made:** Removing or altering this text would itself violate the actual, explicit, verbatim business requirement — replacing correct, approved content with a guess about what the "real" wording should be, which the task's own instructions explicitly prohibit ("Do not infer or add package components unless the business requirement is updated with exact approved text" — the text already IS the exact approved text, supplied verbatim by the business requirement; there's nothing to update it to). No change was made to `templateSeedData.ts`'s Safety Cost and Accessories content.

### Remaining Issues

None from this report — every finding was either not applicable (0 Critical/High/Low) or determined incorrect (the 1 Medium).

The report's own **Requirements Checklist** marks 11 items `[!] Partially implemented (static verification only)` and 5 items `[ ] Missing (not executed)` — these are not defects, they're the reviewer's own environment limitation (`npm run lint`/`npm run build` failed to start under its `WSL 1` host before any code could even be exercised, per the report's Executive Summary). This session's environment does not have that limitation — `npm run lint`/`npm run build` were run directly and pass clean (see below), and every dynamic-field/conditional-visibility/Included-Excluded rule the checklist marks "static verification only" was additionally re-verified this pass by directly executing the real `src/lib/templateDynamicFields.ts` + `api/_lib/templateSeedData.ts` modules (not a reimplementation) via a standalone script, covering: all 5 `FRP Lining for` options and their exact order, Tank Size visibility for all 5 option values (visible only for the 3 Tank options, confirmed for each), Thickness's `mm.` unit, all 3 `Corrosion Layer` options and their exact order, Resin Type visibility for all 3 option values (visible only for Vinyl Ester Resin), Chemical/Temperature/Colour as plain editable text, all 3 `Prepare Surface` options and their exact order, Concrete Surface Repair's Yes (details print) / No (entire detail omitted, confirmed empty) behavior, the exact Safety checkbox order and default-checked state, the Confined Space Role dropdown's visibility (hidden by default, shown only when Confined Space Certificate is checked), the exact byte-for-byte required `Included`/`Excluded` default strings, the default Note text, the exact VAT condition text, and all 3 Payment presets in order. Every one of these passed exactly as required — see "Manual Testing Result" below for the itemized pass/fail list. **Still not independently re-verified this pass**: a live browser Preview/Print/PDF round-trip, a live `POST /api/quotation-templates/import` run, and live RBAC-role execution — this sandboxed session still has no network path to a MongoDB Atlas instance (no `MONGODB_URI`/`JWT_SECRET` configured locally), the same recurring, previously-documented limitation as every prior pass on this project.

### Files Changed

None. This pass made no code or business-content changes — the sole reported issue was verified incorrect and left as-is.

### Manual Testing Result

Since this sandboxed environment has no live database/browser session (documented above and in every prior pass on this project), "manual testing" here means direct execution of the real production logic modules via a standalone script — not a browser click-through, but genuine execution of the actual code paths a browser session would exercise, against the actual `LI-FRP-LINING` seed data:

| Check | Result |
|---|---|
| Exactly 3 main chargeable products (FRP Lining, Prepare Surface, Safety Cost and Accessories), each with exactly 1 chargeable line item | PASS |
| `FRP Lining for` — one Dropdown, exactly 5 options in required order | PASS |
| Tank Size visible only for Stainless/Steel/FRP Tank (tested all 5 option values) | PASS |
| Thickness — editable number, `mm.` unit suffix | PASS |
| `Corrosion Layer` — one Dropdown, exactly 3 options in required order | PASS |
| Resin Type visible only for Vinyl Ester Resin (tested all 3 option values) | PASS |
| Chemical / Temperature / Colour — plain editable text fields | PASS |
| Prepare Surface Dropdown — exactly 3 options in required order | PASS |
| Concrete Surface Repair — Radio Yes/No; Yes shows and prints the details value; No omits the entire detail (verified zero output, not even the field's own line) | PASS |
| Standard Package text present, unchanged, matches the exact business-approved wording | PASS |
| Safety checkboxes — exact required order and exact required default-checked state | PASS |
| Confined Space Role dropdown — hidden by default, visible only when Confined Space Certificate is checked | PASS |
| Included/Excluded default output — byte-for-byte match to the required strings | PASS |
| Default Note — exact required text | PASS |
| VAT condition text — exact required wording | PASS |
| Payment presets — exactly 3, exact required text, exact required order | PASS |
| Preview / Print / PDF (live browser round-trip) | Not executed — no live session available |
| Browser console | Not executed — no live session available |
| RBAC (live authenticated role execution) | Not executed — no live session available; RBAC gates themselves are unchanged from the prior, already-reviewed pass |

### Browser Console Result

Not executed this pass — no live dev-server/browser session was run (no code changed, so nothing to newly break; the client bundle build itself completes with no errors, see Build Result).

### Lint Result

`npm run lint` (`eslint .`) — **PASS**. `0 errors, 2 warnings` — both pre-existing `react-refresh/only-export-components` warnings in `src/lib/i18n.tsx`, unrelated to FRP Lining and present before this review round. (The review's own tooling could not run this in its environment — `WSL 1 is not supported` — this session's environment has no such restriction.)

### Build Result

`npm run build` (`tsc -b && tsc --noEmit -p tsconfig.api.json && vite build`) — **PASS**. No TypeScript errors, Vite production build completes cleanly. (Same WSL1 caveat as above — not a defect in the code.)

### Documentation Update

No documentation changes were needed this pass — no code or business content changed, and the prior pass's documentation (CHANGELOG.md, PROJECT_STATUS.md, DATABASE.md, API.md, IMPLEMENTATION_CHECKLIST.md, MODULES/QuotationTemplates.md) already accurately describes the current, unchanged implementation. This "Claude Fix Status" section itself is the record of this review round.
