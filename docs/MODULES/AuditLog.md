# Module: Audit Log

> Added 2026-07-08 as part of the RBAC/approval-workflow/notification system; migrated 2026-07-09 to real server-side persistence and enforcement — see [RBAC.md](../RBAC.md) for the full model.

## Purpose

An append-only record of sensitive actions across the app, viewable (not editable) by anyone holding `auditLog:view`.

## Business Flow

1. Accessed via the "บันทึกการใช้งาน" sidebar item, gated by `auditLog:view` (held by Super Admin and Administrator by default).
2. Read-only table: date/time, user, role (at the time of the action), module, action (pill badge), free-text details — newest first, with a client-side search box.
3. There is **no edit or delete UI anywhere in the app** for this data, and no such API route exists either — `src/lib/auditLog.ts`'s `logAudit()` calls `POST /api/audit-log` (`api/audit-log/index.ts`), the only write path, which only ever appends. The server always derives `userId`/`userName`/`roleName` from the authenticated session, never trusting those fields from the client, so no user (including Super Admin) can forge who performed a logged action.
4. Actions currently logged: `Login`, `Logout`, `User Created`/`User Updated`/`User Activated`/`User Deactivated`/`User Deleted`, `Password Reset`, `Profile Updated`, `Company Settings Updated`, `Role Changed`/`Permission Changed`, and the quotation lifecycle (`Quotation Created`/`Quotation Submitted`/`Quotation Updated`/`Quotation Approved`/`Quotation Rejected`/`Status Changed`).

## Pages

- `src/pages/admin/AuditLogPage.tsx` — the entire module, a single read-only table + search.

## Components

None shared.

## Database Tables

The `audit_log` MongoDB collection — see [DATABASE.md](../DATABASE.md) for the `AuditLogEntry` shape. Migrated 2026-07-09 from `localStorage` (`tcs_erp_audit_log`).

## APIs

`GET/POST /api/audit-log` (`api/audit-log/index.ts`) — see [API.md](../API.md) Audit Log section. `GET` requires `auditLog:view`; `POST` requires only being signed in (any user can log their own actions, but never as someone else — see Business Flow above).

## Permissions

`auditLog:view` (enforced server-side on `GET /api/audit-log`, not just hidden in the UI) to see the page at all. No permission exists to edit or delete entries because no such route exists in the API.

## Current Features

- Append-only logging helper (`logAudit()`) called from every sensitive mutation across Auth/User Management/Role Management/Settings/Quotation, writing through a real API route with server-derived actor identity
- Read-only, searchable table view, self-fetched on mount (`useEffect`) since the route is permission-gated
- Records actor, their role **at the time of the action** (not looked up live, so it stays accurate even if the user's role later changes)

## Future Improvements

- Filter by module/action/date-range, not just free-text search
- Export to CSV
- Pagination once the log grows large beyond its current 1000-entry query cap (`GET /api/audit-log` currently just limits, doesn't paginate)
- Real tamper-resistance beyond "no update/delete route exists" (e.g. a cryptographic hash chain) — the append-only guarantee today rests on there being no mutation endpoint, not on any tamper-evidence mechanism; a direct database-admin action could still alter history undetected

## Known Issues

None currently open. Actor-identity spoofing (a client claiming to be a different user) was closed as part of the 2026-07-09 backend migration — see [RBAC.md](../RBAC.md).
