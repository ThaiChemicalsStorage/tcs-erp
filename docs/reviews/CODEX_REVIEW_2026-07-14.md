# Codex Review Report — Company Profiles Removal, Pre-Tax Dashboard, and Progressive Loading

**Review date:** 2026-07-14  
**Scope:** Read-only code, API, documentation, RBAC, and UI-state audit. Only this report and its archive copy were updated.

## Executive Summary

**Not ready for real internal users as a complete progressive-loading release.** Company Profiles removal and dashboard pre-tax calculations are correctly implemented in the reviewed source. However, the loading implementation still globally blocks ordinary data-driven pages behind all nine boot requests, and dashboard data can be stale after a workflow action without a visible refreshing state. The Dashboard is also a single all-or-nothing API response, so a failure in an optional section can prevent KPIs and every other section from rendering.

## Critical Issues

None found. Dashboard money calculations consistently use the shared pre-VAT helper; no mixed VAT-included `amount` aggregation was found in dashboard response construction.

## High Priority Issues

1. **Normal navigation remains blocked by unrelated boot data.** `App.tsx` starts nine requests independently but uses one `initialDataLoading` flag, cleared only by `Promise.allSettled(tasks)`. While any request remains pending, every prop-driven module—Quotations, Customers, Products, Users, Roles, and Settings—is replaced by `SectionLoading`, even if that module's own data has already arrived. Users do not see that page's title, actions, filters, table headers, or form structure. Track readiness/error per resource/page and render each page’s shell immediately.

2. **Dashboard workflow refresh silently leaves stale data visible.** `refreshAfterAction()` only increments `retryToken`; unlike filter changes and retries, it does not set `loading` true. The previous statistics stay on screen with no spinner or “refreshing” indication until the response returns. This violates the requirement that stale values not appear current without an indication.

3. **A single optional dashboard failure blocks all dashboard sections.** `GET /api/dashboard` executes catalog counts, quote analytics, audit-log activity, notifications, role-dependent approvals, and several aggregations in shared `Promise.all` chains under one error boundary. Any rejected optional query/index operation returns a single 500; `DashboardPage` then replaces the entire data area with `ErrorState`, hiding KPIs, status, and other otherwise available sections. Split independently recoverable sections/endpoints, or return section-level error states from a resilient aggregate API.

## Medium Priority Issues

1. **First-load Dashboard is shell-first but not section-first.** The title and filters render immediately, but all dashboard content is one generic animated skeleton until the monolithic response completes. Required visible structure such as section titles, table headers, and named card containers is not present during loading. This is an improvement over a full-page loader, but only partial compliance with UI-first progressive loading.

2. **Older/malformed quotations with no usable `lines` silently contribute zero pre-tax value.** `computeQuoteAmountBeforeVat(q.lines ?? [], q.discount ?? 0)` avoids a crash and correctly avoids falling back to VAT-included `amount`, but reports zero when legacy/external documents lack usable line data. The documentation asserts this cannot occur rather than documenting the observable zero-value fallback. Add data-quality detection/telemetry and document the behavior; migrate or flag affected records if they exist.

3. **Documentation contains stale implementation details.** `docs/MODULES/Customer.md` still says Customers shares the former `company-profiles` function, while the current code uses `api/handlers/customers.ts`. `docs/TODO.md` repeats that outdated claim and also has historical text saying the Company Profiles module remains available. These conflict with `PROJECT_STATUS.md`, `API.md`, and the source.

## Low Priority Issues

1. `src/lib/dashboard.ts` comments still describe dashboard values generically as “amount”; explicitly saying “before VAT” in these public interfaces would reduce future regression risk.

2. The boot screen remains a full-screen logo pulse until the session request resolves. This is reasonable for unauthenticated session establishment, but a cached shell/route transition strategy would improve perceived speed further.

## Company Profiles Removal Review

**Pass.** The active application has no Company Profiles page folder or client library, no `companyProfiles` navigation key/sidebar item/render case, and no matching i18n menu/empty-state keys. `vercel.json` has no `/api/company-profiles` rewrite, and no company-profile handler or validation file remains. This makes direct API access a 404 under the deployed rewrite model; the app uses internal state navigation rather than browser URL routes, so no old front-end route is exposed.

The historical `company_profiles` MongoDB collection and old audit entries are deliberately untouched. No destructive production data cleanup was found or required.

## Leftover Route / API / Permission Review

**Pass for executable code.** No active `CompanyProfiles`, `CompanyProfileForm`, `company_profiles`, `issuerCompany`, `issuerCompanyId`, or `issuerCompanySnapshot` reference was found in application/API code. The `Permission` union and default roles no longer include Company Profiles permissions. Existing custom database roles may retain inert legacy permission strings; this is safe because no UI or endpoint evaluates them.

Remaining Company Profiles and issuer terms are historical documentation/comments, not live routes or imports. The documentation mismatch is reported above.

## Quotation Regression Review

**Pass.** The quotation form has no issuer selector. Quote create/update/workflow routes do not accept or require `issuerCompanyId`; they use optional `customerId` and server-built `customerSnapshot`. Customer selection remains `CustomerSelector` → `GET /api/customers` → MongoDB `customers`, not Company Profiles.

## Dashboard Before-VAT Calculation Review

**Pass.** `api/_lib/quoteAmounts.ts` is the authoritative rule: line quantity × unit price after line discounts, then quote-level discount, before VAT. `computeQuoteAmountWithVat()` and server quote validation use the same input/formula family. `api/dashboard/index.ts` projects `lines` and `discount` and maps each quote through `computeQuoteAmountBeforeVat()` once before all KPI, status, pipeline, ranking, customer, job type, forecast, revenue trend, follow-up, and pending-approval computations.

CSV export labels and values use the returned before-VAT dashboard statistics. No dashboard path was found summing persisted VAT-included `Quote.amount` as a dashboard monetary result.

## Expected Sales Review

**Pass.** Expected Sales is the sum of mapped pre-tax quote values where `isPotentialOpportunity === true`. It derives from `docs`, which already applies the selected date, salesperson, and department conditions. There is no additional “all active quotations” predicate and no VAT-included fallback.

## Old Quotation Data Compatibility Review

**Partial.** The dashboard will not crash and will not silently use the VAT-included grand total: missing lines become an empty array and calculate to zero. That is safer than mixing VAT bases, but can understate historical data and is insufficiently documented as a fallback behavior. This is a data-quality/compatibility concern rather than a VAT-mixing defect.

## Progressive Loading Review

**Partial.** After session resolution the sidebar/top navigation shell appears immediately. Dashboard title, description, filters, and a loading spinner also appear immediately; filter changes preserve prior data and show a small spinner. However, other ordinary pages are globally replaced by a central loading state until all boot fetches settle, and first-load Dashboard content remains a monolithic generic skeleton.

## Data Fetching and Caching Review

The boot requests are concurrent, not sequential, and dashboard filter effects use a cancellation flag to prevent older responses overwriting newer filter results. No React Query/SWR duplication was introduced; custom fetching remains consistent.

The central global readiness flag defeats much of the benefit of concurrent requests. Dashboard has no cache beyond component state. Refresh after approval/rejection has no loading signal, as noted in High Priority issue 2.

## Actual Performance Review

Dashboard has useful analytics indexes and uses projection for `lines`/`discount` rather than fetching arbitrary quote fields. The shared amount helper avoids repeated inconsistent VAT conversion. `Promise.all` is appropriate for independent database reads but creates a single failure domain.

The dashboard response remains large and all 18 data sections are calculated and rendered together. Heavy chart components are loaded with the Dashboard rather than independently deferred, and there is no per-section endpoint/error isolation. At larger data volumes, line-item recomputation in application memory and the all-in-one response will become the primary scalability risks.

## Error / Empty / Zero State Review

Loading is generally distinct from confirmed zero: Dashboard uses a skeleton/spinner, and empty business data renders a compact banner plus zero-capable widgets. Filter refresh retains prior data. Section-level error handling is missing because a dashboard request failure produces one data-area error state. Global data pages also use one error/loading state rather than resource-specific outcomes.

## UI / UX Review

Company Profiles is no longer cluttering navigation. The immediate Dashboard shell, filter controls, compact first-load placeholder, retryable errors, and Thai loading/error copy are clear improvements. The remaining global blocking state makes navigation feel unresponsive on slow APIs, and silent post-action refresh can make users question whether an approval/rejection took effect. No source-level responsive-layout regression was found.

## Security Review

Removal leaves no exposed Company Profiles API route or permission path. Customer selection remains protected by the existing customer/quotation server-side permissions. Dashboard still requires `dashboard:view`; role-dependent activity and approval details remain permission-gated. No new sensitive-data exposure was found.

## Documentation Review

Most top-level documentation accurately records removal, the pre-tax formula, and progressive-loading intent. Correct the stale Customers-handler references in `docs/MODULES/Customer.md` and `docs/TODO.md`, and historical wording implying Company Profiles remains available. Document the missing-line dashboard fallback explicitly rather than claiming it cannot occur.

## Requirements Checklist

- [x] ข้อมูลบริษัท removed from sidebar
- [x] Company Profiles routes inaccessible
- [x] Company Profiles links removed
- [x] Unused Company Profiles permissions removed or safely deprecated
- [x] Existing database records not destructively deleted
- [x] Issuer company selector absent from quotation form
- [x] Quotation save does not require issuerCompanyId
- [x] Customer selection still works
- [x] Dashboard total quotation value is before VAT
- [x] Closed sales is before VAT
- [x] Expected Sales is before VAT
- [x] Expected Sales uses potentialOpportunity only
- [x] Win/Lose/Active/Non Active values are before VAT
- [x] Forecast is before VAT
- [x] Rankings and charts use before-VAT values
- [x] Dashboard exports use before-VAT values
- [x] One consistent pre-tax calculation rule is used
- [!] Main UI shell appears immediately
- [!] No blocking full-page Skeleton during normal navigation
- [!] Previous data remains during refetch where appropriate
- [x] Loading is distinguishable from confirmed zero
- [ ] One failed section does not block the entire page
- [x] Duplicate API calls reviewed
- [ ] Build passes if checked
- [ ] Documentation updated

## Suggested Fix Plan for Claude Code

1. Preserve the shared line-item pre-tax helper and add tests/assertions that every dashboard monetary response path uses it.
2. Preserve the strict `isPotentialOpportunity === true` Expected Sales predicate and test date/salesperson/department scope.
3. Keep Company Profiles/issuer behavior removed; correct remaining historical documentation only—do not delete production collection records.
4. Replace global `initialDataLoading` gating with resource/page-specific loading states so each page shell and ready data render independently; retain the sidebar shell immediately.
5. Add a dashboard refreshing indication for workflow-triggered refreshes and consider lightweight cached dashboard state.
6. Isolate optional dashboard work into resilient sections or section-status payloads so KPI/status data survives activity/notification/approval failures.
7. Keep first-load Dashboard structure visible with named card/table/section shells, then populate each section as data becomes available.
8. Add data-quality handling/documentation for quotes without valid line-item data, plus update stale Customers/Company Profiles documentation.

## Build Check

Commands attempted without modifying the project:

- `npm run lint` — did not start linting: `WSL 1 is not supported. Please upgrade to WSL 2 or above. Could not determine Node.js install directory.`
- `npm run build` — did not start compilation with the same Node/WSL error.

Likely cause: this review environment resolves to a Windows Node installation incompatible with WSL 1. Recommended fix: run in WSL2 or a Linux-compatible Node environment, then rerun both commands.
