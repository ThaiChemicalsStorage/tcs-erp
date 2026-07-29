---
name: TCS ERP
description: A navy-and-gold internal ERP for Thai Chemicals Storage — formal enough to trust with an audit trail, clear enough to use without training.
colors:
  navy-ink: "#0b1d3a"
  gilded-gold: "#c9a84c"
  hover-gold: "#f0c040"
  paper-blue: "#f4f6fb"
  ledger-white: "#ffffff"
  pale-surface: "#e8edf7"
  surface-blue-ink: "#1a3a6b"
  muted-mist: "#eef1f8"
  muted-slate: "#5a7299"
  danger-red: "#e05252"
  border-navy: "rgba(11, 29, 58, 0.1)"
  sidebar-foreground: "#a8bed8"
  sidebar-hover: "#132540"
  sidebar-border: "rgba(201, 168, 76, 0.15)"
  chart-blue: "#1a5fb4"
  chart-green: "#2aa36b"
  chart-purple: "#7c4dbb"
  status-pending: "#c9a84c"
  status-approved: "#2aa36b"
  status-sent: "#3b6fc9"
  status-accepted: "#1f9d8a"
  status-won: "#157347"
  status-rejected: "#e08a3c"
  status-lost: "#e05252"
  status-cancelled: "#8a94a6"
typography:
  display:
    fontFamily: "'Playfair Display', 'Noto Sans Thai', serif"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "'Inter', 'Noto Sans Thai', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Inter', 'Noto Sans Thai', sans-serif"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.05em"
  mono:
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.gilded-gold}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.hover-gold}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.muted-slate}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-danger:
    backgroundColor: "{colors.danger-red}"
    textColor: "{colors.ledger-white}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.ledger-white}"
    rounded: "{rounded.xl}"
    padding: "24px"
  input:
    backgroundColor: "{colors.muted-mist}"
    rounded: "{rounded.lg}"
    padding: "8px 12px"
  stat-tile:
    backgroundColor: "{colors.ledger-white}"
    rounded: "{rounded.xl}"
    padding: "16px"
  chart-tooltip:
    backgroundColor: "{colors.ledger-white}"
    rounded: "{rounded.lg}"
    padding: "12px"
---

# Design System: TCS ERP

## Overview

**Creative North Star: "The Chartered Ledger"**

TCS ERP looks like the official record book of a serious trading house, not a generic SaaS dashboard. Navy is the ink and the leather binding — it is the color of authority, of a company that stores and moves chemicals for a living and can't afford ambiguity in its paperwork. Gold is used the way a ledger uses a wax seal or a gilded edge: sparingly, on the things that represent approval, action, or attention — a primary button, an active nav item, a "pending approval" pill. Playfair Display headings give every page title the weight of a printed heading in a bound register, while Inter carries the actual day-to-day reading — the paragraphs, labels, and form fields a clerk fills in dozens of times a day. JetBrains Mono marks anything that must be read exactly and never mistaken: quotation numbers, dates, currency.

The system is formal and trustworthy by necessity (it carries a server-enforced audit trail, RBAC, and approval workflow — see PRODUCT.md), but the mandate from the people who actually use it every day is that formal must never mean unfriendly: the ledger metaphor governs color and type, not density or tone. Screens stay legible and unintimidating — generous padding, plain-language page descriptions (`PageHeader.tsx`), one clear primary action per screen, and empty states that always say what to do next rather than just "no data." A user who has never opened a design system should still be able to find the one gold button that matters.

Many day-to-day users (Sales, Technical staff, Admins) are genuinely **first-time users of any business system like this** — professional and compact must not tip into dense or cryptic. Every screen should be learnable without training: clear labels in the established Thai terminology (never invent new phrasing for an existing term), predictable placement of primary actions, and a layout compact enough to scan quickly without feeling cramped. This is a working tool used many times a day, not a marketing surface — clarity and speed of comprehension outrank visual flourish every time they compete.

The system is deliberately flat and quiet at rest — surfaces are separated by a hairline navy border, not a shadow — and reserves motion/elevation for the moment something is genuinely floating above the page (a dropdown, a modal). This keeps the "ledger" feeling calm and paper-like rather than app-glossy.

**Key Characteristics:**
- Navy-and-gold, editorial-serif headings over a clean sans-serif body — formal without being cold.
- Gold is rare and meaningful: primary actions, active/selected states, "awaiting approval." It is never a background color for large areas.
- Flat by default (border-only surfaces); shadow appears only when something floats above the page.
- No third-party component library — every control is hand-built in Tailwind to this system's exact rules, so consistency has to be enforced by convention, not by a library's defaults.
- Every workflow status (9 of them, end to end) gets its own tinted pill color — the system doubles as a legend the moment you learn it once.

## Colors

The palette reads as "navy ledger, gold seal": one deep authoritative ink color, one rare metallic accent, and a wide, deliberately desaturated family of blue-greys for every surface in between.

### Primary
- **Gilded Gold** (`#c9a84c`): the one accent color. Primary buttons, active sidebar nav item, focus rings, the "รออนุมัติ/Pending Approval" status pill, chart series #1. Also the color of the Thai subtitle under the logo and the topbar breadcrumb.
- **Hover Gold** (`#f0c040`): the brighter, slightly warmer gold primary buttons and accents shift to on hover — never used as a resting-state color.

### Neutral
- **Navy Ink** (`#0b1d3a`): primary text color everywhere, and the sidebar's own background (inverted role — on the sidebar, navy is the surface and a pale blue is the text).
- **Ledger White** (`#ffffff`): card, popover, and dropdown-panel backgrounds.
- **Paper Blue** (`#f4f6fb`): the page background beneath every card — just barely blue, never stark white, so cards read as paper sitting on a desk rather than panels floating on a void.
- **Pale Surface** (`#e8edf7`) / **Muted Mist** (`#eef1f8`): secondary surfaces — input backgrounds, muted panel fills, table header-row tints.
- **Muted Slate** (`#5a7299`): secondary/muted text — captions, helper text, placeholder-weight copy, secondary-button text.
- **Sidebar Foreground** (`#a8bed8`): the pale ink used for inactive sidebar labels against the navy sidebar background.
- **Sidebar Hover** (`#132540`): a slightly lighter navy used only for sidebar item hover, never for text.
- **Border Navy** (`rgba(11, 29, 58, 0.1)`): the one border color used everywhere — cards, tables, dividers, inputs. Always this navy-at-10%-opacity, never a flat grey.

### Semantic
- **Danger Red** (`#e05252`): destructive actions (delete, reject), the "เสียโอกาส/Lost" status pill, form error text and error borders. Its hover-state twin is `#c94444`.
- **Chart Blue** (`#1a5fb4`), **Chart Green** (`#2aa36b`), **Chart Purple** (`#7c4dbb`): the non-gold chart series colors (`--chart-2/3/5` in `theme.css`), used only in Dashboard charts — never as UI chrome.

### Multi-Series Chart Palette
When a chart or donut legend needs more than 2-3 categories (job type distribution, product category breakdown), colors cycle through one fixed 8-step sequence in this exact order: Gilded Gold, Chart Blue, Chart Green, Chart Purple, Danger Red, Status Accepted Teal (`#1f9d8a`), Status Rejected Orange (`#e08a3c`), Status Sent Blue (`#3b6fc9`) — `PALETTE` in `src/pages/dashboard/DashboardCharts.tsx`. Reuse this exact sequence (`i % PALETTE.length`) for any new multi-category chart rather than inventing a new color order.

### Named Rules
**The Icon Chip Tint Rule.** A small icon sitting in a rounded square (KPI/stat tiles, action-item tiles) tints its own background by appending a fixed `18` hex-alpha suffix directly to the icon's accent color (e.g. `style={{ background: \`${accent}18\` }}` — roughly 9% opacity), with the icon itself rendered at full accent color. This is a distinct convention from the Tinted Pill Rule's Tailwind `/10` `/20` opacity classes below — pills use Tailwind opacity utilities, icon chips use a literal appended hex suffix — don't mix the two notations for the same element.

**The Rare Gold Rule.** Gold covers a small fraction of any given screen — one primary button, one active nav row, one status pill at a time. Its scarcity is what makes it read as "the one thing that matters here." Never use gold as a large background fill, a card background, or a body-text color.

**The Tinted Pill Rule.** Every status badge — most visibly the Quotation workflow's 9 statuses — uses the same formula: `bg-[HEX]/10 text-[HEX] border border-[HEX]/20`, one dedicated hex per status (not reused from the semantic palette above). This is a closed, memorized set (`statusStyle` in `src/lib/quotes.tsx`): Draft `#5a7299`, Pending Approval `#c9a84c`, Approved `#2aa36b`, Sent `#3b6fc9`, Customer Accepted `#1f9d8a`, Won `#157347`, Customer Rejected `#e08a3c`, Lost `#e05252`, Cancelled `#8a94a6`. A new status must mint its own hex under this same three-part formula rather than reusing an existing status's color for a different meaning.

## Typography

**Display Font:** Playfair Display (weights 500/600/700), with Noto Sans Thai as an equal-weight fallback — not a glyph-fallback afterthought, since most headings render Thai text by default and Playfair Display has no Thai glyphs at all.
**Body Font:** Inter (300–700), with Noto Sans Thai fallback, exposed as the `font-sans` token/utility.
**Label/Mono Font:** JetBrains Mono (400/500), exposed as the `font-mono` token/utility.

**Character:** An editorial serif for anything that announces a page or section, set against a plain, highly legible sans for everything the user actually reads and fills in — the pairing of a printed ledger's heading with its ruled interior pages.

### Hierarchy
- **Display / Headings** (weight 500–600, `h1` 24px / `h2` 20px / `h3` 18px / `h4` 16px, line-height 1.5): Playfair Display, applied via an inline `fontFamily` style (not a Tailwind utility) on page titles, card/section titles, and the topbar breadcrumb. Always paired with the Noto Sans Thai fallback — never the bare `'Playfair Display', serif` stack.
- **Body** (weight 400, 15px base, line-height 1.6): all paragraph copy, most static UI chrome, input values and table cell data on data-dense pages.
- **Chrome / Label** (weight 500, 12px floor, `text-xs`): buttons, form labels, status pills, secondary/fine-print text. **Never below 12px for a real form label** — `text-[10px]` is reserved only for uppercase-tracking-wide "section eyebrows" (table header cells, sidebar group labels), a distinct, deliberately-tiny reading mode.
- **Numbers / Codes** (JetBrains Mono, weight 400/500): quotation numbers, document numbers, currency amounts, dates, product codes — anything that must be scanned character-by-character.

### Named Rules
**The Two-Tier Density Rule.** On dense working pages (e.g. the Quotation editor), chrome — labels, buttons, badges, pills — sits at `text-xs` (12px) while actual content — input values, table data, totals — sits at `text-sm` (14px). Bumping everything to the same size erases the hierarchy and reads as heavier, not more readable; when a page genuinely needs bigger text, apply this two-tier split deliberately per element rather than a single mechanical size bump.

## Layout

Hand-rolled Tailwind, no UI kit. Page containers: `p-6` with `space-y-5`/`space-y-6` between sections. Cards/panels: `p-4`–`p-6` internal padding depending on density; grids use `gap-4`.

**Sidebar**: fixed navy rail, `w-64` expanded / `w-16` collapsed, desktop-only (`md:`, 768px+); below that it becomes a full off-canvas drawer (slide-in, backdrop, Escape-to-close) rather than a permanently docked column. **Topbar** degrades progressively rather than clipping: padding/gap/height scale down below `md`, the breadcrumb hides below `sm` (640px), and the search box / user name-and-role block hide below `lg` (1024px) — chosen over `md` after a real-width check found `md` still too cramped for a full-width search box plus a long Thai name.

**Field-pair grids** (two related inputs side by side) are always `grid-cols-1 sm:grid-cols-2`, never a bare `grid-cols-2` — a bare two-column grid forces two inputs into half a mobile screen each. **Tables** always sit inside an `overflow-x-auto` wrapper (itself nested in the card's `overflow-hidden` so rounded corners still clip) so a narrow viewport scrolls horizontally instead of squeezing columns.

Per PRODUCT.md, the real usage scene is desktop/laptop office work — the responsive rules above exist as defensive, bug-driven hardening (an app that must not break at odd widths), not a from-scratch mobile redesign.

## Elevation & Depth

Flat by default. Cards, panels, and tables are separated from the page and each other by a single hairline navy border (`border-border`, `rgba(11, 29, 58, 0.1)`) — never a resting-state shadow. Depth is reserved entirely for things that are genuinely floating above the flat page: dropdown panels (notifications, What's New, Global Search, user menu) and modal dialogs all share one `shadow-xl` treatment. This is the one thing that indicates "this surface is temporary and overlays the page," so it must never be used on a permanent, in-flow card — doing so would erase the one visual cue the system has for "floating vs. anchored."

### Named Rules
**The Flat-Ledger Rule.** Surfaces are flat at rest, separated by a border, not a shadow. Shadow (`shadow-xl`) is reserved exclusively for content that overlays the page — dropdowns and modals — never for an in-flow card or panel.

## Shapes

`--radius: 0.5rem` (8px) is the base, with a derived scale: `sm` (4px), `md` (6px), `lg` (8px), `xl` (12px). Applied by role, consistently: **`rounded-xl`** on cards and panels, **`rounded-lg`** on buttons and inputs, **`rounded-full`** on pills, badges, and avatars. There is no sharp-cornered or fully-square surface anywhere in the working UI — the one deliberate exception is formal printed documents (see Do's and Don'ts), which are square-cornered because they reproduce a real paper form.

## Components

### Buttons
- **Shape:** `rounded-lg` (8px).
- **Primary:** gold background (`#c9a84c`) / navy text (`#0b1d3a`), semibold, hover shifts to `#f0c040`.
- **Secondary/outline:** transparent background, muted-slate text (`#5a7299`) with a border, hover shifts text/border toward gold.
- **Danger:** red background (`#e05252`) / white text, hover `#c94444` — reserved for destructive confirmations.
- **Icon-only row actions:** muted-slate, hover to gold (or red for delete). Always visible at `opacity-50`, sharpening to full opacity on hover *or* focus-visible — never `opacity-0` shown only on hover, which hides the action from touch devices and keyboard users entirely.

### Status Pills (signature component)
The tinted-pill formula (see Named Rules, Colors) is this system's signature recurring element — it appears on every Quotation/Scope of Work/Delivery Order list and detail view. `rounded-full`, `text-xs font-medium`, an icon + translated label inside. Treat a new status exactly like an existing one: pick a new dedicated hex, apply the same three-part opacity formula, never repurpose another status's color.

### Stat Tiles (signature component)
The compact KPI tile — `ExecutiveSummaryCards.tsx`'s `SummaryCard`, `ActivityFollowUpSummary.tsx`'s `ActionItem`, `ApprovalDashboard.tsx`'s summary tiles — is a second recurring signature pattern alongside Status Pills: an icon in an Icon Chip Tint square, a large `text-2xl font-bold font-mono` (or `text-lg`/`text-xl` in denser variants) value, a muted-foreground title/label, and (where the number needs one-line context) a `text-[10px]` helper caption underneath. Reuse this shape for any new at-a-glance number rather than inventing a new card format — never a bare number with no label, and never more than one accent color's worth of visual weight per tile.

### Chart Section & Tooltip
`ChartCard.tsx` is the shared wrapper for every Dashboard chart/table section: a Playfair Display `title`, an optional mono `sub` caption, an optional `actions` slot (top-right, e.g. a grouping toggle), then `children`. Every chart section uses this wrapper rather than a bare `Cards / Containers` div, so chart sections are visually identical regardless of what's inside. Chart tooltips (Recharts `<Tooltip content={...}>`) share one pattern (`SimpleTooltip` in `DashboardCharts.tsx`): white background, a gold-tinted border (`border-[#c9a84c]/30`, distinct from the standard hairline navy border), `shadow-xl` (a chart tooltip is a floating element, consistent with the Flat-Ledger Rule), and mono-font label/value lines colored to match their series.

### Cards / Containers
- **Corner style:** `rounded-xl` (12px).
- **Background:** white (`#ffffff`) on the paper-blue page background.
- **Border:** hairline navy (`rgba(11,29,58,0.1)`), always — see Elevation & Depth.
- **Hover** (interactive cards only): border shifts toward gold at low opacity (`hover:border-[#c9a84c]/30`), never a shadow.
- **Internal padding:** `p-4`–`p-6`.

### Inputs / Fields
- **Style:** muted-mist background (`#eef1f8`), hairline navy border, `rounded-lg`.
- **Focus:** border shifts to gold at 50% opacity (`focus:border-[#c9a84c]/50`), no glow/ring.
- **Error:** red (`#e05252`) helper text below the field, `text-xs`.
- **In-table inline editing:** a distinct, lighter-weight variant — transparent background by default, only gaining the muted-mist background on focus — used for spreadsheet-style editable table cells (e.g. quotation line items) instead of the full bordered field style.

### Navigation (Sidebar)
Navy rail; inactive items are pale-blue text (`#a8bed8`) on navy, hover shifts to white with a navy-accent background (`#132540`); the active item gets the tinted-pill treatment (`bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/25`) — the sidebar's active state is a direct application of the same pill formula the status system uses elsewhere. Nav items are grouped under small uppercase eyebrow labels (Main/Sales/Inventory/Administration) that hide when the sidebar is collapsed to icon-only.

### Dropdown Panels (Notifications, What's New, Global Search, User Menu)
One shared shell reused across all four: `absolute right-0 (or left-0) top-full mt-2`, white card, hairline border, `shadow-xl`, `w-96` (or `w-[26rem]` for search). This is the only place `shadow-xl` belongs — see Elevation & Depth.

### Dialogs
Fixed navy-tinted overlay (`bg-[#0b1d3a]/40`), centered white card (`max-w-sm`), title + message, an outline Cancel button + a primary or danger Confirm button depending on the action. `ConfirmDialog` for yes/no destructive confirmation, `PromptDialog` for a single free-text value — never the browser's native `window.prompt()`/`window.confirm()`.

## Do's and Don'ts

### Do:
- **Do** keep gold rare — one primary action, one active state, one status pill at a time (The Rare Gold Rule).
- **Do** use the tinted-pill formula (`bg/10, text, border/20`, one dedicated hex) for any new status or state badge (The Tinted Pill Rule).
- **Do** pair every `'Playfair Display'` inline style with the `'Noto Sans Thai'` fallback — Playfair has no Thai glyphs.
- **Do** keep icon-only actions discoverable at `opacity-50` by default, full opacity on hover *or* focus-visible — never hover-only.
- **Do** wrap every table in `overflow-x-auto` and make every field-pair grid `grid-cols-1 sm:grid-cols-2`.
- **Do** reserve `shadow-xl` for genuinely floating layers (dropdowns, modals) — everything else stays flat with a border (The Flat-Ledger Rule).
- **Do** reuse an existing shared component (`ConfirmDialog`, `PromptDialog`, `EmptyState`, `PageHeader`, `Toast`, `BrandMark`, etc.) and its established tokens before building anything new — see `docs/UI_GUIDELINES.md` for the full list.
- **Do** render the app shell first and let only the genuinely data-dependent area show a loading state (Progressive/Shell-First Loading) — never a full-page blocking skeleton when the chrome could render immediately.
- **Do** preserve keyboard navigation, visible focus states, and the existing responsive/loading/empty/error-state behavior of any component you touch — a UI task improves accessibility without changing what the component does.
- **Do** respect `prefers-reduced-motion` for any new animation, and keep motion purposeful and minimal even when it's respected — this app currently has no reduced-motion handling anywhere (a real gap, not a precedent to extend).

### Scope discipline:
- **Do** modify only the page/component/issue a task explicitly names — don't redesign an unrelated page or module while you're in the area, and don't remove or rename existing functionality as a side effect.
- **Do** prefer a small, targeted diff over a broad rewrite whenever both would satisfy the task.

### Don't:
- **Don't** use gold as a large background fill, a card background, or body text color — it's an accent, not a surface color.
- **Don't** put a shadow on an in-flow card or panel; that visual weight is reserved for floating content only.
- **Don't** drop a real form `<label>` below 12px (`text-xs`) — `text-[10px]` is only for uppercase section-eyebrow labels, a different reading mode.
- **Don't** use `window.prompt()`/`window.confirm()` — use `PromptDialog`/`ConfirmDialog`.
- **Don't** apply this design system to a formal reference-form print document (e.g. Delivery Order's FM-SL-05 layout). A document reproducing a real company paper form is plain black-on-white Times/Noto Serif Thai with thin black borders and square corners — the reference form is the design authority there, not this system.
- **Don't** redesign, restyle, or otherwise touch a formal PDF/print document (Quotation, Scope of Work, Delivery Order) as a side effect of screen-level design work — only touch print layouts when a task explicitly targets them.
- **Don't** retranslate or rename established Thai terminology (module names, status labels, field labels) while doing visual work — wording changes are a content decision, not a design one.
- **Don't** reach for a drag-and-drop library for reorderable lists — use up/down arrow buttons (or native HTML5 drag events, matching whichever existing precedent is closer) instead.
