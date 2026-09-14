# Module: Departments & Teams

> Added 2026-08-14, direct business request: Sales has 2 teams, each with its own team lead who
> should see only their own team's records, not the other team's. See [RBAC.md](../RBAC.md)
> "Departments + Teams + Tiered Visibility" for the full permission model.

## Purpose

Give a Super Admin a real admin page to create/rename/archive Departments, and manage Teams (a
sub-grouping within a Department) inline — replacing what was previously a schema-only, completely
unwired MongoDB collection (seeded 2026-07-09, never exposed anywhere). Also backs a new tiered
visibility model (`view` → `viewTeam` → `viewDepartment` → `viewAll`) on Quotations, Scope of Work,
and Delivery Order, so a team's records stay private to that team by default.

## Business Flow

1. Accessed via the "แผนกและทีม" sidebar item, only rendered when the signed-in user holds
   `departments:manage` (Super-Admin-only, same class as Role Management/Company settings).
2. List view: one card per department (name, active/archived badge, team count), expandable to show
   its teams inline.
3. **Create department**: inline row (name only — `code`, a unique slug, is auto-generated
   server-side and never shown in this UI).
4. **Rename department**: inline edit on the card.
5. **Archive/restore department**: toggles `isActive` — no hard delete (this app's standing
   "archive not delete" convention). An archived department drops out of User Management's
   department picker but existing users keep their stored value.
6. **Add/rename/archive team**: same shape, scoped inside the expanded department — a team name
   only needs to be unique within its own department, not globally.
7. **User Management integration**: the Department `<select>` on the Create/Edit User form now
   sources from this module's live list (previously the hardcoded `DOCUMENT_RECIPIENT_DEPARTMENTS`
   constant — see [UserManagement.md](./UserManagement.md)). A Team `<select>` appears once a
   department with teams is selected, setting `User.teamId`.

## Pages

- `src/pages/admin/DepartmentManagementPage.tsx` — combined department list + inline team
  management, one file, following `RoleManagementPage.tsx`'s conventions (list, inline edit,
  `Toast` feedback — no `ConfirmDialog` on archive since it's reversible).

## Database Tables

- `departments` (MongoDB collection, existed since 2026-07-09, wired 2026-08-14) — `{name, code,
  isActive, createdAt/updatedAt/createdBy/updatedBy}`.
- `teams` (new 2026-08-14) — `{name, departmentId, isActive, createdAt/updatedAt/createdBy/
  updatedBy}`. `departmentId` references `departments._id` as a string.
- `User.department` (free text, unchanged join to `Quote.salesperson`) / `User.teamId` (new, `""` =
  no team) — see [DATABASE.md](../DATABASE.md).

See [DATABASE.md](../DATABASE.md) for the full field shapes.

## APIs

`GET/POST /api/departments`, `PATCH /api/departments/:id`, `GET/POST /api/teams`,
`PATCH /api/teams/:id` — see [API.md](../API.md) "Departments + Teams" section. Mounted inside
`api/handlers/roles.ts`, same pathname-dispatch
pattern Scope of Work/Delivery Order use inside `api/handlers/quotes.ts`.

## Permissions

`departments:manage` / `teams:manage` — both Super-Admin-only (`SUPER_ADMIN_ONLY_PERMISSIONS`, same
class as `roles:manage`/`company:manage`). List routes (`GET`) are open to any authenticated user —
needed for the User Management dropdowns.

Six more permissions gate **visibility**, not management, on the three modules a Sales team
actually touches: `quotations:viewTeam`/`quotations:viewDepartment`,
`scopeOfWork:viewTeam`/`scopeOfWork:viewDepartment`, `deliveryOrder:viewTeam`/
`deliveryOrder:viewDepartment` — see [RBAC.md](../RBAC.md) for the full cascade.

## Current Features

- Department CRUD (create/rename/archive) — no hard delete.
- Team CRUD, scoped to a department, name-unique-within-department.
- User Management's department dropdown now reflects real, admin-managed data instead of a
  hardcoded list; a new team dropdown scoped to the selected department.
- 4-tier visibility cascade (own/team/department/all) on Quotations, Scope of Work, Delivery Order,
  and the Dashboard's own-data scoping.

## Deliberately Out of Scope (this pass)

- `DOCUMENT_RECIPIENT_DEPARTMENTS` (Scope of Work's document-recipient routing) is a separate list,
  untouched.
- Team-scoped visibility for Service — untouched (Service keeps its existing binary
  `view`/`viewAll`).
- No hardcoded "Sales Team 1/2 Lead" default role — a Super Admin creates these via the existing
  Role Management UI once this deploys (each holding `quotations:viewTeam` +
  `scopeOfWork:viewTeam` + `deliveryOrder:viewTeam`, not `viewDepartment` — the department-wide tier
  exists for a role that legitimately needs it, but nothing here grants it by default). Tracked in
  [TODO.md](../TODO.md).
- Teams for departments other than Sales — the data model supports it generally, but no other
  department has any today.

## Known Issues

None functional. No automated UI test coverage for `DepartmentManagementPage.tsx` (matches this
app's general test-coverage pattern — see [RBAC.md](../RBAC.md) Known Gaps); the permission-rule
logic itself (`buildOwnershipClause()`/`resolveVisibilityScope()`) is covered by
`tests/api/visibility.test.ts` (in-memory MongoDB).
