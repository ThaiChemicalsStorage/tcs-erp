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
- Session is a JWT in an httpOnly, secure, `sameSite=lax` cookie (`tcs_erp_session`, 7-day **rolling** expiry — added 2026-07-31, `refreshSessionCookie()` re-issues the cookie with a fresh 7-day window on every API request that carries a still-valid token, so an actively-used session never force-expires; only 7 full days of zero activity logs the user out); every request re-verifies it and re-fetches the user's current status from MongoDB
- Login/Logout are audit-logged, with the audit entry's actor identity always server-derived

## Accessibility Hardening (2026-07-30)

An `/impeccable audit` of the authentication UI (`SignInPage.tsx`, `AuthLayout.tsx`, and `App.tsx`'s
`BootLoading`/`BootError` session-check presentation) found this had never been touched by any
earlier accessibility pass this session — the same gap found in Template Management and Admin, but
on the single page every user passes through before reaching anything else. Found and fixed: the
identifier and password fields had `<label>`s with no `htmlFor` and no `id` on either input — added
`useId()`-generated pairs; the password show/hide toggle button had **no accessible name at all**
(not even a `title`) — added `aria-label` (toggling between "Show password"/"Hide password") and
`aria-pressed` since it's a genuine two-state toggle; the login-failure error message had no
`role="alert"`, so a failed sign-in produced no announcement for screen-reader users; `BootLoading`
(shown while the initial session check is in flight, and as the `Suspense` fallback while this
page's own lazy chunk downloads) was a silently-pulsing logo with no text/ARIA signal at all — added
`role="status" aria-live="polite"` plus an `sr-only` loading label; `AuthLayout.tsx` had no `<main>`
landmark; and the page's heading hierarchy was backwards — the branding panel's marketing headline
was the page's only `<h1>` and is hidden entirely below the `lg` breakpoint (leaving zero `<h1>` on
smaller screens), while the actual "Sign In" heading was only an `<h2>` — swapped so `SignInPage.tsx`
now owns the real `<h1>` and the branding headline renders as a styled `<p>` (visually unchanged).
Verified live via `vercel dev`: `document.getElementById` confirmed both field label pairs resolve
correctly, the toggle button's `aria-label`/`aria-pressed` flip correctly on click, the error message
carries `role="alert"` after a blocked submit, and the page's `<h1>`/`<main>` are present. No changes
to authentication APIs, credential handling, session behavior, redirects, or security controls —
UI-files only. See CHANGELOG.md 2026-07-30.

## Future Improvements

- True session revocation (a server-side deny-list or database-backed sessions) so a still-active account's leaked token can be force-invalidated before its natural expiry — currently only a *deactivated* account is locked out immediately; see [RBAC.md](../RBAC.md) "What Was Achieved vs. the Old Proposed Design." Now a bigger gap than before: since expiry became rolling on 2026-07-31, a leaked-and-actively-replayed token no longer dies after a fixed 7 days.
- ~~Rate limiting on `POST /api/auth/login`~~ — **done 2026-07-29**: failed attempts tracked in the TTL-purged `login_attempts` MongoDB collection; ≥5 failures per identifier or ≥20 per IP within 15 minutes → `429` with a Thai "รอประมาณ X นาที" message + `Retry-After`; success clears the identifier's failures; the check runs before the bcrypt compare. See [RBAC.md](../RBAC.md) Known Gaps and [API.md](../API.md).

## Known Issues

None currently open. The pre-migration client-side checksum/`localStorage`-session limitations were closed by the 2026-07-09 backend migration (real bcrypt hashing, httpOnly JWT cookie), and login rate limiting landed 2026-07-29 — see [RBAC.md](../RBAC.md) for the remaining honest gaps (no true mid-expiry session revocation).
