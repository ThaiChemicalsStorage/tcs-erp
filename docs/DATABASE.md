# Database

## Current State: MongoDB Atlas (real database, live)

As of 2026-07-09 this project has a **real database**: MongoDB Atlas (free-tier M0 cluster), accessed exclusively from the Vercel Serverless Functions backend (`api/`) via a singleton connection per warm serverless instance (`api/_lib/mongodb.ts`). The frontend never talks to MongoDB directly — it calls the REST API (see [API.md](./API.md)), which reads/writes these collections. `MONGODB_URI` lives only in Vercel environment variables (production/preview/development), never committed to the repo.

This supersedes the pre-2026-07-09 `localStorage`-only persistence described lower in this file's Migration Notes — that description is now historical (it documents what the client-side shapes looked like before the migration, useful context for how each collection got its current shape) rather than current state.

### MongoDB collections

| Collection | `_id` | Shape | Notes |
|---|---|---|---|
| `users` | MongoDB `ObjectId` | server-only `UserFields` (see below) | Includes `passwordHash` — never sent to the client. `toPublicUser()` (`api/_lib/collections.ts`) strips it before any response. |
| `roles` | `key: string` (e.g. `"super_admin"`, or `"role_<ObjectId>"` for custom roles) | `Role` (unchanged shape from the old client-side type) | Seeded from `defaultRoles` (`src/lib/roles.ts`) via `api/_lib/rbacSeed.ts` on first run (`seedDefaultRolesIfEmpty()`), called from the Setup Wizard and from `GET /api/roles`. |
| `company` | fixed string `"singleton"` | `Company` (unchanged shape) | Always exactly one document; `GET /api/company` falls back to `defaultCompany` merged with the stored doc if it doesn't exist yet. |
| `products` | MongoDB `ObjectId` | `Product` minus `id` (Mongo `_id` takes its place) | `withStringId()` maps `_id` → `id: string` for the client response. |
| `categories` | MongoDB `ObjectId` | `ProductCategory` minus `id` | Same `withStringId()` mapping. |
| `notifications` | MongoDB `ObjectId` | `Notification` minus `id` | `GET /api/notifications` filters server-side to `recipientUserId === <the caller>` — the collection holds every user's notifications, but a user can only ever read their own via the API. |
| `audit_log` | MongoDB `ObjectId` | `AuditLogEntry` minus `id` | `POST /api/audit-log` always derives `userId`/`userName`/`roleName` from the authenticated session, never trusting those fields from the request body. |
| `quotes` | **the business ID string itself** (e.g. `"QT-2567-0041"`), not an `ObjectId` | `Quote` minus `id` (the business ID is `_id`) | `nextQuoteId()` in `api/handlers/quotes.ts` scans existing `_id`s to compute the next sequence number. |
| `job_types` | MongoDB `ObjectId` | `code: string; name: string; isActive: boolean` + audit fields | **Added 2026-07-10** for the Executive Dashboard/CRM pass — Job Type master data, one per quotation. See "Job Type" entity section below. |
| `company_profiles` | MongoDB `ObjectId` | *(unused — see below)* | Orphaned. Built 2026-07-13 for the now-removed Company Profiles module; **no code reads or writes this collection anymore** as of 2026-07-14, but any existing documents were deliberately left in place (no destructive cleanup) — see [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) and "`CompanyProfile`" below. |
| `customers` | MongoDB `ObjectId` | `Customer` minus `id` (see below) | **Redefined + wired 2026-07-14** — customer master data, selected on the Quotation form to autofill the Customer Information section. Has its own dedicated `api/handlers/customers.ts` serverless function (previously shared `company-profiles.ts`'s function slot; that file was deleted 2026-07-14 along with the rest of the Company Profiles module, freeing the slot) — see [ARCHITECTURE.md](./ARCHITECTURE.md) "Serverless function count." |
| `dashboard` (virtual — no collection) | — | — | `GET /api/dashboard` (`api/dashboard/index.ts`) is a read-only aggregation over `customers`/`leads`/`quotes`/`products`/`categories`/`audit_log`/`notifications`/`job_types`-derived fields already embedded on `quotes` — it doesn't own or write any collection of its own. See Dashboard KPI section below and [MODULES/Dashboard.md](./MODULES/Dashboard.md) for the full breakdown. |

### Schema-prep collections (added 2026-07-09, mostly not wired to routes/UI yet)

Per the 2026-07-09 production-readiness pass, every collection below exists with real indexes ahead of the feature that will use it (`api/_lib/collections.ts`), seeded where noted (`api/_lib/systemSeed.ts`, called once from the Setup Wizard alongside `seedDefaultRolesIfEmpty()`). **None of these have API routes or UI built on top of them yet** except where called out — they're schema/index scaffolding only, so that future features don't start from an empty, un-indexed collection.

| Collection | Purpose | Seeded? | Indexes |
|---|---|---|---|
| `permissions` | Mirrors `ALL_PERMISSIONS` (`src/lib/permissions.ts`) as documents — forward-looking scaffolding for an eventual admin-configurable permission registry. RBAC still checks the hardcoded TS union, **not** this collection. | Yes, from `ALL_PERMISSIONS`/`PERMISSION_LABELS`/`PERMISSION_GROUPS`/`SUPER_ADMIN_ONLY_PERMISSIONS` | `{ key: 1 }` unique |
| `sessions` | Scaffolding for future "log out other devices" / session revocation. Nothing writes to it — auth is still pure-JWT (`api/_lib/auth.ts`), unchanged. | No | `{ userId: 1 }`, TTL index `{ expiresAt: 1 }` (`expireAfterSeconds: 0`, auto-purges) |
| `departments` | Org unit list. **Not** wired into `User.department` (still free text, unchanged — see `User` below). | Yes, generic starter list (ฝ่ายขาย, ฝ่ายจัดซื้อ, ฝ่ายคลังสินค้า, ฝ่ายบัญชี, ฝ่ายทรัพยากรบุคคล, ฝ่ายบริหาร, ฝ่ายไอที) — rename/manage via a future admin UI | `{ code: 1 }` unique |
| `positions` | Position/level list. **Not** wired into `User.position` (still free text, unchanged). | Yes, generic starter list (พนักงาน, หัวหน้างาน, ผู้จัดการ, ผู้จัดการทั่วไป, กรรมการผู้จัดการ) | `{ code: 1 }` unique |
| `customer_contacts` | Secondary contacts beyond a customer's primary contact — **still schema-only**, no API/UI (unrelated to the 2026-07-14 `customers` rewrite below, which uses `Quote`'s own single-contact shape instead of this table). | No | `{ customerId: 1 }` |
| `leads` | CRM lead/pipeline record, 9-stage `LeadStage` (ลูกค้าใหม่ → ... → ปิดการขายสำเร็จ/เสียโอกาส), `convertedToCustomerId` link. Resolves the open "Lead vs Customer: one entity or two?" question from `MODULES/Customer.md`/`Lead.md` — this pass builds them as **two separate collections**. `GET /api/dashboard`'s `totalLeads` KPI counts this. | No | `{ salesOwnerId: 1 }`, `{ stage: 1 }`, `{ deletedAt: 1 }` |
| `lead_activities` | Append-only lead timeline (stage changes, notes, calls, emails, meetings) — same immutable-event-log shape as `audit_log`/embedded `approvalHistory`, no `updatedAt`/`deletedAt`. | No | `{ leadId: 1, createdAt: -1 }` |
| `product_templates` | Reusable presets for fast product creation, independent of the live `products` catalog. **Semantics not fully settled** — treat as a starting interpretation, confirm before building UI against it. | No | `{ categoryId: 1 }`, `{ isActive: 1 }` |
| `quotation_comments` | General discussion thread on a quote — distinct from `approvalHistory` (which is transition-specific, not freeform). | No | `{ quoteId: 1, createdAt: 1 }` |
| `quotation_tags` | Quote-level tag *registry* (name + color) — distinct from the existing embedded per-line `QuoteLine.tags` (free chip strings). | No | `{ name: 1 }` unique |
| `notification_types` | Mirrors the hardcoded `NotificationType` union (`src/lib/notifications.ts`) as documents — same "scaffolding, not read by any live code path" treatment as `permissions`. | Yes | `{ key: 1 }` unique |
| `system_settings` | Singleton (`_id: "singleton"`, like `company`) — application config (`defaultPageSize`, `maintenanceMode`, `sessionDurationDays`), distinct from `company`'s business identity. Defaults mirror current hardcoded behavior (`sessionDurationDays: 7` matches `SESSION_DAYS` in `api/_lib/auth.ts`) so future wiring is a no-op migration — nothing reads from this collection yet. | Yes (upsert-once) | none beyond default `_id` |
| `uploads` | Forward-looking scaffolding for real blob storage. Nothing writes to it today — every current upload (logo/stamp/profile picture/signature) is inline base64 on its parent document (see `Company`/`User` below); that has a practical 16MB Mongo document ceiling, tracked in TODO.md. | No | `{ uploadedByUserId: 1 }`, `{ purpose: 1 }` |
| `attachments` | Polymorphic file-to-entity link (`entityType`/`entityId` → `uploadId`), for when `uploads` is wired up. | No | `{ entityType: 1, entityId: 1 }` |

**Deliberately not built as separate collections** (decisions recorded here per the prod-readiness spec's request for `quotation_items`/`quotation_approvals`/`quotation_status_history`):
- **`quotation_items`** — stays embedded as `Quote.lines` (`QuoteLine[]`). Always read/written together with its parent quote (every render, every edit); extracting it would touch `LineItemsEditor.tsx`, `computeTotals()`, and the handler's field-whitelisting logic for no clear benefit.
- **`quotation_approvals`** — stays embedded as `Quote.approvalHistory`. Same reasoning: always read together with its parent, small/bounded array.
- **`quotation_status_history`** — not built at all, **redundant with `approvalHistory`**: every workflow action already records a status transition (`workflowTransitions[action].to` in `api/_lib/quoteWorkflow.ts`), so `approvalHistory` already *is* the complete status history.

### What does NOT persist server-side (in-memory only, resets on reload)

- Everything that's plain component `useState` (which view is open, form drafts before Save, UI toggles like "show archived", the notification-panel open/closed state). This is unchanged by the backend migration — it was always ephemeral UI state, never meant to persist.

## Entity Descriptions (current, real shapes)

These map closely onto the pre-migration client-side TypeScript shapes — most fields are unchanged. Differences from the old `localStorage`-era shapes are called out per entity below.

### `Company` (`src/lib/storage.ts`)
```ts
interface Company {
  name: string;
  address: string;
  phone: string;
  email: string;
  taxId: string;
  logoDataUrl: string;   // base64 data URL, "" if none, 1MB client-side cap
  stampDataUrl: string;  // base64 data URL, "" if none, 1MB client-side cap
  vatRate: number;               // editable, NOT yet read by computeTotals() — see TODO.md
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranch: string;
  termsAndConditions: string;    // default value for the quotation remarks textarea when set
  updatedAt: string;              // ISO datetime, added 2026-07-09 — set server-side on every PUT
  updatedBy: string;              // → User.id, added 2026-07-09 — set server-side, not client-writable
}
```
Single record (not a list) — there is only ever one company, matching this app's single-company (not multi-tenant) design. Editable only by Super Admin (`company:manage`, hardcoded — see [RBAC.md](./RBAC.md)). `logoDataUrl`/`stampDataUrl` are rendered into the quotation PDF header/signature block — see [MODULES/Quotation.md](./MODULES/Quotation.md). If `logoDataUrl` is empty, quote/print headers and the app's own branding (sidebar/login/loading/favicon) fall back to the static official logo (`public/logo.png`, via `components/BrandMark.tsx`) — see ARCHITECTURE.md/UI_GUIDELINES.md.

### `User` (`src/lib/users.ts`, client-facing) / `UserFields` (`api/_lib/collections.ts`, server-only storage schema)
```ts
type UserStatus = "active" | "inactive";

// Client-facing type — src/lib/users.ts. Never includes a password field.
interface User {
  id: string;             // Mongo _id.toString()
  employeeId: string;      // enforced unique
  fullName: string;
  username: string;        // enforced unique, used for login
  email: string;           // enforced unique, used for login
  phone: string;
  department: string;      // free text, suggestions only
  position: string;        // free text, suggestions only — deliberately independent of roleKey
  roleKey: string;         // → Role.key
  status: UserStatus;
  profilePictureDataUrl: string;
  signatureDataUrl: string;    // rendered on quotations this user prepared/approved
  createdAt: string;
  updatedAt: string;
}

// Server-only DB storage schema — api/_lib/collections.ts. UserFields = Omit<User, "id"> & { passwordHash: string }.
// toPublicUser() strips passwordHash and maps _id -> id before any response reaches the client.
```
`passwordHash` is a **real bcrypt hash** (`bcryptjs`, cost 10) — the old client-side `hashPassword()` non-cryptographic checksum function is gone entirely, deleted, not just deprecated. `User[]` (a MongoDB collection now, not a `localStorage` array) is real multi-account support. The "current user" is real React state in `App.tsx` (`currentUser`), populated on boot from `GET /api/auth/session` and kept in sync via `updateUsers`/`updateCurrentUser` — no longer derived via `.find()` against a separately-tracked session id.

### `Role` (`src/lib/roles.ts`) / `Permission` (`src/lib/permissions.ts`)
```ts
type Permission =
  | "dashboard:view"
  | "quotations:view" | "quotations:create" | "quotations:edit" | "quotations:delete"
  | "quotations:approve" | "quotations:reject" | "quotations:export"
  | "products:view" | "products:create" | "products:edit" | "products:delete" | "products:export"
  | "users:manage" | "roles:manage" | "company:manage" | "auditLog:view";

interface Role {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSuperAdmin: boolean;  // bypasses every permission check
  isSystem: boolean;      // built-in (Super Admin/Administrator) — undeletable, read-only permission matrix
}
```
6 default roles ship in `defaultRoles` (`src/lib/roles.ts`), seeded into the `roles` MongoDB collection on first run by `api/_lib/rbacSeed.ts`'s `seedDefaultRolesIfEmpty()`; admins can add custom ones (`key: "role_<ObjectId>"`). `roles:manage`/`company:manage` cannot be granted to any role but the Super Admin role itself (`isPermissionLockedToSuperAdmin()`), enforced both client-side (UI) and server-side (`api/handlers/roles.ts` filters these out of any create/edit payload).

### `Notification` (`src/lib/notifications.ts`)
```ts
type NotificationType =
  | "quotation_submitted" | "quotation_approved" | "quotation_rejected"
  | "quotation_high_value" | "quotation_customer_accepted" | "quotation_customer_rejected";

interface Notification {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  description: string;
  module: string;
  relatedQuoteId?: string;
  createdAt: string;
  read: boolean;
}
```
All notifications (for every user) live in one `notifications` collection, but `GET /api/notifications` filters **server-side** to `recipientUserId === <the authenticated caller>` — a genuine improvement over the pre-migration behavior, where the client held every user's notifications in memory and only filtered client-side for display (a real, if low-stakes, data exposure). Notification creation now only happens inside `api/handlers/quotes.ts`'s workflow handler, as a side effect of a status transition (querying `users`/`roles` server-side to determine recipients) — there is deliberately no generic "create notification for arbitrary user" endpoint, to prevent spam/spoofing. Index added 2026-07-09: `{ recipientUserId: 1, createdAt: -1 }`, serving both the filter and the feed sort order (was previously an unindexed `find`).

### `AuditLogEntry` (`src/lib/auditLog.ts`)
```ts
interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  module: string;
  action: string;
  details: string;
  createdAt: string;
  relatedQuoteId?: string;              // added 2026-07-13, seventh same-day pass
  relatedCustomerName?: string;         // added 2026-07-13, seventh same-day pass
  relatedCompanyProfileId?: string;     // orphaned field — see below
  relatedCompanyProfileName?: string;   // orphaned field — see below
}
```
Append-only — `logAudit()` has no corresponding update/delete function, so there is no code path to alter history from the UI (including for Super Admin). `POST /api/audit-log` (`api/audit-log/index.ts`) always derives `userId`/`userName`/`roleName` from the authenticated session server-side, never trusting those fields from the request body — a genuine integrity improvement over the pre-migration `localStorage` array, where a client could have written an entry claiming to be any user. Index added 2026-07-09: `{ createdAt: -1 }` (was previously an unindexed `find().sort().limit(1000)`). Index added 2026-07-13 (seventh same-day pass): `{ action: 1, createdAt: -1 }`, serving the Sales Activity Analytics query (now scans all 5 tracked `action` values, commonly with no `userName` filter — "All Sales" selected — which the existing `{ userName: 1, createdAt: -1 }` index can't serve alone).

`relatedCompanyProfileId`/`relatedCompanyProfileName` (added 2026-07-13, tenth same-day pass) are **orphaned as of 2026-07-14** — they were only ever written by `writeCompanyProfileAuditEntry()` inside the now-deleted `api/handlers/company-profiles.ts` (see [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) "Removed"). Nothing writes them anymore; kept on the type only so the historical `audit_log` entries that already have them still type-check and render without special-casing. `POST /api/audit-log` still rejects the `"โปรไฟล์บริษัท"` module outright (prevents a client from forging *new* entries for a module that no longer exists) — same lockout pattern as `"ใบเสนอราคา"`.

`relatedQuoteId`/`relatedCustomerName` (2026-07-13, seventh same-day pass): optional structured fields, set only by `writeQuoteAuditEntry()` (`api/handlers/quotes.ts`) on quote-workflow entries (Created/Updated/Duplicated/every workflow transition) — the quotation number and customer name were already present in the entry's free-text `details` string, but the Dashboard's Recent Activity table needs them as real fields to render as a clickable link/column instead of parsing prose. Backward-compatible: older entries and every non-quote module (Users/Roles/Settings/Login) simply lack these fields, and `ActivityTimeline.tsx` renders "—" when absent.

### `Product` / `ProductCategory` (`src/lib/products.ts`)
```ts
interface ProductCategory {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;       // ISO datetime, added 2026-07-09
  updatedAt: string;       // ISO datetime, added 2026-07-09
  createdBy: string;       // → User.id, added 2026-07-09
  updatedBy: string;       // → User.id, added 2026-07-09
}

interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string;      // → ProductCategory.id
  unit: string;
  defaultPrice: number;
  description: string;
  specifications: string;
  archived: boolean;       // the soft-delete flag — no separate deletedAt field
  createdAt: string;       // ISO datetime
  updatedAt: string;       // ISO datetime
  createdBy: string;       // → User.id, added 2026-07-09
  updatedBy: string;       // → User.id, added 2026-07-09
}
```
Indexes added 2026-07-09: `products` gets `{ categoryId: 1 }` and `{ archived: 1 }`; `categories` gets `{ name: 1 }` (non-unique — existing data wasn't verified duplicate-free before adding it, so it's not enforced as a constraint).

### `JobType` (`src/lib/jobTypes.ts`) — added 2026-07-10

```ts
interface JobType {
  id: string;
  code: string;     // e.g. "TA", "STA", "OTHER" — the value stored on Quote.jobTypeCode
  name: string;
  isActive: boolean; // soft-deactivate only, same pattern as ProductCategory.archived
  createdAt: string;
  updatedAt: string;
  createdBy: string;  // → User.id
  updatedBy: string;  // → User.id
}
```
Master data for classifying every quotation by the kind of work it represents. Seeded with 13 defaults on first use (`DEFAULT_JOB_TYPES` in `api/_lib/systemSeed.ts`: TA, STA, LI, SC, BF, GA, BI, VT, WTP, OTHER TA, OTHER SC, OTHER BF, OTHER) via `seedJobTypesIfEmpty()`. Unlike the other 2026-07-09 seed functions, this one is **also** called defensively from `GET /api/jobtypes` itself (not only from the Setup Wizard's one-time bootstrap) — since `ensureIndexes()`/seeding only run from `handleSetup()`, which is permanently blocked once any user exists, a collection added after the production database was already provisioned needs its own self-healing seed path, following the same precedent `GET /api/roles` already uses for `seedDefaultRolesIfEmpty()`. `POST`/`PATCH /api/jobtypes` require `company:manage` (Super Admin only, matching the "company-wide configuration data" precedent used for bank/VAT/T&C settings); `GET` only requires `quotations:view`. No new `Permission` was added — see [RBAC.md](./RBAC.md).

`Quote.jobTypeCode`/`jobTypeName` are a **snapshot**, not a live reference — same rationale as `QuoteLine` never referencing `Product` live: renaming a Job Type later must not rewrite historical quotes.

### `CompanyProfile` — REMOVED 2026-07-14

The `CompanyProfile`/`BankAccount` client types (`src/lib/companyProfiles.ts`), the
`CompanyProfileFields` server type and `companyProfilesCollection()` accessor
(`api/_lib/collections.ts`), and every route/index/invariant that used to be documented in this
section were deleted along with the rest of the Company Profiles module — this ERP only ever needs
one issuer company (Settings → Company Info), so a module for managing several was unused scope.
See [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) for the full removal writeup.

**The `company_profiles` MongoDB collection itself, and any documents already in it, were
deliberately left untouched** — no code reads or writes it anymore, but no destructive database
cleanup was performed as part of this removal. The field shape, default-profile invariant design
(partial unique index on `isDefault`), and index list that used to live in this section are
preserved in git history (`git log -- docs/DATABASE.md`) and in `docs/CHANGELOG.md`'s dated entries
if ever needed for reference against those old documents.

Quote documents saved between 2026-07-13 and 2026-07-14 (the brief window a "Company Profile issues
this quote" feature existed) may still carry a stray, unread `issuerCompanyId`/
`issuerCompanySnapshot` pair — harmless, not backfilled/cleaned up. See TODO.md.

### `Customer` (`src/lib/customers.ts`) — redefined + wired 2026-07-14

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
  isDeleted: boolean;   // soft-delete/archive, same convention as CompanyProfile.isDeleted
  createdAt: string;
  updatedAt: string;
  createdBy: string;    // → User.id
  updatedBy: string;    // → User.id
}
```

Customer master data — who a quotation is issued *to*, selected via the Quotation form's Customer
selector (`src/pages/quotation/CustomerSelector.tsx`) to autofill the Customer Information section
instead of retyping it. Managed via a dedicated admin page (`src/pages/customers/CustomersPage.tsx`,
`customers:view/create/edit/archive` permissions).

**This replaces the earlier (2026-07-09) CRM-flavored `CustomerFields` shape**
(`companyName`/`contactName`/`position`/`phone`/`email`/`address`/`taxId`/`source`/`salesOwnerId`/
`notes`/`status`/`deletedAt`) — that shape had zero API routes/UI/live data (schema-only scaffolding,
per the earlier version of this doc), so this is a clean redefinition, not a migration. The new shape
intentionally mirrors exactly what the Quotation form's Customer Information section collects
(`deliveryMethod`/`projectName`/`deliveryAddress`, not `position`/`source`/`salesOwnerId`/`notes`),
and uses `isActive`/`isDeleted` booleans (matching `CompanyProfile`'s convention) instead of the old
`status: "active"|"inactive"` + `deletedAt: string|null` pair.

Indexes (created defensively inside `api/_lib/customersHandler.ts`, same lazy-on-first-request
pattern as `company_profiles`'/`job_types`' indexes): `{ isDeleted: 1 }`, `{ isActive: 1 }`,
`{ companyName: 1 }`. No seed data — starts empty, per the "no fake customer data" requirement.

**API**: `api/handlers/customers.ts` — its own dedicated serverless function as of 2026-07-14. It
originally (2026-07-14, earlier the same day) shared the `company-profiles` serverless function
(`vercel.json` rewrote `/api/customers[/:path*]` to `/api/handlers/company-profiles`, which checked
the raw pathname first and delegated to `handleCustomers()` before falling through to its own
company-profile path parsing) — Vercel Hobby's 12-function cap was already reached by
`company-profiles.ts` at the time. Once the whole Company Profiles module (including that file) was
removed later the same day, the freed function slot went to giving `customers.ts` its own dedicated
file, which is the thin wrapper it is today (see [ARCHITECTURE.md](./ARCHITECTURE.md)); the actual
logic still lives in `api/_lib/customersHandler.ts`'s `handleCustomers()`, unchanged by either move.

`GET /api/customers` returns every customer to a `customers:view` holder (including archived, for
the admin list's own "show archived" toggle), or just active/non-deleted customers to a caller who
only holds `quotations:create` — the same "manage vs. pick-for-a-quotation" carve-out the
now-removed Company Profiles module established for `companyProfiles:view` vs. that same
permission.

### `Quote` / `QuoteLine` / `SubDetail` (`src/lib/quotes.tsx`)
```ts
type QuoteStatus =
  | "ร่าง"              // Draft
  | "รออนุมัติ"          // Pending Approval
  | "อนุมัติแล้ว"        // Approved
  | "ส่งให้ลูกค้าแล้ว"    // Sent to Customer
  | "ลูกค้ายอมรับ"       // Customer Accepted
  | "ปิดการขายสำเร็จ"    // Won
  | "ลูกค้าปฏิเสธ"       // Customer Rejected
  | "เสียโอกาส"          // Lost
  | "ยกเลิก";            // Cancelled (reachable from Draft/Pending/Approved)
type QuoteInterest = "น่าสนใจ" | "ไม่น่าสนใจ" | null;

type ApprovalAction = "submitted" | "approved" | "rejected" | "sent_to_customer"
  | "customer_accepted" | "customer_rejected" | "marked_won" | "marked_lost" | "cancelled";

interface ApprovalHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  roleName: string;
  action: ApprovalAction;
  comment: string;    // required for rejected/customer_rejected/cancelled, optional otherwise
  createdAt: string;
}

interface SubDetail {
  id: string;
  text: string;
}

interface QuoteLine {
  id: number;
  description: string;
  unit: string;
  qty: number;
  unitPrice: number;
  discount: number;    // line-level discount %
  notes: string;         // multi-line, supports "• " and "1. " prefixes for bullet/numbered rendering
  specifications: string;  // distinct from notes; auto-copied from Product.specifications via the picker
  tags: string[];
  subDetails: SubDetail[];
}

interface Quote {
  id: string;                 // "QT-2567-0041" style, generated by nextQuoteId()
  client: string;
  date: string;                 // display string, not a real Date
  valid: string;                 // display string, not a real Date
  amount: number;                 // snapshot of computed total at last save — VAT-included grand total; no separate pre-tax field is stored, see "Dashboard KPI/chart aggregation" below
  status: QuoteStatus;
  salesperson: string;          // real per-quote field; defaults to the signed-in user's name on new quotes
  interest: QuoteInterest;
  lines: QuoteLine[];
  discount: number;               // quote-level discount %
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  taxId: string;
  deliveryMethod: string;
  deliveryAddress: string;
  project: string;
  poRef: string;
  paymentTerms: string;
  issueDate: string;    // yyyy-mm-dd
  expiryDate: string;   // yyyy-mm-dd
  remarks: string;       // real per-quote field now (see Known Issues below) — defaults to Company.termsAndConditions only for brand-new quotes
  jobTypeCode: string;               // added 2026-07-10, → JobType.code, "" = unclassified (incl. every quote created before this field existed)
  jobTypeName: string;               // added 2026-07-10, snapshot of JobType.name at save time
  isPotentialOpportunity: boolean;   // added 2026-07-10 — sales-marked "likely to close", feeds Dashboard's Expected Sales KPI/forecast
  followUpDate: string;              // added 2026-07-10, yyyy-mm-dd, "" = no follow-up scheduled
  createdByUserId: string;             // → User.id, "" for legacy/seed quotes (any editor treated as owner)
  updatedBy: string;                   // → User.id, added 2026-07-09 — set server-side on every plain edit or workflow action, "" until first edit
  approvalHistory: ApprovalHistoryEntry[];  // append-only
  customerId?: string;                  // added 2026-07-14, → Customer.id; set when a saved customer is selected on the Quotation form
  customerSnapshot?: CustomerSnapshot;  // added 2026-07-14 — server-built copy of the submitted Customer Information fields, never client-constructed; shape below
}

// The frozen-at-save-time copy stored on Quote.customerSnapshot (src/lib/customers.ts) — built
// server-side from the quotation's own Customer Information field values (client/contactName/
// contactPhone/contactEmail/address/taxId/deliveryMethod/project/deliveryAddress), whether they came
// from an autofilled Customer or were typed manually. Field names mirror Customer's own field names.
interface CustomerSnapshot {
  companyName: string; contactName: string; phone: string; email: string; address: string;
  taxId: string; deliveryMethod: string; projectName: string; deliveryAddress: string;
}
```
All document fields below `discount` were hardcoded placeholder text on the form until 2026-07-08 (see [CHANGELOG.md](./CHANGELOG.md)) — they are now real, per-quote, controlled data. Empty ones are auto-hidden in the print/PDF view rather than printing a blank row (see [UI_GUIDELINES.md](./UI_GUIDELINES.md) Print/PDF section). `createdByUserId`/`approvalHistory` were added 2026-07-08 for the approval workflow — see [RBAC.md](./RBAC.md). `contactEmail`/`deliveryMethod`/`deliveryAddress`/`project`/`remarks` were added 2026-07-09 for the print/PDF redesign — `remarks` in particular fixes a latent bug where the "หมายเหตุ / เงื่อนไข" textarea was `defaultValue`-only (uncontrolled, never saved); it's now a real controlled field like the rest. `updatedBy` was added 2026-07-09 for the production-readiness audit-field requirement — deliberately excluded from `QuoteUpdateFields` (the client-writable field set), only ever set server-side from the authenticated session. `customerId`/`customerSnapshot` (added 2026-07-14, replacing the short-lived `issuerCompanyId`/`issuerCompanySnapshot` pair from 2026-07-13) are set by `POST /api/quotes` and (Draft-only, for `customerId` specifically) `PATCH /api/quotes/:id`/`POST /api/quotes/:id/workflow` — see `resolveCustomerIdUpdate()`/`buildCustomerSnapshot()` in `api/handlers/quotes.ts`, and [MODULES/Customer.md](./MODULES/Customer.md).

Indexes added 2026-07-09 (`quotes` had none beyond default `_id` before this): `{ status: 1 }`, `{ createdByUserId: 1 }` (already used for ownership checks), `{ issueDate: 1 }` (needed for the Dashboard's monthly revenue aggregation — see below). Added 2026-07-10: `{ jobTypeCode: 1 }`, `{ salesperson: 1 }`, `{ followUpDate: 1 }`, serving the Dashboard filters/grouping; later the same day, `{ isPotentialOpportunity: 1 }` and `{ client: 1 }` (Expected Sales/forecast filtering and customer-analytics grouping, respectively — both already-hot query paths that had no supporting index). No soft-delete field — the `ยกเลิก` (Cancelled) terminal workflow status already serves that role, so a `createdAt`/`updatedAt`/`isDeleted`/`department` index (all requested by a generic Dashboard index checklist) would be moot: `Quote` has no `createdAt`/`updatedAt` fields (`issueDate`/`date`/`updatedBy` serve that role instead) and no `isDeleted`/`department` field at all (`User.department`, itself free text, is what Dashboard department filtering actually joins against — see below).

**Compound indexes added 2026-07-10 (Codex review, third pass)**: `{ salesperson: 1, issueDate: 1 }`, `{ status: 1, issueDate: 1 }`, `{ followUpDate: 1, status: 1 }`, `{ isPotentialOpportunity: 1, status: 1, expiryDate: 1 }` on `quotes` — every real Dashboard query combines two or more of these fields, which the pre-existing single-field indexes couldn't serve efficiently on their own. Also `audit_log` gained `{ userName: 1, createdAt: -1 }`, supporting the newly filter-aware Activity Timeline query (see below).

**Local-dev index provisioning caveat**: `ensureIndexes()` in `api/_lib/collections.ts` only ever runs from the one-time Setup Wizard bootstrap (`api/handlers/auth.ts`), which is permanently unreachable on an already-provisioned deployment — so any index added there after go-live never actually gets created against a live production database. Every index added in the second and third 2026-07-10 passes is instead created defensively (idempotent `createIndex`, once per warm serverless instance) directly inside `GET /api/dashboard`'s handler — the same pattern `seedJobTypesIfEmpty()` already uses for the same reason (see its comment in `api/_lib/systemSeed.ts`). Any *new* Dashboard-only index should follow this pattern, not `ensureIndexes()`, unless a real re-provisioning path is built.

### `counters` — added 2026-07-10

Backs atomic sequence generation (`nextQuoteId()` in `api/handlers/quotes.ts`), replacing the previous scan-all-`_id`s-then-max+1 approach flagged by the 2026-07-10 Codex review as race-prone under concurrent creates. One document per sequence, keyed by a literal string `_id` (e.g. `"quote_2567"`):
```ts
interface CounterFields {
  _id: string;   // sequence name, e.g. "quote_2567"
  seq: number;
}
```
Lazily bootstrapped from the current max existing `_id` (via `$max`, idempotent under a concurrent-bootstrap race) the first time it's needed after this fix shipped — not backfilled by a migration script, since the bootstrap is self-healing on first use.

### Dashboard KPI/chart aggregation (`GET /api/dashboard`, added 2026-07-09, majorly expanded 2026-07-10, completed against the full business spec later the same day)

Read-only, no collection of its own — see [MODULES/Dashboard.md](./MODULES/Dashboard.md) for the full widget-by-widget breakdown. Key data-model notes:
- Accepts `?from=yyyy-mm-dd&to=yyyy-mm-dd&salesperson=<name|all>&department=<name|all>` query params — `from`/`to` filter against `Quote.issueDate` (lexicographic string comparison), `salesperson` is an exact match against the free-text `Quote.salesperson` field, `department` resolves to the set of `User.fullName` whose `User.department` matches (free-text join — see MODULES/Dashboard.md caveats) and composes with an also-selected `salesperson` via `$and` rather than one silently overwriting the other.
- Almost every section is computed by fetching the filtered `quotes` set **once** (a lean projection — as of 2026-07-14 including `lines`/`discount`, see the pre-tax note below) and reducing it in plain JS, rather than a dozen separate fine-grained aggregation pipelines — deliberate, matching the pre-existing `revenueByMonth`/`categoryBreakdown` post-processing style, and appropriate at this data volume (one internal company's quotations, not big-data scale). Revisit if data volume ever justifies moving this to pure `$group` pipelines or a cache layer.
- **Every monetary total is pre-tax (before VAT)** (2026-07-14, P'Keng/P'Kee requirement; **reworked the same day** to compute from an authoritative source). `Quote.amount` is the persisted VAT-included grand total (see the `amount` field note below) — `Quote` has no separate stored pre-tax/subtotal field, so the before-VAT figure is recomputed directly from each quote's own `lines`/`discount` via the shared `computeQuoteAmountBeforeVat()` (`api/_lib/quoteAmounts.ts`, also used by `api/_lib/quoteValidation.ts` to derive the persisted `amount` on create/edit) — **not** by dividing `amount` back down by a fixed VAT rate, which the first version of this pass did (`preTaxAmount(amount) = amount / 1.07`, since replaced). Applied once to the filtered `docs` array right after fetch — every downstream KPI/pipeline/salesPerformance/customerAnalytics/jobTypeAnalytics/forecast/`approvalDashboard.pendingList` computation derives from `docs`, so this single normalization covers all of them; `revenueTrend`/`revenueByMonth` and `followUps`, which read from separate queries (`wonRevenueDocsRaw`/`followUpDocsRaw`, both also projecting `lines`/`discount` now), call the same helper explicitly at their own read sites. Every quote has carried real `lines`/`discount` data since the 2026-07-08 rewrite, so this should always be computable in practice. **Correction (2026-07-14, Codex review Medium finding)**: an earlier draft of this note overstated that as "no legacy-data fallback case exists" — a doc whose `lines` field is entirely absent (not merely empty) still computes to a silent `$0` via `q.lines ?? []` rather than crashing or falling back to the VAT-included `amount`; see [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Pre-Tax Amount Rule" for the full data-quality note and the `console.warn` telemetry that now flags this if it ever occurs.
- `totalCustomers`/`totalLeads`: `countDocuments({ deletedAt: null })` on `customers`/`leads` — always `0` today (module not built yet), which is correct per the "empty database → display 0" requirement, not a placeholder.
- `wonDeals`/`lostDeals`: quotes with `status: "ปิดการขายสำเร็จ"` / `"เสียโอกาส"`. `ลูกค้าปฏิเสธ` (Customer Rejected) is a distinct terminal status and is **not** counted as "lost" — only quotes actually marked `เสียโอกาส` are.
- `activeQuotations`/`nonActiveQuotations`/`expiredQuotations` (Non-Active added 2026-07-10, second pass): Active = non-terminal status *and* not past `expiryDate`; Non-Active = Cancelled/Customer Rejected, **or** non-terminal-but-expired; Expired = the narrower "still non-terminal but past its own expiry date" subset (kept as its own KPI alongside the broader Non-Active bucket, not replaced by it). **Lost is deliberately excluded from Non-Active** (fixed 2026-07-13, eighth same-day pass) — it previously counted in both `lostDeals` and `nonActiveQuotations`, which made `QuotationStatusSummary`'s 4-row donut/percentage table double-count Lost quotes (rows summed to more than `totalQuotations`). With Lost excluded, Won + Lost + Active + Non-Active are a true partition of every quote status — see `NON_ACTIVE_OUTCOME_STATUSES`'s comment in `api/dashboard/index.ts`.
- `pendingApprovals` (KPI, added 2026-07-10 second pass): a plain count of quotes with `status: "รออนุมัติ"`, visible to **any** `dashboard:view` holder — distinct from `approvalDashboard.pendingList`, the actionable list gated behind `quotations:approve`.
- `newCustomers`/`repeatCustomers`, and the Customer Analytics section generally, group by the free-text `Quote.client` string — **name variations/typos will undercount repeat customers** until a real `Customer` entity exists that quotes reference by ID instead of free text (tracked in TODO.md). Documented, not silently assumed.
- `salesPerformance`/`customerAnalytics`/`jobTypeAnalytics` each expose **both** `totalValue` (every quotation regardless of outcome) and `revenue` (Won-only) — added 2026-07-10 second pass; previously only the Won subset was exposed, under-reporting the business spec's required "Total Quotation Value" column. `jobTypeAnalytics` is zero-filled against the active `job_types` master list (not just codes present in the current filtered set), so a job type with no quotes this period is a real, visible zero row rather than silently missing; any code on a real quote that isn't in the active master list (deactivated job type, legacy data) is still appended.
- `closingDurationDays()` (feeds `averageClosingTime` and `avgClosingTime`) matches the terminal `marked_won` **or** `marked_lost` approval-history entry (fixed 2026-07-10 second pass — previously Won-only, undercounting the business spec's "average time between quotation creation and Won/Lost status").
- The sales pipeline's stage-to-stage `conversionFromPrevious` uses an explicit predecessor map (`PIPELINE_PREDECESSOR` in `api/dashboard/index.ts`) mirroring `workflowTransitions` in `api/_lib/quoteWorkflow.ts` — **not** simple array-adjacency, since the workflow branches (Sent to Customer → either Customer Accepted or Customer Rejected) and array-adjacent stages aren't always true predecessors.
- `forecast` (thisMonth/thisQuarter/thisYear) is a **live weighted estimate** — open `isPotentialOpportunity` quote value falling in each period, multiplied by the trailing-12-month win rate — recomputed on every request, never stored. No `forecast` collection.
- `salesActivity` (added 2026-07-13, sixth same-day pass; extended with `bySalesperson` in the seventh same-day pass) reads from `audit_log`, bucketed by `categoryForAction()` into 5 categories (created/edited/statusChanged/approvalRequested/approvalCompleted) across weekly/monthly/quarterly/yearly windows. `salesActivity.bySalesperson.{weekly,monthly,quarterly,yearly}` additionally buckets by `(period, salesperson)` for Created/Edited only (the 2 event types the P'Keng/P'Kee requirement names) — built via a nested `Map<period, Map<salesperson, counts>>`, deliberately **not** a joined/split string key (`` `${period} ${salesperson}` ``), since Thai full names routinely contain a space (e.g. "สมชาย ธนากร") which a naive split would silently truncate. Only non-zero `(period, salesperson)` rows are returned — no zero-row explosion across every period × every salesperson. **2026-07-14 (Codex-review fix pass)**: two changes — (1) no longer gated by `auditLog:view` — an independent review found this Critical, since it hid the required section from every default role except those with full audit-log access; it's now computed for any `dashboard:view` caller, same as every other required field, while `activityTimeline` (the literal audit-log feed) correctly keeps its `auditLog:view` gate. (2) the query now bounds `createdAt` by `bangkokDayBoundsUtc(from, to)` whenever a date filter is selected — previously an unconditional full-history scan regardless of the selected range, flagged High Priority. When no date filter is selected, it remains an unbounded rolling scan (same convention as `revenueTrend` below) — periods before `from` (when set) now correctly zero-fill for real instead of the UI caption merely claiming they're excluded.
- `activityTimeline` reads from `audit_log`, now including each entry's `relatedQuoteId`/`relatedCustomerName` when present (2026-07-13, seventh same-day pass); `approvalDashboard` (stat tiles + the actionable `pendingList`) is derived from the filtered quotes' `approvalHistory`. Both are `null` in the response (and hidden entirely by the frontend) when the caller lacks `auditLog:view` / `quotations:approve` respectively — a permission check via `roleHasPermission()`, not a second `requirePermission()` call, layered the same way ownership checks already are elsewhere in the API. `approvalDashboard.canReject` additionally reflects `quotations:reject`, since the two approval-workflow permissions aren't guaranteed to travel together on a custom role. (`salesActivity` used to share this same `auditLog:view` gate — see the note above for why it no longer does.)
- **No soft-delete predicate on Dashboard quote queries — by design, not an oversight** (2026-07-14, Codex-review fix pass, addressing a High Priority finding). `Quote`/`QuoteFields` has **no** `isDeleted` or equivalent field anywhere in its schema — quotations are only ever removed from "active" via the `ยกเลิก` (Cancelled) status, never a soft-delete flag. Every Dashboard quote query (`fullMatch`, `salespersonOnlyMatch`, and the won-revenue/follow-up/client-count/distinct-salesperson queries in `api/dashboard/index.ts`) deliberately has no `isDeleted` filter, since adding one on a field that can never be set would be dead code implying a deletion feature that doesn't exist. If a real soft-delete field is ever added to `Quote`, every one of those queries must be updated together — tracked in TODO.md.
- `revenueTrend` (added 2026-07-10 second pass, replaces the old `revenueByMonth`-only shape as the primary series — `revenueByMonth` itself is kept, derived from `revenueTrend.monthly`, for the one remaining legacy consumer): four bucketings (weekly/monthly/quarterly/yearly) of the same underlying won-quote rows, each zero-filled over a trailing window (12 weeks/12 months/8 quarters/5 years respectively) **ending at the selected date filter's `to` (or today)** — so the date filter does move the query even though the window's *start* isn't independently bounded by `from` (a trend chart collapsed to one selected day would defeat its purpose). Respects the salesperson/department filter.
- `monthlyClosingRate`: win rate (`won / (won + lost)`) per calendar month, trailing 12 months ending at the same anchor as `revenueTrend`, same zero-fill treatment. `winRate` is `null` (not `0`) for a month with no won/lost deals — a real 0% month (deals that all lost) must still render, not be hidden behind an empty state.
- `followUps` (Today/Overdue/Upcoming) fully respects the date-range + salesperson/department filter as of 2026-07-10 second pass (previously date-range-agnostic by design) — a follow-up tied to a quote issued outside the selected reporting window is now excluded, consistent with every other widget.
- **Timezone**: `today`/date-range-preset/month-boundary math (`api/dashboard/index.ts`'s `todayIsoDate()`/`periodEnd()`/`lastNMonthKeys()`, `src/pages/dashboard/dateRanges.ts`) is computed via a fixed +7h (Bangkok, no DST) offset applied once, then read back exclusively through UTC getters/`Date.UTC` — never through a local-timezone `Date` constructor mixed with `.toISOString()`, which shifts every boundary back a day for Thailand. Fixed 2026-07-10 after code review; found via empirical `TZ=Asia/Bangkok` reproduction. `averageApprovalTime`/`averageClosingTime`/`avgClosingTime` (per-salesperson) are `number | null` — `null` means no qualifying quote yet, distinct from a genuine same-day (`0.0`) average; same null-not-zero treatment as `monthlyClosingRate.winRate` above.
- `categoryBreakdown`: real `products` grouped by `categoryId` (archived excluded) — intentionally **not** "revenue by category," since `QuoteLine` has no `categoryId` reference back to `Product` (see Relationships below) and there's no reliable way to compute that without unreliable string-matching.

**`id` → `_id` mapping**: `Quote.id` (the client-facing field, e.g. `"QT-2567-0041"`) is stored as the literal MongoDB `_id` for the `quotes` collection — not an `ObjectId`. This is deliberate: quote IDs are already unique, human-meaningful business identifiers (generated by `nextQuoteId()` in `api/handlers/quotes.ts`, which scans existing `_id`s for the highest sequence number), so there was no reason to also carry a separate `ObjectId`. Every other collection (`users`, `products`, `categories`, `notifications`, `audit_log`) uses a real MongoDB `ObjectId` as `_id`, mapped to a string `id` field for the client via `withStringId()`/`toPublicUser()` (`api/_lib/collections.ts`).

`bahtText(amount: number): string` (`src/lib/quotes.tsx`) converts a THB amount to its Thai-words form (e.g. `689615` → `"(หกแสนแปดหมื่นเก้าพันหกร้อยสิบห้าบาทถ้วน)"`), used under the print document's grand total.

**Relationships**: `Product.categoryId → ProductCategory.id`. `QuoteLine` has **no** reference back to `Product` — picking a product from the library copies its `name`/`unit`/`defaultPrice` into a new, independent `QuoteLine` at selection time. This is deliberate: editing or archiving a `Product` must never change historical quotes (see [MODULES/Product.md](./MODULES/Product.md) and [MODULES/Quotation.md](./MODULES/Quotation.md)). `Quote.createdByUserId → User.id` and `ApprovalHistoryEntry.userId → User.id` are cross-domain references — plain string IDs looked up at query/render time (e.g. for signature images), not enforced foreign keys (MongoDB doesn't enforce referential integrity; nothing prevents a dangling reference if a user is deleted). `User.roleKey → Role.key`, `Notification.recipientUserId → User.id`, `AuditLogEntry.userId → User.id` are the same pattern.

**Update 2026-07-09**: `ensureIndexes()` (`api/_lib/collections.ts`, called once from the Setup Wizard's first-run path) now creates real indexes across every collection — see the per-collection Indexes column in the schema-prep table above, plus the additions called out inline for `products`/`categories`/`quotes`/`notifications`/`audit_log`. `users.username`/`users.email` uniqueness was already a real unique index before this pass (not newly added) — the paragraph that previously said "no explicit indexes exist" was stale and has been corrected.

## Superseded: the old proposed Prisma/PostgreSQL schema — NOT what got built

A Prisma/PostgreSQL schema was designed (never implemented) for the originally-proposed "Phase 2" Next.js migration (see [ARCHITECTURE.md](./ARCHITECTURE.md) "Superseded" section). **That migration never happened** — the real backend that shipped 2026-07-09 uses MongoDB (documented above), not Prisma/PostgreSQL. The section below is kept only as a historical record of the design that was considered and abandoned; do not write code against it or assume any Prisma project/migration exists. Where useful, the Migration Notes at the bottom of this file explain how the fields below map onto what actually got built.

Summary of the superseded Phase-2-first-cut models (RBAC + auth foundation only — Lead/Quotation/Product tables would have been designed in a later phase):

- `Department` — org units (name, code, isActive)
- `Role` — fixed `RoleKey` enum (SUPER_ADMIN, ADMIN, MANAGER, SALES, ACCOUNTING, WAREHOUSE, PURCHASING, HR, EMPLOYEE) + editable display name
- `Permission` — `key` (e.g. `"admin.users.manage"`), grouped by `module`
- `RolePermission` — many-to-many join between `Role` and `Permission`
- `User` — email, `passwordHash` (bcrypt), `departmentId`, `roleId`, self-relation `managerId`/`reports` for manager scoping, `isActive`, audit fields (`createdById`, `createdAt`, `updatedAt`)
- `Account` / `Session` / `VerificationToken` — Auth.js/NextAuth-required tables (Credentials provider + Prisma adapter, database session strategy)
- `AuditLog` — generic (`actorId`, `action`, `entityType`, `entityId`, `metadata`, `createdAt`), every future module's mutations write through this

**Convention envisioned for future modules under that superseded plan**: every business table gets `createdAt`, `updatedAt`, `createdById → User`, and `departmentId → Department` where department-scoped. Not adopted verbatim by the real MongoDB schema, and — corrected 2026-07-10 after the Codex review flagged this line as inaccurate — not even partially: `Quote` has `createdByUserId`/`updatedBy` (both user-**id** references, not timestamps) and `Product`/`ProductCategory`/`Company` have real `createdAt`/`updatedAt`, but `Quote` itself has neither `createdAt` nor `updatedAt` (see the Indexes note above — `issueDate`/`date` are the closest business-date equivalents). Worth adding real audit timestamps to `Quote` as a small follow-up (see TODO.md), not present today.

## Migration Notes (historical — how the old client-side shapes informed the real 2026-07-09 migration)

This section originally described a hypothetical future Prisma/PostgreSQL migration; it's kept, reframed, as an accurate record of how the pre-existing client-side shapes actually mapped onto the real MongoDB migration that shipped 2026-07-09:

1. `Product`/`ProductCategory` mapped close to 1:1 onto their MongoDB collections — the client-side shapes were a solid starting schema, as predicted; only `id` changed from a client-generated string to a MongoDB `ObjectId` (mapped back to `id: string` for the client via `withStringId()`).
2. `Quote`/`QuoteLine`/`SubDetail`: `Quote.id` did **not** move to a database-generated ID — it stayed the client-meaningful business ID (`"QT-2567-0041"`) and became the literal MongoDB `_id` for that collection (see the "`id` → `_id` mapping" note above), a deliberate deviation from the originally-imagined `cuid()` approach since the business ID was already unique. `createdByUserId` maps directly to the session user's ID captured server-side on create/duplicate. `salesperson` remains a free-text snapshot string, not a `User` reference, unchanged.
3. `Company` became a proper singleton MongoDB document (`_id: "singleton"`) rather than a `localStorage` blob, exactly as anticipated — `vatRate`/bank fields/`termsAndConditions` carried over unchanged.
4. `User`/`Role`/`Permission`: `passwordHash` is now a real bcrypt hash (cost 10), closing the biggest gap this section flagged in advance. `Role.permissions: Permission[]` stayed an array field on the `roles` document rather than becoming a `RolePermission` many-to-many join table — MongoDB's document model made the join-table normalization unnecessary; the array-on-document shape works fine for a role count in the tens. The 6-role client-side set was kept as-is; the 9-role `RoleKey` enum from the superseded Prisma proposal was never adopted.
5. `ApprovalHistoryEntry[]` on `Quote` stayed a JSON array field on the `quotes` document rather than becoming a separate `QuotationApproval` table — same reasoning as `Role.permissions` above; MongoDB's embedded-document model made a normalized join table unnecessary for this access pattern (approval history is always read together with its parent quote).
6. `Notification` and `AuditLogEntry` mapped close to 1:1 onto their own MongoDB collections, as predicted.
