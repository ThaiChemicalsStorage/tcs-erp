# RBAC (Role-Based Access Control)

## Current State: Real, Server-Enforced RBAC — Deployed and Live

As of 2026-07-09 this app's RBAC/user-management/approval-workflow/notification/audit-log system is **genuinely enforced server-side**, not a client-side simulation. The app is deployed at https://tcs-erp-nine.vercel.app on a real backend: Vercel Serverless Functions + MongoDB Atlas (see [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md), [DATABASE.md](./DATABASE.md)). The role/permission **model itself is unchanged** from the 2026-07-08 client-side build described further below — same 6 default roles, same 17-permission set, same UI. What changed is **where each check is enforced**:

- Every mutating API route calls `requireUser()`/`requirePermission()` (`api/_lib/auth.ts`) server-side, using the exact same `roleHasPermission()` function from `src/lib/roles.ts`, value-imported into the API layer (not reimplemented, not just mirrored). A client can no longer grant itself a permission, approve its own quotation, or write an audit log entry claiming to be someone else — the server checks the caller's real role, fetched fresh from MongoDB on every request, and rejects anything not allowed.
- Passwords are **real bcrypt hashes** (`bcryptjs`, cost 10) — the old `hashPassword()` non-cryptographic checksum is gone entirely, deleted, not just deprecated.
- Sessions are a **JWT in an httpOnly, secure, `sameSite=lax` cookie** (`tcs_erp_session`, 7-day expiry) — not a bare `localStorage` string. It cannot be read or forged by client-side JavaScript/devtools (httpOnly), and every request re-verifies it server-side and re-fetches the user's current `status`/`roleKey` from MongoDB, so a deactivated account is locked out on its very next request.
- All data (every account, every quote, every notification, the audit log) lives in a real shared MongoDB database, not one browser's `localStorage` — genuine multi-device, multi-session, multi-user support.

**What client-side permission checks (`hasPermission()`, sidebar filtering, button gating) remain**: exactly what they always were — a UX layer that hides controls a user shouldn't see. They are **not** the security boundary anymore (they never should have been treated as one, and now genuinely aren't): the server independently re-checks every mutation regardless of what the UI shows or hides. This is the correct, standard shape for a web app's RBAC (client = UX, server = enforcement) — no longer a "simulation" positioned to become that shape someday.

**Known, honest gaps** (not fixed, not hidden — see Known Gaps at the bottom of this file): API-route-level test coverage is still partial (the permission RULES now have real tests as of 2026-07-29, the per-route HTTP guards mostly don't — see Known Gaps), and no two-stage sequential approval (unchanged limitation from before, see Known Simplifications below). Login rate limiting was a long-standing member of this list until **2026-07-29** — now closed, see Known Gaps.

### What's actually built

**Bootstrap** (`src/pages/SetupWizardPage.tsx`): if `loadUsers()` returns an empty array, the app shows a one-time Initial Setup Wizard instead of the sign-in screen. It collects Full Name, Employee ID, Username, Email, Password, Confirm Password, and creates the first `User` with the `super_admin` role. Once any user exists, the wizard never renders again — there is no public self-registration (the old `SignUpPage.tsx` was removed); every other account is created by an admin via User Management.

**Users** (`src/lib/users.ts`): a `User` is both the employee record and the account — `employeeId`, `fullName`, `username`, `email`, `passwordHash`, `phone`, `department`, `position`, `roleKey`, `status` (`active`/`inactive`), `profilePictureDataUrl`, `signatureDataUrl`. `employeeId`/`username`/`email` are enforced unique. **Position and Role are deliberately separate fields** — Position is a free-text job title (with suggestions: CEO, Director, General Manager, Sales Manager, Sales Executive, Engineer, HR, Accounting, Purchasing, Warehouse) with no bearing on permissions; Role is the RBAC role, assigned independently by an admin.

**Roles & Permissions** (`src/lib/roles.ts`, `src/lib/permissions.ts`): a flat 37-key `Permission` union — `dashboard:view`; `quotations:view/viewAll/create/edit/delete/approve/reject/export` (`:viewAll` added 2026-07-22, see "Quotation Own-Quotes-Only Viewing" below); `products:view/create/edit/delete/export`; `users:manage`; `roles:manage`; `company:manage`; `auditLog:view`; `customers:view/create/edit/archive` (added 2026-07-14, see "Customers" below); `quotationTemplates:manage/view/create/edit/duplicate/activate/archive/import` (`:manage` added 2026-07-14, the other 7 granular ones added 2026-07-15, see "Quotation Templates" below); `scopeOfWork:view/viewAll/create/edit/finalize/print/delete` (`:viewAll` added 2026-07-23, see "Scope of Work Own-Records-Only Viewing" below; the other 6 added 2026-07-15, see "Scope of Work" below). (The union briefly had 27 keys, 2026-07-13–14, while `companyProfiles:view/create/edit/archive/delete/setDefault` existed for the now-removed Company Profiles module — see "Company Profiles" below.) Six default `Role`s ship out of the box:

| Role | `isSuperAdmin` | `isSystem` | Summary |
|---|---|---|---|
| Super Admin | ✅ | ✅ (undeletable) | Every permission, always — `roleHasPermission()` short-circuits to `true` regardless of the stored list |
| Administrator | — | ✅ (undeletable) | Manage users + full quotation/product/customer CRUD + audit log view + full Quotation Template management (all 8 `quotationTemplates:*` permissions, `:manage` added 2026-07-14, the 7 granular ones added 2026-07-15) + full Scope of Work access (all 7 `scopeOfWork:*` permissions, incl. `:viewAll` added 2026-07-23). No `roles:manage`/`company:manage`. |
| Sales User | — | — | Create/edit/export quotations + view/create/edit customers, no approve/reject/archive. Also `scopeOfWork:view/create/edit/print` — can create/edit a Scope of Work from a quotation they can access and print it, but not finalize or delete one. **Does not hold `quotations:viewAll` or `scopeOfWork:viewAll`** — only sees quotations/Scope of Work records it created itself (see the two "Own-Records-Only Viewing" sections below). Maps to the request's "Sales Executive." |
| Approver Level 1 | — | — | View/edit/approve/reject quotations + view customers. Also `scopeOfWork:view/viewAll/edit/finalize/print` (no `:create`/`:delete` — edits/finalizes Sales' drafts rather than starting new ones; `scopeOfWork:viewAll` added 2026-07-23, alongside the pre-existing `quotations:viewAll` — an Approver must be able to see everyone's records to act on them). Maps to "Sales Manager." |
| Approver Level 2 | — | — | Same rights as Level 1 in this build, including the same Scope of Work grants (see Known Simplifications below). Maps to "CEO." |
| Viewer | — | — | `*:view` only (incl. `customers:view`, `scopeOfWork:view`), plus `quotations:viewAll`/`scopeOfWork:viewAll` — a read-only role that can't act on anything still needs to be able to *see* everything to be useful as a viewer. |

**No new permission was added for the 2026-07-10 Job Type / Executive Dashboard pass.** `GET /api/jobtypes` reuses `quotations:view` (already required to touch a quote); `POST`/`PATCH /api/jobtypes` reuse `company:manage` (Super Admin only, matching the existing precedent for company-wide configuration data like bank/VAT/T&C). `GET /api/dashboard` continues to reuse `dashboard:view`, which every default role already has — two of its response sections (`activityTimeline`, `approvalDashboard`) are additionally gated per-caller by the `auditLog:view`/`quotations:approve` the caller already has, rather than a new dashboard-specific permission.

**No new permission was added for Global Search either (added 2026-07-14).** `GET /api/search` is
reachable by any authenticated user — RBAC happens *per result category*, not at the route level:
`quotations` needs `quotations:view`, `customers` needs `customers:view`, `products` needs
`products:view`, `scopeOfWorks` needs `scopeOfWork:view` (added 2026-07-15, Codex review High
Priority fix — see "Scope of Work" below), `users` needs `users:manage` (the same permission the
User Management page itself requires), and the static `pages`/menu-search category is filtered per
entry against whichever
permission that page's sidebar item already requires (`null` = always visible, e.g. Settings/
Profile). Every check is `roleHasPermission()` called server-side inside
`api/_lib/searchHandler.ts` **before** that category's MongoDB query even runs — a category the
caller lacks permission for never executes its query and comes back as an empty array, identical
in shape to a genuine zero-result search. This is the same "hiding a result in the UI is not
enough" principle the Dashboard's permission-gated sections (`activityTimeline`/`approvalDashboard`
above) already follow: the actual data never leaves the server for an unauthorized caller, so a
compromised or modified frontend can't reveal anything the server itself wouldn't already refuse
to return. Clicking a search result still lands on a page/action gated by that page's own existing
permission checks (e.g. a Users search result still requires `users:manage` to actually reach
`UserManagementPage`) — search result visibility and destination-page access enforce the same
permission by construction, not by two independently-maintained rules that could drift apart.

**Independent Codex review confirmation (2026-07-14, same day)**: an audit of Global Search's RBAC
found **zero Critical issues** — "User data is queried only when `users:manage` is held, and all
business-result categories are filtered before their MongoDB searches run." One Medium-severity UX
inconsistency was found and fixed: a Customer search result deep-linked into the editable
`CustomerFormModal` regardless of whether the caller held `customers:edit`, bypassing the same gate
`CustomersPage.tsx`'s own list UI already respects for its edit button. **Not a security bypass**
(the server's `requirePermission(req, "customers:edit")` on `PATCH /api/customers/:id` already
rejected an unauthorized save either way — this was a client-side UX gap, not an enforcement gap)
but confusing, since it presented an edit affordance unreachable through the page's normal
controls. Fixed by only opening the edit form when `canEdit` is true; a view-only searcher now
lands on the filtered list instead. See CHANGELOG.md and `CODEX_REVIEW_REPORT.md`'s "Claude Fix
Status" for the full writeup.

### Company Profiles — REMOVED 2026-07-14

6 permissions (`companyProfiles:view/create/edit/archive/delete/setDefault`) gated the multi-issuer-
company master-data module added 2026-07-13, briefly (and incorrectly) wired into the Quotation
form as an issuer-company selector, then fully removed from the user-facing ERP on 2026-07-14 — this
ERP only ever needs one issuer company. All six permission keys are gone from the `Permission`
union/`ALL_PERMISSIONS`/`PERMISSION_GROUPS` and from the Administrator default role's permission
list. **Any custom role that already had one of these six permissions stored keeps it** — a
harmless, meaningless legacy string, since `api/handlers/roles.ts` never validated `permissions`
arrays against `ALL_PERMISSIONS` and nothing checks for these keys anymore. See
[MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) for the full removal writeup.

### Customers (added 2026-07-14)

4 new permissions — `customers:view/create/edit/archive` — gate the Customer master-data module
(see [MODULES/Customer.md](./MODULES/Customer.md)), built as the correction to the removed
issuer-company feature above. **Not** Super-Admin-locked, matching the Company Profiles precedent.
`defaultRoles`: Administrator gets all four; Sales User gets view/create/edit (no archive — matches
their day-to-day "add and maintain customer records" workflow without granting the ability to
remove one); Approver 1/2 and Viewer get view-only.

Every route in `api/_lib/customersHandler.ts` calls `requirePermission()` server-side with the
matching permission. Same "manage vs. pick-for-a-quotation" carve-out as Company Profiles:
`GET /api/customers`/`GET /api/customers/:id` accept **either** `customers:view` **or**
`quotations:create` — a Sales user without `customers:view` (not the default grant here, but
possible on a custom role) can still search customers to autofill a quotation via the Quotation
form's `CustomerSelector`, getting a narrower, server-filtered response (active and not-deleted
only). Selecting a customer on a quote does not require any of the four Customer management
permissions — only `quotations:create`/`edit` (whichever already gates the quote itself) plus this
relaxed read access. Changing which customer a quote is linked to is further restricted to quotes
still in Draft status — see [MODULES/Quotation.md](./MODULES/Quotation.md) "Customer Selection" and
[API.md](./API.md)'s `PATCH /api/quotes/:id` row — enforced server-side, not just hidden
client-side. `customers:archive` (not granted to Sales User by default) gates the one form of
"delete" this module has, same reversible-archive precedent as Company Profiles/Categories/Job
Types — no separate `customers:delete` permission exists (unlike Company Profiles, which defines
one it doesn't wire to a route, matching an older literal request; Customers wasn't asked to define
one, so it doesn't).

*(Historical note: a 2026-07-13 Codex review of the then-live Company Profiles module's RBAC
enforcement found zero Critical issues and 3 High Priority data/audit-integrity gaps, all fixed
same day — see CHANGELOG.md if that history is ever needed. The module itself was removed
2026-07-14, so this no longer describes any live route.)*

### Quotation Templates (added 2026-07-14, expanded to 8 permissions 2026-07-15, product-linkage integrity fixed 2026-07-15)

**2026-07-15, second Codex-review fix pass — inactive-template policy explicitly reconfirmed, not
changed**: an independent review of the Template Management pass flagged that
`validateQuotationTemplate()` (`api/_lib/quoteValidation.ts`) lets a currently-*inactive*-but-not-
deleted template still be attached to a brand-new quote, and asked that this be "explicitly accepted
or constrained." This is the explicit accept: it's intentional, not a gap — a Sales user who started
a quote from a template that an Admin deactivated moments later should never have their in-progress
work retroactively invalidated. Only `isDeleted` (a real delete/archive) disqualifies a match; the
Sales-facing browse/preview UI still only ever offers `isActive: true` templates, so this only
matters for a template deactivated *during* an in-progress draft, or a direct API call bypassing the
UI (which is still fully RBAC-gated regardless). No code change accompanies this entry — it's a
formal decision record. Same pass: template item product links (`productId`/`productSnapshot`) are
now server-resolved/server-verified rather than trusted from the client — see
[MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) "Product and Custom Item Review"
— a data-integrity fix inside the already-correctly-permission-gated content-edit routes, not a
permission-model change.

**2026-07-15**: the original single `quotationTemplates:manage` permission is now a **documented
backward-compatible superset** — every server-side check accepts `:manage` OR the specific granular
permission an action needs, so a pre-existing role assignment that only ever held `:manage` keeps
full access to every new action without an admin having to re-save it. 7 new granular permissions
were added for the Template Management admin module
(see [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) "Template Management Module"):

| Permission | Gates |
|---|---|
| `quotationTemplates:view` | The Template Management admin page/list itself (sees inactive + archived templates) — **not** the wizard's browse-to-pick-a-template access, which still uses `quotations:create` (see below). |
| `quotationTemplates:create` | `POST /api/quotation-templates` + the wizard's "สร้าง Template ใหม่สำหรับประเภทงานนี้" button. |
| `quotationTemplates:edit` | `PATCH /api/quotation-templates/:id` when the body changes any content field. |
| `quotationTemplates:duplicate` | `POST /api/quotation-templates/:id/duplicate`. |
| `quotationTemplates:activate` | `PATCH /api/quotation-templates/:id` when the body changes `isActive` relative to the persisted value. |
| `quotationTemplates:archive` | `PATCH /api/quotation-templates/:id` when the body changes `isDeleted` relative to the persisted value. |
| `quotationTemplates:import` | `POST /api/quotation-templates/import`. |

All 8 (including `:manage`) granted by default to the **Administrator** role —
**not** Super-Admin-exclusive (Super Admin already has every permission implicitly, via
`roleHasPermission()`'s short-circuit).

**Sales-facing template *browsing* (picking a template while starting a quotation) deliberately
still reuses the existing `quotations:create` permission** rather than `quotationTemplates:view` —
the same "manage vs. pick-for-a-quotation" carve-out already established for Customers
(`customers:view` vs. `quotations:create`) and, before that, Company Profiles.
`GET /api/quotation-templates` and `GET /api/quotation-templates/:id` accept **either**
`quotationTemplates:view`/`:manage` **or** `quotations:create`: a `:view`/`:manage` holder sees every
non-deleted template (active or not, plus archived ones via `?includeArchived=true`); a
`quotations:create`-only caller (e.g. Sales User, the default grant) gets a narrower,
server-filtered `isActive: true`-only response — exactly what the Create Quotation wizard's Job
Type/Template/Preview screens need and nothing more. `quotationTemplates:view` is deliberately a
*different, stronger* permission than `quotations:create` — it's what makes the Template Management
sidebar entry/page itself visible, so a plain Sales User (who only has `quotations:create`) can use
the wizard normally but never sees the admin module.

**Per-dimension enforcement on `PATCH`, not one blanket check**: a single request can touch content,
`isActive`, and `isDeleted` at once (the edit form always submits the full draft, `isActive`
included), but each dimension only pulls in its own required permission when its value *actually
changes* relative to the persisted document — compared server-side, not just by field presence. This
is what lets a plain `:edit` holder save unrelated content edits without also needing `:activate`,
while still blocking an `:edit`-only holder from sneaking a real activation through the same call.
See `handleOne`'s `touchesActive`/`touchesArchive` in `api/_lib/quotationTemplatesHandler.ts`.

Every route in `api/_lib/quotationTemplatesHandler.ts` (mounted from `api/handlers/jobtypes.ts` —
see [API.md](./API.md) "Quotation Templates") calls `requireUser()`/a local `requireAnyPermission()`
helper server-side with the matching check(s) above — never `requirePermission()`'s single-permission
form, since every mutating action here needs the `:manage`-OR-granular pattern. **Global Search's
`templates` result category** (see [DATABASE.md](./DATABASE.md)/[API.md](./API.md) "Global Search")
is gated by the identical `quotationTemplates:view`/`:manage` **or** `quotations:create` check,
applied the same way every other search category is — before that category's MongoDB query even
runs, not just hidden client-side.

**Audit logging (added 2026-07-15)**: every template lifecycle action (import/create/update/
duplicate/activate/deactivate/archive/unarchive) writes a server-side `AuditLogEntry` via
`writeTemplateAuditEntry()`, module `"Template ใบเสนอราคา"` — see
[DATABASE.md](./DATABASE.md) `AuditLogEntry`'s `relatedTemplateId`/`relatedTemplateName`/
`relatedJobTypeCode` fields. `POST /api/quotes`'s own audit entry now also distinguishes
"Quotation Created from Template" from "Quotation Created (Blank)".

**2026-07-20, FRP Lining v2.0 rolled back**: that pass introduced zero new permissions (it reused
these same `quotationTemplates:*`/`quotations:*` gates unchanged), so its `git revert` the same day
has no RBAC impact at all — every permission/gate documented above and below is unchanged.

Admins can create additional custom roles and edit any non-system role's permission checkboxes via Role Management (`src/pages/admin/RoleManagementPage.tsx`) — gated client-side by `userIsSuperAdmin()`, and **independently re-enforced server-side**: `POST`/`PATCH`/`DELETE /api/roles*` all require the `roles:manage` permission (`api/handlers/roles.ts`), which only the Super Admin role holds (see below), and the server strips any `roles:manage`/`company:manage` permission from a submitted permission list regardless of what the client sent, so there is no way — UI or direct API call — to grant them elsewhere. `roles:manage` and `company:manage` are additionally hardcoded in `SUPER_ADMIN_ONLY_PERMISSIONS` (`permissions.ts`) and `isPermissionLockedToSuperAdmin()` (`src/lib/roles.ts`, the same function used both client- and server-side) — the permission-matrix checkboxes for those two are disabled/locked for every role except Super Admin itself in the UI, and the server independently refuses to persist them onto any other role even if a request is crafted by hand.

**System-role locking, precise as of the 2026-07-09 fix**: the **Super Admin** role (`isSuperAdmin: true`) is fully read-only — name, description, and permissions can never change via `PATCH`, and it can't be deleted. **Administrator** (`isSystem: true` but `isSuperAdmin: false`) is *editable* — its description and permission checkboxes can be changed like any custom role, only its **name** is locked (can't be renamed) and it can't be deleted. Both the client (`RoleManagementPage.tsx`'s `startEdit()`/`nameLocked`) and server (`api/handlers/roles.ts`'s `handleOne()`) key this off `isSuperAdmin` for the edit lock and `isSystem` for the delete lock — **not** off `isSystem` alone for editing, which was a real bug: it previously made the entire Administrator role read-only (including permissions), identical to Super Admin, when only the name should have been locked. Custom (non-`isSystem`) roles remain fully editable and deletable (if unassigned).

### Scope of Work (added 2026-07-15, fixed against an independent Codex review the same day)

**2026-07-15, Codex review fix pass**: `refresh` previously only checked Scope of Work edit/
ownership authorization before reading the linked quotation, with no equivalent source-quotation
access check of its own (unlike `create`, which always required `quotations:view`). Fixed —
`refresh` now requires `quotations:view` too, closing that Medium Priority gap. See
`docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" and
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

6 permissions (7 as of 2026-07-23 — see "Scope of Work Own-Records-Only Viewing" below — and 8 as
of 2026-07-29, `scopeOfWork:chasePo`) gate the feature end-to-end, enforced server-side in
`api/_lib/scopeOfWorkHandler.ts` (never just hidden client-side):

| Permission | Gates |
|---|---|
| `scopeOfWork:view` | `GET /api/scope-of-works` (list — **2026-07-22**: now also gates the "list every Scope of Work company-wide" mode used by the new standalone Scope of Work sidebar page, not just the original by-quotation lookup) and `GET /api/scope-of-works/:id` (single record) — also required (alongside the action-specific permission below) to read the *source* record on duplicate/refresh, since those actions return/derive from its full content. **2026-07-23**: the "list every Scope of Work company-wide" mode is now additionally scoped by `scopeOfWork:viewAll` — see below; the by-quotation lookup, single-record `GET`, and duplicate/refresh's source-record read remain unaffected by `:viewAll` (deliberately — see below). |
| `scopeOfWork:viewAll` | Added **2026-07-23** — see "Scope of Work Own-Records-Only Viewing" below. |
| `scopeOfWork:create` | `POST /api/scope-of-works` (create from a quotation) and `POST /api/scope-of-works/:id/duplicate`. |
| `scopeOfWork:edit` | `PATCH /api/scope-of-works/:id` and `POST /api/scope-of-works/:id/refresh` — combined with an **ownership** check (see below). **2026-07-24**: also gates `POST /api/scope-of-works/:id/send-documents` ("ส่งอีเมลแจ้งผู้รับเอกสาร"), moved here from `scopeOfWork:print` on direct user report — a view/print-only role could fire the send while unable to pick recipients. The send itself carries **no** ownership check and works on `"Final"` records (it distributes, it doesn't edit). |
| `scopeOfWork:finalize` | **The approval authority (2026-07-24 approval workflow)**: `POST /api/scope-of-works/:id/finalize` (now "อนุมัติ" — only from `PendingApproval`, auto-fills the approver signatory) and `POST /:id/reject`. Direct Draft→Final no longer exists; submission (`/:id/submit-approval`) needs only the edit+ownership rule. No new permission was added — every role that could Finalize before can Approve now. Also, independent of ownership, a `scopeOfWork:finalize` holder can edit or delete *any* Draft record, not just their own — the RBAC spec's "Sales Manager: view/edit/finalize" language. |
| `scopeOfWork:print` | `POST /api/scope-of-works/:id/print` (writes the print/export audit entry the client calls right before `window.print()`; as of 2026-07-16 also revalidates completeness first — see below). It briefly (2026-07-23 → 2026-07-24) also gated `POST /api/scope-of-works/:id/send-documents` — that route moved to `scopeOfWork:edit` on 2026-07-24 (see the `scopeOfWork:edit` row above and [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients"). |
| `scopeOfWork:delete` | `DELETE /api/scope-of-works/:id` (soft delete) — combined with the same ownership-or-finalize check as edit. |
| `scopeOfWork:chasePo` | **Added 2026-07-29 (same day as the "ทวง PO" feature itself, on direct owner request)** — gates `POST /api/scope-of-works/:id/chase-po` and the "ทวงเลข PO" toolbar button. The feature originally shipped gated by `scopeOfWork:view` (anyone who could see the record could chase); the owner wants chasing to be an explicitly-granted right instead. Default grants: Administrator + Approver Level 1 + Approver Level 2 (+ Super Admin implicitly); Sales User deliberately not (the chase targets the salesperson), Viewer not (sending a notification isn't read-only). **Existing production roles need a manual Role Management tick like every other post-seed permission** — see TODO.md. |

**Ownership rule** (`canEditScope()`/`isOwnerOf()` in `api/_lib/scopeOfWorkHandler.ts`, same shape as
the Quotation workflow's owner-or-approver check below): a Sales user (`scopeOfWork:edit` but not
`:finalize`) can only edit/delete their **own** Draft records (`createdBy === caller.id`); a holder
of `scopeOfWork:finalize` (Approver/Administrator/Super Admin) can edit or delete anyone's. Once a
record's `status` is `"Final"`, `PATCH`/`refresh` are rejected outright for everyone (no un-finalize
route in this pass — "ทำสำเนา" is the documented way to keep editing from a copy).

**No dedicated `scopeOfWork:manage` superset** (unlike Quotation Templates' `:manage`) — the spec's
requested permission list was exactly the 6 above, so none was added; see
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

**2026-07-16, required-field validation pass**: no new permissions were introduced. The new
completeness gates reuse the exact same permissions that already gated each route —
`scopeOfWork:finalize` for `POST /:id/finalize`, `scopeOfWork:print` for `POST /:id/print`, and (for
Quotation) `quotations:export` for the new `POST /api/quotes/:id/print`, `quotations:edit`/
`:approve`/etc. (unchanged) for `POST /api/quotes/:id/workflow`. The gate is an additional
completeness check layered on top of the existing permission check, not a new authorization
dimension — a caller who already had permission to finalize/print/transition a document still does;
they just can no longer do so against an incomplete one. See
[MODULES/Quotation.md](./MODULES/Quotation.md)/[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md)
"Required-Field Validation" and API.md.

**Creating** a Scope of Work also requires `quotations:view` (the caller must be able to see the
source quotation at all) — enforced alongside `scopeOfWork:create`, not a separate permission.
**Refreshing** ("อัปเดตข้อมูลจากใบเสนอราคา") requires it too (2026-07-15 fix, see above), alongside
the usual edit/ownership check.

Default grants: **Sales User** gets `view/create/edit/print` (create/edit their own drafts, no
finalize/delete, and — as of 2026-07-23 — no `viewAll` either, so their own list is also scoped to
their own records); **Approver Level 1/2** get `view/viewAll/edit/finalize/print` (no `create` —
they act on Sales' drafts rather than starting new ones, though `:finalize` alone still lets them
edit/delete any Draft per the ownership rule above); **Administrator**/**Super Admin** get all 7;
**Viewer** gets `view/viewAll` only. See the role table above.

Audit logging: every action (create/update/finalize/duplicate/refresh/print/delete) writes a
server-side `AuditLogEntry` via `writeScopeAuditEntry()`, module `"Scope of Work"` — `POST
/api/audit-log` rejects that module name outright (same forgery-prevention rule as the `"ใบเสนอราคา"`
module), so these events can only be written by the handler itself. See
[DATABASE.md](./DATABASE.md) `AuditLogEntry`'s `relatedScopeId`/`relatedScopeNumber` fields.

### Delivery Order (added 2026-07-23)

7 permissions gate the feature end-to-end, enforced server-side in `api/_lib/deliveryOrderHandler.ts`
— mirroring Scope of Work's own 7 permissions row-for-row, both in name and default-grant shape:

| Permission | Gates |
|---|---|
| `deliveryOrder:view` | `GET /api/delivery-orders` (list — both the by-scope existence check and the "list every Delivery Order company-wide" standalone-page mode) and `GET /api/delivery-orders/:id`. |
| `deliveryOrder:viewAll` | Scopes the "list every Delivery Order company-wide" mode to own-created-only without it — same shape as `scopeOfWork:viewAll`. The by-scope existence check and single-record `GET` are deliberately unfiltered, same reasoning as Scope of Work's identical carve-outs. |
| `deliveryOrder:create` | `POST /api/delivery-orders` (create from a Scope of Work) — also requires `scopeOfWork:view` to read the source record. |
| `deliveryOrder:edit` | `PATCH /api/delivery-orders/:id` and `POST /api/delivery-orders/:id/refresh` — combined with an **ownership** check, same shape as Scope of Work's `canEditScope()`. |
| `deliveryOrder:finalize` | **The approval authority (2026-07-24 approval workflow)**: `POST /api/delivery-orders/:id/finalize` (now "อนุมัติ" — only from `PendingApproval`) and `POST /:id/reject`; submission needs only the edit+ownership rule. Also, independent of ownership, lets a holder edit or delete *any* Draft record, not just their own. |
| `deliveryOrder:print` | Gates the print button client-side (no server-side print-log route exists for this document type — printing is 100% client-side `window.print()`, unlike Quotation/Scope of Work's server print-validation gate). |
| `deliveryOrder:delete` | `DELETE /api/delivery-orders/:id` (soft delete) — combined with the same ownership-or-finalize check as edit. |

**Creating** a Delivery Order also requires `scopeOfWork:view`; **refreshing** ("อัปเดตข้อมูลจาก
Scope of Work") requires it too, alongside the usual edit/ownership check — same pattern Scope of
Work's own creation/refresh routes use against Quotation.

Default grants mirror Scope of Work's exactly: **Sales User** gets `view/create/edit/print` (no
finalize/delete/viewAll); **Approver Level 1/2** get `view/viewAll/edit/finalize/print` (no
`create`); **Administrator**/**Super Admin** get all 7; **Viewer** gets `view/viewAll` only.

**⚠️ Same deployment/rollout note as every other permission added this session** (see "Quotation
Own-Quotes-Only Viewing" above for the full reasoning) — `defaultRoles` only seeds once, so an
already-provisioned production deployment's existing role documents will **not** automatically gain
these 7 permissions. A Super Admin must open Role Management and manually grant the appropriate
Delivery Order permissions to each role before or immediately after this deploys, or nobody except a
freshly-created Super Admin account will be able to use the feature at all. Tracked in
[TODO.md](./TODO.md).

Audit logging: every action writes a server-side `AuditLogEntry` via `writeDeliveryOrderAuditEntry()`,
module `"Delivery Order"` — reuses the already-defined `relatedScopeId`/`relatedScopeNumber` fields
to point back at the source Scope of Work rather than adding a new `relatedDeliveryOrderId` field.

### Sidebar / Menu Visibility

`App.tsx`'s `navItems` array carries an optional `permission` field per entry; `hasPermission(currentUser, roles, item.permission)` filters the rendered list — **items are fully removed from the DOM, not just disabled**, satisfying "hide inaccessible menus completely." A render-time `effectiveNav` guard (not a `useEffect`, to avoid a setState-in-effect cascade) falls back to the Dashboard if `activeNav` somehow points at a module the current user can't see. `Settings` is always visible (every signed-in user can edit their own profile); only its Company tab is conditionally rendered, gated by `company:manage`.

### Quotation Own-Quotes-Only Viewing (added 2026-07-22)

New `quotations:viewAll` permission, per direct user request: a role holding `quotations:view` but
**not** `quotations:viewAll` only sees quotations it created itself — `quotations:view` alone no
longer implies "see every quotation in the company," which was the behavior for every role until
this pass (documented as a deliberate simplification in `API.md`'s `GET /api/quotes` row before this
change: "no server-side ownership filtering"). Unchecked is the default for any newly created custom
role, matching the request's framing ("ถ้าไม่ได้ติ๊ก" — if not ticked).

Enforced server-side in two places — both filter by `{ $or: [{ createdByUserId: ctx.user.id },
{ createdByUserId: "" }] }` when the caller lacks `quotations:viewAll` (Super Admin bypasses this
entirely, same as every permission check):
- `GET /api/quotes` (`api/handlers/quotes.ts`) — the list the Quotation page's `QuoteList.tsx` reads
  from wholesale (this app fetches the full allowed list once at boot, then filters/searches
  client-side — see `App.tsx`).
- `GET /api/search`'s Quotation result category (`api/_lib/searchHandler.ts`'s `searchQuotations()`)
  — without this, a caller without `quotations:viewAll` could trivially discover another user's
  quotation through the Global Search box even though the list page itself hides it.
- **`GET /api/dashboard` (added 2026-07-24, direct user decision)** — the Dashboard previously
  showed company-wide aggregates to every `dashboard:view` holder, leaking colleagues'
  totals/rankings to roles the list pages restrict. Now a caller without `quotations:viewAll`
  gets every quote-based figure computed from only their own quotes (same predicate), the SOW/DO
  summary cards scoped by those modules' own `viewAll` (same predicates as their list routes),
  and Sales Activity restricted to their own audit events; the response carries
  `ownDataOnly: true` so the UI shows a "your own data only" notice and hides the
  salesperson/department filters. Deliberate exceptions (documented in `api/dashboard/index.ts`):
  the new-vs-repeat client classification and the forecast win-rate baseline stay company-wide
  (aggregate ratios, no per-record data), and `approvalDashboard` stays unscoped behind its own
  `quotations:approve` gate — an approver must see everyone's pending quotes.

Legacy/seed quotes with an empty `createdByUserId` (ownerless — same convention the `PATCH`
ownership check above already uses) are visible to everyone regardless of `quotations:viewAll`,
since there's no real "someone else" to exclude them for.

**Default role assignment**: Super Admin (via `ALL_PERMISSIONS`), Administrator, Approver Level 1,
Approver Level 2, and Viewer all hold `quotations:viewAll` by default — Approvers specifically
*must* have it, since they can't approve/reject a quote they can't see. **Sales User does not** —
this is the role the feature was written for, matching its existing description ("สร้างและแก้ไข
ใบเสนอราคาของตนเอง" — create/edit **their own** quotations).

**⚠️ Deployment/rollout note — read before this ships to an already-provisioned environment**:
`defaultRoles` (`src/lib/roles.ts`) only seeds the `roles` collection once, on the first-run Setup
Wizard (`api/handlers/auth.ts`) — it is **never** re-applied to an already-provisioned deployment's
existing role documents. This means an existing production database's Administrator/Approver
Level 1/Approver Level 2/Viewer role documents do **not** automatically gain `quotations:viewAll`
just because this code shipped — **a Super Admin must open Role Management and manually check
"ดูใบเสนอราคาของผู้อื่น" for each of those roles (and any custom role that should keep seeing
everyone's quotations) before or immediately after this deploys**, or every existing Approver
suddenly can't see the quotations they need to approve. Deliberately **not** auto-migrated: role
permission lists can be (and often are) hand-customized by an admin after the defaults are seeded, so
a blind server-side backfill risks silently overwriting an intentional customization — the same
reasoning already applied to every other permission addition in this project's history (see
"Quotation Templates" above, which solved the equivalent problem differently — a backward-compatible
superset permission — specifically to avoid needing a migration at all; that trick doesn't apply
here since this is a narrowing restriction, not a widening one). Tracked in
[TODO.md](./TODO.md) as a required manual step, not a silent gap.

### Scope of Work Own-Records-Only Viewing (added 2026-07-23)

New `scopeOfWork:viewAll` permission, per a direct user request ("หน้า scope of work อยากให้ทำสิทธิ์
เพิ่มมาเหมือนของใบเสนอราคาที่เป็นดูของผู้อื่นได้" — "on the Scope of Work page I'd like a permission
added like the quotation one, for viewing others'") — mirrors `quotations:viewAll` above. A role
holding `scopeOfWork:view` but **not** `scopeOfWork:viewAll` now only sees, on the standalone Scope
of Work management page's list, records it created itself. Unchecked is the default for any newly
created custom role, same convention as `quotations:viewAll`.

Enforced server-side in two places — both filter by `{ $or: [{ createdBy: ctx.user.id },
{ createdBy: "" }, ...recipientMatch] }` when the caller lacks `scopeOfWork:viewAll` (Super Admin
bypasses this entirely, same as every permission check):
- `GET /api/scope-of-works` (no `quotationId` — the "list every Scope of Work company-wide" mode
  backing the standalone `src/pages/scopeOfWork/ScopeOfWorkPage.tsx`).
- `GET /api/search`'s Scope of Work result category (`api/_lib/searchHandler.ts`'s
  `searchScopeOfWorks()`) — without this, a caller without `scopeOfWork:viewAll` could trivially
  discover another user's Scope of Work through the Global Search box even though the list page
  itself hides it.

**`recipientMatch` (added 2026-07-23, same-day second pass, per a direct user follow-up)**: a
`{ "documentRecipients.<key>": ctx.user.id }` clause for each of the 6 real department keys in
`DOCUMENT_RECIPIENT_DEPARTMENTS` (`src/lib/documentRequirements.ts`) — a caller who was explicitly
picked as a document recipient (see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document
Recipients") can find the record on their own list/search even if they didn't create it and lack
`viewAll`. Without this, a recipient's only way to ever find the record again (after the one-time
email/in-app-notification link) would be nothing at all — a real usability gap, not just a
theoretical one, since the notification/email are one-time pointers, not a standing view.

**Deliberately NOT applied** to three other places a Scope of Work record's content is read,
unlike Quotation's simpler single-list-page shape:
- `GET /api/scope-of-works?quotationId=` (the by-quotation existence check `QuoteDocument.tsx`'s
  toolbar uses — "does a Scope of Work already exist for this quotation?"). The caller must already
  have `quotations:view` to be looking at that quotation at all; hiding a colleague's already-
  created record here would risk them creating a duplicate one instead of opening the existing one,
  which is a worse outcome than the record simply staying visible via this one narrow path.
- `GET /api/scope-of-works/:id` (opening a specific record — reached either from the now-filtered
  list above, or from the still-unfiltered by-quotation link above). Filtering this too would make
  the by-quotation link show "a Scope of Work exists" while `403`-ing the click straight after —
  broken, self-contradictory UX. Direct record access stays governed by whatever legitimate
  navigation path led there, same as it always was.
- `POST /api/scope-of-works/:id/duplicate` and `/rewrite` — both already require `scopeOfWork:create`
  + `scopeOfWork:view` to read their source record; not additionally restricted by `:viewAll`, same
  reasoning as the single-record `GET` above.

`update`/`delete`/`refresh`/`finalize`/`print` are untouched — those already have their own
independent authorization (`canEditScope()`'s owner-or-`scopeOfWork:finalize` rule, or a plain
`scopeOfWork:finalize`/`:print` check) that this pass wasn't asked to change, the same split
`quotations:viewAll` already has (it doesn't touch `quotations:approve`/`:reject` either).

Legacy/seed records with an empty `createdBy` (ownerless — same convention the edit/delete
ownership check above already uses) are visible to everyone regardless of `scopeOfWork:viewAll`,
since there's no real "someone else" to exclude them for.

**Default role assignment**: Super Admin (via `ALL_PERMISSIONS`), Administrator, Approver Level 1,
Approver Level 2, and Viewer all hold `scopeOfWork:viewAll` by default — Approvers specifically
*must* have it, since they finalize Sales' drafts company-wide, not just their own. **Sales User
does not** — matching its existing description ("สร้างและแก้ไขใบเสนอราคาของตนเอง" — create/edit
**their own** [quotations and, by the same logic, their own Scope of Work]).

**⚠️ Deployment/rollout note — same caveat as `quotations:viewAll` above, read before this ships
to an already-provisioned environment**: `defaultRoles` only seeds once, on first-run setup — an
existing production database's Administrator/Approver Level 1/Approver Level 2/Viewer role
documents do **not** automatically gain `scopeOfWork:viewAll` just because this code shipped. **A
Super Admin must open Role Management and manually check "ดู Scope of Work ของผู้อื่น" for each of
those roles** before or immediately after this deploys, or every existing Approver suddenly can't
see the Scope of Work records they need to finalize. Same deliberate no-auto-migration reasoning as
`quotations:viewAll` — tracked in [TODO.md](./TODO.md) as a required manual step.

### Quotation Approval Workflow

`QuoteStatus` (`src/lib/quotes.tsx`) has 9 values: `ร่าง` (Draft) → `รออนุมัติ` (Pending Approval) → `อนุมัติแล้ว` (Approved) → `ส่งให้ลูกค้าแล้ว` (Sent to Customer) → `ลูกค้ายอมรับ` (Customer Accepted) → `ปิดการขายสำเร็จ` (Won), or `ลูกค้าปฏิเสธ` (Customer Rejected) → `เสียโอกาส` (Lost); plus a standalone `ยกเลิก` (Cancelled) reachable from Draft/Pending/Approved. `workflowTransitions` encodes the state machine (`{action: {from: QuoteStatus[], to: QuoteStatus}}`). `computeQuotePermissions(quote, isNew, currentUser, roles)` derives which action buttons a given user may see for a given quote, combining permission checks with an **ownership** check (`quote.createdByUserId === currentUser.id`, with approvers/admins allowed to touch quotes they don't own) — this remains client-side, display-only logic. `POST /api/quotes/:id/workflow` independently re-derives and re-checks the same permission + ownership rule server-side via `isWorkflowActionAllowed()` (`api/_lib/quoteWorkflow.ts`, a deliberately duplicated copy of `workflowTransitions`/`ApprovalAction` from `quotes.tsx` — see [ARCHITECTURE.md](./ARCHITECTURE.md) for why it's a duplicate, not an import) and validates the requested transition's `from` state against the quote's actual current status in MongoDB before applying it — a devtools-triggered call to approve a quote you don't have permission for, or to skip a status, is rejected with a `403`/`400` server-side, not just hidden client-side. Every transition appends an `ApprovalHistoryEntry` (`userId`, `userName`, `roleName`, `action`, `comment`, `createdAt`, all server-derived from the authenticated session) to `Quote.approvalHistory` — **never removed, only appended**, rendered on the document as "ประวัติการอนุมัติ." Reject/Customer-Reject/Cancel require a non-empty comment via a modal; other transitions allow an optional one.

**Known simplification**: the two approver roles (Level 1/Level 2) are not sequenced — either can independently approve or reject a quote in "รออนุมัติ." A real two-stage gate (Level 1 must approve before Level 2 can) was not requested by name in the given status diagram (a single "Pending Approval" step) and was scoped out; see [TODO.md](./TODO.md).

### Quotation Duplicate / Rewrite

Both `POST /api/quotes/:id/duplicate` and `POST /api/quotes/:id/rewrite` (the latter added
2026-07-22 — see [MODULES/Quotation.md](./MODULES/Quotation.md)) are gated by **`quotations:create`**
only, the same permission that gates creating a brand-new quote from scratch — no dedicated
`quotations:duplicate`/`:rewrite` permission was introduced, since both actions are "create a new
quote document" from the RBAC model's point of view, just pre-filled from an existing one. Enforced
at all three layers: the toolbar button itself (`permissions.canDuplicate`/`canRewrite` in
`computeQuotePermissions()`, both `!isNew && hasPermission(..., "quotations:create")`), and
server-side via `requirePermission(req, "quotations:create")` inside `handleDuplicate()`/
`handleRewrite()` — a direct API call from a user without the permission is rejected `403`
regardless of what the UI shows.

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

- ~~**No rate limiting on `POST /api/auth/login`**~~ — **closed 2026-07-29**: failed attempts are tracked in the `login_attempts` MongoDB collection (TTL-purged) and counted over a 15-minute sliding window — ≥5 failures for one identifier, or ≥20 from one IP, → `429` with a Thai retry-in-X-minutes message + `Retry-After` header. A successful login clears that identifier's failures; a correct-password-but-suspended attempt neither records nor clears (so a lockout can't be reset by hammering a known-suspended account). The check runs before the bcrypt compare, keeping locked-out requests cheap. See `api/handlers/auth.ts` and CHANGELOG.md.
- **No true session revocation** — see the Sessions row above. A stolen, still-valid JWT is not immediately invalidated by an admin action (only future requests from a *deactivated* account are blocked; a still-active account's leaked token remains usable until natural expiry).
- **API-layer test coverage is partial** — **first real tests landed 2026-07-29** (`tests/`, 55 vitest tests, run by CI): the pure permission rules (default-role grants, `roleHasPermission`/`hasPermission` edge cases, `computeQuotePermissions` ownership logic, the workflow state machine + per-action authorization) and a full `/api/auth/login` integration test (bcrypt/JWT/rate limiting against an in-memory MongoDB) are covered. Every OTHER route's HTTP-level guard (`requirePermission()` per handler, ownership checks, last-active-Super-Admin guards) is still only manually verified — the login test's harness is the template to extend. See [TODO.md](./TODO.md).
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
