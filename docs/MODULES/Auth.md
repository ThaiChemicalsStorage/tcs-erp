# Module: Auth (Sign In / Sign Up)

> Not in the original requested module list ([Dashboard, Lead, Customer, Product, Quotation]) but documented here because it exists in the codebase and is load-bearing (it gates every other module). See [CLAUDE.md](../CLAUDE.md) module table.

## Purpose

Client-only session gate in front of the whole app. **Not real authentication** — see Known Issues.

## Business Flow

1. `App.tsx` checks `authed` state (initialized from `loadAuthed()`, backed by the `tcs_erp_auth` `localStorage` key) — if false, renders `SignInPage` or `SignUpPage` (toggle via `authView`) instead of the app shell.
2. **Sign in**: email + password fields, "จดจำฉันไว้ในระบบ" checkbox (cosmetic — session already persists via `localStorage` regardless), "ลืมรหัสผ่าน?" shows a mock "reset link sent" confirmation with no actual email sent. Submitting with any non-empty email/password sets `authed = true`.
3. **Sign up**: name, email, password (≥6 chars), confirm password, terms checkbox. Client-side validation only (required fields, password length, password match, terms accepted). Submitting sets `authed = true` and updates `UserProfile` with the entered name/email.
4. **Log out**: via the header user-menu dropdown, clears `authed` and resets `activeNav` to Dashboard.

## Pages

- `src/pages/SignInPage.tsx` (109 lines)
- `src/pages/SignUpPage.tsx` (135 lines)
- `src/pages/AuthLayout.tsx` (64 lines) — shared two-pane layout (navy branding panel + form panel) used by both.

## Components

None shared beyond `AuthLayout`.

## Database Tables

None — see [DATABASE.md](../DATABASE.md). Only the `tcs_erp_auth` flag persists.

## APIs

None — see [API.md](../API.md) Auth section.

## Permissions

None — see [RBAC.md](../RBAC.md). There is exactly one access level: signed in or not.

## Current Features

- Full-screen sign-in/sign-up forms matching the navy/gold design system, with inline validation, password show/hide toggle, mock forgot-password confirmation
- Session persists across reloads via `localStorage`

## Future Improvements

This entire module gets replaced, not extended, when the Phase 2 backend migration happens (see [ARCHITECTURE.md](../ARCHITECTURE.md)): real password hashing (bcrypt), database sessions via Auth.js, actual credential verification.

## Known Issues

- **By design, not a bug to fix client-side**: no password is ever checked against anything. Any email/password combination succeeds. This is acceptable only because the whole app is a client-only demo with no real data at stake — must not be treated as secure.
