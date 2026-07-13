# Module: Company Profiles

## Purpose

Master data for the official business identities the company can issue quotations under —
company name, logo, address, tax ID, branch, contact info, bank accounts, and quotation
document defaults (prefix/number format/terms/footer/stamp/signature label). Added 2026-07-13 to
prepare the ERP for multi-company quotation issuance in the future: the same company owns more
than one legal entity/branch (e.g. a head office and a related company under a different
registered name), and each needs its own document header/branding when quotations go out.

**A Company Profile is not a customer, not a user account, and not a separate website.** This
remains one internal ERP — Company Profiles is an admin-managed master-data list, the same shape
of feature as Job Types or Product Categories, just for "who is issuing this document" instead of
"what is being sold." No multi-tenant architecture, no per-company data isolation, no separate
deployment.

**Master-data management (add/edit/view/activate/archive/set default) and Quotation-form
integration are both built** — see "Quotation Integration" below for exactly how a user picks a
company profile when issuing a quote, what gets stored, and the fallback/Draft-only rules.

## Relationship to the `company` singleton

This app already has a single-company `company` MongoDB collection (`src/lib/storage.ts`,
Settings → Company Info, `company:manage` permission) — the app's own branding/identity record,
used today for the sidebar, login page, and favicon. **That record is untouched by this module**
and is now only a **fallback**, not the primary source, for the quotation header/print output:
`PrintDocument.tsx`/`QuoteDocument.tsx` prefer a quote's own `issuerCompanySnapshot`, then a
live-selected `CompanyProfile`, then the default active profile, and only fall back to the
`company` singleton when none of those resolve (a quote that predates this feature, or when no
company profile has ever been set up) — see "Quotation Integration" below for the full chain.

`company_profiles` is a **separate** collection from `company` — a *list* of company identities,
versus `company`'s single record. They are deliberately not merged or migrated into each other:
merging them would mean either (a) making the single `company` record become "whichever profile is
default," a behavior change to every existing consumer of `fetchCompany()` (sidebar/login/favicon
still read it directly), or (b) running two parallel, subtly-different code paths for "the
company's identity" during a transition period. Both are real design decisions that would need
explicit product sign-off, not a silent choice made mid-implementation — so `company` keeps
serving the sidebar/login/favicon exactly as before, and `company_profiles` is the sole source for
anything issuer-specific on a quotation.

## Business Flow

1. **List view** (`CompanyProfileList.tsx`): search by company name/tax ID, filter by
   active/inactive, filter to default-only, a "show archived" toggle (archived profiles are
   hidden by default, same convention as `ProductList.tsx`'s archived products). Each row shows
   logo thumbnail, code, name, tax ID, branch, phone, email, a default-badge (gold star), status
   pill, and last-updated date. Row actions (View/Edit/Set Default/Activate-Deactivate/Archive)
   are individually permission-gated — see Permissions below.
2. **Create** ("เพิ่มข้อมูลบริษัท"): opens `CompanyProfileForm.tsx` in create mode — 6 sections
   (ข้อมูลบริษัท/ข้อมูลติดต่อ/ข้อมูลสำหรับเอกสาร/โลโก้และตราประทับ/บัญชีธนาคาร, plus an active
   checkbox inside the first section). Company Name (Thai) and Company Code are the only required
   fields; email/website/Tax ID are format-validated when non-empty (client + server). A discard
   confirmation dialog fires if the form is dirty and the user tries to leave without saving.
3. **Edit**: same form, pre-filled, `PATCH /api/company-profiles/:id`. `isDefault`/`isDeleted`
   are never editable through this form — those are separate, invariant-checked actions (see
   below), so a plain field edit can never accidentally bypass the "only one default" or "can't
   archive the default" rules.
4. **View** (`CompanyProfileDetail.tsx`): read-only, every field grouped into the same 6 sections
   as the form, plus created/updated metadata.
5. **Set Default**: a dedicated action, confirmed via dialog — unsets the previous default (if
   any) and sets this one, atomically from the caller's perspective (see Data Rules below).
   Blocked server-side if the target is archived or inactive.
6. **Activate/Deactivate**: toggles `isActive`. Independent of the default flag and of archiving
   — an admin can deactivate a company that's temporarily not issuing quotations without
   archiving its record. **Deactivating the current default is blocked server-side** (added
   2026-07-13, Codex High Priority fix — a prior version allowed it, which could leave the app
   with no active default company at all); the UI additionally confirms via dialog before any
   deactivation (previously immediate/unconfirmed, a related Medium finding fixed the same pass).
7. **Archive/Restore**: toggles `isDeleted` (this app's only form of "delete" for this module —
   always reversible, matching the existing Category/Job Type precedent of soft-deactivate only,
   no hard-delete route). Archiving the current default profile is blocked with a clear Thai
   error — an admin must set another profile as default first.
8. **Empty state**: if zero company profiles exist, the list shows "ยังไม่มีข้อมูลบริษัท" /
   "เริ่มต้นโดยการเพิ่มข้อมูลบริษัทสำหรับใช้บนเอกสารใบเสนอราคา" with an "เพิ่มข้อมูลบริษัท" button
   (hidden if the viewer lacks `companyProfiles:create`) — no fake/sample company ever appears.

## Data Rules

- **At most one active, non-archived profile is default at a time — enforced by a MongoDB partial
  unique index, not application logic alone** (hardened 2026-07-13, tenth same-day pass, after an
  independent Codex review found the original application-only version left real concurrency and
  deactivation holes — see DATABASE.md for the full technical writeup). The index
  (`{ isDefault: 1 }` with `partialFilterExpression: { isDefault: true }`) means the database
  itself rejects any write that would produce two simultaneous defaults, regardless of application
  bugs or races. `handleSetDefault()` still unsets every other `isDefault: true` document then
  sets the target (sequenced, not a single Mongo transaction — this app doesn't use transactions
  anywhere else at this scale) so a crash between the two writes leaves at most a *missing*
  default; a genuine concurrent race on the second write now fails cleanly with a "try again"
  error instead of silently producing two defaults.
- **The first company profile ever created is automatically default and automatically active**,
  regardless of what the client sends — `CompanyProfileDraft` has no `isDefault` field at all, and
  `isActive` is forced `true` for this specific case (added 2026-07-13 — previously the form's
  Active checkbox could leave the very first, auto-default profile inactive, its own invariant
  break). Decided server-side at creation time; changeable afterward only via the dedicated
  set-default action, and a concurrent "first create" race is caught and retried non-default.
- **The current default profile can't be deactivated or archived directly.** Both
  `handleOne()`'s `PATCH` (for `isActive: false`, added 2026-07-13) and `handleArchive()` (for
  `isDeleted: true`) throw a 400 with a Thai message telling the admin to set another profile as
  default first — matches the request's literal "Do not allow deleting default company profile
  directly," extended to cover deactivation too since an inactive, unreassigned default is the
  same practical problem.
- **Archiving is always reversible** (`isDeleted: true` → `false` via the same action) — there is
  no hard-delete route for this module, matching the existing Category/Job Type precedent.
  `companyProfiles:delete` exists as a permission (per the request's literal list) but isn't
  wired to any additional route for this reason — see RBAC.md.

## Company Profile Form Fields

**Basic Information**: Company Code*, Company Name (Thai)*, Company Name (English), Display Name,
Tax ID (13-digit format check), Branch Name, Branch Code, Active toggle. (*required)

**Contact Information**: Address (Thai/English), Phone, Fax, Email (format-checked), Website
(format-checked).

**Document Branding**: Quotation Number Prefix, Quotation Number Format, Quotation Terms &
Conditions, Quotation Footer Text, Signature Label, Logo upload, Stamp upload.

**Bank Accounts**: a repeatable list, **capped at 10 accounts per profile**
(`MAX_BANK_ACCOUNTS` in `api/_lib/companyProfileValidation.ts` — corrected here 2026-07-13; this
doc previously and incorrectly said "unlimited," flagged by a Codex review as a documentation
mismatch) — Bank Name, Account Name, Account Number, Branch, a "default account" checkbox
(client- and server-enforced to at most one `true` per profile — if more than one is sent, the
server keeps only the first and demotes the rest rather than rejecting the whole payload).
Entirely-blank rows (every field empty) are silently dropped server-side before storing, added
2026-07-13 — not full per-field required validation, just a floor against persisting rows left
over from clicking "+ Add Bank Account" without filling anything in.

## Pages / Components

- `src/pages/admin/companyProfiles/CompanyProfilesPage.tsx` — top-level view-switcher
  (list/create/edit/view), mirrors `ProductsPage.tsx`'s composition pattern. Receives permission
  booleans (`canCreate`/`canEdit`/`canArchive`/`canSetDefault`) as props, computed once in
  `App.tsx` via `hasPermission()` — same precedent as `canManageCompany` for Settings.
- `CompanyProfileList.tsx` — search/filter/table, per-row actions, **three** `ConfirmDialog`s
  (set-default, archive/restore, deactivate — the deactivate confirmation added 2026-07-13, a
  Codex-flagged Medium gap where deactivation was previously a single click with no confirmation
  at all). Icon-only row actions carry both `title` and a per-row `aria-label` (added 2026-07-13).
- `CompanyProfileForm.tsx` — the 6-section sectioned form described above, client-side validation
  mirroring the server, a repeatable bank-account editor, an unsaved-changes discard-confirmation
  dialog (dirty-check via a `JSON.stringify` comparison against the form's starting state, not a
  global `beforeunload` listener — sufficient since this app has no router and "leaving" only
  ever means clicking Cancel/breadcrumb-back inside this same component).
- `CompanyProfileDetail.tsx` — read-only view, same 6 sections, plus `createdBy`/`updatedBy`
  resolved to the creating/last-editing user's full name (added 2026-07-13 — previously only
  showed timestamps; now takes a `users` prop, same data already in `App.tsx` state for every
  other admin page, and falls back to the raw stored ID if the account was since deleted).
- `src/components/ImageUploadField.tsx` — extracted this pass from what was previously inlined
  only inside `SettingsPage.tsx`; now shared between Company Settings' logo/stamp fields and this
  module's logo/stamp fields. Client-side MIME/size pre-check only — `validateImageDataUrl()`
  server-side (`api/_lib/uploadValidation.ts`) is the real boundary, unchanged.

## Database

`company_profiles` collection — see [DATABASE.md](../DATABASE.md) for the full field-by-field
shape and index list. No seed data (per the "no fake data" rule) — starts empty.

## APIs

See [API.md](../API.md) "Company Profiles" section for the full route table
(`GET/POST /api/company-profiles`, `GET/PATCH /api/company-profiles/:id`,
`POST /api/company-profiles/:id/archive`, `POST /api/company-profiles/:id/set-default`).

## Permissions

`companyProfiles:view/create/edit/archive/delete/setDefault` — see [RBAC.md](../RBAC.md) for the
full access table. Unlike `company:manage`, these are **not** structurally locked to Super Admin
— Administrator ships with `companyProfiles:view` only by default, but broader access can be
granted via the normal Role Management permission matrix.

## Audit Logging

**Server-authoritative as of 2026-07-13 (tenth same-day pass)** — corrected after an independent
Codex review's High Priority finding that the original client-triggered approach (described
below, for historical context) meant entries were forgeable and lacked structured linkage to
which profile actually changed. Company Profile Created/Updated/Archived/Restored/Default Company
Changed each write a real `audit_log` entry via `writeCompanyProfileAuditEntry()` inside
`api/handlers/company-profiles.ts` itself, as part of the same request that performs the
mutation — the same pattern `writeQuoteAuditEntry()` established for quotes on 2026-07-10. Each
entry carries `relatedCompanyProfileId`/`relatedCompanyProfileName` (structured linkage, not just
free text) and a Thai description of which fields changed, naming logo/stamp changes explicitly
rather than folding them into a generic "field updated" message. `POST /api/audit-log` now rejects
the `"โปรไฟล์บริษัท"` module outright — this is the only path these entries can be written through.

*(Historical note, no longer accurate — kept so a reader of old commits/docs isn't confused: the
original 2026-07-13 ninth-pass implementation had `CompanyProfilesPage.tsx` call the generic
`POST /api/audit-log` client-side after each mutation succeeded, matching the pattern still used
by Users/Roles/Company Settings. That pattern remains fine for those lower-stakes, already
permission-gated admin modules; it just didn't hold up under review for this module once the
"structured linkage" and "not forgeable" bar was applied — the fix moved it to match quotes'
stricter precedent instead.)

**Quotation-issuer audit entries (added 2026-07-13, Quotation integration pass)**: the same
`relatedCompanyProfileId`/`relatedCompanyProfileName` structured fields are reused (not
duplicated) on quote-side audit entries written by `writeQuoteAuditEntry()` in
`api/handlers/quotes.ts` — `"Quotation Created"` now names the issuer company in its `details`
text when one was set, and a Draft-only issuer change writes a distinct `"Quotation Issuer Company
Changed"` entry. See [MODULES/Quotation.md](./Quotation.md) "Issuer Company" and
[AuditLog.md](./AuditLog.md).

## Quotation Integration (built 2026-07-13)

"Save company info once here, pick which one issues each quote" is now wired end-to-end. The
Quotation form (`QuoteDocument.tsx`) shows an `IssuerCompanySelector` above the customer section —
"ออกใบเสนอราคาในนามบริษัท" — populated from `GET /api/company-profiles` (active,
non-archived profiles only, via the relaxed `quotations:create` read access described in
[RBAC.md](../RBAC.md)). Selection rules: a single default active profile (or the lone active
profile if there's only one) preselects automatically; multiple active profiles require an
explicit pick; zero active profiles shows an empty state ("ยังไม่มีข้อมูลบริษัท" /
"กรุณาเพิ่มข้อมูลบริษัทก่อนสร้างใบเสนอราคา") with a permission-gated link straight to this module.
Picking a profile updates the on-screen header preview immediately — logo, name (TH + EN if
present), address, phone/fax/email, website, tax ID, branch — omitting any field that's empty
rather than showing placeholder text.

`Quote.issuerCompanyId`/`issuerCompanySnapshot` (`src/lib/quotes.tsx`) are populated server-side by
`resolveIssuerCompanyUpdate()` in `api/handlers/quotes.ts`: the client only ever sends
`issuerCompanyId`; the server looks up the referenced profile, rejects it with a `400` if it
doesn't exist or is inactive/archived, and builds `issuerCompanySnapshot` (shape: `IssuerCompanySnapshot`
in `src/lib/companyProfiles.ts` — the full profile minus `id`/`isDefault`/`isActive`/`isDeleted`/
timestamps/audit fields) from the profile as it exists at that instant. **This is the
snapshot-not-live-reference rule this doc previously flagged as critical**, now enforced: editing a
company profile's address/phone/logo later never changes what an already-saved quotation displays,
because the quotation reads its own frozen copy, not the live profile. This mirrors the
already-audited rule for `QuoteLine` never referencing `Product` live (see [Product.md](./Product.md)).

**Issuer changes are Draft-only.** `PATCH /api/quotes/:id` and `POST /api/quotes/:id/workflow`
both throw a `400` if a request tries to change `issuerCompanyId` while the quote's status isn't
`"ร่าง"` (Draft) — once a quote has been submitted/approved/sent/etc., its issuer identity is
frozen, same principle as the snapshot itself. Within Draft, changing the selection re-runs
`resolveIssuerCompanyUpdate()` and takes a fresh snapshot; sending an empty `issuerCompanyId`
explicitly clears both fields (`$unset`, not just an empty string). This was a deliberate choice
among the options this doc previously left open — see "Decisions made" below.

**Display resolution, for both the on-screen preview and `PrintDocument.tsx`** (the actual
printed/PDF quotation), a 4-step fallback chain: (1) `issuerDisplayFromSnapshot(quote.issuerCompanySnapshot)`
(an already-saved quote whose selector hasn't been touched this session), (2)
`issuerDisplayFromProfile(selectedLiveProfile)` — the profile the quote actually references, if
it's still active/not-deleted (a Draft being actively edited, or a brand-new quote before its
first save), (3) `issuerDisplayFromProfile(defaultActiveProfile)` — **added 2026-07-13, Codex
review Medium #1 fix**: covers the partial-data edge case where `issuerCompanyId` is set but
`issuerCompanySnapshot` is missing (e.g. very old data) and the referenced profile has since been
deactivated/archived, so step 2 can't find it — this step shows the default active company instead
of jumping straight to legacy data, since that's still real, non-fake company information, just
not the exact company this specific quote originally referenced, (4) the legacy Settings → Company
Info `company` singleton (a quote created before this feature existed, or no company profile set
up at all) — so neither the header band nor the print output ever has a "nothing to show" case.
Steps 2 and 3 both count as "a real issuer was resolved" for `hasIssuerProfile`. A quote where none
of the first three steps resolve (`hasIssuerProfile === false`) shows a distinct warning banner
("ใบเสนอราคานี้ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร") independently of what the preview panel
displays — draft creation without an issuer is allowed (not hard-blocked), consistent with this
app's existing Draft workflow already tolerating other blank fields.

**Decisions made** (previously listed as open questions in this doc):
- The Quotation form has a company-profile picker, defaulting to the default/sole active profile;
  it is **not** hard-required to save a Draft (a warning is shown instead — see above).
- `PrintDocument.tsx` now takes an `issuer: IssuerCompanyDisplay` prop (replacing its old
  `company: Company` prop) resolved via the fallback order above — no hardcoded company header
  remains in the quotation form or print output.
- `quotationPrefix`/`quotationNumberFormat` per company profile are **not** wired into
  `nextQuoteId()`'s atomic sequence yet — still a single global counter regardless of issuer
  company. Left as a known limitation (see below), not required for this pass.
- Company-profile *selection* on a quote does not require its own new permission — it rides on
  whichever permission already gates the quote itself (`quotations:create`/`edit`) plus the
  relaxed `GET /api/company-profiles` read access (see [RBAC.md](../RBAC.md)) — a Sales user can
  select an issuer but still cannot manage Company Profiles themselves.

## Known Limitations

- **`quotationPrefix`/`quotationNumberFormat` per company profile are not wired into quotation
  numbering** — `nextQuoteId()` (`api/handlers/quotes.ts`) still uses one single global atomic
  `counters` sequence regardless of which company profile issues the quote. A future pass could
  make numbering per-company-profile if the business needs distinct number ranges per issuing
  entity — not required for this pass, not built speculatively ahead of that need.
- **No hard block on saving a Draft quotation with no issuer company selected** — a warning banner
  is shown ("ใบเสนอราคานี้ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร") but the save is allowed, consistent
  with this app's Draft workflow already tolerating other missing fields. If the business later
  decides an issuer company must be mandatory even for a Draft, this is a one-line change in
  `QuoteDocument.tsx`'s `save()` client-side check plus a server-side `400` in
  `POST /api/quotes` — not done here since it wasn't explicitly required.
- **`handleWorkflow` does not write a distinct "Quotation Issuer Company Changed" audit entry** —
  only `PATCH /api/quotes/:id` does. A workflow-transition request that also changes the issuer
  (e.g. submitting a Draft while also switching companies in the same request) is still fully
  validated and snapshotted correctly, and the workflow's own action audit entry still fires — it
  just doesn't get the *additional*, more specific issuer-change entry `PATCH` gets. Worth
  reconsidering in a future pass; not a correctness gap, a granularity one.
- No live-database browser verification — same sandboxed-session network limitation as every
  other pass this session (see PROJECT_STATUS.md "Known Risks"); verified via an isolated
  Playwright preview of the real components with mock data instead.
- **No live-database concurrency test** for the partial unique `isDefault` index added 2026-07-13
  — the code paths that catch the resulting duplicate-key race are verified by inspection and
  type-checked, but two genuinely simultaneous `set-default`/first-`create` requests racing
  against real MongoDB Atlas hasn't been load-tested in this sandboxed session. See TODO.md.
- **No server-side pagination, filtering, or list projection** on `GET /api/company-profiles`
  (flagged Medium by the 2026-07-13 Codex review) — every field of every profile, including
  embedded base64 logo/stamp images, returns on every list load; filtering is client-side only.
  Acceptable at today's real scale (a handful of company identities), not addressed speculatively
  ahead of real usage volume — see TODO.md.
- Bank account entries have no server-side uniqueness check (two accounts with the same number
  are allowed) — not a requirement in the request, not added speculatively.
- No CSV/bulk import for company profiles — add-one-at-a-time via the form only, matching every
  other master-data module in this app (Job Types, Product Categories).
