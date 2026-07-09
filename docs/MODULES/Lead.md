# Module: Lead

## Status: ⚠️ Schema only (as of 2026-07-09)

No API routes or UI exist yet. As of the 2026-07-09 production-readiness pass, the MongoDB collections **do** exist with real indexes, ahead of the feature — see [DATABASE.md](../DATABASE.md) "Schema-prep collections":
- `leads` — `LeadFields` (`api/_lib/collections.ts`): companyName, contactName, position, phone, email, address, taxId, source, salesOwnerId, notes, `stage` (9-value `LeadStage` union, see below), `convertedToCustomerId`, createdAt/updatedAt/createdBy/updatedBy, `deletedAt`.
- `lead_activities` — append-only timeline (stage_change/note/call/email/meeting), no `updatedAt`/`deletedAt` — same immutable-event-log shape as `audit_log`.

The 9-stage pipeline is implemented as the `LeadStage` type: ลูกค้าใหม่ (New) → ติดต่อแล้ว (Contacted) → ติดตามผล (Follow Up) → สนใจ (Interested) → รอใบเสนอราคา (Waiting Quotation) → ส่งใบเสนอราคาแล้ว (Quotation Sent) → เจรจาต่อรอง (Negotiation) → ปิดการขายสำเร็จ/เสียโอกาส (Won/Lost).

The Dashboard's `totalLeads` KPI (`GET /api/dashboard`) already queries this collection — correctly `0` today, will report real numbers once this module has a create path, no Dashboard changes needed.

## Purpose (planned)

Track prospective customers through the sales pipeline above, per the original ERP specification. Distinct from [Customer.md](./Customer.md) (converted/won leads — see that file for the 2026-07-09 "two separate collections" resolution) and from [Quotation.md](./Quotation.md) (which currently only stores a free-text client name with no lead/customer relationship at all).

## Business Flow (planned, not built)

1. Create a lead: company name, contact name, position, phone, email, address, tax ID, source (Website/Facebook/Google/Referral/Walk-in/Sales Team/Other), sales owner, notes, attachments.
2. Track status changes over time with a history/timeline (who changed it, when, why).
3. Convert a won lead into a Customer record.
4. Feed the Dashboard's sales-pipeline funnel visualization and lead-source breakdown (neither exists today — Dashboard's charts are all static sample data, see [Dashboard.md](./Dashboard.md)).

## Pages / Components / APIs / Permissions

None exist yet. When this module is built, follow the established pattern: `src/lib/leads.ts` (types + persistence, mirroring `src/lib/products.ts` — no seed/sample data, per the "zero business data by default" convention) and `src/pages/leads/` (`LeadsPage.tsx` as the view-switching container, following `ProductsPage.tsx`'s structure). Update [ARCHITECTURE.md](../ARCHITECTURE.md), [API.md](../API.md), and this file once it exists. The empty-state copy ("No leads available.") is already decided but not yet implemented since the page doesn't exist.

## Database Tables

`leads`, `lead_activities` — schema/indexes only, see Status above and [DATABASE.md](../DATABASE.md).

## Current Features

None (schema only — see Status above).

## Future Improvements

Build API routes + UI on top of the existing schema, then wire the Dashboard's sales-pipeline funnel / lead-source breakdown once there's real data to visualize. See [TODO.md](../TODO.md) High Priority.

## Known Issues

N/A — nothing to have issues with yet (schema-only, no live code path touches these collections besides the Dashboard's read-only count).
