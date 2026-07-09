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
Pattern from `ProductList.tsx`: centered icon in a muted circle + explanatory text, shown when a filtered/searched list has zero results.

### Notifications (Toast)
`src/components/Toast.tsx` + `src/hooks/useToast.ts`. Fixed bottom-right, navy background, gold check icon, auto-dismisses after 2.8s. Use `const toast = useToast()` then `toast.show("message")`; render `<Toast message={toast.message} />` once per page. Don't build a second toast implementation.

### Responsive Rules
Grids use Tailwind breakpoints (`grid-cols-2 xl:grid-cols-4` etc.) — the app is primarily designed for desktop/tablet (internal business tool), with `xl:` as the main breakpoint for expanding from 2 to 4 columns. No dedicated mobile layout has been built or tested.

### Print / PDF
Use Tailwind's `print:` variant, not custom media-query CSS, for anything that should hide/show when printing. The established pattern (since 2026-07-09, `PrintDocument.tsx`): don't interleave print and screen markup in the same components — build a **separate, dedicated print-only component** (root class `hidden print:table`/`print:block`) that receives the same data as the screen view, and mark every screen-only editing component `print:hidden` at its own root instead of tagging individual descendants. This is simpler to reason about than the earlier approach of scattering `print:hidden` / `hidden print:table-row` pairs through a shared component (`QuoteDocument.tsx`/`LineItemsEditor.tsx` were refactored off that pattern), and is required for the next rule below.

**Repeating print headers**: when a printed document needs its header/buyer-info/column-headers to repeat on every page (multi-page quotations, invoices, etc.), wrap the whole document in one `<table>` and put the repeating content in a `<thead>` — browsers natively repeat `<thead>` content across page breaks in print, verified end-to-end with a forced multi-page quotation (see `MODULES/Quotation.md`). Put one-time content (totals, notes, signature blocks) as ordinary `<tbody>` rows at the end, never in a `<tfoot>` (which also repeats every page). Known limitations of this approach: the header can't vary its content by page number (e.g. "full header on page 1, condensed on page 2+") since `<thead>` content is static, and there is no reliable cross-browser way to render "Page X of Y" from CSS alone in a browser print/PDF context — both are accepted simplifications, not bugs to chase.

A small `@media print { @page { margin: 12mm } }` rule lives in `src/styles/index.css` for page margins.
