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
