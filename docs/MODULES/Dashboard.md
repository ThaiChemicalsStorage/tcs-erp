# Module: Dashboard

## Purpose

Executive overview page — the landing view after sign-in. Gives an at-a-glance read on quotations, products, revenue, won/lost deals, and (once the CRM module ships) customers/leads. **As of 2026-07-09, every number on this page comes from a real MongoDB query** (`GET /api/dashboard`) — no hardcoded/sample data remains. Previously (pre-2026-07-09) this page was 100% static sample data; that version is fully replaced, not just patched.

## Business Flow

1. User signs in → lands on Dashboard by default (`activeNav` initial state in `App.tsx`).
2. On mount, `DashboardPage` calls `fetchDashboardStats()` (`src/lib/dashboard.ts`) and shows a loading skeleton until it resolves.
3. If both `totalQuotations` and `totalProducts` are `0` (a genuinely empty database — the common state right after Setup Wizard, since no demo data is ever seeded), the page shows a single empty state ("No business data available yet." / Thai equivalent, via `src/lib/i18n.tsx`) instead of a wall of zeros.
4. Otherwise: 7 KPI cards, a monthly revenue chart (last 12 months, zero-filled), a products-by-category donut, and the quotation-interest summary (reads the real `quotes` prop, unchanged from before).
5. The previous revenue/expenses tab toggle, sales-team leaderboard, recent-orders table, activity feed, and their two dead buttons ("ส่งออกรายงาน"/"+ สร้างคำสั่งซื้อ") were **removed outright**, not empty-stated — none of them had a real backing collection (no Orders/Reports/Activity module exists), and inventing an empty-state UI for a section with no underlying data model would just be a different form of placeholder debt.

## Pages

- `src/pages/dashboard/DashboardPage.tsx` — lazy-loaded from `App.tsx`. Fetches its own data (`useEffect` + `fetchDashboardStats()`) rather than receiving it as a prop from `App.tsx`'s boot sequence, since Dashboard is the only page that needs this aggregate.

## Components

All internal to `DashboardPage.tsx`:
- `KpiCard` — one per KPI, reused 7×
- `DashboardSkeleton` — loading state (pulse-bar placeholders, matches the pattern already used by `App.tsx`'s `PageLoading`)
- `EmptyState` — shown when there's no real business data yet
- Monthly revenue `AreaChart` (recharts) — single series (no "expenses" toggle anymore; there was never a real expenses data source)
- Products-by-category `PieChart` (recharts) — has its own inline empty state if there are zero categorized products
- Quotation interest summary (unchanged, reads the real `quotes` prop for น่าสนใจ/ไม่น่าสนใจ/ยังไม่ประเมิน counts)

## Database Tables

None owned by this page — it's a read-only aggregation over `customers`, `leads`, `quotes`, `products`, `categories`. See [DATABASE.md](../DATABASE.md) "Dashboard KPI/chart aggregation" section for the exact query/pipeline behind each number.

## APIs

- `GET /api/dashboard` (`api/dashboard/index.ts`, added 2026-07-09) — gated by `dashboard:view`. See [API.md](../API.md).

## Permissions

`dashboard:view`, enforced both by the sidebar nav item (unchanged) and now also server-side by the endpoint itself.

## Current Features

- 7 real KPI cards: Total Customers, Total Leads, Total Quotations, Total Products, Revenue (won deals), Won Deals, Lost Deals
- Real monthly revenue area chart, 12 months, zero-filled when there's no data — never renders blank
- Real products-by-category donut, with its own empty state
- Live quotation-interest breakdown (unchanged from before this pass)
- Full empty-state page when there's no quotation or product data yet
- Thai/English via `useI18n()` — all dashboard-specific copy is in the translation dictionary

## Future Improvements

- `totalCustomers`/`totalLeads` will start returning real non-zero numbers once the CRM module (schema already prepped, see [Customer.md](./Customer.md)/[Lead.md](./Lead.md)) gets API routes + UI — no Dashboard code changes needed when that happens, the query is already correct.
- Once RBAC scoping is desired, KPIs/widgets could be scoped per role (Manager sees team data, Sales sees own performance) per the original long-term spec — not built, no requirement for it yet.
- Revenue-by-category (as opposed to the current products-by-category) would need `QuoteLine` to carry a real `categoryId` reference back to `Product` — deliberately not built this pass, see [DATABASE.md](../DATABASE.md) Relationships section for why that reference doesn't exist today.

## Known Issues

- None functional. `totalCustomers`/`totalLeads` will correctly read `0` until the CRM module ships — this is the intended "empty database → display 0" behavior, not a bug.
