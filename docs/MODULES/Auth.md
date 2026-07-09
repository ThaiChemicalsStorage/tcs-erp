# Module: Auth (Setup Wizard / Sign In)

> Not in the original requested module list ([Dashboard, Lead, Customer, Product, Quotation]) but documented here because it exists in the codebase and is load-bearing (it gates every other module). See [CLAUDE.md](../CLAUDE.md) module table.

## Purpose

Client-side session gate in front of the whole app, now backed by real multi-user accounts and credential checks. **Still not real security** — see Known Issues and [RBAC.md](../RBAC.md).

## Business Flow

1. **Bootstrap**: `App.tsx` checks `users.length === 0` (loaded via `loadUsers()`). If the app has never had a user created, it renders `SetupWizardPage` instead of anything else — a one-time flow collecting Full Name, Employee ID, Username, Email, Password, Confirm Password, and creating the first `User` as `super_admin` with full access. This never shows again once any user exists.
2. **Sign in**: `SignInPage` collects a username-or-email identifier + password. `App.tsx`'s `handleSignIn` looks the user up via `findUserByLogin()`, verifies the password via `verifyPassword()`, and checks the account is `active` (not deactivated) — a real (if not cryptographically secure) credential check, replacing the old "any input succeeds" flow. On success it saves the session (`saveSession(userId)`) and logs a `Login` audit entry.
3. **No public sign-up.** The old `SignUpPage.tsx` was removed 2026-07-08 — enterprise ERPs don't allow self-registration. Every account past the first is created by an admin via [UserManagement.md](./UserManagement.md).
4. **Log out**: via the header user-menu dropdown, clears the session (`clearSession()`), logs a `Logout` audit entry, resets `activeNav` to Dashboard.

## Pages

- `src/pages/SetupWizardPage.tsx` — first-run Super Admin creation.
- `src/pages/SignInPage.tsx` — username/email + password, real client-side credential check.
- `src/pages/AuthLayout.tsx` — shared two-pane layout (navy branding panel + form panel), used by both.

## Components

None shared beyond `AuthLayout`.

## Database Tables

None (no real DB) — see [DATABASE.md](../DATABASE.md). Persists to `tcs_erp_users` (`User[]`) and `tcs_erp_session` (current `userId`).

## APIs

None — see [API.md](../API.md) Auth / Bootstrap section.

## Permissions

Every signed-in user can reach the app shell; what they see inside it is gated per-module — see [RBAC.md](../RBAC.md).

## Current Features

- One-time Initial Setup Wizard, never reappears once a user exists
- Real username/email + password check against stored accounts, with an inactive-account error message
- No public self-registration — accounts are Wizard- or admin-created only
- Session persists across reloads via `localStorage` (`tcs_erp_session`)
- Login/Logout are audit-logged

## Future Improvements

This entire module gets replaced, not extended, when the Phase 2 backend migration happens (see [ARCHITECTURE.md](../ARCHITECTURE.md)): real bcrypt password hashing, database sessions via Auth.js, server-verified credentials, server-invalidatable sessions (deactivating a user can't currently force-log-out an already-signed-in session in another tab).

## Known Issues

- **By design, not a bug to fix client-side**: `hashPassword()` is a simple checksum, not a real cryptographic hash, and the session is just a `localStorage` string with no expiry or server-side revocation. This is acceptable only because the whole app is a client-only demo with no real data at stake — must not be treated as secure. See [RBAC.md](../RBAC.md).
