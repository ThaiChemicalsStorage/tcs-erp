# Module: Company Profiles

## Status: ❌ Removed (2026-07-14)

This module — admin-managed master data for "which company identity a quotation is issued under"
— is **no longer part of the user-facing ERP**. This ERP has exactly one issuer company (Settings
→ Company Info, `src/lib/storage.ts`'s `Company` singleton); a page for managing *multiple* issuer
companies was unused, out-of-scope functionality that was built against a misreading of an earlier
requirement (see "History" below).

## What was removed

- **UI**: the entire `src/pages/admin/companyProfiles/` folder (`CompanyProfilesPage.tsx`,
  `CompanyProfileList.tsx`, `CompanyProfileForm.tsx`, `CompanyProfileDetail.tsx`) and `src/lib/companyProfiles.ts`
  (client types + API calls) — deleted outright.
- **Navigation**: the "ข้อมูลบริษัท" sidebar item, its `NavKey`/`NAV_GROUPS`/`NAV_LABEL_KEYS` entries,
  and every permission-boolean/render-case wiring it had in `src/App.tsx` — removed.
- **API routes**: `GET/POST /api/company-profiles`, `GET/PATCH /api/company-profiles/:id`,
  `POST /api/company-profiles/:id/archive`, `POST /api/company-profiles/:id/set-default` — all gone.
  `server/app.ts`'s `API_ROUTES` has no entry for `/api/company-profiles*`, so hitting that
  path (directly by URL, or via any old bookmark/link) now returns the server's JSON 404 — there is
  no handler left that could serve it. `api/handlers/company-profiles.ts` and
  `api/_lib/companyProfileValidation.ts` were deleted; the customer-data logic that used to share
  that same handler file (see [Customer.md](./Customer.md)) now has its own dedicated
  `api/handlers/customers.ts` file, since removing this module freed the (then Vercel Hobby-capped)
  function slot it had been folded into.
- **Permissions**: `companyProfiles:view/create/edit/archive/delete/setDefault` removed from the
  `Permission` union, `ALL_PERMISSIONS`, `PERMISSION_LABELS`, `PERMISSION_LABEL_KEY`,
  `PERMISSION_GROUPS` (`src/lib/permissions.ts`), and from the Administrator default role's
  permission list (`src/lib/roles.ts`). See [RBAC.md](../RBAC.md) for what this means for any
  **existing** custom role that already had one of these permissions stored (nothing breaks — see
  below).
- **i18n**: every `companyProfiles.*`/`permission.companyProfiles*`/`empty.companyProfiles.*`/
  `nav.companyProfiles` dictionary key (Thai + English) removed from `src/lib/i18n.tsx`.

## What was deliberately left untouched

**The `company_profiles` MongoDB collection, and any documents already in it from when this module
was live, were not touched.** No code anywhere reads or writes this collection anymore — the
`companyProfilesCollection()` accessor and `CompanyProfileFields` type were deleted from
`api/_lib/collections.ts` along with everything else, but the collection itself was left alone in
MongoDB, per this pass's explicit "no destructive database cleanup" instruction. If a future pass
wants to drop it for good, that's a separate, deliberate, backed-up decision — not something to do
silently as a side effect of a code-removal pass.

Historical `audit_log` entries with `module: "โปรไฟล์บริษัท"` (Company Profile Created/Updated/
Archived/Restored/Default Company Changed) also remain in place and still display normally in the
Audit Log page — `POST /api/audit-log` still explicitly rejects that module string from being
written via the generic client-facing endpoint (nothing legitimate can write it anymore, but the
lockout itself costs nothing to keep and prevents a client from forging new entries for a module
that no longer exists).

## Existing roles with a stored `companyProfiles:*` permission

`api/handlers/roles.ts` never validated incoming `permissions` arrays against `ALL_PERMISSIONS` —
it only strips Super-Admin-locked keys (`roles:manage`/`company:manage`). A role document that
already had e.g. `"companyProfiles:view"` in its stored `permissions` array (seeded by the old
`defaultRoles`, or granted by an admin before this removal) **keeps that string** — it's simply
inert now, since no permission check anywhere in the app looks for it and the Role Management UI's
permission matrix (driven by `PERMISSION_GROUPS`) no longer has a checkbox for it. The role is not
broken; it just carries one harmless, meaningless legacy string until the next time an admin edits
and re-saves that role's permissions (at which point the form naturally stops re-submitting it,
since it was never rendered as a checkbox to begin with).

## History

- **2026-07-13**: module built (add/edit/view/activate-deactivate/archive/set-default for
  multi-company quotation-issuer master data), then the same day wired into the Quotation form as
  an "IssuerCompanySelector" — against a misunderstanding of the actual requirement.
- **2026-07-14**: the Quotation-form integration was reverted (issuer selector removed, replaced
  with a **Customer** selector — see [Customer.md](./Customer.md) and
  [Quotation.md](./Quotation.md) "Customer Selection"), but the standalone admin module itself was
  initially kept for potential future use.
- **2026-07-14 (later same day)**: on explicit instruction, the module was removed from the
  user-facing ERP entirely (this page's current content) — the business confirmed there is no
  present or near-term need to manage more than one issuer company, so the admin page, its API, and
  its permissions were removed rather than left as unused surface area. See CHANGELOG.md for the
  full itemized diff.

Full technical detail of the module as it existed (business flow, data rules, form field list, the
default-profile invariant/partial-unique-index design, audit-logging design, and the brief
Quotation-integration design) is preserved in git history (`git log -- docs/MODULES/CompanyProfiles.md`)
and in `docs/CHANGELOG.md`'s dated entries — not repeated here, since it no longer describes live
code and keeping a long "how the removed feature used to work" writeup in the primary docs risks
exactly the confusion a previous Codex review flagged (stale documentation read as still-current).
