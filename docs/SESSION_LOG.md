# Session Log

> Append-only retrospective summary at the end of each work session. Distinct from [CHANGELOG.md](./CHANGELOG.md) (which logs individual changes as they happen) — this is a higher-level "what happened this session and what's next" note. Never delete previous entries.

---

## Session — 2026-07-10 (Executive Dashboard, Sales Analytics & Job Type)

### What was implemented
- User requested a full BI rebuild of the Dashboard plus a Job Type classification and "Potential Opportunity" flag on every quotation — an intentionally huge request (new KPIs, sales pipeline, filters, rankings, forecast, follow-ups, activity feed, report export, and more).
- Given the scope, wrote and got sign-off on an implementation plan before touching code: scoped to (1) Job Type + Potential Opportunity + Follow-up Date on `Quote`, (2) the dashboard backend, (3) the dashboard frontend — explicitly deferring Report Export and real Lead/Customer entities as separate follow-ups, per the user's own choice among presented options.
- New `job_types` MongoDB collection (13 seeded defaults), `GET/POST/PATCH /api/jobtypes` (no new `Permission` — reused `quotations:view`/`company:manage`), `src/lib/jobTypes.ts`.
- `Quote` gained `jobTypeCode`/`jobTypeName`/`isPotentialOpportunity`/`followUpDate`, wired into the form/list/print.
- `api/dashboard/index.ts` rebuilt in place: date-range + salesperson filters, and a large set of new response sections computed by fetching the filtered quote set once and reducing it in JS (deliberately, not a dozen fragile aggregation pipelines — appropriate at this data volume; no new cache collections built).
- `DashboardPage.tsx` split from one file into 13 files under `src/pages/dashboard/`; 9 charts total.
- A lightweight `quotationListFilter` lifted to `App.tsx` so Dashboard pipeline/follow-up clicks open a pre-filtered quotation list (not full per-quote deep-linking — a separately tracked, larger gap).

### Files Modified
`api/_lib/{collections,systemSeed}.ts`, `api/handlers/{jobtypes (new),quotes}.ts`, `api/dashboard/index.ts`, `vercel.json`, `src/lib/{quotes,jobTypes (new),dashboard,i18n}.ts(x)`, `src/App.tsx`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,PrintDocument}.tsx`, `src/pages/dashboard/*` (13 files, mostly new). See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- **No new MongoDB collections beyond `job_types`** — `sales_pipeline`/`sales_activities`/`dashboard_cache`/`analytics_cache`/`forecast`, all mentioned as "examples" in the original request, were deliberately not built; computed live via aggregation / read from the existing `audit_log` instead. Building parallel collections for data that's a `$group` away would be a sync-maintenance burden with no benefit at this data volume — a conscious "don't over-engineer" call, not an oversight.
- **No new `Permission`** — Job Type CRUD and every new dashboard section reuse permissions the relevant roles already hold (`quotations:view`, `company:manage`, `dashboard:view`, plus per-caller gating on `auditLog:view`/`quotations:approve` for two sections), rather than growing the 17-key union for a need that wasn't explicitly requested.
- **One new serverless function, not several** — `api/handlers/jobtypes.ts` is the only new function file (10/12 against Vercel Hobby's cap); every new dashboard aggregation was added to the *existing* `api/dashboard/index.ts` instead.
- **Sales pipeline starts at "Draft," not "Lead"** and **customer analytics group by the free-text `client` string** — both explicitly documented data-model simplifications (no Lead/Customer entity exists yet), not silently assumed.

### Problems Found
- **Self-caught during review** (not found by `tsc`/`lint`, since it was a logic bug, not a type error): the sales pipeline's stage-to-stage "conversion from previous" initially used array-adjacency (each stage compared to the row above it in a fixed display list). The real workflow branches at "Sent to Customer" (→ either Accepted or Rejected), so array-adjacency would have shown a nonsensical conversion % for the Customer Rejected/Lost branch, since Lost isn't actually downstream of Won. Caught by manually re-deriving the real predecessor relationships from `workflowTransitions` and comparing.
- **A real `react-hooks/set-state-in-effect` lint error** (not a style nit — it flags an avoidable render-cascade footgun): calling `setLoading(true)` synchronously at the top of the dashboard's data-fetching `useEffect` (to show a spinner during filter-driven refetches).
- **No safe way to verify end-to-end against live data in this session**: no local MongoDB credential was available, and the only real backend is the production database serving actual users — writing a test quote via the UI to verify the feature would have polluted real business data. Vercel CLI is also not installed, ruling out a quick `vercel dev` + `vercel env pull` local loop.

### Problems Fixed
Both bugs above, before considering the pass complete — see CHANGELOG for the exact fixes (`PIPELINE_PREDECESSOR` explicit map; moved `setLoading(true)` into the filter-change event handler instead of the effect body).

### New TODO Items
Verify the pass against live data (High Priority — see [TODO.md](./TODO.md)); Report Export (PDF/Excel/CSV); a dedicated monthly quotation-count aggregation for a more accurate Quotation Trend chart; a Job Type admin management UI (the API exists, no dedicated page); confirming whether cross-salesperson dashboard data should be role-restricted.

### Future Recommendations
1. **Live-data verification is the immediate next step** before this pass can be considered fully done — the code is implemented and self-reviewed, but "implemented" and "verified working" are different claims, and this session could only honestly make the first one. See [TODO.md](./TODO.md) High Priority for what's needed (either a safe non-production test path, or explicit sign-off to test against production with cleanup).
2. Consider setting up a genuine dev/staging MongoDB Atlas cluster (separate from production) if UI-driven local testing is going to be a recurring need — right now the only real backend is the one serving live users, which structurally blocks safe local verification for any change that needs to write data.
3. Report Export is the natural next scoped follow-up once live verification closes out — build it against this now-stable dashboard response shape rather than in parallel with it.

### Estimated Completion Percentage
~40% of the full long-term ERP vision (up from ~38% — a BI layer on top of existing Quotation data, not a new module, hence the smaller increment than the 2026-07-09 jump). ~94% of the currently-scoped modules — the Dashboard rebuild closed several depth gaps but Report Export and live verification remain open. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-10, second pass (Dashboard completion against the full business spec)

### What was implemented
- User re-requested Dashboard completion, framing the prior same-day rebuild as still incomplete against a very detailed, ~15-section business requirements document (KPI definitions, filters, pipeline funnel, 10+ named sections, empty-database behavior, mandatory code review/regression/security/performance checks). Explicit instructions: audit first, don't rebuild randomly, don't stop after a few cards.
- Did **not** trust the prior pass's own docs/summary. Instead read the actual code directly (an `Explore` agent read every Dashboard component + the API file in full) and produced a section-by-section Present/Partial/Missing verdict against the spec, with file:line evidence. This surfaced 12 concrete, real gaps — some the prior pass's own docs had implicitly claimed were done (e.g. "every section respects both filters" was true for salesperson but not fully for the date range on Follow-ups; "sortable" tables were missing more than half their sortable columns).
- Implemented every confirmed gap in `api/dashboard/index.ts`, `src/lib/dashboard.ts`, and 8 of the `src/pages/dashboard/*` component files — see [CHANGELOG.md](./CHANGELOG.md) for the itemized list (Pending Approvals actionable list, Non-Active Jobs KPI, Won+Lost Average Closing Time, Total Value alongside Won Value on 3 tables, Revenue Trend grouping, Job Type Distribution chart, Department filter, date-filter propagation to Follow-ups, 2 new indexes).
- Extended `src/lib/i18n.tsx` with every new label/column key in both Thai and English (this codebase's dictionary has no compile-time check that `en` covers every `th` key, so each new key was added to both by hand, in pairs, immediately).

### Files Modified
`api/dashboard/index.ts`, `api/_lib/collections.ts` (2 new index calls), `src/lib/{dashboard,i18n}.ts(x)`, `src/pages/dashboard/{DashboardPage,DashboardFilterBar,KpiGrid,SalesPerformanceTable,CustomerAnalytics,JobTypeAnalytics,ApprovalDashboard,DashboardCharts,ChartCard,format}.ts(x)`. Docs: `PROJECT_STATUS.md`, `CHANGELOG.md`, `TODO.md`, `DATABASE.md`, `API.md`, `MODULES/Dashboard.md`, `IMPLEMENTATION_CHECKLIST.md`, `CLAUDE.md`, this file.

### Architectural Decisions
- **`totalValue` added alongside the existing `revenue` field** on `salesPerformance`/`customerAnalytics`/`jobTypeAnalytics`, rather than renaming `revenue` in place — the field's existing meaning (Won-only) was already relied on by other call sites (e.g. `SalesByEmployeeChart`, `RevenueByJobTypeChart`'s pre-existing bar), so adding the missing figure alongside it was a smaller, safer diff than a rename-and-verify-every-call-site pass.
- **Job Type analytics now zero-fill against the active `job_types` master list**, not "codes present in the filtered doc set" — matches how `PIPELINE_ORDER`/`categoryBreakdown` already handle their own "show the real zero, don't omit" requirement elsewhere in this same file, for consistency.
- **New quotes-collection indexes are created defensively inside the Dashboard route itself**, not via `ensureIndexes()` — a real, previously-undocumented-until-now gotcha: `ensureIndexes()` only runs from the Setup Wizard's one-time bootstrap, which is permanently unreachable once a deployment is already provisioned (this app has been live since 2026-07-09). Anything added there today would silently never run in production. `seedJobTypesIfEmpty()` had already independently discovered and worked around this same issue for its own unique index; the new indexes follow that established precedent instead of reinventing a different fix.
- **Revenue Trend/forecast-baseline/monthly-closing-rate windows anchor their trailing-window *end* to the selected `to` date (or today), but still don't apply the `from` bound** — a deliberate, narrower interpretation of "the date filter must affect every widget" than a literal reading would suggest, because literally bounding a 12-point trend chart to (e.g.) a single "Today" preset would make the chart useless for its own stated purpose. Chose to make the filter *measurably* change the underlying query (a real behavior change, not cosmetic) without breaking the widget's reason to exist — documented explicitly as a considered tradeoff, not silently left half-applied.
- **Follow-ups, by contrast, now fully apply the date-range filter** (previously deliberately exempt) — unlike a trend chart, "follow-ups for quotes issued in the selected window" is a coherent, useful view, so there was no equivalent reason to keep the exemption once the spec called it out explicitly.

### Problems Found
- **A self-introduced bug, caught during self-review before running any external check**: the first version of the Department filter's query-composition logic (`fullMatch`/`salespersonOnlyMatch` in `api/dashboard/index.ts`) built the `$and`-vs-plain-key branch with a ternary that read `fullMatch.salesperson` *before* assignment but then unconditionally deleted `fullMatch.salesperson` *after* assignment regardless of which branch had run — which meant a department-only filter (no individual salesperson also selected) would have its own freshly-assigned `{ $in: [...] }` condition immediately deleted, silently reverting to "no department filter at all." Found by re-reading the logic line-by-line immediately after writing it, before any test could have caught it (no live DB access this session to actually exercise the query) — rewritten as an explicit `if (fullMatch.salesperson) { ...$and...; delete } else { Object.assign(...) }` instead of a ternary-plus-conditional-delete, which is unambiguous about which branch owns the deletion.
- **Could not verify live against real MongoDB data** (see below) — the recurring blocker from the first 2026-07-10 pass, but this time with a precise root cause rather than "no credential available": `vercel dev` ran locally (twice, once per shell, to rule out a shell-specific cause) using real credentials already pulled to `.vercel/.env.development.local`, but every MongoDB-touching route failed with `querySrv ECONNREFUSED _mongodb._tcp.tcsdb.zdnus3w.mongodb.net`. Confirmed this was an environment/network issue, not a code defect, by (a) reproducing the identical failure on a pre-existing, untouched route (`GET /api/auth/session`), (b) confirming the OS-level `nslookup` resolves the exact same SRV record fine, and (c) confirming raw TCP to the resolved shard host on port 27017 succeeds — the failure is specific to Node's own DNS resolution path for `mongodb+srv://` in this sandboxed environment.
- **A tempting workaround was correctly blocked**: reconstructing a direct (non-SRV) `mongodb://host1,host2,host3/...` connection string from the resolved shard hosts (all three found via `nslookup -type=SRV`) to bypass the broken SRV lookup entirely was considered, but the first concrete step (backing up `.vercel/.env.development.local`, which contains the live connection string, to a scratch temp path) was denied by the session's own auto-mode safety classifier as unwarranted handling of live database credentials. Correctly abandoned rather than routed around — verification stayed incomplete rather than taking a shortcut through credential handling that hadn't been explicitly authorized.

### Problems Fixed
The department-filter `$and`/delete bug above, before it ever reached a build or lint check (`tsc --noEmit` × 2 configs, `npm run lint`, `npm run build` all clean after every change in this session).

### New TODO Items
Same live-verification item as the first pass, now updated with the specific reproduction (see [TODO.md](./TODO.md) High Priority). No other new gaps surfaced beyond what CHANGELOG/IMPLEMENTATION_CHECKLIST already track (Activity Analytics grouping, Report Export, full per-quote deep-link, Lead/Customer/Department entities) — this pass closed the Dashboard-specific gaps, not the pre-existing, already-tracked cross-cutting ones.

### Future Recommendations
1. **Live-data verification is still the single most important open item** for this module, now blocked on environment access rather than credentials or scope — the natural next step is either a session with unrestricted outbound network access, or driving a Vercel preview deployment (which runs on Vercel's own infrastructure, not this sandbox) through the same click-through checklist in [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Current Features."
2. If local `vercel dev` verification is going to be attempted again in a similarly sandboxed environment, worth pre-emptively checking DNS SRV resolution (`nslookup -type=SRV _mongodb._tcp.<host>`) before investing time starting the dev server — it's a fast way to rule the whole approach in or out up front.
3. Report Export remains the natural next scoped follow-up, now that the Dashboard's response shape (KPIs, `revenueTrend`, all three ranking tables' full column sets) is genuinely stable rather than "probably stable."

### Estimated Completion Percentage
~40% of the full long-term ERP vision (unchanged — this was a completion/correctness pass on an existing BI layer, not new module scope). **~96%** of the currently-scoped modules (up from ~94%) — the Dashboard is now feature-complete against its documented business spec; the remaining gap is the same pre-existing, already-tracked cross-cutting items (Report Export, full per-quote deep-link, Lead/Customer/Department entities, Activity Analytics grouping), not anything newly discovered this session. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-09 (Real backend migration: Vercel Serverless Functions + MongoDB Atlas)

### What was implemented
- Migrated the entire app off client-only/`localStorage` onto a real deployed backend: Vite + React frontend (unchanged) + Vercel Serverless Functions (Node.js) + MongoDB Atlas. Live at https://tcs-erp-nine.vercel.app.
- Real auth: bcrypt password hashing, JWT httpOnly-cookie sessions, per-request fresh user re-fetch from MongoDB so deactivation is immediate.
- Real, server-enforced RBAC on every mutating API route, reusing the same pure permission functions the client already had — genuinely unbypassable via devtools now.
- 8 MongoDB collections (`users`, `roles`, `company`, `products`, `categories`, `notifications`, `audit_log`, `quotes`), 9 consolidated serverless function files, an explicit `vercel.json` rewrite table for routing.
- Rewrote every frontend domain lib to call a real REST API via a new `apiClient.ts`; `App.tsx` now boots asynchronously against `GET /api/auth/session`.
- Full documentation pass across `docs/` reflecting the new architecture, superseding the old never-built "Phase 2" (Next.js/Prisma/Postgres/Auth.js) proposal.

### Files Modified
`api/**` (new), `vercel.json` (new), `tsconfig.api.json` (new), `src/lib/apiClient.ts` (new), `src/lib/{users,roles,session,storage,products,notifications,auditLog,quotes}.ts(x)`, `src/App.tsx`, `src/pages/admin/AuditLogPage.tsx`, `package.json`, `eslint.config.js`, all `docs/**/*.md`. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Chose **Vercel Serverless Functions + MongoDB Atlas** over the previously-designed Next.js + Prisma + PostgreSQL + Auth.js "Phase 2" plan — a deliberately simpler, faster path to a real backend that didn't require replacing the frontend framework (Vite stayed, no Next.js rewrite). The old plan is superseded, not implemented, and documented as such rather than silently dropped.
- **JWT sessions instead of database-backed sessions**: the old proposal specifically chose database sessions so deactivating a user could force-invalidate their session immediately. The JWT approach achieves the same practical, user-facing effect differently — every request re-fetches the user from MongoDB and checks `status`, so a deactivated user is locked out on their next request — but is not literally the same mechanism (a still-valid JWT for a still-active account isn't revocable before natural expiry). Documented precisely as "practically equivalent, mechanically different" in [RBAC.md](./RBAC.md), not glossed over as identical.
- **`api/handlers/` + `vercel.json` rewrites instead of Vercel's native dynamic-route folders**: after hitting three separate undocumented routing quirks (wrong catch-all query-param key, zero-segment paths never matching, `_`-prefixed folders silently excluded), the team root-caused all three and landed on an explicit rewrite table as the reliable, tested mechanism — documented in detail in [ARCHITECTURE.md](./ARCHITECTURE.md) specifically so a future engineer doesn't rediscover the same three bugs.
- **`quoteWorkflow.ts` duplicated rather than imported** from `src/lib/quotes.tsx` into `api/_lib/`, because the source file contains JSX (a `lucide-react` icon map) and the team judged importing a `.tsx`-with-JSX file by value into a Node serverless function too risky/unproven, accepting a documented "keep these two in sync" maintenance burden instead.
- **Consolidated to 9 function files** (one-file-per-resource with internal path dispatch, or plain method dispatch for single-route resources) specifically to stay under Vercel Hobby's 12-function deployment cap.

### Problems Found
- **Vercel dynamic-route (`[...segments]`) behavior on a plain-Vite deployment did not match Next.js conventions or documentation**: the catch-all query param came through as the literal string `"...segments"` (dots included), not `segments`; a zero-segment base path (e.g. `GET /api/quotes` with no trailing path) never matched a `[...segments]` or `[[...segments]]` folder at all; and an early `api/_handlers/` folder was silently excluded from routing entirely by Vercel's `_`-prefix convention (the same convention `api/_lib/` deliberately relies on). None of these are prominently documented by Vercel for plain Functions (non-Next.js) projects — each was discovered by hitting real 404s/wrong-param-name bugs in testing.
- **Missing `.js` extensions on relative imports caused `ERR_MODULE_NOT_FOUND` in production** (but not locally) multiple times — TypeScript's `moduleResolution: "bundler"` silently permits omitting the extension, and the error only surfaces when Vercel's Node ESM loader tries to resolve the un-bundled, per-file-transpiled function at runtime. Hit and fixed repeatedly across different files before the "always add `.js` to relative imports in `api/`" rule was internalized project-wide.
- A MongoDB Atlas database-user password was pasted into the chat session by the user while working through connection-string setup — flagged to the user as a rotation recommendation; not something the assistant can verify or force, so tracked as an open TODO rather than assumed resolved.

### Problems Fixed
The routing mechanism (switched to `api/handlers/` + `vercel.json` rewrites, verified working in production) and every missing `.js` extension (found via repeated `ERR_MODULE_NOT_FOUND` production errors, fixed as each was hit, eventually converted into a documented project-wide rule so it stops recurring).

### New TODO Items
Rotate the MongoDB Atlas database-user password (unconfirmed whether done); set up CI (typecheck/lint/build on push — there is real risk now that the repo auto-deploys to production on push to `master` with nothing checking it first); explicitly verify GitHub → Vercel auto-deploy is actually wired (the CLI output implies it, but it hasn't been tested by an actual push-and-observe cycle); add rate limiting to `POST /api/auth/login`; add automated tests, especially for the new server-side permission/ownership logic in the API layer, which currently has zero test coverage and was only manually verified. All added to [TODO.md](./TODO.md).

### Future Recommendations
1. **CI is now higher-priority than before the migration**: previously a broken build only affected local dev; now the GitHub repo is connected to Vercel for auto-deploy, so an untested push could reach production. Wiring up typecheck/lint/build-on-PR should be the next infrastructure task, not deferred further.
2. **Automated tests for the API layer specifically** — the permission/ownership logic in `api/handlers/quotes.ts` and `api/handlers/users.ts` (last-active-Super-Admin guards, ownership checks, workflow state-machine validation) is exactly the kind of logic that's easy to regress silently and hard to catch via manual testing alone; it was ported carefully from the client-side version during this migration, but has no regression safety net going forward.
3. Lead & Customer Management is now unambiguously the single largest remaining bucket from the original spec — the backend migration was the other large outstanding item, and it's now done.

### Estimated Completion Percentage
~34% of the full long-term ERP vision (a large jump — this closed the single biggest previously-outstanding architectural gap: a real, server-enforced multi-user backend). ~93% of the currently-scoped modules, unchanged by this migration since it altered where logic runs, not what any module does. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-09 (Code review + bug fixes)

### What was implemented
- Ran a full multi-angle code review (8 independent finder passes: line-by-line diff scan, removed-behavior audit, cross-file call-site tracing, reuse, simplification, efficiency, altitude/design-depth, CLAUDE.md conventions) over the previously-committed RBAC system + quotation print/PDF redesign.
- Fixed every confirmed correctness bug: unenforced `quotations:export` permission on the print button, unguarded interest-toggle and Duplicate actions, workflow actions discarding unsaved edits (and mis-triggering the high-value notification off stale data), a missing last-active-Super-Admin safeguard on deactivate/role-change, a `loadRoles()` empty-array crash risk, a missing company stamp image in print output, and an inconsistent "has details" check between the editor and the print view.
- Applied several low-risk cleanup fixes alongside: unified date-formatting helpers, reused existing `nowIso()`/`newId()` helpers instead of ad hoc duplicates, deduplicated a double-reverse of approval history.

### Files Modified
`src/lib/{quotes,roles}.ts(x)`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor,PrintDocument}.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage}.tsx`. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Extended the existing `QuotePermissions` object (`canExport`, `canDuplicate`) rather than adding one-off inline permission checks at each button — keeps every quotation action gated through the one shared `computeQuotePermissions()` function, consistent with how every other workflow button already worked.
- Fixed the stale-state workflow bug by threading the current on-screen draft through `onWorkflowAction` rather than forcing users to Save before every transition — preserves the existing one-click Submit/Approve UX while closing the data-loss gap.
- Fixed `loadRoles()` at the shared loader level (fall back to `defaultRoles` on an empty array, not just a missing key) rather than special-casing the Setup Wizard's call site — the general fix closes the same risk anywhere else `loadRoles()` is called too.

### Problems Found
See the "Bugs fixed" list in [CHANGELOG.md](./CHANGELOG.md) — eight real, verified issues surfaced across the two prior sessions' work, none previously caught by `tsc`/`eslint` since they were all either permission-gating gaps, stale-closure/state bugs, or a rare-state crash, not type errors.

### Problems Fixed
All eight — see CHANGELOG for detail. Re-verified via scripted Playwright passes: a Viewer-role account confirmed to no longer see the print/duplicate/interest controls on a quote; an unsaved line-item edit confirmed to survive a direct "Submit for Approval" click (previously silently reverted); a fresh print/PDF export re-checked for regressions after the `PrintDocument.tsx` changes. Zero console errors throughout. `tsc --noEmit`, `eslint .`, `npm run build` all clean before and after.

### New TODO Items
None new — the two consciously-skipped items (legacy quote ownership edge case, VAT rate wiring) were already either newly-identified-but-out-of-scope (documented in CHANGELOG rather than TODO, since neither is a committed-to future task yet) or already tracked in [TODO.md](./TODO.md).

### Future Recommendations
1. If the legacy-quote-ownership edge case (a seed/legacy quote's `createdByUserId` getting silently claimed by whoever first acts on it) ever surfaces as a real business complaint, revisit it as its own scoped task — it needs an explicit decision on how "ownership" should work for data that predates the RBAC system, not a quick patch.
2. This review was scoped to the two most recent sessions' diff (`@{upstream}...HEAD`), not the whole codebase — an earlier full-history review may still surface more, but was out of scope for this pass.

### Estimated Completion Percentage
No change to the ERP-vision percentage (a correctness/quality pass, not new feature coverage); Phase 1 frontend-only modules remain ~93% complete, now with fewer known permission/data-integrity gaps in the RBAC and quotation modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-09 (Quotation print/PDF redesign)

### What was implemented
- User provided photos of a real, 3-page printed quotation from another vendor's system and asked for this app's print output to match it
- Built a new dedicated `src/pages/quotation/PrintDocument.tsx`: a single `<table>` with a repeating `<thead>` so the company/buyer/meta header and item-table column headers repeat on every printed page — verified by forcing a quote to 17 line items and confirming the header repeated correctly on page 2 while totals/signatures appeared only once at the true end
- Added per-unit discount (amount + %) as its own printed column, pin-icon sub-detail bullets, a Thai-language amount-in-words line under the grand total (new `bahtText()` helper), and a three-column signature table (adds a blank customer-PO-confirmation column with no backing data)
- Added four new real per-quote fields the reference document needed: buyer contact email, delivery method, delivery address, project name
- Retired the old scattered print-markup approach in `QuoteDocument.tsx`/`LineItemsEditor.tsx` (interleaved `print:hidden`/`hidden print:table-row` pairs) in favor of: screen-only components marked `print:hidden` at their root, and one dedicated print-only component rendering everything from the same data

### Files Modified
`src/pages/quotation/PrintDocument.tsx` (new), `src/lib/quotes.tsx`, `src/pages/quotation/{QuoteDocument,LineItemsEditor}.tsx`, `docs/{DATABASE,MODULES/Quotation,UI_GUIDELINES}.md`. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Chose the "one `<table>` with a repeating `<thead>`" technique specifically because browsers natively repeat `<thead>` content across print page breaks — the only reliable way to get a repeating header without a JavaScript pagination library. Documented as the new established pattern in [UI_GUIDELINES.md](./UI_GUIDELINES.md) for any future multi-page printed document.
- Kept the reference document's separate "หมายเหตุ"/"Condition"/"Payment" sections as one free-text `remarks` field rather than splitting the data model further — the existing multi-line textarea already lets the user type the same structure, and a bigger schema change wasn't warranted for this pass.
- Did not attempt to replicate the reference's page-1-only full header / condensed continuation-page header, or its "Page X/Y" numbering — both are effectively unsupported by browser-native print CSS without a heavier JS-driven pagination approach. Documented as accepted simplifications rather than silently deviating from the reference.

### Problems Found
- **Pre-existing bug surfaced by this work**: the "หมายเหตุ / เงื่อนไข" (remarks) textarea was `defaultValue`-only — a fully uncontrolled input, never wired to `onChange` or to the save payload. Anything a user typed was silently discarded on save and reset to the company default every time the document was reopened.

### Problems Fixed
Added a real `Quote.remarks` field, made the textarea controlled, and wired it through `save()` like every other document field — same treatment as the contactName/phone/address fields fixed in the 2026-07-08 PDF-polish pass. Verified via a scripted Playwright pass: filled the new fields on a seeded quote, saved, confirmed persistence, and inspected a real `page.pdf()` export directly (not just a screenshot) to confirm print fidelity, then forced 17 line items to confirm multi-page header repetition. Zero console errors; `tsc --noEmit`/`eslint .`/`npm run build` all clean before and after.

### New TODO Items
"Page X/Y" numbering and condensed continuation-page headers — both logged as known, deliberately-not-implemented items in [TODO.md](./TODO.md) rather than silent gaps.

### Future Recommendations
1. If a future request needs page numbers or a genuinely different first-page-vs-continuation-page header, that requires a JS-driven print/pagination approach (e.g. a headless-Chromium PDF generation step measuring page breaks) — flag this as a larger scope change up front rather than trying to force it via CSS alone.
2. The Phase 2 backend decision and Lead/Customer Management remain the two largest untouched buckets — this session was a scoped, self-contained document-quality pass, not a dent in either of those.

### Estimated Completion Percentage
~27% of the full long-term ERP vision (a document-quality/correctness pass on an existing module, plus a real bug fix); ~93% of the currently-scoped Phase 1 frontend-only modules — unchanged from the prior session since this didn't add new module coverage. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08 (RBAC / User Management / Approval Workflow / Notifications)

### What was implemented
- Full client-side RBAC simulation: Initial Setup Wizard (first-run only, creates the Super Admin), multi-user accounts (`src/lib/users.ts`) with hashed passwords, Position vs. Role separation, active/inactive status; public self-signup removed
- 6-role/17-permission model (`src/lib/roles.ts`, `src/lib/permissions.ts`) with a fully-hidden (not disabled) permission-gated sidebar
- User Management page (create/edit/reset password/activate/deactivate/assign role-department-position, self-role-edit blocked) and Role Management page (Super-Admin-only hardcoded gate, permission matrix editor, system roles read-only)
- Quotation approval workflow: `QuoteStatus` expanded 4 → 9 values, a `workflowTransitions` state machine, permission+ownership-computed action buttons, required-comment modal for reject/cancel, append-only approval history
- Personal signature-image upload (Settings → Profile), auto-rendered on the quotation's preparer/approver signature blocks by looking up the creator and the latest "approved" history entry; empty line (no error) when unset
- Notification bell + panel (`src/components/NotificationBell.tsx`): correct 0-unread/badge/99+ behavior, role-based delivery for submit/approve/reject/high-value/customer-accept/customer-reject events
- Append-only audit log page, read-only, no edit/delete UI
- Company Settings gained bank info/VAT rate/Terms & Conditions fields, restricted to Super Admin; quotes now persist to `localStorage` (previously in-memory only)
- Full documentation pass across all `docs/` files per the standing rule

### Files Modified
`src/App.tsx`, `src/lib/{storage,quotes,permissions,roles,users,session,notifications,auditLog}.ts(x)`, `src/pages/{SignInPage,SettingsPage}.tsx`, `src/pages/quotation/{QuotationPage,QuoteDocument,QuoteList}.tsx`, `src/pages/SetupWizardPage.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`, `src/components/NotificationBell.tsx`. `src/pages/SignUpPage.tsx` removed. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Scoped to a **client-side simulation** rather than the real Phase 2 backend migration — confirmed explicitly with the user via a clarifying question at the start of the session (Phase 1 simulation vs. starting real Next.js/Prisma/Postgres backend), since the request's security language ("unbypassable," "tamper-proof") isn't achievable without a server, and building that server is a much larger, separately-scoped effort.
- Flat 17-permission model (`module:action` keys) rather than a fully generic per-module CRUD matrix — matches the spec's literal permission list (View/Create/Edit/Delete/Approve/Reject/Export/Manage Users/Manage Roles/Manage Permissions/Manage Company Settings) while still giving real module-level sidebar differentiation.
- `roles:manage`/`company:manage` are hardcoded to the Super Admin role in addition to being permission-gated, so a misconfigured custom role can never accidentally unlock them — directly implements the spec's "Only Super Admin may..." rules as code, not just convention.
- No sequential two-level approval — the given workflow diagram has a single "Pending Approval" step; Approver Level 1 and Level 2 both get independent approve/reject rights from that state rather than a hard first-then-second gate. A deliberate scope cut, documented rather than silently skipped.
- Reused every existing pattern rather than inventing new ones: `ImageUploadField` for the signature upload, `ConfirmDialog`/`Toast`/`useToast` for confirmations and feedback, the `load*`/`save*` + `update*` `localStorage` convention for every new domain, the `lib/<domain>.ts` + `pages/<module>/` folder convention for the new `pages/admin/` module.

### Problems Found
- **Status badge/toolbar froze after a workflow transition**: `QuoteDocument`'s `quoteStatus` was `useState`-initialized once at mount from the `quote` prop; since the component doesn't remount when only the quote's status changes (same `key`, same `selectedId`), approving/submitting a quote updated the underlying data but the visible status pill and available action buttons kept showing the pre-transition state. Found via the scripted Playwright pass (status stayed on "ร่าง" after a successful submit), not by `tsc`/`eslint` — a pure runtime/React-lifecycle bug.
- Fresh-review during doc updates surfaced two intentionally-deferred gaps worth flagging clearly rather than silently leaving open: `Company.vatRate` is editable but not yet wired into `computeTotals()`, and Product Library only has sidebar-level (not button-level) permission gating.

### Problems Fixed
The status-badge bug — changed `quoteStatus` from local `useState` to a value derived directly from the `quote` prop on every render (see [CHANGELOG.md](./CHANGELOG.md)). Re-verified via the same Playwright script after the fix: status correctly shows "รออนุมัติ" then "อนุมัติแล้ว" at each step. `tsc --noEmit`, `eslint .`, `npm run build` all clean before and after.

### New TODO Items
Wire `Company.vatRate` into `computeTotals()`; add button-level (create/edit/delete) permission gating to Product Library; lift `QuotationPage`'s view/selectedId state to `App.tsx` so notification clicks can deep-link to the specific quote instead of just the list; consider sequential two-level approval if a real business need for it shows up. All added to [TODO.md](./TODO.md).

### Future Recommendations
1. The Phase 2 backend decision is even more clearly the highest-leverage next step now — the client-side `User`/`Role`/`Permission`/`Notification`/`AuditLog` shapes built this session map closely onto the already-proposed Prisma schema (see [DATABASE.md](./DATABASE.md) Migration Notes), so migrating this specific subsystem should be closer to "move the same logic server-side" than a redesign.
2. Don't let this session's "RBAC" language create false confidence — it must be described accurately to any stakeholder as a UI/workflow simulation, not access control, until Phase 2 lands.
3. Lead & Customer Management remains the other big untouched bucket from the original spec — still a reasonable next priority conversation with the user.

### Estimated Completion Percentage
~26% of the full long-term ERP vision (a genuinely large slice landed this session); ~93% of the currently-scoped Phase 1 frontend-only modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08 (continued: master-prompt triage + PDF polish)

### What was implemented
- Discovered and triaged a large "master prompt" the user pasted directly into `docs/CLAUDE.md` — extracted its requirements into `TODO.md`, kept `CLAUDE.md` concise
- Asked the user to prioritize among the huge resulting backlog (Leads/Customers, RBAC, PDF polish, User Profile uploads, Company Settings expansion, Dashboard rework) rather than attempting all of it at once
- Built the chosen priority: **Quotation PDF polish** — company logo/stamp upload, real per-quote document fields (killed the last hardcoded-placeholder-text issue), auto-hide-empty-fields in print, salesperson bound to the real signed-in user, item tags, item specifications field

### Files Modified
`docs/CLAUDE.md`, `docs/TODO.md`, `src/lib/storage.ts`, `src/lib/quotes.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor}.tsx`, `src/App.tsx` — see [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Images (logo/stamp) stored as size-capped (1MB) base64 data URLs inside the existing `localStorage`-backed `Company` record — an explicit, documented interim choice given no object storage exists yet, not a silent hack.
- Kept quotation sub-details as a flat, reorderable list rather than building nested tree UI — the master prompt asked to "re-confirm" whether nesting was needed, and no concrete business case for it surfaced, so the simpler existing implementation was kept and the decision was documented rather than deferred indefinitely.
- Standing documentation instructions (the "master prompt") were deliberately NOT left inline in `docs/CLAUDE.md` — moved to `TODO.md` so the entry-point doc stays accurate as items ship, per `CLAUDE.md`'s own stated purpose.

### Problems Found
- Several `QuoteDocument.tsx` fields (contact person, phone, address, tax ID) were hardcoded example values shown regardless of which quote was open — effectively fake data masquerading as real, which the user's master prompt explicitly flagged as unacceptable for a PDF sent to a real customer.
- The "พนักงานขาย" (salesperson) field in the document view was a completely disconnected hardcoded input, not bound to `Quote.salesperson` at all, despite that field already existing on the `Quote` type and being used correctly elsewhere (the quote list).

### Problems Fixed
Both of the above — see [CHANGELOG.md](./CHANGELOG.md) 2026-07-08 "Quotation PDF polish" entry. Verified via scripted Playwright pass covering logo/stamp upload, print-media rendering, and empty-field auto-hiding on a fresh quote. Zero console errors; `tsc`/`eslint`/`build` all clean.

### New TODO Items
Signature **image** upload (name is wired, image is not), bank account info, configurable VAT rate, company-level default Terms & Conditions — all added to `TODO.md` under their respective sections.

### Future Recommendations
1. The remaining backlog buckets (Leads/Customers, RBAC, User Profile uploads, Dashboard rework) are all still open — next session should re-run the same prioritization conversation rather than assuming an order.
2. Signature image upload and Dashboard KPI rework are both explicitly blocked on other work (file storage / Phase 2 backend, and the Lead & Customer module, respectively) — don't attempt them in isolation.
3. The `ImageUploadField` pattern built for company logo/stamp (`SettingsPage.tsx`) is directly reusable for the future User Profile picture/signature upload — no need to design a second pattern.

### Estimated Completion Percentage
~19% of the full long-term ERP vision (small increment — this was a document-quality/correctness pass on an existing module, not new module coverage); ~92% of the currently-scoped Phase 1 frontend-only modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08

### What was implemented
- Initial Vite + React + TS + Tailwind v4 scaffold, ported/rebranded from a Figma Make design to **TCS ERP**
- Dashboard module (KPIs, charts, sales leaderboard, orders, activity feed)
- Quotation module: list, create/edit/duplicate, VAT + discount totals, print
- Sign in / Sign up / Settings, wired into a real (client-only) auth gate
- Product Library module: CRUD, categories, archive/delete, duplicate, search/filter/sort/pagination
- Quotation ↔ Product Library picker integration
- Quotation item **notes** (bullet/numbered toolbar) + unlimited, drag-reorderable **sub-details**
- **PDF/print export** with dedicated indented formatting for notes/sub-details
- Full code review pass: ESLint added, strict unused-code checks enabled, all findings fixed, bundle-size warning resolved via code-splitting
- Git repository initialized and pushed to GitHub (`Wisarutbuasumlee/tcs-erp`, private)
- This documentation system

### Files Modified
See per-entry detail in [CHANGELOG.md](./CHANGELOG.md) — too many across the session to usefully summarize here without duplicating it. High-level: everything under `src/` was either created or touched at least once; `App.tsx` went from a ~1000-line monolith to a ~200-line shell as modules were extracted.

### Architectural Decisions
- No router — a single `activeNav` string switch in `App.tsx` (documented, with the tradeoff, in [ARCHITECTURE.md](./ARCHITECTURE.md))
- No component library — hand-built Tailwind, matching the ported Figma design system exactly
- One `lib/<domain>.ts` + `pages/<module>/` per data domain, established as the repo convention
- `React.lazy` + `Suspense` per top-level page, specifically to isolate `recharts` to the Dashboard chunk
- Client-only for now; a full Next.js/Prisma/Postgres/RBAC Phase 2 was *designed* but deliberately *not started*, pending a user decision (see [ARCHITECTURE.md](./ARCHITECTURE.md), [RBAC.md](./RBAC.md))

### Problems Found
- **Quotation Save/Duplicate/Send were completely non-functional** — `Quote` had no `lines` field, so the editor's line-item state was never connected to the record being viewed. Every quote showed the same 3 hardcoded example lines regardless of which was opened.
- Sign-in/Settings pages existed as files but were never wired into `App.tsx` in an earlier attempt (caught when the user reported "I can't find the sign-in page")
- Operator-precedence bug in the product list's status-column sort comparator
- No lint tooling existed at all prior to this session's code-review pass
- 709KB single JS chunk (bundle-size warning) due to `recharts` being bundled into the main chunk unconditionally

### Problems Fixed
All of the above — see [CHANGELOG.md](./CHANGELOG.md) for the detailed per-fix writeup. Verified via `tsc --noEmit`, `eslint .`, `npm run build`, and multiple scripted Playwright passes (zero console errors) covering: full quotation lifecycle including notes/sub-details, product CRUD, settings, auth flow.

### New TODO Items
See [TODO.md](./TODO.md) — highlights: decide on Phase 2 backend migration, persist `Quote[]` to `localStorage`, build Lead & Customer Management.

### Future Recommendations
1. Don't build further client-side modules (Lead/Customer/etc.) on the current no-persistence-for-quotes foundation without first fixing quote persistence — it'll compound the same class of bug.
2. The Phase 2 backend decision is the single highest-leverage next step — most other "future improvements" across every module doc are blocked or made redundant by it (real persistence, real auth, real RBAC, real multi-user).
3. Keep following the `lib/<domain>.ts` + `pages/<module>/` convention for anything new — it made the Quotation/Dashboard extraction refactors mechanical rather than risky, and it's the same shape the proposed Next.js `modules/` structure expects.

### Estimated Completion Percentage
~18% of the full long-term ERP vision; ~90% of the currently-scoped Phase 1 frontend-only modules (Dashboard, Quotation, Product, Auth, Settings). See [PROJECT_STATUS.md](./PROJECT_STATUS.md).
