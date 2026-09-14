# RBAC

> **2026-09-09 — สิทธิ์ใหม่ `purchaseRequest:editApproved`** ("แก้ไขใบขอซื้อที่อนุมัติแล้ว (ฝ่ายจัดซื้อ)").
> เป็นสิทธิ์เดียวที่เปิดให้แก้เนื้อหาเอกสารที่ผ่านการอนุมัติไปแล้ว — เจ้าของสั่งเพราะชื่อ/ยี่ห้อที่ซื้อได้จริง
> มักไม่ตรงกับที่ผู้ขอพิมพ์ไว้ · แยกจาก `:edit` (คนเขียนใบ) และ `:finalize` (หัวหน้าผู้อนุมัติ) โดยตั้งใจ
> และ**ไม่ผูกกับความเป็นเจ้าของใบ** เพราะคนซื้อของไม่ใช่คนเขียนใบ · ทุกการแก้ถูกจดลง `purchasingEdits[]`
> บนเอกสาร เขียน audit log และแจ้งผู้สร้างใบ · สถานะ "รออนุมัติ" ยังล็อกทุกคนตามเดิม
> `RBAC_MIGRATIONS` แจกให้ `administrator` เท่านั้น — **บทบาทของฝ่ายจัดซื้อต้องติ๊กเองหนึ่งครั้ง**
> เช่นเดียวกับ `purchaseRequest:view` ของบทบาทสโตร์ ซึ่งจำเป็นสำหรับขั้น "สโตร์เช็คของ" (ดู TODO.md)
> **ป้ายสิทธิ์เปลี่ยนคำ 2026-09-02 — คีย์ไม่เปลี่ยน** · `:finalize` ทั้งเก้าโมดูลเคยเขียนว่า
> "ยืนยันสถานะ Final ของ…" ซึ่งอ่านเหมือนสิทธิ์กดบันทึก ทั้งที่คุมปุ่ม **อนุมัติ / ไม่อนุมัติ**
> ตอนนี้ป้ายอ่านว่า "อนุมัติ / ไม่อนุมัติ&lt;เอกสาร&gt;" และ `:edit` อ่านว่า "แก้ไขและบันทึก&lt;เอกสาร&gt;"
> **คีย์ของสิทธิ์ (`jobOrder:finalize` ฯลฯ) ไม่เปลี่ยน** สิทธิ์ที่ติ๊กไว้แล้วในฐานข้อมูลจึงไม่หลุด
> · `:finalize` ยังทำหน้าที่ที่สองอยู่เหมือนเดิมคือ "แก้/ลบเอกสารของคนอื่นได้" (`isOwnerOf || finalize`)
> ซึ่งป้ายใหม่ยังไม่ได้บอก — จดไว้ใน TODO.md (Role-Based Access Control)

## Store + AP permissions (2026-09-03)

Nine permissions shipped with the Store department's module set:

| Permission | Group | Granted by default to |
|---|---|---|
| `receivingReport:view` / `viewAll` / `create` / `edit` / `receive` / `print` / `delete` | คลังสินค้า | Super Admin, Administrator |
| `ap:view`, `ap:manage` | บัญชีลูกหนี้ | Super Admin, Administrator, `accounting_user` |

`receivingReport:receive` is deliberately **separate from `:edit`**: posting a receipt writes stock
movements and creates a payable, which is a materially different act from correcting the form number
in the document header. `:edit` covers the header; `:receive` covers posting and reversing rounds.

The split between the two families is also deliberate — Store receives the goods and posts the
payable, Accounting chases the payment. `accounting_user` therefore gets `ap:*` and **not**
`receivingReport:*`; neither role acquires the other half by default. Administrator gets both
because it must be able to reach every menu.

Shipped with the append-only migration **`store-ap-permissions-2026-09-03`** in
`api/_lib/rbacSeed.ts`, covered by `tests/api/rbacMigrations.test.ts`. Without a migration an
already-provisioned database would never gain these, and the new menu entries would be invisible to
everyone but Super Admin — the exact failure that hid the จัดซื้อ and BD nav groups for three days
(see "Rollout" below).

Team tools (`เครื่องมือประจำทีม`) deliberately added **no** permission — it reads the same stock
ledger and is gated on the existing `stock:view`.

---
## Current State: Real, Server-Enforced RBAC — Deployed and Live

As of 2026-07-09 this app's RBAC/user-management/approval-workflow/notification/audit-log system is **genuinely enforced server-side**, not a client-side simulation. Since the ~2026-08-07 cutover the app is deployed on a self-hosted VPS (own domain + HTTPS) running the standalone Express server against self-hosted MongoDB (the pre-cutover serverless demo is gone) — see [ARCHITECTURE.md](./ARCHITECTURE.md), [API.md](./API.md), [DATABASE.md](./DATABASE.md). The role/permission **model itself is unchanged** from the 2026-07-08 client-side build described further below — same 6 default roles, same 17-permission set, same UI. What changed is **where each check is enforced**:

- Every mutating API route calls `requireUser()`/`requirePermission()` (`api/_lib/auth.ts`) server-side, using the exact same `roleHasPermission()` function from `src/lib/roles.ts`, value-imported into the API layer (not reimplemented, not just mirrored). A client can no longer grant itself a permission, approve its own quotation, or write an audit log entry claiming to be someone else — the server checks the caller's real role, fetched fresh from MongoDB on every request, and rejects anything not allowed.
- Passwords are **real bcrypt hashes** (`bcryptjs`, cost 10) — the old `hashPassword()` non-cryptographic checksum is gone entirely, deleted, not just deprecated.
- Sessions are a **JWT in an httpOnly, secure, `sameSite=lax` cookie** (`tcs_erp_session`, 7-day **rolling** expiry — see below) — not a bare `localStorage` string. It cannot be read or forged by client-side JavaScript/devtools (httpOnly), and every request re-verifies it server-side and re-fetches the user's current `status`/`roleKey` from MongoDB, so a deactivated account is locked out on its very next request.
- **Rolling/sliding expiration (added 2026-07-31)**: `refreshSessionCookie()` (`api/_lib/auth.ts`) re-signs and re-issues the cookie with a fresh 7-day window on every request that carries a still-valid token — wired into `withErrorHandling()` (`api/_lib/http.ts`), the shared wrapper all 12 API entry files call. This is a per-request JWT re-sign only (no DB lookup), so it's cheap enough to run unconditionally. Net effect: a user who is active at least once every 7 days is never logged out; only 7 full days of *zero* requests lets the token reach its `exp` and force a re-login. Before this change, expiry was a fixed 7 days from login regardless of activity.
- All data (every account, every quote, every notification, the audit log) lives in a real shared MongoDB database, not one browser's `localStorage` — genuine multi-device, multi-session, multi-user support.

**What client-side permission checks (`hasPermission()`, sidebar filtering, button gating) remain**: exactly what they always were — a UX layer that hides controls a user shouldn't see. They are **not** the security boundary anymore (they never should have been treated as one, and now genuinely aren't): the server independently re-checks every mutation regardless of what the UI shows or hides. This is the correct, standard shape for a web app's RBAC (client = UX, server = enforcement) — no longer a "simulation" positioned to become that shape someday.

**Known, honest gaps** (not fixed, not hidden — see Known Gaps at the bottom of this file): API-route-level test coverage is still partial (the permission RULES now have real tests as of 2026-07-29, the per-route HTTP guards mostly don't — see Known Gaps), and no two-stage sequential approval (unchanged limitation from before, see Known Simplifications below). Login rate limiting was a long-standing member of this list until **2026-07-29** — now closed, see Known Gaps.

### What's actually built

**Bootstrap** (`src/pages/SetupWizardPage.tsx`): if `loadUsers()` returns an empty array, the app shows a one-time Initial Setup Wizard instead of the sign-in screen. It collects Full Name, Employee ID, Username, Email, Password, Confirm Password, and creates the first `User` with the `super_admin` role. Once any user exists, the wizard never renders again — there is no public self-registration (the old `SignUpPage.tsx` was removed); every other account is created by an admin via User Management.

**Users** (`src/lib/users.ts`): a `User` is both the employee record and the account — `employeeId`, `fullName`, `username`, `email`, `passwordHash`, `phone`, `department`, `position`, `roleKey`, `status` (`active`/`inactive`), `profilePictureDataUrl`, `signatureDataUrl`. `employeeId`/`username`/`email` are enforced unique. **Position and Role are deliberately separate fields** — Position is a free-text job title (with suggestions: CEO, Director, General Manager, Sales Manager, Sales Executive, Engineer, HR, Accounting, Purchasing, Warehouse) with no bearing on permissions; Role is the RBAC role, assigned independently by an admin.

**Roles & Permissions** (`src/lib/roles.ts`, `src/lib/permissions.ts`): a flat `Permission` union (64 keys as of 2026-08-14's Departments/Teams pass — this count is not kept in perfect sync with every module addition below; treat it as an order-of-magnitude reference, `ALL_PERMISSIONS.length` is authoritative) — `dashboard:view`; `quotations:view/viewAll/create/edit/delete/approve/reject/export` (`:viewAll` added 2026-07-22, see "Quotation Own-Quotes-Only Viewing" below); `products:view/create/edit/delete/export`; `users:manage`; `roles:manage`; `company:manage`; `auditLog:view`; `customers:view/create/edit/archive` (added 2026-07-14, see "Customers" below); `quotationTemplates:manage/view/create/edit/duplicate/activate/archive/import` (`:manage` added 2026-07-14, the other 7 granular ones added 2026-07-15, see "Quotation Templates" below); `scopeOfWork:view/viewAll/create/edit/finalize/print/delete` (`:viewAll` added 2026-07-23, see "Scope of Work Own-Records-Only Viewing" below; the other 6 added 2026-07-15, see "Scope of Work" below). (The union briefly had 27 keys, 2026-07-13–14, while `companyProfiles:view/create/edit/archive/delete/setDefault` existed for the now-removed Company Profiles module — see "Company Profiles" below.) **Eight** default `Role`s ship out of the box (seven from 2026-08-07 when `service_engineer` was
added, six before that — see "Service" below; `accounting_user` added 2026-08-17, see "Accounts
Receivable" below):

| Role | `isSuperAdmin` | `isSystem` | Summary |
|---|---|---|---|
| Super Admin | ✅ | ✅ (undeletable) | Every permission, always — `roleHasPermission()` short-circuits to `true` regardless of the stored list |
| Administrator | — | ✅ (undeletable) | Manage users + full quotation/product/customer CRUD + audit log view + full Quotation Template management (all 8 `quotationTemplates:*` permissions, `:manage` added 2026-07-14, the 7 granular ones added 2026-07-15) + full Scope of Work access (all 7 `scopeOfWork:*` permissions, incl. `:viewAll` added 2026-07-23) + all 4 `ar:*` permissions (added 2026-08-17) + both `stock:*` permissions (added 2026-08-18). No `roles:manage`/`company:manage`. |
| Sales User | — | — | Create/edit/export quotations + view/create/edit customers, no approve/reject/archive. Also `scopeOfWork:view/create/edit/print` — can create/edit a Scope of Work from a quotation they can access and print it, but not finalize or delete one. **Does not hold `quotations:viewAll` or `scopeOfWork:viewAll`** — only sees quotations/Scope of Work records it created itself (see the two "Own-Records-Only Viewing" sections below). Maps to the request's "Sales Executive." |
| Service Engineer | — | — | Added 2026-08-07. Runs a field-service job end to end: `service:view/create/edit/complete/print` + `serviceTemplates:view` (required — the report editor's boot fetch needs it) + `customers:view` + `dashboard:view`. **No `service:viewAll`** — own reports only, mirroring Sales User. No quotation/product/user access at all. See "Service" below. |
| Accounting User | — | — | Added 2026-08-17. Runs the AR billing workflow end to end: `ar:view/create/issue/cancel` (`:cancel` added 2026-08-18 — see "Accounts Receivable" below) + `scopeOfWork:view/viewAll` (must see every job company-wide to bill it, not just its own) + `customers:view/edit` + `dashboard:view` + both `stock:view`/`stock:adjust` (added 2026-08-18 — cuts stock against IV documents from the same dual-pane view they issue/print from, see "Stock" below). No quotation/product/user/service access at all — reaches `GET /api/products`/`GET /api/categories` (needed to pick a product to cut stock against) via `stock:view` alone, since it holds no `products:view`; see "Stock" below for how that's wired. |
| Approver Level 1 | — | — | View/edit/approve/reject quotations + view customers. Also `scopeOfWork:view/viewAll/edit/finalize/print` (no `:create`/`:delete` — edits/finalizes Sales' drafts rather than starting new ones; `scopeOfWork:viewAll` added 2026-07-23, alongside the pre-existing `quotations:viewAll` — an Approver must be able to see everyone's records to act on them). Also `ar:view/cancel` (added 2026-08-17 — oversight, not day-to-day issuing). Maps to "Sales Manager." |
| Approver Level 2 | — | — | Same rights as Level 1 in this build, including the same Scope of Work and AR grants (see Known Simplifications below). Maps to "CEO." |
| Viewer | — | — | `*:view` only (incl. `customers:view`, `scopeOfWork:view`, `ar:view` added 2026-08-17, `stock:view` added 2026-08-18), plus `quotations:viewAll`/`scopeOfWork:viewAll` — a read-only role that can't act on anything still needs to be able to *see* everything to be useful as a viewer. |

**No new permission was added for the 2026-07-10 Job Type / Executive Dashboard pass.** `GET /api/jobtypes` reuses `quotations:view` (already required to touch a quote); `POST`/`PATCH /api/jobtypes` reuse `company:manage` (Super Admin only, matching the existing precedent for company-wide configuration data like bank/VAT/T&C). `GET /api/dashboard` continues to reuse `dashboard:view`, which every default role already has — two of its response sections (`activityTimeline`, `approvalDashboard`) are additionally gated per-caller by the `auditLog:view`/`quotations:approve` the caller already has, rather than a new dashboard-specific permission.

**Dashboard tab ticks (added 2026-09-14).** Owner: *"ฝากทำสิทธิ์เรื่องหน้า dashboard ให้หน่อยว่าติ๊กให้เห็นแผนกไหนได้บ้าง"*. Nine permissions in the แดชบอร์ด group of Role Management: `dashboard:tabOverview`, `dashboard:tabSales`, `dashboard:tabService`, `dashboard:tabPurchasing`, `dashboard:tabInventory`, `dashboard:tabProduction`, `dashboard:tabProject`, `dashboard:tabBd`, `dashboard:tabAccounting` (ผลิต/โครงการ/BD are separate ticks inside the one combined tab). The owner chose both rules:
- **A tick is necessary, not sufficient.** A department's tab/block needs its tick **and** one of that department's existing document view permissions (`DASHBOARD_DOCUMENT_PERMISSIONS` in `src/lib/dashboardTabs.ts`), and its numbers still follow that document permission's own/team/all scope — a tick never shows a number the role couldn't already see. Each tick's label says which document permission it also needs.
- **ภาพรวม is tickable too.** Without it the page opens on the first ticked tab; with no visible tab at all the page shows an empty state pointing to Role Management. `dashboard:view` still gates the page itself.
- **Enforced server-side, same rule table as the tab bar:** `GET /api/dashboard` (sales numbers, also used by the overview's sales cards) → 403 without `canSeeDashboardTab("sales")`; `GET /api/dashboard/departments?dept=overview` → 403 without the overview tick; every department block and every "ต้องจัดการก่อน" item is `null`/omitted without its department tick. The overview's AR card is client-hidden without the บัญชี tick (the data itself is `ar:view`-gated and reachable from the accounting dashboard page anyway).
- **Nobody lost a tab on deploy.** RBAC migration `dashboard-tab-ticks-2026-09-14` is the first *derive* migration: instead of fixed `grants` per roleKey, it computes ticks from each role's current permissions (`dashboardTicksFromDocumentPermissions` in `src/lib/dashboardTabGrants.ts`) and applies them to **every** non-Super-Admin role, including customer-created roles with no fixed key — ภาพรวม + exactly the tabs its document permissions already opened, nothing more, and only for roles holding `dashboard:view`. Derive migrations run after all grants migrations in the same pass, so a database several migrations behind derives from the fully granted permissions. `defaultRoles` gets the same ticks through the same function, so a fresh install equals a migrated one. Runs once: a tick an admin removes stays removed.

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

### Service (added 2026-08-06, Phase 1; `service:print` added same day alongside photo attachments/print, pulled forward from the original Phase 2/3 roadmap)

11 permissions across two related-but-independent resources — a Service Report is created directly
against a Customer (not derived from a Quotation), so unlike Scope of Work/Delivery Order it does
**not** nest inside the "ใบเสนอราคา" (Quotations) `PERMISSION_GROUPS` entry; it gets its own
standalone "บริการ" group in Role Management instead:

| Permission | Gates |
|---|---|
| `service:view` | `GET /api/service-reports` (list — own-records-only without `:viewAll`) and `GET /api/service-reports/:id`. |
| `service:viewAll` | Scopes the list to everyone's records instead of own-created-only — same `{$or:[{createdBy},{createdBy:""}]}` idiom as Quotation/Scope of Work/Delivery Order. Single-record `GET` is deliberately unfiltered, same carve-out as every other document type. |
| `service:create` | `POST /api/service-reports`. |
| `service:edit` | `PATCH /api/service-reports/:id` (Draft-only) — combined with an **ownership** check (`canEditServiceReport()`: own record, or holds `service:complete`), same shape as Scope of Work's `canEditScope()`. Also gates the `reopen` status action and the photo upload/delete routes. |
| `service:delete` | `DELETE /api/service-reports/:id` (soft delete) — combined with the same ownership-or-`service:complete` check as edit. |
| `service:complete` | The manager/supervisor authority: `POST /api/service-reports/:id/status` with `action: "complete"` or `"cancel"`. Also, independent of ownership, lets a holder edit or delete *any* Draft record (the `canEditServiceReport()` override), same idea as `scopeOfWork:finalize`. |
| `service:print` | `POST /api/service-reports/:id/print` and gates the client's Print/Export button — no completeness gate, a Draft can be printed for review. |
| `serviceTemplates:view` | `GET /api/service-templates` (incl. the lazy first-request seed) and `GET /api/service-templates/:id`. |
| `serviceTemplates:create` | `POST /api/service-templates` and `POST /api/service-templates/:id/duplicate`. |
| `serviceTemplates:edit` | `PATCH /api/service-templates/:id`. |
| `serviceTemplates:archive` | `POST /api/service-templates/:id/archive`. |

Default grants: **Super Admin**/**Administrator** get all 11; **Approver Level 1/2** get view-only
plus **print** (`service:view/viewAll/print`, `serviceTemplates:view`) — Service Reports have **no
approval workflow in Phase 1**, so these roles get oversight + the ability to print what they can
see, not edit/complete rights; **Viewer** gets the same minus print (`service:view/viewAll`,
`serviceTemplates:view` only, matching its identical no-print treatment of every other module);
**Sales User** gets **none** — field-service maintenance is outside this seed role's defined duties.
**Service Engineer** (added 2026-08-07, see below) is the role that actually runs a service job.

#### Service Engineer (added 2026-08-07)

The 7th default role, and the first one added after the initial seed set. 8 permissions:
`dashboard:view`, `customers:view`, `serviceTemplates:view`, and
`service:view/create/edit/complete/print`.

- **No `service:viewAll`** — an engineer sees only reports they created, deliberately mirroring
  Sales User's own-quotes-only model. Change it in Role Management if the business wants engineers
  covering each other's jobs.
- **No `service:delete`** and **no `serviceTemplates:create/edit/archive`** — an engineer reads the
  master checklist templates but never edits them. (Per-report checklist customization is a
  different thing entirely: it edits that report's own frozen `templateSnapshot`, gated by
  `service:edit`.)
- **`serviceTemplates:view` is mandatory, not a nicety** — `ServiceReportEditor.tsx`'s boot
  `Promise.all` calls `fetchServiceTemplates()`, so a role with `service:create` but without it gets
  an editor that fails to load at all rather than one missing a template picker. `tests/
  permissions.test.ts` asserts this invariant across every default role.
- `isSystem: false`, so an admin can rename, re-scope or delete it (same as Sales User/Approver/
  Viewer; only Super Admin and Administrator are `isSystem`).

**Trimmed navigation (added 2026-08-07).** The standalone **Customers** admin page is hidden from a
field engineer's sidebar — managing customer master data isn't part of the job. This is
**presentation, not authorization**: `customers:view` remains granted and every server check is
unchanged. That permission is load-bearing — `ServiceReportEditor.tsx` fetches the customer list
through `CustomerSelector`, so revoking it would break report creation for exactly the role this
targets.

**Dashboard was hidden here too when this shipped, and was restored the same day (2026-08-07)** —
the "engineers should only see บริการ" instruction turned out to rest on unclear internal
communication. `dashboard:view` was granted throughout and never changed in either direction, so
the revert was a one-line nav-visibility change with no RBAC impact. Because the landing page is
derived from the first *visible* nav item, a Service Engineer now lands on the Dashboard again
rather than on "บริการ".

`ROLE_HIDDEN_NAV_KEYS` + `isNavHiddenForRole()`/`isNavHiddenForUser()` (`src/lib/roles.ts`) hold the
rule, applied in three places so the hiding is consistent rather than cosmetic:

1. **Sidebar** — `App.tsx`'s `visibleNavItems` filters on permission *and* hiding.
2. **Landing page** — `App.tsx` derives `homeNav` from the first visible nav item instead of a
   hardcoded `"dashboard"`, and `effectiveNav` falls back to it, so a role can never sit on a page
   it has no sidebar item to navigate back from. (This mattered while Dashboard was hidden; it's
   kept because it's the correct general rule, not a workaround for that one case — any future
   hidden entry gets it for free.) The URL hash mirrors `effectiveNav`, so a deep link to a hidden
   nav key resolves to the role's home instead.
3. **Global Search** — `searchHandler.ts` drops hidden entries from the `pages` category. This
   filters *menu shortcuts* only; business results (customers, quotations…) are untouched and still
   governed purely by permissions.

Scoped to `service_engineer` by key, deliberately — there's no second use case, and a rule inferred
from permissions ("any role with `service:create`") would silently reshape any future role that
happened to match. Consequences worth knowing: a role **cloned** from Service Engineer, or a custom
role built to be equivalent, does **not** inherit the hiding; renaming the role in Role Management
is safe (the `key` never changes); and deleting it simply makes the entry inert.

#### Permission dependencies (added 2026-08-07)

`serviceTemplates:view` isn't just a sensible companion to the Service grants — it is **required**
for them to work. `ServiceReportEditor.tsx`'s boot `Promise.all` calls `fetchServiceTemplates()`
unconditionally, for opening an existing report as much as for creating one
(`ServicePage.openReport()` mounts the same component), so a role holding `service:view`,
`service:create` or `service:edit` *without* it gets an editor stuck in a permanent error state —
not a missing button, a dead screen.

Rather than rely on every future role being written correctly by hand, that coupling is now
declared and enforced:

- **`PERMISSION_DEPENDENCIES`** (`src/lib/permissions.ts`) — `permission → permissions it can't work
  without`, plus `withPermissionDependencies()` (transitive expansion, stable order) and
  `permissionsRequiring()` (the inverse: what breaks if this is removed).
- **`sanitizeRolePermissions()`** (`src/lib/roles.ts`) — drops Super-Admin-only permissions, then
  auto-includes dependencies. Shared by the server and the UI so they cannot drift.
- **Server**: `POST /api/roles` and `PATCH /api/roles/:key` both run every submitted permission list
  through it. A direct API call that grants `service:create` alone comes back holding
  `serviceTemplates:view` too. Auto-include rather than `400`, matching the contract
  `isPermissionLockedToSuperAdmin()` has always had — the server silently normalizes submitted
  permission lists rather than rejecting them.
- **UI**: Role Management's matrix ticks the dependency the moment the parent is ticked, and pins
  it (disabled, lock icon, `title` naming what requires it) while any dependent is still held — so
  an admin can't make a change that the server would silently undo on save.

**The map is deliberately narrow.** It covers only "this screen's own boot fetch is gated by a
different permission and hard-fails". It is *not* a list of sensible pairings: `service:print`
without `service:view` is a merely-unreachable button, and folding cases like that in would start
silently overriding deliberate admin choices. Two nearby cases are correctly absent for concrete
reasons — `QuoteDocument`'s Scope of Work lookup and `ScopeOfWorkDocument`'s Delivery Order lookup
are client-gated *and* `.catch()` into a safe fallback; `GET /api/quotation-templates` accepts
`quotations:create` **or** `quotationTemplates:view` server-side, so the Create Quotation wizard
can't hit this failure mode at all.

**Known side effect, accepted**: `serviceTemplates:view` also gates the "Template รายงานบริการ"
sidebar item, so a role granted any Service permission will see that page (read-only — the
create/edit/archive actions have their own permissions). That was already true of every default
role holding `service:view`; the dependency map makes it true of custom roles too. The alternative
— making the editor tolerate a 403 on templates — is a deeper fix to `ServiceReportEditor.tsx`, not
a permissions-model change.

Covered by `tests/api/roleDependencies.test.ts` (creates real custom roles through the API) and the
dependency block in `tests/permissions.test.ts` (including a guard that no declared dependency is
itself Super-Admin-locked, which `sanitizeRolePermissions()` would filter straight back out).

#### Rollout: automatic now, not a manual Role Management pass (2026-08-07)

Every prior module (`scopeOfWork:*`, `deliveryOrder:*`, and initially `service:*`) shipped with a
"⚠️ a Super Admin must manually grant these on production" note, because
`seedDefaultRolesIfEmpty()` only ever fires on an *empty* `roles` collection — a provisioned
database's role documents are frozen at whatever existed on first run. That is now handled in code
(`api/_lib/rbacSeed.ts`), and this is the standing mechanism for every future permission:

- **`syncDefaultRoles()`** — inserts any `defaultRoles` entry whose `key` is missing (this is how
  `service_engineer` reaches an existing deployment). Purely additive; an existing role's
  permissions are never rewritten, so admin edits survive.
- **`applyRbacMigrations()`** — an append-only `RBAC_MIGRATIONS` list, each entry naming
  `roleKey → permissions to add`. Applied with `$addToSet`, **at most once per database ever**,
  recorded in the `rbac_migrations` collection (`_id` = migration id). The once-only property is
  the point: a permission an admin deliberately revokes in Role Management stays revoked, which a
  naive "re-sync defaults on every boot" would silently undo.
- **`bootstrapRbac()`** — runs both, guarded by a module-scoped flag so it costs one check per
  long-lived Express process. Called from `GET /api/roles` (the path every
  authenticated client hits on boot, and the only one that actually reaches a provisioned
  production database) and from the Setup Wizard, where it records the migrations as already-applied
  because freshly-seeded roles are current by definition.

The first migration, `service-permissions-2026-08-06`, grants exactly the Service sets listed above
to Administrator/Approver 1/Approver 2/Viewer, so a migrated database ends up identical to a freshly
seeded one. Covered by `tests/api/rbacMigrations.test.ts` (in-memory MongoDB), including the
"revoked stays revoked" property. **What is still a human decision**: which real employees get
assigned the Service Engineer role.

Audit logging: every action writes a server-side `AuditLogEntry` via `writeServiceAuditEntry()`,
module `"บริการ"`, with `relatedServiceReportId`/`relatedServiceTemplateId` fields — `userId`/
`userName`/`roleName` always come from the server's own `AuthContext`, never client input, same
non-forgeable convention as every other module.

### Accounts Receivable (added 2026-08-17 Phase 1; `ar:cancel` for Accounting User added 2026-08-18)

4 permissions, gating both the AR/milestone-billing engine and every page under the "บัญชี" sidebar
group (per-document-type list pages, the monthly summary, the Accounting Dashboard, the NCR print
calibration dialog — all of them reuse `ar:view`/`ar:issue`/`ar:cancel`, no page-specific permission
was added for any of them):

| Permission | Gates |
|---|---|
| `ar:view` | `GET /api/ar-milestones`, `GET /api/ar-documents` (incl. `docType`/`month`/`salesperson`-filtered list views), `GET /api/ar-documents/:id`, `GET /api/ar-dashboard`, and every "บัญชี" sidebar page's mere visibility (the 4 document-type pages, monthly summary, Accounting Dashboard). Also gates downloading checklist attachments. |
| `ar:create` | `POST /api/ar-milestones/open`, `PATCH /api/ar-milestones/:id`, `POST /api/ar-milestones/:id/refresh`, the checklist-attachment upload/delete routes, and — **together with** `ar:issue`, added 2026-08-18 — `POST /api/ar-documents/manual` (see below). |
| `ar:issue` | `POST /api/ar-documents` (issues the AR-or-IV + companion BI together), `POST /api/ar-documents/:id/receipt` (issues an RE against an already-issued AR/IV), and — **together with** `ar:create` — `POST /api/ar-documents/manual` (added 2026-08-18, freestanding AR/IV creation with no Scope of Work; see [MODULES/Accounting.md](./MODULES/Accounting.md) "Manual Tax Invoice Creation"). This is the first route in `arHandler.ts` requiring BOTH permissions rather than one — checked as `requirePermission(req, "ar:create")` then a plain `roleHasPermission(ctx.role, "ar:issue")` on the already-resolved role, not two separate `requirePermission()` calls (which would re-fetch the user from MongoDB twice for one request). |
| `ar:cancel` | `POST /api/ar-documents/:id/cancel` — a status-flip only, never a delete (see docs/DATABASE.md `ar_documents`). |

Default grants: **Super Admin**/**Administrator** get all 4; **Approver Level 1/2** get
`ar:view`/`ar:cancel` only (oversight + the ability to void a mistake, not day-to-day issuing);
**Viewer** gets `ar:view` only; **Sales User**/**Service Engineer** get none — AR is outside both
roles' defined duties. **Accounting User** (see below) is the role that actually runs AR billing.

#### Accounting User (added 2026-08-17)

The 8th default role. `ar:view/create/issue/cancel` (all 4 — the only default role besides
Super Admin/Administrator to hold every AR permission) + `scopeOfWork:view/viewAll` (must see every
job company-wide to bill it, not just its own — the one deliberate departure from a typical
Sales-side own-records-only role) + `customers:view/edit` + `dashboard:view`. No quotation/product/
user/service access at all — `isSystem: false`, so an admin can rename, re-scope, or delete it, same
as Sales User/Approver/Viewer.

**`ar:cancel` was missing from this role for its first day** (2026-08-17–18) — every *other* default
role touched by the AR migration got `ar:cancel`, but the role actually meant to issue documents day
to day couldn't cancel its own mistakes without escalating to an Administrator or Approver. Closed
2026-08-18 via a dedicated migration, `ar-cancel-for-accounting-user-2026-08-18` (see below) — a real
gap, not a deliberate design choice, unlike Approver 1/2's `ar:view/cancel`-only grant (which *is*
deliberate: oversight without day-to-day issuing rights).

Audit logging: every issue/cancel action writes a server-side `AuditLogEntry` via
`writeArAuditEntry()`, module `"บัญชีลูกหนี้"`, with `relatedScopeId`/`relatedScopeNumber` fields —
`userId`/`userName`/`roleName` always come from the server's own `AuthContext`, same non-forgeable
convention as every other module.

**RBAC catch-up** (same `syncDefaultRoles()`/`applyRbacMigrations()`/`bootstrapRbac()` machinery
documented under "Service" above): `accounting_user` itself reached an already-provisioned database
via `syncDefaultRoles()` (a brand-new role key, purely additive). Two `RBAC_MIGRATIONS` entries then
backfilled *existing* roles: `ar-permissions-2026-08-17` (Administrator/Approver 1/Approver 2/Viewer
gain their AR grants) and `ar-cancel-for-accounting-user-2026-08-18` (Accounting User itself gains
the `ar:cancel` it was missing). Both covered by `tests/api/rbacMigrations.test.ts` (in-memory
MongoDB), including the "revoked stays revoked" and "skips a deleted role" properties. **What is
still a human decision**: which real employees get assigned the Accounting User role.

### Stock (added 2026-08-18)

2 permissions, gating the new "สต๊อกสินค้า" page and Accounting's IV stock-cutting action:

| Permission | Gates |
|---|---|
| `stock:view` | `GET /api/stock-movements`, the Stock page's mere visibility, and — via `requireOneOfPermissions()` (see below) — `GET /api/products`/`GET /api/categories` for a role that holds no `products:view` of its own. |
| `stock:adjust` | `POST /api/stock-movements` (manual receive/deduct/adjust from the Stock page) and `POST /api/ar-documents/:id/stock-deduction` (cutting stock against an issued IV from `ArStockPanel.tsx`, Accounting's dual-pane view) — the two "actually changes `Product.stockQty`" actions. |

Default grants: **Super Admin**/**Administrator** get both; **Accounting User** gets both (cuts
stock against IV documents from the same screen it issues/prints from — see "Accounts Receivable"
above); **Viewer** gets `stock:view` only; every other default role (Sales User, Service Engineer,
Approver 1/2) gets neither — stock-cutting is Accounting's action, not theirs.

**`requireOneOfPermissions()` (`api/_lib/auth.ts`)**: `GET /api/products` and `GET /api/categories`
were, until this pass, strictly `products:view`-gated — which broke the Stock page (and
`ArStockPanel.tsx`'s product picker) for `stock:view`-only roles like Accounting User, who holds no
`products:view` at all. Fixed by adding `requireOneOfPermissions(req, permissions[])` — passes if the
caller holds ANY of the listed permissions — and gating those two GET routes on
`["products:view", "stock:view"]` instead of `products:view` alone; every other products/categories
route (create/edit/delete) is untouched. This is the first shared, reusable any-of check in
`api/_lib/auth.ts` — not the first in the codebase overall, though: `api/_lib/quotationTemplatesHandler.ts`
already has its own file-scoped `requireAnyPermission(ctx, permissions[])` (different signature) for
`GET /api/quotation-templates`'s "admin view OR picking-for-a-quotation" need. The two are unrelated
functions with a similar idea — deliberately given different names (`requireOneOfPermissions` vs.
`requireAnyPermission`) precisely so they don't read as the same abstraction. **This bug was not
caught during the feature's initial build**
— it shipped broken and was only found and fixed during live verification the same day; see
[CHANGELOG.md](./CHANGELOG.md) 2026-08-18 for the honest writeup of how that happened.

Audit logging: `POST /api/ar-documents/:id/stock-deduction` writes a server-side `AuditLogEntry` via
the existing `writeArAuditEntry()` (module `"บัญชีลูกหนี้"`, action `"AR Stock Deducted"`) — a manual
receive/deduct/adjust from the Stock page itself does not write an audit entry (it's already
self-documenting via the `stock_movements` ledger's own `reason`/`createdBy` fields, the same
"the ledger IS the audit trail" reasoning the collection's own doc comment in `collections.ts` gives
— see [DATABASE.md](./DATABASE.md) "`StockMovement`").

**RBAC catch-up**: no new role key was added (`stock:*` was folded into the existing default roles
above, not a 9th role), so only `applyRbacMigrations()` was needed — `stock-permissions-2026-08-18`
grants Administrator/Accounting User both permissions and Viewer `stock:view` only. Covered by
`tests/api/rbacMigrations.test.ts` (in-memory MongoDB), same "revoked stays revoked"/"skips a deleted
role" properties as every prior migration.

### Departments + Teams + Tiered Visibility (added 2026-08-14)

Direct business request: Sales has 2 teams, each with its own team lead — a lead should see only
their own team's records, not the other team's (a correction mid-build from an initial "one
manager oversees both teams" framing, which would have needed the department tier, not the team
tier — both exist, the org just doesn't currently need the department one). Two related pieces:

**Departments become a real manageable entity.** The `departments` MongoDB collection existed
since 2026-07-09 but was schema-only, seeded with 7 generic Thai names, never wired to
`User.department` or exposed in any UI — that note is now stale. `GET/POST/PATCH /api/departments`
(mounted inside `api/handlers/roles.ts`, see API.md) plus a new admin page
(`src/pages/admin/DepartmentManagementPage.tsx`, gated by the new `departments:manage` permission)
let a Super Admin create/rename/archive departments. **A new `teams` collection** (sub-grouping
within a department — `{ name, departmentId, isActive }`) is managed inline on the same page, gated
by a new `teams:manage` permission. `User.department` stays free text (unchanged join to
`Quote.salesperson`, still exactly what the Dashboard's department filter dropdown already uses) —
User Management's department `<select>` now sources from the real collection instead of the
hardcoded `DOCUMENT_RECIPIENT_DEPARTMENTS` list (which is untouched and still drives Scope of
Work's document-recipient routing, an unrelated concern). `User.teamId` is a new field, set via a
second `<select>` scoped to whichever department is currently chosen in the form. Both
`departments:manage`/`teams:manage` are in `SUPER_ADMIN_ONLY_PERMISSIONS`, the same class as
`roles:manage`/`company:manage` — org-structure configuration, not day-to-day data.

**Visibility gains two new tiers, generalized beyond Sales.** The existing binary `X:view` (own
only) / `X:viewAll` (everyone) model for Quotations, Scope of Work, and Delivery Order — the three
modules a Sales team actually touches — now has two more permissions each:

| Permission | Sees |
|---|---|
| `{module}:view` | Own records only (unchanged baseline) |
| `{module}:viewTeam` | Every record created by someone sharing the caller's `User.teamId` (new) |
| `{module}:viewDepartment` | Every record created by someone sharing the caller's `User.department` (new) |
| `{module}:viewAll` | Every record company-wide (unchanged) |

`{module}` is `quotations`, `scopeOfWork`, or `deliveryOrder` — 6 new permissions total. **No new
default role was added** — custom roles already support arbitrary permission combinations with zero
code changes, so the actual "Sales Team 1 Lead"/"Sales Team 2 Lead" roles (each holding
`quotations:viewTeam` + `scopeOfWork:viewTeam` + `deliveryOrder:viewTeam`, **not**
`viewDepartment`) are created by a Super Admin via Role Management once this deploys — same
"manual Role Management step" every prior permission-adding pass has needed, see TODO.md. The
`viewDepartment` tier exists for the general case (e.g. a role that legitimately should see an
entire department across multiple teams) but nothing in this pass grants it by default.

**Shared cascade helper** — `buildOwnershipClause()`/`resolveVisibilityScope()`
(`api/_lib/visibility.ts`, new file): `viewAll` (return `{}`, unfiltered) → `viewDepartment`
(resolve every user sharing `ctx.user.department`, matched by exact string — same free-text join
Dashboard already uses) → `viewTeam` (resolve every user sharing `ctx.user.teamId`) → own record
only. A caller with a view-tier permission but no matching `department`/`teamId` set on their own
account (e.g. `viewTeam` without ever being assigned to a team) falls through to own-only rather
than erroring or matching nothing usefully. Legacy/seed records with an empty owner field stay
visible at every tier — unchanged from the pre-existing `viewAll`-only behavior. Replaces the
3 near-identical own-vs-viewAll ternaries that previously lived in `api/handlers/quotes.ts`,
`api/_lib/scopeOfWorkHandler.ts`, and `api/_lib/deliveryOrderHandler.ts`; Scope of Work's own
"named as a document recipient" `$or` branch (see "Scope of Work" above) is merged alongside the
cascade's result, not replaced by it.

**Dashboard (`GET /api/dashboard`)** now resolves the same cascade instead of a binary
own-vs-viewAll check: the response's `ownDataOnly: boolean` is joined by a new
`visibilityScope: "own" | "team" | "department" | "all"` field. The salesperson/department picker
is hidden only at the `"own"` tier now (previously hidden for any non-`viewAll` caller) — a
team/department-tier viewer has more than one visible salesperson, so the picker is now genuinely
useful to them instead of pointless. The "showing limited data" banner text is tier-specific
("your data only" / "your team's data only" / "your department's data only"). The Sales Activity
timeline's own-tier `userName` match (audit entries are keyed by name, not id) now resolves the
visible peer set from the already-loaded department/team-annotated user list rather than being
hardcoded to the caller's own name.

Covered by `tests/api/visibility.test.ts` (in-memory MongoDB): the 4-tier cascade's actual query
results (not just the Mongo operator shape), the team-vs-department priority order, the per-module
isolation (a `scopeOfWork:viewTeam` grant doesn't leak into `quotations`' resolution), and the
no-team/no-department fallback-to-own behavior.

### Project module (added 2026-08-18, Stage 2 data layer + Stage 3 API routes)

28 permissions gate the module end-to-end, **enforced server-side as of Stage 3** in
`api/_lib/projectHandler.ts`/`materialRequisitionHandler.ts`/`jobOrderHandler.ts`/
`purchaseRequestHandler.ts` (never just hidden client-side — there is no client yet):
`project`/`materialRequisition`/`jobOrder`/`purchaseRequest`, each with the same 7-permission shape
Scope of Work/Delivery Order established — `:view`/`:viewAll`/`:create`/`:edit`/`:finalize`/`:print`/
`:delete`. No `:viewTeam`/`:viewDepartment` tiers (unlike Quotation/Scope of Work/Delivery Order's
2026-08-14 tiered-visibility addition) — not requested for this module, and the departments it
actually serves (Project/Store/Factory/Purchasing) don't currently have the team-lead-style structure
Sales does. The company-wide list routes use a new `buildSimpleOwnershipClause()` (`api/_lib/
visibility.ts`) instead of the tiered `buildOwnershipClause()` every other module uses, precisely
because this module has no `:viewTeam`/`:viewDepartment` permissions for the tiered cascade to check.

**Default grants: Administrator/Super Admin only.** None of the existing default roles (Sales User,
Approver Level 1/2, Viewer, Service Engineer, Accounting User) belong to the Project/Store/Factory/
Purchasing departments this module serves, so none were extended — unlike every prior module, which
grants at least view access to some existing default role. Real custom roles (e.g. "เจ้าหน้าที่โครงการ",
"พนักงานสโตร์", "เจ้าหน้าที่จัดซื้อ") should be created via Role Management once the module is
functional, same "manual Role Management step" every prior module has needed on an
already-provisioned deployment — except this time there's no *existing* role to backfill either, so
there's no `rbac_migrations` entry to write yet (that only makes sense once a route actually checks
these permissions).

See [DATABASE.md](./DATABASE.md) "Project module" for the full data-model writeup and the
Products-catalog-reuse / Delivery-Order-vs-ใบส่งมอบงาน decisions.

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

`QuoteStatus` (`src/lib/quotes.ts`) has 9 values: `ร่าง` (Draft) → `รออนุมัติ` (Pending Approval) → `อนุมัติแล้ว` (Approved) → `ส่งให้ลูกค้าแล้ว` (Sent to Customer) → `ลูกค้ายอมรับ` (Customer Accepted) → `ปิดการขายสำเร็จ` (Won), or `ลูกค้าปฏิเสธ` (Customer Rejected) → `เสียโอกาส` (Lost); plus a standalone `ยกเลิก` (Cancelled) reachable from Draft/Pending/Approved. `workflowTransitions` encodes the state machine (`{action: {from: QuoteStatus[], to: QuoteStatus}}`). `computeQuotePermissions(quote, isNew, currentUser, roles)` derives which action buttons a given user may see for a given quote, combining permission checks with an **ownership** check (`quote.createdByUserId === currentUser.id`, with approvers/admins allowed to touch quotes they don't own) — this remains client-side, display-only logic. `POST /api/quotes/:id/workflow` independently re-derives and re-checks the same permission + ownership rule server-side via `isWorkflowActionAllowed()` (`api/_lib/quoteWorkflow.ts`, a deliberately duplicated copy of `workflowTransitions`/`ApprovalAction` from `quotes.ts` — see [ARCHITECTURE.md](./ARCHITECTURE.md) for why it's a duplicate, not an import) and validates the requested transition's `from` state against the quote's actual current status in MongoDB before applying it — a devtools-triggered call to approve a quote you don't have permission for, or to skip a status, is rejected with a `403`/`400` server-side, not just hidden client-side. Every transition appends an `ApprovalHistoryEntry` (`userId`, `userName`, `roleName`, `action`, `comment`, `createdAt`, all server-derived from the authenticated session) to `Quote.approvalHistory` — **never removed, only appended**, rendered on the document as "ประวัติการอนุมัติ." Reject/Customer-Reject/Cancel require a non-empty comment via a modal; other transitions allow an optional one.

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

Before the 2026-07-09 migration, this file described a hypothetical "Phase 2" (Next.js/Prisma/Postgres/Auth.js) design as the only way to get real server-enforced RBAC. That specific stack was never built (see [ARCHITECTURE.md](./ARCHITECTURE.md) "Superseded" section) — but the *goal* it described (server-side enforcement, real password hashing, real session revocation) **was achieved**, via a different, simpler stack (a Node.js REST API + MongoDB). Comparing point-by-point:

| Old proposal | What actually shipped (2026-07-09) | Equivalent? |
|---|---|---|
| Roles: fixed 9-value `RoleKey` enum (`SUPER_ADMIN`, `ADMIN`, `MANAGER`, `SALES`, `ACCOUNTING`, `WAREHOUSE`, `PURCHASING`, `HR`, `EMPLOYEE`) | The existing 6-role set (Super Admin, Administrator, Sales User, Approver Level 1/2, Viewer) — unchanged, stored as MongoDB documents in the `roles` collection, seeded from `defaultRoles` | **Not adopted** — the 9-role enum was never built; the simpler 6-role set was kept as-is and migrated to MongoDB unchanged |
| Permissions: granular DB-stored keys (e.g. `"admin.users.manage"`) via a `RolePermission` many-to-many join, admin-regrantable without a deploy | The existing flat 17-key `Permission` TypeScript union (`src/lib/permissions.ts`), with each role's `permissions: Permission[]` stored as an array field on its MongoDB document | **Partially equivalent** — permissions are admin-regrantable via Role Management without a deploy (the goal was met), but the permission *keys themselves* are still a hardcoded TypeScript union, not admin-creatable rows; adding a wholly new permission still requires a code change |
| Protected routes: `middleware.ts` session check + `requirePermission()` in every server action, unbypassable by URL or devtools | `requireUser()`/`requirePermission()` (`api/_lib/auth.ts`) in every mutating API route handler, same effect | **Equivalent** — genuinely unbypassable server-side enforcement, just implemented as per-route guards in the API handlers instead of Next.js middleware + Server Actions |
| Sidebar: one `can()` function imported both client- and server-side | Client: `hasPermission()`/`userIsSuperAdmin()` (`src/lib/roles.ts`) filters the sidebar, display-only. Server: `roleHasPermission()` (same file, same logic, different exported name) is value-imported into `api/_lib/auth.ts` and used for real enforcement | **Equivalent in spirit** — one shared source of truth for the permission-checking *logic*, imported into both the client bundle and the server functions, so the two can't drift out of sync — just two exported function names (`hasPermission` client-facing wrapper, `roleHasPermission` the shared core) rather than one identical `can()` |
| Passwords: bcrypt, cost factor 12, server-side only | bcrypt (`bcryptjs`), **cost factor 10**, server-side only (`api/_lib/auth.ts`) | **Equivalent in kind, lower cost factor** — real bcrypt hashing either way; 10 vs. 12 is a deliberate-or-default tradeoff not explicitly revisited during migration, worth a look if login latency budget allows raising it |
| Sessions: database-backed (Auth.js + Prisma adapter), chosen specifically so disabling a user force-invalidates their session immediately | **JWT** in an httpOnly/secure/`sameSite=lax` cookie, 7-day rolling expiry — **and, since 2026-08-31, database-backed after all**: the token carries a `sid` claim naming a row in `sessions`, checked on every request | **Practically equivalent, mechanically different**: every request re-fetches the user fresh from MongoDB and checks `status === "active"` (`getAuthContext()`), so a deactivated user is locked out on their very next request, matching the old proposal's user-facing goal. **Since 2026-08-31 it is real session revocation too**: the `sid` row is checked on every request, so revoking it (which a second login does automatically) invalidates that token immediately — the gap described here until then, that a stolen still-valid JWT could not be killed before its natural expiry, is closed. See [MODULES/Auth.md](./MODULES/Auth.md) "One account, one device". What remains missing is an admin-facing button; the mechanism only needs `revokedAt` set. |
| `SUPER_ADMIN`/`ADMIN` rows read-only in the permission-matrix UI | Only Super Admin is fully read-only; Administrator's permissions/description are editable (name locked, undeletable) — both client and server independently enforce this per-field lock, not a blanket `isSystem` read-only (see the system-role-locking note above; a bug that over-locked Administrator entirely was found and fixed 2026-07-09) | **Exceeded** — the old proposal only specified blanket UI-level protection for both system rows; the real implementation is more precise (Administrator stays configurable) and adds an independent server-side guard the proposal didn't explicitly call for |
| Every sensitive mutation writes an `AuditLog` row via a shared helper | `logAudit()` → `POST /api/audit-log`, server-derives the actor identity, append-only, no update/delete route | **Exceeded** — the old proposal didn't specify actor-spoofing protection; the real implementation added it (server never trusts client-claimed identity) |

## Known Gaps (honest, current, not hidden)

- ~~**No rate limiting on `POST /api/auth/login`**~~ — **closed 2026-07-29**: failed attempts are tracked in the `login_attempts` MongoDB collection (TTL-purged) and counted over a 15-minute sliding window — ≥5 failures for one identifier, or ≥20 from one IP, → `429` with a Thai retry-in-X-minutes message + `Retry-After` header. A successful login clears that identifier's failures; a correct-password-but-suspended attempt neither records nor clears (so a lockout can't be reset by hammering a known-suspended account). The check runs before the bcrypt compare, keeping locked-out requests cheap. See `api/handlers/auth.ts` and CHANGELOG.md.
- ~~**No true session revocation**~~ — **closed 2026-08-31.** Sessions are now database-backed: the JWT carries a `sid` claim naming a row in `sessions`, and `getAuthContext()` refuses a token whose row is missing or `revokedAt`. It arrived as a side effect of the owner's "1 user จำกัดเข้าได้แค่ 1 คน" (2026-08-28) — logging in revokes the user's other sessions — but the mechanism is general: setting `revokedAt` on a row kills that token on its next request. What is still missing is a **UI** for an admin to press. See [MODULES/Auth.md](./MODULES/Auth.md) "One account, one device". The original wording follows for the record:
  ~~No true session revocation — see the Sessions row above. A stolen, still-valid JWT is not immediately invalidated by an admin action (only future requests from a *deactivated* account are blocked; a still-active account's leaked token remains usable until natural expiry — and since 2026-07-31 expiry is **rolling** on activity, so a leaked token that's actively replayed by an attacker keeps extending itself indefinitely rather than dying after a fixed 7 days. Still low risk in practice, since the token is httpOnly and never exposed to XSS-readable JS, but worth knowing this widens the pre-existing gap slightly).~~
- **API-layer test coverage is partial** — **first real tests landed 2026-07-29** (`tests/`, 55 vitest tests, run by CI): the pure permission rules (default-role grants, `roleHasPermission`/`hasPermission` edge cases, `computeQuotePermissions` ownership logic, the workflow state machine + per-action authorization) and a full `/api/auth/login` integration test (bcrypt/JWT/rate limiting against an in-memory MongoDB) are covered. Every OTHER route's HTTP-level guard (`requirePermission()` per handler, ownership checks, last-active-Super-Admin guards) is still only manually verified — the login test's harness is the template to extend. See [TODO.md](./TODO.md).
- **Sequential two-level approval** (Approver Level 1 must approve before Level 2 can) is still not implemented — unchanged limitation from the pre-migration build, see Known Simplifications above. This was never blocked on the backend migration; it's a product decision, not a security gap.
- **bcrypt cost factor is 10**, not the 12 originally proposed — not necessarily wrong (10 is bcryptjs's own reasonable default), but not a value that was deliberately chosen during migration either; worth a conscious revisit.
- ~~**A MongoDB Atlas database-user password was pasted into an AI chat session** during this migration's development.~~ — **moot as of the ~2026-08-07 server migration, confirmed 2026-08-17**: production no longer uses MongoDB Atlas at all — see [TODO.md](./TODO.md) High Priority for the resolved item and the follow-up note about the self-hosted MongoDB's own root credentials.
- **`GET /api/users`/`GET /api/roles` are open to any authenticated user**, not gated by `users:manage`/`roles:manage` — flagged Medium by the 2026-07-10 Codex review, re-assessed rather than blindly restricted (see the comments in `api/handlers/users.ts`/`roles.ts`): role documents carry no PII so there's no privacy tradeoff there, and the user directory's PII fields (phone/email/pictures/signatures) are genuinely relied on app-wide (printed-quote signatures, salesperson pickers) in ways that would need a full consumer trace before safely narrowing — tracked as a business-decision item in [TODO.md](./TODO.md) rather than guessed at.
- **Quote payload validation was added 2026-07-10** (`api/_lib/quoteValidation.ts`) closing a real gap where `POST`/`PATCH /api/quotes` and the workflow-draft merge previously copied client fields into MongoDB with no type/bounds/date checking and trusted a client-supplied `amount`/`jobTypeName` — this was an authorization-adjacent data-integrity gap (an *authorized* caller could corrupt business data or the Dashboard's totals), not a bypass of who's allowed to write, which was already correctly enforced.

### Not carried over from the superseded proposal

A few pieces of the old Next.js/Prisma design were never built and have no equivalent today — listed here so a future reader doesn't assume they exist:

- **Per-module `manifest.ts` + `module-registry.ts` sidebar declaration pattern** — the sidebar is still the same flat `navItems` array in `App.tsx` filtered by `hasPermission()`, unchanged by the migration.
- **`departmentScope(user)` data-level scoping for a `MANAGER` role** — no `Department` entity or manager-scoped query filtering exists. The only data-level scoping in this app remains the much narrower **ownership** check on quotations (`Quote.createdByUserId`), now enforced both client- and server-side (see Quotation Approval Workflow above).
- **9-role `RoleKey` enum** and any notion of per-department role splits — the 6-role set was kept as-is (see the comparison table above).

None of the above exists in this repo. Do not write code that assumes a `Department` collection, a `manifest.ts`/`module-registry.ts` pattern, or a 9-role enum exists. `hasPermission()`/`userIsSuperAdmin()`/`roleNameFor()`/`roleHasPermission()` in `src/lib/roles.ts` are the real, working, shared-client-and-server implementation for everything RBAC-related today.

## Production Order + document approval (added 2026-08-20)

**7 new permissions**, `productionOrder:` `view` / `viewAll` / `create` / `edit` / `finalize` /
`print` / `delete`, shown under a **"ผลิต"** group in Role Management. Granted to
Administrator/Super Admin only by default — the same precedent the Project module set, since the
Production department has no existing default role either. A real production role should be created
via Role Management.

**`:finalize` is now the approve/reject permission**, not just a "mark it Final" one. Across
Material Requisition, Purchase Request, Job Order and Production Order the workflow is:

| Action | Who |
|---|---|
| ส่งขออนุมัติ (`submit-approval`) | anyone who can edit the document (`:edit` + owner, or `:finalize`) |
| อนุมัติ (`approve`) / ไม่อนุมัติ (`reject`) | `{document}:finalize` |
| ถอนกลับมาแก้ (`withdraw-approval`) | anyone who can edit the document — deliberately **not** gated on `:finalize`, so a submitter can always retract their own request |

The approving user is recorded server-side in `approvedByUserId`; the printed `approvedBy` name field
is only auto-filled when blank, so it never overwrites what staff typed on the form. This means the
audit trail cannot be forged by editing the form field.

**Per-department visibility**: Material Requisition and Purchase Request are additionally split by
`ownerDepartment`, so the Project and Production departments never see each other's records even
with `:viewAll`. This is a *data-scoping* filter in the list query, layered on top of the existing
`buildSimpleOwnershipClause()` own-vs-viewAll check — not a permission of its own.

⚠️ **The two clauses must be combined with `$and`, never object-spread.** Both return a top-level
`$or`, so `{ ...ownershipMatch, ...departmentClause }` silently drops the ownership half and exposes
every user's documents to anyone holding plain `:view`. That exact leak shipped in `bf6cb76` and was
caught by the review in `2026-08-20i`; the fix carries a comment saying why. Any future filter that
also produces a `$or` has the same hazard.

## Delivery Order department routing (added 2026-08-20)

Adds **no new permission**. A delivery note ticked through to a department becomes visible to every
active user whose `User.department` matches, on top of whatever `buildOwnershipClause()` already
grants them — merged into the same `$or`, never spread over it (see the warning above).

Two things this deliberately does *not* do:
- It never grants mutation. Recipients are view + print only, enforced by a dispatcher-level guard
  that fires even if their role holds `:edit`/`:finalize`/`:delete`, because the document belongs to
  the issuing department. The creator is exempt.
- It does not use `DOCUMENT_RECIPIENT_DEPARTMENTS`. That hardcoded list drives Scope of Work's
  person-level picker and **shares no value** with the real `departments` collection that
  `User.department` comes from. Routing sources only from the real collection — see
  [MODULES/DeliveryOrder.md](./MODULES/DeliveryOrder.md) "Department Routing" for why, and for the
  data setup this depends on.

A Production/Project role that should only *receive* delivery notes needs just `deliveryOrder:view`
+ `deliveryOrder:print`.

### Known gap: `GET /api/<doc>/:id` is not ownership-scoped

Single-document reads across Material Requisition, Purchase Request, Job Order and Production Order
check only `{doc}:view` — they do **not** apply `buildSimpleOwnershipClause()`. A user without
`:viewAll` sees a filtered *list*, but can still fetch any document by id, and ids are sequential
(`MR-2569-0001`, `SC-2026-08-009`) and therefore guessable. This predates the Production work and is
consistent across all four modules, so it was left alone rather than changed unilaterally — it is
logged in [TODO.md](./TODO.md) High Priority for an explicit decision, since tightening it would
change behaviour for existing users who share document ids between themselves.


## Product Request permissions (added 2026-08-27)

4 permissions — `productRequest:view` / `:viewAll` / `:create` / `:review` — in the **"คลังสินค้า"**
permission group. Granted to Administrator/Super Admin in `defaultRoles`, which affects **fresh
installs only**.

🔸 **No `RBAC_MIGRATIONS` entry was written**, per the owner's 2026-08-25 decision to tick new
permissions by hand in Role Management rather than have migrations added unasked. An
already-provisioned database — including production — therefore needs the boxes ticked manually.

**Granting these correctly is what makes the feature mean anything**: `:create` goes to every
department that needs to request materials; `:review` goes to **Stores only**, because `:review` is
the permission that allows assigning a product code. Handing `:review` to everyone would defeat the
"can request, cannot assign a code" rule the business asked for.

`:review` also implies seeing every request (the list handler treats it like `:viewAll`) — Stores
cannot approve what it cannot see.

## Purchasing permissions (added 2026-08-28)

**7 permissions** — `purchaseOrder:` `view` / `viewAll` / `create` / `edit` / `finalize` / `print` /
`delete` — shown under a new **"จัดซื้อ"** group in Role Management.

21 were added on 2026-08-28; the 14 belonging to ใบตรวจรับสินค้า and ใบรับวางบิล were removed the
same day with those modules, out of all five permission tables and out of `defaultRoles`. A role
already saved in MongoDB that carries one of the 14 dead strings is not broken — the string is simply
inert until that role is next saved (same as the Company Profiles removal).

`purchaseOrder:finalize` is the approval — the shared ร่าง→รออนุมัติ→อนุมัติ engine, so it gates
reject as well.

🔸 **No `RBAC_MIGRATIONS` entry was written**, following the same 2026-08-25 decision the Product
Request module recorded above: new permissions go into `defaultRoles` (Administrator/Super Admin),
which affects **fresh installs only**, and an already-provisioned database — production included —
needs the boxes ticked by hand in Role Management.

No `PERMISSION_DEPENDENCIES` entries were added either. That table is only for the case where a
page breaks permanently because its boot fetch needs a different permission; it is not a list of
"permissions that ought to go together", and `tests/api/roleDependencies.test.ts` enforces that
reading. The genuine cross-module checks in this module are enforced **in the handlers** instead:
creating a ใบสั่งซื้อ from a ใบขอซื้อ also requires `purchaseRequest:view` — without that, a create
button doubles as a way to read a document the caller cannot open.

**Who should get what.** `purchaseOrder:*` belongs to the Purchasing department.
`purchaseRequest:create` is now worth granting **department-wide**, since 2026-08-28 made it
possible for a department with no project access to raise one at all.

The nav group hides itself when a role holds none of the view permissions in it
(`items.length === 0` returns `null` in `App.tsx`), so a role without these never sees a จัดซื้อ
heading with nothing under it.

## Cost Control permissions (added 2026-08-28)

**7 permissions** — `costControl:` `view` / `viewAll` / `create` / `edit` / `finalize` / `print` /
`delete` — shown under a new **"BD"** group in Role Management.

`costControl:finalize` is the approval on the shared ร่าง→รออนุมัติ→อนุมัติ engine, so it gates
reject as well. The real paper form has *Submitted by* and *Approved by* signature lines, which is
why this document has an approval flow at all.

🔸 **No `RBAC_MIGRATIONS` entry**, following the same 2026-08-25 decision every module since has
used: the permissions go into `defaultRoles` (Administrator/Super Admin), which affects **fresh
installs only**, and the live database needs the boxes ticked by hand.

**Who should get what.** Cost Control carries the company's cost figures on every job, so
`:viewAll` is the sensitive one — grant it to BD and management, not to whoever merely needs to
raise a document. The nav group hides itself when a role holds no `costControl:view`.

### A third visibility path: recipients of the linked Scope of Work (2026-08-31)

Until 2026-08-31 a Cost Control was visible two ways only — you created it, or you hold
`costControl:viewAll`. The owner then asked for the document to travel with its Scope of Work
(*"Scope of work เวลาที่จะส่งไปให้คนอื่น มันจะมาพร้อมกับ Cost control ด้วย"*), which needs a third:

> **you are picked as a document recipient of the Scope of Work that this Cost Control's
> `scopeOfWorkId` points at.**

Three things worth knowing before touching it:

1. **It grants sight, not power.** A caller who is only a recipient gets `403` on every write route
   — PATCH, DELETE, rewrite, and all four approval routes — **even if their role holds
   `:edit`/`:finalize`/`:delete`**. Enforced by `assertNotScopeRecipientOnly()` as a single
   chokepoint on the router, the same shape as Delivery Order's department-recipient rule. Without
   it, a recipient whose role happens to carry `:finalize` could edit the document outright, since
   `canEdit()` lets any `:finalize` holder edit anything.
2. **It grants nothing to a role without `costControl:view`.** This feature hands out no
   permission. If Purchasing/Project/Factory should see cost figures, someone has to tick that box
   in Role Management — a decision about who sees costs, which belongs to the owner, not to the
   feature.
3. **It must be applied everywhere the module filters visibility**, or a document becomes listed
   but unsearchable. Both call sites go through `buildCostControlVisibilityClause()`
   (`api/_lib/visibility.ts`): the module list, and Global Search (both its general query and its
   document-number fast path). Note the guard inside it — with `:viewAll` the ownership clause is
   `{}` with no `$or`, and merging into that would *narrow* an all-seeing user down to their own
   Scopes.
