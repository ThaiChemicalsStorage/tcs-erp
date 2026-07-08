# Module: Lead

## Status: ❌ Not Implemented

No code for this module exists anywhere in the repository. This file is a placeholder describing what was originally scoped, so a future session knows this is planned work, not a forgotten feature.

## Purpose (planned)

Track prospective customers through a sales pipeline (New Lead → Contacted → Follow Up → Interested → Waiting Quotation → Quotation Sent → Negotiation → Won/Lost), per the original ERP specification. Distinct from [Customer.md](./Customer.md) (converted/won leads) and from [Quotation.md](./Quotation.md) (which currently only stores a free-text client name with no lead/customer relationship at all).

## Business Flow (planned, not built)

1. Create a lead: company name, contact name, position, phone, email, address, tax ID, source (Website/Facebook/Google/Referral/Walk-in/Sales Team/Other), sales owner, notes, attachments.
2. Track status changes over time with a history/timeline (who changed it, when, why).
3. Convert a won lead into a Customer record.
4. Feed the Dashboard's sales-pipeline funnel visualization and lead-source breakdown (neither exists today — Dashboard's charts are all static sample data, see [Dashboard.md](./Dashboard.md)).

## Pages / Components / Database Tables / APIs / Permissions

None exist. When this module is built, follow the established pattern: `src/lib/leads.ts` (types + seed data + persistence, mirroring `src/lib/products.ts`) and `src/pages/leads/` (`LeadsPage.tsx` as the view-switching container, following `ProductsPage.tsx`'s structure). Update [ARCHITECTURE.md](../ARCHITECTURE.md), [DATABASE.md](../DATABASE.md), and this file once it exists.

## Current Features

None.

## Future Improvements

Build the module. See [TODO.md](../TODO.md) High Priority.

## Known Issues

N/A — nothing to have issues with yet.
