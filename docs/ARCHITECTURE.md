# Architecture

## Project Structure

See [CLAUDE.md](./CLAUDE.md) for the full annotated folder tree. Summary of the layering:

```
src/
├── App.tsx          # root shell: auth gate, sidebar/topbar, page router (string switch)
├── main.tsx          # ReactDOM entry
├── components/        # generic, reusable, cross-module UI (ConfirmDialog, Toast)
├── hooks/             # reusable hooks (useToast)
├── lib/                # per-domain: types + sample data + pure helpers + REST API calls (via apiClient.ts)
└── pages/
    ├── <flat files>    # small/standalone pages (SignInPage, SettingsPage, ...)
    └── <module>/        # once a module outgrows one file, it gets its own folder:
        ├── <Module>Page.tsx   # owns view-switching state, composes the rest
        └── ...smaller view/behavior components
```

## Frontend Architecture

- **React 18 + Vite 6 + TypeScript 5.6 (strict)**. No meta-framework (no Next.js/Remix) — the 2026-07-09 backend migration deliberately kept Vite/React on the frontend and added a separate Vercel Functions + MongoDB backend rather than replacing the frontend framework (see Backend Architecture below).
- **No router.** `App.tsx` holds `activeNav: string` and a plain conditional to decide which page component renders. This works because there are only 4 top-level destinations (Dashboard, Quotation, Product Library, Settings) plus the Sign-in gate. If the app grows to need deep-linkable URLs, nested routes, or browser back/forward, this should become `react-router` — a decision now independent of any backend framework, since the backend is plain Vercel Functions, not Next.js.
- **State management: plain React state**, lifted to `App.tsx` for anything shared across modules (`quotes`, `products`, `categories`, `company`, `users`, `roles`, `notifications`, `auditEntries`). No Redux/Zustand/Context — not needed at this scale. As of the 2026-07-09 backend migration, `currentUser` is **real React state** (not derived via `.find()` from a `users` array + a separately-tracked session id as before) — `App.tsx` boots asynchronously via a `bootStatus` state machine that calls `GET /api/auth/session` and fetches all app data before rendering the shell; `updateUsers`/`updateCurrentUser` helpers keep `currentUser` in sync when the `users` list changes.
- **Code-splitting**: all page-level components (`SetupWizardPage`, `SignInPage`, `SettingsPage`, `ProductsPage`, `QuotationPage`, `DashboardPage`, `UserManagementPage`, `RoleManagementPage`, `AuditLogPage`) are `React.lazy()`-loaded from `App.tsx`, wrapped in `<Suspense>` with a skeleton fallback (`PageLoading`). This keeps `recharts` (Dashboard-only) out of the main bundle. `NotificationBell` is a small, always-mounted header component and is imported eagerly, not lazy.
- **Styling**: Tailwind v4 via `@tailwindcss/vite`, design tokens as CSS custom properties in `src/styles/theme.css` (see [UI_GUIDELINES.md](./UI_GUIDELINES.md)). No component library (no shadcn/Radix/MUI) — every component is hand-built from Tailwind utility classes, intentionally, to match a specific navy/gold editorial look ported from the original Figma design.

## Backend Architecture

**Real backend, deployed and live**: Vite + React frontend (unchanged) + **Vercel Serverless Functions (Node.js)** backend + **MongoDB Atlas** database, live at https://tcs-erp-nine.vercel.app (Vercel project `tcs-erp`, GitHub repo `Wisarutbuasumlee/tcs-erp` connected for auto-deploy on push to `master`). Migrated 2026-07-09 from the fully client-side RBAC/localStorage simulation described in the historical record below — see [API.md](./API.md) for the full route-by-route breakdown and [DATABASE.md](./DATABASE.md) for the MongoDB collections.

- **Auth**: bcrypt password hashing (`bcryptjs`, cost 10), JWT sessions (`jsonwebtoken`) in an httpOnly, `secure`, `sameSite=lax` cookie named `tcs_erp_session`, 7-day expiry. Every authenticated request re-fetches the user fresh from MongoDB (`getAuthContext()` in `api/_lib/auth.ts`) rather than trusting JWT claims for role/status — deactivating a user takes effect on their very next request, not just at token expiry. See [RBAC.md](./RBAC.md) for how this compares to true session revocation.
- **RBAC enforced server-side**: every mutating API route calls `requirePermission()`/`requireUser()` (`api/_lib/auth.ts`), which check permissions via `roleHasPermission()` — the exact same pure permission-checking function from `src/lib/roles.ts`, value-imported into the API layer (not reimplemented). This is genuinely unbypassable via devtools now; the server is the source of truth.
- **MongoDB collections**: `users` (server-only `passwordHash` field, excluded from the client-facing `PublicUser`/`User` type), `roles` (seeded from the same `defaultRoles` array the client used to use, via `api/_lib/rbacSeed.ts` on first run), `company` (singleton doc, fixed `_id: "singleton"`), `products`, `categories`, `notifications`, `audit_log`, `quotes` (keyed by the human-readable business ID, e.g. `"QT-2567-0041"`, as the actual MongoDB `_id` — not an `ObjectId`). Full shapes: [DATABASE.md](./DATABASE.md).
- **MongoDB connection**: a singleton client per warm serverless instance (`api/_lib/mongodb.ts`) — reused across invocations on that instance (not a single process-wide connection across all instances), the correct shape for serverless.
- **MongoDB Atlas free-tier M0 cluster**; `MONGODB_URI` and `JWT_SECRET` live only in Vercel env vars (production/preview/development), never committed to the repo.

### API layout: 12 function files (the Vercel Hobby cap), two dispatch patterns

Vercel's Hobby plan caps deployments at 12 serverless functions, so routes are consolidated.
**Still at the cap as of 2026-07-14** — any future new resource needs a new dispatch branch inside
an existing handler file, not a new file, unless the project moves off Vercel Hobby. (Briefly
`company-profiles.ts`, added 2026-07-13, was the 12th slot, with `/api/customers` folded into it to
avoid a 13th file; both `company-profiles.ts` and the whole Company Profiles module were removed
2026-07-14, freeing that slot — immediately spent giving `customers.ts` its own dedicated file
below instead, so the count is still exactly 12 of 12. Same day, `customers.ts` picked up a second
tenant of its own: Global Search (`GET /api/search`, `api/_lib/searchHandler.ts`) dispatches from
that same file on the raw pathname — still 12 of 12, no new file added.)

- **Plain single-route files** — `api/company/index.ts`, `api/audit-log/index.ts`, `api/dashboard/index.ts` (added 2026-07-09, GET only) — dispatch on `req.method` within one file.
- **One file per resource, dispatching on path** — `api/handlers/{auth,users,roles,products,categories,notifications,quotes,jobtypes,customers}.ts` — each parses the URL's path segments after the resource prefix (via `getPathSegments(req, prefix)` in `api/_lib/http.ts`, which parses `req.url` directly) and branches on them (e.g. `parts.length === 2 && parts[1] === "workflow"` for `POST /api/quotes/:id/workflow`).
- **`api/_lib/`** — shared server-only code, never routed: `mongodb.ts` (connection singleton), `http.ts` (`HttpError`, `withErrorHandling`, `getPathSegments`), `auth.ts` (JWT/cookie/bcrypt helpers, `requireUser`/`requirePermission`), `collections.ts` (typed MongoDB collection getters + id-mapping helpers, extended 2026-07-09 with 15 schema-prep collections — see [DATABASE.md](./DATABASE.md)), `rbacSeed.ts` (seeds default roles on first run), `systemSeed.ts` (added 2026-07-09, seeds system/config data on first run — permissions/departments/positions/notification types/system settings, zero business data), `quoteWorkflow.ts` (see below).
- **2026-07-09 cleanup**: a duplicate, unreachable `api/{auth,users,roles,products,categories,notifications,quotes}/[[...segments]].ts` layer (plus a few standalone files like `api/auth/login.ts`) existed alongside `api/handlers/`, shadowed by the `vercel.json` rewrites described below — confirmed dead via production traffic logs and deleted. If old commit history references those paths, they no longer exist; `api/handlers/*.ts` was always the real routing.
- **`quoteWorkflow.ts` is a deliberate duplicate**: `workflowTransitions`, the `ApprovalAction` type, and the per-action required-permission mapping are copied from `src/lib/quotes.tsx` rather than imported, because `quotes.tsx` contains JSX (a `statusIcon` map using `lucide-react` components) and the team decided not to risk value-importing a `.tsx`-with-JSX file into a Node serverless function. A comment in `quoteWorkflow.ts` notes to keep the two copies in sync if the workflow ever changes.

### API routing gotcha — why `api/handlers/` + `vercel.json` rewrites, not Vercel's own dynamic routes

Vercel's dynamic-route convention (`[...segments]`/`[[...segments]]` folders) has surprising, undocumented behavior on this project's plain-Vite (non-Next.js) deployment, discovered and root-caused during the migration:

- A `[...segments]` catch-all folder populates `req.query["...segments"]` (the literal string including the dots), **not** `req.query.segments` as in Next.js.
- The zero-segment base path (e.g. `GET /api/quotes` with no trailing path) never matches a `[...segments]` **or** `[[...segments]]` folder at all.
- Folders/files prefixed with `_` (an early `api/_handlers/` attempt) are **silently excluded** from function routing by Vercel's convention — the same convention `api/_lib/` deliberately relies on to stay a non-route.

The final, tested, working fix: a plain-named `api/handlers/` directory (no underscore, so it's not auto-excluded, but also not directly routable by folder name alone) plus an explicit **`vercel.json`** with `rewrites` mapping every `/api/<resource>` and `/api/<resource>/:path*` pattern to its one handler file. This is the real routing mechanism in production — a future engineer touching routing needs this context to avoid reintroducing the bug.

### TypeScript / build / lint split

- Root `tsconfig.json` still covers only `src/` (unchanged, browser/DOM target).
- New `tsconfig.api.json` covers `api/` (Node target; `jsx: "react-jsx"` set specifically so `tsc` can parse type-only imports from `quotes.tsx`; DOM lib included alongside Node types because `api/_lib` files transitively type-check browser-side lib files like `apiClient.ts` that reference `fetch`/`Response`).
- `npm run build` now runs `tsc -b && tsc --noEmit -p tsconfig.api.json && vite build` — both TS projects must pass clean.
- `eslint.config.js` has a second block scoped to `api/**/*.ts` with Node globals instead of browser globals.

### Critical gotcha: explicit `.js` extensions on relative imports in `api/`

Every relative import in `api/` files, and in any `src/lib/*.ts` file that gets **value**-imported (not just type-imported) from `api/`, must include an explicit `.js` extension — e.g. `from "../_lib/http.js"`, `from "../../src/lib/roles.js"` — even though the actual source files are `.ts`/`.tsx`. Vercel's Node.js function runtime uses native Node ESM module resolution (`package.json` has `"type": "module"`), which requires explicit extensions on relative imports. TypeScript's `moduleResolution: "bundler"` permits omitting them for the Vite/browser build, but the deployed Node functions are **not** bundled into single files — they're transpiled per-file and executed via Node's own ESM loader, so a missing extension causes `ERR_MODULE_NOT_FOUND` at runtime in production. This was hit and fixed multiple times during the migration — a real, recurring footgun specific to this codebase. Type-only imports (`import type { X }`) are exempt since they're fully erased at compile time and never produce a runtime import statement.

### Frontend changes

- **`src/lib/apiClient.ts`** (new) — thin `apiFetch<T>()` wrapper: `fetch` with `credentials: "include"`, JSON headers, an `ApiError` class for non-2xx responses.
- Every domain lib file (`users.ts`, `roles.ts`, `session.ts`, `storage.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.tsx`) was rewritten to replace `loadX()`/`saveX()` `localStorage` functions with `fetchX()`/`createX()`/`updateX()`/etc. API-calling functions.
- **`App.tsx` boots asynchronously**: a `bootStatus` state machine (`"loading" | "needsSetup" | "signedOut" | "ready"`) drives a `useEffect` that calls `GET /api/auth/session` (returns `{ user, needsSetup }`) and branches into the Setup Wizard, Sign In page, or fetches all app data (users, roles, company, products, categories, notifications, quotes) in parallel via `Promise.all` before rendering the main app shell.
- **`currentUser` is now real React state** (not derived via `.find()` from a `users` array + a separately-tracked session id like before), kept in sync by `updateUsers`/`updateCurrentUser` helpers.
- **`AuditLogPage.tsx`** now self-fetches its own data via `useEffect` on mount (rather than receiving it as a prop from `App.tsx`), since `GET /api/audit-log` is permission-gated (`auditLog:view`) and can't safely be part of the universal boot-time fetch that runs for every signed-in user regardless of permissions.

### Superseded: the old "Phase 2" proposal (Next.js/Prisma/Postgres/Auth.js) — NOT what got built

Before this migration, a different stack was designed (never implemented) for "when the user is ready":

- **Next.js (App Router)** — full-stack, replacing the Vite SPA entirely, as a new sibling project.
- **Prisma ORM + PostgreSQL** (hosted on Neon.tech).
- **Auth.js (NextAuth v5)**, Credentials provider + Prisma adapter, **database session strategy** (chosen specifically so disabling a user can force-invalidate their session immediately by deleting their `Session` rows).
- **RBAC** via a single `can(user, permission)` function imported both server- and client-side.
- **Module registration pattern**: `src/modules/<name>/{manifest.ts, components/, actions/, queries/}`, aggregated into a `module-registry.ts` array.

**This plan is superseded and was never built.** The migration that actually shipped (2026-07-09) used Vite + Vercel Functions + MongoDB instead — a deliberately simpler, faster path to a real backend that didn't require replacing the frontend framework. Do not assume any Next.js/Prisma/Postgres/Auth.js code exists anywhere in this repo. This section is kept only as a historical record of the design that was considered and abandoned in favor of the real implementation described above. Where the two designs achieve conceptually the same goal via different means (e.g. session revocation), see [RBAC.md](./RBAC.md) for an explicit comparison.

## Database Architecture

Real MongoDB Atlas database. Full collection-by-collection breakdown: [DATABASE.md](./DATABASE.md).

## API Architecture

Real REST API served by Vercel Serverless Functions. Full route-by-route breakdown (method, auth, permission, request/response shape): [API.md](./API.md).

## Folder Organization

- `lib/<domain>.ts` — one file per data domain. Contains: TypeScript types/interfaces, seed/sample data, pure helper functions (formatting, ID generation, totals math), and — where applicable — `load<Domain>()`/`save<Domain>()` `localStorage` functions. Example: `lib/products.ts` has `Product`, `ProductCategory`, `defaultProducts`, `defaultCategories`, `loadProducts`, `saveProducts`, `loadCategories`, `saveCategories`, `newId`, `nowIso`.
- `pages/<module>/` — once a module needs more than one file, it gets a folder. The folder's top-level `<Module>Page.tsx` owns view-switching state (e.g. `QuotationPage.tsx` switches between list/new/detail) and composes smaller components from the same folder. Small/standalone pages that don't need this (Sign-in, Sign-up, Settings) stay as flat files directly under `pages/`.
- `components/` — reserved for genuinely cross-module, generic UI (a confirm dialog, a toast). If a component is specific to one module's domain, it belongs in that module's `pages/<module>/` folder instead.
- `hooks/` — reusable stateful logic with no rendering of its own (currently just `useToast`).

## Component Organization

Within a module folder, the pattern established by `pages/quotation/` and `pages/products/`:

1. A top-level `<Module>Page.tsx` holds `useState` for which "view" is active (list / create / edit / detail) and any cross-view identifiers (e.g. `selectedId`).
2. Each view is its own component (`QuoteList.tsx`, `QuoteDocument.tsx`, `ProductList.tsx`, `ProductForm.tsx`, `CategoriesManager.tsx`), receiving data + callbacks as props — no direct `localStorage` access or cross-module imports from view components.
3. Shared, small, presentation-only pieces used by multiple views in the same module (e.g. `InterestButtons.tsx`, `notesFormat.tsx`) live alongside them in the same folder.
4. A view component that gets a `key={...}` prop tied to "which record is being edited" (see `QuoteDocument` keyed by `selectedId ?? "new"` in `QuotationPage.tsx`) is a deliberate pattern: it forces React to remount (and thus reset local form state) when switching between records, instead of manually syncing state via `useEffect`. Prefer this pattern over effect-based state synchronization when a component's entire local state should reset per-record.

## Future Scalability

The current flat `activeNav`-switch router and lifted-state-in-`App.tsx` approach is intentionally simple and will not scale past a handful of modules. The superseded Next.js proposal's **module registration pattern** (see "Superseded" subsection above) was one designed answer for that, but it was never built — the frontend router/state model is unchanged by the 2026-07-09 backend migration. Adding a 5th/6th module today should still follow the existing `lib/<domain>.ts` + `pages/<module>/` convention (now calling the real API instead of `localStorage`) plus a matching `api/handlers/<resource>.ts` + `vercel.json` rewrite entry on the backend side. If the app ever outgrows the flat-switch router, revisit `react-router` on the frontend independently of any backend decision — the two are no longer coupled the way the old Next.js proposal assumed.

## Refactoring Decisions

- **`QuotationPage` split out of `App.tsx`** (originally one ~1000-line function inline in `App.tsx`): the notes/sub-details feature required enough new state and UI (notes editor, drag-reorder sub-details, print-only rendering, save/duplicate/send wiring) that keeping it inline would have made `App.tsx` unmanageable. Split into `lib/quotes.tsx` (data) + `pages/quotation/*` (5 components).
- **`DashboardPage` extracted to its own file and lazy-loaded**: the production build flagged a 709KB single-chunk warning, entirely due to `recharts` being bundled into the main chunk even though only the Dashboard page uses charts. Extracting it and wrapping all main pages in `React.lazy`/`Suspense` fixed this — `recharts` now only loads when a user actually opens the Dashboard.
- **`Quote.lines`/`Quote.discount` added to the `Quote` type**: originally, the quotation editor's line items lived in component-local state with no connection back to the `Quote` record being viewed — meaning Save/Duplicate did nothing and every quote showed the same hardcoded example lines. This was a genuine bug (see [CHANGELOG.md](./CHANGELOG.md), 2026-07-08 entry), fixed by making `lines`/`discount` real fields on `Quote` and threading Save/Duplicate/Send through them properly.
- **ESLint + `noUnusedLocals`/`noUnusedParameters` added**: the project had no lint tooling at all until the first full code-review pass; added the standard Vite React+TS flat-config setup rather than a custom ruleset.
- **`pages/admin/` added (2026-07-08)**: `UserManagementPage`/`RoleManagementPage`/`AuditLogPage` didn't fit cleanly under any existing module folder (they're cross-cutting system administration, not a single business domain like Quotation/Product), so they got their own top-level `pages/admin/` folder following the same "flat file until it needs a sub-structure" convention as `pages/<module>/`.
- **`QuoteDocument`'s status must be derived from props, not local `useState`**: originally `quoteStatus` was `useState`-initialized from the `quote` prop, which worked when Save was the only way to change status. Once workflow transitions (approve/reject/etc.) started updating `Quote.status` via a prop change without remounting the component (same `key`, since `selectedId` doesn't change on a status transition), the stale `useState` value silently stopped reflecting reality — found via scripted browser testing, not `tsc`/`eslint`. Fixed by making `quoteStatus` a plain `const` derived from `quote?.status` every render. General lesson for this codebase: any value that can change purely via a prop update (not a remount) must be derived, not copied into `useState`, unless there's a specific reason to let it diverge.
