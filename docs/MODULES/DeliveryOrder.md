# Module: Delivery Order

## Status: ✅ Built (2026-07-23)

New document type, "ใบส่งมอบสินค้าและบริการ" (Delivery Order & Service Order), added per direct user
request: "ช่วยทำหน้าใบส่งมอบสินค้าให้หน่อย...ดึงข้อมูลแบบไฟล์ pdf...สินค้าจะดึงมาจากหน้า scope of
work...ข้อมูลบริษัทให้ดึงมาจากใบเสนอราคา...ทำแยกแต่ละงวดที่จะส่งไปให้แต่ละแผนก...งวดนี้จะมีให้ติ๊กว่า
เอาสินค้าตัวไหนไปบ้าง...ทำหน้าแยกตรง side bar ออกมาด้วยเหมือนกับพวก scope of work กับ ใบเสนอราคา" —
reproduces the printed structure of the reference PDF ("ใบส่งมอบสินค้าและบริการ
PQ202607-175-SC-WM บริษัท อีจ.pdf", `public/`), a company-provided form (`FM-SL-05 Rev.01`) that
splits a job's delivery/billing across its payment installments — one printed page per installment,
each showing only the items the preparer marks as covered by that shipment.

## Business Flow

1. A record is created from an existing **Scope of Work** — a "สร้างใบส่งมอบสินค้า" toolbar button on
   `ScopeOfWorkDocument.tsx` (same component whether reached via the Quotation-embedded view or the
   standalone Scope of Work page), calling `POST /api/delivery-orders` with `{ scopeOfWorkId }`. No
   extra prompt/input needed at creation time (unlike Scope of Work's `secondaryCode` prompt) —
   everything the document needs is already on the source Scope of Work. If one already exists for
   this Scope of Work, the button reads "เปิดใบส่งมอบสินค้า" and opens the most-recently-updated one
   instead (same existence-check pattern Quotation's "สร้าง/เปิด Scope of Work" button uses).
2. **Customer info** ("เรียน" — company name + address) is snapshotted from the Scope of Work's own
   `customerSnapshot` at creation time (itself already sourced from the Quotation) — per the direct
   instruction "ข้อมูลบริษัทให้ดึงมาจากใบเสนอราคา." **Items** (`DeliveryOrderItem[]`) are snapshotted
   from the Scope of Work's `items` (name/quantity/unit/specifications only — a non-priced section
   divider row is excluded entirely, it makes no sense to "select" onto a delivery page).
3. **Installments** (`DeliveryOrderInstallment[]`) are built 1:1 from the Scope of Work's
   `paymentConditions.installments` (same `id`, `pct`, `label`, `paymentType`, `days` — always a
   mirror of the Scope of Work's own payment schedule, never independently editable here) plus
   fields specific to this document: `itemIds` (which of the snapshotted items are ticked as
   included in this installment's shipment — **starts empty**, per the direct instruction "งวดนี้จะมี
   ให้ติ๊กว่าเอาสินค้าตัวไหนไปบ้าง"), `documentNumber`/`issueDate` ("เลขที่"/"วันที่" — always blank by
   default, same "blue-handwritten-style fields start blank" convention Scope of Work already
   follows for its own shipping/billing fields), and `remark` (the "Remark:" footer line, auto-
   drafted from `pct`/`label`/`paymentType`/`days` — e.g. "40% After material on site (Cash 7 Days)"
   — but freely editable afterward, same "auto-draft once, never silently overwrite" convention
   `revisionNote` already established).
4. **"อัปเดตข้อมูลจาก Scope of Work"** re-pulls `customerCompanyName`/`customerAddress`/`items` and
   reconciles `installments` against the Scope of Work's *current* payment schedule, matched by the
   stable installment `id`: a row that still exists keeps its user-entered `itemIds` (stale ids
   pointing at a since-removed item are dropped, never left dangling)/`documentNumber`/`issueDate`/
   `remark`; a brand-new installment gets a fresh blank page; a removed installment's page simply
   stops appearing. Never runs automatically — only on explicit click, with a confirm dialog first.
5. **Print** (`DeliveryOrderPrintDocument.tsx`) renders one `<table className="hidden print:table
   ...">` per installment, each with `style={{ breakAfter: "page" }}` so the browser starts a new
   physical page per installment — matching the reference PDF's one-page-per-installment structure
   exactly. Company letterhead comes from the live Settings → Company Info singleton
   (`CompanyHeaderInfo`, same convention `PrintDocument.tsx`/`ScopeOfWorkPrintDocument.tsx` already
   use), not a hardcoded copy of the sample's letterhead — so it stays in sync if the company's own
   info ever changes. No required-field validation gate exists on this document type (deliberately
   simpler than Quotation/Scope of Work's validation machinery) — the print button only blocks with a
   toast if literally zero items are ticked across every installment.
6. **Draft/Final lifecycle**, same two-state model as Scope of Work — "ยืนยัน Final" locks the record
   against further edits (no un-finalize action, no Duplicate/Rewrite action either — a Delivery
   Order is meant to track one specific Scope of Work's actual shipments, not spawn independent
   copies). No required-field validation gates finalization either.
7. **Standalone sidebar page** (`src/pages/deliveryOrder/DeliveryOrderPage.tsx`, `Truck` icon, gated
   by `deliveryOrder:view`) for browsing/opening existing records — same "list page owns list↔detail
   view state" pattern `ScopeOfWorkPage.tsx` already uses, reached directly from the sidebar (Sales
   group, after Scope of Work). Creation is still only ever triggered from the Scope of Work detail
   toolbar button above.

## Data Model

`DeliveryOrder` (`src/lib/deliveryOrder.ts`, `delivery_orders` MongoDB collection):

```ts
interface DeliveryOrder {
  id: string;
  scopeOfWorkId: string;
  scopeNumber: string;              // "WORK ORDER" field, frozen at creation, refreshable
  quotationId: string;
  customerCompanyName: string;      // "เรียน" line 1
  customerAddress: string;          // "เรียน" line 2
  items: DeliveryOrderItem[];       // { id, name, quantity, unit, specifications }
  installments: DeliveryOrderInstallment[];
  status: "Draft" | "Final";
  version: number;
  createdAt, updatedAt, createdBy, updatedBy, isDeleted;
}
interface DeliveryOrderInstallment {
  id: string;                       // mirrors the source ScopeOfWorkPaymentInstallment's id
  pct: number | null; label: string; paymentType: "" | "Cash" | "Credit"; days: number | null;
  itemIds: string[];                // which DeliveryOrderItem ids are ticked for this page
  documentNumber: string;           // "เลขที่" — blank by default
  issueDate: string;                // "วันที่" — blank by default, yyyy-mm-dd
  remark: string;                   // "Remark:" footer, auto-drafted, freely editable
}
```

No uniqueness constraint on `scopeOfWorkId` — same non-enforced "usually just one" convention Scope
of Work itself has relative to its own quotation (the client-side existence check nudges toward one,
nothing at the database level hard-blocks a second).

## RBAC

7 new permissions, mirroring Scope of Work's exactly: `deliveryOrder:view/viewAll/create/edit/
finalize/print/delete`. Default grants mirror Scope of Work's own grants row-for-row: Super Admin/
Administrator hold all 7; Sales User holds view/create/edit/print (no viewAll/finalize/delete);
Approver Level 1/2 hold view/viewAll/edit/finalize/print (no create/delete); Viewer holds view/
viewAll only. **⚠️ Requires the same manual Role Management step as every other permission added
this session** on an already-provisioned production deployment — `defaultRoles` only seeds once, so
existing role documents won't retroactively gain these 7 permissions just because the code deploys.
See [RBAC.md](../RBAC.md) and [TODO.md](../TODO.md).

Ownership rule mirrors Scope of Work's `canEditScope()`/`isOwnerOf()` exactly: edit/delete require
either being the record's creator or holding `deliveryOrder:finalize`. Direct-id `GET` and the
by-scope existence check are deliberately unfiltered by `deliveryOrder:viewAll` — same reasoning as
Scope of Work's identical carve-outs (an existence check must never hide a colleague's
already-created record and risk a duplicate; direct record access by a known id is a different
concern than the browse-everything list).

## API

Mounted from `api/handlers/quotes.ts` (checked on the raw pathname before the Scope of Work check,
which is itself checked before the plain quotes logic) — no new Vercel function file, same
12-function-slot-sharing convention Scope of Work and Quotation Templates already use. New
`api/_lib/deliveryOrderHandler.ts`. See [API.md](../API.md) for the full route table.

## Files

- `src/lib/deliveryOrder.ts` — types + `fetch*`/`create*`/`update*`/`finalize*`/`refresh*`/`delete*`
  calls, `draftInstallmentRemark()`.
- `api/_lib/deliveryOrderHandler.ts` — CRUD handler, `deriveItemsFromScope()`/
  `deriveInstallmentsFromScope()` (the snapshot/reconciliation logic).
- `src/pages/quotation/DeliveryOrderDocument.tsx` — detail/edit view (per-installment item
  checkboxes, เลขที่/วันที่/Remark editors).
- `src/pages/quotation/DeliveryOrderPrintDocument.tsx` — print layout, one page per installment.
- `src/pages/deliveryOrder/DeliveryOrderPage.tsx` + `DeliveryOrderList.tsx` — standalone sidebar
  module.
- `src/pages/quotation/ScopeOfWorkDocument.tsx` — the "สร้าง/เปิดใบส่งมอบสินค้า" toolbar button and
  its existence-check effect.

## Known Limitations, Not Built This Pass

- **No Duplicate/Rewrite action** — a Delivery Order tracks one specific Scope of Work's actual
  shipment history; "ทำสำเนา"/revision semantics didn't fit the same way they do for Quotation/Scope
  of Work, and weren't requested. If a future need arises (e.g. correcting a finalized record),
  revisit then rather than speculatively building it now.
- **No required-field validation gate** — unlike Quotation/Scope of Work's `DOCUMENT_INCOMPLETE`
  machinery, printing/finalizing a Delivery Order only blocks on the one obvious case (zero items
  ticked anywhere). Deliberately simpler scope for this pass; revisit if incomplete documents in
  practice turn out to be a real problem.
- **No Global Search integration** — Scope of Work and Quotation both have a Global Search result
  group; Delivery Order doesn't yet. Not requested this pass.
- **Not verified against a live deployment/browser** — `tsc`/`lint`/`build` all pass clean, and the
  create/refresh reconciliation logic (`deriveItemsFromScope()`/`deriveInstallmentsFromScope()`) was
  verified via a standalone Node script against mock data (section-header exclusion, auto-drafted
  remark text, stale-itemId cleanup, preserved user edits, new/removed installment handling). The
  actual printed page layout has not been visually confirmed against a real browser print preview —
  same standing sandboxed-session limitation as every other pass this session (Playwright MCP
  disconnected, no live MongoDB credentials). See [TODO.md](../TODO.md).
