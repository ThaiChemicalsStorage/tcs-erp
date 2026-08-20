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

## RBAC

7 new `productionOrder:*` permissions (`view`/`viewAll`/`create`/`edit`/`finalize`/`print`/`delete`)
with a "ผลิต" group in Role Management, granted to Administrator/Super Admin only by default — the
same precedent the Project module set. `:finalize` is the approve/reject permission.

## Known gaps

- **Not click-tested in a real browser.** The automated browser cannot reach this machine's dev
  server (see CHANGELOG.md 2026-08-20e), so the ผลิต pages, the approve buttons on all four
  documents, and the FM-PD-02 print layout are verified by tests and type-checking only.
- **Cost Control is still unmodelled** — the spec names it as a precondition for the Production
  department too, exactly as it does for Project. See [`../TODO.md`](../TODO.md).
- The Production Order's print layout has not been compared against the physical form.
