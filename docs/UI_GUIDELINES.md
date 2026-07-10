# UI Guidelines

The design system is navy + gold, editorial/professional in tone, entirely hand-built with Tailwind v4 utility classes — **no component library** (no shadcn, Radix, MUI). Match these patterns exactly when building new pages; don't invent new visual language.

## Design Tokens (`src/styles/theme.css`)

CSS custom properties, exposed to Tailwind via `@theme inline` (so `bg-background`, `text-foreground`, etc. work directly as utility classes):

| Token | Value | Use |
|---|---|---|
| `--background` | `#f4f6fb` | Page background |
| `--foreground` | `#0b1d3a` (navy) | Primary text |
| `--card` | `#ffffff` | Card/panel background |
| `--primary` | `#c9a84c` (gold) | Primary actions, active states |
| `--secondary` | `#e8edf7` | Secondary surfaces (input backgrounds) |
| `--muted` | `#eef1f8` | Muted backgrounds (tab bars, table header rows) |
| `--muted-foreground` | `#5a7299` | Secondary text |
| `--destructive` | `#e05252` | Danger actions, error text |
| `--border` | `rgba(11,29,58,0.1)` | Borders |
| `--sidebar` | `#0b1d3a` (navy) | Sidebar background |
| `--sidebar-foreground` | `#a8bed8` | Sidebar text |
| `--sidebar-accent` | `#132540` | Sidebar hover |
| `--chart-1..5` | gold, blue, green, red, purple | Chart series colors |
| `--radius` | `0.5rem` | Base border radius (`--radius-sm/md/lg/xl` derived) |

Beyond the tokens, many components also use raw hex literals directly (`#c9a84c`, `#0b1d3a`, `#f0c040` hover-gold, `#2aa36b` success-green, `#e05252` danger-red, `#1a5fb4` info-blue, `#7c4dbb` purple, `#a8bed8`/`#5a7299` muted-on-navy) — this is existing convention, not a bug; match it rather than introducing new ad hoc colors.

### Typography

- **Headings**: `'Playfair Display', serif` via inline `style={{ fontFamily: ... }}` — used for page titles (`h1`, `text-2xl font-semibold`), card/section titles (`text-base font-semibold`).
- **Body**: Inter (set globally on `body` in `src/styles/index.css`).
- **Numbers, codes, IDs, dates**: JetBrains Mono via `font-mono` utility — quotation numbers, currency amounts, dates, product codes all use this.
- Base font size `15px` (`--font-size` on `html`).

### Icons

`lucide-react` exclusively. Sizes used throughout: `size={17}` sidebar nav icons, `size={13}`–`15` inline action icons, `size={10}`–`12` tiny badge/status icons.

## Component Patterns

### Sidebar
Fixed-width (`w-64` expanded / `w-16` collapsed) navy (`bg-sidebar`) column. Logo + brand name + Thai subtitle at top via `components/BrandMark.tsx` (see Brand Mark below) — collapses to icon-only, centered, when the sidebar collapses. Nav items: icon + label, active state = `bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/25`, inactive hover = `hover:bg-sidebar-accent hover:text-white`. Settings pinned at the bottom, same active-state pattern.

**Grouped nav (added 2026-07-10, UI/UX pass)**: `App.tsx`'s `NAV_GROUPS` is a pure display grouping over the same flat `navItems`/`NavKey` list — not a new data model or a router. Each group renders a small uppercase label (`text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50`, hidden when the sidebar is collapsed) above its items; a group is skipped entirely if none of its items survive the existing permission filter. Only reflects modules that actually exist today (Main/Sales/Inventory/Administration) — don't add a "Leads"/"Customers"/"Approvals" group until those get real pages, or the grouping becomes misleading.

### Brand Mark (`src/components/BrandMark.tsx`, added 2026-07-09)
The single source of truth for the app's logo — always use this instead of a new inline `<img>`/placeholder block. Props: `size` (px height, width auto, aspect ratio always preserved — never stretch), `variant` (`"mark"` = logo only, `"full"` = logo + "Thai Chemicals Storage ERP" wordmark + "ระบบองค์กร" Thai subtitle), `theme` (`"dark"` for navy panels, `"light"` for card/print backgrounds). The underlying image is `public/logo.png` (the official logo, root-absolute so it also serves as the favicon with zero duplication). Current call sites: sidebar header, login page (desktop + mobile), the quote/print document header fallback (only when no `company.logoDataUrl` is uploaded — that's a separate, admin-configurable company letterhead concept), and the boot/loading screen.

### Topbar
`bg-card border-b border-border`, sidebar collapse toggle, breadcrumb (`องค์กร > {activeNav}` in Playfair gold), search input (currently decorative), notification bell (see Notification Bell below), user avatar dropdown (initials circle or uploaded picture, name/role, dropdown with Settings/Log out).

### Notification Bell & Panel (`src/components/NotificationBell.tsx`)
Bell icon with **no badge at 0 unread** — don't render a "0" badge, that's the one explicit anti-pattern here. When unread > 0: a small red (`bg-[#e05252]`) circular badge, top-right of the bell, showing the count or `"99+"` above 99. Click opens a dropdown panel (`absolute right-0 top-full mt-2`, `w-96`, same card/border/shadow-xl treatment as the user-menu dropdown) with a header (title + "อ่านทั้งหมด" mark-all-read), a scrollable list (`max-h-[28rem] overflow-y-auto`), and per-row: icon in a tinted square, title, description (`line-clamp-2`), module + relative-time metadata, and a hover-reveal delete icon. Unread rows get a subtle gold tint (`bg-[#c9a84c]/[0.06]`) and a small gold dot next to the title — the same "unread" visual language used for sidebar/notification badges elsewhere. Reuse this component for any future notification-style feed rather than building a second dropdown pattern.

### Cards
`bg-card border border-border rounded-xl`, padding `p-4`–`p-6` depending on density. Hover state on interactive cards: `hover:border-[#c9a84c]/30 transition-all`.

### Forms / Inputs
```
bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors
```
Labels: `text-[10px]` or `text-xs text-muted-foreground block mb-1`/`mb-1.5`. Error text: `text-xs text-[#e05252] mt-1`. In-table editable cells use transparent-background inline inputs (`bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5`) instead of full bordered inputs — see quotation line-items table.

### Tables
Header row: `bg-muted/40` (or `/20`, `/30`), cells `text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider`. Body rows: `border-b border-border/50 hover:bg-secondary/30 transition-colors`. Sortable columns (Product list) show a chevron icon next to the active sort column, click toggles asc/desc.

### Buttons
- **Primary**: `bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040]`
- **Secondary/outline**: `border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40`
- **Danger**: `bg-[#e05252] text-white hover:bg-[#c94444]` (used in `ConfirmDialog`'s destructive confirm)
- **Icon-only row actions**: `text-muted-foreground hover:text-[#c9a84c]` (or `hover:text-[#e05252]` for delete), often `opacity-0 group-hover:opacity-100` so they only appear on row hover.

### Dialogs
Use `src/components/ConfirmDialog.tsx` for any destructive confirmation — don't build a one-off. Pattern: fixed inset overlay (`bg-[#0b1d3a]/40`), centered card (`max-w-sm`), icon + title + message, Cancel (outline) + Confirm (primary or danger via `danger` prop) buttons.

For an action that needs a **free-text comment** attached (not just a yes/no confirm) — e.g. the quotation workflow's reject/cancel/approve actions — `QuoteDocument.tsx`'s inline comment modal is the pattern to copy: same overlay/card treatment as `ConfirmDialog`, a `<textarea>` for the comment (label indicates "(จำเป็น)" required or "(ไม่บังคับ)" optional depending on the action), inline error text if required-and-empty, Cancel (outline) + Confirm (danger-red for destructive actions like reject/cancel, gold for everything else) buttons.

### Permission-Locked Form Fields
When a field/button should only be interactive for users with the right permission, don't just leave it enabled and rely on the save handler to reject the change — set `disabled={!canEdit}` directly on the input (Tailwind `disabled:opacity-60` / `disabled:cursor-not-allowed`), and omit the button entirely (not `disabled`) if the action itself shouldn't be attempted — see the sidebar (items are filtered out of the array, not rendered-and-disabled) and `QuoteDocument.tsx`'s workflow action buttons (each one is conditionally rendered based on `QuotePermissions`, not shown-but-greyed). Remember this is client-side display logic only, not enforcement — see [RBAC.md](./RBAC.md).

### Spacing
Page containers: `p-6 space-y-5`/`space-y-6`. Card internal padding: `p-4`–`p-6`. Grid gaps: `gap-4`. Consistent `rounded-xl` on cards/panels, `rounded-lg` on buttons/inputs, `rounded-full` on pills/badges/avatars.

### Loading States
`App.tsx`'s `PageLoading` component: 4 stacked `h-16 rounded-xl bg-muted animate-pulse` blocks, shown via `<Suspense fallback={<PageLoading />}>` while a lazy-loaded page chunk downloads.

### Empty States
`src/components/EmptyState.tsx` (added 2026-07-10, UI/UX pass — consolidates what used to be copy-pasted markup in `ProductList.tsx`/`QuoteList.tsx`/`DashboardPage.tsx`): icon in a muted rounded square, title, one-line explanation, and — where there's a real next step — an action button (`actionLabel`/`onAction`). Use this instead of hand-rolling a new empty-state block; pass `compact` when it sits inside an already-boxed table/card area rather than filling a whole page. A plain "No data" with nothing else tells the user nothing about what to do next — always pair the message with an explanation and, if applicable, a way forward.

### Page Headers
`src/components/PageHeader.tsx` (added 2026-07-10): title + one-line plain-language description of what the page is for (not a restatement of the title), plus an optional `actions` slot for primary buttons and an optional `path` string for a static orientation cue (e.g. "การขาย / ใบเสนอราคา") — this app has no URL router, so `path` is not a clickable breadcrumb, just a "where am I" hint. Reuse this for any page header instead of hand-rolling the `<h1>`/description markup.

### Metric Info Tooltips
`src/components/MetricInfoTooltip.tsx` (added 2026-07-10): a small (i) icon next to a KPI/column label whose meaning isn't obvious to a non-technical user — click-to-toggle (not hover-only, so it works the same on touch and via keyboard), shows a short navy popover with a one-sentence, business-language explanation. Used on the Dashboard's Expected Sales/Win Rate/Active Jobs/Non-Active Jobs/Average Deal Size/Average Closing Time/Pending Approvals cards. Add one anywhere else a metric's exact definition matters and isn't self-evident from its name — don't write a paragraph, one sentence is the target length.

### Guided Tour
`src/components/GuidedTour.tsx` (`useGuidedTour()` hook, added 2026-07-10) wraps `driver.js` (chosen over React Joyride — no React-specific tour-state machine was needed for a straightforward "point at real elements, explain them" walkthrough, so the smaller, framework-agnostic dependency was preferred). Steps are defined once in the hook as `element: '[data-tour="..."]', popover: {...}` pairs; **to add a new step**, add both a new entry to the `steps` array in `GuidedTour.tsx` and the matching `data-tour="..."` attribute on the real target element, then add the two new `onboarding.step.<name>.title`/`.desc` dictionary keys (Thai + English). `start()` filters out any step whose target isn't currently in the DOM, so a step tied to a permission-gated element degrades gracefully instead of breaking the tour. Completion (`onDestroyed`, fires on both "Done" and the × close button) is tracked per-user in `localStorage` via `src/lib/tour.ts` (`hasTourCompleted`/`markTourCompleted`) — a UI preference, not business data, so it deliberately isn't a MongoDB field. `App.tsx` offers the tour once via a small Start/Skip banner the first time a user reaches a "ready" session; it's also always re-launchable from the user-menu "Help" (`topbar.help`) item.

### Dashboard KPI Hierarchy
Added 2026-07-10 (UI/UX redesign) — replaces the previous flat ~20-card `KpiGrid.tsx` (removed). Two tiers, both driven by the same `DashboardKpis` shape from `GET /api/dashboard`:
- **`PrimaryKpiCards.tsx`**: the 6 metrics an executive needs first (Total Quotations, Total Quotation Value, Closed Sales, Expected Sales, Win Rate, Active Quotations) — larger cards (`text-[28px]` value), each with a one-line helper caption and, where the metric isn't self-explanatory, a `MetricInfoTooltip`.
- **`SecondaryKpiSummary.tsx`**: everything else real and useful (Won/Lost/Non-Active Jobs, Average Deal Size, Average Closing Time, Pending Approvals, Overdue Follow-ups, Total Customers, Total Products) as small, dense mini-cards (`MiniCard`, icon + value + label in one row) under an uppercase section label — deliberately not the same visual weight as the primary tier.

Don't reintroduce a single flat KPI grid — split any new KPI into "does an executive need this in the first three seconds" (primary) vs. "useful detail, not the headline" (secondary).

### Sales Pipeline Visualization
`src/pages/dashboard/PipelineSteps.tsx` (added 2026-07-10) replaces a `recharts` `FunnelChart` (`PipelineFunnel.tsx`, removed) that squeezed 9 Thai status labels into a shrinking funnel silhouette — labels overlapped and it read as broken. The replacement is horizontal, connected step cards (stage name badge, count, value, conversion % from the previous stage), with the 3 "left the pipeline" outcomes (Customer Rejected/Lost/Cancelled) shown as a separate row below the main Draft→...→Won flow, since they're branches off the main path, not sequential steps in it. If a future chart ever starts overlapping labels or squeezing real data into a fixed shape again, prefer this step-card/table pattern over forcing a chart library to work — see the Chart Requirements note in `MODULES/Dashboard.md`.

### Notifications (Toast)
`src/components/Toast.tsx` + `src/hooks/useToast.ts`. Fixed bottom-right, navy background, gold check icon, auto-dismisses after 2.8s. Use `const toast = useToast()` then `toast.show("message")`; render `<Toast message={toast.message} />` once per page. Don't build a second toast implementation.

### Responsive Rules
Grids use Tailwind breakpoints (`grid-cols-2 xl:grid-cols-4` etc.) — the app is primarily designed for desktop/tablet (internal business tool), with `xl:` as the main breakpoint for expanding from 2 to 4 columns. No dedicated mobile layout has been built or tested.

### Print / PDF
Use Tailwind's `print:` variant, not custom media-query CSS, for anything that should hide/show when printing. The established pattern (since 2026-07-09, `PrintDocument.tsx`): don't interleave print and screen markup in the same components — build a **separate, dedicated print-only component** (root class `hidden print:table`/`print:block`) that receives the same data as the screen view, and mark every screen-only editing component `print:hidden` at its own root instead of tagging individual descendants. This is simpler to reason about than the earlier approach of scattering `print:hidden` / `hidden print:table-row` pairs through a shared component (`QuoteDocument.tsx`/`LineItemsEditor.tsx` were refactored off that pattern), and is required for the next rule below.

**Repeating print headers**: when a printed document needs its header/buyer-info/column-headers to repeat on every page (multi-page quotations, invoices, etc.), wrap the whole document in one `<table>` and put the repeating content in a `<thead>` — browsers natively repeat `<thead>` content across page breaks in print, verified end-to-end with a forced multi-page quotation (see `MODULES/Quotation.md`). Put one-time content (totals, notes, signature blocks) as ordinary `<tbody>` rows at the end, never in a `<tfoot>` (which also repeats every page). Known limitations of this approach: the header can't vary its content by page number (e.g. "full header on page 1, condensed on page 2+") since `<thead>` content is static, and there is no reliable cross-browser way to render "Page X of Y" from CSS alone in a browser print/PDF context — both are accepted simplifications, not bugs to chase.

A small `@media print { @page { margin: 12mm } }` rule lives in `src/styles/index.css` for page margins.
