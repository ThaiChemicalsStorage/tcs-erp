# UI Guidelines

The design system is navy + gold, editorial/professional in tone, entirely hand-built with Tailwind v4 utility classes — **no component library** (no shadcn, Radix, MUI). Match these patterns exactly when building new pages; don't invent new visual language.

## Design Tokens (`src/styles/theme.css`)

CSS custom properties, exposed to Tailwind via `@theme inline` (so `bg-background`, `text-foreground`, etc. work directly as utility classes):

| Token | Value | Use |
|---|---|---|
| `--background` | `#f4f6fb` | Page background (a warm-cream variant existed for a few hours on 2026-08-07, reverted the same day per user request) |
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

- **Headings**: `'Playfair Display', 'Noto Sans Thai', serif` via inline `style={{ fontFamily: ... }}` — used for page titles (`h1`, `text-2xl font-semibold`), card/section titles (`text-base font-semibold`). **2026-07-13**: added the `'Noto Sans Thai'` fallback (previously just `'Playfair Display', serif`) — Playfair Display has no Thai glyphs, and since most headings render translated (Thai by default) text, they were silently falling back to the browser's arbitrary default serif for Thai, at a different weight than the rest of the UI. Latin text is unaffected (still renders in Playfair Display); Thai text in the same heading now renders in Noto Sans Thai instead. Always add the same fallback to any new `'Playfair Display', serif` inline style — don't reintroduce the bare version.
- **Body**: `--font-sans` design token (`'Inter', 'Noto Sans Thai', sans-serif`, `styles/theme.css`), exposed as the standard Tailwind `font-sans` utility via `@theme inline`. **2026-07-13, second pass**: centralized here — previously 3 separate places each hand-repeated the same stack (`body` in `index.css`, and an arbitrary-value `font-['Inter','Noto_Sans_Thai',sans-serif]` class on the root `<div>` in both `App.tsx` and `AuthLayout.tsx`); all three now just use `font-sans`. Add any future root-level font declaration the same way — reference `font-sans`, don't hand-write the stack again. Base `body` line-height is `1.6` (`styles/theme.css`) for comfortable reading of mixed Thai/English paragraphs.
- **Numbers, codes, IDs, dates**: JetBrains Mono via `font-mono` utility — quotation numbers, currency amounts, dates, product codes all use this. **2026-07-13, second pass — bug fix**: JetBrains Mono was imported in `fonts.css` the whole time but never actually wired to the `font-mono` utility (no `--font-mono` theme token existed) — every `font-mono` span in the app had silently been rendering in the browser's generic system monospace font. Fixed via a `--font-mono` token in `styles/theme.css` alongside `--font-sans`, both wired through `@theme inline`. If you ever add a new font import, always register a matching `--font-*` token too — an imported-but-unwired font is invisible and easy to miss (this one shipped undetected for weeks).
- Form field `<label>`s should be **at least `text-xs` (12px)**, not `text-[10px]` — an independent Codex review flagged 10px as too small for routine Thai/English form reading (distinct from the uppercase-tracking-wide "section eyebrow" labels below, which are a different, intentionally-small reading mode and are unaffected). `QuoteDocument.tsx`'s 19 field labels were bumped from `text-[10px]` to `text-xs` 2026-07-13. New form labels should start at `text-xs`, not `text-[10px]`.
- **2026-07-21, quotation page readability pass, corrected same day — a real typographic hierarchy, not a blanket bump**: direct user request ("อ่านง่ายขึ้น" — make it easier to read) initially bumped *every* `text-xs` (12px) instance on the Create/Edit Quotation page to `text-sm` (14px) mechanically, across `QuoteDocument.tsx`, `LineItemsEditor.tsx`, `CustomerSelector.tsx`, and `InterestButtons.tsx`. The user immediately flagged this as looking "wrong/oddly big" ("fonts มันใหญ่แปลกๆ") — collapsing chrome (buttons, labels, badges, pills) and actual content (input values, table data, totals) into the same size had erased the page's visual hierarchy, which read as heavier/less polished even though nothing was individually huge. **Fixed by restoring a real two-tier hierarchy instead of reverting the whole bump**: labels (`<label>`/`RequiredFieldLabel`), every toolbar/workflow/modal button, status pills/badges, and secondary/fine-print text (footer disclaimer, modal helper copy, the "QUOTATION" subtitle) went back to `text-xs` (12px); actual content — input/select/textarea values, table cell data, the totals breakdown — stayed at `text-sm` (14px), which is the part that actually needed to be more readable. Pre-existing `text-sm` (client-name input, Playfair section titles, the quote-ID badge) and the largest tiers (`text-base`/`text-lg`/`text-xl`) were untouched throughout both passes. **This page-specific pattern (labels/buttons/chrome = `text-xs`, content = `text-sm`) does not change the general "start at `text-xs`" floor above for new labels elsewhere in the app** — it only applies to these 4 quotation-page files today. If another page needs the same treatment, apply this same two-tier split deliberately (per-element, verified visually) rather than a single mechanical find-replace — that's exactly what went wrong the first time.
- Base font size `15px` (`--font-size` on `html`).
- Google Fonts loaded in `styles/fonts.css`: Playfair Display (500/600/700), Inter (300/400/500/600/700), **Noto Sans Thai** (400/500/600/700, added 2026-07-13), JetBrains Mono (400/500).

### Icons

`lucide-react` exclusively. Sizes used throughout: `size={17}` sidebar nav icons, `size={13}`–`15` inline action icons, `size={10}`–`12` tiny badge/status icons.

## Component Patterns

### Sidebar
Fixed-width (`w-64` expanded / `w-16` collapsed) navy (`bg-sidebar`) column **on desktop (`md:`, 768px+)**. Logo + brand name + Thai subtitle at top via `components/BrandMark.tsx` (see Brand Mark below) — collapses to icon-only, centered, when the sidebar collapses. Nav items: icon + label, active state = `bg-[#c9a84c]/15 text-[#c9a84c] border border-[#c9a84c]/25`, inactive hover = `hover:bg-sidebar-accent hover:text-white`. Settings pinned at the bottom, same active-state pattern. Nav labels use `truncate` + `min-w-0` on their flex container (never bare `whitespace-nowrap` with no ellipsis fallback — that's how the header overflow bug happened, see below); collapsed (icon-only) nav/settings buttons get a `title="..."` tooltip with the label. `App.tsx`'s `sidebarOpen` initializes to `window.innerWidth >= 768` (desktop-only concern now — see below for what happens under 768px).

**2026-07-13, second pass — mobile off-canvas drawer.** Below `md` (768px) the `<aside>` is no longer a permanent rail at all: `fixed inset-y-0 left-0 z-40 w-64` with `-translate-x-full`/`translate-x-0` toggled by a separate `mobileNavOpen` state (decoupled from `sidebarOpen`, which now only ever governs desktop width), a `bg-[#0b1d3a]/50` backdrop (click closes), a close (×) button inside the drawer header (`md:hidden`), and an Escape-key listener (`useEffect` scoped to `mobileNavOpen`, added/removed on open/close, not a permanent global listener). Opened via a hamburger button in the topbar (`Menu` icon, `md:hidden`, `aria-label={t("nav.openMenu")}`) — distinct from the desktop collapse-toggle button (`X`/`Menu`, `hidden md:block`, `aria-label` via `nav.collapseSidebar`/`nav.expandSidebar`). Clicking a nav item inside the drawer both navigates and closes it. The drawer always renders its expanded content (labels, group headers) regardless of the desktop `sidebarOpen` collapse preference — a new `navExpanded = sidebarOpen || mobileNavOpen` derived value drives what used to just check `sidebarOpen` for this. When adding new sidebar content, gate its "show the expanded version" condition on `navExpanded`, not `sidebarOpen` directly, or it'll incorrectly stay icon-only inside the mobile drawer.

**Grouped nav (added 2026-07-10, UI/UX pass)**: `App.tsx`'s `NAV_GROUPS` is a pure display grouping over the same flat `navItems`/`NavKey` list — not a new data model or a router. Each group renders a small uppercase label (`text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50`, hidden when the sidebar is collapsed) above its items; a group is skipped entirely if none of its items survive the existing permission filter. Only reflects modules that actually exist today (Main/Sales/Inventory/Administration) — don't add a "Leads"/"Customers"/"Approvals" group until those get real pages, or the grouping becomes misleading.

### Brand Mark (`src/components/BrandMark.tsx`, added 2026-07-09)
The single source of truth for the app's logo — always use this instead of a new inline `<img>`/placeholder block. Props: `size` (px height, width auto, aspect ratio always preserved — never stretch), `variant` (`"mark"` = logo only, `"full"` = logo + "Thai Chemicals Storage ERP" wordmark + "ระบบองค์กร" Thai subtitle), `theme` (`"dark"` for navy panels, `"light"` for card/print backgrounds). The underlying image is `public/logo.png` (the official logo, root-absolute so it also serves as the favicon with zero duplication). Current call sites: sidebar header, login page (desktop + mobile), the quote/print document header fallback (only when no `company.logoDataUrl` is uploaded — that's a separate, admin-configurable company letterhead concept), and the boot/loading screen.

**2026-07-13, overflow bug fix**: the `"full"` variant's wordmark previously used `whitespace-nowrap` inside an `overflow-hidden` container with no truncation/ellipsis — at the sidebar's fixed 256px width the English title ("Thai Chemicals Storage ERP") rendered past the container edge instead of wrapping or shrinking. Fixed to `break-words line-clamp-2 leading-snug` (wraps to at most 2 lines, never overflows) with `min-w-0` on the wrapping containers so the text column can actually shrink; the Thai subtitle now uses `truncate`. When adding a new `BrandMark` call site or a new wordmark-style text block anywhere, never pair `whitespace-nowrap` with a container that lacks both a `min-w-0` ancestor and a `truncate`/wrapping strategy — that combination is exactly how this bug happened.

### Topbar
`bg-card border-b border-border`, sidebar collapse toggle, breadcrumb (`องค์กร > {activeNav}` in Playfair gold), Global Search (`GlobalSearch.tsx`, see below — was a decorative dead input until 2026-07-14), notification bell (see Notification Bell below), user avatar dropdown (initials circle or uploaded picture, name/role, dropdown with Settings/Log out).

**2026-07-13, second pass — responsive breakpoints.** The topbar degrades progressively instead of clipping (`App.tsx` root has `overflow-hidden`, so anything that doesn't fit was silently getting cut off, not wrapping):
- Padding/gap/height scale down below `md`: `px-3 md:px-6`, `gap-2 md:gap-4`, `min-h-[60px] md:min-h-[68px]`.
- The mobile drawer hamburger (`md:hidden`) and the desktop collapse-toggle (`hidden md:block`) are two separate buttons, not one button whose icon/behavior changes — the two are semantically different actions (open an overlay vs. resize a static column).
- Breadcrumb: `hidden sm:flex` (640px+) with `truncate` on the page-name span.
- Search box and the user avatar's name/role/chevron: `hidden lg:flex`/`hidden lg:block` (1024px+) — **not** `md:`. A real-width check at 768–900px found `md:` still too cramped once the fixed-width (`w-72`) search box was in the mix: the user's Thai full name had no width constraint and wrapped into an ugly 4-line stack. The name/role block also now has `max-w-[140px] truncate` as a hard backstop regardless of breakpoint.
- The notification bell no longer carries its own `ml-auto` (removed 2026-07-14, same day as the mobile Global Search fix below) — `GlobalSearch.tsx` now renders a real, visible element at *every* breakpoint (the inline input on `lg:`+, an icon trigger button below it), so its own elements own the right-alignment `ml-auto` at each breakpoint instead of the bell needing to compensate for whichever one is currently invisible. **If you ever add another header element between Global Search and the bell, don't reflexively add `ml-auto` back to the bell** — check which element is the last one before it that's guaranteed visible at every breakpoint, and put the auto-margin there instead. Two sibling flex items both carrying `ml-auto` don't stack (each gets an equal share of leftover space, pulling them apart with a gap) — only one item per "trailing cluster" should own it.

### Notification Bell & Panel (`src/components/NotificationBell.tsx`)
Bell icon with **no badge at 0 unread** — don't render a "0" badge, that's the one explicit anti-pattern here. When unread > 0: a small red (`bg-[#e05252]`) circular badge, top-right of the bell, showing the count or `"99+"` above 99. Click opens a dropdown panel (`absolute right-0 top-full mt-2`, `w-96`, same card/border/shadow-xl treatment as the user-menu dropdown) with a header (title + "อ่านทั้งหมด" mark-all-read), a scrollable list (`max-h-[28rem] overflow-y-auto`), and per-row: icon in a tinted square, title, description (`line-clamp-2`), module + relative-time metadata, and a hover-reveal delete icon. Unread rows get a subtle gold tint (`bg-[#c9a84c]/[0.06]`) and a small gold dot next to the title — the same "unread" visual language used for sidebar/notification badges elsewhere. Reuse this component for any future notification-style feed rather than building a second dropdown pattern.

### What's New Panel (`src/components/WhatsNewPanel.tsx`, added 2026-07-23)
Sparkle icon (`lucide-react`'s `Sparkles`, not `Bell`, to visually distinguish it from real
notifications) placed just left of the notification bell — same trigger-button/dropdown-panel
shell as `NotificationBell.tsx` (`absolute right-0 top-full mt-2`, `w-96`, card/border/shadow-xl),
reused rather than invented fresh, per the reuse note above. Differs from the bell in two
deliberate ways: **no unread count**, just a single small gold dot (`w-2 h-2 rounded-full
bg-[#c9a84c]`) since entries aren't individually dismissible, only "have you opened the panel since
the newest entry shipped" — clearing on open, not on a per-item click; and **content is static**
(`WHATS_NEW_ENTRIES` in `src/lib/whatsNew.ts`, hand-authored Thai announcements, not fetched from
an API) since this is a short end-user-facing update log, not the technical `docs/CHANGELOG.md`.

### Auto-Save Indicator & Draft Recovery (`src/components/AutoSaveIndicator.tsx` + `DraftRecoveryBanner.tsx`, added 2026-08-25)
Two small shared pieces that every document editor renders. Backed by
`src/hooks/useAutoSave.ts` — see [MODULES/Quotation.md](./MODULES/Quotation.md) "Auto-save" and
[API.md](./API.md) "Auto-save writes" for the behaviour; this section is the UI contract.

**`<AutoSaveIndicator>`** goes in the document toolbar, immediately after `TourReplayButton` and
before the completion/print/save controls — the same slot in every module, so a user who learns to
look for it once finds it everywhere. It is deliberately **quiet**: a 12px icon + `text-xs` line,
no toast, no layout shift, and nothing at all in the `"idle"` state (before the first edit there is
genuinely nothing to report). States map to `มีการแก้ไขที่ยังไม่ได้บันทึก` (muted) →
`กำลังบันทึกอัตโนมัติ...` (muted, spinning `Loader2`) → `บันทึกอัตโนมัติแล้ว HH:MM` (`#2aa36b`,
`Check`) → `บันทึกอัตโนมัติไม่สำเร็จ กรุณากดบันทึกเอง` (`#e05252`, `AlertTriangle`). The wrapper is
`role="status" aria-live="polite"` so a screen reader announces the change without stealing focus.
`localOnly` swaps in a `CloudOff` icon and "เก็บร่างไว้ในเครื่องให้อัตโนมัติ" for a document that has
no server record yet — never show the green "saved" state for that case; it would be a lie.
**`localOnly` means "no server record exists", not "auto-save is off."** Gate it on the document
being new, never on `!canAutoSaveToServer`: an approved/sent quotation is still editable (Quotation
`permissions.canEdit` is status-independent) and doesn't auto-save, but its tooltip — "เอกสารนี้ยัง
ไม่ถูกสร้างในระบบ" — would then be false. Show no chip at all in that case.

**`<DraftRecoveryBanner>`** is the first child of the document's content column, above the
validation summary. Gold-tinted (`border-[#c9a84c]/35 bg-[#c9a84c]/10`) rather than red — a
recovered draft is an offer, not an error. It always states **when** the snapshot was taken and
gives two explicit choices ("กู้คืนร่างนี้" / "ทิ้งร่างนี้"). **Never auto-apply a recovered draft**:
silently replacing a freshly-opened form with older abandoned content is worse than losing it, and
the user has no way to tell it happened.

Both format their timestamps with the **app's** language (`useI18n().lang` → `th-TH` / `en-GB`),
not the browser's — a fully Thai page rendering "Aug 25, 09:25 AM" reads as a bug. Follow that rule
for any new user-visible date/time, not just these two.

### Unsaved-Changes Guard (`src/components/UnsavedChangesDialog.tsx` + `src/hooks/useNavigationGuard.ts`, added 2026-08-25)

The second layer over auto-save: a three-action dialog shown when the user tries to leave an editor
that is holding work auto-save cannot protect.

**It is silent on the common path, by instruction.** `assessUnsavedRisk()` in
`src/lib/unsavedChanges.ts` prompts only for `"new"` (no server record yet), `"notAutoSaved"`
(editable but past Draft, where the server refuses `?autoSave=1`) or `"autoSaveFailed"`. A healthy
Draft whose 2.5 s debounce merely happens to be in flight must **not** interrupt anyone — the hook
flushes on unmount, so that work lands whether or not we ask. If you ever find yourself "fixing" the
guard to also fire on `pending`, four tests in `tests/unsavedChanges.test.ts` will go red on purpose.

**Three actions, and the middle one is the destructive one** — which is why this is not an extra
action bolted onto `ConfirmDialog` (18 call sites, two-button contract, and its `danger` prop
colours the *confirm* button, so it cannot express "safe primary, destructive secondary"). Order is
กลับไปแก้ต่อ (outline) · ไม่บันทึก (danger **outline** `#e05252`) · บันทึก (gold primary).

- **Solid `#e05252` stays reserved for the primary/confirm slot.** Here the primary is gold, and two
  solid fills side by side would fight for the eye.
- **The caution icon is gold, not red.** This is a pause before an ordinary action, not a delete
  confirmation; red here would compete with the ไม่บันทึก button.
- **Initial focus is on บันทึก**, so Enter does the safe thing and the destructive option is never
  one keystroke away.
- `busy` disables **all three** — a mis-click on ไม่บันทึก mid-save is unrecoverable.
- `print:hidden` on the overlay (copy this from `WorkflowActionDialog`; `ConfirmDialog` lacks it): a
  dialog stuck open over a printable document must not reach the paper.

**Wiring rules for a new document editor** (all eight existing ones follow these):

- Register with `useUnsavedChangesGuard(...)`, and pass `null` whenever there is nothing to protect.
  It returns `requestLeave`, which the editor's own breadcrumb Back must be wrapped in. A
  *programmatic* `onBack()` — after a delete, say — stays unwrapped: there is nothing left to save.
- `getRisk` is a **function**, read at the moment the user tries to leave. Dirtiness is never a
  rendered boolean: reading a ref during render trips `react-hooks/refs`, and holding it in state
  would re-render the editor on every keystroke to maintain a value nobody displays.
- `save` must be the editor's **real** Save — same validation, same error toast — returning
  `Promise<boolean>`. For a document with no record yet, that means *create*. Returning `false`
  keeps the user on the page with an inline error; it must never navigate away.
- `discard` must call `draftBackup.clear()`. Otherwise reopening the document — or the *next* new
  one, since new documents share the `quotation:new` / `serviceReport:new` keys — greets the user
  with a recovery banner offering back the work they just chose to throw away.
- **Feed the dirty tracker only what the user can actually change.** Two live traps: Quotation's
  draft payload carries `status`, which moves through the approval workflow rather than the form
  (left in, every approved quotation looks permanently dirty); and Material Requisition's
  `toUpdateFields` omits `returnedBy` / `returnReceivedBy`, which stay editable after approval with
  auto-save off — exactly the case the guard exists for.
- **Re-seed the baseline at every point a server response lands** — load, save, finalize,
  `DocumentApprovalActions.onUpdated`, and each workflow action. Miss one and the document nags on
  every navigation. The draft-recovery **restore** deliberately does not re-seed: restoring
  recovered work genuinely does make the form dirty.

**Navigation is guarded at the initiator, not at the route.** There is no router; every navigation
is a `setActiveNav(...)` in `App.tsx`, so each one is wrapped in `guardedNav(() => { ... })`.
Wrapping the `navigateTo*` family is what covers global search, the notification bell and
cross-document links inside editors without touching those components at all. Re-clicking the
**already-active** nav item is guarded too — `navBump` turns it into a full page remount that
destroys an open editor just the same. A missed call site fails **open** (navigates without asking),
never closed.

**Known gap, shared with every other dialog here:** `useDialogA11y` does not restore focus to the
trigger on close. Tracked in TODO.md; don't fix it in one dialog only.

### Global Search (`src/components/GlobalSearch.tsx`, added 2026-07-14, fixed against an
independent Codex review the same day)
Replaces the previously decorative, non-functional topbar search input (a bare `<input>` with no
`value`/`onChange`, plus a placeholder mentioning purchase orders/SKU/vendors — none of which are
modules this ERP has). Same visual chrome as the old box (`bg-secondary border border-border
rounded-lg`, `w-72`) at `lg:`+ so it doesn't look "redesigned," just made real.

**Placeholder**: "ค้นหาใบเสนอราคา ลูกค้า สินค้า หรือเมนู..." (Thai) / "Search quotations, customers,
products, or pages..." (English) — describes what this ERP actually has, not a generic e-commerce
template's vocabulary.

**Two rendered UIs, one shared state**: the same `query`/`results`/`activeIndex`/keyboard-handling
state drives two different visual surfaces depending on viewport width — never two independent
search sessions.
- **Desktop (`lg:`+, 1024px and up)**: inline `w-72` input; focusing or typing opens an anchored
  dropdown (`absolute left-0 top-full`, `w-[26rem]`, same card/border/shadow-xl treatment as
  `NotificationBell.tsx`'s panel and the user-menu dropdown — reuse that visual language for any
  future topbar dropdown rather than inventing a new one), closed by clicking outside (a `fixed
  inset-0` backdrop, same pattern as the notification/user-menu dropdowns) or Escape.
- **Mobile/tablet (below `lg`)**: a bare icon-only trigger button (`lg:hidden`) opens a full-screen
  takeover (`fixed inset-0 z-50 bg-background`) with its own input + an explicit close (X) button
  — a small anchored dropdown doesn't work well on a narrow screen, so this is a deliberate
  different layout, not a shrunk copy of the desktop one. **Added 2026-07-14 in a same-day Codex
  review fix pass** — the first version of this component had no visible search affordance at all
  below `lg`, and Ctrl/Cmd+K silently focused the now-invisible desktop input, doing nothing
  observable; a follow-up independent review correctly flagged this as High Priority for a global
  ERP-wide function. Ctrl/Cmd+K now checks `window.matchMedia("(min-width: 1024px)")` to decide
  which of the two UIs to open, so the shortcut is never a no-op regardless of viewport width.

**2026-07-14, second same-day addition — Quotation Templates group.** A new "Template ใบเสนอราคา" /
"Quotation Templates" result group (`api/_lib/searchHandler.ts`'s `searchTemplates()`) slots into
the same grouped results list, matched against `templateCode`/`templateName`/`jobTypeCode`/
`jobTypeName`/`description` (e.g. "Wet Scrubber", "Activated Carbon", "Bag Filter", "FRP Tank",
"FRP Lining", or a Job Type code like "SC"/"TA"). Only active, non-deleted templates are ever
returned. Clicking a result opens the Create Quotation wizard (see "Create Quotation Wizard"
below) with that Job Type + Template preselected, jumping straight to the wizard's Preview step
instead of the normal Step 1 Job Type grid — a different deep-link shape than every other search
category here, since a template result's natural destination is "preview this template," not "edit
this record." Falls back gracefully to the normal Step 1 grid if the template or its Job Type is no
longer valid (deleted/deactivated) by the time the link is followed. See
[MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) "Global Search Integration."

Debounced 300ms; results are grouped under headings (ใบเสนอราคา / ลูกค้า / สินค้า / Template
ใบเสนอราคา / เมนู / ผู้ใช้งาน, in that order), each capped at 5 rows. **Previous results stay visible during a
refetch** — only a small `Loader2` spinner appears next to the input (replacing the `Ctrl K` hint
badge on desktop) — never a blank flash between keystrokes, same "keep prior data visible while
loading" principle as Dashboard filter changes (see Progressive/Shell-First Loading below).

**Keyboard**: Arrow Up/Down move a highlighted selection across every visible group (one flat
index spanning all categories, not per-group — the active row auto-scrolls into view via
`scrollIntoView({block: "nearest"})` for longer result lists), Enter activates the highlighted row
(or the first row if none is explicitly highlighted yet), Escape closes whichever UI (desktop
dropdown or mobile panel) is currently open and blurs its input.

**Accessibility** (combobox/listbox ARIA semantics, added 2026-07-14 same-day fix pass — a review
found keyboard movement worked visually but had no assistive-technology semantics at all): each
input carries `role="combobox"`, `aria-expanded`, `aria-haspopup="listbox"`,
`aria-autocomplete="list"`, `aria-controls` (pointing at the results container's `id`), and
`aria-activedescendant` (pointing at the currently-highlighted row's `id`). The results container
is `role="listbox"`; each row is `role="option"` with `aria-selected` and a stable `id`. The
desktop and mobile UIs use separate `id` namespaces (`global-search-option-{desktop|mobile}-N`) —
both can be mounted in the DOM simultaneously (one hidden via CSS at a given viewport width), and
duplicate `id`s are invalid HTML regardless of which one is actually visible.

**Result rows**: icon + group heading, then per row a primary title (with the matched substring
highlighted via a simple `<mark>` — no fuzzy-match scoring, just a literal case-insensitive
substring wrap) plus one line of secondary context (e.g. a quotation's customer name/project/
status/salesperson/before-VAT amount; a customer's contact/phone/email; a product's category/
unit). Clicking or pressing Enter on a row navigates directly to that record's edit view (not just
the parent list page) via the same deep-link pattern `QuotationPage.tsx`'s `initialQuoteId` already
established — see `CustomersPage.tsx`/`ProductsPage.tsx`/`UserManagementPage.tsx`'s `initialEditId`
prop. **Customer results respect the caller's own edit permission** (2026-07-14 same-day fix): a
`customers:view`-only (not `customers:edit`) searcher lands on the filtered list instead of the
edit form, matching the same gate the list's own edit button already enforces — a review flagged
the deep-link as bypassing that gate. Products has no equivalent split (any `products:view` holder
can already open the edit form from the normal list UI, a pre-existing, separately-tracked gap —
see IMPLEMENTATION_CHECKLIST.md), so its deep-link is unchanged.

**States**: before typing (query under 2 characters) shows "พิมพ์อย่างน้อย 2 ตัวอักษรเพื่อค้นหา"; a
genuine zero-result search shows "ไม่พบข้อมูลที่ตรงกับ "{query}"" plus a one-line suggestion; a
failed request shows an error message + a "ลองใหม่" retry button, with the rest of the page
completely unaffected (the dropdown/panel is the only thing that shows an error — never a
full-page failure for a search request). Loading with zero results so far shows a bare centered
spinner, not the "no results" message (loading must never read as "confirmed zero"). A query is
also capped at 100 characters via the input's native `maxLength` (matching the server's real
enforcement — see RBAC.md/API.md), so an oversized paste is silently truncated rather than
producing an error.

**RBAC**: every result category is already filtered server-side before this component ever
receives a response — see [RBAC.md](./RBAC.md) "Global Search." This component renders whatever
groups the response contains and nothing more; it does not itself decide what a user is allowed to
see.

**Deliberately not built**: recent-search history (explicitly optional per the original
requirement).

### Cards
`bg-card border border-border rounded-xl`, padding `p-4`–`p-6` depending on density. Hover state on interactive cards: `hover:border-[#c9a84c]/30 transition-all`.

### Forms / Inputs
```
bg-secondary border border-border rounded-lg px-3 py-2 outline-none focus:border-[#c9a84c]/50 transition-colors
```
Labels: `text-xs text-muted-foreground block mb-1`/`mb-1.5` (**2026-07-13**: `text-[10px]` was previously offered as an equally-valid alternative here — don't use it for form field labels anymore, see the Typography section above; `text-[10px]` is still fine for uppercase-tracking-wide section eyebrows, which are a different, deliberately-small reading mode, not a form label). Error text: `text-xs text-[#e05252] mt-1`. In-table editable cells use transparent-background inline inputs (`bg-transparent border-0 outline-none focus:bg-secondary rounded px-1 py-0.5`) instead of full bordered inputs — see quotation line-items table.

**Field-pair grids** (two related inputs side by side, e.g. contact name/phone, issue/expiry date): always `grid-cols-1 sm:grid-cols-2`, never bare `grid-cols-2` — a bare 2-column grid forces two inputs into half a mobile screen each, which is how the quotation editor's Critical mobile-usability finding happened (2026-07-13, see CHANGELOG.md). This applies to any new field-pair grid you add, in any form.

### Required-Field Validation Components (added 2026-07-16)
Formalizes the pre-existing hand-repeated pattern (`<span className="text-[#e05252]">*</span>` next
to a label, `text-xs text-[#e05252] mt-1` error text) into shared components, first used by the
Quotation/Scope of Work completion-validation pass — reuse these for any new required-field UI
instead of re-inlining the markup:
- **`src/components/RequiredFieldLabel.tsx`** — `<RequiredFieldLabel>ชื่อลูกค้า</RequiredFieldLabel>`
  renders the label text + a red `*` (pass `required={false}` for an explicitly-optional field to
  render the label with no marker, e.g. an email/tax-ID field configured optional in
  `quotationRequiredFields`/`scopeOfWorkRequiredFields`).
- **`src/components/FieldError.tsx`** — `<FieldError message={validation.fieldErrors.contactName} />`,
  renders nothing when `message` is undefined, safe to always mount right under a field.
- **`src/components/ValidationSummary.tsx`** — one top-of-form banner:
  "ยังไม่สามารถดำเนินการต่อได้ / กรุณากรอกข้อมูลที่จำเป็นให้ครบ N รายการ" plus up to 8 itemized
  messages. Not itself the enforcement — see Required-Field Validation Architecture below.
- **`src/components/DocumentCompletionIndicator.tsx`** — compact "N%" progress chip for a toolbar,
  a user aid only, never the actual gate.
- **`src/pages/quotation/ChecklistGroupCard.tsx`** (renamed from `ScopeOfWorkChecklistGroup.tsx` when
  Quotation briefly reused it for its own checklist groups; that Quotation-side section was removed
  again the same day — see below — but the component itself stays under this name since Scope of
  Work still uses it) — takes `required`/`error` props for the red-asterisk-in-title + inline error
  variant.

### Required-Field Validation Architecture (Quotation + Scope of Work, added 2026-07-16, buttons corrected + Quotation policy relaxed same day)
Real enforcement is never UI-only. `src/lib/validation/quotationValidation.ts`/
`scopeOfWorkValidation.ts` export the same pure functions the frontend calls to compute
`{valid, fieldErrors, groupErrors, missingCount}` on every render, and the server calls (value-
imported directly into the API bundle, no duplicated logic) before Print/Finalize/every
non-Draft-preserving workflow transition — a `422 DOCUMENT_INCOMPLETE` blocks the request even if a
client somehow bypassed the disabled button. Buttons that require a complete document carry a real
HTML `disabled` attribute plus `opacity-40 cursor-not-allowed` styling and a `title=` tooltip
explaining why (corrected from an earlier same-day pass that used only the styling/click-guard, not
a real `disabled` attribute — flagged Medium Priority by an independent Codex review). The `onClick`
guard (`guardedWorkflowAction()`/`handlePrintClick()` in `QuoteDocument.tsx`, the equivalent in
`ScopeOfWorkDocument.tsx`) is kept as a harmless defensive no-op for the now-unreachable "somehow
still clicked" case — the server 422 is the actual enforcement boundary regardless of what the
button's `disabled` state does. A server-returned `422`'s `fieldErrors`/`groupErrors` are merged
into the on-screen validation (`mergeServerValidationErrors()`, `src/lib/validation/types.ts`) so a
server-only rejection is visibly highlighted inline, not just toasted.

**Same day, later**: an explicit business decision reversed Quotation's *policy* (not the mechanism
above) back to a minimal one — only `client` is required; every other field, all line items, and the
entire "ข้อกำหนดเอกสารและการส่งมอบ" checklist section were relaxed/removed from Quotation. **Scope
of Work's own required-field policy is unaffected** — its 8 mandatory checklist groups, header
fields, and item rules are unchanged. See [MODULES/Quotation.md](../MODULES/Quotation.md)/
[MODULES/ScopeOfWork.md](../MODULES/ScopeOfWork.md) "Required-Field Validation" for the exact
current required-field/mandatory-group lists per document.

### Tables
Header row: `bg-muted/40` (or `/20`, `/30`), cells `text-[10px] font-mono font-semibold text-muted-foreground uppercase tracking-wider`. Body rows: `border-b border-border/50 hover:bg-secondary/30 transition-colors`. Sortable columns (Product list) show a chevron icon next to the active sort column, click toggles asc/desc. **Always wrap the `<table>` itself in a `<div className="overflow-x-auto">`** (nested inside the outer `bg-card border rounded-xl overflow-hidden` card so rounded corners still clip) so a narrow viewport scrolls the table horizontally instead of squeezing every column — `QuoteList.tsx`/`ProductList.tsx`/`AuditLogPage.tsx`/`UserManagementPage.tsx` were missing this until 2026-07-13; every other table already had it. Long free-text columns likely to overflow in practice (customer/client name, product name) should get `truncate max-w-[…]` plus a `title="..."` tooltip with the full value, matching `UserManagementPage.tsx`'s user-name column — don't let a long name force the whole row/table wider.

### Buttons
- **Primary**: `bg-[#c9a84c] text-[#0b1d3a] rounded-lg font-semibold hover:bg-[#f0c040]`
- **Secondary/outline**: `border border-border rounded-lg text-muted-foreground hover:text-foreground hover:border-[#c9a84c]/40`
- **Danger**: `bg-[#e05252] text-white hover:bg-[#c94444]` (used in `ConfirmDialog`'s destructive confirm)
- **Icon-only row actions**: `text-muted-foreground hover:text-[#c9a84c]` (or `hover:text-[#e05252]` for delete). **Do NOT use `opacity-0 group-hover:opacity-100`** (2026-07-29 UX pass — it hides the action from touch devices, which have no hover, and from keyboard users): use `opacity-50 hover:opacity-100 focus-visible:opacity-100` so the affordance is always discoverable. The NotificationBell delete button was migrated 2026-07-29; `LineItemsEditor.tsx` (line-item/sub-detail pin/tag/delete buttons) and `ScopeOfWorkItemsEditor.tsx` (item reorder/duplicate/delete buttons) were migrated 2026-07-30, which also added explicit `title`/`aria-label` to every one of them (several had none at all) and up/down keyboard-reorder buttons alongside their drag handles (native HTML5 drag events have no keyboard equivalent). Audit any remaining hover-only actions when touching their component.

### Dialogs
Use `src/components/ConfirmDialog.tsx` for any destructive confirmation and `src/components/PromptDialog.tsx` (added 2026-07-29) for any single-value text prompt (a rejection reason, a document number) — don't build a one-off, and **never use `window.prompt()`** (unstyled browser chrome, no Thai font, awkward on mobile; the three usages that existed were all migrated 2026-07-29). Shared pattern: fixed inset overlay (`bg-[#0b1d3a]/40`), centered card (`max-w-sm`), title + message, Cancel (outline) + Confirm (primary, or danger via ConfirmDialog's `danger` prop) buttons. PromptDialog supports `multiline` (reasons), `mono` (codes/numbers), and `requiredMessage` (inline blank-value error).

**Dialog semantics + busy-guard (2026-07-30 accessibility hardening pass).** Both `ConfirmDialog` and `PromptDialog` now use the shared `src/hooks/useDialogA11y.ts` hook: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on a real `<h2>` title, Escape-to-close, and a Tab focus trap confined to the dialog panel — previously plain unlabeled `<div>`s with no keyboard dismissal. Both also take a `busy?: boolean` prop that disables Cancel/Confirm while the confirmed action is still in flight — pass it whenever `onConfirm` kicks off an async request, so a double-click can't fire an irreversible action (finalize, delete) twice. `PromptDialog` additionally takes an `error?: string` prop for a server-side rejection (e.g. a 409 uniqueness conflict) shown below the input without closing the dialog or losing what the user typed — distinct from `requiredMessage`'s client-side blank check. Every quotation/Scope of Work/Delivery Order dialog was updated to wire `busy`; see `CHANGELOG.md`.

A **third** action (Save / Don't save / Keep editing) is `src/components/UnsavedChangesDialog.tsx`, added 2026-08-25 — again a new component rather than a prop on `ConfirmDialog`, because a third button changes button order, focus order and focus-trap membership for all 18 of its call sites, and because its `danger` prop colours the *confirm* button and so cannot express a safe primary beside a destructive secondary. See the Unsaved-Changes Guard section above.

For an action that needs a **free-text comment** attached (not just a yes/no confirm) — e.g. the quotation workflow's reject/cancel/approve actions — `QuoteDocument.tsx`'s `WorkflowActionDialog` (extracted 2026-07-30 into its own component so it can call `useDialogA11y` safely) is the pattern to copy: same overlay/card treatment as `ConfirmDialog`, a `<textarea>` for the comment (label indicates "(จำเป็น)" required or "(ไม่บังคับ)" optional depending on the action), inline error text if required-and-empty, Cancel (outline) + Confirm (danger-red for destructive actions like reject/cancel, gold for everything else) buttons, both disabled while the action is in flight. It isn't built on `PromptDialog` directly — the dynamic required/optional label and danger-vs-gold Confirm color aren't things `PromptDialog` models, and forcing them in risked a regression in the approval workflow — but it gets the identical accessibility treatment via the same `useDialogA11y` hook.

### Permission-Locked Form Fields
When a field/button should only be interactive for users with the right permission, don't just leave it enabled and rely on the save handler to reject the change — set `disabled={!canEdit}` directly on the input (Tailwind `disabled:opacity-60` / `disabled:cursor-not-allowed`), and omit the button entirely (not `disabled`) if the action itself shouldn't be attempted — see the sidebar (items are filtered out of the array, not rendered-and-disabled) and `QuoteDocument.tsx`'s workflow action buttons (each one is conditionally rendered based on `QuotePermissions`, not shown-but-greyed). Remember this is client-side display logic only, not enforcement — see [RBAC.md](./RBAC.md).

### Image Upload Fields
`src/components/ImageUploadField.tsx` (extracted 2026-07-13 from what was previously inlined only inside `SettingsPage.tsx`): a labeled preview box (`w-16 h-16` square or `w-28 h-16` wide, via the `aspect` prop) + Upload/Remove buttons + a size hint, client-side MIME/size pre-check (1MB) with inline error text, converts to a base64 data URL via `FileReader`. Use this for any new logo/stamp/signature-style upload field instead of re-inlining a copy — it currently backs Company Settings' logo/stamp fields (its Company Profiles counterpart was removed 2026-07-14 along with that module, see [MODULES/CompanyProfiles.md](../MODULES/CompanyProfiles.md)). The authoritative validation is still server-side (`validateImageDataUrl()` in `api/_lib/uploadValidation.ts`, 2MB cap) — this component's client-side check is fail-fast UX only, not the security boundary.

### Client-Side Image Compression (`src/lib/imageCompression.ts`, added 2026-08-14)
Every image-upload site in the app now runs the picked file through this shared utility before
storing/uploading it — pure Canvas API, no new npm dependency, no server-side change. Two exports:
`isCompressibleImage(file)` (a plain `file.type.startsWith("image/")` check, for a call site that
accepts mixed file types and needs to branch) and `compressImageFile(file, {maxDimension = 1920,
quality = 0.8})` — rejects a raw file over ~20MB before decoding (so a huge input can't hang the
tab), decodes via `createImageBitmap`, downscales only if either dimension exceeds `maxDimension`
(**never upscales** an already-smaller image), draws to an off-screen canvas, and encodes to WebP
via `canvas.toBlob()`. Returns `{ dataUrl, blob }` — the data URL for immediate preview/inline
storage (this app's existing base64-in-document convention, see [DATABASE.md](./DATABASE.md)) and
the raw `Blob` for a caller that needs its byte size (a post-compression cap check) or an
`ArrayBuffer`/base64 re-encode for a JSON upload body.

**Current call sites**: `ImageUploadField.tsx` (profile picture/company logo/stamp — compresses
then checks its byte cap against the *compressed* size, not the original); `SignaturePad.tsx`'s
Upload mode (same treatment against its own cap; Draw mode instead switches
`canvas.toDataURL("image/webp", 0.92)` directly — no resize needed for an already-small signature
canvas); `src/lib/serviceReports.ts`'s `uploadServiceReportPhoto()` (Service checklist Abnormal-item
photos — always compresses, since that `<input accept="image/*">` guarantees every file is an
image); `ScopeOfWorkDocument.tsx`'s `handleUploadAttachment()` (the one mixed-file-type site in the
app — only compresses when `isCompressibleImage(file)` is true; a PDF or other non-image
attachment passes through completely unchanged). Every cap check (`MAX_IMAGE_BYTES`/
`MAX_UPLOAD_BYTES`/`MAX_ATTACHMENT_BYTES`) is checked against the post-compression size, so
compression can only help a file fit under its cap, never hurt it. Every server-side
`validateImageDataUrl()` (`api/_lib/uploadValidation.ts`) already accepted `image/webp` before this
pass, so no server change was needed anywhere.

**Reuse this for any future image-upload field** instead of storing a raw picked file inline — the
whole point is smaller MongoDB documents and faster uploads for every existing and future
base64-in-document image field in the app.

### Sectioned Master-Data Forms — pattern reference removed 2026-07-14
The reference example for this pattern (group fields with more than fit one flat card into labeled
`Section` cards, `bg-card border border-border rounded-xl p-6 space-y-4` with an uppercase-tracking-wide
Playfair Display heading; required fields get a `<span className="text-[#e05252]">*</span>` marker;
a repeatable sub-list is its own bordered block per entry with an inline remove + "+ Add" button; an
unsaved-changes discard-confirmation fires on Cancel/breadcrumb-back when dirty) used to be
`CompanyProfileForm.tsx`/`CompanyProfileList.tsx`, both deleted when the Company Profiles module was
removed (see [MODULES/CompanyProfiles.md](../MODULES/CompanyProfiles.md)). The pattern description
itself is still good guidance for any future form that needs it — `ProductForm.tsx`/`SettingsPage.tsx`
follow variations of the same idea — just without a dedicated example component to point to anymore.

### Search-and-Pick Autofill (Quotation's Customer selector, added 2026-07-14)
`CustomerSelector.tsx` (`src/pages/quotation/`) is the reference pattern for "search a saved
master-data list and pick one to autofill several other fields, which then stay independently
editable." A text input filters a client-side-fetched list (matched across several fields —
company name/contact/phone/email/tax ID here) and shows a dropdown of matches; picking one calls a
single `onSelect(record)` callback and the *caller* (not the selector) owns copying whichever
fields it wants into its own state — the selector itself holds no autofill logic. Once selected,
the input collapses to a compact "chip" (icon + name + a clear `×`) rather than staying a live
search box, so it's visually obvious a record is linked vs. still being searched for. Clearing
returns to the manual search-and-pick state without discarding whatever was already autofilled —
"unlink the record," not "erase the form." Where the link is not editable in a particular context
(here, once a quotation has left Draft status), the whole control is `disabled` with a short note
explaining why, not hidden — the user should still see what's currently linked.

**Superseded pattern (2026-07-13–2026-07-14, historical)**: an earlier `IssuerCompanySelector.tsx`
used a `<select>` + always-visible live preview card instead — that component and the feature it
served (and, later the same week, the entire admin module behind it) were removed (see
[MODULES/CompanyProfiles.md](../MODULES/CompanyProfiles.md)), but the general shape (fallback
ordering from most-specific-still-real to least-specific, empty-state-replaces-picker-when-zero-records,
non-hidden-but-disabled-with-a-reason for a locked selection) remains good guidance for any *other*
future reference-picker that also needs a live preview panel, not just autofill-then-edit.

### Create Quotation Wizard (`QuotationTemplateWizard.tsx`, added 2026-07-14)
Clicking "สร้างใบเสนอราคา / Create Quotation" now opens a dynamic-step wizard instead of jumping
straight to a blank document — Job Type (always step 1) → Template choice (only shown when the
selected Job Type has 2+ active templates — today, only SC) → Preview → the normal quotation form,
pre-filled but still fully editable. See [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md)
for the full business flow and the Job Type → Template mapping.

**Same overlay/step-flow visual language as the rest of the app** — no new modal/dialog pattern was
introduced. Each screen reuses existing card/grid/button conventions (Cards, Buttons above) rather
than inventing wizard-specific chrome. Four screen states, one per step:
- **Job Type grid**: a card grid of active Job Types, same card hover treatment as elsewhere.
- **Template choice** (SC only today): shown only when 2+ active templates exist for the selected
  Job Type — every other mapped Job Type has exactly one template and **auto-advances straight to
  Preview**, skipping this screen entirely so a single-template Job Type never makes the user click
  through a pointless one-option "choice."
- **Empty state** (a Job Type with zero templates): reuses `EmptyState.tsx`'s pattern (icon, title,
  one-line explanation) with three explicit next-step buttons — "เริ่มจากใบเสนอราคาเปล่า" (start
  blank), "เลือกประเภทงานอื่น" (pick a different Job Type), "แจ้งผู้ดูแลระบบ" (shows a toast, no
  backend call — there's no ticketing system to actually notify anyone).
- **Error state** (a failed template fetch): short Thai message + a "ลองใหม่" retry button, same
  retry-affordance convention used elsewhere in this app (Global Search's failed-request state,
  `SectionLoading`'s `error` prop).
- **Preview**: Job Type/template name/description, a section list with per-section item counts,
  total counts, source file/sheet name, version, and the first 6 included item names — enough for a
  Sales user to confirm "this is the right template" without opening the full quotation form first.
  "ย้อนกลับ" (back), "ใช้ Template นี้" (apply), and "เริ่มจากแบบฟอร์มเปล่า" (start blank, always
  available regardless of whether a template exists) are the only three actions.

**Always an escape hatch to the old blank-form flow.** "เริ่มจากแบบฟอร์มเปล่า"/"เริ่มจากใบเสนอราคาเปล่า"
appears on every screen that could otherwise dead-end a user (the empty state and the Preview
screen) — the wizard is additive, never a mandatory extra step standing between a Sales user and a
quotation they don't want a template for.

### Section-Header Lines (Quotation editor + print, added 2026-07-14)
A `QuoteLine` can be `isSectionHeader: true` (copied from a `QuotationTemplate` section's title when
a quotation is created from a template — see [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md)
"Section-Header Rendering"). Renders as a **full-width bold divider row**, not an ordinary priced
line — no unit/qty/price/discount inputs/columns at all — in both `LineItemsEditor.tsx` (marked
with a "§" glyph instead of a line number) and `PrintDocument.tsx` (a full-width `colSpan={7}` bold
row). Item numbering ("No." column) in both places **skips section headers entirely**, so a
template-seeded quotation's visible numbering stays a clean 1, 2, 3... instead of leaving gaps at
each divider. A section header with no items left under it (e.g. every item beneath it was deleted
but the header itself was kept) is silently omitted from the printed PDF — an empty section heading
on a real customer document reads as a mistake, not intentional structure, so it's dropped rather
than printed blank. If you build a future template/section-style feature, follow this same
"skip-in-numbering, omit-if-empty-in-print" pair rather than inventing a new convention.

### Progressive/Shell-First Loading (App boot + Dashboard, added 2026-07-14, reworked the same day
after an independent Codex review's High Priority findings)
Render the app shell (sidebar, header) as soon as the session check resolves — don't also wait on
the slower bulk domain-data fetch behind it. `src/App.tsx`'s boot `useEffect` sets `bootStatus =
"ready"` immediately once `fetchSession()` confirms an authenticated user, then fires every domain
fetch (`fetchUsers`/`fetchRoles`/`fetchQuotes`/etc.) independently — each one's own `setState` call
runs the moment *that* fetch resolves, not gated behind a shared `Promise.all`.

**Per-page resource gating, not one global flag.** The first version of this pass tracked loading
behind a single `initialDataLoading` boolean shared by all 9 boot resources — a review correctly
flagged that this still globally blocked *every* prop-driven page (Quotations/Products/Customers/
Users/Roles/Settings) until the *slowest* of all nine resolved, even for a page that only reads one
or two of them. Fixed: each resource has its own `resourceStatus` entry (`"loading"|"ready"|
"error"`), and a `NAV_RESOURCES` map names which resources each page actually needs (e.g.
`products: ["products", "categories"]`). A page's own `pageDataLoading`/`pageDataError` is computed
only from its required subset, so navigating straight to Products no longer waits on unrelated
`notifications`/`quotes`/`users` fetches. Pages gated this way show a small `SectionLoading`
placeholder (spinner + "กำลังโหลดข้อมูล...") in the content area while their own resources are still
loading, instead of either blocking the shell or rendering a false "no records yet" empty state from
still-empty arrays. Pages that fetch their own data (Dashboard, Audit Log) render immediately
regardless, gated by neither mechanism. **Rule of thumb for any future boot-time resource**: add it
to `resourceStatus`/`loadDomainData`, then list it under `NAV_RESOURCES` only for the pages that
actually read it — never fall back to one shared flag for convenience.

A page-level fetch failure surfaces a small, scoped error with a retry button (`SectionLoading`'s
`error` prop, or `DashboardPage.tsx`'s own `ErrorState`) — never a full-app error screen, unless the
failure is the session check itself (`BootError`, the one case where nothing meaningful can render
yet).

**Section-first, not just shell-first, on first load.** On `DashboardPage.tsx`: the page
title/description/filter bar render before the first `/api/dashboard` fetch resolves (split into a
`DashboardContent` subcomponent so only the data-driven widget area shows a loading state on first
load) — but the *data-driven area itself* also mirrors the real required section structure rather
than one anonymous pulsing block: real section titles/table headers (via the same `t()` keys and,
where applicable, the same `ChartCard` component the loaded state uses) with pulsing bars standing
in for values/rows underneath. This avoids a layout/text jump once the real data arrives — only the
placeholders inside each section resolve. A later filter change, retry, or workflow-triggered
refresh (e.g. Approve/Reject from the Approval Dashboard widget) keeps the previously-loaded data on
screen and shows a small "กำลังอัปเดตข้อมูล..." label + spinner next to the page title instead —
never reverting to the first-load skeleton, and never silently refreshing with zero visible
indication (a review flagged the latter: an approve/reject refresh previously updated `stats` with
no on-screen sign anything was happening).

**Section-level resilience on the server side too.** `GET /api/dashboard` isolates each optional
section (index creation, activity timeline, sales activity, approval dashboard, notification
summary) in its own `try/catch`, degrading to `null`/a safe default instead of 500ing the whole
response — so a transient failure in one auditLog-backed section can't take KPIs/pipeline/every
other section down with it. Apply the same pattern to any future endpoint that bundles several
genuinely-independent, permission-gated, or best-effort sections into one response: the parts every
caller needs (and that everything else derives from) can fail together, but parts that are optional/
gated/best-effort should fail *individually*.

Do not build a new full-page blocking spinner/skeleton for a page-level fetch if the page can
instead render its static chrome immediately and let only the data-dependent part show a lightweight
loading state — that's the standard to follow for any future page-level fetch in this app.

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

**Per-page/per-document tours (2026-07-29)**: `useModuleTour(tourKey, userId, steps, opts?)` in the same file gives an individual page or document editor its own tour with per-user "seen" tracking (`src/lib/tour.ts`), auto-started once (600 ms after mount) and replayed via the shared **`TourReplayButton`** component (also exported from `GuidedTour.tsx` — use it, never hand-roll the HelpCircle button; 11 pre-extraction copies remain, tracked in TODO.md). To add a tour: define the `DriveStep[]` with `tour.<key>.<step>.title`/`.desc` i18n keys (Thai + English), put matching `data-tour` attributes on the real elements, and mount the hook **in the component that renders the anchors**. `opts.autoStart` gates the one-time auto-fire and re-arms when it flips false→true — pass a *readiness* condition when the anchors/described UI appear asynchronously (`!!record` for fetched documents, stricter when a step describes conditional UI, e.g. DeliveryOrder's `installments.length > 0`, QuoteDocument's `isDetail`) or a *policy* condition (Dashboard's `hasTourCompleted(userId)` so it never races the main tour). Dismissal (Done/×/Escape/overlay) marks the tour seen; unmount deliberately does not.

### Dashboard Overview (KPIs + status/activity panels)
**2026-07-13, seventh same-day pass (current state)**: the Dashboard's top-of-page "answer in 5 seconds" overview is now exactly **5 rows in the P'Keng/P'Kee business requirement's specified order** — Header+Filters, then:
1. **`ExecutiveSummaryCards.tsx`** — exactly 4 cards, no more: Total Quotations, Total Quotation Value, Closed Sales, Expected Sales. `text-2xl font-mono` value, compact `p-4` card, a one-line `helper` caption under the value on **every** card (added this pass — previously only Expected Sales had any sub-text, via an (i) tooltip), plus `MetricInfoTooltip` still only where the calculation genuinely isn't obvious from the helper text alone (currently just Expected Sales). **This is the only place on the Dashboard that should look like a "KPI card" — everything else uses a table, compact grid, or tile row.**
2. **`QuotationStatusSummary.tsx`** — full width, no longer paired with the forecast chart (that moved to supporting detail, see below). Won/Lost/Active/Non-Active as one donut + table panel (Status/Count/Value/Percentage columns), not 4 separate cards. Takes only a `kpis` prop (no `pipeline`) — count and value both come from `DashboardKpis` fields computed with the *identical* server-side predicate (`closedSales`/`lostValue`/`activeQuotationsValue`/`nonActiveQuotationsValue`), so they can never describe different populations; don't reintroduce a pipeline-derived value approximation here.
3. **`SalesActivityAnalytics.tsx`** — full width. Quotation activity as a **stacked** bar chart (5 categories: Created/Edited/Status Changed/Approval Requested/Approval Completed via `categoryForAction()` in `api/dashboard/index.ts`, one `stackId` with 5 `<Bar>`s, not grouped) + a period table, week/month/quarter/year tabs, filtered server-side by the same global salesperson/department filters (**not** the date filter's `from` — see "Filter Honesty" below). **Added this pass**: a second table below it, "สรุปตามพนักงานขาย" (per-salesperson breakdown) — ช่วงเวลา/พนักงานขาย/เปิดใบเสนอราคาใหม่/แก้ไขใบเสนอราคาเก่า/กิจกรรมรวม columns, sourced from `data.bySalesperson[grouping]`, Created/Edited only (matching the requirement's named event types, distinct from the 5-category chart above it).
4. **`ActivityTimeline.tsx`** ("กิจกรรมล่าสุด" / Recent Activity Details) — rebuilt this pass from a card list into a table: วันที่/พนักงานขาย/กิจกรรม/ใบเสนอราคา/ลูกค้า columns. The quotation-number cell is a clickable gold link (`onOpenQuote`) when the entry carries a `relatedQuoteId`, else "—"; same for the customer-name cell and `relatedCustomerName`.

`SalesPerformancePanel.tsx` (Win/Lose/Conversion Rate, Average Deal Size, Average Approval/Closing Time, Active/Non-Active Quotations — 8 metrics), `ExpectedSalesForecastChart`, and `ActivityFollowUpSummary.tsx` (Pending Approvals/Overdue Follow-ups/Expired Quotations/New Customers tiles) moved **below** the top overview into the "supporting detail" section this pass — real, still filter-aware, still-computed data, just not named in the business requirement's required-5 list. Nothing was deleted.

**Filter honesty (added 2026-07-13)**: several Dashboard widgets are deliberately not fully scoped by the date/salesperson/department filter bar — `RevenueTrendChart` intentionally ignores the filter's *start* date to keep a real trailing window instead of collapsing to 1-2 points; `ProductsByCategoryChart` and `NotificationSummary` are deliberately always-all-time/personal; the forecast's historical win-rate baseline is deliberately company-wide, not salesperson-scoped, for statistical stability. These are considered, documented business decisions (see the code comments in `api/dashboard/index.ts` next to each one), not bugs — but an independent review correctly flagged that the UI stayed silent about it, which reads as a filtering bug from the outside. **Every such widget's `sub`/caption text must say so explicitly** (e.g. "ไม่ขึ้นกับตัวกรอง" / "not filtered", "แนวโน้มย้อนหลัง ไม่จำกัดโดยวันเริ่มต้นของตัวกรอง" / "rolling trend, not limited by the filter's start date") — if you add a new widget with a similar exception, label it the same way rather than leaving it silent. **2026-07-13, eighth pass**: rolling-window widgets also now append their actual anchor date ("— สิ้นสุดที่ [date]" / "— ending [date]") via an `anchorDate` prop (`DashboardPage.tsx` computes it as `stats.filters.to || todayIsoBangkok()`) and `fmtDateShort()` (`format.ts`) — a generic "rolling trend" disclaimer alone doesn't tell the user what date it ends on; any new rolling-window widget should follow the same pattern, not just the static caption.

**2026-07-14, second same-day pass — `SalesActivityAnalytics` is no longer a filter-honesty exception; it's a filter-honesty *example*.** A follow-up Codex review flagged that this section's "rolling trend, not limited by filter's start date" claim was more than an honestly-labeled exception — the underlying query genuinely never applied `from`/`to` at all, so selecting a narrow date range like "Today" still silently showed a full rolling trend built from all-time data, which fails the "filters must affect all Dashboard sections" requirement outright (this is the *required* Sales Activity Analytics section, not an optional supporting widget like `RevenueTrendChart`). Fixed by bounding the query's `createdAt` by the selected `from`/`to` (`bangkokDayBoundsUtc`, same as `activityTimeline` already did) whenever either is set. `SalesActivityAnalytics.tsx` now takes a `dateFiltered: boolean` prop (`DashboardPage.tsx` passes `!!stats.filters.from`) that switches its caption between the original "rolling trend" copy (no filter selected — same rationale as `RevenueTrendChart`, a real trailing window is needed to be readable) and a new "กรองตามช่วงวันที่ที่เลือก" / "filtered to the selected date range" copy (a filter is selected — the section is now genuinely scoped, not just labeled as an exception). **Lesson for future Dashboard widgets with a similar "rolling trend by default" design**: if the widget is one of the P'Keng/P'Kee-*required* sections, prefer making it genuinely filter-bound (with a rolling-trend fallback only when no filter is active) over merely labeling an always-on exception — reserve the label-only "Filter Honesty" pattern above for truly optional/supporting widgets where an unconditional rolling trend is the better UX tradeoff.

**Pre-Tax Amount Labeling (added 2026-07-14, made a user-selectable toggle 2026-08-14)**: every
Dashboard monetary value (KPI cards, Status Summary, rankings, job-type/customer analytics,
forecast, revenue trend, CSV/Excel export) is computed in one of two modes, switched by a toggle in
`DashboardFilterBar.tsx` — **pre-tax (before VAT)**, the default, or **post-tax (including VAT)**,
added 2026-08-14 per direct user request. `Quote.amount` (the VAT-included grand total) is still
never read directly anywhere on the Dashboard in either mode — both figures are independently
recomputed from `lines`/`discount`, see [MODULES/Dashboard.md](./MODULES/Dashboard.md) "VAT
Toggle." Every label touching a money value must say so explicitly, and now dynamically, via the
`dashboard.vatSuffix.pre`/`.post` i18n keys: pre-tax renders "ก่อนภาษี" (the 4 KPI card titles/
helpers and the Status Summary's "มูลค่ารวมก่อนภาษี" column use the exact P'Keng/P'Kee-specified
wording; supporting-detail tables/charts/CSV/Excel headers use a "(ก่อนภาษี)" suffix; English
labels append "(Before VAT)"), post-tax renders "รวม VAT 7%" / "(incl. VAT 7%)". Every affected
component takes a `vatMode: DashboardVatMode` prop (`"pre" | "post"`, `src/lib/dashboard.ts`) fed
from the server-echoed `stats.filters.vatMode` — never local UI state — so a label can never
disagree with the value it's attached to. If a future widget ever needs to show a fixed-mode
figure regardless of the toggle, it must still be labeled loudly (e.g. "รวม VAT" / "incl. VAT")
rather than left ambiguous — the default assumption for any unlabeled Dashboard amount is
whichever mode the toggle is currently set to, never silently one or the other.

**Shared `Toggle` component (added 2026-08-14)**: `src/components/Toggle.tsx` — a small on/off
switch button (`role="switch"`, `aria-checked`, `aria-labelledby`), extracted out of
`SettingsPage.tsx` (which previously defined an identical control inline; it now imports this
component instead). Used by the Dashboard's VAT toggle above. Reuse this for any future on/off
switch instead of re-inlining the markup.

**Win/Lose/Active/Non-Active definition (reconfirmed 2026-07-13, seventh pass)**: only formally-closed `ปิดการขายสำเร็จ` (Won) / `เสียโอกาส` (Lost) statuses count toward Win/Lose anywhere on the Dashboard (Win Rate, Closed Sales, Average Deal Size, Revenue Trend, `QuotationStatusSummary`). `ลูกค้ายอมรับ` (Customer Accepted) and `ลูกค้าปฏิเสธ` (Customer Rejected) stay Active/Non-Active respectively, **not** Win/Lose — a business-stakeholder spec this pass proposed the opposite mapping, but the user explicitly chose to keep today's definition everywhere rather than fork the calculation. Do not change this mapping without an equally explicit decision, since it's cross-cutting (touches every KPI/chart that mentions Win/Lose). **2026-07-13, eighth pass fix**: the 4 `QuotationStatusSummary` rows (Won/Lost/Active/Non-Active) are now a true partition — `NON_ACTIVE_OUTCOME_STATUSES` no longer includes Lost, since Lost already has its own row; previously a Lost quote counted in both rows, so the Percentage column summed to more than 100%. If a new outcome bucket is ever added to this table, make sure its predicate doesn't overlap any existing row's predicate — every quote should land in exactly one row.

**History**: 2026-07-10 (UI/UX redesign) split the original flat ~20-card grid into a two-tier hierarchy (`PrimaryKpiCards.tsx` 6 hero cards + `SecondaryKpiSummary.tsx` 9 mini-cards), which also silently stopped rendering 7 KPI fields the API still computed. **2026-07-13, first revert**: merged back into one flat `KpiGrid.tsx` (22 uniform cards) after the tiered hero-card treatment read as "template-like." **2026-07-13, second revert**: even the flat 22-card grid still read as cluttered with no hierarchy — `KpiGrid.tsx` deleted, replaced by `ExecutiveSummaryCards`/`SalesPerformancePanel`/`ActivityFollowUpSummary`. **2026-07-13, third pass**: `SalesActivityAnalytics` promoted into the top overview per a fully-specified 7-section order, and Active/Non-Active Quotations added to `SalesPerformancePanel`. **2026-07-13, fourth pass (sixth same-day)**: Sales Activity expanded to 5 categories. **2026-07-13, fifth pass (seventh same-day, current state)**: reordered to the exact 5-row business-requirement layout above, `SalesPerformancePanel`/`ActivityFollowUpSummary`/the forecast chart moved to supporting detail, per-salesperson activity table + clickable Recent Activity links added. `totalCustomers`/`totalLeads`/`totalProducts`/`repeatCustomers` still don't get individual dashboard tiles (visible instead via `CustomerAnalytics.tsx`/the Products page) — still computed server-side, just not part of this overview. **Don't reintroduce a flat many-card KPI grid or a tiered hero-card hierarchy** — if a new top-level metric is added, put it in whichever of the 4 top-overview components above matches its theme, never a new large card.

### Sales Pipeline Visualization
`src/pages/dashboard/PipelineSteps.tsx` (added 2026-07-10) replaces a `recharts` `FunnelChart` (`PipelineFunnel.tsx`, removed) that squeezed 9 Thai status labels into a shrinking funnel silhouette — labels overlapped and it read as broken. The replacement is horizontal, connected step cards (stage name badge, count, value, conversion % from the previous stage), with the 3 "left the pipeline" outcomes (Customer Rejected/Lost/Cancelled) shown as a separate row below the main Draft→...→Won flow, since they're branches off the main path, not sequential steps in it. If a future chart ever starts overlapping labels or squeezing real data into a fixed shape again, prefer this step-card/table pattern over forcing a chart library to work — see the Chart Requirements note in `MODULES/Dashboard.md`.

### Notifications (Toast)
`src/components/Toast.tsx` + `src/hooks/useToast.ts`. Fixed bottom-right, navy background, gold check icon, auto-dismisses after 2.8s. Use `const toast = useToast()` then `toast.show("message")`; render `<Toast message={toast.message} />` once per page. Don't build a second toast implementation.

### List/Tree Reordering (up/down buttons, not drag-and-drop)
Added 2026-07-15 for Template Management's section/item editor (`src/pages/templates/TemplateEditorView.tsx`). This codebase has no drag-and-drop dependency anywhere and one wasn't added just for this — reordering uses plain `ArrowUp`/`ArrowDown` icon buttons per row, disabled at the top/bottom of the list, swapping the item with its neighbor and renumbering `sortOrder` on every move. Prefer this pattern over introducing a DnD library for any future reorderable list (matches the "hand-rolled Tailwind, no UI kit" convention above) unless a genuinely large list makes button-clicking impractical.

**Existing exception, predates this rule**: `LineItemsEditor.tsx`'s sub-details editor (quotation line items) already used native HTML5 `draggable`/`onDragStart`/`onDragOver`/`onDrop` attributes — zero library, just browser-native drag events — for its own reordering, since before this rule was written down. `ScopeOfWorkItemsEditor.tsx` (added 2026-07-15, see `MODULES/ScopeOfWork.md`) follows that older, more directly-analogous quotation-editor precedent instead of this one, for its item-row reordering. Both remain dependency-free; pick whichever existing precedent is closer to what you're building (a short flat sub-list → native drag, matching `LineItemsEditor.tsx`; a nested section/item tree → up/down buttons, matching `TemplateEditorView.tsx`) rather than introducing a third pattern.

### Clarifying-Tooltip Pattern for Actions That Sound Bigger Than They Are
Added 2026-07-15 (second Codex-review fix pass) on Template Management's "นำเข้าจาก Excel" button (`TemplateManagementPage.tsx`) — a plain HTML `title` attribute on the button explaining precisely what the action does (checks the source workbook for changes + imports pre-transcribed content, not yet a fully-automatic Excel-to-Template conversion), after an independent review flagged the button label as potentially misleading on its own. Use this pattern — a `title` tooltip, not a whole new UI element — whenever a short button label alone could reasonably be over-read by an admin as doing more than it actually does; keep the label itself short and put the caveat in the tooltip rather than making the button text long.

### Responsive Rules
Grids use Tailwind breakpoints (`grid-cols-2 xl:grid-cols-4` etc. for card/KPI grids — 2 columns even at mobile width is fine for short stat cards; `grid-cols-1 sm:grid-cols-2` for form field-pairs — see Forms/Inputs above, a bare `grid-cols-2` on real form inputs is a bug, not a stylistic choice).

**2026-07-13, second pass — a real (if still bounded) mobile pass now exists**, prompted by an independent Codex review that found the app genuinely unusable at phone widths. Supersedes the same-day-earlier "no dedicated mobile layout" note:
- **Sidebar**: a true off-canvas drawer below `md` (768px) — see Sidebar above. No more permanent 64px/256px rail eating phone-width screen space.
- **Topbar**: progressive disclosure via `sm:`/`lg:` breakpoints instead of a fixed-width layout that would've clipped under `overflow-hidden` — see Topbar above.
- **Quotation editor, User/Role Management forms, Setup Wizard**: every field-pair grid is `grid-cols-1 sm:grid-cols-2`, not bare `grid-cols-2` — see Forms/Inputs above.
- **Page headers** (`QuoteList`/`ProductList`/`AuditLogPage`/`UserManagementPage`/`RoleManagementPage`): title+action rows are `flex flex-wrap gap-3`, not unqualified `justify-between`; fixed-width (`w-72`) search boxes in header rows are `w-full sm:w-72`.
- **Tables**: every table scrolls horizontally (`overflow-x-auto`) instead of squeezing columns — see Tables above.

**Still not done** (tracked in TODO.md, not attempted): no breakpoint-driven component swapping beyond what's listed above (e.g. no dedicated compact-card table alternative for phones — tables still scroll rather than reflow into cards); Dashboard's chart cards use fixed pixel heights (200–260px) that aren't re-tuned per breakpoint; no systematic mobile pass on every remaining page (Settings tabs, Product form, print/PDF) beyond what an actual bug report/review has flagged so far — this is bug-driven hardening, not a from-scratch mobile redesign. Xl-breakpoint KPI/chart grids are unchanged (2/3/4-column card grids were never the actual overflow risk; unqualified form grids and the sidebar/topbar shell were).

### Print / PDF
Use Tailwind's `print:` variant, not custom media-query CSS, for anything that should hide/show when printing. The established pattern (since 2026-07-09, `PrintDocument.tsx`): don't interleave print and screen markup in the same components — build a **separate, dedicated print-only component** (root class `hidden print:table`/`print:block`) that receives the same data as the screen view, and mark every screen-only editing component `print:hidden` at its own root instead of tagging individual descendants. This is simpler to reason about than the earlier approach of scattering `print:hidden` / `hidden print:table-row` pairs through a shared component (`QuoteDocument.tsx`/`LineItemsEditor.tsx` were refactored off that pattern), and is required for the next rule below.

**Repeating print headers**: when a printed document needs its header/buyer-info/column-headers to repeat on every page (multi-page quotations, invoices, etc.), wrap the whole document in one `<table>` and put the repeating content in a `<thead>` — browsers natively repeat `<thead>` content across page breaks in print, verified end-to-end with a forced multi-page quotation (see `MODULES/Quotation.md`). Put one-time content (totals, notes, signature blocks) as ordinary `<tbody>` rows at the end, never in a `<tfoot>` (which also repeats every page). Known limitations of this approach: the header can't vary its content by page number (e.g. "full header on page 1, condensed on page 2+") since `<thead>` content is static, and there is no reliable cross-browser way to render "Page X of Y" from CSS alone in a browser print/PDF context — both are accepted simplifications, not bugs to chase.

A small `@media print { @page { size: A4 portrait; margin: 12mm } }` rule lives in `src/styles/index.css` for page size/margins (`size: A4 portrait` made explicit 2026-07-15, Codex review Medium fix on Scope of Work — previously only `margin` was set, leaving paper size to each browser's own default).

**Browser-generated headers/footers (website URL, print date, page title) — suppressible ONLY via a zero-margin page (2026-07-24), otherwise not app-controllable.** Exception discovered on Delivery Order after a direct user report ("มันมีลิ้งเว็บอยู่ในใบซ้ายล่างเอาออกด้วย"): the browser draws these texts only inside the `@page` margin area, so a document that sets `@page { margin: 0 }` (moving its real margins onto the page content as `padding`) gets no URL/date/title at all, even with the dialog checkbox on — verified with Chrome's header/footer layer force-enabled via headless `page.pdf({ displayHeaderFooter: true })`. `DeliveryOrderPrintDocument.tsx` does this with a component-scoped `<style>` tag (unmounts with the view, so other documents keep the global 12mm rule). Only use this for documents whose print output owns whole pages: inside one flowing wrapper, only left/right padding carries across page breaks, so continuation pages start at the physical paper edge — acceptable for Delivery Order's one-page-per-milestone shape. Also note a user manually selecting non-default margins in the print dialog restores the browser margin area and its texts. The original (still true for margin-bearing documents) analysis: 2026-07-16: investigated a report that a website URL appears at the bottom-left of printed Quotations/Scope of Works. Confirmed by code inspection this is **not app-rendered** — `PrintDocument.tsx`/`ScopeOfWorkPrintDocument.tsx` never render a URL anywhere (Quotation's `CompanyHeaderInfo.website` is always hardcoded to `""` in `QuoteDocument.tsx` and is never even read by the print component), and `src/styles/index.css`'s only `@media print` block contains no footer/URL content. The URL is Chrome/Edge's own "Headers and footers" print option (page URL + date + page title/number), which the browser injects into the print output itself — **`@page` CSS margins do not control this and cannot disable it**; there is no DOM/CSS API a web page can use to turn off a browser's print headers/footers. Both "Print" and "Export PDF" are the same `window.print()` call (see Architecture — there is no server-generated PDF anywhere in this app).

**2026-08-04: the zero-margin trick was extended to Quotation's flowing, multi-page `PrintDocument.tsx`, per direct user request** ("อยากให้เอาส่วนด้านบนตรงตรงออกเวลากดพิมพ์ใบเสนอราคาละก็ลิงก์ซ้ายล่างของใบ") — despite the "wrong for flowing tables" caveat above, since the user explicitly weighed the trade-off and chose it (offered via `AskUserQuestion`: full zero-margin + compensating padding vs. keep the old tooltip-only approach). Compensation approach: `@page { margin: 0 }` scoped to `PrintDocument.tsx` (same component-scoped `<style>` pattern as Delivery Order) plus `padding: "0 12mm"` on the outer `<table>` for left/right (repeats every page automatically, since it's inherent to each row's box), `pt-[12mm]` added to the letterhead block inside `<thead>` (repeats every printed page, restoring the top inset on continuation pages too), and `pb-[12mm]` on the final `<tr>` (the signature block) for the bottom inset on the last page. Known accepted gap: an interior page break (page 2 of a 3+-page quote, at the point content runs off the bottom) has no bottom inset — content runs to the physical page edge there, same trade-off already accepted for Delivery Order's single-page-per-milestone shape, just now also true for Quotation's occasional multi-page case. The now-stale `quotation.printHint.*` i18n keys and the `MetricInfoTooltip` hint next to Quotation's Print button (telling users to manually disable "Headers and footers") were removed since the browser no longer draws them at all.

**Same day, same session: extended to Scope of Work's `ScopeOfWorkPrintDocument.tsx` too**, after the user asked to check whether Scope of Work/Delivery Order had the same issue and fix it if so. Delivery Order already had the fix (2026-07-24, see above) — genuinely clean, nothing to do there. Scope of Work's print view turned out to share the exact same shape as Quotation's (one continuously-flowing `<table>`/`<thead>` across potentially several pages), so the identical fix was applied verbatim: component-scoped `@page { margin: 0 }`, `padding: "0 12mm"` on the outer `<table>`, `pt-[12mm]` on the `<td className="pt-[12mm] px-0 pb-0">` wrapping the letterhead (was `p-0`, split into explicit top/horizontal/bottom so only top gained the inset), `pb-[12mm]` on the final signature-block row. Its own `scopeOfWorkDoc.printTipLabel`/`.printTipText` i18n keys and `MetricInfoTooltip` hint (next to the Print button in `ScopeOfWorkDocument.tsx`) were removed the same way. Same accepted interior-page-break gap as Quotation.

**Keeping a heading and its own detail row together across a page break**: `breakInside: "avoid"` on a single `<tr>` only stops a break *inside* that row — it does nothing to stop a break falling *between* that row and a sibling detail/spec row right after it. Added 2026-07-15 (Scope of Work's `ScopeOfWorkPrintDocument.tsx`, Codex review Medium fix): group the heading row and its own following detail row into one dedicated `<tbody style={{ breakInside: "avoid" }}>` per logical item, instead of one shared `<tbody>` for the whole table — a `<table>` may contain any number of sibling `<tbody>` elements, and the outer `<thead>` still repeats on every page regardless of how many `<tbody>`s follow it. Prefer this pattern over a bare per-row `breakInside: "avoid"` whenever "don't split a heading from its first detail line" is a real requirement (matches `Quotation`'s `PrintDocument.tsx`-adjacent concern too, though that file hasn't been revisited under this specific rule — see MODULES/ScopeOfWork.md).

**Forcing a hard page break between independent print "pages"**: Delivery Order (`DeliveryOrderPrintDocument.tsx`, added 2026-07-23) is the first document in this app printed as several genuinely separate documents from one screen — one per payment installment, each with its own full letterhead/header/signature block, not a continuously-flowing multi-page table like Quotation/Scope of Work. Pattern (revised 2026-07-24): render one sibling wrapper `<div className="hidden print:block">` per document with `style={{ breakAfter: "page" }}` — the browser starts a fresh physical page after each. Applying it unconditionally (including the last one) is safe: `break-after: page` on the final element doesn't produce a trailing blank page.

**Chromium only repeats a printed `<thead>` when it's reasonably small** (learned 2026-07-24, Delivery Order print rebuild): with the entire letterhead + titles + customer-info block inside the `<thead>`, Chromium silently stopped repeating it on continuation pages *at all* — no error, just a headerless page 2. If a document's header block is tall, keep the letterhead outside the table as an ordinary block (it then prints once, on the first page) and put only the compact repeating rows (intro line + column headers) in the `<thead>`. This deliberately supersedes the "wrap the whole document in one table" rule above for documents with a tall letterhead — Quotation/Scope of Work's shorter theads still repeat fine.

**Web fonts never load for print-only DOM** (real bug found 2026-07-24, Delivery Order): a print-only component is `display:none` on screen, so the browser never lays out its glyphs and never downloads any web font only *it* uses — printing then silently falls back to whatever system font the machine has (on this bug: Thai text printed in a random system Thai font instead of Noto Serif Thai, varying per machine). Calling `document.fonts.load()` from a mount effect is NOT a reliable fix — it runs before the Google Fonts stylesheet has registered the `@font-face` rules and matches nothing. The working pattern (see `DeliveryOrderPrintDocument.tsx`): render a zero-size probe span that stays in normal flow (`visibility: hidden; position: fixed; width/height: 0` — crucially NOT `display:none`) containing sample text in every family+weight the print layout uses; the CSS engine itself then fetches the fonts as soon as the page mounts.

**Formal reference-form documents (FM-SL-05 etc.) do not use the app design system.** The Delivery Order print layout (rebuilt 2026-07-24 against the reference PDF in `public/`) is deliberately plain black-on-white Times/Noto-Serif-Thai with thin black borders — no navy/gold, no Playfair/Inter, no rounded corners. When a printed document reproduces a real company form, the form is the design authority, not this guideline file; keep the app design system for screens and for app-native documents like the Quotation PDF.
