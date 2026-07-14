# Codex Review Report — ERP Global Search Audit

**Review date:** 2026-07-14  
**Scope:** Read-only review of Global Search UI, API, MongoDB access, RBAC, navigation, performance, and documentation. Only the report files were changed.

## Executive Summary

**Not ready for all real internal users.** The desktop Global Search is genuinely functional: it calls a real authenticated API, groups real MongoDB results, enforces category RBAC server-side, supports debounce/cancellation/keyboard use, and excludes the removed Company Profiles module. However, it is unavailable on mobile/narrow layouts, and the endpoint permits arbitrarily long unanchored regex queries across multiple collections. These are material usability and performance/security gaps.

## Critical Issues

None found. User data is queried only when `users:manage` is held, and all business-result categories are filtered before their MongoDB searches run.

## High Priority Issues

1. **No maximum query length on a multi-collection unanchored-regex endpoint.** `GET /api/search` trims and enforces a two-character minimum but has no maximum length. It escapes regex metacharacters correctly, preventing regex injection, yet still builds literal unanchored regexes over many fields in quotations, customers, products, and users. An authenticated caller can submit oversized terms and force expensive scans. Add a server-side maximum length, reject excess input with `400`, and document it; rate limiting/Atlas Search should be evaluated as data volume grows.

2. **Global Search does not exist below `lg` (1024px).** `GlobalSearch.tsx` uses `hidden lg:flex`; on mobile and many tablet widths there is no visible search control. The Ctrl/Cmd+K listener still focuses the now-invisible input, which gives no usable UI. This is documented as deferred, but it fails the requested responsive usability review for a global ERP function.

## Medium Priority Issues

1. **View-only customer/product users are sent to editable forms.** Search returns Customers with `customers:view` and Products with `products:view`, but result activation deep-links to `CustomerFormModal`/`ProductForm` edit state without an edit-permission check. The APIs correctly reject unauthorized saves, so this is not a security bypass; it is confusing and presents an edit UI unavailable through normal list actions. Navigate view-only users to a read-only detail/list state or pass/read an explicit editing capability.

2. **Search accessibility semantics are incomplete.** Keyboard movement works visually, but the input/dropdown has no combobox/listbox roles, `aria-expanded`, `aria-controls`, `aria-activedescendant`, or semantic selected state. Focus stays on the input rather than the active row. Add these semantics and ensure the active row is scrolled into view for longer result lists.

3. **Search is a documented collection-scan design.** The five-result limit limits payload, not scan work. Standard indexes cannot efficiently serve the unanchored `$regex` `$or` searches; `ensureSearchIndexes()` includes several fields not directly useful to the quotation search. Acceptable at today’s stated scale, but it needs monitoring and a clear Atlas Search/prefix-search threshold.

4. **No automated search coverage was found.** Add API tests for category RBAC, escaping, archived/deleted exclusion, and query constraints, plus UI tests for debouncing, stale requests, keyboard navigation, and result deep links.

## Low Priority Issues

1. English query terms do not map to Thai quotation-status values; for example, English status aliases are not present in the quotation search predicate. Add bilingual status aliases if English status lookup is expected.

2. Search result rows have useful details and highlighting, but customer results omit tax ID even when that was the matching field. Consider a compact “matched by” detail without exposing more data than necessary.

## Global Search Functional Review

**Pass on desktop.** The controlled input opens a dropdown on focus, debounces API requests by 300 ms, renders grouped results, clears results below two characters, closes on backdrop click/Escape, supports Arrow Up/Down and Enter, and supports Ctrl/Cmd+K. Clicking/Enter calls validated App navigation callbacks. Previous results remain visible during a refetch with an inline spinner; errors offer retry; loading, empty query, no results, and errors are distinct. It does not block or skeleton the page.

## Quotation Search Review

**Pass.** The server searches quotation `_id`, customer/client name and snapshot company name, contact name, project, PO reference, salesperson, job type code/name, status, and remarks. Results show quote number, client/project, status/salesperson, issue date, and a before-VAT amount, then deep-link to the quote. There is no quote soft-delete field in the current schema; therefore no nonexistent filter can be applied. `quotations:view` is enforced before the search query runs.

## Customer Search Review

**Pass, with view-only navigation issue noted above.** Search uses MongoDB `customers`, never `company_profiles`, across company name, contact, phone, email, tax ID, address, and project name. It filters `isDeleted: false` and projects only company/contact/phone/email/tax ID—not address or full master data. No fake customer result array was found.

## Product Search Review

**Pass, with view-only navigation issue noted above.** Product search uses real `products`, filters `archived: false`, and matches code, name, description, specifications, unit, and linked category name. It returns a compact projection and requires `products:view` before querying.

## Page/Menu Search Review

**Pass.** Static page definitions are appropriate application metadata, contain Thai and English aliases, are permission-filtered server-side, and navigate through an App-side `NavKey` allowlist. They contain no Company Profiles / ข้อมูลบริษัท entry and do not invent a Notifications page. Action results map to real quotation/customer/product actions.

## User Search and Privacy Review

**Pass.** User search runs only when `users:manage` is held and returns only a compact management-oriented projection: name, email, employee ID, department, position, role name, and status—never username, password, password hash, or profile image. Normal users receive an empty users group, not user records.

## API and Security Review

`GET /api/search?q=` requires authentication, trims input, enforces two characters, has a per-category limit of five, escapes regex metacharacters, uses safe projections, and follows the shared HTTP error boundary. It executes category permission checks before database calls. Customer/product soft-delete filters are correct; quotation deletion is not modeled.

Regex injection is prevented by `escapeRegExp()`. The missing maximum query length remains a denial-of-service/performance concern, not an injection flaw. Server-side category filtering protects modified clients and direct API requests.

## RBAC Review

**Pass for server authorization.** Quotations require `quotations:view`, Customers `customers:view`, Products `products:view`, Users `users:manage`, and page entries each use their destination permission. Search-result navigation is also guarded by App navigation/page permissions and mutation APIs. The editable view-only deep-link behavior is a client UX inconsistency; server mutation enforcement remains intact.

## MongoDB and Performance Review

The client debounces, aborts stale requests, avoids boot-time searches, and limits each group to five rows. Quotes/customers/products/users query in parallel after authorization. Categories/roles are fetched once per relevant request for match/display joins.

The known cost is unanchored case-insensitive regex searching across multiple `$or` fields; ordinary indexes do not solve arbitrary substring matching. Add a query cap now and adopt Atlas Search or a controlled prefix/search-token strategy when data size or query latency warrants it. No full business collection is downloaded to the browser.

## Loading and Error State Review

**Pass.** Before-query hint, loading spinner, no-results copy, error/retry state, and real results are mutually distinguishable. Search affects only its dropdown and preserves the underlying page. Aborted stale requests do not become user-facing errors.

## UI / UX and Accessibility Review

Desktop layout, grouping, Thai text, secondary details, matched-substring highlighting, fixed backdrop, max-height scrolling, and keyboard controls are solid. The dropdown uses `max-w-[90vw]`, reducing overflow risk. The hidden mobile control and missing combobox semantics are the principal UX/accessibility gaps.

## No Fake Data Review

**Pass.** Quotations, customers, products, and users all come from MongoDB API queries. The only static array is the permission-filtered real application page/menu catalog, which is appropriate and contains no obsolete Company Profiles result.

## Documentation Review

Documentation broadly matches the code: it correctly describes the API, RBAC, debounce/cancellation, limits, static pages, Company Profiles removal, and the deliberate mobile/Atlas Search deferrals. It does not document the absence of a maximum query length because no such limit exists. The stated mobile deferral is a documented scope decision, but remains a functional usability gap for this audit.

## Requirements Checklist

- [x] Search input works
- [x] Placeholder matches the ERP
- [x] Quotation search works
- [x] Customer company search works
- [x] Product search works
- [x] Page/menu search works
- [x] User search is permission restricted
- [x] Results are grouped
- [x] Result navigation works
- [x] Thai search works
- [!] English search works
- [x] Minimum query length exists
- [x] Debounce exists
- [x] Stale requests are handled
- [x] RBAC is enforced server-side
- [x] Soft-deleted records are excluded
- [x] Removed Company Profiles page is not searchable
- [x] No fake business results
- [x] Loading/no-results/error states are distinct
- [x] Search does not block the whole page
- [!] MongoDB indexes/performance reviewed
- [ ] Build passes if checked
- [!] Documentation updated

## Suggested Fix Plan for Claude Code

1. Add a server-side maximum query length and consider authenticated search-rate limiting; retain escaped regex handling.
2. Ensure no unauthorized category can ever execute a query or disclose fields; retain current server-side RBAC tests.
3. Add an accessible mobile/tablet search entry point or intentionally remove the invisible Ctrl/Cmd+K behavior below `lg` until one exists.
4. Route view-only customer/product results to a read-only/list state rather than editable forms.
5. Preserve debounce/AbortController behavior; monitor scan latency and move to Atlas Search/prefix indexing at the defined scale threshold.
6. Add semantic combobox/listbox attributes, active-row scrolling, and focused-state accessibility verification.
7. Add bilingual aliases for quotation statuses if English status search is required.
8. Add API/UI regression tests and update documentation with the query cap and mobile-search decision.

## Build Check

Commands attempted without modifying the project:

- `npm run lint` — did not start: `WSL 1 is not supported. Please upgrade to WSL 2 or above. Could not determine Node.js install directory.`
- `npm run build` — did not start, with the same Node/WSL error.

Likely cause: the review shell resolves to a Windows Node installation incompatible with WSL 1. Recommended fix: use WSL2 or a Linux-compatible Node installation, then rerun lint and build.

---

## Claude Fix Status (2026-07-14)

### Critical issues fixed
None — the review found zero Critical issues. No unauthorized data exposure was found; every
result category is genuinely filtered server-side before its query runs. No action needed.

### High Priority issues fixed (2 of 2)

1. **No maximum query length on a multi-collection unanchored-regex endpoint.** Fixed. Added
   `MAX_QUERY_LENGTH = 100` to `api/_lib/searchHandler.ts` — `GET /api/search` now rejects a query
   longer than 100 characters with `400`, same as it already rejected one shorter than 2. The
   search `<input>` in `GlobalSearch.tsx` (both desktop and the new mobile variant) also carries a
   matching native `maxLength={100}` — defense-in-depth, not the real enforcement (a modified
   client could bypass a client-only constraint; the server-side check is what actually matters).
   Regex injection remains prevented by the pre-existing `escapeRegExp()`, unaffected by this fix.
2. **Global Search does not exist below `lg` (1024px).** Fixed with a real mobile entry point, not
   by disabling the Ctrl/Cmd+K shortcut (the review's suggested fallback option). Added a
   `lg:hidden` icon-only trigger button that opens a full-screen search takeover (`fixed inset-0`)
   with its own input, close button, and the same grouped results — reusing the exact same
   `query`/`results`/`activeIndex`/keyboard-handling state as the desktop dropdown, not a
   duplicated second search implementation. Ctrl/Cmd+K now checks `window.matchMedia("(min-width:
   1024px)")` to decide whether to focus the desktop input or open the mobile panel, so the
   shortcut always does something observable regardless of viewport width. Fixing this surfaced a
   real CSS bug: the notification bell's `ml-auto lg:ml-0` (previously the one element responsible
   for right-aligning the header's trailing icons on mobile, since Global Search contributed
   nothing visible there) would have competed with the new mobile trigger's own `ml-auto` for the
   same flex leftover space, pulling them apart with an unintended gap instead of grouping them —
   fixed by removing the bell's margin classes entirely now that Global Search's own elements
   correctly own that responsibility at every breakpoint (`App.tsx`).

### Medium Priority issues fixed (2 of 4 — the 2 directly actionable ones; see "not fixed" below)

1. **View-only customer/product users are sent to editable forms.** Fixed for Customers, left
   unchanged for Products (reasoning below). `CustomersPage.tsx`'s `initialEditId` handling now
   only opens the edit form (`CustomerFormModal`) when the caller's `canEdit` prop is true —
   previously it bypassed the same gate the list's own edit (pencil) button already respects. A
   view-only (`customers:view` without `customers:edit`) searcher now lands on the list instead,
   pre-filtered to that customer's company name with the status/archived filters reset so the
   record is guaranteed visible. **Products intentionally left as-is**: `ProductsPage.tsx` has no
   button-level edit-permission gating at all today — any `products:view` holder can already open
   the edit form via the normal list UI (a pre-existing, already-documented gap in
   `IMPLEMENTATION_CHECKLIST.md`, predating Global Search entirely) — so the search deep-link isn't
   introducing a new inconsistency there; fixing that pre-existing gap is out of this pass's scope.
   Users has no view/edit permission split to violate (`users:manage` is one flat permission), so
   no fix was needed there.
2. **Search accessibility semantics are incomplete.** Fixed. Added `role="combobox"`/
   `aria-expanded`/`aria-haspopup="listbox"`/`aria-autocomplete="list"`/`aria-controls`/
   `aria-activedescendant` to both the desktop and mobile inputs; `role="listbox"` on the results
   container; `role="option"`/`aria-selected`/a stable `id` on every result row (desktop and mobile
   use separate `id` namespaces since both can be mounted simultaneously). The active row now
   scrolls into view (`scrollIntoView({block: "nearest"})`) on every Arrow Up/Down.

### Remaining issues (not fixed this pass, with reasons)

- **"Search is a documented collection-scan design" (Medium).** Not a new problem — already
  documented as an accepted limitation at this ERP's real data volume in the prior pass's
  CHANGELOG entry; this review re-confirms the same conclusion rather than finding something new.
  The max-length fix above bounds the worst case but doesn't change the fundamental limitation
  (unanchored substring regex can't use a standard B-tree index efficiently). No further action
  taken beyond documenting it again alongside the new max-length cap.
- **"No automated search coverage was found" (Medium).** Not fixed. This project has no automated
  test infrastructure anywhere in it — a longstanding, deliberate, already-documented scope
  decision (see RBAC.md "Known Gaps") — introducing tests for exactly one feature in isolation
  would be inconsistent with that standing decision, not a small fix.
- **English quotation-status aliases (Low).** Not fixed — Low Priority, outside this pass's
  Critical/High/directly-relevant-Medium scope. Tracked in TODO.md.
- **Customer results don't disclose which field matched, e.g. tax ID (Low).** Not fixed — Low
  Priority, same reasoning. Tracked in TODO.md.
- **No live-database/browser verification**, including of the new mobile UI at real device widths
  — same sandboxed-session network limitation as every prior pass on this project (no
  `MONGODB_URI` reachable, no Vercel CLI installed). Verified instead via `tsc`/`lint`/`build` and
  code-level review of every changed path. See docs/TODO.md for the specific unverified behaviors.

### Search categories
Unchanged from the prior pass — Quotations (`quotations:view`), Customers (`customers:view`),
Products (`products:view`), a static permission-filtered pages/menu list, Users (`users:manage`
only). No category was added or removed this pass.

### Search API and indexes
`GET /api/search?q=` (`api/_lib/searchHandler.ts`) — query now bounded to 2–100 characters
(previously 2+ with no upper bound). Indexes unchanged from the prior pass
(`ensureSearchIndexes()`); no new indexes were added or needed for this fix pass, since the fixes
were about request-size bounding and UI/accessibility, not query shape.

### RBAC behavior
Unchanged and reconfirmed correct by this review ("Pass for server authorization") — every
category is still checked via `roleHasPermission()` before its MongoDB query runs, server-side,
independent of anything the client sends or hides. The one behavioral change this pass
(Customer view-only navigation) is a client-side UX fix, not an RBAC change — the server already
independently rejected an unauthorized save either way; see RBAC.md "Global Search."

### Performance fixes
The `MAX_QUERY_LENGTH` bound (High #1 above) is the only performance-relevant change this pass —
it caps the worst-case cost of a single request rather than changing the underlying query
strategy. The broader "full collection scan per category" characteristic is unchanged and remains
a documented, accepted limitation at this ERP's current data volume (see "Remaining issues" above).

### Files changed
- `api/_lib/searchHandler.ts` — `MAX_QUERY_LENGTH` validation.
- `src/components/GlobalSearch.tsx` — mobile full-screen search takeover, `matchMedia`-aware
  Ctrl/Cmd+K, combobox/listbox ARIA semantics, active-row scroll-into-view, client `maxLength`.
- `src/App.tsx` — removed the notification bell's now-unnecessary/conflicting `ml-auto` margin.
- `src/pages/customers/CustomersPage.tsx` — `initialEditId` handling now respects `canEdit`.
- `src/lib/i18n.tsx` — new `search.close` key (Thai + English).
- `docs/CLAUDE.md`, `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, `docs/TODO.md`,
  `docs/DATABASE.md`, `docs/API.md`, `docs/RBAC.md`, `docs/UI_GUIDELINES.md`,
  `docs/IMPLEMENTATION_CHECKLIST.md` — documentation corrections and new dated entries.

### `npm run lint` result
Clean: `0 errors`, `2 warnings` (both pre-existing, unrelated — `react-refresh/only-export-components`
on `src/lib/i18n.tsx`'s `translate()`/`useI18n()` exports, not touched by this pass).

### `npm run build` result
Clean: `tsc -b && tsc --noEmit -p tsconfig.api.json && vite build` all succeed.

### Manual test result
Not possible — same sandboxed-session limitation as every prior pass on this project (no
`MONGODB_URI` reachable, no Vercel CLI installed). Verified instead via `tsc`/`lint`/`build` and
code-level review of every changed code path, including manually re-checking the flex `ml-auto`
layout logic by reasoning through the CSS box-alignment spec (multiple auto-margin siblings split
leftover space rather than stacking) rather than visually confirming it in a browser. See
docs/TODO.md for the specific unverified behaviors (real mobile viewport rendering, live RBAC
category filtering against real data, rapid-typing stale-request handling in a real browser)
flagged as open items for whoever next has live-database/browser access.
