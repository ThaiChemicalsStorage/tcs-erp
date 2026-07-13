# Codex Review Report — Company Profile Selection in Quotation Audit

**Review date:** 2026-07-13

**Scope:** Read-only review of quotation issuer selection, snapshots, APIs, Company Profile read access, print/PDF behavior, RBAC, audit records, UI, and project documentation. No application source, configuration, dependency, or formatting change was made.

## Executive Summary

**Ready for controlled internal use, subject to a small compatibility/fallback correction and live-database verification.**

The requested end-to-end path is implemented. A user creating a quotation can select a saved active Company Profile. The API validates the chosen profile server-side, stores issuerCompanyId, derives issuerCompanySnapshot server-side, and locks issuer changes after Draft. On-screen preview and PrintDocument use the saved snapshot first, protecting historic documents from later master-data edits. No fake issuer profiles or hardcoded issuer header were found.

The main remaining weakness is the fallback path for a quote that has issuerCompanyId but lacks issuerCompanySnapshot: if its referenced profile is no longer active, the UI jumps to the legacy single-company singleton instead of trying the default active Company Profile before warning. This is a rare legacy/partial-data case, but it does not meet the requested fallback order exactly.

## Critical Issues

No Critical issue was found in issuer-company creation, server-side snapshot generation, Company Profile validation, or server-side RBAC for the reviewed routes.

## High Priority Issues

No High Priority missing selector, snapshot, hardcoded issuer data, or inactive/deleted issuer acceptance was found.

## Medium Priority Issues

1. **Fallback chain skips the default active profile.** In QuoteDocument.tsx, a saved quote with no snapshot uses a live profile only if issuerCompanyId matches an active record. If that profile is inactive/deleted/unavailable, it falls directly to the legacy company singleton. It does not then try defaultActiveProfile. This conflicts with the required fallback order: snapshot, referenced profile, default active profile, warning/empty state.

2. **Issuer selection is allowed to be empty for a Draft.** api/handlers/quotes.ts accepts omitted or empty issuerCompanyId, and the UI shows a warning rather than blocking the save. This is documented as an intentional business choice, not a hidden defect, but it means a new quotation can still be created using the legacy singleton rather than a reusable profile.

3. **Sales users receive the entire active Company Profile document.** GET /api/company-profiles permits quotations:create and correctly filters active/non-deleted records, but it returns bank account details, base64 logo/stamp data, and all document fields. This is sufficient for selection but broader than a lightweight issuer-selector projection.

4. **Header preview is a selector-panel preview rather than a persistent document-header band.** It clearly updates immediately and shows required issuer information, but the visible main quotation document header is represented by the print-specific PrintDocument. Usability testing should confirm that staff understand the selected issuer before saving.

## Low Priority Issues

1. Issuer display currently prefers addressTh; an English-only document variant has no addressEn selection.
2. The inline comment above issuer fields in src/lib/quotes.tsx still begins with obsolete “Prep only, not yet wired” wording before its later update note.
3. No API endpoint returns only the current default profile; the client derives it from the active list, which is adequate at this scale.

## Business Requirement Review

The reusable issuer-company flow is implemented:

1. Company Profiles are persisted in MongoDB company_profiles.
2. QuoteDocument.tsx renders IssuerCompanySelector with the Thai “ออกใบเสนอราคาในนามบริษัท” title.
3. The selected id is included in the quotation draft.
4. api/handlers/quotes.ts resolves the id against MongoDB and writes both issuerCompanyId and issuerCompanySnapshot.
5. Existing quotes display their snapshot first, so future Company Profile edits do not change issued documents.

No multi-tenant design was introduced. Company Profiles remain internal issuer master data.

## Company Selector Review

IssuerCompanySelector.tsx is populated from the Company Profiles state passed through App.tsx, QuotationPage.tsx, and QuoteDocument.tsx.

- A caller with companyProfiles:view sees the management list; a quotations:create-only Sales user is allowed to GET active, non-deleted profiles by api/handlers/company-profiles.ts.
- QuoteDocument.tsx independently filters to isActive and not isDeleted.
- The default active record is preselected. If no default exists and exactly one active record exists, that record is selected.
- Multiple active records are selectable; default is marked in the option label.
- Changing the selection updates issuerDisplay immediately.
- The selector does not mutate Company Profile master data.
- No static company array or fake issuer record was found.
- If no active profiles exist, it shows a Thai empty state and provides a Company Profiles navigation button only to a user with Company Profile view access.

## Header Preview Review

IssuerCompanySelector.tsx previews logo, Thai name, English name when supplied, address, phone, fax, email, website, tax ID, branch name, and branch code. Empty fields are omitted, rather than rendered as placeholders. Text uses a min-w-0 content wrapper and responsive card layout, so long content can wrap.

PrintDocument.tsx receives the resolved issuer object and renders logo, issuer name, address, tax ID, phone, and email. It does not use a hardcoded company header. Fax, website, branch, and English name are available in the preview/snapshot but not currently printed; this is a document-design decision to confirm with business users.

## Quotation Storage / Snapshot Review

Quote has optional issuerCompanyId and issuerCompanySnapshot fields in src/lib/quotes.tsx. IssuerCompanySnapshot contains:

- company code, Thai/English names, display name
- logo and stamp data URLs
- Thai/English addresses
- tax ID, branch name/code, phone, fax, email, website
- bank accounts
- quotation prefix, terms, and footer

resolveIssuerCompanyUpdate() in api/handlers/quotes.ts constructs this snapshot from the MongoDB profile. The client sends only issuerCompanyId; it has no write path for a client-authored snapshot. This is the correct anti-tampering and historic-document design.

## Quotation API Review

| Operation | Evidence | Result |
| --- | --- | --- |
| Create quote | POST /api/quotes resolves issuerCompanyId | Existence, active state, and archive state validated server-side; id and snapshot are inserted |
| Update Draft | PATCH /api/quotes/:id | Issuer change is resolved server-side and gets a fresh snapshot |
| Non-Draft update | PATCH handler | Server rejects issuer change unless status is Draft |
| Workflow request | POST workflow route | Same Draft-only issuer rule before a transition |
| Clear issuer | Explicit empty issuerCompanyId | Clears id and unsets snapshot; permitted for legacy/Draft compatibility |
| Audit | writeQuoteAuditEntry | Create and issuer-change events include related quote/customer and issuer profile id/name |

An inactive or archived Company Profile cannot be submitted as an issuer: resolveIssuerCompanyUpdate() returns a Thai 400 error. This is not client-only validation.

## PDF / Print Review

PrintDocument.tsx has been changed from a company singleton prop to an issuer prop. QuoteDocument.tsx resolves that prop in this order for the normal saved-quote path:

1. issuerCompanySnapshot when the saved quote has not had its selector changed in the session
2. active selected live Company Profile
3. legacy Settings company singleton

This protects snapshot-bearing quotations and avoids a blank/crashing header for old quotations. The medium-priority exception is that a default active profile is not tried between the live-id lookup and singleton fallback.

## Old Quotation Compatibility Review

Old quotations without issuer fields continue to open because issuerDisplay always has a legacy singleton fallback. They do not crash, and a Draft quote can select an issuer and save a fresh snapshot. Quotes that already have a snapshot are insulated from later Company Profile changes.

The partial-data case described under Medium Issues should be corrected before any migration/import is allowed to create issuerCompanyId without a snapshot.

## RBAC Review

- Company Profile management remains protected by companyProfiles:view/create/edit/archive/delete/setDefault.
- Sales users do not receive those management permissions by default.
- A user with quotations:create may read only active/non-deleted profiles from GET /api/company-profiles so they can select an issuer.
- Company Profile management mutations still require their specific server-side permissions.
- Quote create requires quotations:create; issuer changes use the existing server-side quote ownership/edit checks and Draft-only rule.
- Sidebar management visibility remains gated by companyProfiles:view.

No direct API bypass of issuer validation or Company Profile management RBAC was found.

## Audit Log Review

Quotation create with an issuer writes a server-authoritative Quotation Created event including:

- authenticated actor
- quotation id/number and customer
- relatedCompanyProfileId
- relatedCompanyProfileName
- timestamp

A Draft issuer change writes the distinct Quotation Issuer Company Changed action with the same structured linkage. Company Profile mutations themselves are also now logged inside api/handlers/company-profiles.ts. The snapshot is created as part of quote creation/change; it is represented in the authoritative quote event rather than logged as a redundant separate event.

## No Multi-Tenant / No Fake Data Review

No tenantId, tenant switching, separate database, separate domain, or unrelated data-isolation logic was found. No fake company list, mock company API data, or hardcoded issuer records/header content was found. The only legacy fallback is the pre-existing Settings company singleton, and the no-issuer warning makes that fallback visible.

## UI / UX Review

The selector title, default label, profile preview, lock explanation for non-Draft records, and no-active-company empty state are clear. The form is responsive by source classes: selector preview uses a wrapping flexible card and print is separate.

Recommended user testing: long Thai address/company strings, a Sales user with only quotations:create, no active profiles, one profile, several profiles, an inactive previously-selected profile, and a saved snapshot after master data changes.

## Empty State Review

With zero active profiles, IssuerCompanySelector.tsx shows a useful empty state instead of fabricated issuer data or a crash. It offers navigation to Company Profiles only when the viewer can see that module. A Draft can still be saved without an issuer, with a visible warning, per the documented workflow decision.

## Code Quality Review

Strengths:

- Snapshot construction is centralized in resolveIssuerCompanyUpdate().
- Rendering uses a shared IssuerCompanyDisplay shape, preventing form/print source drift.
- The client does not duplicate snapshot calculation.
- Issuer naming is mostly consistent across UI, model, API, and audit fields.

Improvements:

- Extract an explicit fallback resolver that accepts snapshot, issuer id, profile list, default profile, and singleton; test its precedence independently.
- Remove obsolete prep-only comments from src/lib/quotes.tsx.
- Consider a lightweight selector DTO to avoid returning stamps/bank account details for list selection.
- QuoteDocument.tsx remains a large multi-purpose component; issuer resolution could become a focused hook/helper once it grows further.

## Documentation Review

Documentation is broadly updated and accurately describes the selector, active-only Sales read access, server-built snapshot, Draft-only issuer changes, print integration, and intentional non-required issuer behavior. The main documentation mismatch is historical wording:

- src/lib/companyProfiles.ts and the beginning of the issuer comment in src/lib/quotes.tsx still say integration is “not yet wired,” while later comments and docs correctly state it is live.
- docs/MODULES/CompanyProfiles.md has older introductory paragraphs stating no selector/print integration before its later Quotation Integration section; the newer section is correct but the document is internally contradictory.
- Documentation states snapshot → live profile → legacy singleton but does not call out the absent default-active fallback for partial records.

## Missing Requirements Checklist

- [x] Company profiles can be saved
- [x] Create Quotation has company selector
- [x] Default company preselected
- [x] Multiple active companies selectable
- [x] Selector uses MongoDB/API data
- [x] Header preview updates immediately
- [x] issuerCompanyId saved
- [x] issuerCompanySnapshot saved
- [x] Snapshot created server-side
- [x] Old quotations do not break
- [x] Old quotations do not unexpectedly change after master company edit
- [x] PDF/print uses selected company or TODO documented
- [x] No hardcoded company header
- [x] No fake company data
- [x] Sales users can read active companies
- [x] Sales users cannot manage company profiles
- [x] APIs enforce RBAC
- [x] Empty state works
- [x] Audit logs created
- [!] Documentation updated
- [!] Build passes if checked

## Suggested Fix Plan for Claude Code

1. Add and test the missing fallback step: snapshot → referenced live profile → default active profile → legacy singleton plus warning.
2. Decide whether new Draft quotation creation should require an issuer profile. If it remains optional, make the legacy fallback warning especially prominent and prevent printing/sending if business requires an issuer then.
3. Create a minimal active-issuer selector response/projection for quotations:create callers, excluding unnecessary stamp/bank payloads unless required by preview.
4. Expand print layout only if business requires fax, website, branch, English name, or document bank details in the PDF header/footer.
5. Add integration tests against MongoDB for active/inactive/deleted profile validation, snapshot immutability, Draft-only change, Sales read permissions, and the fallback chain.
6. Remove stale prep-only wording from source comments and older documentation sections.

## Build Check

Command attempted: npm run lint && npm run build

Result:

    WSL 1 is not supported. Please upgrade to WSL 2 or above.
    Could not determine Node.js install directory

Likely cause: local WSL/Node toolchain configuration. This is not a source lint/build result; run it under WSL2, native Windows Node, or CI.

---

## Claude Fix Status

**Scope of this fix pass**: Critical and High Priority issues related to the Company Profile
header integration in the Quotation form. This review found **zero Critical** and **zero High
Priority** issues in that area — every item in "Missing Requirements Checklist" is checked except
documentation/build, which are addressed below. The only concrete, in-scope code defect was
**Medium #1** (the fallback-chain gap), which is fixed. The remaining Medium/Low items and the
"Suggested Fix Plan" items are either explicitly out of this task's scope (full print-layout
expansion, a hard-required-issuer business decision, integration tests against a live database) or
left as documented, tracked limitations — see "Remaining issues" below.

### Fixed

1. **Medium #1 — fallback chain skipped the default active profile.** `QuoteDocument.tsx`'s
   `issuerDisplay`/`hasIssuerProfile` resolution now tries, in order: (1) the quote's own
   `issuerCompanySnapshot`, (2) the live profile the quote actually references (if still
   active/not-deleted), (3) **the default active company profile — newly added** — covering the
   exact partial-data case this review flagged (an `issuerCompanyId` set with no snapshot, whose
   referenced profile has since been deactivated/archived), (4) the legacy Settings → Company Info
   `company` singleton. Both the header band's live preview and `PrintDocument.tsx` (which receives
   the same resolved `issuerDisplay`) benefit from this fix. Verified via an isolated Playwright
   preview reproducing the exact scenario (a quote referencing a deactivated profile with no
   snapshot, alongside a separate default active profile) — the header now correctly shows the
   default active profile's real data instead of the legacy singleton, and no warning banner is
   shown (a real, non-fake company was resolved).
2. **Documentation mismatch — stale "prep only"/"not yet wired" wording.** `src/lib/quotes.tsx`'s
   `issuerCompanyId` doc comment and `src/lib/companyProfiles.ts`'s `CompanyProfile` doc comment
   both still described the integration as unbuilt; both now describe the live, wired-in
   integration. `docs/MODULES/CompanyProfiles.md`'s introductory "Relationship to the `company`
   singleton" section and its "no Quotation-form UI selects one yet" sentence — both written before
   the Quotation integration pass but never updated — are corrected to describe the actual,
   currently-implemented 4-step fallback chain, removing the internal contradiction this review
   flagged. `docs/MODULES/Quotation.md`'s "Issuer Company" section's fallback-order description
   updated to include the new default-active-profile step.

### Remaining issues (not fixed this pass, with reason)

- **Medium #2 (issuer optional on Draft) — not changed, by design.** Already an explicit, documented
  business decision (this review itself calls it "not a hidden defect"). Changing this to a hard
  requirement is a product decision outside this task's scope ("do not implement the full
  multi-company quotation issuing system yet" / header-integration-only task framing) — tracked in
  TODO.md/MODULES/CompanyProfiles.md "Known Limitations" for a future explicit business decision.
- **Medium #3 (full Company Profile payload on the selector's list response) — not changed.** The
  suggested fix ("a lightweight issuer-selector projection") is a real API-shape change beyond
  "using Company Profile data in the form header," and this task explicitly scoped out further
  multi-company-system work; today's real scale (a handful of company identities) makes this a
  performance nicety, not a correctness or security defect. Left for a future pass if profile counts
  grow.
- **Medium #4 (header preview is a selector-panel preview, not a persistent document-header band)
  — not changed.** This describes the on-screen editing UI's existing, intentional layout (a
  preview card above the customer section, with the navy header band below it also driven by the
  same resolved `issuerDisplay`); no functional gap was identified, and reworking the layout further
  risks exactly the "do not redesign unrelated modules" instruction. Flagged as a UX question for
  real user testing, not a code defect, per the review's own framing.
- **Low #1/#3 (English-address print variant, no dedicated "get default profile" endpoint) — not
  changed.** Both are speculative future conveniences, not required by this task or flagged as
  urgent by the review.
- **Print layout expansion (fax/website/branch/English name in the PDF) — explicitly not done**,
  per this task's own instruction ("Do not implement full PDF company switching yet unless Codex
  explicitly found a safe required fix") — the review itself frames this as "a document-design
  decision to confirm with business users," not a required fix.
- **Live-database integration tests (Suggested Fix Plan #5) — not possible.** This session has no
  network path to MongoDB Atlas (the same sandboxed-environment limitation noted in every prior
  pass's docs — see PROJECT_STATUS.md "Known Risks"); the local build-check environment itself also
  reported a WSL1 incompatibility, separate from this constraint.
- **Cosmetic observation, not from this review**: when a quote's `issuerCompanyId` references a
  profile no longer present in the active list (the same stale-reference scenario Medium #1
  addresses), the `<select>`'s bound value has no matching `<option>` — the browser silently shows
  its first available option instead. This does not corrupt data (the underlying `issuerCompanyId`
  state is untouched and nothing is resent on save unless the user explicitly changes the
  selection), and was not flagged by this review; noted here for a future pass, not fixed now to
  keep this pass scoped to the reported findings.

### Files changed

- `src/pages/quotation/QuoteDocument.tsx` — added the default-active-profile fallback step to
  `issuerDisplay`/`hasIssuerProfile`; corrected a stale doc-comment cross-reference.
- `src/lib/quotes.tsx` — rewrote the `issuerCompanyId` doc comment (removed "prep only, not yet
  wired" wording).
- `src/lib/companyProfiles.ts` — rewrote the `CompanyProfile` interface's doc comment (removed "no
  Quotation-form UI selects one yet" wording).
- `docs/MODULES/CompanyProfiles.md` — corrected the introductory "master-data management only" /
  "Relationship to the `company` singleton" sections; expanded the "Display resolution" fallback
  description to the full 4-step chain.
- `docs/MODULES/Quotation.md` — expanded the "Issuer Company" section's fallback-order description
  to match.
- `docs/CLAUDE.md`, `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, `docs/TODO.md`,
  `docs/DATABASE.md`, `docs/API.md`, `docs/UI_GUIDELINES.md`, `docs/IMPLEMENTATION_CHECKLIST.md` —
  updated to record this fix pass (see each file's latest dated entry).

### Build result

`npx tsc -b` — clean. `npx tsc --noEmit -p tsconfig.api.json` — clean. `npm run lint` — clean (2
pre-existing `react-refresh/only-export-components` warnings in `src/lib/i18n.tsx`, unrelated to
this change, 0 errors). `npm run build` — clean, all chunks emitted successfully.

### Manual test result

No live-database walkthrough was possible in this sandboxed session (no network path to MongoDB
Atlas — same constraint noted throughout this report and PROJECT_STATUS.md "Known Risks"). Verified
instead via an isolated Playwright preview (`preview.html` + `src/previewMain.tsx`, deleted after
use per this project's established verification pattern) mounting the real `QuoteDocument`
component with mock data reproducing the exact Medium #1 scenario: a quote whose `issuerCompanyId`
references a deactivated Company Profile with no `issuerCompanySnapshot`, alongside a separate
default active profile. Confirmed at both 1440px and 390px: the header preview and the navy
document-header band both correctly display the **default active profile's** real data (not the
legacy singleton, not fabricated data), no warning banner is shown, the customer-information form
below the header renders and accepts input normally, and no layout overflow or console errors occur
(aside from a harmless missing-favicon 404).
