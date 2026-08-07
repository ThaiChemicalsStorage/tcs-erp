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
3-way toggle, not two independent checkboxes (`ServiceChecklistItemControl.tsx`). Editor rendering
is a real `<table>` per section (one `<thead>`, one `<tbody>` per group), each item a `<tr>` with the
item label in the first cell and square ปกติ/ผิดปกติ checkbox cells (`CheckboxCell`) in the other
two — matching the two-column checkbox layout of the paper reference form
(`public/รายการตรวจเช็ค.pdf`), replacing an earlier flex/div card layout (2026-08-06). Selecting
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

## Per-report checklist customization (added 2026-08-06, direct user request)

Every service job differs from the paper form, so an existing Draft report's checklist structure is
editable per report: each group gets an "เพิ่มรายการ" (add item) row, each section gets an
"เพิ่มหัวข้อ" (add heading/group) row, every item row gets a trailing ✕ remove column, and every
group header gets a delete button (`structureEditable = !isNew && isEditable` — a new-report
preview stays read-only, same rule as photos). Names are entered via the shared `PromptDialog`;
removal is instant when the target holds no recorded data and asks via `ConfirmDialog` when data
(status/detail/photos, or a non-empty group) would be lost. Added items are always
`normalAbnormal`-kind with a client-generated `c-…` key; changes are local until Save, like item
toggles.

**Renaming in place (added 2026-08-07).** An item's label and a group's heading can also be
**reworded** without deleting and re-adding — the old workaround, which minted a new key and so
threw away that item's recorded status/abnormalDetail/photos. A rename is an edit, not a replace:
the key is preserved, so `checklist` (which is keyed) passes through untouched.

The interaction is deliberately affordance-free — the row already carries a ✕ remove button, and a
second per-row control would crowd it — so `src/components/InlineEditableLabel.tsx` turns the text
into an input on **double-click** (mouse), a **single tap** (touch/pen), or **Enter/Space** when
focused; Enter or blur commits, Escape cancels, and a blank value reverts rather than producing a
`400`. The mouse/touch split comes from `pointerType` inside one handler rather than separate mouse
and touch paths that could drift, with a 10 px tap-slop check so finger-scrolling a long checklist
can't open an editor. Because there is no visible icon, the trigger is a real focusable `button`
with an explanatory `aria-label`/`title`, and the gesture is stated once above the checklist — a
mouse-only gesture with zero affordance would be both undiscoverable and inaccessible.

Gated by the same `structureEditable = !isNew && isEditable` rule as add/remove, so it needs
`service:edit` on a Draft — Administrator and Service Engineer alike. It **required no server change
at all**: `sanitizeServiceTemplateSections()` already keys off `key` and takes `title`/`label` from
the payload, so a same-key rename was valid input to the existing PATCH path from day one.
`MAX_CHECKLIST_ITEM_LABEL_LENGTH`/`MAX_CHECKLIST_GROUP_TITLE_LENGTH` are now exported from that
module so the rename inputs clamp to exactly what the sanitizer enforces, instead of a duplicated
literal drifting into an opaque 400.

This edits **only the report's own `templateSnapshot.sections`** (already a per-report frozen
copy) — the master template is never touched, and other reports are unaffected. On save the client
sends the whole proposed structure as PATCH `templateSections`;
`sanitizeServiceTemplateSections()` (shared, `src/lib/validation/serviceReportValidation.ts`, unit
tested) validates it against the existing snapshot: **sections are fixed** (key/title/
isOptionalAddon always taken from the existing snapshot, never the payload), groups/items inside
them are client-editable within caps (30 groups/section, 100 items/group, label length limits,
duplicate-key rejection) — malformed input is a `400`. The server then re-merges `checklist`
against the new structure (pruning removed items' values, defaulting new ones) and hard-deletes
photo Binary docs orphaned by a removed item/group. Completion validation walks the snapshot, so
custom items are required to be answered exactly like seeded ones.

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

**Photo responses are applied photos-only (fixed 2026-08-07).** Both photo routes return the whole
`serviceReport`, and the editor originally fed that to the same `applyServerReport()` helper the
Save/Complete paths use — which replaces the entire local checklist. The result was a real
user-reported bug: any unsaved edit reverted to the last-saved state the moment an upload finished,
so an item just marked Abnormal flipped back to Normal while its photo attached correctly. The
handlers now use `mergeServerPhotosIntoChecklist()` (`src/lib/serviceReports.ts`), which copies back
only photo metadata by section/group/item key and leaves `status`/`abnormalDetail`/
`measurementValue`/`included` as the user left them. This mirrors the server's own ownership rule —
photos change *only* through these routes, and `mergeChecklist()` refuses them from a `PATCH` — so
the two halves of the checklist have exactly one authority each. `templateSnapshot.sections` is
deliberately not resynced either, or locally-added groups/items would vanish the same way.

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
3. Full checklist summary, section → group, each rendered as a nested table (item name / ปกติ /
   ผิดปกติ columns) with a print-safe square checkbox per column (`PrintCheckboxCell`, a
   filled/outline glyph rather than color alone so the distinction survives a black-and-white
   printer) — matching the on-screen editor's table and the paper reference form's two-column
   checkbox layout (2026-08-06, fixed the same day the editor was converted: the print view had
   initially been left on its old single-column status-glyph list). A measurement-kind item spans
   both check columns with its value centered instead.
4. One **"SERVICE ITEM n"** blue-bar detail block per Abnormal item (canonical layout from the Oil
   Mist Filter reference) — section/group context, the full `abnormalDetail` text, and a photo grid
   (1 photo = full width, 2+ = two columns) pulling each photo's capability-URL directly. The
   "Abnormal Findings" section heading renders *inside* the first item's `breakInside: avoid` cell
   (not its own table row) so a page break can never strand the heading alone at the bottom of one
   page while the block jumps to the next — a real pagination bug the user hit on 2026-08-06.
5. Overall remark, then a two-column signature block: Service Engineer (typed name + saved
   `signatureDataUrl` if the assigned user has one, matching Scope of Work's signature-image
   convention) and Customer (blank lines — no signature capture exists yet, see Roadmap).

`POST /api/service-reports/:id/print` (gated by the new `service:print` permission) writes a
`"Service Report Printed"` audit entry before the client calls `window.print()` — deliberately
**not** hard-gated on completeness (unlike Scope of Work's print route): a Draft can be printed for
review, matching Delivery Order's simpler "print doesn't require a document-complete gate"
precedent. If the audit-log call itself fails, printing still proceeds (client-side fallback), same
philosophy as Delivery Order's "100% client-side print" note in `RBAC.md`.

## Customer sign-off (added 2026-08-07)

On-site, in-app signature capture — the first item off the Phase 2 roadmap. Remote signing (a
time-boxed capability link, delivered via LINE OA) is still a later phase; see Roadmap.

Three fields on `service_reports`: `customerSignatureDataUrl` (base64 PNG, `""` when unsigned),
`customerSignedName`, `customerSignedAt` (ISO string or `null`). The **engineer's** signature is
deliberately *not* stored on the report — it's read live from the assigned user's profile
`signatureDataUrl`, the same convention Scope of Work's print view already uses, so it can't be
drawn on someone else's behalf.

- **`src/components/SignaturePad.tsx`** — canvas capture on pointer events throughout, so mouse,
  finger and stylus take one code path rather than parallel mouse/touch handlers that could drift.
  `touch-action: none` stops a stroke from scrolling the page on a tablet; the backing store is
  scaled to `devicePixelRatio` so strokes aren't soft on a HiDPI screen; pointer capture keeps a
  stroke that wanders off-canvas from leaving the pad stuck mid-draw. A required signer-name input
  sits above the pad, Clear is disabled until there's a stroke, Confirm until there's both. Once
  confirmed it locks into a preview (image + name + formatted timestamp + a "แก้ไข" link) so an
  accidental swipe can't alter a signature someone already gave — clearing is explicit.
  A sibling of `ImageUploadField.tsx` in styling and in handing a data URL to its parent, but not an
  extension of it: there's no file to pick, a name to capture alongside, and a lock state.
- **Server** (`api/_lib/serviceReportHandler.ts`) — an ordinary editable field group on the existing
  `PATCH` route, no new endpoint. The image goes through the shared `validateImageDataUrl()`
  (`api/_lib/uploadValidation.ts`, PNG already in its accepted list, 2 MB cap). **`customerSignedAt`
  is stamped by the server and never accepted from the client**, so a sign-off can't be backdated;
  it is re-stamped only when the image itself changes, so correcting a typo in the signer's name
  doesn't silently move the recorded signing time. Clearing the signature also clears the name (a
  name with no signature attached is meaningless). Capturing or clearing a signature is called out
  in the audit entry rather than folded into a generic "updated".
- **Not gated by, and does not gate, completion.** Signing is optional — a customer often isn't on
  site — so `validateServiceReportForCompletion()` is untouched and a report completes unsigned.
  It does inherit the route's existing **Draft-only** rule, like every other editable field: sign
  before marking Complete, or Reopen first. That is the normal on-site order (fill checklist → sign
  → complete), not a special case.
- **Legacy reports** (created before these fields existed) are normalized on read by
  `toServiceReport()` — without it, a client checking `customerSignatureDataUrl !== ""` would read
  `undefined` as *signed* and render a broken `<img>`.
- **Print** — `ServiceReportPrintDocument.tsx`'s customer column now mirrors the engineer column
  exactly (signature image, name, date). An unsigned report still prints the blank ruled lines it
  always did, so it stays usable as a paper sign-off sheet.
- **UI** — a "การเซ็นรับงาน" Section card after the checklist: engineer (read-only, with a prompt to
  Settings → Profile when they have no signature saved) on the left, the pad on the right. A footer
  states the optionality, next to a deliberately **inert, disabled** "ส่งลิงก์ให้เซ็นภายหลัง"
  button (`title="เร็ว ๆ นี้"`) — shown rather than hidden so the on-site flow reads as one of two
  eventual options. Wiring it needs a real LINE OA channel; see Roadmap.

## Routes

See [API.md](../API.md) "Service Templates + Service Reports" for the full method/auth/route table
(list/get/create/update/status-change/delete for both resources, plus the photo and print routes
above). Mounted on `api/handlers/customers.ts` (not `quotes.ts`) — Vercel Hobby's 12-function cap is
fully used, and a Service Report's one real relational anchor is `customerId`/`customerSnapshot`,
the same entity `customers.ts` already owns.

## Permissions

11 permissions — see [RBAC.md](../RBAC.md) "Service" for the full table and default-role grants.
Own standalone "บริการ" permission group in Role Management (not nested into "ใบเสนอราคา" —
Service Reports aren't part of the quotation→scope→delivery chain).

**Service Engineer role (added 2026-08-07)** — the role a real field engineer holds:
`service:view/create/edit/complete/print` + `serviceTemplates:view` + `customers:view` +
`dashboard:view`. Own reports only (no `service:viewAll`), never edits the master templates.
`serviceTemplates:view` is load-bearing: `ServiceReportEditor.tsx`'s boot `Promise.all` calls
`fetchServiceTemplates()`, so without it the editor doesn't render at all.

This also closed Phase 1's rollout caveat. The manual "a Super Admin must grant these 11 permissions
in Role Management post-deploy" step is **no longer required** — `bootstrapRbac()`
(`api/_lib/rbacSeed.ts`) adds later-added default roles and applies a once-only, recorded permission
backfill to an already-provisioned database. See [RBAC.md](../RBAC.md) "Rollout". The one remaining
human decision is which employees get assigned the role.

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
list/editor) and "Template รายงานบริการ" (Service Templates). **The Service Engineer role has the
standalone Customers page hidden from its sidebar** (presentation only; `customers:view` stays
granted — the report editor's `CustomerSelector` needs it — see [RBAC.md](../RBAC.md) "Trimmed
navigation"). Dashboard was briefly hidden for this role too and was restored the same day.

**Guided tours (added 2026-08-07).** Phase 1 shipped without any — the module was built after the
tour system and a stale doc note sent its author looking for `TourReplayButton` in the wrong file,
so all three surfaces had no walkthrough and no question-mark icon while every other page had one.
Now: `"service"` on the list (summary tiles → search/filter → table), `"serviceDoc"` on the report
editor (actions → checklist → sign-off, `autoStart` gated on the record having loaded), and
`"serviceTemplates"` on template management (list → show-archived). Each uses the shared
`TourReplayButton`, rendered **unconditionally** — outside `canCreate` on the list, first in the
editor's otherwise status-gated toolbar — so the replay is always reachable no matter the user's
role, the report's status, or whether the tour has already auto-played once.

## Roadmap (not yet built)

- ~~**Signature capture**~~ — **done 2026-08-07**, see "Customer sign-off" above. Landed as a
  purpose-built canvas `SignaturePad.tsx` rather than reuse of `ImageUploadField.tsx` (there's no
  file to pick when you draw), though it keeps that component's base64-inline storage and styling.
  The engineer side needed no new storage at all — it reads their profile signature live.
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
