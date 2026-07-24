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

### Optional post-migration upgrades (only possible on the real server)

- **Notification push via SSE** — 2026-07-24: the client polls `GET /api/notifications` every
  45 s (see MODULES/Notifications.md), because Vercel serverless can't hold a connection open.
  Once the Express server exists, an SSE endpoint can push notifications instantly instead;
  the polling code is the fallback either way, so this is an enhancement, not a blocker.

## Related Documents

- [ARCHITECTURE.md](./ARCHITECTURE.md) — current architecture (Vercel Functions + MongoDB)
- [MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md) "Attachments" — the de-Vercel-ing precedent
