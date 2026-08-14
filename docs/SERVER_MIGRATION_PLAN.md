# Server Migration Plan

> **Recorded 2026-07-24 from a direct conversation with the owner** — written down at their request
> ("จดและสร้างไฟล์สักอย่างในโปรเจคก์นี้ว่าเคยคุยเรื่องนี้ไว้ขี้เกียจมาบอกใหม่") so it never needs
> re-explaining. **Status update 2026-08-06: the owner gave the go-ahead ("ให้ย้ายจาก vercel มาเป็น
> express เดี่ยวๆเลย") and step B — the portable Express server shell + `.env.example` +
> [DEPLOYMENT.md](./DEPLOYMENT.md) — is BUILT.**
>
> **✅ Migration COMPLETE as of ~2026-08-07** (confirmed by the owner 2026-08-14, live for about a
> week by then): the app runs on a **self-hosted VPS at https://www.huma-erp.com/ (HTTPS)**, database is
> **self-hosted MongoDB** (Option 2 in step D below, not Atlas), and the **Vercel demo is no longer
> used**. Steps C–H below are marked done accordingly. Exact per-step confirmation detail (which
> process manager, whether the demo database data was kept or a fresh Setup Wizard run) was not
> individually re-verified line-by-line — the owner confirmed the outcome (live ~1 week, VPS +
> domain + local DB + manual updated), not each checklist box individually.

## Key Facts (agreed with the owner)

- **The Vercel deployment (https://tcs-erp-nine.vercel.app) was a demo/trial only** — the owner's
  words: "ที่จริงระบบนี้ไม่ได้จะขึ้น vercel นะ...แค่อยากลองระบบเฉยๆ" and "จริงๆแล้วไม่ได้ deploy
  ขึ้น vercel จริงๆ มันแค่ demo". **Real production hosting is now a self-hosted VPS** with its own
  domain + HTTPS + self-hosted MongoDB, live since ~2026-08-07 — the Vercel demo is decommissioned.
- Development now targets the real production host directly (local dev via `npm run dev` still
  works the same way regardless of where the deployed instance runs).
- **Standing rule from 2026-07-24 onward:** every new feature must use portable building blocks
  only (MongoDB, plain Node logic, standard REST). **Never couple new work to Vercel-specific
  services** (Blob, KV, Edge Config, Cron, etc.) unless explicitly agreed case-by-case first.

## Lesson Already Learned

The Scope of Work attachment feature (2026-07-24) was first built on **Vercel Blob** and had to be
reworked to **MongoDB storage** (`scope_attachment_files` collection) the same day, once the
demo-only status came to light — files must travel with the database. That rework is why the
standing rule above exists. See [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Attachments"
and CHANGELOG.md 2026-07-24.

## Portability Status Today

| Subsystem | Portable as-is? | Notes |
|---|---|---|
| Frontend (React/Vite) | ✅ | Builds to static files — servable by nginx or any static host |
| Database (MongoDB) | ✅ | Was Atlas pre-cutover; **now self-hosted MongoDB** on the production VPS (confirmed 2026-08-14) |
| File attachments | ✅ | Stored in MongoDB (`scope_attachment_files`) — travel with the DB |
| Email | ✅ (nothing to migrate) | **Removed entirely 2026-08-07** — document recipients get in-app notifications only; no email env var, no SMTP port, no provider. (Resend and the brief same-day per-user Gmail SMTP are both gone) |
| Auth (bcrypt + JWT httpOnly cookie) | ✅ | Not Vercel-coupled (`secure` cookie requires HTTPS on the new host) |
| **API layer — 12 function files in `api/handlers/` + `vercel.json` rewrites** | ✅ (2026-08-06) | The thin Express wrapper exists: `server/app.ts` mounts the unchanged handlers on the same routing table. Both runtimes work from one codebase. |

The good news: nearly all business logic lives in `api/_lib/` and is transport-agnostic, and the
req/res surface the handlers use (`req.query`, `req.body`, `res.status().json()`,
`res.setHeader()`, `res.send()`) is ~100% Express-compatible (`VercelRequest`/`VercelResponse` are
type-only imports, erased at runtime). **The API does not need a rewrite — only a thin new shell
around the existing handlers.**

## The Migration Plan (3 steps — ✅ ALL DONE 2026-08-06, on the owner's go-ahead)

1. ✅ **Add an Express server** (`server/index.ts` + `server/app.ts` + `server/env.ts`): mounts the
   existing 12 handler entry points via a routing table replicating `vercel.json`'s rewrites,
   `express.json()` with a 25 MB limit (raised from the planned ~5 MB once the Service module's
   4 MB photos shipped), and serves the built frontend from `dist/` with an SPA fallback.
   The side benefit landed too: `npm run dev` now runs the full stack locally (Express API +
   Vite with an `/api` proxy) — no `vercel dev` needed. Integration-tested over real HTTP in
   `tests/api/expressServer.test.ts`. See [ARCHITECTURE.md](./ARCHITECTURE.md) "Standalone
   Express server".
2. ✅ **`.env.example`** — documents every variable: `MONGODB_URI`, `MONGODB_DB`, `JWT_SECRET`,
   `NODE_ENV`, `PORT`, `APP_URL`. (No email var — `RESEND_API_KEY`/`EMAIL_FROM` and their brief
   2026-08-07 replacement `EMAIL_CRED_SECRET` are all gone; email sending was removed.)
3. ✅ **[DEPLOYMENT.md](./DEPLOYMENT.md)** — the real-server install guide (PM2/systemd,
   nginx/Caddy + HTTPS, Atlas-vs-self-hosted + backups, copying env values from Vercel).

Steps 1–2 are non-destructive to the Vercel demo (the same code keeps deploying to Vercel
unchanged; the Express entry is an additional way to run it, not a replacement).

## Go-Live Checklist — EVERYTHING to do when moving to the real server

> Recorded 2026-07-24 at the owner's request ("อยากให้จดทั้งหมดที่ต้องทำไว้ตอนที่จะขึ้น Server") —
> the single complete list, so nothing has to be rediscovered at migration time.
> **✅ ALL STEPS BELOW ARE DONE — the migration is complete as of ~2026-08-07.** Kept in full as a
> historical record and as the reference checklist if the server ever needs rebuilding from scratch.

### A. Domain + email sender — ⚠️ OBSOLETE as of 2026-08-07 (kept for history)

> The Resend-based plan below is superseded twice over: email briefly became person-to-person
> Gmail on 2026-08-07, then **later the same day email sending was removed entirely** — document
> recipients get in-app bell notifications only (see
> [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Document Recipients"). Nothing replaces
> this step: no sender domain, DNS records, provider account, env var, or SMTP port is needed.
> A company domain is still nice-to-have for the app URL itself (step C), just not email-related.

1. ~~**Get a company domain** — the free `*.vercel.app` URL can never be an email sender domain.~~
2. ~~**Verify the domain with Resend** (SPF/DKIM DNS records).~~
3. ~~**Set `EMAIL_FROM`** — until done, sending only reaches the Resend account owner's own
   address (sandbox sender `onboarding@resend.dev`, discovered 2026-07-24).~~

### B. Build the portable server shell (the 3-step plan above)

Express server (`server/index.ts`) + `.env.example` + `docs/DEPLOYMENT.md` — see
"The Migration Plan" section. Non-destructive to the Vercel demo.

### C. Server machine setup — ✅ DONE

- Node 20+ under a process manager (always running, auto-restart on crash).
- **nginx reverse proxy + HTTPS** — done; HTTPS is NOT optional, the session cookie is `secure`.
- The app's own domain is pointed at the server.
- Environment variables set on the server (`MONGODB_URI`, `JWT_SECRET`, `APP_URL` pointing at the
  real domain — attachment capability-URLs depend on this being correct).

### D. Database — ✅ chosen and running (Option 2: self-hosted MongoDB); backups ⚠️ unconfirmed

- The owner chose **self-hosted MongoDB** (not Atlas) — confirmed 2026-08-14 ("ฐานข้อมูล Local
  ตั้งหมดแล้ว"). Indexes/attachments travel with it the same as any MongoDB instance.
- **Backup plan is not confirmed done.** The plan calls for a scheduled `mongodump` + off-machine
  copy on a self-hosted instance — this has **not** been independently verified to actually exist
  on the server. Don't assume backups are running; ask the owner or check for a cron job directly.

### E. Data/roles on first boot — done (exact path not independently re-verified)

- The plan called for a **fresh database** (owner's 2026-07-24 decision) — Setup Wizard runs once,
  seeds roles with every current permission, creates the Super Admin. Whether the live server
  actually started from a clean Setup Wizard run vs. carried over demo data was not itemized in
  the owner's 2026-08-14 confirmation — assume fresh per the original plan unless real user/role
  data suggests otherwise on inspection. **If it turns out data was carried over instead of
  fresh-seeded**, the specific manual grants that path needs (per the original 2026-07-24 plan)
  are: `quotations:viewAll`, `scopeOfWork:viewAll`, and the 7 `deliveryOrder:*` permissions for
  every existing role except Super Admin (`defaultRoles` only auto-seeds these on first-run setup,
  never retroactively on an already-provisioned database) — check Role Management for each role.
- **Budget note (2026-07-24)**: the plan called for staying on free tiers — a VPS + domain are the
  unavoidable real costs; confirm with the owner whether that's still the only spend.

### F. Verify after cutover — not independently re-run in this doc pass

The 6-point subsystem checklist below was the intended post-cutover smoke test (sign-in over
HTTPS, in-app notifications, attachment capability URLs, Delivery Order print, cross-account
notification polling, role-gated UI). The app has been live ~1 week as of 2026-08-14 with no
reported issues, which is a reasonable proxy for "these all work," but the checklist itself
was not walked point-by-point in this doc-only pass:

1. Sign in over HTTPS (JWT cookie) + sign out.
2. Press "ส่งแจ้งเตือนผู้รับเอกสาร" on a Scope of Work with a picked recipient, and confirm the
   recipient account sees the bell notification + the record in their list.
3. Upload an attachment, then open its capability URL from a logged-out browser (proves
   `APP_URL` + unauthenticated download route).
4. Print a per-milestone Delivery Order (print CSS is host-independent, but verify once).
5. Two accounts in two browsers: trigger a notification, confirm it appears within ~1 min on the
   other account without a reload (the 45 s polling).
6. Role check: a view-only account must NOT see the send-email button / edit actions.

### G. Final step before go-live: UPDATE THE USER MANUAL — ✅ DONE for go-live, but ongoing per release

- The owner confirmed 2026-08-14 the manual is updated ("คู่มืออัปเดตแล้ว"), and it got a further
  content update the same day (2026-08-14e, a new Service module chapter).
- **⚠️ The live, in-app manual is `public/manual.html`** (served at `/manual.html`, linked from
  the topbar's gold "คู่มือการใช้งาน" button in `src/App.tsx`) — **edit that file directly for any
  future content update.** `docs/manual/generate-pdf.mjs` + `docs/manual/user-manual.html` are the
  *old*, superseded PDF-generation pipeline (see that file's own header comment) — running
  `generate-pdf.mjs` does **not** update the manual users actually see in the app. This was
  nearly gotten backwards during the 2026-08-14e update; kept here so it doesn't happen again.

### H. Decommission the demo — ✅ DONE

- The Vercel demo is no longer used (owner confirmed 2026-08-14, "vercel ไม่ใช้"). Whether the
  Vercel project itself was deleted outright or just left idle/unused, and whether the unused
  Vercel Blob store was cleaned up, was not itemized in the confirmation — low-stakes either way
  since neither costs anything or receives traffic now.
- `docs/ARCHITECTURE.md` and this file were updated 2026-08-14 to describe the real host as
  current (this pass).

### Optional post-migration upgrades (only possible on the real server)

- **Notification push via SSE** — 2026-07-24: the client polls `GET /api/notifications` every
  45 s (see MODULES/Notifications.md), because Vercel serverless can't hold a connection open.
  Once the Express server exists, an SSE endpoint can push notifications instantly instead;
  the polling code is the fallback either way, so this is an enhancement, not a blocker.
- **Raise the 2 MB attachment limit** — it was sized to Vercel's ~4.5 MB request-body cap; on the
  Express server the `express.json` limit is ours to choose (mind MongoDB's 16 MB document cap —
  base64 inflates payloads ×4/3, so ~10 MB files is a comfortable ceiling).

## Related Documents

- [ARCHITECTURE.md](./ARCHITECTURE.md) — current architecture (Vercel Functions + MongoDB)
- [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Attachments" — the de-Vercel-ing precedent
