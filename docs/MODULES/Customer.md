# Module: Customer

## Status: ⚠️ Schema only (as of 2026-07-09)

No API routes or UI exist yet. As of the 2026-07-09 production-readiness pass, the MongoDB collections **do** exist with real indexes, ahead of the feature — see [DATABASE.md](../DATABASE.md) "Schema-prep collections":
- `customers` — `CustomerFields` (`api/_lib/collections.ts`): companyName, contactName, position, phone, email, address, taxId, source, salesOwnerId, notes, status (active/inactive), createdAt/updatedAt/createdBy/updatedBy, `deletedAt` (real soft-delete — no existing lifecycle flag to reuse, unlike `Product.archived`).
- `customer_contacts` — secondary contacts beyond the primary one on `customers`.

The Dashboard's `totalCustomers` KPI (`GET /api/dashboard`) already queries this collection (`countDocuments({ deletedAt: null })`) — it correctly reads `0` today since nothing writes to `customers` yet, and will start reporting real numbers automatically once this module gets a create path, with no Dashboard changes required.

**Lead vs. Customer decision, resolved 2026-07-09**: the 2026-07-09 spec explicitly asked for both a `customers` and a `leads` collection, which settles the open question below in favor of **two separate collections/entities** (not one entity with a status field). `leads.convertedToCustomerId` is the link between them once a lead is won.

## Purpose (planned)

A proper customer entity — company name, contact name, position, phone, email, address, tax ID, source, sales owner, notes, attachments, status/timeline history — per the original ERP specification. Today, [Quotation.md](./Quotation.md) only stores a free-text `client: string` on each `Quote`, with no customer record behind it at all: the same customer name typed on two different quotes creates no relationship between them, has no shared contact info, and can't be searched/filtered as "all quotes for this customer."

## Business Flow (planned, not built)

1. Customer list: search, advanced filter, sort, pagination, export, responsive table (columns: Customer, Company, Phone, Email, Sales Owner, Status, Last Updated, Created Date).
2. Create/edit customer with the full field set above.
3. Status tracking (New Lead → ... → Won/Lost, shared conceptually with [Lead.md](./Lead.md) — the original spec treats "Lead" and "Customer" as the same underlying entity at different pipeline stages, not two separate tables) with a timeline of status changes, who made them, and notes.
4. Quotations reference a Customer record instead of a free-text name.

## Pages / Components / APIs / Permissions

None exist yet. When this module is built:
- Follow the established pattern: `src/lib/customers.ts` + `src/pages/customers/`, mirroring `src/lib/products.ts` + `src/pages/products/`.
- Update `Quotation`'s `client: string` field to reference a customer ID once this exists — this is a breaking change to the `Quote` type, coordinate with [Quotation.md](./Quotation.md) and [DATABASE.md](../DATABASE.md).
- The empty-state copy for this page ("No customers have been created.") is already decided (see [TODO.md](../TODO.md) i18n follow-up) but not yet implemented since the page doesn't exist.

## Database Tables

`customers`, `customer_contacts` — schema/indexes only, see Status above and [DATABASE.md](../DATABASE.md).

## Current Features

None (schema only — see Status above).

## Future Improvements

Build API routes + UI on top of the existing schema. See [TODO.md](../TODO.md) High Priority.

## Known Issues

N/A — nothing to have issues with yet (schema-only, no live code path touches these collections besides the Dashboard's read-only count).
