# Changelog

> Append-only. Never delete or rewrite previous entries — correct forward with a new entry instead.

---

## 2026-07-08 — Documentation system

**Feature**: Full project documentation under `/docs` (this system), plus a root `CLAUDE.md` pointer so Claude Code auto-loads project context at session start.

**Files Added**: `docs/CLAUDE.md`, `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md`, `docs/TODO.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/UI_GUIDELINES.md`, `docs/RBAC.md`, `docs/MODULES/{Dashboard,Quotation,Product,Lead,Customer,Auth,Settings}.md`, `CLAUDE.md` (root pointer)

**Files Modified**: none

**Files Removed**: none

**Reason**: So any future session (or person) can understand current project state without a re-explanation, per explicit request.

**Notes**: Documentation reflects actual current code, verified by reading the live source tree rather than working from memory. `Lead.md` and `Customer.md` are written as "not implemented" stubs — those modules don't exist in code yet, and the docs say so rather than inventing content.

---

## 2026-07-08 — Git init + push to GitHub

**Feature**: Initialized git repo, created `.gitignore`, made the initial commit, installed GitHub CLI, authenticated, created a private GitHub repo, and pushed.

**Files Added**: `.gitignore`

**Files Modified**: none

**Files Removed**: none

**Reason**: User requested the project be committed to their GitHub.

**Notes**: Repo: `https://github.com/Wisarutbuasumlee/tcs-erp` (private). Local git identity set locally (not globally) to the name/email the user provided. `gh auth login` required an interactive browser step the user completed themselves outside the assistant session (by design, to avoid any credential passing through conversation).

---

## 2026-07-08 — Quotation item notes, sub-details, PDF export, and full code review

**Feature**: Added per-line-item multi-line notes (with bullet/numbered-list toolbar) and unlimited, reorderable sub-details to quotation line items. Added print/PDF export (browser print, with a dedicated print-only rendering of notes/sub-details, indented and formatted). Performed a full project code review and fixed everything found.

**Files Added**: `src/lib/quotes.tsx`, `src/lib/salesTeam.ts`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,LineItemsEditor,InterestButtons,notesFormat}.tsx`, `src/pages/dashboard/DashboardPage.tsx`, `src/hooks/useToast.ts`, `src/components/Toast.tsx`, `eslint.config.js`

**Files Modified**: `src/App.tsx` (stripped down to the root shell + `React.lazy` page routing), `src/pages/products/ProductList.tsx` (lint fixes), `src/pages/SettingsPage.tsx` (typed icon list), `tsconfig.json` (`noUnusedLocals`/`noUnusedParameters` → `true`), `package.json` (added ESLint deps + `lint` script), `src/styles/index.css` (`@media print` page margin)

**Files Removed**: none (old inline `QuotationPage`/`DashboardPage` inside `App.tsx` were moved out, not deleted)

**Reason**: User requested the notes/sub-details feature for real business use (scope of work, warranty terms, install steps, etc. per line item), plus a mandatory full code review after implementation.

**Notes**:
- **Root-cause bug found and fixed**: `Quote` had no `lines` field at all — the quotation editor's line-item state was disconnected scratch space that was never actually saved back to the quote. Editing an existing quote's items and clicking "บันทึก" silently did nothing; every quote showed the same 3 hardcoded example lines regardless of which one you opened. Fixed by adding `lines`/`discount` to the `Quote` type and wiring Save/Duplicate/Send to actually persist.
- Wired the previously-inert toolbar buttons: **พิมพ์** (`window.print()`), **บันทึก** (create-or-update the quote), **คัดลอก** (clone with fresh line/sub-detail IDs, detail view only), **ส่งใบเสนอราคา** (save + bump draft→pending status).
- Client name field converted from uncontrolled (`defaultValue`) to controlled (`value`/`onChange`) so it actually saves. Other secondary fields (contact, phone, address, tax ID, PO ref, dates, payment terms) intentionally left as-is (cosmetic) — flagged in [PROJECT_STATUS.md](./PROJECT_STATUS.md) Technical Debt, not silently left broken.
- Fixed an operator-precedence bug in the product list's "sort by status" comparator (`Number(a.archived) - Number(b.archived) * dir` → parenthesized correctly).
- Enabled `noUnusedLocals`/`noUnusedParameters`, added ESLint (flat config, TS + react-hooks + react-refresh rules), fixed every finding (unused imports, `any` types replaced with real interfaces, unnecessary regex escapes, a missing `useMemo` dependency).
- Extracted `DashboardPage` out of `App.tsx` into its own module and lazy-loaded all four main pages — resolved a build-time "chunk larger than 500KB" warning by isolating `recharts` (~445KB) to a chunk that only loads when Dashboard is actually viewed.
- Verified everything end-to-end with a scripted Playwright pass (notes/bullets, sub-detail reorder, save, reopen-and-confirm-persisted, print preview, duplicate, create-new-quote-and-send) — zero console errors.

---

## 2026-07-08 — Product Management module

**Feature**: Full Product Library module — product + category CRUD, archive vs. permanent delete, duplicate, search/filter/sort/pagination, and a picker modal that lets Quotation line items snapshot a product's data.

**Files Added**: `src/lib/products.ts`, `src/pages/products/{ProductsPage,ProductList,ProductForm,CategoriesManager,ProductPickerModal}.tsx`, `src/components/ConfirmDialog.tsx`

**Files Modified**: `src/App.tsx` (added "คลังสินค้า" nav item + products/categories state, wired the picker into the Quotation line-items table)

**Files Removed**: none

**Reason**: User requested a Product Management module, explicitly separate from Quotation, with the rule that editing/archiving/deleting a product must never affect historical quotations.

**Notes**: Snapshot integrity holds because `QuoteLine` (at the time) stored plain primitive values with no reference back to a `Product` — picking a product just copies its name/unit/price into a new line item once. Verified via a scripted browser pass (create/duplicate/archive/delete-with-confirm/category CRUD/picker-into-quotation).

---

## 2026-07-08 — Sign in / Sign up / Settings

**Feature**: Full-screen Sign-in and Sign-up pages (navy/gold split layout, client-side validation, show/hide password, mock "forgot password"), a tabbed Settings page (Profile / Company Info / Security / Notifications), and a real auth gate wired into `App.tsx` (previously only scaffolded as unused files).

**Files Added**: `src/pages/{SignInPage,SignUpPage,AuthLayout,SettingsPage}.tsx`, `src/lib/storage.ts`

**Files Modified**: `src/App.tsx` (added `authed`/`authView`/`company`/`user` state, user dropdown menu with Settings/Log out, sidebar Settings entry, routing to Settings)

**Files Removed**: none

**Reason**: User requested sign-in/sign-up/settings; a first attempt had created the page files but never actually wired them into `App.tsx` (a real bug caught when the user reported "I can't find the sign-in page").

**Notes**: Company profile edited in Settings feeds live into the Quotation document header — verified via scripted flow (sign up → edit company address → open a quotation → confirm the new address appears).

---

## 2026-07-08 — Initial scaffold: Dashboard + Quotation (TCS ERP)

**Feature**: Initial project scaffold, ported and rebranded from a Figma Make prototype into a standalone Vite + React + TypeScript + Tailwind v4 app. Dashboard (KPIs, charts, leaderboard, orders, activity feed) and Quotation (list + printable document with line items, VAT) pages, trimmed to just those two modules, rebranded from placeholder "เน็กซัส ERP" to **TCS ERP / Thai Chemicals Storage**.

**Files Added**: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/{fonts,tailwind,theme,index}.css`

**Files Modified**: n/a (new project)

**Files Removed**: n/a (new project)

**Reason**: User wanted a real, runnable website built from a Figma Make design, scoped to Dashboard + Quotation only.

**Notes**: Design tokens (navy `#0b1d3a` / gold `#c9a84c`, Playfair Display / Inter / JetBrains Mono) ported verbatim from the Figma source; all sample data/company placeholders rebranded.
