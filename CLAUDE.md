# TCS ERP

Full project documentation lives in [`docs/`](./docs/CLAUDE.md) — **read `docs/CLAUDE.md` first**, it's the entry point and links to everything else (status, changelog, architecture, database, API, UI guidelines, RBAC, and per-module docs).

Quick facts:
- Vite + React 18 + TypeScript (strict) + Tailwind v4 frontend, **real backend**: Vercel Serverless Functions (Node.js) + MongoDB Atlas (see `docs/ARCHITECTURE.md`). This note was stale — as of 2026-07-09 the client-only/localStorage description no longer applies anywhere; every domain lib calls a real REST API and RBAC is enforced server-side (`requirePermission()` on every mutating route). See `docs/RBAC.md` and `docs/DATABASE.md`.
- `npm run dev` / `npm run build` / `npm run lint`.
- **Documentation must be updated as part of every task, not after.** See the standing rule at the bottom of `docs/CLAUDE.md`.
