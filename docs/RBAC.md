# RBAC (Role-Based Access Control)

## Current State: Real, Server-Enforced RBAC — Deployed and Live

As of 2026-07-09 this app's RBAC/user-management/approval-workflow/notification/audit-log system is **genuinely enforced server-side**, not a client-side simulation. The app is deployed at https://tcs-erp-nine.vercel.app on a real backend: Vercel Serverless Functions + MongoDB Atlas (see [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md), [DATABASE.md](./DATABASE.md)). The role/permission **model itself is unchanged** from the 2026-07-08 client-side build described further below — same 6 default roles, same 17-permission set, same UI. What changed is **where each check is enforced**:

- Every mutating API route calls `requireUser()`/`requirePermission()` (`api/_lib/auth.ts`) server-side, using the exact same `roleHasPermission()` function from `src/lib/roles.ts`, value-imported into the API layer (not reimplemented, not just mirrored). A client can no longer grant itself a permission, approve its own quotation, or write an audit log entry claiming to be someone else — the server checks the caller's real role, fetched fresh from MongoDB on every request, and rejects anything not allowed.
- Passwords are **real bcrypt hashes** (`bcryptjs`, cost 10) — the old `hashPassword()` non-cryptographic checksum is gone entirely, deleted, not just deprecated.
- Sessions are a **JWT in an httpOnly, secure, `sameSite=lax` cookie** (`tcs_erp_session`, 7-day expiry) — not a bare `localStorage` string. It cannot be read or forged by client-side JavaScript/devtools (httpOnly), and every request re-verifies it server-side and re-fetches the user's current `status`/`roleKey` from MongoDB, so a deactivated account is locked out on its very next request.
- All data (every account, every quote, every notification, the audit log) lives in a real shared MongoDB database, not one browser's `localStorage` — genuine multi-device, multi-session, multi-user support.

**What client-side permission checks (`hasPermission()`, sidebar filtering, button gating) remain**: exactly what they always were — a UX layer that hides controls a user shouldn't see. They are **not** the security boundary anymore (they never should have been treated as one, and now genuinely aren't): the server independently re-checks every mutation regardless of what the UI shows or hides. This is the correct, standard shape for a web app's RBAC (client = UX, server = enforcement) — no longer a "simulation" positioned to become that shape someday.

**Known, honest gaps** (not fixed, not hidden — see Known Gaps at the bottom of this file): no rate limiting on login attempts, no automated tests over the new API/permission layer, and no two-stage sequential approval (unchanged limitation from before, see Known Simplifications below).

### What's actually built

**Bootstrap** (`src/pages/SetupWizardPage.tsx`): if `loadUsers()` returns an empty array, the app shows a one-time Initial Setup Wizard instead of the sign-in screen. It collects Full Name, Employee ID, Username, Email, Password, Confirm Password, and creates the first `User` with the `super_admin` role. Once any user exists, the wizard never renders again — there is no public self-registration (the old `SignUpPage.tsx` was removed); every other account is created by an admin via User Management.

**Users** (`src/lib/users.ts`): a `User` is both the employee record and the account — `employeeId`, `fullName`, `username`, `email`, `passwordHash`, `phone`, `department`, `position`, `roleKey`, `status` (`active`/`inactive`), `profilePictureDataUrl`, `signatureDataUrl`. `employeeId`/`username`/`email` are enforced unique. **Position and Role are deliberately separate fields** — Position is a free-text job title (with suggestions: CEO, Director, General Manager, Sales Manager, Sales Executive, Engineer, HR, Accounting, Purchasing, Warehouse) with no bearing on permissions; Role is the RBAC role, assigned independently by an admin.

**Roles & Permissions** (`src/lib/roles.ts`, `src/lib/permissions.ts`): a flat 23-key `Permission` union — `dashboard:view`; `quotations:view/create/edit/delete/approve/reject/export`; `products:view/create/edit/delete/export`; `users:manage`; `roles:manage`; `company:manage`; `auditLog:view`; `companyProfiles:view/create/edit/archive/delete/setDefault` (added 2026-07-13, see "Company Profiles" below). Six default `Role`s ship out of the box:

| Role | `isSuperAdmin` | `isSystem` | Summary |
|---|---|---|---|
| Super Admin | ✅ | ✅ (undeletable) | Every permission, always — `roleHasPermission()` short-circuits to `true` regardless of the stored list |
| Administrator | — | ✅ (undeletable) | Manage users + full quotation/product CRUD + audit log view + view (not manage) company profiles. No `roles:manage`/`company:manage`. |
| Sales User | — | — | Create/edit/export quotations, no approve/reject. Maps to the request's "Sales Executive." |
| Approver Level 1 | — | — | View/edit/approve/reject quotations. Maps to "Sales Manager." |
| Approver Level 2 | — | — | Same rights as Level 1 in this build (see Known Simplifications below). Maps to "CEO." |
| Viewer | — | — | `*:view` only. |

**No new permission was added for the 2026-07-10 Job Type / Executive Dashboard pass.** `GET /api/jobtypes` reuses `quotations:view` (already required to touch a quote); `POST`/`PATCH /api/jobtypes` reuse `company:manage` (Super Admin only, matching the existing precedent for company-wide configuration data like bank/VAT/T&C). `GET /api/dashboard` continues to reuse `dashboard:view`, which every default role already has — two of its response sections (`activityTimeline`, `approvalDashboard`) are additionally gated per-caller by the `auditLog:view`/`quotations:approve` the caller already has, rather than a new dashboard-specific permission.

### Company Profiles (added 2026-07-13)

6 new permissions — `companyProfiles:view/create/edit/archive/delete/setDefault` — gate the new
multi-company-issuer master-data module (see [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md)).
**Unlike `company:manage`, these are deliberately not added to `SUPER_ADMIN_ONLY_PERMISSIONS`** —
the request explicitly wants Administrator (or a custom role) to be grantable
create/edit/archive/setDefault access via the normal Role Management permission matrix, not
structurally locked to Super Admin the way company-wide settings are. `defaultRoles`'
Administrator entry ships with `companyProfiles:view` only out of the box; broader access is an
explicit grant a Super Admin makes via Role Management, not automatic. Sales/Approver/Viewer
roles get none of these six by default — per the request, "Normal Sales users should not manage
company profiles," though a future Quotation-form integration may eventually need its own
distinct permission for *selecting* (not managing) a company profile when issuing a quote — not
built yet, see [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) "Future Quotation
Integration."

Every route in `api/handlers/company-profiles.ts` calls `requirePermission()` server-side with the
matching permission — same enforcement posture as every other module, genuinely unbypassable via
devtools. `companyProfiles:delete` is defined (matching the request's literal permission list) but
isn't wired to any additional route: this module's only "delete" is the reversible archive action
(`companyProfiles:archive`), matching the pre-existing Category/Job Type precedent of no
hard-delete route — see API.md/DATABASE.md for the full reasoning.

**Quotation-issuer selection (added 2026-07-13, Quotation integration pass)**: a Sales user holds
`quotations:create` but not `companyProfiles:view` by default (see above), yet the Quotation
form's "ออกใบเสนอราคาในนามบริษัท" selector needs to read the list of active companies to populate
its dropdown. Rather than granting `companyProfiles:view` to Sales by default (which would also
unlock the Company Profiles management page itself, not just quotation issuer selection),
`GET /api/company-profiles` was relaxed to accept **either** `companyProfiles:view` **or**
`quotations:create` — see [API.md](./API.md). A caller with only `quotations:create` gets a
narrower, server-filtered response (active and not-deleted profiles only, no archived/inactive
ones), so a Sales user can select an issuing company without being able to see or manage anything
they couldn't already see via the selector itself. Selecting a company profile on a quote does not
require any of the six Company Profile management permissions — only `quotations:create`/`edit`
(whichever already gates the quote itself) plus this relaxed read access. Changing which company a
quote is issued under is further restricted to quotes still in Draft status — see
[MODULES/Quotation.md](./MODULES/Quotation.md) "Issuer Company" and [API.md](./API.md)'s
`PATCH /api/quotes/:id` row — enforced server-side, not just hidden client-side.

**Independently confirmed 2026-07-13 (tenth same-day pass)**: a follow-up Codex review of this
module found **zero Critical issues** in this RBAC enforcement — every exposed route was already
correctly gated. Its 3 High Priority findings were data-integrity/audit-integrity gaps, not RBAC
gaps: a current default profile could be deactivated without reassignment, the one-default
invariant had no database-level guarantee (fixed with a partial unique index, see
[DATABASE.md](./DATABASE.md)), and Company Profile audit entries were client-authored via the
generic `POST /api/audit-log` rather than server-authoritative. All three fixed — the last one the
same way the 2026-07-10 quotation audit-integrity fix worked: a `writeCompanyProfileAuditEntry()`
helper writes every mutation's audit entry inside the handler itself, and `POST /api/audit-log` now
rejects the `"โปรไฟล์บริษัท"` module outright (see [API.md](./API.md)/[AuditLog.md](./MODULES/AuditLog.md)).
Separately, the same review's Medium-severity, "needs runtime verification" hedge on whether the
app's boot sequence handles users lacking `companyProfiles:view` correctly turned out to be a real,
more severe bug than described: it broke sign-in entirely for every role except Super
Admin/Administrator. Fixed in `App.tsx` — see CHANGELOG.md for the full writeup; not itself an RBAC
enforcement gap (the 403 was the *correct* server response), but a client resilience gap in how the
app reacted to it.

Admins can create additional custom roles and edit any non-system role's permission checkboxes via Role Management (`src/pages/admin/RoleManagementPage.tsx`) — gated client-side by `userIsSuperAdmin()`, and **independently re-enforced server-side**: `POST`/`PATCH`/`DELETE /api/roles*` all require the `roles:manage` permission (`api/handlers/roles.ts`), which only the Super Admin role holds (see below), and the server strips any `roles:manage`/`company:manage` permission from a submitted permission list regardless of what the client sent, so there is no way — UI or direct API call — to grant them elsewhere. `roles:manage` and `company:manage` are additionally hardcoded in `SUPER_ADMIN_ONLY_PERMISSIONS` (`permissions.ts`) and `isPermissionLockedToSuperAdmin()` (`src/lib/roles.ts`, the same function used both client- and server-side) — the permission-matrix checkboxes for those two are disabled/locked for every role except Super Admin itself in the UI, and the server independently refuses to persist them onto any other role even if a request is crafted by hand.

**System-role locking, precise as of the 2026-07-09 fix**: the **Super Admin** role (`isSuperAdmin: true`) is fully read-only — name, description, and permissions can never change via `PATCH`, and it can't be deleted. **Administrator** (`isSystem: true` but `isSuperAdmin: false`) is *editable* — its description and permission checkboxes can be changed like any custom role, only its **name** is locked (can't be renamed) and it can't be deleted. Both the client (`RoleManagementPage.tsx`'s `startEdit()`/`nameLocked`) and server (`api/handlers/roles.ts`'s `handleOne()`) key this off `isSuperAdmin` for the edit lock and `isSystem` for the delete lock — **not** off `isSystem` alone for editing, which was a real bug: it previously made the entire Administrator role read-only (including permissions), identical to Super Admin, when only the name should have been locked. Custom (non-`isSystem`) roles remain fully editable and deletable (if unassigned).

### Sidebar / Menu Visibility

`App.tsx`'s `navItems` array carries an optional `permission` field per entry; `hasPermission(currentUser, roles, item.permission)` filters the rendered list — **items are fully removed from the DOM, not just disabled**, satisfying "hide inaccessible menus completely." A render-time `effectiveNav` guard (not a `useEffect`, to avoid a setState-in-effect cascade) falls back to the Dashboard if `activeNav` somehow points at a module the current user can't see. `Settings` is always visible (every signed-in user can edit their own profile); only its Company tab is conditionally rendered, gated by `company:manage`.

### Quotation Approval Workflow

`QuoteStatus` (`src/lib/quotes.tsx`) has 9 values: `ร่าง` (Draft) → `รออนุมัติ` (Pending Approval) → `อนุมัติแล้ว` (Approved) → `ส่งให้ลูกค้าแล้ว` (Sent to Customer) → `ลูกค้ายอมรับ` (Customer Accepted) → `ปิดการขายสำเร็จ` (Won), or `ลูกค้าปฏิเสธ` (Customer Rejected) → `เสียโอกาส` (Lost); plus a standalone `ยกเลิก` (Cancelled) reachable from Draft/Pending/Approved. `workflowTransitions` encodes the state machine (`{action: {from: QuoteStatus[], to: QuoteStatus}}`). `computeQuotePermissions(quote, isNew, currentUser, roles)` derives which action buttons a given user may see for a given quote, combining permission checks with an **ownership** check (`quote.createdByUserId === currentUser.id`, with approvers/admins allowed to touch quotes they don't own) — this remains client-side, display-only logic. `POST /api/quotes/:id/workflow` independently re-derives and re-checks the same permission + ownership rule server-side via `isWorkflowActionAllowed()` (`api/_lib/quoteWorkflow.ts`, a deliberately duplicated copy of `workflowTransitions`/`ApprovalAction` from `quotes.tsx` — see [ARCHITECTURE.md](./ARCHITECTURE.md) for why it's a duplicate, not an import) and validates the requested transition's `from` state against the quote's actual current status in MongoDB before applying it — a devtools-triggered call to approve a quote you don't have permission for, or to skip a status, is rejected with a `403`/`400` server-side, not just hidden client-side. Every transition appends an `ApprovalHistoryEntry` (`userId`, `userName`, `roleName`, `action`, `comment`, `createdAt`, all server-derived from the authenticated session) to `Quote.approvalHistory` — **never removed, only appended**, rendered on the document as "ประวัติการอนุมัติ." Reject/Customer-Reject/Cancel require a non-empty comment via a modal; other transitions allow an optional one.

**Known simplification**: the two approver roles (Level 1/Level 2) are not sequenced — either can independently approve or reject a quote in "รออนุมัติ." A real two-stage gate (Level 1 must approve before Level 2 can) was not requested by name in the given status diagram (a single "Pending Approval" step) and was scoped out; see [TODO.md](./TODO.md).

### Signature Integration

`QuoteDocument.tsx` looks up the preparer's `User` record via `quote.createdByUserId` and the approver's via the most recent `approved` entry in `approvalHistory`, then renders `user.signatureDataUrl` (uploaded in Settings → Profile, same `ImageUploadField` pattern as the company logo/stamp) as an image on the signature block. If no signature is set, it falls back to the existing blank signature line — **no error is ever shown**, per spec.

### Notifications

`src/lib/notifications.ts` + `src/components/NotificationBell.tsx`. The bell shows no badge at 0 unread, a red badge with the count otherwise (capped display at "99+"). `GET /api/notifications` filters **server-side** to the caller's own notifications (`recipientUserId === ctx.user.id`) — a genuine fix over the pre-migration client-side-only filtering, where every user's notifications lived in every other user's browser memory. There is deliberately no generic "create notification" endpoint; creation only happens server-side, inside `POST /api/quotes/:id/workflow`, as a side effect of a status transition. Delivery is role-based, not broadcast: submitting a quote notifies every active user holding `quotations:approve` (plus every active `approver_2` user if the quote total is ≥ `HIGH_VALUE_THRESHOLD`, ฿500,000); approve/reject/customer-accept/customer-reject notify the quote's creator. Clicking a notification marks it read and navigates to the quotation module (not yet the specific record — see [TODO.md](./TODO.md)).

### Audit Log

`src/lib/auditLog.ts` calls `POST /api/audit-log`, which always derives `userId`/`userName`/`roleName` from the authenticated session server-side — **never** from the request body, so a client can describe what happened but can never forge who did it. There is no update or delete route at all, so there is no code path for any user (including Super Admin) to alter history, via the UI or a direct API call. Recorded actions include Login/Logout, User Created/Updated/Activated/Deactivated/Deleted, Password Reset, Profile Updated, Company Settings Updated, Role Changed/Permission Changed, and the full quotation lifecycle (Created/Submitted/Approved/Rejected/Status Changed). `AuditLogPage.tsx` self-fetches via `useEffect` (not part of the universal boot-time fetch) and is read-only — `GET /api/audit-log` requires `auditLog:view` server-side.

---

## What Was Achieved vs. the Old "Proposed Future RBAC" Design

Before the 2026-07-09 migration, this file described a hypothetical "Phase 2" (Next.js/Prisma/Postgres/Auth.js) design as the only way to get real server-enforced RBAC. That specific stack was never built (see [ARCHITECTURE.md](./ARCHITECTURE.md) "Superseded" section) — but the *goal* it described (server-side enforcement, real password hashing, real session revocation) **was achieved**, via a different, simpler stack (Vercel Functions + MongoDB). Comparing point-by-point:

| Old proposal | What actually shipped (2026-07-09) | Equivalent? |
|---|---|---|
| Roles: fixed 9-value `RoleKey` enum (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `SALES`, `ACCOUNTING`, `WAREHOUSE`, `PURCHASING`, `HR`, `EMPLOYEE`) | The existing 6-role set (Super Admin, Administrator, Sales User, Approver Level 1/2, Viewer) — unchanged, stored as MongoDB documents in the `roles` collection, seeded from `defaultRoles` | **Not adopted** — the 9-role enum was never built; the simpler 6-role set was kept as-is and migrated to MongoDB unchanged |
| Permissions: granular DB-stored keys (e.g. `"admin.users.manage"`) via a `RolePermission` many-to-many join, admin-regrantable without a deploy | The existing flat 17-key `Permission` TypeScript union (`src/lib/permissions.ts`), with each role's `permissions: Permission[]` stored as an array field on its MongoDB document | **Partially equivalent** — permissions are admin-regrantable via Role Management without a deploy (the goal was met), but the permission *keys themselves* are still a hardcoded TypeScript union, not admin-creatable rows; adding a wholly new permission still requires a code change |
| Protected routes: `middleware.ts` session check + `requirePermission()` in every server action, unbypassable by URL or devtools | `requireUser()`/`requirePermission()` (`api/_lib/auth.ts`) in every mutating API route handler, same effect | **Equivalent** — genuinely unbypassable server-side enforcement, just implemented as per-route guards in Vercel Functions instead of Next.js middleware + Server Actions |
| Sidebar: one `can()` function imported both client- and server-side | Client: `hasPermission()`/`userIsSuperAdmin()` (`src/lib/roles.ts`) filters the sidebar, display-only. Server: `roleHasPermission()` (same file, same logic, different exported name) is value-imported into `api/_lib/auth.ts` and used for real enforcement | **Equivalent in spirit** — one shared source of truth for the permission-checking *logic*, imported into both the client bundle and the server functions, so the two can't drift out of sync — just two exported function names (`hasPermission` client-facing wrapper, `roleHasPermission` the shared core) rather than one identical `can()` |
| Passwords: bcrypt, cost factor 12, server-side only | bcrypt (`bcryptjs`), **cost factor 10**, server-side only (`api/_lib/auth.ts`) | **Equivalent in kind, lower cost factor** — real bcrypt hashing either way; 10 vs. 12 is a deliberate-or-default tradeoff not explicitly revisited during migration, worth a look if login latency budget allows raising it |
| Sessions: database-backed (Auth.js + Prisma adapter), chosen specifically so disabling a user force-invalidates their session immediately | **JWT** in an httpOnly/secure/`sameSite=lax` cookie, 7-day expiry — *not* database-backed | **Practically equivalent, mechanically different**: every request re-fetches the user fresh from MongoDB and checks `status === "active"` (`getAuthContext()`), so a deactivated user is locked out on their very next request, matching the old proposal's user-facing goal. But this is not true session revocation — the JWT itself remains cryptographically valid until its natural 7-day expiry; there is no server-side deny-list, so a scenario like "steal a valid JWT, then get the account deactivated" doesn't fully close that stolen token's window the way deleting a database `Session` row would. Low risk in practice (the token is httpOnly and never exposed to XSS-readable JS), but worth knowing this is a real, if narrow, gap vs. the original design intent. |
| `SUPER_ADMIN`/`ADMIN` rows read-only in the permission-matrix UI | Only Super Admin is fully read-only; Administrator's permissions/description are editable (name locked, undeletable) — both client and server independently enforce this per-field lock, not a blanket `isSystem` read-only (see the system-role-locking note above; a bug that over-locked Administrator entirely was found and fixed 2026-07-09) | **Exceeded** — the old proposal only specified blanket UI-level protection for both system rows; the real implementation is more precise (Administrator stays configurable) and adds an independent server-side guard the proposal didn't explicitly call for |
| Every sensitive mutation writes an `AuditLog` row via a shared helper | `logAudit()` → `POST /api/audit-log`, server-derives the actor identity, append-only, no update/delete route | **Exceeded** — the old proposal didn't specify actor-spoofing protection; the real implementation added it (server never trusts client-claimed identity) |

## Known Gaps (honest, current, not hidden)

- **No rate limiting on `POST /api/auth/login`** — a scripted brute-force attempt against a known username isn't throttled. Should be closed before this app is exposed beyond a trusted internal network. See [TODO.md](./TODO.md).
- **No true session revocation** — see the Sessions row above. A stolen, still-valid JWT is not immediately invalidated by an admin action (only future requests from a *deactivated* account are blocked; a still-active account's leaked token remains usable until natural expiry).
- **No automated tests** over the new API/permission layer — every guard described above was manually verified during the migration, not covered by a test suite. See [TODO.md](./TODO.md).
- **Sequential two-level approval** (Approver Level 1 must approve before Level 2 can) is still not implemented — unchanged limitation from the pre-migration build, see Known Simplifications above. This was never blocked on the backend migration; it's a product decision, not a security gap.
- **bcrypt cost factor is 10**, not the 12 originally proposed — not necessarily wrong (10 is bcryptjs's own reasonable default), but not a value that was deliberately chosen during migration either; worth a conscious revisit.
- **A MongoDB Atlas database-user password was pasted into an AI chat session** during this migration's development. A credential rotation was recommended to the user as a follow-up; whether it has been done cannot be verified from the codebase. Flagged in [PROJECT_STATUS.md](./PROJECT_STATUS.md) Known Risks and [TODO.md](./TODO.md) as an unresolved action item.
- **`GET /api/users`/`GET /api/roles` are open to any authenticated user**, not gated by `users:manage`/`roles:manage` — flagged Medium by the 2026-07-10 Codex review, re-assessed rather than blindly restricted (see the comments in `api/handlers/users.ts`/`roles.ts`): role documents carry no PII so there's no privacy tradeoff there, and the user directory's PII fields (phone/email/pictures/signatures) are genuinely relied on app-wide (printed-quote signatures, salesperson pickers) in ways that would need a full consumer trace before safely narrowing — tracked as a business-decision item in [TODO.md](./TODO.md) rather than guessed at.
- **Quote payload validation was added 2026-07-10** (`api/_lib/quoteValidation.ts`) closing a real gap where `POST`/`PATCH /api/quotes` and the workflow-draft merge previously copied client fields into MongoDB with no type/bounds/date checking and trusted a client-supplied `amount`/`jobTypeName` — this was an authorization-adjacent data-integrity gap (an *authorized* caller could corrupt business data or the Dashboard's totals), not a bypass of who's allowed to write, which was already correctly enforced.

### Not carried over from the superseded proposal

A few pieces of the old Next.js/Prisma design were never built and have no equivalent today — listed here so a future reader doesn't assume they exist:

- **Per-module `manifest.ts` + `module-registry.ts` sidebar declaration pattern** — the sidebar is still the same flat `navItems` array in `App.tsx` filtered by `hasPermission()`, unchanged by the migration.
- **`departmentScope(user)` data-level scoping for a `MANAGER` role** — no `Department` entity or manager-scoped query filtering exists. The only data-level scoping in this app remains the much narrower **ownership** check on quotations (`Quote.createdByUserId`), now enforced both client- and server-side (see Quotation Approval Workflow above).
- **9-role `RoleKey` enum** and any notion of per-department role splits — the 6-role set was kept as-is (see the comparison table above).

None of the above exists in this repo. Do not write code that assumes a `Department` collection, a `manifest.ts`/`module-registry.ts` pattern, or a 9-role enum exists. `hasPermission()`/`userIsSuperAdmin()`/`roleNameFor()`/`roleHasPermission()` in `src/lib/roles.ts` are the real, working, shared-client-and-server implementation for everything RBAC-related today.
