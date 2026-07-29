# Module: Auth (Setup Wizard / Sign In)

> Not in the original requested module list ([Dashboard, Lead, Customer, Product, Quotation]) but documented here because it exists in the codebase and is load-bearing (it gates every other module). See [CLAUDE.md](../CLAUDE.md) module table.

## Purpose

Session gate in front of the whole app, backed by real multi-user accounts and server-verified credentials. As of the 2026-07-09 backend migration this is **real security**: bcrypt password hashing, JWT httpOnly-cookie sessions, server-side re-verification on every request, and — as of 2026-07-29 — login rate limiting (see below). See [RBAC.md](../RBAC.md) for the full model and its honest remaining gaps (no true session revocation).

## Business Flow

1. **Bootstrap**: `App.tsx` calls `GET /api/auth/session` on mount; the response's `needsSetup: true` (only when the `users` collection is empty) renders `SetupWizardPage` instead of anything else — a one-time flow collecting Full Name, Employee ID, Username, Email, Password, Confirm Password, and creating the first `User` with the Super Admin role server-side (`POST /api/auth/setup`), password bcrypt-hashed. This never shows again once any user exists.
2. **Sign in**: `SignInPage` collects a username-or-email identifier + password, sent to `POST /api/auth/login`. The server looks the user up by username/email (case-insensitive), verifies the password via `bcrypt.compare()`, and checks the account is `active` (not deactivated) — a real, server-side credential check. On success the server issues a JWT in an httpOnly session cookie (`tcs_erp_session`) and the client logs a `Login` audit entry via `POST /api/audit-log`.
3. **No public sign-up.** The old `SignUpPage.tsx` was removed 2026-07-08 — enterprise ERPs don't allow self-registration. Every account past the first is created by an admin via [UserManagement.md](./UserManagement.md).
4. **Log out**: via the header user-menu dropdown, calls `POST /api/auth/logout` (clears the session cookie server-side), logs a `Logout` audit entry, resets `activeNav` to Dashboard.

## Pages

- `src/pages/SetupWizardPage.tsx` — first-run Super Admin creation.
- `src/pages/SignInPage.tsx` — username/email + password, real server-verified credential check.
- `src/pages/AuthLayout.tsx` — shared two-pane layout (navy branding panel + form panel), used by both.

## Components

None shared beyond `AuthLayout`.

## Database Tables

The `users` MongoDB collection (server-only, includes `passwordHash`; see [DATABASE.md](../DATABASE.md)). No separate session table — sessions are stateless JWTs, not stored server-side.

## APIs

`GET /api/auth/session`, `POST /api/auth/setup`, `POST /api/auth/login`, `POST /api/auth/logout` — see [API.md](../API.md) Auth section.

## Permissions

Every signed-in user can reach the app shell; what they see inside it is gated per-module — see [RBAC.md](../RBAC.md).

## Current Features

- One-time Initial Setup Wizard, never reappears once a user exists
- Real, server-verified username/email + password check (bcrypt) against MongoDB, with an inactive-account error message
- No public self-registration — accounts are Wizard- or admin-created only
- Session is a JWT in an httpOnly, secure, `sameSite=lax` cookie (`tcs_erp_session`, 7-day expiry); every request re-verifies it and re-fetches the user's current status from MongoDB
- Login/Logout are audit-logged, with the audit entry's actor identity always server-derived

## Future Improvements

- True session revocation (a server-side deny-list or database-backed sessions) so a still-active account's leaked token can be force-invalidated before its natural 7-day expiry — currently only a *deactivated* account is locked out immediately; see [RBAC.md](../RBAC.md) "What Was Achieved vs. the Old Proposed Design."
- ~~Rate limiting on `POST /api/auth/login`~~ — **done 2026-07-29**: failed attempts tracked in the TTL-purged `login_attempts` MongoDB collection; ≥5 failures per identifier or ≥20 per IP within 15 minutes → `429` with a Thai "รอประมาณ X นาที" message + `Retry-After`; success clears the identifier's failures; the check runs before the bcrypt compare. See [RBAC.md](../RBAC.md) Known Gaps and [API.md](../API.md).

## Known Issues

None currently open. The pre-migration client-side checksum/`localStorage`-session limitations were closed by the 2026-07-09 backend migration (real bcrypt hashing, httpOnly JWT cookie), and login rate limiting landed 2026-07-29 — see [RBAC.md](../RBAC.md) for the remaining honest gaps (no true mid-expiry session revocation).
