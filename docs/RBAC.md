# RBAC (Role-Based Access Control)

## Current State: No RBAC

There is **no permission system of any kind** in this project today.

- Anyone who gets past the sign-in screen (which accepts any email/password — see [MODULES/Auth.md](./MODULES/Auth.md)) sees **every** sidebar item, **every** page, and can perform **every** action (create/edit/archive/delete products, create/edit/duplicate quotations, edit settings).
- `UserProfile.role` (in `src/lib/storage.ts`) is a **free-text display string** only (e.g. `"CFO · ปฏิบัติการทั่วโลก"`), edited via Settings → Profile. It has no bearing on what the user can see or do. Do not confuse it with the RBAC `Role` concept below.
- There is no route protection — there are no routes at all (see [ARCHITECTURE.md](./ARCHITECTURE.md), no router is used).
- There is no concept of Department, Team, or data-scoping.

**This app must not be treated as access-controlled.** Anything sensitive should not be deployed with this codebase as-is.

## Proposed Future RBAC (design only, not implemented)

Designed as part of the Phase 2 Next.js/Prisma migration proposal (see [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md)). Nothing below exists in code.

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

Each role's `name` (display label) is admin-editable; the `key` enum value is fixed by business requirements.

### Permissions

Granular string keys grouped by module, e.g. `"admin.users.manage"`, `"leads.read"`, `"quotations.approve"`. Stored as `Permission` rows (admin-editable data), granted to roles via a `RolePermission` many-to-many join — **not hardcoded in code**, so an admin can regrant permissions without a deploy.

### Protected Routes

Proposed enforcement is **server-side and unbypassable by typing a URL**:
- `middleware.ts` — coarse "is there a session" check, redirects unauthenticated users.
- Every protected page starts with `const session = await auth(); if (!can(session?.user, "some.permission")) redirect("/unauthorized")`.
- Every server action starts with `requirePermission("some.permission")`, which throws before any mutation runs — this is what actually stops a devtools-triggered action call, not just a hidden button.

### Sidebar / Menu Visibility

Each module declares its nav entry + required permission in a `manifest.ts` (e.g. `{ label: "จัดการผู้ใช้", path: "/admin/users", permission: "admin.users.manage" }`). The sidebar filters the aggregated `module-registry.ts` list using the same `can()` function used server-side — **one implementation, imported both places**, so client-side hiding and server-side enforcement never drift out of sync. The client-side check is display-only and never trusted for security.

### CRUD Permissions

Same `can(user, permission)` pattern wraps individual buttons: `{can(session.user, "admin.users.manage") && <Button>ลบผู้ใช้</Button>}`. Real enforcement still happens in the server action, not the button's presence.

### Data-Level Scoping (Managers)

Proposed `departmentScope(user)` helper: `SUPER_ADMIN`/`ADMIN` get no filter; `MANAGER` and regular roles get `{ departmentId: user.departmentId }`, applied inside `queries/*.ts` so a Manager's list views are automatically scoped to their department without each query re-implementing the filter.

### Future Roles

The 9 roles above are the Phase-2 starting set. Additional roles (e.g. per-department finer splits) can be added as new `RoleKey` enum values + a migration, since permissions themselves are already data-driven.

### Security Notes

- Passwords: `bcryptjs`, cost factor 12, hashed only server-side, never logged.
- Sessions: database-backed (Auth.js + Prisma adapter), not JWT — chosen specifically so disabling a user can force-invalidate their session immediately (delete their `Session` rows) rather than needing a JWT revocation list.
- `SUPER_ADMIN`/`ADMIN` role rows should be **read-only in the permission-matrix UI** (not editable) to prevent an admin from accidentally locking everyone out, including themselves.
- Every sensitive mutation should write an `AuditLog` row (actor, action, entity, metadata, timestamp) via a shared `logAudit()` helper — not scattered ad hoc logging calls.

None of the above is implemented. Do not write code that assumes `can()`, `requirePermission()`, `Role`, `Permission`, or any Auth.js integration exists — check [ARCHITECTURE.md](./ARCHITECTURE.md) for current status before building against this design.
