# TCS ERP

Full project documentation lives in [`docs/`](./docs/CLAUDE.md) — **read `docs/CLAUDE.md` first**, it's the entry point and links to everything else (status, changelog, architecture, database, API, UI guidelines, RBAC, and per-module docs).

Quick facts:
- Vite + React 18 + TypeScript (strict) + Tailwind v4. No backend, no database — this is a client-only frontend (see `docs/ARCHITECTURE.md`). It now has a real client-side RBAC/user-management/approval-workflow/notification/audit-log system (multi-user accounts, hashed passwords, permission-gated sidebar, quotation approval chain) — but it's a **Phase 1 simulation**: everything is enforced in the browser and stored in `localStorage`, not server-verified, so it is not real security. See `docs/RBAC.md`.
- `npm run dev` / `npm run build` / `npm run lint`.
- **Documentation must be updated as part of every task, not after.** See the standing rule at the bottom of `docs/CLAUDE.md`.
