# API

## Current State: Real REST API (Vercel Serverless Functions)

As of 2026-07-09 this project has a **real HTTP API**: Vercel Serverless Functions (Node.js) backed by MongoDB Atlas, served from the same domain as the frontend (https://tcs-erp-nine.vercel.app/api/...). The frontend calls it via `apiFetch<T>()` (`src/lib/apiClient.ts`) — a thin wrapper around `fetch` with `credentials: "include"` (so the session cookie is sent), JSON request/response handling, and an `ApiError` class thrown for any non-2xx response. Every domain lib file (`users.ts`, `roles.ts`, `session.ts`, `storage.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.tsx`) exposes `fetchX()`/`createX()`/`updateX()`/etc. functions that call this API — the old `loadX()`/`saveX()` `localStorage` functions are gone.

This supersedes the pre-2026-07-09 "no backend, plain function calls" state and the never-built "proposed future Next.js/Server Actions" design further down this file's history — see [ARCHITECTURE.md](./ARCHITECTURE.md) for why the actual stack (Vercel Functions + MongoDB) differs from that old proposal.

### Routing mechanics (read [ARCHITECTURE.md](./ARCHITECTURE.md) for the full gotcha writeup)

Routes are consolidated into 10 function files (added `api/handlers/jobtypes.ts` 2026-07-10) to stay under Vercel Hobby's 12-function cap: `api/company/index.ts`, `api/audit-log/index.ts`, and `api/dashboard/index.ts` dispatch on `req.method` directly; `api/handlers/{auth,users,roles,products,categories,notifications,quotes,jobtypes}.ts` each dispatch on parsed URL path segments. `vercel.json` `rewrites` map every `/api/<resource>` and `/api/<resource>/:path*` request to its one handler file — this is the real, tested routing mechanism in production, not Vercel's own dynamic-route folder convention. Two function slots remain before the cap.

### Auth model (every route below)

- **Session**: a JWT in an httpOnly, `secure`, `sameSite=lax` cookie (`tcs_erp_session`, 7-day expiry), issued by `issueSessionCookie()` on setup/login.
- **"Authenticated"** = `requireUser(req)` (`api/_lib/auth.ts`) succeeds: a valid, unexpired JWT whose `sub` (user ID) resolves to a MongoDB user document with `status === "active"`. The user and their role are re-fetched from MongoDB on **every** request — nothing about authorization is trusted from the JWT payload itself beyond the user ID. A 401 `{ error: "Not authenticated" }` is thrown otherwise.
- **"Permission: `x:y`"** = `requirePermission(req, "x:y")` — calls `requireUser` first, then `roleHasPermission(ctx.role, "x:y")` (the same pure function from `src/lib/roles.ts`, value-imported into the API layer). A 403 `{ error: "Forbidden" }` is thrown if the caller's role lacks the permission (Super Admin always passes, via `roleHasPermission`'s short-circuit).
- Errors are always `{ error: string }` JSON with the matching HTTP status, produced by `HttpError`/`sendError`/`withErrorHandling` (`api/_lib/http.ts`).

---

## Auth (`api/handlers/auth.ts`, mounted at `/api/auth`)

| Method & Path | Auth | Request | Response | Notes |
|---|---|---|---|---|
| `GET /api/auth/session` | None | — | `200 { user: PublicUser \| null, needsSetup: boolean }` | `needsSetup: true` only when the `users` collection is empty (no user has ever been created) — drives the Setup Wizard vs. Sign In branch in `App.tsx`'s boot sequence. |
| `POST /api/auth/setup` | None (blocked once any user exists) | `{ employeeId, fullName, username, email, password }` | `201 { user }`, sets session cookie | `409` if `users` collection is non-empty. Creates the first user with the `isSuperAdmin` role from `defaultRoles`, seeds default roles into MongoDB first (`seedDefaultRolesIfEmpty()`). Password must be ≥ 6 chars. |
| `POST /api/auth/login` | None | `{ identifier, password }` | `200 { user }`, sets session cookie | `identifier` matched case-insensitively against `username` or `email`. `401` on bad credentials, `403` if the account is `inactive`. |
| `POST /api/auth/logout` | None | — | `204`, clears session cookie | |

## Users (`api/handlers/users.ts`, mounted at `/api/users`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/users` | Any authenticated user | Returns every user (`PublicUser[]`, no `passwordHash`), sorted by `fullName`. Not gated by `users:manage` — see Known Scope Limitations below. |
| `POST /api/users` | `users:manage` | Creates a user. `409` on duplicate `employeeId`/`username`/`email`. `403` if the caller tries to assign the Super Admin role without being Super Admin themselves. Password ≥ 6 chars, hashed with bcrypt before storage. |
| `PATCH /api/users/:id` | Self, or `users:manage` for other fields/other users | Self can update `fullName`/`phone`/`department`/`position`/profile & signature images, and change their own password (requires `currentPassword`, verified via `bcrypt.compare`). `profilePictureDataUrl`/`signatureDataUrl` are validated server-side as of 2026-07-10 (`api/_lib/uploadValidation.ts`) — must be a real `data:image/(png\|jpeg\|jpg\|webp\|gif);base64,...` data URL under 2MB, or empty to clear; a `400` otherwise. Only a `users:manage` holder can change `employeeId`/`username`/`email`/`roleKey`/`status`, and never on themselves for `roleKey`/`status`. Guards: can't reassign the last active Super Admin's role, can't deactivate the last active Super Admin, can't assign the Super Admin role unless the caller is already Super Admin. Admin-initiated password resets on **other** users skip the current-password check. |
| `DELETE /api/users/:id` | `users:manage` | `400` if deleting self or the last remaining user with the Super Admin role. |

## Roles (`api/handlers/roles.ts`, mounted at `/api/roles`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/roles` | Any authenticated user | Every client-side `hasPermission()` call needs the full role list, so this is intentionally open to any signed-in user, not gated by `roles:manage`. Seeds default roles into MongoDB first if the collection is empty. |
| `POST /api/roles` | `roles:manage` | Creates a custom role (`key: "role_<ObjectId>"`). `409` on duplicate name (case-insensitive). Strips any `roles:manage`/`company:manage` permission from the submitted list server-side (`isPermissionLockedToSuperAdmin()`) — cannot be granted to a custom role via the API even if the client sends it. |
| `PATCH /api/roles/:key` | `roles:manage` | `400` if the target role is `isSystem` (Super Admin/Administrator — undeletable, unmodifiable). Same permission-stripping as create. |
| `DELETE /api/roles/:key` | `roles:manage` | `400` if `isSystem`. `409` if any user currently holds this role. |

## Company (`api/company/index.ts`, mounted at `/api/company`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/company` | Any authenticated user | Displayed on every quotation/settings screen, so open to any signed-in user, not gated by `company:manage`. Returns `defaultCompany` merged with the stored singleton doc (or just `defaultCompany` if none exists yet). |
| `PUT /api/company` | `company:manage` | Full-document replace (merged with `defaultCompany` for any missing fields), upserted into the singleton doc (`_id: "singleton"`). `logoDataUrl`/`stampDataUrl` are validated server-side as of 2026-07-10 (`api/_lib/uploadValidation.ts`), same rule as user profile/signature images above. |

## Products (`api/handlers/products.ts`, mounted at `/api/products`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/products` | `products:view` | Sorted by `code`. |
| `POST /api/products` | `products:create` | `409` on duplicate `code`. |
| `PATCH /api/products/:id` | `products:edit` | Partial update; `409` if the new `code` collides with another product. |
| `DELETE /api/products/:id` | `products:delete` | Hard delete (no soft-delete check server-side beyond the client's own archive/delete UX distinction — `archived` is just a boolean field, set via `PATCH`). |

## Categories (`api/handlers/categories.ts`, mounted at `/api/categories`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/categories` | `products:view` | Sorted by `name`. Categories share the `products:*` permission family — there is no separate `categories:*` permission. |
| `POST /api/categories` | `products:create` | `409` on duplicate name (case-insensitive). |
| `PATCH /api/categories/:id` | `products:edit` | Rename and/or toggle `archived`. `409` on duplicate name. |

No `DELETE /api/categories/:id` route exists — matches the pre-migration UI, which only ever supported archive/unarchive for categories, never permanent delete.

## Job Types (`api/handlers/jobtypes.ts`, mounted at `/api/jobtypes` — added 2026-07-10)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/jobtypes` | `quotations:view` | Sorted by `code`. Defensively calls `seedJobTypesIfEmpty()` before listing — see [DATABASE.md](./DATABASE.md) "`JobType`" for why this route (unlike other seed functions) needs to self-heal on every call rather than only at Setup Wizard time. |
| `POST /api/jobtypes` | `company:manage` | `409` on duplicate `code` (case-insensitive). No new `Permission` was added for this — Job Types are treated as company-wide configuration data, matching the precedent already used for bank/VAT/T&C settings. |
| `PATCH /api/jobtypes/:id` | `company:manage` | Rename and/or toggle `isActive`. `409` on duplicate `code`. |

No `DELETE` route — soft-deactivate only (`isActive: false`), same pattern as Categories.

## Notifications (`api/handlers/notifications.ts`, mounted at `/api/notifications`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/notifications` | Any authenticated user | Returns **only the caller's own** notifications (`recipientUserId === ctx.user.id`, filtered server-side), sorted newest first — a real fix over the pre-migration behavior where all users' notifications lived in the client's memory. |
| `POST /api/notifications/mark-all-read` | Any authenticated user | Marks all of the caller's unread notifications read. Scoped to the caller — cannot mark another user's notifications. |
| `PATCH /api/notifications/:id` | Any authenticated user (must own it) | Marks one notification read. `404` if it doesn't belong to the caller (returned as not-found, not forbidden, to avoid confirming another user's notification IDs exist). |
| `DELETE /api/notifications/:id` | Any authenticated user (must own it) | Same ownership check as `PATCH`. |

There is deliberately **no** `POST /api/notifications` (create-arbitrary-notification) route — notification creation only happens as a side effect of `POST /api/quotes/:id/workflow` (see below), to prevent a client from spamming or spoofing notifications to other users.

## Audit Log (`api/audit-log/index.ts`, mounted at `/api/audit-log`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/audit-log` | `auditLog:view` | Newest-first, capped at 1000 entries. |
| `POST /api/audit-log` | Any authenticated user | `userId`/`userName`/`roleName` are **always** derived from the authenticated session server-side, never taken from the request body — a client can describe what happened (`module`/`action`/`details`) but can never claim to be a different user. This is why the route itself has no permission gate beyond "must be signed in": every signed-in user is allowed to log their own actions (login, profile edit, etc.), and the server, not the client, controls who gets credited. |

`AuditLogPage.tsx` self-fetches via `useEffect` on mount (not part of the universal boot-time `Promise.all` fetch in `App.tsx`), since this route is permission-gated and shouldn't be called for every signed-in user regardless of whether they can see the page.

## Dashboard (`api/dashboard/index.ts`, mounted at `/api/dashboard` — added 2026-07-09, majorly expanded 2026-07-10, completed against the full business spec later the same day)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/dashboard?from=&to=&salesperson=&department=` | `dashboard:view` | All four query params optional. Returns `{ kpis, interestBreakdown, revenueByMonth, revenueTrend, categoryBreakdown, monthlyClosingRate, pipeline, salesPerformance, customerAnalytics, jobTypeAnalytics, forecast, followUps, activityTimeline, approvalDashboard, notificationSummary, availableSalespeople, availableDepartments, filters }` — real MongoDB counts/aggregations, no client-side computation, no hardcoded/template values. `interestBreakdown` (added 2026-07-10, Codex review Critical fix) is computed from the same filtered quote set as every other widget — the Dashboard's Customer Interest panel previously computed this client-side from the app-wide, entirely unfiltered quote list. `activityTimeline` is `null` unless the caller has `auditLog:view`, and (added 2026-07-10) now respects the date-range/salesperson/department filter (previously ignored them entirely) via a Bangkok-day-boundary-aware `createdAt` range plus a `userName` match against the same free-text salesperson/department join used elsewhere. `approvalDashboard` (stat tiles + the actionable `pendingList`, and `canReject`) is `null` unless the caller has `quotations:approve` (both checked via `roleHasPermission()`, not a second `requirePermission()` call — the rest of the dashboard is still returned either way). Total Customers/Products/`categoryBreakdown`, and `notificationSummary`, are deliberately **not** filtered — catalog and personal-operational metrics respectively, documented as such (see [MODULES/Dashboard.md](./MODULES/Dashboard.md)) rather than silently inconsistent. See [DATABASE.md](./DATABASE.md) "Dashboard KPI/chart aggregation" and [MODULES/Dashboard.md](./MODULES/Dashboard.md) for exactly what each field means and how it's computed. |

`DashboardPage.tsx` self-fetches via `src/lib/dashboard.ts`'s `fetchDashboardStats(filters)`, re-fetching whenever the on-screen date-range/department/salesperson filter changes (or after an Approve/Reject action from the Pending Approvals list) — not part of the universal boot-time fetch, since it's the only page that needs this particular aggregate. Approve/Reject actions themselves reuse the existing `POST /api/quotes/:id/workflow` route below — no new mutating route was added for the Dashboard.

## Quotations (`api/handlers/quotes.ts`, mounted at `/api/quotes`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/quotes` | `quotations:view` | Returns every quote (no server-side ownership filtering — matches the pre-migration UI, which always showed the full list with client-side status filters). |
| `POST /api/quotes` | `quotations:create` | Creates a new quote, ID generated server-side via `nextQuoteId()` — **atomic** as of 2026-07-10 (Codex review fix): reserves the next sequence number via a `counters` collection (`findOneAndUpdate` with `$inc`, upsert), not the previous scan-all-`_id`s-then-max+1 approach, which could race two concurrent creates into the same id. `createdByUserId` is always the authenticated caller — never trusted from the request body. Status always starts at `"ร่าง"` (Draft), `approvalHistory: []`. **Job Type is required** (2026-07-10 fix) — `jobTypeCode` must match a real `job_types` master record (any status, active or deactivated); `jobTypeName` is always re-derived from that record server-side, never trusted from the client. All fields go through `api/_lib/quoteValidation.ts` (type/length/range checks, ISO date validation) — see below. |
| `PATCH /api/quotes/:id` | `quotations:edit` + ownership (or `quotations:approve`) | General field edit (client/lines/discount/contact fields/`jobTypeCode`/`isPotentialOpportunity`/`followUpDate`/etc.) — every field is individually validated via `api/_lib/quoteValidation.ts`, not copied raw from the request body (fixed 2026-07-10, Codex review Critical finding). `amount`/`jobTypeName` are **not** client-writable at all: `amount` is always recomputed server-side from the resulting effective `lines`/`discount` (using the stored value for whichever wasn't part of this particular PATCH), and `jobTypeName` is always re-derived from the `job_types` master record whenever `jobTypeCode` is supplied — a non-blank `jobTypeCode` must match a real record, but blank is still allowed on edit (not forced) so legacy/unclassified quotes aren't blocked from unrelated saves. `status`/`approvalHistory` are still never client-settable via this route. Ownership: the caller must be the quote's creator, **or** hold `quotations:approve` (matches the client-side `computeQuotePermissions()` ownership model, now enforced server-side, not just hidden client-side). Legacy/seed quotes with an empty `createdByUserId` are treated as ownerless — any editor with `quotations:edit` passes the ownership check. |
| `POST /api/quotes/:id/duplicate` | `quotations:create` | Clones the quote: fresh `_id` (new atomic sequence number), fresh line/sub-detail IDs (`cloneLines()`), status reset to `"ร่าง"`, `interest: null`, `createdByUserId` set to the duplicating caller, `approvalHistory: []`, `amount` recomputed (not copied) from the cloned lines/discount as a defensive invariant check. |
| `POST /api/quotes/:id/workflow` | Varies per `action` — see below | Body: `{ action: ApprovalAction, comment?: string, draft?: Partial<Quote> }`. Validates `action` against `workflowTransitions` (`api/_lib/quoteWorkflow.ts` — a duplicated copy of the state machine in `src/lib/quotes.tsx`, see [ARCHITECTURE.md](./ARCHITECTURE.md) for why) and that the quote's current status is a valid `from` state for that action (`400` otherwise). Merges any in-flight `draft` field edits (the on-screen unsaved state) into the quote **before** applying the status transition — validated the same way as `PATCH` above (2026-07-10) — closing the same "workflow action discards unsaved edits" bug documented in [CHANGELOG.md](./CHANGELOG.md) 2026-07-09 — now enforced this way server-side too. Appends an `ApprovalHistoryEntry` stamped with the authenticated caller's identity (never client-supplied). Fires `createWorkflowNotifications()` as a side effect: `submitted` notifies every active user holding `quotations:approve` (plus every active `approver_2`-keyed user if `quote.amount >= HIGH_VALUE_THRESHOLD`, ฿500,000); `approved`/`rejected`/`customer_accepted`/`customer_rejected` notify the quote's creator. Permission-per-action is checked via `isWorkflowActionAllowed()` combining `roleHasPermission()` for the relevant permission (`create`/`edit`/`approve`/`reject`/`delete`, mapped per action) with the same ownership rule as `PATCH` above; a `403` includes the Thai label of the specific permission that was missing. |

No dedicated `DELETE /api/quotes/:id` route exists — matches the pre-migration UI/workflow design, where "Cancel" (a workflow action, not a hard delete) is the only way to retire a quote.

**Server-side quote validation** (`api/_lib/quoteValidation.ts`, added 2026-07-10 per the Codex review's Critical finding that quote writes previously copied raw client fields into MongoDB with no schema validation): every free-text field is length-capped and type-checked (a wrong JSON type, e.g. a number where a string is expected, is a `400`, not a silent coercion); `lines[]` entries are validated per-field (`qty`/`unitPrice` non-negative and bounded, `discount` 0–100, array-length caps on `lines`/`tags`/`subDetails` to bound document size); dates (`issueDate`/`expiryDate`/`followUpDate`) must be `""` or a real `YYYY-MM-DD` calendar date; `amount` is always server-derived (see `PATCH` above) using the same totals formula as `computeTotals()` in `src/lib/quotes.tsx` (duplicated, not imported — same JSX-in-that-file reason `quoteWorkflow.ts` duplicates `workflowTransitions`).

## Errors

Every route funnels exceptions through `withErrorHandling()` (`api/_lib/http.ts`): an `HttpError(status, message)` produces `{ status } { error: message }` (Thai-language messages for user-facing validation errors, matching the app's UI language); any other thrown error is logged server-side and produces a generic `500 { error: "Internal server error" }`, so internal error details are never leaked to the client. `apiFetch()` on the frontend throws `ApiError` for any non-2xx response, caught by each page's existing try/catch + `useToast()` error-toast pattern.

## Known, Deliberate Scope Limitations (not bugs — see [RBAC.md](./RBAC.md) for the full RBAC picture)

- `GET /api/users`, `GET /api/roles`, `GET /api/company`, `GET /api/products`, `GET /api/categories` are open to any **authenticated** user, not gated by e.g. `users:manage`. This matches the pre-migration behavior, where the full dataset already lived in every signed-in user's browser — so it's not a new permission surface, just now real authentication is required at all (previously anyone could open the site with zero login). Mutations on all of these remain properly permission-gated per action.
- No rate limiting on `POST /api/auth/login` — a gap worth closing before this app is exposed beyond a trusted internal network. See [TODO.md](./TODO.md).
- No pagination on any list route (`GET /api/quotes`, `GET /api/users`, `GET /api/audit-log` aside from its 1000-entry cap) — fine at current data volumes, worth revisiting if any collection grows large.

## Superseded: the old proposed Next.js API design — NOT what got built

If/when a hypothetical Next.js migration happened (the "Phase 2" plan, see [ARCHITECTURE.md](./ARCHITECTURE.md) "Superseded" section), the plan had been: an Auth.js route handler, Server Actions (not REST/JSON) for most mutations, Server Components/`queries/*.ts` for reads, and a coarse `middleware.ts` session check. **None of this was built.** The real API that shipped 2026-07-09 is a plain REST/JSON API over Vercel Serverless Functions, documented in full above. This paragraph is kept only as a historical record — do not write code against the old proposal.
