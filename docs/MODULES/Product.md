# Module: Product

## Purpose

A reusable Product/Service library ("Product Templates") that Sales can draw from when building quotations, separate from Quotation itself. The core rule: **Product Templates are master data; Quotation Items are independent snapshots** — changing, archiving, or deleting a product must never affect any quotation that already used it.

## Business Flow

1. **List** (`ProductList.tsx`): search by code/name, filter by category, sort any column, paginate (8/page), toggle "show archived" (archived items hidden by default).
2. **Create** ("เพิ่มสินค้าใหม่"): code, name, category, unit, default price, description, optional specifications — code must be unique.
3. **Edit**: same form, pre-filled; updating a product only affects its own record, never historical quotation line items (see [Quotation.md](./Quotation.md) — snapshot guarantee holds because `QuoteLine` never stores a reference back to a `Product`, only copied values).
4. **Archive vs. Delete**: Archive (soft, reversible, hides the product from future quotation picks unless "show archived" is on) is the recommended path; Delete is permanent and requires confirming a `ConfirmDialog` warning that explicitly reassures the user historical quotations are unaffected.
5. **Duplicate**: clones a product with `-COPY`/`-COPY2`/... appended to the code and "(สำเนา)" appended to the name, always created as active (not archived).
6. **Categories** (`CategoriesManager.tsx`): create, inline-rename, archive/unarchive. No delete for categories (matches the original spec — only archive).
7. **Quotation integration**: `ProductPickerModal.tsx` (search-filterable list of active products) is opened from the Quotation line-items table; selecting a product copies its `name`/`unit`/`defaultPrice` into a brand-new `QuoteLine` — after that, the two records are completely independent.

## Pages

- `src/pages/products/ProductsPage.tsx` (101 lines) — top-level container: view-switching (`list`/`create`/`edit`/`categories`), owns all CRUD handlers, passes data + callbacks down.
- `src/pages/products/ProductList.tsx` (247 lines) — list/table view: search, filter, sort, pagination, row actions, delete-confirmation.
- `src/pages/products/ProductForm.tsx` (144 lines) — shared create/edit form.
- `src/pages/products/CategoriesManager.tsx` (116 lines) — category CRUD (create/rename/archive).
- `src/pages/products/ProductPickerModal.tsx` (77 lines) — search-filterable picker, used only from Quotation.

## Components

Uses `src/components/ConfirmDialog.tsx` for delete confirmation. No product-specific shared components beyond the above.

## Database Tables

The `products` and `categories` MongoDB collections — see [DATABASE.md](../DATABASE.md) for the `Product`/`ProductCategory` shapes. Migrated 2026-07-09 from `localStorage` (`tcs_erp_products`, `tcs_erp_categories`). **2026-08-18**: `Product` gained `stockQty` (see "Stock" below), and a new `stock_movements` collection was added — see [DATABASE.md](../DATABASE.md) "`StockMovement`".

## APIs

`GET/POST /api/products`, `PATCH/DELETE /api/products/:id`, `GET/POST /api/categories`, `PATCH /api/categories/:id` — see [API.md](../API.md). **2026-08-18**: the two `GET` routes above also accept a `stock:view` holder who has no `products:view` (see "Stock" below); `GET/POST /api/stock-movements` added.

## Permissions

Server-enforced per action: `products:view`/`create`/`edit`/`delete` on the respective API routes (categories share the same `products:*` permission family — there is no separate `categories:*` permission). The UI itself only gates the sidebar entry (`products:view`) — the create/edit/delete buttons inside `ProductsPage`/`ProductList` are not yet hidden per-permission (a known UX gap, see [TODO.md](../TODO.md)), though a user without the right permission would now get a real `403` from the server if they somehow triggered the action anyway. **2026-08-18**: `stock:view`/`stock:adjust` added for the Stock page — see "Stock" below and [RBAC.md](../RBAC.md) "Stock".

## Stock (added 2026-08-18)

Closes the "Stock/inventory linkage once an Inventory module exists" item that used to sit under
Future Improvements below — built as a direct request tied to Accounting's Tax Invoice workflow,
not as a full standalone Inventory module (no purchase orders, no warehouse/location tracking —
just an on-hand quantity per product and a ledger of what changed it).

> **อัปเดต 2026-09-02** — เจ้าของสั่งสามอย่างพร้อมกัน: *"ตัดของอัตโนมัติ และเวลาของใกล้หมดให้แจ้งเตือน
> และสามารถปริ้นใบ Stock สินค้าออกไปเช็คกับ Stock จริงได้"* · จุดสำคัญคือทั้งสามอย่างเกาะอยู่กับ
> `applyStockMovement()` ตัวเดิม ไม่มีทางเขียนสต๊อกทางที่สอง — ดูหัวข้อ "อัตโนมัติและการเตือน" ด้านล่าง

- **`Product.stockQty`** — the current on-hand quantity. Server-set-only: defaults to `0` on create
  (`api/handlers/products.ts`), and is **never** accepted from the client via `POST`/`PATCH
  /api/products` — the only way it changes is through a `StockMovement`.
- **`stock_movements` ledger** (`api/_lib/collections.ts`'s `StockMovementFields`, see
  [DATABASE.md](../DATABASE.md)) — every change to `stockQty` is a `kind: "receive"|"deduct"|"adjust"`
  row with a signed `delta`, a `balanceAfter` snapshot, and `sourceType: "manual"|"ar_document"`.
  Deliberately shared, document-agnostic infrastructure rather than something owned by this module or
  by Accounting alone — see the doc comment above `StockMovementFields` in `collections.ts` for the
  full reasoning, including that a future ใบเบิกของ (Material Requisition)/PR module (the "Project"
  department's parallel workstream, see the coordination note at the top of
  [CLAUDE.md](../CLAUDE.md)) can write into this same ledger instead of inventing a second,
  competing stock-quantity system.
- **`applyStockMovement()`** (`api/_lib/stockHandler.ts`) — the one code path allowed to change
  `stockQty`. Uses an atomic MongoDB conditional filter (`stockQty: {$gte: -delta}` on a deduction)
  inside the `findOneAndUpdate` itself, so an over-deduction is rejected in the same query — no
  separate read-then-write race window, no Mongo transaction needed for what's still a
  single-document update.
- **`src/pages/stock/StockPage.tsx`** — new standalone "สต๊อกสินค้า" sidebar page (own "คลังสินค้า"
  nav group entry, alongside this module's own "คลังสินค้า" Products page): product list with current
  `stockQty` + search, a per-product "ปรับสต๊อก" (receive/deduct/adjust) dialog, and a movement
  history table (all-products or filtered to one product). Gated on `stock:view` (page) /
  `stock:adjust` (the adjust button) — see [RBAC.md](../RBAC.md) "Stock".
- **Accounting integration**: the ใบกำกับภาษี/ใบส่งสินค้า (IV) document list gained a dual-pane
  "เปิดดู / ตัดสต๊อกสินค้า" view (`ArStockPanel.tsx`) for cutting stock against an issued invoice —
  see [MODULES/Accounting.md](./Accounting.md) "Stock".
### อัตโนมัติและการเตือน (2026-09-02)

- **ใบเบิกที่อนุมัติแล้วตัดสต๊อกเอง** — `materialRequisitionHandler.ts` ตัดตามช่อง "เบิกของ"
  (`plannedQty`) ด้วย `sourceType: "material_requisition"` · ยอดถูกตรวจใน **`beforeApprove`** ของ
  เครื่องอนุมัติร่วม (hook ใหม่ใน `documentApproval.ts`) ไม่ใช่ `onApproved` เพราะ `onApproved` ทำงาน
  หลังเอกสารเป็น Final ไปแล้ว การเช็คตรงนั้นจะได้ใบที่อนุมัติแล้วแต่สต๊อกไม่ถูกตัด ซึ่งย้อนไม่ได้
  **ของไม่พอ = อนุมัติไม่ได้** พร้อมข้อความบอกว่าสินค้าตัวไหนขาดเท่าไร
- **ของที่คืนกลับเข้าสต๊อก** — `handleReturn()` รับเข้าตาม **ส่วนต่าง** ของช่อง "คืนของ" ไม่ใช่ค่าเต็ม
  (route ถูกยิงซ้ำได้ทุกครั้งที่แก้ตัวเลข) และเฉพาะใบสถานะ Final เท่านั้น (ใบที่ยังไม่อนุมัติไม่เคยถูกตัด)
- **`Product.reorderPoint`** — จุดเตือนของใกล้หมด แก้ได้ทีละแถวในหน้าสต๊อก (ผ่าน `PATCH /api/products`)
  **0 หรือไม่มีค่า = ปิดการเตือนของสินค้าตัวนั้น** ไม่ใช่ "เตือนตลอดเวลา" — ไม่งั้นสินค้าทุกตัวที่ยัง
  ไม่เคยตั้งค่าจะยิงพร้อมกันหมดในวันแรกจนไม่มีใครอ่านกระดิ่งอีกเลย
- **แจ้งเตือน `stock_low`** — `notifyIfLowStock()` ใน `stockHandler.ts` ยิงถึงฝ่ายคลังสินค้าเฉพาะตอน
  **"ข้ามเส้น"** (ยอดก่อนตัดยังไม่ถึงจุดเตือน ยอดหลังตัดถึง) ไม่ใช่ทุกครั้งที่เบิกของที่ต่ำอยู่แล้ว
  best-effort — การแจ้งเตือนที่ส่งไม่ออกต้องไม่ทำให้การตัดสต๊อกล้ม (มีเทสต์คุมทั้งสี่เงื่อนไข)
- **ใบนับสต๊อก** — `StockCountSheetPrintDocument.tsx` คอลัมน์ "นับจริง"/"ผลต่าง" **เว้นว่างเสมอ**
  ถ้าเติมค่าให้ คนนับจะลอกตัวเลขระบบลงไปโดยไม่ได้นับจริง · พิมพ์ตามผลค้นหาที่กรองอยู่บนจอ

- **Known limitations**: no undo/reversal flow for a stock movement — correcting one requires a
  fresh opposite movement via the Stock page, there's no dedicated "undo this deduction" action; no
  bulk/CSV stock import (the picker in `ArStockPanel.tsx` also shows a "คงเหลือ" count that can go
  stale within the same panel session after a successful deduction — cosmetic only, the underlying
  data is correct). See [TODO.md](../TODO.md).

## Current Features

- Full CRUD, category management, archive vs. permanent delete with confirmation, duplicate
- Search (code/name), category filter, sortable columns, pagination
- Seeded with 7 sample chemical-storage-relevant products across 7 categories (Materials/Equipment/Services/Labor/Installation/Software/Hardware → วัสดุ/อุปกรณ์/บริการ/ค่าแรง/การติดตั้ง/ซอฟต์แวร์/ฮาร์ดแวร์)
- Quotation picker integration with verified snapshot independence

## Accessibility Hardening (2026-07-30)

An `/impeccable audit` pass + fix found and fixed: `CategoriesManager.tsx` had independently
reintroduced the status-pill contrast bug (hand-rolled instead of reusing the shared `StatusBadge`)
— now reuses it directly; `ProductPickerModal` (the Quotation catalog picker) had zero dialog
semantics — now wired to `useDialogA11y` via a wrapper+form split (avoiding a known latent bug in
`ConfirmDialog`'s own version of this pattern); `ProductForm` had zero label association on all 7
fields and — uniquely among this app's forms — no busy-guard on Save at all; both are fixed.
`ProductList`'s hover-only row actions and entirely keyboard-inaccessible sortable column headers
were also fixed. Verified live via `vercel dev`, including opening the picker from an actual
Quotation. See CHANGELOG.md 2026-07-30.

## Future Improvements

- ~~Bulk import~~ — **done 2026-09-04**, see "Excel import" below. Bulk *export* is still open, and so is importing opening stock (catalog only today).
- Product images/attachments
- Per-customer or per-region pricing tiers (currently one `defaultPrice` only)
- ~~Stock/inventory linkage once an Inventory module exists~~ — closed 2026-08-18, see "Stock" above (a lightweight on-hand-quantity ledger tied to Accounting's IV workflow, not a full standalone Inventory module)
- Bulk/CSV stock import; a dedicated "undo this stock movement" action (see "Stock" above)

## Known Issues

- None currently open. An operator-precedence bug in the "sort by status" column comparator was found and fixed during the 2026-07-08 code review (see [CHANGELOG.md](../CHANGELOG.md)).


## Product Requests (คำขอเพิ่มสินค้า) — added 2026-08-27

Project department request: *"เพิ่มหน้าแผนกอื่นสามารถขอเพิ่มสินค้าได้แต่ไม่สามารถตั้งรหัสได้ เมื่อสโตร์
กดอนุมัติให้แจ้งเตือนผู้ขอเพิ่มสินค้าว่าสินค้าได้รับการตั้งรหัสสินค้าแล้ว"*

Before this, nothing in the app resembled it: `Product` has no status and no workflow, and `code` is
a plain text field any `products:create` holder types themselves. The floor's workaround was a
free-typed line on a Purchase Request (no `productId`), which never became a catalog product at all.

**The whole point is who may assign the code, and it is enforced server-side — not by hiding a field.**
`handleCreate()` and `handleUpdate()` in `api/_lib/productRequestHandler.ts` never read `code` from
the request body. The only path that writes one is `handleApprove()`, gated on `productRequest:review`.
A test posts `code`, `assignedProductCode` and `status: "Approved"` directly and asserts all three are
ignored — verified to fail when the guard is removed.

| Piece | Where |
|---|---|
| Type + API wrappers | `src/lib/productRequest.ts` |
| Handler | `api/_lib/productRequestHandler.ts` (mounted via `api/handlers/quotes.ts`) |
| Collection | `product_requests` |
| Page | `src/pages/productRequest/ProductRequestPage.tsx` ("คำขอเพิ่มสินค้า", under the คลังสินค้า nav group) |
| Permissions | `productRequest:view/viewAll/create/review` |

**Approve creates the `Product` before flipping the request's status**, so a duplicate code (409)
leaves the request `Pending` and retryable instead of `Approved` with no catalog product behind it.
Code is upper-cased and duplicate-checked exactly as `POST /api/products` does, so both routes into
the catalog behave the same. New products always start at `stockQty: 0`.

**Anyone holding `productRequest:review` also sees every request**, regardless of `:viewAll` — Stores
cannot approve what it cannot see.

**Purchase Request integration (J5)**: a PR line with no `productId` shows a "ขอรหัสสินค้า" button that
opens a request pre-filled from that line and stamped with `sourcePurchaseRequestId`. It deliberately
does **not** rewrite the PR line once Stores assigns a code — the PR may already be approved and
locked, and silently editing an approved document is worse than asking someone to re-pick the product.

## Approval hand-off notifications — added 2026-08-27

`api/_lib/departmentNotify.ts` is the shared "notify everyone in department X" helper, extracted from
the one inline copy that lived in `deliveryOrderHandler.ts`. Material Requisition approval notifies
Stores; Purchase Request approval notifies Purchasing; a new product request notifies Stores; and
approving/rejecting one notifies the requester.

⚠️ **Matching is by `User.department`, which is free text and does not line up with the `departments`
table in the live data** — so the helper accepts several spellings per department (Thai full/short and
the legacy English values). It returns the real recipient count and logs a warning when that is zero.
Notification failures never fail the approval itself. See TODO.md for the data fix this depends on.

## Stock: costing, returns and team tools (2026-09-03)

Added with the Store department's module set — see [Store.md](./Store.md) for the whole picture.

- **`StockMovementKind` gained `"return"`** (positive delta) so goods coming back from a team read
  as a return in the history rather than an anonymous adjustment. `StockMovementSourceType` gained
  `"receiving_report"`.
- **`Product.avgCost`** — a moving average, server-written only, like `stockQty`. `applyStockMovement()`
  recomputes it inside the *same pipeline update* that changes the quantity, so two concurrent receipts
  cannot both average from the stale value. Receiving with a `unitCost` re-averages; issuing, returning
  and adjusting use the current average as the movement's unit cost. Moving average was chosen over
  FIFO deliberately: no lots to track, and it is enough to give the stock card a value column.
- **Stock value is `stockQty × avgCost`, computed on read** and never stored.
- Movements now also carry `unitCost`, `amount`, `balanceValueAfter` and the department/team/work-type
  a requisition charged them to.
- **`Product.isTool`** marks an item that must come back. `GET /api/tool-holdings` aggregates the
  ledger per (department, team, product) — `held = issued − returned` — with no collection of its own,
  and is gated on the existing `stock:view` rather than a new permission.
- **Stock card** (`StockCardPrintDocument.tsx`) — A4 landscape, accounting layout, one product's whole
  history with received/issued/balance quantities *and* values. It needs the full history, so
  `GET /api/stock-movements` gained `?limit=` (default 200, max 2000).

## Excel import (นำเข้าสินค้าจากไฟล์, 2026-09-04)

Built from a direct request: *"หน้าเพิ่มสินค้าอะทำให้รองรับไฟล์ exel ให้หน่อย เวลาย้ายสินค้าจากอีกระบบ
เข้ามาจะได้ง่ายๆ แบบโยนไฟล์ exel เข้าไปแล้วสินค้าเข้ามาเลย"* — the migration path off whatever
catalog the company keeps today.

**Where it lives.** A "นำเข้าจากไฟล์" button on the Product Library header opens
`src/pages/products/ProductImportDialog.tsx`. Drop a file or pick one; `xlsx` is loaded with a
dynamic `import()` so it stays out of the main bundle, exactly as Cost Control and ทะเบียนรหัส do.

**Headers are matched by name, not by position** (`src/lib/productImport.ts`, React-free and
unit-tested). No two systems export the same column order, and the file that matters here comes from
someone else's software. Thai and English aliases are both accepted (`รหัสสินค้า`/`Item Code`,
`หน่วย`/`U.O.M`, …), the header row does not have to be the first row (exports usually carry a
report title above it), and any column the parser does not recognise is **listed back to the user**
rather than dropped silently.

**One preview step before anything is written.** The request said "drop it in and the products
appear," and it still is a drop plus one click — but the click happens after a panel that shows how
many rows will be created, how many are skipped because the code already exists, which categories
will be created, and every row that was rejected with its Excel row number. Importing hundreds of
rows blind into a live catalog is not reversible in one action; showing what will happen costs one
click and no typing.

**Rules the endpoint enforces** (`POST /api/products/import`, `products:create`):

- **An existing code is skipped, never overwritten.** Re-running the same file mid-migration is
  normal; overwriting would eat names and prices edited in the app afterwards.
- **The duplicate check is case-insensitive**, unlike single-product create, because exports
  routinely change the case of a code and a case-twin catalog is far harder to unpick than a skipped
  row.
- **Categories are matched or created by name**, once per name — a spreadsheet cannot know a
  `categoryId`. Creating them needs no new permission: `api/handlers/categories.ts` already gates
  category creation on `products:create`, so there is no RBAC migration for this feature.
- **`stockQty` and `avgCost` stay 0.** Import may not set an opening balance; stock moves only
  through a `StockMovement` row (see "Stock" above). A column named `คงเหลือ` in someone's export is
  deliberately ignored rather than becoming an untraceable balance.
- 2000 rows per import, enforced on both sides (`PRODUCT_IMPORT_MAX_ROWS`), and one audit-log entry
  per import.

**A template file** is generated on demand from the same header constants the parser reads, so the
two cannot drift; `tests/productImport.test.ts` feeds the generated template back through the parser
to keep that true.

**Still open:** this imports the *catalog*, not opening stock. Bulk stock loading is its own
outstanding item in [TODO.md](../TODO.md) and would have to go through `applyStockMovement()` to
keep the ledger honest.
