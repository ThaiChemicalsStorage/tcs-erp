# Module: Quotation Templates

## Status: ✅ Built (2026-07-14), fixed against an independent Codex review the same day

**2026-07-14, same-day Codex-review fix pass** (see `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix
Status" for the full writeup): fixed all 3 High Priority issues an independent review found (0
Critical). Summary:
1. `POST /api/quotes` now rejects a `quotationTemplateId` whose own `jobTypeCode` doesn't match the
   request's `jobTypeCode` (400) — previously only the wizard's UI prevented a mismatched pair; a
   direct API caller could bypass it entirely.
2. The `SC-ACTIVATED-CARBON`/`BF-BAG-FILTER` templates' "Main Ducting" item was missing a real
   source specification line ("Exhaust Duct, Elbow, Flange, Damper and accessories"), re-verified
   against the source workbook directly and restored.
3. 9 real, non-placeholder literal values (Brand/Material/Static Pressure defaults, confined to
   those same 2 templates) that were being silently discarded on template-apply have been
   reclassified from `editableParameters` to plain `specifications` text, so they now survive into
   the applied quotation instead of being blanked to `______`.

## Purpose

When a Sales user starts a new quotation, they now go through a **Create Quotation wizard**
(Job Type → Template → Preview → the normal quotation form, pre-filled) instead of jumping
straight to a blank document. The template content is real business content extracted from an
actual Excel workbook the company already uses (`public/Scope of work new template for air
pollution control_Technic.xlsx`), not invented placeholder text — sections, item descriptions,
quantities/units, specifications, and fill-in-the-blank parameters (e.g. "Capacity: ______ CMH")
that previously had to be retyped by hand for every new quotation of a given job type.

This is purely a **starting-point/authoring aid** — every field the wizard fills in remains fully
editable on the normal quotation form afterward, and nothing about the existing quotation
data model, approval workflow, or print/PDF layout changed to accommodate it (see "Backward
Compatibility" below).

## Business Flow (the wizard)

`src/pages/quotation/QuotationTemplateWizard.tsx` — a dynamic-step wizard opened by clicking
"สร้างใบเสนอราคา / Create Quotation" (a new `"wizard"` view state in `QuotationPage.tsx`, sitting
between `"list"` and `"new"`):

1. **Job Type grid** ("เลือกประเภทงาน") — every active Job Type as a card. Always step 1.
2. **Template choice** — **only shown when the selected Job Type has 2+ active templates**
   (today, only SC/Wet Scrubber-Activated Carbon). Any Job Type with exactly one active template
   skips this screen entirely and auto-advances straight to Preview. A Job Type with zero
   templates shows an **empty state** instead ("ยังไม่มี Template สำหรับประเภทงานนี้") with three
   options: "เริ่มจากใบเสนอราคาเปล่า" (start blank), "เลือกประเภทงานอื่น" (pick a different Job
   Type), "แจ้งผู้ดูแลระบบ" (just shows a toast asking the user to contact an admin — no backend
   call, no ticketing system exists). A failed template fetch shows an **error state**
   ("ไม่สามารถโหลด Template ได้ในขณะนี้") with a "ลองใหม่" retry button.
3. **Preview** — Job Type code, template name, description, section list with per-section item
   counts, total item/section counts, source file + sheet name, version, and the first 6 included
   item names. Three buttons: "ย้อนกลับ" (back — returns to the template-choice screen if one was
   shown, otherwise straight to the Job Type grid), "ใช้ Template นี้" (apply the template and
   complete the wizard), "เริ่มจากแบบฟอร์มเปล่า" (start blank, always available regardless of
   whether a template exists).

Completing the wizard (either "ใช้ Template นี้" or any "start blank" exit) produces a
`QuotationWizardResult = { jobTypeCode, jobTypeName, templateSnapshot }` passed into
`QuoteDocument.tsx` as a new `wizardResult` prop, which seeds the form's initial
`lines`/`jobTypeCode`/`jobTypeName`/`paymentTerms`/`remarks` state. This only ever applies to a
genuinely fresh "new" mount — reopening an existing saved quote always uses that quote's own saved
data, the wizard result is never consulted again. A quote created from a template shows a small
read-only "สร้างจาก Template: {name} (v{version})" line near the Job Type field.

## Job Type → Template mapping

Templates were extracted from 4 sheets of the source workbook, producing 5 templates (SC has two,
every other mapped Job Type has exactly one):

| Job Type | Template(s) | Source sheet | Sections / Items | Editable Params | Internal Notes | Default Terms |
|---|---|---|---|---|---|---|
| **SC** (Wet Scrubber / Activated Carbon System) | `SC-WET-SCRUBBER` "Wet Scrubber" | "Wet scrubber" (66 rows) | 2 sections / 28 items | 14 | 1 | 6 |
| **SC** (same Job Type, second choice) | `SC-ACTIVATED-CARBON` "Activated Carbon" | "Activated carbon" (51 rows) | 1 section / 18 items | 21 | 0 | 6 |
| **BF** (Dust Collector System) | `BF-BAG-FILTER` "Bag Filter" | "Bag filter" (46 rows) | 1 section / 17 items | 16 | 0 | 6 |
| **TA** (Fiberglass Tank) | `TA-FRP-TANK` "FRP Tank" | "FRP Tank and LI", rows 22–48 only | 1 section / 17 items | 12 | 1 | 1 |
| **LI** (FRP Lining) | `LI-FRP-LINING` "FRP Lining" | "FRP Tank and LI", rows 0–21 only | 1 section / 17 items | 5 | 2 | 1 |

SC is the only Job Type with 2+ active templates today, so it's the only one where the
template-choice screen actually appears — every other mapped Job Type auto-advances straight to
Preview. Any other active Job Type (no template) falls back to the empty state above. `TA-FRP-TANK`
and `LI-FRP-LINING` are deliberately extracted from the **same** source sheet ("FRP Tank and LI")
but non-overlapping row ranges — row 22's "FRP Tank" heading is the exact split point, and the two
templates' rows were never mixed.

The Bag Filter sheet's BOQ title literally says "Dust Collector System," not "Bag Filter" — this is
intentional per the original task spec, not a mismatch to fix.

## Excel Row Classification Rules

Documented here so a future re-import/re-analysis of a revised workbook follows the same rules:

- **section** — a text-only row: no No./Qty/Unit.
- **item** — a row with a top-level No.
- **subItem** — a row numbered "N.M" (either in the No. column, or embedded directly in the
  description text — both conventions appear in the source data) OR an unnumbered row that
  nonetheless has its own real Qty/Unit.
- **specification** — any other loose descriptive line, attached to the nearest preceding
  item/subItem.
- **editableParameter** — a "Label : value" line whose value is a placeholder (`xxx`, `xxxxxx`,
  blank-after-colon, or a bare unit token like "CMH" with no number) — e.g. "Capacity: xxxxxx CMH"
  becomes `{ label: "Capacity", value: "" (always blank), unit: "CMH", editable: true }`.
- **internalNote** — a line containing real internal-staff language directed at a colleague (e.g.
  "รบกวนพี่หมูรีวิวต่อว่าต้องใส่ PP washable ไหม", "หากลดความเซลล์เขียนมือเซนต์กำกับ", "กรณีลดความหนา
  เขียนมือเซนต์กำกับหน้า Work") — flagged `visibleToCustomer: false` and **never** copied into a
  quotation or printed (see "Template → Quote snapshot semantics" below). Exactly 3 such rows
  exist in the whole workbook (1 in Wet Scrubber, 1 each in the FRP Lining and FRP Tank blocks).
  The recurring phrase "Sampling port according to Thai law ?" (present in all 3 BOQ sheets) was
  deliberately kept as normal customer-facing specification text, **not** classified as internal —
  it reads as a real scope question a customer would see, not staff-only chatter.
- **paymentTerm / warrantyTerm / taxNote** — payment %/warranty-duration/withholding-tax rows go
  into `defaultTerms`, not regular items.
- **No prices were ever invented.** The source workbook's Material/Labor/Total Cost columns were
  mostly blank; every template item stores a `quantity` (nullable) and never a price. Applying a
  template to a quotation always sets `unitPrice: 0`/`discount: 0` on every copied line — Sales
  fills in real numbers afterward.

## Data Model

New MongoDB collection `quotation_templates`. Full TS shape lives in `src/lib/quotationTemplates.ts`
(type-only imported into the API bundle from `api/_lib/collections.ts` and
`api/_lib/quotationTemplatesHandler.ts` — per this repo's standing CLAUDE.md rule about not letting
a *value* import into a `src/lib/*` file pull JSX into the API bundle, the actual
`QuotationTemplate → QuoteLine[]` conversion function lives in a separate, page-scoped file,
`src/pages/quotation/applyTemplate.ts`, instead of here):

```ts
export interface TemplateEditableParameter { label: string; value: string; unit: string; editable: true; }
export type TemplateItemType = "item" | "subItem" | "specification";
export interface TemplateItem {
  id: string; itemType: TemplateItemType; itemCode: string; name: string; description: string;
  quantity: number | null; unit: string; specifications: string[]; subDetails: string[];
  editableParameters: TemplateEditableParameter[]; internalNotes: string[]; productId?: string;
  visibleToCustomer: boolean; sortOrder: number;
}
export interface TemplateSection { id: string; title: string; description: string; sortOrder: number; items: TemplateItem[]; }
export interface TemplateTermLine { type: "paymentTerm" | "warrantyTerm" | "taxNote"; text: string; }
export interface QuotationTemplate {
  id: string; templateCode: string; templateName: string; jobTypeCode: string; jobTypeName: string;
  description: string; version: string; sourceFileName: string; sourceSheetName: string; sourceHash: string;
  sections: TemplateSection[]; defaultTerms: TemplateTermLine[]; internalNotes: string[];
  isActive: boolean; isDeleted: boolean; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string;
}
export interface QuotationTemplateSummary {
  id: string; templateCode: string; templateName: string; jobTypeCode: string; jobTypeName: string;
  description: string; version: string; sourceFileName: string; sourceSheetName: string;
  sectionCount: number; itemCount: number; isActive: boolean;
}
export interface TemplateImportReport {
  created: string[]; updated: string[]; skipped: string[]; warnings: string[];
  unrecognizedRows: string[]; internalNotesDetected: number;
}
```

MongoDB indexes (`api/_lib/collections.ts`'s `ensureIndexes()`): `templateCode` (unique),
`jobTypeCode`, `isActive`, `isDeleted`.

Seed data — the actual extracted content, all 5 templates — lives in
`api/_lib/templateSeedData.ts` as `QUOTATION_TEMPLATE_SEEDS: TemplateSeed[]`.

## Idempotent Import

`api/_lib/quotationTemplatesHandler.ts`'s `upsertQuotationTemplates(actorUserId)`: for each of the
5 seeds, computes a SHA-256 `sourceHash` (Node's `crypto.createHash("sha256")`) over canonical JSON
of the content-relevant fields (`name`/`description`/`sourceFileName`/`sourceSheetName`/`sections`/
`defaultTerms`/`internalNotes` — deliberately **not** `version`, so a version bump alone doesn't
force a re-write). Upserts by the stable `templateCode` natural key:

- New `templateCode` → insert.
- Existing `templateCode`, `sourceHash` unchanged → skip (no write).
- Existing `templateCode`, `sourceHash` changed → `$set`-update.

Returns a `TemplateImportReport`. Re-running the import against unchanged seed data always produces
an all-"skipped" report with zero writes — genuinely idempotent, verified by running it twice
against the same seed data during development.

`seedQuotationTemplatesIfEmpty()` runs **automatically** (defensively) on every
`GET /api/quotation-templates` list call, but only when the collection's
`estimatedDocumentCount()` is 0 — the same self-healing pattern `seedJobTypesIfEmpty()` already
uses (`api/_lib/systemSeed.ts`), since `ensureIndexes()`/the Setup Wizard's one-time bootstrap path
is permanently unreachable on an already-provisioned deployment (a documented, pre-existing
limitation of this whole project, not new). This only covers the "collection is empty" case — a
real re-import after **editing** `templateSeedData.ts`'s content requires the explicit admin action
below (`POST /api/quotation-templates/import`).

## API Endpoints

Mounted by extending the existing `api/handlers/jobtypes.ts` Vercel function — this repo is at
Vercel Hobby's 12-function cap, so new routes share an existing function file by checking the raw
`req.url` pathname before falling through to the existing Job Type dispatch, the same established
pattern `/api/search` uses by sharing `api/handlers/customers.ts`. New `vercel.json` rewrites:

```json
{ "source": "/api/quotation-templates", "destination": "/api/handlers/jobtypes" },
{ "source": "/api/quotation-templates/:path*", "destination": "/api/handlers/jobtypes" }
```

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/quotation-templates?jobTypeCode=` | `quotationTemplates:manage` **or** `quotations:create` | List. Defensively calls `seedQuotationTemplatesIfEmpty()` first. Non-managers (Sales users browsing templates while starting a quotation) only see `isActive: true` templates; managers see all non-deleted ones. Returns `{ templates: QuotationTemplateSummary[] }`. |
| `GET /api/quotation-templates/:id` | Same as above | Single full template. `404`s an inactive template for a non-manager (a manager can still fetch it). Returns `{ template: QuotationTemplate }`. |
| `POST /api/quotation-templates/import` | `quotationTemplates:manage` | Runs `upsertQuotationTemplates()`. Returns the `TemplateImportReport` directly as JSON. |
| `PATCH /api/quotation-templates/:id` | `quotationTemplates:manage` | Accepts `{ isActive?, isDeleted? }` boolean toggles. Returns `{ template: QuotationTemplateSummary }`. |

Client wrapper functions in `src/lib/quotationTemplates.ts`: `fetchQuotationTemplates(jobTypeCode?)`,
`fetchQuotationTemplate(id)`, `importQuotationTemplates()`, `setQuotationTemplateActive(id, isActive)`.

## RBAC

New `Permission`: `"quotationTemplates:manage"` — added to `src/lib/permissions.ts`'s `Permission`
union, `ALL_PERMISSIONS`, `PERMISSION_LABELS` ("จัดการ Template ใบเสนอราคา (นำเข้า/เปิด-ปิดใช้งาน)"),
`PERMISSION_LABEL_KEY` (`"permission.quotationTemplatesManage"`), and to the "ใบเสนอราคา"
(Quotations) permission group. Granted by default to the **Administrator** role
(`src/lib/roles.ts`'s default permissions array) — **not** Super-Admin-exclusive (Super Admin
already implicitly has every permission).

Sales-facing template *read* access deliberately reuses the **existing** `quotations:create`
permission rather than a new "view" permission — the same "manage vs. pick-for-a-quotation"
carve-out pattern already established for Customers (`customers:view` vs. `quotations:create`) and,
before that, Company Profiles. A Sales User with `quotations:create` but not
`quotationTemplates:manage` can browse/preview templates through the wizard, but cannot import new
seed data or toggle a template's `isActive`/`isDeleted` flags.

## Quote Model Changes

New fields on `Quote`/`QuoteLine` (`src/lib/quotes.tsx`), all **optional/backward-compatible** —
every quotation created before this feature continues to open/edit/export exactly as before, with
these fields simply `undefined`:

- `QuoteLine.isSectionHeader?: boolean` — marks a non-priced section-divider line, copied from a
  template section's title. Rendered as a full-width bold row (no unit/qty/price/discount inputs)
  in both `LineItemsEditor.tsx` (the editor) and `PrintDocument.tsx` (the printed/PDF view).
  Validated server-side via `sanitizeBoolean()` inside `api/_lib/quoteValidation.ts`'s
  `sanitizeLine()`.
- `Quote.quotationTemplateId? / quotationTemplateName? / quotationTemplateVersion?: string` —
  frozen provenance metadata, set **only** at quote creation time and never editable afterward: the
  update sanitizer `sanitizePartialQuoteFields()` (`api/handlers/quotes.ts`) simply never lists
  these 3 fields, so they're structurally impossible to change via `PATCH /api/quotes/:id`.
  **Server-authoritative**: the client only ever sends `quotationTemplateId` on `POST /api/quotes`;
  the server re-derives `quotationTemplateName`/`quotationTemplateVersion` itself by looking up the
  matched `quotation_templates` record (`api/_lib/quoteValidation.ts`'s
  `validateQuotationTemplate()`, mirroring the existing `validateJobType()` pattern exactly) —
  never trusts a client-sent name/version. Deliberately allows a currently-*inactive*-but-not-deleted
  template match (deactivating a template mid-draft shouldn't retroactively break a Sales user's
  in-progress quote that already referenced it).

## Template → Quote Snapshot Semantics ("copy once, never a live reference")

`src/pages/quotation/applyTemplate.ts`'s `applyTemplateToQuoteDraft(template)` converts a full
`QuotationTemplate` into `{ lines: QuoteLine[]; paymentTerms: string; remarks: string }`. Every line
gets a freshly generated id (`newLineId()`/`newSubDetailId()`), so:

- Editing the resulting quotation can **never** write back to the master template.
- Editing the master template later **never** changes quotations already created from it.

This is the same non-live-reference guarantee `QuoteLine`/`Product` and `Quote.jobTypeCode`/
`JobType` already establish elsewhere in this app.

Conversion rules:

- Each `TemplateSection` becomes one `isSectionHeader: true` divider `QuoteLine`.
- Each `TemplateItem` becomes one ordinary `QuoteLine`: `description` = `item.name`, `unit`/`qty`
  copied (`quantity: null` → `qty: 0`), `unitPrice`/`discount` always `0` (never invented, per the
  "no prices were ever invented" rule above), `specifications` joined into the line's
  specifications text.
- Each `editableParameter` becomes one `subDetails` row rendered as fill-in-the-blank text:
  `"Label: ______ Unit"` (e.g. `"Capacity: ______ CMH"`) — a clear editable prompt, never a
  fabricated value.
- **`internalNotes` (both item-level and template-level) are NEVER copied** — dropped entirely by
  this function, by design, so an internal review comment can never reach a customer-facing
  quotation or its PDF, even indirectly.
- `defaultTerms` of type `paymentTerm` become `Quote.paymentTerms` (newline-joined); `warrantyTerm`
  + `taxNote` lines become `Quote.remarks` (since `Quote` has no dedicated warranty/tax field).

## Section-Header Rendering (editor + PDF)

Section-header lines render as a full-width bold divider row — no unit/qty/price/discount columns
— in both:

- `LineItemsEditor.tsx` (on-screen editing), marked with a "§" instead of an ordinary line number.
- `PrintDocument.tsx` (the printed/PDF view), a full-width `colSpan={7}` bold row.

Item numbering ("No." column) in both places counts only ordinary priced lines, **skipping section
headers**, so a template-seeded quotation's numbering stays a clean 1, 2, 3... instead of skipping a
number at each divider.

A section-header line with **no items directly following it** (e.g. the user deleted every item
under a section but kept the header) is silently **not printed** on the customer PDF — an empty
section heading on a real customer document would read as a mistake, not intentional structure.

## Wizard UI (screens, states)

See "Business Flow" above for the step-by-step flow. Component: `QuotationTemplateWizard.tsx`.
Wired into `QuotationPage.tsx` via a new `"wizard"` view state. Result type:
`QuotationWizardResult = { jobTypeCode, jobTypeName, templateSnapshot }`, consumed by
`QuoteDocument.tsx`'s new `wizardResult` prop (fresh "new" mounts only).

## Global Search Integration

New "Template ใบเสนอราคา" (EN: "Quotation Templates") result group in the topbar Global Search
(`api/_lib/searchHandler.ts`'s `searchTemplates()`, `src/components/GlobalSearch.tsx`). Searchable
by `templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/`description` — e.g. "Wet Scrubber",
"Activated Carbon", "Bag Filter", "FRP Tank", "FRP Lining", or a Job Type code like "SC"/"TA" all
match. Only active, non-deleted templates are ever returned, and only
`templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/`description` are projected server-side —
`sections`/`internalNotes` never leave the server via this endpoint, so an internal note can never
leak through search even indirectly (the same care taken with the wizard's own Preview screen,
which also never renders `internalNotes`).

Gated by the same `quotations:create` **or** `quotationTemplates:manage` permission check as the
templates list API. Clicking a result opens the Create Quotation wizard with that Job Type +
Template preselected: `GlobalSearch.tsx`'s `onNavigateToTemplate(jobTypeCode, templateId)` →
`App.tsx`'s `navigateToTemplate()` (sets a `quotationTemplateDeepLink` state + switches to the
Quotations nav tab) → `QuotationPage.tsx`'s `initialTemplateSelection` prop →
`QuotationTemplateWizard.tsx`'s `initialSelection` prop, which jumps straight to that template's
Preview step — falling back gracefully to the normal Step 1 Job Type grid if the template/job type
is no longer valid (deleted, deactivated, or the Job Type itself deactivated) by the time the link
is followed.

## Backward Compatibility

Every field this feature adds is optional. A quotation created before this feature exists has
`isSectionHeader`/`quotationTemplateId`/`quotationTemplateName`/`quotationTemplateVersion` simply
undefined, and continues to open, edit, print, and move through the approval workflow exactly as it
did before — nothing about the existing quotation data model was changed, only extended. The
Create Quotation wizard itself is purely additive: "เริ่มจากแบบฟอร์มเปล่า" (start blank) is always
available at every step, so a user who wants the old zero-template flow can always get it in one
click.

## Pages / Files

- `src/pages/quotation/QuotationTemplateWizard.tsx` — the wizard itself.
- `src/pages/quotation/applyTemplate.ts` — `applyTemplateToQuoteDraft()`, the template→quote
  conversion (kept out of `src/lib/quotationTemplates.ts` for the JSX-import-isolation reason noted
  under "Data Model" above).
- `src/lib/quotationTemplates.ts` — types + client `fetchX()`/`importX()`/`setX()` API wrappers.
- `api/_lib/templateSeedData.ts` — the 5 extracted templates as structured seed data.
- `api/_lib/quotationTemplatesHandler.ts` — `upsertQuotationTemplates()`,
  `seedQuotationTemplatesIfEmpty()`, and the route handler logic mounted from `api/handlers/jobtypes.ts`.
- Edited: `api/_lib/collections.ts` (indexes), `api/handlers/jobtypes.ts` (route dispatch),
  `vercel.json` (rewrites), `src/lib/permissions.ts`/`src/lib/roles.ts` (RBAC),
  `src/lib/i18n.tsx` (dictionary keys), `src/lib/quotes.tsx` (new `Quote`/`QuoteLine` fields),
  `api/_lib/quoteValidation.ts`/`api/handlers/quotes.ts` (server-side template validation +
  snapshot), `src/pages/quotation/QuoteDocument.tsx`/`QuotationPage.tsx`/`LineItemsEditor.tsx`/
  `PrintDocument.tsx` (wizard wiring + section-header rendering), `api/_lib/searchHandler.ts`/
  `src/lib/search.ts`/`src/components/GlobalSearch.tsx`/`src/App.tsx` (Global Search deep-link),
  `package.json` (removed the `xlsx` npm package — it was only ever used for one-time offline Excel
  analysis via ad-hoc Node scripts during development, never imported by any runtime `api/`/`src/`
  code, so it's been fully removed rather than kept as a stale dependency).

## Known Limitations

- **No live MongoDB/Vercel access was available during development.** `npx tsc -b` (frontend),
  `npx tsc --noEmit -p tsconfig.api.json` (backend), `npm run lint`, and `npm run build` all pass
  clean, but the actual DB-backed behavior — a real `upsertQuotationTemplates()` run against a live
  `quotation_templates` collection, real `GET/POST/PATCH /api/quotation-templates*` round-trips, the
  wizard's live fetch/preview/apply flow, Global Search actually returning template results — has
  **not** been manually tested end-to-end in a browser. Same sandboxed-session network limitation
  documented elsewhere in this project's docs (see PROJECT_STATUS.md "Known Risks").
- **No UI screenshot/visual verification was performed** for the wizard's 3 screens (Job Type grid,
  template choice, preview) or the section-header divider rendering in the editor/PDF — built and
  reviewed at the code level only.
- **If the source Excel workbook is ever revised**, `api/_lib/templateSeedData.ts` needs to be
  **manually re-transcribed** against the updated workbook and re-imported via
  `POST /api/quotation-templates/import` — there is no live xlsx-parsing-at-runtime anywhere in this
  app (the `xlsx` npm package used for the one-time offline analysis during development was removed
  from `package.json` once that analysis was done). A future pass could build a real
  admin-facing re-import tool if this becomes a recurring need; not built now since it wasn't asked
  for and would be speculative scope.
- No admin UI exists yet for managing templates beyond the raw
  `POST /api/quotation-templates/import` / `PATCH /api/quotation-templates/:id` API — a
  `quotationTemplates:manage` holder must call these directly (or a future admin page would need to
  be built) to run a re-import or toggle a template's active state.
- **The import still upserts hand-transcribed seed data, not the workbook file itself** — flagged
  as Medium Priority by the 2026-07-14 Codex review and intentionally left unfixed this pass (the
  fix instruction scoped this pass to Critical/High issues only). `POST /api/quotation-templates/import`
  hashes canonical seed JSON, not the `.xlsx` file's bytes/parsed rows, so replacing the workbook
  alone cannot trigger an update or produce real parse warnings/unrecognized-row reports. See
  `docs/TODO.md` for this and the other 3 tracked Medium-priority follow-ups (admin import UI,
  structured template snapshot on the quote, atomic import upsert).
