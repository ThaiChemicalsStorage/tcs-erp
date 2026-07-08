# Session Log

> Append-only retrospective summary at the end of each work session. Distinct from [CHANGELOG.md](./CHANGELOG.md) (which logs individual changes as they happen) — this is a higher-level "what happened this session and what's next" note. Never delete previous entries.

---

## Session — 2026-07-08 (continued: master-prompt triage + PDF polish)

### What was implemented
- Discovered and triaged a large "master prompt" the user pasted directly into `docs/CLAUDE.md` — extracted its requirements into `TODO.md`, kept `CLAUDE.md` concise
- Asked the user to prioritize among the huge resulting backlog (Leads/Customers, RBAC, PDF polish, User Profile uploads, Company Settings expansion, Dashboard rework) rather than attempting all of it at once
- Built the chosen priority: **Quotation PDF polish** — company logo/stamp upload, real per-quote document fields (killed the last hardcoded-placeholder-text issue), auto-hide-empty-fields in print, salesperson bound to the real signed-in user, item tags, item specifications field

### Files Modified
`docs/CLAUDE.md`, `docs/TODO.md`, `src/lib/storage.ts`, `src/lib/quotes.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor}.tsx`, `src/App.tsx` — see [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Images (logo/stamp) stored as size-capped (1MB) base64 data URLs inside the existing `localStorage`-backed `Company` record — an explicit, documented interim choice given no object storage exists yet, not a silent hack.
- Kept quotation sub-details as a flat, reorderable list rather than building nested tree UI — the master prompt asked to "re-confirm" whether nesting was needed, and no concrete business case for it surfaced, so the simpler existing implementation was kept and the decision was documented rather than deferred indefinitely.
- Standing documentation instructions (the "master prompt") were deliberately NOT left inline in `docs/CLAUDE.md` — moved to `TODO.md` so the entry-point doc stays accurate as items ship, per `CLAUDE.md`'s own stated purpose.

### Problems Found
- Several `QuoteDocument.tsx` fields (contact person, phone, address, tax ID) were hardcoded example values shown regardless of which quote was open — effectively fake data masquerading as real, which the user's master prompt explicitly flagged as unacceptable for a PDF sent to a real customer.
- The "พนักงานขาย" (salesperson) field in the document view was a completely disconnected hardcoded input, not bound to `Quote.salesperson` at all, despite that field already existing on the `Quote` type and being used correctly elsewhere (the quote list).

### Problems Fixed
Both of the above — see [CHANGELOG.md](./CHANGELOG.md) 2026-07-08 "Quotation PDF polish" entry. Verified via scripted Playwright pass covering logo/stamp upload, print-media rendering, and empty-field auto-hiding on a fresh quote. Zero console errors; `tsc`/`eslint`/`build` all clean.

### New TODO Items
Signature **image** upload (name is wired, image is not), bank account info, configurable VAT rate, company-level default Terms & Conditions — all added to `TODO.md` under their respective sections.

### Future Recommendations
1. The remaining backlog buckets (Leads/Customers, RBAC, User Profile uploads, Dashboard rework) are all still open — next session should re-run the same prioritization conversation rather than assuming an order.
2. Signature image upload and Dashboard KPI rework are both explicitly blocked on other work (file storage / Phase 2 backend, and the Lead & Customer module, respectively) — don't attempt them in isolation.
3. The `ImageUploadField` pattern built for company logo/stamp (`SettingsPage.tsx`) is directly reusable for the future User Profile picture/signature upload — no need to design a second pattern.

### Estimated Completion Percentage
~19% of the full long-term ERP vision (small increment — this was a document-quality/correctness pass on an existing module, not new module coverage); ~92% of the currently-scoped Phase 1 frontend-only modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08

### What was implemented
- Initial Vite + React + TS + Tailwind v4 scaffold, ported/rebranded from a Figma Make design to **TCS ERP**
- Dashboard module (KPIs, charts, sales leaderboard, orders, activity feed)
- Quotation module: list, create/edit/duplicate, VAT + discount totals, print
- Sign in / Sign up / Settings, wired into a real (client-only) auth gate
- Product Library module: CRUD, categories, archive/delete, duplicate, search/filter/sort/pagination
- Quotation ↔ Product Library picker integration
- Quotation item **notes** (bullet/numbered toolbar) + unlimited, drag-reorderable **sub-details**
- **PDF/print export** with dedicated indented formatting for notes/sub-details
- Full code review pass: ESLint added, strict unused-code checks enabled, all findings fixed, bundle-size warning resolved via code-splitting
- Git repository initialized and pushed to GitHub (`Wisarutbuasumlee/tcs-erp`, private)
- This documentation system

### Files Modified
See per-entry detail in [CHANGELOG.md](./CHANGELOG.md) — too many across the session to usefully summarize here without duplicating it. High-level: everything under `src/` was either created or touched at least once; `App.tsx` went from a ~1000-line monolith to a ~200-line shell as modules were extracted.

### Architectural Decisions
- No router — a single `activeNav` string switch in `App.tsx` (documented, with the tradeoff, in [ARCHITECTURE.md](./ARCHITECTURE.md))
- No component library — hand-built Tailwind, matching the ported Figma design system exactly
- One `lib/<domain>.ts` + `pages/<module>/` per data domain, established as the repo convention
- `React.lazy` + `Suspense` per top-level page, specifically to isolate `recharts` to the Dashboard chunk
- Client-only for now; a full Next.js/Prisma/Postgres/RBAC Phase 2 was *designed* but deliberately *not started*, pending a user decision (see [ARCHITECTURE.md](./ARCHITECTURE.md), [RBAC.md](./RBAC.md))

### Problems Found
- **Quotation Save/Duplicate/Send were completely non-functional** — `Quote` had no `lines` field, so the editor's line-item state was never connected to the record being viewed. Every quote showed the same 3 hardcoded example lines regardless of which was opened.
- Sign-in/Settings pages existed as files but were never wired into `App.tsx` in an earlier attempt (caught when the user reported "I can't find the sign-in page")
- Operator-precedence bug in the product list's status-column sort comparator
- No lint tooling existed at all prior to this session's code-review pass
- 709KB single JS chunk (bundle-size warning) due to `recharts` being bundled into the main chunk unconditionally

### Problems Fixed
All of the above — see [CHANGELOG.md](./CHANGELOG.md) for the detailed per-fix writeup. Verified via `tsc --noEmit`, `eslint .`, `npm run build`, and multiple scripted Playwright passes (zero console errors) covering: full quotation lifecycle including notes/sub-details, product CRUD, settings, auth flow.

### New TODO Items
See [TODO.md](./TODO.md) — highlights: decide on Phase 2 backend migration, persist `Quote[]` to `localStorage`, build Lead & Customer Management.

### Future Recommendations
1. Don't build further client-side modules (Lead/Customer/etc.) on the current no-persistence-for-quotes foundation without first fixing quote persistence — it'll compound the same class of bug.
2. The Phase 2 backend decision is the single highest-leverage next step — most other "future improvements" across every module doc are blocked or made redundant by it (real persistence, real auth, real RBAC, real multi-user).
3. Keep following the `lib/<domain>.ts` + `pages/<module>/` convention for anything new — it made the Quotation/Dashboard extraction refactors mechanical rather than risky, and it's the same shape the proposed Next.js `modules/` structure expects.

### Estimated Completion Percentage
~18% of the full long-term ERP vision; ~90% of the currently-scoped Phase 1 frontend-only modules (Dashboard, Quotation, Product, Auth, Settings). See [PROJECT_STATUS.md](./PROJECT_STATUS.md).
