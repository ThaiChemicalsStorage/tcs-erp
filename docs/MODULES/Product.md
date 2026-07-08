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

None (no real DB) — see [DATABASE.md](../DATABASE.md) for the current `Product`/`ProductCategory` TypeScript shapes and their `localStorage` keys (`tcs_erp_products`, `tcs_erp_categories`) — this is the one module (besides Company/User) where data actually survives a page reload today.

## APIs

None — see [API.md](../API.md).

## Permissions

None — see [RBAC.md](../RBAC.md). Every signed-in user has full CRUD access.

## Current Features

- Full CRUD, category management, archive vs. permanent delete with confirmation, duplicate
- Search (code/name), category filter, sortable columns, pagination
- Seeded with 7 sample chemical-storage-relevant products across 7 categories (Materials/Equipment/Services/Labor/Installation/Software/Hardware → วัสดุ/อุปกรณ์/บริการ/ค่าแรง/การติดตั้ง/ซอฟต์แวร์/ฮาร์ดแวร์)
- Quotation picker integration with verified snapshot independence

## Future Improvements

- Bulk import/export (CSV) — not requested yet, but a natural fit for a "product library"
- Product images/attachments
- Per-customer or per-region pricing tiers (currently one `defaultPrice` only)
- Stock/inventory linkage once an Inventory module exists

## Known Issues

- None currently open. An operator-precedence bug in the "sort by status" column comparator was found and fixed during the 2026-07-08 code review (see [CHANGELOG.md](../CHANGELOG.md)).
