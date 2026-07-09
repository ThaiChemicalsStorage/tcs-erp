# Database

## Current State: No Database

There is **no database** in this project. All data lives in browser memory (React state) for the session, and some domains additionally mirror to the browser's `localStorage` so they survive a page reload. Nothing is shared across users or devices — this is a single-browser, client-only demo.

### What persists to `localStorage` today

| Domain | Key | Shape | Source |
|---|---|---|---|
| Current session | `tcs_erp_session` | `userId: string` or absent | `src/lib/session.ts` |
| Users (employee + account records) | `tcs_erp_users` | `User[]` (JSON) | `src/lib/users.ts` |
| Roles | `tcs_erp_roles` | `Role[]` (JSON) | `src/lib/roles.ts` |
| Notifications | `tcs_erp_notifications` | `Notification[]` (JSON) | `src/lib/notifications.ts` |
| Audit log | `tcs_erp_audit_log` | `AuditLogEntry[]` (JSON, append-only) | `src/lib/auditLog.ts` |
| Company profile | `tcs_erp_company` | `Company` (JSON) | `src/lib/storage.ts` |
| Products | `tcs_erp_products` | `Product[]` (JSON) | `src/lib/products.ts` |
| Product categories | `tcs_erp_categories` | `ProductCategory[]` (JSON) | `src/lib/products.ts` |
| Quotes | `tcs_erp_quotes` | `Quote[]` (JSON) | `src/lib/quotes.tsx` |

The old singleton `tcs_erp_auth` (boolean flag) / `tcs_erp_user` (single `UserProfile`) keys from before 2026-07-08 are gone — replaced by `tcs_erp_session` (which user is signed in) + `tcs_erp_users` (the full account list). **Quotes now persist** (`tcs_erp_quotes`) — this was the single biggest tracked gap before 2026-07-08 (see [CHANGELOG.md](./CHANGELOG.md)); `App.tsx` syncs `quotes` state to `localStorage` via a `useEffect`.

### What does NOT persist (in-memory only, resets on reload)

- Everything that's plain component `useState` not listed above (which view is open, form drafts before Save, UI toggles like "show archived", the notification-panel open/closed state).

## Entity Descriptions (current, client-side shapes)

These are the actual TypeScript shapes in use today — they double as the most accurate reference for what the eventual database schema needs to capture.

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
}
```
Single record (not a list) — there is only ever one company, matching this app's single-company (not multi-tenant) design. Editable only by Super Admin (`company:manage`, hardcoded — see [RBAC.md](./RBAC.md)). `logoDataUrl`/`stampDataUrl` are rendered into the quotation PDF header/signature block — see [MODULES/Quotation.md](./MODULES/Quotation.md).

### `User` (`src/lib/users.ts`) — replaces the old singleton `UserProfile`
```ts
type UserStatus = "active" | "inactive";

interface User {
  id: string;
  employeeId: string;    // enforced unique
  fullName: string;
  username: string;      // enforced unique, used for login
  email: string;         // enforced unique, used for login
  passwordHash: string;  // NOT a real crypto hash — see RBAC.md
  phone: string;
  department: string;    // free text, suggestions only
  position: string;      // free text, suggestions only — deliberately independent of roleKey
  roleKey: string;       // → Role.key
  status: UserStatus;
  profilePictureDataUrl: string;
  signatureDataUrl: string;   // rendered on quotations this user prepared/approved
  createdAt: string;
  updatedAt: string;
}
```
A list now (`User[]`), not a singleton — real multi-account support. The "current user" is derived at runtime as `users.find(u => u.id === loadSession())`, not stored redundantly.

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
6 default roles ship in `defaultRoles`; admins can add custom ones. `roles:manage`/`company:manage` cannot be granted to any role but the Super Admin role itself (`isPermissionLockedToSuperAdmin()`).

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
All notifications (for every user) live in one shared array — a single-`localStorage` simulation of what would be per-user delivery in a real backend. Filtered client-side by `recipientUserId` for display.

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
}
```
Append-only — `logAudit()` has no corresponding update/delete function, so there is no code path to alter history from the UI (including for Super Admin).

### `Product` / `ProductCategory` (`src/lib/products.ts`)
```ts
interface ProductCategory {
  id: string;
  name: string;
  archived: boolean;
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
  archived: boolean;
  createdAt: string;       // ISO datetime
  updatedAt: string;       // ISO datetime
}
```

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
  amount: number;                 // snapshot of computed total at last save
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
  createdByUserId: string;             // → User.id, "" for legacy/seed quotes (any editor treated as owner)
  approvalHistory: ApprovalHistoryEntry[];  // append-only
}
```
All document fields below `discount` were hardcoded placeholder text on the form until 2026-07-08 (see [CHANGELOG.md](./CHANGELOG.md)) — they are now real, per-quote, controlled data. Empty ones are auto-hidden in the print/PDF view rather than printing a blank row (see [UI_GUIDELINES.md](./UI_GUIDELINES.md) Print/PDF section). `createdByUserId`/`approvalHistory` were added 2026-07-08 for the approval workflow — see [RBAC.md](./RBAC.md). `contactEmail`/`deliveryMethod`/`deliveryAddress`/`project`/`remarks` were added 2026-07-09 for the print/PDF redesign — `remarks` in particular fixes a latent bug where the "หมายเหตุ / เงื่อนไข" textarea was `defaultValue`-only (uncontrolled, never saved); it's now a real controlled field like the rest.

`bahtText(amount: number): string` (`src/lib/quotes.tsx`) converts a THB amount to its Thai-words form (e.g. `689615` → `"(หกแสนแปดหมื่นเก้าพันหกร้อยสิบห้าบาทถ้วน)"`), used under the print document's grand total.

**Relationships (current, in-memory/localStorage)**: `Product.categoryId → ProductCategory.id`. `QuoteLine` has **no** reference back to `Product` — picking a product from the library copies its `name`/`unit`/`defaultPrice` into a new, independent `QuoteLine` at selection time. This is deliberate: editing or archiving a `Product` must never change historical quotes (see [MODULES/Product.md](./MODULES/Product.md) and [MODULES/Quotation.md](./MODULES/Quotation.md)). `Quote.createdByUserId → User.id` and `ApprovalHistoryEntry.userId → User.id` are the only cross-domain references introduced by the RBAC work — both are plain string IDs looked up at render time (e.g. for signature images), not enforced foreign keys (no database exists to enforce them). `User.roleKey → Role.key`, `Notification.recipientUserId → User.id`, `AuditLogEntry.userId → User.id` are the same pattern.

No indexes, primary/foreign key constraints, or migrations exist because there is no database — `id` fields above are just string/number values generated client-side (`newId()`, `newLineId()`, `newSubDetailId()`, `nextQuoteId()`).

## Future Database Plans (proposed, not implemented)

A Prisma/PostgreSQL schema was designed for the Phase 2 backend migration (see [ARCHITECTURE.md](./ARCHITECTURE.md)). **No Prisma project, migration, or database instance exists yet.** The client-side `User`/`Role`/`Permission`/`Notification`/`AuditLogEntry` shapes above (built 2026-07-08) were deliberately designed to map closely onto the proposed models below — see Migration Notes — but the two role sets differ (6 client-side roles built directly against this session's request vs. the 9-role `RoleKey` enum proposed below) and will need reconciling, not a blind 1:1 port. Summary of the proposed Phase-2-first-cut models (RBAC + auth foundation only — Lead/Quotation/Product tables would be designed in a later phase, informed by the shapes above):

- `Department` — org units (name, code, isActive)
- `Role` — fixed `RoleKey` enum (SUPER_ADMIN, ADMIN, MANAGER, SALES, ACCOUNTING, WAREHOUSE, PURCHASING, HR, EMPLOYEE) + editable display name
- `Permission` — `key` (e.g. `"admin.users.manage"`), grouped by `module`
- `RolePermission` — many-to-many join between `Role` and `Permission`
- `User` — email, `passwordHash` (bcrypt), `departmentId`, `roleId`, self-relation `managerId`/`reports` for manager scoping, `isActive`, audit fields (`createdById`, `createdAt`, `updatedAt`)
- `Account` / `Session` / `VerificationToken` — Auth.js/NextAuth-required tables (Credentials provider + Prisma adapter, database session strategy)
- `AuditLog` — generic (`actorId`, `action`, `entityType`, `entityId`, `metadata`, `createdAt`), every future module's mutations write through this

**Convention for future modules**: every business table gets `createdAt`, `updatedAt`, `createdById → User`, and `departmentId → Department` where department-scoped. Enum-like lookups that need to be admin-editable (statuses, categories) should be DB tables, not Prisma enums, from Phase 2 onward — `RoleKey` is a deliberate exception since the 9 roles are fixed by business requirements.

## Migration Notes

When Phase 2 starts:
1. `Product`/`ProductCategory` map close to 1:1 onto future Prisma models — the client-side shapes above are a solid starting schema.
2. `Quote`/`QuoteLine`/`SubDetail` will need `id` fields changed from client-generated strings/numbers to database-generated IDs (e.g. `cuid()`). `createdByUserId` already exists and maps directly to a `createdById → User` foreign key; `salesperson` is still a free-text snapshot string, not a `User` reference, and should probably be superseded by `createdByUserId` rather than kept alongside it.
3. `Company` becomes a proper settings table (or a single-row table) rather than a `localStorage` blob — `vatRate`/bank fields/`termsAndConditions` already match what that table needs.
4. `User`, `Role`, `Permission` (client-side, built 2026-07-08) map reasonably well onto the proposed `User`/`Role`/`Permission`/`RolePermission` tables in the Future Database Plans section above — the biggest gaps to close during migration: `passwordHash` needs real bcrypt hashing (not the client-side checksum), `Role.permissions: Permission[]` (an array on the row) needs to become a proper `RolePermission` many-to-many join, and the 6-role set built here needs reconciling against the 9-role `RoleKey` enum already proposed.
5. `ApprovalHistoryEntry[]` on `Quote` maps to a new `QuotationApproval` table (`quoteId`, `userId`, `action`, `comment`, `createdAt`) rather than a JSON array column, so it can be queried/reported on.
6. `Notification` and `AuditLogEntry` map close to 1:1 onto their own tables — `AuditLogEntry` in particular is already shaped like the generic `AuditLog` model in the Future Database Plans section above (`actorId`→`userId`, `action`, `entityType`→`module`, `metadata`→`details`).
