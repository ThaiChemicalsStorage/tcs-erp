# TCS ERP

Full project documentation lives in [`docs/`](./docs/CLAUDE.md) — **read `docs/CLAUDE.md` first**, it's the entry point and links to everything else (status, changelog, architecture, database, API, UI guidelines, RBAC, and per-module docs).

Quick facts:
- Vite + React 18 + TypeScript (strict) + Tailwind v4 frontend, **real backend**: Node.js + self-hosted MongoDB (see `docs/ARCHITECTURE.md`). Since the ~2026-08-07 cutover, production runs on a self-hosted VPS (**https://www.huma-erp.com/**) via the **standalone Express server** (`server/`, mounts the unchanged `api/` handlers — see `docs/DEPLOYMENT.md`); the Vercel Functions deployment is no longer used (`vercel.json` + its GitHub auto-deploy hookup are left in place, unconfirmed whether actually torn down — see `docs/SERVER_MIGRATION_PLAN.md` step H). Every domain lib calls a real REST API and RBAC is enforced server-side (`requirePermission()` on every mutating route). See `docs/RBAC.md`, `docs/DATABASE.md`, and `docs/SERVER_MIGRATION_PLAN.md`.
- `npm run dev` (full local stack: Express API :3001 + Vite :3000 with `/api` proxy — no `vercel dev` needed) / `npm start` (production: one Express process serving API + `dist/`) / `npm run build` / `npm run lint` / `npm test` (vitest, added 2026-07-29 — includes in-memory-MongoDB integration tests).
- **Documentation must be updated as part of every task, not after.** See the standing rule at the bottom of `docs/CLAUDE.md`.
