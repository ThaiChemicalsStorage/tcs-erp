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

The `users` MongoDB collection (server-only, includes `passwordHash`; see [DATABASE.md](../DATABASE.md)).

**As of 2026-08-31 there is also a `sessions` table** and the JWT is no longer stateless: it carries a `sid` claim naming a row in `sessions`, checked on every request beside the existing `status === "active"` lookup. See "One account, one device" below.

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

- ~~True session revocation (a server-side deny-list or database-backed sessions)~~ — **done 2026-08-31** as a side effect of "one account, one device": sessions are now database-backed and a row can be revoked, which is exactly what that gap asked for. What is still missing is a *UI* for it (an admin "sign this user out" button, or a "your sessions" list); the mechanism exists and `revokedAt` is all such a button would need to set.
- ~~Rate limiting on `POST /api/auth/login`~~ — **done 2026-07-29**: failed attempts tracked in the TTL-purged `login_attempts` MongoDB collection; ≥5 failures per identifier or ≥20 per IP within 15 minutes → `429` with a Thai "รอประมาณ X นาที" message + `Retry-After`; success clears the identifier's failures; the check runs before the bcrypt compare. See [RBAC.md](../RBAC.md) Known Gaps and [API.md](../API.md).

## One account, one device (2026-08-31)

Asked for by the owner on 2026-08-28: *"1 user จำกัดเข้าได้แค่ 1 คน"*.

**Logging in revokes every other live session for that user.** The token now carries
`{ sub, sid }`; `startSession()` marks the user's existing rows `revokedAt` +
`revokedReason: "superseded"` before inserting the new one, and `getAuthContext()` refuses a
token whose `sid` row is missing or revoked. The check sits next to the existing
`status !== "active"` lookup, so eviction lands **on the evicted device's very next request** —
no waiting for a token to expire.

Three things about it are load-bearing:

- **`refreshSessionCookie()` must carry `sid` through.** It re-signs the cookie on *every*
  request (rolling expiry, since 2026-07-31). A claim it forgets to copy vanishes on the next
  request, and the user is logged out with no explanation and nothing in the logs. This is the trap
  `docs/TODO.md` flagged before the work started; `tests/api/singleSession.test.ts` walks two
  consecutive requests specifically to hold it.
- **Revoked rows are marked, not deleted.** The evicted device needs to learn it was *superseded*,
  not that its session merely *expired* — very different information for someone wondering why they
  were thrown out. `GET /api/auth/session` returns `signedOutReason: "superseded"`, and the
  sign-in page shows it. The TTL index sweeps the rows up later.
- **State lives in MongoDB, not memory** — several server instances do not share memory and a cold
  start would wipe it, the same reason login rate limiting lives in `login_attempts`.

The evicted tab finds out within 45 seconds without being touched: the notification poll already
runs on that interval, and a `401` from it now re-checks the session and drops the app to the
sign-in page with the reason.

⚠️ **Cookies issued before 2026-08-31 have no `sid` and are refused**, so everyone signs in once
more after the deploy. Honouring them would have left the restriction bypassable for seven days.

## Password recovery via Super Admin (2026-09-24)

Owner: *"ถ้าผู้ใช้กดกู้รหัสผ่านให้ส่งรหัสผ่านไปให้ Super Admin จะมีแค่ Super admin ที่สามารถดูรหัสผ่านได้"* + a page for the requests.
Passwords are bcrypt hashes, so nobody can *see* an existing password — the owner chose (asked) the "request → Super Admin issues a
temporary password" flow.

1. **Sign-in page → "ลืมรหัสผ่าน?"** — identifier (+ optional message) → `POST /api/auth/forgot-password`. Always `200 { ok: true }`
   whether or not the account exists or is active (no username enumeration). 5 requests / IP / 15 min (`password_reset_attempts`, TTL,
   deliberately separate from `login_attempts` so it cannot eat into the login lockout budget). A repeat while one is pending bumps
   `requestCount`/`lastRequestedAt` on the same row and does not re-notify.
2. **Every active Super Admin is notified** (`password_reset_requested`, deep link → the new page). The requester is excluded from
   recipients, so a lone Super Admin who forgets their own password needs a second Super Admin (or server access).
3. **"คำขอกู้รหัสผ่าน" page** (admin group, `superAdminOnly` nav flag — tied to the role's `isSuperAdmin`, not a tickable permission; the
   API checks the same). "ออกรหัสผ่านชั่วคราว" generates a 10-char password (no 0/O/1/l/I), stores only its hash, sets
   `mustChangePassword: true`, revokes all of that user's sessions (`revokedReason: "password_reset"`), marks the request resolved, and
   returns the password **once** — shown in a dialog with a copy button, never stored or logged. "ปิดคำขอ" dismisses without changing anything.
4. **Forced change**: a user with `mustChangePassword` gets `ForceChangePasswordDialog` over the app (no close button — set a new password
   or sign out). Changing one's own password via `PATCH /api/users/:id` clears the flag. The flag is enforced by the UI only; the API is not
   locked down meanwhile (the temporary password only ever reaches the account owner through the Super Admin).

Tests: `tests/api/passwordReset.test.ts`.

## Known Issues

None currently open. The pre-migration client-side checksum/`localStorage`-session limitations were closed by the 2026-07-09 backend migration (real bcrypt hashing, httpOnly JWT cookie), login rate limiting landed 2026-07-29, and database-backed session revocation landed 2026-08-31 (see "One account, one device" above), which closed the long-standing "no true mid-expiry session revocation" gap in [RBAC.md](../RBAC.md).
