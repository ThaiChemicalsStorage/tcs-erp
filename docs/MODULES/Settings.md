# Module: Settings

> Not in the original requested module list ([Dashboard, Lead, Customer, Product, Quotation]) but documented here because it exists in the codebase. See [CLAUDE.md](../CLAUDE.md) module table.

## Purpose

Personal account settings (self-service) plus single-company configuration (Super Admin only, split out 2026-07-08 — see [RBAC.md](../RBAC.md)).

## Business Flow

1. Accessed via the sidebar "ตั้งค่า" nav item or the header user-menu dropdown — always visible to every signed-in user.
2. Tabs, each independently save-able:
   - **โปรไฟล์ (Profile)**: editable — full name, phone, profile picture, personal signature image. Read-only — Employee ID, Department, Position, Role (role name resolved via `roleNameFor()`; assigned only by an admin). Saving calls `onUserChange`, which updates just this user's record inside the `users` array, and writes a `Profile Updated` audit entry. **2026-08-13**: the signature field switched from a plain file-upload (`ImageUploadField.tsx`) to `src/components/SignaturePad.tsx` (the same component the Service module's on-site customer sign-off uses) — every signed-in user (not just admins; it was already self-service, this just changed the input method) can either draw their signature with a mouse/finger/stylus or switch to "Upload" and pick an existing image, then Confirm locks it into a read-only preview with a "แก้ไข" (redo) link to redraw/re-upload. Rendered with `requireName={false}` since the signer is always the logged-in user — no separate name field, the confirmed image is sent straight to `signatureDataUrl` on save. See [Service.md](./Service.md) "Customer sign-off" for the component's shared internals.
   - **ข้อมูลบริษัท (Company Info)** — **only rendered at all if `company:manage` is held** (in practice, Super Admin only, hardcoded in [RBAC.md](../RBAC.md)'s permission model); the tab button itself doesn't exist in the DOM for anyone else, not just disabled. Name, address, phone, email, **website/Facebook page name/Line ID (added 2026-08-04, direct user request — see below)**, tax ID, logo/stamp upload, **VAT rate, bank name/account name/account number/branch, default Terms & Conditions**. `QuoteDocument.tsx`/`ScopeOfWorkDocument.tsx`/`DeliveryOrderDocument.tsx` all read `company` live for each document's print letterhead (logo, name, address, phone, email, website, Facebook, Line), signature block (stamp), and (Quotation only) remarks default (T&C). Saving writes a `Company Settings Updated` audit entry.
   - **Website/Facebook/Line fields (added 2026-08-04)**: direct user request, prompted by comparing the app's printed letterhead against the company's real letterhead graphic (logo + name + address + TEL/E-mail + Facebook icon/page name + Line icon/ID + website link) — the user asked "isn't every document header supposed to come from the Settings company info?" Investigation found: name/address/phone/email/logo genuinely did already come from `Company`, but `website` was hardcoded to `""` in every document's `CompanyHeaderInfo` construction (no Settings field existed to source it from), and Facebook/Line had no field at all — meanwhile Delivery Order's print view separately hardcoded a matching `LETTERHEAD` object with real Facebook/Line/website values, disconnected from Settings entirely. Added `website`/`facebookName`/`lineId: string` to `Company` (plain text fields, no server-side validation beyond what the pre-existing fields already get, i.e. none) and 3 new inputs here (`Globe`/`Users`/`MessageCircle` lucide icons — no dedicated Facebook/Line brand icons exist in lucide-react). See [Quotation.md](./Quotation.md), [ScopeOfWork.md](./ScopeOfWork.md), and [DeliveryOrder.md](./DeliveryOrder.md) for how each print view now renders them.
   - **ความปลอดภัย (Security)**: current/new/confirm password fields. Current password is now **actually verified** against the signed-in user's stored hash (`verifyPassword`) before the new one is accepted — no longer a pure client-side no-op. Writes a `Password Reset` audit entry on success. (A second card, "การส่งอีเมล (Gmail App Password)", existed for a few hours on 2026-08-07 for the person-to-person email feature — removed again the same day when the user cut email sending entirely; document recipients now get in-app notifications only, see [ScopeOfWork.md](./ScopeOfWork.md) "Document Recipients".)
   - **การแจ้งเตือน (Notifications)**: three preference toggle switches (quote-approved, low-stock, weekly-digest) — **in-memory only, not persisted**, resets on reload. Distinct from the real notification bell/panel — see [Notifications.md](./Notifications.md).
3. Each save shows a brief inline "บันทึกการเปลี่ยนแปลงแล้ว" confirmation (`useSavedFlash` hook, local to this file).

## Pages

- `src/pages/SettingsPage.tsx` — the entire module is one file (tabs + all sections + `Toggle`/`SavedNote`/`ImageUploadField` sub-components).

## Components

`Toggle`, `SavedNote`, `ImageUploadField` are defined and used only inside `SettingsPage.tsx` (profile picture, company logo/stamp — upload-only fields with no draw option). The personal signature field (2026-08-13) uses `src/components/SignaturePad.tsx` instead — shared with the Service module's customer sign-off, see [Service.md](./Service.md).

## Database Tables

`company` (single-document MongoDB collection) and `users` — see [DATABASE.md](../DATABASE.md). The signed-in `User`'s profile edits persist to their own `users` document; notification toggle state does not persist at all (still in-memory only).

## APIs

`GET/PUT /api/company` (Company tab), `PATCH /api/users/:id` (Profile/Security tabs) — see [API.md](../API.md).

## Permissions

- Profile tab: every signed-in user, editable fields limited to their own name/phone/picture/signature/password — see [RBAC.md](../RBAC.md). No user can edit their own role or permissions from here.
- Company tab: `company:manage` only (Super Admin, hardcoded).

## Current Features

- Self-service profile edit (name/phone/picture/signature), with employee/role fields shown but locked
- Company info edit (Super Admin only) incl. logo/stamp/bank info/VAT rate/Terms & Conditions, verified to flow live into the Quotation document
- Real password change (current password actually checked against the stored hash)
- Notification toggles (UI-preference only, unrelated to the real notification bell)

## Future Improvements

- Persist notification preferences
- Wire `Company.vatRate` into the actual VAT calculation in `lib/quotes.tsx` (currently stored/editable but unused by `computeTotals()`)

## Known Issues

None functional. Password hashing/verification is real (bcrypt, server-side) as of the 2026-07-09 backend migration — the "weak hash" caveat that used to apply here no longer does. See [RBAC.md](../RBAC.md) for the current, real auth model.
