# Module: Dashboard

## Purpose

Executive Business Intelligence dashboard — the landing view after sign-in. Gives real-time
read on sales performance: KPIs, a sales pipeline funnel, rankings, forecasts, follow-up
reminders, and activity/approval feeds. **Every number on this page comes from a real MongoDB
query** (`GET /api/dashboard`) — no hardcoded/sample/template data anywhere. Originally shipped
2026-07-09 as a 7-KPI/2-chart page; **majorly rebuilt 2026-07-10** into the full Executive
Dashboard described here, driven by the new Job Type/Potential Opportunity/Follow-up Date
fields added to `Quote` in the same pass (see [Quotation.md](./Quotation.md)).

## Business Flow

1. User signs in → lands on Dashboard by default (`activeNav` initial state in `App.tsx`).
2. On mount, `DashboardPage` calls `fetchDashboardStats(filters)` (`src/lib/dashboard.ts`) and
   shows a loading skeleton until it resolves; a small spinner (not a full-page skeleton) shows
   during subsequent filter-driven refetches so the page doesn't flash blank on every filter
   change.
3. **Filters** (`DashboardFilterBar.tsx`): date-range presets (Today/Yesterday/Last 7/14 Days/
   This Month/Last Month/This Quarter/This Year/Custom Range/All Time) plus a salesperson
   dropdown (populated from `availableSalespeople`, which only lists people who actually have
   quotes). Every section on the page recomputes from the filtered result set — there's no
   partially-filtered widget.
4. If both `totalQuotations` and `totalProducts` are `0` (a genuinely empty database), the page
   shows a single empty state instead of a wall of zeros. Every individual chart/table also has
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
- **Customer analytics group by the free-text `Quote.client` string.** Name variations/typos
  (e.g. "ABC Co." vs. "ABC Company") will undercount repeat customers and split one real
  customer across multiple rows, until a real `Customer` entity exists that quotes reference by
  ID instead of free text.
- **`QuotationTrendChart` reuses the monthly *revenue* series** as its trend line, rather than a
  dedicated monthly quotation-*count* aggregation (not built this pass, to keep scope bounded).
- **`RevenueByJobTypeChart` is a plain bar chart**, not literally "stacked" by status — the
  backend doesn't compute a per-job-type-per-status breakdown.
- **`forecast` (thisMonth/thisQuarter/thisYear) is a live weighted estimate**, not a stored
  prediction — open `isPotentialOpportunity` quote value in each period × the trailing-12-month
  win rate, recomputed on every request. No ML, no `forecast` collection.

## Pages / Components

`src/pages/dashboard/` was split from a single file into:

- `DashboardPage.tsx` — top-level: filter state, fetch orchestration, empty-state/loading gate,
  composes every section below.
- `DashboardFilterBar.tsx` — date-range presets + salesperson filter.
- `KpiGrid.tsx` — ~20 KPI cards (see Current Features).
- `PipelineFunnel.tsx` — recharts `FunnelChart` + a clickable per-stage table (count/value/
  conversion %). Conversion % uses an explicit predecessor map (`PIPELINE_PREDECESSOR` in
  `api/dashboard/index.ts`) mirroring the real workflow state machine, **not** simple
  array-adjacency — the workflow branches (Sent to Customer → Accepted *or* Rejected), so a
  naive "previous row in the table" comparison would produce a nonsensical percentage for the
  Customer Rejected/Lost branch.
- `SalesPerformanceTable.tsx` — one table component, two uses: the full "Sales Performance"
  section (every salesperson) and the "Executive Ranking" (top 10 by revenue, sortable) — same
  underlying `salesPerformance` array from the API, sorted/sliced client-side.
- `JobTypeAnalytics.tsx`, `CustomerAnalytics.tsx` — revenue/win-rate/top-N breakdowns.
- `ActivityTimeline.tsx` — recent `audit_log` entries. **Only rendered when the API response's
  `activityTimeline` is non-null**, i.e. only for callers with `auditLog:view`.
- `FollowUpReminders.tsx` — Today/Overdue/Upcoming, each item clickable.
- `ApprovalDashboard.tsx` — pending/approved-today/rejected-today/avg approval time. **Only
  rendered when the caller has `quotations:approve`** (response field is `null` otherwise).
- `NotificationSummary.tsx` — the caller's own unread count + breakdown by type.
- `DashboardCharts.tsx` — shared `ChartCard` wrapper (`ChartCard.tsx`) plus every named chart:
  `RevenueTrendChart`, `QuotationTrendChart`, `SalesByEmployeeChart`, `RevenueByJobTypeChart`,
  `QuotationStatusDonut`, `WinLoseDonut`, `ExpectedSalesForecastChart`,
  `MonthlyClosingRateChart`, `ProductsByCategoryChart` (the original category donut, moved here
  for consistency).
- `format.ts` / `dateRanges.ts` — number/date formatting helpers and date-range-preset math,
  extracted since they're now used across many of the files above.

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

- `GET /api/dashboard?from=&to=&salesperson=` (`api/dashboard/index.ts`) — gated by
  `dashboard:view`. See [API.md](../API.md).

## Permissions

`dashboard:view` (every default role has it, unchanged) gates the whole page. Two sections are
additionally, individually gated by a permission the caller already needs elsewhere:
`activityTimeline` by `auditLog:view`, `approvalDashboard` by `quotations:approve`. No new
`Permission` was added for this pass — see [RBAC.md](../RBAC.md).

## Current Features

- ~20 KPI cards: Total Quotations, Total Quotation Value, Closed Sales, Expected Sales, Average
  Deal Size, Win Rate, Lose Rate, Conversion Rate, Average Approval Time, Average Closing Time,
  Active/Expired Quotations, Overdue Follow-ups, New/Repeat Customers, plus the original Total
  Customers/Leads/Products, Won/Lost Deals
- Date-range + salesperson filters, applied server-side, driving every widget on the page
- Sales Pipeline funnel (recharts `FunnelChart`) + clickable per-stage breakdown table
- Sales Performance table (every salesperson) + Executive Ranking (top 10, sortable)
- Job Type Analytics (revenue/win-rate/avg deal size per job type)
- Customer Analytics (top by revenue/quotation count/won count, tabbed; repeat-customer %)
- Sales Forecast (this month/quarter/year, weighted by historical win rate)
- Follow-up Reminders (Today/Overdue/Upcoming, click-through to a filtered quotation list)
- Approval Dashboard (pending/approved-today/rejected-today/avg approval time) — approvers only
- Notification Summary (the caller's own unread count + by-type breakdown)
- Activity Timeline (recent audit log entries) — `auditLog:view` holders only
- 9 charts total: Revenue Trend, Quotation Trend, Sales by Employee, Revenue by Job Type,
  Quotation Status donut, Win/Lose donut, Expected Sales forecast, Monthly Closing Rate,
  Products by Category donut — every chart has its own empty state
- Full page-level empty state when there's no quotation or product data at all
- Thai/English via `useI18n()` — ~80 new dictionary keys added for this pass

## Future Improvements

- `totalCustomers`/`totalLeads` will start returning real non-zero numbers once the CRM module
  (schema already prepped, see [Customer.md](./Customer.md)/[Lead.md](./Lead.md)) gets API
  routes + UI — no Dashboard code changes needed when that happens.
- Report Export (PDF/Excel/CSV) — explicitly deferred from this pass, needs a new dependency for
  Excel and a new print layout for PDF; should be built against this now-stable dashboard shape.
- Real Customer/Lead entities would fix the free-text-matching caveats above and let the
  pipeline start at "Lead" instead of "Draft."
- A dedicated monthly quotation-count aggregation would make `QuotationTrendChart` show real
  count-over-time instead of reusing the revenue series.
- Once RBAC scoping is desired, cross-salesperson rankings/performance data could be restricted
  for the Sales User role (currently visible to any `dashboard:view` holder, same as every other
  KPI) — not built, no requirement for it yet, would need a new permission.

## Known Issues

- None functional. `totalCustomers`/`totalLeads` correctly read `0` until the CRM module ships
  — this is the intended "empty database → display 0" behavior, not a bug. See "Data-model
  caveats" above for the free-text customer-matching and simplified-chart caveats, which are
  documented tradeoffs, not bugs.
