# Module: Audit Log

> Added 2026-07-08 as part of the RBAC/approval-workflow/notification system; migrated 2026-07-09 to real server-side persistence and enforcement — see [RBAC.md](../RBAC.md) for the full model.

## Purpose

An append-only record of sensitive actions across the app, viewable (not editable) by anyone holding `auditLog:view`.

## Business Flow

1. Accessed via the "บันทึกการใช้งาน" sidebar item, gated by `auditLog:view` (held by Super Admin and Administrator by default).
2. Read-only table: date/time, user, role (at the time of the action), module, action (pill badge), free-text details — newest first, with a client-side search box.
3. There is **no edit or delete UI anywhere in the app** for this data, and no such API route exists either — the only write path is `POST /api/audit-log` (`api/audit-log/index.ts`), which only ever appends. The server always derives `userId`/`userName`/`roleName` from the authenticated session, never trusting those fields from the client, so no user (including Super Admin) can forge *who* performed a logged action.
4. **Two write paths, as of 2026-07-10 (fifth pass)**:
   - **Quotation events** (`Login`/`Logout` aside, everything quotation-related) are written *only* by `api/handlers/quotes.ts` itself, directly inside each mutation handler (`writeQuoteAuditEntry()`) — `POST /api/audit-log` now rejects `module === "ใบเสนอราคา"` with a 403. Before this fix, `src/lib/auditLog.ts`'s `logAudit()` was called from `QuotationPage.tsx` *after* a successful API call, meaning identity couldn't be forged but *what happened* could: any authenticated caller could bypass the UI and POST that same endpoint directly with a fabricated `action`/`details` describing an event that never occurred (e.g. a fake "Quotation Created"), which the Dashboard's Sales Activity Analytics counted from `audit_log`. This is now closed — quotation audit entries can only ever be written by the code path that actually performed the mutation.
   - **Everything else** (`Login`, `Logout`, `User Created`/`User Updated`/`User Activated`/`User Deactivated`/`User Deleted`, `Password Reset`, `Profile Updated`, `Company Settings Updated`, `Role Changed`/`Permission Changed`) is still client-triggered via `src/lib/auditLog.ts`'s `logAudit()` calling `POST /api/audit-log` after a successful action, same as before — the addendum review that flagged this only found the quotation case exploitable against a real Dashboard metric; the others remain a lower-stakes, unchanged surface, not silently overlooked.

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

- Append-only logging helper (`logAudit()`) called from every sensitive non-quotation mutation across Auth/User Management/Role Management/Settings, writing through a real API route with server-derived actor identity
- **Quotation events are server-authoritative** (added 2026-07-10, fifth pass) — `api/handlers/quotes.ts` writes its own entry for every create/update/duplicate/workflow transition, and `POST /api/audit-log` rejects the quotation module entirely, so these specific entries can no longer be fabricated via a direct API call
- Read-only, searchable table view, self-fetched on mount (`useEffect`) since the route is permission-gated
- Records actor, their role **at the time of the action** (not looked up live, so it stays accurate even if the user's role later changes)

## Future Improvements

- Filter by module/action/date-range, not just free-text search
- Export to CSV
- Pagination once the log grows large beyond its current 1000-entry query cap (`GET /api/audit-log` currently just limits, doesn't paginate)
- Real tamper-resistance beyond "no update/delete route exists" (e.g. a cryptographic hash chain) — the append-only guarantee today rests on there being no mutation endpoint, not on any tamper-evidence mechanism; a direct database-admin action could still alter history undetected
- The non-quotation write path (Profile/Company/User/Role changes, Login/Logout) is still client-triggered after the fact, same forgeable-content shape the quotation path used to have — not fixed this pass since it wasn't flagged against a Dashboard metric, but the same fix pattern (`writeXAuditEntry()` inside the actual mutation handler) would apply if a real need surfaces

## Known Issues

None currently open for identity spoofing (a client claiming to be a different user) — closed as part of the 2026-07-09 backend migration, see [RBAC.md](../RBAC.md). **Content forgery for quotation events** (a client fabricating what happened, e.g. a fake "Quotation Created" entry, while correctly attributed to itself) was closed 2026-07-10 (fifth pass) — see Business Flow above. The equivalent gap for non-quotation modules (Profile/Company/User/Role/Login/Logout) still exists but is lower-stakes (nothing currently reads those events into a business metric the way Sales Activity Analytics reads quotation events) and wasn't in scope for this pass.
