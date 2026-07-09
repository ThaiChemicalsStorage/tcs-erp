# API

## Current State: No Backend, No HTTP API

This project has **no server, no HTTP endpoints, and no network requests of any kind**. Every "operation" is a synchronous JavaScript function call within the browser, reading/writing React state and (for some domains) `localStorage`. There is no request/response cycle, no validation layer beyond in-component form checks, and no authentication token of any kind.

The tables below document the current **client-side operation surface** — the functions that stand in for what would be API endpoints in a real backend — so the eventual real API can be designed to match the same operations.

### Auth / Bootstrap (`src/lib/{users,session}.ts`, invoked from `App.tsx`)

| Operation | Function | Request | Response | Validation | Notes |
|---|---|---|---|---|---|
| First-run bootstrap | `App.tsx` renders `SetupWizardPage` when `users.length === 0` | Full Name, Employee ID, Username, Email, Password, Confirm | creates the first `User` as `super_admin`, `saveSession(id)` | all fields required, password ≥ 6 chars, passwords match | Never shows again once any user exists |
| Sign in | `handleSignIn(identifier, password)` in `App.tsx` | `identifier` (username or email), `password: string` | `null` on success (session saved) or a Thai error string on failure | looks up via `findUserByLogin()`, checks `verifyPassword()`, checks `status === "active"` | **Real (client-checked) credential verification** — replaces the pre-2026-07-08 "any input succeeds" flow. `verifyPassword`/`hashPassword` are not cryptographically secure — see [RBAC.md](./RBAC.md). |
| Log out | `handleLogout()` in `App.tsx` | — | `clearSession()`, writes a `Logout` audit entry | — | |
| Session load/save/clear | `loadSession()`/`saveSession(userId)`/`clearSession()` in `src/lib/session.ts` | — | current `userId` or `null` | — | Replaces the old boolean `tcs_erp_auth` flag |

There is no public self-registration — the old `SignUpPage`/`handleSignUp` flow was removed. Every account past the first is created via User Management (`users:manage`).

### Company / Users / Roles (`src/lib/{storage,users,roles}.ts`)

| Operation | Function | Notes |
|---|---|---|
| Load/save company | `loadCompany()` / `saveCompany(company)` | Falls back to `defaultCompany`; save gated by `company:manage` in the UI |
| Load/save users | `loadUsers()` / `saveUsers(users)` | `loadUsers()` returns `[]` (not seed data) when nothing is stored — this empty state is what triggers the Setup Wizard |
| Create user | `newUser(fields)` in `src/lib/users.ts` | Builds a `User` with a hashed password; uniqueness of employeeId/username/email checked separately via `isEmployeeIdTaken`/`isUsernameTaken`/`isEmailTaken` before calling it |
| Reset password | `UserManagementPage` sets `passwordHash: hashPassword(newPw)` directly on the target user, admin-only | No "forgot password" email flow exists (no backend) |
| Activate/deactivate | `UserManagementPage` toggles `User.status` | Blocked for your own account in the UI |
| Delete user | `UserManagementPage` filters the user out of `users[]` | Blocked for your own account and for the last remaining Super Admin |
| Load/save roles | `loadRoles()` / `saveRoles(roles)` | Falls back to `defaultRoles` (6 roles) if nothing stored |
| Create/edit/delete role | `RoleManagementPage`, Super-Admin-only (hardcoded, not just permission-gated) | Delete blocked for `isSystem` roles and for any role still assigned to a user |
| Permission check | `hasPermission(user, roles, permission)` / `userIsSuperAdmin(user, roles)` / `roleNameFor(user, roles)` in `src/lib/roles.ts` | The one shared implementation used everywhere (sidebar filtering, button gating, quotation workflow gating) — client-side/display-only, see [RBAC.md](./RBAC.md) |

### Notifications (`src/lib/notifications.ts`)

| Operation | Function | Notes |
|---|---|---|
| Load/save | `loadNotifications()` / `saveNotifications(list)` | One shared array for all users, filtered client-side by `recipientUserId` |
| Create (per event) | `notifyQuotationSubmitted/Approved/Rejected/HighValue/CustomerAccepted/CustomerRejected(...)` | Each returns `Notification[]` (one per recipient); `QuotationPage.handleWorkflowAction` calls the right one per transition and passes the result to `App.tsx`'s `addNotifications` |
| Mark read / mark all read / delete | `markNotificationRead(id)` / `markAllNotificationsRead()` / `deleteNotification(id)` in `App.tsx` | All three read-modify-write the shared array and persist |
| Unread count | `unreadCountFor(notifications, userId)` | Drives the bell badge (hidden at 0, "99+" cap otherwise) |

### Audit Log (`src/lib/auditLog.ts`)

| Operation | Function | Notes |
|---|---|---|
| Append | `logAudit({ userId, userName, roleName, module, action, details })` | Reads the current log, prepends, writes back, returns the new array. **No update/delete function exists** — there is no code path to alter history. |
| View | `AuditLogPage.tsx` | Read-only, gated by `auditLog:view` |
| Load | `loadAuditLog()` | Falls back to `[]` |

### Products (`src/lib/products.ts`)

| Operation | Function | Notes |
|---|---|---|
| Load products | `loadProducts()` | Falls back to `defaultProducts` seed data |
| Save products | `saveProducts(products)` | Full-array overwrite, called after every create/edit/archive/delete/duplicate |
| Load categories | `loadCategories()` | Falls back to `defaultCategories` |
| Save categories | `saveCategories(categories)` | Full-array overwrite |

Product CRUD itself happens in `src/pages/products/ProductsPage.tsx` (`handleCreate`, `handleUpdate`, `handleArchiveToggle`, `handleDelete`, `handleDuplicate`) — these mutate the in-memory array and call `onProductsChange`, which is wired to `saveProducts` in `App.tsx`. No dedicated "API function" per operation; it's direct state manipulation.

### Quotations (`src/lib/quotes.tsx`, orchestrated from `src/pages/quotation/QuotationPage.tsx`)

| Operation | Where | Notes |
|---|---|---|
| List/filter quotes | `QuoteList.tsx` | Client-side filter over the `quotes` array (now persisted, `tcs_erp_quotes`) |
| Create quote | `handleSave` in `QuotationPage.tsx`, `mode === "new"` | Generates ID via `nextQuoteId(quotes)`, prepends to array, stamps `createdByUserId: currentUser.id`, `approvalHistory: []`, status always `"ร่าง"` |
| Update quote (fields only) | `handleSave` in `QuotationPage.tsx`, `mode === "detail"` | Merges edited fields, **status is explicitly excluded** (`status: q.status`) — field edits can never sneak a status change through the regular Save path |
| Workflow transition | `handleWorkflowAction(action, comment)` in `QuotationPage.tsx` | The only way status changes: looks up `workflowTransitions[action]`, appends an `ApprovalHistoryEntry`, updates `Quote.status`, fires the matching `notify*` call(s), writes an audit entry. Gated by `computeQuotePermissions()` (permission + ownership) before the button is even shown. |
| Duplicate quote | `handleDuplicate` in `QuotationPage.tsx` | Clones with a fresh ID via `nextQuoteId`, fresh line/sub-detail IDs via `cloneLines()`, status forced to `"ร่าง"`, fresh `createdByUserId`/empty `approvalHistory` |
| Change interest flag | `setInterest` in `QuotationPage.tsx` | Updates `Quote.interest` in place |
| Print / PDF export | "พิมพ์ / PDF" button in `QuoteDocument.tsx` | Calls `window.print()`; no server-side PDF generation |

No dedicated validation layer — the only checks are: required fields with inline error text on the Setup Wizard/Sign-in/User Management/Product/Role forms, required comment on Reject/Customer-Reject/Cancel workflow actions, and numeric clamps (`min`/`max`) on quantity/price/discount inputs.

## Authentication

Client-checked only. `loadSession()`/`saveSession(userId)` (`src/lib/session.ts`) is the closest thing to a "token" — a plain `userId` string in `localStorage`, no expiry, no server to validate it against, trivially editable via devtools to impersonate any account. See [RBAC.md](./RBAC.md).

## Permission

`hasPermission(user, roles, permission)` (`src/lib/roles.ts`) gates every sidebar item, workflow action button, and admin page — but purely client-side. There is no server to re-check any of it, so this is display/workflow logic, not access control. See [RBAC.md](./RBAC.md) for the full model and its limitations.

## Errors

No error-handling layer exists because there's no network boundary to fail. Form validation shows inline red text (`text-[#e05252]`) next to the relevant field; there's no toast-based error reporting (only success toasts, via `components/Toast.tsx`).

## Future APIs (proposed, not implemented)

If/when the Phase 2 Next.js migration happens (see [ARCHITECTURE.md](./ARCHITECTURE.md)), the plan is:

- **Auth.js route handler** at `app/api/auth/[...nextauth]/route.ts` (Credentials provider, bcrypt password check, database sessions).
- **Server Actions**, not a REST/JSON API, for most mutations — e.g. `modules/admin/actions/createUser.ts`, each starting with a `requirePermission(permission)` guard, validating input with Zod, writing an `AuditLog` row, then `revalidatePath`.
- **Server Components / `queries/*.ts`** for reads — e.g. `modules/admin/queries/listUsers.ts` — direct Prisma calls in the Node runtime, not a client-fetched JSON endpoint.
- A coarse **`middleware.ts`** doing only "is there a session" checks (edge-safe, no Prisma at the edge); fine-grained permission checks happen in the page/action itself.

None of this exists in the repo today. Do not write code against it.
