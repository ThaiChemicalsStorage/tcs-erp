# Module: Dashboard

## Purpose

Executive Business Intelligence dashboard — the landing view after sign-in. Gives real-time
read on sales performance: KPIs, a sales pipeline, rankings, forecasts, follow-up
reminders, and activity/approval feeds. **Every number on this page comes from a real MongoDB
query** (`GET /api/dashboard`) — no hardcoded/sample/template data anywhere. Originally shipped
2026-07-09 as a 7-KPI/2-chart page; majorly rebuilt 2026-07-10 into a ~20-KPI Executive
Dashboard; completed against the full Executive Dashboard business spec later the same day
(second pass) — Pending Approvals list with inline Approve/Reject, Non-Active Jobs
KPI, Department filter, Revenue Trend weekly/quarterly/yearly grouping, Job Type Distribution
chart, full Sales/Customer/Job Type ranking tables (Total Value alongside Won Value everywhere,
Last Quotation Date, full sortability), and Won/Lost-aware Average Closing Time; fixed against an
independent Codex review (third pass, same day) — see CHANGELOG.md for that pass's detail; then
**visually redesigned** (fourth pass, same day) — the flat KPI grid was split into a tiered
hero-card/mini-card hierarchy and the funnel-shaped pipeline chart (labels overlapping, reading
as unprofessional) was replaced with horizontal pipeline step cards. **2026-07-13, three more
same-day passes**: the tiered KPI hierarchy was reverted back to a single flat `KpiGrid` (first
pass); further feedback that even the flat 22-card grid still read as cluttered led to a
reorganization into 4 primary KPI cards (`ExecutiveSummaryCards.tsx`) plus 2 compact panels
(`SalesPerformancePanel.tsx`, `ActivityFollowUpSummary.tsx`) alongside `QuotationStatusSummary`,
with pipeline step cards/`SalesActivityAnalytics`/rankings/actionable approval-follow-up lists
moved below an "In-Depth Detail" divider (second pass); a fully-specified 7-section order then
promoted `SalesActivityAnalytics` back into the top overview (between `SalesPerformancePanel` and
`ActivityFollowUpSummary`) and added Active/Non-Active Quotations to `SalesPerformancePanel`
(third pass). A **fourth same-day pass** (sixth overall) fixed 4 High Priority data/filter-
correctness issues an independent review found: Sales Activity expanded from 2 to all 5 tracked
event categories, filter-exception widgets gained explicit "not filtered"/"rolling trend" labels,
and `QuotationStatusSummary`'s count/value population mismatch was fixed at the source. A **fifth
same-day pass** (seventh overall) then completed the Dashboard against a detailed P'Keng/P'Kee
business-stakeholder requirement: the top overview was reordered to the requirement's exact
5-row layout (`ExecutiveSummaryCards` → `QuotationStatusSummary` → `SalesActivityAnalytics` →
`ActivityTimeline`), with `SalesPerformancePanel`/`ActivityFollowUpSummary`/the forecast chart
moved into supporting detail below; all 4 KPI cards gained a helper caption; `SalesActivityAnalytics`
gained a per-salesperson breakdown table (`bySalesperson`, period × salesperson); `ActivityTimeline`
was rebuilt as a table with clickable quotation-number links (new `relatedQuoteId`/
`relatedCustomerName` audit-log fields); and the Win/Lose/Active/Non-Active mapping was
reconfirmed unchanged after the requirement doc proposed a conflicting one (user decision — see
UI_GUIDELINES.md). Pipeline step cards, rankings, actionable approval/follow-up lists, and the
remaining charts stayed below the divider throughout all five passes. See "Pages / Components"
below for the current shape, and CHANGELOG.md for the full writeup of every pass. Driven by the
Job Type/Potential Opportunity/Follow-up Date fields added to `Quote` earlier on 2026-07-10 (see
[Quotation.md](./Quotation.md)).

**2026-07-14 — Pre-Tax Amount pass.** A follow-up P'Keng/P'Kee requirement: every Dashboard
monetary total must be the **pre-tax (before-VAT) amount**, never `Quote.amount` (the persisted
VAT-included grand total). The required-5-section layout, the 4 KPI cards, Win/Lose/Active/
Non-Active status summary, and Sales Activity Analytics with weekly/monthly/quarterly/yearly tabs
and a salesperson filter were all already in place from the 2026-07-13 passes above — this pass's
scope was strictly the amount-calculation rule and the labels that make it visible. See "Pre-Tax
Amount Rule" below for exactly how, and CHANGELOG.md for the full writeup.

**2026-07-14, second same-day pass — Codex-review fix (Critical + High Priority).** An independent
review of the Pre-Tax Amount pass (`docs/CODEX_REVIEW_REPORT.md`) found the Dashboard didn't
actually satisfy the business requirement end-to-end despite the correct pre-tax math: Sales
Activity Analytics — a *required* section — was Critically broken, silently invisible to every
default role except those with full audit-log access, because it shared `activityTimeline`'s
`auditLog:view` gate instead of the page's own `dashboard:view` gate. Two more High Priority
findings: the same section's query never actually applied the selected date range (so "Today"
still showed a full rolling trend of all-time data), and a wholly empty database hid the four
required KPI cards behind one full-page empty state instead of showing them at zero. All three
fixed, plus a folded-in Medium fix (Expected Sales now uses strict `isPotentialOpportunity ===
true`). See "Pages / Components," "APIs," and "Permissions" below for the specifics, and
CODEX_REVIEW_REPORT.md's "Claude Fix Status" section for the complete fixed/remaining breakdown.

**2026-08-14 — VAT toggle + Service summary card.** Two direct user requests landed together: (1)
the 2026-07-14 "always pre-tax" rule became a user-selectable pre-tax/post-tax toggle (still a
single global 7% rate, now covering the CSV/Excel exports too — see "VAT Toggle" below); (2)
Service, the only document module with zero Dashboard visibility, gained a summary card
(`ServiceSummary.tsx`) matching the existing Scope of Work/Delivery Order cards' pattern — see
"Pages / Components" below.

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
  these only exposed the won subset, which under-reported total pipeline value. **Both are
  pre-tax as of 2026-07-14** — see "Pre-Tax Amount Rule" below.
- **`forecast` (thisMonth/thisQuarter/thisYear) is a live weighted estimate**, not a stored
  prediction — open `isPotentialOpportunity` quote value in each period × the trailing-12-month
  win rate, recomputed on every request. No ML, no `forecast` collection.

## VAT Toggle (Pre-Tax / Post-Tax Amount), originally shipped 2026-07-14 as pre-tax-only, made a toggle 2026-08-14

Every monetary total the Dashboard displays or exports is computed in one of two selectable
modes — **pre-tax (before VAT)**, the long-standing default, or **post-tax (including VAT)**,
added 2026-08-14 per direct user request. This applies to `totalQuotationValue`, `closedSales`,
`expectedSales`, the Win/Lose/Active/Non-Active status values, `pipeline[].totalValue`,
`salesPerformance` (revenue/totalValue/expectedRevenue/avgDealSize), `customerAnalytics`
(revenue/totalValue), `jobTypeAnalytics` (revenue/totalValue/avgDealSize), `forecast`
(thisMonth/thisQuarter/thisYear), `revenueTrend`/`revenueByMonth`, `followUps[].amount`, and
`approvalDashboard.pendingList[].amount`. Every value in the CSV export (`csvExport.ts`) and the
Excel export (`xlsxExport.ts`, added 2026-07-24 — multi-sheet: Summary+KPIs / Sales Performance /
Top Customers / Job Types / Pipeline / Monthly Trend; `xlsx` package dynamic-imported on first
click) inherits whichever mode is currently selected on screen, since both are built from the
same already-fetched response — the exports were a direct part of this pass's scope, per explicit
user request that switching the toggle should also change what gets exported, not just what's on
screen.

**Still a single global 7% rate.** The toggle only changes *which* of the two already-existing
values is shown — it does **not** introduce a per-company/per-quote VAT rate. `VAT_RATE` in
`api/_lib/quoteAmounts.ts` stays a single hardcoded `7` constant, unchanged by this pass and
deliberately out of scope.

**Why this is exact, not an approximation, in either mode**: `Quote` has no persisted pre-tax/
subtotal field — `amount` is always the VAT-included grand total
(`afterDiscount * (1 + VAT_RATE/100)`, see `computeQuoteAmount()` in
`api/_lib/quoteValidation.ts`), computed with no intermediate rounding. Rather than reverse the
VAT out of `amount` (which would round-trip a division by a fixed rate that has never varied but
is fragile if it ever does), the Dashboard recomputes whichever figure is requested the same way
the server computed it going forward: directly from each quote's own `lines`/`discount` via the
shared `computeQuoteAmountBeforeVat(lines, discountPct)` / `computeQuoteAmountWithVat(lines,
discountPct)` pair (`api/_lib/quoteAmounts.ts`) — the same per-line reduction (`qty × unitPrice ×
(1 − itemDiscount/100)`, summed, then less the quote-level `discount`) that `computeQuoteAmount()`
itself starts from before adding VAT, with `computeQuoteAmountWithVat()` simply adding VAT on top
of that shared subtotal. This keeps the Dashboard and the Quotation create/edit path mathematically
unable to drift apart in either mode, and sidesteps the (small) precision loss of dividing a
VAT-included total back down.

**Implementation**: `GET /api/dashboard` accepts a new `?vat=pre|post` query param (default `pre`,
preserving the original pre-tax-only behavior for any caller that doesn't pass it). A local
`quoteAmount(lines, discountPct)` dispatcher in `api/dashboard/index.ts` picks
`computeQuoteAmountBeforeVat()` or `computeQuoteAmountWithVat()` based on the resolved `vatMode` at
the 3 places that compute money from raw `lines`/`discount`: the shared `docs[]` array (the
per-quote array every KPI/ranking/analytics computation derives from — computed exactly once,
right after the filtered `quotes.find()` fetch, so every downstream `.reduce()`/`.filter()` across
KPIs, pipeline, salesPerformance, customerAnalytics, jobTypeAnalytics, forecast, and
`approvalDashboard.pendingList` inherits the selected mode automatically), `followUps` (its own
separate query, same `lines`/`discount` projection), and `revenueTrend`'s won-quote scan. The
projection for all three fetches `lines`/`discount` instead of `amount` so the dispatcher always
has its real inputs. The selected mode is echoed back verbatim as `filters.vatMode` in the
response, so the frontend labels/exports what the server actually computed rather than trusting
its own pre-fetch UI state (e.g. a stale toggle position after a slow request).

**UI**: `DashboardFilterBar.tsx` renders a labeled toggle (the new shared `src/components/
Toggle.tsx`, extracted out of `SettingsPage.tsx` which now imports it instead of defining its own
copy) next to the other filters, unchecked (pre-tax) by default. **2026-08-14 same-day fix**: the
toggle's own wrapper `<div>` initially used a second, sibling `sm:ml-auto` alongside the
people-filters group's existing one — two flex siblings each claiming that auto-margin split the
leftover row space between them, floating the department/salesperson dropdowns mid-row instead of
flush right (caught via a user screenshot). Fixed by merging both into one shared `sm:ml-auto`
container; see the inline comment at that container in `DashboardFilterBar.tsx` — `DashboardPage.tsx` seeds
`filters.vatMode: "pre"` in its initial state and re-fetches whenever it changes, same as every
other filter. Every affected component receives a `vatMode` prop threaded down from
`stats.filters.vatMode` (the server-echoed value, not local state): `ExecutiveSummaryCards`,
`QuotationStatusSummary`, `SalesPerformancePanel`, `ExpectedSalesForecastChart`,
`RevenueTrendChart`, `RevenueByJobTypeChart`, `PipelineSteps`, both `SalesPerformanceTable` uses,
`CustomerAnalytics`, `JobTypeAnalytics`, `ApprovalDashboard`, and `FollowUpReminders`.

**UI labels**: every affected Thai label appends the mode via two new i18n keys,
`dashboard.vatSuffix.pre` ("ก่อนภาษี") / `dashboard.vatSuffix.post` ("รวม VAT 7%") — every
previously-hardcoded "ก่อนภาษี"/"Before VAT" literal across ~32 dictionary keys was stripped and
now gets the correct suffix appended dynamically at render time based on the active mode, instead
of a label baked permanently to one mode. See [UI_GUIDELINES.md](../UI_GUIDELINES.md) "Pre-Tax
Amount Labeling."

**Data-quality fallback for missing line data** (2026-07-14, Codex review Medium finding — a prior
draft of this doc/`DATABASE.md` over-claimed this case "cannot occur"): `computeQuoteAmountBeforeVat(q.lines
?? [], q.discount ?? 0)` treats a doc whose `lines` field is entirely *absent* (not the same as a
genuinely new Draft's legitimate `lines: []`) the same as a real zero-value quote — it silently
reports `$0` pre-tax rather than crashing the whole Dashboard or falling back to the VAT-included
`amount` (both of which would be worse: one denies every user the page, the other mixes VAT bases).
This is the deliberately safer of the three options, but it can understate historical totals if
such a document exists, and nothing in the UI currently calls it out per-record. Every quote has
carried a real `lines` array since the 2026-07-08 rewrite, so this is expected to be a null set in
practice — not verified against production data in this sandboxed session (see PROJECT_STATUS.md
"Known Risks"). `api/dashboard/index.ts` now emits a `console.warn` (grep-able in Vercel function
logs) naming the affected count whenever this fires, as lightweight telemetry until a real
per-record data-quality surface is worth building. If it ever fires against real data, treat it as
a signal to inspect those specific quotes by hand (`db.quotes.find({ lines: { $exists: false } })`)
— not a bug in this calculation rule itself.

## Revision Chain De-duplication (2026-07-22)

**Problem**: a "Rewrite/แก้ไข" action (added 2026-07-22, see [Quotation.md](./Quotation.md)
"Business Flow" item 6a) creates a brand-new MongoDB document per revision of a quotation —
`QT-2567-0041`, `QT-2567-0041-R1`, `QT-2567-0041-R2` are 3 separate documents that all represent the
same logical quotation. Before this fix, every Dashboard metric that counts or sums "quotations"
counted each of those 3 documents independently — reported by the user directly ("มูลค่าใบเสนอราคารวม
ก่อนภาษีมันรวมใบที่ rewrite ออกมาด้วย"), a real business-reporting bug, not a display nit: a ฿100,000
quotation rewritten twice would show up as ฿300,000+ of total value, 3 "quotations," etc.

**Fix (explicit 2026-07-22 business decision)**: every quote-count/-value aggregate must count each
revision chain **exactly once**, using the chain's **latest revision's data** — never the superseded
original, never a sum across every revision. If a chain has never been rewritten, its one document
is trivially "the latest." Implemented via a shared `dedupeQuotesByRevisionChain()` helper
(`api/_lib/quoteRevisions.ts`) — the same file `handleRewrite()` (`api/handlers/quotes.ts`) uses to
generate the next revision number, so the `-R<digits>` suffix parsing can never drift between the
two. Applied to every data source `api/dashboard/index.ts` feeds a quote-count/-value metric from:

- **`docs`** (the shared per-quote array — see "Pre-Tax Amount Rule" above) — fixes `totalQuotations`/
  `totalQuotationValue`/every other KPI, `pipeline`, `salesPerformance`, `customerAnalytics`'s
  `topBy*` rankings, `jobTypeAnalytics`, `forecast`'s `openOpportunities`, and
  `approvalDashboard`'s `pendingList` in one place, since all of them derive from `docs`.
- **Follow-ups** (`followUpDocsRaw` → `followUpDocs`) — a rewritten quotation with a follow-up date
  no longer surfaces as two separate reminders.
- **Repeat-customer classification** (`totalQuoteCountByClient`, feeding `newCustomers`/
  `repeatCustomers`/`customerAnalytics.repeatCustomerPercentage`) — this was previously a MongoDB
  `$group` count aggregate (`{ $group: { _id: "$client", count: { $sum: 1 } } }`), company-wide,
  unfiltered; converted to a raw `find({}, { projection: { client: 1 } })` fetch so the chain can be
  deduped in JS before counting — otherwise a client whose one real quotation had been rewritten
  twice would show a count of 3 and be wrongly classified as a repeat customer.
- **Forecast's historical win rate** (`historicalOutcomeDocsRaw`, trailing 12 months, company-wide) —
  previously a `$group`-by-status aggregate with `status: { $in: [Won, Lost] }` filtered at the Mongo
  level; converted to a raw fetch of every status in the window (the status filter can't run before
  dedup, since a chain's true outcome depends on its *latest* revision's status, which might not be
  Won/Lost even if an earlier revision was).
- **Monthly closing rate** (`monthlyOutcomeDocsRaw`) — same conversion, same reasoning, grouped by
  month+status in JS after dedup instead of via a `$group` pipeline.
- **Revenue trend** (`revenueTrendDocsRaw`, feeds `revenueTrend`/`revenueByMonth`) — previously
  queried `status: WON_STATUS` directly at the Mongo level; converted to fetch every status, dedupe,
  then filter to Won in JS — a chain only contributes revenue if its *latest* revision is Won, using
  that revision's own `lines`/`discount`, not the original's.

**Deliberately left un-deduped**: `totalQuotationsAllTime` (`quotes.estimatedDocumentCount()`) feeds
only the `hasAnyData` boolean gate ("is there any business data at all"), never a displayed number —
every revision is still a real document proving data exists, so double-counting there is harmless.
`activityTimeline`/`salesActivity` (the Recent Activity Details feed and the 5-category activity
counter) are audit-log **event** counters, not quotation-count aggregates — a rewrite is a genuine
event that happened and correctly appears once in `activityTimeline` as its own `"Quotation
Rewritten"` entry; it isn't in `salesActivity`'s tracked `ACTIVITY_ACTIONS` list at all (only
Created/Updated/Submitted/Approved/Rejected/Status Changed are), so it was never double-counted
there either — no change was needed for either widget.

**Cost tradeoff**: four queries (`revenueTrend`, repeat-customer classification, forecast's win
rate, monthly closing rate) moved from a MongoDB `$group` aggregation to a raw document fetch plus
JS-side grouping, so dedup can run before any counting/summing happens — this transfers more
documents per request than the previous aggregation pipelines did. Accepted given this app's scale
(a single internal company tool, not a high-volume multi-tenant product) and that the majority of
this file's queries (`docs`, `followUpDocsRaw`) already used this same fetch-then-reduce-in-JS
pattern rather than server-side aggregation.

**Verification**: `tsc --noEmit` (both tsconfigs), `lint`, `build` all pass clean.
`dedupeQuotesByRevisionChain()`'s core logic was sanity-checked against a synthetic chain (original
+ 2 rewrites, plus a standalone unrewritten quote, plus an edge case where only an `-R1` exists
with no fetched root) via a throwaway Node script — correctly collapsed the 2-rewrite chain to just
its `-R2` entry and left the other cases untouched. **Not verified against a live deployment/browser
with real rewritten quotation data** — same sandboxed-session no-MongoDB-network limitation as every
other pass in this project (see PROJECT_STATUS.md "Known Risks").

## Pages / Components

`src/pages/dashboard/` was split from a single file into:

- `DashboardPage.tsx` — top-level: filter state, fetch orchestration, empty-state/loading gate,
  composes every section below in the order described in "Section Order" below.
- `DashboardFilterBar.tsx` — date-range presets + Department filter + salesperson filter.
- `ExecutiveSummaryCards.tsx` — exactly 4 cards (Total Quotations, Total Quotation Value, Closed
  Sales, Expected Sales), the only "KPI card" tier on the page. Each card gained a one-line helper
  caption under its value (added 2026-07-13, seventh pass); `MetricInfoTooltip` still only on
  Expected Sales (the one non-obvious calculation among the 4).
- `QuotationStatusSummary.tsx` (added 2026-07-10, replaces `DashboardCharts.tsx`'s
  `QuotationStatusDonut` + `WinLoseDonut`) — one Win/Lose/Active/Non-Active donut + table (Status/
  Count/Value/Percentage columns, the last added 2026-07-13). Takes only a `kpis` prop (no
  `pipeline`, dropped 2026-07-13, sixth pass). Both count and value now come straight from
  `DashboardKpis` fields (`closedSales`/`lostValue`/`activeQuotationsValue`/
  `nonActiveQuotationsValue`) computed server-side with the *identical* predicate as their
  matching count — **previously** the value column was approximated by summing the `pipeline`
  prop's per-stage totals, which didn't carve out expired-but-unclosed quotes the way the counts
  did (an independent review correctly flagged this as a count/value population mismatch); now
  fixed at the source, no approximation left to document. **2026-07-13, eighth pass**: fixed a
  second review-flagged bug — the 4 rows previously double-counted Lost quotations (`เสียโอกาส`
  was in both the Lose row and the Non-Active row), so the Percentage column didn't sum to 100%.
  `NON_ACTIVE_OUTCOME_STATUSES` (`api/dashboard/index.ts`) no longer includes Lost; the 4 rows are
  now a true partition of every quote status. Full width in the top overview as of
  2026-07-13 (seventh pass) — no longer paired side-by-side with the forecast chart.
- `SalesActivityAnalytics.tsx` — quotation activity as a **stacked** bar chart + period table,
  week/month/quarter/year tabs, filtered server-side by salesperson/department. Third row of the
  top overview as of 2026-07-13 (seventh pass), full width. **2026-07-13, sixth pass**: expanded
  from 2 tracked categories (Created/Edited) to all 5 an independent review flagged as required —
  Created, Edited, Status Changed, Approval Requested, Approval Completed — via
  `categoryForAction()` in `api/dashboard/index.ts`, mapping every audit action
  `writeQuoteAuditEntry()` can write. **2026-07-13, eighth pass**: the "rolling trend, not limited
  by the filter's start date" caption now also states the actual anchor date it ends on
  ("— ending [date]") — an `anchorDate` prop computed in `DashboardPage.tsx` (`stats.filters.to`,
  or today via the new `todayIsoBangkok()` in `dateRanges.ts`) and formatted via the new
  `fmtDateShort()` in `format.ts`. `RevenueTrendChart` (in supporting detail, see below) got the
  identical treatment in the same pass.
  **2026-07-14, second same-day pass (independent Codex review fix — Critical + High)**: two
  fixes. (1) The section is **no longer gated by `auditLog:view`** — only `dashboard:view`, same as
  every other required section. Previously `api/dashboard/index.ts` returned `salesActivity: null`
  for any role without `auditLog:view` (Sales User, Approver 1/2, Viewer by default), so this
  *required* business section silently vanished for most real users — a Critical finding. (2) The
  underlying query now actually respects the date-range filter's `from`/`to` (bounded via
  `bangkokDayBoundsUtc`, same pattern `activityTimeline` already used) — previously an
  unconditional full-history scan regardless of the selected range, so the caption's "not limited
  by filter's start date" claim was true in a worse way than intended: the *required* section
  ignored the filter outright, not just as a documented, deliberate exception the way
  `RevenueTrendChart` does. A new `dateFiltered` prop (`DashboardPage.tsx` passes
  `!!stats.filters.from`) switches the caption between the original rolling-trend copy (no filter
  selected) and a new "กรองตามช่วงวันที่ที่เลือก" / "filtered to the selected date range" copy (a
  filter is selected) — see UI_GUIDELINES.md "Filter honesty" for the full before/after reasoning.
  **2026-07-13, seventh pass**: gained a second table below the chart, "สรุปตามพนักงานขาย" —
  ช่วงเวลา/พนักงานขาย/เปิดใบเสนอราคาใหม่/แก้ไขใบเสนอราคาเก่า/กิจกรรมรวม, sourced from the API's
  new `salesActivity.bySalesperson.{weekly,monthly,quarterly,yearly}`, Created/Edited only
  (matching the business requirement's named event types — distinct from the 5-category chart
  above it, which also tracks Status Changed/Approval Requested/Approval Completed).
- `ActivityTimeline.tsx` (rebuilt 2026-07-13, seventh pass) — "กิจกรรมล่าสุด" (Recent Activity
  Details), the 4th and final row of the top overview. Rebuilt from a card list into a table:
  วันที่/พนักงานขาย/กิจกรรม/ใบเสนอราคา/ลูกค้า columns. The quotation-number cell is a clickable
  gold link (`onOpenQuote`, wired to `App.tsx`'s existing `navigateToQuotation()`) when the entry
  carries a `relatedQuoteId`, else "—"; same for the customer-name cell and `relatedCustomerName`.
  **Only rendered when the API response's `activityTimeline` is non-null**, i.e. only for callers
  with `auditLog:view`.
- `SalesPerformancePanel.tsx` — Win/Lose/Conversion Rate, Average Deal Size, Average
  Approval/Closing Time, and (added 2026-07-13, third pass) Active/Non-Active Quotations — 8
  metrics as a compact label/value grid inside one `ChartCard`, not individual cards. Moved into
  supporting detail (below the top overview) as of 2026-07-13, seventh pass — real, still
  filter-aware data, just not named in the business requirement's required-5 list.
- `ActivityFollowUpSummary.tsx` — Pending Approvals, Overdue Follow-ups, Expired Quotations, New
  Customers as a compact 4-tile row inside one `ChartCard`; only Pending Approvals is clickable
  (navigates to the quotation list filtered to that status) since it's the only one with a real
  single-status filter to jump to. Moved into supporting detail as of 2026-07-13, seventh pass,
  same reasoning as `SalesPerformancePanel` above.
- `ScopeOfWorkSummary.tsx` (added 2026-07-23, per a direct user request to show "how many Scope of
  Work documents exist" on the Dashboard) — Total/Draft/Final as a compact tile row inside one
  `ChartCard`, same visual pattern as `ActivityFollowUpSummary` above (informational only, no tile
  is clickable — there's no Scope of Work list filter to jump to the way Pending Approvals has).
  **2026-07-29 (the "ทวง PO" feature)**: gained a 5th "ยังไม่มีเลข PO" tile (`noPo` — non-deleted
  records whose `customerPoNumber` is blank/absent, `$in: [null, ""]`, same own-records scoping as
  the other tiles); the matching list-page filter is `เฉพาะที่ยังไม่มี PO` on the standalone Scope
  of Work page. Tile grid rebalanced to `grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`.
  Placed in supporting detail, directly after `ActivityFollowUpSummary`. Deliberately **not** added
  as a 5th `ExecutiveSummaryCards` tile — that row is a documented, repeatedly-reaffirmed "exactly 4
  cards" business requirement (see `ExecutiveSummaryCards.tsx`'s own doc comment above). Only
  rendered when the API response's `scopeOfWork` is non-null, i.e. only for callers with
  `scopeOfWork:view` — every default role that has `dashboard:view` also has `scopeOfWork:view` (see
  [RBAC.md](../RBAC.md)), so in practice this is visible to everyone who sees the Dashboard at all,
  but a custom role could theoretically have one without the other.
- `DeliveryOrderSummary.tsx` (added 2026-07-24, per a direct user request to bring the newer
  modules' data onto the Dashboard) — Total/Draft/Final for Delivery Orders, mirroring
  `ScopeOfWorkSummary.tsx` exactly (same tier, same 3-tile `ChartCard` pattern, same
  null-hides-card gating — here on `deliveryOrder:view`, whose default grants require the manual
  Role Management step tracked in TODO.md, so on this production deployment the card is invisible
  to any role that hasn't been granted the permission yet). `DashboardPage.tsx` renders the SOW +
  DO cards side-by-side in an `xl:grid-cols-2` grid; each falls back to full width alone when the
  caller can only see one of the two.
- `ServiceSummary.tsx` (added 2026-08-14, per direct user request — Service was the only document
  module with zero Dashboard visibility before this) — Total/Draft/Completed/Cancelled/This-Month
  as a compact 5-tile row inside one `ChartCard` (`grid-cols-2 sm:grid-cols-3 xl:grid-cols-5`),
  copied from `ScopeOfWorkSummary.tsx`'s tile pattern. Gated on `service:view`, `null`-hides like
  its siblings. **Deliberately NOT filtered by the date-range/salesperson/department filter** —
  same reasoning already documented for the Scope of Work/Delivery Order cards above: a Service
  Report has no `salesperson` field of its own (it uses `assignedServiceEngineerId` instead) and
  no `issueDate` in the same sense a quotation does, so there's no dimension to filter by.
  `DashboardPage.tsx` now renders SOW/DO/Service side-by-side in an `xl:grid-cols-3` grid (widened
  from `xl:grid-cols-2`); each card still independently null-hides per its own permission, so the
  grid gracefully narrows for a caller who can only see one or two of the three.

  **KPI presentation history**: originally a single flat `KpiGrid.tsx` (22 uniform cards). 2026-07-10
  (UI/UX redesign) split it into two tiers — `PrimaryKpiCards.tsx` (6 hero cards) +
  `SecondaryKpiSummary.tsx` (9 mini-cards) — which also quietly stopped rendering 7 KPIs the API
  still computed (Lose Rate, Conversion Rate, Average Approval Time, Expired Quotations, New/Repeat
  Customers, Total Leads). 2026-07-13 (first revert): merged back into one flat `KpiGrid.tsx` (all
  22 fields). 2026-07-13 (second revert, current state): further user feedback that even the flat
  22-card grid still read as cluttered — `KpiGrid.tsx` deleted, replaced by the 3 components above
  plus the existing `QuotationStatusSummary`. `totalCustomers`/`totalLeads`/`totalProducts`/
  `repeatCustomers` no longer get individual tiles (still computed server-side; visible via
  `CustomerAnalytics.tsx`/the Products page instead) — not in the requested 5-section spec. See
  CHANGELOG.md for both revert passes' full detail.
- `PipelineSteps.tsx` (added 2026-07-10, **replaces `PipelineFunnel.tsx`**, deleted) — horizontal
  connected step cards (stage badge, count, value, conversion % from the previous stage) instead
  of a `recharts` `FunnelChart`, which squeezed 9 Thai status labels into a shrinking silhouette
  and read as broken/unprofessional. The 3 "left the pipeline" outcomes (Customer Rejected/Lost/
  Cancelled) render as a separate row below the main Draft→...→Won flow, since they're branches
  off the main path, not sequential steps in it. Conversion % still uses the same explicit
  predecessor map (`PIPELINE_PREDECESSOR` in `api/dashboard/index.ts`) mirroring the real
  workflow state machine, **not** simple array-adjacency — the workflow branches (Sent to
  Customer → Accepted *or* Rejected), so a naive "previous stage in the list" comparison would
  produce a nonsensical percentage for the Customer Rejected/Lost branch.
  (`SalesActivityAnalytics.tsx`'s full current description, incl. the audit-integrity history for
  why its underlying `audit_log` counts are trustworthy, is documented above where the top-overview
  section order is described — not repeated here to avoid the two going out of sync.)
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
  (`ActivityTimeline.tsx`'s full current description is documented above alongside the top-overview
  section order, not repeated here.)
- `FollowUpReminders.tsx` — Today/Overdue/Upcoming, each item clickable.
- `ApprovalDashboard.tsx` — pending/approved-today/rejected-today/avg approval time stat tiles,
  **plus** a Pending Approvals list (Quotation No./Customer/Salesperson/Amount/Submitted Date)
  with inline Approve/Reject actions calling the same `performWorkflowAction()` used by the
  Quotation module's own approval flow. Reject requires a comment (inline textarea), matching the
  existing workflow rule. **Only rendered when the caller has `quotations:approve`** (response
  field is `null` otherwise); the Reject button additionally requires `quotations:reject`
  (`approvalDashboard.canReject`, server-computed). **2026-07-29, critique-driven hardening
  pass**: Approve now opens a `ConfirmDialog` (name-checked quote ID + client, states the action
  is recorded and can't be undone from this screen) instead of committing on a single click — the
  `รออนุมัติ → อนุมัติแล้ว` transition has no reverse edge in `api/_lib/quoteWorkflow.ts`, and
  `QuoteDocument.tsx`'s own editor already confirms this identical transition, so the Dashboard
  widget was the one place in the app that didn't. The dialog is rendered via `createPortal` into
  `document.body` (a `<tr>`'s only valid children are `<td>`/`<th>`, so the confirm overlay can't
  be a direct DOM child of the row). Both success toasts now name the quotation ID. The 4 stat-tile
  accent colors (gold/green/red for pending/approved/rejected) were also darkened to clear WCAG AA
  4.5:1 contrast against their `bg-secondary/40` background — the original brand hexes measured as
  low as 2.15:1 there — matching the same fix already applied to `statusStyle` in `src/lib/quotes.tsx`.
- `NotificationSummary.tsx` — the caller's own unread count + breakdown by type.
- `DashboardCharts.tsx` — shared `ChartCard` wrapper (`ChartCard.tsx`, now supports an `actions`
  slot for the Revenue Trend grouping toggle) plus the remaining named charts: `RevenueTrendChart`
  (weekly/monthly/quarterly/yearly toggle, backed by `revenueTrend` in the API response),
  `RevenueByJobTypeChart` (horizontal grouped bar, Total Value + Won Value, all active job types —
  no top-N cutoff), `JobTypeDistributionChart` (quotation *count* donut by job type),
  `ExpectedSalesForecastChart`, `ProductsByCategoryChart`. **2026-07-10 UI/UX redesign**:
  `QuotationTrendChart`, `SalesByEmployeeChart`, `QuotationStatusDonut`, `WinLoseDonut`, and
  `MonthlyClosingRateChart` were removed from this file — their information now lives in
  `QuotationStatusSummary.tsx` (Win/Lose/Active/Non-Active) and `SalesActivityAnalytics.tsx`
  (Created/Updated trend), and `SalesByEmployeeChart`'s data is still available in the unchanged
  Sales Performance table below. This shrank the Dashboard's own JS chunk from ~505KB to ~478KB
  (back under Vite's 500KB raw-size warning), since the redesign removed more chart code than the
  new components added.
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
  `dashboard:view`. See [API.md](../API.md). **2026-07-10**: response gained a `salesActivity`
  field (weekly/monthly/quarterly/yearly Created vs. Updated counts, aggregated from `audit_log`,
  filter-aware) backing `SalesActivityAnalytics.tsx`. **2026-07-13, sixth pass**: `salesActivity`
  expanded to 5 categories; `kpis` gained `lostValue`/`activeQuotationsValue`/
  `nonActiveQuotationsValue`. **2026-07-13, seventh pass**: `salesActivity` gained
  `bySalesperson.{weekly,monthly,quarterly,yearly}` (period × salesperson, Created/Edited only);
  `activityTimeline` entries may now carry `relatedQuoteId`/`relatedCustomerName`. **2026-07-14**:
  every monetary field in the response (KPIs, pipeline, salesPerformance, customerAnalytics,
  jobTypeAnalytics, forecast, revenueTrend/revenueByMonth, followUps, approvalDashboard's
  pendingList) is now pre-tax — see "Pre-Tax Amount Rule" above. No field was renamed; only the
  computed values changed. **2026-07-14, second same-day pass (Codex-review fix)**: `salesActivity`
  is effectively never `null` for a `dashboard:view` caller anymore (previously required
  `auditLog:view` too — see Permissions below) and its query now bounds `createdAt` by the
  selected `from`/`to` when set (previously unconditional full-history). `expectedSales`/
  `salesPerformance[].expectedRevenue`/`forecast`'s underlying opportunity filter now use strict
  `isPotentialOpportunity === true`, not a truthy check.
- Approve/Reject actions from the Pending Approvals widget reuse the existing
  `POST /api/quotes/:id/workflow` route (same one the Quotation module's own approval buttons
  call) — no new API route was added for this.
- **2026-07-24 (second pass, direct user decision)**: **own-data-only scoping** — a caller without
  `quotations:viewAll` gets every quote-based figure computed from only their own quotes (the
  quotation list's exact ownership predicate), Sales Activity restricted to their own audit
  events, and the SOW/DO cards scoped by those modules' own `viewAll` (their list routes' exact
  predicates, incl. SOW's document-recipient match). Response gains `ownDataOnly: boolean`; the
  UI shows a gold notice and hides the salesperson/department filter dropdowns. Deliberate
  company-wide exceptions: new-vs-repeat client classification, forecast win-rate baseline,
  `approvalDashboard`. See [RBAC.md](../RBAC.md) "Quotation Own-Quotes-Only Viewing".
- **2026-07-24**: response gained a `deliveryOrder: { total, draft, final } | null` field — same
  shape/gating/unfiltered rules as `scopeOfWork` below, gated by `deliveryOrder:view`, isolated in
  its own try/catch. Backs the new `DeliveryOrderSummary.tsx` component.
- **2026-07-23**: response gained a `scopeOfWork: { total, draft, final } | null` field — company-
  wide, all-time `scope_of_works` counts (`isDeleted: false`, by `status`), `null` unless the caller
  has `scopeOfWork:view` (same gating pattern as `approvalDashboard`). Unfiltered by the date-range/
  salesperson/department filter, same reasoning as Total Customers/Products (see "Data-model
  caveats" above) — a Scope of Work document has no `issueDate`/`salesperson` of its own to filter
  by. Backs the new `ScopeOfWorkSummary.tsx` component, see "Pages / Components" below.
- **2026-08-14**: new `?vat=pre|post` query param (default `pre`) selects which of
  `computeQuoteAmountBeforeVat()`/`computeQuoteAmountWithVat()` (`api/_lib/quoteAmounts.ts`)
  computes every monetary field in the response, via a local `quoteAmount()` dispatcher at the 3
  places `api/dashboard/index.ts` derives money from raw `lines`/`discount`. The resolved mode is
  echoed back as the new `filters.vatMode: "pre" | "post"` field. See "VAT Toggle" above.
- **2026-08-14**: response gained a `serviceSummary: { total, draft, completed, cancelled,
  thisMonth } | null` field — same shape/gating/unfiltered-by-design pattern as `scopeOfWork`/
  `deliveryOrder` above, gated by `service:view`, own-records-only without `service:viewAll`
  (mirroring `handleList()`'s exact ownership predicate in `api/_lib/serviceReportHandler.ts`),
  isolated in its own try/catch. Backs the new `ServiceSummary.tsx` component, see
  "Pages / Components" below.

## Permissions

`dashboard:view` (every default role has it, unchanged) gates the whole page — and, as of
2026-07-14, that's now also the *only* gate on `salesActivity` (Sales Activity Analytics). It used
to share `activityTimeline`'s `auditLog:view` gate too, which an independent Codex review found
Critical: the default Sales User/Approver 1/Approver 2/Viewer roles all have `dashboard:view` but
not `auditLog:view`, so the required "Sales Activity Analytics" business section was silently
missing for every one of them. Fixed by removing that extra gate specifically from `salesActivity`
— it's a coarse aggregate rollup (counts per period/category), not raw audit-log rows, so it didn't
need the same restriction as the literal audit-log feed. Other sections remain gated by a
permission the caller already needs elsewhere: `activityTimeline` (the actual "Recent Activity
Details" audit-log feed, with full entry text) still by `auditLog:view`; `approvalDashboard` (stat
tiles + Pending Approvals list) by `quotations:approve`; the list's Reject button additionally by
`quotations:reject` (`approvalDashboard.canReject`). No new `Permission` was added for either
pass — see [RBAC.md](../RBAC.md).

## Current Features

- **Executive overview** (see Pages/Components above): `ExecutiveSummaryCards.tsx` (4 KPI cards),
  `QuotationStatusSummary.tsx` (Won/Lost/Active/Non-Active donut+table+%), `SalesPerformancePanel.tsx`
  (rate/cycle-time metrics), `ActivityFollowUpSummary.tsx` (action-item counts) — together cover
  all 18 of the 22 `DashboardKpis` fields that matter for the top-of-page overview; the remaining 4
  (`totalCustomers`/`totalLeads`/`totalProducts`/`repeatCustomers`) are shown elsewhere on the page
  (Customer Analytics table, Products page) rather than as dashboard tiles.
- Date-range + Department + salesperson filters, applied server-side, driving every widget on
  the page (see the date-filter propagation note above for the one deliberate exception)
- **Sales Pipeline** as horizontal step cards (`PipelineSteps.tsx`) — Draft → Pending Approval →
  Approved → Sent to Customer → Customer Accepted → Won as one connected flow, with Customer
  Rejected/Lost/Cancelled broken out as a separate off-ramp row below it (replaces the old
  `FunnelChart`, whose 9 overlapping Thai labels read as broken/unprofessional).
- **Quotation Status Summary** (`QuotationStatusSummary.tsx`) — Win/Lose/Active/Non-Active donut
  + table, counts always match the KPI cards exactly.
- **Sales Activity Analytics** (`SalesActivityAnalytics.tsx`) — 5-category stacked activity chart
  (Created/Edited/Status Changed/Approval Requested/Approval Completed) plus a per-salesperson
  Created-vs-Edited breakdown table, weekly/monthly/quarterly/yearly tabs, respects the
  salesperson/department filters.
- **Recent Activity Details** (`ActivityTimeline.tsx`) — table of recent audit-log entries with
  clickable quotation-number links and customer names — `auditLog:view` holders only.
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
- 5 remaining charts in `DashboardCharts.tsx`: Revenue Trend (weekly/monthly/quarterly/yearly
  toggle), Revenue by Job Type (Total + Won Value, grouped bars), Job Type Distribution
  (quotation count), Expected Sales forecast, Products by Category donut — every chart has its
  own empty state. (Quotation Trend/Sales by Employee/Quotation Status/Win-Lose/Monthly Closing
  Rate charts were retired in the 2026-07-10 redesign — see "Pages / Components" above for where
  each one's data lives now.)
- **VAT toggle** (added 2026-08-14) — a pre-tax/post-tax switch in `DashboardFilterBar.tsx`
  (defaults to pre-tax) that re-derives every monetary value on the page, and in the CSV/Excel
  exports, from the same shared `computeQuoteAmountBeforeVat()`/`computeQuoteAmountWithVat()` pair
  — see "VAT Toggle" above.
- **Service summary card** (`ServiceSummary.tsx`, added 2026-08-14) — Total/Draft/Completed/
  Cancelled/This-Month tile row, alongside the Scope of Work/Delivery Order cards, gated on
  `service:view`.
- Full page-level empty state when there's no quotation or product data at all, via the shared
  `EmptyState.tsx` component
- Shared `PageHeader.tsx` for the page title/description/actions row
- `MetricInfoTooltip.tsx` click-to-toggle info popovers on KPIs that need a one-line explanation
  (Expected Sales, Win Rate, Non-Active Jobs, Average Deal Size, Average Closing Time, Pending
  Approvals)
- Optional Driver.js guided tour (`GuidedTour.tsx`, `useGuidedTour()`), first-time-only via
  `src/lib/tour.ts`'s localStorage-backed `hasTourCompleted()`/`markTourCompleted()`; steps cover
  the sidebar, dashboard title, filters, KPI cards, notification bell, and profile menu — see
  [UI_GUIDELINES.md](../UI_GUIDELINES.md) "Guided Tour" for how to add a step.
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
- Activity Timeline is a flat recent-N feed from `audit_log`, not grouped by period or
  filterable by salesperson/job type — the new Sales Activity Analytics section (this pass)
  covers the Created/Edited-count part of this gap, but Activity Timeline itself is unchanged.
- Once RBAC scoping is desired, cross-salesperson rankings/performance data could be restricted
  for the Sales User role (currently visible to any `dashboard:view` holder, same as every other
  KPI) — not built, no requirement for it yet, would need a new permission.
- `PageHeader.tsx` is only used on the Dashboard so far — rolling it out to every other page
  (Quotation, Product, User Management, Settings) is tracked in [TODO.md](../TODO.md) but not
  done this pass.
- The guided tour only covers Dashboard-visible elements (sidebar, filters, KPIs, bell, profile
  menu) — a full cross-page onboarding flow (create a quotation, submit for approval, etc.) is
  explicitly out of scope for this pass, tracked in TODO.md.

## Known Issues

- **2026-07-23, Scope of Work summary pass**: same sandboxed-session limitation as every prior
  pass — no Vercel CLI, no local MongoDB credential, so `scopeOfWork`'s real counts against
  production data are unverified this session. Verified via `tsc --noEmit` (both configs)/
  `npm run lint`/`npm run build`, all clean; the new `ScopeOfWorkSummary.tsx` follows the exact
  same permission-gate/null-hide pattern as `ApprovalDashboard.tsx` (already live-verified in
  earlier passes), so the risk of a live-rendering surprise is low, but a manual click-through
  against real data is still recommended before considering this fully verified end-to-end.
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
- **2026-07-10 UI/UX redesign pass**: same live-data verification limitation applies (reproduced
  a third time). As a partial substitute, a Playwright-driven check confirmed the client bundle —
  including the new `PrimaryKpiCards`/`SecondaryKpiSummary`/`PipelineSteps`/
  `QuotationStatusSummary`/`SalesActivityAnalytics`/`GuidedTour` components and the new `driver.js`
  dependency — initializes with zero unrelated console errors (only the expected
  session-fetch network failure from the DNS issue above). Full rendered-with-real-data visual
  review is still outstanding; recommend Codex or a follow-up session with working MongoDB
  connectivity review the actual rendered Dashboard against the redesign spec.
- **2026-07-10 audit-integrity/workflow-gap fix pass (fifth pass)**: same live-data verification
  limitation, reproduced a fourth time (confirmed via the `vercel dev` server log itself, not just
  the HTTP response, to rule out a regression). A Playwright check again found zero new console
  errors. This pass also surfaced a real, pre-existing, unrelated gap: `App.tsx`'s session-fetch
  boot effect has no error handling, so the app's loading spinner never resolves to the sign-in
  screen when that fetch throws — logged in [TODO.md](../TODO.md), not fixed here (out of scope
  for a Critical/High Codex-findings fix pass). Doesn't affect the Dashboard's own code.
- **2026-07-14 Pre-Tax Amount pass**: same sandboxed-session limitation (this session's local
  `.env.local` has no `MONGODB_URI`, and no Vercel CLI is installed to `vercel env pull` one, so
  there's no live-database path either locally or via `vercel dev`). Verified instead via
  `tsc --noEmit` (both configs)/`npm run lint`/`npm run build` (all clean) and a temporary,
  isolated Playwright preview harness mounting the real `ExecutiveSummaryCards`/
  `QuotationStatusSummary`/`SalesActivityAnalytics` components with mock `DashboardKpis`/
  `SalesActivityTrend` data (deleted after use, not part of the app's real routing) — confirmed
  all 4 KPI cards render with their new "ก่อนภาษี" titles/helpers, the Status Summary's
  "มูลค่ารวมก่อนภาษี" column and Win/Lose/Active/Non-Active rows, and Sales Activity Analytics'
  weekly/monthly/quarterly/yearly tab switching (clicked "รายสัปดาห์," confirmed the chart/table
  re-rendered), all with zero console errors beyond an expected missing-favicon 404. The pre-tax
  *arithmetic* itself (`amount / 1.07`) is a pure, non-network function verified by code
  inspection and `tsc`, not something a UI screenshot can independently confirm — a live-database
  pass should still spot-check one real quote's Dashboard-reported value against its
  `lines`/`discount` by hand.
- **2026-07-14, second same-day pass (Codex-review fix)**: same limitation; the review that found
  these issues hit a different but equally blocking environment problem on its own side ("WSL 1 is
  not supported... Could not determine Node.js install directory"). Verified via `tsc`/`lint`/
  `build` (all clean) and a Playwright preview specifically targeting this pass's fixes: rendered
  `ExecutiveSummaryCards`/`QuotationStatusSummary`/`SalesActivityAnalytics` together under a
  "simulating a Sales User (dashboard:view only, not auditLog:view)" label to confirm Sales
  Activity Analytics now actually renders in that scenario; rendered it twice more with
  `dateFiltered={false}`/`dateFiltered={true}` to confirm the caption switches correctly; rendered
  the new compact empty-state banner markup. All four confirmed correct, zero console errors. What
  this did **not** verify: that a real authenticated Sales User/Approver/Viewer session against a
  live deployment actually receives the section end-to-end (only the underlying permission logic
  and component rendering were checked in isolation), and that selecting a real narrow date range
  against real audit-log data actually reduces the returned counts (verified by code review, not
  exercised against live data) — both flagged as next steps in CODEX_REVIEW_REPORT.md.
- **2026-07-14, Company Profiles removal / pre-tax rework / progressive-loading pass**: same
  sandboxed-session limitation (no `MONGODB_URI`, no Vercel CLI) — no live-database or running-`vercel
  dev` verification was possible this pass either. The 2026-07-14 Pre-Tax Amount pass above computed
  the before-VAT figure by dividing the VAT-included `amount` back down (`amount / 1.07`); this pass
  replaces that with the items-based `computeQuoteAmountBeforeVat(lines, discountPct)` helper (see
  "Pre-Tax Amount Rule" above) so the Dashboard can never silently show a VAT-included figure for a
  quote whose stored `amount` predates a future VAT-rate change, and so it shares its exact formula
  with quote creation/editing instead of merely inverting the output. Verified via `tsc --noEmit`
  (both configs)/`npm run lint`/`npm run build` only — the arithmetic change itself was not
  re-exercised against a live quote's data in this pass; that spot-check remains an open item for
  whoever next has live-database access.
