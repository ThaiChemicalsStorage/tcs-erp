# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Internal staff of TCS (Thai Chemicals Storage), a single chemical storage/distribution company — not a multi-tenant SaaS product. Confirmed primary roles, all in daily use (superseding the earlier broader four-group description):

- **Sales** — the primary day-to-day users: preparing Quotations, managing Customers and the Product Library, working Scope of Work/Delivery Order documents downstream of their own quotations.
- **Sales Managers** — Quotation approval workflow, sales dashboards, team oversight.
- **Technical staff** — Scope of Work content, technical line items/specs, delivery fulfillment detail.
- **Admins** — User Management, Role Management, Company settings, Quotation Template management, day-to-day data administration (customers/products/job types).
- **Managers** — Dashboard/reporting, approvals, cross-team oversight.
- **CEO** — Executive Dashboard, top-level approvals, company-wide visibility.

Many internal users are **first-time computer-system users** for a tool like this — the interface must be learnable without training, not just usable by power users.

## Product Purpose

An ERP built incrementally for TCS's own internal operations, not a generic off-the-shelf product. Started with Quotation management and a Product Library; now also covers RBAC/user management, a multi-step quotation approval workflow, notifications, an audit log, Customers, Scope of Work, and Delivery Order. Long-term charter (not yet started): Leads, HR, Accounting, Inventory, Warehouse, Purchasing, Project Management. Success = TCS's real paper-based document/approval process (quotation → scope of work → delivery order) fully digitized and server-enforced, replacing manual/ad-hoc handling.

## Positioning

Purpose-built around TCS's actual document and approval chain (Quotation → Scope of Work → Delivery Order, each an independent, server-validated snapshot of the one before it) and its real organizational approval hierarchy — not a configurable generic ERP. A neighboring off-the-shelf ERP/SaaS could not truthfully copy this without reproducing TCS's specific workflow, document formats (matching TCS's actual reference PDFs), and RBAC model.

## Operating Context

- **Desktop/laptop only** — confirmed; office-based use, not a real mobile/tablet usage scenario.
- Thai-language UI throughout by default, with a full English alternative (toggle in Settings → Profile). Printed/PDF customer-facing documents (Quotation, Scope of Work, Delivery Order) always render in Thai regardless of the preparer's own UI language setting.
- Documents mirror real reference paper forms already in use at TCS (see Evidence on Hand) — printed output is visually verified against those references, not designed from scratch.
- Real backend: standalone Node.js/Express server + self-hosted MongoDB on the company's own VPS (https://www.huma-erp.com/); RBAC is enforced server-side, not just in the UI.

## Capabilities and Constraints

- RBAC: granular per-module permissions (`quotations:*`, `scopeOfWork:*`, `deliveryOrder:*`, etc.), enforced server-side via `requirePermission()` on every mutating route — not bypassable via devtools.
- Generated documents are snapshots, never live references: a Scope of Work generated from a Quotation, and a Delivery Order generated from a Scope of Work, each freeze their own data at creation time and require an explicit re-pull to refresh.
- Numbering/document IDs are atomic and server-assigned; revisions use a `-R{n}` chain.
- Production runs on a self-hosted VPS (live since ~2026-08-07); the app has no hosting-platform dependency — new work must stay portable (plain Node + MongoDB, no vendor-locked services).
- Current MongoDB data is demo/disposable and will be wiped before go-live via a fresh Setup Wizard run — no need to preserve or migrate it. This does not license adding new fake/demo business data during design or UI work — never introduce fabricated customers, quotations, or figures into the running app or its screenshots.
- No established accessibility requirement today (internal tool; no specific standard or user need has come up).
- **Standing constraint for any future work unless explicitly requested otherwise**: do not change business logic, quotation calculations, workflow/approval rules, document status workflows, validation rules, quotation/Scope of Work numbering, or RBAC/permission logic. Dashboard monetary values are always shown pre-tax (before VAT) — never switch a Dashboard figure to VAT-inclusive without an explicit, loudly-labeled exception (see Dashboard's Pre-Tax Amount Rule in `docs/MODULES/Dashboard.md`). **Expected Sales must continue to include only records where `potentialOpportunity = true`** — this predicate must not be broadened/narrowed as a side effect of unrelated Dashboard work. Existing Thai terminology (module names, status labels, field labels) must be preserved as-is — don't retranslate or rename established terms as a side effect of unrelated work. Formal PDF/print documents (Quotation, Scope of Work, Delivery Order) are not to be redesigned unless a task explicitly targets them, must never gain browser/app-chrome UI styling, and must never have customer/quotation/item/milestone/date/signature/Work Order values hardcoded — see DESIGN.md's Do's and Don'ts.
- **Database/API standing constraint**: MongoDB is the source of truth. Do not modify schemas, indexes, migrations, queries, or API request/response contracts unless the task explicitly requires it. Preserve existing records and backward compatibility — an empty database must still render its real empty state, not a seeded/mocked one.
- **RBAC/security standing constraint**: do not modify roles or permissions unless explicitly requested, and never weaken server-side authentication/authorization/validation. UI-level visibility (hiding a button, greying out a field) is never a substitute for the server-side permission check — see RBAC.md. Never expose internal costs, secrets, private notes, or any data the current user isn't authorized to see, in the UI or in exported data (CSV/XLSX).

## Brand Commitments

- Navy (`#0b1d3a`) + gold (`#c9a84c`) as the core palette.
- Typography: Playfair Display (headings), Inter (body), JetBrains Mono (numbers/codes).
- Real logo asset at `public/logo.png`, rendered via the shared `BrandMark.tsx` component.
- Thai-first language throughout, with English as a secondary, user-toggled option.

## Evidence on Hand

- `public/logo.png` — real company logo.
- `public/Scope of work new template for air pollution control_Technic.xlsx` — real source template the Scope of Work document format is built from.
- `reference/company/Scope Of Work PQ202607-174-LI-SK บริษัท เค ไทย ไฮดรอลิค จำกัด.pdf` and `reference/company/ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM บริษัท อีจ.pdf` — real reference PDFs that the Scope of Work and Delivery Order print layouts are visually verified against. **Moved out of `public/` in commit c2f91b5** ("Move real customer/company documents out of public/ — data-exposure fix"): everything under `public/` is served with no authentication, and these carry real customer names and amounts. Never put a document like this back under `public/`.
- `public/manual.html` — the real user manual, and the only one (served at `/manual.html`, opened from the topbar's gold "คู่มือการใช้งาน" button). It replaced `public/คู่มือการใช้งาน TCS ERP.pdf`, which the same c2f91b5 fix moved to `reference/company/คู่มือการใช้งาน TCS ERP.pdf` (still on disk there, gitignored — removed from `public/` and from git, not destroyed), and `docs/manual/user-manual.html`, deleted 2026-08-21. Render a PDF of it — outside `public/` — with `docs/manual/generate-pdf.mjs`.
- No fabricated testimonials, customer names, pricing, or benchmarks exist in the product and none should be invented; any customer/company data shown in the running app today is disposable demo data (see Capabilities and Constraints), not evidence of real customers to reference in design work.

## Product Principles

1. **Server is the source of truth.** RBAC and business rules (amounts, numbering, workflow transitions) are enforced server-side; the client is never trusted, and UI should not imply otherwise.
2. **Documents are snapshots, not live references.** Each generated document in the Quotation → Scope of Work → Delivery Order chain freezes its own data; design should make an explicit "refresh from source" action visible rather than implying automatic sync.
3. **Thai-first, English-available.** Thai is the default and the language of all customer-facing printed output regardless of the preparer's own UI language.
4. **Ship one module at a time on a shared foundation.** New modules (Leads, HR, Accounting, etc.) extend the existing auth/RBAC/notifications/audit-log foundation rather than being designed as standalone systems.
5. **Desktop-first internal tool.** Optimized for office desktop/laptop use; mobile/tablet is not a target usage scene today.

## Accessibility & Inclusion

No established accessibility requirement today. Internal tool; no specific standard (e.g. WCAG level) or known user need has been raised.
