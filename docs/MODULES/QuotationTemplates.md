# Module: Quotation Templates

## Status: ✅ Built (2026-07-14), fixed against an independent Codex review the same day, extended 2026-07-15 with the full Template Management module, fixed against a second independent Codex review the same day

**2026-07-20, rollback note**: a generic "Dynamic Fields" system (dropdown/radio/checkboxGroup/
text/number nested fields with conditional visibility, plus a Notes/Condition section) was built on
top of this module and used to rebuild `LI-FRP-LINING` as "v2.0," went through two Codex-review fix
passes, and was deployed — then `git revert`ed in full the same day per an explicit rollback request
(not a broad reset — full history preserved, see `docs/CHANGELOG.md` "Revert FRP Lining v2.0 /
generic Dynamic Fields system"). Nothing in this document describes that removed system anymore;
`LI-FRP-LINING` is back to the plain v1.0 Excel-transcribed content the rest of this document
already covers, and every other Quotation Templates capability (list/create/edit/duplicate/activate/
archive/import/apply-to-quotation/snapshot/RBAC, all documented below) is unaffected — none of it
ever depended on the removed schema. See `docs/TODO.md` for the one still-required manual follow-up
(re-running the import against the live database so the MongoDB `LI-FRP-LINING` record itself
matches this reverted code).

**2026-07-15, second Codex-review fix pass** (see `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix
Status" for the full writeup): fixed all 3 High Priority + all 3 Medium Priority issues an
independent review of the Template Management pass found (0 Critical). Summary:
1. **Real workbook parsing added** (`api/_lib/templateWorkbookParser.ts`) — the import route now
   actually reads `public/Scope of work new template for air pollution control_Technic.xlsx` and
   hashes its real content per sheet, so editing/replacing the workbook is now genuinely detectable
   (previously impossible — the old hash only ever reflected the hand-transcribed seed). Full
   automated classification of parsed rows into structured template content was deliberately not
   attempted this pass — see "Real Workbook Change Detection" below for why.
2. `Quote.templateSnapshot` — a real structured copy of the matched template's
   sections/terms/internal-notes/source-hash, frozen at quote-creation time — added alongside the
   existing `quotationTemplateId/Name/Version` provenance strings.
3. `applyTemplateToQuoteDraft()` now copies `item.subDetails` (previously silently dropped) and
   honors `item.visibleToCustomer` (previously ignored — every item was copied regardless).
4. Template item product links are now server-resolved/server-snapshotted, never trusting a
   client-submitted `productSnapshot` verbatim.
5. A concurrent import race can no longer surface as an unhandled duplicate-key error.
6. The wizard's Job Type grid badges now distinguish loading/error/real-count instead of treating
   "still loading" and "fetch failed" the same as "genuinely zero templates."

**2026-07-15, Template Management pass**: the consumer-facing wizard (Job Type → Template →
Preview → prefilled quotation) was already solid, but there was no admin UI for managing templates
beyond raw API calls — this pass built it. Summary (full detail in "Template Management Module"
below):
1. New **Template Management** page (`จัดการ Template ใบเสนอราคา`, sidebar under งานขาย →
   Template ใบเสนอราคา) — list with search/filters/columns, create/edit form (sections/items CRUD,
   reorder via up/down buttons, select-existing-product vs. add-custom-item, specifications/
   sub-details/editable parameters/internal notes/terms), duplicate, activate/deactivate, archive/
   restore.
2. **Granular RBAC**: 7 new permissions (`quotationTemplates:view/create/edit/duplicate/activate/
   archive/import`) alongside the original `quotationTemplates:manage`, which is now documented as
   a backward-compatible superset (holding it grants every granular action) rather than the only
   permission.
3. **Audit logging** for every template lifecycle event (import/create/update/duplicate/activate/
   deactivate/archive/unarchive) and a distinction between "Quotation Created from Template" vs.
   "Quotation Created (Blank)" on the quote-creation audit entry.
4. **Job Type grid badges** ("มี Template 2 แบบ" / "มี Template" / "ยังไม่มี Template") and a
   permission-gated "สร้าง Template ใหม่สำหรับประเภทงานนี้" action on the wizard's template-choice
   and empty-state screens, deep-linking into Template Management's create form pre-filled with
   that Job Type.
5. `QuotationTemplate` gained a `sourceType: "excel_import" | "manual"` field (excel-imported vs.
   admin-created/duplicated) and `TemplateItem` gained an optional `productSnapshot` (a one-time
   copy of a linked product's catalog fields, informational only).
6. A shared `TemplatePreview` component (`src/components/TemplatePreview.tsx`) now backs both the
   wizard's Step 3 teaser (`compact`) and Template Management's full "ดูตัวอย่าง" action, so both
   call sites can never drift on the one rule that matters — never render `internalNotes`.

**2026-07-14, same-day Codex-review fix pass**: (unchanged from before, kept for history)

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
  /** Added 2026-07-15 — a one-time copy of a linked product's catalog fields, taken when added via
   * Template Management's "Select Existing Product." Informational only, never read by
   * `applyTemplateToQuoteDraft()` — templates never carry a price. */
  productSnapshot?: { code: string; name: string; unit: string; defaultPrice: number };
  visibleToCustomer: boolean; sortOrder: number;
}
export interface TemplateSection { id: string; title: string; description: string; sortOrder: number; items: TemplateItem[]; }
export interface TemplateTermLine { type: "paymentTerm" | "warrantyTerm" | "taxNote"; text: string; }
/** Added 2026-07-15 — "excel_import" for the 5 workbook-derived seeds, "manual" for anything
 * created via Template Management's create form or produced by duplicating any template. */
export type TemplateSourceType = "excel_import" | "manual";
export interface QuotationTemplate {
  id: string; templateCode: string; templateName: string; jobTypeCode: string; jobTypeName: string;
  description: string; version: string; sourceType: TemplateSourceType; sourceFileName: string; sourceSheetName: string; sourceHash: string;
  sections: TemplateSection[]; defaultTerms: TemplateTermLine[]; internalNotes: string[];
  isActive: boolean; isDeleted: boolean; createdAt: string; updatedAt: string; createdBy: string; updatedBy: string;
}
export interface QuotationTemplateSummary {
  id: string; templateCode: string; templateName: string; jobTypeCode: string; jobTypeName: string;
  description: string; version: string; sourceType: TemplateSourceType; sourceFileName: string; sourceSheetName: string;
  sectionCount: number; itemCount: number; isActive: boolean; isDeleted: boolean; updatedAt: string; updatedBy: string;
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

## Real Workbook Change Detection (added 2026-07-15, second Codex-review fix pass)

Before this pass, `sourceHash` (above) was purely a hash of the hand-transcribed TypeScript seed
content — editing or replacing
`public/Scope of work new template for air pollution control_Technic.xlsx` had **zero observable
effect anywhere in the app**, which an independent review correctly flagged as a real audit gap
("replacing the workbook alone cannot produce warnings, changed-source detection").

`api/_lib/templateWorkbookParser.ts`'s `fingerprintSourceWorkbook()` now reads the real workbook
file at runtime (via the `xlsx`/SheetJS package — re-added to `package.json` as a genuine
**production** dependency, not the dev-only one-off tool it was before) and computes a SHA-256 hash
per sheet over its full raw row content (`XLSX.utils.sheet_to_json(sheet, { header: 1 })`, changes
if a single cell anywhere in that sheet changes). Every `excel_import` template gets a
`sourceWorkbookHash` field set from its matching sheet's fingerprint on every import run. If a
template's *previously stored* `sourceWorkbookHash` no longer matches the freshly computed one, a
real warning is added to the `TemplateImportReport` (and to the `Templates Imported` audit entry's
details, since the toast itself is transient) — e.g. *"ชีต 'Wet scrubber' ในไฟล์ Excel
มีการเปลี่ยนแปลง... กรุณาตรวจสอบและปรับปรุงเนื้อหาด้วยตนเอง"* — telling an admin exactly which
template needs manual re-transcription. This is genuinely new capability: a workbook edit that
would previously have gone completely unnoticed by the system now produces a real, visible signal.

**Never fails the import.** If the workbook file can't be read in some environment (deploy target
where `vercel.json`'s `functions["api/handlers/jobtypes.ts"].includeFiles` config wasn't honored,
for instance), `fingerprintSourceWorkbook()` catches the error and returns `null` — the import still
runs exactly as before, seed-content idempotency (`sourceHash`) is completely unaffected, and a
single soft warning notes that workbook-change detection was skipped this run.

**What this deliberately does *not* do**: fully auto-classify the parsed rows into
`TemplateSection[]`/`TemplateItem[]`, replacing the hand-transcription in `templateSeedData.ts`
entirely. Direct inspection of the real workbook (done during this fix pass, via a temporary local
`xlsx` install and a Node script reading the actual file) found rows whose classification requires
genuine judgment a mechanical parser can't safely make — for example, row 4 of the "FRP Tank and LI"
sheet packs an internal hand-signing note, a "Thickness" editable parameter, *and* a second,
unrelated abbreviation-legend note into three different columns of the same row
(`["","","หากลดความเซลล์เขียนมือเซนต์กำกับ","Thickness","mm.","ชื่อย่อ","ALL Layer,E,R"]`), and row
61 of "Wet scrubber" packs all 4 payment-term lines *and* the warranty line into one single
`\r\n`-joined cell. A naive automated classifier risks silently corrupting already-twice-reviewed,
customer-facing quotation content — a strictly worse outcome than today's honest
"hand-transcribed, now change-detected" state. Full auto-classification remains tracked, deliberate
future scope in `docs/TODO.md`, not a silently-dropped requirement.

The `TA-FRP-TANK`/`LI-FRP-LINING` templates share one sheet (`"FRP Tank and LI"`), so they share one
`sourceWorkbookHash` too — a change anywhere in that sheet flags both templates for review, even if
only one template's actual row range changed. This is a deliberate coarser-but-simpler choice over
hashing each template's specific row slice, which would have reintroduced the exact "where exactly
is the split point" judgment risk this pass was trying to avoid touching.

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
| `GET /api/quotation-templates?jobTypeCode=&includeArchived=` | `quotationTemplates:view`/`:manage` **or** `quotations:create` | List. Defensively calls `seedQuotationTemplatesIfEmpty()` first. A plain `quotations:create` browser (Sales picking a template for a quotation) only ever sees `isActive: true`, non-deleted templates; a `:view`/`:manage` holder sees all non-deleted ones, or (with `includeArchived=true`) archived ones too. Returns `{ templates: QuotationTemplateSummary[] }`. |
| `GET /api/quotation-templates/:id` | Same as above | Single full template. `404`s an inactive template for a non-admin browser. Returns `{ template: QuotationTemplate }`. |
| `POST /api/quotation-templates` | `quotationTemplates:create`/`:manage` | Create a new manual template (`sourceType: "manual"`). Body: `TemplateContentDraft`. `409`s on a duplicate `templateCode`. Returns `{ template: QuotationTemplate }`. |
| `PATCH /api/quotation-templates/:id` | Per touched field — `:activate` for `isActive`, `:archive` for `isDeleted`, `:edit` for any content field (any combination accepted in one call; `:manage` always suffices) | Content edits accept the full `TemplateContentDraft` shape; `isActive`/`isDeleted` toggles accept just that one field. Returns `{ template: QuotationTemplate }` for a content edit, `{ template: QuotationTemplateSummary }` for a pure toggle. |
| `POST /api/quotation-templates/:id/duplicate` | `quotationTemplates:duplicate`/`:manage` | Body `{ newTemplateCode? }` — server auto-generates `<code>-COPY`/`-COPY-2`/... if omitted. Deep-clones sections/items with fresh ids, `" (Copy)"` appended to the name, always created `isActive: false`, `sourceType: "manual"`, `version` reset to `"1.0"`. Returns `{ template: QuotationTemplate }`. |
| `POST /api/quotation-templates/import` | `quotationTemplates:import`/`:manage` | Runs `upsertQuotationTemplates()`. Returns the `TemplateImportReport` directly as JSON. |

Client wrapper functions in `src/lib/quotationTemplates.ts`: `fetchQuotationTemplates(opts?)`,
`fetchQuotationTemplate(id)`, `importQuotationTemplates()`, `setQuotationTemplateActive(id, isActive)`,
`setQuotationTemplateArchived(id, isDeleted)`, `createQuotationTemplate(draft)`,
`updateQuotationTemplate(id, draft)`, `duplicateQuotationTemplate(id, newTemplateCode)`.

## RBAC

**2026-07-15**: expanded from one coarse permission into 8. `"quotationTemplates:manage"` (the
original permission) is now documented as a **backward-compatible superset** — every server-side
check accepts `:manage` OR the specific granular permission the action needs, so a role/custom-role
that already held `:manage` before this pass keeps full access without an admin having to re-save
it. New granular permissions (all added to `src/lib/permissions.ts`'s `Permission` union,
`ALL_PERMISSIONS`, `PERMISSION_LABELS`/`PERMISSION_LABEL_KEY`, and the "ใบเสนอราคา" permission
group):

| Permission | Gates |
|---|---|
| `quotationTemplates:view` | Access to the Template Management admin page/list (sees inactive + archived templates) — distinct from the wizard's own browse-to-pick-a-template access, which still uses `quotations:create` (see below). |
| `quotationTemplates:create` | `POST /api/quotation-templates` (create a new template) and the wizard's "สร้าง Template ใหม่สำหรับประเภทงานนี้" button. |
| `quotationTemplates:edit` | `PATCH /api/quotation-templates/:id` when the request body touches content fields (`templateCode`/`sections`/etc.). |
| `quotationTemplates:duplicate` | `POST /api/quotation-templates/:id/duplicate`. |
| `quotationTemplates:activate` | `PATCH /api/quotation-templates/:id` when the body changes `isActive` relative to the persisted value. |
| `quotationTemplates:archive` | `PATCH /api/quotation-templates/:id` when the body changes `isDeleted` relative to the persisted value. |
| `quotationTemplates:import` | `POST /api/quotation-templates/import`. |

All granted by default to the **Administrator** role alongside `:manage` (redundant but keeps
Role Management's permission matrix showing every grant explicitly, in case `:manage` is ever
narrowed later). Not Super-Admin-exclusive (Super Admin already implicitly has every permission via
`role.isSuperAdmin`).

**Per-dimension enforcement, not one blanket check**: a single `PATCH` call can touch content,
`isActive`, and `isDeleted` at once (the edit form always submits the full `TemplateContentDraft`,
which includes `isActive`), but each dimension only requires its own permission when its value
*actually changes* relative to what's persisted — comparing against the persisted value (not just
field presence) is what lets a plain `:edit` holder save unrelated content changes without also
needing `:activate`, while still blocking an `:edit`-only holder from sneaking a real activation
through the same call. See `handleOne`'s `touchesActive`/`touchesArchive` in
`api/_lib/quotationTemplatesHandler.ts`.

Sales-facing template *read* access for the wizard (browsing/previewing templates while starting a
quotation) still deliberately reuses the **existing** `quotations:create` permission rather than
`quotationTemplates:view` — the same "manage vs. pick-for-a-quotation" carve-out pattern already
established for Customers (`customers:view` vs. `quotations:create`). `quotationTemplates:view`
is a *different*, stronger permission: it's what gates the **admin** Template Management page
(sees inactive/archived templates, full column detail), not casual browsing. A Sales User with only
`quotations:create` can use the wizard normally but never sees the Template Management nav entry or
page.

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
  **2026-07-15, second Codex-review fix pass — formally reconfirmed, not changed**: an independent
  review flagged this policy as "documented but should be explicitly accepted or constrained." This
  is the **explicit accept**: an inactive-but-not-deleted template staying a valid match for new
  quote creation is intentional, not a gap, for the reason already stated above. No code change was
  made here; see also `docs/RBAC.md` "Quotation Templates" for the same reconfirmation.
- `Quote.templateSnapshot?: { sections, defaultTerms, internalNotes, sourceHash, capturedAt }` —
  **added 2026-07-15, second Codex-review fix pass**, see "Structured Template Snapshot" below.

## Structured Template Snapshot (added 2026-07-15, second Codex-review fix pass)

An independent review found that only flattened `QuoteLine[]` plus the 3 provenance strings above
were stored — no real copy of the template's own `TemplateSection[]`/`TemplateItem[]` structure,
correctly flagged as High Priority since it weakens future audit/reconstruction ("what exactly did
this template look like, structurally, at the moment this quote was created?").

`Quote.templateSnapshot` now answers that: a real, frozen-at-creation copy of the matched template's
`sections`, `defaultTerms`, `internalNotes`, and `sourceHash`, plus a `capturedAt` timestamp.
Populated server-side only, by a new `loadTemplateSnapshot()` in `api/handlers/quotes.ts` — one
extra targeted `findOne` on `quotation_templates` (only when `quotationTemplateId` was actually
matched by `validateQuotationTemplate()`; never queried for a blank-start quote). Never
client-writable and never editable after creation: `sanitizePartialQuoteFields()` doesn't list it in
its `PATCH /api/quotes/:id` allow-list, so it's structurally impossible to change post-creation, the
same guarantee `quotationTemplateName`/`quotationTemplateVersion` already have.

**Deliberately includes `internalNotes`** — unlike `Quote.lines` (still never gets them, see below)
— because this is a pure internal audit-trail field, gated by the same permissions as the rest of
the quote document (`quotations:view`-family), and **no rendering path reads it**: the quotation
form, `LineItemsEditor.tsx`, and `PrintDocument.tsx`/the PDF all continue to read only `lines`,
exactly as they did before this field existed. This is intentionally the more complete, more useful
audit record — the whole point of "structured snapshot for reconstruction" is defeated if the
snapshot itself omits content that existed in the template at the time.

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
- **An item with `visibleToCustomer: false` is skipped entirely** — added 2026-07-15, second
  Codex-review fix pass. Previously every item was copied unconditionally regardless of this flag,
  so marking an item hidden-from-customer in the Template Management editor had no actual effect on
  an applied quotation. A section whose every item is hidden this way still emits its header line;
  the pre-existing "don't print a section header with no items following it" PDF rule already covers
  the resulting empty section without further changes.
- Each remaining `TemplateItem` becomes one ordinary `QuoteLine`: `description` = `item.name`,
  `unit`/`qty` copied (`quantity: null` → `qty: 0`), `unitPrice`/`discount` always `0` (never
  invented, per the "no prices were ever invented" rule above).
- `subDetails` = `item.specifications` (each non-blank line, one row per line — **2026-07-21**:
  `QuoteLine.notes`/`.specifications` were removed from the data model entirely as an unused feature,
  see CHANGELOG.md and [Quotation.md](./Quotation.md) "Per-item sub-details & tags"; `item.
  specifications` previously joined into that now-gone field, and folds into `subDetails` instead as
  of this date, so a template item's real spec attributes — e.g. "Material: Steel" — keep reaching
  the applied quotation and its print output unchanged, just via a different mechanism) **plus**
  `item.subDetails` (real sub-detail text an admin configured in the editor — **fixed 2026-07-15**,
  previously silently discarded here even though the editor/API saved it) **plus** one row per
  `editableParameter`, rendered as fill-in-the-blank text: `"Label: ______ Unit"` (e.g. `"Capacity:
  ______ CMH"`) — a clear editable prompt, never a fabricated value. Order: specifications first,
  then the item's own configured sub-details, then generic prompts last.
- **`internalNotes` (both item-level and template-level) are NEVER copied into `lines`** — dropped
  entirely by this function, by design, so an internal review comment can never reach a
  customer-facing quotation or its PDF, even indirectly. (Separately, `Quote.templateSnapshot` — see
  above — *does* retain them, but purely as an internal, never-rendered audit record; that field is
  a deliberate exception to this rule, not a contradiction of it.)
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

**2026-07-21**: section-header lines were previously only ever reachable by applying a Template —
there was no way to add one to a quotation built from scratch (a user-reported gap: "the Template
editor lets me add a Section, but a plain quotation doesn't"). `LineItemsEditor.tsx` now has its own
"เพิ่ม Section"/"Add Section" button (next to "เลือกจากคลังสินค้า"/"เพิ่มรายการเอง" in the line-items
toolbar) that appends a `{ ...blankLine(), isSectionHeader: true }` line directly — same
zero-priced/freely-editable/removable line as one copied from a template, just user-initiated. No
`QuoteLine`/API/validation changes were needed since `isSectionHeader` already existed as a normal
optional field on every line.

## Wizard UI (screens, states)

See "Business Flow" above for the step-by-step flow. Component: `QuotationTemplateWizard.tsx`.
Wired into `QuotationPage.tsx` via a new `"wizard"` view state. Result type:
`QuotationWizardResult = { jobTypeCode, jobTypeName, templateSnapshot }`, consumed by
`QuoteDocument.tsx`'s new `wizardResult` prop (fresh "new" mounts only).

**2026-07-21, UX pass**: two user-reported usability fixes to the Step 1 Job Type grid/screen —
(1) Job Types whose code started with `"OTHER"` were sorted to the end of the grid instead of
interleaving alphabetically with the real categories (a client-side sort in
`QuotationTemplateWizard.tsx`, not a change to `fetchJobTypes()`'s server-side order, since other
pages reading the same list — Job Type admin, Dashboard filters — weren't asked to change); (2) the
Step 1 "ยกเลิก" button was a bare muted text link that read as barely-there — restyled to the app's
standard outline/secondary button (`border border-border ... hover:border-[#c9a84c]/40`, per
`docs/UI_GUIDELINES.md` "Buttons"), no new button style invented.

**Same day, first refinement**: extended (1) to a 3-way partition — Job Types with an active
Template first, Job Types with no Template next, `"OTHER"`-prefixed codes still last in both — per a
follow-up request that the has-Template ones should be the first thing a user sees. Depends on the
same `templateCounts` fetch the "มี Template N แบบ" badges already use, so the grid quietly reorders
once that resolves, same as the badges themselves.

**Same day, second refinement**: a follow-up screenshot clarified the "push to the end" ask meant
only the exact `"OTHER"` code ("Other Jobs," the generic fallback) — the *prefix* match had also
been catching `OTHER BF`/`OTHER SC`/`OTHER TA`, which are their own specific sub-categories (Other
Dust Collector/Wet Scrubber/Fiberglass Tank Related Work), not the generic fallback. Narrowed the
check from `code.startsWith("OTHER")` to `code === "OTHER"` — `OTHER BF`/`OTHER SC`/`OTHER TA` sorted
normally in the has-Template/no-Template groups like any other Job Type; only the exact `"OTHER"`
tile was pushed to the very end.

**Same day, third refinement**: a further follow-up asked for `OTHER BF`/`OTHER SC`/`OTHER TA`
themselves to also be grouped near the end — just *before* the generic `"OTHER"`, not mixed in with
the ordinary has-Template/no-Template groups. The grid is now a stable 4-way partition: (1) ordinary
Job Types with a Template, (2) ordinary Job Types without one, (3) `OTHER BF`/`OTHER SC`/`OTHER TA`
as their own group, (4) the generic `"OTHER"` last. `isGenericOtherJobType` (exact `=== "OTHER"`) is
unchanged from the prior refinement; a new `isOtherSubcategoryJobType` (`startsWith("OTHER") && code
!== "OTHER"`) carves out group 3.

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

## Template Management Module (added 2026-07-15)

`จัดการ Template ใบเสนอราคา` — sidebar under งานขาย, below ใบเสนอราคา, gated by
`quotationTemplates:view` (see "RBAC" above). `src/pages/templates/TemplateManagementPage.tsx`
(list) + `TemplateEditorView.tsx` (create/edit form), a list/editor-view split like
`QuotationPage.tsx`'s own list/detail pattern (an editor with a full section/item tree is too large
for a modal, unlike `CustomersPage.tsx`'s list+modal).

**List page**: columns per the task spec (Template Code, Name, Job Type, Version, Sections, Items,
Status, Source, Updated At) with search (name/code/job type), Job Type filter, active/inactive
filter, imported/manual source filter, and a "show archived" toggle. Row actions: ดูตัวอย่าง (uses
the shared `TemplatePreview` component, full detail), แก้ไข (`:edit`), ทำสำเนา (`:duplicate`),
เปิด/ปิดใช้งาน (`:activate`), เก็บถาวร/กู้คืน (`:archive`), and — for an active, non-archived
template — a "สร้างใบเสนอราคาจาก Template นี้" shortcut that deep-links into the Create Quotation
wizard with that Job Type + Template preselected (reuses the existing Global-Search
`navigateToTemplate()` plumbing in `App.tsx`).

**Create/edit form**: basic fields (Template Code, Name, Job Type select, Description, Version,
Active checkbox — the checkbox only renders for a `:activate` holder; others see a read-only status
line, matching the server's own per-dimension permission split) plus a full section/item editor.
**2026-07-21, restyle pass**: the form was rebuilt to visually mirror `QuoteDocument.tsx`/
`LineItemsEditor.tsx` — a navy/gold document header band (`BrandMark` + status pill), the same
two-column meta-grid pattern for the basic fields, a table-styled sections/items list (mono uppercase
column headers, borderless inputs, expandable detail row — `ItemEditor` is now a `<tr>`, not a stacked
div card), and a 3-column Terms block — purely a visual change, no field/handler/validation logic
moved. See CHANGELOG.md 2026-07-21.
- **Sections**: add/rename/delete/reorder (up/down buttons — no drag-and-drop dependency in this
  codebase; matches its established "hand-rolled Tailwind, no UI kit" convention).
- **Items**: add via "เลือกสินค้า" (opens the existing `ProductPickerModal`, copies
  name/unit/specifications into the item plus a `productSnapshot` — see "Data Model") or "เพิ่ม
  รายการเอง" (a blank custom item). Each item: name, type (item/subItem/specification), quantity,
  unit, reorder/duplicate/delete, and an expandable detail panel for specifications (customer-visible
  free text — this codebase's existing `TemplateItem` schema has no separate "customer notes"
  field, so a specification line *is* the customer-visible-notes mechanism; `visibleToCustomer` can
  still hide an entire item — and, as of 2026-07-15, actually does: see "Template → Quote Snapshot
  Semantics"), editable parameters (label + unit pairs), and internal notes (visually flagged amber,
  never shown to the customer). **2026-07-21, pinned sub-details restyle**: `item.subDetails` (also
  actually reaches the applied quotation as of 2026-07-15, see below) moved out of that expandable
  panel's shared multi-line textarea into its own per-line "pinned" `<tr>` directly beneath the
  item's row — gold-tinted highlight, Pin icon, auto-focused input on add — matching the same
  restyle applied to `LineItemsEditor.tsx` (see [MODULES/Quotation.md](./Quotation.md)). The Pin
  icon in the item's action column (`item.subDetails.some(s => s.trim())` gates its gold fill) adds
  a new line; Specifications/Internal Notes keep the original paste-friendly one-line-per-entry
  textarea (`linesToArray()`) unchanged — only sub-details, the field that maps 1:1 to the reference
  UI's pinned-line concept, was converted to per-row inputs.
  **2026-07-15, second Codex-review fix pass — product links are now server-verified**: an
  independent review found that `sanitizeItem()` trusted a caller-submitted `productId`/
  `productSnapshot` verbatim — the UI picker always supplied genuine data, but a direct (authorized)
  API call could have saved a nonexistent product id or an entirely forged snapshot. Fixed:
  `sanitizeContent()` now batch-resolves every referenced `productId` against a real, non-archived
  `products` record (one query per save, not N+1) *before* sanitizing any item, and `productSnapshot`
  is always rebuilt server-side from that real record — a client-submitted `productSnapshot` is
  never persisted as-is. An unresolvable `productId` (archived, deleted, or fabricated) is silently
  dropped rather than rejecting the whole save — the item keeps its already-typed name/unit/specs and
  just becomes an unlinked custom item.
- **Default Terms**: three grouped lists (payment/warranty/tax), add/remove lines per group.
- **Template-level internal notes**: a separate free-text list, same customer-hidden guarantee as
  item-level internal notes.

**Duplicate**: prompts for a new Template Code (pre-filled `<code>-COPY`), calls
`POST /:id/duplicate`, then opens the new copy directly in the editor — always created
`isActive: false` (Draft/Inactive) so it can't accidentally reach Sales before review, per the task
spec's explicit requirement. The original is never modified (a real server-side deep clone with
fresh ids, not a client-side reference).

**Versioning — the practical rule actually implemented**: `version` is a plain string field, never
auto-incremented. Editing a template's content does **not** bump it — the admin is responsible for
updating the `version` field by hand if they want the change reflected there. This is intentionally
simple (no version-history collection, no branching) because the thing that actually matters —
"existing quotations must never change when a master template is edited" — is already fully
guaranteed by the **snapshot-on-apply** semantics (see "Template → Quote Snapshot Semantics" above):
a quote created from a template freezes its own copy of `quotationTemplateVersion` *and* every
line/section it copied, at creation time, forever. Editing the master template afterward — content
*or* version string — can never retroactively change that quote. New quotations always see the
template's current (possibly just-edited) content the next time they open the wizard, since the
wizard always fetches the live document, never a cached one. This is a deliberate "practical over
elaborate" choice per the task's own "keep the implementation practical and document the chosen
behavior" instruction — a real version-history feature (browsing old versions, reverting) was not
built, since nothing in the spec's acceptance criteria requires it beyond what snapshotting already
provides.

**Audit logging**: every lifecycle action writes a server-side entry via
`writeTemplateAuditEntry()` (`api/_lib/quotationTemplatesHandler.ts`) — `Template Created`,
`Template Updated`, `Template Duplicated`, `Template Activated`/`Template Deactivated`, `Template
Archived`/`Template Unarchived`, `Templates Imported` — module `"Template ใบเสนอราคา"`, with
`relatedTemplateId`/`relatedTemplateName`/`relatedJobTypeCode` fields on `AuditLogEntry`
(`src/lib/auditLog.ts`) mirroring the existing `relatedQuoteId`/`relatedCustomerName` convention. On
the quotation side, `POST /api/quotes`'s audit entry (`api/handlers/quotes.ts`) now distinguishes
`"Quotation Created from Template"` (includes the template name + version in `details`) from
`"Quotation Created (Blank)"` (includes the Job Type code) instead of one generic "Quotation
Created" for both.

**Wizard additions**: the Job Type grid (Step 1) now shows a per-card badge — "ยังไม่มี Template" /
"มี Template" / "มี Template N แบบ" — computed from one extra unfiltered `GET
/api/quotation-templates` call at mount, client-filtered to `isActive` (see
`QuotationTemplateWizard.tsx`'s `templateCounts`). A `quotationTemplates:create` (or `:manage`)
holder additionally sees a "สร้าง Template ใหม่สำหรับประเภทงานนี้" action on both the empty-state
screen (Job Type with zero templates) and the multi-template choice screen — deep-links into
Template Management's create form with that Job Type pre-filled (`App.tsx`'s
`navigateToCreateTemplateForJobType()` → `templateCreateForJobType` state →
`TemplateManagementPage`'s `initialCreateForJobType` prop). This button is deliberately distinct
from "เริ่มจากแบบฟอร์มเปล่า" (start blank) — per the task's own "Do Not Confuse 'OTHER' Job Type
with Blank Template" instruction, the two are never conflated in the UI or the code.

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
- `src/lib/quotationTemplates.ts` — types + client `fetchX()`/`importX()`/`setX()`/`createX()`/
  `updateX()`/`duplicateX()` API wrappers.
- `api/_lib/templateSeedData.ts` — the 5 extracted templates as structured seed data.
- `api/_lib/quotationTemplatesHandler.ts` — `upsertQuotationTemplates()`,
  `seedQuotationTemplatesIfEmpty()`, and the route handler logic mounted from `api/handlers/jobtypes.ts`,
  including (2026-07-15) create/edit-content/duplicate handlers and `writeTemplateAuditEntry()`.
- `src/components/TemplatePreview.tsx` (added 2026-07-15) — shared preview rendering, used by both
  the wizard's Step 3 and Template Management's "ดูตัวอย่าง."
- `src/pages/templates/TemplateManagementPage.tsx` / `TemplateEditorView.tsx` (added 2026-07-15) —
  the Template Management module itself.
- Edited: `api/_lib/collections.ts` (indexes), `api/handlers/jobtypes.ts` (route dispatch),
  `vercel.json` (rewrites), `src/lib/permissions.ts`/`src/lib/roles.ts` (RBAC),
  `src/lib/i18n.tsx` (dictionary keys), `src/lib/quotes.tsx` (new `Quote`/`QuoteLine` fields),
  `src/lib/auditLog.ts` (2026-07-15: `relatedTemplateId`/`relatedTemplateName`/`relatedJobTypeCode`),
  `api/_lib/quoteValidation.ts`/`api/handlers/quotes.ts` (server-side template validation + snapshot;
  2026-07-15: from-template vs. blank audit-entry distinction),
  `src/pages/quotation/QuoteDocument.tsx`/`QuotationPage.tsx`/`LineItemsEditor.tsx`/
  `PrintDocument.tsx` (wizard wiring + section-header rendering; 2026-07-15: `QuotationPage.tsx`
  gained `canCreateTemplate`/`onCreateTemplateForJobType` pass-through props),
  `api/_lib/searchHandler.ts`/`src/lib/search.ts`/`src/components/GlobalSearch.tsx`/`src/App.tsx`
  (Global Search deep-link; 2026-07-15: `App.tsx` also gained the Template Management nav
  entry/sidebar group placement, granular permission booleans, and the
  `navigateToCreateTemplateForJobType()` deep-link),
  `package.json` (removed the `xlsx` npm package — it was only ever used for one-time offline Excel
  analysis via ad-hoc Node scripts during development, never imported by any runtime `api/`/`src/`
  code, so it's been fully removed rather than kept as a stale dependency).

## Known Limitations

- **No live MongoDB/Vercel access was available during development, on any of the 3 passes.**
  `npx tsc -b` (frontend), `npx tsc --noEmit -p tsconfig.api.json` (backend), `npm run lint`, and
  `npm run build` all pass clean on all 3 passes (2026-07-14 build, 2026-07-15 Template Management,
  2026-07-15 second Codex-review fix pass). Each pass additionally confirmed the client bundle loads
  with **zero browser console errors** via a local dev server + Playwright — the app correctly falls
  back to its documented "ไม่สามารถเชื่อมต่อระบบได้" retry state at the session-check API call, since
  there's no local `MONGODB_URI`/`JWT_SECRET`. The third pass additionally verified
  `fingerprintSourceWorkbook()` directly against the real workbook file (correct sheet names, row
  counts, and hashes — see "Real Workbook Change Detection"). What could **not** be verified locally,
  on any pass: an actual `upsertQuotationTemplates()` run against a live `quotation_templates`
  collection, real `GET/POST/PATCH/DELETE /api/quotation-templates*` round-trips, the wizard's live
  fetch/preview/apply flow with real data, the Template Management page's live
  list/create/edit/duplicate/archive/import flow against a real database, or Global Search actually
  returning template results. Same sandboxed-session network limitation documented elsewhere in this
  project's docs (see PROJECT_STATUS.md "Known Risks") — before treating this feature as fully
  verified, run the task spec's own manual test plan against a real deployment/local MongoDB
  connection.
- **Full automated classification of parsed workbook rows into structured template content remains
  unbuilt** (updated 2026-07-15, second Codex-review fix pass — supersedes the two limitation bullets
  this replaces). Real workbook parsing now exists (`api/_lib/templateWorkbookParser.ts`) and
  genuinely detects when the source `.xlsx` file changes (see "Real Workbook Change Detection"
  above) — this is new, real capability, not just documentation. What still doesn't exist is a
  parser that reads those raw rows and *itself* decides which are sections/items/sub-items/
  specifications/editable-parameters/internal-notes/terms, replacing the hand-transcription in
  `api/_lib/templateSeedData.ts`. This was a deliberate scope decision this pass (not an oversight):
  direct inspection of the real workbook found rows that pack multiple different classifications
  into different columns of a single row (see the module doc's "Real Workbook Change Detection"
  section for two concrete examples), which a naive automated classifier could easily get wrong in
  ways that are hard to detect and could silently corrupt already-twice-reviewed, customer-facing
  quotation content. If this becomes a real recurring need (the workbook changes often enough that
  manual re-transcription becomes a bottleneck), a future pass should build this carefully, sheet by
  sheet, verified against the current hand-transcribed content as ground truth — not attempted in a
  single fast pass.
- **Item-level "customer-visible notes" reuse the existing `specifications` field** rather than a
  dedicated new field — this codebase's `TemplateItem` schema (established 2026-07-14) has no
  separate `customerNotes` concept, and adding one would have meant touching `applyTemplate.ts`,
  `templateSeedData.ts`, and the quote-line conversion rules again for a distinction with no
  behavioral difference from a specification line. `visibleToCustomer` (item-level) still exists as
  a coarser show/hide-the-whole-item toggle. Documented here as a deliberate simplification, not an
  oversight.
- **No version-history/rollback feature.** `version` is a plain string an admin edits by hand; there
  is no way to browse or restore a template's prior content. See "Template Management Module —
  Versioning" above for why this is an intentional, practical choice given that quote-level
  snapshotting already provides the actual guarantee the spec cares about (existing quotations never
  change when a master template is edited).
- **Reordering uses up/down buttons, not drag-and-drop** — this codebase has no drag-and-drop
  dependency anywhere and one wasn't added for this pass; matches the existing "hand-rolled Tailwind,
  no UI kit" convention (see docs/UI_GUIDELINES.md).
