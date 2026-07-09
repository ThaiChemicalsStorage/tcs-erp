# RBAC (Role-Based Access Control)

## Current State: Client-Side RBAC Simulation (Phase 1) — Not Real Security

As of 2026-07-08 this app has a full RBAC/user-management/approval-workflow/notification/audit-log system — **but it is entirely client-side**: every permission check, every workflow gate, and the audit log itself run in the browser and read/write `localStorage`. There is no server to be the source of truth, so:

- Anyone with browser devtools can read/edit `localStorage` directly — grant themselves a different role, mark a quotation approved, or delete audit log entries.
- `hashPassword()` (`src/lib/users.ts`) is **not** a real cryptographic hash — it's a simple checksum, chosen only so passwords aren't stored as literal plaintext strings. It offers no real protection.
- All "multi-user" data (every account, every quote, every notification, the whole audit log) lives in **one browser's `localStorage`**. This simulates multi-user behavior for demo/testing purposes (log out, log back in as a different account), but there is no real multi-device or concurrent-session support.

**Treat this exactly like the rest of Phase 1: a correct, testable UI/UX and data-model simulation of the target system, not the target system itself.** Do not deploy this as if it were access-controlled. The "Proposed Future RBAC" section below (still not implemented) is what turns this into real security.

### What's actually built

**Bootstrap** (`src/pages/SetupWizardPage.tsx`): if `loadUsers()` returns an empty array, the app shows a one-time Initial Setup Wizard instead of the sign-in screen. It collects Full Name, Employee ID, Username, Email, Password, Confirm Password, and creates the first `User` with the `super_admin` role. Once any user exists, the wizard never renders again — there is no public self-registration (the old `SignUpPage.tsx` was removed); every other account is created by an admin via User Management.

**Users** (`src/lib/users.ts`): a `User` is both the employee record and the account — `employeeId`, `fullName`, `username`, `email`, `passwordHash`, `phone`, `department`, `position`, `roleKey`, `status` (`active`/`inactive`), `profilePictureDataUrl`, `signatureDataUrl`. `employeeId`/`username`/`email` are enforced unique. **Position and Role are deliberately separate fields** — Position is a free-text job title (with suggestions: CEO, Director, General Manager, Sales Manager, Sales Executive, Engineer, HR, Accounting, Purchasing, Warehouse) with no bearing on permissions; Role is the RBAC role, assigned independently by an admin.

**Roles & Permissions** (`src/lib/roles.ts`, `src/lib/permissions.ts`): a flat 17-key `Permission` union — `dashboard:view`; `quotations:view/create/edit/delete/approve/reject/export`; `products:view/create/edit/delete/export`; `users:manage`; `roles:manage`; `company:manage`; `auditLog:view`. Six default `Role`s ship out of the box:

| Role | `isSuperAdmin` | `isSystem` | Summary |
|---|---|---|---|
| Super Admin | ✅ | ✅ (undeletable) | Every permission, always — `roleHasPermission()` short-circuits to `true` regardless of the stored list |
| Administrator | — | ✅ (undeletable) | Manage users + full quotation/product CRUD + audit log view. No `roles:manage`/`company:manage`. |
| Sales User | — | — | Create/edit/export quotations, no approve/reject. Maps to the request's "Sales Executive." |
| Approver Level 1 | — | — | View/edit/approve/reject quotations. Maps to "Sales Manager." |
| Approver Level 2 | — | — | Same rights as Level 1 in this build (see Known Simplifications below). Maps to "CEO." |
| Viewer | — | — | `*:view` only. |

Admins can create additional custom roles and edit any non-system role's permission checkboxes via Role Management (`src/pages/admin/RoleManagementPage.tsx`) — **Super Admin only**, and that page's own visibility plus every mutating action are gated by `userIsSuperAdmin()`, not just the `roles:manage` permission, so a misconfigured custom role can never accidentally grant itself role-management rights. `roles:manage` and `company:manage` are additionally hardcoded in `SUPER_ADMIN_ONLY_PERMISSIONS` (`permissions.ts`) — the permission-matrix checkboxes for those two are disabled/locked for every role except Super Admin itself, so there is no UI path to grant them elsewhere. Super Admin and Administrator rows are read-only in that same UI (can be viewed, not edited or deleted) to prevent an admin from locking everyone out — matching the design note this file already had before implementation.

### Sidebar / Menu Visibility

`App.tsx`'s `navItems` array carries an optional `permission` field per entry; `hasPermission(currentUser, roles, item.permission)` filters the rendered list — **items are fully removed from the DOM, not just disabled**, satisfying "hide inaccessible menus completely." A render-time `effectiveNav` guard (not a `useEffect`, to avoid a setState-in-effect cascade) falls back to the Dashboard if `activeNav` somehow points at a module the current user can't see. `Settings` is always visible (every signed-in user can edit their own profile); only its Company tab is conditionally rendered, gated by `company:manage`.

### Quotation Approval Workflow

`QuoteStatus` (`src/lib/quotes.tsx`) has 9 values: `ร่าง` (Draft) → `รออนุมัติ` (Pending Approval) → `อนุมัติแล้ว` (Approved) → `ส่งให้ลูกค้าแล้ว` (Sent to Customer) → `ลูกค้ายอมรับ` (Customer Accepted) → `ปิดการขายสำเร็จ` (Won), or `ลูกค้าปฏิเสธ` (Customer Rejected) → `เสียโอกาส` (Lost); plus a standalone `ยกเลิก` (Cancelled) reachable from Draft/Pending/Approved. `workflowTransitions` encodes the state machine (`{action: {from: QuoteStatus[], to: QuoteStatus}}`). `computeQuotePermissions(quote, isNew, currentUser, roles)` derives which action buttons a given user may see for a given quote, combining permission checks with an **ownership** check (`quote.createdByUserId === currentUser.id`, with approvers/admins allowed to touch quotes they don't own). Every transition appends an `ApprovalHistoryEntry` (`userId`, `userName`, `roleName`, `action`, `comment`, `createdAt`) to `Quote.approvalHistory` — **never removed, only appended**, rendered on the document as "ประวัติการอนุมัติ." Reject/Customer-Reject/Cancel require a non-empty comment via a modal; other transitions allow an optional one.

**Known simplification**: the two approver roles (Level 1/Level 2) are not sequenced — either can independently approve or reject a quote in "รออนุมัติ." A real two-stage gate (Level 1 must approve before Level 2 can) was not requested by name in the given status diagram (a single "Pending Approval" step) and was scoped out; see [TODO.md](./TODO.md).

### Signature Integration

`QuoteDocument.tsx` looks up the preparer's `User` record via `quote.createdByUserId` and the approver's via the most recent `approved` entry in `approvalHistory`, then renders `user.signatureDataUrl` (uploaded in Settings → Profile, same `ImageUploadField` pattern as the company logo/stamp) as an image on the signature block. If no signature is set, it falls back to the existing blank signature line — **no error is ever shown**, per spec.

### Notifications

`src/lib/notifications.ts` + `src/components/NotificationBell.tsx`. The bell shows no badge at 0 unread, a red badge with the count otherwise (capped display at "99+"). Notifications are stored in one shared list (consistent with the single-`localStorage` simulation) and filtered by `recipientUserId` for display. Delivery is role-based, not broadcast: submitting a quote notifies every active user holding `quotations:approve` (plus every active `approver_2` user if the quote total is ≥ `HIGH_VALUE_THRESHOLD`, ฿500,000); approve/reject/customer-accept/customer-reject notify the quote's creator. Clicking a notification marks it read and navigates to the quotation module (not yet the specific record — see [TODO.md](./TODO.md)).

### Audit Log

`src/lib/auditLog.ts` — `logAudit()` reads the current log, prepends a new entry, writes back; there is no update or delete function at all, so there is no code path for any user (including Super Admin) to alter history through the UI. Recorded actions include Login/Logout, User Created/Updated/Activated/Deactivated/Deleted, Password Reset, Profile Updated, Company Settings Updated, Role Changed/Permission Changed, and the full quotation lifecycle (Created/Submitted/Approved/Rejected/Status Changed). `AuditLogPage.tsx` is read-only — view (`auditLog:view`) is the only permission that touches it.

---

## Proposed Future RBAC (real, server-enforced — design only, still not implemented)

Everything below is the **Phase 2** design, unchanged in intent from before this session's client-side build, and still not started. The client-side model above was deliberately shaped to map onto it closely (see [DATABASE.md](./DATABASE.md) Migration Notes) so that migrating is "move this logic server-side," not "design RBAC twice."

### Roles

Fixed set, `RoleKey` enum:

| Role | Notes |
|---|---|
| `SUPER_ADMIN` | Bypasses all permission checks |
| `ADMIN` | Full access except super-admin-only actions |
| `MANAGER` | Scoped to their department's data |
| `SALES` | Leads, Customers, Quotations |
| `ACCOUNTING` | Financial data |
| `WAREHOUSE` | Inventory/warehouse data |
| `PURCHASING` | Purchasing data |
| `HR` | HR data |
| `EMPLOYEE` | Baseline, minimal access |

Each role's `name` (display label) is admin-editable; the `key` enum value is fixed by business requirements. Note this 9-role Phase 2 set is a different shape than the 6-role client-side simulation above (which was built directly against this session's request); reconciling the two role lists is part of the eventual migration design work, not assumed to be 1:1.

### Permissions

Granular string keys grouped by module, e.g. `"admin.users.manage"`, `"leads.read"`, `"quotations.approve"`. Stored as `Permission` rows (admin-editable data), granted to roles via a `RolePermission` many-to-many join — **not hardcoded in code**, so an admin can regrant permissions without a deploy. (The client-side simulation's `Permission` type in `src/lib/permissions.ts` is a hardcoded TypeScript union instead, since there's no database to hold rows — the *shape* of the idea, module-grouped granular keys, is the same.)

### Protected Routes

Proposed enforcement is **server-side and unbypassable by typing a URL**:
- `middleware.ts` — coarse "is there a session" check, redirects unauthenticated users.
- Every protected page starts with `const session = await auth(); if (!can(session?.user, "some.permission")) redirect("/unauthorized")`.
- Every server action starts with `requirePermission("some.permission")`, which throws before any mutation runs — this is what actually stops a devtools-triggered action call, not just a hidden button.

### Sidebar / Menu Visibility

Each module declares its nav entry + required permission in a `manifest.ts` (e.g. `{ label: "จัดการผู้ใช้", path: "/admin/users", permission: "admin.users.manage" }`). The sidebar filters the aggregated `module-registry.ts` list using the same `can()` function used server-side — **one implementation, imported both places**, so client-side hiding and server-side enforcement never drift out of sync. The client-side check is display-only and never trusted for security. (The client-side simulation's `hasPermission()` filtering of `navItems` in `App.tsx` is the same display-only pattern, just with no server-side counterpart to back it yet.)

### CRUD Permissions

Same `can(user, permission)` pattern wraps individual buttons: `{can(session.user, "admin.users.manage") && <Button>ลบผู้ใช้</Button>}`. Real enforcement still happens in the server action, not the button's presence.

### Data-Level Scoping (Managers)

Proposed `departmentScope(user)` helper: `SUPER_ADMIN`/`ADMIN` get no filter; `MANAGER` and regular roles get `{ departmentId: user.departmentId }`, applied inside `queries/*.ts` so a Manager's list views are automatically scoped to their department without each query re-implementing the filter. Not built client-side — the current simulation's "ownership" scoping (`Quote.createdByUserId`) is a much narrower version of this same idea, limited to quotations.

### Future Roles

The 9 roles above are the Phase-2 starting set. Additional roles (e.g. per-department finer splits) can be added as new `RoleKey` enum values + a migration, since permissions themselves are already data-driven.

### Security Notes

- Passwords: `bcryptjs`, cost factor 12, hashed only server-side, never logged. (Contrast with the client-side simulation's `hashPassword()` — a simple checksum, explicitly not real security.)
- Sessions: database-backed (Auth.js + Prisma adapter), not JWT — chosen specifically so disabling a user can force-invalidate their session immediately (delete their `Session` rows) rather than needing a JWT revocation list. (Contrast with the simulation's `session.ts` — a plain `localStorage` string, no expiry, no server-side revocation possible.)
- `SUPER_ADMIN`/`ADMIN` role rows should be **read-only in the permission-matrix UI** (not editable) to prevent an admin from accidentally locking everyone out, including themselves. (Already implemented client-side in `RoleManagementPage.tsx` for `isSystem` roles.)
- Every sensitive mutation should write an `AuditLog` row (actor, action, entity, metadata, timestamp) via a shared `logAudit()` helper — not scattered ad hoc logging calls. (Already implemented client-side in `src/lib/auditLog.ts`, same shape, minus real tamper-resistance since it's just a `localStorage` array.)

None of this Phase 2 section is implemented. Do not write code that assumes `can()`, `requirePermission()`, a server-side `Role`/`Permission` table, or any Auth.js integration exists — check [ARCHITECTURE.md](./ARCHITECTURE.md) for current status before building against this design. The client-side `hasPermission()`/`userIsSuperAdmin()`/`roleNameFor()` helpers in `src/lib/roles.ts` are the *real, working* equivalent for anything client-side today.
