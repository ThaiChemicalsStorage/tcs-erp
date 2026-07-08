# Module: Dashboard

## Purpose

Executive overview page — the landing view after sign-in. Gives a at-a-glance read on revenue, orders, inventory value, headcount, sales team performance, and recent activity. **All data is static sample data**, not derived from real business records (the Quotation module's data isn't even fully reflected here beyond the "interest" summary).

## Business Flow

1. User signs in → lands on Dashboard by default (`activeNav` initial state in `App.tsx`).
2. User can toggle the revenue chart between "รายได้" (revenue) and "ค่าใช้จ่าย" (expenses) tabs.
3. Hovering a sales-team member in the donut chart or leaderboard highlights their slice.
4. "ส่งออกรายงาน" (export report) and "+ สร้างคำสั่งซื้อ" (create order) buttons are **inert** — no Reports or Orders module exists to back them (intentional, see [PROJECT_STATUS.md](../PROJECT_STATUS.md)).
5. "ดูทั้งหมด" (view all, next to recent orders) is also inert for the same reason.

## Pages

- `src/pages/dashboard/DashboardPage.tsx` (434 lines) — the entire module is one page, lazy-loaded from `App.tsx`.

## Components

All internal to `DashboardPage.tsx` (not shared elsewhere except `CustomTooltip`/`SalesTooltip` which are Dashboard-local recharts tooltip renderers):
- KPI cards grid (4 cards: total revenue, active orders, inventory value, headcount)
- Revenue vs. expenses `AreaChart` (recharts)
- Category breakdown donut (`PieChart`)
- Sales-team closed-deals donut + leaderboard table
- Quotation interest summary (reads real `quotes` prop for น่าสนใจ/ไม่น่าสนใจ/ยังไม่ประเมิน counts)
- Recent orders table (static sample data, `dashboardOrders`)
- Activity feed (static sample data, `dashboardActivities`)

## Database Tables

None — see [DATABASE.md](../DATABASE.md). All chart/table data (`revenueData`, `categoryData`, `dashboardOrders`, `dashboardActivities`, `kpis`) is hardcoded in `DashboardPage.tsx`. `salesTeam` is imported from `src/lib/salesTeam.ts` (shared with Quotation's salesperson-avatar lookups).

## APIs

None — see [API.md](../API.md).

## Permissions

None — see [RBAC.md](../RBAC.md). Every signed-in user sees the identical Dashboard.

## Current Features

- KPI cards with up/down trend indicators
- Revenue/expenses area chart with tab toggle
- Category donut chart
- Sales team performance donut + sortable-by-rank leaderboard table with team totals footer
- Live quotation-interest breakdown (only real-data section on this page)
- Recent orders table, activity feed

## Future Improvements

- Replace all static sample data with real aggregates once Orders/Accounting/Inventory modules exist
- Wire "ส่งออกรายงาน"/"+ สร้างคำสั่งซื้อ"/"ดูทั้งหมด" once their target modules exist
- Add the date-range filter system described in the original ERP spec (Today/Yesterday/Last 7 days/.../Custom) — not built at all currently, every metric is hardcoded to "ธ.ค. 2567"
- Once RBAC exists, scope KPIs/widgets per role (Manager sees team data, Sales sees own performance, Accounting sees financials only) per the original spec

## Known Issues

- None functional — this page is internally consistent, just entirely static/sample data by design at this stage.
