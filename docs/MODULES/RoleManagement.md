# Module: Role Management

> Added 2026-07-08 as part of the RBAC/approval-workflow/notification system; migrated 2026-07-09 to real server-side enforcement (Node.js API + MongoDB) — see [RBAC.md](../RBAC.md) for the full model, which is genuinely unbypassable via devtools now, not a client-side simulation.

## Purpose

Let Super Admin — and only Super Admin — define custom roles and edit the permission matrix, without needing a code change/deploy for every new role.

## Business Flow

1. Accessed via the "บทบาทและสิทธิ์" sidebar item, which is only rendered (and the page only rendered) when `userIsSuperAdmin(currentUser, roles)` — **hardcoded, not just permission-gated**, so a misconfigured custom role can never grant itself access to this page.
2. List view: a card per role (name, description, permission count or "สิทธิ์ทั้งหมด" for Super Admin, how many users currently hold it, a lock badge for system roles).
3. **Create**: name, description, and a checkbox matrix grouped by module (`PERMISSION_GROUPS` from `src/lib/permissions.ts`) — `roles:manage`/`company:manage` checkboxes are permanently disabled/locked (with a lock icon and explanatory caption) for every role except Super Admin's own row, so there is no UI path to grant them to a custom role.
4. **Edit**: same form for non-system roles. System roles (`isSystem: true` — Super Admin, Administrator) open in a **read-only view mode** instead — every field disabled, no Save button, only a Close button — to prevent an admin from accidentally locking everyone out (including themselves) by editing a built-in role.
5. **Delete**: blocked for system roles and for any role currently assigned to at least one user (must reassign those users first).
6. Create/edit/delete all write a `Role Changed` or `Permission Changed` audit entry.

## Pages

- `src/pages/admin/RoleManagementPage.tsx`.

## Components

Reuses `ConfirmDialog`/`Toast`/`useToast`.

## Database Tables

`roles` (MongoDB collection) — see [DATABASE.md](../DATABASE.md) for the `Role`/`Permission` shapes.

## APIs

`GET/POST /api/roles`, `PATCH/DELETE /api/roles/:key` — see [API.md](../API.md) Roles section.

## Permissions

Super Admin only, hardcoded (`userIsSuperAdmin()`), independent of whatever the `roles:manage` permission list says on any given role — a deliberate belt-and-suspenders design so this page's own access can never be misconfigured away from Super Admin.

## Current Features

- 6 default roles ship out of the box (Super Admin, Administrator, Sales User, Approver Level 1, Approver Level 2, Viewer)
- Create/edit/delete custom roles with a full permission-matrix editor
- System roles (Super Admin, Administrator) are view-only in this UI, never editable or deletable
- `roles:manage`/`company:manage` structurally un-assignable to any role but Super Admin
- Delete blocked while any user still holds the role

## Accessibility Hardening (2026-07-30)

An `/impeccable audit` of the Admin module found and fixed: the Create/Edit Role form's name and
description fields had `<label>`s with no `htmlFor` and inputs with no `id` — added `useId()`-
generated pairs (the permission-matrix checkboxes were already correctly `<label>`-wrapped, no
change needed there); row-action buttons (edit/view, delete) relied on `title` alone — added
item-specific `aria-label`s; the "System" role badge used raw gold (`text-[#c9a84c]`) as plain text
directly on the card's white background (≈2.37:1 contrast, failing WCAG AA) — darkened to
`#866d28`, the same value already established for gold-on-tint pills elsewhere. See
[UserManagement.md](./UserManagement.md) for the fuller writeup of this pass (same audit, same
session). No RBAC, permission-matrix, or business-logic changes. See CHANGELOG.md 2026-07-30.

## Future Improvements

- Bulk "reassign all users from role A to role B" helper before allowing a role delete
- Permission presets/templates for faster custom-role creation

## Known Issues

None functional. `GET /api/roles` is open to any authenticated user (not gated by `roles:manage`) — deliberate, since every client-side `hasPermission()` call needs the full role/permission list to decide what to render; role documents carry no PII, only names/descriptions/permission keys. See [API.md](../API.md) "Known Scope Limitations" and the 2026-07-10 Codex review response in [CODEX_REVIEW_REPORT.md](../CODEX_REVIEW_REPORT.md).
