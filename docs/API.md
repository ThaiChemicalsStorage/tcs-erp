# API

## Current State: No Backend, No HTTP API

This project has **no server, no HTTP endpoints, and no network requests of any kind**. Every "operation" is a synchronous JavaScript function call within the browser, reading/writing React state and (for some domains) `localStorage`. There is no request/response cycle, no validation layer beyond in-component form checks, and no authentication token of any kind.

The tables below document the current **client-side operation surface** — the functions that stand in for what would be API endpoints in a real backend — so the eventual real API can be designed to match the same operations.

### Auth (`src/lib/storage.ts`, invoked from `App.tsx`)

| Operation | Function | Request | Response | Validation | Auth | Notes |
|---|---|---|---|---|---|---|
| Sign in | `handleSignIn(email)` in `App.tsx` | `email: string` | sets `authed = true`, persists `tcs_erp_auth` | Sign-in form requires non-empty email + password client-side | none | **Password is never checked against anything.** Any input succeeds. |
| Sign up | `handleSignUp(name, email)` in `App.tsx` | `name, email: string` | sets `authed = true`, updates `UserProfile` | Sign-up form requires all fields, password ≥ 6 chars, passwords match, terms checkbox | none | Same — no real credential storage. |
| Log out | `handleLogout()` in `App.tsx` | — | clears `authed`, `tcs_erp_auth` | — | — | |
| Load/save auth flag | `loadAuthed()` / `saveAuthed(bool)` | — | boolean | — | — | |

### Company / User (`src/lib/storage.ts`)

| Operation | Function | Notes |
|---|---|---|
| Load company | `loadCompany()` | Falls back to `defaultCompany` if nothing stored or parse fails |
| Save company | `saveCompany(company)` | Called from Settings → Company tab |
| Load user | `loadUser()` | Falls back to `defaultUser` |
| Save user | `saveUser(user)` | Called from Settings → Profile tab |

### Products (`src/lib/products.ts`)

| Operation | Function | Notes |
|---|---|---|
| Load products | `loadProducts()` | Falls back to `defaultProducts` seed data |
| Save products | `saveProducts(products)` | Full-array overwrite, called after every create/edit/archive/delete/duplicate |
| Load categories | `loadCategories()` | Falls back to `defaultCategories` |
| Save categories | `saveCategories(categories)` | Full-array overwrite |

Product CRUD itself happens in `src/pages/products/ProductsPage.tsx` (`handleCreate`, `handleUpdate`, `handleArchiveToggle`, `handleDelete`, `handleDuplicate`) — these mutate the in-memory array and call `onProductsChange`, which is wired to `saveProducts` in `App.tsx`. No dedicated "API function" per operation; it's direct state manipulation.

### Quotations (`src/lib/quotes.tsx`, orchestrated from `src/pages/quotation/QuotationPage.tsx`)

| Operation | Where | Notes |
|---|---|---|
| List/filter quotes | `QuoteList.tsx` | Client-side filter over in-memory `quotes` array |
| Create quote | `handleSave` in `QuotationPage.tsx`, `mode === "new"` | Generates ID via `nextQuoteId(quotes)`, prepends to array. **Not persisted to `localStorage`** — lost on reload. |
| Update quote | `handleSave` in `QuotationPage.tsx`, `mode === "detail"` | Merges `{ client, status, lines, discount, amount }` into the matching quote |
| Duplicate quote | `handleDuplicate` in `QuotationPage.tsx` | Clones with a fresh ID via `nextQuoteId`, fresh line/sub-detail IDs via `cloneLines()`, status forced to `"ร่าง"` |
| Change interest flag | `setInterest` in `QuotationPage.tsx` | Updates `Quote.interest` in place |
| Send | "ส่งใบเสนอราคา" button in `QuoteDocument.tsx` | Same as Save, plus bumps status `"ร่าง" → "รออนุมัติ"` if currently draft |
| Print / PDF export | "พิมพ์ / PDF" button in `QuoteDocument.tsx` | Calls `window.print()`; no server-side PDF generation |

No dedicated validation layer — the only checks are: required fields with inline error text on Sign in/Sign up/Product form, and numeric clamps (`min`/`max`) on quantity/price/discount inputs.

## Authentication

None. See Auth table above — there is no session token, no cookie, no header, nothing that would need to be sent with a "request" because there are no requests.

## Permission

None — every operation above is available to whoever has the app open and has clicked past the (fake) sign-in screen. See [RBAC.md](./RBAC.md).

## Errors

No error-handling layer exists because there's no network boundary to fail. Form validation shows inline red text (`text-[#e05252]`) next to the relevant field; there's no toast-based error reporting (only success toasts, via `components/Toast.tsx`).

## Future APIs (proposed, not implemented)

If/when the Phase 2 Next.js migration happens (see [ARCHITECTURE.md](./ARCHITECTURE.md)), the plan is:

- **Auth.js route handler** at `app/api/auth/[...nextauth]/route.ts` (Credentials provider, bcrypt password check, database sessions).
- **Server Actions**, not a REST/JSON API, for most mutations — e.g. `modules/admin/actions/createUser.ts`, each starting with a `requirePermission(permission)` guard, validating input with Zod, writing an `AuditLog` row, then `revalidatePath`.
- **Server Components / `queries/*.ts`** for reads — e.g. `modules/admin/queries/listUsers.ts` — direct Prisma calls in the Node runtime, not a client-fetched JSON endpoint.
- A coarse **`middleware.ts`** doing only "is there a session" checks (edge-safe, no Prisma at the edge); fine-grained permission checks happen in the page/action itself.

None of this exists in the repo today. Do not write code against it.
