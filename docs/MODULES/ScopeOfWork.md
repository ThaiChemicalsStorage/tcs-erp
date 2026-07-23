# Module: Scope of Work

## Status: ✅ Built (2026-07-15), fixed against an independent Codex review the same day, standalone management page added 2026-07-22, Rewrite + Salesperson filter added 2026-07-22, Own-Records-Only Viewing added 2026-07-23, Document Recipients (real email routing) added 2026-07-23

**2026-07-23, Own-Records-Only Viewing** (per direct user request, "หน้า scope of work อยากให้ทำสิทธิ์
เพิ่มมาเหมือนของใบเสนอราคาที่เป็นดูของผู้อื่นได้" — mirroring Quotation's `quotations:viewAll`): new
`scopeOfWork:viewAll` permission. A role holding `scopeOfWork:view` but not `scopeOfWork:viewAll`
now only sees, on the standalone `ScopeOfWorkList.tsx` page (and in Global Search's Scope of Work
results), records it created itself — same `{ $or: [{ createdBy: ctx.user.id }, { createdBy: "" }]
}` filter shape as `quotations:viewAll`. Default grants mirror Quotation's exactly: Super Admin/
Administrator/Approver Level 1/Approver Level 2/Viewer all hold it, **Sales User does not**.
Deliberately left unfiltered: the by-quotation existence check (`GET /api/scope-of-works?
quotationId=`, used by `QuoteDocument.tsx`'s toolbar to detect "does a Scope of Work already exist
for this quotation"), the single-record `GET /api/scope-of-works/:id`, and duplicate/rewrite's
source-record read — filtering any of those would either risk a duplicate-creation UX trap (hiding
a colleague's existing record from the existence check) or a self-contradictory "link says it
exists, click 403s" experience (filtering the single-record GET but not the link that leads to it).
See [RBAC.md](../RBAC.md) "Scope of Work Own-Records-Only Viewing" for the full reasoning, and note
the same **manual Role Management step required on an already-provisioned production deployment**
(`defaultRoles` only seeds once — existing role documents don't retroactively gain the new
permission). `tsc`/`lint`/`build` all pass clean; not yet verified against a live deployment (same
standing sandboxed-session MongoDB-network limitation as every recent pass, see PROJECT_STATUS.md).

**2026-07-22, Rewrite + Salesperson filter** (per direct user request, "เหมือนใบเสนอราคา" — mirroring
Quotation's identical feature): a "แก้ไข" (Rewrite) toolbar button now sits next to "ทำสำเนา" in
`ScopeOfWorkDocument.tsx` (gated by `scopeOfWork:create`, same as Duplicate), calling the new
`POST /:id/rewrite` route (see [API.md](../API.md)). Unlike Quote's `_id` (a human-readable business
key the `-R{n}` suffix applies to directly), a Scope of Work's `_id` is a genuine MongoDB `ObjectId`
— so the revision suffix is applied to `scopeNumber` instead (`{root}-R{n}`, root recovered via
`getRevisionRoot()`, reused verbatim from `api/_lib/quoteRevisions.ts` rather than duplicated —
that file's docstring now notes the cross-module reuse; despite the filename, only its Quote-specific
`dedupeQuotesByRevisionChain()` export stays Quote-only). A new atomic per-root counter
(`scope_revision_{rootScopeNumber}` in the shared `counters` collection) numbers each revision;
`yearMonth`/`jobSequence`/`secondaryCode`/`issueDate` all pass through unchanged from the source
(only `scopeNumber` itself changes) — everything else resets exactly like Duplicate (`status: Draft`,
fresh `seller`/blank `approver`, fresh item/spec ids). A `"Scope of Work Rewritten"` audit entry is
written. Both `QuotationPage.tsx`'s embedded usage and the standalone `ScopeOfWorkPage.tsx` wire the
new `onRewritten` callback the same way `onDuplicated` already works — navigate to the new revision's
id. Also added: a `quotationSalesperson` column + filter dropdown (mirroring `QuoteList.tsx`'s own
Salesperson filter) to `ScopeOfWorkList.tsx` — the field already existed in `ScopeOfWork` (frozen
snapshot, see "Signatures" below) but `toListItem()` didn't surface it and the list didn't filter/show
it. While implementing this, also fixed a pre-existing staleness gap in `ScopeOfWorkPage.tsx`: its
"back to list" action now re-fetches (`loadList()`) instead of just switching view state, so a
just-created Duplicate/Rewrite/edit shows up immediately instead of requiring a full page reload.
`tsc`/`lint`/`build` all pass clean; verified visually via a temporary browser harness against mock
list data (salesperson column + filter dropdown render/sort correctly) — the detail view's Rewrite
button itself was verified by code inspection (identical structure/gating to the already-shipped
Duplicate button) rather than a live fetch-mocked harness, given the sandboxed session's standing
MongoDB-network limitation (see PROJECT_STATUS.md).

**2026-07-15, Codex review fix pass**: an independent review found 0 Critical and 3 High Priority
issues (plus several Medium/Low). All 3 High Priority issues fixed same day — see
`docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status" for the full writeup. Summary:
1. **Quotation contact/salesperson were dropped from the snapshot.** `customerSnapshot.contactName`
   now retained (real quotation data, not a sample value); a new frozen `quotationSalesperson`
   field copies `quote.salesperson`; the default `seller` signatory now prefers the quotation's
   actual assigned salesperson (with a real-user lookup for their saved signature image) instead of
   always defaulting to whoever clicked "สร้าง Scope of Work."
2. **The job code's 4th segment was always blank on creation.** `secondaryCode` is now a required
   value the user supplies at creation time (a small prompt on the "สร้าง Scope of Work" button) —
   its *business meaning* is still not invented (see "Open Business Question" below), only its
   *presence* is now enforced, so every generated code always has all 4 segments from the start.
3. **No Global Search integration existed.** Added a "Scope of Work" result group, searchable by
   scope number/quotation number/customer/Job Type/PO/status, gated by `scopeOfWork:view`.

Also fixed this pass (Medium): explicit `@page { size: A4 portrait; }`; item rows and their
specification/remark rows now grouped into one unbreakable `<tbody>` each, so a page break can no
longer fall between an item's heading and its own first detail line; `refresh` now also requires
`quotations:view` (matching `create`'s existing check); a bounded retry-on-duplicate-key loop added
to create/duplicate (defense in depth — the atomic per-month counter already made this essentially
unreachable); the delete confirmation no longer overpromises a restore capability that doesn't
exist yet.

A printable job document generated **from an existing quotation**, reproducing the printed
structure of the reference PDF ("Scope Of Work PQ202607-174-LI-SK บริษัท เค ไทย ไฮดรอลิค จำกัด.pdf",
`public/`). A Scope of Work is still only ever **created** from the Quotation Detail toolbar
(`สร้าง Scope of Work` / `เปิด / แก้ไข Scope of Work`) — that flow is unchanged.

**2026-07-22, own top-level sidebar page added** (superseding the "not a separate top-level sidebar
module" note this section used to carry): per direct user request, a standalone "Scope of Work"
sidebar entry now exists purely for **browsing/opening records that already exist** — a list page
(`src/pages/scopeOfWork/ScopeOfWorkList.tsx`, mirroring `QuoteList.tsx`'s summary-cards/search/
status-filter/table pattern) plus a thin container (`ScopeOfWorkPage.tsx`) that owns list↔detail
view-switching, exactly like `QuotationPage.tsx` does for quotes. The detail view reuses the
*exact same* `ScopeOfWorkDocument.tsx` component the Quotation-embedded flow always has — the only
difference is `onBack`/`backLabel` (returns to this page's own list, "กลับไปรายการ Scope of Work,"
instead of "กลับไปใบเสนอราคา"). See "Files" below and [API.md](../API.md) for the new "list
everything" mode `GET /api/scope-of-works` gained (previously always required a `quotationId`).

**2026-07-22, same-day crash fix — user-reported "หน้าขาวหมดเลย" (page goes completely white)**:
the standalone list page crashed immediately on real data. Root cause: `toListItem()`
(`api/_lib/scopeOfWorkHandler.ts`) read fields like `customerSnapshot.companyName`/`jobTypeCode`/
`quotationNumber` directly off the MongoDB document with no fallback — MongoDB enforces no schema,
so any record missing one of these (there is real historical precedent for fields being added to
this collection after some records already existed, e.g. `quotationSalesperson` in the 2026-07-15
fix pass above) serializes that key as `undefined`, which `JSON.stringify()` **drops from the
response entirely** rather than sending `null`. The client then found the key genuinely absent and
crashed calling `.trim()`/`.toLowerCase()` on `undefined` — **during React's render phase**, and
since this app had no error boundary anywhere (see [ARCHITECTURE.md](../ARCHITECTURE.md)), React's
default behavior on an uncaught render error is to unmount the entire tree, producing exactly the
reported blank white screen with no visible error at all.

Fixed in three layers: (1) `toListItem()` now defaults every field (`?? ""`, `?? "Draft"` for
status) — the same "MongoDB enforces no schema, normalize once" pattern `api/dashboard/index.ts`
already established; (2) `ScopeOfWorkList.tsx` independently re-normalizes every field client-side
too, defense-in-depth against any other unexpected shape slipping through; (3) a new app-wide
`ErrorBoundary` (`src/components/ErrorBoundary.tsx`, wraps the page-content area in `App.tsx`) means
any *future* bug of this kind degrades to a recoverable "เกิดข้อผิดพลาดที่ไม่คาดคิด" + reload-page
screen instead of a silent blank crash — a systemic protection, not specific to this one bug.
Reproduced the exact original crash against a deliberately malformed mock record (missing
`scopeNumber`/`customerName`/`jobTypeCode`/etc.) in a temporary browser harness, confirmed it no
longer throws post-fix, then confirmed the harness would have shown the new error screen instead of
blanking had the fix not held. `tsc`/`lint`/`build` all pass clean.

This is **not related to** Company Profiles / issuer-company selection — that feature was built,
found to be a misunderstanding, and removed (see `MODULES/CompanyProfiles.md`). This ERP has exactly
one issuer company; the Scope of Work uses no per-document issuer selection at all.

## PDF Reference Mapping

The reference PDF has four kinds of content, and each is treated differently:

| PDF content | Treatment |
|---|---|
| Printed black structure (title, field labels, checklist group titles/options, item table columns, signature box labels) | Reproduced as the fixed layout — `ScopeOfWorkPrintDocument.tsx` and the on-screen editor's section headings. |
| Printed quotation/job data (customer name, job code, PO number, quotation number) | Auto-filled from the source quotation at creation time (`deriveFromQuotation()`, `api/_lib/scopeOfWorkHandler.ts`). |
| Blue handwritten values (delivery info, contact names/phones, seller/approver names & dates) | **Never imported as default data.** Every field this maps to starts blank and editable — see "Field-by-field mapping" below. |
| Yellow highlighter marks | Annotations only in the sample — never reproduced. Checked options print with a plain `✓` inside a square box; nothing is highlighted. |

### Field-by-field mapping (header)

| PDF field | Source | Editable after creation? |
|---|---|---|
| ชื่อลูกค้า | `quotation.customerSnapshot.companyName` (falls back to `quote.client`) | No — read-only display (refreshed only via "อัปเดตข้อมูลจากใบเสนอราคา") |
| ชื่อผู้ติดต่อ (จากใบเสนอราคา) | `quotation.customerSnapshot.contactName` (falls back to `quote.contactName`) — added 2026-07-15, Codex review High Priority fix; shown read-only in the editor for reference | No |
| รหัสงาน | Server-generated `scopeNumber` | No — components (`secondaryCode`, `issueDate`) are editable and recompute it |
| รหัส Drawing | *(no reliable quotation field)* | Yes — starts blank |
| สถานที่ส่งของ | `quotation.deliveryAddress` | Yes |
| ชื่อผู้ติดต่อส่งของ | *(no reliable quotation field — quotations only have one generic contact, not a shipping-specific one)* | Yes — starts blank |
| ชื่อผู้ติดต่อวางบิล | *(same — no reliable field)* | Yes — starts blank |
| วันที่ | Today's date at creation | Yes |
| วันที่ส่งของ/ส่งแบบอนุมัติ | *(no reliable quotation field)* | Yes — starts blank |
| เอกสารใบสั่งซื้อเลขที่ | `quotation.poRef` | Yes |
| ใบเสนอราคา | `quotation.id` (the quotation number) | No — read-only display |
| เบอร์โทรผู้ติดต่อส่งของ / วางบิล | *(no reliable field)* | Yes — starts blank |

**Why shipping/billing contact fields never auto-fill**: a `Quote` only carries one generic
`contactName`/`contactPhone` pair — there's no way to reliably tell whether that's "the person who
receives the delivery" or "the person who handles billing" (the PDF's sample shows these as two
different people). Auto-filling either from the single generic contact risked silently mislabeling
data, so per the business requirement ("auto-fill only when there is a reliable matching database
field") these four fields simply start blank and editable.

### Item layout

Each quotation `QuoteLine` becomes one `ScopeOfWorkItem` (`mapLineToScopeItem()`):

| PDF item field | Source |
|---|---|
| Item number | Computed from array position (section-header items don't get one) |
| Item name (e.g. "FRP Lining for concrete floors") | `line.description` |
| Indented specification lines (พื้นที่/ความหนา/วัสดุ/Chemical/Temperature) | `line.subDetails[]`, each becomes its own `ScopeOfWorkSpecLine`. **2026-07-21**: previously also included `line.specifications` (newline-split) — that `QuoteLine` field was removed entirely (unused, see CHANGELOG.md); its content now reaches here indirectly, since `applyTemplate.ts` already folds a template item's specifications into `subDetails` at the quotation stage, before this mapping ever runs |
| Quantity | `line.qty` |
| Unit | `line.unit` |
| Item `remark` | **2026-07-21**: previously seeded from `line.notes` (now removed, see above) — starts blank and is freely editable in `ScopeOfWorkItemsEditor.tsx` afterward, same as any other snapshot field with no upstream source left |

**Never copied**: `unitPrice`, `discount`, `tags` — Scope of Work never shows pricing anywhere
(editor or print). A `QuoteLine` with `isSectionHeader: true` (a Quotation Template section divider)
copies through as a non-priced `ScopeOfWorkItem` divider too, same rendering convention as
`PrintDocument.tsx` uses for quotations.

Items are then **fully independently editable**: add/remove/duplicate/reorder (drag-and-drop),
edit quantity/unit, add specification lines — none of this writes back to the source quotation.

## Scope Number / Job Code

Format: `PQ{YYYYMM}-{jobSequence}-{jobTypeCode}-{secondaryCode}`, e.g. `PQ202607-174-LI-SK`.

- **`YYYYMM`** — the Scope of Work's own `issueDate` (Gregorian year, not the Buddhist year the
  quotation numbering convention uses — the reference PDF's own `รหัสงาน` uses `2026`, not `2569`).
- **`jobSequence`** — an atomically-reserved per-calendar-month counter (`scope_{yearMonth}` in the
  shared `counters` collection, same pattern as `QUOTE_COUNTER_ID` in `api/handlers/quotes.ts`).
  Reserved once at creation; if a later edit moves `issueDate` into a *different* month, a **fresh**
  sequence number is atomically reserved for that new month (see `handleUpdate` in
  `api/_lib/scopeOfWorkHandler.ts`) — reusing the old number would risk colliding with a different
  record that was allocated that same number in the month it actually landed in.
- **`jobTypeCode`** — the quotation's Job Type code (LI/TA/SC/BF/...), frozen at creation.
- **`secondaryCode`** — see "Open Business Question" below. **Required at creation** (2026-07-15,
  Codex review High Priority fix — see the prompt in `QuoteDocument.tsx`'s "สร้าง Scope of Work"
  button), so every generated code always has its 4th segment from the start; never blank/omitted
  for a newly-created record. Editable afterward via `PATCH` (still optional there, to allow a
  correction without re-triggering the create-time requirement on every unrelated save).

Uniqueness: a unique index on `{yearMonth, jobSequence}` (`api/_lib/collections.ts`) guarantees no
two records ever share a scope number, since that pair alone is already globally unique — a second
unique index directly on `scopeNumber` is a defense-in-depth safety net, not the primary mechanism.
A bounded retry loop (`MAX_SCOPE_NUMBER_ATTEMPTS = 3`, `api/_lib/scopeOfWorkHandler.ts`) re-reserves
a fresh sequence and retries the insert on the (essentially unreachable, given the atomic counter)
chance of an `E11000` duplicate-key error, rather than surfacing a raw 500 — 2026-07-15, Codex
review recommendation.

### Open Business Question — `secondaryCode` ("รหัสอ้างอิงท้ายงาน")

The reference PDF's trailing `-SK` segment has no equivalent field anywhere in the current ERP, and
its business *meaning* (a site code? an internal team code? something else?) was not specified. Per
the task's explicit instruction, this pass does **not** invent that meaning: `secondaryCode` is a
plain text field on the Scope of Work header, labeled "รหัสอ้างอิงท้ายงาน (ยังต้องยืนยันความหมาย
ทางธุรกิจ)" in the editor. Its *presence* is now required at creation (see above, 2026-07-15 fix) —
the user supplies whatever real value they already know from their own business context — but
**what that value should represent, or whether it should instead be a selectable list** (e.g. per
salesperson, per site, per team) rather than free text, is still an open question for Codex/the
business to weigh in on.

## Checklist Groups

Reproduces the reference PDF's printed checkbox/radio groups as a reusable, Job-Type-agnostic
structure (`buildDefaultChecklistGroups()`, `api/_lib/scopeOfWorkHandler.ts`):

| Group key | Title | Type | Options |
|---|---|---|---|
| `safety` | Safety | single | 100%, ทั่วไป |
| `torRequirement` | TOR, Requirement from customer | multiple | (one toggle) |
| `documentsToSend` | เอกสารส่งถึง | multiple | Purchase, Project, Factory, Technic, Service, Accounting (added 2026-07-23) |
| `pj2` | เอกสาร ปจ.2 | single | มี ปจ.2, ไม่มี ปจ.2 |
| `transportation` | งานขนส่ง | single | มีขนส่ง, ไม่มีขนส่ง, EMS |
| `logo` | Logo | single (+ free-text `note`) | มี — HUMA, มี — Greensphere, มี — Etc. (โปรดระบุ), ไม่มี |
| `namePlate` | Name plate | single | มี — Aluminium, มี — Sticker, มี — SUS, ไม่มี |
| `testReportType` | Test Report — ประเภท | single | FRP Tank, FRP Lining, PM |
| `testReportLevel` | Test Report — ระดับรายงาน | single | Report full option, Report normal option |
| `billingConditions` | เงื่อนไขการวางบิล (สัญญา) | single | มี, ไม่มี |
| `deliveryDocFormat` | เงื่อนไขการส่งมอบงาน | single | แบบฟอร์มบริษัท, แบบฟอร์มลูกค้า (แนบไฟล์) |

The PDF's "Test Report" group actually mixes two independent choices (which product type, and
which report detail level) — rather than force that into one flat option list or invent a nested
group shape the suggested `checklistGroups` structure doesn't support, it's split into two sibling
groups (`testReportType`/`testReportLevel`), both flat and independently editable.

**Every option starts unchecked** except two Job-Type-driven suggestions the spec explicitly named:
`jobTypeCode === "LI"` suggests `testReportType.frpLining`; `"TA"` suggests `testReportType.frpTank`.
`SC`/`BF`/any other code get no suggestion (structure only). Both suggestions remain fully editable
— nothing is hardcoded as mandatory.

**Data shape** (`src/lib/scopeOfWork.ts`):
```ts
interface ChecklistOption { key: string; label: string; checked: boolean; }
interface ChecklistGroup { key: string; title: string; selectionType: "single" | "multiple"; options: ChecklistOption[]; note?: string; }
```
Reusable across every Job Type — the same 11 groups apply to LI/TA/SC/BF/future codes; only the
Test Report suggestion varies. A `PATCH` can only toggle `checked`/set a group's `note` — the
server re-clamps a `"single"` group to at most one checked option and only recognizes group/option
`key`s it itself generated at creation, so a direct API call can't inject a new group, rename a
label, or change a group's `selectionType` (`sanitizeChecklistGroups()`).

**2026-07-23, "Accounting" added + existing-record backfill**: `documentsToSend` gained a 6th
option (`{ key: "accounting", label: "Accounting" }`), per direct user request. Its option list is
now generated from a shared `DOCUMENT_RECIPIENT_DEPARTMENTS` constant (`src/lib/
documentRequirements.ts`) rather than listed inline — the same constant also drives the User form's
`department` dropdown (see "Document Recipients" below), so the two can never drift apart.
`withDefaultChecklistGroups()` was extended to backfill any *option* the current builder generates
but a stored group predates (previously it only backfilled entirely missing *groups* and missing
`note` fields) — without this, every Scope of Work saved before this pass would have been
permanently frozen at 5 options, unable to route to Accounting at all. The backfilled option is
appended at the end of the existing list (after "อื่น ๆ"), not inserted at its "correct" position —
a minor cosmetic ordering difference from a freshly-created record, not worth extra complexity for
otherwise-unordered checkbox state.

## Document Recipients (added 2026-07-23)

Per a direct user request ("อยากให้ลิงค์ข้อมูลกับแผนกที่จะเลือกตอนสร้างพนักงานเพราะจะต้องส่งเอกสาร
ไปให้คนนั้นๆที่อยู่ในแต่ละแผนก" — link this checklist to the department chosen when creating an
employee, because documents need to go to the real person in each department), the `documentsToSend`
checklist is now backed by real people, not just a printed-form checkbox list:

- **`User.department`** (`src/pages/admin/UserManagementPage.tsx`) changed from a free-text input
  with datalist autocomplete hints to a real `<select>` constrained to `DOCUMENT_RECIPIENT_DEPARTMENTS`'
  6 labels (Purchase/Project/Factory/Technic/Service/Accounting) — the exact same strings as the
  checklist's own option labels, so matching a checked department to real users is an exact string
  match, not fuzzy free-text guessing. A user whose stored `department` predates this change (the
  old free-text field could hold anything) is kept as an extra, clearly-labeled "ค่าเดิม"/"legacy
  value" option in the dropdown rather than silently discarded on save — picking a real option
  replaces it for good. The previous `DEPARTMENT_SUGGESTIONS` constant (`src/lib/users.ts`, generic
  HR-style department names like "ฝ่ายขาย"/"วิศวกรรม"/"ไอที") was removed — it had zero other
  consumers and represented a different, unlinked taxonomy from the one this feature needs.
- **`ScopeOfWork.documentRecipients: Record<string, string[]>`** (new field) maps a
  `documentsToSend` option key (e.g. `"purchase"`) to the `User.id`s picked as that department's
  actual recipients. Independent of the option's `checked` state — unchecking a department doesn't
  clear its picked recipients, so re-checking it later remembers the previous picks. Never includes
  the `"other"` key (free text, no real department to resolve candidates against).
- **`DocumentRecipientsPicker.tsx`** (new component, rendered in `ScopeOfWorkDocument.tsx` right
  below the checklist card) shows one row per currently-checked department, listing every `User`
  whose `department` exactly matches that department's label — picking/unpicking updates
  `documentRecipients`. A department with zero matching users shows a hint to go set one up in User
  Management, rather than an empty, unexplained row. **2026-07-23, same-day UX pass** (direct user
  report — a color-only toggle-chip design wasn't a clear enough "you're choosing who this gets
  emailed to" affordance): each candidate is now a real `<input type="checkbox">` + name, matching
  `ChecklistGroupCard.tsx`'s already-established checkbox convention immediately above this card,
  inside its own bordered per-department box with a "เลือกแล้ว N คน"/"ยังไม่ได้เลือกผู้รับ" badge
  next to the department title so it's obvious at a glance which departments still need a pick.
- **"ส่งอีเมลแจ้งผู้รับเอกสาร"** button (below the picker, visible once ≥1 department is checked):
  saves the record first (the server reads recipients from the persisted document, not unsaved
  client state), then calls `POST /api/scope-of-works/:id/send-documents`
  (`handleSendDocumentNotifications()`, `api/_lib/scopeOfWorkHandler.ts`). Only departments that are
  BOTH currently checked AND have ≥1 picked recipient are actually emailed; recipients are deduped
  across departments so a person picked under two checked options gets one email/notification, not
  two. Gated by `scopeOfWork:print` (a distribution/export action, not a content edit — no new
  permission was added, and like Print it has no ownership check and works on a `"Final"` record
  too). Sends via `api/_lib/email.ts`'s `sendEmail()` (Resend REST API, see
  [ARCHITECTURE.md](../ARCHITECTURE.md)) in parallel per recipient (`Promise.allSettled`, so one bad
  address doesn't block the others), writes a `"Scope of Work Document Notification Sent"` audit
  entry, and returns `{ sentCount, failedCount, recipientCount }` for the UI toast.
- **In-app notification + recipient list visibility** (added 2026-07-23, same-day second pass, per
  direct user follow-up — "อยากรู้ว่าทำยังไงถึงให้มันไปโผล่ในหน้า scope of work ของเราเวลาที่มีคนอื่น
  ส่งมา... อยากให้ขึ้นแจ้งเตือนในระบบด้วย"): sending now does two more things besides the email —
  (1) writes one in-app `Notification` (`type: "scope_of_work_document_sent"`, bell icon `Mail`) per
  resolved recipient, regardless of that individual's own email outcome — see
  [Notifications.md](./Notifications.md). Clicking it deep-links straight to the record on the
  standalone Scope of Work page (`relatedScopeId` → `App.tsx`'s `scopeOfWorkDeepLinkId` →
  `ScopeOfWorkPage.tsx`'s `initialScopeOfWorkId` prop, same "adjust state during rendering" pattern
  `QuotationPage.tsx`'s `initialQuoteId` already uses). (2) `GET /api/scope-of-works` (list-everything
  mode) and `GET /api/search`'s `scopeOfWorks` category are both now **also** visible to a caller
  who was picked as a document recipient, even without `scopeOfWork:viewAll` and even if they didn't
  create the record — a `$or` of `{ "documentRecipients.<key>": ctx.user.id }` for each of the 6 real
  department keys, added to the existing own-records-only filter (see
  [RBAC.md](../RBAC.md) "Scope of Work Own-Records-Only Viewing"). Without this, a recipient who
  never clicks the notification/email link (or whose email bounced) would have had literally no way
  to find the document again through the app's own UI.
- **Known limitation, not fixed this pass**: the "เปิดดูใน TCS ERP" link inside the *email* itself
  still only opens the app's homepage, not the specific record — this app has no URL-based router
  (see [ARCHITECTURE.md](../ARCHITECTURE.md)), so a plain link from an external email genuinely
  cannot restore in-memory navigation state on page load the way the in-app notification click
  above does. The reliable way to jump straight to a specific record today is the in-app
  notification bell, not the email link.
- **Not built this pass**: attaching the actual printed document (PDF) to the email — this app has
  no server-side PDF generation (Print/PDF export is entirely browser-native, `window.print()`); the
  email is a plain HTML notification with the job's key fields and a link back into the app, not a
  document-delivery replacement for print. No required-field validation was added either — picking
  recipients is optional, layered on top of the existing "at least one department checked" rule,
  which is unchanged.
- **⚠️ Requires manual setup before this feature actually works**: `RESEND_API_KEY` must be added
  to Vercel's environment variables — the send button returns a clear `500` ("ระบบยังไม่ได้ตั้งค่า
  การส่งอีเมล") instead of silently failing when it's missing, but nothing in this codebase can set
  the key itself (a human must sign up at resend.com). See [ARCHITECTURE.md](../ARCHITECTURE.md) and
  [TODO.md](../TODO.md).

## Payment Conditions

A dedicated (non-checklist) section: `installments` (an array of `{ id, pct, label, paymentType,
days }` rows — e.g. `{ pct: 40, label: "Down Payment", paymentType: "Cash", days: null }`),
`description` (free text), `notes` (free text). Pulled from the quotation's `paymentTerms` string
into `description` at creation time; the sample PDF's "40%/60%" split is **never** saved as a
universal default — a new record always starts with an empty `installments` array unless the
quotation itself already had percentage data (legacy pre-2026-07-23 records only, via
`normalizePaymentConditions()` — see below). `paymentType` is `"" | "Cash" | "Credit"` (a structured
dropdown, not free text) and `days` an optional integer day count that applies to **either** type
(a Cash installment can carry its own day count too, e.g. "Cash 30 days" — not exclusively a Credit
concept); `formatPaymentMethod()` derives the printed "Cash"/"Credit 30 Days" string from the two
fields on demand, so nothing can drift out of sync with a separately-stored text value.

**2026-07-23, per direct user request, two same-day passes**: (1) replaced the original fixed
`{downPaymentPct, finalPaymentPct, method}` pair (exactly 2 installments, one shared free-text
payment method) with the `installments` array above — arbitrarily many rows, each with its own
`label`, so a genuine 3+-installment plan is representable (e.g. "20% Down Payment (Cash 30 days) /
40% Materials (Credit 30 days) / 40% After Delivered Date (Credit 30 days)"). (2) a direct same-day
follow-up ("ไม่คือสามารถแก้ไขเปอร์เซ็น แก้ไขว่าจะเลือกเป็น Cash หรือ Credit") replaced that first
pass's free-text `method` field with the structured `paymentType`/`days` pair above — a
Cash/Credit `<select>` dropdown plus a separate day-count input, rather than typing "Cash" or
"Credit 30 Days" as plain text. 3 quick-select presets (`PAYMENT_TERM_PRESETS` in
`src/lib/scopeOfWork.ts`) populate a common 2-installment schedule with one click — "40% Down
Payment (Cash) / 60% After Job Complete (Cash)", "30% Down Payment (Cash) / 70% After Job Complete
(Credit 30 Days)", "100% After Job Complete (Credit 30 Days)" — but every row (preset-applied or
manually added via "+ เพิ่มงวดชำระเงิน") stays fully editable/removable afterward; the presets are
a starting point, never a locked-in choice.

**Existing document compatibility**: a Scope of Work saved before either 2026-07-23 pass still has
an older shape in its MongoDB document — either the very first fixed `{downPaymentPct,
finalPaymentPct, method}` pair, or the same-day intermediate `installments` array whose rows
carried a free-text `method` string instead of `paymentType`/`days`. No migration script was run
for either (MongoDB enforces no schema, so this is safe to defer). `normalizePaymentConditions()`
(`src/lib/scopeOfWork.ts`) converts either older shape into the current `installments` array on
every read — a best-effort `parsePaymentMethodText()` regex-matches "Cash"/"Credit" and a trailing
day count out of a legacy free-text `method` string, falling back to `paymentType: ""` (day count
still kept, if any) for text that names neither — called from `normalizeScope()`/
`toValidationInput()` in `api/_lib/scopeOfWorkHandler.ts`, so the frontend and the validators only
ever see the current shape; the record is persisted in the current shape for good the next time
it's saved through `sanitizePaymentConditions()`.

## Required-Field Validation (added 2026-07-16)

**Unaffected by the 2026-07-16 Quotation rollback** (see [Quotation.md](./Quotation.md) "Required-
Field Validation") — that later same-day business decision only relaxed/removed Quotation's own
required-field policy and its "ข้อกำหนดเอกสารและการส่งมอบ" section; everything below still applies
to Scope of Work exactly as described, unchanged.

Previously only `secondaryCode` was required (at creation only) — every header field, all 11
checklist groups, items, and payment conditions could be saved, submitted for Final, and printed
completely blank. Now enforced identically client- and server-side via
`src/lib/validation/scopeOfWorkValidation.ts` (same pure functions value-imported into both bundles).

**Required fields** (`scopeOfWorkRequiredFields`, whitespace-only counts as empty):
`customerSnapshot.companyName`/`.contactName`/`.address`/`.phone`, `issueDate`, `deliveryDate`,
`drawingCode`, `secondaryCode`, `deliveryLocation`, `shippingContact`, `shippingPhone`,
`billingContact`, `billingPhone`, `paymentConditions.description`, `seller.name`. **Optional
exceptions**: `customerSnapshot.taxId`/`.email`, `customerPoNumber`, `remarks`. (`paymentConditions.
method` was removed from this list 2026-07-23 — that field no longer exists at the top level, see
"Payment Conditions" above; each `installments` row's own `method` is optional, same as before.)

**Items** (`validateScopeOfWorkItems()`): at least one non-header item; every non-header item needs
a non-blank `name`/`unit`, `quantity > 0`, and at least one non-blank specification line.

**Mandatory checklist selections**: 8 of the 11 groups above (`safety`, `transportation`, `logo`,
`billingConditions`, `documentsToSend`, `namePlate`, `deliveryDocFormat`, `pj2`) now require at
least one checked option; `torRequirement`/`testReportType`/`testReportLevel` stay optional.
Selecting an "อื่น ๆ"/"Etc." option (added to `safety`/`transportation`/`namePlate`/
`documentsToSend`'s option lists specifically for this rule — Logo already had "Etc.") makes that
group's `note` required too — as does `safety`'s "TOR / Requirement from customer" option, per the
business rule's explicit "If TOR or Other is selected, require a reference/detail field."

**2026-07-16, Codex review fix pass** (0 Critical, 2 High + 4 Medium found and fixed against this
same-day validation pass — see `docs/CODEX_REVIEW_REPORT.md`'s "Claude Fix Status"): **High** — the
checklist snapshot bug (see "Snapshot Behavior" above); the "อื่น ๆ"/TOR detail rule was
server-enforced but **unreachable from the normal UI** for `safety`/`transportation`/`namePlate`/
`documentsToSend` (`buildDefaultChecklistGroups()` only initialized `note: ""` for Logo, and
`ChecklistGroupCard` only renders its detail input when `note !== undefined`) — fixed by
initializing `note: ""` on all four groups, plus backfilling it onto any already-saved record
missing it (`withDefaultChecklistGroups()`). **Medium**: Print/Finalize buttons now carry a real
HTML `disabled` attribute (previously only dimmed + click-guarded, not semantically disabled);
`issueDate`/`deliveryDate`/`seller.date`/`approver.date` are now checked for a real calendar date at
finalization, not just non-blank (`isValidIsoDateOrEmpty()`, `src/lib/validation/dateUtils.ts`); a
server-returned `422`'s `fieldErrors`/`groupErrors` are now merged into the on-screen validation
result (`mergeServerValidationErrors()`) instead of only showing as a toast; `paymentConditions.method`/
`.notes`, `seller.date`/`approver.date`, and per-item `remark` are now explicitly declared optional
in the central config rather than silently absent from it.

**Deliberately not built this pass** (would require inventing unconfirmed business option
catalogs — see "Deliberate scope decisions" in CHANGELOG.md): billing "Custom" schedule detail,
delivery "customer form" attachment/date-or-day rule, and a supporting-detail model for ปจ.2 beyond
its existing มี/ไม่มี selection. The review flagged these as incomplete; they remain open, tracked
in TODO.md, pending a confirmed business rule rather than a fabricated one.

**Payment percentages**: if the user has added at least one `installments` row (via a preset or
manually), every row's percentage must be filled in and all rows together must sum to exactly
100% — arbitrarily many rows, never a hardcoded split; if no rows exist (the free-text
`description` field carries the billing condition instead), no percentage check applies.
Generalized 2026-07-23 from the previous fixed down-payment/final-payment pair — see "Payment
Conditions" above.

**Seller/approver**: `seller.name` is always required (it defaults from the quotation's salesperson
at creation, so this is rarely actually missing in practice). `approver.name` is required **only
when Finalizing** — printing a still-Draft record doesn't need one yet, matching "Seller/approver
information when reaching the relevant workflow stage."

**Enforcement points**: `POST /:id/print` (`validateScopeOfWorkForPrint()` — approver only required
if already `Final`) and `POST /:id/finalize` (`validateScopeOfWorkForFinalization()` — approver
always required). A `422 { code: "DOCUMENT_INCOMPLETE", fieldErrors, groupErrors }` blocks the
request even if a client bypassed the frontend. **Save Draft/PATCH/refresh remain unaffected** — a
Draft record may stay incomplete indefinitely.

**Frontend**: same shared components as Quotation (`RequiredFieldLabel`/`FieldError`/
`ValidationSummary`/`DocumentCompletionIndicator`, `ChecklistGroupCard` — renamed from
`ScopeOfWorkChecklistGroup.tsx` since Quotation now reuses the identical component). Print/"ยืนยัน
Final" stay visible but styled disabled with a tooltip when incomplete; clicking anyway shows a
toast + scrolls to the summary rather than silently doing nothing.

**Existing-document compatibility**: every Scope of Work record already had `checklistGroups` set at
creation (mandatory field, never optional in this schema), so no record can be missing a whole group
outright — `withDefaultChecklistGroups()` still normalizes on every server response as a defensive
safety net. A record saved before this pass simply won't have the new "อื่น ๆ" option *within* an
existing group until the record is next edited/refreshed (only a wholly-missing group gets
backfilled, not a new option inside one already present) — not expected to affect real data given
this module is only one day old in production.

## Signatures

`seller`/`approver` — each `{ name, userId, date }`. `approver` always starts fully blank. `seller`
defaults from real quotation data, not an invented value: **`quote.salesperson` when non-empty**
(2026-07-15, Codex review High Priority fix — previously this always defaulted to whoever clicked
"สร้าง Scope of Work," silently dropping the quotation's actual assigned salesperson), falling back
to the creating user's own name only when the quotation has no salesperson recorded at all
(`resolveDefaultSeller()`, `api/_lib/scopeOfWorkHandler.ts`). When the salesperson's name matches a
real ERP user account (by `fullName`), that user's `id` is linked too so their saved
`signatureDataUrl` renders at print time under the correct name; an unmatched name is still used as
plain text with no image link. Both `seller`/`approver` remain fully editable afterward — this is
only the starting value. Never auto-fills an approver: that would mean inventing who approved
something that hasn't happened yet.

The quotation's own salesperson is also kept as a separate, permanent, non-editable provenance field
— `ScopeOfWork.quotationSalesperson` (frozen at creation, refreshed only by "อัปเดตข้อมูลจากใบเสนอ
ราคา") — distinct from the editable `seller` above, so later editing who actually signs a specific
Scope of Work document never loses the historical record of who the quotation was originally
assigned to.

## Snapshot Behavior

Creating a Scope of Work copies (never live-references) the quotation's customer info/items/Job
Type/PO/remarks into its own document. Editing a Scope of Work afterward never touches the source
quotation, and later edits to the quotation, Customer master data, or Product master data never
silently change an already-created Scope of Work. An explicit **"อัปเดตข้อมูลจากใบเสนอราคา"** action
(`POST /api/scope-of-works/:id/refresh`) re-pulls only the quotation-derived fields
(`customerSnapshot`, `customerPoNumber`, `deliveryLocation`, `remarks`, `items`, `quotationNumber`,
`quotationSalesperson`) — everything the user filled in by hand (checklist state, payment
conditions, shipping/billing contact, signatures, `secondaryCode`, `drawingCode`, `deliveryDate`) is
left untouched. The client shows a confirm dialog before calling this ("จะเขียนทับข้อมูล...
ยืนยันหรือไม่?"). Refresh requires `quotations:view` in addition to Scope of Work edit/ownership
authorization (2026-07-15, Codex review Medium fix — matches the same check `create` already had).

**Checklist groups always start from `buildDefaultChecklistGroups(jobTypeCode)`** (a brand-new,
always-unchecked structure) — this briefly changed and then reverted the same day (2026-07-16):
a same-day fix pass made `deriveFromQuotation()` copy `quote.checklistGroups` from the source
quotation (since, for about a day, Quotation itself carried a matching `checklistGroups` field —
see [Quotation.md](./Quotation.md) "Required-Field Validation"). A later business decision removed
that Quotation-side field entirely, so there is nothing left to copy — `deriveFromQuotation()` now
always falls back to `buildDefaultChecklistGroups()`, which is exactly what it did before either of
those two same-day changes. **Scope of Work's own checklist behavior is otherwise completely
unaffected** by any of this — the groups, their mandatory/optional status, validation, and UI are
unchanged.

## Status / Lifecycle

Two statuses: `Draft` → `Final`. Finalizing (`POST /:id/finalize`, `scopeOfWork:finalize`) locks the
record against further edits/refresh entirely — there is no un-finalize route in this pass; "ทำสำเนา"
(`POST /:id/duplicate`) is the documented way to keep working from a copy (always created as a fresh
Draft, with a brand-new `scopeNumber`/`issueDate`/`jobSequence`, `seller` reset to the duplicating
user, `approver` reset to blank).

## Print / PDF

`ScopeOfWorkPrintDocument.tsx` — a `hidden print:table` element (same convention as the Quotation's
own `PrintDocument.tsx`), shown only via the browser's print dialog (`window.print()`, triggered by
the "พิมพ์ / PDF" toolbar button, which also logs a `"Scope of Work Printed"` audit entry first).
The shared `@media print { @page { size: A4 portrait; margin: 12mm; } }` rule in
`src/styles/index.css` (2026-07-15, Codex review Medium fix: `size: A4 portrait` made explicit,
previously only `margin` was set) applies to every printed document in this app. Reproduces:
SCOPE OF WORK title, two-column header fields, the checklist groups grid with a literal checked/
unchecked box glyph per option, the numbered item table (no price/discount/VAT columns), remarks,
and the ผู้ขาย/ผู้อนุมัติ signature table. Never prints: blue handwritten sample values (only live
field values render, blank where unfilled), yellow highlights, fake placeholder data, or any
quotation pricing.

**Print-hint tooltip** (added 2026-07-16): a small info icon next to the Print/PDF button (inside
the `print:hidden` toolbar, so it never appears in the printed output) tells the user to disable
"Headers and footers" in their browser's print settings if they don't want the browser's own
injected website URL/print date on the page — this document never renders a URL itself, that
content comes from the browser's print dialog, which the app has no CSS/DOM way to override; see
[UI_GUIDELINES.md](../UI_GUIDELINES.md) "Print / PDF".

**Multi-page item groups (2026-07-15, Codex review Medium fix)**: each item (and its following
specification/remark row, when it has one) is grouped into its own `<tbody style="break-inside:
avoid">` rather than sharing one big `<tbody>` for the whole table — a plain `breakInside: "avoid"`
on the item row alone stops a break happening *inside* that row, but does nothing to stop a page
break falling *between* the item row and its own detail row right after it. Grouping both into one
unbreakable `<tbody>` unit closes that gap, satisfying "do not split a main item heading from its
first detail line." The shared `<thead>` still repeats on every page (native browser print
behavior for `<thead>` inside one `<table>`, unaffected by having multiple `<tbody>` siblings).

## Empty / Error States

If the source quotation has zero line items, the editor shows an inline banner: "ใบเสนอราคานี้ยังไม่มี
รายการสินค้า/งานสำหรับสร้าง Scope of Work" with two actions — "กลับไปแก้ไขใบเสนอราคา" (returns to the
quotation) and, if the user can edit, "เพิ่มรายการใน Scope of Work ด้วยตนเอง" (adds one blank item
directly, no need to go back to the quotation first). A failed fetch shows a retry button rather
than an infinite spinner.

## Global Search Integration (added 2026-07-15, Codex review High Priority fix)

Scope of Work previously had no Global Search integration at all — a High Priority gap an
independent review found. `GET /api/search` now returns a `scopeOfWorks` result group
(`searchScopeOfWorks()`, `api/_lib/searchHandler.ts`), gated by `scopeOfWork:view`, searchable by
exactly the 6 keys the review named: scope number, quotation number, customer name, Job Type
code/name, PO number, and status. Clicking a result (`GlobalSearch.tsx`) opens the source
quotation's detail view, then jumps straight into that Scope of Work's editor — the same
"App.tsx state → QuotationPage's `initialScopeOfWorkDeepLink`" deep-link pattern already used for
notification clicks and the Quotation Templates wizard's search result. **2026-07-23**: also scoped
by `scopeOfWork:viewAll` — a caller without it only gets their own records back from this search
category, matching the standalone list page's own scoping (see "Own-Records-Only Viewing" above).

## RBAC / API / Data Model

See [RBAC.md](../RBAC.md) "Scope of Work" for the 7 permissions and default-role grants, and
[API.md](../API.md) "Scope of Work" for every route. Data model: `ScopeOfWork` in
`src/lib/scopeOfWork.ts` (also see [DATABASE.md](../DATABASE.md) `ScopeOfWork`) — this file is
type-imported into the API bundle, so (per the standing rule in `docs/CLAUDE.md`) it must never
gain a *value* import that transitively pulls in JSX/React.

## Files

- `src/lib/scopeOfWork.ts` — types + `apiFetch` wrapper functions.
- `api/_lib/scopeOfWorkHandler.ts` — all API logic (create/get/list/update/finalize/duplicate/
  refresh/print/delete), mounted from `api/handlers/quotes.ts` (shares its function file — Vercel
  Hobby's 12-function cap is still fully used).
- `api/_lib/collections.ts` — `scopeOfWorksCollection()` + indexes.
- `api/_lib/searchHandler.ts` / `src/lib/search.ts` / `src/components/GlobalSearch.tsx` — the
  `scopeOfWorks` Global Search result group (2026-07-15 fix pass).
- `src/pages/quotation/ScopeOfWorkDocument.tsx` — the editor page (header fields, checklist grid,
  items, payment conditions, document recipients, remarks, signatures, toolbar).
- `src/pages/quotation/ScopeOfWorkItemsEditor.tsx` — the item list editor.
- `src/pages/quotation/ChecklistGroupCard.tsx` — one checklist group card (renamed 2026-07-16 from
  `ScopeOfWorkChecklistGroup.tsx`; this file's own name was left stale in this list until now).
- `src/pages/quotation/DocumentRecipientsPicker.tsx` (**added 2026-07-23**) — the per-department
  recipient toggle-chip picker under the checklist card, see "Document Recipients" above.
- `api/_lib/email.ts` (**added 2026-07-23**) — `sendEmail()`, the shared Resend REST API wrapper.
- `src/pages/quotation/ScopeOfWorkPrintDocument.tsx` — the print/PDF layout.
- `src/pages/quotation/QuoteDocument.tsx` — the "สร้าง Scope of Work"/"เปิด / แก้ไข Scope of Work"
  toolbar button (fetches whether one already exists per quotation).
- `src/pages/quotation/QuotationPage.tsx` — the `"scopeOfWork"` view state routing between
  `QuoteDocument` and `ScopeOfWorkDocument`, used when a Scope of Work is opened directly from a
  quotation (unchanged by the 2026-07-22 pass below).
- `src/pages/scopeOfWork/ScopeOfWorkPage.tsx` (**added 2026-07-22**) — the standalone sidebar
  page's container: fetches every Scope of Work once (`fetchAllScopeOfWorks()`), owns list↔detail
  view-switching, renders either `ScopeOfWorkList` or the same `ScopeOfWorkDocument` component
  `QuotationPage.tsx` uses (imported from `../quotation/ScopeOfWorkDocument`) with
  `backLabel="กลับไปรายการ Scope of Work"`.
- `src/pages/scopeOfWork/ScopeOfWorkList.tsx` (**added 2026-07-22**) — the browsable list: summary
  cards (Total/Draft/Final), search (scope number/customer/quotation number/Job Type), Job Type
  dropdown, status pill filter, table — mirrors `QuoteList.tsx`'s pattern, hardcoded Thai text (not
  yet wired to `i18n.tsx`, matching every other Scope of Work UI file's existing convention).
  **Same day, later**: added a `quotationSalesperson` table column + filter dropdown.
- `src/App.tsx` (**2026-07-22**) — new `"scopeOfWork"` `NavKey`/nav item (icon `ClipboardList`,
  gated by `scopeOfWork:view`, grouped under "งานขาย" next to Quotations), self-fetching like
  Dashboard/Audit Log (no `NAV_RESOURCES` entry — it doesn't depend on any boot-time domain fetch).

## Remaining Business Questions

1. **`secondaryCode`'s actual meaning** — see "Open Business Question" above. Its *presence* is now
   required at creation (2026-07-15 fix), but no business rule for what it should represent, or
   whether it should be a selectable list instead of free text, has been invented.
2. **Shipping vs. billing contact split** — should the Customer master data (or the quotation
   itself) eventually carry two distinct contacts (delivery vs. billing) so these four fields could
   reliably auto-fill? Out of scope for this pass (would touch `Customer`/`Quote` shapes, not just
   Scope of Work). The quotation's one generic contact name is now at least retained in
   `customerSnapshot.contactName` (2026-07-15 fix) rather than dropped, without being force-mapped
   into either shipping or billing.
3. **Checklist group business categorization** — the spec's suggested category list ("Inspection
   conditions" among them) doesn't map 1:1 onto the reference PDF's actual printed groups; this pass
   followed the PDF as the literal source of truth (see "Checklist Groups" above) rather than
   inventing an "Inspection conditions" group with no PDF equivalent. Confirm whether any additional
   group is actually needed.
4. **No un-finalize action** — once `Final`, a record is permanently locked (only "ทำสำเนา" continues
   the work). Confirm this matches the intended business process, or whether a controlled
   un-finalize (e.g. Super-Admin-only) should exist.
5. **No restore UI for a soft-deleted Scope of Work** — deletion is a real, filtered-out soft delete
   in the database, but there is no admin-facing restore endpoint/screen yet (2026-07-15, Codex
   review Low Priority finding — the delete confirmation's wording was corrected to stop implying
   one exists). Add a real restore action if this is ever needed in practice.
