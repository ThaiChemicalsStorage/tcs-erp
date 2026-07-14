# Dashboard Business Requirements + Pre-Tax Amount Review

**Review date:** 2026-07-14
**Scope:** Read-only review of Dashboard-related React UI, `GET /api/dashboard`, quotation writes/audit events, types, RBAC, and project documentation. No application source, configuration, or package files were changed.

## Executive Summary

The Dashboard is substantially implemented: it has the four required KPI cards, a grouped Win/Lose/Active/Non-Active status summary, real MongoDB-backed quotation/audit-log data, pre-tax conversion, and Weekly/Monthly/Quarterly/Yearly sales activity UI. The required sections are ordered sensibly and no mock Dashboard dataset was found.

It does **not fully satisfy** P' Keng / P' Geeky's requirements yet. Most seriously, Sales Activity Analytics is entirely absent for the default Sales User and Viewer roles despite those roles having `dashboard:view`. In addition, Sales Activity intentionally ignores the selected date range's start date, and an entirely empty business database hides the KPI cards instead of showing zero values. These are business-requirement failures, not merely UI polish issues.

## Critical Issues

1. **Sales Activity Analytics is not visible to all Dashboard users.** `api/dashboard/index.ts` returns `salesActivity: null` unless the caller has `auditLog:view`; `DashboardPage.tsx` renders the section only when this value is non-null. Default `sales_user`, `approver_1`, `approver_2`, and `viewer` roles in `src/lib/roles.ts` have `dashboard:view` but not `auditLog:view`. For those users, the required activity section, its period selectors, created count, and edited count disappear completely. This is Critical for role-scoped Dashboard usage because the requirement explicitly makes the section required and defines a completely missing activity section as Critical.

## High Priority Issues

1. **Sales Activity does not fully obey the date-range filter.** `salesActivity` queries audit events by action/salesperson/department but never applies `from` or a `createdAt` range. It uses trailing windows anchored only to `to`; the UI says this openly. That documentation does not meet the requirement that Date range affect Sales Activity Analytics and its table/chart. `RevenueTrend` follows the same exception, so optional money trend widgets also do not honor a selected start date.

2. **No-data behavior fails the required zero-KPI state.** `DashboardPage.tsx` uses `hasAnyData` to replace the entire dashboard with one page-level `EmptyState` when there are no quotations and no products. Consequently the four KPI cards do not visibly show `0`, and the status/activity empty states are not rendered. The requirement specifically calls for zero KPI values plus status/activity empty states when business data is absent.

3. **The quotation query has no explicit soft-delete exclusion.** `api/dashboard/index.ts` builds `fullMatch` without `isDeleted: { $ne: true }` (or a comparable deletion predicate). Current quote schema/docs say quotations have no soft-delete field and use Cancelled status instead, so normal app-created records are not presently excluded incorrectly. However, this does not satisfy the stated Expected Sales predicate and is unsafe if archived/imported quotations obtain `isDeleted: true`. Add a formal quote deletion policy and enforce it in every Dashboard quote query before relying on this Dashboard for executive totals.

## Medium Priority Issues

1. **Expected Sales uses truthiness rather than strict boolean equality.** The aggregation is `.filter((q) => q.isPotentialOpportunity)`, not `=== true`. The normal API validates new writes as booleans, but MongoDB has no enforced schema and legacy/external string values such as `"false"` would be counted. Use an explicit boolean predicate and an equivalent MongoDB filter when the query is moved server-side.

2. **Pre-tax is reconstructed from VAT-included `amount` rather than stored pre-tax data.** The implementation consistently converts `amount / 1.07`; the server currently calculates `amount` as exact pre-rounding 7% VAT, so the result is correct for current records. Nevertheless it does not use the preferred persisted fields (`subtotal`, `amountBeforeVat`, etc.) and will be fragile if VAT becomes quote-specific, changes historically, or amount rounding rules change. Persist a canonical before-VAT total at quotation write time.

3. **Salesperson/department matching is free-text and activity attribution is actor-based.** Quote filters join `Quote.salesperson` to `User.fullName`; activity filters use audit-log `userName`. Name edits, duplicate names, or spelling variation can omit/misattribute data. A manager approving a salesperson's quote is attributed to the manager in activity analytics. Use IDs (`salespersonId`, `departmentId`, and quote reference in activities) for reliable filtering.

4. **Performance concern for activity analytics.** The endpoint reads all matching activity records and buckets them in Node before retaining only 12 weeks/12 months/8 quarters/5 years. The current `action, createdAt` index helps, but the absence of a bounded time query will grow with audit history. Use a minimum timestamp covering the largest displayed window (or date filter) and aggregate in MongoDB.

5. **Documentation overstates completion.** `PROJECT_STATUS.md`, `docs/CLAUDE.md`, `docs/API.md`, and `docs/MODULES/Dashboard.md` describe the Dashboard as completed against the business specification, while the same Dashboard documentation explicitly records the deliberate start-date exception and the code hides Activity Analytics by role. Update the completion claims and document the role/data-range limitations until resolved.

## Low Priority Issues

1. `fmtShort()` displays large baht values as `฿1.2K`/`฿1.23M`. This is compact, but executive financial cards and the status summary would be clearer with full THB formatting or a visible precision/rounding convention.

2. The status grouping is sensible and exhaustive for the current nine-status workflow, but it is embedded in Dashboard constants. Centralizing the business-status grouping with the workflow definitions would reduce drift when statuses change.

## Business Requirements Checklist

- [x] จำนวนใบเสนอราคาทั้งหมด
- [x] ยอดใบเสนอราคาทั้งหมดก่อนภาษี
- [x] ยอดขายที่ปิดได้แล้วก่อนภาษี
- [!] ยอดที่คาดว่าจะปิดได้ก่อนภาษี
- [x] Dashboard monetary totals use pre-tax amount
- [x] Dashboard does not use grandTotal including VAT unless clearly labeled
- [x] KPI labels indicate before VAT
- [!] Expected Sales uses potentialOpportunity only
- [x] Expected Sales uses pre-tax amount
- [x] Win / Lose / Active / Non Active status summary
- [x] Status summary shows job count
- [x] Win / Lose / Active / Non Active values use pre-tax amount
- [!] Sales Activity Analytics visible
- [!] Weekly activity view
- [!] Monthly activity view
- [!] Quarter activity view
- [!] Yearly activity view
- [!] Salesperson filter for activity
- [!] New quotation created count
- [!] Existing quotation edited count
- [!] Department filter
- [!] Date range filter
- [x] No fake dashboard data

`[!]` means implemented for callers with `auditLog:view` and/or normal current data, but not fully compliant with the stated requirement for all Dashboard users and filters.

## KPI Calculation Review

`ExecutiveSummaryCards.tsx` renders exactly four top-level cards in the requested order. `GET /api/dashboard` loads quotations by selected `issueDate`, salesperson, and department, then calculates:

- Total quotations: count of filtered quotes.
- Total quotation value: sum of converted pre-tax values.
- Closed sales: sum where status is `ปิดการขายสำเร็จ`.
- Expected sales: sum where `isPotentialOpportunity` is truthy.

Labels in `src/lib/i18n.tsx` explicitly say `ก่อนภาษี`; values use `฿` formatting. No hardcoded KPI values were found. The Expected Sales boolean and soft-delete limitations are recorded above.

## Dashboard Pre-Tax Amount Review

Pass for current data. `Quote.amount` is generated server-side as after-discount amount plus the fixed 7% VAT. `api/dashboard/index.ts` normalizes filtered documents once through `preTaxAmount(amount) = amount / 1.07`; separate revenue trend and follow-up reads also convert. Review of the Dashboard response paths found the conversion applied to KPI values, status values, pipeline, sales performance, customer analytics, job type analytics, forecasts, revenue trends, follow-ups, and approval amounts. The related labels say before VAT.

No VAT-included `grandTotal`, `totalWithVat`, or `finalTotal` Dashboard field was found. The remaining Medium-risk is that the source of truth is reconstructed from a VAT-inclusive field rather than persisted before-VAT data.

## Expected Sales Review

The quotation UI/type/API support `isPotentialOpportunity`; server create/edit paths validate the field and Dashboard Expected Sales uses it. The current calculation includes every status if flagged, matching the supplied requirement's literal `potentialOpportunity = true` rule rather than treating all Active quotes as forecast.

The calculation is pre-tax and respects the quotation's date/salesperson/department match. It does not explicitly exclude `isDeleted: true`, and it uses truthiness instead of `=== true`; these prevent an unqualified pass.

## Status Mapping Review

Pass for the current workflow. The API maps:

- Win: `ปิดการขายสำเร็จ`
- Lose: `เสียโอกาส`
- Active: non-closed, non-expired Draft/Pending Approval/Approved/Sent/Customer Accepted states
- Non Active: Customer Rejected, Cancelled, and expired otherwise-open quotations

The four groups are a true partition: Lost is not double counted in Non Active. `QuotationStatusSummary.tsx` visibly gives a job count, before-VAT total, and percentage for each group. The summary derives count/value pairs from identical server predicates and inherits all three quote filters.

## Sales Activity Analytics Review

The implementation has real server-authored quotation audit events for create, update, and workflow events. `SalesActivityAnalytics.tsx` visibly offers Weekly, Monthly, Quarterly, and Yearly controls, a stacked chart, a period table, and a per-salesperson table with Created/Edited counts. There is no fake activity data.

However, the API only returns this data to `auditLog:view` callers, making the entire required section missing for default dashboard roles. It also does not use the filter's `from` date. Salesperson and department filtering operate on audit actors (`userName`), not a stable salesperson ID associated with the quotation.

## Filter Review

Date, salesperson, and department controls are present and re-fetch `/api/dashboard`. The filtered quote set correctly drives all four KPIs and the status summary. Salesperson/department also filter activity where it is returned.

Exceptions that violate the stated all-widget filter requirement:

- Sales Activity ignores the date-range start and reads a rolling history ending at `to`/today.
- Revenue Trend ignores the date-range start in the same way.
- Forecast historical win-rate baseline is company-wide by design.
- Catalog/personal widgets (customers/products/category breakdown and notifications) are intentionally unfiltered.

The UI/documentation call out several exceptions, which improves honesty but does not make them compliant with the requested filter behavior.

## MongoDB / API Review

Dashboard data originates from MongoDB collections via `GET /api/dashboard`; client UI does not calculate executive totals from mock arrays. Quote mutation endpoints write authoritative `Quotation Created`, `Quotation Updated`, and workflow audit records server-side, preventing client-forged quotation activity. Empty metric arrays are zero-filled for chart periods.

Concerns: Dashboard quote reads do not apply a soft-delete predicate; no quote deletion field currently exists. Activity analytics reads and buckets an unbounded audit-log result in application memory. Department and salesperson filters are name-based joins rather than IDs. These are correctness/scalability risks rather than evidence of fake data.

## Dashboard UI / UX Review

The primary visual order is good: title/filters, four executive KPIs, status summary, sales activity, recent activity, then supporting detail. Optional material is below the required sections. Thai labels clearly describe pre-tax amounts, status totals are readable, and tables use overflow wrappers.

The role-gated absence of Sales Activity is a major UX/business regression. The page-level no-data state is otherwise clean but hides information users are explicitly expected to see as zero. Runtime browser verification against the deployed API was not possible in this environment, so overlap/actual responsive rendering was assessed from component structure and existing CSS only.

## Sidebar / Typography Review

Code review finds `BrandMark`/sidebar changes documented for wrapping/truncation and Thai fallback fonts (`Noto Sans Thai`) in the styling. No new Dashboard-side typography or sidebar regression was apparent in source. A live visual confirmation could not be performed because the local Node runtime cannot start under the detected WSL1 environment.

## Empty State Review

Per-widget empty states exist for status and Sales Activity when the dashboard itself renders. Filter results with no matching quotations retain the page and show zero KPI values/empty widgets, which is correct. A completely empty business database instead shows only a global empty state, failing the stated requirement to show the four zero KPI values and relevant empty states.

## Code Quality Review

Strengths: server-side amount computation, a single central pre-tax normalization path, typed API response contracts, authoritative activity events, and explicit status partition comments.

Concerns: extremely large `api/dashboard/index.ts` combines authorization, filter resolution, database access, aggregation, business mapping, and response shaping; the code repeats free-text filter composition across quote/audit branches; status/business rules live separately from workflow definitions; and activity analytics does in-memory aggregation of unbounded data. Pre-tax logic is centralized but coupled to a duplicated fixed VAT constant rather than a stored source amount.

## Documentation Review

Documentation is extensive and generally matches the current source: it correctly describes the 7% reverse-VAT calculation, current status partition, audit-log source, free-text department join, and rolling activity behavior. It is not fully aligned with the business requirement because several documents call the Dashboard completed while documenting deliberate filter exceptions and omit the impact of the `auditLog:view` gate on the mandatory activity section. The documentation should be corrected after the fixes, not used to waive the requirements.

## Build Check

Attempted command:

```text
npm run lint && npm run build
```

Result: neither command started. The environment returned:

```text
WSL 1 is not supported. Please upgrade to WSL 2 or above.
Could not determine Node.js install directory
```

Likely cause: the installed Node/npm launcher is incompatible with the WSL1 runtime, not a demonstrated source lint/build failure. Recommended action: run lint/build in WSL2, native Windows, or CI with a supported Node installation.

## Suggested Fix Plan for Claude Code

1. Make Sales Activity Analytics available to every role with `dashboard:view`. Either grant read-only activity aggregation independently of the full Audit Log permission, or add a narrowly scoped dashboard activity permission. Keep raw audit-log access restricted.
2. Apply the selected date range to activity analytics and its per-salesperson table. If rolling trends remain desirable, expose them as a separate clearly named control rather than overriding the reporting filter.
3. Change the no-data page behavior: retain the four KPI cards at zero and render Status/Sales Activity empty states for an empty database.
4. Establish quotation deletion semantics. If soft delete is required, add/standardize the field and add `isDeleted != true` to every Dashboard quote query; otherwise formally update the approved business requirement and imports policy.
5. Make Expected Sales predicate exact (`isPotentialOpportunity === true`) and add a migration/data validation check for legacy records.
6. Persist a canonical pre-VAT quotation total at write time; use it as the primary Dashboard source while retaining a documented legacy fallback only where necessary.
7. Replace free-text salesperson/department matching with IDs and associate each activity with both actor and quotation salesperson/department. Add bounded MongoDB aggregation/indexes for activity periods.
8. Re-run visual QA with empty data, a date range excluding older activity, Sales User/Viewer/Approver roles, department/salesperson filters, and both desktop/mobile widths.
9. Update PROJECT_STATUS, API, Dashboard module docs, checklist, and changelog to distinguish fixed requirements from intentional exceptions.

---

## Claude Fix Status (2026-07-14, fix pass following this review)

### Fixed

- **Critical #1 — Sales Activity Analytics hidden from non-`auditLog:view` roles.** Fixed. `api/dashboard/index.ts`'s `salesActivity` computation is no longer gated behind `roleHasPermission(ctx.role, "auditLog:view")` — it's now computed unconditionally for any caller who already passed the route's own `requirePermission(req, "dashboard:view")` check, same as every other required-section field. Default `sales_user`/`approver_1`/`approver_2`/`viewer` roles (all `dashboard:view`, none `auditLog:view`) now receive the section. `activityTimeline` ("Recent Activity Details," the raw audit-log feed with full entry text) deliberately **stays** gated by `auditLog:view` — that's a different, more sensitive feature than the aggregate Sales Activity counts, and the review's own suggested fix plan (#1) explicitly says to keep raw audit-log access restricted while freeing the aggregate section. `src/lib/dashboard.ts`'s `DashboardStats.salesActivity` type comment updated to describe the new (effectively always-present) contract; `src/pages/dashboard/DashboardPage.tsx`'s `{salesActivity && ...}` render guard is now a defensive null-check, not a real permission gate.
- **High #1 — Sales Activity ignores the date-range filter's start.** Fixed. `activityMatch.createdAt` is now bounded by `bangkokDayBoundsUtc(from, to)` when either is set — the exact same pattern `activityTimeline`'s query already used. Selecting a narrow date range (e.g. "Today") now correctly zero-fills periods outside that range instead of silently still scanning full history. `SalesActivityAnalytics.tsx` gained a `dateFiltered` prop (`DashboardPage.tsx` passes `!!stats.filters.from`) that switches the section's caption between the original "rolling trend, not limited by filter's start date" copy (when no `from` is selected) and a new "กรองตามช่วงวันที่ที่เลือก" / "filtered to the selected date range" copy (when one is) — so the caption never claims behavior the query isn't actually doing. `RevenueTrend`'s same documented exception (mentioned in this issue's writeup, not itself the Critical/High-named item) was intentionally left as-is — it's supporting-detail, not the required Sales Activity Analytics section, and changing it wasn't in this pass's explicit scope.
- **High #2 — No-data behavior hides the required KPI cards.** Fixed. `DashboardPage.tsx` no longer wraps every section in `{!hasAnyData ? <EmptyState/> : (...)}`. The four required KPI cards, Status Summary, Sales Activity Analytics, Recent Activity Details, and all supporting-detail sections now always render (each already has its own per-widget "no data" fallback for a genuinely empty result — unchanged). When `hasAnyData` is false, a compact inline banner ("ยังไม่มีข้อมูลธุรกิจ") renders above the KPI cards instead of replacing the page — communicates the same thing without hiding the required zero-valued KPIs the business spec calls for.
- **Medium #1 — Expected Sales uses truthy instead of `=== true`.** Fixed. All three `isPotentialOpportunity` predicates in `api/dashboard/index.ts` (`expectedSales` KPI, `salesPerformance[].expectedRevenue`, `forecast`'s `openOpportunities` filter) now use strict `q.isPotentialOpportunity === true` instead of a truthy check, closing the theoretical gap where a stray non-boolean truthy value (e.g. the string `"false"`) on a legacy/externally-written document would have been miscounted.
- **High #3 — No soft-delete predicate on Dashboard quote queries.** Addressed via the review's own offered alternative resolution, not a code filter: confirmed by grep that `Quote`/`QuoteFields` has **no** `isDeleted`/soft-delete field anywhere in the schema today (`src/lib/quotes.tsx`, `api/_lib/collections.ts`) — quotations are only ever removed from "active" via the `ยกเลิก` (Cancelled) status. Adding a MongoDB filter on a field that can never be set would be dead code implying a deletion feature that doesn't exist, which conflicts with "don't add speculative code for scenarios that can't happen." Documented explicitly instead, as a code comment directly above every Dashboard quote-query match object in `api/dashboard/index.ts` and in DATABASE.md/MODULES/Dashboard.md, with an explicit instruction that every quote query in the file must be updated together if a real soft-delete field is ever introduced.

### Remaining (not fixed this pass, with reason)

- **Medium #2 — Pre-tax reconstructed from `amount / 1.07` rather than a persisted pre-tax field.** Not changed. The review itself confirms this is correct for all current data (no intermediate rounding, `VAT_RATE` always a fixed 7%). Persisting a canonical `subtotal`/`amountBeforeVat` field at write time is a schema migration (new field, backfill for existing quotes, write-path changes in `api/handlers/quotes.ts`/`quoteValidation.ts`) — out of scope for a Dashboard-focused fix pass and not flagged Critical/High. Tracked in TODO.md.
- **Medium #3 — Free-text salesperson/department matching, actor- vs. quotation-based activity attribution.** Not changed. This is a pre-existing, already-documented data-model limitation (see MODULES/Dashboard.md "Data-model caveats") that predates this review; fixing it needs a real `User.id`-referencing `salespersonId`/`departmentId` on `Quote` and on audit-log entries — a schema change affecting the Quotation module, not a Dashboard-only fix, and explicitly out of this pass's "do not redesign unrelated modules" instruction.
- **Medium #4 — Unbounded audit-log read for activity analytics.** Partially improved as a side effect of the High #1 fix (the query is now bounded by `createdAt` whenever a date filter is selected), but remains unbounded when no filter is applied (the default view) — same as `revenueTrend`'s existing rolling-window convention. A hard floor (e.g. cap at the widest displayed window, 5 years) wasn't added this pass since it changes default-view behavior beyond what the review flagged as Critical/High.
- **Low #1/#2 — `fmtShort()` compact number formatting, status-grouping constants embedded in Dashboard code.** Not changed — both Low Priority, cosmetic/architectural preferences, not correctness issues, and out of this pass's Critical/High-first scope.

### Files changed

`api/dashboard/index.ts`, `src/lib/dashboard.ts`, `src/pages/dashboard/DashboardPage.tsx`, `src/pages/dashboard/SalesActivityAnalytics.tsx`, `src/lib/i18n.tsx`. Docs: this file, CLAUDE.md, PROJECT_STATUS.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.

### Pre-tax calculation fields used

Unchanged from the prior pass (this review found it correct): `preTaxAmount(amount) = amount / (1 + VAT_RATE/100)`, `VAT_RATE = 7`, applied to `docs[].amount` once after fetch (covering all KPI/pipeline/salesPerformance/customerAnalytics/jobTypeAnalytics/forecast/`approvalDashboard.pendingList` derivations) plus explicitly at `revenueTrend`'s won-quote scan and `followUps`' read site.

### Build result

`tsc --noEmit -p tsconfig.json` — clean. `tsc --noEmit -p tsconfig.api.json` — clean. `npm run lint` — clean (2 pre-existing, unrelated warnings in `src/lib/i18n.tsx` about fast-refresh export granularity). `npm run build` — clean, `dist/` produced successfully.

### Manual test result

This sandboxed session has no live MongoDB path (`.env.local` has no `MONGODB_URI`; no Vercel CLI installed to `vercel env pull` one) — same limitation this review itself hit ("WSL 1 is not supported... Could not determine Node.js install directory" — a different but equally blocking environment issue on the review's own side). Verified instead via a temporary, isolated Playwright preview harness (`src/devPreview.tsx` + `dashboard-preview.html`, deleted after use) that specifically targeted this review's findings: rendered `ExecutiveSummaryCards`/`QuotationStatusSummary`/`SalesActivityAnalytics` together under a "simulating a Sales User (dashboard:view only, not auditLog:view)" label to confirm Sales Activity Analytics now renders in that scenario (previously it would have been `null`/hidden); rendered `SalesActivityAnalytics` twice with `dateFiltered={false}` and `dateFiltered={true}` to confirm the caption text correctly switches; rendered the new compact empty-state banner markup to confirm it's a small inline element, not a full-page block. All four rendered correctly with zero console errors. This confirms the **UI/permission-gate logic**; the actual MongoDB query bounding (`activityMatch.createdAt`) is verified by code review and `tsc`, not independently exercised against a real audit-log dataset — a live-database pass should confirm a real date-range selection actually narrows the returned activity counts.

### What Codex should review next

1. Confirm against a real deployment that selecting a narrow date range (e.g. "Today") on Sales Activity Analytics now shows genuinely reduced/zero activity for older periods, not just that the UI caption changed.
2. Confirm a Sales User/Approver/Viewer-role login now actually sees the Sales Activity Analytics section end-to-end (this pass verified the underlying permission logic and component rendering in isolation, not a full authenticated session as those specific roles).
3. Re-assess whether the remaining Medium items (persisted pre-tax field, ID-based salesperson/department matching, bounded activity-log aggregation) should be scheduled as their own follow-up passes, given they were confirmed correct-for-current-data but architecturally fragile.
4. Verify the empty-state banner reads correctly at mobile width (390px) — not visually checked this pass beyond the default preview viewport.
