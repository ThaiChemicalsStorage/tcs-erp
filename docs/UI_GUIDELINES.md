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
Fixed-width (`w-64` expanded / `w-16` collapsed) navy (`bg-sidebar`) column. Logo mark (gold rounded square + "ท" Playfair glyph) + brand name + tagline at top. Nav items: icon + label, active state = `bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/25`, inactive hover = `hover:bg-sidebar-accent hover:text-white`. Settings pinned at the bottom, same active-state pattern.

### Topbar
`bg-card border-b border-border`, sidebar collapse toggle, breadcrumb (`องค์กร > {activeNav}` in Playfair gold), search input (currently decorative), notification bell, user avatar dropdown (initials circle, name/role, dropdown with Settings/Log out).

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
Use Tailwind's `print:` variant, not custom media-query CSS, for anything that should hide/show/reflow when printing (`print:hidden`, `print:block`, `print:table-row`, `print:overflow-visible`). See `QuoteDocument.tsx` and `LineItemsEditor.tsx` for the established pattern: interactive editing UI gets `print:hidden`, and where print needs different content (e.g. notes/sub-details as static indented lists instead of editable inputs), render a second, always-present block with `hidden print:table-row` / `hidden print:block`. A small `@media print { @page { margin: 12mm } }` rule lives in `src/styles/index.css` for page margins.
