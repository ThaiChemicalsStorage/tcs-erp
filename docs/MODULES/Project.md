# Module: Project

## Audited against the owner's real spec (2026-08-20)

The owner supplied "การทำงานของโปรเจค" in full for the first time. What the audit confirmed as
**correct**: the 3 sourcing branches (`requisition`/`jobOrder`/`purchaseRequest`) map 1:1 to spec
points 2/3/4, and — the spec's own bolded requirement, *"กรณีใช้ของไม่หมด ให้นำของที่เหลือมาคืนสโตร์
โดยใช้เอกสารใบเบิก-คืนวัสดุใบเดิม"* — leftover material is genuinely returned on the **same** document:
a per-line `returnQty` plus `POST /api/material-requisitions/:id/return`, which deliberately carries
no `status === "Final"` lock (the plain `PATCH` does), so returns still work after issuance.

**Gaps found, still open** (tracked in [`../TODO.md`](../TODO.md) High Priority):
- **Cost Control is entirely absent from the code.** The spec's precondition "เมื่อโปรเจคได้รับ Scope
  of work, **Cost Control** แล้ว" is unmodelled — `Project` has no cost/budget field of any kind.
  Needs the owner to define what Cost Control *is* as data before it can be built.
- **"แจกจ่ายงานให้น้องๆ ในทีม" is unmodelled** — `ProjectItem` has no assignee field.
- **The module gives no pointer to ใบส่งมอบงาน.** Correctly not rebuilt (it's the Delivery Order
  module — see the removal note below), but nothing inside the Project pages links to it, so a user
  following the spec's workflow has no path there.
- ~~**`POST /api/projects` does not require the Scope of Work to be finalized**~~ — **closed
  2026-08-20**: `handleCreate()` now rejects any scope whose `status !== "Final"`, and both entry
  points (the create picker and the Scope of Work document's own button) surface why. See "Approval
  gate" below.
- **`POST /:id/return` has no test coverage and no quantity validation** — a return larger than what
  was withdrawn is accepted, and nothing reconciles it against the withdrawal quantities.
- **Reference-PDF fidelity is unverifiable from this repo** — all 6 named PDFs live under the
  gitignored `reference/`, so the transcribed field sets can't be re-checked against the real forms.

**Built the same day** in response: a "+ สร้าง" button with a source picker on all 4 standalone pages
(previously every document could only be created from inside a Project's item table) — see
"Creating from each document's own page" below and CHANGELOG.md 2026-08-20e.

## Status: ✅ All 4 document types built and working — Project, Material Requisition (Stage 4), Job Order + Purchase Request (Stage 5). Fully i18n-wired (Stage 5). A 5th document, Work Handover Note, was built 2026-08-19 and **removed 2026-08-20** — confirmed redundant with the pre-existing Delivery Order module (FM-SL-05), per direct business-side confirmation. See CHANGELOG.md.

Manages the workflow a Project follows once its Scope of Work + Cost Control are finalized:
sourcing materials from the store, having items fabricated in-house, or purchasing items
externally. Generated **from an existing Scope of Work** — a "Create/Open Project" button on
`ScopeOfWorkDocument.tsx` (same component whether reached via the Quotation-embedded view or the
standalone Scope of Work page, and same existence-check pattern Delivery Order's own button
established: if a Project already exists for this Scope of Work, the button opens it; otherwise it
creates one). Requested by, and primarily serves, the **Project/Store/Factory/Purchasing**
departments — a different set of users than every module before it, which is why this module grants
none of its 28 permissions to any existing default role (see "RBAC" below).

## Business Flow

1. A **Project** is created from a Scope of Work, snapshotting `scopeNumber`/`quotationId`/
   `customerCompanyName` and copying every non-header Scope of Work item into `ProjectItem[]`, each
   starting `sourcingMethod: "unassigned"` / `itemStatus: "pending"`.
2. Someone (Project department staff) reviews each item on the Project detail page and decides how
   it will be sourced — in stock, fabricated in-house, or purchased externally — by clicking one of
   3 "Create..." buttons on `ProjectItemsEditor.tsx`. Clicking a button **immediately creates the
   real sub-document** (no separate "assign branch, then create" step) and atomically links it back
   onto the `ProjectItem` — see [DATABASE.md](../DATABASE.md) "Project module" and
   [API.md](../API.md) "Project" for the exact invariant and how it's tested
   (`tests/api/projectAtomicity.test.ts`).
3. **All 3 sub-document types now navigate into a real detail page on creation** (as of Stage 5) —
   clicking "Create Requisition"/"Create Job Order"/"Create Purchase Request" creates the record and
   opens its editor via the standalone-page deep-link pattern Delivery Order's own creation flow
   uses. (Stage 4 shipped only Material Requisition this way; Job Order/Purchase Request briefly
   stayed on the Project page with a "coming in Stage 5" toast — that placeholder is gone now that
   both have real pages.)
4. Deleting a sub-document (from its own detail page) resets its `ProjectItem` back to
   `"unassigned"`/`"pending"`, so the item can be re-assigned to a different branch.
   `PATCH /:id/items/:itemId` (branch pre-assignment without creating a document) is rejected once an
   item is no longer `"pending"` — the recovery path is always "delete the sub-document first."
5. "Refresh from Scope of Work" on the Project detail page reconciles `items` against the Scope of
   Work's *current* items **by id** — an item whose id still exists is meant to keep its
   `sourcingMethod`/`itemStatus`/sub-document links (only the descriptive snapshot refreshing); a new
   item starts `"unassigned"`/`"pending"`; a removed item simply stops appearing (any sub-document
   already created against it is left in place, orphaned but harmless — no destructive cleanup, same
   convention every other module in this app follows). **⚠️ In practice this reconciliation almost
   never actually preserves a link**, confirmed live 2026-08-18 (Stage 6): `ScopeOfWorkItem.id` is
   `randomUUID()`-generated fresh on *every* call to `mapLineToScopeItem()` (`scopeOfWorkHandler.ts`),
   including the Scope of Work's own "อัปเดตข้อมูลจากใบเสนอราคา" (refresh from quotation) — so a routine
   SOW-side refresh silently mints brand-new ids for every item, even ones structurally unchanged from
   the source `QuoteLine` (which does carry its own stable `id: number`, currently discarded rather
   than used to preserve the ScopeOfWorkItem's identity). Project's reconciliation-by-id then treats
   every item as "new" and orphans whatever sub-documents were already linked. This is a pre-existing
   Scope of Work module gap (not introduced by the Project module), not fixed in this pass — see
   TODO.md's "ScopeOfWorkItem id stability" entry for the real fix (thread `QuoteLine.id` through as a
   stable correlation key) and the reasoning for why it wasn't attempted here (touches Scope of
   Work's snapshot semantics, a separate, already-shipped, heavily-relied-upon module).
6. Project's own `status` (`Planning`/`InProgress`/`Completed`) is a plain user-settable field on the
   detail page — no automatic transition logic exists yet (a deliberate simplification for this
   pass; revisit if the business wants it derived from item statuses instead).

## Data Model

`Project` (`src/lib/project.ts`, `projects` MongoDB collection, `ObjectId`-keyed — no printed
document number of its own):

```ts
type ProjectStatus = "Planning" | "InProgress" | "Completed";
type ProjectItemSourcingMethod = "unassigned" | "requisition" | "jobOrder" | "purchaseRequest";
type ProjectItemStatus = "pending" | "documentCreated" | "fulfilled" | "cancelled";
interface ProjectItem {
  id: string; // mirrors the source ScopeOfWorkItem's id
  name: string; specifications: string[]; quantity: number | null; unit: string;
  sourcingMethod: ProjectItemSourcingMethod; itemStatus: ProjectItemStatus;
  materialRequisitionId: string; jobOrderId: string; purchaseRequestId: string; // "" = none yet
}
interface Project {
  id: string; scopeOfWorkId: string; scopeNumber: string; quotationId: string;
  customerCompanyName: string; items: ProjectItem[]; status: ProjectStatus;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; isDeleted: boolean;
}
```

`MaterialRequisition` (`src/lib/materialRequisition.ts`, `material_requisitions` collection,
business-id-keyed `MR-{buddhistYear}-{seq}`, e.g. `"MR-2569-0001"` — reproduces FM-ST-04 Rev.02):

```ts
type MaterialRequisitionStatus = "Draft" | "Final";
type MaterialRequisitionCategory = "chemical" | "consumable" | "hardware" | "other";
interface MaterialRequisitionLine {
  id: string; productId: string; productCode: string; productName: string; unit: string;
  category: MaterialRequisitionCategory;
  plannedQty: number | null; withdrawal1Qty: number | null; withdrawal2Qty: number | null;
  returnQty: number | null; actualUsedQty: number | null;
}
interface MaterialRequisition {
  id: string; projectId: string; scopeOfWorkId: string; jobCode: string; customerName: string;
  jobOrderId: string | null; jobOrderCode: string; // nullable FK — most requisitions have no Job Order
  productName: string; responsibleEmployee: string; productionStartDate: string;
  lines: MaterialRequisitionLine[]; status: MaterialRequisitionStatus;
  preparedBy: string; preparedAt: string; approvedBy: string; approvedAt: string;
  storeDeptBy: string; storeDeptAt: string; costDeptBy: string; costDeptAt: string;
  returnedBy: string; returnReceivedBy: string; returnedAt: string;
  createdAt: string; updatedAt: string; createdBy: string; updatedBy: string; isDeleted: boolean;
}
```

`JobOrder` (`src/lib/jobOrder.ts`, `job_orders` collection, `JO-{buddhistYear}-{seq}` — reproduces
FM-PJ-01 Rev.01): free-typed `lines` (no catalog, unlike Material Requisition), plus `scopeChecklist:
ChecklistGroup[]` (the ~23-item scope-of-work checklist, reusing Scope of Work's own
`ChecklistGroup`/`ChecklistOption` shape), `outOfScope: string`, and 3 signatory pairs
(`requestedBy/At`, `approvedBy/At`, `documentRecipientBy/At`).

`PurchaseRequest` (`src/lib/purchaseRequest.ts`, `purchase_requests` collection,
`PR-{buddhistYear}-{seq}` — reproduces form FMPU05 Rev.02): header (`vendorName`, `neededByDate`,
`creditDays`, `shippingMethod`, `deliveryLocation`), lines with an **optional** `productId` (unlike
Material Requisition's required one — a line can reference the catalog or be free-typed, matching the
real `-ED6908027.pdf` example), `warehouseRemainingQty` (informational only), and `estimatedCost` per
line.

## Products-Catalog Reuse

Material Requisition lines reference an existing `Product` by id (`productId`, required) rather than
a duplicate parallel catalog; Purchase Request lines do the same but optionally. Confirmed working: a
real seed run (`tests/api/materialCatalogSeed.test.ts`) inserted **4 categories** (เคมี/เรซิ่น,
วัสดุสิ้นเปลือง, น็อตและสกรู, อื่นๆ (คลัง)) and **82 real products**, transcribed from
`public/reference/FM-ST-04_-_Rev.02_1.pdf` through `_4.pdf`, into the existing `products`/`categories`
collections — all resolving to real category ids, zero duplicate codes. Both
`MaterialRequisitionDocument.tsx` and `PurchaseRequestDocument.tsx` filter `ProductPickerModal`'s
catalog down to just these 4 categories via `MATERIAL_CATEGORY_NAMES`/`resolveMaterialCategoryKey()`
(`src/lib/materialRequisition.ts`) — the same product list Quotation's own line-item picker draws
from, just filtered, not a second endpoint. **The 4 category names and 82 product names are real
business/catalog data, deliberately never i18n-wired** — see "i18n" below.

## i18n (added Stage 5, 2026-08-18)

> ⚠️ **Correction (2026-08-20)**: the "all 4 modules" claim below was **not** true as written — the
> module's single entry point, the "สร้าง/เปิดโครงการ" button on `ScopeOfWorkDocument.tsx` (and its
> error toast), was still hardcoded Thai, so in English mode the only way into the whole Project
> module rendered in Thai. Found while auditing the module against the owner's real spec; fixed the
> same day with `scopeOfWorkDoc.openProject`/`.createProject`/`.createProjectFailed`. The lesson: the
> Stage 5 parity script compared th-vs-en *within the dictionary*, which cannot catch a string that
> never reached the dictionary at all. See CHANGELOG.md 2026-08-20e.

All 4 modules' interactive UI now goes through `useI18n()`'s `t()`, following the exact convention
already used by Quotation/Scope of Work/Delivery Order — dotted keys per module/screen
(`project.*`, `project.doc.*`, `project.items.*`, `materialRequisition.*`, `materialRequisitionDoc.*`,
`jobOrder.*`, `jobOrderDoc.*`, `purchaseRequest.*`, `purchaseRequestDoc.*`), added as real th+en pairs
in `src/lib/i18n.tsx` (232 keys). Job Order and Purchase Request were built i18n-first (Stage 5);
Project and Material Requisition, which had shipped Thai-hardcoded in Stage 4, were retrofitted in
the same pass.

**What deliberately stays untranslated, matching established precedent found before writing any
code**:
- **All 4 `*PrintDocument.tsx` files** — confirmed neither `ScopeOfWorkPrintDocument.tsx` nor
  `DeliveryOrderPrintDocument.tsx` import `useI18n` at all; printed business documents in this app
  always render in a fixed language regardless of the preparer's own UI toggle (see `docs/CLAUDE.md`
  coding standards — translating a real business document based on the preparer's setting risks
  silently sending the wrong-language document). Applied identically to
  `MaterialRequisitionPrintDocument.tsx`/`JobOrderPrintDocument.tsx`/`PurchaseRequestPrintDocument.tsx`.
- **`buildJobOrderChecklistGroups()`** (`src/lib/jobOrder.ts`) — left completely untouched.
  Confirmed neither `documentRequirements.ts`'s `buildDefaultChecklistGroups()` (Scope of Work's
  equivalent) nor `ChecklistGroupCard.tsx` use i18n either — checklist structure/labels are treated
  as persisted business content (the exact printed labels off the real FM-PJ-01 form), matching
  `CLAUDE.md`'s "persisted data/seed content... stays in whatever language it was authored in" rule.
  This also sidesteps a real landmine: `jobOrder.ts` is value-imported into
  `api/_lib/jobOrderHandler.ts` (the Node/server bundle) — importing `i18n.tsx` there would break
  every API route the same way the documented 2026-07-09 incident did (`i18n.tsx` contains
  JSX-only React code via `I18nProvider`).
- **The 4 seeded `ProductCategory` names and 82 catalog item names** — real business data, not UI
  chrome, per explicit instruction.
- **`"Draft"`/`"Final"` status literals** — kept as literal English in both language dictionaries
  (`materialRequisition.status.draft/final`, reused by Job Order's and Purchase Request's own status
  pills), matching the exact precedent `docs/CLAUDE.md` records for Delivery Order's own status
  labels.

`ChecklistGroupCard.tsx` (shared with Scope of Work) gained one small, additive, backward-compatible
change: it now renders an inline text input next to any option whose `ChecklistOption.value !==
undefined` (Job Order's fill-in fields — HYDRO-TEST ___ BAR, PRIMER COAT ___/___ MICRON, etc.) —
previously it only ever rendered `checked`/a group-level `note`, never handled per-option `value` at
all. Scope of Work's own options never set `value`, so this is a pure addition with no behavior
change for its existing caller.

**Verification**: every `t()` call across the whole app is type-checked against `TranslationKey =
keyof typeof translations.th` — a genuine compile error if a key doesn't exist in the Thai
dictionary. That alone does **not** guarantee the English dictionary has a matching entry (the
runtime lookup silently falls back to Thai if `en` is missing a key), so this was verified
separately with a script comparing every key in both blocks: 1623 keys each, zero keys missing on
either side, zero of the 232 new English values accidentally left identical to their Thai source
(the only intentional identical pairs are literal form codes like `"FM-ST-04"` and the deliberately
untranslated `"Draft"`/`"Final"` literals above) — see the Stage 5 session for the verification
script. `tsc --noEmit`/`npm run lint`/`npm run build`/`npm test` all pass clean.

## Guided Tours (added 2026-08-19)

The 4 document types had never had `useModuleTour()` coverage — they postdated the 2026-07-29
tour-rollout sessions that covered every other module, so they showed no popup at all until now.
Same infra as every other tour (`src/components/GuidedTour.tsx`'s `useModuleTour()` + the shared
`TourReplayButton.tsx`, auto-start once per user per page via `hasPageTourCompleted()`, real
`t()`-backed th/en copy — no hardcoded Thai, per the standing rule this module already had to fix
once during the Stage 5 i18n retrofit):

- **`ProjectList.tsx`** (tourKey `project`, 3 steps): summary cards → search/status filters → the
  table (row-click to open; notes that new projects are created from the "Create Project" button on
  a finalized Scope of Work, not from this page).
- **`ProjectDocument.tsx`** (tourKey `projectDoc`, 3 steps, `autoStart: !!project`): the
  refresh/delete actions → the read-only customer/snapshot header → `ProjectItemsEditor`'s 3-branch
  sourcing table (the actual point of the whole module — assigning each item to Material
  Requisition/Job Order/Purchase Request). Needed a new `currentUserId` prop threaded
  `ProjectPage.tsx` → both `ProjectList`/`ProjectDocument`, the same way `ScopeOfWorkPage.tsx`/
  `DeliveryOrderPage.tsx` already do for their own list+document tours.
- **`MaterialRequisitionDocument.tsx`** (tourKey `materialRequisitionDoc`, 4 steps,
  `autoStart: !!doc`): document actions → the "Add from Catalog" product picker entry point → the
  withdrawal-1/withdrawal-2/return columns (explicitly states the return column stays editable even
  once the document is Final) → the separate Material Return card (saved via its own button,
  independent of the main draft).
- **`JobOrderDocument.tsx`** (tourKey `jobOrderDoc`, 3 steps, `autoStart: !!doc`): document actions
  → the free-typed line editor (states it isn't tied to the product catalog, unlike Material
  Requisition/Purchase Request) → the scope-of-work checklist (`ChecklistGroupCard`, shared with
  Scope of Work).
- **`PurchaseRequestDocument.tsx`** (tourKey `purchaseRequestDoc`, 3 steps, `autoStart: !!doc`):
  document actions → the "Add from Catalog"/"Add Custom Line" entry point → the line table (states
  catalog lines lock description/unit while custom lines stay fully editable).
- **Document tours all pass `autoStart: !!doc` (or `!!project`)** — the same load-race guard every
  other document editor's tour uses (`ScopeOfWorkDocument`/`DeliveryOrderDocument`/
  `ServiceReportEditor`), so the one-time auto-fire waits for the real record instead of firing over
  the loading spinner.
- **Follow-up pass (2026-08-19, same day)**: `MaterialRequisitionList.tsx`/`JobOrderList.tsx`/
  `PurchaseRequestList.tsx` — the 3 standalone list pages deliberately left out of the first pass
  above — each gained the same 2-step tour (tourKeys `materialRequisition`/`jobOrder`/
  `purchaseRequest`, distinct from their document tourKeys' `*Doc` suffix): search/status filters →
  the table (row-click to open; states that new documents are created from a Project's item table,
  the 3-branch sourcing buttons, not from these standalone list pages). These 3 lists have no
  summary-card row (unlike `ProjectList`), so 2 steps matches the shorter precedent
  `AuditLogPage`/`RoleManagementPage` already use for similarly minimal list pages. `currentUserId`
  was already threaded to all 3 `*Page.tsx` wrappers from the first pass (for their Document
  children) — this pass just passed the same prop one level further, into the List components.
- 40 new i18n keys × 2 languages = 80 new dictionary entries total across both passes
  (`tour.project.*`, `tour.projectdoc.*`, `tour.mrdoc.*`, `tour.jodoc.*`, `tour.prdoc.*`, plus
  `tour.mr.*`/`tour.jo.*`/`tour.pr.*` from the follow-up), verified 1:1 th/en parity by direct
  key-count comparison (not just `tsc`, which only proves every key exists in the Thai dictionary —
  see "i18n" above for why that alone isn't sufficient). `tsc --noEmit` (both configs)/`npm run lint`/
  `npm run build`/`npm test` (211/211) all pass clean, both passes.

## Work Handover Note — removed 2026-08-20

Built 2026-08-19 as a first-draft, unverified 5th document type for this module, then **removed
2026-08-20**: confirmed redundant with the pre-existing **Delivery Order** module (FM-SL-05) per
direct confirmation from two people on the business side. Full removal writeup: see the
2026-08-20 CHANGELOG.md entry. The one real gap Delivery Order does *not* cover: its print
document (`DeliveryOrderPrintDocument.tsx`) only ever prints a blank signature line for wet-ink
signing — it does not capture/embed a digital customer signature the way Work Handover Note did
via `SignaturePad`. Worth revisiting if digital signature capture on delivery documents becomes a
real requirement; not pursued as part of this removal.

## Auto-save (added 2026-08-25)

**การเตือน "ยังไม่ได้บันทึก" (2026-08-25).** ใช้กับเอกสารสามใบในโมดูลนี้เท่านั้น (ใบเบิก-คืนวัสดุ, ใบสั่งงาน, ใบขอซื้อ) — หน้าโครงการเองไม่มีปุ่มบันทึก มีแต่ช่องสถานะที่บันทึกทันทีที่เลือก จึงไม่มีงานค้างให้เตือน เอกสารทั้งสามลงทะเบียนการ์ดไว้กับ `src/hooks/useNavigationGuard.ts` — ถ้าผู้ใช้จะออกจากหน้าไปทั้งที่ยังมีงานที่บันทึกอัตโนมัติช่วยไม่ได้ จะมีกล่องถามก่อนพร้อมปุ่ม บันทึก / ไม่บันทึก / กลับไปแก้ต่อ ปุ่ม "บันทึก" ในกล่องคือปุ่มบันทึกจริงของหน้านี้ (validation ครบเหมือนเดิม) และถ้าบันทึกไม่สำเร็จจะค้างอยู่หน้าเดิม ดักไว้ทุกทางในแอป — ปุ่มย้อนกลับ เมนูซ้าย เมนูผู้ใช้ ผลค้นหา กระดิ่งแจ้งเตือน และลิงก์ข้ามเอกสาร กล่องนี้จะ**ไม่**เด้งถ้าเอกสารยังเป็นฉบับร่างที่บันทึกอัตโนมัติดูแลอยู่ตามปกติ ดู [UI_GUIDELINES.md](../UI_GUIDELINES.md) หัวข้อ Unsaved-Changes Guard


This module's document editor auto-saves like every other one — shared
`src/hooks/useAutoSave.ts`, rendered through `AutoSaveIndicator` (toolbar chip, next to Save) and
`DraftRecoveryBanner` (the "พบร่างที่ยังไม่ได้บันทึก" offer). Two layers: a `localStorage` snapshot
~700 ms after typing stops, and a silent `PATCH ...?autoSave=1` 2.5 s after typing stops. The hook is
fed the exact payload the Save button sends (`toUpdateFields(draft)`), never the whole loaded record.

**Draft-only, and no audit entry.** The server rejects `?autoSave=1` on anything past Draft (409) and
skips the audit-log row for auto-saved writes — otherwise one editing session would bury the log's
real, deliberate entries. Permissions, validation and status gates are unchanged. See
[../API.md](../API.md) "Auto-save writes", [../UI_GUIDELINES.md](../UI_GUIDELINES.md) "Auto-Save
Indicator & Draft Recovery", and [../CHANGELOG.md](../CHANGELOG.md) 2026-08-25.

Applies to the three document editors in this module — ใบเบิกและใบคืนวัสดุ (Material Requisition), ใบสั่งงาน (Job Order) and ใบขอซื้อ (Purchase Request). All three already rejected non-Draft updates server-side, so the Draft-only rule needed no new guard; only the audit-entry suppression was added.

## Files

- `src/lib/project.ts` / `materialRequisition.ts` / `jobOrder.ts` / `purchaseRequest.ts` — types +
  full `fetch*`/`create*`/`update*`/`finalize*`/`delete*`/etc. API wrapper functions for all 4
  document types (Job Order/Purchase Request's full wrapper sets were completed in Stage 5,
  alongside their document pages).
- `src/pages/project/ProjectPage.tsx` + `ProjectList.tsx` — standalone "Project" sidebar module
  (list ↔ detail view-switcher, same pattern as `ScopeOfWorkPage.tsx`/`DeliveryOrderPage.tsx`).
- `src/pages/project/ProjectDocument.tsx` — detail view: header (customer/job code snapshot from
  Scope of Work), status selector, refresh/delete actions.
- `src/pages/project/ProjectItemsEditor.tsx` — the 3-branch sourcing table; each row's action buttons
  are RBAC-gated per **sub-document** permission (`materialRequisition:create`/`jobOrder:create`/
  `purchaseRequest:create` independently, so a role that can only create Job Orders sees only that
  one button) and navigate straight into the new record's real detail page.
- `src/pages/materialRequisition/` (`Page`/`List`/`Document`/`PrintDocument.tsx`) — standalone
  sidebar module, **deliberately not nested under Project** so Store staff have their own entry
  point. `Document.tsx`'s "Return" column stays editable even once Final, via the dedicated
  `POST /:id/return` route rather than the regular Draft-only `PATCH`.
- `src/pages/jobOrder/` (`Page`/`List`/`Document`/`PrintDocument.tsx`, Stage 5) — standalone sidebar
  module, same "not nested under Project" reasoning. `Document.tsx` embeds `ChecklistGroupCard`
  (reused from `src/pages/quotation/`) for the scope-of-work checklist.
- `src/pages/purchaseRequest/` (`Page`/`List`/`Document`/`PrintDocument.tsx`, Stage 5) — standalone
  sidebar module. `Document.tsx`'s line table supports both catalog-linked (via `ProductPickerModal`)
  and free-typed lines side by side.
- Entry point: `src/pages/quotation/ScopeOfWorkDocument.tsx`'s "Create/Open Project" toolbar button
  (`handleProjectClick`, `existingProject` existence-check effect) — threaded through both places
  `ScopeOfWorkDocument` is mounted (`ScopeOfWorkPage.tsx` standalone, `QuotationPage.tsx` embedded),
  same `canView*`/`canCreate*`/`onOpen*` prop shape Delivery Order's identical button already uses.
- `src/App.tsx` — `project`/`materialRequisition`/`jobOrder`/`purchaseRequest`
  `NavKey`s, sidebar entries (the "Project" nav group), deep-link state + `navigateTo*()` for all 4,
  and the permission-derived `can*` booleans threaded into all 4 pages.
- Backend: `GET /api/material-requisitions`, `GET /api/job-orders`, and `GET /api/purchase-requests`
  all gained a company-wide list mode (omit `projectId`) mirroring Project's own dual-mode `GET` —
  Stage 3 had only built the by-project mode; the Material Requisition gap was found and fixed in
  Stage 4, and the identical Job Order/Purchase Request gap was found and fixed in Stage 5 before
  their list pages were built on top of it.

## RBAC

28 permissions from Stage 2 (`project`/`materialRequisition`/`jobOrder`/`purchaseRequest`, each
`:view`/`:viewAll`/`:create`/`:edit`/`:finalize`/`:print`/`:delete`), enforced server-side since Stage
3 and genuinely wired to UI buttons/nav visibility for all 4 document types as of Stage 5 — every
action button is conditionally rendered based on the matching permission, not shown-but-disabled,
matching this app's standing "filter the array, don't grey out the button" convention (see
[UI_GUIDELINES.md](../UI_GUIDELINES.md) "Permission-Locked Form Fields"). **28 permissions total
across the module. Default grants: Administrator/Super Admin only** — none of the existing default
roles (Sales User, Approver Level 1/2, Viewer, Service Engineer, Accounting User) belong to the
Project/Store/Factory/Purchasing departments this module serves. A Super Admin needs to create real
custom roles (e.g. "เจ้าหน้าที่โครงการ", "พนักงานสโตร์", "เจ้าหน้าที่จัดซื้อ") via Role Management before real
staff can use this module. (A 7th, `workHandover:*` permission set briefly existed 2026-08-19–20 for
the now-removed Work Handover Note document — see CHANGELOG.md.)

## Stage 6 — live browser verification (2026-08-18)

Actually clicked through creating a Project from a Scope of Work and all 4 document types (Material
Requisition incl. its post-Final Return column, Job Order incl. the checklist, Purchase Request incl.
both catalog and free-typed lines) in a real browser, against the local dev stack, in both Thai and
English — closing the "not verified against a live deployment/browser" gap the Stage 5 pass had left
open. Found and fixed 3 real bugs this surfaced, none of them theoretical:

1. **Every quotation save was silently broken app-wide** (not a Project-module bug, but discovered
   while trying to give a test Scope of Work real line items to test with) — `Quote.id` always
   contains a literal `#` (e.g. `"Q#260817-0001"`), and `src/lib/quotes.ts`'s `updateQuote()`/
   `duplicateQuote()`/`rewriteQuote()`/`printQuote()`/`performWorkflowAction()` interpolated it
   unencoded into the request URL. Browsers strip everything from `#` onward as a URL *fragment*
   before `fetch()` ever sends the request, so every one of those calls actually hit e.g.
   `/api/quotes/Q` and 404'd — a quotation could never be edited, duplicated, rewritten, or moved
   through its approval workflow after creation. Fixed by wrapping every id-shaped URL segment in
   `encodeURIComponent()` across all of `src/lib/*.ts` (not just Quotation — every module's own
   `${id}`-in-a-path call sites), and by making the shared `getPathSegments()` helper
   (`api/_lib/http.ts`) `decodeURIComponent()` each segment so the server resolves the encoded id back
   to its real form. Regression-tested in `tests/api/pathSegments.test.ts`.
2. **Every Material Requisition/Job Order/Purchase Request was permanently unsavable after
   creation** — `handleCreate()` in all 3 handlers seeded the signatory timestamp
   (`preparedAt`/`requestedAt`) from the *full* ISO datetime `nowIso()` returns (e.g.
   `"2026-08-18T06:48:08.443Z"`), but the frontend editors round-trip that same field on every save,
   and the server's own `validateIsoDateOrEmpty()` requires strict `YYYY-MM-DD` — so the very first
   save after creation always 400'd, for every document, permanently (Finalize doesn't touch `lines`,
   so a document finalized without ever successfully saving first — exactly what happened live —
   finalizes with **empty lines**, silently). Root cause: Scope of Work's own equivalent fields
   already established the correct precedent (`nowIso().slice(0, 10)`), just not followed here. Fixed
   by seeding the date-only slice in all 3 `handleCreate()` functions. Regression-tested in
   `tests/api/projectAtomicity.test.ts` ("immediate re-save after creation").
3. **A free-typed Purchase Request/Job Order line description could silently clip mid-word in
   English mode** — the description `<input>` used `w-full` with no minimum width in a table with
   several other fixed-width columns (`WAREHOUSE REMAINING`, `QTY REQUESTED`, etc. — English column
   headers being much longer than their terse Thai originals squeezes the flexible column hardest);
   `<input>` elements never wrap, so a long description just clipped with no ellipsis or visual cue.
   Fixed by giving both description cells (`PurchaseRequestDocument.tsx`, `JobOrderDocument.tsx`)
   `min-w-[200px]`, relying on the existing `overflow-x-auto` wrapper for horizontal scroll — the
   documented app-wide convention for wide tables (see [UI_GUIDELINES.md](../UI_GUIDELINES.md)).

None of these 3 bugs were caught by `tsc`/`lint`/`build`/`test` in earlier stages — exactly the class
of bug those tools can't catch, which is why this live pass was worth doing.

**Also confirmed correct by direct observation, not just code reading**: the atomic parent-child
link invariant survives real creates/deletes/finalizes; the Material Requisition Return column stays
editable post-Final; the Job Order checklist's per-option fill-in inputs (added to
`ChecklistGroupCard.tsx` in Stage 5) render and save correctly; Purchase Request's dual catalog/
free-typed line UI works for both kinds in the same document; every English-mode label/button/table
header checked renders without truncation (aside from the one description-column bug above, now
fixed); print documents and catalog/checklist content correctly stay fixed-Thai in English mode.

## Job Order: จาก/ถึงหน่วยงาน bound to real departments (2026-08-27)

Project department request. `JobOrder.fromSite`/`toSite` were plain free-text inputs bound to nothing.

- **จากหน่วยงาน (`fromSite`)** is seeded server-side from `ctx.user.department` in `handleCreate()` —
  no new prop needed on the page, and still overwritable by hand afterwards.
- **ถึงหน่วยงาน (`toSite`)** is now a `<select>` fed by `fetchDepartments()` filtered to
  `isActive`, following `DeliveryOrderDepartmentRouting.tsx`'s precedent. It stores the department
  **name, not the id**, because the print document has to render a name — and it keeps a
  "legacy value" fallback `<option>` exactly like `UserManagementPage.tsx` does, so a value typed
  before this change is never silently dropped.

⚠️ **Depends on data that isn't right yet.** TODO.md already records that `User.department` holds
legacy values (`"Technic"`, `"Purchase"`) matching no row in the `departments` table, so
"จากหน่วยงาน" comes out blank for those users. That is a data problem for an admin to fix in
จัดการผู้ใช้, not something to paper over in code.

## Job Order: grouped checklist, sub-details, attachments (2026-08-27)

Three Project department requests landed on ใบสั่งงาน together.

**The scope checklist is split into headings.** `buildJobOrderChecklistGroups()` used to return a
single group of 23 options; it now returns six. **Every `ChecklistOption.key` is unchanged**, because
`withJobOrderChecklistGroups()` regroups a saved document **on read** by key — there was no database
migration. If that function is wrong, a job order that already had ticks silently reads back empty,
so `tests/jobOrderChecklist.test.ts` (9 tests) pins it: ticks survive, fill-in values survive, no key
is lost, a retired option is kept rather than dropped, and applying it twice is stable.

⚠️ **The grouping is inferred from what each option means, not read off the paper form** — `reference/`
is gitignored. Titles and ordering still need checking against a real FM-PJ-01. See TODO.md.

**Ticked options take free-text sub-details.** `ChecklistOption.details?: string[]` is optional and
purely additive — Scope of Work never sets it, so `ChecklistGroupCard` renders nothing extra there
(the same shape as `value` when it was added 2026-08-18). Two deliberate details: the inputs sit
**outside** the `<label>`, or clicking one would toggle the checkbox; and the server **clears details
when an option is unticked**, so the printed form can never carry detail for work that is out of scope.

**Attachments** use the new shared module (`api/_lib/documentAttachments.ts`,
`src/components/DocumentAttachmentsCard.tsx`, `document_attachment_files`) rather than a third copy
of the Scope of Work implementation — see [Product.md](./Product.md) and CHANGELOG.md 2026-08-27c.
`JobOrder.attachments` is **not** a PATCHable field; it is managed only through its own routes, so a
stale client cannot wipe files someone else just added. Downloads are unauthenticated capability URLs.

## Purchase Request sub-details (2026-08-27)

`PurchaseRequestLine.subDetails: string[]`, copied wholesale from `ProductionOrderLine` — same type,
same blank-line stripping server-side, same indented row in the editor and the print. In the PR's
line **table** the sub-details are their own row beneath the line, and the row is hidden entirely when
the document is locked and has none.

## One Job Order can cover several project items (2026-08-27)

Follow-up to the same J1 sentence — its first half (the scope checklist) shipped earlier the same
day; this is the second half, *"ติ๊กเลือกได้ว่าจะเอาตัวไหน"*, applied to the item list itself.

**No structural change was needed.** Each `ProjectItem` carries its own `jobOrderId`, so several items
can already point at the same Job Order. What had to change were the helpers in `projectHandler.ts`,
which were written on the assumption of one document per item and therefore took and returned single
values. Each gained a plural sibling (`loadPendingProjectItemsOrThrow`, `linkProjectItemsToSubDocument`,
`findProjectItemIdsByLink`, `markProjectItemsFulfilled`, `unlinkProjectItems`); the singular ones remain
as thin wrappers, so **Material Requisition and Purchase Request are untouched** and stay one-per-item.

Two details that matter:
- The multi-item write uses one `updateOne` with `arrayFilters`, not a loop — a loop could link some
  items and miss the rest, leaving a half-linked document with nothing reporting it.
- `loadPendingProjectItemsOrThrow()` validates **every** item before returning, so a request that
  includes one already-claimed item is refused whole rather than partly applied.

**Ticked items are copied in as lines**, with their specifications becoming `subDetails` —
`JobOrderLine` gained that field for this reason (same shape `ProductionOrderLine` and
`PurchaseRequestLine` already use). Without it every item's spec would be dropped silently on copy.

`ProjectItemSourcePickerDialog` gained `multiSelect`; `onSelect` now always returns an array so callers
share one code path. Ticks reset when the project changes, or ids from the previous project would
travel into the new document.

**Production Order** got the same idea from the other end: its picker gained a second step
(`pickItems`) to choose which Scope of Work items the order covers — matching what
`src/lib/productionOrder.ts` already documented, that one job may need several orders, one per
product. Its "refresh from Scope of Work" respects that selection, matching by **item name** because
the order stores no `ScopeOfWorkItem` ids (and those ids are regenerated on every scope refresh
anyway — see TODO.md).

## Known Limitations, Not Built This Pass

- **No approval workflow** — Material Requisition/Job Order/Purchase Request go straight
  Draft → Final via one `:finalize` permission check, unlike Scope of Work/Delivery Order's full
  submit → pending → approve/reject state machine. Deliberately simpler for this first pass,
  matching Delivery Order's own original "deliberately simpler" precedent; revisit if incomplete
  documents in practice turn out to be a real problem.
- **No required-field validation gate** on Finalize/Print for any of these document types — a
  document can be finalized or printed while genuinely incomplete. Same deliberate-simplicity
  reasoning as above.
- **`ScopeOfWorkItem.id` is not stable across a Scope-of-Work-side "refresh from quotation"** — see
  "Business Flow" step 5 above for the full explanation. Means Project's own "keeps its links"
  reconciliation promise rarely holds in practice today; tracked in TODO.md, not fixed this pass
  (root-cause fix belongs to the Scope of Work module, not Project).
- **Print layouts not pixel-calibrated** against their real reference forms — first-pass structural
  reproductions only (same kind of later polish pass Delivery Order's own print layout needed before
  it matched its reference form exactly); confirmed Stage 6 that `window.print()` fires correctly for
  all 3 new print documents, but the native print dialog blocks browser automation (same standing
  limitation this app's own session history has hit before for other modules), so the visual layout
  itself still needs a manual look.
- **Project's `status` has no automatic transition logic** — purely user-set via a dropdown.
- **No Global Search integration** — none of these 4 document types have a search result group yet.

## Creating from each document's own page (added 2026-08-20)

Direct request: *"อยากให้มันสามารถกดสร้างในหน้าของตัวเองได้เลย ตอนกดสร้างก็ขึ้นมาให้เลือกว่าจะมาจากใบไหน"*.
Until this pass every Project-module document could **only** be created from inside a Project's item
table (`ProjectItemsEditor.tsx`'s per-row buttons); the 4 standalone sidebar pages were browse-only.

`src/pages/project/ProjectSourcePickers.tsx` adds two dialogs, both following the search-and-pick
shape `AccountingPage.tsx`'s own `ScopeOfWorkPickerDialog` established:

- **`ScopeOfWorkSourcePickerDialog`** (used by `ProjectPage`) — pick a Scope of Work to open a
  Project from. A scope that already has a project is rendered **disabled with a "มีโครงการแล้ว"
  label rather than hidden**, so the user can see why it isn't selectable. (`POST /api/projects`
  itself permits several projects per scope; the UI steers away from that without pretending the
  server forbids it.) The has-a-project lookup runs per scope after the list renders, so opening the
  dialog is never blocked on it.
- **`ProjectItemSourcePickerDialog`** (used by the Material Requisition / Job Order / Purchase
  Request pages) — two steps in one dialog, Project → item, because the create API needs both ids.
  Only `itemStatus === "pending"` items are offered, mirroring the server's own
  `loadPendingProjectItemOrThrow()` rule so the user can never pick a row that would 400. An item
  already pre-assigned to a *different* branch still appears (creating overwrites `sourcingMethod`,
  which the server allows) but is labelled with its current assignment so the choice is informed.

The 4 list components gained an optional `headerAction?: ReactNode` prop — each Page owns its dialog
state while the List stays a presentational component. **No API or data-model change**: creation
still goes through the same `POST /api/{material-requisitions,job-orders,purchase-requests}` with
`{projectId, itemId}`, and each page's button is gated on that document's own `:create` permission.

Verified via `tsc` (both configs)/`lint`/`build`/`test` (238/238). **Not yet click-tested in a real
browser** — tracked in [`../TODO.md`](../TODO.md).

## Approval gate: only a Final Scope of Work can open a project (added 2026-08-20)

Direct instruction: *"ให้ scope of work อนุมัติผ่านก่อนถึงจะกดสร้างโครงการได้"*. `handleCreate()`
(`api/_lib/projectHandler.ts`) rejects any source scope whose `status !== "Final"` with a Thai 400,
checked immediately after `loadScopeOrThrow()`.

**Why this is a correctness fix, not just policy**: a Draft/PendingApproval scope can still have its
items edited. Opening a project against one means sub-documents (Material Requisition / Job Order /
Purchase Request) can be issued for items the job later drops or changes — and because a Scope of
Work refresh regenerates every `ScopeOfWorkItem.id` (see the Business Flow section above), those
sub-document links get silently orphaned rather than updated. Gating on Final closes that window.

**Both entry points reflect it, but neither enforces it** — the server check is the only thing that
actually holds:
- The create picker (`ProjectSourcePickers.tsx`) renders a non-Final scope **disabled with a
  "ยังไม่อนุมัติ" label rather than hiding it**, the same treatment its sibling "มีโครงการแล้ว" case
  already used, so a user can see why their job isn't selectable.
- `ScopeOfWorkDocument.tsx`'s "สร้างโครงการ" button is disabled with an explanatory tooltip when the
  open scope isn't Final — but **stays enabled when a project already exists**, because it is then an
  "open project" shortcut, not a create action.

Covered by `tests/api/projectAtomicity.test.ts`: Draft refused, PendingApproval refused, Final
accepted. Adding the gate also broke 8 pre-existing tests whose fixture was `status: "Draft"`,
confirming it genuinely bites; that fixture is now `"Final"` since those tests target the
item-to-sub-document link rather than approval.
