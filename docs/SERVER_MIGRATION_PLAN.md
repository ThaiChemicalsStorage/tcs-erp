# Server Migration Plan

> **Recorded 2026-07-24 from a direct conversation with the owner** — written down at their request
> ("จดและสร้างไฟล์สักอย่างในโปรเจคก์นี้ว่าเคยคุยเรื่องนี้ไว้ขี้เกียจมาบอกใหม่") so it never needs
> re-explaining. **Status: NOT started — deferred until development is finished and the owner
> explicitly says go.**

## Key Facts (agreed with the owner)

- **The current Vercel deployment (https://tcs-erp-nine.vercel.app) is a demo/trial only** — the
  owner's words: "ที่จริงระบบนี้ไม่ได้จะขึ้น vercel นะ...แค่อยากลองระบบเฉยๆ" and "จริงๆแล้วไม่ได้
  deploy ขึ้น vercel จริงๆ มันแค่ demo". Real production hosting will be a self-managed server
  (where/how not yet decided).
- Development is **not finished** — keep building features on the Vercel demo for now.
- The owner explicitly declined starting migration prep early ("งานยังไม่เสร็จนะแล้วก็ยังไม่ได้ขึ้น
  Server ตอนนี้") — **do NOT begin any of the migration steps below until asked.**
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
| Database (MongoDB Atlas) | ✅ | Keep Atlas, or move to self-hosted MongoDB via dump/restore |
| File attachments | ✅ | Stored in MongoDB (`scope_attachment_files`) — travel with the DB |
| Email (Resend REST API) | ✅ | Plain `fetch` — just set `RESEND_API_KEY` on the new host |
| Auth (bcrypt + JWT httpOnly cookie) | ✅ | Not Vercel-coupled (`secure` cookie requires HTTPS on the new host) |
| **API layer — 12 function files in `api/handlers/` + `vercel.json` rewrites** | ⚠️ | The one Vercel-coupled piece: runs as Vercel Functions today; needs a thin Express wrapper (see plan) |

The good news: nearly all business logic lives in `api/_lib/` and is transport-agnostic, and the
req/res surface the handlers use (`req.query`, `req.body`, `res.status().json()`,
`res.setHeader()`, `res.send()`) is ~100% Express-compatible (`VercelRequest`/`VercelResponse` are
type-only imports, erased at runtime). **The API does not need a rewrite — only a thin new shell
around the existing handlers.**

## The Migration Plan (3 steps — execute ONLY when the owner says go)

1. **Add an Express server** (`server/index.ts`): mount the existing 12 handler entry points on
   routes replicating `vercel.json`'s rewrites, add `express.json()` with a ~5 MB limit (the
   attachment upload body), and serve the built frontend from `dist/` with an SPA fallback.
   *Side benefit: the first-ever way to run the full stack locally — today the API can only be
   tested by deploying.*
2. **Add `.env.example`** documenting every required variable in one place: `MONGODB_URI`, the JWT
   secret, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`.
3. **Write `docs/DEPLOYMENT.md`** — the real-server install guide:
   - Node 20+ under PM2 or systemd (always running, auto-restart on crash)
   - nginx reverse proxy + HTTPS (Let's Encrypt)
   - Database decision: keep Atlas vs self-hosted MongoDB, plus a backup plan
   - Copying env values from Vercel to the new host

Steps 1–2 are non-destructive to the Vercel demo (the same code keeps deploying to Vercel
unchanged; the Express entry is an additional way to run it, not a replacement).

## Go-Live Checklist — EVERYTHING to do when moving to the real server

> Recorded 2026-07-24 at the owner's request ("อยากให้จดทั้งหมดที่ต้องทำไว้ตอนที่จะขึ้น Server") —
> the single complete list, so nothing has to be rediscovered at migration time. Ordered; items
> marked **(can do now)** don't need the server and work on the Vercel demo too.
> **Don't skip step G** — the owner explicitly asked to be reminded that the user manual must be
> updated as the final pre-launch step.

### A. Domain + email sender (can do now — also fixes email on the demo)

1. **Get a company domain** (e.g. `thaichemicals.co.th`) — buy one (~300–500 THB/yr) or use one
   the company already owns. The free `*.vercel.app` URL can never be used as an email sender
   domain (we don't own `vercel.app`).
2. **Verify the domain with Resend** (dashboard → Domains → Add Domain → add the ~3 DNS records
   (SPF/DKIM) at the domain registrar → wait a few minutes). Free tier: 1 domain, 3,000
   emails/month — plenty for this internal system.
3. **Set `EMAIL_FROM`** env var to e.g. `TCS ERP <erp@thaichemicals.co.th>`. No code change needed
   (`api/_lib/email.ts` already reads it). **Until this is done, email sending only reaches the
   Resend account owner's own address** — the sandbox sender `onboarding@resend.dev` cannot
   deliver to arbitrary employee addresses (discovered/discussed 2026-07-24). This step is
   host-independent: done once, it keeps working after the migration.

### B. Build the portable server shell (the 3-step plan above)

Express server (`server/index.ts`) + `.env.example` + `docs/DEPLOYMENT.md` — see
"The Migration Plan" section. Non-destructive to the Vercel demo.

### C. Server machine setup

- Node 20+ under **PM2 or systemd** (always running, auto-restart on crash).
- **nginx reverse proxy + HTTPS (Let's Encrypt)** — HTTPS is NOT optional: the session cookie is
  `secure`, so login breaks entirely on plain HTTP.
- Point the app's own domain/subdomain (e.g. `erp.thaichemicals.co.th`) at the server.
- **Environment variables** (copy values out of the Vercel project settings):
  - `MONGODB_URI` — same Atlas URI, or the new self-hosted one
  - `JWT_SECRET` (the session-signing secret — keep the SAME value if migrating live sessions,
    or accept that everyone re-logs-in once)
  - `RESEND_API_KEY`
  - `EMAIL_FROM` (from step A)
  - `APP_URL` — set to the real URL (e.g. `https://erp.thaichemicals.co.th`). **Important**: email
    links AND attachment capability-URLs are built from this; left unset it falls back to the
    Vercel demo URL and every emailed link points at the wrong site.

### D. Database

- **Option 1 — keep MongoDB Atlas** (simplest): nothing moves; just allow the new server's IP in
  Atlas Network Access and reuse the URI.
- **Option 2 — self-hosted MongoDB**: `mongodump` from Atlas → `mongorestore` on the server.
  Attachments travel automatically (they live in the `scope_attachment_files` collection);
  indexes are preserved by dump/restore.
- Either way: **set up a backup plan** (Atlas has automatic backups on paid tiers; self-hosted
  needs a scheduled `mongodump` + off-machine copy).

### E. Data/roles on first boot

- **The expected path is a FRESH database** — owner's decision 2026-07-24 ("ฐานข้อมูลตอนนี้
  เดี๋ยวต้องเคลียร์ใหม่อยู่ดี"): the demo database's data is throwaway test data and will be
  cleared before real use, so plan for: open the app once → Setup Wizard runs → seeds roles
  (which DO include every current permission — no manual grant steps needed on a fresh seed) +
  creates indexes + creates the Super Admin, then recreate real users/products/customers.
- **If any demo data ends up being kept instead** (decision can change): users/roles/data carry
  over as-is, and the still-pending manual Role Management grants must be completed —
  `quotations:viewAll`, `scopeOfWork:viewAll`, and the 7 `deliveryOrder:*` permissions for
  existing roles (`defaultRoles` only seeds on first-run setup, never re-applies).
- **Budget note (2026-07-24)**: no paid services at all for now — everything in this plan must
  stay on free tiers until the owner says otherwise (Atlas free tier, Resend free tier; the
  domain in step A is the one unavoidable purchase and waits until go-live approaches).

### F. Verify after cutover (each of these exercises a different subsystem)

1. Sign in over HTTPS (JWT cookie) + sign out.
2. Send "ส่งอีเมลแจ้งผู้รับเอกสาร" to a REAL employee address (proves the verified domain).
3. Upload an attachment, then open its capability URL from a logged-out browser (proves
   `APP_URL` + unauthenticated download route).
4. Print a per-milestone Delivery Order (print CSS is host-independent, but verify once).
5. Two accounts in two browsers: trigger a notification, confirm it appears within ~1 min on the
   other account without a reload (the 45 s polling).
6. Role check: a view-only account must NOT see the send-email button / edit actions.

### G. Final step before go-live: UPDATE THE USER MANUAL (owner's explicit reminder, 2026-07-24)

- **Regenerate `public/คู่มือการใช้งาน TCS ERP.pdf` as the last step before going live** — the
  owner asked to be reminded of this specifically ("ท้ายสุดก่อนขึ้น Server ให้อัพเดตคู่มือ").
  Two reasons it must be redone, not just kept:
  1. **Content freshness**: the text content was updated 2026-07-29 (approval workflow, manual
     Scope of Work numbers, PO chasing, login lockout — see CHANGELOG.md) but anything shipped
     after that date will be missing again. Sweep `WHATS_NEW_ENTRIES` (src/lib/whatsNew.ts)
     against the manual's chapter list to catch everything.
  2. **Screenshots show the demo URL** (and predate the 2026-07-29 UI text changes) — recapture
     against the real host so users see the right address.
  Regeneration is now one command (2026-07-29): `npm install --no-save puppeteer-core && node
  docs/manual/generate-pdf.mjs` (committed script, uses system Chrome). Screenshots are still
  captured via browser automation against the live site — see docs/CHANGELOG.md 2026-07-24.

### H. Decommission the demo

- Keep or delete the Vercel project (keeping it as a staging environment is fine — but then
  restrict who knows the URL, since it shares the production database unless repointed).
- Delete the unused Vercel Blob store (leftover from the 2026-07-24 attachments rework).
- Update `docs/ARCHITECTURE.md` + this file to describe the real host as current.

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
