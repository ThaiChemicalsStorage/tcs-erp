# Module: Dashboard

## Purpose

Executive Business Intelligence dashboard — the landing view after sign-in. Gives real-time
read on sales performance: KPIs, a sales pipeline funnel, rankings, forecasts, follow-up
reminders, and activity/approval feeds. **Every number on this page comes from a real MongoDB
query** (`GET /api/dashboard`) — no hardcoded/sample/template data anywhere. Originally shipped
2026-07-09 as a 7-KPI/2-chart page; majorly rebuilt 2026-07-10 into a ~20-KPI Executive
Dashboard; **completed against the full Executive Dashboard business spec later the same day**
(second 2026-07-10 pass) — Pending Approvals list with inline Approve/Reject, Non-Active Jobs
KPI, Department filter, Revenue Trend weekly/quarterly/yearly grouping, Job Type Distribution
chart, full Sales/Customer/Job Type ranking tables (Total Value alongside Won Value everywhere,
Last Quotation Date, full sortability), and Won/Lost-aware Average Closing Time. Driven by the
Job Type/Potential Opportunity/Follow-up Date fields added to `Quote` earlier the same day (see
[Quotation.md](./Quotation.md)).

## Business Flow

1. User signs in → lands on Dashboard by default (`activeNav` initial state in `App.tsx`).
2. On mount, `DashboardPage` calls `fetchDashboardStats(filters)` (`src/lib/dashboard.ts`) and
   shows a loading skeleton until it resolves; a small spinner (not a full-page skeleton) shows
   during subsequent filter-driven refetches so the page doesn't flash blank on every filter
   change. Approving/rejecting a quote from the Pending Approvals list triggers the same silent
   background refetch (no skeleton) so every other filter-scoped widget stays consistent with the
   new pending-approvals count.
3. **Filters** (`DashboardFilterBar.tsx`): date-range presets (Today/Yesterday/Last 7/14 Days/
   This Month/Last Month/This Quarter/This Year/Custom Range/All Time), a Department dropdown,
   and a salesperson dropdown (populated from `availableSalespeople`/`availableDepartments`,
   which only list people/departments who actually have quotes or exist as users respectively).
   Selecting a department resolves server-side to "every salesperson whose `User.department`
   matches" (free-text join, see caveats below) and composes with an also-selected individual
   salesperson via `$and`. Nearly every section respects both filters. The date-range filter is
   deliberately **not** applied to the *start* of the four Revenue Trend series (weekly/monthly/
   quarterly/yearly) or the forecast's historical win-rate baseline — collapsing a 12-point trend
   to a single selected day would defeat its purpose — but the *end* of that rolling window does
   move with the selected `to` date (or today), so the date filter is never purely cosmetic even
   there. Follow-up Reminders **do** fully respect the date-range filter (changed 2026-07-10,
   second pass — previously date-range-agnostic by design; the Dashboard spec explicitly requires
   every widget to respect the filter, so a follow-up tied to a quote issued outside the selected
   window is now excluded like everywhere else).
4. If the database has `hasAnyData: false` (no quotations *at all*, in any filter, and no
   products), the page shows a single empty state instead of a wall of zeros. This is a distinct
   signal from the current filter matching zero results — the latter shows real zero-valued
   KPIs/empty-per-widget-states rather than hiding the whole page (fixed 2026-07-10; a narrow
   filter like "Today" used to incorrectly hide the entire dashboard even with years of real
   history). Every individual chart/table also has
   its own inline "no business data" note if its specific slice of data is empty even when the
   overall database isn't (e.g. no follow-ups scheduled yet).
5. Clicking a sales-pipeline stage or a follow-up reminder navigates to the Quotation module
   with that stage's status (or that reminder's customer) pre-applied as a list filter — see
   "Click-through to Quotations" below.

## Data-model caveats (read before trusting a number)

The Dashboard is built entirely on data that already exists — no new Lead/Customer entities
were created for it (that's a separately tracked, much larger backlog item). Two consequences,
documented rather than silently assumed:

- **Pipeline starts at "Draft," not "Lead."** No Lead entity exists to feed an earlier stage.
  The pipeline also has no distinct "Negotiating" stage — the 9-stage real workflow (Draft →
  Pending Approval → Approved → Sent to Customer → Customer Accepted/Rejected → Won/Lost,
  Cancelled) is used as-is rather than remapped to the business spec's generic 7-stage funnel,
  since inventing a "Negotiating" bucket with no backing status would itself be fake data.
- **Customer analytics group by the free-text `Quote.client` string.** Name variations/typos
  (e.g. "ABC Co." vs. "ABC Company") will undercount repeat customers and split one real
  customer across multiple rows, until a real `Customer` entity exists that quotes reference by
  ID instead of free text.
- **Department filtering is a free-text join, not a real relationship.** `User.department` is a
  free-text field (no `Department` entity yet — see [DATABASE.md](../DATABASE.md)); the
  Dashboard resolves "department X" to "every `User` whose `department` field equals X" and then
  filters quotes by that user's `fullName` matching `Quote.salesperson` (itself already free
  text). The same name-variation caveat as customer matching applies.
- **`QuotationTrendChart` reuses the monthly *revenue* series** as its trend line, rather than a
  dedicated monthly quotation-*count* aggregation (not built this pass, to keep scope bounded).
- **`revenue`/`totalValue` naming convention, used consistently across `salesPerformance`,
  `customerAnalytics`, and `jobTypeAnalytics`:** `revenue` (and the Sales Ranking table's "Closed
  Sales" column) means **Won-only** value; `totalValue` means every quotation's value regardless
  of outcome. Both are always returned side by side per the business spec's "Total Quotation
  Value" vs. "Closed Sales/Won Value" requirement — earlier in this module's history some of
  these only exposed the won subset, which under-reported total pipeline value.
- **`forecast` (thisMonth/thisQuarter/thisYear) is a live weighted estimate**, not a stored
  prediction — open `isPotentialOpportunity` quote value in each period × the trailing-12-month
  win rate, recomputed on every request. No ML, no `forecast` collection.

## Pages / Components

`src/pages/dashboard/` was split from a single file into:

- `DashboardPage.tsx` — top-level: filter state, fetch orchestration, empty-state/loading gate,
  composes every section below.
- `DashboardFilterBar.tsx` — date-range presets + Department filter + salesperson filter.
- `KpiGrid.tsx` — KPI cards (see Current Features), incl. Pending Approvals and Non-Active Jobs.
- `PipelineFunnel.tsx` — recharts `FunnelChart` + a clickable per-stage table (count/value/
  conversion %). Conversion % uses an explicit predecessor map (`PIPELINE_PREDECESSOR` in
  `api/dashboard/index.ts`) mirroring the real workflow state machine, **not** simple
  array-adjacency — the workflow branches (Sent to Customer → Accepted *or* Rejected), so a
  naive "previous row in the table" comparison would produce a nonsensical percentage for the
  Customer Rejected/Lost branch.
- `SalesPerformanceTable.tsx` — one table component, two uses: the full "Sales Performance"
  section (every salesperson) and the "Executive Ranking" (top 10 by revenue, sortable) — same
  underlying `salesPerformance` array from the API, sorted/sliced client-side. 11 columns, all
  but the salesperson name itself sortable: Jobs, Total Value, Revenue (Closed Sales), Expected
  Revenue, Won, Lost, Pending, Conversion Rate, Avg. Deal Size, Avg. Closing Time.
- `JobTypeAnalytics.tsx` — sortable table (Code/Name/Jobs/Total Value/Won Value/Win Rate/Avg.
  Deal Size), one row per **active job type in the master list** (zero-quote job types render as
  a real zero row, not omitted; any code on a real quote that's since been deactivated is still
  appended so historical data is never dropped).
- `CustomerAnalytics.tsx` — sortable-by-tab table (Customer/Quotations/Total Value/Won Value/
  Last Quotation Date), 4 ranking tabs: Top Revenue, Most Quotations, Most Won, Most Repeat
  (customers with >1 quotation, ranked by count).
- `ActivityTimeline.tsx` — recent `audit_log` entries. **Only rendered when the API response's
  `activityTimeline` is non-null**, i.e. only for callers with `auditLog:view`.
- `FollowUpReminders.tsx` — Today/Overdue/Upcoming, each item clickable.
- `ApprovalDashboard.tsx` — pending/approved-today/rejected-today/avg approval time stat tiles,
  **plus** a Pending Approvals list (Quotation No./Customer/Salesperson/Amount/Submitted Date)
  with inline Approve/Reject actions calling the same `performWorkflowAction()` used by the
  Quotation module's own approval flow. Reject requires a comment (inline textarea), matching the
  existing workflow rule. **Only rendered when the caller has `quotations:approve`** (response
  field is `null` otherwise); the Reject button additionally requires `quotations:reject`
  (`approvalDashboard.canReject`, server-computed).
- `NotificationSummary.tsx` — the caller's own unread count + breakdown by type.
- `DashboardCharts.tsx` — shared `ChartCard` wrapper (`ChartCard.tsx`, now supports an `actions`
  slot for the Revenue Trend grouping toggle) plus every named chart: `RevenueTrendChart`
  (weekly/monthly/quarterly/yearly toggle, backed by `revenueTrend` in the API response),
  `QuotationTrendChart`, `SalesByEmployeeChart`, `RevenueByJobTypeChart` (horizontal grouped bar,
  Total Value + Won Value, all active job types — no top-N cutoff), `JobTypeDistributionChart`
  (new — quotation *count* donut by job type), `QuotationStatusDonut`, `WinLoseDonut`,
  `ExpectedSalesForecastChart`, `MonthlyClosingRateChart`, `ProductsByCategoryChart`.
- `format.ts` / `dateRanges.ts` — number/date/period-label formatting helpers and date-range-
  preset math, extracted since they're now used across many of the files above.

## Click-through to Quotations

Clicking a pipeline stage or a follow-up reminder should "open the filtered quotation list."
Full per-quote deep-linking (`QuotationPage`'s `view`/`selectedId` state lifted to `App.tsx`) is
a separately tracked, larger gap that this pass didn't take on. Instead: a lightweight
`quotationListFilter` (`{ status?: QuoteStatus; client?: string }`, exported as
`QuotationListFilter` from `DashboardPage.tsx`) is lifted to `App.tsx`, set by
`DashboardPage`'s `onNavigateToQuotations` callback, and consumed exactly once by
`QuotationPage`/`QuoteList` on mount (a `useRef` guard, not a `[]`-deps effect, so it stays
`react-hooks/exhaustive-deps`-clean while still only firing once — `QuotationPage` fully
unmounts/remounts every time nav switches away from and back to "quotations," so "once per
mount" already means "once per fresh visit"). `QuoteList.tsx` gained a dismissible client-name
filter chip to support the "client" half of this.

## Database Tables

None owned by this page — it's a read-only aggregation over `customers`, `leads`, `quotes`,
`products`, `categories`, `audit_log`, `notifications`. See [DATABASE.md](../DATABASE.md)
"Dashboard KPI/chart aggregation" for the exact computation behind every field.

## APIs

- `GET /api/dashboard?from=&to=&salesperson=&department=` (`api/dashboard/index.ts`) — gated by
  `dashboard:view`. See [API.md](../API.md).
- Approve/Reject actions from the Pending Approvals widget reuse the existing
  `POST /api/quotes/:id/workflow` route (same one the Quotation module's own approval buttons
  call) — no new API route was added for this.

## Permissions

`dashboard:view` (every default role has it, unchanged) gates the whole page. Sections are
additionally, individually gated by a permission the caller already needs elsewhere:
`activityTimeline` by `auditLog:view`; `approvalDashboard` (stat tiles + Pending Approvals list)
by `quotations:approve`; the list's Reject button additionally by `quotations:reject`
(`approvalDashboard.canReject`). No new `Permission` was added for this pass — see
[RBAC.md](../RBAC.md).

## Current Features

- KPI cards: Total Quotations, Total Quotation Value, Closed Sales, Expected Sales, Average
  Deal Size, Win Rate, Lose Rate, Conversion Rate, Average Approval Time, Average Closing Time
  (Won- and Lost-aware), Active/Non-Active/Expired Quotations, Pending Approvals, Overdue
  Follow-ups, New/Repeat Customers, plus Total Customers/Leads/Products, Won/Lost Deals
- Date-range + Department + salesperson filters, applied server-side, driving every widget on
  the page (see the date-filter propagation note above for the one deliberate exception)
- Sales Pipeline funnel (recharts `FunnelChart`) + clickable per-stage breakdown table
- Sales Performance table (every salesperson, all 11 spec columns) + Executive Ranking (top 10,
  sortable)
- Job Type Analytics — sortable table, all active job types (zero-quote types included)
- Customer Analytics — sortable-by-tab table incl. Last Quotation Date, 4 ranking tabs
- Sales Forecast (this month/quarter/year, weighted by historical win rate)
- Follow-up Reminders (Today/Overdue/Upcoming, click-through to a filtered quotation list,
  now respects the date-range filter)
- Approval Dashboard — pending/approved-today/rejected-today/avg approval time stat tiles, plus
  an actionable Pending Approvals list with inline Approve/Reject — approvers only
- Notification Summary (the caller's own unread count + by-type breakdown)
- Activity Timeline (recent audit log entries) — `auditLog:view` holders only
- 10 charts total: Revenue Trend (weekly/monthly/quarterly/yearly toggle), Quotation Trend,
  Sales by Employee, Revenue by Job Type (Total + Won Value, grouped bars), Job Type
  Distribution (quotation count), Quotation Status donut, Win/Lose donut, Expected Sales
  forecast, Monthly Closing Rate, Products by Category donut — every chart has its own empty
  state
- Full page-level empty state when there's no quotation or product data at all
- Thai/English via `useI18n()` — dictionary keys added for every new label/column in this pass

## Future Improvements

- `totalCustomers`/`totalLeads` will start returning real non-zero numbers once the CRM module
  (schema already prepped, see [Customer.md](./Customer.md)/[Lead.md](./Lead.md)) gets API
  routes + UI — no Dashboard code changes needed when that happens.
- Report Export (PDF/Excel/CSV) — explicitly deferred again this pass, needs a new dependency for
  Excel and a new print layout for PDF; should be built against this now-stable dashboard shape.
  No dead/placeholder button exists for it anywhere in the UI.
- Real Customer/Lead/Department entities would fix the free-text-matching caveats above (customer
  grouping, department filtering) and let the pipeline start at "Lead" instead of "Draft."
- A dedicated monthly quotation-count aggregation would make `QuotationTrendChart` show real
  count-over-time instead of reusing the revenue series.
- Activity Timeline is a flat recent-N feed from `audit_log`, not grouped by period or
  filterable by salesperson/job type — a real gap against a fully general "Activity Analytics"
  requirement, not scoped into this pass.
- Once RBAC scoping is desired, cross-salesperson rankings/performance data could be restricted
  for the Sales User role (currently visible to any `dashboard:view` holder, same as every other
  KPI) — not built, no requirement for it yet, would need a new permission.

## Known Issues

- None functional. `totalCustomers`/`totalLeads` correctly read `0` until the CRM module ships
  — this is the intended "empty database → display 0" behavior, not a bug. See "Data-model
  caveats" above for the free-text customer/department-matching and simplified-chart caveats,
  which are documented tradeoffs, not bugs.
- This pass's changes are verified via `tsc --noEmit` (both `tsconfig.json` and
  `tsconfig.api.json`), `npm run lint`, and `npm run build` — all clean. Live browser/API
  verification against real MongoDB data could **not** be completed in the session that made
  these changes: the sandboxed execution environment's Node process cannot resolve MongoDB
  Atlas's `mongodb+srv://` DNS SRV record (`querySrv ECONNREFUSED`), even though the OS-level
  resolver and raw TCP to the resolved shard hosts both work — an environment/network limitation,
  reproduced identically on a pre-existing, untouched route (`GET /api/auth/session`), not a
  defect introduced by this pass. **Recommend a follow-up manual pass** (or CI/preview-deployment
  run) clicking through every filter/table/chart/action described above against real production
  data before considering this fully verified end-to-end.
