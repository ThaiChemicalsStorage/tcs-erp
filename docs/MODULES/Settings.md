# Module: Settings

> Not in the original requested module list ([Dashboard, Lead, Customer, Product, Quotation]) but documented here because it exists in the codebase. See [CLAUDE.md](../CLAUDE.md) module table.

## Purpose

Account/organization configuration: user profile, company info (which feeds the Quotation document header live), security (mock password change), notification preferences.

## Business Flow

1. Accessed via the sidebar "ตั้งค่า" nav item or the header user-menu dropdown.
2. Four tabs, each independently save-able:
   - **โปรไฟล์ (Profile)**: name, email, role (free-text display, not RBAC) → `saveUser()`.
   - **ข้อมูลบริษัท (Company Info)**: name, address, phone, email, tax ID, **logo upload, stamp upload** → `saveCompany()`. **This is the one piece of Settings with a real downstream effect**: `QuoteDocument.tsx` reads `company` (passed down from `App.tsx`) and renders it live in the quotation document header (logo) and signature block (stamp). Logo/stamp use a shared `ImageUploadField` component (image files only, 1MB cap, stored as base64 data URLs, preview + remove).
   - **ความปลอดภัย (Security)**: current/new/confirm password fields with client-side validation (length, match) — submitting shows a success toast but **does not actually change any credential** (there is none to change, see [Auth.md](./Auth.md)).
   - **การแจ้งเตือน (Notifications)**: three toggle switches (quote-approved, low-stock, weekly-digest) — **in-memory only, not persisted**, resets on reload.
3. Each save shows a brief inline "บันทึกการเปลี่ยนแปลงแล้ว" confirmation (`useSavedFlash` hook, local to this file).

## Pages

- `src/pages/SettingsPage.tsx` (263 lines) — the entire module is one file (tabs + all four sections + `Toggle`/`SavedNote` sub-components, all internal/unexported).

## Components

None shared elsewhere — `Toggle` and `SavedNote` are defined and used only inside `SettingsPage.tsx`.

## Database Tables

None — see [DATABASE.md](../DATABASE.md). `Company` and `UserProfile` persist to `localStorage` (`tcs_erp_company`, `tcs_erp_user`); notification toggle state does not persist at all.

## APIs

None — see [API.md](../API.md).

## Permissions

None — see [RBAC.md](../RBAC.md). Every signed-in user can edit the single shared Company profile (there's no multi-tenant concept — one Company record for the whole app).

## Current Features

- Profile edit (name/email/role)
- Company info edit (incl. logo/stamp upload), verified to flow live into the Quotation document
- Mock password change flow (validation works, nothing is actually stored)
- Notification toggles (UI only)

## Future Improvements

- Persist notification preferences
- Real password change once real auth exists (Phase 2)
- Once multi-user/RBAC exists, Company info likely becomes an admin-only setting rather than editable by every user
- User Profile picture + signature image upload — same `ImageUploadField` pattern already built for company logo/stamp, directly reusable
- Bank account info, configurable VAT rate, company-level default Terms & Conditions (see [TODO.md](../TODO.md))

## Known Issues

None currently open.
