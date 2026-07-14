# Module: Customer

## Status: ✅ Built (2026-07-14)

Customer master data — who a quotation is issued *to* — is now a real, wired module: admin CRUD
page, API routes, permissions, and a selector on the Quotation form that autofills the Customer
Information section from a saved record. This redefines the earlier (2026-07-09) schema-only
`CustomerFields` shape described in a prior version of this doc — that shape had zero API
routes/UI/live data, so this is a clean redefinition, not a migration. See "Field shape change"
below for exactly what changed.

**Built as a correction**: a 2026-07-13 pass added a [Company Profiles](./CompanyProfiles.md)
module and wired it into the Quotation form as an "issuer company" selector — that was built
against a misunderstanding of the actual requirement. This ERP only ever issues quotations under a
single company identity; the real, correct requirement was always a **Customer** selector, built
here on 2026-07-14. The issuer-company UI/wiring has been fully removed from the Quotation form —
see [CompanyProfiles.md](./CompanyProfiles.md) "Correction (2026-07-14)" and
[Quotation.md](./Quotation.md) "Customer Selection."

## Purpose

Save a customer/company's information once, then pick it from the Quotation form's Customer
selector instead of retyping the same company name/contact/phone/email/address/tax ID on every new
quote. Distinct from [Company Profiles](./CompanyProfiles.md), which is the single company's *own*
identity (who issues documents), not a customer.

## Business Flow

1. **Admin page** (`src/pages/customers/CustomersPage.tsx`, nav "ลูกค้า"): search by company
   name/contact/phone/email/tax ID, filter active/inactive, a "show archived" toggle (archived
   customers hidden by default, same convention as Company Profiles/Products). Row actions:
   Edit, Activate/Deactivate, Archive/Restore — individually permission-gated.
2. **Create/Edit** ("เพิ่มข้อมูลลูกค้า" / edit icon): a single modal form —
   companyName* (only required field), contactName, phone, email, address, taxId, deliveryMethod,
   projectName, deliveryAddress, an Active toggle. Deliberately one flat section (unlike Company
   Profiles' 6-section form) since a Customer record has far fewer fields and no
   logo/bank-account/multi-section complexity.
3. **Activate/Deactivate**: toggles `isActive` — an inactive customer stays visible to admins but
   drops out of the Quotation form's selector (which only ever offers active, non-deleted
   customers).
4. **Archive/Restore**: toggles `isDeleted` — this module's only "delete," always reversible, same
   precedent as Company Profiles/Categories/Job Types (no hard-delete route).
5. **Quotation form integration** (`src/pages/quotation/CustomerSelector.tsx`, see
   [Quotation.md](./Quotation.md) "Customer Selection" for the full flow): search-and-pick,
   autofills the Customer Information fields, remains freely editable afterward, never writes back
   to the Customer master record. `customerId`/`customerSnapshot` are saved on the quote.
6. **Empty state**: if zero customers exist, the list shows "ยังไม่มีข้อมูลลูกค้า" with an
   "เพิ่มข้อมูลลูกค้า" button (hidden if the viewer lacks `customers:create`) — no fake/sample
   customer data ever appears.

## Field shape change (2026-07-14)

The pre-2026-07-09-pass `CustomerFields` (a CRM-flavored draft: `position`, `source`,
`salesOwnerId`, `notes`, `status: "active"|"inactive"`, `deletedAt: string|null`) is replaced by a
shape matching exactly what the Quotation form's Customer Information section collects:

```ts
interface Customer {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  projectName: string;
  deliveryAddress: string;
  isActive: boolean;
  isDeleted: boolean;   // matches CompanyProfile's isActive/isDeleted convention, not status/deletedAt
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}
```

No live data existed under the old shape (zero API routes, zero UI, zero writes anywhere except the
Dashboard's read-only `totalCustomers` count), so no migration script was needed — this is a
from-scratch redefinition of an unused collection. `customer_contacts` (secondary contacts) remains
schema-only, untouched by this pass — not needed for the single-contact-per-customer shape above.

## Pages / Components / APIs / Permissions

- `src/pages/customers/CustomersPage.tsx` — list + modal create/edit form, single file (see
  Business Flow above for why this is simpler than Company Profiles' 3-file split).
- `src/pages/quotation/CustomerSelector.tsx` — the Quotation-form search-and-pick control.
- `src/lib/customers.ts` — `Customer`/`CustomerDraft`/`CustomerSnapshot` types + `fetchCustomers()`/
  `createCustomer()`/`updateCustomer()`/`setCustomerArchived()`.
- API: `GET/POST /api/customers`, `GET/PATCH /api/customers/:id`, `POST /api/customers/:id/archive`
  — see [API.md](../API.md) "Customers." **Shares the `company-profiles` serverless function file**
  rather than getting its own — Vercel Hobby's 12-function cap was already reached; see
  [ARCHITECTURE.md](../ARCHITECTURE.md).
- Permissions: `customers:view/create/edit/archive` — Administrator gets all four by default; Sales
  User gets view/create/edit (no archive); Approver 1/2/Viewer get view-only. Not Super-Admin-locked
  (matches the Company Profiles precedent) — see [RBAC.md](../RBAC.md).

## Database Tables

`customers` — see [DATABASE.md](../DATABASE.md) "`Customer`" for the full field shape and index
list. `customer_contacts` remains schema-only/unused.

## Current Features

- Full CRUD (create/edit/activate-deactivate/archive-restore) via a dedicated admin page
- Server-side validation (`api/_lib/customerValidation.ts`) — only `companyName` is required
- Server-authoritative audit logging (`"ลูกค้า"` module — Created/Updated/Archived/Restored)
- Quotation-form integration: search-and-select autofill, `customerId`/`customerSnapshot` persisted
  on the quote, Draft-only customer changes on an existing quote
- Only active, non-deleted customers are offered in the Quotation selector

## Future Improvements

- "บันทึกเป็นลูกค้าใหม่" — save a manually-typed Customer Information section as a new Customer
  record, inline from the Quotation form. Explicitly flagged as optional/future in the original
  requirement ("do not add unless simple and safe") — not built this pass.
- `customer_contacts` (multiple contacts per customer) remains unbuilt — today's `Customer` has a
  single contactName/phone/email, matching what the Quotation form actually needs.
- No server-side search/pagination on `GET /api/customers` — the admin list and the Quotation
  selector both fetch the full (permission-scoped) list once and filter/search client-side, same
  convention as Company Profiles/Products. Acceptable at today's real scale.

## Known Issues

N/A — no reported defects since this pass shipped.
