# Module: Production (ผลิต)

## Status: ✅ Built 2026-08-20 — ใบสั่งผลิต (new), plus the Production department's own ใบเบิก-คืนวัสดุ / ใบขอซื้อ. Not yet click-tested in a real browser.

Serves the **Production (ผลิต) department**, whose workflow closely mirrors the Project department's
but is a separate set of records. Per the owner's spec:

> เมื่อได้รับ หน้า Scope of work, Cost Control และแบบ Drawing เรียบร้อยแล้ว ฝ่ายผลิตจะทำการคำนวณปริมาณ
> ของที่ต้องสั่งซื้อและเบิกสโตร์ และออกใบสั่งผลิตเพื่อแจกจ่ายงานให้กับน้องๆในทีม

## The four documents

| Document | Built as | Notes |
|---|---|---|
| **ใบสั่งผลิต (Production Order)** | **New** — `src/lib/productionOrder.ts`, FM-PD-02 | The only new document type; see below |
| ใบเบิกและคืนวัสดุ | Existing Material Requisition, `ownerDepartment: "production"` | Same form, separate records |
| ใบขอซื้อ | Existing Purchase Request, `ownerDepartment: "production"` | Same form, separate records |
| ใบส่งมอบงาน | The existing **Delivery Order** module | Deliberately not rebuilt — confirmed 2026-08-20 that ใบส่งมอบงาน *is* the Delivery Order (FM-SL-05); see the coordination note in [`../CLAUDE.md`](../CLAUDE.md) |

## ใบสั่งผลิต (Production Order, FM-PD-02 Rev.00 : 01/11/64)

Transcribed from `reference/company/ใบสั่งผลิต(Production Order).pdf`. That file is a **scanned
image** (one embedded bitmap, no text layer) and is gitignored, so the field mapping in
`src/lib/productionOrder.ts`'s doc comment is the durable record of the form's structure — treat it
as the source of truth rather than expecting to re-read the PDF.

**Two deliberate differences** from the Project-family documents, both confirmed with the owner
before building:

1. **Created directly from an approved Scope of Work**, not from a Project item. There is therefore
   no `projectId` and no item-link bookkeeping. A job may have several production orders (one per
   product to fabricate), so the picker does not steer away from a scope that already has one — this
   is why `ScopeOfWorkSourcePickerDialog` gained an `allowMultiplePerScope` flag.
2. **Numbered `SC-{Gregorian year}-{month}-{seq}`** (e.g. `SC-2026-08-009`) to match the real form,
   where every other document in this app uses a Buddhist year. `tests/api/projectAtomicity.test.ts`
   pins the format so a future "make it consistent" refactor cannot quietly change it.

   **The printed number became editable 2026-08-27** (Production department request: *"ใบสั่งผลิต
   สามารถแก้ไขเลขที่ใบสั่งผลิตได้ แต่ยังรันปกติ"*). The generated `SC-…` value **is the Mongo `_id`**, and
   Material Requisition / Purchase Request reference it via `productionOrderId` — so it cannot be
   mutated. A separate `documentNumber` field now carries what the form prints: seeded equal to the
   `_id` at creation, editable Draft-only, unique-checked with the exact recipe Scope of Work uses
   (`sanitize` → friendly pre-check → unique index). The monthly counter is untouched, so editing one
   order's number never shifts the next one. Records created before this have no such field;
   `toClient()` falls back to `_id`, and `ensureProductionOrderNumberIndex()` backfills them to `_id`
   **before** creating the unique index — without that backfill every legacy row is `null` and the
   index creation fails with E11000.

**Line model** matches what the printed table actually contains — three kinds of row:
- a bold product header and a centred "ชิ้นส่วน" divider (`isSectionHeader: true`), carrying a remark
  but no qty/unit, and **skipped when numbering** so inserting one never renumbers the items below;
- numbered items;
- indented continuation lines under an item (`subDetails`), e.g. "หนา 7 mm. 1(V)+2(M4)/S901" and
  "สเต็ปที่1 …".

The server strips qty/unit from header rows rather than trusting the client, so toggling a row's type
cannot leave stale values behind.

**Five signatory blocks** (ผู้สั่งผลิต / ผู้อนุมัติ / ผู้ส่งมอบงาน / ผู้ตรวจรับงาน / แผนกต้นทุน). The
**ผู้อนุมัติ block is read-only in the editor** — the server fills it on approval, so a typed-in name
can never stand in for a real approval.

The blocks sign at **three different times**, which the edit lock has to respect:

| Block | When it's filled | Editable while |
|---|---|---|
| ผู้สั่งผลิต | as the order is written | `Draft` only |
| ผู้อนุมัติ | on approval | never — server-stamped |
| ผู้ส่งมอบงาน / ผู้ตรวจรับงาน / แผนกต้นทุน | **after the work is finished** | any status |

The last three therefore save through their own route, `POST /api/production-orders/:id/signatories`,
which is deliberately **not** Final-locked and writes only those three fields — the general `PATCH`
stays locked at `Draft` as usual. Without this the three blocks could only ever print blank, since
the document is locked the moment it is approved (found by the `2026-08-20i` review). In the editor
they stay enabled after approval and get their own save button in the signature card.

## Approval workflow (shared with three other documents)

Requested as "ใบที่ต้องมีการอนุมัติต้องมีปุ่มอนุมัติด้วย", behaving "เหมือน Scope of Work เป๊ะ".
`api/_lib/documentApproval.ts` implements it generically for **Material Requisition, Purchase
Request, Job Order and Production Order**:

```
Draft --submit-approval--> PendingApproval --approve--> Final
                                |  \--withdraw-approval--> Draft   (submitter takes it back)
                                \-----reject (reason req.)-> Draft  (approver sends it back)
```

- Reuses each form's existing printed `approvedBy`/`approvedAt`, filling the name **only when blank**
  so it never overwrites what staff typed. `approvedByUserId` is separate and server-written, because
  `approvedBy` is a free-text form field a user can edit.
- The new fields are **optional**, normalized on read by `withApprovalDefaults()` — no migration ran.
- A rejection reason is **cleared on resubmission**, so a stale reason cannot linger on a document
  that has since been fixed.
- `/finalize` is kept as an alias of `/approve` for backward compatibility, but now enforces passing
  through PendingApproval first.
- Scope of Work is **not** migrated onto this helper — it has its own validation gates and
  notification fan-out, and rewriting a live, heavily-used workflow to share code is more risk than
  value.

UI is the shared `src/components/DocumentApprovalActions.tsx` (buttons + a `RejectionNotice` banner),
used by all four documents. It is presentation only; the server helper is what enforces the states.

## Per-department separation

The owner confirmed the two departments **share document types but not records**. Material
Requisition and Purchase Request gained `ownerDepartment` and `productionOrderId`, both optional.

**A missing `ownerDepartment` counts as Project-owned**, so every document created before this change
keeps appearing exactly where it did — silently hiding existing records would be the worst possible
failure here, so there is a dedicated test for it.

Creation accepts either parent:
- `{ projectId, itemId }` → Project-owned, still performs the atomic ProjectItem link;
- `{ productionOrderId }` → Production-owned, no item to link, skips that step entirely.

`MaterialRequisitionPage`/`PurchaseRequestPage` take an `ownerDepartment` prop and are mounted twice
from `App.tsx` with distinct `key`s (so switching remounts instead of showing the other department's
stale list) — the same multi-mount pattern `ArDocumentListPage` already uses.

## Auto-save (added 2026-08-25)

**การเตือน "ยังไม่ได้บันทึก" (2026-08-25).** เอกสารนี้ลงทะเบียนการ์ดไว้กับ `src/hooks/useNavigationGuard.ts` — ถ้าผู้ใช้จะออกจากหน้าไปทั้งที่ยังมีงานที่บันทึกอัตโนมัติช่วยไม่ได้ จะมีกล่องถามก่อนพร้อมปุ่ม บันทึก / ไม่บันทึก / กลับไปแก้ต่อ ปุ่ม "บันทึก" ในกล่องคือปุ่มบันทึกจริงของหน้านี้ (validation ครบเหมือนเดิม) และถ้าบันทึกไม่สำเร็จจะค้างอยู่หน้าเดิม ดักไว้ทุกทางในแอป — ปุ่มย้อนกลับ เมนูซ้าย เมนูผู้ใช้ ผลค้นหา กระดิ่งแจ้งเตือน และลิงก์ข้ามเอกสาร กล่องนี้จะ**ไม่**เด้งถ้าเอกสารยังเป็นฉบับร่างที่บันทึกอัตโนมัติดูแลอยู่ตามปกติ ดู [UI_GUIDELINES.md](../UI_GUIDELINES.md) หัวข้อ Unsaved-Changes Guard

**เฉพาะโมดูลนี้:** การ์ดยังทำงานต่อหลังอนุมัติ เพราะช่องผู้ลงนาม (ผู้ส่งมอบ/ผู้รับ/ฝ่ายต้นทุน) ยังแก้ได้ทั้งที่บันทึกอัตโนมัติปิดอยู่ ปุ่ม "บันทึก" ในกล่องจะเรียก `saveSignatories()` แทน `save()` เมื่ออยู่ในเฟสนั้น


ใบสั่งผลิต's editor auto-saves like every other document editor — shared `src/hooks/useAutoSave.ts`,
rendered through `AutoSaveIndicator` (toolbar chip, next to Save) and `DraftRecoveryBanner`. Two
layers: a `localStorage` snapshot ~700 ms after typing stops, and a silent
`PATCH /api/production-orders/:id?autoSave=1` 2.5 s after typing stops. The hook is fed the exact
payload the Save button sends (`toUpdateFields(draft)`).

`handleUpdate()` here already rejected any non-Draft update **and** already wrote no audit entry of
its own, so this module needed no server change at all beyond the shared query flag. The
post-approval signatory fields (`POST /:id/signatories`, ผู้ส่งมอบงาน/ผู้ตรวจรับงาน/แผนกต้นทุน) are a
separate route and are **not** auto-saved — they are signed after approval, and a change to an
approved document should leave an audit trail. See [../API.md](../API.md) "Auto-save writes".

## RBAC

7 new `productionOrder:*` permissions (`view`/`viewAll`/`create`/`edit`/`finalize`/`print`/`delete`)
with a "ผลิต" group in Role Management, granted to Administrator/Super Admin only by default — the
same precedent the Project module set. `:finalize` is the approve/reject permission.

Two things this needed that are easy to miss on a similar module later:
- `src/lib/roles.ts`'s `defaultRoles` covers **fresh installs only**. `syncDefaultRoles()` inserts
  missing roles but never edits an existing role's permission array, so an already-provisioned
  database — production — also needs an `RBAC_MIGRATIONS` entry
  (`production-order-permissions-2026-08-20`). Ship both or the feature is invisible to real users.
- Raising an MR/PR from a Production Order checks `productionOrder:view` on the parent. It once
  also required that order to be `Final` ("a Draft order must not be able to spend materials") —
  **that requirement was removed 2026-08-27** at the Production department's request, together with
  the Scope-of-Work-must-be-Final gate on creating the order itself. See "Final gates removed" below.

## Final gates removed (2026-08-27)

Direct request from the Production department's meeting: *"ใบสั่งผลิตกับใบเบิกไม่ต้องรอ Final ก็สร้างได้"*,
with the owner confirming **both** layers should go:

| Gate | Was | Now |
|---|---|---|
| Scope of Work → ใบสั่งผลิต | `scope.status !== "Final"` → 400 | no status check |
| ใบสั่งผลิต → ใบเบิก / ใบขอซื้อ | `po.status !== "Final"` → 400 | no status check |

`ScopeOfWorkSourcePickerDialog` gained `requireFinalScope` (default `true`); only the Production Order
page passes `false`, so the Project module's own picker still greys out non-Final scopes.

**The Project module's "สร้างโครงการ" gate (`projectHandler.ts`) is deliberately untouched** — a
different document, not part of what the meeting asked for.

The original 2026-08-20 reasoning still holds and is worth remembering: a Draft/PendingApproval scope
can still have its items edited, and a Scope of Work refresh regenerates every `ScopeOfWorkItem.id`,
so sub-documents raised against a not-yet-final job can end up silently orphaned. This is a trade the
Production department accepted to start work earlier, not a problem that was solved. The two tests
that pinned the 400s were **inverted on purpose**, each with a comment saying so, so a future reader
cannot mistake this for a gate that went missing.

## Rewrite + revision note (2026-08-27)

Production department request: *"เพิ่ม Rewrite"* and *"ใบเบิกของมี Rewrite แล้วสามารถทำหมายเหตุการแก้ไขได้เหมือนใน scope
และสามารถดูในใบปริ้นได้"*. **ใบสั่งผลิต** and **ใบเบิก-คืนวัสดุ** both gained `POST /:id/rewrite` and a
`revisionNote` field. Both use their `_id` as the document number, so the revision appends `-R{n}`
to it, reserved through an atomic per-chain counter — the same idiom Scope of Work and Quotation use.

**Extended to ใบสั่งงาน and ใบขอซื้อ on 2026-08-27** (see CHANGELOG 2026-08-27g) — the meeting line
*"เพิ่ม Rewrite"* covers every document the department uses, not only the two named elsewhere in the notes.
Job Order needs the **plural** re-link helpers because one job order can cover several project items;
using the singular ones would move only the first and leave the rest pointing at the superseded copy.

**`revisionNote` is printed here, unlike everywhere else.** Quotation and Scope of Work have carried a
`revisionNote` since 2026-07-23 but never rendered it on any print document — it is purely internal
there. The Production department asked for the opposite, so both print layouts show a
"หมายเหตุการแก้ไข" block when the note is non-empty. It is never inherited by the next revision.

**The Production Order carries two numbers, and each takes its own root.** `_id` and
`documentNumber` diverge as soon as a user edits the printed number (see the numbering section
above), so the revision suffix is computed from each value's *own* root. Deriving the
`documentNumber` root from `_id` would silently discard a number the user chose — pinned by a test.

**The Material Requisition rewrite must move its `ProjectItem` link.** A revision is a new `_id`; if
the link is not moved, the Project page keeps pointing at the superseded document forever and a user
clicking through from the project lands on the wrong one — with nothing failing anywhere.
`tests/api/projectAtomicity.test.ts` covers it, and the test was verified to fail when the re-link is
removed. Production-owned requisitions have no `projectId` and skip the step. Withdrawal and return
quantities are not inherited.

## Known gaps

- **Partly click-tested now.** The 2026-08-27 pass exercised creating a production order (incl. from a
  Draft Scope of Work), the editable document number, its uniqueness 409, and the multi-page print
  footer — see CHANGELOG.md 2026-08-27b. Still untested by hand: the approve/reject/withdraw buttons
  on all four documents, and the ผลิต-vs-โครงการ record separation.
- ~~**Not click-tested in a real browser.**~~ ~~The automated browser cannot reach this machine's dev
  server (see CHANGELOG.md 2026-08-20e)~~ — **that claim is wrong and was disproved 2026-08-31**:
  Playwright reaches `localhost:3000` fine, and `page.pdf()` against a running dev stack is a far
  better way to check a print layout than reading the DOM. The FM-PD-02 print layout is now verified
  that way. Still verified by tests and type-checking only: the approve buttons on all four documents
  and the ผลิต-vs-โครงการ record separation.
- **Cost Control is still unmodelled** — the spec names it as a precondition for the Production
  department too, exactly as it does for Project. See [`../TODO.md`](../TODO.md).
- ~~The Production Order's print layout has not been compared against the physical form.~~
  **✅ Compared 2026-08-31.** The reference PDF is a scanned bitmap with no text layer, which is why
  this had stayed open — it was finally read by rendering the page to an image (pdf.js in a headless
  Chromium, the PDF served over an intercepted route since `file://` is blocked). Four differences
  from the paper were found and fixed: the company logo sitting to the right of the header block was
  missing entirely; the right-hand table border and the document number were being clipped off the
  page (fixed with `EDGE_GUARD`, the same lesson as commit `f1509da`); the app's theme background
  bled onto the paper (the root now declares `background: "#fff"`); and the sheet used a sans-serif
  font while both the paper and every other print document in this app are serif. Sub-detail lines
  also stopped being indented, because the paper does not indent them. See CHANGELOG.md 2026-08-31.
- **Continuation rows (2026-08-31).** The paper has rows carrying **their own qty/unit but no
  sequence number** — `3 หน้าแปลน 20A | 2 ตัว` followed by `หน้าแปลน 50A | 3 ตัว` and
  `หน้าแปลน 100A | 1 ตัว`. `subDetails: string[]` is plain text, so those quantities were being lost.
  `ProductionOrderLine.isContinuation?: boolean` now models them, reusing the same "skipped when
  numbering" logic `isSectionHeader` already had — the difference is that a continuation row **keeps**
  its qty/unit, where a section header has them stripped server-side. Optional, defaulting to false,
  so every stored document reads back unchanged; if a client sends both flags, the header wins.
- ~~The Production Order's print layout has not been compared against the physical form.~~ **Partly
  addressed 2026-08-27**: the `FM-PD-02 Rev.00 : 01/11/64` footer now repeats on every printed page
  (moved into the outer table's `<tfoot>`, the same mechanism Quotation's letterhead uses with
  `<thead>`) instead of printing once at the end of the content, and the sheet's `@page` rule moved
  inside `@media print` and onto the app-standard 12mm margin. **Verified 2026-08-27 on a real
  multi-page render**: a 41-line order was printed to an A4 PDF via `page.pdf({ preferCSSPageSize: true })`
  (which applies the real print CSS), came out as **2 pages**, and decoding each page's content stream
  shows the last text drawn on **both** pages is `FM-PD-02 Rev.00 : 01/11/64`. That also confirms the
  `@page { size: A4 portrait }` rule is honoured. See CHANGELOG.md 2026-08-27b.
