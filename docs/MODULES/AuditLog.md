# Module: Audit Log

> Added 2026-07-08 as part of the RBAC/approval-workflow/notification system — see [RBAC.md](../RBAC.md) for the full model and its "not real security" caveat.

## Purpose

An append-only record of sensitive actions across the app, viewable (not editable) by anyone holding `auditLog:view`.

## Business Flow

1. Accessed via the "บันทึกการใช้งาน" sidebar item, gated by `auditLog:view` (held by Super Admin and Administrator by default).
2. Read-only table: date/time, user, role (at the time of the action), module, action (pill badge), free-text details — newest first, with a client-side search box.
3. There is **no edit or delete UI anywhere in the app** for this data — `src/lib/auditLog.ts`'s `logAudit()` is the only write path, and it only ever appends.
4. Actions currently logged: `Login`, `Logout`, `User Created`/`User Updated`/`User Activated`/`User Deactivated`/`User Deleted`, `Password Reset`, `Profile Updated`, `Company Settings Updated`, `Role Changed`/`Permission Changed`, and the quotation lifecycle (`Quotation Created`/`Quotation Submitted`/`Quotation Updated`/`Quotation Approved`/`Quotation Rejected`/`Status Changed`).

## Pages

- `src/pages/admin/AuditLogPage.tsx` — the entire module, a single read-only table + search.

## Components

None shared.

## Database Tables

None (no real DB) — see [DATABASE.md](../DATABASE.md) for the `AuditLogEntry` shape. Persists to `tcs_erp_audit_log`.

## APIs

None — see [API.md](../API.md) Audit Log section.

## Permissions

`auditLog:view` to see the page at all. No permission exists to edit or delete entries because no such action exists in the codebase.

## Current Features

- Append-only logging helper (`logAudit()`) called from every sensitive mutation across Auth/User Management/Role Management/Settings/Quotation
- Read-only, searchable table view
- Records actor, their role **at the time of the action** (not looked up live, so it stays accurate even if the user's role later changes)

## Future Improvements

- Filter by module/action/date-range, not just free-text search
- Export to CSV
- Pagination once the log grows large (currently renders the full array)
- Real tamper-resistance (e.g. a hash chain or server-side write-once store) once a real backend exists — today it's just a `localStorage` array, editable via devtools like everything else in this simulation

## Known Issues

None currently open beyond the shared "client-side only, not real security" caveat — see [RBAC.md](../RBAC.md).
