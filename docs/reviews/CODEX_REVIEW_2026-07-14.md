# Codex Review Report — Quotation Customer Company Autofill Audit

**Review date:** 2026-07-14  
**Scope:** Read-only review of the current working tree. No application source, configuration, or dependency changes were made.

## Executive Summary

**Partially correct; not ready to be marked fully compliant.** The Create Quotation form now uses the real `customers` API, has the correctly labelled customer selector, sends an optional `customerId`, and server-side create/update code builds and persists a `customerSnapshot`. There is no active issuer-company selector in the quotation form and quote APIs do not require `issuerCompanyId`.

Two high-priority functional gaps remain: the UI/print paths never read `customerSnapshot` when reopening a quotation, and selecting a customer with blank optional delivery/project values can retain stale values from the previously edited form. Documentation also contains contradictory historical issuer-integration text.

## Critical Issues

None found.

`issuerCompanyId` is not required by `POST /api/quotes`, `PATCH /api/quotes/:id`, or the workflow endpoint. The server instead accepts optional `customerId` and ignores issuer fields because they are not in the request allowlists.

## High Priority Issues

1. **Saved `customerSnapshot` is not displayed first when reopening a quotation.** `customerSnapshot` is written in `api/handlers/quotes.ts`, but no component reads it. `QuoteDocument.tsx` initializes the visible customer fields exclusively from top-level quote fields (`quote.client`, `quote.contactName`, etc.), and the print document receives those same live top-level values. This does not implement the specified snapshot-first fallback behavior and leaves the persisted snapshot unused. Fix by deriving the displayed customer field set from `quote.customerSnapshot` first, falling back safely to legacy top-level quote fields.

2. **Customer selection can leave stale optional data in the quotation.** `handleSelectCustomer` in `src/pages/quotation/QuoteDocument.tsx` updates `deliveryMethod`, `project`, and `deliveryAddress` only when the selected customer values are truthy. If a user previously entered values, then selects a saved customer whose corresponding fields are blank, the old values remain and are saved into the selected customer's quotation snapshot. Selection must copy all nine fields, including empty strings.

## Medium Priority Issues

1. **Documentation is internally inconsistent.** `docs/MODULES/CompanyProfiles.md` contains a correction stating issuer integration was removed, but its later historical section still presents the old quotation issuer selector as current behavior. `docs/CLAUDE.md` also retains an active-looking Company Profiles table entry claiming quotation integration. This can cause future work to reintroduce the wrong feature.

2. **Dead issuer-oriented types/comments remain in application code.** `src/lib/companyProfiles.ts` still documents and exports `IssuerCompanySnapshot` / `IssuerCompanyDisplay`; `QuoteDocument.tsx` and `PrintDocument.tsx` still use the issuer-shaped display type for the single Settings-company header. It is not a selector and does not currently break the requirement, but the naming preserves confusion between issuer-company and customer-company responsibilities.

3. **No automated evidence was found for the new customer selection/snapshot scenarios.** Add API and UI coverage for selecting, clearing, manually editing, reopening, and editing a customer master after quote creation.

## Low Priority Issues

1. The selector returns at most 20 client-side matches and has no debounced/server-side search. This is acceptable for a small customer list but will not scale well.

2. The selected-state control shows only the company name; showing contact name or tax ID would make selection confirmation clearer.

## Wrong Issuer Company UI Removal Review

**Pass for the Create Quotation page.** `src/pages/quotation/QuoteDocument.tsx` renders `CustomerSelector` in Customer Information and has no issuer-company selector, Company Profiles selector, issuer preview, or strings for “ออกใบเสนอราคาในนามบริษัท” / “เลือกบริษัทผู้ออกเอกสาร”. The removed `IssuerCompanySelector.tsx` is deleted.

The quotation header still displays the single Settings-company identity, which is appropriate and is not a selectable issuer control. Company Profiles administration remains elsewhere in the application; it is not connected to the quotation form.

## Customer Selection Review

**Pass, with the high-priority optional-field defect noted above.** `CustomerSelector.tsx` is visibly placed at the top of Customer Information with the Thai label **“เลือกลูกค้า / บริษัท”**. It uses the `customers` prop populated by `fetchCustomers()` from `GET /api/customers`.

Search filters active, non-archived customers by company name, contact name, phone, email, and tax ID. Selecting a customer correctly copies company name, contact, phone, email, address, and tax ID. The resulting fields are ordinary editable inputs, and the selector can be cleared; manual entry is therefore supported.

Delivery method, project, and delivery address are not reliably autofilled when saved values are blank, as described in High Priority issue 2.

## Customer Snapshot Review

**Server persistence passes; snapshot-first display fails.** `Quote.customerId?: string` and the nine-field `CustomerSnapshot` interface exist. Create always calls `buildCustomerSnapshot()` from submitted customer fields. PATCH and workflow updates rebuild it whenever a customer-information field or `customerId` changes, while unrelated reopens/edits leave it untouched.

Quote edits write only quote fields and snapshots; they do not call the customer-master update endpoints. Consequently, customer-master edits do not change existing top-level quote data. However, the required explicit snapshot-first read behavior is absent because the UI never consumes `customerSnapshot`.

## API Review

**Pass.**

- `POST /api/quotes` requires `quotations:create`, accepts optional `customerId`, verifies it resolves to an existing non-archived customer, and saves a server-built snapshot.
- `PATCH /api/quotes/:id` validates/saves a changed `customerId` only in Draft status and refreshes the snapshot when customer fields change.
- `POST /api/quotes/:id/workflow` applies the same validation to an in-flight draft.
- No quote mutation route validates or requires `issuerCompanyId`.

The API intentionally permits inactive-but-not-archived customers when a caller supplies an ID; the UI selector excludes them. This matches the stated “exists and is not deleted” API criterion, but should be made explicit as a product rule.

## Data Source Review

**Pass.** The selector is driven by `src/lib/customers.ts` → `GET /api/customers` → MongoDB `customers` collection. No hardcoded or mock customer array was found in the quotation selector/flow. `company_profiles` is not queried by the selector.

## Company Profiles Confusion Review

**Functional pass; maintainability/documentation concern.** The customer information section uses `CustomerSelector` and `Customer` objects, not Company Profiles. `customerId` and `customerSnapshot` are distinct from issuer fields in the quote model and API.

The remaining issuer display type and stale documentation discussed above should be cleaned up so they cannot be mistaken for a still-supported multi-issuer quotation feature.

## Existing Quotation Compatibility Review

**Mostly pass, with snapshot-first caveat.** Old quotations lacking both customer fields open from their existing top-level free-text fields. Stray historical `issuerCompanyId` / `issuerCompanySnapshot` database fields are not read or required. Duplicate/edit/print paths use existing quote fields and should not crash merely because the new snapshot is absent.

Because the UI does not read `customerSnapshot`, this compatibility behavior is safe but not the required snapshot-first behavior for newer quotes.

## UI / UX Review

The selector is prominent, clearly labelled in Thai, searchable, and leaves copied fields editable. The two-column responsive layout uses standard `grid-cols-1 sm:grid-cols-2` patterns; no code-level overflow issue was found. Manual customer entry remains possible.

The stale optional-field carryover is visible and misleading: a user can select a customer yet see delivery/project information belonging to the prior customer. Resolve this before release.

## RBAC Review

**Pass.** Customer mutations use dedicated server-side `customers:create`, `customers:edit`, and `customers:archive` permissions. Customer reads require `customers:view`, except a deliberate server-side carve-out allowing a user with `quotations:create` to read only active, non-archived customers for quotation selection. Quote writes independently enforce quotation permissions and validate selected customer IDs server-side, so the selector does not grant customer-master edit authority.

## Code Quality Review

The customer API and quote snapshot construction are explicit, allowlisted, and server-authoritative. The snapshot data is duplicated as top-level quote fields and a snapshot, but the read path is incomplete; this is the main quality/design defect. Stale issuer abstractions and historical prose should be removed or unequivocally marked archival.

## Documentation Review

Customer and API documentation accurately describe the corrected customer flow in many places. However, the active-looking old issuer integration material in `docs/MODULES/CompanyProfiles.md` and `docs/CLAUDE.md` conflicts with it. Update these documents to state that Company Profiles are not used by quotations, or move obsolete implementation detail to an explicitly historical changelog section.

## Build Check

Both optional checks were attempted without modifying the project:

- `npm run lint` — failed before linting: `WSL 1 is not supported. Please upgrade to WSL 2 or above. Could not determine Node.js install directory.`
- `npm run build` — failed before compilation with the same Node/WSL environment error.

Likely cause: the current shell resolves to a Windows Node installation that does not support this WSL 1 environment. Recommended fix: run with a Linux/WSL2-compatible Node installation, then rerun lint and build.

## Missing Requirements Checklist

- [x] Issuer company selector removed
- [x] "ออกใบเสนอราคาในนามบริษัท" removed from Create Quotation
- [x] Quotation save does not require issuerCompanyId
- [x] Customer selector exists
- [x] Customer selector uses customers collection/API
- [x] Customer search works
- [!] Selecting customer auto-fills customer fields
- [x] User can edit copied customer fields
- [x] customerId saved when customer selected
- [x] customerSnapshot saved
- [ ] customerSnapshot displayed first
- [x] Customer master edits do not unexpectedly change old quotations
- [x] Manual customer entry works if allowed
- [x] No fake customer data
- [x] Company Profiles not confused with customers in the quotation flow
- [x] Existing quotations still open
- [ ] Build passes if checked

## Suggested Fix Plan for Claude Code

1. Keep issuer company UI removed; remove or rename remaining issuer-only display abstractions/comments so they cannot revive the wrong flow.
2. Keep `issuerCompanyId` absent from quote mutation contracts; add regression tests that prove it is not required.
3. Retain the current `CustomerSelector` and customers API data source.
4. Change selection to assign every customer field unconditionally, including blank delivery method, project name, and delivery address.
5. Add a single snapshot-first customer-field resolver for quotation detail and print rendering, with legacy top-level fields as fallback; use it when initializing editable fields.
6. Preserve the existing server-side customer existence/archive validation and add tests for malformed, missing, archived, and inactive IDs.
7. Add compatibility tests for legacy quotes without snapshots and records containing obsolete issuer fields.
8. Remove dead issuer naming/types where feasible, or rename the remaining single-company document-header display model.
9. Correct contradictory Company Profiles and architecture documentation, keeping historical material only in changelog/archive sections.
