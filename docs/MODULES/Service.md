# Service (บริการ)

**Status**: Phase 1 shipped 2026-08-06 — data model, checklist-template engine, Service Report
CRUD, desktop-first editor, RBAC, navigation — plus photo attachments on Abnormal items and a
printable Service Report, pulled forward from the original Phase 2/3 roadmap the same day per
direct user request via `/impeccable design`. Signature capture, mobile/iPad UX, and customer
acceptance (on-site + remote) remain later, not-yet-built phases — see Roadmap below.

## What it is

A field-service checklist + detailed report combining the company's paper "SERVICE CHECK SHEET"
and its narrative Service Report into one digitized workflow. Unlike Scope of Work/Delivery Order
(each generated from, and snapshotting, the document before it in the Quotation chain), a Service
Report is created **directly against a Customer** — there is no quotation in its provenance.

## Data model

Two collections (`api/_lib/collections.ts`):

- **`service_templates`** (`ServiceTemplate`, `src/lib/serviceTemplates.ts`) — master checklist
  structure: `sections` → `groups` → `items`. Each item has a `kind`
  (`"normalAbnormal" | "measurement"`). A section can be `isOptionalAddon: true` (e.g. "ระบบ Dust
  Collector (เพิ่มเติม)") — a report opts these in per-record rather than always including them.
  `templateCode` is the stable natural key (unique index), e.g. `SVC-AIRPOLLUTION-STD`.
- **`service_reports`** (`ServiceReport`, `src/lib/serviceReports.ts`) — `id` is the human doc
  number (`SR-{buddhistYear}-{seq}`), stored directly as `_id`. Freezes the chosen template's
  `sections` onto `templateSnapshot` at creation time (editing the master template afterward never
  retroactively changes an already-created report's checklist) and, if a `Customer` was linked,
  freezes a 7-field `customerSnapshot`.
- **`service_checklist_photo_files`** (added same day as photo attachments) — Binary-in-Mongo file
  bytes, same "keep bytes out of the parent document, serve via an unauthenticated capability-URL"
  pattern as `scope_attachment_files`. Photo *metadata* (`ServiceChecklistItemPhoto`) is embedded on
  the matching checklist item inside `ServiceReport.checklist`, never the bytes.

### Checklist taxonomy (seeded, real source data)

Two templates are seeded idempotently on first `GET /api/service-templates`
(`api/_lib/serviceTemplateSeedData.ts`, `upsertServiceTemplates()` — content-hash-gated, re-running
never duplicates), transcribed verbatim from the company's real reference files:

- **`SVC-AIRPOLLUTION-STD`** — from `public/รายการตรวจเช็ค.pdf` (the clean "SERVICE CHECK SHEET"),
  4 sections / 30 items: การบำรุงรักษาระบบ (Blower + Visual Check), ระบบ Dust Collector
  (เพิ่มเติม, optional), เช็คระบบควบคุมการทำงาน (electrical check + Air Flow measurements), ระบบ
  Chemicals Feeding (เพิ่มเติม, optional).
- **`SVC-CARBON-WETSCRUBBER`** — from `public/Service.xlsx`'s "Sheet1" tab, a genuinely distinct,
  more granular taxonomy for Activated Carbon/Wet Scrubber systems, 1 section / 25 items across 6
  groups (kept separate from the PDF taxonomy per explicit instruction not to merge them).

`Service.xlsx`'s "check sheet" tab was intentionally NOT used as a seed source — it's a rough draft
mirroring the PDF with one orphan leftover row; the PDF is authoritative for that taxonomy.

## Numbering

Atomic-counter auto-generated (`nextServiceReportId()`), `SR-{buddhistYear}-{seq:4}` e.g.
`SR-2569-0001`, same `counters` collection + `findOneAndUpdate($inc)` idiom as `nextQuoteId()`. The
Buddhist year is computed dynamically (`new Date().getFullYear() + 543`), unlike Quotes' hardcoded
`QUOTE_YEAR` — avoids that module's known yearly-bump wart.

**Why auto-numbered, unlike Scope of Work** (which deliberately moved to fully-manual numbers
2026-07-29): Scope of Work is created by office staff copying an already-known external document
number. A Service Report is field-created with no pre-existing number to copy from, so
auto-numbering removes the exact typo/duplicate-number friction manual entry would cause there.

## Checklist status rules

`status` on a `normalAbnormal` item is a single field
(`"not_selected" | "normal" | "abnormal"`), so Normal/Abnormal mutual exclusivity is structural — a
3-way toggle, not two independent checkboxes (`ServiceChecklistItemControl.tsx`). Selecting
Abnormal reveals, inline:

- A **required, non-blank `abnormalDetail`** field.
- **At least one attached photo** (added same day as the print view) — the "Photos" label shows a
  red "*at least 1 required" hint until one exists.

Neither is silently cleared if the status is later changed back to Normal — only an explicit user
action (retyping the field, deleting a photo) removes them. A `measurement`-kind item renders a
single text input instead, with completion requiring it non-blank.

Server-side, `mergeChecklist()` (`api/_lib/serviceReportHandler.ts`) rebuilds the whole `checklist`
array by walking the report's own frozen `templateSnapshot.sections` on every `PATCH` — a client can
only ever toggle `status`/`abnormalDetail`/`measurementValue`/a section's `included` flag on an
item/section the server itself generated, never inject a new one (`photos` is separately excluded
from this merge — see Photos below, it's managed only through its own dedicated routes).

Validation (`src/lib/validation/serviceReportValidation.ts`, shared verbatim client+server):
`validateServiceReportForSave()` (lenient — a Draft may be saved incomplete, only well-formed dates
are enforced) and `validateServiceReportForCompletion()` (strict — every applicable field/checklist
item required, folded from `validateServiceChecklist()`'s item-path-keyed `itemErrors` into the
shared `groupErrors.checklist` string array for the generic `ValidationResult` contract). The
`POST /:id/status` `"complete"` route additionally returns the raw item-path-keyed errors as
`checklistItemErrors` in its `422` response (`throwIfIncomplete()`'s third argument) so the client
can highlight the exact failing control rather than only show a flat message list — see
`ApiError.checklistItemErrors` (`src/lib/apiClient.ts`) and `ServiceReportEditor.tsx`'s
`applyApiError()`.

## Photos (added 2026-08-06, pulled forward from the Phase 2 roadmap)

Attached per checklist item, only while `status === "abnormal"` and the report is `Draft`. Same
Binary-in-Mongo + unauthenticated capability-URL pattern as Scope of Work's document attachments,
sized for camera photos rather than documents: **4 MB/photo, 6 photos/item** (vs. Scope of Work's
2 MB/5-files-per-record). Routes on `serviceReportHandler.ts`:

- `POST /api/service-reports/:id/photos` — body `{sectionKey, groupKey, itemKey, fileName,
  contentType, dataBase64}`; validates `image/*` content type, base64 charset + size caps before
  decode (same defensive pattern as Scope of Work's attachment upload), locates the item by its
  3-part path (`findChecklistItemPath()`), stores the Binary, pushes `ServiceChecklistItemPhoto`
  metadata onto that item.
- `DELETE /api/service-reports/:id/photos/:photoId` — scans the checklist to find and remove the
  metadata entry, deletes the Binary doc.
- `GET /api/service-reports/:id/photos/:photoId/download?key=` — **unauthenticated**, gated by a
  24-random-byte `downloadKey` capability token; a wrong/missing key is an opaque 404. Only
  `image/png|jpeg|gif|webp` serve `Content-Disposition: inline`; anything else forces `attachment`
  with `nosniff` (same XSS-hardening as the Scope of Work download route).

Client UI: `ServiceChecklistItemControl.tsx`'s `PhotoAttachments` — a thumbnail grid (each photo an
`<img>` pointed at its capability-URL) with a hover-revealed delete button, plus an "Add photo" tile
(`<input type="file" accept="image/*" capture="environment">` — the `capture` hint is forward
compatible with the mobile/camera phase without changing this control). Disabled with an
explanatory reason while the report doesn't exist yet (`serviceReportId === "new"` — there's
nowhere to store bytes against until the Draft is created).

## Print (added 2026-08-06, pulled forward from the Phase 3 roadmap)

`ServiceReportPrintDocument.tsx` — browser-native print CSS, **no PDF library exists in this app**
(confirmed absent from `package.json`; every print view in this codebase is `window.print()` +
`@media print` CSS). Same `@page { margin: 0 }` + manual padding-compensation technique as
`ScopeOfWorkPrintDocument.tsx`/`DeliveryOrderPrintDocument.tsx`, so the browser's own date/URL/title
header-footer never appears. **A4 portrait** (this app's print default), deliberately built to the
formal reference-form look (plain black-on-white, hairline borders, dense small type) rather than
the navy/gold app design system — per `DESIGN.md`'s standing rule that formal print documents
reproduce a real paper form, not app chrome.

Structure (page 1 → detail pages → signature, reconciling the two real reference report PDFs —
`public/Report Oil Mist Filter M - ...pdf` and `public/Report Service - ...พยนต์...pdf`):

1. Letterhead (logo/name/address/phone/email/Facebook/Line/website — same `CompanyHeaderInfo`
   mapping as every other print document) + "SERVICE REPORT / รายงานสรุปงานบริการ" title + report
   info fields (reconciling both references' differing label sets into one canonical set).
2. "สรุปภาพรวมสำหรับลูกค้า" (Overall Customer Summary) in a dark-blue bar, if filled.
3. Full checklist summary, section → group → item, each item showing a print-safe status mark
   (a filled/outline glyph, not color alone, so Normal vs. Abnormal survives a black-and-white
   printer) or its measured value.
4. One **"SERVICE ITEM n"** blue-bar detail block per Abnormal item (canonical layout from the Oil
   Mist Filter reference) — section/group context, the full `abnormalDetail` text, and a photo grid
   (1 photo = full width, 2+ = two columns) pulling each photo's capability-URL directly.
5. Overall remark, then a two-column signature block: Service Engineer (typed name + saved
   `signatureDataUrl` if the assigned user has one, matching Scope of Work's signature-image
   convention) and Customer (blank lines — no signature capture exists yet, see Roadmap).

`POST /api/service-reports/:id/print` (gated by the new `service:print` permission) writes a
`"Service Report Printed"` audit entry before the client calls `window.print()` — deliberately
**not** hard-gated on completeness (unlike Scope of Work's print route): a Draft can be printed for
review, matching Delivery Order's simpler "print doesn't require a document-complete gate"
precedent. If the audit-log call itself fails, printing still proceeds (client-side fallback), same
philosophy as Delivery Order's "100% client-side print" note in `RBAC.md`.

## Routes

See [API.md](../API.md) "Service Templates + Service Reports" for the full method/auth/route table
(list/get/create/update/status-change/delete for both resources, plus the photo and print routes
above). Mounted on `api/handlers/customers.ts` (not `quotes.ts`) — Vercel Hobby's 12-function cap is
fully used, and a Service Report's one real relational anchor is `customerId`/`customerSnapshot`,
the same entity `customers.ts` already owns.

## Permissions

11 permissions — see [RBAC.md](../RBAC.md) "Service" for the full table and default-role grants.
Own standalone "บริการ" permission group in Role Management (not nested into "ใบเสนอราคา" —
Service Reports aren't part of the quotation→scope→delivery chain). **No seeded role except Super
Admin/Administrator can currently create a report** — there's no seeded "Service Engineer" role; a
manual Role Management step is required post-deploy, same standing pattern every prior module has
needed.

## UI

- `src/pages/service/ServicePage.tsx` — list/detail(create-or-edit) view-switcher, mirrors
  `ScopeOfWorkPage.tsx`.
- `ServiceList.tsx` — search/filter table (by report no./customer/location/system/engineer),
  status stat tiles, same table convention as every other module list.
- `ServiceReportEditor.tsx` — the desktop-first editor: report-info form (incl.
  `CustomerSelector.tsx` reused as-is), template picker (new-report only), checklist rendering with
  a live "`x / y` items" completion counter, status actions (Save Draft/Mark Complete/Reopen/Cancel
  Report/Delete/**Print/Export**).
- `ServiceTemplateManagement.tsx` — template list + a sections/groups/items editor (add/edit/
  remove/duplicate/reorder at every level via up/down buttons, matching this app's "no drag-and-drop
  library, arrow buttons instead" convention).
- `src/components/ServiceChecklistItemControl.tsx` — the reusable checklist-item primitive
  (3-way toggle / measurement input / photo attachments) later mobile-UX work builds on top of, not
  replaces.
- `src/pages/service/ServiceReportPrintDocument.tsx` — the print view (see Print above).

Sidebar nav: two items under a standalone "บริการ" group — "บริการ" (Service, the report
list/editor) and "Template รายงานบริการ" (Service Templates).

## Roadmap (not yet built)

- **Signature capture** — reuse `ImageUploadField.tsx`'s base64-inline pattern for the Service
  Engineer + Customer signatures (small enough to stay inline, unlike photos).
- **Mobile/iPad UX pass** — touch-card treatment of the checklist controls, camera-first capture
  flow — built on top of the same `ServiceChecklistItemStatus`/photo model already shipped, not a
  replacement. `PRODUCT.md` currently states "desktop/laptop only... not a real mobile/tablet usage
  scenario" for this app generally; this pass, when it happens, is the one deliberate exception and
  should update that note.
- **Customer acceptance** — on-site (in-app signature) + remote (a **time-boxed, single-purpose**
  capability-token link — explicitly **not** the always-live unauthenticated document view the team
  already built and removed once for Delivery Order, see `docs/TODO.md`).
- **LINE OA integration** — a provider-abstraction stub (disabled with a clear Thai
  "ยังไม่ได้ตั้งค่า" message until real channel credentials exist) for sending the
  remote-acceptance link; no fake/mocked successful sends ever. Needs a real company LINE OA +
  LINE Developers Messaging API channel + `LINE_CHANNEL_ACCESS_TOKEN`/`LINE_CHANNEL_SECRET` before
  it can work — not something this codebase can provision on its own.
