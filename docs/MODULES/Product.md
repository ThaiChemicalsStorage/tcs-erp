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
not as a full standalone Inventory module (no purchase orders, no warehouse/location tracking, no
reorder points — just an on-hand quantity per product and a ledger of what changed it).

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

- Bulk import/export (CSV) — not requested yet, but a natural fit for a "product library"
- Product images/attachments
- Per-customer or per-region pricing tiers (currently one `defaultPrice` only)
- ~~Stock/inventory linkage once an Inventory module exists~~ — closed 2026-08-18, see "Stock" above (a lightweight on-hand-quantity ledger tied to Accounting's IV workflow, not a full standalone Inventory module)
- Bulk/CSV stock import; a dedicated "undo this stock movement" action (see "Stock" above)

## Known Issues

- None currently open. An operator-precedence bug in the "sort by status" column comparator was found and fixed during the 2026-07-08 code review (see [CHANGELOG.md](../CHANGELOG.md)).
