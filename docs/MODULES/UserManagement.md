# Module: User Management

> Added 2026-07-08 as part of the RBAC/approval-workflow/notification system; migrated 2026-07-09 to real server-side enforcement (Vercel Functions + MongoDB Atlas, bcrypt-hashed passwords) — see [RBAC.md](../RBAC.md) for the full model, which is genuinely unbypassable via devtools now, not a client-side simulation.

## Purpose

Let Super Admin and users with `users:manage` create, edit, and manage the lifecycle of employee/account records — the only way accounts get created after the one-time Setup Wizard (see [Auth.md](./Auth.md)).

## Business Flow

1. Accessed via the "จัดการผู้ใช้งาน" sidebar item, only rendered when the signed-in user holds `users:manage`.
2. List view: search across name/employee ID/username/email/department/position; table shows avatar+name+username/email, employee ID, department/position, role badge, active/inactive status, and row actions.
3. **Create**: modal-free full-page form — Full Name, Employee ID, Username, Email, Phone, Department (free text + suggestions), Position (free text + suggestions), Role (dropdown of assignable roles — the Super Admin role option is hidden unless the current user is themselves Super Admin), initial password + confirm. Employee ID/Username/Email uniqueness enforced (`isEmployeeIdTaken`/`isUsernameTaken`/`isEmailTaken`).
4. **Edit**: same form minus the password fields, plus a Status select. **The Role and Status selects are disabled when editing your own account** — no user can change their own role or deactivate themselves.
5. **Reset password**: a separate small modal (target user's name shown), sets `passwordHash` directly (bcrypt-hashed server-side) — there is no "email a reset link" flow since no email/SMTP service is integrated.
6. **Activate/Deactivate**: single-click with a `ConfirmDialog`, blocked for your own account.
7. **Delete**: hard delete with a danger `ConfirmDialog`, blocked for your own account and for the last remaining Super Admin (so the app can never end up with zero Super Admins).
8. Every create/update/reset/activate/deactivate/delete writes an audit entry (`User Created`/`User Updated`/`Password Reset`/`User Activated`/`User Deactivated`/`User Deleted`) — see [AuditLog.md](./AuditLog.md).

## Pages

- `src/pages/admin/UserManagementPage.tsx` — list + create/edit form, reset-password modal, activate/deactivate/delete confirms, all in one file.

## Components

Reuses `ConfirmDialog`/`Toast`/`useToast` from `src/components/`/`src/hooks/`.

## Database Tables

`users` (MongoDB collection) — see [DATABASE.md](../DATABASE.md) for the `User` shape.

## APIs

`GET/POST /api/users`, `PATCH/DELETE /api/users/:id` — see [API.md](../API.md) Users section.

## Permissions

`users:manage` to reach the page at all. Within it: no user may edit their own role/status or delete their own account; only Super Admin sees the Super Admin role as an assignable option (so a non-Super-Admin admin can create users but can never promote anyone to Super Admin).

## Current Features

- Full CRUD (create/edit/reset password/activate/deactivate/delete) with uniqueness validation
- Self-protection guards (can't touch your own role/status/account deletion)
- Last-Super-Admin protection (can't delete the only remaining Super Admin)
- Every action audit-logged

## Future Improvements

- Bulk actions (bulk deactivate, bulk role reassignment)
- CSV import for initial employee onboarding
- A "send temporary password" email flow — no email/SMTP service is integrated yet (unrelated to the real backend, which already exists); the reset-password modal sets `passwordHash` directly and the admin must communicate the new password out-of-band

## Known Issues

None functional. `GET /api/users` is open to any authenticated user (not gated by `users:manage`) and returns every field but `passwordHash` — a deliberate, documented tradeoff, not an oversight; see [API.md](../API.md) "Known Scope Limitations" and the 2026-07-10 Codex review response in [CODEX_REVIEW_REPORT.md](../CODEX_REVIEW_REPORT.md).
