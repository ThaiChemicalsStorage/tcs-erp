# Codex Review Report — Quotation and Scope of Work Required-Field Validation

**Review date:** 2026-07-16
**Method:** Static review only. No application source, configuration, dependency, formatting, or commit changes were made.

## Executive Summary

Shared validation helpers, required markers, Thai inline errors, summaries, and server-side `422 DOCUMENT_INCOMPLETE` responses are implemented for both documents. Draft saves are intentionally allowed, while Quotation workflow transitions, Scope Finalization, and their API print gates use the shared validation functions.

Two High Priority defects prevent acceptance: Scope of Work creation discards the Quotation's selected document-requirement groups instead of snapshotting them; and four mandatory groups have conditional “Other” detail validation but no editable detail field in the UI. Final-action controls are visually dimmed and guarded, but they are not actually disabled. Static review also found incomplete validation coverage for several visible editable fields and semantic date checks at finalization.

## Critical Issues

None confirmed. Finalization and print endpoints independently revalidate server-side and return structured 422 errors. A client-only validation bypass was not found.

## High Priority Issues

1. **Quotation selections are not copied into Scope of Work.** `handleCreate()` in `api/_lib/scopeOfWorkHandler.ts` sets `checklistGroups: buildDefaultChecklistGroups(...)`, discarding the source Quotation's checked options and notes. This violates the required Quotation-to-Scope snapshot behavior and makes a complete Quotation create an incomplete Scope with blank mandatory groups.
2. **“Other” detail validation is impossible from the normal UI for Safety, ขนส่ง, Nameplate, and เอกสารส่งถึง.** `validateChecklistGroups()` requires `group.note` for these selections, but `buildDefaultChecklistGroups()` only defines `note: ""` for Logo. `ChecklistGroupCard` renders the detail input only when `note !== undefined`; therefore normal users cannot satisfy the validator for the other four groups. The API can accept a note, so this is an inconsistent client/server workflow rather than a missing server rule.
3. **Conditional requirements are incomplete.** Safety's `TOR / Requirement from customer` does not require a detail; billing has no custom-detail option; delivery “customer form (attach file)” has neither attachment nor date/day-specific rule; and ปจ.2 has no supporting-detail model or validation. These requested conditional cases cannot be demonstrated as enforced.

## Medium Priority Issues

1. **Final-action buttons are not disabled.** Quotation Print/Submit/Approve/Send and Scope Print/Finalize omit the HTML `disabled` attribute when incomplete. They use dimming, tooltip text, and click guards, which block normal activation, but do not meet the requested disabled-control behavior.
2. **Required-field policy does not cover every visible editable field centrally.** The central maps omit visible Quotation follow-up date, potential-opportunity checkbox, line unit price/discount, and several optional editors; Scope maps omit payment `method`, `notes`, signatory dates, and item remarks/specification rows as explicit configuration. Some are reasonable optional values, but they are not explicitly declared optional in the promised central configurations.
3. **Finalization validators only test nonblank date strings.** `validateQuotationForFinalization()` and `validateScopeOfWorkForFinalization()` do not call `validateIsoDateOrEmpty()`. PATCH/create sanitizers validate newly submitted dates, but malformed legacy/persisted values can meet the finalization check merely by being nonblank.
4. **Save-Draft errors are only surfaced as a toast.** Field/group errors from a server 422 are structured, but the document editors do not map returned `fieldErrors`/`groupErrors` back into form state. Current client-side validation is usually shown, but a server-only/race failure is not highlighted inline.

## Low Priority Issues

1. The completion counter is an aggregate count, not a per-field completion explanation.
2. Browser `window.print()` remains inherently available from the browser UI after a page renders; the protected API gate prevents the application print flow and direct print endpoint bypass, but cannot technically stop a user invoking the browser's own print command on already-rendered HTML.
3. Automated runtime/API tests for the required bypass scenarios were not found; conclusions are static.

## Quotation Required Field Review

Quotation has a central `quotationRequiredFields` configuration. Required strings use trimmed blank checks; line descriptions, units, quantities (>0), and specifications are checked before final workflow/print. Server sanitizers reject malformed strings, non-finite numbers, and invalid dates on writes. Empty/non-header line collections are blocked.

Partially implemented: price and discount are numeric-sanitized on server writes but not included in finalization required-field policy; editable follow-up date is not in the central optional map. Server-generated fields (ID, amount, dates/history/snapshots) are correctly excluded from user-required checks.

## Scope of Work Required Field Review

Scope of Work has a central `scopeOfWorkRequiredFields` configuration. Required strings are trimmed, at least one non-header item is required, item quantity must exceed zero, and each item needs a nonblank specification. Payment percentages, when used, must both be supplied and total 100%. Finalization requires an approver; Draft printing intentionally does not.

Partially implemented: semantic date validation is only at persistence, optional visible fields are not consistently centralized, and item sanitizer converts an invalid quantity type to `null` rather than immediately rejecting it on Draft save.

## Mandatory Selection Group Review

All eight required groups are built and rendered in both forms: Safety, ขนส่ง, Logo, เงื่อนไขการวางบิล, เอกสารส่งถึง, Nameplate, เงื่อนไขการส่งมอบงาน, and ปจ.2. They receive red markers, Thai inline errors, and server/client shared validation. Single groups render radio controls and are server-clamped to one value; เอกสารส่งถึง is multiple-choice and requires at least one checkbox.

No mandatory group is silently selected. Only non-mandatory test-report suggestions are preselected for LI/TA, which is documented as a job-type business suggestion. However, conditional detail entry is broken for four Other choices as described in High Priority issue 2.

## Conditional Validation Review

Implemented: Logo Etc. detail; generic Other detail rules in validation; transportation/nameplate/document-destination Other rules server-side; Scope payment percentage pair/sum rule.

Missing/partial: UI detail inputs for four Other rules; Safety TOR detail; billing custom detail; delivery customer-form attachment and date/day condition; ปจ.2 supporting detail. “Other” notes also do not visibly identify which conditional selection caused the requirement beyond the group-level Thai error.

## Frontend Validation UX Review

Implemented: required markers for configured fields/groups, Thai inline field/group errors, top summary, incomplete-group border highlighting, preserved React form state after local failure, completion indicator, tooltip explanation, and summary scrolling on blocked action.

Partial: blocked controls are not semantically disabled; scroll targets the summary rather than focusing the first invalid control; server-returned error maps are not applied after failed requests. There is no visible required marker for every editable field because several values are omitted from central policy.

## Server-Side Validation Review

Implemented: Quotation workflow applies shared validation before all non-exempt transitions from Draft; Scope finalization applies shared validation; both print endpoints revalidate persisted values; direct API calls require permissions; rejected incomplete actions return HTTP 422 with `code: DOCUMENT_INCOMPLETE`, `fieldErrors`, and `groupErrors`. Request payload sanitization uses explicit allowlists, so client `isComplete`/completion flags are not mass-assignable.

Partial: validation utilities are imported from `src/lib`, coupling server deployment to frontend source layout; semantic date validation is not rerun by the finalization functions for old data.

## Draft and Workflow Review

Incomplete drafts can be saved. Incomplete Quotations cannot be submitted, approved, sent, accepted, won, or printed through the application endpoint. Incomplete Scope documents cannot become Final or print. Reopen normalizes missing checklist groups as unchecked, preserving values rather than silently completing them.

Cancellation/rejection are intentionally validation-exempt status changes. Confirm business policy: the stated “cannot change to a final status” objective may require a decision whether cancellation of an incomplete draft is acceptable.

## Print / PDF Protection Review

`POST /api/quotes/:id/print` and `POST /api/scope-of-works/:id/print` require export/print permissions and run the same completeness validators before returning success; incomplete records get 422. The UI calls these gates before `window.print()`. Checked states are rendered from stored state in print components, and incomplete old records normalize to unchecked, not fake values.

No server-generated PDF export endpoint was found. Direct application print URLs/APIs do not bypass validation; native browser printing of rendered client HTML remains outside server control.

## Quotation-to-Scope-of-Work Snapshot Review

Most source data is copied by value into Scope (customer snapshot, job type, PO, delivery location, remarks, payment description, and cloned item/specification structures). Scope edits do not write back to Quotation, and later Quotation edits only affect Scope through the explicit refresh endpoint.

Missing: required document-selection checked states and notes are not copied at creation. Refresh likewise deliberately leaves Scope checklist groups untouched, so it cannot repair the missing initial snapshot. This is a High Priority data-flow defect.

## Existing Document Compatibility Review

Old records lacking checklist data load through `withDefaultChecklistGroups()` with unchecked mandatory groups. They do not crash, are not automatically finalized/printed, and can be manually completed. Normalization is response-only and not a destructive migration.

Partial: malformed legacy date strings can pass finalization's nonblank-date test; a runtime migration/old-record test was not possible in this environment.

## Security and Bypass Review

Workflow transitions enforce allowed source statuses, ownership/role permission checks, and complete-document validation. Scope Final records are immutable. Print endpoints require permission and do not trust the frontend completion indicator. Sanitizers reject unknown checklist structure/options and clamp radio selections.

No confirmed unauthorized status-update or mass-assignment bypass was found statically. Runtime authorization testing was not possible.

## Documentation Review

Documentation and inline comments describe the shared validation pass, print gate, draft behavior, and compatibility approach. It currently overstates the Quotation-to-Scope requirement-copy behavior: comments in `QuoteDocument.tsx` and module documentation say selections are copied, while `handleCreate()` initializes new defaults. Documentation must be corrected alongside the implementation.

## Requirements Checklist

- [!] All visible fields required by default
- [!] Optional fields centrally configured
- [x] Whitespace-only values rejected
- [x] Safety required
- [x] ขนส่ง required
- [x] Logo required
- [x] เงื่อนไขการวางบิล required
- [x] เอกสารส่งถึง required
- [x] Nameplate required
- [x] เงื่อนไขการส่งมอบงาน required
- [x] ปจ.2 required
- [!] Other details conditionally required
- [x] Empty item rows rejected
- [x] Save Draft allowed when incomplete
- [x] Continue blocked when incomplete
- [x] Submit blocked when incomplete
- [x] Approve blocked when incomplete
- [x] Print/PDF blocked when incomplete
- [x] Frontend validation exists
- [x] Server validation exists
- [x] Direct print URL blocked
- [x] Workflow API bypass blocked
- [ ] Quotation values copied into Scope of Work
- [!] Scope of Work snapshot stored
- [!] Existing records remain compatible
- [ ] Build passes if checked
- [!] Documentation updated

## Suggested Fix Plan for Claude Code

1. Fix server-side Quotation-to-Scope snapshot mapping: deep-copy source `checklistGroups` including checked options and notes at Scope creation; keep Scope independent; add tests.
2. Add a visible note/detail editor for every conditional Other option, preserve/sanitize it server-side, and validate Safety TOR, billing custom/percentages, delivery attachment/date/day, and ปจ.2 details according to confirmed business rules.
3. Apply real `disabled` attributes and accessible disabled explanations to final actions while retaining server validation and click guards.
4. Put every editable field in the central required/optional policy; rerun ISO/date and numeric semantic validation during finalization/print, including legacy records.
5. Apply server 422 `fieldErrors`/`groupErrors` into inline UI state and focus the first invalid input.
6. Add API/RBAC tests for direct workflow/print calls, `isComplete` injection, stale payloads, old records, conditional selections, and snapshot immutability.
7. Correct documentation to match the actual snapshot behavior once fixed.

## Verification Limits

`npm run lint` and `npm run build` were both attempted. Neither started: npm reported `WSL 1 is not supported` and `Could not determine Node.js install directory`. No packages were installed and no source files were changed. Runtime/database/PDF visual tests were therefore not performed.

---

## Claude Fix Status (2026-07-16, same day)

### Critical issues fixed
None were confirmed by the review, so none were needed.

### High Priority issues fixed
1. **Quotation-to-Scope checklist snapshot** — `deriveFromQuotation()` (`api/_lib/scopeOfWorkHandler.ts`) now deep-copies `quote.checklistGroups` (`cloneChecklistGroups()`, fresh option objects, no aliasing) when the source quotation has one, instead of resetting to `buildDefaultChecklistGroups()`. Falls back to defaults only when the quotation itself predates the field — an honest "nothing to copy" default, never a fabricated completed selection. Applied only at `handleCreate`, deliberately not `handleRefresh` (matches every other quotation-derived field's one-time-snapshot semantics and the explicit "editing the Quotation later must not silently change an existing Scope of Work" rule).
2. **Unreachable "Other"/TOR detail input** — `buildDefaultChecklistGroups()` (`src/lib/documentRequirements.ts`) now initializes `note: ""` on `safety`/`transportation`/`namePlate`/`documentsToSend` (previously only Logo), so `ChecklistGroupCard`'s conditional detail input actually renders for all four. `withDefaultChecklistGroups()` backfills the missing `note` onto an already-saved record (never touching `checked` state or an existing note). `safety`'s "TOR" option was also added to `OTHER_OPTION_KEYS`, since the business rule says "If TOR **or** Other is selected" — previously only "Other" triggered the requirement.

### Remaining issues
- **Billing "Custom" schedule detail, delivery "customer form" attachment/date rule, ปจ.2 supporting-detail model** — not built. Each would require inventing a business option catalog that doesn't exist today and was never confirmed — both this fix task's and the original validation task's instructions explicitly rule out fabricating business options/values. Tracked in TODO.md pending real business input.
- **Native browser print** — `window.print()` is a browser capability available on any rendered page; no server-side gate can prevent invoking it directly once the page has loaded (only the *application's own* Print button/print-triggering API calls are gated, and are). Not fixable at this layer, matches the review's own Low Priority note.
- **Shared validation code under `src/lib`** — the review noted this couples API deployment to frontend source layout. This is this codebase's existing, standing, already-documented architecture (see `docs/CLAUDE.md`'s Coding Standards on `src/lib` files transitively imported into `api/`), predating this feature and used by many other modules (`roles.ts`, `permissions.ts`, `quotes.tsx` types, etc.) — not a defect introduced by this pass, and changing it would be an unrelated architectural redesign out of scope for this fix task.
- **`sanitizeScopeItem()` coerces an invalid `quantity` type to `null` rather than rejecting the write** — pre-existing behavior of the Scope of Work item sanitizer, unrelated to required-field validation specifically (it's about malformed-input handling, not completeness), out of scope per "do not redesign unrelated modules."
- **No automated bypass/snapshot/old-record/conditional-validation tests** — this project has no automated test infrastructure anywhere (a longstanding, separately-tracked decision, see RBAC.md "Known Gaps"), not something this fix task introduces in isolation.
- **Per-field programmatic focus on the first invalid control** — still summary-level scroll only (`ValidationSummary`), not a ref per field; unchanged from the original pass, out of scope for this fix-only task.

### Required fields implemented
No change from the prior pass's field list — the fixes here were about *reachability* and *classification completeness*, not adding new required fields. Newly **explicitly classified as optional** (previously silently absent from the central config, per Medium Priority #2): Quotation's `followUpDate`, `isPotentialOpportunity`, `unitPrice`/`discount` (documented via `QUOTATION_LINE_OPTIONAL_NUMERIC_FIELDS`); Scope of Work's `paymentConditions.method`/`.notes`, `seller.date`/`approver.date`, item `remark` (via `SCOPE_ITEM_OPTIONAL_FIELDS`).

### Mandatory groups implemented
Unchanged (8 of 11 groups, same as before). What changed: the "Other requires detail" conditional is now actually satisfiable in the UI for all 5 groups that have it (`logo`, `safety`, `transportation`, `namePlate`, `documentsToSend`), not just Logo; `safety` additionally treats its "TOR" option the same as "Other."

### Conditional rules implemented
"Other"/"Etc." detail requirement: now reachable and enforced for all 5 applicable groups (previously only enforceable for Logo from the UI). Safety "TOR" now also requires detail. Payment-percentage-sum-to-100 rule: unchanged, already correct. Billing custom / delivery attachment-date / ปจ.2 detail: **not implemented** — see Remaining Issues.

### Server validation result
Unchanged in shape (still `422 { code: "DOCUMENT_INCOMPLETE", fieldErrors, groupErrors }`), now semantically stronger: finalization validators reject a non-blank-but-malformed date (`isValidIsoDateOrEmpty()`) where they previously only checked non-blank. `npx tsc --noEmit` (frontend) and `npx tsc --noEmit -p tsconfig.api.json` (API) both pass clean.

### Print/PDF protection result
Unchanged behavior (both print endpoints still revalidate server-side before returning success) — the fixes here were client-side (real `disabled` attribute on the Print button, plus the checklist-snapshot/detail-input bugs which affect what counts as "complete" in the first place, not the print gate's own logic).

### Workflow protection result
Unchanged — `handleWorkflow`'s completeness gate and its `rejected`/`cancelled` exemption are untouched by this fix pass. The review's note that this exemption "may require a business-policy decision" is acknowledged but not itself an implementation defect; still tracked as an open confirmation item.

### Snapshot result
**Fixed** — this was the pass's primary High Priority finding. A Scope of Work created from a complete Quotation now actually starts with that Quotation's checklist selections/notes checked, not blank. Verified by code inspection of `deriveFromQuotation()`/`handleCreate()`/`cloneChecklistGroups()`; not yet verified against a live database (see Manual test result below).

### Existing-document compatibility
Extended: `withDefaultChecklistGroups()` now also backfills a missing `note: ""` onto an existing group (previously it only appended wholly-missing groups). Still never touches `checked` state, never invents a selection, and is response-only (never a destructive write). A record whose `options` array itself predates the "อื่น ๆ"/"tor" option additions still won't retroactively gain those specific options — only a wholly-missing group or a missing `note` field are backfilled — tracked as a known, low-impact limitation (the module is one day old in production) in TODO.md.

### Files changed
`api/_lib/scopeOfWorkHandler.ts` (checklist-snapshot fix, `cloneChecklistGroups()` helper), `src/lib/documentRequirements.ts` (note-field initialization + backfill, TOR conditional rule), `src/lib/validation/dateUtils.ts` (new), `src/lib/validation/types.ts` (`mergeServerValidationErrors()`), `src/lib/validation/quotationValidation.ts` (date semantics, new optional-field entries), `src/lib/validation/scopeOfWorkValidation.ts` (date semantics, new optional-field entries), `src/pages/quotation/QuoteDocument.tsx` (real `disabled`, server-error merge), `src/pages/quotation/ScopeOfWorkDocument.tsx` (real `disabled`, server-error merge), `src/pages/quotation/QuotationPage.tsx` (rethrow so the document component can also catch), `api/handlers/quotes.ts` (pass `followUpDate`/`isPotentialOpportunity` into validation inputs), plus documentation (`CLAUDE.md`, `PROJECT_STATUS.md`, `CHANGELOG.md`, `TODO.md`, `DATABASE.md`, `API.md`, `UI_GUIDELINES.md`, `IMPLEMENTATION_CHECKLIST.md`, `MODULES/Quotation.md`, `MODULES/ScopeOfWork.md`, `SESSION_LOG.md`).

### lint result
`npm run lint` — 0 errors (2 pre-existing warnings in `src/lib/i18n.tsx`, unrelated to this change).

### build result
`npm run build` — clean (`tsc -b && tsc --noEmit -p tsconfig.api.json && vite build` all succeed).

### manual test result
Not performed — no MongoDB Atlas/Vercel CLI access in this sandboxed environment, the same limitation this review's own "Verification Limits" section hit attempting `npm run lint`/`npm run build` in its environment. The manual verification checklist (updated in TODO.md to call out the specific fixed scenarios) should be run against a live deployment before this is considered fully closed.
