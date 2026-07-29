---
target: Approve button confirmation (ApprovalDashboard.tsx)
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 1
timestamp: 2026-07-29T09-41-15Z
slug: src-pages-dashboard-approvaldashboard-tsx
---
Method: dual-agent (A: aee543529324e8d16 · B: a79d2d99e827ab162)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Toast confirms *something* happened, but not what — no ID/client named, so a wrong-row approval is invisible in the feedback |
| 2 | Match System / Real World | 3 | Clear Thai terminology (อนุมัติ/ปฏิเสธ), no jargon |
| 3 | User Control and Freedom | 1 | No undo, no cancel-after-click; recovery requires leaving the widget for a different screen/permission/terminal status |
| 4 | Consistency and Standards | 1 | Inconsistent with this app's *own* `QuoteDocument.tsx`, which already confirms this identical action |
| 5 | Error Prevention | 1 | Single click commits an irreversible, audit-logged workflow transition |
| 6 | Recognition Rather Than Recall | 3 | Icon + text label together, no hidden menus |
| 7 | Flexibility and Efficiency | 2 | No keyboard/bulk actions, but the single-click itself is already fast |
| 8 | Aesthetic and Minimalist Design | 3 | Clean tile/table layout; color semantics map correctly onto existing tokens |
| 9 | Error Recovery | 1 | No recovery path reachable from this widget once approved |
| 10 | Help and Documentation | 2 | Dashboard has a general tour; nothing specific warns this action is effectively irreversible |
| **Total** | | **19/40** | **Poor** |

## Design Specificity Verdict

**LLM assessment (Assessment A)**: Generic and interchangeable — worse than neutral, because it's inconsistent with a *more* specific pattern this exact product already built for this exact action. `QuoteDocument.tsx`, the app's primary quotation editor, routes every workflow action — including Approve — through a shared confirm modal (`guardedWorkflowAction()` → `openAction()`, showing quote ID + client name before committing). `ApprovalDashboard.tsx`'s `PendingRow.approve()` skips this entirely: `onClick={approve}` fires `performWorkflowAction()` directly. This isn't "a confirm dialog is missing" in the abstract — it's this specific app quietly diverging from a pattern it already built and uses elsewhere for the identical server-side transition (`รออนุมัติ → อนุมัติแล้ว` in `api/_lib/quoteWorkflow.ts`).

Structurally, this transition has no reverse edge in the workflow state machine — the only way out of `อนุมัติแล้ว` is forward (`sent_to_customer`) or to a different terminal state (`ยกเลิก`/Cancelled, under a separate permission, not reachable from this widget). A misclick here is not just unconfirmed; it's effectively irreversible from within the widget that caused it.

**Deterministic scan (Assessment B)**: `detect.mjs` against `ApprovalDashboard.tsx` returned 3 advisory findings, all `design-system-font-size` (10px off DESIGN.md's type ramp):
- **Line 117** (the KPI-tile caption under Pending/Approved/Rejected/Avg-time): **real, actionable** — DESIGN.md's own carve-out reserves 10px only for *uppercase, tracking-wide* "section eyebrows"; this caption is plain sentence-case text and doesn't qualify. This is a genuine miss from an earlier session pass, which had waved this line off as matching the eyebrow convention without checking the uppercase/tracking-wide qualifier — the independent detector pass caught what a single prior read didn't.
- **Lines 130, 133** (table header cells, uppercase + tracking-wide): **false positives** — exactly the documented exception.

The detector raised nothing about the Approve/Reject interaction itself — it's a static typography scan, not a behavioral or accessibility audit, so it has no opinion on the confirmation question this critique is actually about. The two assessments are evaluating different layers and don't conflict.

**Visual overlays**: Not available. Assessment B attempted a real browser check (new tab, `http://localhost:5173`) and hit this sandbox's known limitation — no `vercel dev`/MongoDB behind the plain Vite dev server, so the app renders its own "ไม่สามารถเชื่อมต่อระบบได้" (connection failed) guard screen before the Dashboard or Approval widget can render. `/api/auth/session` returned HTTP 200 both times but with a payload the client didn't accept as a valid session — consistent with no working backend, not a bug in this component. No console errors were logged. Assessment B did not fabricate a live appearance and correctly reported this as a fallback signal.

## Overall Impression

The Approve button is one click away from committing a real, audit-logged, effectively-irreversible business decision, and it currently has *less* friction than the Reject button sitting right next to it in the same row. The app already knows how to do this correctly — its own quotation editor confirms this exact transition — so the fix here is bringing one widget in line with a pattern that already exists, not inventing new UX.

## What's Working

- **Reject's friction is well-designed**: required, validated comment, inline error text, explicit Confirm/Cancel — just applied to only half of a symmetric decision.
- **Color semantics are standards-compliant**: green/red map correctly onto the app's existing `chart-green`/`danger-red` tokens.
- **Busy-state handling**: `disabled={busy}` prevents double-submission, and inline error text on failure keeps the user in context instead of losing the row.

## Priority Issues

**[P0] Approve fires an irreversible, audit-logged workflow transition with zero confirmation, while this app's own primary editor already confirms the identical action.**
- **Why it matters**: A misclick in a dense, multi-row table commits a real business decision with no checkpoint and no way back from within this widget.
- **Fix**: Route Approve through the same confirm-modal pattern `QuoteDocument.tsx` already uses for this transition (quote ID + client shown before committing) — reuse `ConfirmDialog` rather than building a new pattern.
- **Suggested command**: `/impeccable harden`

**[P1] List reflow after every action, combined with zero Approve friction, creates a real misclick-cascade risk when working through several pending approvals quickly.**
- **Why it matters**: `onDone()` → `onRefresh()` removes the approved row and shifts every row below it up one position. A user clicking down the list can land on the wrong row's Approve button before consciously re-reading it.
- **Fix**: Even a lightweight confirm step (not necessarily a full modal) breaks this "click, list shifts, click again" chain.
- **Suggested command**: `/impeccable harden`

**[P2] Success feedback doesn't name the document.**
- **Why it matters**: The toast ("อนุมัติใบเสนอราคาแล้ว"/"Quotation approved") carries no ID or client name, so a wrong-row approval is invisible in the one piece of after-the-fact feedback the user gets.
- **Fix**: Interpolate `item.id`/`item.client` into the toast message.
- **Suggested command**: `/impeccable clarify`

**[P2] No recovery path is reachable from this widget once approved.**
- **Why it matters**: Undoing requires leaving the Dashboard, opening the quote elsewhere, and using Cancel — a different terminal status, gated by a different permission the same user may not hold.
- **Fix**: At minimum make this limitation legible in the moment (don't let the UI imply Approve is casually reversible); a time-limited "Undo" affordance on the toast would be a stronger fix if the workflow can support it.
- **Suggested command**: `/impeccable harden`

**[P3] A stat-tile caption (`ApprovalDashboard.tsx:117`) sits at 10px without the uppercase/tracking-wide styling DESIGN.md reserves that size for.**
- **Why it matters**: Minor, unrelated to the Approve question, but a genuine drift the detector caught that an earlier pass this session incorrectly waved off.
- **Fix**: Normalize to `text-xs` (12px), matching the sibling caption pattern in `ExecutiveSummaryCards.tsx`.
- **Suggested command**: `/impeccable typeset`

## Persona Red Flags

**Jordan (confused first-timer)**: Nothing in the row signals Approve is a permanent, audit-logged transition rather than a soft toggle — there's no equivalent of the editor's "for quote {id}, {client}" confirmation line. If Jordan clicks the wrong row in a table of similarly-formatted rows, there's no checkpoint to catch it, and the toast that follows doesn't even say which quote was approved — Jordan can't self-verify from the feedback alone.

**Riley (deliberate stress tester / fast clicker)**: Working down a list of pending approvals, each Approve click triggers a refetch that removes the row and shifts everything below up by one. If Riley's next click lands at the same screen coordinate before consciously re-reading the now-different row, they approve a quotation they never intended to touch — with nothing anywhere in the flow to intercept it. This is a concrete list-reflow misclick, not a generic "add a dialog" complaint.

## Minor Observations

- Approve/Reject sit adjacent, same size/shape, differing only by color+icon, roughly 6px apart (`gap-1.5`) — increases fast-scan misclick odds independent of the confirmation question. Consider more separation or asymmetric emphasis.
- The two table-header 10px findings from the detector (lines 130, 133) are false positives against DESIGN.md's own documented exception — no action needed.

## Questions to Consider

- This app already solved this exact problem once (`QuoteDocument.tsx`'s confirm modal covers Approve too) — was skipping it here a deliberate "keep the triage surface fast" decision, or did this widget just get built without checking the editor's own convention? If deliberate, that speed-vs-safety tradeoff deserves to be a named, explicit decision rather than a silent gap.
- If the real goal is fast batch-triage for someone with many pending approvals a day, is a pre-click confirmation modal even the best shape — or would a post-click, time-limited "Undo" toast fit this list-based, high-volume widget better than borrowing the single-document editor's synchronous modal wholesale?
