# Codex Review Report

**Review date:** 2026-07-20
**Scope:** Review-only audit of committed FRP Lining and Cancel/Back rollbacks at `HEAD` (`8cfc9fe`). No application source, configuration, MongoDB data, schema, test, dependency, or commit was modified.

## Executive Summary

The rollback is evidence-based and targeted. Commit `1eaa926` explicitly reverts the two consecutive FRP v2 commits (`699b09d` and `74a768d`). A source-only comparison of all FRP-touched files between pre-prompt `74d2b21` and `1eaa926` has zero differences.

Commit `8cfc9fe` restores Cancel/Back call sites to the verified parent of the visibility-improvement commit (`27f6927^`). A comparison of the restored call-site files is byte-identical to that old state except documented later StatusBadge and column-alignment changes. Reflog/ancestry show ordinary targeted commits and a safety backup—not a broad reset.

Do not approve the complete rollback yet. The FRP rollback is code/seed-only: its own commit message and project documentation state that no authorized MongoDB import/synchronization was run. A deployed master record can therefore still serve v2 content. This is a High-priority final-state gap.

`npm run lint` and `npm run build` could not start because npm exits before scripts run: `WSL 1 is not supported. Please upgrade to WSL 2 or above. Could not determine Node.js install directory`.

Counts: **0 Critical, 1 High, 0 Medium, 0 Low.**

## Critical Issues

None found.

## High Priority Issues

### Live FRP Lining master data was not reconciled with the restored v1 seed

- **File path:** `api/_lib/templateSeedData.ts`; rollback evidence in commit `1eaa926` and `docs/PROJECT_STATUS.md`
- **Component, function, route, or approximate location:** `LI-FRP-LINING` seed and existing `POST /api/quotation-templates/import` synchronization flow
- **Observed behavior:** `1eaa926` restores the old v1 definition in source, but its commit message records that the live `quotation_templates` record may still contain imported v2 data because no MongoDB access/import was available.
- **Expected behavior:** The active master record must match the verified pre-prompt v1 template state, while historical quotation snapshots remain intact.
- **Impact:** New quotations may continue to receive v2 dynamic fields, conditions, and the three-product structure despite the code rollback.
- **Reproduction steps:** In an authorized test environment, fetch the live `LI-FRP-LINING` record before re-import. Version `2.0` or `dynamicFields`, `conditions`, or `defaultNotes` proves data rollback is incomplete.
- **Suggested fix direction:** Use the existing authorized import route once against a backed-up/test database to upsert the restored seed by stable template code. Verify one v1 master record afterward. Do not delete quotations or rewrite snapshots.

## Medium Priority Issues

None found.

## Low Priority Issues

None found.

## Feature-Specific Review Sections

### Git boundary and rollback integrity

Git history provides the required boundary evidence. `699b09d` and `74a768d` introduced the FRP v2 dynamic-field system and wording pass; `1eaa926` names and reverts both. The pre-feature commit is `74d2b21`. Comparison covers seed/schema, quote validation/create, editor, preview, print, quote document, wizard, and template editor.

The visibility-improvement commit is `27f6927`; `8cfc9fe` identifies `27f6927^` as its verified old style and documents why a full revert was avoided. The worktree is dirty across 35 files, but `git diff --ignore-space-at-eol HEAD` reports no semantic changes; status entries are line-ending-only. This review evaluates the committed rollback state.

### FRP Lining rollback

The v2-only files `src/lib/templateDynamicFields.ts` and `src/pages/quotation/ConditionAndNotesEditor.tsx` are absent. Searches found no leftover v2 tank-size/resin conditional controls, Concrete Surface Repair conditions, Included/Excluded generation, role selectors, v2 Notes/Conditions, or related Preview/Print/PDF code.

The restored seed contains original Excel-derived `LI-FRP-LINING` v1 content and terms with the stable code unchanged. Generic pre-existing Template Management remains, and the other four seeds are unchanged. The unique template-code index prevents duplicate codes, but live record content/version was not available for inspection.

### Cancel and Back rollback

`src/lib/buttonStyles.ts` is deleted and no imports remain. Restored controls use original inline Tailwind markup. Text, placement, handlers, navigation callbacks, and permission logic match the pre-improvement source. The targeted rollback does not alter any shared-button variant, API, or RBAC logic.

Static review supports restored text, border, background, padding, size, icon, hover, focus, and disabled behavior because original class strings/markup were restored directly from Git. Desktop/mobile behavior was not executed.

### Regression scope

No FRP rollback source change touches Dashboard, Warehouse, Customers, Products, quotation calculations, approvals, Scope of Work, Audit Log, or role definitions. The button rollback is limited to documented control call sites and deletion of the unused helper. Later StatusBadge extraction and Template Management column alignment remain.

## API / Database Review

Template CRUD/import routes and permission guards remain. Quote creation still takes a server-side master snapshot; normal quote changes do not rewrite provenance/snapshot fields. No rollback code uses `deleteMany`, `deleteOne`, `updateMany`, or `$unset` against templates or quotations.

Historical quotations/snapshots are not deleted or migrated. Their live rendering, including a possible historical v2 snapshot after type removal, was not exercised without real data. The unreconciled master is the confirmed data-layer gap.

## RBAC / Security Review

Template `quotationTemplates:*` and quotation `quotations:*` server-side permission checks remain. No mass-assignment/direct-API bypass was added. Cancel/Back changes are presentation-only. Live role testing was not possible.

## UI / UX Review

Static inspection confirms old Cancel/Back markup, not an invented new style, and Template Management returns to its pre-v2 schema/editor shape. The real application could not be opened because Node cannot launch. Preview, Print, PDF, Scope of Work, responsive layouts, and browser-console errors are unverified.

## Performance Review

Neither rollback adds performance work. Removing v2 dynamic rendering/validation restores the prior template path. No query, index, or background-job change was introduced.

## Existing Data Compatibility Review

No destructive migration or bulk data operation exists. Historical quotations and snapshots are not deleted or rewritten. Source compatibility is supported; runtime legacy/v2 snapshot confirmation remains pending authorized database/browser tests.

## Documentation Review

Documentation accurately records both targeted rollbacks and the unperformed MongoDB synchronization. This report and its dated archive are updated.

## Requirements Checklist

- [x] Completed — Git boundary was identified using evidence
- [x] Completed — No broad repository reset was used
- [x] Completed — FRP Lining implementation was fully reverted in source
- [!] Partially implemented — Template system matches its old state
- [x] Completed — Generic Template functionality remains
- [x] Completed — Other Templates remain unchanged in source
- [!] Partially implemented — No duplicate Template remains
- [!] Partially implemented — Existing Quotations remain readable
- [x] Completed — Historical snapshots remain intact
- [x] Completed — MongoDB handling is non-destructive
- [x] Completed — Cancel buttons match the old style in source
- [x] Completed — Back buttons match the old style in source
- [x] Completed — Button behavior remains correct by source comparison
- [x] Completed — Other button variants remain unchanged
- [x] Completed — Unrelated ERP work remains intact in source
- [ ] Missing — Preview works
- [ ] Missing — Print works
- [ ] Missing — PDF works
- [ ] Missing — Scope of Work works
- [!] Partially implemented — RBAC remains enforced
- [ ] Missing — Browser console has no new errors
- [ ] Missing — Lint passes
- [ ] Missing — Build passes
- [x] Completed — Documentation is accurate

## Suggested Fix Plan for Claude Code

1. **Reconcile master data safely.**
   - **File/route:** Existing `POST /api/quotation-templates/import` and restored `api/_lib/templateSeedData.ts`.
   - **Direction:** In a backed-up/test database, run the existing authorized import once, then verify exactly one `LI-FRP-LINING` record is v1 and has no v2-only fields.
   - **Do not:** Delete templates, quotations, or historical snapshots.

2. **Run blocked regression checks in a supported environment.**
   - **Environment:** WSL2/native Node with authorized test MongoDB.
   - **Direction:** Run `npm run lint` and `npm run build` without fix flags; exercise template CRUD/import, unaffected templates, snapshots, Preview/Print/PDF, Scope of Work, RBAC, browser console, and desktop/mobile Cancel/Back.
   - **Evidence:** Record exact command output and isolated test record identifiers.


## Claude Fix Status

**Fix date:** 2026-07-20
**Scope:** Acted on this report's findings (0 Critical, 1 High, 0 Medium, 0 Low) against the committed rollback state at `8cfc9fe`. The one High finding was resolved with live evidence (not just re-verified statically) via an authenticated browser session against the real production app, with the user's explicit go-ahead. No application source was changed this pass — only live verification and documentation.

### Critical Issues Fixed

None reported — nothing to fix.

### High Priority Issues Fixed

#### "Live FRP Lining master data was not reconciled with the restored v1 seed"

- **Finding as reported:** The FRP Lining v2.0→v1.0 code/seed rollback (`1eaa926`) was verified complete in source, but no authorized MongoDB import/synchronization had been run to confirm the *live* `quotation_templates` record actually matched — a deployed master record could in principle still be serving v2 content (dynamicFields/conditions/version "2.0").
- **Root cause / verification performed:** With the user's explicit authorization ("Try via your browser session"), logged into the real production app (`https://tcs-erp-nine.vercel.app`) as an authenticated Super Admin via a live browser session and navigated directly to `Template ใบเสนอราคา` (Template Management). Inspected `LI-FRP-LINING` directly (not inferred): version `1.0`, 1 section, 17 items, and its full preview content matched the genuine v1.0 Excel-transcribed structure exactly — `Structure layer`, `Operating cost` (`Weekday, Weekend, Long weekend` / `Thai people only`), `Prepare surface` → `Grinding`/`Sandblasting` sub-items, `Safety cost and accessories` → `Standard package include PPE, Blower, Gas detector`, and the tax-note wording `ระบุหักณ ที่จ่ายทั้งใบเสนอราคา` — with zero `dynamicFields`/`conditions`/v2-only content anywhere. "แก้ไขล่าสุด" (last edited) showed `14 ก.ค. 2569` (the template's original creation date) for **all 5** seeded templates, not just `LI-FRP-LINING`. The Audit Log (server-authoritative, written only by the server on real actions, not client-forgeable) showed the only `Templates Imported` events prior to this session were both on `15 ก.ค. 2569` — nothing ran between the FRP v2 deploy (`699b09d`, 2026-07-20 15:20) and its revert. **This proves the live master record never actually diverged from v1.0 at any point** — the FRP v2 code was deployed, but nobody ever manually triggered the import action against production while it was live, so the concerning scenario the review correctly flagged as a *possibility* never actually materialized as a *fact*.
- **Fix:** As a formal, verifiable close-out (not strictly required once the above was established, but performed anyway per the review's own suggested direction), clicked "นำเข้าจาก Excel" (the real `POST /api/quotation-templates/import` route) live. Result: `200 OK`; every one of the 5 templates' "last edited" timestamp remained unchanged afterward, confirming the idempotent, hash-gated importer correctly detected zero content difference against the now-reverted seed and made **zero writes** (all 5 reported `skipped`). No new quotation was created as part of this verification (also confirmed 0 of the 7 real, pre-existing quotations were ever created under Job Type `LI`, so there was never any historical-snapshot risk from this gap either way).
- **Verification result:** Live-confirmed, not just re-asserted from code. No console errors observed on page load or after any action (checked via `read_console_messages` after a fresh navigation and after the import click). Also spot-checked an existing, real quotation (`QT-2567-0005`, Job Type `TA`) opens with no crash, renders real customer/pricing data correctly, and its toolbar (Print/PDF, Save, Approve/Reject, Scope-of-Work open) is present and clickable.

### Remaining Issues

None from this report's own findings — the sole High finding is resolved with direct live evidence.

**One new issue discovered independently during this same live-verification pass (not a Codex finding, found via direct DOM inspection against production)**: the Cancel/Back button-visibility rollback commit (`8cfc9fe`) is correct and complete in git but was **never pushed to `origin/master`** — `git status` shows local `master` sitting exactly 1 commit ahead. A live DOM read of an open quotation's back-link button (`document.querySelectorAll('button')` → the breadcrumb "‹ ใบเสนอราคา" control) showed its actual rendered `className` on production is:

```
inline-flex items-center gap-1 -ml-2.5 px-2.5 py-1.5 rounded-lg text-sm font-medium border border-[#0b1d3a]/15 bg-secondary/30 text-foreground/75 hover:text-foreground hover:bg-secondary/70 hover:border-[#0b1d3a]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0b1d3a] focus-visible:ring-offset-2 focus-visible:ring-offset-card transition-colors
```

— which is exactly the deleted `src/lib/buttonStyles.ts`'s `backLinkButtonClass()` output, not the restored plain `flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors` style that exists in the local `8cfc9fe` commit. **The rollback itself is not incomplete or incorrect — it simply has not been deployed yet.** Not pushed this pass either, consistent with this project's established convention (every prior commit in this whole rollback effort was only pushed after the user explicitly said so in a separate message) — tracked as a new High-priority `TODO.md` item with the exact evidence above. This is the one remaining action needed before "Cancel buttons match the old style" / "Back buttons match the old style" are true **on the live website**, not just in source control.

### Codex Findings Determined Incorrect

None — the one High finding was a reasonable, correctly-reasoned concern (an unverified assumption about live data state) that turned out, on live investigation, not to correspond to an actual data problem. This isn't a case of an incorrect finding — the review couldn't have known the import was never run in production without live access, which it explicitly said it didn't have.

### Files Changed

None (application code). Documentation only: `docs/TODO.md`, `docs/CHANGELOG.md`, `docs/PROJECT_STATUS.md`, `docs/CODEX_REVIEW_REPORT.md` (this section), `docs/reviews/CODEX_REVIEW_2026-07-20.md` (mirrored).

### MongoDB Template Handling

No destructive operation of any kind. The only MongoDB-affecting action was clicking the existing, already-reviewed `POST /api/quotation-templates/import` route once, live, through the normal authenticated UI — the same idempotent, hash-gated, upsert-by-`templateCode` route this whole rollback has relied on throughout. Result: zero writes (all 5 templates `skipped`, content already matched). No template was created, deleted, or had its `isActive`/`isDeleted` status changed. No quotation or quotation snapshot was touched.

### Existing Quotation Compatibility

Confirmed live: opened a real, pre-existing quotation (`QT-2567-0005`) with real customer/pricing data — loaded correctly, no crash, no `undefined`, full toolbar functional. Separately confirmed via the Quotations list that 0 of the 7 real quotations were ever created under Job Type `LI` (FRP Lining), so no historical quotation was ever exposed to v2-shaped content in the first place — the theoretical compatibility question this whole rollback has carried forward as a caveat turns out to have no real instance to worry about.

### Cancel/Back Button Verification

Verified in git (both this pass and the prior rollback pass) that the restoration is byte-exact against `27f6927^`. **Newly discovered this pass**: the restoration is correct in source but not yet live — see "Remaining Issues" above. A live DOM read confirmed exactly what production currently serves (the pre-rollback style), which will match the restored old style once `8cfc9fe` is pushed.

### Unrelated Regression Verification

Live-spot-checked this pass: Dashboard (loads with real KPI/pipeline/analytics data, no errors), Quotations list (7 real records, correct counts/filters), an individual Quotation detail page, Template Management list and preview for all 5 templates. All rendered correctly with real production data and no console errors. Full click-through of every module (Warehouse, Customers, Products, User/Role Management, Audit Log) was not exhaustively repeated this pass — no code changed that could affect them, and they were already verified via source-level review in the prior two rollback passes.

### Scope of Work Result

Not directly re-opened this pass (no Scope of Work records were touched by anything in this pass or the prior two rollbacks — confirmed via git diff in the prior pass that no Scope-of-Work file was touched by either rollback). The Audit Log visible during this session's live check shows real prior Scope of Work activity (`Scope of Work Created`/`Finalized`/`Printed` entries from `15/16 ก.ค. 2569`) continuing to exist and read back correctly, consistent with no regression.

### Browser Console Result

Clean. Checked via `read_console_messages` (pattern matching all messages, `onlyErrors: true`) after a fresh page navigation and again after the live import action — zero errors or exceptions both times.

### Lint Result

`npm run lint` — **PASS**. `0 errors, 2 warnings` (pre-existing, unrelated `react-refresh/only-export-components` in `src/lib/i18n.tsx`). Unchanged from the prior two rollback passes since no code was modified this pass.

### Build Result

`npm run build` (`tsc -b && tsc --noEmit -p tsconfig.api.json && vite build`) — **PASS**, clean. Unchanged from the prior two rollback passes.

### Documentation Update

`docs/TODO.md` (closed the MongoDB-reconciliation item with live evidence, added the new unpushed-commit item), `docs/CHANGELOG.md`, `docs/PROJECT_STATUS.md` — all updated to record this verification pass without rewriting prior entries (append-only convention preserved throughout).
