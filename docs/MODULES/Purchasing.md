# Module: Purchasing (จัดซื้อ)

## Status: ✅ Built 2026-08-28 — ใบสั่งซื้อ (new) plus ใบขอซื้อ opened to every department. Click-tested in a real browser end to end. **Print layout is a placeholder** awaiting the owner's real form. ⚠️ **ใบตรวจรับสินค้า and ใบรับวางบิล were built the same day and removed hours later at the owner's instruction — see "Removed 2026-08-28" below.**

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

## The documents

| Document | Built as | Number | Statuses |
|---|---|---|---|
| ใบขอซื้อ (Purchase Request) | **Existing** module, extended with `ownerDepartment: "general"` | `PR-{พ.ศ.}-{NNNN}` | ร่าง → รออนุมัติ → อนุมัติ |
| **ใบสั่งซื้อ (Purchase Order)** | **New** — `src/lib/purchaseOrder.ts` | `PO-{พ.ศ.}-{NNNN}` | ร่าง → รออนุมัติ → อนุมัติ |

The owner's chart has two further steps — รับ/ตรวจรับสินค้า and รับวางบิล — which were built on
2026-08-28 and removed the same day; see "Removed 2026-08-28" at the bottom of this file.

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

## Routing

ใบสั่งซื้อ mounts on **`api/handlers/quotes.ts`**, the documented overflow dispatch host —
the Vercel 12-function budget is full (9 handlers + company + audit-log + dashboard), so a new
`api/handlers/*.ts` file is not available. Adding a document is an import plus a two-line `if` on
the pathname there, and matching entries in **both** `vercel.json` (two rewrites per route: bare and
`:path*`) and `server/app.ts` (`API_ROUTES`). Keeping those two in sync is not optional — they are
what makes local dev and production behave the same way.

| Route | Actions |
|---|---|
| `/api/purchase-orders` | list · create · get · patch · delete · `print` · `rewrite` · `submit-approval` · `approve`/`finalize` · `reject` · `withdraw-approval` |

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
```

The existing ใบขอซื้อ entries under **โครงการ** and **ผลิต** stay exactly where they were. The nav
group hides itself entirely when a role can see none of its entries (`items.length === 0`
returns `null` in `App.tsx`), so a role without the purchasing permissions never sees the heading.

## RBAC

7 permissions — `purchaseOrder:` `view` / `viewAll` / `create` / `edit` / `finalize` / `print` /
`delete` — grouped under the label **จัดซื้อ** on the roles page. (21 were added on 2026-08-28; the
14 belonging to the two removed documents went with them the same day.)

No `PERMISSION_DEPENDENCIES` entries were added. That table exists only for the case where a page
breaks permanently because its boot fetch needs a different permission; it is not a list of
"permissions that ought to go together", and a test enforces that reading.

Following the ProductRequest precedent (2026-08-27), the permissions are added to `administrator` in
`defaultRoles` — which affects **fresh installs only**. **On the live server the owner must tick
these on the roles page by hand.** No RBAC migration was written; `api/_lib/rbacSeed.ts` has a
run-once mechanism if that decision is ever reversed.

## Print documents

`PurchaseOrderPrintDocument.tsx` is a **⚠️ placeholder**. The owner said the real forms would come
later; `DESIGN.md` is explicit that the paper form is the authority on a print layout, not the app's
design system, so it is a plain bordered table that holds the right fields rather than an invented
FM-PU-xx layout. It hardcodes Thai and never calls `useI18n`, like every other print document.
`PrintLetterhead` is deliberately not used until a real form shows a company letterhead.

## Known gaps

1. **No vendor master.** `vendorName` is free text on both documents, exactly as it already was
   on ใบขอซื้อ. No vendor record, credit terms, address or tax ID exists anywhere in the system.
2. **The per-department approver table from the chart is not data.** Existing permissions and
   departments are used instead, as agreed. Delegation is therefore whatever the roles page allows.
3. **Nobody is in the Purchasing department in the live database** (`docs/TODO.md`). The existing
   "ใบขอซื้ออนุมัติแล้ว" notification has therefore never reached anyone, and this module inherits
   that: it stays silent until employees are assigned to the department on the user-management page.
   Department matching is also by **name**, not `code` — renaming the department silently stops the
   hand-off.
4. **No guided tour** for the new document (`useModuleTour` is wired for ใบขอซื้อ only).

## Removed 2026-08-28 — ใบตรวจรับสินค้า (GR) และใบรับวางบิล (BR)

Both were built earlier the same day (commit `dc0334c`) and removed hours later on the owner's
instruction: *"ลบ 2 อันนี้ออกไปด้วยไม่ได้ใช้"*. Nothing had ever been entered into either — the two
collections were created but never written to outside a local test.

**What the removal touched.** Following the precedent set by
[CompanyProfiles.md](./CompanyProfiles.md): the four `src/lib`/`api/_lib` modules and both page
folders were deleted; the collection accessors, types and 9 index declarations came out of
`api/_lib/collections.ts`; the dispatch branches left `api/handlers/quotes.ts`, the `API_ROUTES`
entries left `server/app.ts`, and the 4 rewrites left `vercel.json` (those paths now return a plain
404 — no function is left behind them); `src/App.tsx` lost 11 wiring sites; the 14 permissions came
out of all five tables in `src/lib/permissions.ts` plus `defaultRoles`; both search categories and
their `GR-`/`BR-` fast paths came out of all five search files (Global Search went from 19 categories
to 17); ~238 i18n keys went in both languages; and the manual lost chapters 17-18, with 19-25
renumbered down to 17-23.

Two things were **deliberately left alone**:

1. **The `goods_receipts` and `bill_receipts` MongoDB collections and anything in them.** Same rule
   the Company Profiles removal followed — code removal never drops a collection. Dropping them is a
   separate, deliberate, backed-up decision.
2. **The 2026-08-28 What's New entry that announced both documents to users.** It is a dated
   announcement log, not a description of the current system; rewriting history there would be
   wrong. A later entry records the withdrawal instead.

One thing that had to go with them: **`PurchaseOrderPickerDialog.tsx`**. It was shared by the two
removed pages and by nothing else, so it became dead code — and neither `noUnusedLocals` nor ESLint
catches a file that simply has no importers.

`StockMovementSourceType` also lost its `"goods_receipt"` member, in **both** copies of that union
(`api/_lib/collections.ts` and `src/lib/stock.ts` declare it independently). Nothing had ever written
that value, so no stored movement can carry it.
