# Module: Purchasing (จัดซื้อ)

## Status: ✅ Built 2026-08-28 — ใบสั่งซื้อ (new), ใบตรวจรับสินค้า (new), ใบรับวางบิล (new), plus ใบขอซื้อ opened to every department. Click-tested in a real browser end to end. **Print layouts are placeholders** awaiting the owner's real forms.

Serves the **Purchasing (จัดซื้อ) department**, which until this date had **no module of its own** —
it existed in the system only as a signature box on ใบขอซื้อ (`purchasingDeptBy`, editable only
while the document was still a draft) and as the recipient of one notification when a ใบขอซื้อ was
approved. There was no purchase order, no goods receipt, no vendor master, no approval flow the
department owned.

Built from the owner's **"กระบวนการจัดซื้อ (Procurement Process Flow)"** chart:

> ใบขอซื้อ (PR) → [PR อนุมัติ] → ใบสั่งซื้อ (PO) → [PO อนุมัติ] → รับ/ตรวจรับสินค้า → รับวางบิล

The chart also carries a per-department table of ผู้ขอซื้อ / ผู้อนุมัติ (ผลิต · โครงการ · สโตร์ ·
เซอร์วิส · บัญชี · บุคคล) and a note that approvers may delegate. That table is **not** implemented
as data yet — see [Known gaps](#known-gaps).

## The four documents

| Document | Built as | Number | Statuses |
|---|---|---|---|
| ใบขอซื้อ (Purchase Request) | **Existing** module, extended with `ownerDepartment: "general"` | `PR-{พ.ศ.}-{NNNN}` | ร่าง → รออนุมัติ → อนุมัติ |
| **ใบสั่งซื้อ (Purchase Order)** | **New** — `src/lib/purchaseOrder.ts` | `PO-{พ.ศ.}-{NNNN}` | ร่าง → รออนุมัติ → อนุมัติ |
| **ใบตรวจรับสินค้า (Goods Receipt)** | **New** — `src/lib/goodsReceipt.ts` | `GR-{พ.ศ.}-{NNNN}` | ร่าง → ตรวจรับแล้ว |
| **ใบรับวางบิล (Bill Receipt)** | **New** — `src/lib/billReceipt.ts` | `BR-{พ.ศ.}-{NNNN}` | ร่าง → รับวางบิลแล้ว |

Only the first two need approval. ตรวจรับ/รับวางบิล are **records of a physical event**, not
decisions — the owner's chart shows no approval step on either, so they got a two-state
complete/reopen toggle (`goodsReceipt:finalize` / `billReceipt:finalize`) instead of the three-state
approval engine. Reopening is deliberately allowed: goods arrive short, a bill gets corrected.

## ใบขอซื้อ opened to every department (2026-08-28)

Before this date a ใบขอซื้อ could only be raised from a **Project item** or a **Production Order**,
which meant สโตร์ · เซอร์วิส · บัญชี · บุคคล — every department in the owner's chart that is not
โครงการ or ผลิต — could not raise one at all.

`ownerDepartment` therefore gained a third value:

| Value | Raised from | Appears on |
|---|---|---|
| `"project"` (also documents with no field at all) | a Project item | โครงการ → ใบขอซื้อ |
| `"production"` | a Production Order | ผลิต → ใบขอซื้อ |
| `"general"` | **nothing** — a blank document | จัดซื้อ → ใบขอซื้อ (ทุกฝ่าย) |

`POST /api/purchase-requests` with an empty body now creates a `"general"` document: no
`projectId` / `scopeOfWorkId` / `jobCode`, no `linkProjectItemToSubDocument()` call, and the user
types every line by hand. The `project:view` check that used to guard the whole route now guards
only the path that actually reads a project — without that change a store clerk with
`purchaseRequest:create` but no project access still could not raise a document.

There is also a **fourth, view-only scope**: `?ownerDepartment=all` — never stored, used by the
Purchasing inbox to list every department's documents in one table (with a แผนก column so the buyer
can see whose request each one is). It lifts the department wall, **not** the ownership wall:
`buildSimpleOwnershipClause` still applies, so a user without `purchaseRequest:viewAll` sees only
their own.

## ใบสั่งซื้อ (Purchase Order)

Created either **from an approved ใบขอซื้อ** (the flow chart's path) or **blank** (the buyer already
knows what to order). When created from a PR it inherits vendor, dates, credit terms, shipping and
every line as a **snapshot** — editing the PO afterwards never reaches back into the PR, and
editing the PR never rewrites the PO. This is the same rule Scope of Work → Delivery Order follows,
and `tests/api/purchasing.test.ts` pins it.

The source PR must be `Final`. A draft PR returns 400: *"ใบขอซื้อต้องได้รับอนุมัติก่อนจึงจะออก
ใบสั่งซื้อได้"*.

Uses the shared approval engine (`api/_lib/documentApproval.ts`) — the same one behind ใบขอซื้อ,
ใบเบิก, ใบสั่งงาน and ใบสั่งผลิต — so it gets ร่าง → รออนุมัติ → อนุมัติ, rejection with a comment,
withdraw-back-to-draft, and `-R1` rewrite for free. **Both** `Final` and `PendingApproval` lock
editing: approving a document whose content changed while it sat in the queue is the failure this
prevents.

`purchaseOrderSubtotal()` deliberately does **not** use `quoteMath.ts`. A PO has no VAT, no
discount, no withholding — it is a plain qty × price sum, and pulling in the quotation money engine
would imply tax behaviour this document does not have.

## ใบตรวจรับสินค้า (Goods Receipt)

Created from a **Final** PO, copying its lines with `qtyOrdered` filled and **`qtyReceived` left
null on purpose**. Pre-filling the received quantity to match the ordered quantity would let a short
delivery pass inspection by inaction — the person receiving the goods has to type what actually
arrived. Each line also carries `result: "Pending" | "Passed" | "Rejected"`.

`isFullyReceived()` (client-side) compares the two columns so the UI can flag a partial receipt.

**This document writes no stock.** `StockMovementSourceType` gained `"goods_receipt"` so the
extension point is reserved and typed, but nothing calls `applyStockMovement()` yet — see
[Known gaps](#known-gaps).

## ใบรับวางบิล (Bill Receipt)

Records that the vendor's billing envelope arrived and what was in it. References a Final PO
(required) and a ใบตรวจรับ (optional — vendors routinely bill before inspection finishes), plus the
vendor's invoice number/date, the amount, and a due date.

The attachment checklist (`DEFAULT_BILL_ATTACHMENT_CHECKS`: ใบแจ้งหนี้ · ใบกำกับภาษี · ใบส่งของ ·
สำเนาใบสั่งซื้อ · ใบเสร็จรับเงิน) has its **labels pinned server-side** — `sanitizeChecks()` accepts
only the `checked` boolean from the client. A client that could rename a checklist row could make a
completed document claim it received something it never did.

**This is not Accounts Payable.** Nothing is posted, no liability is created, and the Accounting
module does not read these records.

## Routing

All three documents mount on **`api/handlers/quotes.ts`**, the documented overflow dispatch host —
the Vercel 12-function budget is full (9 handlers + company + audit-log + dashboard), so a new
`api/handlers/*.ts` file is not available. Adding a document is an import plus a two-line `if` on
the pathname there, and matching entries in **both** `vercel.json` (two rewrites per route: bare and
`:path*`) and `server/app.ts` (`API_ROUTES`). Keeping those two in sync is not optional — they are
what makes local dev and production behave the same way.

| Route | Actions |
|---|---|
| `/api/purchase-orders` | list · create · get · patch · delete · `print` · `rewrite` · `submit-approval` · `approve`/`finalize` · `reject` · `withdraw-approval` |
| `/api/goods-receipts` | list · create · get · patch · delete · `print` · `complete` · `reopen` |
| `/api/bill-receipts` | list · create · get · patch · delete · `print` · `complete` · `reopen` |

`ensureIndexes()` only ever runs from the Setup Wizard, so any index a handler actually depends on
must also be created lazily by that handler. `ensurePurchaseOrderNumberIndex()` does this for the
unique `documentNumber` index (with a backfill for rows that predate it), matching what ใบสั่งผลิต
does.

## Navigation — the ninth group

The owner chose a **new "จัดซื้อ" group** rather than folding these into an existing one, which is
recorded in `DESIGN.md`. Order follows the flow chart, not the alphabet:

```
จัดซื้อ
  ใบขอซื้อ (ทุกฝ่าย)   ← กล่องงานเข้า: ทุกแผนก, มีคอลัมน์ "แผนก"
  ใบสั่งซื้อ
  ใบตรวจรับสินค้า
  ใบรับวางบิล
```

The existing ใบขอซื้อ entries under **โครงการ** and **ผลิต** stay exactly where they were. The nav
group hides itself entirely when a role can see none of its four entries (`items.length === 0`
returns `null` in `App.tsx`), so a role without the purchasing permissions never sees the heading.

## RBAC

21 new permissions in three families — `purchaseOrder:*`, `goodsReceipt:*`, `billReceipt:*`, each
with `view` / `viewAll` / `create` / `edit` / `finalize` / `print` / `delete` — grouped under the
label **จัดซื้อ** on the roles page.

No `PERMISSION_DEPENDENCIES` entries were added. That table exists only for the case where a page
breaks permanently because its boot fetch needs a different permission; it is not a list of
"permissions that ought to go together", and a test enforces that reading.

Following the ProductRequest precedent (2026-08-27), the permissions are added to `administrator` in
`defaultRoles` — which affects **fresh installs only**. **On the live server the owner must tick
these on the roles page by hand.** No RBAC migration was written; `api/_lib/rbacSeed.ts` has a
run-once mechanism if that decision is ever reversed.

## Print documents

`PurchaseOrderPrintDocument.tsx`, `GoodsReceiptPrintDocument.tsx` and
`BillReceiptPrintDocument.tsx` are **⚠️ placeholders**. The owner said the real forms would come
later; `DESIGN.md` is explicit that the paper form is the authority on a print layout, not the app's
design system, so these are plain bordered tables that hold the right fields rather than an invented
FM-PU-xx layout. They hardcode Thai and never call `useI18n`, like every other print document.
`PrintLetterhead` is deliberately not used until a real form shows a company letterhead.

## Known gaps

1. **No vendor master.** `vendorName` is free text on all three documents, exactly as it already was
   on ใบขอซื้อ. No vendor record, credit terms, address or tax ID exists anywhere in the system.
2. **Goods receipt does not move stock.** Whether receiving should cut stock automatically or need a
   separate confirmation is a business decision that changes on-hand balances; it was left for the
   owner rather than guessed.
3. **No link to Accounts Payable.** รับวางบิล records the envelope; it does not create a payable.
4. **The per-department approver table from the chart is not data.** Existing permissions and
   departments are used instead, as agreed. Delegation is therefore whatever the roles page allows.
5. **Nobody is in the Purchasing department in the live database** (`docs/TODO.md`). The existing
   "ใบขอซื้ออนุมัติแล้ว" notification has therefore never reached anyone, and this module inherits
   that: it stays silent until employees are assigned to the department on the user-management page.
   Department matching is also by **name**, not `code` — renaming the department silently stops the
   hand-off.
6. **No guided tour** for the three new documents (`useModuleTour` is wired for ใบขอซื้อ only).
