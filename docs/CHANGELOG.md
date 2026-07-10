# Changelog

> Append-only. Never delete or rewrite previous entries — correct forward with a new entry instead.

---

## 2026-07-10 — Code review pass on the Executive Dashboard/Job Type commit: 10 real bugs found and fixed

**Scope**: a mandatory full-codebase review of the previous commit (`d38bf61`, the Executive Dashboard/Job Type feature), requested before treating that feature as done. Ran a 10-angle multi-agent review (line-by-line, removed-behavior, cross-file, language-pitfall, wrapper-correctness, reuse, simplification, efficiency, altitude, CLAUDE.md-conventions) against `git diff @{upstream}...HEAD`, verified the highest-signal candidates directly against the actual code, and fixed everything confirmed as a real correctness or regression bug. `npx tsc --noEmit` (both configs), `npm run lint`, and `npm run build` all pass clean after every fix below.

**Bugs found and fixed**:
1. **Timezone bug in every new date computation** (`src/pages/dashboard/dateRanges.ts`, `api/dashboard/index.ts`'s `todayIsoDate()`/`periodEnd()`/`lastNMonthKeys()`): mixing a locally-constructed `Date` with `.toISOString()` (UTC) shifted every date boundary back a day for Thailand (UTC+7) — confirmed empirically (Node + `TZ=Asia/Bangkok`) by one reviewer. Every preset ("Today," "This Month," etc.) and the server's own notion of "today" were affected, not an edge case. Fixed by rewriting all date math to shift by a fixed +7h offset once, then read back exclusively via UTC getters/`Date.UTC` — correct regardless of the browser's or Vercel's actual configured timezone, rather than depending on either matching Thailand's.
2. **Filter-coverage gap**: `revenueByMonth` and `monthlyClosingRate` (feeding 3 charts) never applied the salesperson filter, contradicting the shipped docs' claim that every section respects the dashboard filters. Fixed — both now respect the salesperson filter; deliberately still ignore the date-range filter (a trailing-12-month trend chart collapsed to a single day defeats its purpose), matching the follow-ups panel's existing, documented rationale for the same asymmetry. `forecast.historicalWinRate` deliberately stays company-wide-only (a smaller single-salesperson sample would make the forecast noisier, not more accurate) — now stated explicitly in a comment instead of looking like an oversight.
3. **`overdueFollowups` KPI disagreed with the Follow-Up Reminders panel** directly below it on the same screen, since the KPI was computed from date-filtered quotes while the panel deliberately isn't. Fixed: the KPI now reuses the panel's own `followUps.overdue.length` instead of a separate, differently-scoped computation.
4. **Dashboard got stuck on the loading skeleton forever if the fetch failed** — the pre-rebuild code had a `stats?.kpis ?? {zeros}` fallback that the rebuild dropped in favor of `if (!stats) return <DashboardSkeleton />`, with the error silently swallowed by `.catch(() => {})`. Added a real error state with a retry button.
5. **A narrow date filter with zero results hid the entire dashboard**, even with years of real history, because the page-level empty-state gate used the *filtered* `kpis.totalQuotations` instead of an unfiltered signal. Backend now returns a dedicated `hasAnyData: boolean` (unfiltered `quotes.estimatedDocumentCount() > 0 || totalProducts > 0`), decoupled from the correctly-filtered KPI numbers.
6. **Falsy-zero display bugs**: `avg()` returning `0` for both "no data yet" and "a genuine same-day/0% result" made `averageApprovalTime`/`averageClosingTime`/`avgClosingTime`/monthly win rate indistinguishable from "no data" in the UI (some widgets showed a misleading "0.0 days," others hid a real 0% month behind the empty state). Fixed at the source: `avg()` now returns `number | null` (`null` = no data), threaded through the relevant types end-to-end, with a shared `fmtDaysOrDash()`/`fmtPercentOrDash()` helper so every widget renders "—" only for genuinely absent data.
7. **`Quote.jobTypeName` snapshot was silently overwritten on every save/reopen**, defeating its own documented purpose (renaming a Job Type must not rewrite historical quotes) — `QuoteDocument.tsx` was re-deriving the display name live from the current `jobTypes` list via `jobTypeCode` lookup instead of reading the quote's persisted `jobTypeName`. Worse: if a job type's `code` itself was ever renamed, the lookup would silently return nothing and blank the field on an existing quote. Fixed: `jobTypeName` is now its own piece of state, seeded from `quote.jobTypeName` and updated only by an explicit dropdown change.
8. **Dashboard pipeline/follow-up click-through silently lost its filter** the first time a user opened any one quote from the filtered list and clicked Back. Root cause: `QuoteList` (the actual filter consumer) remounts on every internal `QuotationPage` view toggle (list ↔ detail), but the App-level filter was already nulled out by a mount-effect that fired well before that remount. Fixed by snapshotting the filter into `QuotationPage`'s own local state once (stable for its whole mount lifetime), decoupled from telling `App.tsx` it can forget its copy.
9. **`job_types` seed race + missing index in production**: the unique index on `code` only lives in `ensureIndexes()`, which — like every other index — never runs again on an already-provisioned deployment, so concurrent first requests to the empty collection could both pass the `count === 0` check and both insert, silently duplicating all 13 defaults with nothing to reject them. Fixed: `seedJobTypesIfEmpty()` now creates the unique index itself (self-healing, same precedent as its own defensive re-seed call) before checking/inserting, turning the race into a safe, ignorable duplicate-key error instead of silent duplicate data.
10. **`QuotationListFilter` lived in a page component** (`DashboardPage.tsx`) and was imported backward into `App.tsx` and the Quotation module — violates `docs/CLAUDE.md`'s "types belong in `lib/<domain>.ts`" rule, flagged independently by two review angles. Moved to `src/lib/quotes.tsx`.

**Also fixed** (smaller, safe): a `.trim()` crash risk if a legacy quote document is missing `client`/`salesperson` entirely (normalized once when the filtered quote set is built, rather than risking a 500 for every dashboard viewer over one bad document); a duplicate `clientNames`/`clientsInFilteredSet` computation (now computed once); a redundant `countDocuments` in the notification summary (derived from the `find()` result instead); a missing field projection on that same `find()`; the interest-breakdown widget's triple `.filter()` scan wrapped in `useMemo`.

**Deliberately not fixed this pass** (found, judged lower-value-per-risk, explicitly noted rather than silently dropped — see TODO.md): the `salesPerformance`/`customerAnalytics`/`jobTypeAnalytics` O(n·k) grouping pattern (re-filters the full quote set once per distinct key) — fine at this app's actual data volume, a genuine one-pass `groupBy` refactor would add risk for negligible real benefit; several small reuse/duplication findings (a repeated percentage-rounding formula, a hand-rolled card wrapper in 2 files that could use the already-extracted `ChartCard`, a duplicated "no data" empty-state markup in 5 files, a second color palette, `SalesPerformanceTable`'s sort UX not matching `ProductList.tsx`'s existing toggle pattern); the `escapeRegExp()` duplication in `api/handlers/jobtypes.ts` (continues a pattern already duplicated 3× before this change, in `auth.ts`/`categories.ts`/`roles.ts` — fixing it properly means touching pre-existing files outside this diff's scope); a pre-existing, not-introduced-by-this-diff discovery that `src/lib/quotes.tsx`'s `todayIso()` has the *same* timezone bug as finding #1 (used as the default `issueDate` on a brand-new quote) — flagged in TODO.md, not fixed here since it's pre-existing code outside this diff, not a regression this pass introduced.

**Files Modified**: `api/dashboard/index.ts`, `api/_lib/systemSeed.ts`, `src/pages/dashboard/dateRanges.ts`, `src/pages/dashboard/DashboardPage.tsx`, `src/pages/dashboard/format.ts`, `src/pages/dashboard/KpiGrid.tsx`, `src/pages/dashboard/SalesPerformanceTable.tsx`, `src/pages/dashboard/ApprovalDashboard.tsx`, `src/pages/dashboard/DashboardCharts.tsx`, `src/lib/dashboard.ts`, `src/lib/quotes.tsx`, `src/pages/quotation/QuoteDocument.tsx`, `src/pages/quotation/QuotationPage.tsx`, `src/pages/quotation/QuoteList.tsx`, `src/App.tsx`, `src/lib/i18n.tsx`.

---

## 2026-07-10 — Executive Dashboard, Sales Analytics & Job Type

**Scope**: user requested a full BI rebuild of the Dashboard ("real business intelligence... not only simple statistics") plus a Job Type master data classification and a "Potential Opportunity" sales flag on every quotation. This was scoped and planned before implementation (see the plan file discussion) into: (1) the data-model foundation on `Quote` + a new `job_types` collection, (2) the dashboard backend rebuild, (3) the dashboard frontend rebuild — with Report Export (PDF/Excel/CSV) and building real Lead/Customer entities explicitly deferred as separate follow-ups, per the user's own choice among the presented options.

**Job Type master data**: new `job_types` MongoDB collection (`code`, `name`, `isActive` + audit fields), seeded with 13 defaults (TA, STA, LI, SC, BF, GA, BI, VT, WTP, OTHER TA, OTHER SC, OTHER BF, OTHER) via `seedJobTypesIfEmpty()` (`api/_lib/systemSeed.ts`). New `api/handlers/jobtypes.ts` (`GET/POST/PATCH /api/jobtypes`) — the 10th serverless function, still under Vercel Hobby's 12-function cap. Because production already exists past the one-time Setup Wizard (where `ensureIndexes()`/seeding normally run), `GET /api/jobtypes` defensively re-seeds on every call — the same self-healing precedent `GET /api/roles` already used for `seedDefaultRolesIfEmpty()`. No new `Permission` was added: `GET` reuses `quotations:view`, `POST`/`PATCH` reuse `company:manage` (Super Admin only, matching the existing bank/VAT/T&C precedent).

**Quote gains three fields**: `jobTypeCode`/`jobTypeName` (snapshotted from Job Type at save time — same non-live-reference rationale as the Product picker), `isPotentialOpportunity` (checkbox), `followUpDate`. Wired into `QuoteDocument.tsx` (new dropdown/checkbox/date input), `QuoteList.tsx` (Job Type filter + column, Potential Opportunity summary card, a dismissible client-name filter chip for Dashboard click-through), and `PrintDocument.tsx` (Job Type printed, Thai-only per that file's existing convention; Potential Opportunity/Follow-up Date are internal-only, not printed).

**Dashboard backend** (`api/dashboard/index.ts`) rebuilt in place (not a new function): accepts `?from=&to=&salesperson=` query params; almost every new section fetches the filtered `quotes` set once (small projection) and reduces it in plain JS rather than a dozen fine-grained aggregation pipelines — deliberate, matching the pre-existing `revenueByMonth`/`categoryBreakdown` style and appropriate at this data volume (no `dashboard_cache`/`analytics_cache`/`forecast` collections were built — computed live instead). New response sections: expanded KPIs (~20, up from 7), `pipeline` (with a real workflow-predecessor-aware conversion % — see bug note below), `salesPerformance`, `customerAnalytics`, `jobTypeAnalytics`, `forecast` (live weighted estimate), `followUps`, `monthlyClosingRate`, `activityTimeline` (null unless the caller has `auditLog:view`), `approvalDashboard` (null unless `quotations:approve`), `notificationSummary`, `availableSalespeople`.

**Bug caught during self-review, fixed before shipping**: the sales pipeline's stage-to-stage "conversion from previous" initially used simple array-adjacency (each stage compared against the row above it in display order). The real workflow branches — Sent to Customer leads to *either* Customer Accepted *or* Customer Rejected, not a single line — so array-adjacency would have shown a nonsensical conversion percentage for the Customer Rejected/Lost branch (e.g. "conversion from Won" for a status that isn't actually downstream of Won). Fixed with an explicit `PIPELINE_PREDECESSOR` map mirroring `workflowTransitions` in `api/_lib/quoteWorkflow.ts`.

**Dashboard frontend**: `DashboardPage.tsx` split from one file into 13 files under `src/pages/dashboard/` (`DashboardFilterBar`, `KpiGrid`, `PipelineFunnel`, `SalesPerformanceTable`, `JobTypeAnalytics`, `CustomerAnalytics`, `ActivityTimeline`, `FollowUpReminders`, `ApprovalDashboard`, `NotificationSummary`, `DashboardCharts` + `ChartCard`, `format.ts`/`dateRanges.ts` helpers), per the project's "split into `pages/<module>/` once it grows past one file" convention. 9 charts total (added Quotation Trend, Sales by Employee, Revenue by Job Type, Status Donut, Win/Lose Donut, Expected Sales Forecast, Monthly Closing Rate to the pre-existing Revenue Trend and Products-by-Category). ~80 new i18n dictionary keys (Thai + English).

**Click-through, not full deep-linking**: a lightweight `quotationListFilter` (`{status?, client?}`) was lifted to `App.tsx` so clicking a pipeline stage or a follow-up reminder opens a pre-filtered quotation list — consumed exactly once per fresh visit via a `useRef` guard (not a `[]`-deps effect, to stay `react-hooks/exhaustive-deps`-clean while `onFilterConsumed`'s identity changes every `App.tsx` render). This is **not** the full per-quote deep-linking gap tracked separately in TODO.md (`QuotationPage`'s `view`/`selectedId` state still isn't lifted) — a smaller, scoped version was built instead.

**A real lint error was hit and fixed along the way**: calling `setLoading(true)` synchronously at the top of the data-fetching `useEffect` (to show a spinner during filter-driven refetches) tripped `react-hooks/set-state-in-effect` (a real perf footgun — cascading renders — not a style nit). Fixed by moving the `setLoading(true)` call into the filter-change event handler instead, so the effect itself only calls `setState` inside its async `.then()`/`.finally()` callbacks.

**Verification status**: `npx tsc --noEmit` (both root and `tsconfig.api.json`), `npm run lint`, and `npm run build` all pass clean. **Not yet verified against live data in a browser** — no local MongoDB credential was available and no safe non-production test environment existed in that session (writing test data via the UI would have hit the same production database serving real users). See PROJECT_STATUS.md "In Progress" for what's needed to close this out.

**Files Modified/Added**: `api/_lib/collections.ts` (`JobTypeFields`), `api/_lib/systemSeed.ts` (`DEFAULT_JOB_TYPES`/`seedJobTypesIfEmpty`), `api/handlers/jobtypes.ts` (new), `api/handlers/quotes.ts`, `api/dashboard/index.ts` (rebuilt), `vercel.json`, `src/lib/quotes.tsx`, `src/lib/jobTypes.ts` (new), `src/lib/dashboard.ts` (rebuilt), `src/lib/i18n.tsx`, `src/App.tsx`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,PrintDocument}.tsx`, `src/pages/dashboard/*` (13 files, mostly new).

---

## 2026-07-09 — Incident: i18n follow-up briefly broke all authenticated API routes in production

**What happened**: the "translate the rest of the app" follow-up added `import { translate } from "./i18n"` (a real value import, not `import type`) to `src/lib/apiClient.ts`, to translate two rare fallback error strings. `apiClient.ts` is transitively value-imported into the Vercel serverless bundle: `api/_lib/auth.ts` value-imports `roleHasPermission`/`findRole` from `src/lib/roles.ts` (used on **every** authenticated request via `getAuthContext()`), and `roles.ts` itself value-imports `apiFetch` from `apiClient.ts`. `i18n.tsx` is a JSX/React module that was never part of the Node function build output, so the moment this shipped, every authenticated route (`/api/auth/session`, `/api/products`, `/api/quotes`, everything) started returning `500 Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/lib/i18n'`. Caught within ~3 minutes via a Playwright console-error check, not by the build (both `tsc` projects compiled cleanly — TypeScript has no way to know a same-repo module is JSX-incompatible at the Node runtime target; this is a deploy-time/runtime-only failure mode).

**Fix**: reverted `apiClient.ts` and `session.ts` to NOT import anything from `./i18n` — both now carry their own tiny inline bilingual string (reading `localStorage.tcs_erp_lang` directly), duplicated rather than shared, specifically to guarantee zero import-graph connection to the React/JSX module tree from any file reachable from `src/lib/roles.ts`, `src/lib/users.ts`, `src/lib/products.ts`, or any other `src/lib/*` file that's value-imported into `api/`.

**Standing rule going forward**: any `src/lib/*.ts(x)` file may be transitively value-imported into the `api/` serverless bundle (the existing pattern for shared types/defaults/pure helpers — see `defaultRoles`, `ALL_PERMISSIONS`, `nowIso`, etc.). Before adding a new **value** import (not `import type`) to any `src/lib/*` file, check whether that file is reachable from `api/_lib/auth.ts`, `api/_lib/collections.ts`, `api/_lib/systemSeed.ts`, `api/_lib/rbacSeed.ts`, or any `api/handlers/*.ts` — if so, the new dependency must not itself pull in `src/lib/i18n.tsx`, `src/components/*`, or anything else JSX/React-only, even transitively. `import type` is always safe (erased at compile time); a plain `import { x }` is not.

---

## 2026-07-09 — Translate the rest of the app's Thai UI (full i18n follow-up)

**Scope**: the initial production-readiness pass explicitly scoped `src/lib/i18n.tsx` to only Dashboard + empty states + the toggle itself. This follow-up (user-requested, after the initial toggle appeared to "not do anything" outside Dashboard) wires essentially every remaining page's UI chrome to the same dictionary: sidebar nav + topbar + user menu (`App.tsx`), login/setup pages (`AuthLayout`/`SignInPage`/`SetupWizardPage`), `NotificationBell`, all 4 Settings tabs, the entire Products module (list/form/categories/picker modal), the entire Quotation module's screen editing UI (list/document/line-items/interest buttons — **not** `PrintDocument.tsx`, see below), and the entire Admin module (Users/Roles/Audit Log). ~450 dictionary keys total.

**Real bug found and fixed along the way**: navigation state (`App.tsx`'s `activeNav`) was keyed off the display label text itself (`activeNav === "ใบเสนอราคา"`), not a stable identifier. Translating the labels without fixing this would have silently broken routing the moment a user switched language mid-session. Introduced a `NavKey` union (`"dashboard" | "quotations" | ...`) decoupled from the translated label, with a `NAV_LABEL_KEYS` lookup for display. The same category filter pattern (translated display text also used as internal comparison state) was found and fixed in `QuoteList.tsx` and `ProductList.tsx` (both now use a stable `"all"` sentinel instead of the localized "ทั้งหมด" string).

**Design decision — deliberately still Thai-only, not a gap**:
1. **Persisted data/seed content**: audit log entries, notification title/description/module text, default role/department/position descriptions, `Company` default values. These are business records or admin-editable content written once (often server-side) and read back later — translating them live would mean either re-translating historical records on every render (wrong — a Login event from last Tuesday shouldn't change wording retroactively) or storing translations for every record (real scope creep, not requested). Matches the same reasoning already applied to `App.tsx`'s `moduleForAction()` in the original pass.
2. **`PrintDocument.tsx`**: the actual printed/PDF quotation handed to customers. Kept Thai regardless of the toggle — a real business document for Thai customers shouldn't silently switch language based on the preparer's own UI preference.

**New**: `translate()` in `src/lib/i18n.tsx` — a non-hook lookup (reads `localStorage` directly) for the two genuinely user-facing error strings that live in plain functions rather than components (`apiClient.ts`'s generic HTTP-failure message, `session.ts`'s login-failure fallback). Confirmed neither file is ever imported by the `api/` serverless layer, so pulling in a `.tsx` module client-side only is safe.

**Also added**: `PERMISSION_LABEL_KEY` + per-group `labelKey` to `permissions.ts` (translated display labels for the Role Management permission matrix; the Thai `PERMISSION_LABELS` used to seed the `permissions` collection is untouched).

**Files Modified**: `src/lib/i18n.tsx` (dictionary + `translate()`), `src/App.tsx` (NavKey refactor), `src/pages/AuthLayout.tsx`, `src/pages/SignInPage.tsx`, `src/pages/SetupWizardPage.tsx`, `src/components/NotificationBell.tsx`, `src/components/ConfirmDialog.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/products/{ProductsPage,ProductList,ProductForm,CategoriesManager,ProductPickerModal}.tsx`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,LineItemsEditor,InterestButtons}.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`, `src/pages/dashboard/DashboardPage.tsx` (interest widget), `src/lib/quotes.tsx` (`statusLabelKey`/`approvalActionLabelKey`/`interestLabelKey`), `src/lib/permissions.ts` (`PERMISSION_LABEL_KEY`), `src/lib/apiClient.ts`, `src/lib/session.ts`.

---

## 2026-07-09 — Fix: Administrator role incorrectly locked read-only in Role Management

**Bug**: `RoleManagementPage.tsx` routed to a fully read-only view whenever `role.isSystem` was true, and `api/handlers/roles.ts` rejected any `PATCH`/`DELETE` under the same `isSystem` check. Both "Super Admin" and "Administrator" have `isSystem: true`, so Administrator's permission checkboxes and description were locked identically to Super Admin — even though `Role`'s own doc comment says system roles should only have their name/Super-Admin-flag locked, not their permissions.

**Fix**: both client and server now key the edit lock off `isSuperAdmin` specifically (only Super Admin is fully read-only), while the delete lock and the name-field lock stay keyed off `isSystem` (Administrator's name still can't change, and it still can't be deleted — but its description/permissions are editable like any custom role). See [RBAC.md](./RBAC.md) "System-role locking" for the precise rule.

**Files Modified**: `api/handlers/roles.ts` (`handleOne`: split the single `isSystem` guard into a `PATCH`-time `isSuperAdmin` check + a `DELETE`-time `isSystem` check, and gated the `name` field update on `!target.isSystem`), `src/pages/admin/RoleManagementPage.tsx` (`startEdit` now checks `isSuperAdmin` not `isSystem`; added a `nameLocked` flag distinct from `readOnly`; added a lighter "name locked" badge for system-but-editable roles; Pencil button tooltip now reflects `isSuperAdmin`), `docs/RBAC.md`.

---

## 2026-07-09 — Production-readiness pass: branding, real Dashboard, MongoDB schema prep, dead-code removal, i18n

**Scope**: a full production-readiness pass covering official branding, removing every fake/demo data source, preparing the MongoDB schema for planned future modules, and basic Thai/English internationalization — requested as a single large task, executed in phases (each verified with a clean `npm run build`/`npm run lint` before moving to the next).

**Branding**: added the official logo (`public/logo.png`, 500×500 RGBA PNG with real transparency, verbatim from the source file — not redesigned) and one new shared component, `src/components/BrandMark.tsx` (props: `size`, `variant: "mark"|"full"`, `theme: "dark"|"light"`), replacing 6 independently copy-pasted inline "gold square + Thai ท character" placeholder blocks that had drifted in size/corner-radius over time: sidebar header (`App.tsx`, expanded/collapsed states — also fixed a real layout bug where the collapsed sidebar never actually centered the icon, just clipped the text via `overflow-hidden`), login page desktop + mobile brand marks (`AuthLayout.tsx`), and the quote/print document fallback headers (`QuoteDocument.tsx`/`PrintDocument.tsx`, only when no `company.logoDataUrl` is uploaded — the admin-uploadable company letterhead logo is a separate, untouched concept). Favicon (`index.html`) switched from an inline SVG data-URI with a Latin "T" (inconsistent with the Thai "ท" used everywhere else) to the real logo PNG. The 3 previously-blank (`<div className="min-h-screen bg-background" />`) boot/loading screens now show the logo (`App.tsx`'s new `BootLoading()`).

**Dashboard — full rewrite, zero fake data remains**: `src/pages/dashboard/DashboardPage.tsx` previously rendered 100% hardcoded static data (4 KPI cards, a 12-month revenue/expenses chart, a category-revenue donut, a 5-person fake sales leaderboard imported from `src/lib/salesTeam.ts`, a 7-row fake orders table with fake company names, and a 6-item fake activity feed — none backed by a real Orders/Accounting/HR module). All of it is deleted. New `GET /api/dashboard` endpoint (`api/dashboard/index.ts`, gated by `dashboard:view`, the app's 10th live serverless function, still under Vercel Hobby's 12-function cap) computes real KPIs (Total Customers, Total Leads, Total Quotations, Total Products, Revenue, Won Deals, Lost Deals — Won/Lost map to the existing `ปิดการขายสำเร็จ`/`เสียโอกาส` quote statuses, `เสียโอกาส` only, not `ลูกค้าปฏิเสธ`), a 12-month zero-filled monthly revenue chart (grouped from real `Quote.issueDate`, no time-series collection invented), and a real products-by-category breakdown (deliberately reframed from "revenue by category," since `QuoteLine` has no `categoryId` reference back to `Product` and joining by name would be unreliable). New `src/lib/dashboard.ts` client wrapper. The two previously-dead buttons ("ส่งออกรายงาน"/"+ สร้างคำสั่งซื้อ") and the sections with no real backing model (sales leaderboard, orders table, activity feed) were **removed outright** rather than empty-stated, since there's no real collection behind any of them — an empty state for a nonexistent module would just be a different flavor of placeholder.

**MongoDB schema prep**: added 15 new collections to `api/_lib/collections.ts` with real indexes (`permissions`, `sessions`, `departments`, `positions`, `customers`, `customer_contacts`, `leads`, `lead_activities`, `product_templates`, `quotation_comments`, `quotation_tags`, `notification_types`, `system_settings`, `uploads`, `attachments`) — schema/index scaffolding ahead of the features that will use them, per explicit request ("prepare every collection before new features are implemented"); most have no API routes or UI yet, see [DATABASE.md](./DATABASE.md) for which. Two collections requested by name were deliberately **not** built as separate collections, with the reasoning documented in DATABASE.md: `quotation_items` (stays embedded as `Quote.lines`) and `quotation_status_history` (redundant with the existing embedded `Quote.approvalHistory`, which already records every status transition). Retroactively added real indexes to the 8 already-live collections too (`products`, `categories`, `quotes`, `notifications`, `audit_log` had none beyond default `_id` before this). New `api/_lib/systemSeed.ts` (idempotent, mirrors the existing `rbacSeed.ts` pattern) seeds only system/config data on first-run setup — permissions (from the existing `ALL_PERMISSIONS` union), a generic department/position starter list, notification types, and default system settings. Explicitly seeds **zero** business data (no demo customers/products/quotations/leads) — the system starts empty by design. Added `createdAt`/`updatedAt`/`createdBy`/`updatedBy` audit fields to `ProductCategory` (had none), `createdBy`/`updatedBy` to `Product` (had timestamps already), `updatedBy` to `Quote` (had `createdByUserId` already, server-set-only — deliberately excluded from `QuoteUpdateFields`), and `updatedAt`/`updatedBy` to `Company`.

**Dead-code removal**: deleted 25 files across 7 directories (`api/{auth,users,roles,products,categories,notifications,quotes}/*`) — a duplicate, unreachable routing layer shadowed by `vercel.json`'s rewrites (the real, live routing is `api/handlers/*.ts`); confirmed dead both via production runtime-traffic log analysis (all real traffic hits `api/handlers/*`) and via `diff` (the dead files had drifted out of sync from their live counterparts, proving they'd been dead a while, not just theoretically unreachable). This `api/` tree had never been committed to git, so the deletion was confirmed with the user before executing (irreversible, not git-revertable). Also deleted `src/lib/salesTeam.ts` (the fake sales-data module) — its one real dependent besides the old Dashboard, `QuoteList.tsx`'s salesperson-initials avatar, was rewritten to a deterministic `avatarColorFor()` hash function that works for any real salesperson name, fixing a latent bug where any name not in the 5-person fake roster silently rendered no avatar at all.

**i18n (Thai/English)**: new `src/lib/i18n.tsx` — a lightweight React context (`I18nProvider`/`useI18n()`), `localStorage`-persisted (`tcs_erp_lang`, default `th`), with a toggle added to Settings → Profile. Scope was explicitly limited (user decision) to strings this pass touched — Dashboard, the 5 new empty states, and the toggle itself — rather than a full app-wide translation of the existing, entirely-Thai UI; that remains tracked as a follow-up in [TODO.md](./TODO.md).

**Empty states**: added professional empty states (Thai/English via the new i18n) to Dashboard (whole-page, when there's no quotation/product data), Products, Quotations, Notifications, and Audit Log — distinguishing, where both cases existed, "the collection is truly empty" (with a call-to-action button) from "no results match the current filter" (existing narrower message, unchanged).

**Files Added**: `public/logo.png`, `src/components/BrandMark.tsx`, `src/lib/i18n.tsx`, `src/lib/dashboard.ts`, `api/dashboard/index.ts`, `api/_lib/systemSeed.ts`.

**Files Removed**: `api/auth/`, `api/users/`, `api/roles/`, `api/products/`, `api/categories/`, `api/notifications/`, `api/quotes/` (25 files, dead duplicate routing layer), `src/lib/salesTeam.ts`.

**Files Modified**: `api/_lib/collections.ts` (15 new collections + indexes, `ensureIndexes()` extended), `api/handlers/{auth,categories,products,quotes}.ts` (seed wiring + audit-field capture), `api/company/index.ts` (audit fields), `src/App.tsx` (BrandMark, BootLoading, sidebar collapse fix), `src/pages/AuthLayout.tsx`, `src/pages/quotation/{QuoteDocument,PrintDocument,QuoteList}.tsx`, `src/pages/dashboard/DashboardPage.tsx` (full rewrite), `src/pages/products/ProductList.tsx`, `src/components/NotificationBell.tsx`, `src/pages/admin/AuditLogPage.tsx`, `src/pages/SettingsPage.tsx` (language toggle), `src/lib/{products,quotes,storage}.ts(x)` (new audit-field types), `src/main.tsx` (I18nProvider), `index.html` (favicon), `CLAUDE.md` (fixed a stale "client-only frontend, no backend" description left over from before the 2026-07-09 backend migration).

---

## 2026-07-09 — Real backend migration: Vercel Serverless Functions + MongoDB Atlas

**Feature**: Migrated the entire app from a fully client-side, `localStorage`-only architecture to a real full-stack deployment: Vite + React frontend (unchanged) + **Vercel Serverless Functions (Node.js)** backend + **MongoDB Atlas** database. Deployed and live at https://tcs-erp-nine.vercel.app (Vercel project `tcs-erp`, GitHub repo `Wisarutbuasumlee/tcs-erp` connected for auto-deploy on push to `master`). This is a different stack than the previously-proposed, never-built "Phase 2" plan (Next.js + Prisma + PostgreSQL + Auth.js) — that plan is formally superseded, not implemented; see [ARCHITECTURE.md](./ARCHITECTURE.md).

**Auth**: bcrypt password hashing (`bcryptjs`, cost 10) — the old client-side `hashPassword()` checksum function is gone entirely, not deprecated. JWT sessions (`jsonwebtoken`) in an httpOnly, `secure`, `sameSite=lax` cookie (`tcs_erp_session`, 7-day expiry). Every authenticated request re-fetches the user fresh from MongoDB rather than trusting JWT claims, so deactivating a user takes effect on their very next request, not just at token expiry.

**RBAC**: every mutating API route enforces permissions server-side via `requireUser`/`requirePermission` (`api/_lib/auth.ts`), reusing the exact same pure `roleHasPermission()` function from `src/lib/roles.ts` (value-imported into the API layer, not reimplemented). This is genuinely no longer bypassable via devtools — the server is the source of truth. Quote general-edit and workflow-action routes duplicate the ownership + permission-per-action logic from the client (`api/_lib/quoteWorkflow.ts`), giving full parity with the old client-side enforcement, now unbypassable.

**MongoDB collections**: `users` (gains a server-only `passwordHash` field never sent to the client), `roles` (seeded from `defaultRoles` on first run), `company` (singleton, `_id: "singleton"`), `products`, `categories`, `notifications`, `audit_log`, `quotes` (keyed by the business ID string, e.g. `"QT-2567-0041"`, as the literal MongoDB `_id`, not an `ObjectId`).

**API layout**: 9 serverless function files (Vercel Hobby's 12-function cap) — `api/company/index.ts` and `api/audit-log/index.ts` as plain method-dispatch files; `api/handlers/{auth,users,roles,products,categories,notifications,quotes}.ts` as one-file-per-resource, path-segment-dispatch files. Routed via an explicit `vercel.json` `rewrites` table after ruling out Vercel's own dynamic-route (`[...segments]`) convention, which had multiple surprising, undocumented behaviors on this plain-Vite deployment (wrong query-param key, zero-segment paths never matching, `_`-prefixed folders silently excluded from routing) — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full root-cause writeup, kept for future engineers touching routing.

**Build/tooling**: new `tsconfig.api.json` (Node target) alongside the existing `tsconfig.json` (browser target); `npm run build` now runs both `tsc` projects plus `vite build`; `eslint.config.js` gained a Node-globals block scoped to `api/**/*.ts`. Every relative import in `api/` (and any `src/lib/*.ts` file value-imported from `api/`) needed an explicit `.js` extension to satisfy Node's native ESM loader in the deployed (non-bundled) serverless functions — a footgun hit and fixed multiple times during the migration.

**Frontend changes**: new `src/lib/apiClient.ts` (`apiFetch<T>()` wrapper). Every domain lib file (`users.ts`, `roles.ts`, `session.ts`, `storage.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.tsx`) rewritten from `loadX()`/`saveX()` `localStorage` functions to `fetchX()`/`createX()`/`updateX()`/etc. API calls. `App.tsx` now boots asynchronously via a `bootStatus` state machine against `GET /api/auth/session`, fetching all app data in parallel via `Promise.all` before rendering the shell. `currentUser` is now real React state, not derived via `.find()`. `AuditLogPage.tsx` now self-fetches on mount instead of receiving data as a prop, since its endpoint is permission-gated.

**Genuine security/privacy improvements over the old simulation** (not just "moved," actually better): audit log entries always derive actor identity from the authenticated session server-side, never trusting the request body — a client can no longer forge who performed an action. `GET /api/notifications` is now genuinely filtered server-side to the caller's own notifications, rather than the client holding every user's notifications in memory and filtering only for display.

**Known, deliberate scope limitations** (documented, not hidden): `GET /api/users`/`roles`/`company`/`products`/`categories` are open to any authenticated user, not gated by a manage-permission — matches pre-migration behavior where the full dataset already lived in every signed-in browser, so not a new exposure, just now requiring real login at all. No rate limiting on login. No automated tests or CI pipeline. A MongoDB Atlas database-user password was pasted into an AI chat session during this migration's development — a rotation was recommended to the user as a follow-up, unconfirmed whether completed.

**Files Added**: `api/**` (all Vercel Function handlers and `_lib/` shared code), `vercel.json`, `tsconfig.api.json`, `src/lib/apiClient.ts`.

**Files Modified**: `src/lib/{users,roles,session,storage,products,notifications,auditLog,quotes}.ts(x)` (localStorage → REST API calls), `src/App.tsx` (async boot sequence, real `currentUser` state), `src/pages/admin/AuditLogPage.tsx` (self-fetching), `package.json` (`build` script now runs two `tsc` projects), `eslint.config.js` (Node-globals block for `api/**`).

**Files Removed**: the old client-side non-cryptographic `hashPassword()` function in `src/lib/users.ts`.

**Reason**: Explicit user request to move off the client-only/`localStorage` architecture onto a real, deployed, server-enforced backend.

**Notes**: Deployed via Vercel CLI (`vercel link`, `vercel env add MONGODB_URI`/`JWT_SECRET`, `vercel deploy --prod`) — no CI/CD pipeline wired up yet, deploys were manual via CLI during this session. The GitHub repo is already connected to the Vercel project per `vercel link`'s output, so pushing to `master` may already auto-deploy going forward — flagged to verify, not assumed, next time someone pushes (see [TODO.md](./TODO.md)). Full documentation pass across all `docs/` files per the standing rule — see [PROJECT_STATUS.md](./PROJECT_STATUS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), [API.md](./API.md), [RBAC.md](./RBAC.md).

---

## 2026-07-09 — Code review pass: RBAC + print/PDF permission and data-integrity fixes

**Feature**: A full multi-angle code review (correctness, removed-behavior, cross-file, reuse, simplification, efficiency, altitude, CLAUDE.md conventions) of the previous two sessions' work (RBAC/user-management system + quotation print redesign), followed by fixes for every confirmed bug.

**Bugs fixed**:
- `quotations:export` permission was defined and shown in the Role Management matrix but never actually checked — the "พิมพ์ / PDF" button rendered for every role regardless. `QuotePermissions` gained `canExport`, computed via `hasPermission(..., "quotations:export")`, and the print button is now hidden without it.
- The customer-interest (👍/👎) toggle in `QuoteDocument.tsx` (both the toolbar and meta-panel instances) bypassed `permissions.canEdit` entirely — a Viewer-role user could change a quote's interest level despite having no edit rights anywhere else. Now gated like every other edit action.
- "คัดลอก" (Duplicate) had no permission gate at all — any signed-in user, including Viewer, could clone any quote into a new draft. `QuotePermissions` gained `canDuplicate` (`quotations:create`), and the button is hidden without it.
- **Workflow actions (Submit/Approve/Reject/etc.) operated on the last-*saved* quote, silently discarding any unsaved on-screen edit** — e.g. editing a quote's line items then clicking "ส่งขออนุมัติ" directly (without clicking "บันทึก" first) reverted those edits once the transition was applied, and could cause the ≥฿500,000 high-value approver notification to fire against the wrong (stale) amount. `onWorkflowAction` now carries the current on-screen draft, merged into the persisted quote before the status transition is applied. Verified end-to-end: edited a line item, clicked Submit directly, reopened the quote, edit was preserved.
- User Management had no safeguard against **deactivating or role-reassigning the last active Super Admin** (only hard-delete was guarded) — an Administrator could lock everyone out of Super-Admin-only features via the normal UI. Added the same last-active-Super-Admin check to both the deactivate action and role-change validation.
- `loadRoles()` returned `[]` instead of falling back to `defaultRoles` when the stored roles array was empty (as opposed to missing) — a rare but reachable state that would crash the first-run Setup Wizard (`Cannot read properties of undefined`) when picking the Super Admin role. Fixed to fall back on empty as well as missing.
- The printed/PDF quotation was missing the company stamp image near the approver's signature — a real regression versus the pre-redesign print output, simply missed when `PrintDocument.tsx` was built. Restored.
- A line item's "has extra details" check (notes/sub-details/specs/tags) was implemented twice with different rules — the on-screen editor counted a sub-detail row as "has details" even if left blank, while the print component ignored blank ones — so a line could show the "has notes" indicator on screen but print with nothing. Unified into one `lineHasDetails()` helper in `lib/quotes.tsx`, used by both.

**Cleanup**: consolidated three duplicate date-formatting functions (`QuoteDocument.tsx`'s `fmtDate`, `PrintDocument.tsx`'s `fmtThaiDate`/`fmtNumericDate`) into shared `formatQuoteDateThai`/`formatQuoteDateNumeric` exports in `lib/quotes.tsx`; replaced three raw `new Date().toISOString()` calls in `UserManagementPage.tsx` and a hand-rolled ID in `RoleManagementPage.tsx` with the existing shared `nowIso()`/`newId()` helpers; deduplicated a double array-reverse of `approvalHistory` in `QuoteDocument.tsx` into one.

**Files Modified**: `src/lib/quotes.tsx`, `src/lib/roles.ts`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor,PrintDocument}.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage}.tsx`

**Reason**: Explicit user request to review the code, fix bugs, commit, and push.

**Notes**: Deliberately **not** changed (documented rather than silently skipped): `Company.vatRate` still isn't wired into `computeTotals()` — this is a pre-existing, already-tracked (see [TODO.md](./TODO.md)) product decision, not a regression from either reviewed session, and fixing it requires deciding VAT-rate-versioning semantics that's out of scope for a bug-fix pass. The narrow edge case where a legacy/seed quote's empty `createdByUserId` gets claimed by whichever user first takes a workflow action on it was identified but not fixed — low severity, affects only pre-existing seed data, and fixing it properly requires a larger ownership-semantics decision. The printed document intentionally does not show the internal workflow status badge (matches the real reference quotation the redesign was modeled on, which shows no such badge either) — flagged by one reviewer as a possible regression but judged to be correct, intentional behavior. Verified via scripted Playwright passes: a Viewer-role user correctly can no longer see the print/duplicate/interest controls; an unsaved line-item edit survives a direct "Submit" click; a fresh print PDF export still renders correctly with no console errors. `tsc --noEmit`, `eslint .`, and `npm run build` all clean before and after.

---

## 2026-07-09 — Quotation print/PDF redesign (repeating-header document)

**Feature**: Replaced the quotation's print/PDF output with a dedicated `PrintDocument.tsx` component modeled on a real customer-facing quotation template the user provided (photos of a printed 3-page quotation from another vendor's system). The new document is a single `<table>` with a repeating `<thead>` — company header (logo/name/address/tax ID), a blue "QUOTATION" ribbon, the full "ผู้ซื้อ" (buyer) block, the "ใบเสนอราคา" meta block, and the item-table column headers all re-render automatically on every printed page via the browser's native thead-repeat behavior. Item rows now show unit price and per-unit discount (amount + %) as separate columns, with sub-details rendered as a pin-icon bullet list. Totals gained a Thai-language amount-in-words line under the grand total. A three-column signature table (ผู้เสนอราคา / ผู้อนุมัติใบเสนอราคา / ผู้ยืนยันการสั่งซื้อ) replaces the old two-column signature block, adding a blank column for the customer's own hand signature (no backing data exists for that step). Added four new per-quote fields the reference document required: buyer contact email, delivery method, delivery address, and project name — all real, controlled, auto-hidden-when-empty like the existing document fields.

**Files Added**: `src/pages/quotation/PrintDocument.tsx`

**Files Modified**: `src/lib/quotes.tsx` (`Quote` gained `contactEmail`/`deliveryMethod`/`deliveryAddress`/`project`/`remarks`; new `bahtText()` Thai-number-to-words helper; seed data updated), `src/pages/quotation/QuoteDocument.tsx` (new form fields for the four additions; entire old print-only rendering — the navy header band's print visibility, the separate "print-only" meta grid, the remarks textarea, approval history, footer disclaimer — replaced with `print:hidden` on every screen-only section plus a single `<PrintDocument />` render at the end), `src/pages/quotation/LineItemsEditor.tsx` (now screen-only, `print:hidden` at its root; removed the old inline `hidden print:table-row` per-line print rendering, now superseded by `PrintDocument`)

**Files Removed**: none

**Reason**: User supplied three photos of an actual printed quotation from another system and asked for the app's print output to look like it — a real design target rather than an abstract request, so most of the work was translating that specific document's structure (repeating per-page header, per-unit discount column, pin-icon sub-detail bullets, Thai-words total, three-signature-column block) into this codebase's existing data model and conventions.

**Notes**:
- **Bug found and fixed as a side effect**: the "หมายเหตุ / เงื่อนไข" (remarks) textarea was `defaultValue`-only — a pure uncontrolled input with no `onChange` and never included in the save payload. Any text a user typed there was silently discarded on save and reset to the company default every time the document was reopened. Since the print redesign needed a real, persistable value to render, this was fixed properly (`Quote.remarks`, controlled, saved) rather than papered over — same pattern as the other document fields fixed in the 2026-07-08 PDF-polish pass.
- Chose the "one `<table>` with a repeating `<thead>`" technique specifically because it's the only reliable, native-browser way to repeat header content across print page breaks without JavaScript pagination hacks — verified by forcing a quote to 17 line items and confirming the header/buyer/meta block and column headers repeated correctly on page 2, with totals and the signature table appearing only once at the true end (not duplicated per page).
- **Known, accepted simplifications** (documented in [MODULES/Quotation.md](./MODULES/Quotation.md) and [UI_GUIDELINES.md](./UI_GUIDELINES.md) rather than silently left as gaps): the repeating header is identical on every page (the reference document shows a fuller header on page 1 and a condensed one on continuation pages — browser print can't vary `<thead>` content by page number); "Page X/Y" numbering was not implemented (no reliable cross-browser way to read total page count from CSS in a browser print/PDF context); the reference's separate "หมายเหตุ"/"Condition"/"Payment" sections were kept as one free-text `remarks` field (already supports multi-line text, avoiding a larger data-model change); the third signature column (ผู้ยืนยันการสั่งซื้อ, customer PO confirmation) always renders blank since no such workflow step/data exists yet — matches the established "blank line, never an error" fallback pattern.
- Verified via a scripted Playwright pass: fresh install → Setup Wizard → open a seeded quote → fill the four new fields → save → confirm they persist and render correctly in a real `page.pdf()` export (read back and visually checked, not just screenshotted) → forced the same quote to 17 lines to confirm multi-page header repetition. Zero console errors throughout. `tsc --noEmit`, `eslint .`, and `npm run build` all clean before and after.

---

## 2026-07-08 — RBAC, User Management, Approval Workflow & Notification System

**Feature**: A full client-side simulation of enterprise RBAC for a single-company (not multi-tenant) internal ERP: a first-run Initial Setup Wizard, multi-user accounts with hashed passwords and Position/Role separation, a 6-role/17-permission RBAC model with a permission-gated (fully-hidden, not just disabled) sidebar, a User Management admin page, a Role Management page (Super-Admin-only, hardcoded), a 9-status quotation approval workflow with append-only approval history and role-based notifications, an enterprise-style notification bell (no badge at 0 unread, red badge with count/99+ cap otherwise, dropdown panel), personal signature-image integration into the quotation PDF, and an append-only audit log. Company settings gained bank account, VAT rate, and Terms & Conditions fields, restricted to Super Admin. Public self-service sign-up was removed (enterprise ERPs don't allow it; accounts are Setup-Wizard- or admin-created only).

**Files Added**: `src/lib/permissions.ts`, `src/lib/roles.ts`, `src/lib/users.ts`, `src/lib/session.ts`, `src/lib/notifications.ts`, `src/lib/auditLog.ts`, `src/components/NotificationBell.tsx`, `src/pages/SetupWizardPage.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`

**Files Modified**: `src/lib/storage.ts` (`Company` gained `vatRate`/`bankName`/`bankAccountName`/`bankAccountNumber`/`bankBranch`/`termsAndConditions`; removed the old singleton `UserProfile` type + `loadUser`/`saveUser`/`initials`, superseded by `users.ts`), `src/lib/quotes.tsx` (`QuoteStatus` expanded from 4 to 9 values; new `ApprovalAction`/`ApprovalHistoryEntry`/`QuotePermissions` types, `workflowTransitions` state machine, `computeQuotePermissions()`, `loadQuotes`/`saveQuotes` — quotes are now persisted, closing a long-standing gap), `src/App.tsx` (rewired around a real session/current-user model, permission-filtered sidebar, bootstrap gate, notification/audit wiring), `src/pages/SignInPage.tsx` (real credential check against the `users` list, replacing the old "any input succeeds" flow), `src/pages/SettingsPage.tsx` (profile tab now self-service with read-only employee fields + picture/signature upload; Company tab hidden entirely unless `company:manage`; real password verification), `src/pages/quotation/{QuotationPage,QuoteDocument,QuoteList}.tsx` (workflow action buttons, approval-history panel, signature rendering, ownership/permission-gated field editing)

**Files Removed**: `src/pages/SignUpPage.tsx` (public self-registration removed by design — see Reason)

**Reason**: Explicit, detailed user request to implement enterprise-grade RBAC, user management, a quotation approval workflow, and a notification system, framed around this being a single-company internal system (not a SaaS product). Scoped to a client-side simulation rather than the real Phase 2 backend migration after confirming with the user — see the AskUserQuestion exchange at the start of this session; the alternative (starting the real Next.js/Prisma backend) was explicitly declined as out of scope for this pass.

**Notes**:
- **This is a Phase 1 simulation, not real security** — see the new "Current State" section at the top of [RBAC.md](./RBAC.md). Every check is client-side and every record lives in `localStorage`; devtools can bypass any of it. Positioned as a UI/UX/workflow-correct scaffold that maps closely onto the still-not-started Phase 2 server-enforced design.
- Permission model is a flat 17-key set (`quotations:view/create/edit/delete/approve/reject/export`, `products:view/create/edit/delete/export`, `dashboard:view`, `users:manage`, `roles:manage`, `company:manage`, `auditLog:view`) rather than fully generic per-module CRUD — chosen to match the spec's literal permission list while still giving real module-level sidebar differentiation.
- `roles:manage`/`company:manage` are additionally hardcoded to the Super Admin role (not just permission-gated) so an admin can never misconfigure a custom role into unlocking them — matches the spec's explicit "Only Super Admin may..." rules.
- Two-level sequential approval (Level 1 must approve before Level 2) was **not** implemented — the provided workflow diagram only has one "Pending Approval" step; both approver roles can independently approve/reject from that state. Documented as a known simplification.
- Product Library CRUD buttons are **not** individually permission-gated in this pass — only its sidebar entry (`products:view`). Documented as a known follow-up in [TODO.md](./TODO.md).
- **Bug found and fixed during verification**: the quotation status badge/toolbar froze at its value from the moment the document view was first opened, because it was read from `useState` initialized once at mount — a workflow-driven status change (e.g. Submit → Approve) updates the `quote` prop but the component doesn't remount (same `key`), so the old state never re-derived. Fixed by making `quoteStatus` a plain value derived from the `quote` prop every render instead of local state. Caught by a scripted end-to-end Playwright pass, not by `tsc`/`eslint` (both were clean throughout — this was a runtime-only bug).
- Verified end-to-end via a scripted Playwright pass driving a real Chromium browser through the full lifecycle across 3 distinct accounts: fresh install → Setup Wizard → Super Admin creates a Sales User and an Approver Level 1 → logout/login as Sales User → sidebar/company-tab correctly hidden → create + submit a quotation → logout/login as Approver → notification badge shows unread count → approve → approval history recorded → upload a signature → signature image appears on the approved quote → logout/login as Super Admin → audit log shows Login/User Created/Quotation Submitted/Quotation Approved entries. Zero console errors throughout. `tsc --noEmit`, `eslint .`, and `npm run build` all clean.

---

## 2026-07-08 — Quotation PDF polish

**Feature**: Company logo/stamp upload (Settings → Company Info), rendered in the quotation PDF header and signature block. Quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms, salesperson) converted from hardcoded placeholder text to real, controlled, per-quote `Quote` fields. Print/PDF output now automatically hides empty fields instead of printing blank rows. Salesperson field defaults to the signed-in user's name on new quotes, and the "ผู้เสนอราคา" signature line pre-fills that name in print. Added quotation item **tags** (chip input) and a **specifications** field (distinct from notes), the latter auto-copied from `Product.specifications` when adding a line via the product picker.

**Files Added**: none

**Files Modified**: `src/lib/storage.ts` (`Company.logoDataUrl`/`stampDataUrl`), `src/lib/quotes.tsx` (`Quote` gained `contactName`/`contactPhone`/`address`/`taxId`/`poRef`/`paymentTerms`/`issueDate`/`expiryDate`; `QuoteLine` gained `specifications`/`tags`; new `QuoteDraftFields` type, `todayIso()`/`plusDaysIso()`/`paymentTermsOptions` helpers), `src/pages/SettingsPage.tsx` (new `ImageUploadField` component, wired into the Company tab), `src/pages/quotation/QuoteDocument.tsx` (meta fields now controlled + a parallel print-only auto-hide-if-empty rendering via a new `PrintRow` helper; logo/stamp rendering; `user: UserProfile` prop), `src/pages/quotation/QuotationPage.tsx` (`user` prop threaded through, `handleSave` simplified around `QuoteDraftFields`), `src/pages/quotation/LineItemsEditor.tsx` (new `SpecificationsEditor`/`TagsEditor` components in the line-item expand panel, plus print rendering for both; `addLineFromProduct` now copies `specifications`), `src/App.tsx` (passes `user` into `QuotationPage`)

**Files Removed**: none

**Reason**: User requested Quotation PDF polish as the first slice of a larger "master prompt" continued-development request (see the [SESSION_LOG.md](./SESSION_LOG.md) 2026-07-08 entries) — chosen over Lead/Customer module and Company Settings expansion as the fastest, most self-contained improvement to the document actually sent to customers.

**Notes**: Images are stored as size-capped (1MB) base64 data URLs inside the existing `Company` `localStorage` entry — a deliberate interim choice (no object storage exists yet) called out in [PROJECT_STATUS.md](./PROJECT_STATUS.md) Technical Debt. Verified end-to-end via a scripted Playwright pass: logo/stamp upload → appear correctly in `emulateMedia('print')` output; a fresh quote with untouched contact fields correctly omits those rows in print while still showing populated ones (ID, dates, salesperson, payment terms); tags and specifications render as chips/italic text in both screen and print. Zero console errors; `tsc`/`eslint`/`build` all clean.

---

## 2026-07-08 — Reorganize pasted master-prompt requirements into TODO.md

**Feature**: User appended a large standing "continue building the ERP" charter directly into `docs/CLAUDE.md`. Extracted its actionable requirements into properly categorized `TODO.md` sections (PDF/Quotation polish, User Profile, Company Settings expansion, Dashboard rework, other) instead of leaving raw instruction text embedded in the current-state summary file.

**Files Added**: none

**Files Modified**: `docs/CLAUDE.md` (raw pasted block replaced with a short pointer to `TODO.md`), `docs/TODO.md` (new detailed items added)

**Files Removed**: none

**Reason**: `CLAUDE.md`'s own stated purpose (both in the user's original spec and its own header) is to stay concise and current — a raw instruction dump would go stale the moment any listed feature shipped, and duplicates content better suited to `TODO.md`/`PROJECT_STATUS.md`.

**Notes**: Nothing from the pasted content was dropped — every requirement (PDF logo/stamp, hide-empty-fields, no-placeholder-text, item tags/specifications, nested-sub-details question, user profile picture/signature upload, company bank account/VAT/T&C settings, dashboard KPI rework, sidebar "Coming Soon" policy, notifications, audit logs) is now a tracked `TODO.md` item.

---

## 2026-07-08 — Documentation system

**Feature**: Full project documentation under `/docs` (this system), plus a root `CLAUDE.md` pointer so Claude Code auto-loads project context at session start.

**Files Added**: `docs/CLAUDE.md`, `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, `docs/TODO.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/UI_GUIDELINES.md`, `docs/RBAC.md`, `docs/MODULES/{Dashboard,Quotation,Product,Lead,Customer,Auth,Settings}.md`, `CLAUDE.md` (root pointer)

**Files Modified**: none

**Files Removed**: none

**Reason**: So any future session (or person) can understand current project state without a re-explanation, per explicit request.

**Notes**: Documentation reflects actual current code, verified by reading the live source tree rather than working from memory. `Lead.md` and `Customer.md` are written as "not implemented" stubs — those modules don't exist in code yet, and the docs say so rather than inventing content.

---

## 2026-07-08 — Git init + push to GitHub

**Feature**: Initialized git repo, created `.gitignore`, made the initial commit, installed GitHub CLI, authenticated, created a private GitHub repo, and pushed.

**Files Added**: `.gitignore`

**Files Modified**: none

**Files Removed**: none

**Reason**: User requested the project be committed to their GitHub.

**Notes**: Repo: `https://github.com/Wisarutbuasumlee/tcs-erp` (private). Local git identity set locally (not globally) to the name/email the user provided. `gh auth login` required an interactive browser step the user completed themselves outside the assistant session (by design, to avoid any credential passing through conversation).

---

## 2026-07-08 — Quotation item notes, sub-details, PDF export, and full code review

**Feature**: Added per-line-item multi-line notes (with bullet/numbered-list toolbar) and unlimited, reorderable sub-details to quotation line items. Added print/PDF export (browser print, with a dedicated print-only rendering of notes/sub-details, indented and formatted). Performed a full project code review and fixed everything found.

**Files Added**: `src/lib/quotes.tsx`, `src/lib/salesTeam.ts`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,LineItemsEditor,InterestButtons,notesFormat}.tsx`, `src/pages/dashboard/DashboardPage.tsx`, `src/hooks/useToast.ts`, `src/components/Toast.tsx`, `eslint.config.js`

**Files Modified**: `src/App.tsx` (stripped down to the root shell + `React.lazy` page routing), `src/pages/products/ProductList.tsx` (lint fixes), `src/pages/SettingsPage.tsx` (typed icon list), `tsconfig.json` (`noUnusedLocals`/`noUnusedParameters` → `true`), `package.json` (added ESLint deps + `lint` script), `src/styles/index.css` (`@media print` page margin)

**Files Removed**: none (old inline `QuotationPage`/`DashboardPage` inside `App.tsx` were moved out, not deleted)

**Reason**: User requested the notes/sub-details feature for real business use (scope of work, warranty terms, install steps, etc. per line item), plus a mandatory full code review after implementation.

**Notes**:
- **Root-cause bug found and fixed**: `Quote` had no `lines` field at all — the quotation editor's line-item state was disconnected scratch space that was never actually saved back to the quote. Editing an existing quote's items and clicking "บันทึก" silently did nothing; every quote showed the same 3 hardcoded example lines regardless of which one you opened. Fixed by adding `lines`/`discount` to the `Quote` type and wiring Save/Duplicate/Send to actually persist.
- Wired the previously-inert toolbar buttons: **พิมพ์** (`window.print()`), **บันทึก** (create-or-update the quote), **คัดลอก** (clone with fresh line/sub-detail IDs, detail view only), **ส่งใบเสนอราคา** (save + bump draft→pending status).
- Client name field converted from uncontrolled (`defaultValue`) to controlled (`value`/`onChange`) so it actually saves. Other secondary fields (contact, phone, address, tax ID, PO ref, dates, payment terms) intentionally left as-is (cosmetic) — flagged in [PROJECT_STATUS.md](./PROJECT_STATUS.md) Technical Debt, not silently left broken.
- Fixed an operator-precedence bug in the product list's "sort by status" comparator (`Number(a.archived) - Number(b.archived) * dir` → parenthesized correctly).
- Enabled `noUnusedLocals`/`noUnusedParameters`, added ESLint (flat config, TS + react-hooks + react-refresh rules), fixed every finding (unused imports, `any` types replaced with real interfaces, unnecessary regex escapes, a missing `useMemo` dependency).
- Extracted `DashboardPage` out of `App.tsx` into its own module and lazy-loaded all four main pages — resolved a build-time "chunk larger than 500KB" warning by isolating `recharts` (~445KB) to a chunk that only loads when Dashboard is actually viewed.
- Verified everything end-to-end with a scripted Playwright pass (notes/bullets, sub-detail reorder, save, reopen-and-confirm-persisted, print preview, duplicate, create-new-quote-and-send) — zero console errors.

---

## 2026-07-08 — Product Management module

**Feature**: Full Product Library module — product + category CRUD, archive vs. permanent delete, duplicate, search/filter/sort/pagination, and a picker modal that lets Quotation line items snapshot a product's data.

**Files Added**: `src/lib/products.ts`, `src/pages/products/{ProductsPage,ProductList,ProductForm,CategoriesManager,ProductPickerModal}.tsx`, `src/components/ConfirmDialog.tsx`

**Files Modified**: `src/App.tsx` (added "คลังสินค้า" nav item + products/categories state, wired the picker into the Quotation line-items table)

**Files Removed**: none

**Reason**: User requested a Product Management module, explicitly separate from Quotation, with the rule that editing/archiving/deleting a product must never affect historical quotations.

**Notes**: Snapshot integrity holds because `QuoteLine` (at the time) stored plain primitive values with no reference back to a `Product` — picking a product just copies its name/unit/price into a new line item once. Verified via a scripted browser pass (create/duplicate/archive/delete-with-confirm/category CRUD/picker-into-quotation).

---

## 2026-07-08 — Sign in / Sign up / Settings

**Feature**: Full-screen Sign-in and Sign-up pages (navy/gold split layout, client-side validation, show/hide password, mock "forgot password"), a tabbed Settings page (Profile / Company Info / Security / Notifications), and a real auth gate wired into `App.tsx` (previously only scaffolded as unused files).

**Files Added**: `src/pages/{SignInPage,SignUpPage,AuthLayout,SettingsPage}.tsx`, `src/lib/storage.ts`

**Files Modified**: `src/App.tsx` (added `authed`/`authView`/`company`/`user` state, user dropdown menu with Settings/Log out, sidebar Settings entry, routing to Settings)

**Files Removed**: none

**Reason**: User requested sign-in/sign-up/settings; a first attempt had created the page files but never actually wired them into `App.tsx` (a real bug caught when the user reported "I can't find the sign-in page").

**Notes**: Company profile edited in Settings feeds live into the Quotation document header — verified via scripted flow (sign up → edit company address → open a quotation → confirm the new address appears).

---

## 2026-07-08 — Initial scaffold: Dashboard + Quotation (TCS ERP)

**Feature**: Initial project scaffold, ported and rebranded from a Figma Make prototype into a standalone Vite + React + TypeScript + Tailwind v4 app. Dashboard (KPIs, charts, leaderboard, orders, activity feed) and Quotation (list + printable document with line items, VAT) pages, trimmed to just those two modules, rebranded from placeholder "เน็กซัส ERP" to **TCS ERP / Thai Chemicals Storage**.

**Files Added**: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/{fonts,tailwind,theme,index}.css`

**Files Modified**: n/a (new project)

**Files Removed**: n/a (new project)

**Reason**: User wanted a real, runnable website built from a Figma Make design, scoped to Dashboard + Quotation only.

**Notes**: Design tokens (navy `#0b1d3a` / gold `#c9a84c`, Playfair Display / Inter / JetBrains Mono) ported verbatim from the Figma source; all sample data/company placeholders rebranded.
