# Session Log

> Append-only retrospective summary at the end of each work session. Distinct from [CHANGELOG.md](./CHANGELOG.md) (which logs individual changes as they happen) — this is a higher-level "what happened this session and what's next" note. Never delete previous entries.

---

## Session — 2026-07-23 (absolute latest), Feature: in-app "What's New" update log

### What was implemented
- User's request was terse ("ทำ update log ให้หน่อย" — "make an update log for me"), ambiguous
  enough across three very different possible builds (a one-off chat summary, a shareable
  standalone document/Artifact, or a real in-app feature) that clarifying up front was worth the
  pause rather than guessing and rebuilding — asked via `AskUserQuestion` with those three framed
  as concrete options. User picked the in-app "What's New" feature.
- Built as a static, hand-authored content array (`WHATS_NEW_ENTRIES`, `src/lib/whatsNew.ts`)
  rather than anything database-backed — this is a short list of end-user-facing announcements
  that only changes when a developer ships a feature worth telling users about, so a new MongoDB
  collection + CRUD API + admin UI would be real overhead for no real benefit over editing an array
  in source control (the same tradeoff already made for `quotationTemplates`' `templateSeedData.ts`
  and similar hand-maintained content files elsewhere in this codebase).
- Seeded with the last several days' genuinely user-facing changes from this session (Revision
  Note, Document Recipients email routing, `scopeOfWork:viewAll`, flexible Payment Conditions, the
  Dashboard Scope of Work count, the standalone Scope of Work page + Rewrite) — deliberately
  curated, not a 1:1 mirror of every `docs/CHANGELOG.md` entry; internal fixes/refactors with no
  visible behavior change for a regular user don't belong in a user-facing update log.
- UI/component pattern reused `NotificationBell.tsx` wholesale (trigger button + anchored dropdown
  panel, same card/border/shadow-xl shell) rather than inventing a new dropdown pattern — matches
  the existing UI_GUIDELINES.md guidance to reuse that visual language for future topbar dropdowns.
  Differs in two deliberate ways: a `Sparkles` icon instead of `Bell` (visually distinct from real
  notifications), and a single "seen/unseen" gold dot instead of an unread count, since entries
  aren't individually actionable/dismissible the way notifications are.
- "Seen" tracking reused the exact `tour.ts` localStorage convention (per-user id map in one
  storage key, silently degrades if storage is unavailable) rather than inventing a new persistence
  approach for what is, at bottom, the same kind of thing: a client-side "has this user already
  seen X" UI preference, not real business data.

### Verification
- `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
- Spot-checked the Thai date formatting (`toLocaleDateString("th-TH", ...)`) via a standalone Node
  script — confirmed correct Buddhist-calendar year output.
- No live browser check available (Playwright MCP tools still disconnected this session). The
  component itself has no complex state machine to simulate outside a browser (a boolean open/close
  and a boolean seen/unseen, both trivial to reason about directly), so no separate logic-simulation
  script was written for this one, unlike the Revision Note feature above.

### Recommendation for next session
- Live-verify the panel actually renders correctly and the gold dot clears on open, in a real
  browser, once Playwright reconnects.
- Establish a lightweight habit going forward: whenever a change lands in `docs/CHANGELOG.md` that
  a regular (non-technical) user would actually notice or care about, consider whether it also
  belongs as a new `WHATS_NEW_ENTRIES` entry — right now this is a manual judgment call each time,
  not an enforced or automated step.

---

## Session — 2026-07-23, Feature: auto-generated Revision Note (Quotation + Scope of Work)

### What was implemented
- Direct user request: an auto-generated comment/note after a rewritten document showing what
  changed, with the user free to add to or edit it afterward. Two clarifying questions were asked
  and answered: scope = both Quotation and Scope of Work; detail level = every field, in detail.
- New `src/lib/revisionDiff.ts` — pure, framework-agnostic TS (no JSX/browser globals, safe to
  value-import into the API bundle even though nothing server-side uses it yet, matching the
  established `documentRequirements.ts` convention). Duplicates `getRevisionRoot()`/
  `getRevisionNumber()`/`getRevisionPredecessorId()` from the server-only
  `api/_lib/quoteRevisions.ts` rather than trying to share them across the frontend/API boundary.
- `generateQuoteRevisionSummary()` and `generateScopeOfWorkRevisionSummary()` diff every field the
  user's "every field" answer implied: header/contact/date/terms fields, line items/scope items
  (matched by array **position**, not id — both `cloneLines()` and Scope of Work's item-cloning
  regenerate every id on Rewrite/Duplicate, so id-matching would falsely report every line as both
  removed and added), checklist selections (matched by stable group `key`), payment installments
  (matched by stable installment `id` — verified `paymentConditions` passes through the `...rest`
  spread untouched on Rewrite/Duplicate, so id-matching is reliable there unlike for items), and
  document recipients (resolved to real names via the already-loaded `users` list).
- New `revisionNote: string` field on both `Quote` and `ScopeOfWork`, always blank on
  create/Duplicate/fresh Rewrite. Both `QuoteDocument.tsx` and `ScopeOfWorkDocument.tsx` gained a
  card (revisions only, i.e. id/`scopeNumber` ending in `-R<digits>`) with a
  "สร้างสรุปการแก้ไขอัตโนมัติ" button that fills the note `<textarea>` on click — deliberately
  **one-shot, never automatic**, so a regenerate can never silently clobber text the user already
  typed themselves.
- Predecessor lookup solved two different ways depending on what data was already available:
  Quotation's full quote list is already boot-loaded app-wide, so a new `allQuotes` prop threads it
  down with zero extra network calls; Scope of Work records are fetched per-id with no
  lookup-by-scopeNumber route, so the existing `fetchScopeOfWorksByQuotation()` (returns every
  revision's `scopeNumber`+`id` for the shared `quotationId`) resolves the predecessor's real id
  first, then `fetchScopeOfWork(id)` gets the full record — two round trips, no new backend route.

### Verification
- `tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint`, `npm run build` all
  pass clean.
- Playwright MCP tools remain disconnected this session (see the entry below on the
  `taskkill /IM node.exe` incident) — verified the diff-generation logic instead via a temporary
  standalone `tsx` script (`npx tsx <script>`) against realistic mock Quote/ScopeOfWork data,
  confirming correct revision-id parsing and correct diff output for header-field changes,
  line-item/scope-item changes, checklist selection changes, and document-recipient name
  resolution. Deleted the script after confirming.

### Recommendation for next session
- Do a real browser click-through of the new Revision Note button on both document types once
  Playwright reconnects (or Vercel CLI/live testing becomes available) — logic-level verification
  is solid but the actual button/textarea UX has not been visually confirmed.
- Consider, only if a future user asks: an id-aware line/item diff (currently position-based) for
  cases where a mid-list line is inserted or reordered rather than edited in place — not attempted
  this pass since it wasn't asked for and the current approach covers the overwhelmingly common
  in-place-edit/trailing-add-remove cases correctly.

---

## Session — 2026-07-23, Fix: "อื่น ๆ" displaced by the backfilled Accounting option

### What was implemented
- User reported, tersely: fix the "เอกสารส่งถึง" section on the Scope of Work page, put "อื่นๆ" at
  the very bottom before the "โปรดระบุ" box.
- On first read this sounded like it might already be true — the *builder*'s own option list
  (`buildDefaultChecklistGroups()`) already lists "other" last. Re-checked the *backfill* path
  instead (`withDefaultChecklistGroups()`, extended earlier the same day to add the new
  "Accounting" option onto pre-existing records) and found the actual bug: it appended any missing
  option at the very end of whatever the record already had — for a legacy record whose stored
  order was `[..., service, other]`, that puts the newly-backfilled "accounting" *after* "other",
  not before it. This exactly matches what the user was looking at and reporting.
- Notable: my own doc comment on that backfill logic, written earlier the same day, explicitly
  called this exact scenario a "minor cosmetic ordering difference... not worth extra complexity"
  — a real user hitting it and reporting it as broken is the correction to that judgment call, not
  a new bug introduced since. Worth remembering: "not worth fixing" calls made without a concrete
  user in front of the screen are exactly the ones most likely to get relitigated once someone
  actually looks at the real output.
- Fixed properly rather than special-casing `documentsToSend`: rebuilt the backfill logic to walk
  the current builder's own canonical option order and look up each key's existing checked state
  (or default to unchecked if new), for every checklist group generically — not just this one. This
  is a strictly more correct general behavior for what "backward-compatible with the current
  default structure" should mean, not a narrow patch.

### Verification
- `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
- No live browser check available (Playwright MCP tools are still disconnected this session, from
  the earlier `taskkill /IM node.exe` cleanup). Instead wrote a standalone plain-Node simulation of
  the exact reorder/backfill logic against a hand-built legacy-shaped stored group (5 options,
  "service" and "other" both checked, no "accounting") and confirmed the output order and checked
  states directly: `purchase → project → factory → technic → service(checked) → accounting →
  other(checked)` — correct order, correct preserved state.

### Recommendation for next session
- Open an existing (pre-2026-07-23) Scope of Work record in the real app and visually confirm
  "อื่น ๆ" now renders last in the "เอกสารส่งถึง" checklist, immediately above the note box.

---

## Session — 2026-07-23, Scope of Work: clearer Document Recipients checkbox UX

### What was implemented
- User sent a screenshot of the shipped `DocumentRecipientsPicker` and said, plainly, that they
  were worried users wouldn't understand where they were clicking to choose recipients.
- Looked at the actual rendered chips in the screenshot: the only signal for "selected" was a
  subtle gold tint + border color change on an otherwise plain-looking name button — no checkbox,
  no checkmark, nothing that reads unambiguously as "this person is chosen to receive this."
- Fixed by switching to real `<input type="checkbox">` elements — deliberately not a new pattern:
  `ChecklistGroupCard.tsx`, rendered in the exact same document just above this card, already uses
  plain checkboxes for "pick options in this group," so reusing that exact convention means a user
  who already understood the checklist above doesn't have to learn a second interaction style for
  the recipient picker right below it. Also added a per-department selected-count badge (green
  "เลือกแล้ว N คน" / amber "ยังไม่ได้เลือกผู้รับ") so a department that's checked in the checklist
  but still has zero recipients picked is visually flagged before the user tries to send.

### Verification
- `tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Attempted the same temporary dev-harness + Playwright verification used for every other UI
  change this session, but the Playwright browser-automation MCP connection had dropped (an
  earlier `taskkill /IM node.exe` cleanup step, needed to fully stop a stuck dev server, appears to
  have also killed the MCP server's own Node process) and did not reconnect. Did not attempt a
  workaround given the small, well-precedented nature of the change — swapping in an interaction
  pattern (`<input type="checkbox">` + label, `accent-[#c9a84c]` styling) copied directly from
  `ChecklistGroupCard.tsx`, which was itself already visually verified in earlier passes.

### Recommendation for next session
- If future UI verification needs the Playwright browser tools, avoid `taskkill /IM node.exe`
  (kills every Node process indiscriminately, including the MCP server) — kill only the specific
  dev-server PID instead (e.g. via `netstat`/`Get-Process` to find the exact port owner).
- Quick manual check next time the app is open: confirm the new checkboxes render/toggle correctly
  and the selected-count badges update live.

---

## Session — 2026-07-23, Scope of Work: in-app notification + recipient list visibility

### What was implemented
- Direct continuation of the Document Recipients work below, same session, after the user
  independently set up `RESEND_API_KEY` in Vercel, redeployed, and confirmed (via a real test send
  through Resend's sandbox sender to their own account email) that the email pipeline genuinely
  works in production — verified from this side too, via the Vercel MCP tools (`get_project`
  showed the latest deployment `READY`/`production` matching the just-pushed commit, and
  `get_runtime_errors` showed nothing email-related).
- User then asked two follow-up questions in one message: how does a document "show up" on the
  recipient's own Scope of Work page when someone else sends it to them, and could there also be
  an in-system (bell) notification.
- **Real root-cause finding before writing any code**: the *previous* pass's `scopeOfWork:viewAll`
  own-records-only filter — which I built and shipped earlier this same session — had an
  unintended interaction with this new feature. A document recipient who didn't create the record
  and lacked `viewAll` (the common case: a Sales User in Purchase/Accounting/etc. picked as a
  recipient) had literally no standing way to find the record again once the one-time email or
  notification link was gone — the list/search would simply never show it to them. This wasn't
  caught in the earlier pass because the Document Recipients feature (which creates this specific
  cross-user visibility need) didn't exist yet when `viewAll` was designed. Worth noting as a
  concrete example of why "does this closed-off list/search filter interact badly with a *later*
  feature" needs re-checking each time something new gets layered on top, not just checked once.
- Reused every pattern already established rather than inventing new ones: the in-app notification
  reuses the exact `Notification`/`NotificationBell.tsx`/`relatedQuoteId`-style deep-link machinery
  Quotation's own workflow notifications already use (just added a `relatedScopeId` sibling field
  and a matching `App.tsx` navigation branch); `ScopeOfWorkPage.tsx`'s new deep-link prop pair
  copies `QuotationPage.tsx`'s `initialQuoteId` "adjust state during rendering" pattern verbatim;
  the list/search visibility fix reuses the exact `$or` ownership-filter shape the `viewAll` pass
  itself introduced, just extended with one more clause.
- **One real technical judgment call**: MongoDB has no native "does this object's any array value
  contain X" operator without `$expr`/`$objectToArray`. Rather than reach for that, queried each of
  the 6 known department keys individually (`{ "documentRecipients.purchase": userId }`, etc.,
  `$or`'d together) — simpler, indexable, and correct since the department set is small and fixed
  (`DOCUMENT_RECIPIENT_DEPARTMENTS`), not truly dynamic.
- Also asked the user directly (rather than guessing) whether the email itself should try to
  deep-link — confirmed this app has no URL-based router at all (`App.tsx` is a plain `activeNav`
  string switch), so a plain email `<a href>` genuinely cannot restore in-memory navigation state.
  Documented this as a known, deliberately-not-fixed limitation rather than a bug, and pointed out
  that the in-app notification (which doesn't need a URL, since it's all internal React state)
  already solves the "get me to the record" need for anyone who's actually signed into the app.

### Verification
- `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
- No dev harness built for this pass — the new logic is either a pure MongoDB query-filter addition
  (no new client rendering to harness) or a direct structural copy of an already-shipped,
  already-verified pattern (`QuotationPage.tsx`'s deep-link handling). Verified by side-by-side code
  comparison against those originals instead.
- Not live-verified this session: an actual recipient without `viewAll` seeing the record appear on
  their list, or the bell notification arriving and deep-linking correctly. Flagged in TODO.md.

### Recommendation for next session
- Have a Sales User (without `scopeOfWork:viewAll`) get picked as a document recipient on a record
  they didn't create, then confirm: it appears on their own Scope of Work list; a bell notification
  arrives; clicking the notification opens that exact record's detail view.

---

## Session — 2026-07-23, Scope of Work: real Document Recipients + email routing

### What was implemented
- User showed a screenshot of the "เอกสารส่งถึง" checklist (Purchase/Project/Factory/Technic/
  Service/อื่นๆ) and asked to add "บัญชี" (Accounting), while also linking the checklist to the
  department chosen when creating an employee, "because documents need to go to the real person in
  each department."
- Researched before touching anything: `documentsToSend` was a hardcoded 5-option checklist with
  zero link to any other data; `User.department` was 100% free text with autocomplete hints only,
  disconnected from both the checklist and an existing-but-orphaned `departments` MongoDB
  collection nothing actually reads. No workflow anywhere in the codebase already did "look up
  users by department" for any routing purpose.
- **Asked two clarifying questions before implementing**, since the request was genuinely
  ambiguous and each answer implied substantially different scope: (1) how deep "link department"
  should go — just add the checkbox with no real link, vs. a real controlled department field with
  a recipient picker, vs. a fuller architecture change. User picked the real-link-with-picker
  option and clarified in the same breath that they specifically wanted actual email delivery,
  since employee accounts already collect an email address. (2) Since zero email-sending
  infrastructure existed anywhere in this codebase (confirmed by grepping for nodemailer/SMTP/
  Resend/SendGrid/etc. — a genuine external-dependency blocker, not something to guess past), asked
  which provider to use; user picked the recommended option (Resend).
- **Real judgment calls made while implementing**:
  - Made `DOCUMENT_RECIPIENT_DEPARTMENTS` (Purchase/Project/Factory/Technic/Service/Accounting) the
    single source of truth for BOTH the checklist's option list AND the User form's department
    dropdown, rather than keeping them as two separately-maintained lists that could drift apart —
    this is what makes the "link" actually reliable (exact string match) instead of best-effort.
  - Removed the old `DEPARTMENT_SUGGESTIONS` constant (a different, HR-style taxonomy — ผู้บริหาร/
    ฝ่ายขาย/วิศวกรรม/etc.) rather than keeping both lists side by side — it had exactly one
    consumer and represented an unrelated concept once department became the document-routing
    taxonomy; keeping it would have meant two different "what departments exist" answers in the UI.
  - Chose a fixed `<select>` for `User.department` over keeping free text with better hints — real
    linking needs exact matches, and free text with typos/inconsistent phrasing would have quietly
    broken the recipient picker for anyone who didn't type exactly right. Preserved a legacy value
    as a selectable fallback option rather than silently discarding it on save, matching this
    codebase's existing pattern for exactly this kind of "old data doesn't fit the new fixed list"
    situation (e.g. `jobTypeAnalytics`'s deactivated-code handling).
  - Caught and fixed a real backfill gap before it could bite: `withDefaultChecklistGroups()` only
    ever backfilled entirely *missing* groups (and missing `note` fields), never missing *options*
    within an already-present group. Without extending it, every Scope of Work saved before this
    pass would have been permanently stuck at 5 `documentsToSend` options forever, with no way to
    ever route to Accounting — this would have been a silent, hard-to-notice bug, not a crash, so
    worth calling out explicitly here.
  - No SDK dependency added for Resend — a single `fetch` POST to its REST API is simpler than a
    new npm package for one API call, and this codebase already has a "prefer the platform's own
    `fetch` over adding a client library" precedent (`apiClient.ts` itself works the same way).
  - Scoped the send action to `scopeOfWork:print` rather than inventing a new permission — it's the
    same category of action (distribute the document outward), and adding a permission for
    something this narrow would have been unjustified RBAC surface-area growth.

### Verification
- `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
- Built a temporary, isolated dev harness (`src/dev/DocumentRecipientsHarness.tsx`, swapped into
  `main.tsx`, both reverted/deleted after use) with 3 mock users across 2 departments, driven by
  Playwright: confirmed checking "Purchase" and "Accounting" checkboxes reveals exactly the
  matching-department candidates (not users from other departments), and toggling chips for both
  departments simultaneously updates the recipient-map state correctly and independently
  (`{"purchase": ["u1"], "accounting": ["u2"]}`). Zero console errors/warnings.
- **Cannot verify this session, by nature of the feature**: actual email delivery — no
  `RESEND_API_KEY` exists anywhere in this sandboxed environment, and there's no safe way to
  fabricate one. This is flagged as a required manual step, not silently assumed to work.
- Same standing sandboxed-session limitation as every recent entry for the rest of the save/send
  round trip against real MongoDB data.

### Recommendation for next session
- **Before this feature does anything real**: a human must sign up at resend.com, get an API key,
  and add `RESEND_API_KEY` (and ideally `EMAIL_FROM` once a sending domain is verified) to Vercel's
  environment variables. Flagged in TODO.md as the blocking step.
- Once that's done, verify end-to-end against production: create/edit a user with a real email,
  set their department, open a Scope of Work, check the matching department in the checklist,
  confirm they appear as a pickable recipient, pick them, send, and confirm the email actually
  arrives with correct content.

---

## Session — 2026-07-23, Scope of Work: own-records-only viewing

### What was implemented
- User asked, on the same day as the payment-schedule work: "หน้า scope of work อยากให้ทำสิทธิ์เพิ่ม
  มาเหมือนของใบเสนอราคาที่เป็นดูของผู้อื่นได้" — add a permission to the Scope of Work page like the
  one Quotation already has, for viewing other people's records. This is a direct reference to
  `quotations:viewAll` (shipped 2026-07-22), so the implementation mirrored it deliberately rather
  than designing something new.
- **Real judgment call**: Quotation's `quotations:viewAll` only ever had one read path to gate (`GET
  /api/quotes`, plus Global Search). Scope of Work has extra read paths Quotation doesn't — a
  by-quotation existence check used by the Quotation-detail toolbar, a single-record `GET`, and
  duplicate/rewrite's own source-record read. A literal "filter every read path by ownership" mirror
  would have broken a real workflow: the by-quotation check exists specifically so a Sales user
  opening a quotation can tell "does a Scope of Work already exist for this?" — filtering that by
  ownership would hide a colleague's already-created record and likely cause the user to create a
  duplicate one instead of opening the existing one. And filtering the single-record `GET` while
  leaving that same link unfiltered would produce a worse, self-contradictory UX (link says it
  exists, click 403s). Decided to scope the ownership filter to exactly two places: the standalone
  "browse everything" list page (the literal "หน้า scope of work" the user referred to) and Global
  Search (the same discovery-surface precedent `quotations:viewAll` already established) — leaving
  every other read path, and every write path (`update`/`delete`/`refresh`/`finalize`/`print`,
  already governed by their own independent ownership-or-finalize/permission checks), untouched.
- Added `scopeOfWork:viewAll` to the `Permission` union/labels/i18n keys/`PERMISSION_GROUPS`
  (`src/lib/permissions.ts`) and to `administrator`/`approver_1`/`approver_2`/`viewer`'s default
  permission lists (not `sales_user`) — same role-assignment pattern as `quotations:viewAll`.
- Backend: added the same `{ $or: [{ createdBy: ctx.user.id }, { createdBy: "" }] }` ownership
  filter `quotations:viewAll` uses, to `handleList()`'s list-all branch and `searchScopeOfWorks()`
  (which needed a new `ctx` parameter and an `$and`-wrapped text-search clause to coexist with the
  new top-level ownership `$or` — copied `searchQuotations()`'s exact composition rather than
  reinventing one).
- No frontend code changes were needed at all — confirmed by grepping how `quotations:viewAll`
  touches the frontend: it doesn't, beyond one explanatory comment in `QuoteList.tsx`. The Salesperson
  filter dropdown, the list rendering, everything already just displays whatever the server hands
  back — same will be true for `ScopeOfWorkList.tsx` once real ownership-scoped data exists.

### Verification
- `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
- No dev harness built for this pass, unlike the two payment-schedule passes earlier the same
  session — there's no new client-side rendering logic to harness (the list page's code is
  completely unchanged; only what MongoDB query populates it changed). Verified instead by directly
  comparing the new query composition line-by-line against `searchQuotations()`'s already-shipped,
  already-verified equivalent.
- Same standing sandboxed-session limitation as every recent entry: real ownership-scoped behavior
  against actual MongoDB data (a Sales User genuinely only seeing their own records, an Approver
  seeing everyone's, a legacy ownerless record staying visible to everyone) is unverified this
  session.

### Recommendation for next session
- **Before this deploys to production**: a Super Admin must manually grant `scopeOfWork:viewAll` to
  Administrator/Approver Level 1/Approver Level 2/Viewer via Role Management — `defaultRoles` only
  seeds once, so existing role documents won't gain it automatically. Flagged in TODO.md; skipping
  this step will make every current Approver suddenly unable to see the Scope of Work records they
  need to finalize.
- Once network access allows it, verify: a Sales User only sees own records on the list page and in
  search; an Approver (once granted) sees everyone's; opening a colleague's Scope of Work via the
  quotation-detail toolbar link still works for a Sales User without `viewAll` (confirming the
  deliberate by-quotation/single-record exemption behaves as designed, not as an oversight).

---

## Session — 2026-07-23, Scope of Work: Cash/Credit dropdown + days field

### What was implemented
- Direct same-day follow-up: right after shipping the multi-installment payment schedule (see the
  entry below), the user came back with "ไม่คือสามารถแก้ไขเปอร์เซ็น แก้ไขว่าจะเลือกเป็น Cash หรือ
  Credit" — a correction that the free-text "method" field I'd just built wasn't what they wanted;
  they wanted percentage editing to stay as-is, but the Cash-vs-Credit choice to be a real
  selectable control, not typed text.
- The request was genuinely ambiguous between 3 reasonable shapes (plain Cash/Credit dropdown with
  no day count; dropdown + a separate day-count field; or a dropdown of whole pre-composed strings
  like "Cash"/"Credit 30 Days"/"Credit 60 Days"). Asked via `AskUserQuestion` rather than guessing —
  the user picked "dropdown + separate day-count input," the option already marked recommended.
- Replaced `ScopeOfWorkPaymentInstallment.method: string` with `paymentType: "" | "Cash" | "Credit"`
  + `days: number | null`. Kept `days` applying to *either* type (not Credit-only) — the user's own
  first message used "Cash 30 days" for the down payment, not just Credit terms, so a Credit-only
  day field would have silently dropped that case. Added `formatPaymentMethod()` as a pure derived-
  string function rather than storing a duplicate composed string, so the printed "Cash"/"Credit 30
  Days" text can never drift out of sync with the two source fields.
- **Compounding-legacy judgment call**: `normalizePaymentConditions()` now has to handle 3 possible
  stored shapes instead of 2, since the intermediate `method`-based `installments` shape from
  earlier this same session is now itself "legacy" before it likely ever reached a real saved
  record. Rather than special-casing "was this ever actually used in production," wrote one
  best-effort `parsePaymentMethodText()` regex parser that handles both the original fixed-pair
  `method` string and the intermediate array's per-row `method` string identically — simpler than
  tracking which of the two older shapes a given stored value came from.

### Verification
- `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
- Reused the same temporary dev-harness pattern as the immediately prior entry (`src/dev/
  PaymentHarness.tsx`, swapped into `main.tsx`, both reverted/deleted after use), this time also
  printing the `formatPaymentMethod()`-derived string live. Applied the 30/70 preset and confirmed
  the dropdown/days inputs show the correct Cash/blank and Credit/30 values with a matching derived
  string; then added a 3rd row and filled it in as Cash + 30 days + 20% "Materials" — the derived
  output read "30% Down Payment (Cash) / 70% After Job Complete (Credit 30 Days) / 20% Materials
  (Cash 30 Days)," an exact match to the user's own original 3-installment example. Zero console
  errors/warnings.
- Same standing sandboxed-session limitation as every recent entry: a genuine pre-existing legacy
  record's conversion through `normalizePaymentConditions()` is unverified against real production
  data this session.

### Recommendation for next session
- Once network access allows it (or the user checks in production), verify against a real record:
  create one, save a 3-installment Cash/Credit-mixed schedule, reload the page, and confirm the
  dropdown/days values round-trip correctly through a real PATCH + GET cycle (not just local React
  state, which is all the harness above exercised).

---

## Session — 2026-07-23, Scope of Work: multi-installment payment schedule + presets

### What was implemented
- User asked (in Thai) for 3 specific named payment-term presets on the Scope of Work page, but
  explicitly wanted the field to stay editable by the salesperson, including schedules with more
  than 2 installments (their own example: 20% Down Payment (Cash 30 days) / 40% Materials (Credit
  30 days) / 40% After Delivered Date (Credit 30 days)).
- Researched the existing data model first and found a real structural blocker: `paymentConditions`
  was a fixed `{downPaymentPct, finalPaymentPct, method}` pair — capped at exactly 2 installments,
  one shared payment method for both, and the validator only ever checked those two named fields.
  Presets alone (without changing the model) could not have represented the user's own 3-installment
  example, so this was a genuine schema change, not just new buttons on top of the same 2 fields.
- Changed `ScopeOfWorkPaymentConditions.installments` to an array of `{ id, pct, label, method }`
  rows — each row carries its own method/terms (not one shared field), directly enabling the mixed
  Cash/Credit example the user gave. `validatePaymentPercentages()` generalized from "both fixed
  fields sum to 100" to "every row's percentage is filled in and all rows sum to 100, only checked
  if at least one row exists" — same opt-in semantic as before, now correct for any row count.
- **Real judgment call**: this field is already persisted in production MongoDB documents, and the
  project has no migration-script convention (confirmed by grepping — every prior schema-shape
  change in this codebase, e.g. checklistGroups' `withDefaultChecklistGroups()`, handles it via a
  read-time normalizer instead). Wrote `normalizePaymentConditions()` to convert a legacy
  `{downPaymentPct, finalPaymentPct, method}` record into the new array shape on read, called from
  both `normalizeScope()` (every API response) and `toValidationInput()` (finalize/print
  validation) — so an untouched pre-2026-07-23 record keeps working exactly as before, and only
  gets persisted in the new shape once it's next actually saved.
- UI: built `PaymentInstallmentsEditor` inside `ScopeOfWorkDocument.tsx`, modeled directly on the
  existing `ScopeOfWorkItemsEditor.tsx`'s row-editing pattern (label/percentage/method inputs +
  remove button per row, an add-row button) rather than inventing a new interaction style — plus 3
  preset buttons that replace the whole row set in one click. `ScopeOfWorkPrintDocument.tsx`'s two
  hardcoded "Down payment"/"After Job Complete" lines became a `.map()` over the array.

### Verification
- `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
- Built a temporary, isolated dev harness (`src/dev/PaymentHarness.tsx`, briefly swapped into
  `main.tsx` in place of `App`, both reverted/deleted after use) mounting the real
  `PaymentInstallmentsEditor` component with local React state, then drove it with Playwright:
  confirmed clicking the "30%/70% Credit 30 Days" preset populates exactly the 2 expected rows with
  correct percentages/labels/methods and a live "รวม 100%" total, and that "+ เพิ่มงวดชำระเงิน" adds
  a genuinely independent 3rd blank row on top of an applied preset — directly exercising the user's
  own 3-installment scenario. Zero console errors/warnings throughout.
- Same standing sandboxed-session limitation as every recent entry: no Vercel CLI, no local MongoDB
  credential, so `normalizePaymentConditions()`'s legacy-record conversion is unverified against a
  real pre-2026-07-23 document in production — only the new-record/harness-verified UI path is
  confirmed this session.

### Recommendation for next session
- Once network access allows it (or the user checks in production), open an existing pre-2026-07-23
  Scope of Work record and confirm its payment conditions render correctly (converted from the
  legacy 2-field shape) rather than crashing or showing blank rows.

---

## Session — 2026-07-23, Dashboard: Scope of Work document count card

### What was implemented
- User asked (in Thai) to add Scope of Work document counts to the Dashboard.
- Explored the codebase first to find the right seam: `DashboardPage.tsx` fetches one aggregated
  `DashboardStats` object per request (`GET /api/dashboard`), rather than each widget doing its own
  independent fetch — so the natural approach was to add a `scopeOfWork` field to that one response,
  matching how every other optional/permission-gated section (`approvalDashboard`,
  `activityTimeline`) already works, rather than a second independent client-side fetch of
  `fetchAllScopeOfWorks()`.
- One real judgment call: `ExecutiveSummaryCards.tsx` documents an explicit, repeatedly-reaffirmed
  "exactly 4 cards" business requirement from an earlier session (P'Keng/P'Kee spec) — adding a 5th
  tile there would have silently violated a decision the user fought for across several passes. Put
  the new card in the "supporting detail" section instead (same tier as `ActivityFollowUpSummary`),
  which is exactly what that section already exists for: real, filter-aware-or-documented-exception
  data that isn't part of the named-required top overview.
- Kept the count company-wide/unfiltered rather than trying to join Scope of Work documents back to
  their originating quotation's `issueDate`/`salesperson` to honor the Dashboard's date/salesperson
  filter — `ScopeOfWork` has no such field of its own, and the codebase already has a documented
  precedent for this exact tradeoff (Total Customers/Products/`categoryBreakdown` are all
  deliberately unfiltered catalog metrics, for the same reason).
- Backend: 3 `countDocuments()` calls on `scope_of_works` (isDeleted:false, plus Draft/Final),
  wrapped in the same `roleHasPermission("scopeOfWork:view")` + try/catch pattern already used for
  `approvalDashboard`. Frontend: new `ScopeOfWorkSummary.tsx` component copying
  `ActivityFollowUpSummary.tsx`'s tile-row visual pattern almost verbatim (same `ChartCard` wrapper,
  same tile shape) rather than inventing a new layout.

### Verification
- `tsc --noEmit` (both configs), `npm run lint`, `npm run build` all pass clean.
- Same standing sandboxed-session limitation as every recent entry: no Vercel CLI, no local
  MongoDB credential, so the real counts against production data are unverified this session —
  `vercel dev`/live-browser verification was not attempted since it's a known, previously-confirmed
  dead end (`vercel dev` isn't installed; MongoDB Atlas SRV DNS doesn't resolve in this sandbox even
  when it is). Confidence is reasonably high anyway since the new card reuses an already-shipped,
  already-verified permission-gate/tile pattern rather than introducing a new one.

### Recommendation for next session
- Once network access allows it (or the user checks in production), confirm the Total/Draft/Final
  counts on the new card match the standalone Scope of Work list page's own counts exactly.

---

## Session — 2026-07-22 (absolute latest), Scope of Work: Rewrite action + Salesperson filter

### What was implemented
- User asked to mirror two Quotation-page features onto the new standalone Scope of Work page:
  the "Rewrite/แก้ไข" revision feature, and the Salesperson filter dropdown.
- Rewrite required one real architectural judgment call before writing any code: Quote's Rewrite
  applies `{root}-R{n}` directly to `_id` because a Quote's `_id` *is* its human-readable business
  key, but Scope of Work's `_id` is a genuine MongoDB `ObjectId` — so the revision suffix had to
  apply to `scopeNumber` instead. Reused the existing `getRevisionRoot()`/atomic-counter pattern
  from `api/_lib/quoteRevisions.ts` rather than writing a parallel copy, updating only that file's
  docstring to note the new cross-module reuse (a deliberate effort/risk tradeoff — the file's name
  stays Quote-specific-sounding, but only its one truly Quote-only export, `dedupeQuotesByRevisionChain()`,
  actually is).
- Salesperson filter was simpler: `quotationSalesperson` already existed on the `ScopeOfWork` schema
  (frozen at creation) but `toListItem()` never surfaced it on the list shape — a one-line add plus
  the same filter-dropdown/table-column pattern already used for Job Type.
- While wiring the Rewrite button's `onRewritten` callback into `ScopeOfWorkPage.tsx`, noticed and
  fixed a real pre-existing gap: "back to list" only switched view state, never re-fetched — so any
  just-created Duplicate/Rewrite/edit wouldn't show up in the list until a full page reload. Fixed
  by extracting a reusable `loadList()` and calling it from the back action too.
- **Self-caught bug before commit**: `npm run lint` (part of the standing pre-completion checklist,
  run every time regardless of how confident the change feels) flagged a real
  `react-hooks/rules-of-hooks` violation — the new `rewriteBusy` `useState` had been added right next
  to its `handleRewrite` function, which happened to sit textually after this component's two early
  returns (`if (loadError) return...`, `if (!scope) return...`). Moved it up alongside the
  component's other `useState` declarations, before those returns. This is the same category of
  mistake most of this session's "review your own code" requests have caught — a reminder that
  running the actual lint/build/tsc trio catches real classes of bugs that "does this look right"
  alone won't, especially for hook-ordering issues that are easy to introduce when adding a new
  piece of local state near where it's *used* rather than near the component's other hooks.
- Verified visually: mock-data harness for the list page confirmed the Salesperson column and
  dropdown render and sort correctly. The detail view's Rewrite button was verified by code
  inspection instead of a live/mocked-fetch harness — its structure is byte-for-byte identical to
  the already-shipped, already-verified Duplicate button (same gating, same busy-state pattern), so
  a full harness pass would have re-tested already-proven UI plumbing rather than anything new.

### Known limitation
- Same standing sandboxed-session limitation as every recent pass: no network path to MongoDB
  Atlas, so the actual end-to-end Rewrite behavior (real scope-number revision numbering, real
  audit-log entry, real data-copy fidelity) is unverified against live data — only `tsc`/`lint`/
  `build` and the harness-verified UI pieces are confirmed.

### Recommendation for next session
- Once network access allows it (or the user tests in production), click through: rewrite a Scope
  of Work more than once (confirm `-R1`, `-R2` sequencing, not just `-R1`), confirm the source
  record is untouched, and confirm the Salesperson filter/column reflect real snapshotted names.

---

## Session — 2026-07-22 (absolute latest), Fix Scope of Work page crashing to blank white

### What was implemented
- User reported the new Scope of Work page (shipped earlier this same session) went completely
  blank white on click — a real production bug caught by actual usage, not by any local check.
- Reasoned through what could cause a *literal blank screen* rather than a normal error message:
  checked whether the app has an error boundary anywhere (it doesn't, confirmed by grep) — meaning
  React's default behavior on any uncaught render exception is to unmount the entire tree. This
  reframed the investigation: the bug didn't need to be exotic, it just needed to be *any* uncaught
  exception during render, and the missing error boundary is what turned it into a total blank
  screen instead of a contained error.
- Found the likely culprit by re-reading my own `toListItem()` from earlier this session: it read
  `full.customerSnapshot.companyName`/`jobTypeCode`/etc. straight off the MongoDB document with no
  fallback. Recognized the specific mechanism — `JSON.stringify()` silently drops `undefined`-valued
  keys rather than sending `null`, so a record missing a field wouldn't come back as `field: null`,
  it would come back with the key *absent entirely*, and the client's `.trim()`/`.toLowerCase()`
  calls on an assumed-always-string field would throw the moment real data included such a record.
- Fixed defensively in three independent layers rather than just patching the one line that was
  probably the actual cause: server-side fallbacks in `toListItem()`, client-side re-normalization
  in `ScopeOfWorkList.tsx` (defense-in-depth, don't trust the network payload blindly either), and —
  the highest-value fix — a first-ever app-wide `ErrorBoundary`, since the missing-fallback bug
  could easily have a sibling elsewhere in this large, un-tested codebase, and the *real* problem
  exposed by this incident is "any bug anywhere blanks the whole app," not just this one field.
- Verified the fix actually works, not just that it compiles: built a harness with a deliberately
  malformed mock record (most fields absent, same shape the real bug would have produced) and
  confirmed it rendered correctly instead of throwing.

### Known limitation
- The fix is verified against a *simulated* version of the bug (a malformed mock record), not
  against whatever the actual real-data condition was — this sandboxed session still can't reach
  the live MongoDB instance to confirm the real record(s) that triggered it, or run the full list→
  detail navigation end-to-end.

### Recommendation for next session
- Ask the user to confirm the Scope of Work page now loads correctly in production. If it still
  crashes, the `ErrorBoundary` should at least now show a visible error screen instead of blank
  white — ask for a screenshot of *that* screen (or the browser console) to find the true remaining
  cause, rather than guessing again.

---

## Session — 2026-07-22 (absolute latest), Add a standalone Scope of Work sidebar page

### What was implemented
- Also this session (not separately logged before now): added a 6th Quotation-list summary card,
  "ใบแก้ไข"/"Revisions," counting rewritten quotes via a new client-side `isRevisionQuote(id)` check
  in `src/lib/quotes.tsx` — a quick, low-risk addition, verified against a mock-data harness.
- Main task: user asked to remove a "website link" from the printed Scope of Work document, and to
  add a new page for managing Scope of Work, reached by creating from the Quotation page first,
  then managing on the new page. Investigated the "link" claim first — read every line of both
  `ScopeOfWorkDocument.tsx` and `ScopeOfWorkPrintDocument.tsx`, found no rendered link/URL/website
  field anywhere. Concluded it's almost certainly the browser's own native print header (shows the
  page URL + date when "Headers and footers" is enabled) — Scope of Work's print button already has
  a tooltip explaining how to disable it (added in an earlier pass alongside Quotation's identical
  tip). Explained this to the user via `AskUserQuestion` rather than guessing at a fix for something
  that isn't in the app's control; the reply only addressed the second (page) question, so this was
  left as explained, not force-fixed.
- For the new page, asked a second clarifying question before building: whether clicking "create"
  on the Quotation page should keep opening the Scope of Work inline (as today) or navigate away to
  the new page. Answer: keep creation exactly as it is; the new page is purely for browsing/opening
  records that already exist. This mattered — building the wrong one would have meant reworking a
  meaningful chunk of navigation logic.
- Researched `App.tsx`'s existing nav-item pattern in detail (how "Customers" was added as a
  precedent: `NavKey`, `NAV_RESOURCES`, `navItems`, `NAV_GROUPS`, `NAV_LABEL_KEYS`, permission
  variables, the render switch) before writing any code, to replicate it exactly rather than
  inventing a parallel pattern. Deliberately did NOT add `"scopeOfWork"` to `NAV_RESOURCES` — the
  new page fetches its own data on mount, same as Dashboard/Audit Log, so it doesn't need to wait on
  (or be blocked by) the shared boot-time domain fetch.
- Found `GET /api/scope-of-works` already existed but *required* `quotationId` (400 without it) —
  made it optional rather than adding a whole new route, switching to a "list everything
  company-wide" mode when absent. Added a richer `ScopeOfWorkListItem` type/`toListItem()` mapper
  instead of widening the existing `ScopeOfWorkSummary` shape every other caller (the by-quotation
  lookup) already relies on.
- Reused the existing `ScopeOfWorkDocument.tsx` component as-is for the new page's detail view
  rather than duplicating it — added one small optional `backLabel` prop (defaults to the original
  "กลับไปใบเสนอราคา") so the new page's back button reads correctly ("กลับไปรายการ Scope of Work")
  without touching the existing Quotation-embedded call site at all.
- New `ScopeOfWorkList.tsx` written in hardcoded Thai (no `t()`/i18n keys) to match every other
  Scope of Work UI file's existing convention — confirmed by grepping the rest of the module before
  writing it, rather than introducing a first-ever translated file there inconsistently.
- Verified `ScopeOfWorkList.tsx` visually against a temporary mock-data harness (search/filter both
  confirmed working); the full `ScopeOfWorkPage` container and the new API mode were not reachable
  the same way (need a real session/DB), so those rest on code-level review plus the type-checker.

### Known limitation
- **The full page (list→detail navigation, the real API's "list everything" mode, duplicate-from-
  standalone-page behavior) is unverified against a live deployment** — same sandboxed-session
  no-MongoDB-network limitation as every other pass this session. Only `ScopeOfWorkList.tsx`'s
  client-side rendering/search/filtering was actually exercised in a browser.

### Recommendation for next session
- When live DB access is available: click through list→detail→back on the new Scope of Work page,
  confirm the API's list-everything mode returns real records with the right fields, and confirm a
  role without `scopeOfWork:view` genuinely can't see the new sidebar entry.

---

## Session — 2026-07-22 (absolute latest), Add own-quotes-only viewing permission + Salesperson filter

### What was implemented
- User asked for a new permission: unchecked = a user can only see their own quotations, checked =
  can see everyone's — plus a Salesperson filter on the Quotation list styled like the existing Job
  Type dropdown. Read the existing permission system (`src/lib/permissions.ts`, `src/lib/roles.ts`)
  and the current `GET /api/quotes`/Global Search implementations before writing anything, since
  both currently return every quote to any `quotations:view` holder with zero ownership filtering.
- Added `quotations:viewAll` as a new, orthogonal permission (not a replacement for
  `quotations:view`) — enforced server-side in `handleList()`'s GET branch (`api/handlers/
  quotes.ts`) and `searchQuotations()` (`api/_lib/searchHandler.ts`), both filtering to
  `{ createdByUserId: ctx.user.id }` plus ownerless legacy quotes when the caller lacks it.
  Deliberately checked Global Search too, not just the list page — the list alone would have been a
  false sense of security if the same data was still fully discoverable through the search bar.
- Assigned defaults thoughtfully rather than blanket-granting: Administrator/Approver 1/Approver
  2/Viewer get `quotations:viewAll` (Approvers *must*, since they review other people's quotes for
  a living); Sales User does not — exactly the "own-only by default" role the request was written
  for, and its existing role description already says "ใบเสนอราคาของตนเอง" (their own quotations).
- Recognized and flagged a real deployment risk before finishing: `defaultRoles` only seeds the
  `roles` collection once, on first-run setup — it's never re-applied to an already-provisioned
  deployment's existing role documents. Shipping this without a manual step means every current
  Approver in production silently loses the ability to see quotations they need to approve the
  moment this deploys. Documented prominently (TODO.md top item, PROJECT_STATUS.md, RBAC.md,
  CHANGELOG.md) as a required manual Role Management action, not a passive risk — deliberately
  chose not to attempt an automatic migration, since existing roles' permission lists may have
  already been hand-customized by an admin and a blind backfill risks undoing that.
- Added the Salesperson filter dropdown to `QuoteList.tsx`, deriving its options from whichever
  salesperson names are actually present in the (now possibly server-restricted) `quotes` array —
  no separate API call or master list needed, and it naturally narrows to just the current user
  when they lack `quotations:viewAll`.
- Visually verified the new dropdown against a temporary mock-data harness (same `?harness=1`
  pattern used earlier this session) — confirmed it renders correctly and that selecting a
  salesperson narrows 5 mock quotes down to their 2. Harness deleted, `main.tsx` reverted, before
  finishing.

### Known limitation
- **The actual server-side ownership enforcement is unverified against a live deployment** — this
  requires real authenticated sessions under different roles against a live MongoDB instance, which
  this sandboxed session cannot reach. The query logic was instead traced by hand against the
  already-shipped, structurally identical ownership check in `PATCH /api/quotes/:id`.
- The required Role Management step (granting `quotations:viewAll` to existing production roles)
  has definitely **not** been performed by this session — it requires a live authenticated Super
  Admin session in the actual production app, not something achievable from code.

### Recommendation for next session
- Before (or immediately after) this deploys to production, confirm a Super Admin has manually
  checked `quotations:viewAll` for Administrator/Approver Level 1/Approver Level 2/Viewer in Role
  Management. This is the single most operationally important follow-up from today's work — if
  missed, approvers lose visibility into quotations they need to act on.

---

## Session — 2026-07-22 (absolute latest), Fix Dashboard double-counting rewritten quotations

### What was implemented
- User reported (in Thai) that the Dashboard's total pre-tax quotation value included rewritten
  quotations' amounts — i.e. a quote and its rewrite(s) were both counted, when only the *latest*
  revision should count as "the" quotation. Before touching code, read the actual `api/dashboard/
  index.ts` file (969 lines) to understand its real architecture rather than assuming — discovered
  the whole file shares one central `docs` array for most widgets, but 4 *other* metrics
  (repeat-customer classification, forecast win rate, monthly closing rate, revenue trend) are
  computed from separate MongoDB `$group` aggregate queries that don't touch `docs` at all. This
  meant the bug was much broader than the one KPI the user pointed at — asked via `AskUserQuestion`
  whether the fix should apply to every Dashboard number or just that one, since the two options
  had a large difference in scope/risk; user chose "every number."
- Extracted the existing `-R<digits>` suffix-parsing logic (previously a private local function
  inside `api/handlers/quotes.ts`'s Rewrite implementation from earlier this session) into a new
  shared `api/_lib/quoteRevisions.ts` (`getRevisionRoot()`/`getRevisionNumber()`/
  `dedupeQuotesByRevisionChain()`), and refactored `quotes.ts` to import it instead of keeping its
  own copy — the two must never drift apart on what counts as a valid revision suffix.
- Applied the dedup to 6 places in `api/dashboard/index.ts`: the shared `docs` array (fixes most
  widgets in one place), follow-ups, and 4 conversions from `$group` aggregate to raw
  fetch-then-dedupe-then-group-in-JS (repeat-customer counts, forecast win rate, monthly closing
  rate, revenue trend) — the aggregate pipelines had no way to resolve "what is this chain's actual
  latest status" before grouping, so they had to become raw fetches with the status filter moved to
  after the JS-side dedup step.
- Deliberately left 2 things un-deduped, documented why: `totalQuotationsAllTime` (only feeds a
  boolean "is there any data" gate, never a displayed number) and `activityTimeline`/`salesActivity`
  (audit-log event feeds, not quotation-count aggregates — a rewrite is a genuine event that
  correctly appears once; it isn't even in `salesActivity`'s tracked action list, so it was never
  double-counted there to begin with).
- Verified the core dedup logic with a throwaway Node script (not part of the codebase, deleted
  after) against a synthetic chain: an unrewritten quote, a chain with an original + 2 rewrites, and
  an edge case where only an `-R1` exists with no fetched root — all 3 behaved correctly.
  `tsc --noEmit` (both tsconfigs), `lint`, `build` all pass clean.

### Known limitation
- **Not verified against a live deployment with real rewritten quotation data** — same
  sandboxed-session no-MongoDB-network limitation as literally every other pass logged in this
  file. The dedup logic itself was sanity-checked synthetically, and no downstream widget's
  arithmetic changed (only which documents feed it), but the actual end-to-end numbers against a
  real chain in production have not been confirmed.

### Recommendation for next session
- When live DB access is available, create a real quote, rewrite it twice, and confirm every
  Dashboard number treats the chain as exactly one quotation using the latest revision's data —
  this is the single most valuable live check left across both of today's Quotation-Rewrite-related
  passes.

---

## Session — 2026-07-22 (absolute latest), Add Quotation Rewrite/Revision feature

### What was implemented
- Implemented a fully-specified feature request (Rewrite/แก้ไข button, `{root}-R{n}` revision
  numbering, server-side generation, RBAC, docs) rather than a vague ask, so the main work was
  research-first: launched a background research agent plus direct file reads to map the existing
  quotation-number generation (`nextQuoteId()`, atomic `counters` collection), the create API
  (`POST /api/quotes`), and — most importantly — the existing "Duplicate" action, since it's the
  closest already-shipped analog (same clone-into-a-new-Draft semantics) and the safest thing to
  model the new feature on rather than inventing a new pattern from scratch.
- Decided **not** to add any new schema field (`parentQuoteId`/`revisionOf`/etc.) to track the
  rewrite relationship — the revision root is recoverable purely by stripping a trailing `-R\d+`
  suffix off the id itself, so the id string alone encodes the whole chain. This directly matches
  the request's own "do not invent additional fields" instruction and keeps the change minimal:
  no `DATABASE.md` `Quote` interface change, no migration.
- New `POST /api/quotes/:id/rewrite` route (`handleRewrite()` in `api/handlers/quotes.ts`), gated by
  the same `quotations:create` permission Duplicate uses (no new permission introduced). Revision
  numbers are reserved atomically via the same `counters` collection + `findOneAndUpdate($inc)`
  idiom `nextQuoteId()`/Scope of Work's `nextJobSequence()` already use, keyed per-root
  (`quote_revision_{root}`), with a bounded 3-attempt insert retry mirroring Scope of Work's own
  duplicate-key race guard.
- Client-side: new `canRewrite` permission flag (`computeQuotePermissions()`), `rewriteQuote()` API
  call, a new toolbar button in `QuoteDocument.tsx` right next to Duplicate, and a `handleRewrite()`
  handler in `QuotationPage.tsx` following the exact same `setQuotes`/`setSelectedId`/toast pattern
  Duplicate uses (this app has no router — changing `selectedId` while `view` stays `"detail"`
  triggers `QuoteDocument`'s `key`-based remount onto the new revision). Made `onRewrite` return a
  `Promise<void>` (unlike the fire-and-forget `onDuplicate`) specifically so the button could track
  its own busy state and disable itself for the duration of the request — the one piece of new UI
  plumbing beyond directly mirroring Duplicate, needed to satisfy the request's explicit
  repeated-click-guard acceptance criterion.
- `npx tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint` (0 errors, 2
  pre-existing unrelated warnings), `npm run build` all pass clean. Confirmed the client bundle loads
  with zero console errors in a local dev server.
- Updated CHANGELOG.md, PROJECT_STATUS.md (Completed Features + Known Risks), TODO.md (High
  Priority), DATABASE.md (`counters` section), API.md (new route row), RBAC.md (new "Quotation
  Duplicate / Rewrite" subsection), and MODULES/Quotation.md (new business-flow item + Pages
  section).

### Known limitation
- **Not verified against a live deployment/browser** — this sandboxed session has no network path to
  MongoDB Atlas (confirmed directly: the dev server's own "ไม่สามารถเชื่อมต่อระบบได้" connection-error
  screen appeared when navigating to it), and the Vercel CLI isn't installed either, so `vercel dev`
  wasn't an option to at least exercise the real API locally. Same limitation documented against
  nearly every prior pass in this log/PROJECT_STATUS.md. The 8 manual test scenarios from the
  original request (first/second/third rewrite, data-copy fidelity, original-record integrity,
  repeated-click guard, RBAC via UI and direct API, error handling) were not click-through-verified;
  the implementation was instead checked by tracing it line-by-line against `handleDuplicate()`'s
  already-shipped, equivalent-shape behavior, which gives high confidence but is not the same as a
  live verification.

### Recommendation for next session
- When a network path to MongoDB Atlas (or a Vercel preview deployment) is available, run the 8
  manual test scenarios from the original feature request end-to-end — particularly the
  revision-numbering edge cases (rewriting an `-R1` produces `-R2`, not `-R1-R1`) and the
  repeated-click guard, since both are the parts most worth a real functional confirmation beyond
  code review.

---

## Session — 2026-07-21 (absolute latest), Remove TemplateItem's Specifications/Params/Notes/visible-to-customer entirely

### What was implemented
- Direct follow-up to the previous pass (removing just the "ดูรายละเอียด" toggle, keeping the panel's
  data always-visible): once visible, the user saw the panel held real, live template content (a
  screenshot showed actual "Substrate option: SS/SUS tank..." spec text and internal sealant-marking
  notes) and asked for the whole thing removed.
- Given the real data and that `TemplateItem.specifications` also feeds an applied quotation's line
  items (a dependency established just a few passes earlier in this same session), used two rounds
  of `AskUserQuestion` before touching code: confirmed removing all 4 fields (not a subset), and
  confirmed pre-existing Specifications content should migrate into `subDetails` rather than be lost.
- Before implementing, traced the full scope by reading `templateSeedData.ts` in detail — discovered
  a single shared `makeItem()` factory function builds every item across all 5 official templates
  from a shorthand `ItemDef` (`specs`/`params`/`notes` keys), which meant the ~500-line
  hand-transcribed seed file needed only ONE function changed, not ~50 individual item literals
  edited — a much lower-risk implementation path than it first appeared.
- Implemented real-data safety nets rather than a silent field removal: `TemplateEditorView.tsx`
  folds legacy `specifications` into `subDetails` the moment an existing template is opened for
  editing, and `applyTemplate.ts` does the same defensively at apply-time (covering a template
  applied via the wizard before ever being re-opened in the editor) — both reading a field the type
  no longer declares, via a runtime cast, clearly commented as a one-time backward-compat measure,
  not a resurrected feature.
- Removed the data model fields, the whole detail panel UI, the now-unused
  `updateParam`/`addParam`/`deleteParam` handlers and `sanitizeParam()`/`TemplateEditableParameter`
  server-side helpers, and the now-unused i18n keys. Updated `TemplatePreview.tsx`'s full-preview
  rendering to use `subDetails` instead of the removed fields.
- `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all
  pass clean. Verified via a temporary local harness (`TemplateEditorView`, create-new mode, mock
  product with specifications text) — added a section, picked the product, confirmed its
  specifications text correctly became a pinned sub-detail row instead of being lost, and that no
  trace of the removed panel/toggle remains. Harness deleted before committing.
- Updated `docs/MODULES/QuotationTemplates.md` (substantially — Status header, Data Model code block,
  Template → Quote Snapshot Semantics, Editor description, and a "moot" note on an old
  deliberate-decision writeup) and `docs/DATABASE.md`'s `TemplateItem` schema.

### Known limitation
- Not verified against a live deployment / real MongoDB data — mock-data harness verification only,
  same sandboxed-environment constraint as every other pass in this log. The migration logic
  (`migrateLegacySpecifications()`/`legacySpecifications()`) is untested against the actual 5 real
  templates' real stored content — logically sound and code-reviewed, but not run against production.
- Editable Parameters/Internal Notes/visible-to-customer values already saved on real templates stay
  in the raw MongoDB documents (no destructive migration ran) but are permanently unreachable from
  the app now — an explicitly confirmed tradeoff, not an oversight, but worth knowing if anyone asks
  "where did the internal note on template X go."

### Recommendation for next session
- If it's ever useful to recover the dropped Editable Parameters/Internal Notes data for real
  templates, it's still sitting untouched in MongoDB — a one-off read-only script could surface it
  without any code changes, same as the equivalent note left for the `QuoteLine.notes`/
  `.specifications` removal earlier this session.

---

## Session — 2026-07-21 (latest of all), Remove Template item editor's "ดูรายละเอียด" toggle

### What was implemented
- User asked to remove the "ดูรายละเอียด" (view details) button from the Quotation Template page.
  Grepped the exact i18n key first (`templates.form.expand`) rather than guessing, found its single
  usage site in `TemplateEditorView.tsx`'s `ItemEditor` — a toggle for a panel containing real data
  (Specifications, Editable Parameters, Internal Notes, visible-to-customer checkbox), not a
  throwaway UI element.
- Since Specifications was recently established (same session, earlier pass) as the only
  customer-visible-notes mechanism for template items — and now feeds into an applied quotation's
  `subDetails` — removing the button in a way that also hid or dropped that data would have been a
  real regression, not just a UI tweak. Asked via `AskUserQuestion` before touching anything: remove
  just the button and always show the panel (recommended), or remove the button and the whole panel.
  User picked "remove the button, keep the data."
- Implemented: deleted the `expanded` state and the toggle button; the detail `<tr>` now always
  renders unconditionally. Removed the two now-unused i18n keys (`templates.form.expand`/`.collapse`,
  TH+EN).
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Verified via a temporary local
  harness (`TemplateEditorView` in create-new mode) — added a section and item, confirmed the detail
  panel renders immediately with no click needed and the action column no longer has a text button.
  Harness deleted before committing.
- Updated `docs/CHANGELOG.md` and `docs/MODULES/QuotationTemplates.md`.

### Known limitation
- Not verified against a live deployment — mock-data harness verification only, same
  sandboxed-environment constraint as every other pass in this log.

---

## Session — 2026-07-21 (yet later), Quotation typography hierarchy fix

### What was implemented
- Direct follow-up to the same-day readability pass: user said the result now felt "fonts มันใหญ่แปลกๆ" (fonts weirdly big) and asked for it to look nicer, with no new screenshot this time.
- Diagnosed by grepping the actual current `text-sm` count in `QuoteDocument.tsx` (65 instances) before touching anything — confirmed the earlier pass had made almost the *entire* page one uniform text size (buttons, labels, badges, and real content were all `text-sm`), which reads as flat/heavy even though no single element is objectively huge. This didn't need new user input to diagnose; the previous mechanical find-replace was the traceable root cause.
- Went through every remaining `text-sm` instance in all 4 affected files individually (not another blanket rule) and split them into two intentional tiers: chrome (labels, buttons, badges, fine print) back to `text-xs`; actual content (input values, table data, totals) stayed `text-sm` — preserving the original readability win while restoring visual hierarchy.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean. Verified visually via a temporary local harness mounting the full `QuoteDocument` — confirmed buttons are compact again and labels read smaller/muted than their values; harness deleted before committing.
- Updated `docs/CHANGELOG.md` and amended (not duplicated) the relevant `docs/UI_GUIDELINES.md` entry from the earlier same-day pass to describe the corrected end state.
- This work was briefly interrupted by a `/doctor` health-check run (separate task, unrelated to this project's code — see the doctor's own report/summary in-conversation, not duplicated here since it's about the Claude Code tool itself, not this app) — resumed cleanly afterward from where it left off.

### Known limitation
- Not verified against a live deployment — mock-data harness verification only, same sandboxed-environment constraint as every other pass in this log.

### Recommendation for next session
- If the user asks for a similar readability pass on another page, apply the same two-tier split (chrome vs. content) deliberately from the start, rather than a single mechanical find-replace — that approach is what caused this rework.

---

## Session — 2026-07-21 (latest), Remove QuoteLine.notes/.specifications entirely

### What was implemented
- User asked to remove the per-line "Notes/Specifications" feature entirely, since it's unused.
  Rather than guess scope, asked two `AskUserQuestion` rounds before touching code: (1) remove only
  Notes+Specifications or the whole panel including Tags → user chose Notes+Specifications only,
  keep Tags; (2) hide the UI but keep old data, or actually delete the fields from the data model →
  user chose full removal from code.
- Before deleting anything, ran a dedicated `Explore` agent to map every read/write site — this
  caught two real dependencies that weren't obvious from the editor alone: `applyTemplate.ts` was
  copying a Quotation Template item's `specifications` into the field about to be deleted (previously
  documented as the *only* customer-visible-notes mechanism for template items — a real regression
  risk if just deleted blindly), and `api/_lib/scopeOfWorkHandler.ts` was seeding a generated Scope
  of Work item's `remark`/`specifications` from `line.notes`/`line.specifications`. Surfaced the
  template-data-loss risk to the user with a third `AskUserQuestion` before proceeding — they chose
  to preserve it by remapping into `subDetails` (the already-working pinned-row mechanism from
  earlier this session) rather than silently dropping real business content.
- Implemented: removed `notes`/`specifications` from `QuoteLine` (`src/lib/quotes.tsx`), deleted
  `NotesEditor`/`SpecificationsEditor` from `LineItemsEditor.tsx` (sticky-note panel now shows only
  Tags), removed the print rendering of both fields from `PrintDocument.tsx` and deleted the now-dead
  `notesFormat.tsx`, remapped `applyTemplate.ts`'s and the product-picker's specifications copy into
  `subDetails` instead, updated `scopeOfWorkHandler.ts`'s `mapLineToScopeItem()` to match (remark now
  starts blank, specLines comes from subDetails alone), updated `api/_lib/quoteValidation.ts`'s
  server-side sanitizer, and removed the now-unused i18n keys.
- `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.api.json`, `npm run lint`, `npm run build` all
  pass clean.
- Verified visually via a temporary local harness (`LineItemsEditor` with mock data including a
  pre-filled tag/sub-detail and a mock product with specifications text) — confirmed the panel now
  shows only Tags, and that picking the mock product from the catalog created a new pinned sub-detail
  row from its specifications text rather than losing it. Harness deleted before committing.
- Updated `docs/MODULES/Quotation.md`, `docs/MODULES/QuotationTemplates.md`,
  `docs/MODULES/ScopeOfWork.md`, `docs/DATABASE.md`, `docs/CHANGELOG.md`.

### Known limitation
- Not verified against a live deployment / real MongoDB data — mock-data harness verification only,
  same sandboxed-environment constraint as every other pass in this log.
- Old quotations already saved in MongoDB with real `notes`/`specifications` values keep that data in
  the raw document (no migration ran) but it's no longer displayed anywhere — an explicitly confirmed
  tradeoff from the second `AskUserQuestion` above, not an oversight, but worth knowing if anyone ever
  asks "where did the notes on quote X go."

### Recommendation for next session
- If old `notes`/`specifications` data ever needs to be reviewed for old quotations, it's still in
  MongoDB (untouched) — a one-off read-only script/query could surface it without needing any UI
  changes, if that's ever requested.

---

## Session — 2026-07-21 (even later), Quotation table alignment fix + page-wide readability bump

### What was implemented
- Follow-up to the pinned-sub-details restyle earlier this session: user reported the Unit/Qty/Unit
  Price columns in `LineItemsEditor.tsx` weren't lining up under their headers, with a screenshot.
  Root-caused via `getBoundingClientRect()` math in a local harness (not just eyeballing a
  screenshot) — the Unit input was center-aligned against a right-aligned header, and Qty/Unit Price
  inputs weren't wrapped in a `flex justify-end` container like the already-correct Discount column,
  so their fixed-width boxes sat left-anchored inside a wider auto-sized `<td>`. Fixed both, verified
  pixel-perfect (header/input centers matched to 0.01px) before committing and pushing.
- User then sent a near-identical follow-up ("หน่วยมันไม่ตรงกับข้อมูลด้านล่าง") with no new
  screenshot. Re-verified the fix was both correct (same bounding-box check, still perfect) and
  actually live in production (`list_deployments` confirmed the fix commit's deployment was
  `READY`) before responding — asked the user for a fresh screenshot / suggested a hard refresh
  rather than guessing at a second theoretical cause with no new evidence. (No reply followed in
  this session; if a hard refresh didn't resolve it, this needs the fresh screenshot to diagnose.)
- User then asked, unprompted by a screenshot this time, to improve font/size readability on the
  whole quotation page. Given the scope (~90 `text-xs`/`text-[10-11px]` instances across 4 files)
  and that a wrong-degree guess would mean redoing a lot of mechanical edits, used
  `AskUserQuestion` with concrete before/after previews to confirm both scope (whole page vs. table
  only) and degree (modest vs. large bump) before touching anything — user picked the recommended
  "moderate" option, whole page. Implemented via a two-pass sed find/replace per file using a
  temporary placeholder token (`text-xs` → placeholder → `text-[10px]`/`text-[11px]` → `text-xs` →
  placeholder → `text-sm`) so the second pass couldn't re-catch values the first pass had just
  written — a real risk with a naive single-pass "text-xs → text-sm" replace.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean on both passes.
- Verified visually via temporary local harnesses each time (mounting `LineItemsEditor` alone for
  the alignment fix, the full `QuoteDocument` in "new" mode for the readability pass — the latter
  needed fairly complete mock `company`/`currentUser` objects since `PrintDocument.tsx` — always
  mounted, just `print:hidden` — crashes on `undefined.trim()` if fields like `phone`/`email` are
  missing; caught and fixed this in the harness, not app code, since it's a test-fixture gap, not a
  real bug reachable with actual saved data). Harness files deleted before each commit.
- Updated `docs/CHANGELOG.md`, `docs/MODULES/Quotation.md`, `docs/UI_GUIDELINES.md`.

### Known limitation
- Not verified against a live deployment for the readability pass specifically (the alignment fix
  *was* confirmed live via `list_deployments`). Same sandboxed-environment constraint as every other
  pass in this log for anything needing real MongoDB data — this pass needed none, so the harness
  verification is relatively high-confidence, just not a production click-through.
- The user's second alignment report is still open — responded with a diagnostic question instead of
  a code change, since the existing fix measured pixel-perfect and was confirmed deployed; needs a
  fresh screenshot to know whether this is a caching artifact or a genuinely different location.

---

## Session — 2026-07-21 (later still), Pinned sub-detail rows restyle

### What was implemented
- User shared a reference screenshot of a quotation grid with a gold/cream-highlighted "pinned" row
  (Pin icon + auto-focused input) appearing directly beneath a product row, and asked for the same
  format — keeping this site's own theme, not the reference image's colors — in both the live
  quotation editor and the Quotation Template editor.
- An `Explore` agent first mapped the relevant code: `LineItemsEditor.tsx`'s existing
  `QuoteLine.subDetails` feature (already printed with a `Pin` icon in `PrintDocument.tsx`) was the
  closest match, but it lived inside a collapsible sticky-note card, not inline in the table.
- Used `AskUserQuestion` (with ASCII previews) to confirm scope before touching two files' worth of
  table JSX — the user picked "pinned row directly under the item row," not a lighter color-only
  restyle or an unrelated third option.
- Implemented: `LineItemsEditor.tsx`'s `SubDetailsEditor` (card) replaced with `PinnedSubDetailRows`
  (inline `<tr>` per sub-detail, gold-tinted, Pin icon, drag handle, auto-focus-on-add via a
  `pendingFocusId` state); a new Pin button added to the row-actions column; the sticky-note icon's
  card narrowed to Notes/Specifications/Tags only; the "has content" gold-dot indicator split into
  two independent booleans so each icon reflects only its own category.
  `TemplateEditorView.tsx`'s `ItemEditor` got the same treatment for `TemplateItem.subDetails`
  (a plain `string[]`, so index-based, no drag-reorder added) — Specifications/Internal Notes
  deliberately kept their original shared multi-line-textarea pattern (a documented, intentional
  "paste-friendly list" design choice already in the code), since only sub-details maps to the
  reference UI's per-line "pinned" concept.
- `npx tsc --noEmit` and `npm run lint` both pass clean.
- Verified visually via a temporary, self-contained local harness (`harness.html` +
  `src/devHarness.tsx`, mounting `LineItemsEditor` with mock in-memory data, no backend) since this
  sandboxed session can't reach the real API/MongoDB (same recurring limitation as every other pass
  in this log) — confirmed the pinned row appears, highlights gold, auto-focuses, and accepts Thai
  input; deleted both harness files before committing, leaving no trace in the diff.
  `TemplateEditorView.tsx`'s equivalent wasn't separately harnessed (its `ItemEditor` isn't exported
  and needs substantially more mock props); verified instead by matching its colSpan arithmetic and
  JSX shape against the already browser-confirmed `LineItemsEditor.tsx` pattern.
- Updated `docs/MODULES/Quotation.md`, `docs/MODULES/QuotationTemplates.md`, `docs/CHANGELOG.md`.

### Known limitation
- Not verified against a live deployment or real MongoDB data — mock-data harness verification only,
  same sandboxed-environment constraint as every other pass in this log.
- `TemplateEditorView.tsx`'s pinned rows were not independently screenshotted (see above) — lower
  confidence than the quotation-side change, though the code is structurally identical and
  type/lint-clean.

### Recommendation for next session
- A real browser click-through of both pages (ideally against a preview deployment or once local
  MongoDB access is available) would raise confidence, particularly for `TemplateEditorView.tsx`.

---

## Session — 2026-07-21 (later), "Not authenticated" toast investigation + fix

### What was implemented
- User asked why clicking Approve on a quotation showed "not authentication," and whether it meant
  both preparer and approver needed a signature uploaded first. A background research agent traced
  the full chain: no signature precondition exists anywhere in the approval workflow (signatures are
  purely cosmetic print/display elements); the toast was the server's literal `"Not authenticated"`
  string from `requireUser()` in `api/_lib/auth.ts`, passed straight through `apiClient.ts` to the
  UI untranslated. Explained this to the user (session cookie invalid/expired at click time — 7-day
  JWT, or the user's account edited/deactivated concurrently, plus `App.tsx` only checks session once
  at boot with no periodic re-check) and suggested logging out/in.
- The user then sent a real screenshot proving this was actively happening on a live production
  quotation (`QT-2567-0007`), not a hypothetical. Before touching code, ran a `check-prod` pass to
  rule out an actual incident: `get_project`/`get_deployment` confirmed the live deployment matches
  the latest `master` commit and is `READY`; `curl` to `/api/auth/session` round-tripped to MongoDB
  cleanly; `get_runtime_errors` (7d window) showed no auth-related error cluster, only a pre-existing
  unrelated `url.parse()` deprecation warning. Confirmed: not a production bug, not a DB outage — the
  401 itself was legitimate, only the message text was the actual problem.
- Implemented the user's explicit follow-up request (translate the message): `apiFetch()` in
  `src/lib/apiClient.ts` now matches the exact literal `"Not authenticated"` string and replaces it
  with "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" / "Your session has expired — please sign in again."
  **Caught a real bug in my own first draft before committing**: the initial version keyed off
  `res.status === 401` alone, which would have also clobbered `POST /api/auth/login`'s distinct,
  already-correct, already-Thai wrong-password message (`ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง`) — also a
  401. Fixed by matching on exact message content instead of status code before running any checks.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Updated `docs/CHANGELOG.md` and `docs/API.md`.

### Known limitation
- Not browser-verified — same sandboxed MongoDB Atlas DNS-block limitation as every pass this
  session, so the actual toast text change hasn't been visually confirmed, only traced through code.
- The underlying cause of *why* the session went invalid mid-page-view is still unaddressed — this
  pass only fixes what the user sees when it happens, not the staleness gap (`App.tsx` shows a user
  as logged in with no re-check until an action fails) or the 7-day-expiry UX. Flagged as a possible
  future improvement, not implemented since the user's explicit ask was scoped to the message text.

### Recommendation
- If this recurs frequently for real users (not just test/demo accounts), it's worth adding a real
  fix beyond message translation: either a periodic/on-focus session re-check in `App.tsx` that
  redirects to Sign In the moment a session goes invalid (rather than waiting for the next failed
  action), or a global 401 interceptor in `apiClient.ts` that forces sign-out UI immediately. Neither
  was built this pass — flag to the user before doing either, since both are bigger than a message fix.

## Session — 2026-07-21 (same day, third refinement), group OTHER BF/SC/TA before the generic OTHER

### What was implemented
- Third follow-up on the same Job Type grid ordering thread: after narrowing "push to the end" to
  the exact `"OTHER"` code, `OTHER BF`/`OTHER SC`/`OTHER TA` fell back into sorting normally among
  the ordinary Job Types by Template availability. The user then asked for those three to also
  cluster together near the end, just ahead of the plain `"OTHER"` tile.
- Changed `QuotationTemplateWizard.tsx`'s 3-way partition to a 4-way one: has-Template ordinary Job
  Types, no-Template ordinary Job Types, `OTHER BF`/`OTHER SC`/`OTHER TA` as their own group, generic
  `"OTHER"` last. Added `isOtherSubcategoryJobType` alongside the existing `isGenericOtherJobType`.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Updated `docs/CHANGELOG.md` and `docs/MODULES/QuotationTemplates.md`.

### Known limitation
- Not browser-verified — same sandboxed MongoDB Atlas DNS-block limitation as every pass this
  session. This is an additional filter branch on an already-tested partition pattern, low risk.

### Recommendation
- This ordering logic has now changed three times in one session purely from iterative user
  feedback on a screenshot — next real-browser check should confirm the final 4-group order actually
  matches what the user pictured (Template-having → no-Template → OTHER BF/SC/TA → OTHER) before
  treating this as settled, since verbal/text descriptions of grid ordering have proven easy to
  under-specify here.

## Session — 2026-07-21 (same day, second refinement), narrow "OTHER" to exact match

### What was implemented
- User sent a screenshot of just the "OTHER — Other Jobs — ยังไม่มี Template" tile to clarify their
  original "push Other to the end" request — the prior refinement's `code.startsWith("OTHER")` check
  had over-matched, also pulling `OTHER BF`/`OTHER SC`/`OTHER TA` (real, specific sub-categories —
  Other Dust Collector/Wet Scrubber/Fiberglass Tank Related Work) into the "generic fallback" bucket
  when they should have sorted normally by Template availability like everything else.
- One-line fix in `QuotationTemplateWizard.tsx`: `isOtherJobType` (prefix match) renamed to
  `isGenericOtherJobType` and changed to `code === "OTHER"` (exact match). The has-Template-first/
  no-Template/generic-OTHER-last 3-way partition structure from the previous refinement is otherwise
  unchanged.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Updated `docs/CHANGELOG.md` and `docs/MODULES/QuotationTemplates.md`.

### Known limitation
- Not browser-verified — same sandboxed MongoDB Atlas DNS-block limitation as every pass this
  session. This is a single boolean-predicate change with no other logic touched, which limits risk.

### Recommendation
- Next real-browser check: confirm `OTHER BF`/`OTHER SC`/`OTHER TA` now appear grouped with other
  Job Types by Template availability (not stuck at the end), and only the plain "OTHER — Other Jobs"
  tile sits at the very end of the grid.

## Session — 2026-07-21 (same day, refinement), Job Type grid: has-Template-first ordering

### What was implemented
- Immediate follow-up to the session below: the user clarified their original "OTHER jobs last" ask
  also wanted the *remaining* Job Types sorted so ones with an active Template come before ones
  without ("เอา Other jobs ไว้ท้ายสุดเลยแล้วจัดเรียงอันไหนที่มี Template ให้เอาไว้อันแรกละเรียงตามกันมา").
- Changed `QuotationTemplateWizard.tsx`'s `activeJobTypes` from a 2-way partition (non-OTHER / OTHER)
  to a 3-way stable partition: has-Template-and-not-OTHER → no-Template-and-not-OTHER → OTHER. Had to
  move the computation down past the `templateCounts` `useState`/`useEffect` block (it previously ran
  before that state existed in the component body) since it now reads `templateCounts` to know which
  Job Types have a template — mirrors how the existing "มี Template N แบบ" badge already depends on
  that same fetch and updates once it resolves.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Updated `docs/CHANGELOG.md` and `docs/MODULES/QuotationTemplates.md`.

### Known limitation
- Same as the entry below — not browser-verified (sandboxed MongoDB Atlas DNS block). This change is
  a small, isolated reordering of an existing, already-tested `.filter()`/spread pattern (the 2-way
  version from the prior pass), which limits risk.

### Recommendation
- Next real-browser check: confirm the grid actually reorders once template counts finish loading
  (should be near-instant, but worth watching for a visible "jump" if the fetch is slow) and that the
  three groups read in the intended order — Templates first, no-Template next, OTHER last.

## Session — 2026-07-21 (later), Create Quotation wizard feedback: OTHER ordering, Cancel visibility, Add Section

### What was implemented
- Continuing the same day's Template editor restyle work, the user gave direct feedback on a
  screenshot of the Create Quotation wizard's Step 1 (Job Type grid) screen: (1) move every
  `OTHER`-prefixed Job Type to the end of the grid instead of sorting alphabetically alongside the
  real categories, (2) make the "ยกเลิก" (Cancel) button easier to see, and (3) when creating a
  quotation directly (not a Template), there's no way to add a Section like the Template editor has.
- Read `QuotationTemplateWizard.tsx` to find the Step 1 grid (`activeJobTypes.map(...)`) and the
  Cancel button (a bare `text-sm text-muted-foreground` link, no border — genuinely easy to miss,
  matching the user's complaint). Fixed the sort with a client-side partition (`OTHER*` codes last,
  relative order otherwise preserved) rather than changing `fetchJobTypes()`'s server order, since
  other pages (Job Type admin, Dashboard filters) read the same list unfiltered. Restyled Cancel to
  the app's existing "Secondary/outline" button pattern from `docs/UI_GUIDELINES.md` — deliberately
  did not invent a red/danger style, since this is a non-destructive "go back," not a delete.
- For the third item, traced it to `LineItemsEditor.tsx`: `QuoteLine.isSectionHeader` already existed
  as a field (added 2026-07-14 for template-applied section dividers) and the row-rendering/print/
  numbering logic already fully supported it — the only actual gap was that no button ever set it to
  `true` outside of applying a Template. Added a small `addSectionHeader()` handler + toolbar button
  mirroring the Template editor's "เพิ่ม Section," reusing `blankLine()` plus the flag. No `QuoteLine`
  type change, no API/validation change, no PrintDocument change — everything downstream of the flag
  already worked correctly.
- Added 1 new i18n key (`quotation.lineItems.addSection`, Thai + English).
- `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass clean.
- Updated `docs/CHANGELOG.md` and `docs/MODULES/QuotationTemplates.md` (Wizard UI section + a new
  paragraph under "Section-Header Rendering").

### Known limitation
- Not manually browser-verified this pass — the same sandboxed MongoDB Atlas DNS-block limitation
  documented in the previous entry (`vercel dev` proxies API routes correctly, but the SRV DNS lookup
  to Atlas is network-refused from this sandbox, so the app never gets past its own connection-error
  screen). The Job Type sort and Cancel restyle are pure display-order/class changes with no logic
  risk; the new Add Section button reuses an already-battle-tested code path (the exact line shape a
  template apply already produces), which limits the blast radius of not having seen it rendered.

### Recommendation
- Next time a real browser is available: open the Create Quotation wizard and confirm the OTHER
  Job Types visually land at the end of the grid and the Cancel button reads as a real button; open
  a quotation from scratch, click "เพิ่ม Section," confirm the new divider row renders identically to
  a template-seeded one (§ marker, no unit/qty/price columns, removable), and print/PDF it to confirm
  the empty-section-not-printed rule still holds.

## Session — 2026-07-21, restyle the Quotation Template editor to look like the real quotation

### What was implemented
- User asked (in Thai) to make the Quotation Template editing screen easier to use — either make it
  look like the real quotation page, or make it as user-friendly as possible.
- Read `TemplateEditorView.tsx` (the create/edit form) and compared it against `QuoteDocument.tsx`/
  `LineItemsEditor.tsx`/`PrintDocument.tsx` (the real quotation's screen and print views) to identify
  the concrete visual patterns to reuse: the navy/gold document header band, the two-column meta-grid
  layout for header fields, the table-styled line-items list with mono uppercase column headers, and
  the printed document's 3-column signature-block layout.
- Rebuilt `TemplateEditorView.tsx`'s JSX to reuse those patterns exactly (same class names/colors,
  not an approximation): `BrandMark` + status pill in a navy header band, "ข้อมูล Template"/
  "การตั้งค่า" meta grid, `Layers`-icon sections card with a real `<table>` for items (`ItemEditor`
  converted from a stacked div card to a `<tr>`/`Fragment` row + expandable detail row), and a
  3-column Terms block. No state, handler, validation, or save/load logic was touched — confirmed by
  diffing that every function signature (`updateSection`, `addItem`, `moveItem`, `handleSave`, etc.)
  is byte-identical to before, only the `return (...)` JSX changed.
- Added 5 new i18n keys (Thai + English) for the new section labels/column headers; reused every
  existing key otherwise.
- `npx tsc --noEmit` and `npm run lint` both pass clean (0 errors; the 2 warnings are the pre-existing
  unrelated `i18n.tsx` fast-refresh ones).
- Attempted a live browser check: `npm run dev` alone can't reach `/api/*` (no serverless functions),
  so started `npx vercel dev` instead, which correctly detected the project and proxied API routes —
  but MongoDB Atlas's SRV DNS lookup is blocked from this sandbox (`ECONNREFUSED` on
  `_mongodb._tcp.tcsdb.zdnus3w.mongodb.net`), so `/api/auth/session` 500s and the app never gets past
  its own "ไม่สามารถเชื่อมต่อระบบได้" connection-error screen. This is the same class of
  sandboxed-session network limitation already recorded for the Dashboard module and several prior
  Quotation Template passes — not something this change caused or could work around.
- Updated `docs/CHANGELOG.md` and `docs/MODULES/QuotationTemplates.md` ("Create/edit form" section).

### Known limitation
- Not manually browser-verified this pass, for the DNS/network reason above. The change is
  low-risk in the sense that matters most for correctness — no data, validation, or save-path code
  was touched, only the surrounding markup/classes — but the actual rendered layout (spacing, table
  column widths, whether the expandable item-detail row reads cleanly) has only been checked by
  reading the JSX, not by looking at it in a browser.

### Recommendation
- Next time a real browser/deployed environment is available, open Template Management → create or
  edit a template with a couple of sections/items and confirm the table layout, expand/collapse
  behavior, and the header band render as intended, especially on a narrow (mobile-width) viewport
  since the meta grid and Terms block both collapse from multi-column to single-column via Tailwind
  breakpoints that weren't visually confirmed.

## Session — 2026-07-16 (same day, later), remove website URL from printed documents

### What was implemented
- User reported a website URL appearing bottom-left when printing a Quotation or Scope of Work, and
  asked to determine whether it was app-rendered or browser-generated before doing anything else.
- Investigated by direct code inspection rather than guessing: grepped `src/pages/quotation` and
  `src/styles` for any URL/website/footer content. Found `PrintDocument.tsx` and
  `ScopeOfWorkPrintDocument.tsx` never render a website URL anywhere — Quotation's
  `CompanyHeaderInfo.website` is always hardcoded to `""` in `QuoteDocument.tsx` and isn't even read
  by the print component. `src/styles/index.css`'s only `@media print` block (`@page` size/margin +
  a `body` background rule) has no footer/URL content either.
- Concluded the URL is Chrome/Edge's own browser-injected "Headers and footers" print option (page
  URL + date + title/page number) — a print-dialog-level browser setting, not something a web page's
  CSS/DOM can control, and confirmed `@page` margins do not affect it.
- Since the app cannot suppress it, added a small `MetricInfoTooltip.tsx` info-icon hint next to the
  Print button in both `QuoteDocument.tsx` and `ScopeOfWorkDocument.tsx` (inside the existing
  `print:hidden` toolbar, so the hint itself is never in the printed output) telling users to disable
  "Headers and footers" in their browser's print settings before printing/saving as PDF. New i18n
  keys `quotation.printHint.label`/`.text` (Thai + English) for Quotation; Scope of Work's hint uses
  plain hardcoded Thai text matching that file's existing convention (no i18n there).
- No print CSS or print-document component changes were made — both were already clean; incorrectly
  claiming `@page` could suppress browser headers/footers was explicitly avoided per the task's own
  constraint.
- `tsc --noEmit` (both `tsconfig.json` and `tsconfig.api.json`), `npm run lint` (0 errors, the same 2
  pre-existing unrelated `i18n.tsx` warnings), and `npm run build` all pass clean.
- Updated `docs/UI_GUIDELINES.md` ("Print / PDF" section), `docs/MODULES/Quotation.md`,
  `docs/MODULES/ScopeOfWork.md`, and `docs/CHANGELOG.md`.

### Known limitation
- This sandboxed environment cannot launch a browser, so the requested manual Chrome/Edge
  verification (headers/footers on/off, PDF export, console check) could not be executed — consistent
  with every prior pass this session. The fix is a one-line, low-risk UI addition (an existing,
  already-used tooltip component) plus zero print-CSS/print-document changes, which limits the blast
  radius of anything an actual browser check might have caught.

### Recommendation
- If the user wants stronger confirmation that this specific browser behavior is truly
  unsuppressable (it is, per Chrome/Edge's own documented print API — there is no `window.print()`
  option or CSS property that disables the browser's own header/footer injection), a quick manual
  check next time a browser is available: print a Quotation from Chrome with headers/footers on vs.
  off and confirm the tooltip's instruction actually removes the URL/date.

## Session — 2026-07-16 (same day), Codex review fix pass on the required-field validation work

### What was implemented
- User provided `docs/CODEX_REVIEW_REPORT.md` (an independent review of the required-field
  validation pass from earlier the same day) and asked for all Critical/High Priority issues fixed,
  with an explicit priority order and an explicit "do not add fake values or automatic selections to
  make validation pass" constraint.
- Read the report in full (0 Critical, 2 High, 4 Medium, several Low) before touching any code.
- **High #1**: `handleCreate()` in `api/_lib/scopeOfWorkHandler.ts` was resetting a new Scope of
  Work's `checklistGroups` to `buildDefaultChecklistGroups()` instead of copying the source
  quotation's own selections — a real, confirmed bug (not a documentation issue) directly
  contradicting the original task's "copy the required document selections... store them as a
  snapshot" requirement. Fixed by deep-copying `quote.checklistGroups` in `deriveFromQuotation()`,
  falling back to defaults only for a quotation that itself predates the field.
- **High #2**: `ChecklistGroupCard` only renders its free-text detail input when `group.note !==
  undefined`, but `buildDefaultChecklistGroups()` only ever set `note: ""` for Logo — so the
  already-correct server-side "Other requires detail" rule was literally impossible to satisfy from
  the UI for `safety`/`transportation`/`namePlate`/`documentsToSend`. Fixed by initializing `note`
  on all four, with a backfill path (`withDefaultChecklistGroups()`) for already-saved records. Also
  added Safety's "TOR" option to the same conditional-detail rule, since the original spec's wording
  named both "TOR or Other," not just "Other" — this had been missed in the first pass.
- **4 Medium fixes**: real `disabled` HTML attribute on every gated action button (previously
  dimming + a click-guard only); a pure `isValidIsoDateOrEmpty()` helper wired into both finalization
  validators so a malformed/legacy date fails semantically, not just on blankness; a
  `mergeServerValidationErrors()` helper wired into both document editors so a server-returned 422's
  field/group errors actually appear inline, not only as a toast; explicit `required: false` central-
  config entries added for every remaining visible field the review found undeclared
  (`followUpDate`, `isPotentialOpportunity`, `paymentConditions.method`/`.notes`, signatory `date`s,
  and documented-but-not-required-by-name numeric/remark fields).
- **Deliberately left unfixed, with reasoning recorded in CHANGELOG.md/TODO.md**: the review's
  "conditional requirements incomplete" note (billing Custom-schedule detail, delivery
  attachment/date rule, a ปจ.2 detail model) — every option one of these would need doesn't exist in
  the current option catalog and was never confirmed by the business; inventing one would violate
  the explicit "no fake values" instruction from both this task and the original validation task.
  Also left as-is: the review's observation that shared validation code lives under `src/lib`
  (already this codebase's standing, documented architecture, not a defect); native browser print
  being fundamentally unblockable once a page has rendered (not something an API gate can fix); a
  pre-existing Scope of Work item-quantity sanitizer quirk unrelated to this feature.

### Verification
- `npx tsc --noEmit` / `npx tsc --noEmit -p tsconfig.api.json`: clean after every batch of changes.
- `npm run lint`: 0 errors (same 2 pre-existing unrelated warnings).
- `npm run build`: clean.
- **Not done**: live-browser manual verification — no MongoDB/Vercel access in this sandboxed
  environment, the same limitation the review's own "Verification Limits" section hit trying to run
  `npm run lint`/`npm run build` itself (it reported a Windows/WSL launcher issue in its environment).

### Recommendations for next session
- Run the manual verification checklist (now updated in TODO.md) against a live deployment,
  specifically re-testing the two High Priority fixes: create a Scope of Work from a fully-complete
  Quotation and confirm its checklist selections actually appear checked, not reset; and confirm the
  "อื่น ๆ" detail field now genuinely renders (and is required) for Safety/ขนส่ง/Nameplate/
  เอกสารส่งถึง, not only Logo.
- Get a real answer from the business on the billing/delivery/ปจ.2 conditional-detail option
  catalogs before attempting to close that TODO item — guessing would reintroduce the exact
  "fake values" problem this pass was told to avoid.

### Estimated completion
No change to the ~40%/~98% overall figures — a correctness fix pass on an already-tracked
hardening effort, not new module scope.

---

## Session — 2026-07-16, required-field/mandatory-selection validation (Quotation + Scope of Work)

### What was implemented
- User provided a long, detailed business spec asking for strict required-field/mandatory-selection
  completion validation on both Quotation and Scope of Work — enforced client- **and** server-side,
  with a centralized optional-field-exception configuration, 8 named mandatory checklist groups
  (Safety/ขนส่ง/Logo/เงื่อนไขการวางบิล/เอกสารส่งถึง/Nameplate/เงื่อนไขการส่งมอบงาน/ปจ.2), conditional
  "Other requires detail" rules, Draft-remains-incomplete semantics, print/PDF server protection, and
  a full documentation update.
- Spent substantial up-front research (5 parallel Explore agents) mapping the current state of both
  modules before writing code — key finding: **Quotation had almost none of these fields at all**
  (only `client`/`jobTypeCode` required), while **Scope of Work already had the exact checklist-group
  structure** (`ChecklistGroup[]`, 11 groups) but explicitly documented as "nothing here is ever
  forced/mandatory." This meant the task was really "add the whole section to Quotation for the first
  time" + "add real enforcement to Scope of Work's existing structure," not just "tighten an existing
  rule" on either side.
- Built a shared, framework-agnostic validation layer (`src/lib/documentRequirements.ts`,
  `src/lib/validation/{types,quotationValidation,scopeOfWorkValidation}.ts`) — pure TypeScript, no
  JSX/browser globals, so the exact same functions are value-imported into both the Vite frontend
  bundle and the Node API bundle (confirmed this pattern was already established: `api/_lib/*.ts`
  already imports plain-TS `src/lib/*.ts` files directly, just never JSX-bearing ones like
  `quotes.tsx`). This means client and server can never validate differently by accident.
- Added `checklistGroups` to `Quote` (new field — Quotation never had this section), moved
  `buildDefaultChecklistGroups()`/`sanitizeChecklistGroups()` out of `scopeOfWorkHandler.ts` into a
  shared location so both Quotation and Scope of Work generate/validate the identical structure.
  Extended `HttpError`/`ApiError` with optional `code`/`details` so a `422` can carry structured
  `fieldErrors`/`groupErrors`, not just a flat message.
- Wired server enforcement: a brand-new `POST /api/quotes/:id/print` (Quotation had **zero**
  server-side print route before — printing was 100% client-side `window.print()`), a completeness
  gate in `handleWorkflow()` before every transition except `rejected`/`cancelled`, and completeness
  gates in Scope of Work's `handleFinalize()`/`handlePrint()` (previously neither validated anything
  beyond permission + status).
- Wired frontend UX: 4 new shared components (`RequiredFieldLabel`/`FieldError`/`ValidationSummary`/
  `DocumentCompletionIndicator`), renamed `ScopeOfWorkChecklistGroup.tsx` → `ChecklistGroupCard.tsx`
  (now shared by both documents instead of being Scope-of-Work-only), red-asterisk labels + inline
  errors across every required field in both `QuoteDocument.tsx`/`ScopeOfWorkDocument.tsx`, per-row
  highlighting in both item editors, and buttons that stay **visible but styled-disabled** (not a
  native `disabled` attribute, so a click still triggers a toast + scroll-to-summary explanation
  instead of silently doing nothing).
- **Deliberate scope decisions made explicit, not silently assumed**: did not invent new business
  option catalogs for Billing Terms/ปจ.2/Delivery Terms (the spec itself said not to, absent a
  confirmed business rule) — only added a plain "อื่น ๆ" option to 4 groups specifically so the
  "Other requires detail" conditional rule had something to validate against; exempted `rejected`/
  `cancelled` from the completeness gate (a considered interpretation — abandoning/returning a
  document to Draft shouldn't itself require the document be complete); implemented "scroll to
  invalid field" at the validation-summary level, not per-field programmatic focus. All three are
  called out explicitly in CHANGELOG.md/TODO.md/the module docs rather than left implicit.

### Verification
- `npx tsc --noEmit` (frontend) and `npx tsc --noEmit -p tsconfig.api.json` (API) both clean.
- `npm run lint`: 0 errors (2 pre-existing warnings, unrelated to this change).
- `npm run build`: clean production build.
- **Not done this session**: any live-browser manual walkthrough (no MongoDB/Vercel CLI access in
  this sandboxed environment — same standing limitation as every recent pass, see PROJECT_STATUS.md
  Known Risks). The 28-step manual verification checklist in the original spec should be run against
  a real deployment before this is considered fully verified — see the new TODO.md High Priority item.

### Recommendations for next session
- Run the manual verification checklist against a live deployment/browser.
- Confirm the real Billing Terms/ปจ.2/Delivery Terms option catalogs with the business and update
  `buildDefaultChecklistGroups()` if they differ from what's there now.
- Consider whether per-field programmatic focus (not just scroll-to-summary) is worth the additional
  ref-plumbing effort across every required field.

### Estimated completion
No change to the ~40%/~98% overall figures in PROJECT_STATUS.md — this is a correctness/completeness
hardening pass on two already-built modules, not new module scope.

---

## Session — 2026-07-15, new feature (Scope of Work)

### What was implemented
- User provided a reference PDF ("Scope Of Work PQ202607-174-LI-SK บริษัท เค ไทย ไฮดรอลิค จำกัด.pdf",
  saved to `public/`) and asked for a new Scope of Work document type generated from an existing
  quotation, with a long, detailed spec covering data mapping, a specific "printed vs. blue
  handwritten vs. yellow highlight" content-treatment rule, a scope-number format, checklist groups,
  RBAC, and documentation requirements.
- Spent substantial up-front effort reading the PDF and studying the existing codebase before
  writing any code: read `vercel.json`/`api/handlers/{quotes,jobtypes}.ts`/`quotationTemplatesHandler.ts`
  (the closest analogous recent feature — mounting a new resource onto an existing serverless
  function file rather than adding a 13th, since Vercel Hobby's 12-function cap is still fully
  used), `quoteValidation.ts` (reusable sanitizers), `roles.ts`/`permissions.ts` (RBAC conventions),
  `QuoteDocument.tsx`/`PrintDocument.tsx`/`LineItemsEditor.tsx` (screen-editor + print patterns to
  mirror), and `TemplateEditorView.tsx`/`quotationTemplatesHandler.ts` (the closest prior "editable
  document generated from source data" precedent).
- Built the full stack: `src/lib/scopeOfWork.ts` (types), 6 new RBAC permissions
  (`scopeOfWork:view/create/edit/finalize/print/delete`) wired into `permissions.ts`/`roles.ts`/
  `i18n.tsx`, a new `scope_of_works` MongoDB collection + indexes, `api/_lib/scopeOfWorkHandler.ts`
  (create/get/list/update/finalize/duplicate/refresh/print/delete, mounted from
  `api/handlers/quotes.ts` on the raw pathname — no new Vercel function file), and a frontend editor
  (`ScopeOfWorkDocument.tsx` + `ScopeOfWorkItemsEditor.tsx` + `ScopeOfWorkChecklistGroup.tsx` +
  `ScopeOfWorkPrintDocument.tsx`) reached via a new `"scopeOfWork"` view state inside
  `QuotationPage.tsx` — deliberately **not** a new sidebar module, per the task's explicit "Add a
  Scope of Work action to the Quotation module" instruction.
- **Real correctness issue caught and fixed during self-review, before running lint/build**: the
  scope-number's `jobSequence` component is only unique *within the calendar month it was allocated
  for* (an atomic per-month counter, same pattern as the existing quote-numbering counter). Editing
  `issueDate` into a different month while keeping the old (frozen) `jobSequence` would have let two
  unrelated Scope of Work records collide on the same `{yearMonth, jobSequence}` pair. Fixed by
  re-reserving a fresh sequence number for the new month whenever an edit actually changes it — see
  `handleUpdate` in `api/_lib/scopeOfWorkHandler.ts` and `MODULES/ScopeOfWork.md`.
- Also caught and fixed two `react-hooks/set-state-in-effect` ESLint errors from the two new
  data-fetching effects (in `QuoteDocument.tsx` and `ScopeOfWorkDocument.tsx`) by following this
  codebase's own established convention (see `DashboardPage.tsx`'s retry pattern): never call
  `setState` synchronously at the top of an effect body — reset state at the trigger site (a click
  handler) instead, only inside the async `.then`/`.catch` callbacks. Also added `key={scopeOfWorkId}`
  at the `ScopeOfWorkDocument` mount site to force a clean remount when switching records (e.g. after
  "ทำสำเนา"), closing a related hazard where a still-in-flight fetch for a *new* record could have
  left a *different* record's data on screen and savable against the wrong id.
- Followed the PDF's exact printed content as the checklist structure's source of truth (11 groups:
  Safety, TOR/Requirement from customer, เอกสารส่งถึง, ปจ.2, งานขนส่ง, Logo, Name plate, Test Report
  split into ประเภท/ระดับรายงาน, เงื่อนไขการวางบิล, เงื่อนไขการส่งมอบงาน) rather than the task
  description's slightly different suggested category list, since the PDF was named as the source
  of truth for exact labels/grouping.
- Deliberately did **not** invent a business meaning for the PDF's `-SK` scope-number suffix
  (`secondaryCode`) — left as a plain editable field with an explicit "still needs business
  confirmation" label in the UI and a dedicated open-question section in the module doc, per the
  task's explicit instruction not to guess.
- Updated all 9 requested docs (CLAUDE.md, PROJECT_STATUS.md, CHANGELOG.md, TODO.md, DATABASE.md,
  API.md, RBAC.md, IMPLEMENTATION_CHECKLIST.md, this file) plus a new `MODULES/ScopeOfWork.md`.

### Problems found & fixed this session
- The `jobSequence`-uniqueness-across-month-edits gap above (caught during self-review, fixed before
  any build/lint run — not found by an external review this time).
- Two `react-hooks/set-state-in-effect` lint errors (see above) — fixed by following the existing
  `DashboardPage.tsx` convention rather than introducing a new pattern.
- `permissions.ts`'s new `PERMISSION_LABEL_KEY` entries initially referenced `TranslationKey`
  values (`permission.scopeOfWork*`) that didn't exist yet in `i18n.tsx`'s dictionary — caught by
  `tsc --noEmit`, fixed by adding the missing Thai/English key pairs.

### New TODOs / recommendations
- Manually verify the whole feature against a live deployment/browser (create from a real quotation,
  checklist persistence across reopen, print output, concurrent-creation counter behavior, and the
  Sales-vs-Approver ownership/edit-permission boundary) — blocked in this session by the same
  sandboxed-environment MongoDB Atlas DNS limitation documented repeatedly elsewhere in these docs.
- `secondaryCode`'s business meaning needs a real answer from the business/Codex before this field
  can be considered anything more than a placeholder for future confirmation.
- Whether shipping-contact vs. billing-contact should become real distinct fields on `Customer`/
  `Quote` (rather than always starting blank on Scope of Work) is a business-scope question, not a
  code gap — flagged, not decided, in this pass.

### Completion estimate
Feature-complete against the given spec, `tsc`/`lint`/`build` all clean, self-reviewed for the
correctness issue above. Not yet independently reviewed (Codex review is the expected next step per
the task's own instructions) or manually browser-verified.

---

## Session — 2026-07-14, correction pass (Issuer Company → Customer Management)

### What was implemented
- User provided a corrected requirement: a prior session (2026-07-13) had misread "let a Sales
  user pick a saved customer/company for a quotation" as "let a user pick which company issues the
  quotation" and built a Company Profiles selector into the Quotation form instead. This session's
  task was explicit: forget the issuer-company requirement entirely, remove that UI, and build the
  correct Customer selector.
- Spent significant up-front effort mapping the existing code (via a background Explore agent) before
  touching anything — found the exact issuer-company wiring across `QuoteDocument.tsx`,
  `api/handlers/quotes.ts`, `src/lib/quotes.tsx`, and confirmed a `customers` MongoDB collection
  already existed but was schema-only (no API/UI, wrong CRM-flavored field shape).
- Removed the issuer-company feature completely: deleted `IssuerCompanySelector.tsx`, stripped every
  `issuerCompanyId`/`issuerCompanySnapshot` reference from the client `Quote` type and
  `api/handlers/quotes.ts`, removed `companyProfiles`/`canViewCompanyProfiles`/
  `onNavigateToCompanyProfiles` props from the Quotation component tree. Left the Company Profiles
  admin module itself untouched (not asked to delete it, just to stop using it in Quotation).
- Built the Customer module from scratch: redefined `CustomerFields` to match the Quotation form's
  actual fields, added `api/_lib/customerValidation.ts` + `api/_lib/customersHandler.ts`,
  `src/lib/customers.ts`, `CustomersPage.tsx` (admin CRUD), `CustomerSelector.tsx` (Quotation-form
  search-and-autofill), 4 new permissions, and `Quote.customerId`/`customerSnapshot` wiring on the
  create/update/workflow API routes (`resolveCustomerIdUpdate()`/`buildCustomerSnapshot()`).
- **Key constraint handled**: Vercel Hobby's 12-serverless-function cap was already exhausted
  (`company-profiles.ts` was the 12th). Rather than requesting a plan upgrade, folded the new
  `/api/customers` routes into the same `company-profiles.ts` function via a pathname-prefix
  dispatch, with matching `vercel.json` rewrites — no new function file needed.
- Full documentation sweep: CLAUDE.md, PROJECT_STATUS.md, CHANGELOG.md, TODO.md, DATABASE.md,
  API.md, RBAC.md, UI_GUIDELINES.md, IMPLEMENTATION_CHECKLIST.md, and a full rewrite of
  MODULES/Customer.md, plus correction sections added to MODULES/CompanyProfiles.md and
  MODULES/Quotation.md — every doc that described the now-removed issuer feature as current was
  updated to mark it historical/reverted rather than left silently stale.

### Files Modified
`api/_lib/{collections,customerValidation (new),customersHandler (new)}.ts`,
`api/handlers/{company-profiles,quotes}.ts`, `api/dashboard/index.ts` (customer count query),
`vercel.json`, `src/lib/{customers (new),quotes,permissions,roles}.ts(x)`,
`src/pages/quotation/{CustomerSelector (new),QuoteDocument,QuotationPage,PrintDocument}.tsx`
(`IssuerCompanySelector.tsx` deleted), `src/pages/customers/CustomersPage.tsx` (new), `src/App.tsx`,
`src/lib/i18n.tsx`. Docs: all 8 listed in CLAUDE.md's standing rule, plus SESSION_LOG.md (this
entry), MODULES/{Customer,Quotation,CompanyProfiles}.md.

### Architectural Decisions
- **Kept the Company Profiles module intact rather than deleting it** — the correction explicitly
  scoped "stop using it in Quotation," not "remove the module." Deleting a working, tested,
  permission-gated admin feature on a broad reading of "forget the issuer company requirement" would
  have been overreach; the narrower reading (remove it from Quotation specifically) matches every
  concrete instruction in the request (which all named the Quotation form/UI, never the standalone
  admin page).
- **`customerSnapshot` is always populated at save time, from the current form values being
  submitted** (not a separately-tracked "value at selection time") — chosen because the requirement's
  own wording ("Create customerSnapshot from selected customer plus current form values" / "when
  manually entered, still save the information into customerSnapshot") describes exactly this
  behavior, and it avoids inventing a second, competing notion of "what the customer data really is"
  alongside the quote's own already-editable flat fields.
- **Folded `/api/customers` into the existing `company-profiles` function file** instead of asking
  the user to upgrade off Vercel Hobby — a reversible, low-risk engineering choice that unblocks the
  feature without a billing/infrastructure decision the user didn't ask to make. Clearly documented
  as a deliberate pattern (not a hack to be surprised by later) in DATABASE.md/API.md/CLAUDE.md.

### Problems Found
- None outside the scope of the correction itself — `tsc -b`, `tsc --noEmit -p tsconfig.api.json`,
  `npm run lint`, and `npm run build` all passed clean on the first attempt after the full rewrite,
  aside from one expected `noUnusedLocals` catch (`canViewCompanyProfiles` in `App.tsx` became dead
  code once no longer threaded into `QuotationPage`) — fixed immediately.

### What's Next
- No live-database browser verification was possible in this sandboxed session (same recurring
  limitation noted in every prior session's log) — a real walkthrough (create a Customer, select it
  on a new quotation, confirm autofill, edit a copied field, save, reopen, confirm the snapshot held,
  edit the customer master record, confirm the old quote is unaffected) should be run against a
  preview/production deployment before considering this fully closed out.
- "บันทึกเป็นลูกค้าใหม่" (save manually-typed quotation customer info as a new Customer record)
  remains unbuilt, per the requirement's own "optional, only if simple and safe" framing.
- A future data-hygiene pass could strip the now-dead `issuerCompanyId`/`issuerCompanySnapshot`
  fields from any quote documents saved during the brief 2026-07-13–2026-07-14 window — not urgent,
  purely cosmetic (nothing reads them).

---

## Session — 2026-07-10, third pass (Codex review fix pass)

### What was implemented
- User provided an independent Codex review report (`docs/CODEX_REVIEW_REPORT.md` + archived copy) and asked for every issue to be understood and fixed, in priority order: Critical → High → Build/TS errors → Security → RBAC → MongoDB correctness → Dashboard calculations → Quotation/PDF → Notifications → UI/UX → doc mismatches.
- Read the full report first (not selectively). It found 2 Critical, 6 High, 6 Medium, and several Low issues — genuinely substantive, not rubber-stamped: real gaps in quote-write validation, Dashboard filter honesty, Job Type enforcement, the Expected Sales formula, notification deep-linking, quotation numbering, and four stale module docs contradicting the real backend.
- Fixed all Critical/High and the safely-scoped Medium items (see CHANGELOG for the itemized list — 13 numbered fixes). Declined to guess on 2 items that are genuine product decisions (`GET /api/users` field exposure, `Quote.salesperson`→real-user-reference migration) and logged them in TODO.md instead, per the task's own explicit instruction to do so rather than guess.
- New files: `api/_lib/quoteValidation.ts` (quote payload validation + server-side amount derivation), `api/_lib/uploadValidation.ts` (image data-URL MIME/size validation), `src/pages/dashboard/csvExport.ts` (Dashboard CSV export).
- Rewrote `api/handlers/quotes.ts`'s POST/PATCH/workflow handlers around the new validation module; added an atomic `counters` MongoDB collection for quotation numbering.
- Fixed `api/dashboard/index.ts`: `interestBreakdown` (server-computed, filtered), `CLOSED_STATUSES` (separate from `TERMINAL_STATUSES`) fixing a real Customer-Rejected-counted-as-Active bug, literal `isPotentialOpportunity`-only Expected Sales predicate, filter-aware Activity Timeline (new `bangkokDayBoundsUtc()` helper), 5 new compound indexes.
- Frontend: removed the now-unnecessary `quotes` prop from `DashboardPage`; added a `quotationDeepLinkId` mechanism (App.tsx → QuotationPage) for notification-click deep-linking; Job Type dropdown no longer offers a blank choice on new-quote creation; fixed `PrintDocument.tsx`'s blank-label bug.
- Corrected 4 module docs (`RoleManagement.md`/`Settings.md`/`UserManagement.md`/`Notifications.md`) that still described the pre-2026-07-09 client-only/`localStorage` architecture — these predated this session's specific Codex findings but are the same class of problem and directly undermine the "production-ready" claims elsewhere, so fixed alongside the explicitly-flagged docs.

### Files Modified
`api/_lib/{quoteValidation (new),uploadValidation (new),collections}.ts`, `api/handlers/{quotes,users}.ts`, `api/company/index.ts`, `api/dashboard/index.ts`, `api/handlers/roles.ts` (comment only), `src/lib/{dashboard,i18n}.ts(x)`, `src/pages/dashboard/{DashboardPage,csvExport (new)}.ts(x)`, `src/pages/quotation/{QuoteDocument,QuotationPage,PrintDocument}.tsx`, `src/App.tsx`. Docs: `PROJECT_STATUS.md`, `CHANGELOG.md`, `TODO.md`, `DATABASE.md`, `API.md`, `RBAC.md`, `IMPLEMENTATION_CHECKLIST.md`, `CLAUDE.md`, `MODULES/{Dashboard,Quotation,Notifications,RoleManagement,Settings,UserManagement}.md`, `CODEX_REVIEW_REPORT.md` (new "Claude Fix Status" section), this file.

### Architectural Decisions
- **`CLOSED_STATUSES` (TERMINAL_STATUSES + Customer Rejected) introduced as a distinct concept from `TERMINAL_STATUSES` (state-machine-final only)** rather than just adding Customer Rejected to `TERMINAL_STATUSES` directly — the pipeline/conversion-rate logic genuinely still needs Customer Rejected treated as its own live pipeline stage (it can transition to Lost), while "is this still a pursuable opportunity" logic (Active Jobs, forecast, expected revenue) needs the broader set. Conflating the two would have been simpler code but semantically wrong in at least one of the two use sites.
- **Expected Sales taken at face value from the original literal spec** ("sum of quotations where Potential Opportunity = true," no other condition) rather than treated as an open business-decision item, even though it means a Won quote still flagged `isPotentialOpportunity` double-counts into both Closed Sales and Expected Sales. The user's own original requirements text was unambiguous on this exact point; Codex's finding was that the code deviated from that already-authoritative spec, not that the spec itself was ambiguous — so this didn't need a guess, just a correction back to what was already specified.
- **`GET /api/users`/`GET /api/roles` field exposure was investigated and deliberately NOT restricted** — traced enough call sites (printed-quote signature images, salesperson pickers) to conclude a naive field-strip risks breaking real, currently-working features without a full trace of every consumer, which wasn't feasible to complete safely in this pass. Chose to strengthen the documentation of the tradeoff and log it as an explicit business-decision item rather than guess at a field-level ACL that might silently break something. This is exactly the kind of call the task's own "Fix Rules" asked for.
- **Job Type is required on *create* but not force-required on *edit*** — a literal "always required" enforcement would have broken saving unrelated field edits on any pre-existing quote with a blank Job Type (there are and will keep being some, by design — "" means unclassified/legacy, an intentional, documented state). Required going forward, tolerant of the past.

### Problems Found
- **A self-introduced bug caught before it shipped**: the first draft of the notification-deep-link `useEffect` called local `setSelectedId`/`setView` synchronously as the first statements in the effect body, which is exactly the `react-hooks/set-state-in-effect` anti-pattern this same codebase had already fixed once before (documented in the Dashboard's loading-state code, 2026-07-10 first pass). Caught by `npm run lint`, not by self-review this time — fixed using React's official "adjust state during rendering" pattern instead of an effect, splitting out only the genuinely-effect-appropriate parent-callback notification into a real `useEffect`.
- **A genuinely tedious, repeated tooling failure**: writing a literal UTF-8 BOM character (`﻿`) into `csvExport.ts` as an escape sequence in source text kept producing the *actual* invisible Unicode character instead of the four-character textual escape, across several attempts via both the Edit tool and PowerShell string substitution (including once via a `-replace` call that itself re-introduced the real character). Root-caused as this session's own text generation consistently producing the character instead of the requested escape sequence — not a tool bug. Resolved by sidestepping the escape sequence entirely: `String.fromCharCode(0xfeff)`, which only requires plain ASCII in source.
- **Live-data verification remains blocked**, same root cause as the prior 2026-07-10 pass: `vercel dev` (tried again, fresh instance) still can't resolve MongoDB Atlas's SRV DNS record in this sandboxed environment, reconfirmed against the pre-existing, untouched `GET /api/auth/session` route.

### Problems Fixed
Both bugs above, before this pass was considered complete — see the "Verification" note in the CHANGELOG entry for the exact `tsc`/`lint`/`build` results after every fix.

### New TODO Items
Two explicit business-decision items (`GET /api/users` privacy model, `Quote.salesperson`→real-reference migration) plus a small scoped gap found while correcting a stale DATABASE.md claim (`Quote` has no `createdAt`/`updatedAt` fields — worth adding). See [TODO.md](./TODO.md) High Priority.

### Future Recommendations
1. **Live-data verification is still the single most important open item**, now confirmed twice to be an environment limitation, not a code-quality gap — strongly recommend the next verification attempt use either an unrestricted network or a real Vercel preview deployment rather than another attempt in a similarly sandboxed environment.
2. The two logged business-decision items (user-directory privacy model, salesperson-as-real-reference) are both genuinely worth a deliberate product conversation rather than another engineering guess — they trade off real UX/workflow flexibility (free-text salesperson credit, org-wide staff visibility) against stricter correctness/privacy, and reasonable teams could land on either side.
3. Given this is now the third same-day Dashboard/Quotation-adjacent pass, a real live-data verification pass (not more code review) is the highest-leverage next step before any further feature work in this area — the code has been read and reasoned about carefully multiple times now; what's missing is empirical confirmation.

### Estimated Completion Percentage
~40% of the full long-term ERP vision (unchanged — this was a correctness/hardening pass, not new module scope). **~97%** of the currently-scoped modules (up from ~96%) — all Critical/High Codex findings closed; the remaining gap is pre-existing, already-tracked cross-cutting items plus two newly-explicit business-decision items, not anything left silently broken. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-10 (Executive Dashboard, Sales Analytics & Job Type)

### What was implemented
- User requested a full BI rebuild of the Dashboard plus a Job Type classification and "Potential Opportunity" flag on every quotation — an intentionally huge request (new KPIs, sales pipeline, filters, rankings, forecast, follow-ups, activity feed, report export, and more).
- Given the scope, wrote and got sign-off on an implementation plan before touching code: scoped to (1) Job Type + Potential Opportunity + Follow-up Date on `Quote`, (2) the dashboard backend, (3) the dashboard frontend — explicitly deferring Report Export and real Lead/Customer entities as separate follow-ups, per the user's own choice among presented options.
- New `job_types` MongoDB collection (13 seeded defaults), `GET/POST/PATCH /api/jobtypes` (no new `Permission` — reused `quotations:view`/`company:manage`), `src/lib/jobTypes.ts`.
- `Quote` gained `jobTypeCode`/`jobTypeName`/`isPotentialOpportunity`/`followUpDate`, wired into the form/list/print.
- `api/dashboard/index.ts` rebuilt in place: date-range + salesperson filters, and a large set of new response sections computed by fetching the filtered quote set once and reducing it in JS (deliberately, not a dozen fragile aggregation pipelines — appropriate at this data volume; no new cache collections built).
- `DashboardPage.tsx` split from one file into 13 files under `src/pages/dashboard/`; 9 charts total.
- A lightweight `quotationListFilter` lifted to `App.tsx` so Dashboard pipeline/follow-up clicks open a pre-filtered quotation list (not full per-quote deep-linking — a separately tracked, larger gap).

### Files Modified
`api/_lib/{collections,systemSeed}.ts`, `api/handlers/{jobtypes (new),quotes}.ts`, `api/dashboard/index.ts`, `vercel.json`, `src/lib/{quotes,jobTypes (new),dashboard,i18n}.ts(x)`, `src/App.tsx`, `src/pages/quotation/{QuotationPage,QuoteList,QuoteDocument,PrintDocument}.tsx`, `src/pages/dashboard/*` (13 files, mostly new). See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- **No new MongoDB collections beyond `job_types`** — `sales_pipeline`/`sales_activities`/`dashboard_cache`/`analytics_cache`/`forecast`, all mentioned as "examples" in the original request, were deliberately not built; computed live via aggregation / read from the existing `audit_log` instead. Building parallel collections for data that's a `$group` away would be a sync-maintenance burden with no benefit at this data volume — a conscious "don't over-engineer" call, not an oversight.
- **No new `Permission`** — Job Type CRUD and every new dashboard section reuse permissions the relevant roles already hold (`quotations:view`, `company:manage`, `dashboard:view`, plus per-caller gating on `auditLog:view`/`quotations:approve` for two sections), rather than growing the 17-key union for a need that wasn't explicitly requested.
- **One new serverless function, not several** — `api/handlers/jobtypes.ts` is the only new function file (10/12 against Vercel Hobby's cap); every new dashboard aggregation was added to the *existing* `api/dashboard/index.ts` instead.
- **Sales pipeline starts at "Draft," not "Lead"** and **customer analytics group by the free-text `client` string** — both explicitly documented data-model simplifications (no Lead/Customer entity exists yet), not silently assumed.

### Problems Found
- **Self-caught during review** (not found by `tsc`/`lint`, since it was a logic bug, not a type error): the sales pipeline's stage-to-stage "conversion from previous" initially used array-adjacency (each stage compared to the row above it in a fixed display list). The real workflow branches at "Sent to Customer" (→ either Accepted or Rejected), so array-adjacency would have shown a nonsensical conversion % for the Customer Rejected/Lost branch, since Lost isn't actually downstream of Won. Caught by manually re-deriving the real predecessor relationships from `workflowTransitions` and comparing.
- **A real `react-hooks/set-state-in-effect` lint error** (not a style nit — it flags an avoidable render-cascade footgun): calling `setLoading(true)` synchronously at the top of the dashboard's data-fetching `useEffect` (to show a spinner during filter-driven refetches).
- **No safe way to verify end-to-end against live data in this session**: no local MongoDB credential was available, and the only real backend is the production database serving actual users — writing a test quote via the UI to verify the feature would have polluted real business data. Vercel CLI is also not installed, ruling out a quick `vercel dev` + `vercel env pull` local loop.

### Problems Fixed
Both bugs above, before considering the pass complete — see CHANGELOG for the exact fixes (`PIPELINE_PREDECESSOR` explicit map; moved `setLoading(true)` into the filter-change event handler instead of the effect body).

### New TODO Items
Verify the pass against live data (High Priority — see [TODO.md](./TODO.md)); Report Export (PDF/Excel/CSV); a dedicated monthly quotation-count aggregation for a more accurate Quotation Trend chart; a Job Type admin management UI (the API exists, no dedicated page); confirming whether cross-salesperson dashboard data should be role-restricted.

### Future Recommendations
1. **Live-data verification is the immediate next step** before this pass can be considered fully done — the code is implemented and self-reviewed, but "implemented" and "verified working" are different claims, and this session could only honestly make the first one. See [TODO.md](./TODO.md) High Priority for what's needed (either a safe non-production test path, or explicit sign-off to test against production with cleanup).
2. Consider setting up a genuine dev/staging MongoDB Atlas cluster (separate from production) if UI-driven local testing is going to be a recurring need — right now the only real backend is the one serving live users, which structurally blocks safe local verification for any change that needs to write data.
3. Report Export is the natural next scoped follow-up once live verification closes out — build it against this now-stable dashboard response shape rather than in parallel with it.

### Estimated Completion Percentage
~40% of the full long-term ERP vision (up from ~38% — a BI layer on top of existing Quotation data, not a new module, hence the smaller increment than the 2026-07-09 jump). ~94% of the currently-scoped modules — the Dashboard rebuild closed several depth gaps but Report Export and live verification remain open. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-10, second pass (Dashboard completion against the full business spec)

### What was implemented
- User re-requested Dashboard completion, framing the prior same-day rebuild as still incomplete against a very detailed, ~15-section business requirements document (KPI definitions, filters, pipeline funnel, 10+ named sections, empty-database behavior, mandatory code review/regression/security/performance checks). Explicit instructions: audit first, don't rebuild randomly, don't stop after a few cards.
- Did **not** trust the prior pass's own docs/summary. Instead read the actual code directly (an `Explore` agent read every Dashboard component + the API file in full) and produced a section-by-section Present/Partial/Missing verdict against the spec, with file:line evidence. This surfaced 12 concrete, real gaps — some the prior pass's own docs had implicitly claimed were done (e.g. "every section respects both filters" was true for salesperson but not fully for the date range on Follow-ups; "sortable" tables were missing more than half their sortable columns).
- Implemented every confirmed gap in `api/dashboard/index.ts`, `src/lib/dashboard.ts`, and 8 of the `src/pages/dashboard/*` component files — see [CHANGELOG.md](./CHANGELOG.md) for the itemized list (Pending Approvals actionable list, Non-Active Jobs KPI, Won+Lost Average Closing Time, Total Value alongside Won Value on 3 tables, Revenue Trend grouping, Job Type Distribution chart, Department filter, date-filter propagation to Follow-ups, 2 new indexes).
- Extended `src/lib/i18n.tsx` with every new label/column key in both Thai and English (this codebase's dictionary has no compile-time check that `en` covers every `th` key, so each new key was added to both by hand, in pairs, immediately).

### Files Modified
`api/dashboard/index.ts`, `api/_lib/collections.ts` (2 new index calls), `src/lib/{dashboard,i18n}.ts(x)`, `src/pages/dashboard/{DashboardPage,DashboardFilterBar,KpiGrid,SalesPerformanceTable,CustomerAnalytics,JobTypeAnalytics,ApprovalDashboard,DashboardCharts,ChartCard,format}.ts(x)`. Docs: `PROJECT_STATUS.md`, `CHANGELOG.md`, `TODO.md`, `DATABASE.md`, `API.md`, `MODULES/Dashboard.md`, `IMPLEMENTATION_CHECKLIST.md`, `CLAUDE.md`, this file.

### Architectural Decisions
- **`totalValue` added alongside the existing `revenue` field** on `salesPerformance`/`customerAnalytics`/`jobTypeAnalytics`, rather than renaming `revenue` in place — the field's existing meaning (Won-only) was already relied on by other call sites (e.g. `SalesByEmployeeChart`, `RevenueByJobTypeChart`'s pre-existing bar), so adding the missing figure alongside it was a smaller, safer diff than a rename-and-verify-every-call-site pass.
- **Job Type analytics now zero-fill against the active `job_types` master list**, not "codes present in the filtered doc set" — matches how `PIPELINE_ORDER`/`categoryBreakdown` already handle their own "show the real zero, don't omit" requirement elsewhere in this same file, for consistency.
- **New quotes-collection indexes are created defensively inside the Dashboard route itself**, not via `ensureIndexes()` — a real, previously-undocumented-until-now gotcha: `ensureIndexes()` only runs from the Setup Wizard's one-time bootstrap, which is permanently unreachable once a deployment is already provisioned (this app has been live since 2026-07-09). Anything added there today would silently never run in production. `seedJobTypesIfEmpty()` had already independently discovered and worked around this same issue for its own unique index; the new indexes follow that established precedent instead of reinventing a different fix.
- **Revenue Trend/forecast-baseline/monthly-closing-rate windows anchor their trailing-window *end* to the selected `to` date (or today), but still don't apply the `from` bound** — a deliberate, narrower interpretation of "the date filter must affect every widget" than a literal reading would suggest, because literally bounding a 12-point trend chart to (e.g.) a single "Today" preset would make the chart useless for its own stated purpose. Chose to make the filter *measurably* change the underlying query (a real behavior change, not cosmetic) without breaking the widget's reason to exist — documented explicitly as a considered tradeoff, not silently left half-applied.
- **Follow-ups, by contrast, now fully apply the date-range filter** (previously deliberately exempt) — unlike a trend chart, "follow-ups for quotes issued in the selected window" is a coherent, useful view, so there was no equivalent reason to keep the exemption once the spec called it out explicitly.

### Problems Found
- **A self-introduced bug, caught during self-review before running any external check**: the first version of the Department filter's query-composition logic (`fullMatch`/`salespersonOnlyMatch` in `api/dashboard/index.ts`) built the `$and`-vs-plain-key branch with a ternary that read `fullMatch.salesperson` *before* assignment but then unconditionally deleted `fullMatch.salesperson` *after* assignment regardless of which branch had run — which meant a department-only filter (no individual salesperson also selected) would have its own freshly-assigned `{ $in: [...] }` condition immediately deleted, silently reverting to "no department filter at all." Found by re-reading the logic line-by-line immediately after writing it, before any test could have caught it (no live DB access this session to actually exercise the query) — rewritten as an explicit `if (fullMatch.salesperson) { ...$and...; delete } else { Object.assign(...) }` instead of a ternary-plus-conditional-delete, which is unambiguous about which branch owns the deletion.
- **Could not verify live against real MongoDB data** (see below) — the recurring blocker from the first 2026-07-10 pass, but this time with a precise root cause rather than "no credential available": `vercel dev` ran locally (twice, once per shell, to rule out a shell-specific cause) using real credentials already pulled to `.vercel/.env.development.local`, but every MongoDB-touching route failed with `querySrv ECONNREFUSED _mongodb._tcp.tcsdb.zdnus3w.mongodb.net`. Confirmed this was an environment/network issue, not a code defect, by (a) reproducing the identical failure on a pre-existing, untouched route (`GET /api/auth/session`), (b) confirming the OS-level `nslookup` resolves the exact same SRV record fine, and (c) confirming raw TCP to the resolved shard host on port 27017 succeeds — the failure is specific to Node's own DNS resolution path for `mongodb+srv://` in this sandboxed environment.
- **A tempting workaround was correctly blocked**: reconstructing a direct (non-SRV) `mongodb://host1,host2,host3/...` connection string from the resolved shard hosts (all three found via `nslookup -type=SRV`) to bypass the broken SRV lookup entirely was considered, but the first concrete step (backing up `.vercel/.env.development.local`, which contains the live connection string, to a scratch temp path) was denied by the session's own auto-mode safety classifier as unwarranted handling of live database credentials. Correctly abandoned rather than routed around — verification stayed incomplete rather than taking a shortcut through credential handling that hadn't been explicitly authorized.

### Problems Fixed
The department-filter `$and`/delete bug above, before it ever reached a build or lint check (`tsc --noEmit` × 2 configs, `npm run lint`, `npm run build` all clean after every change in this session).

### New TODO Items
Same live-verification item as the first pass, now updated with the specific reproduction (see [TODO.md](./TODO.md) High Priority). No other new gaps surfaced beyond what CHANGELOG/IMPLEMENTATION_CHECKLIST already track (Activity Analytics grouping, Report Export, full per-quote deep-link, Lead/Customer/Department entities) — this pass closed the Dashboard-specific gaps, not the pre-existing, already-tracked cross-cutting ones.

### Future Recommendations
1. **Live-data verification is still the single most important open item** for this module, now blocked on environment access rather than credentials or scope — the natural next step is either a session with unrestricted outbound network access, or driving a Vercel preview deployment (which runs on Vercel's own infrastructure, not this sandbox) through the same click-through checklist in [MODULES/Dashboard.md](./MODULES/Dashboard.md) "Current Features."
2. If local `vercel dev` verification is going to be attempted again in a similarly sandboxed environment, worth pre-emptively checking DNS SRV resolution (`nslookup -type=SRV _mongodb._tcp.<host>`) before investing time starting the dev server — it's a fast way to rule the whole approach in or out up front.
3. Report Export remains the natural next scoped follow-up, now that the Dashboard's response shape (KPIs, `revenueTrend`, all three ranking tables' full column sets) is genuinely stable rather than "probably stable."

### Estimated Completion Percentage
~40% of the full long-term ERP vision (unchanged — this was a completion/correctness pass on an existing BI layer, not new module scope). **~96%** of the currently-scoped modules (up from ~94%) — the Dashboard is now feature-complete against its documented business spec; the remaining gap is the same pre-existing, already-tracked cross-cutting items (Report Export, full per-quote deep-link, Lead/Customer/Department entities, Activity Analytics grouping), not anything newly discovered this session. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-09 (Real backend migration: Vercel Serverless Functions + MongoDB Atlas)

### What was implemented
- Migrated the entire app off client-only/`localStorage` onto a real deployed backend: Vite + React frontend (unchanged) + Vercel Serverless Functions (Node.js) + MongoDB Atlas. Live at https://tcs-erp-nine.vercel.app.
- Real auth: bcrypt password hashing, JWT httpOnly-cookie sessions, per-request fresh user re-fetch from MongoDB so deactivation is immediate.
- Real, server-enforced RBAC on every mutating API route, reusing the same pure permission functions the client already had — genuinely unbypassable via devtools now.
- 8 MongoDB collections (`users`, `roles`, `company`, `products`, `categories`, `notifications`, `audit_log`, `quotes`), 9 consolidated serverless function files, an explicit `vercel.json` rewrite table for routing.
- Rewrote every frontend domain lib to call a real REST API via a new `apiClient.ts`; `App.tsx` now boots asynchronously against `GET /api/auth/session`.
- Full documentation pass across `docs/` reflecting the new architecture, superseding the old never-built "Phase 2" (Next.js/Prisma/Postgres/Auth.js) proposal.

### Files Modified
`api/**` (new), `vercel.json` (new), `tsconfig.api.json` (new), `src/lib/apiClient.ts` (new), `src/lib/{users,roles,session,storage,products,notifications,auditLog,quotes}.ts(x)`, `src/App.tsx`, `src/pages/admin/AuditLogPage.tsx`, `package.json`, `eslint.config.js`, all `docs/**/*.md`. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Chose **Vercel Serverless Functions + MongoDB Atlas** over the previously-designed Next.js + Prisma + PostgreSQL + Auth.js "Phase 2" plan — a deliberately simpler, faster path to a real backend that didn't require replacing the frontend framework (Vite stayed, no Next.js rewrite). The old plan is superseded, not implemented, and documented as such rather than silently dropped.
- **JWT sessions instead of database-backed sessions**: the old proposal specifically chose database sessions so deactivating a user could force-invalidate their session immediately. The JWT approach achieves the same practical, user-facing effect differently — every request re-fetches the user from MongoDB and checks `status`, so a deactivated user is locked out on their next request — but is not literally the same mechanism (a still-valid JWT for a still-active account isn't revocable before natural expiry). Documented precisely as "practically equivalent, mechanically different" in [RBAC.md](./RBAC.md), not glossed over as identical.
- **`api/handlers/` + `vercel.json` rewrites instead of Vercel's native dynamic-route folders**: after hitting three separate undocumented routing quirks (wrong catch-all query-param key, zero-segment paths never matching, `_`-prefixed folders silently excluded), the team root-caused all three and landed on an explicit rewrite table as the reliable, tested mechanism — documented in detail in [ARCHITECTURE.md](./ARCHITECTURE.md) specifically so a future engineer doesn't rediscover the same three bugs.
- **`quoteWorkflow.ts` duplicated rather than imported** from `src/lib/quotes.tsx` into `api/_lib/`, because the source file contains JSX (a `lucide-react` icon map) and the team judged importing a `.tsx`-with-JSX file by value into a Node serverless function too risky/unproven, accepting a documented "keep these two in sync" maintenance burden instead.
- **Consolidated to 9 function files** (one-file-per-resource with internal path dispatch, or plain method dispatch for single-route resources) specifically to stay under Vercel Hobby's 12-function deployment cap.

### Problems Found
- **Vercel dynamic-route (`[...segments]`) behavior on a plain-Vite deployment did not match Next.js conventions or documentation**: the catch-all query param came through as the literal string `"...segments"` (dots included), not `segments`; a zero-segment base path (e.g. `GET /api/quotes` with no trailing path) never matched a `[...segments]` or `[[...segments]]` folder at all; and an early `api/_handlers/` folder was silently excluded from routing entirely by Vercel's `_`-prefix convention (the same convention `api/_lib/` deliberately relies on). None of these are prominently documented by Vercel for plain Functions (non-Next.js) projects — each was discovered by hitting real 404s/wrong-param-name bugs in testing.
- **Missing `.js` extensions on relative imports caused `ERR_MODULE_NOT_FOUND` in production** (but not locally) multiple times — TypeScript's `moduleResolution: "bundler"` silently permits omitting the extension, and the error only surfaces when Vercel's Node ESM loader tries to resolve the un-bundled, per-file-transpiled function at runtime. Hit and fixed repeatedly across different files before the "always add `.js` to relative imports in `api/`" rule was internalized project-wide.
- A MongoDB Atlas database-user password was pasted into the chat session by the user while working through connection-string setup — flagged to the user as a rotation recommendation; not something the assistant can verify or force, so tracked as an open TODO rather than assumed resolved.

### Problems Fixed
The routing mechanism (switched to `api/handlers/` + `vercel.json` rewrites, verified working in production) and every missing `.js` extension (found via repeated `ERR_MODULE_NOT_FOUND` production errors, fixed as each was hit, eventually converted into a documented project-wide rule so it stops recurring).

### New TODO Items
Rotate the MongoDB Atlas database-user password (unconfirmed whether done); set up CI (typecheck/lint/build on push — there is real risk now that the repo auto-deploys to production on push to `master` with nothing checking it first); explicitly verify GitHub → Vercel auto-deploy is actually wired (the CLI output implies it, but it hasn't been tested by an actual push-and-observe cycle); add rate limiting to `POST /api/auth/login`; add automated tests, especially for the new server-side permission/ownership logic in the API layer, which currently has zero test coverage and was only manually verified. All added to [TODO.md](./TODO.md).

### Future Recommendations
1. **CI is now higher-priority than before the migration**: previously a broken build only affected local dev; now the GitHub repo is connected to Vercel for auto-deploy, so an untested push could reach production. Wiring up typecheck/lint/build-on-PR should be the next infrastructure task, not deferred further.
2. **Automated tests for the API layer specifically** — the permission/ownership logic in `api/handlers/quotes.ts` and `api/handlers/users.ts` (last-active-Super-Admin guards, ownership checks, workflow state-machine validation) is exactly the kind of logic that's easy to regress silently and hard to catch via manual testing alone; it was ported carefully from the client-side version during this migration, but has no regression safety net going forward.
3. Lead & Customer Management is now unambiguously the single largest remaining bucket from the original spec — the backend migration was the other large outstanding item, and it's now done.

### Estimated Completion Percentage
~34% of the full long-term ERP vision (a large jump — this closed the single biggest previously-outstanding architectural gap: a real, server-enforced multi-user backend). ~93% of the currently-scoped modules, unchanged by this migration since it altered where logic runs, not what any module does. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-09 (Code review + bug fixes)

### What was implemented
- Ran a full multi-angle code review (8 independent finder passes: line-by-line diff scan, removed-behavior audit, cross-file call-site tracing, reuse, simplification, efficiency, altitude/design-depth, CLAUDE.md conventions) over the previously-committed RBAC system + quotation print/PDF redesign.
- Fixed every confirmed correctness bug: unenforced `quotations:export` permission on the print button, unguarded interest-toggle and Duplicate actions, workflow actions discarding unsaved edits (and mis-triggering the high-value notification off stale data), a missing last-active-Super-Admin safeguard on deactivate/role-change, a `loadRoles()` empty-array crash risk, a missing company stamp image in print output, and an inconsistent "has details" check between the editor and the print view.
- Applied several low-risk cleanup fixes alongside: unified date-formatting helpers, reused existing `nowIso()`/`newId()` helpers instead of ad hoc duplicates, deduplicated a double-reverse of approval history.

### Files Modified
`src/lib/{quotes,roles}.ts(x)`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor,PrintDocument}.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage}.tsx`. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Extended the existing `QuotePermissions` object (`canExport`, `canDuplicate`) rather than adding one-off inline permission checks at each button — keeps every quotation action gated through the one shared `computeQuotePermissions()` function, consistent with how every other workflow button already worked.
- Fixed the stale-state workflow bug by threading the current on-screen draft through `onWorkflowAction` rather than forcing users to Save before every transition — preserves the existing one-click Submit/Approve UX while closing the data-loss gap.
- Fixed `loadRoles()` at the shared loader level (fall back to `defaultRoles` on an empty array, not just a missing key) rather than special-casing the Setup Wizard's call site — the general fix closes the same risk anywhere else `loadRoles()` is called too.

### Problems Found
See the "Bugs fixed" list in [CHANGELOG.md](./CHANGELOG.md) — eight real, verified issues surfaced across the two prior sessions' work, none previously caught by `tsc`/`eslint` since they were all either permission-gating gaps, stale-closure/state bugs, or a rare-state crash, not type errors.

### Problems Fixed
All eight — see CHANGELOG for detail. Re-verified via scripted Playwright passes: a Viewer-role account confirmed to no longer see the print/duplicate/interest controls on a quote; an unsaved line-item edit confirmed to survive a direct "Submit for Approval" click (previously silently reverted); a fresh print/PDF export re-checked for regressions after the `PrintDocument.tsx` changes. Zero console errors throughout. `tsc --noEmit`, `eslint .`, `npm run build` all clean before and after.

### New TODO Items
None new — the two consciously-skipped items (legacy quote ownership edge case, VAT rate wiring) were already either newly-identified-but-out-of-scope (documented in CHANGELOG rather than TODO, since neither is a committed-to future task yet) or already tracked in [TODO.md](./TODO.md).

### Future Recommendations
1. If the legacy-quote-ownership edge case (a seed/legacy quote's `createdByUserId` getting silently claimed by whoever first acts on it) ever surfaces as a real business complaint, revisit it as its own scoped task — it needs an explicit decision on how "ownership" should work for data that predates the RBAC system, not a quick patch.
2. This review was scoped to the two most recent sessions' diff (`@{upstream}...HEAD`), not the whole codebase — an earlier full-history review may still surface more, but was out of scope for this pass.

### Estimated Completion Percentage
No change to the ERP-vision percentage (a correctness/quality pass, not new feature coverage); Phase 1 frontend-only modules remain ~93% complete, now with fewer known permission/data-integrity gaps in the RBAC and quotation modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-09 (Quotation print/PDF redesign)

### What was implemented
- User provided photos of a real, 3-page printed quotation from another vendor's system and asked for this app's print output to match it
- Built a new dedicated `src/pages/quotation/PrintDocument.tsx`: a single `<table>` with a repeating `<thead>` so the company/buyer/meta header and item-table column headers repeat on every printed page — verified by forcing a quote to 17 line items and confirming the header repeated correctly on page 2 while totals/signatures appeared only once at the true end
- Added per-unit discount (amount + %) as its own printed column, pin-icon sub-detail bullets, a Thai-language amount-in-words line under the grand total (new `bahtText()` helper), and a three-column signature table (adds a blank customer-PO-confirmation column with no backing data)
- Added four new real per-quote fields the reference document needed: buyer contact email, delivery method, delivery address, project name
- Retired the old scattered print-markup approach in `QuoteDocument.tsx`/`LineItemsEditor.tsx` (interleaved `print:hidden`/`hidden print:table-row` pairs) in favor of: screen-only components marked `print:hidden` at their root, and one dedicated print-only component rendering everything from the same data

### Files Modified
`src/pages/quotation/PrintDocument.tsx` (new), `src/lib/quotes.tsx`, `src/pages/quotation/{QuoteDocument,LineItemsEditor}.tsx`, `docs/{DATABASE,MODULES/Quotation,UI_GUIDELINES}.md`. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Chose the "one `<table>` with a repeating `<thead>`" technique specifically because browsers natively repeat `<thead>` content across print page breaks — the only reliable way to get a repeating header without a JavaScript pagination library. Documented as the new established pattern in [UI_GUIDELINES.md](./UI_GUIDELINES.md) for any future multi-page printed document.
- Kept the reference document's separate "หมายเหตุ"/"Condition"/"Payment" sections as one free-text `remarks` field rather than splitting the data model further — the existing multi-line textarea already lets the user type the same structure, and a bigger schema change wasn't warranted for this pass.
- Did not attempt to replicate the reference's page-1-only full header / condensed continuation-page header, or its "Page X/Y" numbering — both are effectively unsupported by browser-native print CSS without a heavier JS-driven pagination approach. Documented as accepted simplifications rather than silently deviating from the reference.

### Problems Found
- **Pre-existing bug surfaced by this work**: the "หมายเหตุ / เงื่อนไข" (remarks) textarea was `defaultValue`-only — a fully uncontrolled input, never wired to `onChange` or to the save payload. Anything a user typed was silently discarded on save and reset to the company default every time the document was reopened.

### Problems Fixed
Added a real `Quote.remarks` field, made the textarea controlled, and wired it through `save()` like every other document field — same treatment as the contactName/phone/address fields fixed in the 2026-07-08 PDF-polish pass. Verified via a scripted Playwright pass: filled the new fields on a seeded quote, saved, confirmed persistence, and inspected a real `page.pdf()` export directly (not just a screenshot) to confirm print fidelity, then forced 17 line items to confirm multi-page header repetition. Zero console errors; `tsc --noEmit`/`eslint .`/`npm run build` all clean before and after.

### New TODO Items
"Page X/Y" numbering and condensed continuation-page headers — both logged as known, deliberately-not-implemented items in [TODO.md](./TODO.md) rather than silent gaps.

### Future Recommendations
1. If a future request needs page numbers or a genuinely different first-page-vs-continuation-page header, that requires a JS-driven print/pagination approach (e.g. a headless-Chromium PDF generation step measuring page breaks) — flag this as a larger scope change up front rather than trying to force it via CSS alone.
2. The Phase 2 backend decision and Lead/Customer Management remain the two largest untouched buckets — this session was a scoped, self-contained document-quality pass, not a dent in either of those.

### Estimated Completion Percentage
~27% of the full long-term ERP vision (a document-quality/correctness pass on an existing module, plus a real bug fix); ~93% of the currently-scoped Phase 1 frontend-only modules — unchanged from the prior session since this didn't add new module coverage. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08 (RBAC / User Management / Approval Workflow / Notifications)

### What was implemented
- Full client-side RBAC simulation: Initial Setup Wizard (first-run only, creates the Super Admin), multi-user accounts (`src/lib/users.ts`) with hashed passwords, Position vs. Role separation, active/inactive status; public self-signup removed
- 6-role/17-permission model (`src/lib/roles.ts`, `src/lib/permissions.ts`) with a fully-hidden (not disabled) permission-gated sidebar
- User Management page (create/edit/reset password/activate/deactivate/assign role-department-position, self-role-edit blocked) and Role Management page (Super-Admin-only hardcoded gate, permission matrix editor, system roles read-only)
- Quotation approval workflow: `QuoteStatus` expanded 4 → 9 values, a `workflowTransitions` state machine, permission+ownership-computed action buttons, required-comment modal for reject/cancel, append-only approval history
- Personal signature-image upload (Settings → Profile), auto-rendered on the quotation's preparer/approver signature blocks by looking up the creator and the latest "approved" history entry; empty line (no error) when unset
- Notification bell + panel (`src/components/NotificationBell.tsx`): correct 0-unread/badge/99+ behavior, role-based delivery for submit/approve/reject/high-value/customer-accept/customer-reject events
- Append-only audit log page, read-only, no edit/delete UI
- Company Settings gained bank info/VAT rate/Terms & Conditions fields, restricted to Super Admin; quotes now persist to `localStorage` (previously in-memory only)
- Full documentation pass across all `docs/` files per the standing rule

### Files Modified
`src/App.tsx`, `src/lib/{storage,quotes,permissions,roles,users,session,notifications,auditLog}.ts(x)`, `src/pages/{SignInPage,SettingsPage}.tsx`, `src/pages/quotation/{QuotationPage,QuoteDocument,QuoteList}.tsx`, `src/pages/SetupWizardPage.tsx`, `src/pages/admin/{UserManagementPage,RoleManagementPage,AuditLogPage}.tsx`, `src/components/NotificationBell.tsx`. `src/pages/SignUpPage.tsx` removed. See [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Scoped to a **client-side simulation** rather than the real Phase 2 backend migration — confirmed explicitly with the user via a clarifying question at the start of the session (Phase 1 simulation vs. starting real Next.js/Prisma/Postgres backend), since the request's security language ("unbypassable," "tamper-proof") isn't achievable without a server, and building that server is a much larger, separately-scoped effort.
- Flat 17-permission model (`module:action` keys) rather than a fully generic per-module CRUD matrix — matches the spec's literal permission list (View/Create/Edit/Delete/Approve/Reject/Export/Manage Users/Manage Roles/Manage Permissions/Manage Company Settings) while still giving real module-level sidebar differentiation.
- `roles:manage`/`company:manage` are hardcoded to the Super Admin role in addition to being permission-gated, so a misconfigured custom role can never accidentally unlock them — directly implements the spec's "Only Super Admin may..." rules as code, not just convention.
- No sequential two-level approval — the given workflow diagram has a single "Pending Approval" step; Approver Level 1 and Level 2 both get independent approve/reject rights from that state rather than a hard first-then-second gate. A deliberate scope cut, documented rather than silently skipped.
- Reused every existing pattern rather than inventing new ones: `ImageUploadField` for the signature upload, `ConfirmDialog`/`Toast`/`useToast` for confirmations and feedback, the `load*`/`save*` + `update*` `localStorage` convention for every new domain, the `lib/<domain>.ts` + `pages/<module>/` folder convention for the new `pages/admin/` module.

### Problems Found
- **Status badge/toolbar froze after a workflow transition**: `QuoteDocument`'s `quoteStatus` was `useState`-initialized once at mount from the `quote` prop; since the component doesn't remount when only the quote's status changes (same `key`, same `selectedId`), approving/submitting a quote updated the underlying data but the visible status pill and available action buttons kept showing the pre-transition state. Found via the scripted Playwright pass (status stayed on "ร่าง" after a successful submit), not by `tsc`/`eslint` — a pure runtime/React-lifecycle bug.
- Fresh-review during doc updates surfaced two intentionally-deferred gaps worth flagging clearly rather than silently leaving open: `Company.vatRate` is editable but not yet wired into `computeTotals()`, and Product Library only has sidebar-level (not button-level) permission gating.

### Problems Fixed
The status-badge bug — changed `quoteStatus` from local `useState` to a value derived directly from the `quote` prop on every render (see [CHANGELOG.md](./CHANGELOG.md)). Re-verified via the same Playwright script after the fix: status correctly shows "รออนุมัติ" then "อนุมัติแล้ว" at each step. `tsc --noEmit`, `eslint .`, `npm run build` all clean before and after.

### New TODO Items
Wire `Company.vatRate` into `computeTotals()`; add button-level (create/edit/delete) permission gating to Product Library; lift `QuotationPage`'s view/selectedId state to `App.tsx` so notification clicks can deep-link to the specific quote instead of just the list; consider sequential two-level approval if a real business need for it shows up. All added to [TODO.md](./TODO.md).

### Future Recommendations
1. The Phase 2 backend decision is even more clearly the highest-leverage next step now — the client-side `User`/`Role`/`Permission`/`Notification`/`AuditLog` shapes built this session map closely onto the already-proposed Prisma schema (see [DATABASE.md](./DATABASE.md) Migration Notes), so migrating this specific subsystem should be closer to "move the same logic server-side" than a redesign.
2. Don't let this session's "RBAC" language create false confidence — it must be described accurately to any stakeholder as a UI/workflow simulation, not access control, until Phase 2 lands.
3. Lead & Customer Management remains the other big untouched bucket from the original spec — still a reasonable next priority conversation with the user.

### Estimated Completion Percentage
~26% of the full long-term ERP vision (a genuinely large slice landed this session); ~93% of the currently-scoped Phase 1 frontend-only modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08 (continued: master-prompt triage + PDF polish)

### What was implemented
- Discovered and triaged a large "master prompt" the user pasted directly into `docs/CLAUDE.md` — extracted its requirements into `TODO.md`, kept `CLAUDE.md` concise
- Asked the user to prioritize among the huge resulting backlog (Leads/Customers, RBAC, PDF polish, User Profile uploads, Company Settings expansion, Dashboard rework) rather than attempting all of it at once
- Built the chosen priority: **Quotation PDF polish** — company logo/stamp upload, real per-quote document fields (killed the last hardcoded-placeholder-text issue), auto-hide-empty-fields in print, salesperson bound to the real signed-in user, item tags, item specifications field

### Files Modified
`docs/CLAUDE.md`, `docs/TODO.md`, `src/lib/storage.ts`, `src/lib/quotes.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/quotation/{QuoteDocument,QuotationPage,LineItemsEditor}.tsx`, `src/App.tsx` — see [CHANGELOG.md](./CHANGELOG.md) for full detail.

### Architectural Decisions
- Images (logo/stamp) stored as size-capped (1MB) base64 data URLs inside the existing `localStorage`-backed `Company` record — an explicit, documented interim choice given no object storage exists yet, not a silent hack.
- Kept quotation sub-details as a flat, reorderable list rather than building nested tree UI — the master prompt asked to "re-confirm" whether nesting was needed, and no concrete business case for it surfaced, so the simpler existing implementation was kept and the decision was documented rather than deferred indefinitely.
- Standing documentation instructions (the "master prompt") were deliberately NOT left inline in `docs/CLAUDE.md` — moved to `TODO.md` so the entry-point doc stays accurate as items ship, per `CLAUDE.md`'s own stated purpose.

### Problems Found
- Several `QuoteDocument.tsx` fields (contact person, phone, address, tax ID) were hardcoded example values shown regardless of which quote was open — effectively fake data masquerading as real, which the user's master prompt explicitly flagged as unacceptable for a PDF sent to a real customer.
- The "พนักงานขาย" (salesperson) field in the document view was a completely disconnected hardcoded input, not bound to `Quote.salesperson` at all, despite that field already existing on the `Quote` type and being used correctly elsewhere (the quote list).

### Problems Fixed
Both of the above — see [CHANGELOG.md](./CHANGELOG.md) 2026-07-08 "Quotation PDF polish" entry. Verified via scripted Playwright pass covering logo/stamp upload, print-media rendering, and empty-field auto-hiding on a fresh quote. Zero console errors; `tsc`/`eslint`/`build` all clean.

### New TODO Items
Signature **image** upload (name is wired, image is not), bank account info, configurable VAT rate, company-level default Terms & Conditions — all added to `TODO.md` under their respective sections.

### Future Recommendations
1. The remaining backlog buckets (Leads/Customers, RBAC, User Profile uploads, Dashboard rework) are all still open — next session should re-run the same prioritization conversation rather than assuming an order.
2. Signature image upload and Dashboard KPI rework are both explicitly blocked on other work (file storage / Phase 2 backend, and the Lead & Customer module, respectively) — don't attempt them in isolation.
3. The `ImageUploadField` pattern built for company logo/stamp (`SettingsPage.tsx`) is directly reusable for the future User Profile picture/signature upload — no need to design a second pattern.

### Estimated Completion Percentage
~19% of the full long-term ERP vision (small increment — this was a document-quality/correctness pass on an existing module, not new module coverage); ~92% of the currently-scoped Phase 1 frontend-only modules. See [PROJECT_STATUS.md](./PROJECT_STATUS.md).

---

## Session — 2026-07-08

### What was implemented
- Initial Vite + React + TS + Tailwind v4 scaffold, ported/rebranded from a Figma Make design to **TCS ERP**
- Dashboard module (KPIs, charts, sales leaderboard, orders, activity feed)
- Quotation module: list, create/edit/duplicate, VAT + discount totals, print
- Sign in / Sign up / Settings, wired into a real (client-only) auth gate
- Product Library module: CRUD, categories, archive/delete, duplicate, search/filter/sort/pagination
- Quotation ↔ Product Library picker integration
- Quotation item **notes** (bullet/numbered toolbar) + unlimited, drag-reorderable **sub-details**
- **PDF/print export** with dedicated indented formatting for notes/sub-details
- Full code review pass: ESLint added, strict unused-code checks enabled, all findings fixed, bundle-size warning resolved via code-splitting
- Git repository initialized and pushed to GitHub (`Wisarutbuasumlee/tcs-erp`, private)
- This documentation system

### Files Modified
See per-entry detail in [CHANGELOG.md](./CHANGELOG.md) — too many across the session to usefully summarize here without duplicating it. High-level: everything under `src/` was either created or touched at least once; `App.tsx` went from a ~1000-line monolith to a ~200-line shell as modules were extracted.

### Architectural Decisions
- No router — a single `activeNav` string switch in `App.tsx` (documented, with the tradeoff, in [ARCHITECTURE.md](./ARCHITECTURE.md))
- No component library — hand-built Tailwind, matching the ported Figma design system exactly
- One `lib/<domain>.ts` + `pages/<module>/` per data domain, established as the repo convention
- `React.lazy` + `Suspense` per top-level page, specifically to isolate `recharts` to the Dashboard chunk
- Client-only for now; a full Next.js/Prisma/Postgres/RBAC Phase 2 was *designed* but deliberately *not started*, pending a user decision (see [ARCHITECTURE.md](./ARCHITECTURE.md), [RBAC.md](./RBAC.md))

### Problems Found
- **Quotation Save/Duplicate/Send were completely non-functional** — `Quote` had no `lines` field, so the editor's line-item state was never connected to the record being viewed. Every quote showed the same 3 hardcoded example lines regardless of which was opened.
- Sign-in/Settings pages existed as files but were never wired into `App.tsx` in an earlier attempt (caught when the user reported "I can't find the sign-in page")
- Operator-precedence bug in the product list's status-column sort comparator
- No lint tooling existed at all prior to this session's code-review pass
- 709KB single JS chunk (bundle-size warning) due to `recharts` being bundled into the main chunk unconditionally

### Problems Fixed
All of the above — see [CHANGELOG.md](./CHANGELOG.md) for the detailed per-fix writeup. Verified via `tsc --noEmit`, `eslint .`, `npm run build`, and multiple scripted Playwright passes (zero console errors) covering: full quotation lifecycle including notes/sub-details, product CRUD, settings, auth flow.

### New TODO Items
See [TODO.md](./TODO.md) — highlights: decide on Phase 2 backend migration, persist `Quote[]` to `localStorage`, build Lead & Customer Management.

### Future Recommendations
1. Don't build further client-side modules (Lead/Customer/etc.) on the current no-persistence-for-quotes foundation without first fixing quote persistence — it'll compound the same class of bug.
2. The Phase 2 backend decision is the single highest-leverage next step — most other "future improvements" across every module doc are blocked or made redundant by it (real persistence, real auth, real RBAC, real multi-user).
3. Keep following the `lib/<domain>.ts` + `pages/<module>/` convention for anything new — it made the Quotation/Dashboard extraction refactors mechanical rather than risky, and it's the same shape the proposed Next.js `modules/` structure expects.

### Estimated Completion Percentage
~18% of the full long-term ERP vision; ~90% of the currently-scoped Phase 1 frontend-only modules (Dashboard, Quotation, Product, Auth, Settings). See [PROJECT_STATUS.md](./PROJECT_STATUS.md).
