# Codex Review Report — Company Profiles Module Audit

**Review date:** 2026-07-13
**Scope:** Read-only audit of the Company Profiles source, MongoDB access, APIs, RBAC, UI, upload validation, quotation preparation, and project documentation. No application source, configuration, dependency, or formatting change was made.

## Executive Summary

**Not ready for safe internal operational use until default-profile invariants and audit integrity are fixed.**

The module correctly treats Company Profiles as internal issuer-company master data, not customers, users, or SaaS tenants. It implements a MongoDB company_profiles collection, list/create/edit/detail/archive/default UI, permission-gated API routes, server-side field and image validation, and deliberately deferred quotation snapshot preparation.

The important gaps are: a default profile can be deactivated; concurrent requests can leave multiple defaults; and Company Profile audit records are written from the client through a generic endpoint, so they are incomplete and can be forged as arbitrary Company Profile actions by authenticated users.

## Critical Issues

No Critical issue was found in the server-side RBAC enforcement for Company Profile data APIs. Every exposed route in api/handlers/company-profiles.ts calls requirePermission().

## High Priority Issues

1. **A current default company can be deactivated without reassignment.** PATCH accepts isActive through api/_lib/companyProfileValidation.ts and api/handlers/company-profiles.ts without checking whether the target is default. The list exposes this action for default records in src/pages/admin/companyProfiles/CompanyProfileList.tsx. This can leave no active default company.

2. **The one-default rule is unsafe under concurrent requests.** First creation uses countDocuments followed by insertOne, so simultaneous first creates can both become defaults. Set-default uses updateMany followed by updateOne without a transaction or partial unique index. Concurrent calls can interleave and leave two defaults. Evidence: api/handlers/company-profiles.ts and its only indexes: unique companyCode plus non-unique isDefault/isActive/isDeleted.

3. **Audit records are client-authored and incomplete.** CompanyProfilesPage.tsx calls onAudit after mutations; App.tsx fire-and-forgets generic POST /api/audit-log. api/audit-log/index.ts accepts arbitrary module/action/details for any authenticated user except the quotation module. The actor is correctly server-derived, but the server cannot prove the Company Profile mutation happened, and entries omit companyProfileId and changed fields.

## Medium Priority Issues

1. The first profile is forced default but can be created inactive, creating an inactive default.
2. GET /api/company-profiles returns every record, archive state, bank account, logo, and stamp without pagination, search/filter parameters, or a projection. Filtering is client-side.
3. App.tsx fetches Company Profiles during every signed-in boot before permission-specific rendering. Users without companyProfiles:view may receive a 403 that blocks the shared Promise.all boot path; this needs runtime verification.
4. Bank accounts are limited to ten and only enforce at most one default; blank account rows and arbitrary account numbers are accepted.
5. Set Default is a dedicated list action, not available in the Basic Information form as requested. The separate API is safer, but the form requirement is partial.
6. Deactivate is immediate and has no confirmation or default-profile warning; archive and set-default do have dialogs.
7. The detail screen renders timestamps but not the stored createdBy/updatedBy identities.

## Low Priority Issues

1. List action buttons are icon-only and rely on title rather than explicit aria-labels.
2. Detail image alt text is generic “logo” / “stamp”.
3. Several table labels use compact 10–12px mono text, which is dense for Thai administration.
4. Base64 image storage is valid and capped, but it increases document and response size.

## Business Requirement Review

The concept is implemented correctly. src/lib/companyProfiles.ts and docs/MODULES/CompanyProfiles.md explicitly define a Company Profile as an issuer identity for future quotation headers, not a customer, user, website, or separate tenant. No tenantId, tenant switching, per-company database, separate site, or data-isolation architecture was found.

The requested master-data actions exist: view, create, edit, detail, activate/deactivate, archive/restore, and set default. Issuer selection on quotations is intentionally deferred rather than partly enabled.

## Database / Model Review

Collection: company_profiles through companyProfilesCollection() in api/_lib/collections.ts.

| Area | Result | Evidence |
| --- | --- | --- |
| Identity | Code; Thai/English name; display name; tax; branch; contact fields | src/lib/companyProfiles.ts |
| Branding | Logo/stamp data URLs; prefix/format; terms/footer; signature label | src/lib/companyProfiles.ts |
| Bank records | Array with bank/name/number/branch/default | BankAccount interface |
| Lifecycle | isDefault, isActive, isDeleted, timestamps, creator/updater IDs | CompanyProfile interface |
| Archive metadata | No archivedAt/archivedBy; only generic updatedAt/updatedBy | company-profiles handler |
| Indexes | Unique companyCode and individual lifecycle indexes | company-profiles handler |

The model is suitable and extensible for issuer-document master data. logoDataUrl/stampDataUrl are embedded base64 image values, not storage URLs; that is the implemented design, not an omitted upload API.

## Default Company Logic Review

Implemented safeguards:

- First profile is automatically default.
- Archived or inactive profiles cannot be selected as a new default.
- Archive of the current default is blocked.
- Normal PATCH cannot directly set isDefault or isDeleted.

Failures:

- Normal PATCH can deactivate the default.
- The initial default can be inactive.
- No transaction or database uniqueness constraint protects the one-default invariant.
- A failed set-default sequence can leave no default.

The intended rule is sound, but it is not safely guaranteed by the current API.

## API Review

| Method | Endpoint | Permission | Review result |
| --- | --- | --- | --- |
| GET | /api/company-profiles | companyProfiles:view | RBAC enforced; returns all data; no pagination/filter/projection |
| POST | /api/company-profiles | companyProfiles:create | Server validation and duplicate-code protection; default concurrency/inactive weakness |
| GET | /api/company-profiles/:id | companyProfiles:view | RBAC enforced; 404 when absent |
| PATCH | /api/company-profiles/:id | companyProfiles:edit | Whitelisted validation; permits default deactivation |
| POST | /api/company-profiles/:id/archive | companyProfiles:archive | Reversible soft archive; blocks default archive |
| POST | /api/company-profiles/:id/set-default | companyProfiles:setDefault | Blocks inactive/archived target; non-transactional |
| Logo/stamp | POST/PATCH fields | create/edit | Server-validated data URLs; no separate endpoint |

The API uses whitelisted sanitization, escaped code-uniqueness regex, ObjectId conversion, Thai errors, and centralized HTTP error handling. No MongoDB operator injection path was found.

## RBAC Review

Permissions exist: companyProfiles:view, companyProfiles:create, companyProfiles:edit, companyProfiles:archive, companyProfiles:delete, companyProfiles:setDefault.

- Sidebar visibility is gated by companyProfiles:view in src/App.tsx.
- The render guard rejects inaccessible navigation state.
- Buttons are permission-gated.
- Direct API access is independently protected by requirePermission().
- Sales, approver, and viewer roles receive no Company Profile permission by default; Administrator has view only by default and can be granted more.

companyProfiles:delete is unused by design because archive is the only removal action.

## File Upload Review

ImageUploadField.tsx uses image-only selection, client MIME/size checks, preview/remove UX, and visible errors. The server is authoritative:

- validateImageDataUrl accepts only PNG, JPEG/JPG, WEBP, or GIF base64 image values.
- It rejects SVG, arbitrary URLs, arbitrary strings, and script-style image payloads.
- It enforces a 2MB size cap.
- No unsafe filesystem/public path or hardcoded uploaded path exists.

Logo/stamp upload is safe for the current embedded-data approach, but upload changes are not separately audited.

## UI / UX Review

CompanyProfileList.tsx implements search by name/code/tax ID, active/inactive/default filters, archived toggle, responsive table scrolling, useful columns, and confirmation dialogs for archive/default.

CompanyProfileForm.tsx groups Basic, Contact, Document, Branding, and Bank Account fields; provides Thai client validation, repeated bank rows, upload previews, and unsaved-change confirmation for in-page leaving. CompanyProfileDetail.tsx displays branding, Thai/English names, status/default, contacts, bank data, document text, and timestamps.

The UI is clear and does not look like a tenant-management system. Main UX gaps are unconfirmed deactivation, no in-form default state, and no created/updated user metadata in detail.

## Empty State Review

Implemented correctly by CompanyProfileList.tsx and i18n strings:

- ยังไม่มีข้อมูลบริษัท
- เริ่มต้นโดยการเพิ่มข้อมูลบริษัทสำหรับใช้บนเอกสารใบเสนอราคา
- เพิ่มข้อมูลบริษัท action when the viewer has create permission

No fake/demo Company Profile record or static Company Profile array was found.

## Audit Log Review

The UI attempts audit entries for create, update, activate/deactivate, archive/restore, and default change. They are not written by the server-side mutation handler, lack structured company profile linkage/field diffs, and lack distinct logo/stamp upload events.

This requirement is partially implemented. Audit logging should be moved into api/handlers/company-profiles.ts and committed as part of the mutation using the authenticated context.

## Future Quotation Integration Review

src/lib/quotes.tsx has optional issuerCompanyId and issuerCompanySnapshot fields. Its comments and docs/MODULES/CompanyProfiles.md correctly require an immutable snapshot at issue time so historic documents do not change when the profile is edited.

No quote form picker, handler write path, validation whitelist, PDF/print switch, or current quote behavior has been altered. Existing documents still use the company singleton. This is correct preparation but not completed integration.

## No Multi-Tenant / No Fake Data Review

- No multi-tenant SaaS architecture was introduced.
- No seed, fake, demo, static, or random Company Profile business data was found.
- The empty collection is intentionally rendered as an empty state.

## Security Review

Strengths: server RBAC on all module routes; whitelisted validation; escaped regex; server image MIME/data-url/size rules; no dangerous HTML rendering for terms/footer; no untrusted direct Mongo query operators.

Risks: client-authored audit event text; non-transactional default invariants; all bank data/images returned to every authorized viewer; embedded image payload growth.

## Performance Review

The implementation is acceptable for a very small internal master-data list but not scalable: the app boot and list request load every record and its embedded images, then search/filter locally. There is no page limit, server filtering, text/tax search index, or lightweight list projection.

## Documentation Review

Documentation clearly records the deferred quotation integration and no-tenant scope. It does not fully match code:

1. docs/MODULES/CompanyProfiles.md calls bank accounts unlimited, while companyProfileValidation.ts limits them to ten.
2. DATABASE.md, CHANGELOG.md, and module documentation imply the default invariant is safe/atomic, but the code permits default deactivation and has concurrency holes.
3. Documentation calls client-triggered audit entries real, but the strict audit requirement needs server-authoritative events with structured linkage.
4. Documentation should clarify boot behavior for users who lack companyProfiles:view.

## Missing Requirements Checklist

- [x] Company Profiles page exists
- [x] Add company profile
- [x] Edit company profile
- [x] View company profile detail
- [x] Activate/deactivate company profile
- [x] Archive company profile
- [x] Set default company profile
- [!] Only one default company
- [!] Default company cannot be deleted unsafely
- [x] Multiple bank accounts supported
- [x] Logo upload supported
- [x] Stamp upload supported
- [x] RBAC permissions exist
- [x] APIs enforce RBAC server-side
- [x] Sidebar menu protected by permission
- [!] Audit logs created
- [x] Empty state works
- [x] No fake company data
- [x] No multi-tenant architecture introduced
- [x] Future quotation issuer fields documented/prepared
- [!] Documentation updated

## Suggested Fix Plan for Claude Code

1. Reject deactivation of the current default unless another active profile is assigned in the same server-side operation; prevent a first inactive profile from becoming default.
2. Make default uniqueness durable with a MongoDB transaction or a safe default-pointer design plus a partial unique index. Add concurrent create/set-default tests.
3. Write structured Company Profile audit entries inside the handler for each mutation, including actor, companyProfileId, company identity, changed fields, and logo/stamp change markers.
4. Add server pagination, filtering, search, list projections, and permission-aware boot loading.
5. Add deactivation confirmation/default reassignment UX and a clearly explained default selection flow.
6. Validate non-empty bank rows and add archivedAt/archivedBy or equivalent structured audit fields.
7. When issuer selection is approved, validate the selected active profile and copy its immutable snapshot server-side when a quotation is created.
8. Correct bank-limit/default/audit documentation and run live role and concurrency tests.

## Build Check

Command attempted: npm run lint && npm run build

Result:

    WSL 1 is not supported. Please upgrade to WSL 2 or above.
    Could not determine Node.js install directory

Likely cause: local WSL/Node toolchain configuration. This is not a source lint/build result; run it under WSL2, native Windows Node, or CI.

## Claude Fix Status

**Date fixed:** 2026-07-13 (tenth same-day pass)

### Critical issues

None were found by this review. No fix needed.

### High Priority issues — all 3 fixed

1. **Fixed.** "A current default company can be deactivated without reassignment." `PATCH /api/company-profiles/:id` (`api/handlers/company-profiles.ts`) now rejects `isActive: false` on the profile that's currently `isDefault: true` with a `400` and a Thai message telling the admin to set another profile as default first — the same rule the archive action already enforced. The list UI additionally now confirms via dialog before any deactivation (previously immediate, no confirmation).
2. **Fixed.** "The one-default rule is unsafe under concurrent requests." Added a MongoDB **partial unique index** — `{ isDefault: 1 }` with `partialFilterExpression: { isDefault: true } }` — so at most one document can hold `isDefault: true` at the database level, not just by application sequencing. Both write paths that could previously race now catch the resulting duplicate-key error: a losing concurrent first-`create` retries once as non-default; a losing concurrent `set-default` on a different target returns a clear `409` "try again" message instead of a raw `500` or silent corruption.
3. **Fixed.** "Audit records are client-authored and incomplete." Added `writeCompanyProfileAuditEntry()` inside `api/handlers/company-profiles.ts`, called after every mutation (create/update/archive/set-default) with the already-authenticated session identity and new structured `relatedCompanyProfileId`/`relatedCompanyProfileName` fields on `AuditLogEntry`. `POST /api/audit-log` now rejects the `"โปรไฟล์บริษัท"` module outright, mirroring the existing `"ใบเสนอราคา"` (quotation) lockout — this is now the only path these entries can be written through. The now-redundant client-side `onAudit` calls and prop were removed from `CompanyProfilesPage.tsx`/`App.tsx`.

### A related, more severe issue this review only hedged as Medium — fixed with High Priority urgency

The review's Medium item #3 ("App.tsx fetches Company Profiles during every signed-in boot before permission-specific rendering... this needs runtime verification") undersold the actual severity once verified: `fetchCompanyProfiles()` was unconditional in the shared boot/sign-in `Promise.all`, and since Sales User/Approver Level 1/2/Viewer don't hold `companyProfiles:view` by default, the resulting `403` rejected the *entire* `Promise.all` — with no surrounding `try`/`catch`, `bootStatus` never reached `"ready"`. **Every user signing in under any role except Super Admin/Administrator got stuck on the loading spinner indefinitely.** Fixed with `.catch(() => [])` on `fetchCompanyProfiles()` at all 3 call sites in `App.tsx` (boot effect, `handleSetupComplete`, `handleSignIn`). A second, distinct gap found during this fix (not flagged by the review): `handleSignIn` — the normal login path, separate from initial page load — was never fetching company profiles at all; fixed alongside.

### Medium Priority issues — 3 fixed, 3 deferred with reasons

Fixed:
1. "The first profile is forced default but can be created inactive." The first-ever profile is now also forced `isActive: true` at creation time, not just `isDefault: true`.
4. "Bank accounts... blank account rows... are accepted." `companyProfileValidation.ts` now drops bank-account entries where every field is empty before storing.
6. "Deactivate is immediate and has no confirmation." Now shows the same `ConfirmDialog` pattern as Archive/Set Default.
7. "The detail screen renders timestamps but not the stored createdBy/updatedBy identities." `CompanyProfileDetail.tsx` now resolves both to the user's full name via a new `users` prop, falling back to the raw ID if the account was deleted.

Deferred, with reasons:
2. **"GET /api/company-profiles returns every record... without pagination, search/filter parameters, or a projection."** Not fixed this pass — real at scale, but the collection holds a handful of company identities for one internal ERP today; building server-side pagination/filtering now would be speculative ahead of real usage volume. Tracked in TODO.md, revisit if/when the list genuinely grows.
5. **"Set Default is a dedicated list action, not available in the Basic Information form."** Not fixed — the review's own text notes "the separate API is safer." Adding a second, inline path inside the form would mean duplicating the exact same invariant checks (archived/inactive/default-conflict) in two places, a real risk of the two paths drifting out of sync. Kept as the single dedicated action rather than adding a second one.

(Medium item 3, "App.tsx fetches Company Profiles during every signed-in boot... needs runtime verification," is covered above under "A related, more severe issue" rather than repeated here.)

Additionally not built this pass, from the Suggested Fix Plan: **`archivedAt`/`archivedBy` as distinct structured fields** (Suggested Fix Plan #6, second half). Not added — the new server-side audit-log entries (fix #3 above) already capture *when* and *by whom* an archive happened with real structured linkage; adding parallel fields directly on the document would duplicate that, not close a real gap. **A MongoDB transaction wrapping create/set-default** (Suggested Fix Plan #2, first half) — superseded by the partial unique index (fix #2 above), which closes the actual data-integrity gap without introducing a pattern (multi-document transactions) nothing else in this codebase uses.

### Low Priority issues — 2 of 4 fixed

Fixed: "List action buttons are icon-only and rely on title rather than explicit aria-labels" (added, naming the specific row's company) and "Detail image alt text is generic 'logo'/'stamp'" (now includes the field label and company name).

Not fixed, with reasons: "Several table labels use compact 10–12px mono text" — a design-system-wide typography question (this exact pattern is used consistently across every table in the app, e.g. Products/Users/Audit Log), not something to change for one module in isolation without a broader typography decision. "Base64 image storage... increases document and response size" — this is the existing, already-reviewed-and-accepted app-wide image storage approach (see DATABASE.md's "still base64-in-document" note); not a Company-Profiles-specific issue to fix here.

### Documentation mismatches — all 3 corrected

1. "docs/MODULES/CompanyProfiles.md calls bank accounts unlimited, while companyProfileValidation.ts limits them to ten." Corrected to state the real 10-account cap.
2. "DATABASE.md, CHANGELOG.md, and module documentation imply the default invariant is safe/atomic, but the code permits default deactivation and has concurrency holes." Corrected — DATABASE.md and MODULES/CompanyProfiles.md now describe the actual two-layer guarantee (database-level partial unique index + application-level sequencing) that exists after the fixes above, not the weaker pre-fix description.
3. "Documentation calls client-triggered audit entries real, but the strict audit requirement needs server-authoritative events with structured linkage." Corrected — MODULES/CompanyProfiles.md's Audit Logging section now describes the server-authoritative implementation, with the old client-triggered description kept only as an explicitly-labeled historical note.
4. "Documentation should clarify boot behavior for users who lack companyProfiles:view." Addressed via the `.catch(() => [])` fix itself (see above) plus a code comment in `App.tsx` explaining why it's there — the behavior is now "falls back to an empty list," which needs no further caveat since it's no longer a failure mode.

### Files changed this pass

`api/handlers/company-profiles.ts`, `api/_lib/collections.ts` (index definition kept in sync), `api/_lib/companyProfileValidation.ts` (blank bank-row filter), `api/audit-log/index.ts` (module lockout), `src/lib/auditLog.ts` (new fields), `src/App.tsx` (boot resilience, `onAudit` prop removal, `users` prop threading), `src/pages/admin/companyProfiles/CompanyProfilesPage.tsx` (audit calls removed, `users` prop), `src/pages/admin/companyProfiles/CompanyProfileList.tsx` (deactivate confirm, aria-labels, alt text), `src/pages/admin/companyProfiles/CompanyProfileDetail.tsx` (createdBy/updatedBy, alt text) — plus documentation: CLAUDE.md, PROJECT_STATUS.md, CHANGELOG.md, TODO.md, DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, and this file.

### Build result

`npx tsc -b` (frontend), `npx tsc --noEmit -p tsconfig.api.json` (backend), `npm run lint`, `npm run build` — all pass clean, zero errors, only the same 2 pre-existing `react-refresh/only-export-components` warnings in `i18n.tsx` that predate this pass. (The original report's build attempt failed on an unrelated local WSL1/Node toolchain issue, not a source problem — this pass's environment does not have that constraint.)

### Manual test result

No live MongoDB/backend was reachable in this sandboxed session (a recurring, previously-documented environment limitation — see PROJECT_STATUS.md "Known Risks"), so the requested 13-step manual verification checklist (login as Super Admin, create/edit/set-default/deactivate/archive a profile, confirm normal-user access is blocked, check the browser console, etc.) could not be run end-to-end against a real database. Verified instead via an isolated Playwright preview harness rendering the real `CompanyProfileList`/`CompanyProfileDetail` components with representative mock data: confirmed the new deactivate-confirmation dialog fires correctly before any deactivation, and the detail view's "สร้างโดย"/"แก้ไขล่าสุดโดย" rows correctly resolve a real user ID to a name and correctly fall back to the raw ID for a since-deleted account. The concurrency fix (partial unique index) was verified by code inspection and type-checking only — not load-tested against real MongoDB, since that requires a live database this session doesn't have access to. Flagged as an explicit open item in TODO.md.
