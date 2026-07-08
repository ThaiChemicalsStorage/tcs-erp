# Architecture

## Project Structure

See [CLAUDE.md](./CLAUDE.md) for the full annotated folder tree. Summary of the layering:

```
src/
├── App.tsx          # root shell: auth gate, sidebar/topbar, page router (string switch)
├── main.tsx          # ReactDOM entry
├── components/        # generic, reusable, cross-module UI (ConfirmDialog, Toast)
├── hooks/             # reusable hooks (useToast)
├── lib/                # per-domain: types + sample data + pure helpers + localStorage I/O
└── pages/
    ├── <flat files>    # small/standalone pages (SignInPage, SettingsPage, ...)
    └── <module>/        # once a module outgrows one file, it gets its own folder:
        ├── <Module>Page.tsx   # owns view-switching state, composes the rest
        └── ...smaller view/behavior components
```

## Frontend Architecture

- **React 18 + Vite 6 + TypeScript 5.6 (strict)**. No meta-framework (no Next.js/Remix) at this stage.
- **No router.** `App.tsx` holds `activeNav: string` and a plain conditional to decide which page component renders. This works because there are only 4 top-level destinations (Dashboard, Quotation, Product Library, Settings) plus the Sign-in/Sign-up gate. If the app grows to need deep-linkable URLs, nested routes, or browser back/forward, this should become `react-router` (or, if the Phase 2 Next.js migration happens, the App Router's file-based routing replaces this entirely).
- **State management: plain React state**, lifted to `App.tsx` for anything shared across modules (`quotes`, `products`, `categories`, `company`, `user`, `authed`). No Redux/Zustand/Context — not needed at this scale.
- **Code-splitting**: the four main pages (`SignInPage`, `SignUpPage`, `SettingsPage`, `ProductsPage`, `QuotationPage`, `DashboardPage`) are all `React.lazy()`-loaded from `App.tsx`, wrapped in `<Suspense>` with a skeleton fallback (`PageLoading`). This keeps `recharts` (Dashboard-only) out of the main bundle.
- **Styling**: Tailwind v4 via `@tailwindcss/vite`, design tokens as CSS custom properties in `src/styles/theme.css` (see [UI_GUIDELINES.md](./UI_GUIDELINES.md)). No component library (no shadcn/Radix/MUI) — every component is hand-built from Tailwind utility classes, intentionally, to match a specific navy/gold editorial look ported from the original Figma design.

## Backend Architecture

**None exists yet.** All data operations are synchronous JavaScript function calls within the browser — see [API.md](./API.md) for the full current-state breakdown and the proposed (not-started) future design.

A **Phase 2 plan** was designed (not implemented) for when the user is ready:

- **Next.js (App Router)** — full-stack, replacing the Vite SPA entirely. New sibling project, not an in-place conversion (the routing model, auth model, and frontend/backend boundary all change simultaneously).
- **Prisma ORM + PostgreSQL** (hosted on Neon.tech — no Docker on this machine).
- **Auth.js (NextAuth v5)**, Credentials provider + Prisma adapter, **database session strategy** (chosen specifically so disabling a user can force-invalidate their session immediately).
- **RBAC** enforced server-side via a single `can(user, permission)` function imported both server- and client-side (server = source of truth via `requirePermission()` guards on every server action/page; client = display-only, hides UI it shouldn't show).
- **Module registration pattern**: `src/modules/<name>/{manifest.ts, components/, actions/, queries/}`, aggregated into one explicit `module-registry.ts` array — adding a new ERP module (Purchasing, HR, etc.) is a new folder + one array entry, no changes to shared sidebar/router/auth code.

Full detail on this proposal lives in conversation history and is summarized here and in [RBAC.md](./RBAC.md) / [DATABASE.md](./DATABASE.md); **none of it is implemented**. Treat any reference to `User`, `Role`, `Permission`, `Department`, etc. as design, not code, until a Next.js project actually exists in this repo (or a sibling one).

## Database Architecture

**None exists yet.** Current persistence is `localStorage` for some domains only. Full breakdown, plus the proposed future Prisma schema: [DATABASE.md](./DATABASE.md).

## API Architecture

**None exists yet.** Current "APIs" are plain function calls into `src/lib/*.ts`. Full breakdown, plus the proposed future Next.js API/server-action design: [API.md](./API.md).

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

The current flat `activeNav`-switch router and lifted-state-in-`App.tsx` approach is intentionally simple and will not scale past a handful of modules. The Phase 2 Next.js plan's **module registration pattern** (see Backend Architecture above) is the designed answer for that: each future module is additive (new folder + one registry line), not a refactor of existing code. Until that migration happens, adding a 5th/6th client-side module should still follow the existing `lib/<domain>.ts` + `pages/<module>/` convention so it's a mechanical lift-and-shift into the Next.js `modules/` structure later, rather than a rewrite.

## Refactoring Decisions

- **`QuotationPage` split out of `App.tsx`** (originally one ~1000-line function inline in `App.tsx`): the notes/sub-details feature required enough new state and UI (notes editor, drag-reorder sub-details, print-only rendering, save/duplicate/send wiring) that keeping it inline would have made `App.tsx` unmanageable. Split into `lib/quotes.tsx` (data) + `pages/quotation/*` (5 components).
- **`DashboardPage` extracted to its own file and lazy-loaded**: the production build flagged a 709KB single-chunk warning, entirely due to `recharts` being bundled into the main chunk even though only the Dashboard page uses charts. Extracting it and wrapping all main pages in `React.lazy`/`Suspense` fixed this — `recharts` now only loads when a user actually opens the Dashboard.
- **`Quote.lines`/`Quote.discount` added to the `Quote` type**: originally, the quotation editor's line items lived in component-local state with no connection back to the `Quote` record being viewed — meaning Save/Duplicate did nothing and every quote showed the same hardcoded example lines. This was a genuine bug (see [CHANGELOG.md](./CHANGELOG.md), 2026-07-08 entry), fixed by making `lines`/`discount` real fields on `Quote` and threading Save/Duplicate/Send through them properly.
- **ESLint + `noUnusedLocals`/`noUnusedParameters` added**: the project had no lint tooling at all until the first full code-review pass; added the standard Vite React+TS flat-config setup rather than a custom ruleset.
