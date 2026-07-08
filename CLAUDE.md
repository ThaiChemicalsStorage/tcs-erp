# TCS ERP

Full project documentation lives in [`docs/`](./docs/CLAUDE.md) — **read `docs/CLAUDE.md` first**, it's the entry point and links to everything else (status, changelog, architecture, database, API, UI guidelines, RBAC, and per-module docs).

Quick facts:
- Vite + React 18 + TypeScript (strict) + Tailwind v4. No backend, no database, no real auth yet — this is a client-only frontend (see `docs/ARCHITECTURE.md`).
- `npm run dev` / `npm run build` / `npm run lint`.
- **Documentation must be updated as part of every task, not after.** See the standing rule at the bottom of `docs/CLAUDE.md`.
