# Changelog

> Append-only. Never delete or rewrite previous entries — correct forward with a new entry instead.

---

## 2026-07-21 (later) — Create Quotation wizard UX fixes + manual "Add Section" on the quotation line-items editor

**Feature**: Three user-reported usability issues fixed, all in the Create Quotation flow:
1. **Job Type grid ordering** (`QuotationTemplateWizard.tsx` Step 1): Job Types whose code starts
   with `"OTHER"` (`OTHER`, `OTHER BF`, `OTHER SC`, `OTHER TA`) previously sorted alphabetically
   alongside the real categories (BF, BI, GA, LI, OTHER, OTHER BF, OTHER SC, OTHER TA, SC, ...) —
   now partitioned client-side so all `OTHER*` codes render after every non-`OTHER` Job Type, keeping
   their relative order otherwise. `fetchJobTypes()`'s own server-side order is untouched, since Job
   Type admin/Dashboard filters read the same list and weren't asked to change.
2. **Cancel button visibility** (same screen): the Step 1 "ยกเลิก" button was a bare muted-gray text
   link with no border, easy to miss — restyled to the app's standard outline/secondary button
   pattern (`border border-border ... hover:border-[#c9a84c]/40`, matching `docs/UI_GUIDELINES.md`
   "Buttons" and e.g. `TemplateEditorView.tsx`'s own Cancel button), not a new one-off style.
3. **Manual "Add Section" on the quotation line-items editor** (`LineItemsEditor.tsx`): the Template
   editor has always had a "เพิ่ม Section" button; a plain quotation built from scratch (not from a
   Template) had no equivalent — section-header divider lines were only ever reachable by applying a
   Template. Added a matching "เพิ่ม Section"/"Add Section" button to the line-items toolbar that
   appends `{ ...blankLine(), isSectionHeader: true }` directly — the exact same line shape a
   template-applied section header already produces (zero-priced, freely editable/removable, skipped
   from "No." numbering, hidden from print if no items follow it — all pre-existing behavior, no
   changes needed there).

**Files Modified**: `src/pages/quotation/QuotationTemplateWizard.tsx` (Job Type sort + Cancel button
style), `src/pages/quotation/LineItemsEditor.tsx` (new `addSectionHeader` handler + toolbar button),
`src/lib/i18n.tsx` (1 new key × Thai/English: `quotation.lineItems.addSection`)

**Files Removed**: none

**Reason**: Direct user feedback on the Create Quotation wizard screenshot — OTHER categories
cluttering the primary grid, an easy-to-miss Cancel button, and a real functional gap (no way to add
a section divider outside the Template flow).

**Notes**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass clean. Not browser-verified
this pass — same sandboxed MongoDB Atlas DNS-block limitation recorded in the entry above (`vercel
dev` proxies `/api/*` correctly but `querySrv` to `_mongodb._tcp.tcsdb.zdnus3w.mongodb.net` is
network-refused from this sandbox).

---

## 2026-07-21 — Quotation Template editor restyled to mirror the real quotation document

**Feature**: Visual-only redesign of the Template Management create/edit form
(`src/pages/templates/TemplateEditorView.tsx`) at the user's request ("ทำหน้าตาให้เหมือนหน้าใบเสนอราคา
เลยก็ได้หรือปรับแก้ให้ User friendly มากที่สุด") — the form previously read as a generic gray-bordered
admin settings page with no visual relationship to the quotation it produces. It now reuses the exact
patterns from `QuoteDocument.tsx`/`LineItemsEditor.tsx`: a navy (`#0b1d3a`)/gold (`#c9a84c`) document
header band with the `BrandMark` logo and an active/inactive status pill, a two-column meta grid
("ข้อมูล Template" / "การตั้งค่า") with uppercase mono section labels matching the quotation's
customer-info/doc-details grid, a table-styled Sections/Items list (mono uppercase column headers,
borderless inline inputs, hover-highlighted rows, an expandable detail row for
specifications/sub-details/parameters/internal notes — the same shape as the quotation's line-items
table), and a 3-column Terms block (payment/warranty/tax side by side) echoing the printed document's
signature-block layout. No data model, validation, save/load, or permission logic changed — every
existing handler (`updateSection`/`addItem`/`moveItem`/etc.) is untouched, only the JSX/styling
around them.

**Files Modified**: `src/pages/templates/TemplateEditorView.tsx` (full JSX restyle, `ItemEditor`
converted from a stacked-div card to a `<tr>`/`<Fragment>` table row to match `LineItemsEditor.tsx`'s
row pattern), `src/lib/i18n.tsx` (5 new keys × Thai/English: `templates.form.templateInfo`,
`templates.form.settingsSection`, `templates.form.col.no`, `templates.form.col.type`,
`templates.form.col.name`)

**Files Removed**: none

**Reason**: User asked specifically for the template-editing screen to look like the real quotation
page ("ทำหน้าตาให้เหมือนหน้าใบเสนอราคาเลยก็ได้") rather than the plain form it was.

**Notes**: `npx tsc --noEmit` and `npm run lint` both pass clean. Could not browser-verify live against
this session's sandboxed environment — `vercel dev` starts and correctly proxies `/api/*` to the real
serverless handlers, but MongoDB Atlas's SRV DNS lookup (`_mongodb._tcp.tcsdb.zdnus3w.mongodb.net`) is
network-blocked from this sandbox (`ECONNREFUSED` on `querySrv`), so every API call 500s before the
authenticated page can render — the same class of sandboxed-session network limitation already
documented for the Dashboard module in `docs/CLAUDE.md`'s module table, not a defect in this change.

---

## 2026-07-20 (Codex review round 4) — Live verification closes the MongoDB reconciliation gap; unpushed button commit found

A third independent Codex review of both rollbacks (`HEAD` at `8cfc9fe`) found 0 Critical, 1 High, 0
Medium, 0 Low: `git`/source evidence for both rollbacks was confirmed correct, but the review flagged
that the FRP Lining v2.0 → v1.0 rollback was code/seed-only — nobody had confirmed the live
`quotation_templates` MongoDB record for `LI-FRP-LINING` actually matched the reverted seed, since no
authorized database access had been available in any prior session.

**Resolved with real evidence, not just re-assurance**: with the user's explicit go-ahead, logged
into the actual live production app (https://tcs-erp-nine.vercel.app) as an authenticated Super
Admin via a real browser session and inspected the live Template Management page directly.
`LI-FRP-LINING` was already showing genuine v1.0 content — version `1.0`, 1 section, 17 items,
`Structure layer`/`Operating cost`/`Prepare surface` sub-items, the original tax-note wording — with
"last edited" `14 ก.ค. 2569` (its original creation date) for every one of the 5 seeded templates.
The audit log (server-authoritative, non-forgeable) showed the only prior `Templates Imported`
events were on `15 ก.ค. 2569` — **nothing ran the import between the FRP v2 deploy and its revert**,
so the live master record never actually received v2 content in the first place; the concern the
review raised, while a reasonable thing to check, didn't correspond to a real data-state problem.
Clicked "นำเข้าจาก Excel" (the same `POST /api/quotation-templates/import` route) live anyway to get
a formal, verifiable record: `200 OK`, and every template's "last edited" timestamp stayed unchanged
afterward — confirming the hash-gated importer correctly detected zero content difference and made
zero writes (all 5 templates reported `skipped`). No quotation was ever created under Job Type `LI`
either (0 of the 7 real quotations), so there was never any historical-data risk from this gap.

**A second, previously-unknown gap was discovered during this same live check**: `git status` showed
local `master` sitting 1 commit ahead of `origin/master` — the Cancel/Back button-visibility rollback
commit (`8cfc9fe`) had been created locally but never pushed. A live DOM inspection of an open
quotation's back-link button confirmed its actual rendered `className` on production still exactly
matches the deleted `src/lib/buttonStyles.ts`'s `backLinkButtonClass()` output — the button rollback
is correct and complete in git, it simply was never deployed. Not pushed this pass either, per this
project's established "push only when explicitly asked" convention — tracked in `docs/TODO.md`.

No console errors on a fresh page load or after any of the actions above. `npm run lint`/
`npm run build` pass clean (unchanged from the prior two rollback passes — no code was modified this
pass, only live verification and documentation). See `docs/CODEX_REVIEW_REPORT.md` "Claude Fix
Status" for the full write-up.

---

## 2026-07-20 (second rollback) — Revert Cancel/Back button visibility improvement

Per an explicit rollback request, restored every Cancel/Close button and breadcrumb-style Back link
to its exact pre-2026-07-16 style — the low-contrast `border-border`/`text-muted-foreground`
treatment with no dedicated focus ring, before the 2026-07-16 visibility pass and its 2026-07-20
Codex-review fix pass (0 Critical, 1 High, 3 Medium, 1 Low) both existed. This is a **targeted,
git-history-verified rollback**, not a broad reset: a safety backup branch
(`backup-before-button-rollback-2026-07-20`, at commit `9050a24`) was created before touching
anything, and every change was verified against real prior commits, never guessed.

**Git boundary identified**: `git log --oneline --all -i --grep="cancel\|back.*button"` found
`27f6927` ("Fix Cancel/Back button visibility issues from Codex review (1 High, 3 Medium, 1 Low)")
as the single commit containing both the original 2026-07-16 visibility pass AND the 2026-07-20
Codex-review fixes to it (both were uncommitted work squashed into one commit at the time, same
pattern as every other pass in this project's history) — its own commit message confirms this
("Fixes the 2026-07-20 independent review's findings on the **prior** Cancel/Back visibility pass").
`27f6927^` (its parent) is the verified "before" state.

**Why a full `git revert 27f6927` was rejected**: attempted first, but it produced merge conflicts
on `docs/CHANGELOG.md`/`docs/PROJECT_STATUS.md` (both have since gained new, legitimate append-only
entries from the two FRP Lining rollback passes) and proposed **deleting
`docs/reviews/CODEX_REVIEW_2026-07-20.md` entirely** — that file was newly created by `27f6927`, but
has since become the shared canonical dated-archive review record for multiple, completely unrelated
later reviews (FRP Lining v2.0, its Codex reviews, this session's own rollback documentation) —
deleting it would have destroyed real, unrelated historical content. Aborted (`git revert --abort`)
and switched to a surgical, file-by-file restoration instead.

**What was restored, file by file, using `git show 27f6927 -- <file>` as ground truth (never
guessed)**: reverted the specific button `className` hunks in `src/components/ConfirmDialog.tsx`,
`src/pages/admin/{RoleManagementPage,UserManagementPage}.tsx`,
`src/pages/customers/CustomersPage.tsx`, `src/pages/dashboard/ApprovalDashboard.tsx`,
`src/pages/products/{CategoriesManager,ProductForm,ProductPickerModal}.tsx`,
`src/pages/quotation/{QuotationTemplateWizard,QuoteDocument,ScopeOfWorkDocument}.tsx`,
`src/pages/templates/{TemplateEditorView,TemplateManagementPage}.tsx` (14 call sites across 13
files) back to their original inline Tailwind class strings, removed every now-dead
`buttonStyles`-related import, and deleted `src/lib/buttonStyles.ts` (confirmed via repo-wide grep
that nothing else had adopted it since). `docs/UI_GUIDELINES.md`'s added "Cancel / Close / Back"
section (41 lines) was removed via `git checkout 27f6927^ -- docs/UI_GUIDELINES.md` (that file had
no other changes since `27f6927`, confirmed via `git log`, so this targeted restore was exact and
safe). `docs/CHANGELOG.md`/`docs/PROJECT_STATUS.md`/`docs/IMPLEMENTATION_CHECKLIST.md`/
`docs/CODEX_REVIEW_REPORT.md`/`docs/reviews/CODEX_REVIEW_2026-07-20.md`'s historical entries about
the original work were deliberately left untouched (append-only) — this entry and matching notes in
the other status docs record the rollback instead.

**Verification**: `git diff 27f6927^ -- <file>` produced **zero output** for all 11 files touched
only by the button-visibility work — byte-identical to the verified pre-change state. The 2 files
that also had legitimate, unrelated later changes (`CustomersPage.tsx`'s `StatusBadge` extraction,
`TemplateManagementPage.tsx`'s column-alignment fix, both from commits between `27f6927` and the FRP
Lining work) were checked individually: the diff against `27f6927^` shows only those unrelated
changes remaining, confirming the button styling was fully restored without touching them. Only
visual style was touched — no `onClick` handler, navigation target, form-reset logic, API call, or
RBAC check was changed anywhere (confirmed by inspecting every diff before applying its reversal).
`npm run lint`/`npm run build` pass clean.

---

## 2026-07-20 (rollback) — Revert FRP Lining v2.0 / generic Dynamic Fields system

Per an explicit rollback request, reverted the FRP Lining v2.0 work in full via two `git revert`
commits (of `699b09d` "FRP Lining v2.0 Dynamic Fields system, Codex-review fix pass, and
code-review hardening" and `74a768d` "FRP Lining v2.0: exact-wording alignment + Codex review
round 3") — **not** a broad `git reset --hard`, and not a rewrite of git history: the two original
commits, their full history, and everything before/unrelated to them remain intact and inspectable.

**Scope verified before reverting**: the two reverted commits were consecutive on `master` (nothing
else touched the same files in between or since) and, together, touched exactly 26 files — all
either FRP Lining/Quotation-Template/Quote source files or documentation describing that same work.
No Dashboard, Warehouse, Customers, Scope of Work, or RBAC permission file was ever touched by
either commit, so nothing outside Quotation Templates could have been affected either way. The
commit immediately preceding them ("Center-align Section/Item count columns on Quotation Templates
list", `74d2b21`, directly below this entry) is unrelated generic Template-list UI polish and was
left untouched.

**Result — confirmed via `git diff --stat 74d2b21` producing zero output**: the working tree is now
byte-identical to the last commit before any FRP Lining v2.0 work existed. Concretely:
- `LI-FRP-LINING` is back to its original v1.0 content — the real Excel-transcribed structure (items
  with `Prepare surface`/`Grinding`/`Sandblasting` as sub-items, `Concrete surface repair work` and
  `Operating cost` as their own items, `Safety cost and accessories` with `Standard package include
  PPE, Blower, Gas detector` as a sub-item) — version `"1.0"`, matching the other 4 seeded templates
  which were never touched by the v2.0 work in the first place.
- The generic `TemplateDynamicField`/`TemplateFieldOption`/`TemplateFieldVisibilityRule`/
  `TemplateConditionConfig` schema, `TemplateItem.dynamicFields`, `QuotationTemplate.defaultNotes`/
  `.conditions`, and their `Quote`-side counterparts (`QuoteLine.sourceTemplateItemId`/
  `dynamicFields`, `Quote.notes`/`vatConditionText`/`warrantyText`/`deliveryDays`) are removed —
  confirmed via a repo-wide grep for `dynamicFields`/`TemplateDynamicField`/
  `omitFromCustomerDisplay` returning zero matches in `src/`/`api/`.
- The two new files this system added (`src/lib/templateDynamicFields.ts`,
  `src/pages/quotation/ConditionAndNotesEditor.tsx`) are deleted.
- The admin Template editor (`TemplateEditorView.tsx`), the wizard, `LineItemsEditor.tsx`,
  `PrintDocument.tsx`, `TemplatePreview.tsx`, `applyTemplate.ts`, and `quoteValidation.ts`/
  `quotationTemplatesHandler.ts` are all back to their pre-FRP-Lining-v2.0 behavior — plain
  `specifications`/`subDetails`/`editableParameters` only, no nested conditional-field system.

**MongoDB — code/seed reverted, live data NOT independently re-imported this pass**: this rollback
reverts the *code and seed source*. The live `quotation_templates` collection's `LI-FRP-LINING`
document will keep whichever content the last successful `POST /api/quotation-templates/import` run
actually wrote (which may still be v2.0, if that import ran while v2.0 was live) until
`POST /api/quotation-templates/import` is run again — the idempotent, hash-gated importer will then
detect the reverted seed's changed content hash and `$set`-update the existing document back to v1.0
(same `templateCode`, so still no duplicate). This session had no live MongoDB/Vercel credentials to
run that import directly (the same recurring sandboxed-session limitation as every prior pass on this
project) — **running the import once against the live database is a required manual follow-up** to
actually apply this rollback to production data, separate from the code being reverted and deployed.

**Existing Quotations remain fully compatible either way**: a `Quote` never reads the live master
template — every quote (from any template, at any point) freezes its own independent
`templateSnapshot` at creation time and renders/validates against that frozen copy forever after (this
architecture is unchanged by this rollback, since it predates the v2.0 work and was never touched by
it). If any quotation was actually created from `LI-FRP-LINING` v2.0 while it was live (this session
could not check — no live database access), it keeps its own frozen `sections`/`dynamicFields`/
`conditions`/`notes` snapshot data untouched by this rollback and remains fully readable/printable —
the removed *code* no longer offers a UI to create a NEW v2.0-shaped quote, but it never touched
already-persisted quote documents, and the `QuoteFields` schema's `notes`/`vatConditionText`/
`warrantyText`/`deliveryDays`/`dynamicFields` properties are (and always were) optional, so an old
document that happens to have them set is simply not read/rendered by the reverted code — no crash,
no `undefined` display, no data deleted.

`npm run lint`/`npm run build` pass clean after the revert; the production bundle also shrank back
down (`QuotationPage` ~151KB → ~138KB, `TemplateManagementPage` ~44KB → ~35KB, `TemplatePreview`
~9.8KB → ~7.2KB gzipped-source estimates from the build output), consistent with a clean, complete
removal rather than a partial one. See `docs/PROJECT_STATUS.md` for the current module status and
`docs/TODO.md` for the still-required manual MongoDB re-import follow-up.

---

## 2026-07-20 (later still) — Center-align Section/Item count columns on Quotation Templates list

User-reported polish: the "จำนวน Section"/"จำนวนรายการ" column header and values on
`TemplateManagementPage.tsx`'s list table were left-aligned like the surrounding text columns, which
read awkwardly for a short numeric count. Both `<th>`s and `<td>`s now use `text-center` instead of
`text-left`. Purely visual, no data/behavior change. `tsc --noEmit` and `npm run lint` pass clean.

## 2026-07-20 (later) — Fix status-badge text wrapping; extract shared `StatusBadge` component

The "ใช้งาน" (active) status badge on the Quotation Templates list was wrapping mid-word onto two
lines ("ใช้" / "งาน"). Root cause: unlike its sibling `<td>`s in the same row, the status cell had no
`whitespace-nowrap` — Thai script has no spaces, so the browser's dictionary-based line breaking can
wrap it at a syllable boundary even without one. The same copy-pasted badge markup (missing the same
class) was found in `CustomersPage.tsx` and `ProductList.tsx` too, so all three were fixed the same
way. Following a code review of that fix, the duplicated badge markup (archived/active/inactive
color+label logic, repeated verbatim in all three files) was extracted into a new
`src/components/StatusBadge.tsx` (`status: "archived" | "active" | "inactive"` + `label`), which all
three pages now use — the `whitespace-nowrap` fix (and any future styling change) now lives in one
place instead of three. No behavior change. `tsc --noEmit`, `npm run lint`, `npm run build` all pass
clean.

## 2026-07-20 — Cancel/Back visibility: Codex-review fix pass (1 High + 3 Medium + 1 Low)

Fixed every issue an independent review (`docs/CODEX_REVIEW_REPORT.md`, `docs/reviews/CODEX_REVIEW_2026-07-20.md`)
found in the 2026-07-16 Cancel/Back visibility pass below (0 Critical). Purely visual/structural, no
behavior/logic/navigation changes — every `onClick` handler is untouched.

- **High**: `QuotationTemplateWizard.tsx`'s two "เลือกประเภทงานอื่น" (Choose another Job Type) recovery buttons
  (template-load-error and no-template-found states) still had the old low-contrast, no-focus-ring treatment —
  they were missed by the 2026-07-16 pass. Fixed to the same treatment as every other Back/secondary control in
  the wizard; `backToJobType` handler unchanged.
- **Medium (focus ring contrast)**: every Cancel/Back/Close focus ring used `ring-[#c9a84c]/50` (gold at 50%
  opacity), which composites to ~1.4:1 contrast against white/card backgrounds — below the WCAG 3:1 minimum for
  a focus indicator (full-opacity gold alone only reaches ~2.3:1). Changed to solid `ring-[#0b1d3a]` (navy,
  ~17:1 against white) across all three shared button-class builders (see below).
- **Medium (touch targets)**: several compact Cancel/Back controls measured ~26–32px tall (`py-1`/`py-1.5` at
  11–12px text), and `ProductPickerModal.tsx`'s icon-only Close had no padding at all (~16px hit area). Bumped
  the compact sizes' vertical padding one step, and gave every icon-only Close button `p-2 -m-2` (padding offset
  by a matching negative margin, so the icon's visual size/position is unchanged but its hit area grows).
  Neighboring primary/gold buttons in the same row were bumped by the same amount so row heights stay aligned.
- **Medium (unnamed modal Close buttons)**: `CustomersPage.tsx`'s customer-form × and
  `TemplateManagementPage.tsx`'s template-preview × had no `aria-label` and no focus-visible style (the
  2026-07-16 pass's changelog entry incorrectly said `ProductPickerModal` was the only such control). Both now
  use the same `iconCloseButtonClass()` + `aria-label={t("common.close")}` pattern as `ProductPickerModal`.
- **Low (duplicated styling)**: the Cancel/Back/Close class strings were copy-pasted verbatim across ~15 files —
  flagged as the root cause that let the two wizard buttons above go unfixed. Extracted into
  `src/lib/buttonStyles.ts` (`secondaryButtonClass()`, `backLinkButtonClass()`, `iconCloseButtonClass()`) and
  migrated every touched call site to it, so the next visual/contrast fix only needs to change one file. See
  [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Buttons" → "Cancel / Close / Back."
- Files changed: `src/lib/buttonStyles.ts` (new), `src/components/ConfirmDialog.tsx`,
  `src/pages/admin/{RoleManagementPage,UserManagementPage}.tsx`, `src/pages/customers/CustomersPage.tsx`,
  `src/pages/dashboard/ApprovalDashboard.tsx`, `src/pages/products/{CategoriesManager,ProductForm,
  ProductPickerModal}.tsx`, `src/pages/quotation/{QuotationTemplateWizard,QuoteDocument,
  ScopeOfWorkDocument}.tsx`, `src/pages/templates/{TemplateEditorView,TemplateManagementPage}.tsx`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Manually verified in a local dev server via
  Playwright (normal/hover/focus/disabled states rendered correctly with the app's real compiled Tailwind CSS,
  0 console errors); full logged-in click-through of every listed page was not possible — this sandboxed session
  has no network path to MongoDB Atlas (recurring, pre-existing limitation, see PROJECT_STATUS.md Known Risks),
  the same constraint every past pass has hit. See `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" for the
  full itemized writeup.

## 2026-07-16 (same day, later still) — Improve Cancel/Back button visibility app-wide

Purely visual pass, no behavior/logic changes: every Cancel/Close button and every bare breadcrumb-style
Back link across the app was hard to notice — the shared bordered-Cancel treatment
(`border-border` at 10% opacity + `text-muted-foreground`) fails WCAG AA contrast at the app's normal
button text sizes (12–14px), and the toolbar "Back to Quotations/Products/..." links had *no* button
chrome at all (bare `text-muted-foreground` text on the page background). Fixed both, using only existing
design tokens/hex literals already in convention (no new colors, no new component library):

- **Cancel/Close buttons** (`ConfirmDialog.tsx`; every create/edit form's footer Cancel — `ProductForm.tsx`,
  `CustomersPage.tsx`, `UserManagementPage.tsx` ×2, `RoleManagementPage.tsx`, `TemplateManagementPage.tsx`'s
  duplicate modal, `TemplateEditorView.tsx`; `ApprovalDashboard.tsx`'s reject-modal Cancel;
  `QuoteDocument.tsx`'s workflow-action and Scope-of-Work-prompt modal Cancels; `ScopeOfWorkDocument.tsx`'s
  empty-state Back; `QuotationTemplateWizard.tsx`'s Cancel/step-Back buttons) now get a clearer neutral
  border, a subtle `bg-secondary` tint, higher-contrast text (`text-foreground/75` instead of
  `text-muted-foreground`), `font-medium`, and a visible `focus-visible` ring — see
  [UI_GUIDELINES.md](./UI_GUIDELINES.md) "Buttons" → "Cancel / Close."
- **Breadcrumb-style Back links** (`ProductForm.tsx`, `CategoriesManager.tsx`, `QuoteDocument.tsx`,
  `ScopeOfWorkDocument.tsx`, `TemplateEditorView.tsx`, `QuotationTemplateWizard.tsx`) go from bare text to
  a subtle bordered/tinted chip with the same contrast + focus-ring treatment, `-ml` compensated so the
  visible icon/text doesn't shift against whatever sits below it — see UI_GUIDELINES.md "Buttons" →
  "Back links."
- Deliberately **not** touched: `QuoteDocument.tsx`'s red-outlined "Cancel Quotation" workflow button (a
  destructive business action intentionally styled like Danger, not a UI dismiss action), and every
  non-Cancel/Back secondary button sharing the old outline classes (Export, Duplicate, Save Draft, Add
  Section, Retry, Skip Tour, etc.) — those keep the existing Secondary/outline pattern unchanged.
- Added `aria-label={t("common.close")}` + a focus ring to `ProductPickerModal.tsx`'s icon-only header
  Close (×) button — the one icon-only close control in the app with no accessible name.
- No navigation destinations, cancel/discard logic, or API/RBAC behavior changed — every button's
  `onClick` handler is untouched; only `className` (plus one `aria-label`) changed.
  `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.

## 2026-07-16 (same day, later) — Remove website URL from printed documents

Investigated a report that a website URL appears at the bottom-left of printed Quotations and Scope
of Works. Root cause confirmed **not app-rendered**: `PrintDocument.tsx`/`ScopeOfWorkPrintDocument.tsx`
never render a URL anywhere (Quotation's `CompanyHeaderInfo.website` is always hardcoded to `""` and
never read by the print component), and `src/styles/index.css`'s only `@media print` block has no
footer/URL content. The URL is Chrome/Edge's own browser-injected "Headers and footers" print option
(page URL + date + title/page number) — a browser print-dialog setting, not something a web page's
CSS/DOM can control or disable (`@page` margins do not affect it). Since the app cannot suppress it,
added a small `MetricInfoTooltip.tsx` info-icon hint next to the Print button in both
`QuoteDocument.tsx` and `ScopeOfWorkDocument.tsx` (inside the existing `print:hidden` toolbar, so the
hint never appears in the printed output itself) instructing users to disable "Headers and footers"
in their browser's print settings before printing or saving as PDF — covers both "Print" and "Export
PDF" since both are the same `window.print()` call. No print CSS or print-document component changes
were needed (both were already clean). New i18n keys `quotation.printHint.label`/`.text` (Thai +
English); Scope of Work's hint uses plain hardcoded Thai text, matching that file's existing
convention. `tsc --noEmit` (both projects), `lint`, and `build` all pass clean. See
[UI_GUIDELINES.md](./UI_GUIDELINES.md) "Print / PDF" → "Browser-generated headers/footers."

## 2026-07-16 (same day) — Quotation: make fields optional again, remove Document Requirements and Delivery

**Latest business decision, overriding the two required-field validation passes immediately above.**
Users must not be forced to complete every Quotation field, incomplete Drafts must remain fully
supported, and the "ข้อกำหนดเอกสารและการส่งมอบ" (Document Requirements and Delivery) section must
be removed from Quotation entirely. **Scope of Work's own UI, schema, validation rules, print/PDF,
and permissions are untouched** — every Scope of Work field, section, and component behaves exactly
as before. One file was intentionally edited as a compatibility adjustment, not a feature change:
`api/_lib/scopeOfWorkHandler.ts`'s `deriveFromQuotation()` — see "Snapshot Behavior" below.

### Quotation required fields relaxed to the historical minimum

`quotationRequiredFields` (`src/lib/validation/quotationValidation.ts`) now marks only `client` (the
customer name) as `required: true` — every other field (`salesperson`, `contactName`,
`contactPhone`, `contactEmail`, `address`, `taxId`, `deliveryMethod`, `deliveryAddress`, `project`,
`poRef`, `paymentTerms`, `issueDate`, `expiryDate`, `jobTypeCode`, `remarks`, `followUpDate`,
`isPotentialOpportunity`) is now `required: false`. This is not a new, invented rule — `client` was
the **only** field this codebase ever required before required-field validation was added at all;
every other field required by the two passes above is walked back to that original, least-
restrictive behavior. `jobTypeCode` remains required **only at creation** (a separate, pre-existing
check in `POST /api/quotes`, `validateJobType(..., { required: true })`) — never re-enforced on
edit/submit/print, matching how it always worked. Line items are no longer required at all:
`validateQuotationLines()`, `REQUIRE_LINE_SPECIFICATIONS`, and the "at least one line" rule were
removed from `quotationValidation.ts` — a quote may be submitted/printed with zero or blank lines,
same as before required-field validation existed. Semantic date-format checking (a non-blank date
must be a real calendar date) is kept — that's a data-integrity check, not a "field is required"
rule, and it never blocks an empty date.

### Document Requirements and Delivery removed from Quotation

Quotation's `checklistGroups` field (Safety/ขนส่ง/Logo/เงื่อนไขการวางบิล/เอกสารส่งถึง/Nameplate/
เงื่อนไขการส่งมอบงาน/ปจ.2 — added in the immediately-preceding pass) is removed entirely:
- `Quote`/`QuoteDraftFields` (`src/lib/quotes.tsx`) no longer have a `checklistGroups` field.
- `api/handlers/quotes.ts` no longer generates, accepts, sanitizes, or returns `checklistGroups` —
  `sanitizePartialQuoteFields()`, the create handler, `handlePrintQuote()`, and `handleWorkflow()`'s
  finalization check all had their checklistGroups-related code removed. The `normalizeQuote()`
  wrapper (which backfilled missing checklist groups on read) is gone; every response goes back to
  plain `withStringId()`.
- `QuoteDocument.tsx` no longer renders the "ข้อกำหนดเอกสารและการส่งมอบ" card, imports
  `ChecklistGroupCard`, or tracks `checklistGroups` state.
- **`ChecklistGroupCard.tsx` itself is NOT deleted** — Scope of Work still uses it for its own
  (unchanged) checklist groups. Only Quotation's usage of it was removed.
- **`src/lib/documentRequirements.ts`/`api/_lib/documentRequirements.ts` are NOT deleted or
  changed** — `buildDefaultChecklistGroups()`/`sanitizeChecklistGroups()`/`withDefaultChecklistGroups()`/
  `validateChecklistGroups()`/`MANDATORY_CHECKLIST_GROUP_KEYS` all still exist, unchanged, and are
  still fully exercised by Scope of Work.
- `api/_lib/scopeOfWorkHandler.ts`'s `deriveFromQuotation()` — which, in the immediately-preceding
  fix pass, was changed to copy `quote.checklistGroups` into a new Scope of Work as a snapshot — now
  always calls `buildDefaultChecklistGroups(quote.jobTypeCode)` instead, since there is no longer a
  `quote.checklistGroups` to copy. This is the **only** Scope-of-Work-adjacent code touched this
  pass, and it doesn't change Scope of Work's own behavior at all: a newly-created Scope of Work's
  checklist groups start unchecked exactly as they always did before the short-lived "copy from
  quotation" feature existed (which itself only existed for one same-day fix pass).
- `LineItemsEditor.tsx`'s `lineErrors`/`noLinesError` props (and its `FieldError` usage) — added to
  support the now-removed line-item requiredness gate — were reverted; the component no longer
  accepts or renders per-line/no-lines error state.

### Legacy data compatibility

No destructive migration. A Quotation saved during the ~1-day window this feature existed may still
carry a stray `checklistGroups` property in MongoDB — it's simply never read, written, or displayed
by any current code path (the TypeScript type no longer declares it, but extra untyped properties on
an already-fetched plain object are harmless and ignored). Existing Quotations — complete or
incomplete, with or without the legacy field — continue to load, edit, and save exactly as before.

### Not changed

RBAC/permissions (unchanged), `customerId`/`customerSnapshot` behavior (unchanged), Template snapshot
behavior (unchanged — Templates never carried a checklist concept in the first place), the print/
workflow server-side enforcement architecture itself (`validateQuotationForFinalization()`/
`validateQuotationForPrint()`, the `422 DOCUMENT_INCOMPLETE` shape, the real `disabled` button
attributes, `mergeServerValidationErrors()`) — only the underlying required-field *policy* shrank,
the mechanism enforcing whatever policy is configured is untouched and still fully server-enforced.

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all
pass clean. No live-deployment/browser verification performed (same sandboxed-session limitation as
every recent pass — no MongoDB Atlas/Vercel CLI access in this environment).

---

## 2026-07-16 (same day) — Quotation + Scope of Work validation: Codex review fix pass

An independent Codex review of the required-field/mandatory-selection validation pass below found
**0 Critical**, **2 High Priority**, and **4 Medium Priority** issues. All fixed same day; full
writeup appended to `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status."

### High Priority #1 — Scope of Work creation discarded the Quotation's checklist selections

`handleCreate()` (`api/_lib/scopeOfWorkHandler.ts`) called `buildDefaultChecklistGroups()` for a
brand-new, always-unchecked structure instead of copying the source quotation's own
`checklistGroups` — so a fully-complete Quotation produced an **incomplete** Scope of Work with
every mandatory group reset to blank, directly violating the "copy the required document selections
from the Quotation into the Scope of Work... store them as a snapshot" requirement. Fixed:
`deriveFromQuotation()` now deep-copies `quote.checklistGroups` (`cloneChecklistGroups()`, fresh
option objects, never an aliased reference) when the source quotation has one, falling back to
`buildDefaultChecklistGroups()` only when the quotation itself predates the field. Deliberately only
at creation, not on refresh — matches every other quotation-derived field's "one-time snapshot"
semantics and the explicit "editing the Quotation later must not silently change an existing Scope
of Work" rule.

### High Priority #2 — "Other"/TOR detail input unreachable for 4 of 5 groups that need it

`validateChecklistGroups()` already required a group's free-text `note` when an "other"-style option
was checked, but `buildDefaultChecklistGroups()` only ever initialized `note: ""` for Logo —
`ChecklistGroupCard` only renders that input when `note !== undefined`, so `safety`/`transportation`/
`namePlate`/`documentsToSend` had a server-side rule a normal user could never actually satisfy.
Fixed by initializing `note: ""` on all four groups too; `withDefaultChecklistGroups()` also
backfills the missing `note` onto an already-saved record (never touching `checked` state or an
already-present note — only adds the empty input itself). Also added `safety`'s "TOR" option to the
same conditional-detail rule as "Other," per the business rule's literal "If TOR or Other is
selected, require a reference/detail field" wording — previously only "Other" did.

### Medium Priority fixes

1. **Buttons were not semantically disabled.** Print/Submit/Approve/Send/Finalize were dimmed and
   click-guarded but never carried the HTML `disabled` attribute. Added `disabled={!valid}` to all
   of them (Quotation + Scope of Work), keeping the `title=` tooltip and the click-guard as a
   harmless defensive no-op for the now-unreachable "clicked anyway" case.
2. **Central required/optional policy didn't cover every visible field.** Added explicit
   `required: false` entries (each with a stated reason) for Quotation's `followUpDate`/
   `isPotentialOpportunity` and Scope of Work's `paymentConditions.method`/`.notes`,
   `seller.date`/`approver.date` — plus documented (not enforced, since they're numeric/free-text
   fields where "blank" doesn't apply the same way) `QUOTATION_LINE_OPTIONAL_NUMERIC_FIELDS`
   (`unitPrice`/`discount`) and `SCOPE_ITEM_OPTIONAL_FIELDS` (`remark`).
3. **Finalization only checked dates were non-blank, not semantically valid.** Added a pure,
   throw-free `isValidIsoDateOrEmpty()` (`src/lib/validation/dateUtils.ts`, mirrors the server-only
   `validateIsoDateOrEmpty()` used at write time) and wired it into both finalization validators for
   every date field — a malformed or legacy-garbled date string (or something like "2026-02-30") now
   fails finalization instead of passing merely by being nonblank.
4. **Server 422 errors were only shown as a toast, never reflected inline.** Added
   `mergeServerValidationErrors()` (`src/lib/validation/types.ts`) and wired it into both document
   editors — a `DOCUMENT_INCOMPLETE` response from Print/Submit-etc./Finalize now overlays its
   `fieldErrors`/`groupErrors` onto the on-screen validation summary/inline errors, not just a toast.

### Deliberately not fixed (would require inventing unconfirmed business rules)

The review's Medium-severity "conditional requirements incomplete" note (billing "Custom" schedule
detail, delivery "customer form" attachment/date rule, a ปจ.2 supporting-detail model) was **not**
addressed — building any of these means inventing a business option catalog that doesn't exist in
this codebase and was never confirmed by the business, which both this task's and the original
validation task's instructions explicitly rule out ("do not add fake values or automatic selections
to make validation pass" / "do not auto-select a value without a confirmed business rule"). Left as
an explicit, tracked TODO.md item pending real business input, not a fabricated placeholder.

Also not changed, per the review's own "Low Priority"/informational findings: native browser
`window.print()` remains available from the rendered page regardless of any API gate (an inherent
browser capability, not something an API-level fix can prevent); the review's note that shared
validation utilities live under `src/lib` (imported into both the frontend and API bundles) is this
codebase's existing, intentional, already-documented architecture (see `docs/CLAUDE.md`'s Coding
Standards), not a defect introduced by this pass; `sanitizeScopeItem()`'s pre-existing behavior of
coercing an invalid `quantity` type to `null` (rather than rejecting the write) predates this
validation feature and is out of scope per "do not redesign unrelated modules."

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all
pass clean. No live-deployment/browser verification performed (same sandboxed-session limitation as
every recent pass, and as the review's own "Verification Limits" section notes for its own attempt).

---

## 2026-07-16 — Quotation + Scope of Work: required-field/mandatory-selection validation

Both documents previously had almost no completeness enforcement — Quotation required only `client`
and `jobTypeCode` (create-only); Scope of Work required only `secondaryCode` at creation. Every other
field (contact info, delivery info, payment terms, dates, line items, and — for Scope of Work — all
11 checklist groups) could be saved, submitted, approved, and **printed** completely blank. This pass
adds strict, centrally-configured completion validation enforced identically client- and server-side.

### Shared validation architecture

- **`src/lib/documentRequirements.ts`** (new) — the `ChecklistOption`/`ChecklistGroup` types moved
  here from `src/lib/scopeOfWork.ts` (which now just re-exports them), so Quotation can share the
  same checklist-group model without depending on the Scope-of-Work domain module. Exports
  `MANDATORY_CHECKLIST_GROUP_KEYS` (the 8 groups named in the business requirement: `safety`,
  `transportation`, `logo`, `billingConditions`, `documentsToSend`, `namePlate`, `deliveryDocFormat`,
  `pj2` — all pre-existing Scope of Work checklist keys, no renaming needed), `CHECKLIST_GROUP_THAI_LABELS`,
  `OTHER_OPTION_KEYS` (which option per group triggers a required free-text `note` — e.g. Logo's
  existing "Etc." option, plus a new "อื่น ๆ" option added to `safety`/`transportation`/`namePlate`/
  `documentsToSend` specifically so this rule has something to attach to), `validateChecklistGroups()`,
  `buildDefaultChecklistGroups()` (moved from `scopeOfWorkHandler.ts`, now shared so Quotation's
  brand-new-document UI can seed the same default structure), and `withDefaultChecklistGroups()` (fills
  in any group missing from an old record, for display only — never silently mutates storage).
- **`api/_lib/documentRequirements.ts`** (new, server-only) — `sanitizeChecklistGroups()` (moved from
  `scopeOfWorkHandler.ts`), re-exports the shared builder above.
- **`src/lib/validation/types.ts`** — shared `ValidationResult { valid, fieldErrors, groupErrors, missingCount }`.
- **`src/lib/validation/quotationValidation.ts`** — `quotationRequiredFields` (the one centralized
  optional-field-exception config: `contactEmail`/`taxId`/`poRef`/`remarks` are the only fields marked
  `required: false`, each with a stated business reason), `validateQuotationLines()` (every non-header
  line needs description/unit/qty>0/specifications, at least one line required), and the two named
  server functions `validateQuotationForFinalization()`/`validateQuotationForPrint()` (both delegate to
  one shared core — no duplicated/inconsistent logic between them).
- **`src/lib/validation/scopeOfWorkValidation.ts`** — same pattern: `scopeOfWorkRequiredFields`
  (`customerSnapshot.taxId`/`.email`/`customerPoNumber`/`remarks` are the optional exceptions),
  `validateScopeOfWorkItems()`, a payment-percentage rule (`downPaymentPct`/`finalPaymentPct` — if
  either is set both must be set and must sum to exactly 100%, never a hardcoded 40/60 split — the
  actual quotation payment terms are what seed `paymentConditions.description`), and
  `validateScopeOfWorkForFinalization()` (always requires an approver signature) /
  `validateScopeOfWorkForPrint()` (approver only required once already `Final` — a Draft may be
  printed without one, since that's a Finalize-time-only requirement per the business rule "Seller/
  approver information when reaching the relevant workflow stage").
- All four files are pure TypeScript (no JSX/browser globals) — safe to value-import from both the
  Vite frontend bundle and the Node serverless API bundle, the same convention `scopeOfWork.ts` already
  established. Both server and client run the literal same functions — impossible for the two to drift.

### Data model

- `Quote` (`src/lib/quotes.tsx`) gained `checklistGroups?: ChecklistGroup[]` — Quotation never had
  this "ข้อกำหนดเอกสารและการส่งมอบ" section before; it's now generated server-side at creation
  (`buildDefaultChecklistGroups(jobTypeCode)`) exactly like Scope of Work's already does. Optional
  only because a quote created before this field existed won't have it in storage — the server always
  normalizes it (`normalizeQuote()`) before sending a quote to the client, so the frontend never sees
  `undefined`. `QuoteDraftFields` gained `checklistGroups`/`salesperson` is now itself a required field too
  (Seller information, auto-filled from the current user, still enforced as a real requirement).

### Server enforcement (`api/handlers/quotes.ts`, `api/_lib/scopeOfWorkHandler.ts`)

- `HttpError` (`api/_lib/http.ts`) gained optional `code`/`details` so a `422` can carry structured
  `{ code: "DOCUMENT_INCOMPLETE", fieldErrors, groupErrors }` alongside the Thai `message` — mirrored
  in `ApiError` (`src/lib/apiClient.ts`) so the frontend can read them back.
- Quotation: `sanitizePartialQuoteFields()` now accepts/sanitizes `checklistGroups` on create, PATCH,
  and workflow-draft merges. A new `POST /api/quotes/:id/print` endpoint (Quotation had **no** server
  print route at all before — printing was 100% client-side `window.print()`) validates via
  `validateQuotationForPrint()` before returning `ok`; the frontend now calls it before invoking
  `window.print()`. `handleWorkflow()` validates via `validateQuotationForFinalization()` before
  applying any transition except `rejected` (→ back to Draft) and `cancelled` (abandoning it) — every
  other transition (submit/approve/send to customer/customer accepted/rejected/won/lost) now requires
  a complete document.
- Scope of Work: `handleFinalize()` (Draft → Final) and `handlePrint()` now both revalidate via the
  shared validators before proceeding — previously neither did any completeness check at all.
- Every response wraps the record through `normalizeQuote()`/`normalizeScope()` — fills in any
  checklist group missing from an old stored document with an unchecked default (via
  `withDefaultChecklistGroups()`) purely for the outgoing payload, never writing it back until the
  user actually saves. Old records load safely and simply display as incomplete, per "Existing
  Document Compatibility."

### Frontend UX

- New shared components: `src/components/RequiredFieldLabel.tsx`, `FieldError.tsx`,
  `ValidationSummary.tsx`, `DocumentCompletionIndicator.tsx`. `ScopeOfWorkChecklistGroup.tsx` renamed
  to `src/pages/quotation/ChecklistGroupCard.tsx` (now takes `required`/`error` props) since Quotation
  needed the identical checkbox/radio-group card — one component, not two parallel implementations.
- `QuoteDocument.tsx`: new "ข้อกำหนดเอกสารและการส่งมอบ" section (same `ChecklistGroupCard` grid as
  Scope of Work); every required field gained `RequiredFieldLabel`/`FieldError`; a `ValidationSummary`
  + `DocumentCompletionIndicator` at the top; Print/Submit/Approve/Send-to-customer/Customer-accepted/
  Customer-rejected/Won/Lost buttons stay visible but show a red-tinted disabled style + tooltip and
  route through a `guardedWorkflowAction()`/`handlePrintClick()` that blocks + toasts + scrolls to the
  summary when the document is incomplete, rather than a native `disabled` attribute that would
  silently swallow the click. Reject/Cancel remain always available (see below). Print now calls the
  new `printQuote()` API before `window.print()`.
- `ScopeOfWorkDocument.tsx`: identical treatment — required labels/errors on every header field,
  checklist groups, payment conditions, seller/approver signatures; Print gated by the lenient
  (Draft-friendly) validation, "ยืนยัน Final" gated by the strict one requiring an approver.
- `LineItemsEditor.tsx`/`ScopeOfWorkItemsEditor.tsx` gained `lineErrors`/`itemErrors` +
  `noLinesError`/`noItemsError` props — an incomplete row is tinted and shows its specific error
  inline; a completely blank row is never itself silently accepted (must be completed or deleted).
- **Draft is unaffected**: "บันทึกร่าง"/"บันทึก" and Scope of Work's PATCH/create/refresh never gained
  a completeness gate — only Print, Finalize, and every non-Draft/non-abandoning Quotation workflow
  transition did, per "A Draft may remain incomplete."

### Deliberate scope decisions / known limitations

- **Business option catalogs mostly left as-is.** The spec's Billing Terms/ปจ.2/Delivery Terms
  examples (Cash/Credit/custom schedules, "ต้องดำเนินการ"/"ไม่เกี่ยวข้อง", pickup/etc.) were **not**
  invented as new option catalogs — per the spec's own "Use the actual business options already used
  by the company... do not auto-select a value without a confirmed business rule," the existing
  Scope-of-Work-derived option sets were kept, only adding a plain "อื่น ๆ" choice where the
  Conditional Required Rules section explicitly needed one to validate against. Confirm the fuller
  option catalogs with the business before expanding them.
- **`rejected`/`cancelled` are exempt from the completeness gate** (client and server agree on this,
  `VALIDATION_EXEMPT_ACTIONS`) — a considered interpretation, not literal spec text: rejecting returns
  to Draft (which may stay incomplete) and cancelling abandons the document outright, so forcing
  completeness first would block the one thing a user is trying to do in both cases.
- **"Scroll to and focus the first invalid field"** is implemented as "scroll to the top-of-form
  ValidationSummary" (which lists every problem), not per-field programmatic focus — a deliberate
  scope trade-off given the number of fields involved.
- Old Scope of Work records saved before this pass won't retroactively gain the new "อื่น ๆ" option
  *within* a checklist group they already have (only a wholly-missing group gets backfilled) — the
  module is only one day old in production, so this is expected to affect no real data.
- No changes to Vercel function count — the new `/api/quotes/:id/print` route is a new dispatch branch
  inside the existing `api/handlers/quotes.ts` file, not a new function.

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all
pass clean. No live-deployment/browser verification yet (same sandboxed-session limitation as every
recent pass — see PROJECT_STATUS.md Known Risks).

---

## 2026-07-15 — Scope of Work: Codex review fix pass (contact/salesperson snapshot, required suffix, Global Search)

An independent Codex review of the Scope of Work module (below) found **0 Critical**, **3 High
Priority**, and several Medium/Low Priority issues. All 3 High Priority issues (plus the actionable
Medium/Low ones) fixed same day; full writeup appended to `docs/CODEX_REVIEW_REPORT.md`'s "Claude
Fix Status."

### High Priority #1 — Quotation contact/salesperson dropped from the snapshot

`buildCustomerSnapshot()` copied company/address/tax/phone/email/project but silently dropped
`quote.contactName` — real quotation data, not a sample value. Separately, `seller` always defaulted
to whoever clicked "สร้าง Scope of Work," never the quotation's actual assigned salesperson. Fixed:
`ScopeOfWorkCustomerSnapshot.contactName` added (falls back the same way every other snapshot field
does); a new frozen, non-editable `ScopeOfWork.quotationSalesperson` field copies `quote.salesperson`
at creation (refreshed only by "อัปเดตข้อมูลจากใบเสนอราคา"); the default `seller` signatory now
prefers `quote.salesperson` when non-empty (`resolveDefaultSeller()`, `api/_lib/
scopeOfWorkHandler.ts`), with a real-user lookup by `fullName` so their saved signature image still
renders correctly, falling back to the creator only when the quotation has no salesperson recorded.

### High Priority #2 — Job code's 4th segment always blank on creation

`secondaryCode` was always `""` at creation time, so every newly-generated `scopeNumber` was missing
its required 4th segment (`PQ{YYYYMM}-{seq}-{jobType}`, no suffix at all) — failing the literal
4-part format requirement. Fixed by making `secondaryCode` a **required** value on
`POST /api/scope-of-works` (server-validated non-empty) — the "สร้าง Scope of Work" button now opens
a small prompt collecting it from the user first. Its business *meaning* is still explicitly not
invented (see `MODULES/ScopeOfWork.md` "Open Business Question") — only its *presence* is now
enforced, and the actual value always comes from the person who knows their own business context,
never a default/placeholder this codebase made up.

### High Priority #3 — No Global Search integration

Scope of Work had zero presence in Global Search — unsearchable by scope number, quotation number,
customer, Job Type, PO, or status. Fixed: `GET /api/search` gained a `scopeOfWorks` result group
(`searchScopeOfWorks()`, `api/_lib/searchHandler.ts`), gated by `scopeOfWork:view`, matching exactly
those 6 keys. `GlobalSearch.tsx` renders a new "Scope of Work" group; clicking a result opens the
source quotation's detail view then jumps straight into that Scope of Work's editor (new
`App.tsx`/`QuotationPage.tsx` `scopeOfWorkDeepLink`/`initialScopeOfWorkDeepLink` state, same pattern
already used for notification clicks and the Quotation Templates wizard's search result).

### Medium/Low fixes

- **A4 explicitly sized**: `@media print { @page { size: A4 portrait; margin: 12mm; } } ` in
  `src/styles/index.css` (previously only `margin` was set) — applies to every printed document.
- **Multi-page item splitting**: each item (+ its own spec/remark row, if any) is now grouped into
  one `<tbody style="break-inside: avoid">` in `ScopeOfWorkPrintDocument.tsx`, instead of one big
  shared `<tbody>` for the whole table — a page break can no longer fall between an item's heading
  and its own first detail line.
- **`refresh` now also requires `quotations:view`** (`api/_lib/scopeOfWorkHandler.ts`), matching the
  same source-quotation-access check `create` already had — previously only Scope of Work
  edit/ownership authorization was checked before reading the linked quotation.
- **Bounded duplicate-key retry** added to `create`/`duplicate` (`MAX_SCOPE_NUMBER_ATTEMPTS = 3`) —
  re-reserves a fresh sequence and retries the insert instead of surfacing a raw 500 on the
  (essentially unreachable, given the atomic per-month counter) chance of an `E11000` collision.
- **Delete confirmation wording corrected** — no longer claims an administrator-restore capability
  that doesn't exist yet (a real gap tracked in TODO.md/MODULES/ScopeOfWork.md, not silently hidden).

`npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all
pass clean. Not yet manually verified against a live deployment/browser (same sandboxed-session
no-live-database limitation as every prior pass).

## 2026-07-15 — Scope of Work module (new feature, generated from a quotation)

New document type reproducing the reference PDF ("Scope Of Work PQ202607-174-LI-SK บริษัท เค ไทย
ไฮดรอลิค จำกัด.pdf", `public/`) — created from an existing quotation via a new "สร้าง Scope of Work"
/ "เปิด / แก้ไข Scope of Work" toolbar action on the Quotation Detail page. Full writeup:
[MODULES/ScopeOfWork.md](./MODULES/ScopeOfWork.md).

- **New `scope_of_works` MongoDB collection** (`ScopeOfWork` in `src/lib/scopeOfWork.ts`) — an
  independent snapshot of the quotation's customer info/items/Job Type/PO at creation time; editing
  a Scope of Work never touches the source quotation, and later quotation/customer/product edits
  never silently change an already-created one. Explicit "อัปเดตข้อมูลจากใบเสนอราคา" action re-pulls
  only the quotation-derived fields on demand, with a confirm-before-overwrite dialog.
- **Server-generated scope number**: `PQ{YYYYMM}-{jobSequence}-{jobTypeCode}-{secondaryCode}` (e.g.
  `PQ202607-174-LI-SK`). `jobSequence` is an atomically-reserved per-calendar-month counter (same
  pattern as the existing quote-numbering counter) — never generated client-side, never duplicable.
  `secondaryCode` (the PDF's `-SK` segment) is a plain editable field, **not hardcoded** and not
  invented a business meaning for — see the module doc's "Open Business Question."
- **11 reusable checklist groups** (`ChecklistGroup[]`) reproducing the PDF's printed Safety/TOR/
  เอกสารส่งถึง/ปจ.2/งานขนส่ง/Logo/Name plate/Test Report (split into ประเภท + ระดับรายงาน)/
  เงื่อนไขการวางบิล/เงื่อนไขการส่งมอบงาน groups — every option starts unchecked except two
  Job-Type-driven suggestions the spec explicitly named (LI→FRP Lining, TA→FRP Tank), both still
  freely editable. Server re-clamps `"single"`-type groups to at most one checked option and only
  recognizes group/option keys it generated itself, so a direct API call can't inject new structure.
- **Item list** copied 1:1 from the quotation's `QuoteLine[]` at creation (never pricing —
  `unitPrice`/`discount`/`tags` are never copied, and Scope of Work never shows pricing anywhere),
  then fully independently editable: add/remove/duplicate/reorder, edit qty/unit, add specification
  lines.
- **Blue handwritten sample fields never imported as data**: shipping/billing contact name/phone,
  delivery date, drawing code, seller/approver name/signature/date all start blank and editable —
  the reference PDF's sample values (illegible handwriting, a specific person's name) are never
  used as defaults. Payment conditions (down payment %/final payment %) start blank unless the
  quotation itself already carries payment-term text.
- **Draft/Final lifecycle** — finalizing locks a record against further edits (no un-finalize route
  this pass; "ทำสำเนา" duplicates a fresh, freely-editable Draft copy instead).
- **Print/PDF** (`ScopeOfWorkPrintDocument.tsx`) — A4, checked/unchecked box glyphs, numbered item
  table with no price columns, ผู้ขาย/ผู้อนุมัติ signature table. No blue handwriting, no yellow
  highlights, no fake placeholder values, no quotation pricing, no internal notes.
- **6 new RBAC permissions** (`scopeOfWork:view/create/edit/finalize/print/delete`), enforced
  server-side on every route, combined with an owner-or-`:finalize` check for edit/delete (Sales can
  only touch their own Draft; Approvers/Admin can touch anyone's). See
  [RBAC.md](./RBAC.md) "Scope of Work."
- **New API**: `GET/POST /api/scope-of-works`, `GET/PATCH/DELETE /api/scope-of-works/:id`,
  `POST /api/scope-of-works/:id/{finalize,duplicate,refresh,print}` — mounted from
  `api/handlers/quotes.ts` (shares its function file; Vercel Hobby's 12-function cap is still fully
  used, no new function file added). See [API.md](./API.md) "Scope of Work."
- **Audit logging** for every action (create/update/finalize/duplicate/refresh/print/delete), module
  `"Scope of Work"` — `POST /api/audit-log` rejects that module name from generic client calls, same
  forgery-prevention rule as the quotation module.
- No changes to existing Quotation create/edit/print workflows — a quotation does not need a Scope
  of Work, and every existing quotation continues to work unchanged.
- `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all
  pass clean. Not yet manually verified against a live deployment/browser (same sandboxed-session
  no-live-database limitation as every prior pass — see PROJECT_STATUS.md Known Risks).

## 2026-07-15 — Quotation Templates: second Codex-review fix pass (real workbook parsing, structured snapshot, subDetails/visibleToCustomer, product verification)

An independent Codex review of the Template Management pass below found **0 Critical**, **3 High
Priority**, and **3 Medium Priority** issues. All 6 fixed this pass; full writeup in
`docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status."

### High Priority #1 — Workbook import wasn't a workbook import

`POST /api/quotation-templates/import` only ever upserted the hand-transcribed
`QUOTATION_TEMPLATE_SEEDS` TypeScript array — it never read `public/Scope of work new template for
air pollution control_Technic.xlsx` at all, and `sourceHash` was a hash of the seed JSON, not the
workbook. Replacing the workbook file had **zero observable effect anywhere in the app**.

Fixed: new `api/_lib/templateWorkbookParser.ts`, using the `xlsx`/SheetJS package (re-added to
`package.json` as a real production dependency — it had been removed after the original 2026-07-14
pass as a "one-time offline analysis tool only"). `fingerprintSourceWorkbook()` reads the real file
at runtime and computes a SHA-256 hash per sheet over its raw row content. Every `excel_import`
template now gets a `sourceWorkbookHash` field; `upsertQuotationTemplates()` compares it against the
previously-stored value and adds a real `TemplateImportReport` warning when they diverge — a
workbook edit is now genuinely detectable, surfaced both in the import response and in the
`Templates Imported` audit-log entry's details (the toast itself is transient). Never fails the
import if the file can't be read in some environment — `vercel.json` gained
`functions["api/handlers/jobtypes.ts"].includeFiles` to bundle the workbook with the function that
reads it, and a read failure degrades to a soft warning, not an error.

**Deliberately not attempted**: fully auto-deriving `TemplateSection[]`/`TemplateItem[]` from parsed
rows, replacing the hand-transcription. Direct inspection of the real workbook (via a temporary
local `xlsx` install and a Node script) found rows whose classification requires real judgment — row
4 of "FRP Tank and LI" packs an internal hand-signing note, a "Thickness" parameter, and an unrelated
abbreviation-legend note into three different columns of the same row; row 61 of "Wet scrubber"
packs all 4 payment-term lines and the warranty line into one `\r\n`-joined cell. A naive automated
classifier risks silently corrupting already-twice-reviewed, customer-facing content. Tracked as
deliberate follow-up scope in `docs/TODO.md`, not silently dropped. Verified during this pass: sheet
names/row counts (66/51/46/49) and the exact row-22 FRP Tank/FRP Lining split point all match what
`templateSeedData.ts` already claimed.

### High Priority #2 — No structured template snapshot on quotations

Only flattened `QuoteLine[]` plus 3 provenance strings (`quotationTemplateId/Name/Version`) were
stored — no real copy of the template's own section/item structure, weakening audit/reconstruction.

Fixed: `Quote.templateSnapshot` (`src/lib/quotes.tsx`) — a new optional field holding a real,
frozen-at-creation copy of the matched template's `sections`/`defaultTerms`/`internalNotes`/
`sourceHash` plus a `capturedAt` timestamp. Populated server-side by a new `loadTemplateSnapshot()`
in `api/handlers/quotes.ts` (one extra targeted fetch, only when a template was actually matched).
Never client-writable, structurally excluded from `PATCH /api/quotes/:id`'s allow-list. Deliberately
includes `internalNotes` (unlike `lines`, which still never gets them) since it's a pure internal
audit record — no rendering path (editor, form, PDF) reads it; they all still read only `lines`.

### High Priority #3 — Sub-details discarded, `visibleToCustomer` never honored

`applyTemplateToQuoteDraft()` (`src/pages/quotation/applyTemplate.ts`) built output `subDetails`
only from `editableParameters`, silently discarding any real text saved in `TemplateItem.subDetails`
— content an admin explicitly configured in the Template Management editor vanished on apply. Worse,
`item.visibleToCustomer` was never checked at all — every item was copied to the quote regardless,
so the editor's "hide from customer documents" checkbox had zero actual effect.

Fixed: `subDetails` now = `item.subDetails` (real configured text, first) + one row per
`editableParameter` (fill-in-the-blank prompts, after). Items with `visibleToCustomer: false` are
now skipped entirely. A section whose every item ends up hidden still emits its header line; the
pre-existing "don't print an empty section header" PDF rule already handles that case.

### Medium Priority — product links not server-verified

`sanitizeItem()` (`api/_lib/quotationTemplatesHandler.ts`) trusted a caller-submitted `productId`/
`productSnapshot` verbatim — the UI picker always sent genuine data, but a direct authorized API
call could save a nonexistent product id or a forged snapshot. Fixed: `sanitizeContent()` now
batch-resolves every referenced `productId` against real, non-archived `products` records (one query
per save) before sanitizing, and always rebuilds `productSnapshot` from that real record. An
unresolvable id is silently dropped (item becomes unlinked, keeps its typed content) rather than
rejecting the whole save.

### Medium Priority — non-atomic import upsert

A concurrent import run could previously surface as an unhandled duplicate-key 500 instead of a
clean idempotent result. Fixed: the not-yet-existing insert branch now catches a MongoDB E11000
duplicate-key error and treats it as "skipped" (a race was lost to a concurrent run, but the unique
index already guarantees no actual duplicate exists). Deliberately not rewritten as a single atomic
`findOneAndUpdate` upsert, which would break the tested "zero writes when content is unchanged"
guarantee (an always-`$set` upsert bumps `updatedAt` every run regardless of content).

### Medium Priority — availability badges inaccurate while loading/on failure

`QuotationTemplateWizard.tsx`'s Job Type grid badge previously collapsed "still loading" and "fetch
failed" into the same "ยังไม่มี Template" (no template) text via a `?? 0` fallback — falsely
advertising the blank-start fallback. Now tracks 3 explicit states (loading/error/real count).

### Documentation / UI wording

The "นำเข้าจาก Excel" (Import from Excel) button now has a clarifying tooltip explaining exactly
what it does (checks the workbook for changes + imports pre-transcribed content — not yet a fully
automatic conversion), and import warnings are surfaced in the post-import toast (pointing to Audit
Log for full detail) instead of only being visible in the raw API response. The inactive-but-not-
deleted-template policy (a template deactivated mid-draft still stays valid for the quote that
already referenced it) was formally reconfirmed as intentional in RBAC.md/MODULES/
QuotationTemplates.md, not changed.

### Verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass
clean. A local Vite dev server + Playwright check confirmed zero browser console errors.
`fingerprintSourceWorkbook()` independently run against the real workbook file via a `tsx` script,
confirming correct sheet names/row counts/hashes. Live MongoDB round-trips remain unverified — no
local database credentials in this environment (same limitation as every prior pass).

---

## 2026-07-15 — Quotation Templates: Template Management module

Closed the admin-tooling gap the 2026-07-14 pass's own docs flagged as a known limitation: there was
no UI for managing templates beyond raw API calls. This pass built the full admin half of the
Quotation Templates feature; the consumer-facing wizard from 2026-07-14 was left functionally
unchanged except for the two additions listed below.

### Template Management page

New `จัดการ Template ใบเสนอราคา` module, sidebar under งานขาย (below ใบเสนอราคา), gated by the new
`quotationTemplates:view` permission:

- **List** (`src/pages/templates/TemplateManagementPage.tsx`): columns (Template Code, Name, Job
  Type, Version, Sections, Items, Status, Source, Updated At), search (name/code/job type), filters
  (Job Type, active/inactive, imported/manual source), a "show archived" toggle, and row actions —
  ดูตัวอย่าง, แก้ไข, ทำสำเนา, เปิด/ปิดใช้งาน, เก็บถาวร/กู้คืน, and a "สร้างใบเสนอราคาจาก Template นี้"
  shortcut into the existing Create Quotation wizard deep-link.
- **Create/edit form** (`src/pages/templates/TemplateEditorView.tsx`): basic fields, and a full
  section/item editor — add/rename/delete/reorder sections (up/down buttons, no drag-and-drop
  dependency added), add items via "เลือกสินค้า" (reuses the existing `ProductPickerModal`, copying
  a `productSnapshot` — see below) or "เพิ่มรายการเอง" (custom item), per-item
  specifications/sub-details/editable-parameters/internal-notes editing, item
  reorder/duplicate/delete, and three grouped default-terms lists (payment/warranty/tax).
- **Duplicate**: new `POST /api/quotation-templates/:id/duplicate` — deep-clones sections/items with
  fresh ids under a new Template Code (auto-suggested as `<code>-COPY`), always created
  `isActive: false`, never mutates the source.
- **Create**: new `POST /api/quotation-templates` for a from-scratch manual template
  (`sourceType: "manual"`).
- **Edit**: `PATCH /api/quotation-templates/:id` extended to accept full content
  (`TemplateContentDraft`), not just the `isActive`/`isDeleted` toggles it previously supported.

### RBAC — 7 new granular permissions

`quotationTemplates:view/create/edit/duplicate/activate/archive/import` added alongside the original
`quotationTemplates:manage`, which is now a documented backward-compatible superset (every
server-side check accepts `:manage` OR the specific permission an action needs). Administrator holds
all 8 by default. Enforcement is per-touched-field on `PATCH`: `isActive`/`isDeleted` each only
require their own permission when the value actually *changes* relative to what's persisted
(compared server-side against the stored document, not just field presence) — so a plain `:edit`
holder can save unrelated content changes without also needing `:activate`, while an `:edit`-only
holder still can't sneak a real activation through the same call.

### Audit logging

Every template lifecycle action now writes a server-side `AuditLogEntry` (module `"Template
ใบเสนอราคา"`) via a new `writeTemplateAuditEntry()` in `api/_lib/quotationTemplatesHandler.ts`:
`Template Created`/`Updated`/`Duplicated`/`Activated`/`Deactivated`/`Archived`/`Unarchived`, and
`Templates Imported` (moved out of `upsertQuotationTemplates()` itself, which stays audit-free so
the defensive empty-collection auto-seed never writes a misleading "system" actor entry — only the
explicit `POST /api/quotation-templates/import` call logs). New `relatedTemplateId`/
`relatedTemplateName`/`relatedJobTypeCode` fields on `AuditLogEntry` (`src/lib/auditLog.ts`),
mirroring the existing `relatedQuoteId`/`relatedCustomerName` convention. Separately,
`POST /api/quotes`'s own audit entry (`api/handlers/quotes.ts`) now distinguishes `"Quotation
Created from Template"` from `"Quotation Created (Blank)"` instead of one generic `"Quotation
Created"` for both — per the task spec's "Blank Quotation Behavior" audit requirement.

### Wizard additions

`QuotationTemplateWizard.tsx`'s Job Type grid (Step 1) now shows a per-card availability badge
("ยังไม่มี Template" / "มี Template" / "มี Template N แบบ"), computed from one extra unfiltered
template fetch at mount. A `quotationTemplates:create` (or `:manage`) holder additionally sees a
"สร้าง Template ใหม่สำหรับประเภทงานนี้" action on the empty-state and multi-template-choice screens,
deep-linking into Template Management's create form pre-filled with that Job Type
(`App.tsx`'s new `navigateToCreateTemplateForJobType()` / `templateCreateForJobType` state) —
deliberately kept distinct from "เริ่มจากแบบฟอร์มเปล่า" per the task's "Do Not Confuse 'OTHER' Job
Type with Blank Template" instruction.

### Data model

- `QuotationTemplate`/`QuotationTemplateSummary` gained `sourceType: "excel_import" | "manual"`
  (the 5 workbook seeds are `"excel_import"`; anything created or duplicated through Template
  Management is `"manual"`) plus `isDeleted`/`updatedAt`/`updatedBy` on the summary shape (needed
  for the list page's columns/filters).
- `TemplateItem` gained an optional `productSnapshot: { code, name, unit, defaultPrice }` — a
  one-time informational copy of a linked product's catalog fields, never read by
  `applyTemplateToQuoteDraft()` (templates still never carry a price).
- Item-level "customer-visible notes" reuse the existing `specifications` field rather than adding a
  new one — documented as a deliberate simplification in MODULES/QuotationTemplates.md.

### Shared preview component

`src/components/TemplatePreview.tsx` extracted from the wizard's inline Step 3 markup — now backs
both the wizard's `compact` teaser and Template Management's full-detail "ดูตัวอย่าง" action, so
both call sites share the one rule that actually matters: never render `internalNotes` (or any cost
figure — templates carry no price field at all).

### Verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass
clean. A local Vite dev server + Playwright check confirmed the client bundle (including every new
page) loads with zero browser console errors — the app correctly falls back to its documented
"ไม่สามารถเชื่อมต่อระบบได้" retry state at the session-check call, since no local
`MONGODB_URI`/`JWT_SECRET` is available in this environment (same sandboxed-network limitation
documented for every prior pass — see PROJECT_STATUS.md "Known Risks"). Live-DB round-trips (actual
list/create/edit/duplicate/archive/import against a real `quotation_templates` collection) remain
unverified; run the task spec's own 30-step manual test plan against a real deployment before
considering this fully verified end-to-end.

---

## 2026-07-14 — Quotation Templates: Codex review fix pass (3 High Priority)

An independent Codex review (`docs/CODEX_REVIEW_REPORT.md`, "Quotation Templates by Job Type and
Excel Import Audit") of the Quotation Templates feature below found **0 Critical issues** and
**3 High Priority** issues, all fixed this pass.

### High Priority #1 — Template Job Type not server-bound to the quote's Job Type

`POST /api/quotes` validated `jobTypeCode` and `quotationTemplateId` completely independently —
nothing compared the two, so a direct API caller bypassing the wizard's UI-level guardrails could
create e.g. a `TA` (FRP Tank) quotation carrying `LI-FRP-LINING` template provenance. Fixed:
`TemplateMasterEntry`/`loadTemplateMaster()` (`api/handlers/quotes.ts`) now also project/return
each template's `jobTypeCode`; `validateQuotationTemplate()` (`api/_lib/quoteValidation.ts`)
gained a required 3rd parameter, `quoteJobTypeCode: string` (the quote's own already-validated Job
Type — `validateJobType()` always runs first at the same call site), and throws `HttpError(400,
"Template ใบเสนอราคาไม่ตรงกับประเภทงานที่เลือก กรุณาเลือกใหม่")` when the matched template's
`jobTypeCode` differs. Enforced only on `POST /api/quotes` — template attachment is create-only,
already structurally impossible to change via `PATCH`.

### High Priority #2 — Missing Excel source content in 2 of the 5 templates

Both `SC-ACTIVATED-CARBON` and `BF-BAG-FILTER`'s "Main Ducting" item were missing a real source
specification line — `"Exhaust Duct, Elbow, Flange, Damper and accessories"` (row 5 of both the
"Activated carbon" and "Bag filter" sheets in
`public/Scope of work new template for air pollution control_Technic.xlsx`), immediately before
the existing "Stack"/"Ladder, safety ring & platform"/"Sampling port according to Thai law ?"
lines that were already present. Re-verified directly against the source workbook (not just
trusted from the review's paraphrase) before fixing. Fixed: added as the first entry in each
template's "Main Ducting" item `specifications` array, in `api/_lib/templateSeedData.ts`, matching
the source's row order.

### High Priority #3 — Real source literal values silently discarded when a template was applied

The seed data stored several real, non-placeholder source values (`Brand: TCS`,
`Material: Steel`, `Brand: TCS or equivalent`, `Static Pressure: 200 mm wg.`,
`Brand: Kruger or equivalent` — 9 occurrences total, all confined to `SC-ACTIVATED-CARBON` and
`BF-BAG-FILTER`) inside `TemplateEditableParameter.value`. But `applyTemplateToQuoteDraft()`
(`src/pages/quotation/applyTemplate.ts`) always renders every editable parameter as a blank
`"Label: ______"` prompt regardless of `value` — so these real workbook defaults were silently
lost the moment a template was applied to a quotation, contradicting
`TemplateEditableParameter.value`'s own interface doc comment ("is always blank at
template-definition time") in `src/lib/quotationTemplates.ts`. Fixed: rather than changing
`applyTemplateToQuoteDraft()`'s "value is always blank" data-model contract, all 9 real-valued
entries were reclassified from `editableParameters` to `specifications` (plain `"Label: value"`
text) in `api/_lib/templateSeedData.ts` — matching a classification rule the file's own top-of-file
doc comment already stated but the original seed data violated. `TemplateEditableParameter.value`
is now verified genuinely always blank across all 5 templates, and the real Brand/Material/
Static-Pressure defaults now survive into the applied quotation as ordinary editable specification
text (via the existing `SpecificationsEditor` in `LineItemsEditor.tsx`) instead of being discarded.

### Not changed (remaining Medium/Low items, explicitly out of scope — task was "fix Critical/High," 0 Critical found)

- `POST /api/quotation-templates/import` still upserts the hand-transcribed `QUOTATION_TEMPLATE_SEEDS` TypeScript data and hashes canonical seed JSON — doesn't parse/hash the `.xlsx` file itself.
- No admin UI exists yet for triggering import/viewing the report/activating templates.
- The quote's template snapshot is flattened `QuoteLine[]` metadata, not a full structured `TemplateSection`/`TemplateItem` hierarchy snapshot.
- The import loop is find-then-insert/update rather than a single atomic MongoDB upsert (the unique `templateCode` index still prevents an actual duplicate).
- Template preview still shows only the first 6 item names; verbatim vs. normalized source text isn't preserved separately.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all pass
clean. Seed data changes verified via a `tsx` sanity script run against the actual template
objects. No live MongoDB/browser verification (same sandboxed-session network limitation as every
prior pass). Docs updated: CLAUDE.md, PROJECT_STATUS.md, this file, TODO.md, DATABASE.md, API.md,
IMPLEMENTATION_CHECKLIST.md. See `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" section.

---

## 2026-07-14 — Quotation Templates + Create Quotation wizard

Business requirement (P'Suki/P'Keng): when a Sales user clicks "สร้างใบเสนอราคา / Create
Quotation," they now go through a wizard — Job Type → Template (only when 2+ active templates
exist for that Job Type) → Preview → the normal quotation form, pre-filled but still fully
editable — instead of always starting blank. Template content was extracted from a real Excel
workbook the company provided
(`public/Scope of work new template for air pollution control_Technic.xlsx`), not invented.

### Job Type → Template mapping (5 templates from 4 source sheets)

- **SC** (Wet Scrubber / Activated Carbon System) — two templates, the only Job Type where the
  wizard's template-choice screen actually appears: `SC-WET-SCRUBBER` "Wet Scrubber" (sheet "Wet
  scrubber," 66 rows, 2 sections/28 items/14 editable parameters/1 internal note/6 default term
  lines) and `SC-ACTIVATED-CARBON` "Activated Carbon" (sheet "Activated carbon," 51 rows, 1
  section/18 items/21 editable parameters/0 internal notes/6 default term lines).
- **BF** (Dust Collector System) — `BF-BAG-FILTER` "Bag Filter" (sheet "Bag filter," 46 rows, 1
  section/17 items/16 editable parameters/0 internal notes/6 default term lines; the sheet's BOQ
  title literally says "Dust Collector System," intentional per the task spec, not a mismatch).
  Auto-selected — no template-choice screen for a Job Type with exactly one template.
- **TA** (Fiberglass Tank) — `TA-FRP-TANK` "FRP Tank" (sheet "FRP Tank and LI," rows 22–48 only, 1
  section/17 items/12 editable parameters/1 internal note/1 default term line). Auto-selected.
- **LI** (FRP Lining) — `LI-FRP-LINING` "FRP Lining" (the *same* sheet "FRP Tank and LI," rows 0–21
  only — row 22's "FRP Tank" heading is the exact split point, deliberately never mixed with the
  FRP Tank rows — 1 section/17 items/5 editable parameters/2 internal notes/1 default term line).
  Auto-selected.
- Any other active Job Type (no template) falls back to an empty-state screen offering "เริ่มจาก
  ใบเสนอราคาเปล่า" (start blank).

### Excel row classification rules

Documented in [MODULES/QuotationTemplates.md](./MODULES/QuotationTemplates.md) so a future
re-import follows the same rules: `section` (text-only row, no No./Qty/Unit), `item` (top-level
No.), `subItem` ("N.M" numbering — in the No. column or embedded in the description text — or an
unnumbered row with its own real Qty/Unit), `specification` (any other loose descriptive line),
`editableParameter` (a "Label : value" line whose value is a placeholder like `xxx`/blank/a bare
unit token — becomes a fill-in-the-blank `{label, value: "", unit, editable: true}`, never a
fabricated value), `internalNote` (real internal-staff review comments — flagged
`visibleToCustomer: false`, **never** copied into a quotation or printed; exactly 3 exist across
the whole workbook), `paymentTerm`/`warrantyTerm`/`taxNote` (→ `defaultTerms`, not regular items).
The recurring phrase "Sampling port according to Thai law ?" (present in all 3 BOQ sheets) was
deliberately kept as normal customer-facing spec text, not classified internal. No prices were
ever invented — every template item stores a nullable `quantity` and never a price; applying a
template always sets `unitPrice: 0`/`discount: 0` on every copied line.

### Data model — new `quotation_templates` MongoDB collection

Full TS shape in `src/lib/quotationTemplates.ts` (`QuotationTemplate`/`TemplateSection`/
`TemplateItem`/`TemplateEditableParameter`/`TemplateTermLine`/`QuotationTemplateSummary`/
`TemplateImportReport`) — type-only imported into the API bundle from `api/_lib/collections.ts`
and `api/_lib/quotationTemplatesHandler.ts`, per this repo's standing rule against letting a
*value* import into a `src/lib/*` file pull JSX into the serverless bundle; the actual
`QuotationTemplate → QuoteLine[]` conversion function therefore lives in a separate page-scoped
file, `src/pages/quotation/applyTemplate.ts`, instead. Indexes: `templateCode` (unique),
`jobTypeCode`, `isActive`, `isDeleted`. Seed data (the real extracted content) lives in
`api/_lib/templateSeedData.ts` as `QUOTATION_TEMPLATE_SEEDS`.

### Idempotent import

`upsertQuotationTemplates(actorUserId)` (`api/_lib/quotationTemplatesHandler.ts`) computes a
SHA-256 `sourceHash` over canonical JSON of the content-relevant fields (not `version`) for each of
the 5 seeds and upserts by the stable `templateCode` key: insert if new, skip if the hash is
unchanged, `$set`-update if changed. Returns a `TemplateImportReport`. Re-running against unchanged
seed data always produces an all-"skipped" report with zero writes — verified genuinely idempotent.
`seedQuotationTemplatesIfEmpty()` runs defensively from every `GET /api/quotation-templates` call,
but only when the collection is empty — the same self-healing pattern `seedJobTypesIfEmpty()`
already established, since the Setup Wizard's one-time bootstrap path is permanently unreachable on
an already-provisioned deployment. A real re-import after *editing* `templateSeedData.ts`'s content
needs the explicit `POST /api/quotation-templates/import` admin action.

### API — 4 new endpoints, sharing `api/handlers/jobtypes.ts`'s function slot

`GET /api/quotation-templates?jobTypeCode=` (list — `quotationTemplates:manage` or
`quotations:create`, non-managers only see active templates), `GET
/api/quotation-templates/:id` (single full template, same permission gate), `POST
/api/quotation-templates/import` (`quotationTemplates:manage`), `PATCH
/api/quotation-templates/:id` (`{ isActive?, isDeleted? }`, `quotationTemplates:manage`). Mounted
by extending `api/handlers/jobtypes.ts` (checking the raw pathname before falling through to the
existing Job Type dispatch) rather than a new file — Vercel Hobby's 12-function cap is still fully
used, the same established pattern `/api/search` uses by sharing `api/handlers/customers.ts`. Two
new `vercel.json` rewrites (`/api/quotation-templates`, `/api/quotation-templates/:path*`).

### RBAC — new `quotationTemplates:manage` permission

Added to `Permission`/`ALL_PERMISSIONS`/`PERMISSION_LABELS`/`PERMISSION_LABEL_KEY` and the
"ใบเสนอราคา" (Quotations) permission group in `src/lib/permissions.ts`. Granted by default to
**Administrator** (`src/lib/roles.ts`) — not Super-Admin-exclusive. Sales-facing template *read*
access reuses the existing `quotations:create` permission (no new "view" permission), the same
"manage vs. pick-for-a-quotation" carve-out already established for Customers and, before that,
Company Profiles.

### Quote model changes — all optional, backward-compatible

`QuoteLine.isSectionHeader?: boolean` (a non-priced section-divider line, validated server-side via
`sanitizeBoolean()` in `api/_lib/quoteValidation.ts`'s `sanitizeLine()`) and
`Quote.quotationTemplateId?/quotationTemplateName?/quotationTemplateVersion?: string` (frozen
provenance metadata, set only at creation time — the client only ever sends
`quotationTemplateId`; the server re-derives `quotationTemplateName`/`quotationTemplateVersion` via
`validateQuotationTemplate()` in `api/_lib/quoteValidation.ts`, mirroring the existing
`validateJobType()` pattern, and never trusts a client-sent name/version. `PATCH
/api/quotes/:id`'s `sanitizePartialQuoteFields()` never lists these 3 fields, so they're
structurally impossible to change after creation. An inactive-but-not-deleted template match is
deliberately still allowed, so deactivating a template mid-draft doesn't retroactively break a
Sales user's in-progress quote). Every pre-existing quotation simply has these fields `undefined`
and is completely unaffected.

### Template → quote snapshot semantics

`applyTemplateToQuoteDraft(template)` (`src/pages/quotation/applyTemplate.ts`) converts a full
`QuotationTemplate` into `{ lines, paymentTerms, remarks }`, generating a fresh id for every line
and sub-detail — editing the resulting quotation can never write back to the master template, and
editing the master template later never changes quotations already created from it. Each
`TemplateSection` becomes one `isSectionHeader: true` divider line; each `TemplateItem` becomes an
ordinary line (`unitPrice`/`discount` always `0`); each `editableParameter` becomes a
fill-in-the-blank `subDetails` row (`"Label: ______ Unit"`); `internalNotes` (item- and
template-level) are **never copied**, by design, so an internal review comment can never reach a
customer-facing quotation or its PDF; `defaultTerms` map into `Quote.paymentTerms`/`Quote.remarks`.

### UI — the wizard, section-header rendering, Global Search

New `src/pages/quotation/QuotationTemplateWizard.tsx`, a dynamic-step wizard wired into
`QuotationPage.tsx` via a new `"wizard"` view state sitting between `"list"` and `"new"`. Job Type
grid → (template choice, only for 2+ active templates) → Preview → apply/start-blank. The wizard's
result seeds `QuoteDocument.tsx`'s initial `lines`/`jobTypeCode`/`jobTypeName`/`paymentTerms`/
`remarks` state (fresh "new" mounts only — reopening a saved quote always uses its own data). A
small "สร้างจาก Template: {name} (v{version})" line shows near the Job Type field when a quote was
created from a template. Section-header lines render as a full-width bold divider row (no
unit/qty/price/discount columns) in `LineItemsEditor.tsx` (marked with "§" instead of a line
number) and `PrintDocument.tsx` (`colSpan={7}` bold row); item numbering skips them; a header with
no items left under it is silently omitted from print. New "Template ใบเสนอราคา" Global Search
result group (`searchTemplates()` in `api/_lib/searchHandler.ts`), matching
`templateCode`/`templateName`/`jobTypeCode`/`jobTypeName`/`description`, projecting only those
fields (never `sections`/`internalNotes`), gated by the same `quotationTemplates:manage` or
`quotations:create` check — clicking a result deep-links straight into the wizard's Preview step
for that template via `App.tsx`'s new `navigateToTemplate()`/`quotationTemplateDeepLink` plumbing.

### Housekeeping

Removed the `xlsx` npm package from `package.json` — it was only ever used for one-time offline
Excel analysis via ad-hoc Node scripts during development, never imported by any runtime
`api/`/`src/` code.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and `npm run build` all pass
clean, zero errors, zero new warnings. **Not done**: no live MongoDB/Vercel access was available
this session, so the real DB-backed behavior (an actual import run, real API round-trips, the
wizard's live fetch/preview/apply flow, Global Search actually returning template results) has not
been manually tested end-to-end in a browser — same sandboxed-session network limitation as every
prior pass; no UI screenshot/visual verification of the wizard's 3 screens or the section-header
divider rendering; if the source Excel workbook is ever revised, `api/_lib/templateSeedData.ts`
needs manual re-transcription and re-import — there is no live xlsx-parsing-at-runtime anywhere in
this app. Docs updated: CLAUDE.md, this file, PROJECT_STATUS.md, DATABASE.md, API.md, RBAC.md,
UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/QuotationTemplates.md (new).

---

## 2026-07-14 — Codex review fix pass: Global Search High Priority issues + view-only navigation/accessibility

An independent Codex review (`docs/CODEX_REVIEW_REPORT.md`, "ERP Global Search Audit") of the
Global Search feature below found **zero Critical issues** (no unauthorized data exposure — every
result category is genuinely filtered server-side before its query runs) and **2 High Priority**
issues, both fixed this pass, plus 2 directly-relevant Medium findings.

### High Priority #1 — no maximum query length on a multi-collection unanchored-regex endpoint

`GET /api/search` enforced a 2-character minimum but no upper bound — an authenticated caller
could submit an arbitrarily long term and force an expensive `$regex` `$or` scan across quotations/
customers/products/users in one request. Not a regex-injection risk (`escapeRegExp()` already
prevented that), but a real performance/availability concern. Fixed: new `MAX_QUERY_LENGTH = 100`
in `api/_lib/searchHandler.ts`, rejected with `400` if exceeded; the search `<input>` in
`GlobalSearch.tsx` (both the desktop and new mobile variants) also carries a matching native
`maxLength={100}` as defense-in-depth (the server-side check is the real enforcement — a modified
client could bypass a client-only `maxLength`).

### High Priority #2 — Global Search doesn't exist below the `lg` breakpoint (1024px)

`GlobalSearch.tsx` was entirely `hidden lg:flex`, so mobile and most tablet users had no visible
search control at all — and the Ctrl/Cmd+K shortcut still silently focused the now-invisible
input, doing nothing observable. Fixed with a real mobile entry point rather than disabling the
shortcut: a `lg:hidden` icon-only trigger button opens a full-screen search takeover (`fixed
inset-0`, its own input + close button + the same grouped results list, reusing the exact same
`query`/`results`/`activeIndex`/keyboard-handling state as the desktop dropdown — no duplicated
search logic, just a second rendering of the same underlying session). Ctrl/Cmd+K now checks
`window.matchMedia("(min-width: 1024px)")` to decide whether to focus the desktop input or open
the mobile panel, so the shortcut is never a no-op regardless of viewport width. Fixing this also
required a small layout correction: the notification bell's `ml-auto lg:ml-0` (which used to be
the one element responsible for right-aligning the trailing header icons on mobile, back when
Global Search contributed nothing visible there) would have competed for the same flex auto-margin
space against the new mobile search trigger's own `ml-auto`, pulling them apart with an
unintended gap — the bell's margin classes were removed entirely (`App.tsx`), since Global Search's
own elements (the desktop div's `ml-auto` at `lg:`, the mobile button's `ml-auto` below it) now
correctly own that responsibility at every breakpoint.

### Medium — view-only Customer search results opened an editable form

Codex found that clicking a Customer result deep-linked directly into the edit modal
(`CustomerFormModal`) regardless of whether the caller actually held `customers:edit` — bypassing
the same gate `CustomersPage.tsx`'s own list UI already respects (the edit pencil icon is only
shown when `canEdit` is true). Not a security bypass (the server independently rejects an
unauthorized save either way), but confusing: a view-only user would land in an editable-looking
form they could never normally reach from this page. Fixed: `CustomersPage.tsx`'s `initialEditId`
handling now only opens the edit form when `canEdit` is true; a view-only searcher instead lands on
the list, pre-filtered to that customer's company name (with the status/archived filters reset so
the record is guaranteed visible regardless of its own active/archived state) — a real "found it"
result without an edit affordance the server would reject anyway. **Products deliberately left
unchanged**: `ProductsPage.tsx` has no button-level edit-permission gating at all today (a
pre-existing, already-documented gap in `IMPLEMENTATION_CHECKLIST.md` — any `products:view` holder
can already open the edit form via the normal list UI), so the search deep-link isn't introducing
any new inconsistency there; fixing that would be a pre-existing, unrelated-to-this-feature gap,
out of this pass's scope. Users has no view/edit permission split to violate (`users:manage` is a
single flat permission covering both), so no fix was needed there either.

### Medium — missing combobox/listbox accessibility semantics

Keyboard navigation worked visually but had no ARIA semantics identifying the input as a combobox
or the results as a listbox, and the active row never scrolled into view for a longer result list.
Fixed: `role="combobox"`/`aria-expanded`/`aria-haspopup="listbox"`/`aria-autocomplete="list"`/
`aria-controls`/`aria-activedescendant` on both the desktop and mobile inputs; `role="listbox"` on
the results container; `role="option"`/`aria-selected`/a stable `id` on every result row (desktop
and mobile use separate `id` namespaces — `global-search-option-{desktop|mobile}-{index}` — since
both panels can be mounted simultaneously, one hidden via CSS, and duplicate DOM `id`s are invalid
regardless of visibility). The active row now scrolls into view (`scrollIntoView({block:
"nearest"})`) on every Arrow Up/Down.

### Deliberately not fixed this pass (documented, not silently dropped)

- **Low Priority items** (English quotation-status aliases not matched by the search predicate;
  customer results don't surface which field matched) — out of this pass's Critical/High/directly-
  relevant-Medium scope.
- **"Search is a documented collection-scan design" (Medium)** — already documented as a known,
  accepted limitation at this ERP's real data volume (see the prior pass's CHANGELOG entry below);
  Codex's review re-confirms the same conclusion rather than finding a new problem. No code change
  needed beyond the max-length cap above.
- **"No automated search coverage was found" (Medium)** — this project has no automated test
  infrastructure anywhere (a longstanding, deliberate, already-documented scope decision — see
  RBAC.md "Known Gaps"), not something a single targeted fix pass for one feature should introduce
  in isolation.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint` (0 errors, 2 pre-existing
unrelated `i18n.tsx` warnings), and `npm run build` all pass clean. Same sandboxed-session
limitation as every prior pass this project (no `MONGODB_URI`, no Vercel CLI) — no live-database or
running-`vercel dev` manual verification, including of the new mobile UI at real device widths, was
possible; see `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" section for the full itemized
status.

---

## 2026-07-14 — Implement Global Search

The top navigation search box had never actually worked — a bare `<input>` with no `value`/
`onChange` at all, wired to nothing, plus a placeholder ("ค้นหาคำสั่งซื้อ, SKU, ผู้จำหน่าย...") left
over from a generic template mentioning purchase orders/vendors, neither of which are modules this
ERP has. Replaced with a real, permission-aware Global Search across Quotations, Customers,
Products, application pages/menus, and (permission-gated) Users.

### Backend — `GET /api/search?q=`

New `api/_lib/searchHandler.ts` (`handleSearch()`), mounted by adding a pathname check to
`api/handlers/customers.ts` (checked first, before falling through to the existing
`handleCustomers()` logic) rather than a new function file — Vercel Hobby's 12-function cap is
still fully used, same established pattern this file itself once shared with the now-removed
`company-profiles.ts`. New `vercel.json` rewrite: `/api/search` → `/api/handlers/customers`.

- **Query handling**: trimmed, minimum 2 characters (enforced server-side with a `400` — the
  frontend already gates on this before ever calling the endpoint, so this is defense-in-depth,
  not a normally-reachable path), every value regex-escaped (`escapeRegExp()`, matching the
  existing pattern in `api/handlers/roles.ts`) before use in a MongoDB `$regex`, so a query
  containing regex metacharacters searches for that literal text instead of being interpreted as a
  pattern or throwing.
- **Quotations** (`quotations:view`): matches quotation number (`_id`), customer/company name
  (`client`, or `customerSnapshot.companyName` when a linked customer exists), contact name,
  project name, PO reference, salesperson, Job Type code/name, status, and remarks. Each result
  carries the **before-VAT amount**, computed via the same shared `computeQuoteAmountBeforeVat()`
  helper the Dashboard uses (`api/_lib/quoteAmounts.ts`) — never `Quote.amount`'s VAT-included
  grand total. `Quote` has no `isDeleted` field (confirmed, documented in MODULES/Dashboard.md), so
  no such filter applies here either — consistent with every other Quote query in this codebase.
- **Customers** (`customers:view`): matches company name, contact name, phone, email, tax ID,
  address, project name. Filtered to `isDeleted: false` — archived customers don't normally appear.
- **Products** (`products:view`): matches SKU/code, name, description, specifications, unit, and
  category name (joined via a `categoryId` lookup against the small `categories` collection, which
  is also reused as the display-name lookup — no second round trip). Filtered to `archived: false`.
- **Pages/menus**: a small static, non-MongoDB-backed list (11 entries: Dashboard, Quotations,
  Create Quotation, Customers, Add Customer, Products, Product Categories, User Management, Roles
  and Permissions, Audit Logs, Profile/Settings) — matched against Thai/English aliases, filtered
  by the same permission each page's sidebar entry already requires. Deliberately excludes a
  "Notifications" entry present in an earlier requirement draft — this app has no dedicated
  Notifications page (only the header bell's dropdown), and inventing a fake nav target would
  violate the "no fake results" requirement. "Create Quotation"/"Product Categories" reuse their
  parent page's own view permission (`quotations:view`/`products:view`) rather than a stricter
  invented one, since neither page actually gates its create/manage-categories button more tightly
  today (a pre-existing, already-documented gap in IMPLEMENTATION_CHECKLIST.md — not something this
  feature should silently paper over). "Add Customer" does use `customers:create`, matching
  `CustomersPage.tsx`'s real `canCreate` gate.
- **Users** (`users:manage` only — every other category requires only view-level access, this one
  requires the same permission the User Management page itself does): matches full name, email,
  employee ID, username, department, position, and role (joined against the small `roles`
  collection by display name, so searching "Sales User" finds users with `roleKey: "sales_user"`).
- **RBAC enforcement is server-side, not UI-hiding**: every category above is independently gated
  by `roleHasPermission()` before its query even runs — a category the caller lacks permission for
  simply comes back as an empty array, indistinguishable in the response from a genuine
  zero-result search. The actual data never leaves the server for an unauthorized caller.
- **Indexes**: new `ensureSearchIndexes()` (same lazy, idempotent, once-per-warm-instance pattern
  as `ensureQuoteAnalyticsIndexes()` in `api/dashboard/index.ts`, wrapped in the same
  log-and-continue try/catch so a transient index-creation failure can't 500 the whole search) adds
  plain single-field indexes on `quotes.customerId`/`jobTypeCode`, `customers.contactName`/`phone`/
  `email`/`taxId`, `products.code`/`name`/`categoryId`/`archived`, `users.fullName`/`department`/
  `position`/`roleKey`. Deliberately does **not** redeclare `users.email`/`username`/`employeeId`
  (already declared `unique: true` elsewhere; a non-unique redeclaration of the same key would
  throw `IndexOptionsConflict` if that unique index exists in this deployment).
- **Known scaling limitation, documented not "fixed"**: substring (not just prefix) regex matching
  across a `$or` of several fields can't be efficiently served by a standard B-tree index — the
  indexes above help exact-match/sort use cases and keep the query planner's working set smaller,
  but the underlying search at real scale is still effectively a filtered collection scan per
  category, capped at 5 results and a small `limit()`. Acceptable at this ERP's actual data volume
  (one internal company, not big-data scale — same conclusion the Dashboard's own aggregation
  already reached). If data volume ever grows enough to matter, revisit with MongoDB Atlas Search
  (`$search`) rather than more regex indexes — not introduced now since it isn't already configured
  and isn't clearly beneficial at today's scale.

### Frontend

- New `src/lib/search.ts` — `fetchGlobalSearch(query, signal)`, typed `SearchResults`/per-category
  result interfaces mirroring the API response shape. Supports an `AbortSignal` for stale-request
  cancellation.
- New `src/components/GlobalSearch.tsx` — the dropdown/command-palette UI, replacing the dead
  input in `App.tsx`'s topbar. Debounced 300ms; a combined effect handles both the debounce timer
  and stale-request cancellation via `AbortController`. Previous results stay visible (with a
  small inline spinner, not a blank flash) while a new query is in flight — state resets only
  happen in the event handlers that trigger them (`handleQueryChange`, `retry`), not synchronously
  at the top of the fetch effect, matching the exact pattern `DashboardPage.tsx`'s
  `handleFiltersChange`/`retry` already established (avoids an avoidable render cascade,
  `react-hooks/set-state-in-effect`). Keyboard nav: Arrow Up/Down move a flat-indexed selection
  across all groups (offsets precomputed once per result set via `useMemo`, not a mutable counter
  threaded through render — the mutable-counter version tripped a `react-hooks/immutability` lint
  error), Enter activates the highlighted (or first) result, Escape closes. Ctrl/Cmd+K focuses the
  box from anywhere (a no-op below the `lg` breakpoint, where this header search box has no visible
  affordance at all today — not a regression, matches the box's existing responsive behavior).
  Simple substring highlighting (`<mark>`) on matched text. Click-outside-to-close mirrors
  `NotificationBell.tsx`'s existing `fixed inset-0` overlay pattern.
- **Deep-link navigation, not just list-page redirects**: clicking a Customer/Product/User result
  opens that record's edit form directly, and clicking "Create Quotation"/"Add Customer"/"Product
  Categories" jumps straight into that action — not just the parent list page. Added
  `initialEditId`/`onEditIdConsumed` to `CustomersPage.tsx`/`ProductsPage.tsx`/
  `UserManagementPage.tsx` (mirroring `QuotationPage.tsx`'s existing `initialQuoteId` pattern
  exactly: reacts to every change, not just once per mount, so a second search click while already
  on the page still jumps to the newly-clicked record) and `autoCreateSeq`/`autoView`/`autoViewSeq`
  to `CustomersPage.tsx`/`ProductsPage.tsx` (a monotonic sequence number, not a boolean, so the
  same page-action result clicked twice in a row still fires both times). `App.tsx` gained
  `navigateToCustomer`/`navigateToProduct`/`navigateToUser`/`navigateToPage` handlers plus
  `customerDeepLinkId`/`productDeepLinkId`/`userDeepLinkId`/`pageAction` state, following the exact
  shape of the pre-existing `quotationDeepLinkId`/`navigateToQuotation`.
- **i18n**: `topbar.searchPlaceholder` changed from the old generic-template text to "ค้นหาใบเสนอราคา
  ลูกค้า สินค้า หรือเมนู..." ("Search quotations, customers, products, or pages..."); new
  `topbar.searchAria` and `search.group.*`/`search.before`/`search.noResults`/
  `search.noResultsHelper`/`search.error`/`search.retry` keys (Thai + English).

### Deliberately not built this pass

- **Recent-search history** — explicitly optional per the requirement ("do not implement if it
  adds significant complexity"); skipped to keep this pass's scope to the core search feature.
- **Mobile/narrow-viewport search UI** — the header search box (and therefore Global Search
  entirely) remains `hidden` below the `lg` breakpoint, unchanged from before this pass. Building a
  mobile-specific full-screen search overlay would be a header-layout redesign beyond this task's
  scope, not a one-line fix.
- **MongoDB Atlas Search** — not introduced; see the "Known scaling limitation" note above.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint` (0 errors, 2 pre-existing
unrelated `i18n.tsx` warnings), and `npm run build` all pass clean. Same sandboxed-session
limitation as every prior pass this project (no `MONGODB_URI`, no Vercel CLI) — no live-database or
running-`vercel dev` manual verification was possible; see docs/TODO.md for the specific unverified
behaviors flagged as open items.

---

## 2026-07-14 — Codex review fix pass: progressive-loading High Priority issues + data-quality/documentation cleanup

An independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the Company Profiles removal /
Dashboard pre-tax / progressive-loading pass below found **zero Critical issues** (Company Profiles
removal, the before-VAT calculation rule, and Expected Sales all passed) but **3 High Priority**
progressive-loading issues and **3 Medium Priority** issues, all fixed this pass.

### High Priority #1 — normal page navigation still globally blocked by unrelated boot data

`App.tsx` fired all 9 boot-time domain fetches (`users`/`roles`/`company`/`products`/`categories`/
`notifications`/`quotes`/`jobTypes`/`customers`) independently, but gated every prop-driven page
(Quotations/Products/Customers/Users/Roles/Settings) behind one shared `initialDataLoading` flag —
so navigating straight to Products still waited on `notifications`/`quotes`/`users`/etc. that
Products never reads. Replaced with per-resource status tracking (`resourceStatus: Record<ResourceKey,
"loading"|"ready"|"error">`, one entry per boot resource) plus a new `NAV_RESOURCES` map naming which
resources each page actually needs (`products: ["products", "categories"]`, `customers:
["customers"]`, etc.). A page's loading/error state (`pageDataLoading`/`pageDataError`) is now
computed only from its own required subset. `loadDomainData`/its new `trackResource()` helper are
wrapped in `useCallback` (with a module-level `INITIAL_RESOURCE_STATUS` constant so the callback is
genuinely stable across renders) so the boot `useEffect` can correctly list it as a dependency
without re-running on every render.

### High Priority #2 — Dashboard workflow-triggered refresh left stale data with no indication

`DashboardPage.tsx`'s `refreshAfterAction()` (called after an Approve/Reject action from the
Approval Dashboard widget) only bumped `retryToken`, never set `loading`, so the previous stats
stayed on screen with zero visible sign a refresh was happening — a user could reasonably wonder
whether their approval actually took effect. Fixed: `refreshAfterAction` now also calls
`setLoading(true)`, surfacing the same small header indicator a filter change/retry already shows.
Since `stats` itself is untouched until the new response lands, the real data never disappears —
only a small "กำลังอัปเดตข้อมูล..." ("Updating data...") label + spinner appears next to the page
title (new `dashboard.refreshing` i18n key, both languages), replacing the bare spinner-only
indicator on subsequent loads (the very first load, where no `stats` exists yet, still shows the
plain spinner since the section skeleton below already communicates loading).

### High Priority #3 — a single optional dashboard section failure blocked the entire page

`GET /api/dashboard` ran index-creation, activity-timeline, sales-activity, approval-dashboard, and
notification-summary queries in the same failure domain as the KPI/pipeline/salesPerformance/etc.
computation — any one of them throwing (e.g. a transient auditLog query issue) 500'd the whole
response, and `DashboardPage.tsx` then replaced the entire data area with one `ErrorState`, hiding
KPIs and every other otherwise-healthy section. `api/dashboard/index.ts` now isolates each of these
four independently-optional blocks in its own `try/catch`, degrading to `null`/a safe zero default
(and a `console.error`/`console.warn` for visibility in Vercel function logs) on failure instead of
throwing:
- `ensureQuoteAnalyticsIndexes()` — index creation, log-and-continue.
- `activityTimeline` — already-nullable; failure now degrades to `null` (frontend already guards
  with `activityTimeline &&`), same as a caller without `auditLog:view`.
- `salesActivity` — same pattern; the object-literal type moved to a named `SalesActivityResult`
  type so the `let salesActivity: SalesActivityResult | null` declaration and try/catch assignment
  read cleanly.
- `approvalDashboard` — in-memory only (no I/O), wrapped for defense-in-depth consistency with the
  other permission-gated sections.
- `notificationSummary`/`availableSalespeople` — fall back to `{ unreadCount: 0, byType: {} }`/`[]`
  respectively (a personal unread-count widget and a filter-dropdown source list, neither of which
  is business data the rest of the response depends on).

KPIs, pipeline, salesPerformance, customerAnalytics, jobTypeAnalytics, forecast, revenueTrend, and
followUps — none of which depend on any of the four sections above — now survive a failure in any
one of them.

### Medium — first-load Dashboard skeleton was shell-first but not section-first

The original first-load placeholder (`DashboardContentSkeleton` in `DashboardPage.tsx`) was one
generic 4-card grid + one anonymous pulsing block — no real section titles, table headers, or named
card containers were visible while `GET /api/dashboard` was still in flight, only after the review
called this out as "shell-first but not section-first." Rebuilt to mirror the real P'Keng/P'Kee
4-section structure (`ExecutiveSummaryCards` → `QuotationStatusSummary` → `SalesActivityAnalytics` →
`ActivityTimeline`), reusing the *real* translated titles (via `t()`, the same keys the loaded
components use) and — for the two middle sections — the real `ChartCard` component itself for
pixel-identical header markup, plus the real 5-column `ActivityTimeline` table header row with
pulsing placeholder rows underneath. No layout/text jump when the real data arrives; only the
pulsing placeholders inside each section resolve into real values.

### Medium — missing-line pre-tax fallback was undocumented and unmonitored

`computeQuoteAmountBeforeVat(q.lines ?? [], q.discount ?? 0)` silently reports `$0` for a quote doc
whose `lines` field is entirely *absent* (not the same as a genuinely new Draft's legitimate `lines:
[]`) — the safest of three bad options (vs. crashing the whole Dashboard or falling back to the
VAT-included `amount`), but a prior draft of `docs/DATABASE.md`/`MODULES/Dashboard.md` over-claimed
this "cannot occur in practice" rather than documenting the fallback. Fixed: `api/dashboard/index.ts`
now emits a `console.warn` naming the affected count whenever a doc with no `lines` field is found in
the filtered set (grep-able in Vercel function logs, no new response field/UI surface added for what
is expected to be a null set); both docs corrected to describe the actual fallback behavior instead
of asserting it can't happen. See [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Pre-Tax Amount
Rule."

### Medium — stale documentation

`docs/MODULES/Customer.md` still described `/api/customers` as sharing the `company-profiles`
serverless function file and mixed up "this ERP's own single-company identity" with the (by then
removed) Company Profiles module in its Purpose section — both corrected to describe the current
dedicated `api/handlers/customers.ts` file and the actual `company` singleton. `docs/TODO.md` and
`docs/PROJECT_STATUS.md` both had a same-day-but-superseded entry claiming "the Company Profiles
module itself is untouched and remains available for future use," written before the module's
later-that-day full removal — both corrected with an explicit "superseded later the same day"
note pointing at the removal entry, rather than being silently rewritten (preserving the historical
record of what was true when each entry was written). `docs/ARCHITECTURE.md`'s "API layout" section
still listed `company-profiles` in the live `api/handlers/{...}` file list and said the project
"as of 2026-07-13" was at the function-count cap — corrected to the current `customers` file list
and "still at the cap as of 2026-07-14," with the `company-profiles.ts` → `customers.ts` slot
hand-off explained.

### Build/verification

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint` (0 errors, 2 pre-existing
unrelated `i18n.tsx` warnings), and `npm run build` all pass clean. Same sandboxed-session
limitation as every prior pass this project (no `MONGODB_URI`, no Vercel CLI) — no live-database or
running-`vercel dev` manual verification was possible; see `docs/CODEX_REVIEW_REPORT.md`'s "Claude
Fix Status" section for the full itemized status and what still needs a live-database pass.

---

## 2026-07-14 — Remove Company Profiles module; Dashboard items-based pre-tax rework; progressive/shell-first loading

Three-part pass, requested together.

### Part 1 — Company Profiles module removed from the user-facing ERP

This ERP only ever needs one issuer company; the admin module for managing several (built
2026-07-13, briefly and incorrectly wired into the Quotation form, corrected the same week — see
the entry below) was itself unused scope. Removed on explicit instruction, not left as dormant
surface area.

**Frontend removed**: `src/pages/admin/companyProfiles/` (`CompanyProfilesPage.tsx`,
`CompanyProfileList.tsx`, `CompanyProfileForm.tsx`, `CompanyProfileDetail.tsx`) and
`src/lib/companyProfiles.ts` deleted outright. `src/App.tsx`: the "ข้อมูลบริษัท" nav item removed
from `navItems`/`NavKey`/`NAV_GROUPS`/`NAV_LABEL_KEYS`; `canCreateCompanyProfiles`/
`canEditCompanyProfiles`/`canArchiveCompanyProfiles`/`canSetDefaultCompanyProfile` permission
booleans and the `"companyProfiles"` render case removed; the `companyProfiles`/`setCompanyProfiles`
state and its 4 fetch call sites (boot, setup-complete, sign-in, logout-reset) removed.

**Backend removed**: `api/handlers/company-profiles.ts` and `api/_lib/companyProfileValidation.ts`
deleted. `vercel.json`'s `/api/company-profiles` and `/api/company-profiles/:path*` rewrites removed
entirely — the path now returns Vercel's plain 404 (no function matches it), satisfying "return a
proper 404, not just hide the sidebar item." `api/_lib/collections.ts`: `CompanyProfileFields`
type and `companyProfilesCollection()` accessor removed (and its 3 `createIndex` calls removed from
`ensureIndexes()`). The customer-data logic that had been sharing `company-profiles.ts`'s
serverless function (to stay under Vercel Hobby's 12-function cap) now has its own dedicated
`api/handlers/customers.ts` file — the freed slot went straight back to its rightful owner rather
than sitting idle.

**RBAC removed**: `companyProfiles:view/create/edit/archive/delete/setDefault` removed from the
`Permission` union, `ALL_PERMISSIONS`, `PERMISSION_LABELS`, `PERMISSION_LABEL_KEY`,
`PERMISSION_GROUPS` (`src/lib/permissions.ts`), and from the Administrator default role's
permission list (`src/lib/roles.ts`). Confirmed safe before removing: `api/handlers/roles.ts` never
validated incoming `permissions` arrays against `ALL_PERMISSIONS` (only strips Super-Admin-locked
keys), so an existing custom role that already had one of these six permission strings stored keeps
it — inert and harmless, not a breaking change to that role.

**i18n removed**: every `companyProfiles.*`/`permission.companyProfiles*`/`empty.companyProfiles.*`/
`nav.companyProfiles` dictionary key (Thai + English, ~110 keys total) removed from
`src/lib/i18n.tsx`.

**Deliberately NOT removed**: the `company_profiles` MongoDB collection and any documents already
in it — no code reads or writes it anymore, but per this pass's explicit "no destructive database
cleanup" instruction, the collection itself was left in place in MongoDB. Historical `audit_log`
entries with `module: "โปรไฟล์บริษัท"` also remain and still display normally in the Audit Log page;
`POST /api/audit-log` still rejects that module string from the generic client-facing endpoint
(prevents forging *new* entries for a module that no longer exists — costs nothing to keep).

`npx tsc -b` and `npx tsc --noEmit -p tsconfig.api.json` both pass clean after this part.

### Part 2 — Dashboard pre-tax amounts reworked to compute from line items

The 2026-07-14 (earlier same day) Pre-Tax Amount pass had computed every Dashboard monetary value
via `preTaxAmount(amount) = amount / (1 + VAT_RATE/100)` — backing the before-VAT figure out of the
persisted VAT-included grand total by dividing by a fixed rate. A follow-up requirement asked for
this to instead compute from an authoritative source: `Quote` has no stored pre-tax/subtotal field,
so the authoritative source is each quote's own `lines`/`discount` — the same inputs already used to
derive the persisted `amount` at save time.

New shared `api/_lib/quoteAmounts.ts`:
```ts
computeQuoteAmountBeforeVat(lines, discountPct)  // subtotal after line + quote-level discounts, no VAT
computeQuoteAmountWithVat(lines, discountPct)    // the above, plus VAT — what Quote.amount stores
```
`api/_lib/quoteValidation.ts`'s `computeQuoteAmount()` (used by `POST`/`PATCH /api/quotes` to derive
the persisted `amount`) now delegates to `computeQuoteAmountWithVat()`, so create/edit and the
Dashboard compute a quote's value via the identical formula — no risk of the two ever drifting onto
different math. `api/dashboard/index.ts`'s local `preTaxAmount()`/`VAT_RATE` removed; its 3 raw-Mongo
queries that used to read `amount` (the main `docs` query, `followUpDocsRaw`, `wonRevenueDocsRaw`)
now project `lines`/`discount` instead and call `computeQuoteAmountBeforeVat()` at each read site.
`QuoteCalcDoc`'s `Pick<QuoteFields, ...>` gained `"lines" | "discount"`. Every `DashboardStats`
response field keeps its existing shape/key names — no client-side changes were needed for the
computation change itself.

**Label audit**: reviewed all 18 Dashboard widgets that render a monetary value for whether they
label it "(Before VAT)"/"ก่อนภาษี." 15 already did (KPI cards, Status Summary, both ranking tables,
Customer/Job Type Analytics, all 4 charts, Approval Dashboard, CSV export). 3 gaps fixed:
- `SalesPerformancePanel.tsx`'s Average Deal Size — the `dashboard.kpi.averageDealSize` i18n value
  itself gained "(ก่อนภาษี)"/"(Before VAT)" (this key has exactly one call site, so editing the
  value directly was safe and simpler than adding a new key).
- `PipelineSteps.tsx` — its `ChartCard`'s visible `sub` caption was `dashboard.pipelineSteps.sub`
  ("Click a stage...", no VAT wording); the already-correctly-worded `dashboard.pipeline.sub`
  ("Count and value of quotations by stage (before VAT) · click to view the list") existed in
  i18n.tsx but was only ever reachable via the `EmptyState` fallback — swapped the live `sub` prop
  to use it, which also preserves the click-affordance text since that key already includes it.
- `FollowUpReminders.tsx` — its per-row `฿{amount}` had zero adjacent label of any kind. Added a new
  `dashboard.followUps.amountNote` caption ("มูลค่าที่แสดงเป็นยอดก่อนภาษี"/"Amounts shown are before
  VAT") under the card title.

`npx tsc --noEmit -p tsconfig.api.json` and `npx tsc -b` both pass clean after this part.

### Part 3 — Progressive/shell-first loading

**`src/App.tsx` boot sequence.** Previously: `bootStatus` stayed `"loading"` (a full-page pulsing-logo
splash, `BootLoading`) through both the session check *and* a blocking 10-way `Promise.all` of every
domain fetch (users/roles/company/products/categories/notifications/quotes/jobTypes/companyProfiles/
customers) before the sidebar/header ever appeared. Now: `bootStatus` flips to `"ready"` as soon as
`fetchSession()` resolves with an authenticated user — the shell renders immediately — and a new
`loadDomainData()` fires each of the (now 9, companyProfiles fetch removed) domain fetches
independently via `Promise.allSettled`, with each one's own `setState` call running the moment *that*
fetch resolves rather than all of them waiting on the slowest. A new `initialDataLoading` boolean
tracks whether that bulk fetch has finished; pages purely prop-driven off it (Quotations/Products/
Customers/Users/Roles) render a new lightweight `SectionLoading` placeholder ("กำลังโหลดข้อมูล...")
in the content area instead of either blocking the shell or rendering their real (but still-empty)
props as a false "no records yet" state. Dashboard and Audit Log render immediately regardless,
since both already fetch their own data independently of this bulk load. `handleSetupComplete`/
`handleSignIn` were refactored onto the same `loadDomainData()` helper (previously 3 near-identical
copies of the same 10-fetch `Promise.all` block, one per entry point).

**Fixed a previously-documented, real gap**: the boot `useEffect`'s `fetchSession()` call had no
`try`/`catch` at all — any thrown network/API error left `bootStatus` stuck at `"loading"` forever,
with no way out (flagged in TODO.md since 2026-07-10, never fixed until now). Now wrapped; a thrown
error sets a new `bootError` state and renders a retryable `BootError` screen instead.

**`src/pages/dashboard/DashboardPage.tsx`.** The page title/description (`PageHeader`) and filter
bar now render unconditionally, even before the very first `/api/dashboard` fetch resolves (only
`stats?.` accesses, no `if (!stats) return ...` guard above them anymore). The large data-driven
widget tree (all 18 widgets) was extracted into a new `DashboardContent` subcomponent, so only that
part — not the page shell around it — shows a loading placeholder on first load (`DashboardContentSkeleton`,
now scoped to just the KPI-card-grid + one chart area, not the whole page). The pre-existing
keep-previous-data-visible-during-refetch behavior on filter change (a small spinner in the header,
`stats` never cleared) was already correct before this pass and is unchanged.

`npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all pass
clean after all three parts combined. Production bundle: the `CompanyProfilesPage`/company-profiles-
specific `ImageUploadField` chunks are gone entirely; the main `index.js` chunk shrank from
~342KB to ~324KB (raw, pre-gzip).

**Not done this pass**: no live-database/live-browser manual walkthrough — same recurring
sandboxed-session network limitation as every prior pass (no path to MongoDB Atlas or a running dev
server; see PROJECT_STATUS.md "Known Risks"). No per-widget progressive rendering *within* an
already-loaded Dashboard (all 18 widgets still render together once `stats` arrives — only the
page-shell-vs-first-load-content boundary was addressed). Quotations/Products/Users/Roles/Customers/
Settings pages were not redesigned with their own independent loading states beyond the new shared
`SectionLoading` placeholder, per "do not redesign unrelated pages." A real end-to-end spot-check of
the reworked pre-tax arithmetic against a live quote (hand-compute from its `lines`/`discount`,
compare to the Dashboard's reported figure) also needs a live database.

Docs updated: CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, RBAC.md, UI_GUIDELINES.md,
IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md (full rewrite).

---

## 2026-07-14 — Codex review fix pass: customer autofill/snapshot High Priority issues + documentation/naming cleanup

**Scope**: an independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the previous same-day
Customer Management pass found the core requirement already met (issuer UI gone, customer selector
wired to the real `customers` API, `customerId`/`customerSnapshot` persisted server-side) but 2
High Priority functional gaps and 3 Medium documentation/naming issues. Zero Critical findings.

**High #1 — `customerSnapshot` was written but never read.** `QuoteDocument.tsx` initialized every
Customer Information field's `useState` exclusively from the quote's legacy top-level fields
(`quote.client`, `quote.contactName`, etc.), never from `quote.customerSnapshot` — so the persisted
snapshot had no display consumer, failing the specified "snapshot displayed first when reopening a
quotation" requirement. Fixed by seeding each field from `quote.customerSnapshot` first (via `??`,
so a real stored empty string is respected, not skipped), falling back to the legacy top-level
field, then to `""` — the exact specified (1) snapshot → (2) legacy field → (3) empty order.
Deliberately does **not** add a further live lookup of the current customer master record by
`customerId` as a fourth fallback tier — that would silently overwrite a user's already-edited quote
fields with today's master data on every reopen, defeating the entire point of a frozen snapshot.
`PrintDocument.tsx` needed no separate change — it renders the same component state, now correctly
snapshot-seeded at its source.

**High #2 — customer selection could leave stale optional fields.** `handleSelectCustomer` in
`QuoteDocument.tsx` only overwrote `deliveryMethod`/`project`/`deliveryAddress` when the selected
customer's corresponding value was truthy (`if (c.deliveryMethod) setDeliveryMethod(...)`) — so
selecting a customer with blank delivery info left whatever value a *previously* selected customer
or manual entry had typed there, which then got saved into the newly-selected customer's
`customerSnapshot`. Fixed by assigning all nine fields unconditionally, including blank strings.

**Medium — dead/confusing issuer-branded types and stale present-tense documentation.**
- `src/lib/companyProfiles.ts`'s unused `IssuerCompanySnapshot` interface and unused
  `issuerDisplayFromProfile()`/`issuerDisplayFromSnapshot()` functions (nothing called them —
  `Quote.issuerCompanySnapshot` was already removed in the prior pass) — deleted outright.
- `IssuerCompanyDisplay` (still legitimately used for the single-`company`-singleton document
  header shape) renamed to `CompanyHeaderInfo` and **moved out of `companyProfiles.ts` into
  `storage.ts`** (next to `Company`, its actual data source) — the old name/location, sitting next
  to the live Company Profiles module, risked being mistaken for a still-supported multi-issuer
  concept. `QuoteDocument.tsx`'s `issuerDisplay` variable and `PrintDocument.tsx`'s `issuer` prop
  renamed to `companyHeader` to match; the now-pointless `?? company.x`/`?.` fallbacks in
  `QuoteDocument.tsx` were also simplified away since `companyHeader` is always a fully-populated
  plain object now, never conditionally built from a resolved Company Profile.
- `src/lib/companyProfiles.ts`'s `CompanyProfile` module-doc-comment, `src/lib/auditLog.ts`'s
  `relatedCompanyProfileId` doc comment, and `api/handlers/company-profiles.ts`'s `handleList()`
  comment still described the reverted issuer-selector integration as current — all corrected to
  past tense / marked reverted.
- `docs/MODULES/CompanyProfiles.md`'s "Quotation Integration" section and "Audit Logging" section's
  last paragraph were still written in **present tense** describing the removed feature as live
  (despite an earlier disclaimer at the section's top) — the review read this as "presents the old
  selector as current behavior." Rewrote "Quotation Integration" into a short, explicitly
  past-tense archival summary (renamed "— ARCHIVED, removed 2026-07-14 (do not reimplement)") and
  corrected the Audit Logging paragraph to state the removal plainly. `docs/CLAUDE.md`'s Company
  Profiles module-table row's **status label itself** still read "✅ Built (master-data management +
  Quotation integration)" — fixed to "✅ Built (admin master-data management **only** — NOT
  connected to Quotation)", with the long historical narrative trimmed and pointed at CHANGELOG.md
  instead of re-duplicated inline.
- `docs/MODULES/Quotation.md`'s "Customer Selection" section previously asserted the app's
  top-level quote fields were "always the direct source of truth shown on screen... not re-derived
  from the snapshot" — that was the exact design gap Codex's High #1 finding caught; corrected to
  describe the now-actually-implemented snapshot-first resolver.

**Verification**: `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and
`npm run build` all pass clean. No live-database browser verification — same sandboxed-session
network limitation as every prior pass (see PROJECT_STATUS.md "Known Risks").

**Deliberately not changed** (Low Priority / out of scope per the review's own framing): the
selector's 20-result client-side cap with no server-side search (acceptable at today's real
customer-list scale, matches the Company Profiles/Products precedent); the selected-customer chip
shows only the company name, not contact/tax ID (a UX polish, not a functional gap); no automated
test coverage was added (this project has none anywhere, by longstanding, documented choice — see
RBAC.md Known Gaps — not a regression introduced by this pass).

Docs updated: CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md,
IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md,
CODEX_REVIEW_REPORT.md (new "Claude Fix Status" section).

---

## 2026-07-14 — Correction: removed the incorrect Quotation "Issuer Company" feature; built the correct Customer Management module

**Scope**: a follow-up correction to the 2026-07-13 ninth/eleventh/twelfth-pass work. That work
built a Company Profiles selector into the Quotation form ("ออกใบเสนอราคาในนามบริษัท" — "issue
quotation as company") against a misunderstanding of the actual business requirement: this ERP only
ever issues quotations under a **single** company identity, so there is no "which company issues
this quote" decision to make. The real, correct requirement — restated explicitly this pass — was
always a **Customer** selector: save a customer/company's information once, then pick it from the
Quotation form to autofill the Customer Information section.

**Removed from the Quotation form and its API**:
- `src/pages/quotation/IssuerCompanySelector.tsx` — deleted.
- `QuoteDocument.tsx`'s issuer-company state block (`activeProfiles`/`defaultActiveProfile`/
  `issuerCompanyId`/`issuerChanged`/`selectedLiveProfile`/`useSnapshotForDisplay`/
  `hasIssuerProfile`/`canChangeIssuer`) and its rendered `<IssuerCompanySelector>` — removed.
  `issuerDisplay` (still used by the header band/`PrintDocument.tsx`) is now built directly and
  unconditionally from the `company` singleton, with no Company Profile branching.
- `companyProfiles`/`canViewCompanyProfiles`/`onNavigateToCompanyProfiles` props — removed from
  `QuoteDocument.tsx` and `QuotationPage.tsx`; `App.tsx` no longer threads them into
  `QuotationPage` (it still fetches `companyProfiles` for the standalone admin page, unchanged).
- `resolveIssuerCompanyUpdate()` and every `issuerCompanyId`/`issuerCompanySnapshot` branch in
  `api/handlers/quotes.ts` (create/PATCH/workflow) — removed.
- `Quote.issuerCompanyId`/`issuerCompanySnapshot` — removed from the `Quote` interface
  (`src/lib/quotes.tsx`) and `QuoteDraftFields`. Old quote documents in MongoDB may still carry
  these fields from the brief window they existed — harmless, simply unread now, not backfilled.
- `quotation.issuer.*` i18n keys — removed (Thai + English); the "ออกใบเสนอราคาในนามบริษัท" string
  no longer appears anywhere in the app.

**What was explicitly NOT removed**: the Company Profiles module itself (admin CRUD page, API,
`company_profiles` collection, `companyProfiles:*` permissions) — it remains fully functional for
managing business-identity master data, per the instruction to forget the *issuer-company-in-Quotation*
requirement specifically, not to delete the module wholesale.

**Built: Customer Management module** (replacing an unused, schema-only 2026-07-09 draft shape):
- `api/_lib/collections.ts`'s `CustomerFields` redefined to `companyName`/`contactName`/`phone`/
  `email`/`address`/`taxId`/`deliveryMethod`/`projectName`/`deliveryAddress`/`isActive`/`isDeleted`/
  audit fields — matching exactly what the Quotation form's Customer Information section collects,
  replacing the old CRM-flavored `position`/`source`/`salesOwnerId`/`notes`/`status`/`deletedAt`
  shape (which had zero live data — a clean redefinition, not a migration). `api/dashboard/index.ts`'s
  `totalCustomers` query updated from `deletedAt: null` to `isDeleted: false` to match.
- `api/_lib/customerValidation.ts` (new) — server-side validation, mirroring
  `companyProfileValidation.ts`'s pattern; only `companyName` is required.
- `api/_lib/customersHandler.ts` (new) — `handleCustomers()`, list/create/one/patch/archive, same
  shape a standalone `api/handlers/customers.ts` would have. **Folded into the `company-profiles`
  serverless function** rather than getting its own file: Vercel Hobby's 12-function cap was already
  reached (`company-profiles.ts` was the 12th and final slot, 2026-07-13). `api/handlers/company-profiles.ts`'s
  exported handler now checks the raw request pathname first — `/api/customers[/...]` delegates to
  `handleCustomers()` before falling through to its own `/api/company-profiles` path parsing.
  `vercel.json` gained matching `/api/customers` and `/api/customers/:path*` rewrites, both pointing
  at `/api/handlers/company-profiles`.
- `src/lib/customers.ts` (new) — `Customer`/`CustomerDraft`/`CustomerSnapshot` types +
  `fetchCustomers()`/`fetchCustomer()`/`createCustomer()`/`updateCustomer()`/`setCustomerArchived()`.
- `src/pages/customers/CustomersPage.tsx` (new) — single-file list + modal create/edit form (search,
  active/inactive filter, show-archived toggle, activate/deactivate, archive/restore) — deliberately
  simpler than Company Profiles' 3-file list/form/detail split, since a Customer record has far
  fewer fields and no logo/bank-account/multi-section complexity.
- `src/pages/quotation/CustomerSelector.tsx` (new) — "เลือกลูกค้า / บริษัท": a search input over the
  fetched customer list (matches company name/contact/phone/email/tax ID), a dropdown of results,
  and a collapsed "chip" once a customer is linked (with a `×` to unlink). Presentational only —
  `QuoteDocument.tsx` owns the actual autofill (`handleSelectCustomer()` copies
  companyName/contactName/phone/email/address/taxId always, and deliveryMethod/projectName/
  deliveryAddress only when the customer record has them set) and the Draft-only lock
  (`canChangeCustomer`).
- `Quote.customerId?: string` / `customerSnapshot?: CustomerSnapshot` (`src/lib/quotes.tsx`) —
  replacing the removed issuer fields. `QuoteDraftFields` gained `customerId` (client only ever
  sends the id, same "never trust a client-supplied derived value" rule `amount`/`jobTypeName`
  already follow).
- `api/handlers/quotes.ts`: `resolveCustomerIdUpdate()` (validates a sent `customerId` exists and
  isn't archived) and `buildCustomerSnapshot()` (always builds `customerSnapshot` from the
  Customer Information fields actually being saved — client/contactName/contactPhone/contactEmail/
  address/taxId/deliveryMethod/project/deliveryAddress — whether autofilled-then-edited or fully
  manual, per "when manually entered, still save the information into customerSnapshot"). `POST
  /api/quotes` always populates `customerSnapshot`, optionally `customerId`. `PATCH /api/quotes/:id`
  and `POST /api/quotes/:id/workflow` restrict `customerId` changes to Draft status (`400`
  otherwise, same rule the old `issuerCompanyId` had) and refresh `customerSnapshot` whenever
  `customerId` or any Customer Information field is present in the request, from the resulting
  merged values — otherwise leaving it untouched, so reopening a quotation preserves its existing
  snapshot. A distinct `"Quotation Customer Changed"` audit action replaces the removed
  `"Quotation Issuer Company Changed"` one.
- 4 new permissions: `customers:view/create/edit/archive` (`src/lib/permissions.ts`, not
  Super-Admin-locked) — Administrator gets all four by default; Sales User gets view/create/edit
  (no archive); Approver 1/2 and Viewer get view-only. New "ลูกค้า" `PERMISSION_GROUPS` entry.
- New nav item "ลูกค้า" (`Contact` icon), added to the existing "Sales" sidebar group alongside
  Quotations; `CustomersPage` lazy-loaded and routed in `App.tsx`, with `customers` state fetched
  in every boot/setup/sign-in `Promise.all` (`.catch(() => [])`-guarded, same reasoning as
  `companyProfiles`).
- ~40 new i18n keys (Thai + English): `nav.customers`, `quotation.customerSelector.*`,
  `customers.*` (page/list/form/toasts/confirms), `empty.customers.*`, `permission.customers*`.

**Verification**: `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, and
`npm run build` all pass clean. **Not done**: no live-database browser verification (same
sandboxed-session network limitation as every prior pass — see PROJECT_STATUS.md Known Risks); no
"บันทึกเป็นลูกค้าใหม่" (save-as-new-customer-from-the-quotation-form) convenience feature —
explicitly flagged optional/future in the requirement ("do not add unless simple and safe").

Docs updated: PROJECT_STATUS.md, TODO.md, CLAUDE.md, DATABASE.md, API.md, RBAC.md,
UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Customer.md (full rewrite),
MODULES/Quotation.md, MODULES/CompanyProfiles.md.

---

## 2026-07-14 — Dashboard Codex-review fix pass (Critical + High Priority)

**Scope**: an independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the same-day Pre-Tax
Amount pass found 1 Critical and 3 High Priority Dashboard issues. All 4 fixed this pass, plus one
Medium-priority correctness fix folded in since it touched the same code paths.

**Critical — Sales Activity Analytics was invisible to most Dashboard roles.**
`api/dashboard/index.ts`'s `salesActivity` aggregation was gated behind `roleHasPermission(ctx.role,
"auditLog:view")` — the same gate as the raw audit-log-backed `activityTimeline`. Default
`sales_user`/`approver_1`/`approver_2`/`viewer` roles all have `dashboard:view` but not
`auditLog:view`, so the P'Keng/P'Kee-required "กิจกรรมของฝ่ายขาย" section silently disappeared for
every one of them. Fixed by removing that gate from `salesActivity` specifically — it's now
computed for any caller who already passed the route's own `dashboard:view` check, matching every
other required-section field. `activityTimeline` ("Recent Activity Details," the literal audit-log
feed) intentionally keeps its `auditLog:view` gate — a different, more sensitive feature. Response
type comment in `src/lib/dashboard.ts` updated; `DashboardPage.tsx`'s `salesActivity &&` render
check is now a defensive null-guard, not an actual permission gate.

**High — Sales Activity ignored the date-range filter's start date.** The `activityMatch` query
behind `salesActivity` never bounded by `from`/`to` at all — selecting "Today" still scanned and
displayed a full rolling 12-week/12-month/etc. trend built from all-time data, contradicting the
"filters must affect all Dashboard sections" requirement. Fixed by adding
`activityMatch.createdAt = bangkokDayBoundsUtc(from, to)` when either is set, the same pattern
`activityTimeline` already used. `SalesActivityAnalytics.tsx` gained a `dateFiltered` prop
(`DashboardPage.tsx` passes `!!stats.filters.from`) that switches the section's caption between the
existing "rolling trend, not limited by filter's start date" copy and a new "กรองตามช่วงวันที่ที่เลือก"
/ "filtered to the selected date range" copy, so the UI never claims a behavior the query isn't
actually doing. New i18n keys: `dashboard.salesActivity.sub.filtered` (Thai + English).

**High — an empty database hid the required KPI cards.** `DashboardPage.tsx` replaced the *entire*
page with one full-page `EmptyState` whenever `hasAnyData` was false, so a brand-new deployment
with zero quotations/products never showed the four required KPI cards at 0, nor the Status
Summary/Sales Activity's own empty states — failing the business requirement's explicit "show zero
KPI values plus relevant empty states" rule for an empty database (distinct from a narrow filter
matching zero results, which was already handled correctly). Fixed: removed the page-wide
conditional entirely; every required section and supporting-detail section now always renders
(each already degrades gracefully via its own per-widget empty state). A compact inline banner
("ยังไม่มีข้อมูลธุรกิจ") now renders above the KPI cards instead, communicating the same thing
without blocking the page. The now-unused full-page `EmptyState` import was removed from
`DashboardPage.tsx`.

**Medium (folded in) — Expected Sales used a truthy check, not strict `=== true`.** All three
`isPotentialOpportunity` predicates in `api/dashboard/index.ts` (`expectedSales` KPI,
`salesPerformance[].expectedRevenue`, `forecast`'s `openOpportunities` filter) now compare
`q.isPotentialOpportunity === true` explicitly rather than relying on JS truthiness — closes a
theoretical gap where a stray non-boolean truthy value (e.g. the string `"false"`, which is truthy)
on a legacy/externally-written document would have been miscounted as a potential opportunity.

**Not fixed, documented instead — High: no soft-delete predicate on Dashboard quote queries.**
Confirmed by grep that `Quote`/`QuoteFields` has no `isDeleted`/soft-delete field anywhere in the
schema today (quotations are only ever removed from "active" via the `ยกเลิก`/Cancelled status).
Adding a MongoDB filter on a field that can never be set would be dead, speculative code implying a
deletion feature that doesn't exist. Documented explicitly instead — a code comment directly above
every Dashboard quote-query match object in `api/dashboard/index.ts`, plus DATABASE.md/
MODULES/Dashboard.md — noting every quote query in the file must be updated together if a real
soft-delete field is ever introduced.

**Verification**: `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Same sandboxed-session no-live-database limitation as every prior pass (this review's own session
hit a different but equally blocking environment issue — "WSL 1 is not supported"). Verified via a
temporary isolated Playwright preview (`src/devPreview.tsx` + `dashboard-preview.html`, deleted
after use) specifically targeting this review's findings: rendered the KPI/status/activity
components together under a "simulating a Sales User (dashboard:view only)" label, confirming Sales
Activity Analytics now renders in that scenario; rendered `SalesActivityAnalytics` with both
`dateFiltered={false}` and `dateFiltered={true}` to confirm the caption switches; rendered the new
compact empty-state banner. All confirmed correct with zero console errors.

**Files changed**: `api/dashboard/index.ts`, `src/lib/dashboard.ts`,
`src/pages/dashboard/DashboardPage.tsx`, `src/pages/dashboard/SalesActivityAnalytics.tsx`,
`src/lib/i18n.tsx`. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md,
API.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md,
CODEX_REVIEW_REPORT.md's new "Claude Fix Status" section.

---

## 2026-07-14 — Dashboard Pre-Tax Amount pass

**Scope**: a follow-up P'Keng/P'Kee requirement — every Dashboard monetary total must be the
pre-tax (before-VAT) amount, never `Quote.amount`'s persisted VAT-included grand total. The
required-5-section layout (4 KPI cards, Win/Lose/Active/Non-Active status summary, Sales Activity
Analytics with weekly/monthly/quarterly/yearly tabs and a salesperson filter tracking new-quotation
and edited-quotation counts) was already in place from the 2026-07-13 passes — this pass's scope
was strictly the amount-calculation rule and making it visible.

**Why this is exact, not an approximation**: `Quote` has no persisted pre-tax/subtotal field —
`amount` is always `afterDiscount * (1 + VAT_RATE/100)` with no intermediate rounding
(`computeQuoteAmount()` in `api/_lib/quoteValidation.ts`), and `VAT_RATE` (7%) has always been a
single fixed constant applied to every quote, never a per-quote override or a different historical
rate. So `preTaxAmount(amount) = amount / 1.07` (new helper, `api/dashboard/index.ts`) recovers the
exact `afterDiscount` value the server computed at save time — for every quote ever saved, old or
new alike, not a best-effort fallback.

**Backend** (`api/dashboard/index.ts`): added `preTaxAmount()`. Normalized `docs[].amount` (the
filtered per-quote array every KPI/pipeline/salesPerformance/customerAnalytics/jobTypeAnalytics/
forecast/`approvalDashboard.pendingList` computation derives from) to its pre-tax value exactly
once, immediately after the filtered `quotes.find()` fetch — every downstream `.reduce()`/
`.filter()` inherits it automatically, so no individual call site could accidentally miss the
conversion. The two aggregations reading from separate queries instead of `docs`
(`revenueTrend`/`revenueByMonth`'s won-quote scan, `followUps`) apply `preTaxAmount()` explicitly
at their own read sites. No response field was renamed — `totalQuotationValue`, `closedSales`,
`expectedSales`, `lostValue`/`activeQuotationsValue`/`nonActiveQuotationsValue`,
`pipeline[].totalValue`, `salesPerformance`, `customerAnalytics`, `jobTypeAnalytics`, `forecast`,
`revenueTrend`/`revenueByMonth`, `followUps[].amount`, `approvalDashboard.pendingList[].amount`
all keep their names, only their computed values changed.

**Frontend labels** (`src/lib/i18n.tsx`, both Thai and English): the 4 KPI card titles/helpers now
say "ก่อนภาษี" — `มูลค่าใบเสนอราคารวมก่อนภาษี`, `ยอดขายที่ปิดแล้วก่อนภาษี`,
`ยอดขายที่คาดว่าจะปิดได้ก่อนภาษี` — matching the requirement's exact wording; the Expected Sales
helper text (`เฉพาะใบเสนอราคาที่เซลส์ติ๊กว่างานนี้น่าสนใจ`) already matched verbatim, unchanged.
`QuotationStatusSummary`'s value column is now `มูลค่ารวมก่อนภาษี`. Supporting-detail
tables/charts (Executive Ranking, Sales Performance, Job Type Analytics, Customer Analytics,
Sales Pipeline, Approval Dashboard, Revenue Trend/by-Job-Type charts, Expected Sales forecast
chart) gained a "(ก่อนภาษี)"/"(Before VAT)" suffix on every money-bearing label. `csvExport.ts`
column headers gained the same "(Before VAT)" suffixes.

**Verification**: `tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint`,
`npm run build` all pass clean. This sandboxed session has no live-database path (`.env.local`
carries no `MONGODB_URI`, and no Vercel CLI is installed to `vercel env pull` one) — same
limitation as every prior pass, see PROJECT_STATUS.md "Known Risks." Verified instead via a
temporary, isolated Playwright preview harness (`src/devPreview.tsx` + `dashboard-preview.html`,
deleted after use) mounting the real `ExecutiveSummaryCards`/`QuotationStatusSummary`/
`SalesActivityAnalytics` components with representative mock data — confirmed all 4 KPI cards
render with the new titles/helpers, the Status Summary shows the Won/Lost/Active/Non-Active rows
with job counts + pre-tax values + percentages under the new column header, and Sales Activity
Analytics' weekly/monthly/quarterly/yearly tabs switch correctly (clicked "รายสัปดาห์," confirmed
the chart and table both re-rendered for the new period), with zero console errors beyond an
expected missing-favicon 404.

**Files changed**: `api/dashboard/index.ts`, `src/lib/i18n.tsx`, `src/pages/dashboard/csvExport.ts`.
Docs updated: this file, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, UI_GUIDELINES.md,
IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.

---

## 2026-07-13 — Fix Codex-review issues in Company Profile header integration (twelfth same-day pass)

**Scope**: an independent Codex review of the eleventh pass's Quotation-issuer integration
(`docs/CODEX_REVIEW_REPORT.md`) found **zero Critical** and **zero High Priority** issues — the
requested selector/snapshot/RBAC/audit/PDF flow was already correctly implemented end-to-end. It
found 4 Medium and 3 Low Priority items, one of which (Medium #1) was a concrete, safely-scoped
code defect in exactly the header-integration area this task covers; the rest are either
already-documented business decisions, speculative future work, or explicitly out of this task's
scope (full print redesign, live-database integration tests).

1. **Fixed (Medium #1) — the issuer display fallback chain skipped the default active profile.**
   `QuoteDocument.tsx` previously resolved `issuerDisplay` as: quote's own snapshot → the live
   profile the quote references (only if still active/not-deleted) → straight to the legacy
   `company` singleton. A quote with `issuerCompanyId` set but no `issuerCompanySnapshot` (rare
   partial/legacy data), whose referenced profile has since been deactivated or archived, would
   incorrectly jump to the legacy singleton instead of showing the real default active company
   profile. Fixed by inserting the default active profile as an intermediate fallback step, exactly
   matching the review's requested order (snapshot → referenced profile → default active profile →
   legacy singleton). `hasIssuerProfile` (which drives the no-issuer warning banner) now also
   treats this fallback as a genuinely resolved issuer, since it's real, non-fake company data.
2. **Fixed (documentation mismatch)** — `src/lib/quotes.tsx`'s `issuerCompanyId` doc comment and
   `src/lib/companyProfiles.ts`'s `CompanyProfile` doc comment both still said the Quotation
   integration was unbuilt ("prep only, not yet wired" / "no Quotation-form UI selects one yet"),
   left over from before the eleventh pass wired it in. Both corrected.
   `docs/MODULES/CompanyProfiles.md`'s introductory sections had the same stale claim, directly
   contradicting its own later "Quotation Integration" section — corrected, and the "Display
   resolution" fallback description (there and in `MODULES/Quotation.md`) expanded to the accurate
   4-step chain including the new default-profile fallback step.
3. **Not changed, with reason** (see `docs/CODEX_REVIEW_REPORT.md` "Claude Fix Status" for the full
   itemized reasoning): Medium #2 (issuer still optional on Draft — an existing, documented business
   decision, not a defect); Medium #3 (full Company Profile payload returned to the selector — a
   real but non-urgent payload-size optimization, out of this task's header-integration scope);
   Medium #4 (header preview is a selector-panel card rather than a persistent document-header band
   — an intentional, already-reviewed layout, not a functional gap); Low #1/#3 (English-address print
   variant, no dedicated default-profile endpoint — speculative future work); print-layout expansion
   for fax/website/branch/English name (explicitly out of scope per this task's own instructions);
   live-database integration tests (no network path to MongoDB Atlas in this sandboxed session).

**Verification**: `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run
build` all clean. Verified via an isolated Playwright preview mounting the real `QuoteDocument`
component with a quote reproducing the exact Medium #1 scenario (references a deactivated profile,
no snapshot, alongside a separate default active profile) — confirmed the header now shows the
default active profile's real data (not the legacy singleton), no warning banner, and the customer
form below still works, at 1440px and 390px with no console errors or layout overflow.

Docs updated: this file, PROJECT_STATUS.md, CLAUDE.md, TODO.md, DATABASE.md, API.md,
UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md,
and `CODEX_REVIEW_REPORT.md`'s new "Claude Fix Status" section.

---

## 2026-07-13 — Wire Company Profiles into Quotation creation (eleventh same-day pass)

**Scope**: close the gap the ninth pass deliberately left open — "Company Profiles is master-data
management only... nothing sets `Quote.issuerCompanyId`/`issuerCompanySnapshot` yet." This pass
wires company-profile selection all the way through the Quotation form, the server, and the
printed document.

1. **`IssuerCompanySelector.tsx` (new)** — a presentational component shown above the customer
   section on the create/edit Quotation form: "ออกใบเสนอราคาในนามบริษัท." Renders an empty state
   (zero active profiles, with a permission-gated link to Company Profiles), a `<select>` of
   active/non-deleted profiles (with a "ค่าเริ่มต้น" badge on the default), a header preview panel
   (logo/name TH+EN/address/phone/fax/email/website/tax ID/branch — blank fields hidden, never
   placeholder text), a locked-with-tooltip state when the quote has left Draft, and an
   independent warning banner ("ใบเสนอราคานี้ยังไม่มีข้อมูลบริษัทผู้ออกเอกสาร") when no real
   issuer company is resolved.
2. **`src/lib/companyProfiles.ts`** — added `IssuerCompanySnapshot` (the frozen-at-issue-time
   shape stored on `Quote.issuerCompanySnapshot`) and `IssuerCompanyDisplay` (a unified rendering
   shape used by both the on-screen preview and the printed document, regardless of whether the
   data came from a live profile, a frozen snapshot, or the legacy `company` singleton), plus
   `issuerDisplayFromProfile()`/`issuerDisplayFromSnapshot()` pure mapping functions.
3. **`src/lib/quotes.tsx`** — `Quote.issuerCompanySnapshot` widened to reference the shared
   `IssuerCompanySnapshot` type (previously an inline, narrower placeholder object type);
   `issuerCompanyId` added to `QuoteDraftFields`.
4. **`api/handlers/company-profiles.ts`** — `GET /api/company-profiles` relaxed to accept either
   `companyProfiles:view` (full list) or `quotations:create` (server-filtered to
   active-and-not-deleted only) — a Sales user who can create quotations but has no Company
   Profile management permission can still populate the selector, without seeing archived/inactive
   profiles or gaining any management capability.
5. **`api/handlers/quotes.ts`** — added `resolveIssuerCompanyUpdate(rawValue)`: validates a
   client-sent `issuerCompanyId` against a real, active, non-deleted `company_profiles` document
   (`400` if missing/inactive/archived), then builds `issuerCompanySnapshot` from that profile at
   that instant, server-side — the client never constructs or sends a snapshot itself. Wired into
   `POST /api/quotes` (create), `PATCH /api/quotes/:id` (Draft-only — `400` if the quote has left
   `"ร่าง"`), and `POST /api/quotes/:id/workflow` (same Draft-only gate, checked against the
   quote's *pre-transition* status since a workflow action like Submit moves it out of Draft in the
   same request). An explicit empty `issuerCompanyId` clears both fields via a MongoDB `$unset`,
   not just an empty-string `$set`. `PATCH` writes a distinct `"Quotation Issuer Company Changed"`
   audit entry (reusing `relatedCompanyProfileId`/`relatedCompanyProfileName`, the same structured
   fields `writeCompanyProfileAuditEntry()` already uses) whenever the issuer specifically changed,
   instead of the generic `"Quotation Updated"` entry.
6. **`src/pages/quotation/QuoteDocument.tsx`** — computes `issuerDisplay` via
   `useSnapshotForDisplay = isDetail && !issuerChanged && !!quote?.issuerCompanySnapshot`, falling
   back to the live-selected profile, then to the legacy `company` singleton (never `undefined`) —
   so the header band and `PrintDocument` never need a "what if there's nothing" branch of their
   own. `hasIssuerProfile` is tracked as an independent signal (decoupled from what's rendered) to
   drive the warning banner. `canChangeIssuer` gates the selector to Draft (`mode === "new"` or
   `status === "ร่าง"`), mirroring the server-side lock.
7. **`src/pages/quotation/PrintDocument.tsx`** — `company: Company` prop replaced with
   `issuer: IssuerCompanyDisplay`; every header/stamp reference (`company.logoDataUrl`/`.name`/
   `.address`/`.taxId`/`.phone`/`.email`/`.stampDataUrl`) renamed to the `issuer.*` equivalent. No
   hardcoded company header remains in the printed document.
8. **`src/pages/quotation/QuotationPage.tsx` / `src/App.tsx`** — `companyProfiles`,
   `canViewCompanyProfiles` (`hasPermission(..., "companyProfiles:view")`), and
   `onNavigateToCompanyProfiles` (`() => setActiveNav("companyProfiles")`) threaded through to
   `QuoteDocument`.
9. **`src/lib/i18n.tsx`** — 8 new keys (`quotation.issuer.title/emptyTitle/emptySub/
   goToCompanyProfiles/selectLabel/selectPrompt/warningNoIssuer/lockedNotDraft`) in both Thai and
   English dictionaries.

**Old quotations are unaffected**: both fields are simply unset on any quote created before this
pass; display falls back through the same chain to the legacy `company` singleton, exactly as it
rendered before this change — no migration/backfill was run or needed.

**Verification**: `npx tsc -b` and `npx tsc --noEmit -p tsconfig.api.json` both clean, `npm run
lint` clean (pre-existing warnings only), `npm run build` clean. Verified via an isolated
Playwright preview harness (`preview.html` + `src/previewMain.tsx`, deleted after use per this
session's established pattern) mounting the real `IssuerCompanySelector` component with mock
`CompanyProfile` data across 5 scenarios — 0 active profiles (empty state), 1 (auto-selected
default), 2+ (explicit selection, default badge), locked/not-Draft (disabled + tooltip), and no
issuer resolved (warning banner) — at 1440px and 390px; all rendered correctly with no console
errors beyond a harmless missing-favicon 404. No live-database manual walkthrough was possible —
same sandboxed-session network limitation as every other pass this session (see PROJECT_STATUS.md
"Known Risks").

**Known limitations, left deliberately undone this pass** (see TODO.md/MODULES/CompanyProfiles.md
for the full reasoning): `quotationPrefix`/`quotationNumberFormat` per company profile don't
compose with `nextQuoteId()`'s single global atomic sequence; no hard block on saving a Draft with
no issuer company selected (a warning is shown instead); `handleWorkflow` doesn't write its own
distinct issuer-change audit entry the way `PATCH` does (the workflow's own transition entry still
fires either way).

Docs updated: this file, PROJECT_STATUS.md, CLAUDE.md, TODO.md, DATABASE.md, API.md, RBAC.md,
UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, MODULES/Quotation.md.

---

## 2026-07-13 — Fix Codex-review Critical/High Company Profiles issues (tenth same-day pass)

**Scope**: an independent Codex review of the ninth pass's Company Profiles module
(`docs/CODEX_REVIEW_REPORT.md`) found **zero Critical issues** in server-side RBAC enforcement
(every route in `api/handlers/company-profiles.ts` correctly calls `requirePermission()`) and
**3 High Priority issues**, all fixed this pass, plus a genuinely severe bug the review flagged
only as an unverified Medium concern that turned out to be real and worse than described.

1. **Fixed — the app's boot sequence broke for any role without `companyProfiles:view`.** The
   ninth pass added an unconditional `fetchCompanyProfiles()` call to the shared boot/sign-in
   `Promise.all` in `App.tsx` (3 call sites). Sales User, Approver Level 1/2, and Viewer — every
   default role except Super Admin/Administrator — don't hold `companyProfiles:view`, so
   `GET /api/company-profiles` correctly 403s for them, which rejected the whole `Promise.all`.
   Since the boot effect has no surrounding `try`/`catch` (a pre-existing, separately-tracked
   gap), `bootStatus` never reached `"ready"` — **every non-admin user who signed in got stuck on
   the loading spinner indefinitely.** Fixed with `.catch(() => [])` on all 3 call sites: a caller
   who can't see this resource anyway correctly falls back to an empty list instead of taking down
   the whole app. Separately, `handleSignIn` (the normal login flow, distinct from initial page
   load) was never fetching company profiles at all — a genuine gap from the ninth pass, not
   something Codex flagged — fixed alongside. Codex's own review flagged this general area only as
   Medium Priority ("needs runtime verification"); verifying it surfaced a bug worse than
   described, so it's fixed with the same urgency as the High Priority items below.
2. **Fixed (High #1) — a current default company could be deactivated without reassignment.**
   `PATCH /api/company-profiles/:id` accepted `isActive: false` with no check against
   `target.isDefault`, and the list UI offered the Deactivate action on default rows. Fixed:
   the handler now rejects deactivating the current default with the same
   "set another company as default first" error the archive action already used; the `isActive`
   toggle also now shows a confirmation dialog before deactivating (previously immediate, no
   confirmation at all — a related UX gap the same review flagged as Medium).
3. **Fixed (High #2) — the one-default rule was unsafe under concurrent requests.** First-creation
   used `countDocuments` then `insertOne`, and set-default used `updateMany` then `updateOne`,
   neither inside a transaction or backed by a database constraint — two simultaneous "first
   create" or "set default" requests could interleave and leave two documents both claiming
   `isDefault: true`. Fixed with a **partial unique MongoDB index** —
   `{ isDefault: 1 }` with `partialFilterExpression: { isDefault: true }` — so the database itself
   now guarantees at most one default document can exist, not just the application-level
   sequencing (which reduces the race window but can't eliminate it alone). Both write paths catch
   the resulting duplicate-key error: a losing concurrent "first create" retries once as a
   non-default profile (there's now definitely already a winner), and a losing concurrent
   set-default surfaces a clear "someone else just changed the default, try again" message instead
   of a raw 500. Bundled in the same fix: the auto-assigned first-ever profile is now also forced
   `isActive: true` regardless of the create form's Active checkbox (Medium finding — "the first
   profile is forced default but can be created inactive," a real invariant break on its own).
4. **Fixed (High #3) — Company Profile audit entries were client-authored and incomplete.**
   `CompanyProfilesPage.tsx` called the generic `POST /api/audit-log` after each mutation
   succeeded — any authenticated caller could forge an arbitrary "Company Profile Created"/"Default
   Company Changed" entry with fabricated text, and entries carried no structured link to which
   profile changed. Fixed the same way the 2026-07-10 quotation audit-integrity fix did: a new
   `writeCompanyProfileAuditEntry()` inside `api/handlers/company-profiles.ts` writes the
   authoritative entry as part of each mutation (create/update/archive/set-default), stamped with
   the already-verified session identity, `relatedCompanyProfileId`/`relatedCompanyProfileName`
   (new optional `AuditLogEntry` fields, same pattern as `relatedQuoteId`/`relatedCustomerName`),
   and a Thai description of which fields changed — logo/stamp changes are named explicitly
   ("แก้ไข: โลโก้บริษัท"), not folded into a generic "field updated" message, per the review's
   "distinct logo/stamp upload events" ask. `POST /api/audit-log` now rejects the `"โปรไฟล์บริษัท"`
   module outright, mirroring the existing `"ใบเสนอราคา"` lockout — this is now the only path
   Company Profile audit entries can be written through. The now-redundant client-side `onAudit`
   calls and prop were removed from `CompanyProfilesPage.tsx`/`App.tsx`.
5. **Fixed (Medium) — the detail view didn't show `createdBy`/`updatedBy`.** `CompanyProfileDetail.tsx`
   now resolves both to the user's full name (via a `users` prop threaded from `App.tsx`, same data
   already in state for every other admin page), falling back to the raw stored ID if the account
   was since deleted rather than hiding the field.
6. **Fixed (Medium) — blank bank-account rows were accepted.** `companyProfileValidation.ts` now
   drops bank-account entries where every field (bank/account name/number/branch) is empty before
   storing — not full per-field required validation, just a floor against persisting pure-noise
   rows left over from clicking "+ Add Bank Account" without filling anything in.
7. **Fixed (Low) — icon-only row actions relied on `title` alone, and logo/stamp `<img>` alt text
   was generic.** Added explicit `aria-label`s (View/Edit/Set Default/Activate/Deactivate/Archive,
   each naming the specific company) to every icon-only button in `CompanyProfileList.tsx`, and
   changed logo/stamp `alt` text from the literal words "logo"/"stamp" to
   "{field label} — {company name}" in both the list and detail views.
8. **Deliberately not fixed this pass, with reasons** (see `docs/CODEX_REVIEW_REPORT.md`'s new
   "Claude Fix Status" section for the full list): server-side pagination/filtering/projection on
   `GET /api/company-profiles` (Medium — real at scale, but this is a small internal master-data
   list today, and building it now would be speculative before real usage volume exists); an
   inline "Set as Default" control inside the Basic Information form section, in addition to the
   existing dedicated list action (Medium — the review itself notes "the separate API is safer,"
   so the dedicated action was kept as the only path rather than adding a second one that would
   need the exact same invariant checks duplicated in the form); `archivedAt`/`archivedBy` as
   distinct structured fields separate from the generic `updatedAt`/`updatedBy` (Medium — the new
   audit-log entries already capture *when* and *by whom* an archive happened, which was the
   underlying gap; adding parallel fields to the document itself would be duplicating that data,
   not closing a real gap); a MongoDB transaction wrapping create/set-default (superseded — the
   partial unique index added in fix #3 above closes the actual data-integrity gap a transaction
   would have addressed, without introducing a pattern (multi-document transactions) nothing else
   in this codebase uses).
9. **Documentation corrected to match the code, not the aspiration** (Codex review, "Documentation
   mismatch" — the doc updates below fix 3 specific overclaims the review caught): bank accounts
   are capped at 10, not "unlimited" as `MODULES/CompanyProfiles.md` previously said; the
   default-profile invariant is now described with its real, database-enforced guarantee (the
   partial unique index) rather than the weaker "sequenced, not atomic" language that predated
   fix #3; audit entries are now described as server-authoritative (matching the quotation
   precedent), not "client-triggered, matching Users/Roles/Settings" as the ninth pass's docs said
   — that description was accurate for the ninth pass's actual code, and is now updated to match
   the tenth pass's fix.
10. **Verification**: same environment constraint as every same-day pass this session (no local
    backend). `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
    all pass clean. Visually verified via an isolated Playwright preview of the real
    `CompanyProfileList`/`CompanyProfileDetail` components with mock data — confirmed the new
    deactivate confirmation dialog fires correctly, and the detail view's "สร้างโดย"/"แก้ไขล่าสุดโดย"
    rows resolve a real user ID to a name and correctly fall back to the raw ID for a
    since-deleted account. No live-database concurrency test (two genuinely simultaneous
    set-default requests racing against real MongoDB) was possible in this sandboxed session — the
    partial unique index's guarantee is a MongoDB-documented behavior, not independently
    load-tested here; flagged in TODO.md as worth a real concurrency test once a live environment
    is available.
11. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, RBAC.md,
    UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md, and
    `CODEX_REVIEW_REPORT.md`'s new "Claude Fix Status" section.

---

## 2026-07-13 — Add Company Profiles module (multi-company quotation issuer prep, ninth same-day pass)

**Scope**: a new admin module preparing the ERP for multi-company quotation issuance in the
future — add/edit/view/activate-deactivate/archive/set-default management of "Company Profile"
master-data records (the official business identity that goes on a quotation document: name,
logo, address, tax ID, branch, bank accounts, quotation prefix/terms/footer, stamp). Explicitly
**not** a customer, not a user account, not a multi-tenant/multi-website split — this remains one
internal ERP, now with a second kind of company-identity master data alongside the existing
single `company` singleton (Settings → Company Info, unchanged, still the app's own
branding/settings record — see "Two company records" note below). No Quotation-form UI selects a
company profile yet; that integration is deliberately deferred, with only non-breaking prep fields
added to `Quote` (`issuerCompanyId`/`issuerCompanySnapshot`, both optional, nothing sets them yet).

1. **New MongoDB collection `company_profiles`** (`api/_lib/collections.ts`), full shape in
   DATABASE.md. Every field from the request is present: `companyCode`/`companyNameTh`/
   `companyNameEn`/`displayName`/`logoDataUrl`/`addressTh`/`addressEn`/`taxId`/`branchName`/
   `branchCode`/`phone`/`fax`/`email`/`website`/`bankAccounts[]`/`quotationPrefix`/
   `quotationNumberFormat`/`quotationTerms`/`quotationFooter`/`stampDataUrl`/`signatureLabel`/
   `isDefault`/`isActive`/`isDeleted`/audit fields. No seed data — an empty collection until an
   admin adds the first profile, per the "no fake data" rule.
2. **Default-profile invariants enforced server-side** (`api/handlers/company-profiles.ts`): the
   very first profile ever created is automatically `isDefault: true` regardless of what the
   client sends (`CompanyProfileDraft` has no `isDefault` field at all — it can only change via
   the dedicated set-default action); setting a new default atomically unsets the previous one;
   archiving (soft-deleting) the current default is blocked with a clear Thai error until another
   profile is set default first; setting an archived or inactive profile as default is blocked.
3. **New API**: `GET/POST /api/company-profiles`, `GET/PATCH /api/company-profiles/:id`,
   `POST /api/company-profiles/:id/archive`, `POST /api/company-profiles/:id/set-default` — see
   API.md. This is the **12th and final Vercel serverless function** under Vercel Hobby's 12-function
   cap (`api/handlers/{auth,users,roles,products,categories,notifications,quotes,jobtypes,
   company-profiles}.ts` + `api/{company,audit-log,dashboard}/index.ts`) — any future new resource
   must be folded into an existing handler file (a new `parts[N] === "..."` branch) rather than a
   new file, or the project needs a paid Vercel plan first.
4. **New server-side validation** (`api/_lib/companyProfileValidation.ts`, mirrors
   `quoteValidation.ts`'s style): Company Name (Thai) and Company Code are the only required
   fields; email format, website URL format, and Thai Tax ID (13 digits) are validated when
   non-empty; logo/stamp reuse the existing `validateImageDataUrl()` (same base64-data-URL,
   2MB-cap approach as Company Settings/User profile/signature — no new upload infrastructure was
   built, per the request's explicit "implement a simple existing-compatible approach" allowance).
5. **6 new permissions**: `companyProfiles:view/create/edit/archive/delete/setDefault` — see
   RBAC.md. Unlike `company:manage` (the single-company settings permission, structurally locked
   to Super Admin only), these are **not** super-admin-locked — a Super Admin can grant broader
   access to Administrator (or a custom role) via the normal Role Management permission matrix,
   matching the request's "Admin: can create/edit if permission is granted." Administrator's
   default role ships with `companyProfiles:view` only; create/edit/archive/setDefault/delete are
   explicit grants, not automatic. `companyProfiles:delete` is defined (per the request's literal
   permission list) but not wired to any additional route — this app's only "delete" is the
   reversible archive action (`companyProfiles:archive`), matching the existing Category/Job
   Type precedent of no hard-delete route; documented as a deliberate decision, not a gap.
6. **New UI** (`src/pages/admin/companyProfiles/`): `CompanyProfilesPage.tsx` (view-switcher,
   mirrors `ProductsPage.tsx`), `CompanyProfileList.tsx` (search/filter by active-inactive/default,
   show-archived toggle, per-row View/Edit/Set Default/Activate-Deactivate/Archive actions,
   permission-gated), `CompanyProfileForm.tsx` (6 sections — ข้อมูลบริษัท/ข้อมูลติดต่อ/ข้อมูลสำหรับ
   เอกสาร/โลโก้และตราประทับ/บัญชีธนาคาร/การตั้งค่า — client-side validation with the exact requested
   Thai error copy, a repeatable bank-account editor, and an unsaved-changes discard-confirmation
   dialog), `CompanyProfileDetail.tsx` (read-only view). Sidebar entry "ข้อมูลบริษัท" added under
   the existing "การจัดการระบบ" (System Management) group, permission-gated on
   `companyProfiles:view`. Exact requested empty-state copy: "ยังไม่มีข้อมูลบริษัท" /
   "เริ่มต้นโดยการเพิ่มข้อมูลบริษัทสำหรับใช้บนเอกสารใบเสนอราคา".
7. **Extracted `src/components/ImageUploadField.tsx`** from what was previously inlined only
   inside `SettingsPage.tsx` — now genuinely shared between Company Settings' logo/stamp fields
   and the new Company Profile form's logo/stamp fields, rather than a second copy-paste.
8. **Audit logging**: Company Profile Created/Updated/Archived/Restored/Activated/Deactivated and
   Default Company Changed all write real entries via the existing client-triggered
   `POST /api/audit-log` path (`onAudit` callback threaded from `App.tsx`, same established
   pattern as Users/Roles/Company Settings — **not** the server-authoritative
   `writeQuoteAuditEntry()` pattern used for quotes, since that pattern was specifically built to
   close a Dashboard-metric forgery risk that doesn't apply here). `moduleForAction()` in
   `App.tsx` gained a "Company Profile"/"Default Company Changed" branch, checked **before** the
   existing generic `"Company"` prefix match (which would otherwise mislabel these as the
   single-company Settings module).
9. **Future Quotation integration, prepared but not built**: `Quote` (`src/lib/quotes.tsx`)
   gained two optional fields, `issuerCompanyId?: string` and `issuerCompanySnapshot?: {...}` — a
   full snapshot of the issuing company's document-relevant fields, captured **at issue time**,
   never read live from the referenced profile (same rationale as `QuoteLine` never referencing
   `Product` live — editing a company profile later must never silently change a quotation that
   already went to a customer). Nothing currently sets these fields; no quote form UI, no handler
   write path, no validation whitelist entry — genuinely inert until a future pass wires them up.
   Fully non-breaking: every existing quote document is unaffected.
10. **Two company records now exist in this app, deliberately** — `company` (the pre-existing
    singleton, Settings → Company Info, this app's own identity/branding, still used everywhere
    it already was) and `company_profiles` (new, the set of identities a *quotation* can eventually
    be issued under). They are not merged and not migrated into each other this pass — see
    MODULES/CompanyProfiles.md "Relationship to the `company` singleton" for the reasoning and the
    still-open question of what happens to them once real Quotation-form integration is built.
11. **Verification**: same environment constraint as every same-day pass this session (no local
    backend). `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
    all pass clean. Visually verified via an isolated Playwright preview of the real
    `CompanyProfileList`/`CompanyProfileForm`/`CompanyProfileDetail` components with mock data
    (one default profile with 2 bank accounts and a logo, one inactive profile, one archived
    profile) at 1440px and 390px — confirmed the empty state's exact copy, the required-field and
    format-validation error messages (matching the request's literal Thai examples), the
    unsaved-changes discard-confirmation dialog, the default/inactive/archived badges, and the
    bank-account default-tag all render correctly. No live-database click-through (create → set
    default → archive against real MongoDB) was possible in this sandboxed session — see TODO.md.
12. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md, RBAC.md,
    UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/CompanyProfiles.md (new),
    MODULES/Quotation.md.

---

## 2026-07-13 — Fix Codex-review High Priority Dashboard status/filter issues (eighth same-day pass)

**Scope**: a follow-up independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) audited the
seventh pass's P'Keng/P'Kee completion work. Result: **zero Critical issues** — the review
confirmed the 4 required KPI cards, Expected Sales' `isPotentialOpportunity`-only rule, the
Sales Activity Analytics weekly/monthly/quarterly/yearly views, the salesperson filter, the
Created/Edited activity counts, and "no fake data" were all already correct. **3 High Priority
issues** were found; 2 are fixed this pass, 1 (department filtering) is a documented, already-
tracked business decision deliberately not attempted here — see below.

1. **Fixed: Win/Lose/Active/Non-Active double-counted Lost quotations.** `QuotationStatusSummary`'s
   donut/table presents 4 rows and a Percentage column (count ÷ sum of all 4 rows' counts) — but
   `NON_ACTIVE_OUTCOME_STATUSES` in `api/dashboard/index.ts` included `เสียโอกาส` (Lost) alongside
   Cancelled/Customer Rejected, so every Lost quote was counted in *both* the Lose row and the
   Non-Active row. The 4 rows' counts summed to more than `docs.length`, and the percentage column
   didn't add up to 100% — a real correctness bug for an executive-facing summary, not a display
   nit. **Fixed at the source**: `NON_ACTIVE_OUTCOME_STATUSES` no longer includes Lost (Lost
   already has its own row). Win + Lose + Active + Non-Active are now a true partition of every
   quote status — every quote counts in exactly one row, every percentage column now sums to
   exactly 100%. `kpis.nonActiveQuotations`/`nonActiveQuotationsValue` (also used by
   `SalesPerformancePanel`'s "Non-Active Jobs" tile and the CSV export) changed meaning
   consistently everywhere they're used — there is now only one definition of "Non-Active,"
   not a donut-only one and a KPI-only one. Updated the `dashboard.kpi.help.nonActiveQuotations`
   Thai/English copy to match (no longer lists "Lost" among Non-Active's causes, explicitly notes
   why).
2. **Improved: rolling-trend widgets now state their actual anchor date.** Sales Activity
   Analytics and Revenue Trend both intentionally ignore the date filter's `from` bound to keep a
   real trailing window (documented, unchanged) — but the review noted that a generic "rolling
   trend, not limited by the filter's start date" caption doesn't tell a user *what date it does
   end on*, which reads as vague rather than precise. Both widgets' `sub` caption now appends
   "— ending [date]" using the selected filter's `to` date, or today (Bangkok-local) if no `to`
   is selected — computed via a new `todayIsoBangkok()` helper (`dateRanges.ts`) and a new
   `fmtDateShort()` formatter (`format.ts`), threaded in as an `anchorDate` prop from
   `DashboardPage.tsx`. New dictionary key `dashboard.trend.endingOn` ("สิ้นสุดที่" / "ending on").
3. **Deliberately not fixed this pass: department filtering is a fragile free-text join.**
   `api/dashboard/index.ts` resolves a Department filter by matching free-text `User.department`
   to `Quote.salesperson` via `User.fullName` — accurate only as long as names never collide,
   get typo'd, or get renamed. A real fix needs `Quote` to carry a stable `salespersonUserId`
   (and `User`/`Quote` to carry a real `departmentId`), which in turn requires deciding whether
   the Quotation form's free-text Salesperson field should become a locked dropdown of real
   `User` records — a genuine product/workflow decision, not a bug fix, and already tracked as a
   "Business decision needed" item in TODO.md (added during the 2026-07-10 pass). Not attempted
   here without that sign-off; also out of the explicit fix-list for this pass (department wasn't
   named, salesperson filtering was — and salesperson filtering itself was independently
   confirmed correct by this review).
4. Every Medium/Low item from this review (quote soft-deletion readiness, "activity is
   audit-performer not quote-owner" terminology, deep-detail-area length, small chart typography)
   is a documented, non-blocking observation, not a defect — left as-is, not tracked as new TODOs
   beyond what's already noted in this review's own report.
5. **Verification**: same environment constraint as every same-day pass this session (no local
   backend). `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
   all pass clean. Visually verified via an isolated Playwright preview composing the real
   `QuotationStatusSummary`/`SalesActivityAnalytics`/`RevenueTrendChart` components with mock data
   constructed so Won+Lost+Active+NonActive sum to exactly `totalQuotations` (30+10+45+15=100) —
   confirmed all 4 percentages now sum to 100% (was previously >100% before this fix) — and
   confirmed both widgets' captions render "สิ้นสุดที่ 13 ก.ค. 2569" / an equivalent anchor date,
   at 1440px and 390px.
6. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md,
   MODULES/Dashboard.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Complete Dashboard against the P'Keng/P'Kee business requirement (seventh same-day pass)

**Scope**: a business-stakeholder requirement doc (P'Keng/P'Kee) listing exact required Dashboard
content, exact Thai label/subtitle text, an exact 5-section page structure, a Win/Lose/Active/
Non-Active status-mapping rule, and detailed Sales Activity Analytics requirements (period +
salesperson grouping, tracked event types, a per-salesperson summary table, and a Recent Activity
list with structured quotation/customer fields). **Clarified one high-stakes ambiguity with the
user before touching any code**: the requirement's status mapping would have counted "Customer
Accepted" (ลูกค้ายอมรับ) as Win and "Customer Rejected" (ลูกค้าปฏิเสธ) as Lose, which conflicts with
every other Win Rate/Closed Sales/Average Deal Size/Revenue Trend calculation on the page (all of
which only count formally-closed ปิดการขายสำเร็จ/เสียโอกาส). User confirmed: **keep today's
definition everywhere** — no status-mapping logic was changed.

1. **Exact-text corrections** across the page, matching the requirement's literal copy: page
   subtitle ("สรุปใบเสนอราคา ยอดขาย และกิจกรรมของฝ่ายขาย", was "ข้อมูลแบบเรียลไทม์จากฐานข้อมูล"),
   the Closed Sales KPI label ("ยอดขายที่ปิดได้แล้ว", was missing "ได้"), the Quotation Status
   Summary section title/subtitle ("สถิติสถานะใบเสนอราคา" / "สรุปจำนวนงานตามสถานะ Win / Lose /
   Active / Non Active", was "สถานะใบเสนอราคา" / a different Thai phrasing), and the Sales Activity
   subtitle (now leads with the requirement's exact phrase, "ติดตามการเปิดใบเสนอราคาใหม่และการแก้ไข
   ใบเสนอราคาเดิม", with the existing filter-honesty caveat appended after it rather than replaced).
2. **`ExecutiveSummaryCards.tsx` now shows a one-line helper caption under every card's value**
   (previously only Expected Sales had an (i) tooltip, no card had visible helper text) — the 4
   helper strings match the requirement's exact wording (3 of the 4 existing `dashboard.kpi.helper.*`
   keys were reworded slightly to match exactly; Expected Sales' was already an exact match).
3. **Page reorganized to the requirement's exact 5-row layout**: Header+Filters →
   `ExecutiveSummaryCards` → `QuotationStatusSummary` (now full width, no longer paired with the
   forecast chart) → `SalesActivityAnalytics` (full width) → `ActivityTimeline` ("Recent Activity
   Details"). `SalesPerformancePanel`, `ActivityFollowUpSummary`, and `ExpectedSalesForecastChart`
   — real, still-computed, filter-aware data, just not named in this requirement's required-5 list
   — moved into the existing "supporting detail" section below, per the requirement's own
   instruction to "focus first on the exact required business information" and move anything else
   lower. **Nothing was deleted** — same components, same data, different position on the page.
4. **Sales Activity Analytics gained a per-salesperson breakdown table** ("สรุปตามพนักงานขาย" —
   ช่วงเวลา/พนักงานขาย/เปิดใบเสนอราคาใหม่/แก้ไขใบเสนอราคาเก่า/กิจกรรมรวม columns), a genuinely new
   feature: `api/dashboard/index.ts`'s `salesActivity` aggregation now also buckets by
   `(period, salesperson)`, not just by period — Created/Edited only (the 2 event types this
   requirement explicitly names), distinct from the 5-category stacked chart above it. Only
   non-zero rows are returned (no combinatorial zero-row explosion across every period × every
   salesperson). **Bug caught and fixed during implementation**: an early version of this
   aggregation joined `period` and `salesperson` into one string key (`` `${period} ${salesperson}` ``)
   and split it back apart later — Thai full names routinely contain a space (e.g. "สมชาย ธนากร"),
   which would have silently truncated names on split. Fixed with a proper nested `Map<period,
   Map<salesperson, counts>>` instead of any string join/split. A related literal NUL-byte
   (`\x00`) corruption was also found and fixed in the same block, introduced by an earlier
   editing pass in this session — verified clean via a full-file scan before proceeding.
5. **Recent Activity Details (`ActivityTimeline.tsx`) rebuilt as a proper table** (was a card
   list) with the requirement's exact columns — วันที่/พนักงานขาย/กิจกรรม/ใบเสนอราคา/ลูกค้า — and
   the quotation number is now a clickable link that opens the quotation directly (`onOpenQuote`,
   threaded from `App.tsx`'s existing `navigateToQuotation()`, previously only wired to
   `NotificationBell`). **Backend addition**: `writeQuoteAuditEntry()` (`api/handlers/quotes.ts`)
   now optionally stores structured `relatedQuoteId`/`relatedCustomerName` fields on every
   quote-workflow audit entry (Created/Updated/Duplicated/every workflow transition) — the
   quotation number and customer name were already embedded in the entry's free-text `details`
   string, but the Dashboard needs them as real fields to render as columns/a link instead of
   parsing prose. Backward-compatible: `AuditLogEntry`'s 2 new fields are optional, older entries
   and non-quote modules (Users/Roles/Settings/Login) simply render "—" for both.
6. **New `audit_log` index**: `{ action: 1, createdAt: -1 }` — the Sales Activity query now scans
   5 action values (was 2, see the sixth pass below) and commonly runs with no `userName` filter
   ("All Sales" selected), which the existing `{ userName: 1, createdAt: -1 }` index can't serve.
7. **Database/index requirements not applicable to the current schema**: the requirement's
   suggested `quotations.salespersonId`/`departmentId`/`isDeleted`/`createdAt`/`updatedAt` indexes
   don't apply — this schema uses free-text `salesperson` (no ID/FK), has no `departmentId` (department
   is resolved via `User.department` free-text join, documented in DATABASE.md), no soft-delete
   flag, and `Quote` has no `createdAt`/`updatedAt` timestamp fields at all (a pre-existing, already
   tracked gap — see TODO.md). Indexing non-existent fields wasn't attempted; see DATABASE.md for
   the actual schema.
8. **Verification**: same environment constraint as every same-day pass this session (no local
   backend). `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build`
   all pass clean. Visually verified via an isolated Playwright preview composing the real
   `ExecutiveSummaryCards`/`QuotationStatusSummary`/`SalesActivityAnalytics`/`ActivityTimeline`
   components with representative mock data (including 2 salespeople with space-containing Thai
   names, specifically to exercise the bucketing-bug fix) at 1440px (all 5 sections render in the
   exact requested order, per-salesperson table and clickable quotation links both work, no
   overlapping labels) and 390px (clean stacking, Recent Activity table scrolls horizontally
   within its existing wrapper, consistent with every other Dashboard table).
9. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, DATABASE.md, API.md,
   UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Fix Codex-review High Priority Dashboard data/filter issues (sixth same-day pass)

**Scope**: a follow-up independent Codex review (`docs/CODEX_REVIEW_REPORT.md`) of the fifth pass
found **zero Critical issues** and 4 High Priority issues — all data/filter-correctness bugs, not
visual regressions (the review explicitly confirmed the 4-card KPI summary, the funnel-chart
removal, Expected Sales, and the sidebar overflow fix are all already correct). Fixed all 4:

1. **Sales Activity Analytics now tracks all 5 requested event categories**, not just 2. Previously
   `api/dashboard/index.ts`'s `salesActivity` aggregation only counted `"Quotation Created"`/
   `"Quotation Updated"`. Added a `categoryForAction()` mapping covering every audit action
   `writeQuoteAuditEntry()` can write: `"Quotation Submitted"` → Approval Requested,
   `"Quotation Approved"` → Approval Completed, `"Quotation Rejected"` + the generic
   `"Status Changed"` → Status Changed (both are "the quote's status field changed," not a content
   edit). `SalesActivityAnalytics.tsx` now renders all 5 as a **stacked** bar chart (not 5 grouped
   bars per period, which would have tripled the visual density this section exists to avoid) plus
   a matching 6-column table. `SalesActivityPeriod`/`SalesActivityTrend` types (`lib/dashboard.ts`)
   extended to match.
2. **The Sales Activity/Revenue Trend "rolling window, doesn't honor the filter's start date"
   behavior is now stated in the UI**, not silent. Both trend widgets were already correctly
   anchoring their *end* to the filter's `to` date (or today) while intentionally showing a fixed
   trailing window regardless of `from` — a deliberate design so a "last 12 months" trend chart
   doesn't collapse to 1-2 points when a user picks a narrow date range. The review flagged the
   *silence* about this as misleading, not the behavior itself (both options — fully honor `from`,
   or label clearly — were offered; forcing full compliance would break the trend charts'
   usefulness, so labeling was the fix that didn't touch the underlying "don't remove business
   logic" trend-window design). `dashboard.salesActivity.sub`/`dashboard.chart.revenue.sub` now
   say so explicitly in Thai and English.
3. **Every other deliberately-unfiltered widget now says so in the UI too**: `ProductsByCategoryChart`
   ("all time, not filtered" — it's a catalog snapshot, not quotation activity), `NotificationSummary`
   (new caption: "your personal data — not affected by dashboard filters"), and the forecast panel's
   win-rate baseline (`dashboard.forecast.basedOn` reworded to "based on **company-wide**
   historical win rate," making explicit that the baseline is deliberately not salesperson-scoped
   for statistical stability — already true and already documented in code comments, just not
   visible in the UI). No filtering logic changed — only added labels, per the review's own
   "either apply the filter everywhere or label clearly" framing and this task's "do not remove
   business logic" instruction.
4. **Fixed `QuotationStatusSummary`'s count/value population mismatch.** The panel's Won/Lost/
   Active/Non-Active table used to derive its *value* column by summing the `pipeline` prop's
   per-stage totals grouped by raw status — which doesn't carve out expired-but-unclosed quotes
   the way the Active/Non-Active *counts* do (from `DashboardKpis`), so a row could show a count
   that excludes an expired quote sitting right next to a value that still included its amount.
   Fixed at the source: `api/dashboard/index.ts` now computes `lostValue`/`activeQuotationsValue`/
   `nonActiveQuotationsValue` using the *exact same* predicates as their matching count fields
   (`lostDocs`/`activeDocs`/`nonActiveDocs`), returned as new `DashboardKpis` fields. `Quotation
   StatusSummary.tsx` now reads these directly instead of approximating from `pipeline` — the
   `pipeline` prop is no longer needed by this component at all, so it was dropped from its props
   and from the `DashboardPage.tsx` call site. Count and value now always describe the same
   population, no more approximation to document.
5. **Verified already-correct, not touched**: exactly 4 primary KPI cards, no huge card wall
   (confirmed by the review's own source read); the old funnel chart stays gone (`PipelineSteps.tsx`
   untouched); Expected Sales visible and computed as the literal "Potential Opportunity" rule;
   Win/Lose/Active/Non-Active visible in `QuotationStatusSummary`; sidebar overflow fix, mobile
   drawer, and Noto Sans Thai typography unchanged (`git diff --stat` confirmed zero changes to
   `BrandMark.tsx`/`App.tsx`/`styles/{theme,index,fonts}.css`).
6. **Verification**: same environment constraint as every prior same-day pass (no local backend).
   `npx tsc -b`, `npx tsc --noEmit -p tsconfig.api.json` (the backend `api/dashboard/index.ts`
   change needed this too), `npm run lint`, and `npm run build` all pass clean. Visually verified
   via an isolated Playwright preview composing the real `QuotationStatusSummary` (no `pipeline`
   prop), `SalesActivityAnalytics` (5-category stacked chart), `RevenueTrendChart`,
   `ProductsByCategoryChart`, `ExpectedSalesForecastChart`, and `NotificationSummary` with
   representative mock data reflecting the new `DashboardKpis` fields (deleted before finishing),
   at 1440px (all new captions/labels visible, stacked chart readable, no overlapping labels) and
   390px (chart and 6-column table both remain usable, table scrolls horizontally within its
   existing wrapper, no page-level overflow).
7. **Not done this pass** (Medium/Low priority per the review, not requested): supporting-detail
   area still requires scrolling (no collapse control); Overdue Follow-ups/Expired Quotations
   task tiles still aren't clickable (no matching date-derived quotation-list filter exists to
   link to); `ActivityTimeline` still has no structured related-record field (`details` is free
   text); charts still don't have a non-visual tabular fallback beyond the ones that already
   double as a table (Sales Activity, Quotation Status); repeated inline Playfair/color style
   objects across Dashboard components not consolidated into shared tokens.
8. Docs updated: this file, CLAUDE.md (`docs/CLAUDE.md`'s module table), PROJECT_STATUS.md,
   TODO.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.

---

## 2026-07-13 — Reorder Dashboard into the full 7-section structure (fifth same-day pass)

**Scope**: a fully-specified follow-up to the fourth pass — the same underlying request (simplify,
don't add large cards, don't remove business logic), but this time naming the exact 7 top-level
sections wanted, in order, and 2 concrete content gaps: Sales Activity Analytics needed to be a
named top-level section (it existed but was buried in the "supporting detail" area below the
fold), and Sales Performance needed Active/Non-Active Quotations added to its metric list.

1. **`SalesActivityAnalytics` promoted from "supporting detail" into the top overview**, now
   sitting between `SalesPerformancePanel` and `ActivityFollowUpSummary` — matching the requested
   order exactly (Executive Summary → Quotation Status → Sales Performance → Sales Activity
   Analytics → Tasks/Follow-up/Approvals → Recent Activities). No changes to the component itself
   or its underlying data — same filter-aware Created/Edited trend chart + period table, still
   respects the global date/department/salesperson filters server-side, still has its own
   `hasData` empty state (no fake charts on empty data).
2. **`SalesPerformancePanel.tsx` gained Active Quotations and Non-Active Quotations** (now 8
   metrics in a `grid-cols-2 sm:grid-cols-4` layout, was 6 in `grid-cols-2 sm:grid-cols-3`) — the
   requested example table listed these two counts alongside the 6 rate/cycle-time metrics.
   They're also shown in `QuotationStatusSummary`'s table (a different view — per-status
   count/value/share vs. this panel's flat metric list); showing both isn't a duplication bug,
   it's two different useful cuts of the same numbers, matching what was explicitly requested.
3. **Expected Sales helper text reworded** to lead with the requested exact phrase ("เฉพาะใบเสนอราคา
   ที่เซลส์ติ๊กว่างานนี้น่าสนใจ") while keeping the "regardless of status" qualifier — that qualifier
   is load-bearing (Expected Sales genuinely does include closed/lost quotes still flagged
   Potential Opportunity, not just active ones), so it wasn't dropped for the sake of matching the
   shorter requested wording exactly.
4. **Verified, not changed** (all already true from prior passes, re-confirmed this pass):
   - Page title "ภาพรวมผู้บริหาร" / subtitle "ข้อมูลแบบเรียลไทม์จากฐานข้อมูล" — exact match already.
   - The old broken funnel chart is gone — `PipelineSteps.tsx` (horizontal step cards, "Option A"
     from the request) has been the pipeline visualization since 2026-07-10; it wasn't touched
     this pass and was never reverted to the funnel shape.
   - Sidebar overflow fix, mobile drawer, and Noto Sans Thai typography — unchanged since the
     first same-day pass, confirmed via `git diff --stat` showing zero changes to `BrandMark.tsx`,
     `App.tsx`, or `styles/{theme,index,fonts}.css`.
   - Empty states — every section already guards on its own `hasData`/`hasAnyData` check before
     rendering a chart/table, falling back to a real `EmptyState` component (no fake data, no
     broken blank charts) — this predates this pass, not newly added.
5. **Verification**: same environment constraint as the prior 4 same-day passes (no local
   backend). Built a throwaway isolated preview composing all 7 real section components with
   representative mock data (deleted before finishing) in the exact requested order, verified via
   Playwright at 1440px (full page: header/filters → 4 KPI cards → status donut+table → forecast
   → 8-metric performance grid → activity trend chart+table → 4-tile task row → recent-activity
   list, no overlapping labels, no blank/broken charts) and 390px (clean single/2-column mobile
   stacking, no horizontal overflow). `npx tsc -b`, `npm run lint`, and `npm run build` all pass
   clean.
6. **Not done this pass** (flagged for a future pass / Codex review, see "What Codex should
   review next" in the final summary): `SalesActivityAnalytics` still only tracks 2 event
   categories (Created/Edited) against the 5 the request described (also Status Changed, Approval
   Requested, Approval Completed) — the underlying `audit_log` actions already distinguish these
   (`writeQuoteAuditEntry()` records "Submitted"/"Approved"/"Rejected"/"Status Changed" alongside
   "Quotation Created"/"Quotation Updated"), so extending the `api/dashboard/index.ts` aggregation
   to bucket by these categories is feasible, but wasn't attempted this pass — it's a backend
   aggregation change with no live-data path to verify against in this sandboxed session, and
   wasn't one of the explicit "Manual Website Verification" checklist items. Similarly, "Recent
   Activities" showing a structured "related quotation/customer" column (vs. today's free-text
   `details` field, which already contains this info as text) wasn't restructured — would need an
   `AuditLogEntry` schema change, out of scope for a display-reorganization pass.
7. Docs updated: this file, CLAUDE.md, PROJECT_STATUS.md, TODO.md, UI_GUIDELINES.md,
   IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Simplify the Dashboard overview into 5 compact sections (fourth same-day pass)

**Scope**: further direct user feedback — even the flat 22-card `KpiGrid.tsx` from the previous
same-day pass "is still too cluttered and hard to understand... everything looks equally
important... feels like a generated template." Explicit request: reduce to 4 primary KPI cards
and reorganize everything else into compact panels/lists across exactly 5 named sections
(Executive Summary, Quotation Status, Sales Performance, Activity & Follow-up, Recent Work), with
an explicit "do not remove existing business logic or API logic" constraint and a detailed list
of every KPI field that must stay computed and visible somewhere.

1. **`KpiGrid.tsx` (22 uniform cards) deleted entirely**, replaced by 3 new compact components,
   each holding a subset of `DashboardKpis` in a different, non-card shape:
   - **`ExecutiveSummaryCards.tsx`** — exactly 4 cards (Total Quotations, Total Quotation Value,
     Closed Sales, Expected Sales), shorter/tighter padding than the old `KpiCard`, one info
     tooltip only where genuinely useful (Expected Sales' calculation isn't obvious).
   - **`SalesPerformancePanel.tsx`** (new) — Win Rate, Lose Rate, Conversion Rate, Average Deal
     Size, Average Approval Time, Average Closing Time as a compact label/value grid inside one
     `ChartCard`, not 6 more cards.
   - **`ActivityFollowUpSummary.tsx`** (new) — Pending Approvals, Overdue Follow-ups, Expired
     Quotations, New Customers as a compact 4-tile row inside one `ChartCard`. Pending Approvals
     is clickable (navigates to the quotation list filtered to that status, reusing the same
     filter the Pipeline Steps stage cards already call); the other 3 stay informational since
     there's no equivalent single-status filter for date-derived metrics (Overdue Follow-ups/
     Expired Quotations) or a Customer module page to link to yet (New Customers).
2. **`QuotationStatusSummary.tsx` gained a Percentage column** (each row's share of the combined
   Won/Lost/Active/Non-Active count) — matches the exact status/count/value/% table shape
   requested. Donut chart and existing count/value columns unchanged.
3. **4 KPI fields dropped from individual display**: `totalCustomers`, `totalLeads`,
   `totalProducts`, `repeatCustomers` no longer get their own dashboard tile — they weren't named
   in the requested 5-section spec, and were exactly the kind of secondary metric competing for
   attention that this whole pass exists to fix. **Not removed from the data/API layer** — `GET
   /api/dashboard` still computes all of them unchanged; total/repeat customer detail remains
   visible in the richer `CustomerAnalytics.tsx` table further down the page, and total products
   on the Products page itself. All 16 other fields the user's "keep this data" list named are
   still shown somewhere (see the 3 components above + the existing `QuotationStatusSummary`).
4. **Page reorganized into the requested top-to-bottom order**: title + compact filters →
   `ExecutiveSummaryCards` → `QuotationStatusSummary` + forecast chart → `SalesPerformancePanel` →
   `ActivityFollowUpSummary` → `ActivityTimeline` ("Recent Work"). Everything else that already
   existed (revenue/job-type charts, `PipelineSteps`, `SalesActivityAnalytics`, ranking tables,
   `CustomerAnalytics`/`JobTypeAnalytics`, the actionable `ApprovalDashboard`/`FollowUpReminders`
   lists — distinct from the compact *counts* in `ActivityFollowUpSummary` above, since those are
   real clickable line-item lists — `NotificationSummary`, the interest breakdown) moved below a
   new "In-Depth Detail" divider, unchanged in content. This wasn't part of the "too many large
   KPI cards" complaint, so it wasn't touched or removed, per the explicit "do not remove existing
   business logic" instruction.
5. **`DashboardFilterBar.tsx` tightened**: `p-3`→`px-3 py-2`, `gap-3`→`gap-2.5`, each select/input
   `py-2`→`py-1.5` — a visibly slimmer single-row bar, addressing "the filter area is too large
   compared to the content" now that the content above it is much more compact.
6. **Verification**: same environment constraint as the prior 3 same-day passes (no local
   backend). Built a throwaway isolated preview composing the real `ExecutiveSummaryCards` /
   `QuotationStatusSummary` / `SalesPerformancePanel` / `ActivityFollowUpSummary` /
   `DashboardFilterBar` components with representative mock data (deleted before finishing),
   verified via Playwright at 1440px and 390px — confirmed exactly 4 cards in the first row, the
   Quotation Status donut+table+percentage layout, the compact Sales Performance grid, the 4-tile
   Activity & Follow-up row, and clean 2-column mobile stacking with no overflow. `npx tsc -b`,
   `npm run lint`, and `npm run build` all pass clean.
7. Docs updated: this file, PROJECT_STATUS.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Revert Dashboard KPI hierarchy to a flat grid (third same-day pass)

**Scope**: direct user feedback that the 2026-07-10 Dashboard redesign's KPI cards "does not look
good... feels strange, too template-like, and not suitable for this ERP," with an explicit
instruction not to continue redesigning the Dashboard and to restore the previous layout while
keeping every current section/feature working. Clarified with the user first (two real options —
a full technical revert that would have dropped the newer sections like Sales Activity Analytics
and Quotation Status Summary entirely, vs. restyling the KPI cards only while keeping every
section): user chose **restyle only, keep all sections**.

1. **Merged `PrimaryKpiCards.tsx` + `SecondaryKpiSummary.tsx` back into one flat `KpiGrid.tsx`.**
   The 2026-07-10 redesign had split the single KPI grid into a two-tier hierarchy: 6 large "hero"
   cards (`text-[28px]` values, bigger padding) followed immediately by 9 small, dense mini-cards
   in a collapsible row — a visual pattern common to generic SaaS dashboard templates, not this
   app's editorial navy/gold design language. Restored the original single-tier `KpiCard` (uniform
   `text-2xl` value, consistent `w-10 h-10` icon badge, one card size throughout,
   `grid-cols-2 xl:grid-cols-4`) used by the pre-redesign `KpiGrid.tsx`.
2. **Restored 7 KPIs that had quietly stopped rendering anywhere.** While merging, found that
   `DashboardKpis` (`GET /api/dashboard`'s response shape) still computes and returns Lose Rate,
   Conversion Rate, Average Approval Time, Expired Quotations, New Customers, Repeat Customers, and
   Total Leads — none of which `PrimaryKpiCards`/`SecondaryKpiSummary` ever rendered after the
   redesign, even though the API never stopped returning them. The new flat `KpiGrid.tsx` shows all
   22 fields again, matching the original pre-redesign card count.
3. **Kept the small `MetricInfoTooltip` (i)-icon affordance** the redesign added on the metrics
   whose definition isn't obvious (Expected Sales, Average Deal Size, Win Rate, Average Closing
   Time, Active/Non-Active Quotations, Pending Approvals) — a tiny, non-layout-affecting addition,
   not part of the "huge template card" complaint, so it stayed rather than being stripped for the
   sake of a purist revert.
4. **Did NOT touch**: `QuotationStatusSummary.tsx` (Win/Lose/Active/Non-Active donut+table),
   `PipelineSteps.tsx` (the pipeline step cards — replaced a genuinely broken, overlapping-label
   funnel chart, not a stylistic complaint), `SalesActivityAnalytics.tsx`, the revenue/job-type
   charts, rankings, customer/job-type analytics, approvals, follow-ups, or activity timeline — the
   user explicitly listed these as sections to keep working, and none of them were the "huge KPI
   card" complaint. `DashboardPage.tsx`'s section composition and comment header updated to reflect
   the new single-KPI-section flow (renumbered the section comments); no data-fetching, filter, or
   business logic touched.
5. **Sidebar overflow, mobile drawer, and font/typography fixes from the prior two same-day passes
   were already correct and are untouched by this pass** — confirmed via `git diff --stat` showing
   zero changes to `BrandMark.tsx`, `App.tsx`, or `styles/{theme,index,fonts}.css` since the last
   commit. The task's "UI Problems to Fix Only" list (sidebar overflow, logo/title alignment, font
   readability, Thai/English typography, text overflow, responsive issues) was already addressed by
   those passes; nothing needed to be redone.
6. **Verification**: same environment constraint as prior passes (no local backend, `npm run dev`
   never reaches `bootStatus: "ready"`). Built a throwaway isolated preview rendering the real
   `KpiGrid` component with representative mock `DashboardKpis` data (deleted before finishing),
   confirmed via Playwright at 1440px (uniform flat grid, no hero-card tier, all 22 cards same
   size) and 390px (clean 2-column stack, no horizontal scroll, no overflow). `npx tsc -b`,
   `npm run lint`, and `npm run build` all pass clean.
7. Docs updated: this file, PROJECT_STATUS.md, UI_GUIDELINES.md ("Dashboard KPI Hierarchy" →
   renamed "Dashboard KPI Grid"), IMPLEMENTATION_CHECKLIST.md, MODULES/Dashboard.md.

---

## 2026-07-13 — Codex UI/UX review: Critical + High Priority fixes (second same-day pass)

**Scope**: `docs/CODEX_REVIEW_REPORT.md` (an independent Codex review of the Sidebar-overflow/
typography pass earlier the same day) found the sidebar overflow bug itself fixed, but flagged 3
Critical and 5 High Priority UI issues on top of it — no responsive mobile shell, a topbar that
doesn't degrade gracefully below ~900px, unqualified two-column form grids, overly dense/mono-heavy
typography, truncated text with no recovery path, and non-wrapping page headers. This pass fixes
every Critical and High Priority item; Medium/Low items (decorative search, hover-only delete,
`Remember me` no-op, semantic-HTML notification rows, focus-visible styling) are logged in TODO.md,
not attempted here — see "Not done" below.

1. **[Critical] Mobile off-canvas sidebar drawer.** `App.tsx`'s `<aside>` previously always
   reserved 256px or 64px of width with no responsive behavior at all — on a phone it permanently
   ate a quarter of the screen. Now: below the `md` (768px) breakpoint the sidebar is a `fixed`
   off-canvas panel (`-translate-x-full` when closed, `translate-x-0` when open) behind a
   click-to-close backdrop, toggled by a new hamburger button in the topbar (`md:hidden`,
   `aria-label`d via new `nav.openMenu`/`nav.closeMenu` dictionary keys); closes on nav-item click,
   backdrop click, or Escape (new `mobileNavOpen`-scoped `keydown` listener). At `md`+ it reverts to
   the existing static-column expand/collapse behavior, unchanged. New `navExpanded` derived value
   (`sidebarOpen || mobileNavOpen`) decides whether the sidebar renders labels/group headers —
   decoupled from `sidebarOpen` itself, which now only ever controls desktop width.
2. **[Critical] Topbar no longer overflows/clips below desktop width.** The always-visible `w-72`
   search box and org breadcrumb, plus fixed `px-6`/`gap-4` padding, were competing for width with a
   permanently-reserved sidebar on any screen under ~900px — `App.tsx`'s root `overflow-hidden`
   would have clipped the loser rather than let it wrap. Fixed: header padding/gaps now scale
   (`px-3 md:px-6`, `gap-2 md:gap-4`, `min-h-[60px] md:min-h-[68px]`); the breadcrumb is `hidden
   sm:flex` with `truncate`; the search box and the user's name/role/chevron are now `hidden
   lg:flex`/`hidden lg:block` (was `md:`) — a Codex-flagged real-device check found `md:` (768px)
   still too cramped for the fixed-width search box plus a Thai full name, causing the name to wrap
   into an ugly 4-line stack; `lg:` (1024px) is where there's genuinely enough room. The user
   name/role block also gained `max-w-[140px] truncate` as a hard backstop. The notification bell's
   `ml-auto` breakpoint moved to match (`lg:ml-0`, was `md:ml-0`) so it still right-aligns correctly
   whenever the search box is hidden.
3. **[Critical] Quotation editor no longer forces two columns on phone widths.**
   `QuoteDocument.tsx` had 7 unqualified `grid grid-cols-2` layouts (the customer-info/doc-details
   split, and 5 inner field-pairs — contact name/phone, delivery method/project, quote number/PO
   ref, issue/expiry date, job type/interest) plus the remarks/signatures split — all now
   `grid-cols-1 sm:grid-cols-2` (stacks under 640px). The customer-info panel's `border-r` divider
   (meaningless once stacked) becomes `border-b sm:border-b-0 sm:border-r`. The navy document-header
   band (company info left, quotation title right) gained `flex-wrap gap-4` and responsive padding
   (`px-4 sm:px-7`) instead of a rigid `justify-between` that would compress both sides. Applied the
   same `grid-cols-1 sm:grid-cols-2` fix to `UserManagementPage.tsx`'s create/edit form (5 grids),
   `RoleManagementPage.tsx`'s name/description fields and permission-checkbox grid, and
   `SetupWizardPage.tsx`'s two field-pair grids (employee ID/username, password/confirm) — the same
   unqualified-grid pattern Codex flagged as a Medium finding for these files, fixed alongside the
   Critical quotation-editor fix since it's the identical, cheap, low-risk change.
4. **[High] Sidebar brand title tightened for narrow-width safety.** `BrandMark.tsx`'s wordmark
   dropped from `text-[13px]` to `text-xs` (12px) — Codex calculated only ~182px of available text
   width at the sidebar's fixed 256px expanded width and flagged the smaller margin as needing
   verification; the smaller size gives more headroom before `break-words`' mid-word-break fallback
   could ever trigger. Verified visually (see Verification below) at the sidebar's expanded,
   collapsed, and mobile-drawer-open states — wraps cleanly to 2 lines via `line-clamp-2`, no
   mid-word breaks, no overflow.
5. **[High] Typography consolidated and de-densified.**
   - New centralized `--font-sans` design token (`styles/theme.css`, wired through Tailwind v4's
     `@theme inline` so the standard `font-sans` utility resolves to it) replaces 2 separate
     hand-repeated `font-['Inter','Noto_Sans_Thai',sans-serif]` arbitrary-value classes
     (`App.tsx`, `AuthLayout.tsx`) and the `body` rule in `index.css` — one definition instead of
     three copies that could drift.
   - **Fixed a latent bug found while doing the above**: JetBrains Mono was imported in
     `fonts.css` but never actually wired to the `font-mono` utility (no `--font-mono` theme
     override existed anywhere) — every `font-mono` number/code/date span in the app (quotation
     numbers, currency, dates — the entire documented "numbers use JetBrains Mono" convention in
     UI_GUIDELINES.md) was silently rendering in the browser's generic system monospace font the
     whole time. Added a matching `--font-mono` token so `font-mono` now actually renders JetBrains
     Mono as designed.
   - `QuoteDocument.tsx`'s 19 form-field `<label>`s bumped from `text-[10px]` to `text-xs` (12px) —
     Codex's specific "at least 12px for dense supporting text" ask, applied to the one file it
     named that has real fill-in-a-form reading load (not the uppercase section-eyebrow labels
     elsewhere, which stay at their existing size — that's a deliberate, documented, different
     reading mode, not the same finding).
6. **[High] Dashboard density reduced.** `SecondaryKpiSummary.tsx` (the 9-tile `xl:grid-cols-9`
   secondary-metrics row) is now collapsible — a new chevron-toggle header, default expanded
   (unchanged desktop behavior) but user-collapsible on any screen size, addressing Codex's "put
   secondary metrics in an optional section" suggestion without hiding anything by default. Its
   mini-card value/title `<p>` tags gained `title=` tooltips (were `truncate` with no fallback) and
   the title text bumped `text-[10px]` → `text-[11px]`. `DashboardFilterBar.tsx`'s department filter
   no longer carries its own `ml-auto` (which detached it from the salesperson filter once the bar
   wrapped on a narrow screen) — department + salesperson are now grouped in one `flex flex-wrap
   sm:ml-auto` wrapper so they wrap together as a pair. `RevenueTrendChart`'s X-axis gained
   `minTickGap={24}` so many weekly data points auto-skip overlapping tick labels instead of
   colliding (Medium-priority chart-collision finding, fixed alongside the density work since it's
   a one-line prop).
7. **[High] Truncated text now has a full-value fallback.** Added `title=` attributes to every
   Codex-named truncation-with-no-recovery spot: `DashboardCharts.tsx`'s job-type and product-
   category legend labels, `ActivityTimeline.tsx`'s audit-entry detail line, `NotificationBell.tsx`'s
   notification title. (`SecondaryKpiSummary.tsx` covered under point 6.)
8. **[High] Page headers wrap on narrow screens instead of clipping.** `QuoteList.tsx`,
   `ProductList.tsx`, `AuditLogPage.tsx`, and `UserManagementPage.tsx`'s title/action-button header
   rows gained `flex-wrap gap-3` (were unqualified `justify-between`); `RoleManagementPage.tsx`'s
   hint/create-button row got the same treatment. `AuditLogPage.tsx` and `UserManagementPage.tsx`'s
   `w-72` fixed-width search boxes became `w-full sm:w-72` so they don't force row overflow before
   wrapping kicks in. `AuditLogPage.tsx` also gained a real `<h1>` page title (previously the only
   page in the app with no visible title/description at all — a separate Codex page-by-page finding
   fixed opportunistically since the header row was already being touched).
9. **Verification**: same constraint as the first same-day pass — `npm run dev` has no backend
   behind it in this sandboxed session (`fetchSession()` never resolves, so the real authenticated
   app can't be reached past the boot spinner). Built a second throwaway isolated preview harness
   (real `BrandMark`/`NotificationBell`/i18n components, the exact new sidebar+topbar JSX copied
   verbatim, deleted before finishing — not part of the app) and drove it with Playwright across
   390px (mobile, drawer closed and open, Escape-to-close), 768/820px (the `md` boundary — this is
   what caught the user-name-wrapping bug fixed in point 2), 1280/1440px (desktop). `npx tsc -b`,
   `npm run lint`, and `npm run build` all pass clean. The quotation-editor grid fix (point 3) and
   the admin-form grid fixes were verified by code inspection against the identical, already-proven
   `sm:grid-cols-2` pattern (`ProductForm.tsx` already used it successfully per Codex's own review)
   rather than a redundant mockup, since reproducing the full authenticated quotation form's
   permissions/workflow state outside the real app wasn't a good use of the same session's limited
   verification budget.
10. **Not done** (Medium/Low priority, logged for a future pass, not attempted here): decorative
    non-functional topbar search (still a "false affordance"); notification delete button still
    hover-only (no persistent touch affordance); `Remember me` checkbox on login still doesn't
    change session behavior; notification rows are still `div onClick`, not semantic
    buttons/links (keyboard activation gap); no `focus-visible` ring audit; no full accessibility
    pass (icon-only buttons beyond the ones touched here still rely on `title` alone in places).
    Docs updated: this file, PROJECT_STATUS.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-13 — Sidebar header overflow fix + app-wide typography/overflow pass

**Scope**: a reported UI bug (the "Thai Chemicals Storage ERP" sidebar title overflowing outside
the sidebar) plus the broader typography/overflow audit requested alongside it.

1. **Fixed the actual bug**: `components/BrandMark.tsx`'s wordmark (`<p>` for "Thai Chemicals
   Storage ERP") used `whitespace-nowrap` inside a container with only `overflow-hidden` (no
   `truncate`/ellipsis and no wrapping) — at the sidebar's fixed 256px width, the single-line text
   simply got clipped past the container edge instead of wrapping or shrinking. Replaced with
   `break-words line-clamp-2 leading-snug` (wraps to at most 2 lines, no overflow) plus `min-w-0`
   on the wrapping flex containers so the text column can actually shrink instead of forcing its
   parent wider. The Thai subtitle ("ระบบองค์กร") now uses `truncate` (was `whitespace-nowrap`
   with no ellipsis fallback). Verified visually (see Verification below) at the sidebar's expanded
   (256px) and collapsed (64px) widths and down to a 390px mobile viewport.
2. **Sidebar polish**: nav item labels now `truncate` (were `whitespace-nowrap overflow-hidden`
   with no ellipsis) with `min-w-0` on their flex containers so a long translated label can't push
   the row wider than the sidebar; added `title` tooltips on nav/settings buttons when the sidebar
   is collapsed (icon-only) so the label is still discoverable via hover; slightly tightened header
   padding/logo size (`size 32→30`, `min-h-[68px]→[72px]`) for a less cramped brand-mark area.
   Active/hover states, spacing, and border-radius were already consistent with
   [UI_GUIDELINES.md](./UI_GUIDELINES.md) and were left as-is.
3. **Sidebar now defaults to collapsed on narrow viewports** (`window.innerWidth < 768` at mount,
   `App.tsx`'s `sidebarOpen` initializer) — the expanded 256px sidebar left only ~130px for content
   on a 390px-wide mobile viewport, wrapping the topbar/breadcrumb awkwardly. This is a minimal,
   low-risk default-state fix, **not** a mobile drawer/overlay nav — the app remains desktop/tablet-
   primary by design (see UI_GUIDELINES.md "Responsive Rules", unchanged), and a real off-canvas
   mobile nav is still explicitly out of scope (tracked in TODO.md, not attempted here).
4. **Thai-aware font stack, applied globally**: added `Noto Sans Thai` (400/500/600/700) to the
   Google Fonts import in `styles/fonts.css` and to every `font-family` declaration in the app
   (`body` in `styles/index.css`, the two `font-[Inter,sans-serif]` root-shell classes in
   `App.tsx`/`AuthLayout.tsx`, and — via a repo-wide replace — all 31 call sites of the
   `'Playfair Display', serif` heading style). Previously Thai text inside a Playfair Display
   heading (page titles, topbar breadcrumb, dialog titles — all translated, so Thai by default)
   silently fell back to whatever generic serif the browser had for unsupported glyphs, rendering
   in a different weight/style than the surrounding Noto Sans Thai body text. Now: Latin characters
   render in Inter (body) / Playfair Display (headings) exactly as before — the brand identity is
   unchanged — and Thai characters within the *same* text node automatically render in Noto Sans
   Thai instead of an arbitrary fallback, since browsers resolve font-family per-codepoint.
5. **Readability**: base `body` line-height raised to `1.6` (from the browser default, effectively
   ~1.2) in `styles/theme.css`, plus an explicit `1.6` on bare `<p>` tags; `-webkit-font-smoothing:
   antialiased` + `text-rendering: optimizeLegibility` added to `body`.
6. **Table overflow bug sweep**: 4 tables (`QuoteList.tsx`, `ProductList.tsx`, `AuditLogPage.tsx`,
   `UserManagementPage.tsx`) were missing the `overflow-x-auto` wrapper every other table in the
   app already uses (`ApprovalDashboard.tsx`, `SalesPerformanceTable.tsx`, etc.) — on a narrow
   viewport these would have squeezed columns instead of scrolling horizontally. Also added
   `truncate`/`max-w-[…]`/`title=` tooltips to the long free-text columns most likely to overflow
   in practice — quotation client name, product name — matching the pattern `UserManagementPage.tsx`
   already used for its user-name column.
7. **Verification**: the full authenticated app (Dashboard/Quotations/Products/Admin pages) could
   not be exercised live in this sandboxed session — `npm run dev` has no backend behind it
   (no `vercel dev`/MongoDB), so the app hangs on its boot spinner past the sign-in gate, the same
   `fetchSession()`-never-resolves limitation every prior session has hit (see PROJECT_STATUS.md
   "Known Risks"). Instead, built a throwaway isolated preview harness (a second Vite HTML entry
   importing the real `BrandMark`/`I18nProvider`/nav components, deleted before finishing — not
   part of the app) to visually confirm the fix with Playwright: sidebar header no longer overflows
   at expanded/collapsed/390px-mobile widths, Thai nav labels/subtitle render cleanly, the Thai+
   Latin mixed-script sample renders consistently. `npx tsc -b`, `npm run lint`, and `npm run build`
   all pass clean.
8. **Not done / remaining**: no real off-canvas mobile drawer nav (see point 3); no full
   accessibility audit; Dashboard/table visual polish at very narrow (<390px) widths not manually
   walked page-by-page (the table `overflow-x-auto` fix covers the mechanism, not a full visual
   pass per page). Docs updated: this file, PROJECT_STATUS.md, UI_GUIDELINES.md,
   IMPLEMENTATION_CHECKLIST.md.

---

## 2026-07-10 — Audit integrity + workflow gap fix pass (fifth same-day pass)

**Scope**: fix the Critical and High Priority issues raised by the independent Codex re-review's
"Independent Re-review Addendum" (see `docs/CODEX_REVIEW_REPORT.md`), preserving existing
functionality, without guessing on the two items that are genuine business decisions (both were
already logged in `TODO.md` by a prior pass and remain open, not re-solved here).

1. **Quotation audit-log entries are now server-authoritative, not client-forgeable.** Previously,
   `QuotationPage.tsx` called the generic `POST /api/audit-log` after a successful create/update/
   duplicate/workflow API call to record what happened — but any authenticated caller could bypass
   the UI and call that same endpoint directly with fabricated `module`/`action`/`details` text,
   and the Dashboard's Sales Activity Analytics counts exactly those `action` strings out of
   `audit_log`. Fixed: `api/handlers/quotes.ts` now writes its own audit-log entry directly inside
   each mutation handler (`writeQuoteAuditEntry()`), using only the already-verified session
   identity — never anything from the request body. This covers create, update (any `PATCH` except
   a pure interest-flag toggle, matching the exact granularity the client used to log), duplicate,
   and every workflow transition (Submitted/Approved/Rejected/Status Changed, same wording as
   before). `QuotationPage.tsx`'s 4 client-side `onAudit(...)` calls for these events were removed
   (server does it now; keeping both would double-log), and its now-unused `onAudit` prop was
   removed along with the pass-through in `App.tsx` (Settings/User Management/Role Management keep
   their own unrelated, unchanged client-side audit calls). `POST /api/audit-log` now rejects the
   `"ใบเสนอราคา"` module with a 403 — quotation audit events can only be written by the server now.
2. **Reject/Customer-Reject/Cancel now require a comment server-side, not just in the UI.**
   `QuoteDocument.tsx` already refused to submit these actions without a comment, but
   `api/handlers/quotes.ts`'s workflow endpoint accepted an empty one from a direct API call. Fixed
   with a new `COMMENT_REQUIRED_ACTIONS` set (`api/_lib/quoteWorkflow.ts`) and a `400` check.
3. **Added the 3 missing terminal-workflow notifications.** `marked_won`, `marked_lost`, and
   `cancelled` never notified the quote's creator, unlike every other workflow transition. Added,
   following the existing per-action notification pattern. Required extending `NotificationType`
   (`quotation_won`/`quotation_lost`/`quotation_cancelled`), a matching icon in
   `NotificationBell.tsx` (Trophy/TrendingDown/XOctagon), and a matching seed-label entry in
   `api/_lib/systemSeed.ts` — TypeScript's `Record<NotificationType, ...>` maps caught both places
   at compile time when the union grew.
4. **Re-verified Expected Sales vs. Sales Forecast predicate consistency** (an addendum checklist
   item) — confirmed already correct from the prior pass (KPI/ranking use the literal
   `isPotentialOpportunity` predicate; the separate forecast additionally excludes
   `CLOSED_STATUSES`), not a live bug. No code change; documented as verified rather than assumed.

**Not fixed / re-assessed**: the two remaining addendum "Current Critical Issues" — automated
tests/CI/live-data verification, and the free-text salesperson/department reporting-identity model
— are unchanged from the prior pass's assessment (the latter already logged as an explicit
business decision in `TODO.md`; the former is a standalone infrastructure effort, not a bug fix).

**Found, not fixed** (out of scope for this pass, logged in `TODO.md`): `App.tsx`'s session-fetch
boot `useEffect` has no error handling, so a thrown network error (including the pre-existing
sandboxed-session MongoDB DNS issue) leaves the app stuck on its loading spinner forever instead of
falling back to the sign-in screen — found during this pass's browser verification, pre-existing,
not introduced by any change here.

**Verification**: `npx tsc -b && npx tsc --noEmit -p tsconfig.api.json && npx vite build` — clean.
`npm run lint` — clean (same 2 pre-existing unrelated warnings). `npx vercel dev` started
successfully; `GET /api/auth/session` still 500s with the identical, previously-documented
`querySrv ECONNREFUSED _mongodb._tcp.tcsdb.zdnus3w.mongodb.net` (confirmed via the dev-server log,
not just the HTTP response) — the same reproducible sandboxed-environment DNS limitation as every
prior 2026-07-10 pass, now reproduced a fourth time, not a regression from this pass's changes. A
Playwright check against the running dev server found no console errors beyond that one expected
network failure.

**Files changed**: `api/_lib/quoteWorkflow.ts`, `api/handlers/quotes.ts`, `api/audit-log/index.ts`,
`api/_lib/systemSeed.ts`, `src/lib/notifications.ts`, `src/components/NotificationBell.tsx`,
`src/pages/quotation/QuotationPage.tsx`, `src/App.tsx`. Docs: this file, `PROJECT_STATUS.md`,
`TODO.md`, `IMPLEMENTATION_CHECKLIST.md`, `CLAUDE.md`, `CODEX_REVIEW_REPORT.md` (new "Claude Fix
Status — Addendum Follow-up" section), `MODULES/{Quotation,Notifications,AuditLog,Dashboard}.md`.

---

## 2026-07-10 — Dashboard UI/UX redesign + app-wide UX enhancement pass

**Scope**: two combined requests — (1) a full visual/layout redesign of the Dashboard (the previous
flat ~20-card KPI grid plus a `recharts` `FunnelChart` pipeline that overlapped its own Thai labels
and read as unprofessional), and (2) a broader "make the whole ERP easier for a first-time,
non-technical employee to use" pass (onboarding tour, shared UX components, form clarity, sidebar
grouping). Given the size of request (2), this pass covers a real, working, appropriately-scoped
subset rather than every item in the brief — see "Not done / explicitly out of scope" below.

**Dashboard redesign**:
1. **Replaced the Sales Pipeline funnel** (`PipelineFunnel.tsx`, deleted) with `PipelineSteps.tsx` — horizontal connected step cards (stage badge/count/value/conversion %) instead of a `FunnelChart` squeezing 9 Thai labels into a shrinking silhouette. The 3 "left the pipeline" outcomes (Customer Rejected/Lost/Cancelled) render as a separate row, since they're branches, not sequential steps.
2. **Split the flat ~20-card KPI grid** (`KpiGrid.tsx`, deleted) into `PrimaryKpiCards.tsx` (6 headline metrics: Total Quotations, Total Quotation Value, Closed Sales, Expected Sales, Win Rate, Active Quotations — larger cards, helper captions, info tooltips) and `SecondaryKpiSummary.tsx` (Won/Lost/Non-Active/Avg Deal Size/Avg Closing Time/Pending Approvals/Overdue Follow-ups/Total Customers/Total Products — small dense mini-cards under their own section label).
3. **New `QuotationStatusSummary.tsx`**: a single Win/Lose/Active/Non-Active donut + table, replacing the redundant `QuotationStatusDonut` (all 9 raw statuses) + `WinLoseDonut` pair — counts come straight from the same KPI numbers shown elsewhere (never disagree), value-per-bucket is a documented approximation from the filtered pipeline's per-stage totals.
4. **New `SalesActivityAnalytics.tsx` section**: quotation Created/Updated counts by week/month/quarter/year (tabbed, like the existing Revenue Trend grouping), filterable by the existing salesperson/department controls. New `salesActivity` aggregation in `api/dashboard/index.ts` reading `audit_log`'s `"Quotation Created"`/`"Quotation Updated"` entries, bucketed with the same `isoWeekKey`/`quarterKey`/`lastN*Keys` helpers `revenueTrend` already uses. New `bangkokDayBoundsUtc()`-adjacent Bangkok-anchored bucketing, gated by the same `auditLog:view` permission as Activity Timeline (both read the same collection).
5. **Reordered the whole page** into the requested section order (header/filters → primary KPIs → secondary KPI summary → status summary + forecast → revenue/job-type charts → pipeline → sales activity → rankings → top customers/job types → approvals/follow-ups → recent activity) and **removed** `QuotationTrendChart` (a documented revenue-series approximation), `SalesByEmployeeChart` (redundant with the ranking table directly below it), and `MonthlyClosingRateChart` (redundant with the new status summary) — decluttering, not just reordering, per the explicit "do not just add more cards" instruction. Net effect: the `DashboardPage` bundle chunk shrank from ~505KB to ~478KB raw (below Vite's 500KB warning threshold for the first time).

**UX enhancement (bounded subset — see "Not done" below for the rest)**:
6. **`src/components/EmptyState.tsx`** (new, shared) — consolidates markup previously copy-pasted across `ProductList.tsx`/`QuoteList.tsx`/`DashboardPage.tsx`; wired into all three plus a real "create your first X" action button where one already existed.
7. **`src/components/PageHeader.tsx`** (new, shared) — title + plain-language description + actions slot; wired into the Dashboard (Quotation/Products/other pages not yet migrated — see TODO.md).
8. **`src/components/MetricInfoTooltip.tsx`** (new) — click-to-toggle (i) icon explaining a non-obvious metric in one sentence; applied to Expected Sales/Win Rate/Active Jobs/Non-Active Jobs/Average Deal Size/Average Closing Time/Pending Approvals on the Dashboard.
9. **Sidebar regrouped** (`App.tsx`'s new `NAV_GROUPS`) into Main/Sales/Inventory/Administration section labels — a pure display grouping over the existing flat `navItems`, not a new page or data model; a group is hidden entirely if none of its items survive the existing RBAC filter.
10. **Guided onboarding tour** — added `driver.js` (chosen over React Joyride: no React-specific tour state machine was needed, so the smaller framework-agnostic dependency was preferred). `src/components/GuidedTour.tsx` (`useGuidedTour()` hook) walks the sidebar, Dashboard title/filters/KPIs, notification bell, and user menu — scoped to elements that are on-screen together, not choreographed cross-page navigation (a separately-scoped, bigger undertaking). Offered once via a Start/Skip banner the first time a user reaches a "ready" session (`App.tsx`); always re-launchable from the user-menu's new "Help" item. Completion tracked per-user in `localStorage` (`src/lib/tour.ts`) — a UI preference, not business data, so deliberately not a MongoDB field.
11. **Quotation form**: required-field asterisk + inline client-side check on Client Name and (for new quotes) Job Type before hitting the server, an unsaved-changes `beforeunload` browser warning (covers accidental tab close/refresh — does not yet cover in-app sidebar navigation mid-edit, which this app's flat `activeNav` state doesn't currently intercept).
12. **Required-field asterisks** added to Product Form (code/category/name) and the User Management create form (full name/employee ID/username/email/role/password) — both already had or now have their existing inline per-field error messages surfaced, just weren't visually marked as required beforehand.

**Not done / explicitly out of scope this pass** (a genuinely large brief — see TODO.md for tracking):
- Full onboarding tour across every module (Leads/Customers/Approvals steps weren't added — those modules don't have dedicated pages yet, see IMPLEMENTATION_CHECKLIST.md).
- `PageHeader`/breadcrumb rollout to every page (only Dashboard uses it so far).
- Full accessibility audit (aria-label pass, contrast audit, keyboard-nav audit) — not attempted beyond what already existed plus the new components' own basic `aria-label`/`aria-expanded`/focus-visible handling.
- In-app (non-browser) unsaved-changes interception when navigating away from the Quotation form via the sidebar.
- Customer/Lead form UX — those modules are schema-only, no UI exists yet (see MODULES/Customer.md, MODULES/Lead.md).

**Verification**: `npx tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
Two real lint errors surfaced mid-pass and were fixed: a `react-hooks/set-state-in-effect`
violation in the tour-prompt trigger (fixed via React's "adjust state during rendering" pattern,
using `useState` not `useRef` — refs can't be read/written during render either, a stricter rule
than expected) and a duplicate of the same pattern in `QuoteDocument.tsx`'s dirty-check effect
(false alarm, no fix needed — that one was already inside a real `useEffect`). Attempted live
browser verification a third time (fresh `vercel dev` instance) — the same, now three-times-
reproduced sandboxed-environment limitation (MongoDB Atlas SRV DNS resolution) blocked getting
past the login gate with real data, but a Playwright pass confirmed the client bundle itself
(including the new dashboard components and `driver.js`) loads and initializes with zero
unrelated console errors, only the expected session-fetch network failure.

---

## 2026-07-10 — Codex review fix pass: quote validation, Dashboard filter honesty, RBAC/upload hardening, doc accuracy

**Scope**: an independent Codex review (`docs/CODEX_REVIEW_REPORT.md`, archived at
`docs/reviews/CODEX_REVIEW_2026-07-10.md`) audited the app end-to-end (source + docs, no live-data
access in that environment either) and found 2 Critical, 6 High, 6 Medium, and several Low-priority
issues. Fixed every Critical and High issue plus the Medium items that were safe, scoped fixes;
the remaining items are genuine business decisions, documented in TODO.md rather than guessed at
(see "Not fixed" below and CODEX_REVIEW_REPORT.md's new "Claude Fix Status" section for the full
breakdown).

**Critical — fixed**:
1. **Unvalidated quote writes.** `api/handlers/quotes.ts` copied POST/PATCH/workflow-draft fields into MongoDB with no schema validation, no bounds checking, no date validation, no server-side `amount` recomputation, no `jobTypeCode` membership check. New `api/_lib/quoteValidation.ts`: type/length-checked free text, `lines[]` validated per-field (non-negative/bounded `qty`/`unitPrice`, 0–100 `discount`, array-length caps), `YYYY-MM-DD`-or-empty date validation, and `amount` is now **always** server-derived from the resulting effective `lines`/`discount` (never client-writable) using the same totals formula as `computeTotals()` in `src/lib/quotes.tsx` (duplicated, not imported, for the same JSX-in-that-file reason `quoteWorkflow.ts` already duplicates `workflowTransitions`).
2. **Dashboard Customer Interest panel used the app-wide unfiltered quote list.** `DashboardPage.tsx` computed it client-side from the `quotes` prop (every quote ever loaded), ignoring the date/salesperson/department filter entirely — a real, silent filter-honesty bug. Moved server-side: `api/dashboard/index.ts` now returns `interestBreakdown` computed from the same filtered `docs` set as every other widget; the `quotes` prop was removed from `DashboardPage`/`App.tsx` entirely since nothing else needed it.

**High — fixed**:
3. **Expected Sales didn't match the literal business rule.** Previously excluded `TERMINAL_STATUSES` (Won/Lost/Cancelled) — deviating from the documented "sum of quotations where Potential Opportunity = true," and (since Customer Rejected wasn't in that set) still let already-rejected quotes count. Both `kpis.expectedSales` and `salesPerformance[].expectedRevenue` now use the literal `isPotentialOpportunity === true` predicate, no other condition. Introduced a new `CLOSED_STATUSES` set (`TERMINAL_STATUSES` + Customer Rejected) for the *different* concept of "still a genuinely open opportunity," now used by `activeQuotations`/`expiredQuotations`/`forecast.openOpportunities` — previously a Customer-Rejected-but-unexpired quote could wrongly count as an Active Job or an open forecast opportunity.
4. **Job Type was optional and unenforced server-side.** `POST /api/quotes` now requires a non-blank `jobTypeCode` matching a real `job_types` master record; `jobTypeName` is always re-derived from that record, never trusted from the client. The create-quote form no longer offers the blank "unclassified" option (a disabled placeholder shows until a real selection is made); editing an *existing* quote still tolerates a blank Job Type (legacy data) so an unrelated field edit on an old unclassified quote isn't blocked — only a non-blank `jobTypeCode` is validated for membership on `PATCH`/workflow.
5. **Activity Timeline and other Dashboard sections ignored every filter.** Activity Timeline now respects the date-range (via a new Bangkok-day-boundary-aware `bangkokDayBoundsUtc()` helper, converting the Bangkok-local preset into the right UTC range for `audit_log.createdAt`) and salesperson/department filter (matched against `userName`, same free-text join convention used elsewhere). Total Customers/Products/`categoryBreakdown` and `notificationSummary` remain deliberately unfiltered — re-assessed, not silently inconsistent: these are catalog/personal-operational metrics with no sales-date dimension to filter by, now documented explicitly in code and in MODULES/Dashboard.md rather than looking like an oversight.
6. **No Dashboard report export existed at all.** Added client-side CSV export (`src/pages/dashboard/csvExport.ts`, no new dependency) of KPIs + Sales Performance/Top Customers/Job Type Analytics tables, built from the already-filtered `DashboardStats` already on screen (no new permission needed — it's a transform of data the caller is already authorized to see). PDF/Excel remain explicitly deferred (see TODO.md).
7. **Notification click only opened the quotation list module, not the specific quote.** Added a `quotationDeepLinkId` (separate from the pre-existing `quotationListFilter`) lifted to `App.tsx`; `QuotationPage` applies it via React's "adjust state during rendering" pattern (not a bare `useEffect` setState call, which would trip `react-hooks/set-state-in-effect`) so it works whether the module is mounting fresh or already open.
8. **Department/salesperson Dashboard filtering relies on a free-text name join** — re-assessed rather than partially patched: a proper fix needs `Quote` to store a real `salespersonUserId`, which requires deciding whether the Salesperson field stops being freely editable text — a product decision, not a code fix, tracked in TODO.md.

**Medium — fixed**:
9. **Quotation numbering was race-prone** (`nextQuoteId()` scanned every `_id` then computed max+1). Replaced with an atomic `counters` MongoDB collection (`findOneAndUpdate` with `$inc`, upsert) — lazily bootstrapped from the current max via `$max` (idempotent under a concurrent-bootstrap race) the first time it's needed.
10. **Missing compound indexes for real Dashboard query patterns.** Added `{ salesperson: 1, issueDate: 1 }`, `{ status: 1, issueDate: 1 }`, `{ followUpDate: 1, status: 1 }`, `{ isPotentialOpportunity: 1, status: 1, expiryDate: 1 }` on `quotes`, and `{ userName: 1, createdAt: -1 }` on `audit_log` (supporting the newly filter-aware Activity Timeline) — created defensively at request time (same pattern as the previous pass's indexes), since `ensureIndexes()`'s one-time bootstrap never runs again post-provisioning.
11. **Upload fields (profile picture, signature, company logo/stamp) had no server-side validation.** New `api/_lib/uploadValidation.ts`: must be a real `data:image/(png|jpeg|jpg|webp|gif);base64,...` data URL under 2MB, or empty to clear — wired into `PATCH /api/users/:id` and `PUT /api/company`.
12. **`PrintDocument.tsx` rendered blank company labels.** Tax ID/phone/email/address lines now hide conditionally, matching the existing `Field` component's behavior for quote-side optional fields (which already hid correctly) — the company header block just wasn't using it for those three lines.
13. **`GET /api/users`/`GET /api/roles` open-directory exposure** — re-assessed, not blindly restricted: role documents carry no PII (no privacy tradeoff), and the user directory's fields are relied on app-wide (printed-quote signatures visible to any `quotations:view` holder, salesperson pickers) in ways a naive field-strip would likely break without a full consumer trace. Strengthened the code comments explaining the tradeoff and logged it as a business-decision item in TODO.md instead of guessing.

**Not fixed — genuine business decisions, tracked in TODO.md, not guessed at**: the `GET /api/users` privacy model (item 13 above); migrating `Quote.salesperson` to a real user reference (item 8 above); adding real `Quote.createdAt`/`updatedAt` timestamp fields (found while correcting a stale DATABASE.md claim during this pass — a real, scoped gap, not urgent); PDF/Excel export (CSV is done); sequential two-level approval (pre-existing, already tracked); automated tests/CI (pre-existing, already tracked).

**Documentation accuracy** (Codex flagged several docs as contradicting the real 2026-07-09 backend
migration): `MODULES/RoleManagement.md`, `MODULES/Settings.md`, `MODULES/UserManagement.md`, and
`MODULES/Notifications.md` still said "no real DB," "client-side only, not real security,"
"single-browser simulation," and referenced dead `localStorage` keys (`tcs_erp_*`) — all four
corrected to describe the real MongoDB collections/API routes. `MODULES/Quotation.md`'s two
stale "needs X once backend/deep-linking exists" Future Improvements items were resolved by this
same pass (job type numbering + notification deep-link, items 7 and 9 above) and marked done.
`DATABASE.md` incorrectly claimed `Quote` has `createdAt`/`updatedAt` fields in its
superseded-Prisma-plan comparison section — corrected to state plainly that it doesn't (only
`issueDate`/`date` business-date strings and `createdByUserId`/`updatedBy` user-id references).

**Verification**: `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run
lint`, and `npm run build` all pass clean after every fix above (two real lint errors surfaced and
were fixed along the way: a literal BOM byte sequence in `csvExport.ts` tripping
`no-irregular-whitespace`, and a `react-hooks/set-state-in-effect` violation in the new
notification-deep-link effect, both described above). **Live browser/API verification against
real MongoDB data was attempted again and still could not be completed** — same root cause as the
prior 2026-07-10 passes (the sandboxed session's Node process can't resolve MongoDB Atlas's
`mongodb+srv://` SRV DNS record; reconfirmed via a fresh `vercel dev` instance against the
pre-existing `GET /api/auth/session` route). See CODEX_REVIEW_REPORT.md's "Claude Fix Status"
section for the full verification account.

---

## 2026-07-10 — Dashboard completion pass: closed the gap against the full Executive Dashboard business spec

**Scope**: an explicit request to complete the Dashboard against a detailed, ~15-section business
requirements spec, on top of the same-day Executive Dashboard/Job Type rebuild + code-review pass
below. Rather than trusting the prior pass's own summary, ran a read-only audit (`Explore` agent,
reading every Dashboard component/API file directly) comparing the actual code against every
numbered requirement in the spec, then implemented every real, verifiable gap it found. Did not
rebuild anything that already worked.

**Gaps found and fixed** (all in `api/dashboard/index.ts`, `src/lib/dashboard.ts`, and
`src/pages/dashboard/*`, plus dictionary keys in `src/lib/i18n.tsx`):
1. **Pending Approvals had no visible count outside the approvers-only widget, and no actionable list at all** — added a general `kpis.pendingApprovals` KPI card, and expanded `ApprovalDashboard.tsx` from 4 read-only stat tiles into stat tiles + a real list (Quotation No./Customer/Salesperson/Amount/Submitted Date) with inline Approve/Reject, calling the same `performWorkflowAction()` (`POST /api/quotes/:id/workflow`) the Quotation module's own approval UI already uses. Reject requires a comment (inline textarea, matching the existing workflow rule); the Reject button is additionally gated by a new server-computed `approvalDashboard.canReject` (`quotations:reject`), since that permission isn't guaranteed to travel with `quotations:approve` on a custom role.
2. **Active/Non-Active Jobs didn't match the spec's definitions**: `activeQuotations` previously included expired-but-unclosed quotes; there was no "Non-Active" bucket at all (only the narrower "Expired" one). Fixed: Active now excludes expired quotes, and a new `nonActiveQuotations` KPI covers Cancelled/Customer Rejected/Lost/expired-and-still-open — kept alongside (not replacing) the existing Expired KPI.
3. **Average Closing Time only measured Won outcomes**, undercounting the spec's literal "average time between quotation creation and Won/Lost status." `closingDurationDays()` now matches `marked_won` **or** `marked_lost`; `salesPerformance[].avgClosingTime` was updated the same way.
4. **`salesPerformance`/`customerAnalytics`/`jobTypeAnalytics` only ever exposed the Won-only value**, silently under-reporting "Total Quotation Value" everywhere the spec asks for both figures side by side. All three now return `totalValue` (every quotation, any outcome) alongside the existing Won-only `revenue` field.
5. **Sales Ranking table was missing 4 of 11 spec columns** (Lost, Pending, Avg. Deal Size, Total Value — the first two were already computed server-side but never rendered) **and only 4 of 7 columns were sortable**. `SalesPerformanceTable.tsx` now renders and sorts on all 11.
6. **Top Customers table only ever showed one metric per tab and had no Last Quotation Date column.** Rewrote `CustomerAnalytics.tsx` as a real 5-column table (Customer/Quotations/Total Value/Won Value/Last Quotation Date) with 4 ranking tabs (added "Most Repeat" — customers with >1 quotation, ranked by count); `lastQuotationDate` computed server-side from the already-fetched `issueDate` field.
7. **Top Job Types wasn't a table at all** (a progress-bar list, no Avg. Deal Size, not sortable) **and silently dropped job types with zero quotes in the current filter.** Rewrote `JobTypeAnalytics.tsx` as a full sortable table; the server now zero-fills against the active `job_types` master list (13 seeded defaults) instead of only codes present in the filtered doc set, and still appends any code on a real quote that isn't in that active list (deactivated job type, legacy data) so nothing historical is dropped.
8. **Revenue Trend was fixed to a single trailing-12-month monthly series** — no weekly/quarterly/yearly grouping existed despite the spec explicitly requiring it. Added `revenueTrend` (four bucketings from the same underlying won-quote rows) plus a grouping toggle in `RevenueTrendChart` (`ChartCard.tsx` gained an `actions` slot to host it).
9. **No Job Type Distribution (count) chart existed** — `RevenueByJobTypeChart` showed revenue, not count, and only the top 10 of 13 job types (silently hiding 3 real ones). Added `JobTypeDistributionChart`; `RevenueByJobTypeChart` now shows Total + Won Value as grouped horizontal bars for every active job type, no cutoff.
10. **Follow-up Reminders deliberately ignored the date-range filter**, and the trend/forecast-baseline queries' trailing window never moved with the date filter at all — both contradicted the spec's explicit "the date filter must actually change every widget's query, not be visual only." Follow-ups now use the same `fullMatch` as every other date-filtered widget. The trend/forecast windows still can't be *narrowed* to a single day without defeating their purpose as trend charts, but their trailing window's *end* now anchors to the selected `to` date (or today) instead of always "now" — a real, verifiable query change, documented as a deliberate partial application rather than left looking like an oversight.
11. **No Department filter existed at all**, not even a disabled placeholder, despite being explicitly required. Added — `User.department` is free text (no real `Department` entity), so it's resolved server-side to "every salesperson whose `User.department` matches" and composed with an also-selected individual salesperson via `$and` (composing them naively via a second `salesperson` key would have silently discarded one or the other — caught and fixed during implementation, see `api/dashboard/index.ts`'s `fullMatch`/`salespersonOnlyMatch` construction).
12. **Two required MongoDB indexes were missing** (`isPotentialOpportunity`, `client` on `quotes` — both are hot query paths for Expected Sales/forecast and customer-analytics grouping respectively). Added — but since `ensureIndexes()`'s one-time Setup Wizard bootstrap is unreachable on an already-provisioned deployment (same issue `seedJobTypesIfEmpty()` already had to work around), these are instead created defensively inside `GET /api/dashboard` itself, once per warm serverless instance, so they actually get created in production. (`createdAt`/`updatedAt`/`department`/`isDeleted` — also on the original requested index list — don't exist as fields on `Quote` at all, so indexing them would be a no-op; documented as such rather than added blindly.)

**Not changed**: the 9-stage real workflow pipeline (no "Lead" or "Negotiating" stage — no backing
entity/status exists for either; inventing one would itself be fake data), `QuotationTrendChart`'s
reuse of the revenue series as a count proxy, Report Export (still explicitly deferred, no dead
buttons anywhere), and Activity Timeline's flat (non-period-grouped) feed — all pre-existing,
already-documented, deliberate scope decisions, re-confirmed rather than silently left as gaps.

**Verification**: `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run
lint`, and `npm run build` all pass clean. **Live browser/API verification against real MongoDB
data could not be completed in this session**: `vercel dev` was started locally (twice — once via
Git Bash, once via native PowerShell, to rule out a shell-specific cause) using real credentials
already pulled to `.vercel/.env.development.local` from a prior `vercel link`, and the frontend
served correctly, but every MongoDB-touching API route (including the pre-existing, untouched
`GET /api/auth/session`) failed with `querySrv ECONNREFUSED
_mongodb._tcp.tcsdb.zdnus3w.mongodb.net` — the sandboxed environment's Node process cannot resolve
MongoDB Atlas's `mongodb+srv://` DNS SRV record, even though the OS-level `nslookup` resolves that
exact record fine and a raw TCP connection to the resolved shard host on port 27017 succeeds. This
is an environment/network limitation, reproduced identically on code this session never touched,
not a defect in any change above. (A workaround — reconstructing a non-SRV direct connection
string from the resolved shard hosts — was considered and correctly blocked by the session's own
safety guardrails as unwarranted handling of live database credentials; abandoned rather than
worked around.) See PROJECT_STATUS.md "Known Risks" for the recommended follow-up.

---

## 2026-07-10 — Code review pass on the Executive Dashboard/Job Type commit: 10 real bugs found and fixed

**Scope**: a mandatory full-codebase review of the previous commit (`d38bf61`, the Executive Dashboard/Job Type feature), requested before treating that feature as done. Ran a 10-angle multi-agent review (line-by-line, removed-behavior, cross-file, language-pitfall, wrapper-correctness, reuse, simplification, efficiency, altitude, CLAUDE.md-conventions) against `git diff @{upstream}...HEAD`, verified the highest-signal candidates directly against the actual code, and fixed everything confirmed as a real correctness or regression bug. `npx tsc --noEmit` (both configs), `npm run lint`, and `npm run build` all pass clean after every fix below.

**Bugs found and fixed**:
1. **Timezone bug in every new date computation** (`src/pages/dashboard/dateRanges.ts`, `api/dashboard/index.ts`'s `todayIsoDate()`/`periodEnd()`/`lastNMonthKeys()`): mixing a locally-constructed `Date` with `.toISOString()` (UTC) shifted every date boundary back a day for Thailand (UTC+7) — confirmed empirically (Node + `TZ=Asia/Bangkok`) by one reviewer. Every preset ("Today," "This Month," etc.) and the server's own notion of "today" were affected, not an edge case. Fixed by rewriting all date math to shift by a fixed +7h offset once, then read back exclusively via UTC getters/`Date.UTC` — correct regardless of the browser's or Vercel's actual configured timezone, rather than depending on either matching Thailand's.
2. **Filter-coverage gap**: `revenueByMonth` and `monthlyClosingRate` (feeding 3 charts) never applied the salesperson filter, contradicting the shipped docs' claim that every section respects the dashboard filters. Fixed — both now respect the salesperson filter; deliberately still ignore the date-range filter (a trailing-12-month trend chart collapsed to a single day defeats its purpose), matching the follow-ups panel's existing, documented rationale for the same asymmetry. `forecast.historicalWinRate` deliberately stays company-wide-only (a smaller single-salesperson sample would make the forecast noisier, not more accurate) — now stated explicitly in a comment instead of looking like an oversight.
3. **`overdueFollowups` KPI disagreed with the Follow-Up Reminders panel** directly below it on the same screen, since the KPI was computed from date-filtered quotes while the panel deliberately isn't. Fixed: the KPI now reuses the panel's own `followUps.overdue.length` instead of a separate, differently-scoped computation.
4. **Dashboard got stuck on the loading skeleton forever if the fetch failed** — the pre-rebuild code had a `stats?.kpis ?? {zeros}` fallback that the rebuild dropped in favor of `if (!stats) return <DashboardSkeleton />`, with the error silently swallowed by `.catch(() => {})`. Added a real error state with a retry button.
5. **A narrow date filter with zero results hid the entire dashboard**, even with years of real history, because the page-level empty-state gate used the *filtered* `kpis.totalQuotations` instead of an unfiltered signal. Backend now returns a dedicated `hasAnyData: boolean` (unfiltered `quotes.estimatedDocumentCount() > 0 || totalProducts > 0`), decoupled from the correctly-filtered KPI numbers.
6. **Falsy-zero display bugs**: `avg()` returning `0` for both "no data yet" and "a genuine same-day/0% result" made `averageApprovalTime`/`averageClosingTime`/`avgClosingTime`/monthly win rate indistinguishable from "no data" in the UI (some widgets showed a misleading "0.0 days," others hid a real 0% month behind the empty state). Fixed at the source: `avg()` now returns `number | null` (`null` = no data), threaded through the relevant types end-to-end, with a shared `fmtDaysOrDash()`/`fmtPercentOrDash()` helper so every widget renders "—" only for genuinely absent data.
7. **`Quote.jobTypeName` snapshot was silently overwritten on every save/reopen**, defeating its own documented purpose (renaming a Job Type must not rewrite historical quotes) — `QuoteDocument.tsx` was re-deriving the display name live from the current `jobTypes` list via `jobTypeCode` lookup instead of reading the quote's persisted `jobTypeName`. Worse: if a job type's `code` itself was ever renamed, the lookup would silently return nothing and blank the field on an existing quote. Fixed: `jobTypeName` is now its own piece of state, seeded from `quote.jobTypeName` and updated only by an explicit dropdown change.
8. **Dashboard pipeline/follow-up click-through silently lost its filter** the first time a user opened any one quote from the filtered list and clicked Back. Root cause: `QuoteList` (the actual filter consumer) remounts on every internal `QuotationPage` view toggle (list ↔ detail), but the App-level filter was already nulled out by a mount-effect that fired well before that remount. Fixed by snapshotting the filter into `QuotationPage`'s own local state once (stable for its whole mount lifetime), decoupled from telling `App.tsx` it can forget its copy.
9. **`job_types` seed race + missing index in production**: the unique index on `code` only lives in `ensureIndexes()`, which — like every other index — never runs again on an already-provisioned deployment, so concurrent first requests to the empty collection could both pass the `count === 0` check and both insert, silently duplicating all 13 defaults with nothing to reject them. Fixed: `seedJobTypesIfEmpty()` now creates the unique index itself (self-healing, same precedent as its own defensive re-seed call) before checking/inserting, turning the race into a safe, ignorable duplicate-key error instead of silent duplicate data.
10. **`QuotationListFilter` lived in a page component** (`DashboardPage.tsx`) and was imported backward into `App.tsx` and the Quotation module — violates `docs/CLAUDE.md`'s "types belong in `lib/<domain>.ts`" rule, flagged independently by two review angles. Moved to `src/lib/quotes.tsx`.

**Also fixed** (smaller, safe): a `.trim()` crash risk if a legacy quote document is missing `client`/`salesperson` entirely (normalized once when the filtered quote set is built, rather than risking a 500 for every dashboard viewer over one bad document); a duplicate `clientNames`/`clientsInFilteredSet` computation (now computed once); a redundant `countDocuments` in the notification summary (derived from the `find()` result instead); a missing field projection on that same `find()`; the interest-breakdown widget's triple `.filter()` scan wrapped in `useMemo`.

**Deliberately not fixed this pass** (found, judged lower-value-per-risk, explicitly noted rather than silently dropped — see TODO.md): the `salesPerformance`/`customerAnalytics`/`jobTypeAnalytics` O(n·k) grouping pattern (re-filters the full quote set once per distinct key) — fine at this app's actual data volume, a genuine one-pass `groupBy` refactor would add risk for negligible real benefit; several small reuse/duplication findings (a repeated percentage-rounding formula, a hand-rolled card wrapper in 2 files that could use the already-extracted `ChartCard`, a duplicated "no data" empty-state markup in 5 files, a second color palette, `SalesPerformanceTable`'s sort UX not matching `ProductList.tsx`'s existing toggle pattern); the `escapeRegExp()` duplication in `api/handlers/jobtypes.ts` (continues a pattern already duplicated 3× before this change, in `auth.ts`/`categories.ts`/`roles.ts` — fixing it properly means touching pre-existing files outside this diff's scope); a pre-existing, not-introduced-by-this-diff discovery that `src/lib/quotes.tsx`'s `todayIso()` has the *same* timezone bug as finding #1 (used as the default `issueDate` on a brand-new quote) — flagged in TODO.md, not fixed here since it's pre-existing code outside this diff, not a regression this pass introduced.

**Files Modified**: `api/dashboard/index.ts`, `api/_lib/systemSeed.ts`, `src/pages/dashboard/dateRanges.ts`, `src/pages/dashboard/DashboardPage.tsx`, `src/pages/dashboard/format.ts`, `src/pages/dashboard/KpiGrid.tsx`, `src/pages/dashboard/SalesPerformanceTable.tsx`, `src/pages/dashboard/ApprovalDashboard.tsx`, `src/pages/dashboard/DashboardCharts.tsx`, `src/lib/dashboard.ts`, `src/lib/quotes.tsx`, `src/pages/quotation/QuoteDocument.tsx`, `src/pages/quotation/QuotationPage.tsx`, `src/pages/quotation/QuoteList.tsx`, `src/App.tsx`, `src/lib/i18n.tsx`.

---

## 2026-07-10 — Executive Dashboard, Sales Analytics & Job Type

**Scope**: user requested a full BI rebuild of the Dashboard ("real business intelligence... not only simple statistics") plus a Job Type master data classification and a "Potential Opportunity" sales flag on every quotation. This was scoped and planned before implementation (see the plan file discussion) into: (1) the data-model foundation on `Quote` + a new `job_types` collection, (2) the dashboard backend rebuild, (3) the dashboard frontend rebuild — with Report Export (PDF/Excel/CSV) and building real Lead/Customer entities explicitly deferred as separate follow-ups, per the user's own choice among the presented options.

**Job Type master data**: new `job_types` MongoDB collection (`code`, `name`, `isActive` + audit fields), seeded with 13 defaults (TA, STA, LI, SC, BF, GA, BI, VT, WTP, OTHER TA, OTHER SC, OTHER BF, OTHER) via `seedJobTypesIfEmpty()` (`api/_lib/systemSeed.ts`). New `api/handlers/jobtypes.ts` (`GET/POST/PATCH /api/jobtypes`) — the 10th serverless function, still under Vercel Hobby's 12-function cap. Because production already exists past the one-time Setup Wizard (where `ensureIndexes()`/seeding normally run), `GET /api/jobtypes` defensively re-seeds on every call — the same self-healing precedent `GET /api/roles` already used for `seedDefaultRolesIfEmpty()`. No new `Permission` was added: `GET` reuses `quotations:view`, `POST`/`PATCH` reuse `company:manage` (Super Admin only, matching the existing bank/VAT/T&C precedent).

**Quote gains three fields**: `jobTypeCode`/`jobTypeName` (snapshotted from Job Type at save time — same non-live-reference rationale as the Product picker), `isPotentialOpportunity` (checkbox), `followUpDate`. Wired into `QuoteDocument.tsx` (new dropdown/checkbox/date input), `QuoteList.tsx` (Job Type filter + column, Potential Opportunity summary card, a dismissible client-name filter chip for Dashboard click-through), and `PrintDocument.tsx` (Job Type printed, Thai-only per that file's existing convention; Potential Opportunity/Follow-up Date are internal-only, not printed).

**Dashboard backend** (`api/dashboard/index.ts`) rebuilt in place (not a new function): accepts `?from=&to=&salesperson=` query params; almost every new section fetches the filtered `quotes` set once (small projection) and reduces it in plain JS rather than a dozen fine-grained aggregation pipelines — deliberate, matching the pre-existing `revenueByMonth`/`categoryBreakdown` style and appropriate at this data volume (no `dashboard_cache`/`analytics_cache`/`forecast` collections were built — computed live instead). New response sections: expanded KPIs (~20, up from 7), `pipeline` (with a real workflow-predecessor-aware conversion % — see bug note below), `salesPerformance`, `customerAnalytics`, `jobTypeAnalytics`, `forecast` (live weighted estimate), `followUps`, `monthlyClosingRate`, `activityTimeline` (null unless the caller has `auditLog:view`), `approvalDashboard` (null unless `quotations:approve`), `notificationSummary`, `availableSalespeople`.

**Bug caught during self-review, fixed before shipping**: the sales pipeline's stage-to-stage "conversion from previous" initially used simple array-adjacency (each stage compared against the row above it in display order). The real workflow branches — Sent to Customer leads to *either* Customer Accepted *or* Customer Rejected, not a single line — so array-adjacency would have shown a nonsensical conversion percentage for the Customer Rejected/Lost branch (e.g. "conversion from Won" for a status that isn't actually downstream of Won). Fixed with an explicit `PIPELINE_PREDECESSOR` map mirroring `workflowTransitions` in `api/_lib/quoteWorkflow.ts`.

**Dashboard frontend**: `DashboardPage.tsx` split from one file into 13 files under `src/pages/dashboard/` (`DashboardFilterBar`, `KpiGrid`, `PipelineFunnel`, `SalesPerformanceTable`, `JobTypeAnalytics`, `CustomerAnalytics`, `ActivityTimeline`, `FollowUpReminders`, `ApprovalDashboard`, `NotificationSummary`, `DashboardCharts` + `ChartCard`, `format.ts`/`dateRanges.ts` helpers), per the project's "split into `pages/<module>/` once it grows past one file" convention. 9 charts total (added Quotation Trend, Sales by Employee, Revenue by Job Type, Status Donut, Win/Lose Donut, Expected Sales Forecast, Monthly Closing Rate to the pre-existing Revenue Trend and Products-by-Category). ~80 new i18n dictionary keys (Thai + English).

**Click-through, not full deep-linking**: a lightweight `quotationListFilter` (`{status?, client?}`) was lifted to `App.tsx` so clicking a pipeline stage or a follow-up reminder opens a pre-filtered quotation list — consumed exactly once per fresh visit via a `useRef` guard (not a `[]`-deps effect, to stay `react-hooks/exhaustive-deps`-clean while `onFilterConsumed`'s identity changes every `App.tsx` render). This is **not** the full per-quote deep-linking gap tracked separately in TODO.md (`QuotationPage`'s `view`/`selectedId` state still isn't lifted) — a smaller, scoped version was built instead.

**A real lint error was hit and fixed along the way**: calling `setLoading(true)` synchronously at the top of the data-fetching `useEffect` (to show a spinner during filter-driven refetches) tripped `react-hooks/set-state-in-effect` (a real perf footgun — cascading renders — not a style nit). Fixed by moving the `setLoading(true)` call into the filter-change event handler instead, so the effect itself only calls `setState` inside its async `.then()`/`.finally()` callbacks.

**Verification status**: `npx tsc --noEmit` (both root and `tsconfig.api.json`), `npm run lint`, and `npm run build` all pass clean. **Not yet verified against live data in a browser** — no local MongoDB credential was available and no safe non-production test environment existed in that session (writing test data via the UI would have hit the same production database serving real users). See PROJECT_STATUS.md "In Progress" for what's needed to close this out.

**Files Modified/Added**: `api/_lib/collections.ts` (`JobTypeFields`), `api/_lib/systemSeed.ts` (`DEFAULT_JOB_TYPES`/`seedJobTypesIfEmpty`), `api/handlers/jobtypes.ts` (new), `api/handlers/quotes.ts`, `api/dashboard/index.ts` (rebuilt), `vercel.json`, `src/lib/quotes.tsx`, `src/lib/jobTypes.ts` (new), `src/lib/dashboard.ts` (rebuilt), `src/lib/i18n.tsx`, `src/App.tsx`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,PrintDocument}.tsx`, `src/pages/dashboard/*` (13 files, mostly new).

---

## 2026-07-09 — Incident: i18n follow-up briefly broke all authenticated API routes in production

**What happened**: the "translate the rest of the app" follow-up added `import { translate } from "./i18n"` (a real value import, not `import type`) to `src/lib/apiClient.ts`, to translate two rare fallback error strings. `apiClient.ts` is transitively value-imported into the Vercel serverless bundle: `api/_lib/auth.ts` value-imports `roleHasPermission`/`findRole` from `src/lib/roles.ts` (used on **every** authenticated request via `getAuthContext()`), and `roles.ts` itself value-imports `apiFetch` from `apiClient.ts`. `i18n.tsx` is a JSX/React module that was never part of the Node function build output, so the moment this shipped, every authenticated route (`/api/auth/session`, `/api/products`, `/api/quotes`, everything) started returning `500 Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/lib/i18n'`. Caught within ~3 minutes via a Playwright console-error check, not by the build (both `tsc` projects compiled cleanly — TypeScript has no way to know a same-repo module is JSX-incompatible at the Node runtime target; this is a deploy-time/runtime-only failure mode).

**Fix**: reverted `apiClient.ts` and `session.ts` to NOT import anything from `./i18n` — both now carry their own tiny inline bilingual string (reading `localStorage.tcs_erp_lang` directly), duplicated rather than shared, specifically to guarantee zero import-graph connection to the React/JSX module tree from any file reachable from `src/lib/roles.ts`, `src/lib/users.ts`, `src/lib/products.ts`, or any other `src/lib/*` file that's value-imported into `api/`.

**Standing rule going forward**: any `src/lib/*.ts(x)` file may be transitively value-imported into the `api/` serverless bundle (the existing pattern for shared types/defaults/pure helpers — see `defaultRoles`, `ALL_PERMISSIONS`, `nowIso`, etc.). Before adding a new **value** import (not `import type`) to any `src/lib/*` file, check whether that file is reachable from `api/_lib/auth.ts`, `api/_lib/collections.ts`, `api/_lib/systemSeed.ts`, `api/_lib/rbacSeed.ts`, or any `api/handlers/*.ts` — if so, the new dependency must not itself pull in `src/lib/i18n.tsx`, `src/components/*`, or anything else JSX/React-only, even transitively. `import type` is always safe (erased at compile time); a plain `import { x }` is not.

---

## 2026-07-09 — Translate the rest of the app's Thai UI (full i18n follow-up)

**Scope**: the initial production-readiness pass explicitly scoped `src/lib/i18n.tsx` to only Dashboard + empty states + the toggle itself. This follow-up (user-requested, after the initial toggle appeared to "not do anything" outside Dashboard) wires essentially every remaining page's UI chrome to the same dictionary: sidebar nav + topbar + user menu (`App.tsx`), login/setup pages (`AuthLayout`/`SignInPage`/`SetupWizardPage`), `NotificationBell`, all 4 Settings tabs, the entire Products module (list/form/categories/picker modal), the entire Quotation module's screen editing UI (list/document/line-items/interest buttons — **not** `PrintDocument.tsx`, see below), and the entire Admin module (Users/Roles/Audit Log). ~450 dictionary keys total.

**Real bug found and fixed along the way**: navigation state (`App.tsx`'s `activeNav`) was keyed off the display label text itself (`activeNav === "ใบเสนอราคา"`), not a stable identifier. Translating the labels without fixing this would have silently broken routing the moment a user switched language mid-session. Introduced a `NavKey` union (`"dashboard" | "quotations" | ...`) decoupled from the translated label, with a `NAV_LABEL_KEYS` lookup for display. The same category filter pattern (translated display text also used as internal comparison state) was found and fixed in `QuoteList.tsx` and `ProductList.tsx` (both now use a stable `"all"` sentinel instead of the localized "ทั้งหมด" string).

**Design decision — deliberately still Thai-only, not a gap**:
1. **Persisted data/seed content**: audit log entries, notification title/description/module text, default role/department/position descriptions, `Company` default values. These are business records or admin-editable content written once (often server-side) and read back later — translating them live would mean either re-translating historical records on every render (wrong — a Login event from last Tuesday shouldn't change wording retroactively) or storing translations for every record (real scope creep, not requested). Matches the same reasoning already applied to `App.tsx`'s `moduleForAction()` in the original pass.
2. **`PrintDocument.tsx`**: the actual printed/PDF quotation handed to customers. Kept Thai regardless of the toggle — a real business document for Thai customers shouldn't silently switch language based on the preparer's own UI preference.

**New**: `translate()` in `src/lib/i18n.tsx` — a non-hook lookup (reads `localStorage` directly) for the two genuinely user-facing error strings that live in plain functions rather than components (`apiClient.ts`'s generic HTTP-failure message, `session.ts`'s login-failure fallback). Confirmed neither file is ever imported by the `api/` serverless layer, so pulling in a `.tsx` module client-side only is safe.

**Also added**: `PERMISSION_LABEL_KEY` + per-group `labelKey` to `permissions.ts` (translated display labels for the Role Management permission matrix; the Thai `PERMISSION_LABELS` used to seed the `permissions` collection is untouched).

**Files Modified**: `src/lib/i18n.tsx` (dictionary + `translate()`), `src/App.tsx` (NavKey refactor), `src/pages/AuthLayout.tsx`, `src/pages/SignInPage.tsx`, `src/pages/SetupWizardPage.tsx`, `src/components/NotificationBell.tsx`, `src/components/ConfirmDialog.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/products/{ProductsPage,ProductList,ProductForm,CategoriesManager,ProductPickerModal}.tsx`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,LineItemsEditor,InterestButtons}.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`, `src/pages/dashboard/DashboardPage.tsx` (interest widget), `src/lib/quotes.tsx` (`statusLabelKey`/`approvalActionLabelKey`/`interestLabelKey`), `src/lib/permissions.ts` (`PERMISSION_LABEL_KEY`), `src/lib/apiClient.ts`, `src/lib/session.ts`.

---

## 2026-07-09 — Fix: Administrator role incorrectly locked read-only in Role Management

**Bug**: `RoleManagementPage.tsx` routed to a fully read-only view whenever `role.isSystem` was true, and `api/handlers/roles.ts` rejected any `PATCH`/`DELETE` under the same `isSystem` check. Both "Super Admin" and "Administrator" have `isSystem: true`, so Administrator's permission checkboxes and description were locked identically to Super Admin — even though `Role`'s own doc comment says system roles should only have their name/Super-Admin-flag locked, not their permissions.

**Fix**: both client and server now key the edit lock off `isSuperAdmin` specifically (only Super Admin is fully read-only), while the delete lock and the name-field lock stay keyed off `isSystem` (Administrator's name still can't change, and it still can't be deleted — but its description/permissions are editable like any custom role). See [RBAC.md](./RBAC.md) "System-role locking" for the precise rule.

**Files Modified**: `api/handlers/roles.ts` (`handleOne`: split the single `isSystem` guard into a `PATCH`-time `isSuperAdmin` check + a `DELETE`-time `isSystem` check, and gated the `name` field update on `!target.isSystem`), `src/pages/admin/RoleManagementPage.tsx` (`startEdit` now checks `isSuperAdmin` not `isSystem`; added a `nameLocked` flag distinct from `readOnly`; added a lighter "name locked" badge for system-but-editable roles; Pencil button tooltip now reflects `isSuperAdmin`), `docs/RBAC.md`.

---

## 2026-07-09 — Production-readiness pass: branding, real Dashboard, MongoDB schema prep, dead-code removal, i18n

**Scope**: a full production-readiness pass covering official branding, removing every fake/demo data source, preparing the MongoDB schema for planned future modules, and basic Thai/English internationalization — requested as a single large task, executed in phases (each verified with a clean `npm run build`/`npm run lint` before moving to the next).

**Branding**: added the official logo (`public/logo.png`, 500×500 RGBA PNG with real transparency, verbatim from the source file — not redesigned) and one new shared component, `src/components/BrandMark.tsx` (props: `size`, `variant: "mark"|"full"`, `theme: "dark"|"light"`), replacing 6 independently copy-pasted inline "gold square + Thai ท character" placeholder blocks that had drifted in size/corner-radius over time: sidebar header (`App.tsx`, expanded/collapsed states — also fixed a real layout bug where the collapsed sidebar never actually centered the icon, just clipped the text via `overflow-hidden`), login page desktop + mobile brand marks (`AuthLayout.tsx`), and the quote/print document fallback headers (`QuoteDocument.tsx`/`PrintDocument.tsx`, only when no `company.logoDataUrl` is uploaded — the admin-uploadable company letterhead logo is a separate, untouched concept). Favicon (`index.html`) switched from an inline SVG data-URI with a Latin "T" (inconsistent with the Thai "ท" used everywhere else) to the real logo PNG. The 3 previously-blank (`<div className="min-h-screen bg-background" />`) boot/loading screens now show the logo (`App.tsx`'s new `BootLoading()`).

**Dashboard — full rewrite, zero fake data remains**: `src/pages/dashboard/DashboardPage.tsx` previously rendered 100% hardcoded static data (4 KPI cards, a 12-month revenue/expenses chart, a category-revenue donut, a 5-person fake sales leaderboard imported from `src/lib/salesTeam.ts`, a 7-row fake orders table with fake company names, and a 6-item fake activity feed — none backed by a real Orders/Accounting/HR module). All of it is deleted. New `GET /api/dashboard` endpoint (`api/dashboard/index.ts`, gated by `dashboard:view`, the app's 10th live serverless function, still under Vercel Hobby's 12-function cap) computes real KPIs (Total Customers, Total Leads, Total Quotations, Total Products, Revenue, Won Deals, Lost Deals — Won/Lost map to the existing `ปิดการขายสำเร็จ`/`เสียโอกาส` quote statuses, `เสียโอกาส` only, not `ลูกค้าปฏิเสธ`), a 12-month zero-filled monthly revenue chart (grouped from real `Quote.issueDate`, no time-series collection invented), and a real products-by-category breakdown (deliberately reframed from "revenue by category," since `QuoteLine` has no `categoryId` reference back to `Product` and joining by name would be unreliable). New `src/lib/dashboard.ts` client wrapper. The two previously-dead buttons ("ส่งออกรายงาน"/"+ สร้างคำสั่งซื้อ") and the sections with no real backing model (sales leaderboard, orders table, activity feed) were **removed outright** rather than empty-stated, since there's no real collection behind any of them — an empty state for a nonexistent module would just be a different flavor of placeholder.

**MongoDB schema prep**: added 15 new collections to `api/_lib/collections.ts` with real indexes (`permissions`, `sessions`, `departments`, `positions`, `customers`, `customer_contacts`, `leads`, `lead_activities`, `product_templates`, `quotation_comments`, `quotation_tags`, `notification_types`, `system_settings`, `uploads`, `attachments`) — schema/index scaffolding ahead of the features that will use them, per explicit request ("prepare every collection before new features are implemented"); most have no API routes or UI yet, see [DATABASE.md](./DATABASE.md) for which. Two collections requested by name were deliberately **not** built as separate collections, with the reasoning documented in DATABASE.md: `quotation_items` (stays embedded as `Quote.lines`) and `quotation_status_history` (redundant with the existing embedded `Quote.approvalHistory`, which already records every status transition). Retroactively added real indexes to the 8 already-live collections too (`products`, `categories`, `quotes`, `notifications`, `audit_log` had none beyond default `_id` before this). New `api/_lib/systemSeed.ts` (idempotent, mirrors the existing `rbacSeed.ts` pattern) seeds only system/config data on first-run setup — permissions (from the existing `ALL_PERMISSIONS` union), a generic department/position starter list, notification types, and default system settings. Explicitly seeds **zero** business data (no demo customers/products/quotations/leads) — the system starts empty by design. Added `createdAt`/`updatedAt`/`createdBy`/`updatedBy` audit fields to `ProductCategory` (had none), `createdBy`/`updatedBy` to `Product` (had timestamps already), `updatedBy` to `Quote` (had `createdByUserId` already, server-set-only — deliberately excluded from `QuoteUpdateFields`), and `updatedAt`/`updatedBy` to `Company`.

**Dead-code removal**: deleted 25 files across 7 directories (`api/{auth,users,roles,products,categories,notifications,quotes}/*`) — a duplicate, unreachable routing layer shadowed by `vercel.json`'s rewrites (the real, live routing is `api/handlers/*.ts`); confirmed dead both via production runtime-traffic log analysis (all real traffic hits `api/handlers/*`) and via `diff` (the dead files had drifted out of sync from their live counterparts, proving they'd been dead a while, not just theoretically unreachable). This `api/` tree had never been committed to git, so the deletion was confirmed with the user before executing (irreversible, not git-revertable). Also deleted `src/lib/salesTeam.ts` (the fake sales-data module) — its one real dependent besides the old Dashboard, `QuoteList.tsx`'s salesperson-initials avatar, was rewritten to a deterministic `avatarColorFor()` hash function that works for any real salesperson name, fixing a latent bug where any name not in the 5-person fake roster silently rendered no avatar at all.

**i18n (Thai/English)**: new `src/lib/i18n.tsx` — a lightweight React context (`I18nProvider`/`useI18n()`), `localStorage`-persisted (`tcs_erp_lang`, default `th`), with a toggle added to Settings → Profile. Scope was explicitly limited (user decision) to strings this pass touched — Dashboard, the 5 new empty states, and the toggle itself — rather than a full app-wide translation of the existing, entirely-Thai UI; that remains tracked as a follow-up in [TODO.md](./TODO.md).

**Empty states**: added professional empty states (Thai/English via the new i18n) to Dashboard (whole-page, when there's no quotation/product data), Products, Quotations, Notifications, and Audit Log — distinguishing, where both cases existed, "the collection is truly empty" (with a call-to-action button) from "no results match the current filter" (existing narrower message, unchanged).

**Files Added**: `public/logo.png`, `src/components/BrandMark.tsx`, `src/lib/i18n.tsx`, `src/lib/dashboard.ts`, `api/dashboard/index.ts`, `api/_lib/systemSeed.ts`.

**Files Removed**: `api/auth/`, `api/users/`, `api/roles/`, `api/products/`, `api/categories/`, `api/notifications/`, `api/quotes/` (25 files, dead duplicate routing layer), `src/lib/salesTeam.ts`.

**Files Modified**: `api/_lib/collections.ts` (15 new collections + indexes, `ensureIndexes()` extended), `api/handlers/{auth,categories,products,quotes}.ts` (seed wiring + audit-field capture), `api/company/index.ts` (audit fields), `src/App.tsx` (BrandMark, BootLoading, sidebar collapse fix), `src/pages/AuthLayout.tsx`, `src/pages/quotation/{QuoteDocument,PrintDocument,QuoteList}.tsx`, `src/pages/dashboard/DashboardPage.tsx` (full rewrite), `src/pages/products/ProductList.tsx`, `src/components/NotificationBell.tsx`, `src/pages/admin/AuditLogPage.tsx`, `src/pages/SettingsPage.tsx` (language toggle), `src/lib/{products,quotes,storage}.ts(x)` (new audit-field types), `src/main.tsx` (I18nProvider), `index.html` (favicon), `CLAUDE.md` (fixed a stale "client-only frontend, no backend" description left over from before the 2026-07-09 backend migration).

---

## 2026-07-09 — Real backend migration: Vercel Serverless Functions + MongoDB Atlas

**Feature**: Migrated the entire app from a fully client-side, `localStorage`-only architecture to a real full-stack deployment: Vite + React frontend (unchanged) + **Vercel Serverless Functions (Node.js)** backend + **MongoDB Atlas** database. Deployed and live at https://tcs-erp-nine.vercel.app (Vercel project `tcs-erp`, GitHub repo `Wisarutbuasumlee/tcs-erp` connected for auto-deploy on push to `master`). This is a different stack than the previously-proposed, never-built "Phase 2" plan (Next.js + Prisma + PostgreSQL + Auth.js) — that plan is formally superseded, not implemented; see [ARCHITECTURE.md](./ARCHITECTURE.md).

**Auth**: bcrypt password hashing (`bcryptjs`, cost 10) — the old client-side `hashPassword()` checksum function is gone entirely, not deprecated. JWT sessions (`jsonwebtoken`) in an httpOnly, `secure`, `sameSite=lax` cookie (`tcs_erp_session`, 7-day expiry). Every authenticated request re-fetches the user fresh from MongoDB rather than trusting JWT claims, so deactivating a user takes effect on their very next request, not just at token expiry.

**RBAC**: every mutating API route enforces permissions server-side via `requireUser`/`requirePermission` (`api/_lib/auth.ts`), reusing the exact same pure `roleHasPermission()` function from `src/lib/roles.ts` (value-imported into the API layer, not reimplemented). This is genuinely no longer bypassable via devtools — the server is the source of truth. Quote general-edit and workflow-action routes duplicate the ownership + permission-per-action logic from the client (`api/_lib/quoteWorkflow.ts`), giving full parity with the old client-side enforcement, now unbypassable.

**MongoDB collections**: `users` (gains a server-only `passwordHash` field never sent to the client), `roles` (seeded from `defaultRoles` on first run), `company` (singleton, `_id: "singleton"`), `products`, `categories`, `notifications`, `audit_log`, `quotes` (keyed by the business ID string, e.g. `"QT-2567-0041"`, as the literal MongoDB `_id`, not an `ObjectId`).

**API layout**: 9 serverless function files (Vercel Hobby's 12-function cap) — `api/company/index.ts` and `api/audit-log/index.ts` as plain method-dispatch files; `api/handlers/{auth,users,roles,products,categories,notifications,quotes}.ts` as one-file-per-resource, path-segment-dispatch files. Routed via an explicit `vercel.json` `rewrites` table after ruling out Vercel's own dynamic-route (`[...segments]`) convention, which had multiple surprising, undocumented behaviors on this plain-Vite deployment (wrong query-param key, zero-segment paths never matching, `_`-prefixed folders silently excluded from routing) — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the full root-cause writeup, kept for future engineers touching routing.

**Build/tooling**: new `tsconfig.api.json` (Node target) alongside the existing `tsconfig.json` (browser target); `npm run build` now runs both `tsc` projects plus `vite build`; `eslint.config.js` gained a Node-globals block scoped to `api/**/*.ts`. Every relative import in `api/` (and any `src/lib/*.ts` file value-imported from `api/`) needed an explicit `.js` extension to satisfy Node's native ESM loader in the deployed (non-bundled) serverless functions — a footgun hit and fixed multiple times during the migration.

**Frontend changes**: new `src/lib/apiClient.ts` (`apiFetch<T>()` wrapper). Every domain lib file (`users.ts`, `roles.ts`, `session.ts`, `storage.ts`, `products.ts`, `notifications.ts`, `auditLog.ts`, `quotes.tsx`) rewritten from `loadX()`/`saveX()` `localStorage` functions to `fetchX()`/`createX()`/`updateX()`/etc. API calls. `App.tsx` now boots asynchronously via a `bootStatus` state machine against `GET /api/auth/session`, fetching all app data in parallel via `Promise.all` before rendering the shell. `currentUser` is now real React state, not derived via `.find()`. `AuditLogPage.tsx` now self-fetches on mount instead of receiving data as a prop, since its endpoint is permission-gated.

**Genuine security/privacy improvements over the old simulation** (not just "moved," actually better): audit log entries always derive actor identity from the authenticated session server-side, never trusting the request body — a client can no longer forge who performed an action. `GET /api/notifications` is now genuinely filtered server-side to the caller's own notifications, rather than the client holding every user's notifications in memory and filtering only for display.

**Known, deliberate scope limitations** (documented, not hidden): `GET /api/users`/`roles`/`company`/`products`/`categories` are open to any authenticated user, not gated by a manage-permission — matches pre-migration behavior where the full dataset already lived in every signed-in browser, so not a new exposure, just now requiring real login at all. No rate limiting on login. No automated tests or CI pipeline. A MongoDB Atlas database-user password was pasted into an AI chat session during this migration's development — a rotation was recommended to the user as a follow-up, unconfirmed whether completed.

**Files Added**: `api/**` (all Vercel Function handlers and `_lib/` shared code), `vercel.json`, `tsconfig.api.json`, `src/lib/apiClient.ts`.

**Files Modified**: `src/lib/{users,roles,session,storage,products,notifications,auditLog,quotes}.ts(x)` (localStorage → REST API calls), `src/App.tsx` (async boot sequence, real `currentUser` state), `src/pages/admin/AuditLogPage.tsx` (self-fetching), `package.json` (`build` script now runs two `tsc` projects), `eslint.config.js` (Node-globals block for `api/**`).

**Files Removed**: the old client-side non-cryptographic `hashPassword()` function in `src/lib/users.ts`.

**Reason**: Explicit user request to move off the client-only/`localStorage` architecture onto a real, deployed, server-enforced backend.

**Notes**: Deployed via Vercel CLI (`vercel link`, `vercel env add MONGODB_URI`/`JWT_SECRET`, `vercel deploy --prod`) — no CI/CD pipeline wired up yet, deploys were manual via CLI during this session. The GitHub repo is already connected to the Vercel project per `vercel link`'s output, so pushing to `master` may already auto-deploy going forward — flagged to verify, not assumed, next time someone pushes (see [TODO.md](./TODO.md)). Full documentation pass across all `docs/` files per the standing rule — see [PROJECT_STATUS.md](./PROJECT_STATUS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), [API.md](./API.md), [RBAC.md](./RBAC.md).

---

## 2026-07-09 — Code review pass: RBAC + print/PDF permission and data-integrity fixes

**Feature**: A full multi-angle code review (correctness, removed-behavior, cross-file, reuse, simplification, efficiency, altitude, CLAUDE.md conventions) of the previous two sessions' work (RBAC/user-management system + quotation print redesign), followed by fixes for every confirmed bug.

**Bugs fixed**:
- `quotations:export` permission was defined and shown in the Role Management matrix but never actually checked — the "พิมพ์ / PDF" button rendered for every role regardless. `QuotePermissions` gained `canExport`, computed via `hasPermission(..., "quotations:export")`, and the print button is now hidden without it.
- The customer-interest (👍/👎) toggle in `QuoteDocument.tsx` (both the toolbar and meta-panel instances) bypassed `permissions.canEdit` entirely — a Viewer-role user could change a quote's interest level despite having no edit rights anywhere else. Now gated like every other edit action.
- "คัดลอก" (Duplicate) had no permission gate at all — any signed-in user, including Viewer, could clone any quote into a new draft. `QuotePermissions` gained `canDuplicate` (`quotations:create`), and the button is hidden without it.
- **Workflow actions (Submit/Approve/Reject/etc.) operated on the last-*saved* quote, silently discarding any unsaved on-screen edit** — e.g. editing a quote's line items then clicking "ส่งขออนุมัติ" directly (without clicking "บันทึก" first) reverted those edits once the transition was applied, and could cause the ≥฿500,000 high-value approver notification to fire against the wrong (stale) amount. `onWorkflowAction` now carries the current on-screen draft, merged into the persisted quote before the status transition is applied. Verified end-to-end: edited a line item, clicked Submit directly, reopened the quote, edit was preserved.
- User Management had no safeguard against **deactivating or role-reassigning the last active Super Admin** (only hard-delete was guarded) — an Administrator could lock everyone out of Super-Admin-only features via the normal UI. Added the same last-active-Super-Admin check to both the deactivate action and role-change validation.
- `loadRoles()` returned `[]` instead of falling back to `defaultRoles` when the stored roles array was empty (as opposed to missing) — a rare but reachable state that would crash the first-run Setup Wizard (`Cannot read properties of undefined`) when picking the Super Admin role. Fixed to fall back on empty as well as missing.
- The printed/PDF quotation was missing the company stamp image near the approver's signature — a real regression versus the pre-redesign print output, simply missed when `PrintDocument.tsx` was built. Restored.
- A line item's "has extra details" check (notes/sub-details/specs/tags) was implemented twice with different rules — the on-screen editor counted a sub-detail row as "has details" even if left blank, while the print component ignored blank ones — so a line could show the "has notes" indicator on screen but print with nothing. Unified into one `lineHasDetails()` helper in `lib/quotes.tsx`, used by both.

**Cleanup**: consolidated three duplicate date-formatting functions (`QuoteDocument.tsx`'s `fmtDate`, `PrintDocument.tsx`'s `fmtThaiDate`/`fmtNumericDate`) into shared `formatQuoteDateThai`/`formatQuoteDateNumeric` exports in `lib/quotes.tsx`; replaced three raw `new Date().toISOString()` calls in `UserManagementPage.tsx` and a hand-rolled ID in `RoleManagementPage.tsx` with the existing shared `nowIso()`/`newId()` helpers; deduplicated a double array-reverse of `approvalHistory` in `QuoteDocument.tsx` into one.

**Files Modified**: `src/lib/quotes.tsx`, `src/lib/roles.ts`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor,PrintDocument}.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage}.tsx`

**Reason**: Explicit user request to review the code, fix bugs, commit, and push.

**Notes**: Deliberately **not** changed (documented rather than silently skipped): `Company.vatRate` still isn't wired into `computeTotals()` — this is a pre-existing, already-tracked (see [TODO.md](./TODO.md)) product decision, not a regression from either reviewed session, and fixing it requires deciding VAT-rate-versioning semantics that's out of scope for a bug-fix pass. The narrow edge case where a legacy/seed quote's empty `createdByUserId` gets claimed by whichever user first takes a workflow action on it was identified but not fixed — low severity, affects only pre-existing seed data, and fixing it properly requires a larger ownership-semantics decision. The printed document intentionally does not show the internal workflow status badge (matches the real reference quotation the redesign was modeled on, which shows no such badge either) — flagged by one reviewer as a possible regression but judged to be correct, intentional behavior. Verified via scripted Playwright passes: a Viewer-role user correctly can no longer see the print/duplicate/interest controls; an unsaved line-item edit survives a direct "Submit" click; a fresh print PDF export still renders correctly with no console errors. `tsc --noEmit`, `eslint .`, and `npm run build` all clean before and after.

---

## 2026-07-09 — Quotation print/PDF redesign (repeating-header document)

**Feature**: Replaced the quotation's print/PDF output with a dedicated `PrintDocument.tsx` component modeled on a real customer-facing quotation template the user provided (photos of a printed 3-page quotation from another vendor's system). The new document is a single `<table>` with a repeating `<thead>` — company header (logo/name/address/tax ID), a blue "QUOTATION" ribbon, the full "ผู้ซื้อ" (buyer) block, the "ใบเสนอราคา" meta block, and the item-table column headers all re-render automatically on every printed page via the browser's native thead-repeat behavior. Item rows now show unit price and per-unit discount (amount + %) as separate columns, with sub-details rendered as a pin-icon bullet list. Totals gained a Thai-language amount-in-words line under the grand total. A three-column signature table (ผู้เสนอราคา / ผู้อนุมัติใบเสนอราคา / ผู้ยืนยันการสั่งซื้อ) replaces the old two-column signature block, adding a blank column for the customer's own hand signature (no backing data exists for that step). Added four new per-quote fields the reference document required: buyer contact email, delivery method, delivery address, and project name — all real, controlled, auto-hidden-when-empty like the existing document fields.

**Files Added**: `src/pages/quotation/PrintDocument.tsx`

**Files Modified**: `src/lib/quotes.tsx` (`Quote` gained `contactEmail`/`deliveryMethod`/`deliveryAddress`/`project`/`remarks`; new `bahtText()` Thai-number-to-words helper; seed data updated), `src/pages/quotation/QuoteDocument.tsx` (new form fields for the four additions; entire old print-only rendering — the navy header band's print visibility, the separate "print-only" meta grid, the remarks textarea, approval history, footer disclaimer — replaced with `print:hidden` on every screen-only section plus a single `<PrintDocument />` render at the end), `src/pages/quotation/LineItemsEditor.tsx` (now screen-only, `print:hidden` at its root; removed the old inline `hidden print:table-row` per-line print rendering, now superseded by `PrintDocument`)

**Files Removed**: none

**Reason**: User supplied three photos of an actual printed quotation from another system and asked for the app's print output to look like it — a real design target rather than an abstract request, so most of the work was translating that specific document's structure (repeating per-page header, per-unit discount column, pin-icon sub-detail bullets, Thai-words total, three-signature-column block) into this codebase's existing data model and conventions.

**Notes**:
- **Bug found and fixed as a side effect**: the "หมายเหตุ / เงื่อนไข" (remarks) textarea was `defaultValue`-only — a pure uncontrolled input with no `onChange` and never included in the save payload. Any text a user typed there was silently discarded on save and reset to the company default every time the document was reopened. Since the print redesign needed a real, persistable value to render, this was fixed properly (`Quote.remarks`, controlled, saved) rather than papered over — same pattern as the other document fields fixed in the 2026-07-08 PDF-polish pass.
- Chose the "one `<table>` with a repeating `<thead>`" technique specifically because it's the only reliable, native-browser way to repeat header content across print page breaks without JavaScript pagination hacks — verified by forcing a quote to 17 line items and confirming the header/buyer/meta block and column headers repeated correctly on page 2, with totals and the signature table appearing only once at the true end (not duplicated per page).
- **Known, accepted simplifications** (documented in [MODULES/Quotation.md](./MODULES/Quotation.md) and [UI_GUIDELINES.md](./UI_GUIDELINES.md) rather than silently left as gaps): the repeating header is identical on every page (the reference document shows a fuller header on page 1 and a condensed one on continuation pages — browser print can't vary `<thead>` content by page number); "Page X/Y" numbering was not implemented (no reliable cross-browser way to read total page count from CSS in a browser print/PDF context); the reference's separate "หมายเหตุ"/"Condition"/"Payment" sections were kept as one free-text `remarks` field (already supports multi-line text, avoiding a larger data-model change); the third signature column (ผู้ยืนยันการสั่งซื้อ, customer PO confirmation) always renders blank since no such workflow step/data exists yet — matches the established "blank line, never an error" fallback pattern.
- Verified via a scripted Playwright pass: fresh install → Setup Wizard → open a seeded quote → fill the four new fields → save → confirm they persist and render correctly in a real `page.pdf()` export (read back and visually checked, not just screenshotted) → forced the same quote to 17 lines to confirm multi-page header repetition. Zero console errors throughout. `tsc --noEmit`, `eslint .`, and `npm run build` all clean before and after.

---

## 2026-07-08 — RBAC, User Management, Approval Workflow & Notification System

**Feature**: A full client-side simulation of enterprise RBAC for a single-company (not multi-tenant) internal ERP: a first-run Initial Setup Wizard, multi-user accounts with hashed passwords and Position/Role separation, a 6-role/17-permission RBAC model with a permission-gated (fully-hidden, not just disabled) sidebar, a User Management admin page, a Role Management page (Super-Admin-only, hardcoded), a 9-status quotation approval workflow with append-only approval history and role-based notifications, an enterprise-style notification bell (no badge at 0 unread, red badge with count/99+ cap otherwise, dropdown panel), personal signature-image integration into the quotation PDF, and an append-only audit log. Company settings gained bank account, VAT rate, and Terms & Conditions fields, restricted to Super Admin. Public self-service sign-up was removed (enterprise ERPs don't allow it; accounts are Setup-Wizard- or admin-created only).

**Files Added**: `src/lib/permissions.ts`, `src/lib/roles.ts`, `src/lib/users.ts`, `src/lib/session.ts`, `src/lib/notifications.ts`, `src/lib/auditLog.ts`, `src/components/NotificationBell.tsx`, `src/pages/SetupWizardPage.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`

**Files Modified**: `src/lib/storage.ts` (`Company` gained `vatRate`/`bankName`/`bankAccountName`/`bankAccountNumber`/`bankBranch`/`termsAndConditions`; removed the old singleton `UserProfile` type + `loadUser`/`saveUser`/`initials`, superseded by `users.ts`), `src/lib/quotes.tsx` (`QuoteStatus` expanded from 4 to 9 values; new `ApprovalAction`/`ApprovalHistoryEntry`/`QuotePermissions` types, `workflowTransitions` state machine, `computeQuotePermissions()`, `loadQuotes`/`saveQuotes` — quotes are now persisted, closing a long-standing gap), `src/App.tsx` (rewired around a real session/current-user model, permission-filtered sidebar, bootstrap gate, notification/audit wiring), `src/pages/SignInPage.tsx` (real credential check against the `users` list, replacing the old "any input succeeds" flow), `src/pages/SettingsPage.tsx` (profile tab now self-service with read-only employee fields + picture/signature upload; Company tab hidden entirely unless `company:manage`; real password verification), `src/pages/quotation/{QuotationPage,QuoteDocument,QuoteList}.tsx` (workflow action buttons, approval-history panel, signature rendering, ownership/permission-gated field editing)

**Files Removed**: `src/pages/SignUpPage.tsx` (public self-registration removed by design — see Reason)

**Reason**: Explicit, detailed user request to implement enterprise-grade RBAC, user management, a quotation approval workflow, and a notification system, framed around this being a single-company internal system (not a SaaS product). Scoped to a client-side simulation rather than the real Phase 2 backend migration after confirming with the user — see the AskUserQuestion exchange at the start of this session; the alternative (starting the real Next.js/Prisma backend) was explicitly declined as out of scope for this pass.

**Notes**:
- **This is a Phase 1 simulation, not real security** — see the new "Current State" section at the top of [RBAC.md](./RBAC.md). Every check is client-side and every record lives in `localStorage`; devtools can bypass any of it. Positioned as a UI/UX/workflow-correct scaffold that maps closely onto the still-not-started Phase 2 server-enforced design.
- Permission model is a flat 17-key set (`quotations:view/create/edit/delete/approve/reject/export`, `products:view/create/edit/delete/export`, `dashboard:view`, `users:manage`, `roles:manage`, `company:manage`, `auditLog:view`) rather than fully generic per-module CRUD — chosen to match the spec's literal permission list while still giving real module-level sidebar differentiation.
- `roles:manage`/`company:manage` are additionally hardcoded to the Super Admin role (not just permission-gated) so an admin can never misconfigure a custom role into unlocking them — matches the spec's explicit "Only Super Admin may..." rules.
- Two-level sequential approval (Level 1 must approve before Level 2) was **not** implemented — the provided workflow diagram only has one "Pending Approval" step; both approver roles can independently approve/reject from that state. Documented as a known simplification.
- Product Library CRUD buttons are **not** individually permission-gated in this pass — only its sidebar entry (`products:view`). Documented as a known follow-up in [TODO.md](./TODO.md).
- **Bug found and fixed during verification**: the quotation status badge/toolbar froze at its value from the moment the document view was first opened, because it was read from `useState` initialized once at mount — a workflow-driven status change (e.g. Submit → Approve) updates the `quote` prop but the component doesn't remount (same `key`), so the old state never re-derived. Fixed by making `quoteStatus` a plain value derived from the `quote` prop every render instead of local state. Caught by a scripted end-to-end Playwright pass, not by `tsc`/`eslint` (both were clean throughout — this was a runtime-only bug).
- Verified end-to-end via a scripted Playwright pass driving a real Chromium browser through the full lifecycle across 3 distinct accounts: fresh install → Setup Wizard → Super Admin creates a Sales User and an Approver Level 1 → logout/login as Sales User → sidebar/company-tab correctly hidden → create + submit a quotation → logout/login as Approver → notification badge shows unread count → approve → approval history recorded → upload a signature → signature image appears on the approved quote → logout/login as Super Admin → audit log shows Login/User Created/Quotation Submitted/Quotation Approved entries. Zero console errors throughout. `tsc --noEmit`, `eslint .`, and `npm run build` all clean.

---

## 2026-07-08 — Quotation PDF polish

**Feature**: Company logo/stamp upload (Settings → Company Info), rendered in the quotation PDF header and signature block. Quotation document fields (contact person, phone, address, tax ID, PO reference, issue/expiry dates, payment terms, salesperson) converted from hardcoded placeholder text to real, controlled, per-quote `Quote` fields. Print/PDF output now automatically hides empty fields instead of printing blank rows. Salesperson field defaults to the signed-in user's name on new quotes, and the "ผู้เสนอราคา" signature line pre-fills that name in print. Added quotation item **tags** (chip input) and a **specifications** field (distinct from notes), the latter auto-copied from `Product.specifications` when adding a line via the product picker.

**Files Added**: none

**Files Modified**: `src/lib/storage.ts` (`Company.logoDataUrl`/`stampDataUrl`), `src/lib/quotes.tsx` (`Quote` gained `contactName`/`contactPhone`/`address`/`taxId`/`poRef`/`paymentTerms`/`issueDate`/`expiryDate`; `QuoteLine` gained `specifications`/`tags`; new `QuoteDraftFields` type, `todayIso()`/`plusDaysIso()`/`paymentTermsOptions` helpers), `src/pages/SettingsPage.tsx` (new `ImageUploadField` component, wired into the Company tab), `src/pages/quotation/QuoteDocument.tsx` (meta fields now controlled + a parallel print-only auto-hide-if-empty rendering via a new `PrintRow` helper; logo/stamp rendering; `user: UserProfile` prop), `src/pages/quotation/QuotationPage.tsx` (`user` prop threaded through, `handleSave` simplified around `QuoteDraftFields`), `src/pages/quotation/LineItemsEditor.tsx` (new `SpecificationsEditor`/`TagsEditor` components in the line-item expand panel, plus print rendering for both; `addLineFromProduct` now copies `specifications`), `src/App.tsx` (passes `user` into `QuotationPage`)

**Files Removed**: none

**Reason**: User requested Quotation PDF polish as the first slice of a larger "master prompt" continued-development request (see the [SESSION_LOG.md](./SESSION_LOG.md) 2026-07-08 entries) — chosen over Lead/Customer module and Company Settings expansion as the fastest, most self-contained improvement to the document actually sent to customers.

**Notes**: Images are stored as size-capped (1MB) base64 data URLs inside the existing `Company` `localStorage` entry — a deliberate interim choice (no object storage exists yet) called out in [PROJECT_STATUS.md](./PROJECT_STATUS.md) Technical Debt. Verified end-to-end via a scripted Playwright pass: logo/stamp upload → appear correctly in `emulateMedia('print')` output; a fresh quote with untouched contact fields correctly omits those rows in print while still showing populated ones (ID, dates, salesperson, payment terms); tags and specifications render as chips/italic text in both screen and print. Zero console errors; `tsc`/`eslint`/`build` all clean.

---

## 2026-07-08 — Reorganize pasted master-prompt requirements into TODO.md

**Feature**: User appended a large standing "continue building the ERP" charter directly into `docs/CLAUDE.md`. Extracted its actionable requirements into properly categorized `TODO.md` sections (PDF/Quotation polish, User Profile, Company Settings expansion, Dashboard rework, other) instead of leaving raw instruction text embedded in the current-state summary file.

**Files Added**: none

**Files Modified**: `docs/CLAUDE.md` (raw pasted block replaced with a short pointer to `TODO.md`), `docs/TODO.md` (new detailed items added)

**Files Removed**: none

**Reason**: `CLAUDE.md`'s own stated purpose (both in the user's original spec and its own header) is to stay concise and current — a raw instruction dump would go stale the moment any listed feature shipped, and duplicates content better suited to `TODO.md`/`PROJECT_STATUS.md`.

**Notes**: Nothing from the pasted content was dropped — every requirement (PDF logo/stamp, hide-empty-fields, no-placeholder-text, item tags/specifications, nested-sub-details question, user profile picture/signature upload, company bank account/VAT/T&C settings, dashboard KPI rework, sidebar "Coming Soon" policy, notifications, audit logs) is now a tracked `TODO.md` item.

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
