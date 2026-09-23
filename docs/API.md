# API

## Current State: Real REST API (standalone Express server, self-hosted)

As of 2026-07-09 this project has a **real HTTP API** — served by a standalone Express server (`server/`) on a self-hosted VPS with a real domain + HTTPS, backed by self-hosted MongoDB (production since ~2026-08-07; before that the same handlers ran as serverless functions on a demo host). Served from the same domain as the frontend. The frontend calls it via `apiFetch<T>()` (`src/lib/apiClient.ts`) — a thin wrapper around `fetch` with `credentials: "include"` (so the session cookie is sent), JSON request/response handling, and an `ApiError` class thrown for any non-2xx response. Every domain lib file (`users.ts`, `roles.ts`, `session.ts`, `storage.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.ts`) exposes `fetchX()`/`createX()`/`updateX()`/etc. functions that call this API — the old `loadX()`/`saveX()` `localStorage` functions are gone.

This supersedes the pre-2026-07-09 "no backend, plain function calls" state and the never-built "proposed future Next.js/Server Actions" design further down this file's history — see [ARCHITECTURE.md](./ARCHITECTURE.md) for why the actual stack (Node.js REST API + MongoDB) differs from that old proposal.

### Routing mechanics (read [ARCHITECTURE.md](./ARCHITECTURE.md) for the full gotcha writeup)

`server/app.ts`'s `API_ROUTES` table maps the first path segment after `/api/` to a handler: `api/company/index.ts`, `api/audit-log/index.ts`, and `api/dashboard/index.ts` dispatch on `req.method` directly; `api/handlers/{auth,users,roles,products,categories,notifications,quotes,jobtypes,customers}.ts` each dispatch on parsed URL path segments, and several of them serve more than one resource (checked on the raw pathname — e.g. `quotes.ts` also serves Scope of Work, Delivery Order and most later document modules). That grouping is a leftover of the Vercel Hobby 12-function cap the app lived under before the ~2026-08-07 cutover; **there is no function-count cap any more** (all Vercel artifacts, `vercel.json` included, were removed 2026-09-14), so a new resource may get its own handler file or a branch in an existing one. Either way it needs an `API_ROUTES` entry — `tests/serverRouteTable.test.ts` guards the table.

### Auth model (every route below)

- **Session**: a JWT in an httpOnly, `secure`, `sameSite=lax` cookie (`tcs_erp_session`, 7-day **rolling** expiry), issued by `issueSessionCookie()` on setup/login and re-issued with a fresh 7-day window by `refreshSessionCookie()` on every request (added 2026-07-31, wired into `withErrorHandling()` — see [RBAC.md](./RBAC.md)).
- **"Authenticated"** = `requireUser(req)` (`api/_lib/auth.ts`) succeeds: a valid, unexpired JWT whose `sub` (user ID) resolves to a MongoDB user document with `status === "active"`. The user and their role are re-fetched from MongoDB on **every** request — nothing about authorization is trusted from the JWT payload itself beyond the user ID. A 401 `{ error: "Not authenticated" }` is thrown otherwise — a genuinely expired/invalid cookie, or a user deactivated/edited since the cookie was issued. **2026-07-21**: `src/lib/apiClient.ts` now translates this exact literal string into "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่"/"Your session has expired — please sign in again" client-side before it ever reaches a toast — previously the raw English server string leaked straight through, which read as an unexplained "not authentication" error with no clear next step. Matched by exact message content, not by status code, since `POST /api/auth/login`'s own 401 (below) carries a different, already-correct, already-Thai message that must pass through unchanged. `App.tsx` does not proactively re-check the session while a page is open, so this can surface mid-session on any authenticated action, not just at page load — the fix is only the message text, not an auto-redirect-to-sign-in; logging out and back in resolves it.
- **"Permission: `x:y`"** = `requirePermission(req, "x:y")` — calls `requireUser` first, then `roleHasPermission(ctx.role, "x:y")` (the same pure function from `src/lib/roles.ts`, value-imported into the API layer). A 403 `{ error: "Forbidden" }` is thrown if the caller's role lacks the permission (Super Admin always passes, via `roleHasPermission`'s short-circuit).
- Errors are always `{ error: string }` JSON with the matching HTTP status, produced by `HttpError`/`sendError`/`withErrorHandling` (`api/_lib/http.ts`).

---

## Auth (`api/handlers/auth.ts`, mounted at `/api/auth`)

| Method & Path | Auth | Request | Response | Notes |
|---|---|---|---|---|
| `GET /api/auth/session` | None | — | `200 { user: PublicUser \| null, needsSetup: boolean }` | `needsSetup: true` only when the `users` collection is empty (no user has ever been created) — drives the Setup Wizard vs. Sign In branch in `App.tsx`'s boot sequence. |
| `POST /api/auth/setup` | None (blocked once any user exists) | `{ employeeId, fullName, username, email, password }` | `201 { user }`, sets session cookie | `409` if `users` collection is non-empty. Creates the first user with the `isSuperAdmin` role from `defaultRoles`, seeds default roles into MongoDB first (`seedDefaultRolesIfEmpty()`). Password must be ≥ 6 chars. |
| `POST /api/auth/login` | None | `{ identifier, password }` | `200 { user }`, sets session cookie | `identifier` matched case-insensitively against `username` or `email`. `401` on bad credentials, `403` if the account is `inactive`. **Rate limited (2026-07-29)**: ≥5 failures for one identifier or ≥20 from one IP within 15 min → `429` (Thai retry-in-X-minutes message + `Retry-After` header); tracked in the TTL-purged `login_attempts` collection, cleared for the identifier on a successful login. The check runs before the bcrypt compare. |
| `POST /api/auth/logout` | None | — | `204`, clears session cookie | |

## Users (`api/handlers/users.ts`, mounted at `/api/users`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/users` | Any authenticated user | Returns every user (`PublicUser[]`, no `passwordHash`; the short-lived 2026-08-07 `hasEmailAppPassword` boolean is gone again — the email feature was removed the same day, and any legacy `emailAppPasswordEnc` is still stripped defensively), sorted by `fullName`. Not gated by `users:manage` — see Known Scope Limitations below. |
| `POST /api/users` | `users:manage` | Creates a user. `409` on duplicate `employeeId`/`username`/`email`. `403` if the caller tries to assign the Super Admin role without being Super Admin themselves. Password ≥ 6 chars, hashed with bcrypt before storage. |
| `PATCH /api/users/:id` | Self, or `users:manage` for other fields/other users | Self can update `fullName`/`phone`/`department`/`position`/profile & signature images, and change their own password (requires `currentPassword`, verified via `bcrypt.compare`). `profilePictureDataUrl`/`signatureDataUrl` are validated server-side as of 2026-07-10 (`api/_lib/uploadValidation.ts`) — must be a real `data:image/(png\|jpeg\|jpg\|webp\|gif);base64,...` data URL under 2MB, or empty to clear; a `400` otherwise. Only a `users:manage` holder can change `employeeId`/`username`/`email`/`roleKey`/`status`, and never on themselves for `roleKey`/`status`. Guards: can't reassign the last active Super Admin's role, can't deactivate the last active Super Admin, can't assign the Super Admin role unless the caller is already Super Admin. Admin-initiated password resets on **other** users skip the current-password check. (The 2026-08-07 `emailAppPassword` field and `POST /api/users/:id/email-test` endpoint were removed again the same day — the email-sending feature was cut entirely.) |
| `DELETE /api/users/:id` | `users:manage` | `400` if deleting self or the last remaining user with the Super Admin role. |

## Roles (`api/handlers/roles.ts`, mounted at `/api/roles`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/roles` | Any authenticated user | Every client-side `hasPermission()` call needs the full role list, so this is intentionally open to any signed-in user, not gated by `roles:manage`. Seeds default roles into MongoDB first if the collection is empty. **Since 2026-08-07** it also runs `bootstrapRbac()` (once per warm instance/process): inserts any default role a provisioned database is missing (e.g. `service_engineer`) and applies pending, once-only permission backfills — this is the path that actually reaches production, since every authenticated client fetches this route on boot. See [RBAC.md](./RBAC.md) "Rollout". |
| `POST /api/roles` | `roles:manage` | Creates a custom role (`key: "role_<ObjectId>"`). `409` on duplicate name (case-insensitive). Strips any `roles:manage`/`company:manage` permission from the submitted list server-side (`isPermissionLockedToSuperAdmin()`) — cannot be granted to a custom role via the API even if the client sends it. |
| `PATCH /api/roles/:key` | `roles:manage` | `400` if the target role is `isSystem` (Super Admin/Administrator — undeletable, unmodifiable). Same permission-stripping as create. |
| `DELETE /api/roles/:key` | `roles:manage` | `400` if `isSystem`. `409` if any user currently holds this role. |

## Departments + Teams (`api/_lib/departmentsHandler.ts`, mounted at `/api/departments` and `/api/teams` via `api/handlers/roles.ts` — added 2026-08-14)

Shares `roles.ts`'s handler file (same sharing pattern Scope of Work/Delivery Order use inside `api/handlers/
quotes.ts`). Mounted here specifically since both are Super-Admin-gated org-structure config, the
same class as Role Management itself. See [RBAC.md](./RBAC.md) "Departments + Teams + Tiered
Visibility" and [DATABASE.md](./DATABASE.md) for the `departments`/`teams` collection shapes.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/departments` | Any authenticated user | Feeds User Management's department `<select>` and the admin page's own list. |
| `POST /api/departments` | `departments:manage` | `{name, code?, isActive?}`. `code` auto-generates (`DEPT_<ObjectId>`) if omitted — not exposed in the admin UI. `409` on duplicate name or code (case-insensitive). |
| `PATCH /api/departments/:id` | `departments:manage` | Rename and/or toggle `isActive` (archive/restore — no hard delete, this app's standing "archive not delete" convention). `code` is immutable after creation. |
| `GET /api/teams` | Any authenticated user | Optional `?departmentId=` filter — used by User Management's team `<select>`, scoped to whichever department is currently chosen in the form. |
| `POST /api/teams` | `teams:manage` | `{name, departmentId, isActive?}`. `400` if `departmentId` doesn't resolve to a real department. `409` if the name is already taken **within that department** (team names only need to be unique per-department, not globally). |
| `PATCH /api/teams/:id` | `teams:manage` | Rename and/or toggle `isActive`. `departmentId` is immutable after creation (moving a team between departments isn't supported in this pass). |

## Company (`api/company/index.ts`, mounted at `/api/company`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/company` | Any authenticated user | Displayed on every quotation/settings screen, so open to any signed-in user, not gated by `company:manage`. Returns `defaultCompany` merged with the stored singleton doc (or just `defaultCompany` if none exists yet). |
| `PUT /api/company` | `company:manage` | Full-document replace (merged with `defaultCompany` for any missing fields), upserted into the singleton doc (`_id: "singleton"`). `logoDataUrl`/`stampDataUrl` are validated server-side as of 2026-07-10 (`api/_lib/uploadValidation.ts`), same rule as user profile/signature images above. |

## Products (`api/handlers/products.ts`, mounted at `/api/products`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/products` | `products:view` **or** `stock:view` (added 2026-08-18) | Sorted by `code`. `requireOneOfPermissions()` (see below) — the Stock page (`stock:view`-only roles, e.g. `accounting_user`) needs the product catalog to show stock levels, without needing full Product Library management access. |
| `POST /api/products` | `products:create` | `409` on duplicate `code`. `stockQty` defaults to `0` server-side and is never accepted from the client here — see "Stock" below. |
| `PATCH /api/products/:id` | `products:edit` | Partial update; `409` if the new `code` collides with another product. `stockQty` is not client-editable via this route either — only through the Stock routes below. |
| `POST /api/products/import` | `products:create` | **Bulk import from a spreadsheet (2026-09-04)** — body `{ products: [{ code, name, categoryName?, unit?, defaultPrice?, description?, specifications?, isTool?, reorderPoint? }] }`, max 2000 rows. A code that already exists is **skipped, never overwritten**, matched **case-insensitively** (unlike `POST /api/products`, which matches exactly) because spreadsheets exported from other systems routinely change a code's case. `categoryName` is a *name*, not an id — matched case-insensitively against `categories` and created if absent, which needs no extra permission since `api/handlers/categories.ts` already gates category creation on `products:create`. `stockQty`/`avgCost` are forced to `0`: an opening balance may only arrive through a `StockMovement`. Returns `{ created, skipped, categoriesCreated }` and writes one audit entry. Parsing happens in the browser (`src/lib/productImport.ts`); the server only ever sees normalised JSON rows. |
| `DELETE /api/products/:id` | `products:delete` | Hard delete (no soft-delete check server-side beyond the client's own archive/delete UX distinction — `archived` is just a boolean field, set via `PATCH`). |

## Categories (`api/handlers/categories.ts`, mounted at `/api/categories`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/categories` | `products:view` **or** `stock:view` (added 2026-08-18) | Sorted by `name`. Categories share the `products:*` permission family — there is no separate `categories:*` permission. Same `requireOneOfPermissions()` reasoning as `GET /api/products` above — the Stock page shows each product's category name. |
| `POST /api/categories` | `products:create` | `409` on duplicate name (case-insensitive). |
| `PATCH /api/categories/:id` | `products:edit` | Rename and/or toggle `archived`. `409` on duplicate name. |

No `DELETE /api/categories/:id` route exists — matches the pre-migration UI, which only ever supported archive/unarchive for categories, never permanent delete.

## Stock (`api/_lib/stockHandler.ts`, mounted at `/api/stock-movements` via `api/handlers/products.ts` — added 2026-08-18)

Shares `api/handlers/products.ts`'s function file (checked first on the raw pathname) — same sharing convention as `/api/search` sharing
`api/handlers/customers.ts`. `server/app.ts`'s `API_ROUTES` table has a
`"stock-movements": productsHandler` entry. See [MODULES/Product.md](./MODULES/Product.md)
"Stock" for the full feature writeup.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/stock-movements?productId=&sourceId=` | `stock:view` | Both filters optional; either narrows the ledger, omitting both returns the most recent 200 movements across every product, newest first. |
| `POST /api/stock-movements` | `stock:adjust` | Manual receive/deduct/adjust from the Stock page, not tied to any document — body `{productId, kind: "receive"\|"deduct"\|"adjust", qty?, delta?, reason}` (`qty` a positive magnitude for receive/deduct, `delta` a signed correction for adjust). Calls `applyStockMovement()`, the one shared code path (also used by the AR stock-deduction route below) that atomically updates `Product.stockQty` and writes the ledger row — see [DATABASE.md](./DATABASE.md) "`StockMovement`". `400` if a deduction would take `stockQty` below 0 (the atomic conditional-update filter rejects it in the same query, no race window). |

**`requireOneOfPermissions()` (`api/_lib/auth.ts`, added 2026-08-18)**: a new small auth helper, `requireOneOfPermissions(req, permissions[])`, that passes if the caller holds ANY of the listed permissions — the first *shared, reusable* any-of check in `api/_lib/auth.ts` (every other route there uses single-permission `requirePermission()`). Named distinctly from — and not to be confused with — `api/_lib/quotationTemplatesHandler.ts`'s own file-scoped `requireAnyPermission(ctx, permissions[])` (different signature — takes an `AuthContext`, not a request; also folds in a `quotationTemplates:manage` superset check) for `GET /api/quotation-templates`'s own "admin view OR picking-for-a-quotation" need — the two are unrelated functions with a similar idea, deliberately not sharing a name. Added to `auth.ts` specifically because `GET /api/products`/`GET /api/categories` need to stay reachable by two otherwise-unrelated permission groups: Product Library management (`products:view`) and stock-only roles reading the catalog for the Stock page (`stock:view`). See [RBAC.md](./RBAC.md) "Permission dependencies" for the fuller writeup, including how this bug was actually found (it shipped broken for `stock:view`-only roles on the first build pass, caught and fixed during live verification the same day).

## Job Types (`api/handlers/jobtypes.ts`, mounted at `/api/jobtypes` — added 2026-07-10)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/jobtypes` | `quotations:view` | Sorted by `code`. Defensively calls `seedJobTypesIfEmpty()` before listing — see [DATABASE.md](./DATABASE.md) "`JobType`" for why this route (unlike other seed functions) needs to self-heal on every call rather than only at Setup Wizard time. |
| `POST /api/jobtypes` | `company:manage` | `409` on duplicate `code` (case-insensitive). No new `Permission` was added for this — Job Types are treated as company-wide configuration data, matching the precedent already used for bank/VAT/T&C settings. |
| `PATCH /api/jobtypes/:id` | `company:manage` | Rename and/or toggle `isActive`. `409` on duplicate `code`. |

No `DELETE` route — soft-deactivate only (`isActive: false`), same pattern as Categories.

## Quotation Templates (`api/handlers/jobtypes.ts`, mounted at `/api/quotation-templates` — added 2026-07-14, extended 2026-07-15)

Shares `api/handlers/jobtypes.ts`'s handler file (checked first on the raw pathname, before
falling through to the existing Job Type dispatch) — the same established pattern `/api/search` uses by sharing
`api/handlers/customers.ts`. `API_ROUTES` entry: `"quotation-templates"` → the jobtypes handler
(covers every sub-route, incl. `/duplicate` below). Backs the Create Quotation wizard
and the Template Management module — see
[MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md). `/api/scope-of-works*` (added
2026-07-15, see "Scope of Work" below) shares `api/handlers/quotes.ts` the same way.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/quotation-templates?jobTypeCode=&includeArchived=` | `quotationTemplates:view`/`:manage` **or** `quotations:create` | List. Defensively calls `seedQuotationTemplatesIfEmpty()` first (same self-healing pattern as `GET /api/jobtypes`) — only when the collection's `estimatedDocumentCount()` is 0. A plain `quotations:create` browser (Sales picking a template for a quotation) only ever sees `isActive: true`, non-deleted templates; a `:view`/`:manage` holder sees every non-deleted template, or (with `includeArchived=true`) archived ones too. Returns `{ templates: QuotationTemplateSummary[] }`. |
| `GET /api/quotation-templates/:id` | Same as above | Single full template, including `sections`/`internalNotes`. `404`s an inactive template for a non-admin browser. Returns `{ template: QuotationTemplate }`. |
| `POST /api/quotation-templates` | `quotationTemplates:create`/`:manage` | **Added 2026-07-15.** Creates a new manual template. Body: `TemplateContentDraft` (`templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/`description`/`version`/`sections`/`defaultTerms`/`internalNotes`/`isActive`). `409`s on a duplicate `templateCode`. Server sets `sourceType: "manual"`, `sourceFileName`/`sourceSheetName: ""`. **2026-07-15, second Codex-review fix pass**: every item's `productId` is now resolved against a real, non-archived `products` record (one batched query) before saving, and `productSnapshot` is always rebuilt server-side from that record — a client-submitted `productSnapshot` is never trusted; an unresolvable `productId` is silently dropped (item stays, just unlinked). Returns `{ template: QuotationTemplate }`. |
| `PATCH /api/quotation-templates/:id` | Per touched field: `quotationTemplates:activate`/`:manage` for an `isActive` value change, `:archive`/`:manage` for an `isDeleted` value change, `:edit`/`:manage` for any content field — a single call can touch multiple dimensions and needs every relevant permission (or `:manage`) | Content edits accept the full `TemplateContentDraft` shape and return `{ template: QuotationTemplate }` (same server-side product verification as `POST` above); a pure `isActive`/`isDeleted` toggle returns `{ template: QuotationTemplateSummary }`. Permission is checked per-dimension by comparing the request against the **persisted** value, not just field presence — an edit-form save that leaves `isActive` unchanged doesn't require `:activate`. |
| `POST /api/quotation-templates/:id/duplicate` | `quotationTemplates:duplicate`/`:manage` | **Added 2026-07-15.** Body `{ newTemplateCode? }` — auto-generates `<code>-COPY`/`-COPY-2`/... if omitted, `409`s if an explicitly-requested code already exists. Deep-clones `sections`/`items` with fresh ids, appends `" (Copy)"` to the name, always `isActive: false`, `sourceType: "manual"`, `version` reset to `"1.0"`. Original template is never modified. Returns `{ template: QuotationTemplate }`. |
| `POST /api/quotation-templates/import` | `quotationTemplates:import`/`:manage` | Runs `upsertQuotationTemplates()` (`api/_lib/quotationTemplatesHandler.ts`) against the 5 hardcoded seeds in `api/_lib/templateSeedData.ts` — insert if a `templateCode` is new, skip if its content hash is unchanged, `$set`-update otherwise. Idempotent: re-running against unchanged seed data always returns an all-"skipped" report with zero writes. **2026-07-15, second Codex-review fix pass**: also reads the real `.xlsx` workbook (`api/_lib/templateWorkbookParser.ts`) and sets/compares a genuine `sourceWorkbookHash` per template — a real `TemplateImportReport.warnings` entry is added if the workbook changed since the last transcription; a concurrent-insert race (duplicate-key error) is now caught and reported as "skipped" instead of surfacing as a 500. Returns a `TemplateImportReport` directly as JSON. Also writes a `"Templates Imported"` audit entry (added 2026-07-15) whose `details` now include any warnings — the underlying `upsertQuotationTemplates()` itself stays audit-free since it's also called by the defensive empty-collection auto-seed. |

Client wrapper functions: `src/lib/quotationTemplates.ts`'s `fetchQuotationTemplates(opts?)`/
`fetchQuotationTemplate(id)`/`importQuotationTemplates()`/`setQuotationTemplateActive(id, isActive)`/
`setQuotationTemplateArchived(id, isDeleted)`/`createQuotationTemplate(draft)`/
`updateQuotationTemplate(id, draft)`/`duplicateQuotationTemplate(id, newTemplateCode)`.

**2026-07-20, rolled back**: `POST`/`PATCH /api/quotation-templates` briefly gained a second
structural-validation pass (`validateDynamicFieldSchema()`) over a per-item `dynamicFields` array, and
`POST /api/quotes`/`PATCH /api/quotes/:id` briefly accepted `notes`/`vatConditionText`/`warrantyText`/
`deliveryDays` fields — all added to support the generic Dynamic Fields system built for `LI-FRP-LINING`
"v2.0." That entire system was `git revert`ed the same day per an explicit rollback request; none of
those fields/validations exist in the current API surface. Re-running the import route above against
the now-reverted seed is still required to bring the live `LI-FRP-LINING` MongoDB record itself back
to v1.0 content — see `docs/TODO.md`.

## Scope of Work (`api/_lib/scopeOfWorkHandler.ts`, mounted at `/api/scope-of-works` via `api/handlers/quotes.ts` — added 2026-07-15, fixed against an independent Codex review the same day)

Shares `api/handlers/quotes.ts`'s function file (checked first on the raw pathname, before falling
through to the existing quote dispatch) — same established sharing pattern as `/api/quotation-templates` sharing
`api/handlers/jobtypes.ts`. Mounted on the quotes handler specifically (not jobtypes.ts) since a
Scope of Work always belongs to exactly one quotation. `API_ROUTES` entry:
`"scope-of-works"` → the quotes handler. See
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) for the full feature writeup and PDF mapping.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/scope-of-works?quotationId=` | `scopeOfWork:view` | Lists (summary shape only) the non-deleted Scope of Work records for one quotation, newest-updated first. **2026-07-22**: `quotationId` is now optional — omitting it switches to a "list every non-deleted Scope of Work company-wide" mode (a richer row shape, `ScopeOfWorkListItem` — adds `secondaryCode`/`quotationNumber`/`jobTypeCode`/`jobTypeName`/customer name/`issueDate`/`deliveryDate` on top of the by-quotation shape's `id`/`scopeNumber`/`quotationId`/`status`/`updatedAt`), added to back the new standalone Scope of Work management page (`src/pages/scopeOfWork/ScopeOfWorkPage.tsx`, see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md)). Same `scopeOfWork:view` gate either way. **2026-07-23**: the "list every Scope of Work company-wide" mode is now scoped by the new `scopeOfWork:viewAll` permission — a caller without it only gets records it created itself, or **that named it as a document recipient** (same-day second pass, see "Document Recipients" in [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) — a caller who was picked as a recipient can find the record on their own list even without `viewAll`); the by-quotation mode (`quotationId` present) is deliberately left unfiltered — see [RBAC.md](./RBAC.md) "Scope of Work Own-Records-Only Viewing" for why. **2026-08-14**: the own-vs-viewAll check is now the 4-tier `buildOwnershipClause()` cascade (own → `scopeOfWork:viewTeam` → `scopeOfWork:viewDepartment` → `scopeOfWork:viewAll`), merged with the document-recipient `$or` branch rather than replaced by it — see [RBAC.md](./RBAC.md) "Departments + Teams + Tiered Visibility". |
| `POST /api/scope-of-works` | `scopeOfWork:create` + `quotations:view` | Body `{ quotationId, scopeNumber }` — **2026-07-29 (manual-ONLY numbering)**: `scopeNumber` is the user's own typed document number, **required non-blank and completely free-form** (owner decision — no format guardrails), replacing both the old auto-generated `PQ{YYYYMM}-{jobSequence}-{jobTypeCode}-{secondaryCode}` scheme and the old required-`secondaryCode` body field (`secondaryCode` now starts `""` on new records — a legacy optional reference field). Uniqueness is enforced with a friendly pre-check (`409` "เลขที่เอกสาร ... ถูกใช้กับ Scope of Work ใบอื่นแล้ว") backed race-safely by the unique `scopeNumber` index (an `E11000` on insert maps to the same `409`); `ensureScopeNumberIndexes()` defensively creates that index / drops the legacy `{yearMonth, jobSequence}` unique index at runtime. Loads the quotation, derives `customerSnapshot`/`items`/`jobTypeCode`/`customerPoNumber`/`deliveryLocation`/`remarks`/`quotationSalesperson`/payment description from it (`deriveFromQuotation()`), resolves a default `seller` from `quote.salesperson` (`resolveDefaultSeller()`), and builds the default checklist structure for that Job Type (`buildDefaultChecklistGroups()`). `yearMonth`/`jobSequence` are written as `""`/`0` (legacy fields, no counter involved anymore). `404` if the quotation doesn't exist. Returns `{ scopeOfWork: ScopeOfWork }`. |
| `GET /api/scope-of-works/:id` | `scopeOfWork:view` | Full document. `404` if missing or soft-deleted. Not scoped by `scopeOfWork:viewAll` — see [RBAC.md](./RBAC.md) "Scope of Work Own-Records-Only Viewing" for why direct record access stays unfiltered while the list/search do get filtered. |
| `PATCH /api/scope-of-works/:id` | `scopeOfWork:edit` + (owner **or** `scopeOfWork:finalize`) | `400` if the record's `status` isn't `"Draft"` (locked — use duplicate/Rewrite instead) — **except (2026-07-29, the "ทวง PO" pass)** a PATCH touching nothing but the `FOLLOW_UP_FIELDS` (`customerPoNumber`/`additionalPoNumbers`/`documentRecipients`/`documentRecipientMessage` — `additionalPoNumbers` joined the set 2026-08-31 for the same reason as `customerPoNumber`: a second customer PO arrives just as late as the first) is allowed in any status: they're follow-up bookkeeping (a customer PO usually arrives after approval), not approved document content. Accepts a partial `ScopeOfWorkUpdateFields` body — every field is independently validated/sanitized (`sanitizeChecklistGroups()` re-clamps a `"single"`-selectionType group to at most one checked option and only recognizes group/option `key`s the server itself generated, so a client can toggle state but never inject new structure; `sanitizeItems()` validates the fully-user-editable item array). **2026-07-29 (manual-ONLY numbering)**: also accepts `scopeNumber` — the user may retype the document number **while Draft only** (the PendingApproval/Final lock above already covers the rest); required non-blank when sent, uniqueness re-checked (friendly `409` + unique-index backstop, same as create). The old recompute behaviors are **removed**: editing `issueDate` across a month boundary no longer re-reserves a `jobSequence`, and editing `secondaryCode` (still an optional legacy reference field) no longer rewrites `scopeNumber` — the number only ever changes when the user retypes it. **2026-07-23**: also accepts `documentRecipients` (`{ [checklistOptionKey]: userId[] }`) — `sanitizeDocumentRecipients()` drops any key that isn't in `ALL_RECIPIENT_KEYS` (the 6 real `documentsToSend` departments + the free-pick `additional` key, the latter added 2026-08-07 — see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients") and verifies every referenced user id actually exists (one batched query), capped at 20 recipients per key. **2026-07-23, same day, third pass**: also accepts `documentRecipientMessage` (free text, sanitized like any other long-text field) — see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients". **2026-07-23, same day**: also accepts `revisionNote` (free text, sanitized like any other long-text field) — see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Revision Note". **2026-08-31**: also accepts `additionalQuotationNumbers` and `additionalPoNumbers` (`string[]`, the 2nd-and-beyond quotation / customer PO numbers on a Scope that covers several) — `sanitizeAdditionalNumbers()` requires an array, caps it at 10 entries, runs each through `sanitizeShortText`, and drops blanks (the editor adds an empty row before it is typed into). Only `additionalPoNumbers` is a `FOLLOW_UP_FIELD`; extra quotation numbers are known while drafting, so they stay locked after approval like any other content. Returns `{ scopeOfWork: ScopeOfWork }`. |
| `POST /api/scope-of-works/:id/finalize` | `scopeOfWork:finalize` | `400` if already `"Final"`. **2026-07-16**: validates the record via `validateScopeOfWorkForFinalization()` first — a `422 DOCUMENT_INCOMPLETE` (`fieldErrors`/`groupErrors`) is returned if any required header field, mandatory checklist group, item, payment-percentage rule, or the approver signature is missing (approver is required here even though it isn't for Print — see the row below). Sets `status: "Final"` — an irreversible lock in this pass (no un-finalize route); use "ทำสำเนา" to keep editing from a copy. |
| `POST /api/scope-of-works/:id/duplicate` | `scopeOfWork:create` + `scopeOfWork:view` | **2026-07-29 (manual-ONLY numbering)**: body `{ scopeNumber }` — the copy's own **user-typed** document number, required/unique/free-form exactly like create (the route no longer mints one; the client asks the user via a prompt). Deep-clones the source record (fresh item/spec-line ids, source's own `secondaryCode` carried over as a legacy reference), fresh `issueDate`, legacy `yearMonth`/`jobSequence` reset to `""`/`0`, resets `status` to `"Draft"` and `seller` to the caller (blank `approver`). Source record is never modified. Returns `{ scopeOfWork: ScopeOfWork }`. |
| `POST /api/scope-of-works/:id/rewrite` | `scopeOfWork:create` + `scopeOfWork:view` | **Added 2026-07-22**, mirroring Quotation's own Rewrite feature — see [MODULES/Quotation.md](./MODULES/Quotation.md) "Business Flow" item 6a. Deep-clones the source record like `duplicate` above, but sets `scopeNumber` to `{root}-R{n}` (root recovered from the source's own `scopeNumber` via `getRevisionRoot()`, reused verbatim from `api/_lib/quoteRevisions.ts`; `n` from an atomic per-root counter `scope_revision_{root}`) — **2026-07-29**: the root is now whatever the user originally typed (manual-ONLY numbering), and the `-R{n}` suffix is still appended automatically; `yearMonth`/`jobSequence` (legacy)/`secondaryCode`/`issueDate` all pass through unchanged from the source. Resets `status` to `"Draft"`, `version: 1`, `seller` to the caller, blank `approver`, fresh item/spec ids. Writes a `"Scope of Work Rewritten"` audit entry. Bounded retry (`MAX_SCOPE_NUMBER_ATTEMPTS`) on the (essentially unreachable) chance of a duplicate-key error. Source record is never modified. Returns `201 { scopeOfWork: ScopeOfWork }`. |
| `POST /api/scope-of-works/:id/refresh` | `scopeOfWork:edit` (owner or `:finalize`) + `quotations:view` | "อัปเดตข้อมูลจากใบเสนอราคา" — re-derives only the quotation-sourced fields (`customerSnapshot`/`customerPoNumber`/`deliveryLocation`/`remarks`/`items`/`quotationNumber`/`quotationSalesperson`) from the current quotation state; everything the user filled in by hand (checklist, payment conditions, shipping/billing contact, signatures, `secondaryCode`, and — since 2026-08-31 — `additionalQuotationNumbers`/`additionalPoNumbers`, which have no counterpart on the quotation to re-pull, so refreshing can never wipe a number someone typed) is left untouched. `400` if `status` is `"Final"`. The `quotations:view` check (2026-07-15, Codex review Medium fix) mirrors the same requirement `create` already had — previously refresh only checked Scope of Work authorization, not source-quotation access. The client shows a confirm dialog before calling this (see `ScopeOfWorkDocument.tsx`) — the server itself doesn't require a special confirmation flag, since the *client* is expected to have already warned the user. |
| `POST /api/scope-of-works/:id/submit-approval` | `scopeOfWork:edit` + owner-or-finalize | **Added 2026-07-24 (approval workflow)** — Draft → `PendingApproval`; validates print-level completeness (approver signatory not required at submit — it's filled at approve time). Notifies every active `scopeOfWork:finalize` holder in-app. |
| `POST /api/scope-of-works/:id/finalize` | `scopeOfWork:finalize` | **Meaning changed 2026-07-24: "อนุมัติ"** — only valid from `PendingApproval` (Draft → 400 "ต้องส่งขออนุมัติก่อน"); auto-fills the approver signatory with the approving user + date, re-validates at finalize level, sets `Final` (terminal — only Rewrite continues). Notifies the creator. Route name kept from the original direct-finalize behavior. |
| `POST /api/scope-of-works/:id/reject` | `scopeOfWork:finalize` | **Added 2026-07-24** — `PendingApproval` → Draft; body `{ comment }` **required**; comment lands in the audit entry and the creator's notification. |
| `POST /api/scope-of-works/:id/withdraw-approval` | `scopeOfWork:edit` + owner-or-finalize | **Added 2026-07-24** — the requester pulls back a pending request (`PendingApproval` → Draft), no approver involvement needed. |
| `POST /api/scope-of-works/:id/print` | `scopeOfWork:print` | **2026-07-16**: now validates first via `validateScopeOfWorkForPrint()` — a `422 DOCUMENT_INCOMPLETE` is returned if incomplete (approver is **not** required here while still `Draft`, only once already `Final` — that's a Finalize-time-only requirement). On success, writes a `"Scope of Work Printed"` audit entry — called by the client immediately before `window.print()`. |
| `POST /api/scope-of-works/:id/send-documents` | `scopeOfWork:edit` (**changed 2026-07-24** from `scopeOfWork:print` — a view/print-only role could fire the send while unable to pick recipients; no ownership check, works on `"Final"`) | **In-app-notification-only since 2026-08-07** (direct user request — email delivery removed entirely; the endpoint's email history: central Resend 2026-07-23 → person-to-person Gmail/App Passwords 2026-08-07 morning → no email, same day). Writes one in-app `Notification` (`type: "scope_of_work_document_sent"`, `relatedScopeId`/`relatedScopeNumber` set) per resolved recipient — see [MODULES/Notifications.md](./MODULES/Notifications.md). Recipient resolution unchanged: every recipient picked in `documentRecipients` for whichever `documentsToSend` checklist departments are currently checked (departments with recipients but no longer checked are skipped; a checked department with zero recipients contributes nothing), **plus** every recipient under the checklist-independent `additional` key ("ผู้รับเพิ่มเติม"), always; deduped across keys. `400` if nothing resolves to at least one recipient. Writes a `"Scope of Work Document Notification Sent"` audit entry, and returns `200 { ok: true, sentCount, failedCount: 0, recipientCount }` (`sentCount` = notified recipients; shape kept from the email era so the client toast is unchanged). No ownership check, works on a `"Final"` record too — same shape as Print. |
| `POST /api/scope-of-works/:id/chase-po` | `scopeOfWork:chasePo` (**changed same day 2026-07-29** from `scopeOfWork:view`, on direct owner request — chasing is now an explicitly-granted right; default grants Administrator/Approver 1/Approver 2, needs a manual Role Management tick on production) | **Added 2026-07-29 ("ทวง PO")** — sends an in-app bell notification (`type: "scope_of_work_po_chase"`, deep-linked via `relatedScopeId`) chasing the customer PO number, to the resolved responsible person: ERP user `fullName`-matching the frozen `quotationSalesperson` → the `seller.userId` signatory link → the record's creator. Deliberately repeatable (no cooldown) and audit-logged per press (`"Scope of Work PO Chased"`, incl. who was notified). `400` once the record already has a PO number, or when no user account resolves. Returns `200 { ok: true, notifiedUserName }`. |
| `POST /api/scope-of-works/:id/attachments` | `scopeOfWork:edit` + (owner **or** `scopeOfWork:finalize`) — **any status since 2026-07-29** (Draft-only guard removed, the "ทวง PO" pass: attachments are follow-up data, a PO file usually arrives after approval) | **Added 2026-07-24 (reworked to MongoDB storage the same day)** — uploads one attachment; JSON body `{fileName, contentType, dataBase64}`, ≤ 2 MB original file / 5 files per record. File bytes are stored as BSON Binary in the separate `scope_attachment_files` collection (never embedded in the record); the record gains a `ScopeOfWorkAttachment` metadata row whose `url` is an app-relative capability URL. Returns `{ scopeOfWork }` (updated record) and writes a `"Scope of Work Attachment Added"` audit entry. |
| `GET /api/scope-of-works/:id/attachments/:attachmentId/download?key=...` | **none (capability URL)** | **Added 2026-07-24** — serves the file bytes. Deliberately no session auth: the random 24-byte `downloadKey` in the URL is the authorization, because these links go into recipient emails and mail clients have no app session. Wrong/missing key → opaque 404. **Same-day review-fix pass**: only a whitelist of script-free content types (PDF/PNG/JPEG/GIF/WebP/plain text) is served `inline`; everything else (crucially `text/html`/`image/svg+xml`) is forced to `Content-Disposition: attachment` under `application/octet-stream` + `X-Content-Type-Options: nosniff`, so an uploaded file can never execute script on the app's own origin (the uploader chooses `contentType`, and this route is unauthenticated). Filenames are RFC 5987-encoded (bare `'()*` also escaped). |
| `DELETE /api/scope-of-works/:id/attachments/:attachmentId` | `scopeOfWork:edit` + (owner **or** `scopeOfWork:finalize`) — **any status since 2026-07-29** (same follow-up-data exemption as upload) | **Added 2026-07-24** — removes one attachment: deletes its `scope_attachment_files` document, then the metadata row. Returns `{ scopeOfWork }` and writes a `"Scope of Work Attachment Removed"` audit entry. |
| `DELETE /api/scope-of-works/:id` | `scopeOfWork:delete` + (owner **or** `scopeOfWork:finalize`) | Soft delete (`isDeleted: true`) — filtered out of every list/get thereafter. No restore endpoint exists yet (see MODULES/ScopeOfWork.md "Remaining Business Questions"). |

## Receiving Report (`api/_lib/receivingReportHandler.ts`, mounted at `/api/receiving-reports` via `api/handlers/quotes.ts` — added 2026-09-03)

The Store department's ใบรับสินค้า. Shares the quotes handler file like every other document
handler. Full model writeup in
[MODULES/Store.md](./MODULES/Store.md).

| Route | Permission | Notes |
|---|---|---|
| `GET /api/receiving-reports[?purchaseOrderId=]` | `receivingReport:view` | Summary rows with ordered/received/outstanding value computed on read. The `purchaseOrderId` form is an existence check ("does this PO already have one?") and is therefore **not** scoped by `receivingReport:viewAll` — same carve-out as Purchase Order's by-request lookup. |
| `POST /api/receiving-reports` | `receivingReport:create` (+ `purchaseOrder:view` when a PO is given) | **2026-09-23**: body `{ receiveCode?, purchaseOrderId? }` — `receiveCode` `"RR"`/`"RX"`/`"RI"` (default `RR`, 400 otherwise) is the number prefix with its own counter; **no `purchaseOrderId` = a blank report** (empty header and lines, VAT 7%). With a PO: body `{ purchaseOrderId }`. `400` unless the PO is `Final`. Snapshots the PO's lines, vendor, VAT rate and document-level discount. **`409` when the PO already has one**, with the existing document's `receivingReportId` in the error body so the client can open it instead of dead-ending; a duplicate that slips past the read is caught by the unique partial index and answered the same way. |
| `GET /api/receiving-reports/:id` | `receivingReport:view` | Full document. |
| `PATCH /api/receiving-reports/:id` | `receivingReport:edit` (owner or `:viewAll`) | Accepts `documentNumber` (unique, `409` on collision), `remarks` and `status`; **a blank report also accepts** `jobCode`, `vendorName`, `vendorTaxId`, `vendorAddress`, `orderVatRate` and `lines` (`400` on a PO-based report). Blank lines are rebuilt from the body, but a line with receipts cannot be removed, change product, or drop below its received quantity; catalog lines take code/unit from the product register. New line ids matching `rrline_*` are kept so auto-save never renames a line under the user. Lines and batches are never client-writable — one is a snapshot, the other is posted accounting fact. Reopening a fully received document is refused. Auto-save eligible. |
| `DELETE /api/receiving-reports/:id` | `receivingReport:delete` | Soft delete, and **`400` if any receipt has been posted** — reverse the rounds first so stock and payables unwind properly. |
| `POST /api/receiving-reports/:id/receipts` | `receivingReport:receive` | One round of receiving. A blank report needs `vendorName` first (`400`) — the payable must name a creditor. Validates `qty ≤ outstanding` per line, at least one positive line, a non-empty `invoiceNumber`, and that every referenced product still exists — all **before** the first stock write, so a rejected round writes nothing at all. Then: `applyStockMovement(kind:"receive", unitCost, sourceType:"receiving_report")` per line that has a `productId` (a hand-typed line posts a payable but no stock) → one `ap_entries` row → push the batch → auto-close when nothing is outstanding. Returns the updated document. |
| `DELETE /api/receiving-reports/:id/receipts/:batchId` | `receivingReport:receive` | Reverses a round: stock back out (`kind: "adjust"`), payable deleted, document reopened. **Latest round only** (`400` otherwise — the moving average walks forward through receipts) and only while the payable is `Unpaid` (`409`). ⚠️ The reversal uses the *current* average cost, so quantities always return exactly but value may not if a different-priced receipt landed in between. |
| `POST /api/receiving-reports/:id/print` | `receivingReport:print` | Audit entry only. |
| `POST|DELETE /api/receiving-reports/:id/attachments[/:attachmentId]` | `receivingReport:edit` | Shared attachment engine, `docType: "receiving-reports"` — scanned vendor delivery notes and tax invoices. |
| `GET /api/receiving-reports/:id/attachments/:attachmentId/download?key=` | **none — capability URL** | Same unauthenticated capability-key rules as every other attachment download; dispatched before `requireUser`. |

## Accounts Payable registers (`api/_lib/apHandler.ts`, mounted at `/api/ap-entries` — added 2026-09-03)

Backs both ทะเบียนเจ้าหนี้ and ทะเบียนภาษีซื้อ. **Read-mostly by design: there is no create route.**
Every row is written by the receiving-report receipt route.

| Route | Permission | Notes |
|---|---|---|
| `GET /api/ap-entries?month=YYYY-MM&vendor=&status=` | `ap:view` | Sorted by `invoiceDate`. The month filter keys on the **invoice** date, not the posting date (a purchase-tax report follows the tax invoice's own month), and is applied as a `>= YYYY-MM-01` / `< next month` range rather than a regex, so it uses the index and never treats a query string as a pattern. `400` on a malformed month. |
| `GET /api/ap-entries/summary?month=YYYY-MM` | `ap:view` | Month totals (`subtotal`/`vatAmt`/`total`/`unpaidTotal`) plus a per-vendor breakdown, sorted by outstanding descending. |
| `PATCH /api/ap-entries/:id` | `ap:manage` | `{ status: "Paid"|"Unpaid", paymentRef }` and nothing else. Clearing a payment wipes `paidAt`/`paidBy`/`paymentRef` together rather than leaving stale traces that read as still-paid. Writes an audit entry either way. |

## Team tool holdings (`api/_lib/toolHoldingsHandler.ts`, mounted at `/api/tool-holdings` via `api/handlers/products.ts` — added 2026-09-03)

| Route | Permission | Notes |
|---|---|---|
| `GET /api/tool-holdings?departmentId=&teamId=&workTypeCode=&from=&to=` | `stock:view` | Owns no collection — aggregates `stock_movements` from material requisitions where the product has `isTool: true`, per (department, team, product): `issued`, `returned`, `held = issued − returned`, filtered to `held > 0`. |
| `POST /api/tool-holdings/issue` | **`stock:adjust`** | **Added 2026-09-03b** — issue tools to a team, or take them back, without opening a requisition. Body `{ mode: "issue"|"return", departmentId, teamId, workTypeCode?, note?, lines: [{productId, qty}] }`. Writes to the **same** `stock_movements` ledger as a requisition issue, only with `sourceType: "tool_issue"` and its own `TL-YYYYMM-NNNN` slip number (one per press, not per line), so holdings always sum both paths. `teamId` is required (holdings belong to a team, not a department) and must belong to the chosen department; only `isTool` products are accepted; issuing checks the whole basket with `assertProductsHaveStock()` before the first write; returning is capped at what that team is actually holding. Department/team/work-type names are resolved server-side. |
| `GET /api/tool-holdings?report=1&…` | `stock:view` | The individual movements inside a Bangkok-local date range (max 5000, `truncated` flag), viewed from the team's side: issuing is positive, returning negative. `400` on a malformed date. |
## Delivery Order (`api/_lib/deliveryOrderHandler.ts`, mounted at `/api/delivery-orders` via `api/handlers/quotes.ts` — added 2026-07-23)

Shares `api/handlers/quotes.ts`'s function file (checked on the raw pathname right after the Scope
of Work check, before falling through to the plain quote dispatch) — same sharing
convention Scope of Work and Quotation Templates already use. `API_ROUTES` entry:
`"delivery-orders"` → the quotes handler. See
[MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md) for the full feature writeup and PDF mapping.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/delivery-orders?scopeOfWorkId=` | `deliveryOrder:view` | Lists (summary shape only) the non-deleted Delivery Order records for one Scope of Work, newest-updated first — deliberately unfiltered by `deliveryOrder:viewAll` (an existence check, same reasoning as Scope of Work's identical by-quotation lookup). Omitting `scopeOfWorkId` switches to a "list every non-deleted Delivery Order company-wide" mode (`DeliveryOrderListItem` — adds `customerCompanyName`/`installmentCount` on top of the by-scope shape's `id`/`scopeOfWorkId`/`status`/`updatedAt`), scoped by `deliveryOrder:viewAll` (own-created-only without it) — same shape/scoping convention as Scope of Work's own `GET /api/scope-of-works`. **2026-08-14**: the own-vs-viewAll check is now the 4-tier `buildOwnershipClause()` cascade (own → `deliveryOrder:viewTeam` → `deliveryOrder:viewDepartment` → `deliveryOrder:viewAll`) — see [RBAC.md](./RBAC.md) "Departments + Teams + Tiered Visibility". |
| `POST /api/delivery-orders` | `deliveryOrder:create` + `scopeOfWork:view` | Body `{ scopeOfWorkId }` — no other input required (unlike Scope of Work's `secondaryCode` prompt). Loads the source Scope of Work, snapshots `customerCompanyName`/`customerAddress` from its `customerSnapshot` and `items` (`deriveItemsFromScope()` — excludes any `isSectionHeader` row), and builds `installments` 1:1 from the Scope of Work's `paymentConditions.installments` (`deriveInstallmentsFromScope()` — `itemIds` starts empty, `documentNumber`/`issueDate` start blank, `remark` auto-drafted from `pct`/`label`/`paymentType`/`days`). `404` if the Scope of Work doesn't exist. No uniqueness constraint on `scopeOfWorkId` — returns `201 { deliveryOrder: DeliveryOrder }` every time. |
| `GET /api/delivery-orders/:id` | `deliveryOrder:view` | Full document. `404` if missing or soft-deleted. Not scoped by `deliveryOrder:viewAll`, same reasoning as Scope of Work's identical single-record `GET`. |
| `PATCH /api/delivery-orders/:id` | `deliveryOrder:edit` + (owner **or** `deliveryOrder:finalize`) | `400` if the record's `status` is already `"Final"`. Accepts a partial `{ installments }` body — only `itemIds`/`documentNumber`/`issueDate`/`remark` are client-writable per row (`sanitizeInstallmentsUpdate()`); `pct`/`label`/`paymentType`/`days` always mirror the record's own current values (never independently editable here — they're synced only via `/refresh`), and a row's `id` must already exist on the document (a client can toggle which items go on an existing page, but can't invent a new installment). `itemIds` referencing an item no longer on the document are silently dropped. Returns `{ deliveryOrder: DeliveryOrder }`. |
| `POST /api/delivery-orders/:id/refresh` | `deliveryOrder:edit` (owner or `:finalize`) + `scopeOfWork:view` | "อัปเดตข้อมูลจาก Scope of Work" — re-derives `scopeNumber`/`customerCompanyName`/`customerAddress`/`items` from the current Scope of Work state, and reconciles `installments` against its current `paymentConditions.installments` by stable `id`: a row that still exists keeps its `itemIds` (filtered against the refreshed item list)/`documentNumber`/`issueDate`/`remark`; a new installment gets a fresh blank page; a removed one simply drops out. `400` if `status` is `"Final"`. The client shows a confirm dialog before calling this, same convention as Scope of Work's own refresh. |
| `POST /api/delivery-orders/:id/installment-numbers` | `deliveryOrder:edit` (owner/approver rules as for `PATCH`) | Body `{ installments: [{ id, documentNumber, issueDate }] }`. Writes **only** those two fields per installment row and **has no status lock**, so the printed number/date can still be corrected after the document is `Final` (Project department request, 2026-08-27). Row ids must already exist. Always writes an audit entry; **not** auto-save-eligible. |
| `POST /api/delivery-orders/:id/submit-approval` | `deliveryOrder:edit` + owner-or-finalize | **Added 2026-07-24 (approval workflow)** — Draft → `PendingApproval`. Notifies every active `deliveryOrder:finalize` holder in-app (`relatedDeliveryOrderId` deep-link). |
| `POST /api/delivery-orders/:id/finalize` | `deliveryOrder:finalize` | **Meaning changed 2026-07-24: "อนุมัติ"** — only valid from `PendingApproval`; sets `Final` (terminal — only Rewrite continues; the pre-2026-07-24 "no way onward from Final" note no longer applies). Notifies the creator. Still no required-field validation gate (deliberately simpler than Quotation/Scope of Work). |
| `POST /api/delivery-orders/:id/reject` | `deliveryOrder:finalize` | **Added 2026-07-24** — `PendingApproval` → Draft; body `{ comment }` **required**. |
| `POST /api/delivery-orders/:id/withdraw-approval` | `deliveryOrder:edit` + owner-or-finalize | **Added 2026-07-24** — requester pulls back a pending request (`PendingApproval` → Draft). |
| `POST /api/delivery-orders/:id/rewrite` | `deliveryOrder:create` (+ `:view`) | **Added 2026-07-24** — the only way to change an approved document: fresh Draft copy of a **Final** record (400 otherwise — a Draft is editable directly), same `scopeOfWorkId`, installment ids preserved so refresh reconciliation-by-id still works; new createdAt/createdBy, version 1. The by-scope existence lookup sorts by `updatedAt` desc, so the rewrite becomes the record the Scope of Work's "เปิดใบส่งมอบสินค้า" button opens. |
| `POST /api/delivery-orders/:id/attachments` | `deliveryOrder:edit` (owner/approver rules as for `PATCH`) | **Added 2026-09-03** (owner: *"ใบส่งมอบสามารถแนบใบส่งมอบได้ด้วยเหมือนกับ cost control"*) — shared attachment engine (`api/_lib/documentAttachments.ts`, `docType: "delivery-orders"`), identical contract to the Job Order / Purchase Request routes: body `{ fileName, contentType, dataBase64 }`, **no status lock** (a customer-signed delivery note arrives after approval), caps 2 MB/file and 5 files/document. Also refused for a department *recipient* of the document (`assertNotDepartmentRecipientOnly` — view/print only). Returns the updated Delivery Order. |
| `DELETE /api/delivery-orders/:id/attachments/:attachmentId` | `deliveryOrder:edit` | Removes the metadata and the stored bytes. Same recipient-only refusal. |
| `GET /api/delivery-orders/:id/attachments/:attachmentId/download?key=` | **none — capability URL** | Deliberately unauthenticated, same rules as the Job Order download route — which is why it is dispatched **before** the `assertNotDepartmentRecipientOnly` gate (that gate calls `requireUser`). |
| `DELETE /api/delivery-orders/:id` | `deliveryOrder:delete` + (owner **or** `deliveryOrder:finalize`) | Soft delete (`isDeleted: true`) — filtered out of every list/get thereafter. No restore endpoint. |
| ~~`GET /api/delivery-orders/:id/view?key=...`~~ | — | **Added and removed 2026-07-24 (same day)** — a session-less capability-URL HTML view linked from the Scope of Work recipient email briefly existed; removed on direct user request ("เอาที่ติ๊กใบส่งมอบออกไปเลย เดี๋ยวแนบไฟล์เอา") — the preferred flow is printing the FM-SL-05 form to PDF and attaching it via the normal Scope of Work ไฟล์แนบ feature. The route now 404s; a `shareKey` field may linger on `delivery_orders` documents from its brief lifetime (harmless, nothing reads it). |

Every route writes an audit entry (module `"Delivery Order"`) reusing the already-defined
`relatedScopeId`/`relatedScopeNumber` `AuditLogEntry` fields to point back at the source Scope of
Work — no dedicated `relatedDeliveryOrderId` field was added this pass (see the handler's own doc
comment on `writeDeliveryOrderAuditEntry()`).

Client wrapper functions: `src/lib/scopeOfWork.ts`'s `fetchScopeOfWorksByQuotation(quotationId)`/
`fetchScopeOfWork(id)`/`createScopeOfWorkFromQuotation(quotationId, secondaryCode)`/
`updateScopeOfWork(id, fields)`/`finalizeScopeOfWork(id)`/`duplicateScopeOfWork(id)`/
`refreshScopeOfWorkFromQuotation(id)`/`deleteScopeOfWork(id)`/`logScopeOfWorkPrinted(id)`.

## Accounts Receivable (`api/_lib/arHandler.ts`, mounted at `/api/ar-milestones` and `/api/ar-documents` via `api/handlers/quotes.ts` — added 2026-08-17 Phase 1, extended 2026-08-18 Phase 1.5)

Shares `api/handlers/quotes.ts`'s function file on the raw pathname (same convention as Scope of
Work/Delivery Order). Full design: [MODULES/Accounting.md](./MODULES/Accounting.md). Client wrapper:
`src/lib/accounting.ts`.

| Route | Permission | Notes |
|---|---|---|
| `GET /api/ar-milestones?scopeOfWorkId=` | `ar:view` | Billing-milestone rows (lazily created per opened installment). |
| `POST /api/ar-milestones/open` | `ar:create` | Returns-or-creates the milestone for `{scopeOfWorkId, installmentId}` — frozen snapshot of pct/label/paymentType/days + contract total. |
| `PATCH /api/ar-milestones/:id` | `ar:create` | `workClassification`/`retentionPct`/`checklistState` only; refused once billed. |
| `POST /api/ar-milestones/:id/refresh` | `ar:create` | Explicit-only re-pull from the Scope of Work; refused once billed. |
| `POST /api/ar-milestones/:id/attachments` + `DELETE`/`GET .../:attachmentId` | `ar:create` (upload/delete), `ar:view` (download) | Checklist evidence, ≤2 MB × ≤5/milestone, own `ar_attachment_files` collection (session-gated, not capability-URL). |
| `POST /api/ar-documents` | `ar:issue` | Issues the milestone's principal document (AR if down-payment, IV otherwise) **plus** a companion BI in one action. Checklist must be complete; >2-installment shapes refused (Phase 1 guard). |
| `POST /api/ar-documents/manual` | `ar:create` **and** `ar:issue` (both) | **Added 2026-08-18.** Freestanding AR/IV creation with no Scope of Work/milestone (`scopeOfWorkId`/`milestoneId` both `""`, `isManual: true`) — plus a companion BI in the same action, same as `POST /api/ar-documents`. Body `{docType: "AR"\|"IV", customer: {companyName, address, taxId, branch, contactName, phone, email}, paymentType, days, lines: [{description, qty, unit, unitPrice}]}`. Requires ≥1 valid line and a non-empty `companyName`. Deliberately a separate handler (`handleManualIssue()`) from `POST /api/ar-documents` — see [MODULES/Accounting.md](./MODULES/Accounting.md) "Manual Tax Invoice Creation". |
| `GET /api/ar-documents?scopeOfWorkId=&status=&docType=&month=` | `ar:view` | `docType` ∈ AR/IV/BI/RE, `month` = Gregorian `YYYY-MM` matched against `docDate` — both validated (400 otherwise). Backs the per-document-type pages + monthly tax summary (2026-08-18). |
| `GET /api/ar-documents/:id` | `ar:view` | One document. |
| `POST /api/ar-documents/:id/receipt` | `ar:issue` | **Added 2026-08-18.** Issues an RE (ใบเสร็จรับเงิน) from an issued AR/IV: refuses non-AR/IV targets, cancelled targets, and duplicates (an active RE already linked via `lines.linkedArDocumentId`); amount = the invoice's VAT-inclusive net with zero VAT of its own; closes a non-deposit milestone (`work_open` → `closed`). |
| `POST /api/ar-documents/:id/cancel` | `ar:cancel` | Reason required; status flip only, never a delete. Cancelling an RE that closed its milestone reopens it (`closed` → `work_open`). |
| `POST /api/ar-documents/:id/stock-deduction` | `stock:adjust` | **Added 2026-08-18.** Cuts stock against an issued IV (ใบกำกับภาษี/ใบส่งสินค้า) — `400`s for any other `docType`, `400`s if not `status: "issued"`. Body `{lines: [{productId, qty}]}` — deliberately a manual, staff-picked mapping rather than derived from the invoice's own line items, since `ArDocumentLine` (and the `QuoteLine` it's built from) carries no `productId` at all; see [MODULES/Accounting.md](./MODULES/Accounting.md) "Stock". Writes one `StockMovementFields` row per line via `applyStockMovement()` (`sourceType: "ar_document"`, `sourceId` = the document's `_id`), and sets `ArDocumentFields.stockDeducted = true` (never reset back to `false` by a later call — once any stock has been cut against a document it reads as "ตัดสต๊อกแล้ว" from then on). Both the plain-paper and NCR print layouts stamp this status live at print time — see [MODULES/Accounting.md](./MODULES/Accounting.md). Callable more than once per document (a single invoice can ship in parts). Writes an audit entry (module `"บัญชีลูกหนี้"`, action `"AR Stock Deducted"`). |
| `GET /api/ar-dashboard?from=&to=&salesperson=` | `ar:view` | **Added 2026-08-18, `salesperson` added same day.** Accounting Dashboard aggregation — KPIs, a 12-month AR+IV trend, doc-type breakdown, AR aging, the milestone billing-status funnel, and top customers. `from`/`to` (default: current month) scope only the period-based sections (issued totals/VAT/doc-type breakdown/top-customer sales); aging, the billing funnel, and the deposit-not-billed count are always current-state snapshots, never date-filtered — see `handleDashboard()`'s doc comment for why. `salesperson` (matched via `scopeOfWorkId` → `ScopeOfWork.quotationSalesperson`, since AR documents carry no salesperson field of their own) is different in kind — it applies to every section, including the current-state ones. All computed via plain `find()` + JS reduction (no revision-chain dedup needed here, unlike the main Dashboard). |

Numbering: atomic Buddhist-year `{PREFIX}{YY}{MM}{SEQ}` per prefix per month
(`api/_lib/documentNumbering.ts`, counters `ar_/iv_/bi_/re_{yy}{mm}`), matching the company's real
"Express" software numbering. Issue/cancel write audit entries (module `"บัญชีลูกหนี้"`).
## Project (`api/_lib/projectHandler.ts` + `materialRequisitionHandler.ts` + `jobOrderHandler.ts` + `purchaseRequestHandler.ts`, mounted at `/api/projects`, `/api/material-requisitions`, `/api/job-orders`, `/api/purchase-requests` via `api/handlers/quotes.ts` — added 2026-08-18, Stage 3)

Same 12/12-slot-sharing convention as Scope of Work/Delivery Order/AR above (`api/handlers/` is
exactly 9 files + 3 plain-route files, no headroom — confirmed before this pass). A Project is
generated from an existing Scope of Work and distributes every item across one of 3 sourcing
branches, each branch spawning a real sub-document. See [DATABASE.md](./DATABASE.md) "Project
module" for the full domain-shape writeup and PDF-to-field mapping. **No UI yet** (Stage 4+) — no
`src/lib` wrapper functions (`fetch*`/`create*`/etc.) exist yet either, unlike every route table
below this line in the file.

### Project

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/projects?scopeOfWorkId=` | `project:view` | Lists (summary shape) non-deleted Projects for one Scope of Work — an existence check, deliberately unfiltered by `project:viewAll`, same reasoning as Scope of Work's/Delivery Order's identical by-source lookups. |
| `GET /api/projects` (no `scopeOfWorkId`) | `project:view` | "List every Project company-wide" mode, scoped by `project:viewAll` (own-created-only without it) via `buildSimpleOwnershipClause()` (`api/_lib/visibility.ts`, new — a binary own-vs-viewAll filter, since Stage 2 deliberately gave this module no `:viewTeam`/`:viewDepartment` tiers). Returns `ProjectListItem[]`. |
| `POST /api/projects` | `project:create` + `scopeOfWork:view` | Body `{ scopeOfWorkId }`. Builds `items: ProjectItem[]` 1:1 from the Scope of Work's non-header items, each starting `sourcingMethod: "unassigned"`/`itemStatus: "pending"`. `404` if the Scope of Work doesn't exist. **`400` if the Scope of Work is not `status: "Final"`** (added 2026-08-20 — only an approved job can open a project; a still-editable scope would let sub-documents be issued against items the job later changes, and a scope refresh regenerates every item id, orphaning those links. See [MODULES/Project.md](./MODULES/Project.md) "Approval gate"). Returns `201 { project }`. |
| `GET /api/projects/:id` | `project:view` | Full document. `404` if missing/soft-deleted. |
| `PATCH /api/projects/:id` | `project:edit` + (owner **or** `project:finalize`) | Top-level fields only — currently just `status` (`"Planning" \| "InProgress" \| "Completed"`). Item-level sourcing assignment is a separate route (below), never this one. |
| `PATCH /api/projects/:id/items/:itemId` | `project:edit` + (owner **or** `project:finalize`) | Branch pre-assignment only — sets `sourcingMethod` on one item. Does **not** create the sub-document itself. `400` if the item already has one (`itemStatus !== "pending"`) — reassigning here would silently orphan a real sub-document's back-link, so the client must delete/cancel it first. |
| `POST /api/projects/:id/refresh` | `project:edit` + (owner **or** `project:finalize`) + `scopeOfWork:view` | Reconciles `items` against the Scope of Work's *current* items by id — an item whose id still exists keeps its `sourcingMethod`/`itemStatus`/sub-document links (only the descriptive snapshot refreshes); a new item starts `"unassigned"`/`"pending"`; a removed item simply stops appearing (any sub-document already created against it is left in place, orphaned but harmless — no destructive cleanup). |
| `DELETE /api/projects/:id` | `project:delete` + (owner **or** `project:finalize`) | Soft delete. No restore endpoint. |

### Material Requisition, Job Order, Purchase Request

All 3 share one route shape (`X` = `material-requisitions` / `job-orders` / `purchase-requests`):

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/X?projectId=` | `{materialRequisition,jobOrder,purchaseRequest}:view` | Lists (summary shape) non-deleted sub-documents for one Project, scoped by the matching `:viewAll` via `buildSimpleOwnershipClause()`. **Material Requisition only (Stage 4 addition)**: omitting `projectId` switches to "list every Material Requisition company-wide" — the standalone list page's own entry point, same dual-mode shape Project's own `GET` uses. Job Order/Purchase Request still require `projectId` (`400` if omitted) — no standalone list page exists for them yet (Stage 5). |
| `POST /api/X` | `{...}:create` + `project:view` | **2026-08-27**: Job Order also accepts `{ projectId, itemIds: string[] }` — one Job Order may cover several project items, each linked to it, with the ticked items copied in as lines (specs become `subDetails`). Every item is validated **before** anything is written, so a batch containing one already-claimed item is refused whole. `itemId` still works. Material Requisition/Purchase Request remain one-per-item. | Body `{ projectId, itemId }` (Material Requisition also accepts an optional `jobOrderId`, resolved/verified server-side against the same Project — see below). **CRITICAL invariant**: validates the target `ProjectItem` exists and is still `"pending"` (`loadPendingProjectItemOrThrow()`, `api/_lib/projectHandler.ts`) *before* inserting anything, then — immediately after the sub-document's own `insertOne()` succeeds — atomically sets that item's `sourcingMethod`/`itemStatus: "documentCreated"`/link field via `linkProjectItemToSubDocument()`, server-derived, never trusting any client-sent value for the link. No multi-document transaction wraps the two writes (this codebase's Mongo deployment/tests are single-node); the validate-before-insert ordering is what makes the sequence safe in practice — see `linkProjectItemToSubDocument()`'s own doc comment. Covered by `tests/api/projectAtomicity.test.ts` (creation link, rejected double-claim, delete-unlinks, finalize-fulfills, reassign-after-claimed rejected). Lines start empty (`[]`) — filled in via a subsequent `PATCH`. Returns `201`. |
| `GET /api/X/:id` | `{...}:view` | Full document. `404` if missing/soft-deleted. |
| `PATCH /api/X/:id` | `{...}:edit` + (owner **or** `:finalize`) | `400` if `status === "Final"` (Draft-only, like every other document type in this app). Material Requisition's line sanitizer *requires* a resolvable `productId` per line (rebuilds `productCode`/`productName`/`unit` server-side from the real `Product` record — never trusted from client input, same integrity rule Quotation Templates' product links established); Purchase Request's `productId` is optional (a line can be a one-off item with no catalog entry); Job Order's lines are free-typed (no catalog). Job Order's `scopeChecklist` update only recognizes group/option `key`s the server itself generated and only ever toggles `checked`/a new optional per-option `value` (added to `ChecklistOption`, `src/lib/documentRequirements.ts`) — same "toggle state, never inject structure" rule Scope of Work's `sanitizeChecklistGroups()` enforces. |
| `POST /api/material-requisitions/:id/issues` | `stock:adjust` | **Material Requisition only. 2026-09-07 — replaces `POST /:id/issue`.** `Final` documents only. Body is one issue round: `{ lines: [{ lineId, qty }], issuedDate?, issuedBy?, remark?, chargeDepartmentId?, chargeTeamId?, chargeWorkTypeCode?, chargeWorkTypeName? }`. Lines with `qty: 0` are skipped; `qty` above the line's outstanding quantity is a `400`. Appends to `issues[]`, deducts **that round's quantities only** (stock sufficiency for the whole round is checked before any movement is written), then recomputes each line's `withdrawal1Qty`/`withdrawal2Qty` from the rounds (round 1 → first column, rounds 2..N summed → second). Documents issued before this route existed are converted to synthetic rounds first, so their stored numbers survive and are not re-deducted. Returns `{ materialRequisition, stockByProduct }`. The old `POST /:id/issue` path is kept mounted and answers `400 "…กรุณารีเฟรชหน้าเว็บ…"` so a stale browser tab cannot corrupt the round list. |
| `DELETE /api/material-requisitions/:id/issues/:batchId` | `stock:adjust` | **Material Requisition only (2026-09-07).** Cancels the **latest** round only (`400` otherwise — same restriction as Receiving Report's batch reversal). The round's quantities go back to stock as `return` movements and the two withdrawal columns are recomputed. `400` when a line's `returnQty` already exceeds what the remaining rounds would leave issued. Returns `{ materialRequisition, stockByProduct }`. |
| `POST /api/material-requisitions/:id/return` | `materialRequisition:edit` + (owner **or** `:finalize`) | **Material Requisition only.** Body `{ lines: [{ id, returnQty }], returnedBy?, returnReceivedBy? }` — updates each line's `returnQty` plus the document-level returner/receiver signatures. Deliberately **not** gated by the `status === "Final"` lock the plain `PATCH` above enforces — leftover material is returned via the same original document, after issuance, same "follow-up fields survive Final" exemption Scope of Work's PO-chasing fields use (see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "PO Chasing"). |
| `POST /api/material-requisitions/:id/rewrite` | `materialRequisition:create` | Creates a `-R{n}` revision (`201`). Withdrawal/return quantities and signatories are **not** inherited. **Moves the parent `ProjectItem`’s `materialRequisitionId` onto the new revision** — without that the Project page keeps pointing at the superseded document (covered by `tests/api/projectAtomicity.test.ts`). Production-owned requisitions have no `projectId` and skip the re-link. |
| `POST /api/X/:id/finalize` | `{...}:finalize` | `400` if already `"Final"`. Direct Draft → Final (no `PendingApproval` stage, unlike Scope of Work/Delivery Order's full approval workflow — deliberately simpler for this first Stage 3 pass, matching Delivery Order's own original "deliberately simpler" precedent). Also advances the parent `ProjectItem.itemStatus` to `"fulfilled"` (best-effort — resolved via `findProjectItemIdByLink()`, never throws if the link can't be found). |
| `POST /api/X/:id/print` | `{...}:print` | Writes an audit entry (called right before `window.print()`, once a frontend exists). No required-field validation gate this pass. |
| `POST /api/X/:id/rewrite` | `{...}:create` + (owner **or** `:finalize`) | **2026-08-27**: Job Order and Purchase Request gained Rewrite, completing the set (Material Requisition got it earlier the same day). Creates a `-R{n}` revision (`201`); signatories and status cleared, `revisionNote` **not** inherited, and the parent `ProjectItem` link moves onto the revision. **Job Order moves every linked item**, not just the first — it can cover several. Job Order attachments are **not** inherited (a copy would share the same blobs, so deleting from one would break the other); its checklist and lines are, with fresh line ids. Purchase Request **does** inherit lines and estimated costs, since a PR revision is usually a change of vendor/terms rather than a fresh request. |
| `POST /api/job-orders/:id/attachments` | `jobOrder:edit` (owner/approver rules as for `PATCH`) | Body `{ fileName, contentType, dataBase64 }`. **No status lock** — attachments are follow-up data. Caps: 2 MB/file, 5 files/document; rejects a base64 payload with invalid characters rather than storing it truncated. Returns the updated Job Order. |
| `DELETE /api/job-orders/:id/attachments/:attachmentId` | `jobOrder:edit` | Removes the metadata and the stored bytes. |
| `GET /api/job-orders/:id/attachments/:attachmentId/download?key=` | **none — capability URL** | Deliberately unauthenticated: access is gated by the random 24-byte `key` in the URL, so a shared link opens without a session. A wrong/missing key is an opaque `404`. Script-capable types (HTML/SVG) are forced to `application/octet-stream` + `attachment` disposition with `nosniff`, because this route lives on the app’s own origin. |
| `DELETE /api/X/:id` | `{...}:delete` + (owner **or** `:finalize`) | Soft delete. Also resets the parent `ProjectItem` back to `"unassigned"`/`"pending"` and clears the link (best-effort, via `unlinkProjectItem()`) — closes the loop `PATCH /api/projects/:id/items/:itemId`'s own error message points users toward. |

### Material Requisition Templates (`api/_lib/materialRequisitionTemplateHandler.ts`, mounted at `/api/material-requisition-templates` via `api/handlers/quotes.ts` — added 2026-09-02, documented 2026-09-08)

Named sets of material lines that drop into a Material Requisition in one click. **No permissions of
its own** — a deliberate choice recorded in the handler's own doc comment: a new permission needs an
RBAC migration to reach real roles, and this codebase has twice shipped a menu nobody could see by
forgetting one.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/material-requisition-templates` | `materialRequisition:create` **or** `materialRequisition:view` | All non-deleted templates, sorted by name. Read is the looser of the two checks on purpose: whoever can raise a requisition must be able to see the templates, or the "use template" picker is empty for exactly the people who need it. |
| `POST /api/material-requisition-templates` | `materialRequisition:edit` | Body `{ name, description?, lines[] }`. Line `id`s are always regenerated server-side, `category` falls back to `"other"` instead of failing the whole save (it only affects on-screen grouping), and the line count is capped at `MAX_TEMPLATE_LINES`. Returns `201`. |
| `PATCH /api/material-requisition-templates/:id` | `materialRequisition:edit` | Partial update of `name`/`description`/`lines`. A no-op body writes no audit entry. |
| `DELETE /api/material-requisition-templates/:id` | `materialRequisition:edit` | **Soft delete only** (`isDeleted: true`) so past audit entries can still resolve the template's name. |

> **Adding a resource takes two files.** `server/app.ts` picks the handler from the *first* path
> segment only, so a resource missing from its `API_ROUTES` table 404s before its handler runs — no
> matter how complete the handler is. This module shipped that way on 2026-09-02 and every request
> to it returned `{"error":"Not found"}` until 2026-09-08. `tests/serverRouteTable.test.ts` now
> fails the build when the two sides drift apart.


**Numbering**: `MR-{buddhistYear}-{seq}` / `JO-{buddhistYear}-{seq}` / `PR-{buddhistYear}-{seq}`, an
atomic per-Buddhist-year counter in the shared `counters` collection — same shape as
`service_reports`' `SR-{year}-{seq}` (`nextServiceReportId()`), deliberately not the real Purchase
Request reference example's legacy `"ED"` scheme.

**Material catalog seeding**: `ensureMaterialCatalogSeeded()` (`api/_lib/materialCatalogSeedData.ts`)
is called defensively from `handleMaterialRequisition()`'s entry point — same "seed on first request
to this resource" pattern `seedJobTypesIfEmpty()`/`seedQuotationTemplatesIfEmpty()` already
established, guarded by an in-memory one-per-process flag (same convention as `bootstrapRbac()` in
`rbacSeed.ts`). Inserts the 4 category rows + 82 real catalog items transcribed from
`public/reference/FM-ST-04_-_Rev.02_1.pdf` through `_4.pdf` into the existing `products`/`categories`
collections, idempotently.

**RBAC**: 28 permissions (`project`/`materialRequisition`/`jobOrder`/`purchaseRequest`, each
`:view`/`:viewAll`/`:create`/`:edit`/`:finalize`/`:print`/`:delete`), granted to Administrator/Super
Admin only by default. See [RBAC.md](./RBAC.md) "Project module".

## Service Templates + Service Reports (`api/_lib/serviceTemplateHandler.ts` + `api/_lib/serviceReportHandler.ts`, mounted at `/api/service-templates` and `/api/service-reports` via `api/handlers/customers.ts` — added 2026-08-06, Phase 1)

Shares `api/handlers/customers.ts`'s function file (checked on the raw pathname, after `/api/search`
and before falling through to the plain customers dispatch) — same sharing
convention as the other multi-resource handlers. Mounted on `customers.ts` rather than
`quotes.ts` because a Service Report is created directly against a Customer, not derived from a
quotation — see [MODULES/Service.md](./MODULES/Service.md) for the full feature writeup and the
routing decision's reasoning. `API_ROUTES` entries: `"service-templates"` and
`"service-reports"` → the customers handler.

**Service Templates** (master checklist data, `service_templates` collection):

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/service-templates` | `serviceTemplates:view` | Summary list (`id`/`templateCode`/`templateName`/`version`/`sectionCount`/`itemCount`/`isActive`/`isDeleted`), sorted by `templateCode`. Lazily seeds the two real checklist templates (`upsertServiceTemplates()`) the first time the collection is empty — same "seed on first real request" idiom as `seedJobTypesIfEmpty()`/`seedQuotationTemplatesIfEmpty()`, needed because `ensureIndexes()` only ever runs from the one-time Setup Wizard. |
| `GET /api/service-templates/:id` | `serviceTemplates:view` | Full document incl. `sections`. |
| `POST /api/service-templates` | `serviceTemplates:create` | Body `{ templateName, description, sections }`. `templateCode` is server-generated (`SVC-CUSTOM-{random}`), never client-supplied. |
| `PATCH /api/service-templates/:id` | `serviceTemplates:edit` | Partial `{ templateName?, description?, sections?, isActive? }`. `sourceHash`/`sourceType: "manual"` are recomputed automatically when content changes — never touches an already-created Service Report's frozen `templateSnapshot`. |
| `POST /api/service-templates/:id/duplicate` | `serviceTemplates:create` | Body `{ templateName? }` (defaults to `"{source} (สำเนา)"`) — fresh `templateCode`, `sourceType: "manual"`. |
| `POST /api/service-templates/:id/archive` | `serviceTemplates:archive` | Body `{ isDeleted }`. |

**Service Reports** (`service_reports` collection, `id` = human doc number `SR-{buddhistYear}-{seq}`, stored directly as `_id` — same convention as `Quote`):

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/service-reports` | `service:view` | Own-records-only (`{$or:[{createdBy: caller},{createdBy:""}]}`) unless the caller also holds `service:viewAll` — same idiom as Quotation/Scope of Work. Row shape resolves `assignedServiceEngineerName` from `assignedServiceEngineerId` via one batched `users` lookup (not persisted). |
| `GET /api/service-reports/:id` | `service:view` | Full document. Not scoped by `service:viewAll`, same reasoning as Scope of Work/Delivery Order's identical single-record `GET`. |
| `POST /api/service-reports` | `service:create` | Body: `customerId` (or a manually-typed `customerSnapshot`), `templateId` (**optional as of 2026-08-14** — an active, non-deleted template if supplied; blank starts the report from a single fixed empty "general" section instead, built up per-report via the structure-editing controls), plus report-info fields. Resolves the customer link the same way `api/handlers/quotes.ts` does (`resolveCustomerIdAndSnapshot()` — a linked customer's snapshot is always server-derived, never trusted from the client), freezes the chosen template's `sections` onto `templateSnapshot` (edits to the master template afterward never retroactively change this report), reserves the next atomic `SR-{year}-{seq}` id, and builds a blank default `checklist` from the frozen structure (any `checklist` sent in the POST body is ignored). `assignedServiceEngineerId` defaults to the creating user if omitted. Notifies every active `service:viewAll` holder except the creator (`service_report_created`). |
| `PATCH /api/service-reports/:id` | `service:edit` + (owner **or** `service:complete`) | **Draft-only** — `400` otherwise ("กรุณาเปิดใหม่ (Reopen) ก่อน"). Accepts partial report-info fields plus `checklist` — `checklist` is rebuilt server-side by walking the record's own `templateSnapshot` (`mergeChecklist()`), so a client can only ever toggle `status`/`abnormalDetail`/`measurementValue`/a section's `included` flag on an item/section the server itself generated. **`templateSections` (added 2026-08-06)**: per-report checklist customization — replaces the report's own `templateSnapshot.sections` after `sanitizeServiceTemplateSections()` (shared `src/lib/validation/serviceReportValidation.ts`; `400` on malformed input). Sections stay fixed (identity always taken from the existing snapshot); groups/items inside them may be added/removed per report. A structure change also re-merges `checklist` against the new sections (pruning removed items' values, defaulting new ones) and hard-deletes any now-orphaned photo Binary docs from `service_checklist_photo_files`. The master template is never touched. |
| `POST /api/service-reports/:id/status` | varies by action | Body `{ action: "complete" \| "reopen" \| "cancel" }`. **`complete`** needs `service:complete` + `status === "Draft"` + passes `validateServiceReportForCompletion()` (`422 DOCUMENT_INCOMPLETE` with `fieldErrors`/`groupErrors.checklist` otherwise) → `Completed`, notifies every active `service:viewAll` holder except the actor (`service_report_completed`). **`reopen`** needs the same owner-or-`service:complete` rule as `PATCH` + `status === "Completed"` → back to `Draft`. **`cancel`** needs `service:complete` + not already `Cancelled` → `Cancelled`. |
| `DELETE /api/service-reports/:id` | `service:delete` + (owner **or** `service:complete`) | Soft delete (`isDeleted: true`). No restore endpoint yet, same as every other document type in this app. |
| `POST /api/service-reports/:id/photos` | `service:edit` + owner-or-`:complete`, Draft-only | **Added same day, pulled forward from Phase 2** — body `{sectionKey, groupKey, itemKey, fileName, contentType, dataBase64}`. Attaches a photo to a checklist item — this route was never itself status-restricted server-side (only the UI used to only show the upload control on `abnormal` items; **as of 2026-08-14 the UI offers it for Normal items too**, still optional there, only Abnormal enforces a ≥1-photo requirement at completion time); stores bytes in `service_checklist_photo_files` (Binary), pushes `ServiceChecklistItemPhoto` metadata onto that item. 4 MB/photo, 6 photos/item. |
| `DELETE /api/service-reports/:id/photos/:photoId` | `service:edit` + owner-or-`:complete`, Draft-only | Removes one photo's metadata + deletes its Binary doc. |
| `GET /api/service-reports/:id/photos/:photoId/download?key=` | **unauthenticated capability-URL** | Same random-`downloadKey` model as Scope of Work's attachment download; a wrong/missing key is an opaque 404. Only `image/png\|jpeg\|gif\|webp` serve inline; anything else forces `attachment` + `nosniff`. |
| `POST /api/service-reports/:id/print` | `service:print` | **Added same day, pulled forward from Phase 3** — writes a `"Service Report Printed"` audit entry, no completeness gate (a Draft can be printed for review — matches Delivery Order's simpler no-gate print precedent, not Scope of Work's stricter one). Called by the client immediately before `window.print()`; printing still proceeds even if this call fails. |
| `POST /api/service-reports/:id/send-approval` | `service:edit` (no ownership check — distribution, like Scope of Work's send; `400` on Cancelled or already-approved) | **Added 2026-08-10** — mints the 7-day customer-approval link (stores only the token's SHA-256 as `customerApproval.tokenHash`, stripped from every authenticated response) and best-effort LINE-pushes a Flex bubble when the customer has a linked `lineUserId` and `LINE_CHANNEL_ACCESS_TOKEN` is set. Returns `{ serviceReport, approvalUrl, sentViaLine, lineError? }`. Re-sending replaces the outstanding link. See [MODULES/Service.md](./MODULES/Service.md) "Customer Approval". |
| `GET /api/service-reports/:id/approval?key=` | **none (capability key)** | **Added 2026-08-10** — the public approval page's data: customer-safe report view (engineer pre-resolved to a name, no internal ids), company name/logo, and approval state (incl. `expired`). Wrong/missing key → opaque 404. |
| `POST /api/service-reports/:id/approval/respond` | **none (capability key in body)** | **Added 2026-08-10** — one response per link. `{decision:"approved"}` requires a signature data URL (written into the same on-site `customerSignatureDataUrl`/`SignedName`/`SignedAt` fields); `{decision:"rejected"}` requires `rejectReason`. Expired → `410`; already answered → `400`. Writes a customer-actor audit entry + `service_report_customer_approved`/`_rejected` bell notifications to sender/creator/engineer. |
| `GET /api/service-reports/:id/approval/photos/:photoId?key=` | **none (capability key)** | **Added 2026-09-22** — checklist photos for the public approval page. The approval GET rewrites every photo `url` to this route (and drops `fileId`/`thumbnailUrl`), because `/api/files/:id` requires a session and the customer has none. Serves only photos that are in this report's checklist, from the central `files` table or the legacy photo collection. Wrong key / photo not in this report → opaque 404. |
| `POST /api/customers/:id/line-pairing` | `customers:edit` **or** `service:edit` | **Added 2026-08-10** — issues the 24-hour `TCS-XXXXX` LINE pairing code (replaces any outstanding one; audit-logged). The code is server-only (`toPublicCustomer()` strips `linePairing`); customer responses expose `lineUserId` so the UI knows who's linked. |
| `POST /api/line/webhook` | **none (LINE HMAC signature)** | **Added 2026-08-10** — LINE platform events; verifies `x-line-signature` (HMAC-SHA256 over the RAW body, captured by `server/app.ts`). Matches typed pairing codes → sets `customers.lineUserId`, replies confirmation; unconfigured (`LINE_CHANNEL_SECRET` unset) it 200-acks quietly. |

**Not built yet** (see [MODULES/Service.md](./MODULES/Service.md) roadmap): mobile/iPad-specific
UX, on-site acceptance flows beyond the SignaturePad, LINE OA rich-menu/status queries.

Client wrapper functions: `src/lib/serviceTemplates.ts`'s `fetchServiceTemplates()`/
`fetchServiceTemplate(id)`/`createServiceTemplate(draft)`/`updateServiceTemplate(id, fields)`/
`duplicateServiceTemplate(id, name)`/`setServiceTemplateArchived(id, isDeleted)`; `src/lib/serviceReports.ts`'s
`fetchAllServiceReports()`/`fetchServiceReport(id)`/`createServiceReport(draft)`/
`updateServiceReport(id, fields)`/`changeServiceReportStatus(id, action)`/`deleteServiceReport(id)`/
`uploadServiceReportPhoto(reportId, path, file)`/`deleteServiceReportPhoto(reportId, photoId)`/
`printServiceReport(reportId)`.

## Company Profiles — REMOVED 2026-07-14

Every route that used to live here (`GET/POST /api/company-profiles`, `GET/PATCH /api/company-profiles/:id`,
`POST /api/company-profiles/:id/archive`, `POST /api/company-profiles/:id/set-default`) is gone.
`API_ROUTES` has no `company-profiles` entry, and `api/handlers/company-profiles.ts`
was deleted — the path now returns the server's JSON 404. This ERP only
ever needs one issuer company; a module for managing several was unused scope. See
[MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) for the full removal writeup — the
`company_profiles` MongoDB collection and any documents already in it were left untouched.

## Customers (`api/handlers/customers.ts`, mounted at `/api/customers` — added 2026-07-14)

Its own dedicated function file as of 2026-07-14 — it briefly shared `company-profiles.ts`'s
function slot (under the since-retired Vercel Hobby 12-function cap) between 2026-07-14's Customer
Management pass and the same day's later Company Profiles removal, which freed that slot back up.
The actual list/create/get/patch/archive logic lives in `api/_lib/customersHandler.ts`; the handler
file itself is a thin wrapper. The function cap behind that shuffle no longer exists — see
"Routing mechanics" above and [ARCHITECTURE.md](./ARCHITECTURE.md).

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/customers` | `customers:view` **or** `quotations:create` | A "manage vs. pick-for-a-quotation" carve-out (same pattern the now-removed Company Profiles module used): `customers:view` holders get every customer including archived/inactive (sorted by `companyName`); a `quotations:create`-only caller (e.g. Sales User) gets a server-filtered active-and-not-deleted-only list — this is what feeds the Quotation form's Customer selector (`src/pages/quotation/CustomerSelector.tsx`). |
| `POST /api/customers` | `customers:create` | Body validated by `api/_lib/customerValidation.ts` — only `companyName` is required. Writes a server-side `"Customer Created"` audit entry. |
| `GET /api/customers/:id` | `customers:view` **or** `quotations:create` | `404` if not found. |
| `PATCH /api/customers/:id` | `customers:edit` | Partial field edit, including toggling `isActive`. Writes a `"Customer Updated"` audit entry (only when at least one field actually changed). |
| `POST /api/customers/:id/archive` | `customers:archive` | Body `{ isDeleted: boolean }` — this module's only "delete," always reversible, same convention as Company Profiles/Categories/Job Types. Writes a `"Customer Archived"`/`"Customer Restored"` audit entry. |

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
| `POST /api/audit-log` | Any authenticated user | `userId`/`userName`/`roleName` are **always** derived from the authenticated session server-side, never taken from the request body — a client can describe what happened (`module`/`action`/`details`) but can never claim to be a different user. This is why the route itself has no permission gate beyond "must be signed in": every signed-in user is allowed to log their own actions (login, profile edit, etc.), and the server, not the client, controls who gets credited. Rejects the `"ใบเสนอราคา"` module outright (2026-07-10, fifth pass) — those entries, including their `relatedQuoteId`/`relatedCustomerName` fields (2026-07-13, seventh pass), can only be written by `writeQuoteAuditEntry()` inside `api/handlers/quotes.ts` itself. **Also rejects the `"โปรไฟล์บริษัท"` module outright** (added 2026-07-13 for the then-live Company Profiles module's own server-authoritative audit writer; that module was removed 2026-07-14, but the lockout is kept — nothing legitimate writes this module anymore, so the rejection now simply prevents a client from forging new entries for a module that no longer exists, without disturbing the historical entries already in `audit_log`). |

`AuditLogPage.tsx` self-fetches via `useEffect` on mount (not part of the universal boot-time `Promise.all` fetch in `App.tsx`), since this route is permission-gated and shouldn't be called for every signed-in user regardless of whether they can see the page.

## Dashboard (`api/dashboard/index.ts`, mounted at `/api/dashboard` — added 2026-07-09, majorly expanded 2026-07-10, completed against the full business spec later the same day)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/dashboard/departments?dept=&from=&to=` | `dashboard:view` | **Added 2026-09-14** — numbers for the Dashboard's department tabs. `dept` = `overview` (default) · `service` · `purchasing` · `inventory` · `operations` (production + project + bd blocks for the combined tab — the old `production`/`project`/`bd` values were removed 2026-09-14 and now return 400); anything else → 400; `from`/`to` must be `YYYY-MM-DD`. Returns `{ view, filters, today, blocks, pendingApprovals, activityTimeline, attention, failed }`. Fields named `...ByMonth` are the trailing 12 months ending this Bangkok month and ignore `from`/`to`; `attention` (overview only) is up to 8 cross-department items (PO past needed-by date, production/job orders due within 7 days or past due, service reports awaiting customer approval), oldest first, each gated by its document's view permission. `blocks[dept]` is `{ scope: "all"\|"own", summary, detail }` — `detail` is `null` on the overview; a block is `null` when the tab's view permission (`src/lib/dashboardTabs.ts`) is missing or its computation failed (listed in `failed`); a single number is `null` when that document type's own view permission is missing. Counts follow each module's list-route visibility. `pendingApprovals` (overview only) = `countPendingApprovals()`, same filters/gates as `GET /api/pending-approvals` but uncapped; `activityTimeline` (overview only) needs `auditLog:view`. BD returns counts only, never money. Handled by `api/_lib/departmentDashboard.ts`, dispatched from `api/dashboard/index.ts` before the sales code. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Department Tabs". |
| `GET /api/dashboard?from=&to=&salesperson=&department=&vat=&include=` | `dashboard:view` | All query params optional. **2026-09-07**: the response always carries `statusBySalesperson` (salesperson × status matrix) and `closingProbability` (stage win probabilities from the trailing-12-month closed set, `null` under 5 samples, plus the weighted open pipeline); `include=quotations` adds `quotations: DashboardQuoteRow[]` (one row per deduped, visibility-scoped quotation in the filter — used by the Excel export only). See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Excel / CSV export — detailed workbook". Returns `{ kpis, interestBreakdown, revenueByMonth, revenueTrend, categoryBreakdown, monthlyClosingRate, pipeline, salesActivity, salesPerformance, customerAnalytics, jobTypeAnalytics, forecast, followUps, activityTimeline, approvalDashboard, scopeOfWork, deliveryOrder, serviceSummary, notificationSummary, availableSalespeople, availableDepartments, filters }` — real MongoDB counts/aggregations, no client-side computation, no hardcoded/template values. **2026-08-14**: `vat=pre|post` (default `pre`) picks which of `computeQuoteAmountBeforeVat()`/`computeQuoteAmountWithVat()` (`api/_lib/quoteAmounts.ts`) computes every monetary field in the response — the resolved mode is echoed back as the new `filters.vatMode: "pre" | "post"` field, so the frontend labels/exports what the server actually computed rather than trusting its own pre-fetch UI state. `VAT_RATE` itself is unchanged, still a single hardcoded 7% constant. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "VAT Toggle". **2026-08-14**: `serviceSummary: { total, draft, completed, cancelled, thisMonth } | null` added — same shape/gating/unfiltered-by-design pattern as `scopeOfWork`/`deliveryOrder` below, gated by `service:view`, own-records-only without `service:viewAll` (mirroring `handleList()`'s ownership predicate in `api/_lib/serviceReportHandler.ts`), rendered by the new `ServiceSummary.tsx`. **2026-07-24 (second pass)**: own-data-only scoping — a caller without `quotations:viewAll` gets every quote-based figure from only their own quotes, the SOW/DO cards scoped by those modules' `viewAll`, Sales Activity restricted to their own events, and `ownDataOnly: true` in the response (UI shows a notice + hides the salesperson/department filters); see [RBAC.md](./RBAC.md) "Quotation Own-Quotes-Only Viewing" for the deliberate exceptions. **2026-08-14**: `ownDataOnly` is joined by a new `visibilityScope: "own" | "team" | "department" | "all"` field — the binary check is now the same 4-tier `buildOwnershipClause()` cascade the list routes use; the salesperson/department filter picker is hidden only at the `"own"` tier now (a team/department-tier viewer has more than one visible salesperson, so the picker stays useful), and the notice text is tier-specific. See [RBAC.md](./RBAC.md) "Departments + Teams + Tiered Visibility". **2026-07-24**: `deliveryOrder: { total, draft, final } | null` added — identical shape/gating/unfiltered rules to `scopeOfWork` (below), gated by `deliveryOrder:view`, counted from `delivery_orders`, rendered by the new `DeliveryOrderSummary.tsx` beside the Scope of Work card. **2026-07-23**: `scopeOfWork: { total, draft, final } | null` added, per a user request to show the Scope of Work document count on the Dashboard — `scope_of_works` counted via `countDocuments({ isDeleted: false }[, { status: "Draft" | "Final" }])`, `null` unless the caller has `scopeOfWork:view` (same `roleHasPermission()` gate pattern as `approvalDashboard`). Deliberately company-wide/all-time, not scoped by the date-range/salesperson/department filter — a Scope of Work document has no `issueDate`/`salesperson` of its own to filter by (same reasoning as Total Customers/Products, see [MODULES/Dashboard.md](./MODULES/Dashboard.md)). Rendered by the new `ScopeOfWorkSummary.tsx` in the Dashboard's supporting-detail section (not one of the 4 required `ExecutiveSummaryCards` tiles). `interestBreakdown` (added 2026-07-10, Codex review Critical fix) is computed from the same filtered quote set as every other widget — the Dashboard's Customer Interest panel previously computed this client-side from the app-wide, entirely unfiltered quote list. `kpis` also carries `lostValue`/`activeQuotationsValue`/`nonActiveQuotationsValue` (added 2026-07-13, sixth same-day pass) computed with the exact same predicates as their matching counts. `salesActivity` (added 2026-07-13, sixth pass; extended 2026-07-13 seventh pass with `bySalesperson`) tracks 5 event categories per period plus a `(period, salesperson)` breakdown for Created/Edited — see [DATABASE.md](./DATABASE.md). `activityTimeline` entries now optionally carry `relatedQuoteId`/`relatedCustomerName` (added 2026-07-13, seventh pass) for quote-workflow events. `activityTimeline` is `null` unless the caller has `auditLog:view`, and (added 2026-07-10) now respects the date-range/salesperson/department filter (previously ignored them entirely) via a Bangkok-day-boundary-aware `createdAt` range plus a `userName` match against the same free-text salesperson/department join used elsewhere. `approvalDashboard` (stat tiles + the actionable `pendingList`, and `canReject`) is `null` unless the caller has `quotations:approve` (both checked via `roleHasPermission()`, not a second `requirePermission()` call — the rest of the dashboard is still returned either way). Total Customers/Products/`categoryBreakdown`, and `notificationSummary`, are deliberately **not** filtered — catalog and personal-operational metrics respectively, documented as such (see [MODULES/Dashboard.md](./MODULES/Dashboard.md)) rather than silently inconsistent. **2026-07-14, Pre-Tax Amount pass**: every monetary field in the response (`kpis.totalQuotationValue`/`closedSales`/`expectedSales`/`lostValue`/`activeQuotationsValue`/`nonActiveQuotationsValue`, `pipeline[].totalValue`, `salesPerformance`, `customerAnalytics`, `jobTypeAnalytics`, `forecast`, `revenueTrend`/`revenueByMonth`, `followUps[].amount`, `approvalDashboard.pendingList[].amount`) is now the pre-tax (before-VAT) amount — not the VAT-included grand total these fields returned before. No field was renamed. **2026-07-14, second same-day pass (Codex-review fix)**: `salesActivity` is no longer gated by `auditLog:view` — an independent review found this Critical, since it silently hid the required Sales Activity Analytics section from the default Sales User/Approver 1/Approver 2/Viewer roles (all `dashboard:view`, none `auditLog:view`). It's now computed for any `dashboard:view` caller and effectively never `null` in practice; `activityTimeline` (the raw audit-log feed) correctly keeps its `auditLog:view` gate — a different, more sensitive feature. `salesActivity`'s query is also now bounded by the `from`/`to` date filter (`bangkokDayBoundsUtc`) when set, previously an unconditional full-history scan regardless of the selected range (Codex High Priority finding). **2026-07-14, Codex review fix pass (High Priority)**: `activityTimeline`, `salesActivity`, `approvalDashboard`, and `notificationSummary`/`availableSalespeople` are each computed inside their own `try/catch` now — a failure in any one of them (e.g. a transient auditLog query issue) degrades that field to `null`/a safe zero default instead of failing the entire request with a `500`. `kpis`/`pipeline`/`salesPerformance`/`customerAnalytics`/`jobTypeAnalytics`/`forecast`/`revenueTrend`/`revenueByMonth`/`followUps` don't depend on any of those four sections and are unaffected either way. No response shape changed — every field already tolerated `null` on the frontend (permission-gated fields already could be `null`); this only changes *why* a field might be `null` (a caught failure, in addition to a permission gate) and, critically, stops that failure from taking the rest of the response down with it. **2026-07-22, Rewrite double-counting fix**: every quote-count/-value field in the response now collapses a rewritten quotation's revision chain (root + every `-R{n}`) to one entry — its latest revision — before counting/summing, via the shared `dedupeQuotesByRevisionChain()` (`api/_lib/quoteRevisions.ts`). Fixes `kpis.totalQuotations`/`totalQuotationValue`/every other KPI, `pipeline`, `salesPerformance`, `customerAnalytics`, `jobTypeAnalytics`, `forecast`, `revenueTrend`/`revenueByMonth`, `monthlyClosingRate`, `followUps`, and `approvalDashboard.pendingList` — a rewrite previously counted as an independent additional quotation instead of the same one, superseded. No response shape changed. See [DATABASE.md](./DATABASE.md) "Dashboard KPI/chart aggregation" and [MODULES/Dashboard.md](./MODULES/Dashboard.md) for exactly what each field means and how it's computed. |

`DashboardPage.tsx` self-fetches via `src/lib/dashboard.ts`'s `fetchDashboardStats(filters)`, re-fetching whenever the on-screen date-range/department/salesperson filter changes (or after an Approve/Reject action from the Pending Approvals list) — not part of the universal boot-time fetch, since it's the only page that needs this particular aggregate. Approve/Reject actions themselves reuse the existing `POST /api/quotes/:id/workflow` route below — no new mutating route was added for the Dashboard.

## Global Search (`api/_lib/searchHandler.ts`, mounted at `/api/search` — added 2026-07-14)

Shares `api/handlers/customers.ts`'s function file (checked first on the raw pathname, before
falling through to the customers-only logic) — the same established sharing pattern this file itself once
used with the now-removed `company-profiles.ts`. Replaces the topbar search box, which had never
actually worked before this pass (a dead `<input>` with no `value`/`onChange` at all).

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/search?q=` | Any authenticated user | `q` required, trimmed, 2–100 characters (`400` outside that range — the frontend already gates on both ends via the input's own `minLength`/native `maxLength`, so a caller normally never hits the 400 path). The 100-character maximum was added 2026-07-14 in a same-day Codex review fix pass — previously unbounded, letting an oversized term force an expensive unanchored `$regex` `$or` scan across several collections in one request (a performance/availability concern, not a regex-injection one — `escapeRegExp()` already prevented that). Returns 16 result arrays plus `exact` (see the 2026-08-28 note below, which supersedes the original 7-category/5-result shape described here). **2026-08-28**: also accepts `?types=a,b,c` to narrow to specific categories. **Every category is independently RBAC-filtered** via `roleHasPermission()` before its query even runs: `quotations` needs `quotations:view`, `customers` needs `customers:view`, `products` needs `products:view`, `templates` needs `quotations:create` **or** `quotationTemplates:manage` (added 2026-07-14, see [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md)), `scopeOfWorks` needs `scopeOfWork:view` (added 2026-07-15, Codex review High Priority fix — see [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md)), `users` needs `users:manage`, `pages` are filtered per-entry against the same permission each page's sidebar item already requires (`null` permission = always included, e.g. Settings/Profile). A category the caller lacks permission for comes back as an empty array — identical in shape to a genuine zero-result search, so the response itself never signals "you're not allowed to see this" vs. "there's nothing here." `quotations[].amount` is the before-VAT figure via the same shared `computeQuoteAmountBeforeVat()` the Dashboard uses. **2026-07-22**: `quotations` is now further scoped by the same own-quotes-only rule as `GET /api/quotes` — a caller without `quotations:viewAll` only gets their own (plus ownerless legacy) quotations back here too, closing what would otherwise be a way to discover another user's quotation through search that the list page itself hides — see [RBAC.md](./RBAC.md) "Quotation Own-Quotes-Only Viewing". `templates[]` only ever projects `templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/`description` — `sections`/`internalNotes` never leave the server via this endpoint. `scopeOfWorks[]` matches scope number/quotation number/customer name/Job Type/PO/status and is sourced from non-deleted `scope_of_works` documents only. **2026-07-23**: `scopeOfWorks` is now further scoped by the same own-records-only rule as `GET /api/scope-of-works`'s list-everything mode — a caller without `scopeOfWork:viewAll` only gets their own (plus ownerless legacy) Scope of Work records back here too — see [RBAC.md](./RBAC.md) "Scope of Work Own-Records-Only Viewing". See [DATABASE.md](./DATABASE.md) "Global Search" for the exact fields matched per category and the index/scaling notes. |

`GlobalSearch.tsx` self-fetches via `src/lib/search.ts`'s `fetchGlobalSearch(query, signal, types?)`,
debounced 300ms client-side and cancelled via `AbortSignal` when a newer query supersedes an
in-flight one — not part of the universal boot-time fetch, since it only runs while the search box
is actively in use. `signal` support means a rapidly-typing user never races an older response
against a newer one; the aborted request's `.catch()` recognizes `signal.aborted` and treats it as
"superseded," not a real error.

### 2026-08-28 — "ค้นหาได้ทุกเอกสาร": 7 categories → 16, plus a document-number fast path

Per a direct owner request ("ให้มันสามารถค้นหาได้ทุกเอกสาร กดไปละไปดูในเอกสารได้เลย"), search now
covers every business document in the system, not just the 7 categories it had carried since
2026-07-14. The handler was split: `api/_lib/searchHandler.ts` keeps master data, the static menu
catalog, and orchestration; the 9 new document categories live in **`api/_lib/searchDocuments.ts`**,
with the shared regex helpers/limits in **`api/_lib/searchShared.ts`** (a third file only because the
other two both need them and neither can import the other without a cycle).

**Response shape** is now `{ quotations, scopeOfWorks, deliveryOrders, serviceReports, projects,
materialRequisitions, jobOrders, purchaseRequests, productionOrders, arDocuments, productRequests,
customers, products, templates, users, pages, exact }`. No existing key changed meaning; 9 array keys
and `exact` were added. Categories are ordered as the UI renders them — documents first, roughly
following how work moves through the company, then master data, then menu shortcuts.

**All 9 document categories share one result shape**, `SearchDocumentResult`
(`{ id, docNumber, party, lineage, status, date, ownerDepartment?, docType? }`), rather than nine
bespoke interfaces — every document answers the same four questions, which is what lets the client
render one row component for all of them. `lineage` is the Scope of Work / job code / quotation the
document descends from; surfacing it is why a search result is identifiable without opening it.

**Per-category permission gates** (same "no permission ⇒ empty array, indistinguishable from no
results" rule as before): `deliveryOrder:view`, `service:view`, `project:view`,
`materialRequisition:view`, `jobOrder:view`, `purchaseRequest:view`, `productionOrder:view`,
`ar:view`, `productRequest:view`. Ownership scoping in each searcher mirrors that module's own list
route exactly — `buildOwnershipClause()` for Delivery Order (including the `sentToDepartmentIds`
recipient merge and `departmentIdForUser()`, now exported from `deliveryOrderHandler.ts`),
`buildSimpleOwnershipClause()` for the rest, `viewAll || review` for Product Requests, and **no**
ownership filter for `ar_documents` (matching `handleDocumentsList()`).

**Two deliberate departures from the list routes**, both documented in code:
- **ใบเบิกของ/ใบขอซื้อ return both departments' documents, tagged with `ownerDepartment`.** The list
  pages split project vs production, but that split is navigational, not a permission boundary —
  both sidebar entries are gated by the same permission and `ROLE_HIDDEN_NAV_KEYS` hides neither, so
  anyone who can search them can already open both pages. The tag tells the client which of the two
  pages to open.
- **`ar_documents` has no `isDeleted` filter**, because an issued accounting document is never
  soft-deleted — cancellation is `status: "cancelled"`. Cancelled documents stay findable, which is
  what an accountant chasing a number needs.

**`?types=a,b,c`** narrows to specific categories. Unrecognised or absent ⇒ every category. The
per-category cap is `LIMIT_ALL` (3) when unfiltered and `LIMIT_FILTERED` (20) when narrowed — the old
flat 5 became unreadable at 16 categories (~80 rows), so the unfiltered response is a teaser and the
UI's filter chips are the explicit way to ask for a browsable page of one kind.

**`exact: ExactMatch | null`** is the document-number fast path. `detectDocNumberFamily()`
(`searchShared.ts`) recognises `Q#` / `SR-` / `MR-` / `JO-` / `PR-` / `SC-` / `AR|BI|RE|IV`; a match
runs one **anchored** `^` prefix query against just that family's collection — the only index-usable
query shape this system has, since there is no text index anywhere (see DATABASE.md). Every branch
re-applies its own module's ownership scoping, so a caller who may not see the document gets `null`,
indistinguishable from a number that does not exist. Scope of Work is deliberately absent: its
`scopeNumber` is free-text with no enforced format, so there is no prefix to recognise. The
letters-only AR/BI/RE/IV prefixes additionally require a digit immediately after, so "REV" stays a
word and only "RE6908…" is a receipt.

**Resilience**: every category now runs inside `runCategory()`, which catches and degrades that one
group to `[]` rather than failing the whole request — the same per-section pattern
`api/dashboard/index.ts` adopted 2026-07-14, and more load-bearing now that one request touches 16
collections. The fast path is wrapped the same way.

**Also fixed the same day — search's visibility now matches the list pages.** `searchQuotations()`
and the Scope of Work clause had hand-rolled a binary own-vs-`viewAll` filter since 2026-07-22/07-23,
while both list routes moved to the 4-tier `buildOwnershipClause()` cascade on 2026-08-14. The gap
was one-directional and user-visible: a Sales team lead holding `quotations:viewTeam` saw a
teammate's quotation on the list page but got nothing for it in search. Both now call the shared
helper. **This grants no access the list routes did not already grant** — it stops search from hiding
records they already show.

`SEARCHABLE_PAGES` also grew from 11 entries to 33, covering every `NavKey` in `App.tsx`; every
module built after 2026-07-14 had been unreachable by name.

Tests: `tests/api/search.test.ts` (added 2026-08-28 — search had none), covering prefix detection and
its false-positive guards, per-module ownership scoping, the `isDeleted` rule, `ownerDepartment`
tagging, cancelled-AR visibility, and that the fast path re-checks permissions and stays anchored.

## Quotations (`api/handlers/quotes.ts`, mounted at `/api/quotes`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/quotes` | `quotations:view` | **2026-07-22, changed**: returns every quote only if the caller also holds the new `quotations:viewAll`; otherwise scoped to `{ createdByUserId: ctx.user.id }` plus ownerless legacy/seed quotes (`createdByUserId: ""`). Previously returned every quote unconditionally (no server-side ownership filtering at all) — see [RBAC.md](./RBAC.md) "Quotation Own-Quotes-Only Viewing" for the full rollout note, including a required manual Role Management step for already-provisioned deployments. **2026-08-14**: the binary own-vs-viewAll check is now the 4-tier `buildOwnershipClause()` cascade (own → `quotations:viewTeam` → `quotations:viewDepartment` → `quotations:viewAll`) — see [RBAC.md](./RBAC.md) "Departments + Teams + Tiered Visibility". |
| `POST /api/quotes` | `quotations:create` | Creates a new quote, ID generated server-side via `nextQuoteId()` — **atomic** as of 2026-07-10 (Codex review fix): reserves the next sequence number via a `counters` collection (`findOneAndUpdate` with `$inc`, upsert), not the previous scan-all-`_id`s-then-max+1 approach, which could race two concurrent creates into the same id. **2026-08-14, format changed**: id is now `Q#YYMMDD-NNNN` (e.g. `Q#260814-0001`) — Bangkok-local date + a sequence that resets to 1 on the first quote of each new day, replacing the old `QT-{Buddhist year}-NNNN` format (whose year half was a hardcoded constant that never advanced automatically). Counter key is `quote_{YYMMDD}`, a fresh key every day, so no bootstrap-from-existing-quotes step is needed the way the old yearly counter required. `createdByUserId` is always the authenticated caller — never trusted from the request body. Status always starts at `"ร่าง"` (Draft), `approvalHistory: []`. **Job Type is required** (2026-07-10 fix) — `jobTypeCode` must match a real `job_types` master record (any status, active or deactivated); `jobTypeName` is always re-derived from that record server-side, never trusted from the client. All fields go through `api/_lib/quoteValidation.ts` (type/length/range checks, ISO date validation) — see below. **`customerId` (optional, added 2026-07-14, replacing the earlier `issuerCompanyId`)**: if sent, `resolveCustomerIdUpdate()` looks the customer up server-side and `400`s if it doesn't exist or is archived (`isDeleted: true`). `customerSnapshot` is **always** built server-side (`buildCustomerSnapshot()`) from the Customer Information fields actually submitted in this request — whether they were autofilled from the selected customer or typed manually — never trusted from the client. **`quotationTemplateId` (optional, added 2026-07-14)**: if sent (from the Create Quotation wizard), `validateQuotationTemplate()` looks the template up server-side and `400`s if it doesn't exist or is deleted (an inactive-but-not-deleted match is allowed); `quotationTemplateName`/`quotationTemplateVersion` are always re-derived from that record server-side, never trusted from the client. **2026-07-14, Codex review fix (High #1)**: `validateQuotationTemplate()` now also takes the request's own already-validated `jobTypeCode` and `400`s (`"Template ใบเสนอราคาไม่ตรงกับประเภทงานที่เลือก กรุณาเลือกใหม่"`) if the matched template's `jobTypeCode` doesn't match it — previously `jobTypeCode` and `quotationTemplateId` were validated completely independently, so a direct API caller bypassing the wizard's UI-level guardrails could attach a template from the wrong Job Type. **2026-07-15, second Codex-review fix pass**: when `quotationTemplateId` resolves, a new `loadTemplateSnapshot()` call also fetches the full matched template document and freezes its `sections`/`defaultTerms`/`internalNotes`/`sourceHash` onto `Quote.templateSnapshot` (a real structured copy, not just the 3 provenance strings) — one extra targeted fetch, never run for a blank-start quote. The `"Quotation Created"` audit entry also now reads `"Quotation Created from Template"` (includes template name/version) or `"Quotation Created (Blank)"` (includes the Job Type code) instead of one generic action string for both. See [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md). **`contacts[]` (2026-09-07)**: optional list of `{ id?, name, position, phone, email }` (max 10, `400` above that or when not an array; blank rows dropped; missing `id` minted server-side). When present, the legacy `contactName/contactPhone/contactEmail` are **overwritten from `contacts[0]`**; when absent, the legacy trio (if any) becomes a one-entry `contacts`. The document always gets a `contacts` key on create. |
| `PATCH /api/quotes/:id` | `quotations:edit` + ownership (or `quotations:approve`) | General field edit (client/lines/discount/contact fields/`jobTypeCode`/`isPotentialOpportunity`/`followUpDate`/etc.) — every field is individually validated via `api/_lib/quoteValidation.ts`, not copied raw from the request body (fixed 2026-07-10, Codex review Critical finding). `amount`/`jobTypeName` are **not** client-writable at all: `amount` is always recomputed server-side from the resulting effective `lines`/`discount` (using the stored value for whichever wasn't part of this particular PATCH), and `jobTypeName` is always re-derived from the `job_types` master record whenever `jobTypeCode` is supplied — a non-blank `jobTypeCode` must match a real record, but blank is still allowed on edit (not forced) so legacy/unclassified quotes aren't blocked from unrelated saves. `status`/`approvalHistory` are still never client-settable via this route. Ownership: the caller must be the quote's creator, **or** hold `quotations:approve` (matches the client-side `computeQuotePermissions()` ownership model, now enforced server-side, not just hidden client-side). Legacy/seed quotes with an empty `createdByUserId` are treated as ownerless — any editor with `quotations:edit` passes the ownership check. **`customerId` changes are Draft-only** (added 2026-07-14, same rule the earlier `issuerCompanyId` had): a `400` is thrown if the request tries to change it while `quote.status !== "ร่าง"`. **`customerSnapshot` is refreshed whenever `customerId` or any Customer Information field is present in the request body**, recomputed from the resulting merged (already-sanitized) values — otherwise left untouched, so reopening a quotation preserves its existing snapshot. A distinct `"Quotation Customer Changed"` audit entry is written (instead of the generic `"Quotation Updated"`) whenever the linked customer specifically changed. **2026-07-23**: also accepts `revisionNote` (free text) — see [MODULES/Quotation.md](./MODULES/Quotation.md) "Business Flow" item 6b. **2026-09-07, `contacts`**: same rules as `POST`; additionally a PATCH carrying only the legacy trio on a document that already has `contacts` patches `contacts[0]` so the two never drift, and a PATCH touching neither leaves a pre-2026-09-07 document without a `contacts` key exactly as it was. `"contacts"` counts as a Customer Information field for the snapshot refresh. The same applies to the `draft` of `POST /api/quotes/:id/workflow`. |
| `POST /api/quotes/:id/duplicate` | `quotations:create` | Clones the quote: fresh `_id` (new atomic sequence number), fresh line/sub-detail IDs (`cloneLines()`), status reset to `"ร่าง"`, `interest: null`, `createdByUserId` set to the duplicating caller, `approvalHistory: []`, `amount` recomputed (not copied) from the cloned lines/discount as a defensive invariant check. `customerId`/`customerSnapshot` are carried over unchanged (spread from the source document) — a duplicate quote is still for the same customer by default. |
| `POST /api/quotes/:id/rewrite` | `quotations:create` | **Added 2026-07-22.** "Rewrite/แก้ไข" — creates a new **revision** of the quote: same clone semantics as `/duplicate` above (fresh line/sub-detail IDs, status reset to `"ร่าง"`, `interest: null`, `createdByUserId` set to the caller, `approvalHistory: []`, `amount` recomputed), but the fresh `_id` is a **revision-numbered id derived from the id being rewritten** — `{root}-R{n}` (e.g. `Q#260814-0001-R1`, then `-R2`, ...) — instead of an unrelated new sequence number. `root` is found by stripping any existing trailing `-R<digits>` suffix off the source's own `_id`, so rewriting an already-rewritten quote (`-R1`) advances to `-R2`, never `-R1-R1`. The revision number is reserved atomically via the shared `counters` collection (`quote_revision_{root}`, same `findOneAndUpdate($inc)` idiom as `nextQuoteId()`), with a bounded 3-attempt retry on the (extremely unlikely) `E11000` duplicate-key race — see [DATABASE.md](./DATABASE.md). No new schema field tracks the parent/revision relationship; it's recoverable purely from the id string. Writes a distinct `"Quotation Rewritten"` audit entry (not Duplicate's `"Quotation Created"`). The source quote is never modified. |
| `POST /api/quotes/:id/workflow` | Varies per `action` — see below | Body: `{ action: ApprovalAction, comment?: string, draft?: Partial<Quote> }`. Validates `action` against `workflowTransitions` (`api/_lib/quoteWorkflow.ts` — a duplicated copy of the state machine in `src/lib/quotes.tsx`, see [ARCHITECTURE.md](./ARCHITECTURE.md) for why) and that the quote's current status is a valid `from` state for that action (`400` otherwise). Merges any in-flight `draft` field edits (the on-screen unsaved state) into the quote **before** applying the status transition — validated the same way as `PATCH` above (2026-07-10) — closing the same "workflow action discards unsaved edits" bug documented in [CHANGELOG.md](./CHANGELOG.md) 2026-07-09 — now enforced this way server-side too. **2026-07-16**: before applying any transition except `rejected`/`cancelled`, the resulting effective document (existing fields overlaid with `draft`) is validated via `validateQuotationForFinalization()` — a `422` with `code: "DOCUMENT_INCOMPLETE"` + `fieldErrors`/`groupErrors` is returned if any required field is missing. **Same day, superseded by a later business decision**: only `client` (customer name) is actually required today — the mandatory-checklist-group/line-item rules mentioned in earlier same-day passes were removed; see "Required-Field Validation" in [MODULES/Quotation.md](./MODULES/Quotation.md). Appends an `ApprovalHistoryEntry` stamped with the authenticated caller's identity (never client-supplied). Fires `createWorkflowNotifications()` as a side effect: `submitted` notifies every active user holding `quotations:approve` (plus every active `approver_2`-keyed user if `quote.amount >= HIGH_VALUE_THRESHOLD`, ฿500,000); `approved`/`rejected`/`customer_accepted`/`customer_rejected` notify the quote's creator. Permission-per-action is checked via `isWorkflowActionAllowed()` combining `roleHasPermission()` for the relevant permission (`create`/`edit`/`approve`/`reject`/`delete`, mapped per action) with the same ownership rule as `PATCH` above; a `403` includes the Thai label of the specific permission that was missing. If `draft.customerId` is present, the same Draft-only gate and `resolveCustomerIdUpdate()` validation as `PATCH /api/quotes/:id` apply, checked against the quote's pre-transition status — this matters because a workflow action like Submit moves the quote *out* of Draft in the same request, so the customer change must be validated against where the quote was, not where it's headed. |
| `POST /api/quotes/:id/print` | `quotations:export` | Added 2026-07-16 — Quotation had **no** server-side print/PDF route at all before this (printing was 100% client-side `window.print()`, with no way to block an incomplete document short of hiding the button). Validates the stored quote via `validateQuotationForPrint()`; returns `{ ok: true }` on success or a `422 DOCUMENT_INCOMPLETE` (same shape as the workflow route above) if required fields are missing — as of a same-day follow-up business decision, that's just `client`. The frontend calls this before invoking `window.print()`; a direct call to this URL for an incomplete quote is blocked the same way. Doesn't itself write an audit entry (no document state changes). |

No dedicated `DELETE /api/quotes/:id` route exists — matches the pre-migration UI/workflow design, where "Cancel" (a workflow action, not a hard delete) is the only way to retire a quote.

**Correction (2026-07-14)**: the 2026-07-13 "Quotation integration pass" wired an `issuerCompanyId`/`issuerCompanySnapshot` pair (resolved against `company_profiles`) onto every quote-mutating route above — that was built against a misunderstanding of the actual requirement (this ERP only ever has one issuer company) and has been fully replaced by `customerId`/`customerSnapshot` (resolved against `customers`), described in the rows above. `issuerCompanyId`/`issuerCompanySnapshot` are no longer accepted, validated, or returned by any route — quotes saved 2026-07-13–2026-07-14 may still carry stray values for these fields in MongoDB, which are simply ignored (unread, not stripped). See [MODULES/CompanyProfiles.md](./MODULES/CompanyProfiles.md) (the module itself was later removed entirely — see "History" there).

**Server-side quote validation** (`api/_lib/quoteValidation.ts`, added 2026-07-10 per the Codex review's Critical finding that quote writes previously copied raw client fields into MongoDB with no schema validation): every free-text field is length-capped and type-checked (a wrong JSON type, e.g. a number where a string is expected, is a `400`, not a silent coercion); `lines[]` entries are validated per-field (`qty`/`unitPrice` non-negative and bounded, `discount` bounded **by the unit its own `discountMode` names** — 0–100 for a percentage, money-field bounds for a baht amount, added 2026-08-25 — array-length caps on `lines`/`tags`/`subDetails` to bound document size); dates (`issueDate`/`expiryDate`/`followUpDate`) must be `""` or a real `YYYY-MM-DD` calendar date; `amount` is always server-derived (see `PATCH` above) via the shared `computeQuoteAmountWithVat()` (`api/_lib/quoteAmounts.ts`, added 2026-07-14 — also backs the Dashboard's before-VAT figures via its sibling `computeQuoteAmountBeforeVat()`, see DATABASE.md), **literally the same code** as `computeTotals()` in `src/lib/quotes.ts`: as of 2026-08-25 both sides import `src/lib/quoteMath.ts`, a dependency-free module, so the on-screen totals and the persisted `amount` can no longer drift. The math was pulled out into its own file rather than imported from `src/lib/quotes.ts` directly so that a Node function doesn't have to drag `apiClient.ts` in behind it to do arithmetic. (Later the same day `quotes.tsx` itself became `quotes.ts` — see CHANGELOG.md 2026-08-25b — so the older, stronger objection, that importing it would force the server to transpile JSX, no longer applies to anything.)

### Auto-save writes (`?autoSave=1`) — added 2026-08-25

Every document module's update route accepts an optional `?autoSave=1` query flag, read by
`isAutoSaveRequest()` (`api/_lib/http.ts`) and sent by the client through `writeQuery()`
(`src/lib/apiClient.ts`). It marks a write as coming from the background auto-save rather than a
person pressing Save. Affected routes: `PATCH /api/quotes/:id`, `/api/scope-of-works/:id`,
`/api/delivery-orders/:id`, `/api/material-requisitions/:id`, `/api/job-orders/:id`,
`/api/purchase-requests/:id`, `/api/production-orders/:id`, `/api/service-reports/:id`.

The flag changes exactly two things, both server-enforced (not UI-only):

1. **No audit-log entry is written.** Auto-save fires every few seconds while someone types; dozens
   of identical "แก้ไขเอกสาร X" rows per editing session would bury the deliberate actions the log
   exists to record.
   **Two exceptions, both added 2026-08-25b — an entry that no other write could ever produce.**
   Suppressing the generic entry is the point; suppressing a *specific* one that only the auto-save
   is in a position to write silently deletes it from the record:
   - **Service Report — customer signature captured/cleared.** `customerSignedAt` is stamped by the
     first write carrying the new signature, which is now the auto-save (it fires seconds after the
     customer signs, before anyone presses Save). By the time a manual Save arrives the stored
     signature already matches, so the "(ลูกค้าเซ็นรับงาน: …)" entry would never be written by
     anyone. `api/_lib/serviceReportHandler.ts` therefore writes it even on an auto-save, gated on
     `update.customerSignedAt !== undefined` — the one write where the signature actually changed.
   - **Quotation — linked customer changed.** The client sends `customerId` only while it differs
     from the loaded quote; once an auto-save has written it, that baseline moves with it and no
     later manual Save sends the field at all. `api/handlers/quotes.ts` writes
     `"Quotation Customer Changed"` even on an auto-save, gated on `customerLinkChanged`.
2. **Draft-only.** A `409` is returned if the target is past ร่าง/Draft. Quotation and Scope of Work
   add this check explicitly (both allow certain edits after that point — the latter's PO-number
   /document-recipient follow-up fields — and those must keep requiring a real Save); the other five
   modules already rejected any non-Draft update, so the existing guard covers them.

Everything else is identical to a manual save: the same permission checks, the same field-by-field
validation, the same status gates, the same `updatedBy`, the same server-recomputed `amount`. An
auto-save can never do something a manual save could not.

## Errors

Every route funnels exceptions through `withErrorHandling()` (`api/_lib/http.ts`): an `HttpError(status, message)` produces `{ status } { error: message }` (Thai-language messages for user-facing validation errors, matching the app's UI language); any other thrown error is logged server-side and produces a generic `500 { error: "Internal server error" }`, so internal error details are never leaked to the client. `apiFetch()` on the frontend throws `ApiError` for any non-2xx response, caught by each page's existing try/catch + `useToast()` error-toast pattern.

**Structured validation errors (added 2026-07-16)**: `HttpError` optionally carries `code`/`details`, spread into the JSON body alongside `error` — used by the Quotation/Scope of Work completion gates (`POST /api/quotes/:id/print`, `POST /api/quotes/:id/workflow`, `POST /api/scope-of-works/:id/finalize`, `POST /api/scope-of-works/:id/print`) to return `422 { error, code: "DOCUMENT_INCOMPLETE", fieldErrors: Record<string,string>, groupErrors: Record<string,string[]> }` instead of just a flat message. `ApiError` (`src/lib/apiClient.ts`) parses `code`/`fieldErrors`/`groupErrors` back out of the response body — as of a same-day Codex review fix pass, `QuoteDocument.tsx`/`ScopeOfWorkDocument.tsx` now actually merge these into the on-screen validation result (`mergeServerValidationErrors()`) instead of only showing the message as a toast, closing a Medium Priority gap the review found. Every other route's errors are unaffected (both fields simply come back `undefined`).

## Known, Deliberate Scope Limitations (not bugs — see [RBAC.md](./RBAC.md) for the full RBAC picture)

- `GET /api/users`, `GET /api/roles`, `GET /api/company`, `GET /api/products`, `GET /api/categories` are open to any **authenticated** user, not gated by e.g. `users:manage`. This matches the pre-migration behavior, where the full dataset already lived in every signed-in user's browser — so it's not a new permission surface, just now real authentication is required at all (previously anyone could open the site with zero login). Mutations on all of these remain properly permission-gated per action.
- ~~No rate limiting on `POST /api/auth/login`~~ — closed 2026-07-29, see the login route's row above and [RBAC.md](./RBAC.md) Known Gaps.
- No pagination on any list route (`GET /api/quotes`, `GET /api/users`, `GET /api/audit-log` aside from its 1000-entry cap) — fine at current data volumes, worth revisiting if any collection grows large.

## Superseded: the old proposed Next.js API design — NOT what got built

If/when a hypothetical Next.js migration happened (the "Phase 2" plan, see [ARCHITECTURE.md](./ARCHITECTURE.md) "Superseded" section), the plan had been: an Auth.js route handler, Server Actions (not REST/JSON) for most mutations, Server Components/`queries/*.ts` for reads, and a coarse `middleware.ts` session check. **None of this was built.** The real API that shipped 2026-07-09 is a plain REST/JSON API (today served by the standalone Express server), documented in full above. This paragraph is kept only as a historical record — do not write code against the old proposal.

## Production Order + shared document approval (added 2026-08-20)

### Product Request (`api/_lib/productRequestHandler.ts`, mounted at `/api/product-requests` via `api/handlers/quotes.ts` — added 2026-08-27)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/product-requests` | `productRequest:view` | Own requests only, unless the caller holds `:viewAll` **or `:review`** — Stores cannot approve what it cannot see. |
| `POST /api/product-requests` | `productRequest:create` | Body `{ name, unit, categoryId, specifications, reason, sourcePurchaseRequestId? }`. **`code` is never read from the body** — the requester cannot assign a product code by any route, not merely by a hidden field. Always starts `Pending` with an empty code, whatever the client sends. Notifies Stores. `201`. |
| `GET /api/product-requests/:id` | `productRequest:view` | |
| `PATCH /api/product-requests/:id` | `productRequest:create` + owner | `400` once reviewed. Same no-`code` rule as create. |
| `POST /api/product-requests/:id/approve` | `productRequest:review` | Body `{ code, categoryId }`. **The only route that can write a product code.** Creates a real `products` row (upper-cased code, `409` on duplicate — same check `POST /api/products` uses, `stockQty: 0`) **before** flipping the request to `Approved`, so a duplicate leaves it `Pending` and retryable rather than approved with nothing behind it. Notifies the requester with the assigned code. |
| `POST /api/product-requests/:id/reject` | `productRequest:review` | Body `{ comment }` — required (`400` if blank). Notifies the requester. |
| `DELETE /api/product-requests/:id` | `productRequest:create` + (owner **or** `:review`) | Soft delete. |

**Approval hand-off notifications (2026-08-27)**: approving a Material Requisition notifies everyone
in Stores, and a Purchase Request notifies Purchasing — fired from the existing `onApproved` hook in
`ApprovalConfig`, via the shared `api/_lib/departmentNotify.ts`. Recipients are matched on the
free-text `User.department`, which does not line up with the `departments` table in the live data, so
the helper accepts several spellings per department and logs a warning when nobody matched.
Notification failures are caught and never fail the approval itself.

### Production Order (`api/_lib/productionOrderHandler.ts`, mounted at `/api/production-orders` via `api/handlers/quotes.ts`)

Same 12/12 function-slot sharing convention as the other Project-family documents. Full design:
[MODULES/Production.md](./MODULES/Production.md). Client wrapper: `src/lib/productionOrder.ts`.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/production-orders?scopeOfWorkId=` | `productionOrder:view` | With `scopeOfWorkId`: existence check for one job, unfiltered by owner. Without: company-wide list scoped by `productionOrder:viewAll`. |
| `POST /api/production-orders` | `productionOrder:create` + `scopeOfWork:view` | Body `{ scopeOfWorkId }`. **No status gate** — the Scope-of-Work-must-be-Final requirement was removed 2026-08-27 at the Production department's request (Project's own create still has it). Mints `SC-{YYYY}-{MM}-{NNN}` from an atomic per-month counter — **Gregorian year, deliberately unlike every other document here** (matches the real FM-PD-02 form; pinned by a test). Returns `201`. |
| `GET /api/production-orders/:id` | `productionOrder:view` | Full document. |
| `PATCH /api/production-orders/:id` | `productionOrder:edit` + (owner **or** `:finalize`) | `400` once `Final`. Accepts `documentNumber` (the number printed on the form, separate from the immutable `_id`) — **`409` if another order already uses it**, `400` if blank; unique index + friendly pre-check, the same recipe Scope of Work uses. Section-header rows have their `qty`/`unit` forced empty server-side. The `approver` signatory is **not** accepted here — only the approve route writes it. |
| `DELETE /api/production-orders/:id` | `productionOrder:delete` + (owner **or** `:finalize`) | Soft delete. |
| `POST /api/production-orders/:id/print` | `productionOrder:print` | Writes an audit entry. |
| `POST /api/production-orders/:id/signatories` | `productionOrder:edit` + (owner **or** `:finalize`) | Writes **only** `deliveredBy`/`receivedBy`/`costDeptBy`, and deliberately carries **no `Final` lock** — on the real form those three blocks are signed after the work is done. (Route existed since 2026-08-20; this table simply never listed it.) |
| `POST /api/production-orders/:id/refresh` | `productionOrder:edit` + `scopeOfWork:view` | Draft-only. **Replaces every line** with the source Scope of Work’s current items (specs become `subDetails`) and re-snapshots the job code/customer. Writes an audit entry — it overwrites hand-typed work, so the UI confirms first. |
| `POST /api/production-orders/:id/rewrite` | `productionOrder:create` | Creates a `-R{n}` revision (`201`). Signatories cleared, `revisionNote` **not** inherited. `_id` and `documentNumber` each take the suffix from **their own** root, so a hand-edited printed number is preserved. |

### Shared approval routes (`api/_lib/documentApproval.ts`)

Applied identically to `material-requisitions`, `purchase-requests`, `job-orders`,
`production-orders`, `purchase-orders` and `cost-controls` (`X` below). Mirrors Scope of Work's
existing workflow.

**Since 2026-08-31, `submit-approval` also notifies the approvers.** Recipients are every active
user whose role holds that document's own `approvePermission` — not a department, because the
owner's stated reason for asking was *"เฮดคนนึงต้องอนุมัติหลายแผนก"*. It is **best-effort**: a
notification failure is logged and swallowed, never allowed to fail the status change, matching the
post-approval hand-off. Zero recipients is logged as a warning, since that is the silent failure
that matters (usually: no role holds the approve permission yet).

| Method & Path | Auth | Notes |
|---|---|---|
| `POST /api/X/:id/submit-approval` | edit rights on the document | `Draft` → `PendingApproval`. Clears any previous `rejectionComment`, so a stale reason can't linger on a resubmitted document. |
| `POST /api/X/:id/approve` | `{doc}:finalize` | `PendingApproval` → `Final`. `400` from any other state — a straight Draft→Final jump is refused. Stamps the approver: fills the printed `approvedBy`/`approvedAt` (or Production Order's `approver` block) **only when blank**, never overwriting a typed name, and always records `approvedByUserId` server-side. |
| `POST /api/X/:id/reject` | `{doc}:finalize` | `PendingApproval` → `Draft`. Body `{ comment }` — **required**, `400` without it. |
| `POST /api/X/:id/withdraw-approval` | edit rights on the document | `PendingApproval` → `Draft`, for the submitter to take it back. No approve permission needed. |
| `POST /api/X/:id/finalize` | `{doc}:finalize` | Kept as an **alias of `/approve`** for backward compatibility; now enforces the PendingApproval step like `/approve` does. |

### Pending approvals inbox (`api/_lib/pendingApprovals.ts`, mounted at `/api/pending-approvals` via `api/handlers/customers.ts`)

Added 2026-08-31, for the cross-department inbox the owner asked for on 2026-08-28.

| Route | Permission | Notes |
|---|---|---|
| `GET /api/pending-approvals` | authenticated; **no permission of its own** | Returns `{ items }` — every document waiting on *this* user, oldest first. Each of the 10 categories is gated by that document's **approve** permission (`*:finalize`, `quotations:approve`, `productRequest:review`), so a user who can read a document but not approve it never sees it here. Holding none of them returns `[]`, not `403`. |

Three things about it are load-bearing:

- **Three status vocabularies, one list.** "รออนุมัติ" is stored as `PendingApproval` by eight
  document types, `รออนุมัติ` by quotations, and `Pending` by product requests — three modules
  built months apart. Unifying them would be a full-database migration; the translation happens
  here instead.
- **No ownership filter, deliberately.** Unlike `searchDocuments.ts`, this route does not apply
  `buildOwnershipClause`. The caller already holds the approve permission, which outranks
  "see other people's records", and filtering by `createdBy` would show an approver only the
  documents they wrote themselves — the exact opposite of the request.
- **`waitingSince` is `updatedAt`, not a real submission time**, for 9 of the 10 categories: no
  document in this system records when it was submitted. Quotations are the exception — they keep
  `approvalHistory`, so their `submitted` entry is the real thing. Recorded in `docs/TODO.md`.

Each category is wrapped so one failing collection returns `[]` instead of emptying the page —
the same `runCategory` discipline Global Search uses.

### Department separation on Material Requisition / Purchase Request

| Change | Notes |
|---|---|
| `GET /api/{material-requisitions,purchase-requests}?ownerDepartment=` | `project` (default) or `production`, plus `all` (both departments in one list — Purchasing's inbox since 2026-08-28, Store's issue queue since 2026-09-10; Purchase Request also has `general`). **A document with no `ownerDepartment` field counts as `project`**, so records created before 2026-08-20 keep appearing where they always did — no migration was run. Ignored when `projectId` is supplied (that mode is already scoped to one project). |
| `GET /api/material-requisitions?issueStage=pending` | **Store's issue queue (2026-09-10).** Narrows to `status: "Final"` documents that still have at least one line with outstanding quantity, oldest first (a work queue, so a just-part-issued document falls to the back). Requires **`stock:adjust`** on top of `materialRequisition:view` (`403` without it) and, uniquely among the list modes, **does not filter by `createdBy`** — the permission to issue goods is stronger than "see other people's documents", and ownership filtering would leave Store looking at an empty page. Rows carry `ownerDepartment`, `outstandingLineCount` and `customerName`. |
| `POST /api/{material-requisitions,purchase-requests}` | Now accepts **either** `{ projectId, itemId }` (Project-owned; still performs the atomic ProjectItem link) **or** `{ productionOrderId }` (Production-owned; no item to link, so that step is skipped entirely). |
| `POST /api/material-requisitions` with an **empty body** | **Blank requisition (2026-09-10).** No source document at all — for stock withdrawn against maintenance or internal work that belongs to no job. Returns a Draft with empty `projectId`/`scopeOfWorkId`/`jobCode`, its own `MR-YYYYMM-NNNN` number, the caller as `preparedBy`, and the caller's department/team as the default charge; no `ProjectItem` is touched. `ownerDepartment` is read from the body (`"production"`, else `"project"`) so the new document lands in the menu it was created from — unlike Purchase Request's blank path, which uses a third `"general"` department. **`project:view` is not required on this path** (it still is for the project-item path). Sending a `projectId` without `itemIds` is still a `400`. |

## Purchasing (added 2026-08-28)

> **Note.** ใบตรวจรับสินค้า (`/api/goods-receipts`) and ใบรับวางบิล (`/api/bill-receipts`) were added
> on 2026-08-28 and **removed the same day** at the owner's instruction. Those paths no longer exist —
> see [MODULES/Purchasing.md](./MODULES/Purchasing.md) "Removed 2026-08-28".

Mounted on `api/handlers/quotes.ts`, with an `API_ROUTES` entry in `server/app.ts` per resource. See [MODULES/Purchasing.md](./MODULES/Purchasing.md).

### Vendors (`api/_lib/vendorsHandler.ts`, mounted at `/api/vendors` via `api/handlers/customers.ts`)

Added 2026-08-31. Master data, not a document — four permissions, no approval workflow, no printing.

| Route | Permission | Notes |
|---|---|---|
| `GET /api/vendors` | `vendor:view` **or** `purchaseOrder:view` / `purchaseRequest:view` | The carve-out matters: without it the vendor dropdown on a purchase order is empty for the people who actually use it. Callers without `vendor:view` see only active, non-archived rows. Sorted by name. |
| `POST /api/vendors` | `vendor:create` | `name` required. `code` optional; if set it is upper-cased and must be unique case-insensitively → `409` "รหัสผู้ขายนี้มีผู้ใช้งานแล้ว". `201`. |
| `GET /api/vendors/:id` | `vendor:view` | |
| `PATCH /api/vendors/:id` | `vendor:edit` | Partial. The uniqueness check excludes the row itself, so re-saving without changing the code is fine. |
| `POST /api/vendors/:id/archive` | `vendor:archive` | Body `{ isDeleted }`. Soft-delete both ways — a vendor row is never actually removed, because purchase orders reference the name. |

### Code register (`api/_lib/codeEntriesHandler.ts`, mounted at `/api/code-entries` via `api/handlers/customers.ts`)

Added 2026-08-31. Master data like Vendors, but **two unrelated registers in one collection**,
separated by `kind`:

- `department` — the `G143`-style code that goes in a purchase request line's แผนก box.
- `account` — the 479-row chart of accounts (`5230-15`) the owner supplied as `รหัสสินค้าทั้งหมด.xlsx`.

They share one handler because they share the whole surface — same permissions, same duplicate
check, same archive semantics — and differ only in four optional account-side fields. Uniqueness
is on `{ kind, code }`, **not `code` alone**: the two sets are unrelated, so the same string may
legitimately exist in both.

| Route | Permission | Notes |
|---|---|---|
| `GET /api/code-entries` | `codeRegister:view` **or** `purchaseRequest:view` / `purchaseOrder:view` | Same carve-out as Vendors, and for the same reason — without it the code dropdowns on PR/PO lines are empty for the people who fill them in. Callers without `codeRegister:view` see only active, non-archived rows. Sorted by `kind` then `code`. |
| `POST /api/code-entries` | `codeRegister:create` | `kind`, `code`, `name` required. `code` is upper-cased on write and must be unique within its `kind`, compared case-insensitively → `409` "รหัสนี้มีอยู่แล้วในทะเบียน". `201`. |
| `POST /api/code-entries/import` | `codeRegister:create` | Body `{ kind, entries[] }`, max 2000 rows. **Existing codes are skipped, never overwritten** — re-importing a longer chart of accounts is expected, and overwriting would eat names an admin edited. Returns `{ created, skipped }`. |
| `PATCH /api/code-entries/:id` | `codeRegister:edit` | Partial. `kind` in the body is ignored — moving a code between registers is a create, not an edit. The uniqueness check excludes the row itself. |
| `POST /api/code-entries/:id/archive` | `codeRegister:archive` | Body `{ isDeleted }`. Soft-delete both ways; documents keep the string they stored. |

`isControl: true` marks a grouping account that cannot be posted to. Such rows are listed on the
register page but filtered out of the PR/PO dropdowns by `codeComboboxOptions()`.
### Purchase Order (`api/_lib/purchaseOrderHandler.ts`, mounted at `/api/purchase-orders` via `api/handlers/quotes.ts`)

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/purchase-orders` | `purchaseOrder:view` | Own documents only without `:viewAll` (`buildSimpleOwnershipClause`). |
| `POST /api/purchase-orders` | `purchaseOrder:create` | Body `{ purchaseRequestId? }`. With an id: also requires `purchaseRequest:view` (otherwise the create button doubles as a way to read a ใบขอซื้อ you cannot open), the source must be `Final` (`400` otherwise), and vendor/dates/credit/shipping/lines are copied as a **snapshot**. Without one: a blank draft. `201`. |
| `GET /api/purchase-orders/:id` | `purchaseOrder:view` | |
| `PATCH /api/purchase-orders/:id` | `purchaseOrder:edit` + owner | `400` unless `Draft` — **both** `Final` and `PendingApproval` are locked. Accepts `?autoSave=1` (`isAutoSaveRequest`): no audit entry, and `409` on a non-Draft target. Line product fields are server-resolved, never trusted from the client. Duplicate `documentNumber` → `409`. |
| `POST /api/purchase-orders/:id/submit-approval` | `purchaseOrder:edit` | Shared engine (`api/_lib/documentApproval.ts`). |
| `POST /api/purchase-orders/:id/approve` (alias `/finalize`) | `purchaseOrder:finalize` | |
| `POST /api/purchase-orders/:id/reject` | `purchaseOrder:finalize` | Body `{ comment }` — required. |
| `POST /api/purchase-orders/:id/withdraw-approval` | `purchaseOrder:edit` | Back to `Draft`. |
| `POST /api/purchase-orders/:id/rewrite` | `purchaseOrder:create` | `Final` only (`400` otherwise). New `{root}-R{n}` document, `Draft`, approval fields and revision note cleared; the original is untouched. `201`. |
| `POST /api/purchase-orders/:id/print` | `purchaseOrder:print` | Audit only. |
| `DELETE /api/purchase-orders/:id` | `purchaseOrder:delete` + owner | Soft delete. |

The unique index on `documentNumber` is created **lazily by the handler**
(`ensurePurchaseOrderNumberIndex()`, with a backfill), because `ensureIndexes()` only ever runs
from the Setup Wizard and would never fire on an already-provisioned database.

### Purchase Request opened to every department (2026-08-28)

| Method & Path | Auth | Notes |
|---|---|---|
| `POST /api/purchase-requests` | `purchaseRequest:create` | **2026-09-23**: every shape also accepts `requestCode` (`"PR"`/`"FD"`/`"ED"`/`"SD"`, 400 on anything else) — it becomes the number prefix, each code with its own counter; omitted = `FD` from a production order, `ED` from a project, `PR` for a blank document. Now accepts a **third** shape: an **empty body**, creating a standalone document with `ownerDepartment: "general"` — no `projectId`/`scopeOfWorkId`/`jobCode`, and no `linkProjectItemToSubDocument()` call. `project:view` is now required only on the path that actually reads a project; requiring it for the whole route locked out every department that has no project access, which is exactly what this change exists to fix. |
| `GET /api/purchase-requests?ownerDepartment=` | `purchaseRequest:view` | `project` (default, also matches documents with no field) · `production` · `general` · **`all`** — the last is view-only, never stored, and backs the Purchasing inbox. `all` lifts the department wall **only**: `buildSimpleOwnershipClause` still applies, so a user without `:viewAll` still sees only their own. |

## Cost Control (BD) — added 2026-08-28

`api/_lib/costControlHandler.ts`, mounted at `/api/cost-controls` via `api/handlers/quotes.ts`

⚠️ **Every write route sits behind one chokepoint** (`assertNotScopeRecipientOnly()`, on the router
itself rather than inside each handler, because the approval routes run through the shared engine
whose `canEdit` hook is synchronous while this check reads the database). A caller whose *only*
claim to the document is being a recipient of its linked Scope of Work gets `403` on PATCH, DELETE,
rewrite and all four approval routes — **even holding `:edit`/`:finalize`/`:delete`** — matching
Delivery Order's `assertNotDepartmentRecipientOnly()`. Owners and `:viewAll` holders are unaffected.
See [MODULES/CostControl.md](./MODULES/CostControl.md).

**The server never receives a file.** The browser parses the workbook, shows a preview the person
corrects, and posts the corrected rows as ordinary JSON — so there is no multipart route, no
base64 payload, and no body-size ceiling to design around.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /api/cost-controls` | `costControl:view` | No total of any kind is returned (2026-08-31 — every total was removed from the module). Visible rows = own **or** `:viewAll` **or** linked to a Scope of Work the caller is a document recipient of (2026-08-31, `buildCostControlVisibilityClause()` in `api/_lib/visibility.ts`, shared with Global Search so a row can never be listed-but-unsearchable). |
| `GET /api/cost-controls?scopeOfWorkId=` | `costControl:view` | "Does this Scope already have one?" mode, used by the Scope of Work toolbar. **Deliberately NOT ownership-filtered**, exactly like the identical Delivery Order route: an existence check that hides a colleague's record invites a duplicate. |
| `POST /api/cost-controls` | `costControl:create` | Body `{ jobName?, workType?, jobOrder?, docDate?, lines?, sourceFileName?, scopeOfWorkId? }` — every field optional, so an empty body opens a blank document. `lines[].kind` is whitelisted to `group`/`item`/`sub` (`400` otherwise). A `scopeOfWorkId` that names no live Scope is `400`, never a dangling FK; passing one also requires `scopeOfWork:view` and back-fills `jobOrder`/`jobName`/`workType` from that Scope **only where the body left them blank**. `201`. |
| `GET /api/cost-controls/:id` | `costControl:view` | |
| `PATCH /api/cost-controls/:id` | `costControl:edit` + owner | `scopeOfWorkId` is patchable — `""` unlinks, which revokes the Scope recipients' sight of the document immediately. `400` unless `Draft` — **both** `Final` and `PendingApproval` are locked. `?autoSave=1` suppresses the audit entry and returns `409` on a non-Draft target. Duplicate `documentNumber` → `409`. |
| `POST /api/cost-controls/:id/submit-approval` | `costControl:edit` | Shared engine (`api/_lib/documentApproval.ts`). |
| `POST /api/cost-controls/:id/approve` (alias `/finalize`) | `costControl:finalize` | |
| `POST /api/cost-controls/:id/reject` | `costControl:finalize` | Body `{ comment }` — required. |
| `POST /api/cost-controls/:id/withdraw-approval` | `costControl:edit` | Back to `Draft`. |
| `POST /api/cost-controls/:id/rewrite` | `costControl:create` | `Final` only. New `{root}-R{n}`, `Draft`, lines carried over, approval fields cleared. `201`. |
| `POST /api/cost-controls/:id/print` | `costControl:print` | Audit only. |
| `DELETE /api/cost-controls/:id` | `costControl:delete` + owner | Soft delete. |

`ensureCostControlNumberIndex()` creates the unique `documentNumber` index lazily, because
`ensureIndexes()` only ever runs from the Setup Wizard.

## ใบขอซื้อ — ขั้นสโตร์เช็คของ (2026-09-09, `api/_lib/purchaseRequestHandler.ts`)

ไหลงานที่เจ้าของสั่ง: **สร้างใบ → หัวหน้าฝ่ายอนุมัติ → สโตร์เช็คของ → มีของ = จ่ายจบ / ไม่มี = ส่งต่อจัดซื้อ**
ขั้นนี้อยู่**หลัง** `status: "Final"` และเก็บเป็นฟิลด์ของใบขอซื้อเอง (`storeStage`) — ไม่ได้เพิ่มสถานะที่ 4
ให้เครื่องอนุมัติร่วม ซึ่งใช้กันอยู่ 6 เอกสาร

| Route | Permission | Notes |
|---|---|---|
| `POST /api/purchase-requests/:id/store-review` | `stock:adjust` | `Final` เท่านั้น · body `{ lines: [{lineId, decision: "stock"\|"purchase", availableQty?}], remark? }` · บันทึกได้ซ้ำ · บรรทัดที่จ่ายของไปแล้วเปลี่ยนเป็น `"purchase"` ไม่ได้ (400) · มีบรรทัด `"purchase"` = `storeStage: "forwarded"` แล้วแจ้งฝ่ายจัดซื้อ |
| `POST /api/purchase-requests/:id/store-issues` | `stock:adjust` | `Final` เท่านั้น · body หนึ่งรอบ `{ lines: [{lineId, qty}], issuedDate?, issuedBy?, remark? }` · เช็คยอดทั้งรอบด้วย `assertProductsHaveStock()` **ก่อน**เขียนแม้แต่แถวเดียว · บรรทัดที่ไม่มี `productId` → 400 พร้อมข้อความให้ขอรหัสสินค้าก่อน · จ่ายเกินจำนวนที่ขอ → 400 |
| `DELETE /api/purchase-requests/:id/store-issues/:batchId` | `stock:adjust` | ยกเลิกได้เฉพาะ**รอบล่าสุด** (เหตุผลเดียวกับใบรับสินค้าและใบเบิก) · ของกลับเข้าคลังเป็น `kind: "return"` ด้วย**ราคาซื้อล่าสุด** |
| `GET /api/purchase-requests?storeStage=` | `purchaseRequest:view` | `pending` = กล่องงานเข้าของสโตร์ · `forwarded` = ของจัดซื้อ (**รวมใบเก่าที่ไม่มีฟิลด์นี้** ไม่งั้นใบก่อน 2026-09-09 จะหายจากกล่องจัดซื้อทั้งหมด) |

`GET /api/purchase-requests/:id` ส่ง `stockByProduct` มาพร้อมเอกสารแล้ว (แนวเดียวกับใบเบิก) และทุก
route ข้างบนก็ส่งกลับมาด้วย หน้าจอจึงไม่ต้องยิงซ้ำ

**`POST /api/purchase-orders` รับ `lineIds?: string[]` (2026-09-21)** — ไม่ส่ง = ทุกบรรทัดที่ยังไม่ได้ซื้อ
(ข้ามบรรทัดที่ซื้อแล้วเงียบ ๆ, ไม่เหลือเลย → 400) · ส่งมา = บรรทัดที่ซื้อไปแล้วตอบ **400 พร้อมเลขที่ใบเดิม**
เพราะเป็นการเลือกผิดที่ต้องรู้ตัว · แต่ละบรรทัดของใบสั่งซื้อเก็บ `sourcePrLineId` ชี้กลับไปบรรทัดต้นทาง
**`sanitizeLines()` ของใบสั่งซื้ออ่านค่านั้นกลับด้วย line id ไม่รับจาก PATCH** ไม่งั้นย้ายตัวชี้แล้วซื้อซ้ำได้
· **บรรทัดที่ถูกยกเลิก (`cancelled`) ไม่นับว่าซื้อแล้ว** — ของถูกถอนไปแล้ว ไม่ถูกคิดเงินและไม่ถูกลอกไป
ใบรับสินค้า บรรทัดต้นทางจึงต้องกลับมาเปิดใบสั่งซื้อใหม่ได้ (เหตุผลเดียวกับการลบใบสั่งซื้อทิ้ง)

**ด่านใหม่: `purchasingStage === "review"` → 400** (ฝ่ายจัดซื้อยังไม่อนุมัติ) — เขียนเป็นรูป **บวก**
ไม่ใช่ `!== "approved"` เพื่อให้ใบเก่าที่ไม่มีฟิลด์นี้ผ่านได้ ตรงข้ามกับด่านล็อกการแก้ไขซึ่งต้องเป็น
`=== "approved"` ด้วยเหตุผลกลับกันพอดี

**`GET /api/purchase-requests/:id` ส่ง `purchasedLines`** (`{ [prLineId]: poNumber[] }`) และ
**`GET /api/purchase-requests` ส่ง `purchaseState`** (`"none"|"partial"|"full"`) ต่อใบ — ทั้งคู่**คำนวณจาก
ใบสั่งซื้อจริงทุกครั้ง ไม่ใช่ธงที่เก็บไว้** ลบใบสั่งซื้อแล้วบรรทัดกลับมาซื้อได้เองทันที

**`POST /api/purchase-orders` เข้มขึ้น**: ปฏิเสธใบขอซื้อที่ `storeStage: "pending"` (ยังรอสโตร์) และ
`"closed"` (จ่ายจากสต๊อกครบแล้ว) · ตอนลอกบรรทัด **ข้ามบรรทัดที่ `storeDecision === "stock"`** เพราะของ
นั้นออกจากคลังไปแล้ว ถ้าไม่เหลือบรรทัดให้ซื้อเลย → 400

**`PATCH /api/purchase-requests/:id` เปิดทางที่สอง**: ผู้ถือ `purchaseRequest:editApproved` แก้ใบ
`Final` ได้ทุกช่องเหมือนใบร่าง (ยกเว้น `status`/ฟิลด์การอนุมัติ/ไฟล์แนบซึ่งมี route ของตัวเอง) ·
`PendingApproval` ยังล็อกทุกคน · `?autoSave=1` บนใบ `Final` → **409** · body รับ `purchasingEditNote`
เพิ่มหนึ่งช่อง ซึ่งไม่ใช่ฟิลด์ที่เก็บตรง ๆ แต่ถูกต่อท้าย `purchasingEdits[]` พร้อมชื่อผู้แก้และเวลา ·
ห้ามลบบรรทัดหรือลดจำนวนต่ำกว่าที่สโตร์จ่ายไปแล้ว → 400

`GET /api/material-requisitions/:id` (และ route จ่าย/ยกเลิก/คืน) ส่ง **`costByProduct`** เพิ่มอีกหนึ่ง map
(`{ [productId]: { avgCost, lastCost } }`) ให้หน้าจอโชว์ "ราคาล่าสุด" ที่ของจะกลับเข้าคลังด้วยตอนคืน

### `POST /api/product-requests/:id/approve` — ตั้งหมวดใหม่ได้ในตัว (2026-09-09)

body รับ `newCategoryName` เพิ่มอีกหนึ่งช่อง ใช้แทน `categoryId` ได้ (ต้องมีอย่างน้อยหนึ่งอย่าง
ไม่งั้น 400) · ชื่อที่ตรงกับหมวดที่มีอยู่แล้วแบบไม่สนตัวพิมพ์และตัดช่องว่างหัวท้าย จะ**ใช้หมวดเดิม
ไม่สร้างซ้ำ** · การสร้างหมวดทางนี้ใช้สิทธิ์ `productRequest:review` ของ route นี้เอง ไม่ได้ผ่าน
`POST /api/categories` ซึ่งยังต้องการ `products:create` เหมือนเดิม

## ใบสั่งซื้อ — ยกเลิกรายการทีละบรรทัด (2026-09-21)

`PurchaseOrderLine.cancelled` + `cancelRemark` · เจ้าของข้อ 11: *"ใบ PO มีช่องยกเลิก และหมายเหตุ
การยกเลิกรายการสินค้านั้นๆด้วย"*

**`cancelRemark` บังคับเมื่อ `cancelled` เป็น true** — `PATCH` ตอบ 400 ถ้าเว้นว่าง (เจ้าของขอสองอย่าง
นี้มาคู่กัน การยกเลิกที่ไม่มีเหตุผลอธิบายไม่ได้ตอนผู้ขายโทรมาถาม) · ติ๊กออกแล้วเหตุผลเก่าถูกล้างทิ้ง

**ยกเว้นการบันทึกอัตโนมัติ (`?autoSave=1`)** ซึ่งจะบันทึกบรรทัดนั้นเป็น **ยังไม่ยกเลิก** แทนที่จะตอบ 400
— ติ๊กปุ่มยกเลิกแล้วใบ dirty ทันที auto-save จึงยิงออกไปก่อนคนพิมพ์เหตุผลเสร็จเสมอ · **กฎยังจริงทุก
วินาที**: บรรทัดที่ `cancelled` อยู่ในฐานข้อมูลมีเหตุผลกำกับเสมอ และการกดบันทึกเองยังตอบ 400 ตามเดิม

**ยอดเงินกรองที่ `purchaseOrderSubtotal()` ที่เดียว** แล้วกระจายไปทั้งระบบเอง เพราะหน้าแก้ไข ใบพิมพ์
และแดชบอร์ดแผนกคิดยอดผ่าน `purchaseOrderTotals()` ทั้งหมด และส่วนลดท้ายใบกับ VAT คิดจาก subtotal ตัวนี้ ·
**`purchaseOrderLineTotal()` ไม่ถูกแตะ** — ใบพิมพ์ยังต้องโชว์ยอดของบรรทัดที่ขีดทับให้เทียบกับใบเดิมได้

**`POST /api/receiving-reports` ข้ามบรรทัดที่ยกเลิก** ไม่งั้นสโตร์ถูกสั่งให้รับของที่ถอนไปแล้ว และหนี้
กับสต๊อกจะถูกตั้งจากของที่ไม่มีวันมาถึง · ถ้าใบ**มีรายการแต่ถูกยกเลิกหมด** → 400 (ใบที่ไม่มีบรรทัดเลย
ยังสร้างได้เหมือนเดิม — พฤติกรรมเดิมที่ไม่ได้ตั้งใจเปลี่ยนรอบนี้)

**ยกเลิก ≠ ลบ** — ลบคือบรรทัดที่ไม่เคยสั่ง (พิมพ์ผิด) ยกเลิกคือสั่งไปแล้วแต่ถอน ซึ่งยังต้องพิมพ์บนใบ
ให้ผู้ขายเห็น · ปุ่มทั้งสองจึงอยู่ด้วยกันบนหน้าแก้ไข ไม่ได้แทนที่กัน

⚠️ **ต้องย้อนการอนุมัติก่อนจึงจะยกเลิกบรรทัดบนใบที่อนุมัติแล้วได้** — `handleUpdate` ปฏิเสธใบที่ไม่ใช่
`Draft` เหมือนเดิม เป็นการแลกที่ถูกต้อง: ร่องรอยการอนุมัติถูกเก็บไว้ซื่อสัตย์ (ดูหัวข้อย้อนการอนุมัติ)

## ใบสั่งซื้อ — ย้อนการอนุมัติ (2026-09-21)

`POST /api/purchase-orders/:id/revert-approval` · `purchaseOrder:finalize` · body `{ reason? }`

เจ้าของข้อ 9: *"ใบ PO ถ้าถูกหัวหน้า Approve ไปแล้วสามารถย้อนได้โดยไม่ต้องกด Rewrite"*

**เป็น route ของใบสั่งซื้อเอง ไม่ได้ขยาย `handleWithdrawApproval`** — ตัวนั้นบังคับ `PendingApproval`
และใช้ร่วมกัน 6 โมดูล การคลายด่านตรงนั้นจะทำให้ถอนการอนุมัติใบสั่งผลิต/ใบเบิก/ใบสั่งงาน/Cost Control/
ใบขอซื้อ ได้ด้วย ซึ่งไม่มีใครสั่ง

ใช้ `purchaseOrder:finalize` **ไม่ใช่ `canEdit`** — คนที่อนุมัติได้คือคนที่ถอนได้ ถ้าใช้สิทธิ์แก้ไข
คนเปิดใบจะถอนลายเซ็นของหัวหน้าตัวเองได้

| กรณี | ผล |
|---|---|
| ใบไม่ใช่ `Final` | 400 |
| มีใบรับสินค้าที่ยังไม่ถูกลบ | 400 พร้อม `receivingReportId` ระดับบนสุดของ body ให้หน้าจอลิงก์ไปได้ (`1 PO = 1 RR` บังคับอยู่แล้ว `findOne` จึงครอบคลุม) |
| ผ่าน | `status: "Draft"` · ล้าง `approvedBy`/`approvedByUserId`/`approvedAt`/`rejectionComment` (ชุดเดียวกับที่ `handleRewrite` ล้าง) · ต่อท้าย `revisionNote` ว่าใครถอนเมื่อไรและเพราะอะไร — **แสดงบนใบพิมพ์ด้วย** |

**เลขที่เอกสารไม่เปลี่ยน** ต่างจาก Rewrite ที่ออก `-R{n}` ใหม่ · **การย้อนไม่ปลดล็อกบรรทัดของใบขอซื้อ**
เพราะใบสั่งซื้อยังอยู่ มีแต่การลบใบสั่งซื้อที่ปลด (ดู `purchasedPrLineIds()`) · การอนุมัติใหม่จะผ่าน
`beforeApprove` อีกครั้ง จึงตรวจผู้ขายกับทะเบียนซ้ำ

## ใบสั่งซื้อ — เลือกคนอนุมัติ (2026-09-21)

`PurchaseOrder.intendedApproverUserId` / `intendedApproverName` · **ไม่ใช่การล็อกสิทธิ์** —
เจ้าของเลือกไว้ตรง ๆ ว่า *แจ้งเตือนเฉพาะคนนั้น แต่คนอื่นที่มีสิทธิ์ยังกดอนุมัติได้* ด่านของ
`handleApprove()` จึงไม่ถูกแตะเลย ค่านี้มีผลที่เดียวคือ "ตอนส่งขออนุมัติ จะแจ้งใคร"

`PATCH` จัดการแยกจาก `SHORT_TEXT_FIELDS` และตรวจกับตารางผู้ใช้จริง (400 ถ้าไม่มีอยู่จริงหรือถูก
ปิดบัญชีแล้ว) — ถ้าปล่อยผ่านรายการข้อความธรรมดา มันจะกลายเป็นช่อง id อิสระที่ใครพิมพ์อะไรก็ได้
แล้วการแจ้งเตือนจะยิงไปหา id ที่ไม่มีอยู่จริงอย่างเงียบ ๆ

**`ApprovalConfig.submitNotification.recipients` (ใหม่, `documentApproval.ts`)** — resolver ที่คืน
`null` แปลว่า "กระจายตามสิทธิ์ตามเดิม" · เป็นการ**เพิ่มล้วน ๆ** อีก 5 โมดูลไม่ได้เซ็ตจึงทำงานเหมือนเดิม
ทุกประการ (`tests/api/approvalNotifications.test.ts` ยังเขียว) · คนที่เลือกไว้ถูกปิดบัญชี → คืน `null`
เพื่อถอยไปกระจายตามสิทธิ์ ดีกว่าส่งไม่ถึงใครเลย · คำเตือน "ไม่มีผู้รับ" แยกสองสาเหตุออกจากกันแล้ว

**`handleRewrite` พาสองฟิลด์นี้ไปฉบับใหม่ด้วย** ต่างจาก `approvedBy` ที่ถูกล้าง — อันนั้นคือ
ลายเซ็นหลังเกิดเหตุ อันนี้คือความตั้งใจก่อนเกิดเหตุ ซึ่งยังเป็นคนเดิม

## ทะเบียนผู้ขาย — ขั้นอนุมัติของบัญชี (2026-09-21, `api/_lib/vendorsHandler.ts`)

เจ้าของสั่ง: *"ทะเบียนผู้ขาย จัดซื้อกรอกข้อมูลรายละเอียดครบแล้ว นำส่งข้อมูลไปที่บัญชีให้บัญชีอนุมัติ
ก่อนเปิด PO สั่งซื้อ"* · **เขียน route เอง ไม่ได้ใช้ `documentApproval.ts`** เพราะ helper ตัวนั้นตรึง
`_id` เป็น string แต่ทะเบียนผู้ขายใช้ `ObjectId` ทั้งไฟล์

| Route | Permission | Notes |
|---|---|---|
| `POST /api/vendors/:id/submit-approval` | `vendor:create` หรือ `vendor:edit` | ได้เฉพาะ `draft`/`rejected` · ล้าง `rejectionComment` · แจ้งทุกคนที่ถือ `vendor:approve` |
| `POST /api/vendors/:id/approve` | `vendor:approve` | ได้เฉพาะ `pendingApproval` · เขียน `approvedByUserId`/`approvedByName` · แจ้งคนส่ง |
| `POST /api/vendors/:id/reject` | `vendor:approve` | ได้เฉพาะ `pendingApproval` · **บังคับ `comment`** (400 ถ้าว่าง) · แจ้งคนส่ง |

**`approvalStatus` ที่ไม่มีค่าอ่านเป็น `"approved"` เสมอ** ผ่าน `vendorApprovalStatusOf()` ตัวเดียว
ทั้งฝั่งอ่านและฝั่งด่าน — ผู้ขายที่บันทึกไว้ก่อน 2026-09-21 ไม่มีฟิลด์นี้เลย ถ้าอ่านเป็นอย่างอื่น
จัดซื้อจะอนุมัติใบสั่งซื้อไม่ได้เลยทั้งระบบในวันที่ deploy · ผู้ขายที่สร้างใหม่ตั้ง `"draft"` ชัดเจน

**`PATCH /api/vendors/:id` ที่แตะ `name`/`code`/`taxId`/`address` ทำให้สถานะตกกลับเป็น `"draft"`**
— ผู้ขายที่อนุมัติแล้วแต่เลขผู้เสียภาษีถูกเปลี่ยนเงียบ ๆ แย่กว่าความยุ่งยากที่ต้องส่งอนุมัติใหม่ ·
ช่องอื่น (ผู้ติดต่อ/โทร/หมายเหตุ/เปิด-ปิดใช้งาน) แก้ได้โดยไม่ตกสถานะ

**ด่านจริงอยู่ที่ `beforeApprove` ของใบสั่งซื้อ** ไม่ใช่ที่ PATCH — ร่างยังผูกผู้ขายที่ยังไม่ผ่านบัญชีได้
ตามที่เจ้าของเลือกไว้ ("สร้าง PO ร่างได้ แต่อนุมัติ PO ไม่ได้") · hook โยน error **ก่อน**สถานะเปลี่ยน
ใบจึงค้างที่ `PendingApproval` ไม่เสียหาย · ตรวจ 3 ชั้น: มี `vendorId` / ผู้ขายยังไม่ถูกเก็บถาวร-ปิดใช้งาน /
`approvalStatus === "approved"`

**`PurchaseOrder.vendorId` (ใหม่)** — คอมเมนต์ใน `src/lib/vendors.ts` สัญญาฟิลด์นี้ไว้ตั้งแต่ 2026-08-31
แต่ไม่เคยถูกเพิ่ม ใบสั่งซื้อจึงเก็บแค่ชื่อผู้ขายเป็นข้อความอิสระมาตลอด · `PATCH` จัดการแยกจาก
`SHORT_TEXT_FIELDS` และ**กู้ใบเก่าให้อัตโนมัติ**: เมื่อ `vendorName` เปลี่ยนแต่ไม่ได้ส่ง `vendorId` มา
(หรือส่งมาเป็นค่าว่าง ซึ่งเป็นสิ่งที่หน้าจอส่งเสมอสำหรับใบเก่า — `vendorId: ""` จึงไม่ถูกอ่านว่า "ตัดการผูก")
จะจับคู่กับทะเบียนแบบไม่สนตัวพิมพ์ และผูกให้เฉพาะเมื่อ**ตรงรายเดียวเป๊ะ** (เจอหลายรายการห้ามเดา —
เดาผิดแปลว่าใบไปผูกกับนิติบุคคลอื่น) · ถ้าไม่มีขั้นนี้ ใบร่างทุกใบใน production จะอนุมัติไม่ได้ทันทีวัน deploy

## ใบขอซื้อ — ขั้นของฝ่ายจัดซื้อ (2026-09-21, `api/_lib/purchaseRequestHandler.ts`)

ต่อจากขั้นสโตร์: **สโตร์ส่งต่อ → จัดซื้อแก้ไขจนตรงกับของที่ซื้อได้จริง → จัดซื้ออนุมัติ (ลงชื่อในช่อง
"ฝ่ายจัดซื้อ" + ล็อกทั้งใบ) → เปิดใบสั่งซื้อ**  เจ้าของแจ้งว่าใบที่อนุมัติแล้ว *"เป็น final แล้วทำอะไร
ไม่ได้เลย"* — `purchasingStage` คือฟิลด์ที่แก้เรื่องนั้น

เป็น**ฟิลด์ของเอกสาร ไม่ใช่สถานะที่ 4** ด้วยเหตุผลเดียวกับ `storeStage` ทุกประการ และ**แยกขาดจาก**
`storeStage` เพราะ `nextStoreStage()` คำนวณค่าใหม่ทุกครั้งที่สโตร์กดเช็คของ

| Route | Permission | Notes |
|---|---|---|
| `POST /api/purchase-requests/:id/purchasing-approve` | `purchaseRequest:editApproved` | `Final` เท่านั้น · `storeStage: "pending"` → 400 (ให้กด "ดึงมาที่จัดซื้อ" ก่อน) · อนุมัติซ้ำ → 400 · เขียน `purchasingStage: "approved"` + `purchasingApprovedByUserId` และเติม `purchasingDeptBy`/`At` **เฉพาะเมื่อยังว่าง** (ไม่ทับชื่อที่เจ้าหน้าที่พิมพ์เอง — กติกาเดียวกับ `handleApprove()`) · แจ้งผู้สร้างใบ |
| `POST /api/purchase-requests/:id/pull-to-purchasing` | `purchaseRequest:editApproved` | `Final` เท่านั้น · `storeStage` ต้องยังเป็น `"pending"` (`"forwarded"`/`"closed"` → 400) · ตั้ง `storeStage: "forwarded"` **ด้วย** ไม่ใช่แค่ `purchasingStage` เพราะด่านเปิดใบสั่งซื้อและชิปในหน้ารายการอ่านจากค่านั้น · **ไม่แตะบรรทัดเลย** — ทุกบรรทัดยังเป็น `storeDecision: ""` ซึ่งตัวกรอง `l.storeDecision !== "stock"` นับว่าต้องซื้อ บรรทัดจึงถูกลอกไปครบ · ต่อท้าย `storeRemark` และเก็บ `pulledToPurchasingBy/ByName/At` |
| `POST /api/purchase-requests/:id/purchasing-reopen` | `purchaseRequest:editApproved` | ต้องเป็น `"approved"` อยู่ก่อน · **มีใบสั่งซื้อที่ยังไม่ถูกลบอ้างใบนี้อยู่ → 400** พร้อมจำนวนใบ · กลับเป็น `"review"` และล้าง `purchasingApprovedByUserId` · **ไม่ล้าง** `purchasingDeptBy`/`At` เพราะเป็นข้อความบนฟอร์มที่กรอกเอง |

**ไม่มีสิทธิ์ใหม่และไม่มี migration** — `purchaseRequest:editApproved` (มีมาตั้งแต่ 2026-09-09)
แปลว่า "บทบาทฝ่ายจัดซื้อ" อยู่แล้ว

**`PATCH /api/purchase-requests/:id` ถูกล็อกเมื่อ `purchasingStage === "approved"`** (400) — ด่านนี้
เช็คค่าตรง ๆ **ห้ามเขียนเป็น "ไม่ใช่ review"** ไม่งั้นใบก่อน 2026-09-21 ทุกใบ (ซึ่งไม่มีฟิลด์นี้) จะถูก
ล็อกทันทีในวันที่ deploy

**`store-review` เขียน `purchasingStage: "review"` ให้เมื่อ `storeStage` กลายเป็น `"forwarded"`** และ
**เฉพาะตอนที่ใบยังไม่มีค่านั้น** — ไม่งั้นการกดเช็คของซ้ำหลังจัดซื้ออนุมัติไปแล้วจะรีเซ็ตขั้นทิ้ง (มีเทสต์ดัก)

**`handleRewrite` ล้าง `purchasingStage`/`purchasingApprovedByUserId` ทุกครั้ง** — มันใช้ `...rest`
ถ้าไม่ล้าง ฉบับแก้ไขจะเกิดมาพร้อม `"approved"` แล้วถูกล็อกทันทีที่หัวหน้าอนุมัติ ทั้งที่จัดซื้อยังไม่เคยเห็น
(มีเทสต์ดักไว้เช่นกัน)

