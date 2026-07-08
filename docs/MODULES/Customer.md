# Module: Customer

## Status: ❌ Not Implemented

No code for this module exists anywhere in the repository. This file is a placeholder describing what was originally scoped, so a future session knows this is planned work, not a forgotten feature.

## Purpose (planned)

A proper customer entity — company name, contact name, position, phone, email, address, tax ID, source, sales owner, notes, attachments, status/timeline history — per the original ERP specification. Today, [Quotation.md](./Quotation.md) only stores a free-text `client: string` on each `Quote`, with no customer record behind it at all: the same customer name typed on two different quotes creates no relationship between them, has no shared contact info, and can't be searched/filtered as "all quotes for this customer."

## Business Flow (planned, not built)

1. Customer list: search, advanced filter, sort, pagination, export, responsive table (columns: Customer, Company, Phone, Email, Sales Owner, Status, Last Updated, Created Date).
2. Create/edit customer with the full field set above.
3. Status tracking (New Lead → ... → Won/Lost, shared conceptually with [Lead.md](./Lead.md) — the original spec treats "Lead" and "Customer" as the same underlying entity at different pipeline stages, not two separate tables) with a timeline of status changes, who made them, and notes.
4. Quotations reference a Customer record instead of a free-text name.

## Pages / Components / Database Tables / APIs / Permissions

None exist. When this module is built:
- Decide whether Lead and Customer are one entity with a status field (matches the original spec's framing) or two related entities — this decision should be made and documented here before implementation starts.
- Follow the established pattern: `src/lib/customers.ts` + `src/pages/customers/`, mirroring `src/lib/products.ts` + `src/pages/products/`.
- Update `Quotation`'s `client: string` field to reference a customer ID once this exists — this is a breaking change to the `Quote` type, coordinate with [Quotation.md](./Quotation.md) and [DATABASE.md](../DATABASE.md).

## Current Features

None.

## Future Improvements

Build the module. See [TODO.md](../TODO.md) High Priority.

## Known Issues

N/A — nothing to have issues with yet.
