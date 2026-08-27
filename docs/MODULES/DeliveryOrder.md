# Module: Delivery Order


## Installment number/date stay editable after approval (2026-08-27)

Project department request: *"ใบส่งมอบงานโปรเจกต์สามารถเพิ่มหรือแก้ไขเลขที่ใบส่งมอบงานได้ แต่ไม่สามารถ
ติ๊กได้เหมือนเดิม"* — owner-confirmed reading: the **number** must stay editable past Final, the
**item tick-list** must stay locked exactly as it is.

`POST /api/delivery-orders/:id/installment-numbers` writes **only** `documentNumber`/`issueDate` per
installment row and carries no `status` lock, mirroring `POST /material-requisitions/:id/return` and
Scope of Work's PO-chasing fields — all three are follow-up data filled in after the document is
signed off, which the ordinary Draft-only `PATCH` can never reach.

- Row ids must already exist on the document (same rule `sanitizeInstallmentsUpdate()` enforces), so
  this route can never invent an installment.
- **Writes an audit entry every time** and is deliberately **not** wired to auto-save — per the
  standing decision in TODO.md that editing an approved document should always leave a trail.
- In the editor the two inputs are gated on `canEdit` alone (`numbersDisabled`), while the item
  checkboxes and Remark stay on `editable` (`canEdit && isDraft`). A separate "บันทึกเลขที่/วันที่"
  toolbar button appears once the document is past Draft, since the ordinary save button is hidden.

## Status: ✅ Built (2026-07-23), Down Payment exclusion + signature-line fix same day, separate per-milestone printing + full print-layout rebuild to match the FM-SL-05 reference 2026-07-24, Facebook/Line/website letterhead fields wired to Settings 2026-08-04

**2026-07-24, print layout rebuilt to visually match the reference PDF**: `DeliveryOrderPrintDocument.tsx`
was rebuilt from scratch against a page-image inspection (rendered PNGs + zoomed crops, not just
extracted text) of all 3 pages of the reference (`public/ใบส่งมอบสินค้าและบริการ PQ202607-175-SC-WM
บริษัท อีจ.pdf`, company form FM-SL-05 Rev.01). The document is now a plain black-on-white formal
form — no app design-system styling. Structure per printed page: English letterhead (round TCS logo
from live company data falling back to `public/logo.png`; the name/address/tel/email text is a fixed
`LETTERHEAD` constant reproduced from the form, since the Settings singleton's `name`/`address` are a
single-line Thai identity, a different shape from this English/split-address reference form —
**Facebook/Line/website (2026-08-04) no longer share that limitation**, see below — with branded
Facebook/Line icons (now the shared `components/PrintSocialIcons.tsx`, previously defined locally)
and the website link); centered
Thai/English titles; two-column เรียน (each customer/address line on a thin black underline) /
เลขที่-วันที่-WORK ORDER value lines; one full-width bordered table (intro statement row → underlined
bold รายการ/จำนวน/หน่วย headers, no vertical column separators → bold item rows, each spec on its
own bordered row → **empty filler rows** padding short milestones so the Remark row lands near the
page bottom like the reference (`SINGLE_PAGE_ROW_TARGET`, visual only, never business data) → the
milestone's Remark as the last row); borderless two-column signature block; "FM-SL-05 Rev.01:
11/09/67" bottom-right in sans-serif. The 2026-07-24 morning pass's "งวดชำระ" header line was
removed again — the reference has no such line (the Remark identifies the milestone).
**Fonts**: `'Times New Roman', 'Noto Serif Thai', serif`; Noto Serif Thai was added to
`src/styles/fonts.css`'s Google import. A real bug was found during verification: the print DOM is
`display:none` on screen, so the Thai serif font was never downloaded and printing silently fell
back to system Thai fonts — fixed with a zero-size always-rendered probe span (visibility:hidden)
that makes the CSS engine fetch both used weights on mount. **Multi-page**: letterhead/titles/info
sit outside the table so the small `<thead>` (intro + column headers) actually repeats on overflow
pages (Chromium skips repeating tall theads); item+specs share an unbreakable `<tbody>`;
Remark/signature render once at the end. **Visually verified** by generating real A4 PDFs with
headless system Chrome (`puppeteer-core`, temporary harness deleted after use) and comparing
side-by-side with the reference: one-page dense milestone (≈ ref p1), two-item milestone with
filler (≈ ref p2/p3), `?only=` single-milestone scoping (exactly 1 page, zero sibling data),
Thai+English item text, 30-item 3-page stress test. **Deliberate remaining differences**: 12mm
margins (reference's ~3mm isn't reliably printable), and Noto Serif Thai instead of the
reference's Angsana-like Windows-only font. **Same day, follow-up fix**: per a direct user report
("มันมีลิ้งเว็บอยู่ในใบซ้ายล่างเอาออกด้วย"), the browser's own "Headers and footers" print texts —
the page URL at the bottom-left in particular — are now suppressed outright: a component-scoped
`<style>` sets `@page { margin: 0 }` for this document only (the browser has no margin area to
draw its texts into) and each page wrapper carries the 12mm as `padding` instead, so the printed
geometry is unchanged. Verified with Chrome's header/footer layer force-enabled. See
[UI_GUIDELINES.md](../UI_GUIDELINES.md) "Print / PDF" for when this trick is (and isn't)
applicable. See CHANGELOG.md 2026-07-24.

**2026-07-24, separate Delivery Note per payment milestone**: each eligible (non-deposit) payment
milestone now prints as its own completely independent Delivery Note. Three changes:
(1) the global toolbar "พิมพ์ / PDF" button (which printed every milestone's page in one combined
document) was **removed**, replaced by a per-installment-card "พิมพ์ใบส่งมอบงวดนี้" button (same
`deliveryOrder:print` gate; blocks with a toast if that specific milestone has zero items ticked) —
clicking it scopes the print output to that one milestone via a `printInstallmentId` state +
`DeliveryOrderPrintDocument`'s new optional `onlyInstallmentId` prop, so the printed document
contains only that milestone's เลขที่/วันที่/ticked items/Remark, never a sibling milestone's (a raw
browser Ctrl+P still falls back to all pages, each page self-contained as before);
(2) the printed header gained a "งวดชำระ" line showing the milestone name (`{pct}% {label}`, e.g.
"40% Materials") — previously only the editable Remark identified the milestone;
(3) the deposit exclusion was broadened from the exact label "Down Payment" to an exact-whole-label
set: "Down Payment" / "Deposit" / "เงินมัดจำ" / "ชำระเงินล่วงหน้า" (`isDepositLabel()`, formerly
`isDownPaymentLabel()`; `stripDownPayment()` → `stripDepositInstallments()`) — still never a
substring or percentage-based match, so "40% Materials" stays eligible. Per-milestone state
(independent `itemIds`/`documentNumber`/`issueDate`/`remark`, keyed by the stable installment `id`)
already existed and is unchanged. See CHANGELOG.md 2026-07-24.

**2026-07-23, same-day fix, signature line**: per a direct user bug report ("ทำไมติ๊กอันล่างแล้วกด
พิมพ์ออกมาแล้วมันไม่มีอะไรเลยละ") the signature block in `DeliveryOrderPrintDocument.tsx` printed a
duplicated "บริษัท บริษัท {name}" — the hardcoded "ลงนาม บริษัท " prefix plus
`customerCompanyName`/`companyHeader.name`, both of which already contain the full "บริษัท ... จำกัด"
legal name. Fixed to just "ลงนาม {name}", matching the reference PDF's own convention. Found via a
live interactive reproduction of the exact reported scenario (ticking one item in the second
installment card, then clicking print) using the real `DeliveryOrderDocument`/
`DeliveryOrderPrintDocument` components in a temporary local harness with a mocked `fetch` — the
underlying print-gating logic (`hasAnySelectedItem`) and print CSS (`hidden print:table` — confirmed
present and correct in the actual production `dist/` build output) both worked exactly as designed
for that scenario; the user-reported "nothing came out" symptom could not be reproduced through this
path, so it's most likely the print button was clicked before the checkbox tick registered (the
warning toast fires before the tick, not after) rather than a code defect independent of the
duplicated-signature bug this pass did find and fix. See TODO.md for the still-open follow-up ask.

**2026-07-23, same-day fix**: per a direct user follow-up ("ลืมบอกว่าใบส่งมอบงานจะไม่มี down payment
เลย" — forgot to mention, a Delivery Order never has a Down Payment page), the Down Payment
installment is now excluded from every Delivery Order — a deposit paid before any goods/work are
actually delivered has nothing to "deliver," so it has no place on this document type, unlike Scope
of Work's own payment schedule (which legitimately lists it). `isDownPaymentLabel()`
(`api/_lib/deliveryOrderHandler.ts`) matches the exact label `PAYMENT_TERM_PRESETS`' own "Down
Payment" rows use (case-insensitive, trimmed) — excluded both when building/reconciling installments
(`deriveInstallmentsFromScope()`, covers create and refresh) and defensively at every read path
(`stripDownPayment()`/`toClient()`, so a record created in the brief window before this fix shipped
self-heals on its very next read, no migration script needed — and self-heals in storage too on its
next save, since `PATCH` replaces the whole `installments` array with whatever the client — which
never saw the Down Payment row to begin with — sends back). `tsc`/`lint`/`build` all pass clean;
verified via a standalone Node script (exclusion on create, case/whitespace-insensitive matching, no
false-positive on a label that merely contains "Down Payment" as a substring, and defensive
stripping of an already-stored stale record).

New document type, "ใบส่งมอบสินค้าและบริการ" (Delivery Order & Service Order), added per direct user
request: "ช่วยทำหน้าใบส่งมอบสินค้าให้หน่อย...ดึงข้อมูลแบบไฟล์ pdf...สินค้าจะดึงมาจากหน้า scope of
work...ข้อมูลบริษัทให้ดึงมาจากใบเสนอราคา...ทำแยกแต่ละงวดที่จะส่งไปให้แต่ละแผนก...งวดนี้จะมีให้ติ๊กว่า
เอาสินค้าตัวไหนไปบ้าง...ทำหน้าแยกตรง side bar ออกมาด้วยเหมือนกับพวก scope of work กับ ใบเสนอราคา" —
reproduces the printed structure of the reference PDF ("ใบส่งมอบสินค้าและบริการ
PQ202607-175-SC-WM บริษัท อีจ.pdf", `public/`), a company-provided form (`FM-SL-05 Rev.01`) that
splits a job's delivery/billing across its payment installments — one printed page per installment,
each showing only the items the preparer marks as covered by that shipment.

## Business Flow

1. A record is created from an existing **Scope of Work** — a "สร้างใบส่งมอบสินค้า" toolbar button on
   `ScopeOfWorkDocument.tsx` (same component whether reached via the Quotation-embedded view or the
   standalone Scope of Work page), calling `POST /api/delivery-orders` with `{ scopeOfWorkId }`. No
   extra prompt/input needed at creation time (unlike Scope of Work's `secondaryCode` prompt) —
   everything the document needs is already on the source Scope of Work. If one already exists for
   this Scope of Work, the button reads "เปิดใบส่งมอบสินค้า" and opens the most-recently-updated one
   instead (same existence-check pattern Quotation's "สร้าง/เปิด Scope of Work" button uses).
2. **Customer info** ("เรียน" — company name + address) is snapshotted from the Scope of Work's own
   `customerSnapshot` at creation time (itself already sourced from the Quotation) — per the direct
   instruction "ข้อมูลบริษัทให้ดึงมาจากใบเสนอราคา." **Items** (`DeliveryOrderItem[]`) are snapshotted
   from the Scope of Work's `items` (name/quantity/unit/specifications only — a non-priced section
   divider row is excluded entirely, it makes no sense to "select" onto a delivery page).
3. **Installments** (`DeliveryOrderInstallment[]`) are built from the Scope of Work's
   `paymentConditions.installments` (same `id`, `pct`, `label`, `paymentType`, `days` — always a
   mirror of the Scope of Work's own payment schedule, never independently editable here) — **except
   a deposit installment (Down Payment/Deposit/เงินมัดจำ/ชำระเงินล่วงหน้า), which never gets a
   page** (see "Status" above) — plus
   fields specific to this document: `itemIds` (which of the snapshotted items are ticked as
   included in this installment's shipment — **starts empty**, per the direct instruction "งวดนี้จะมี
   ให้ติ๊กว่าเอาสินค้าตัวไหนไปบ้าง"), `documentNumber`/`issueDate` ("เลขที่"/"วันที่" — always blank by
   default, same "blue-handwritten-style fields start blank" convention Scope of Work already
   follows for its own shipping/billing fields), and `remark` (the "Remark:" footer line, auto-
   drafted from `pct`/`label`/`paymentType`/`days` — e.g. "40% After material on site (Cash 7 Days)"
   — but freely editable afterward, same "auto-draft once, never silently overwrite" convention
   `revisionNote` already established).
4. **"อัปเดตข้อมูลจาก Scope of Work"** re-pulls `customerCompanyName`/`customerAddress`/`items` and
   reconciles `installments` against the Scope of Work's *current* payment schedule, matched by the
   stable installment `id`: a row that still exists keeps its user-entered `itemIds` (stale ids
   pointing at a since-removed item are dropped, never left dangling)/`documentNumber`/`issueDate`/
   `remark`; a brand-new installment gets a fresh blank page; a removed installment's page simply
   stops appearing. Never runs automatically — only on explicit click, with a confirm dialog first.
5. **Print** (`DeliveryOrderPrintDocument.tsx`) is **per milestone** (since 2026-07-24): each
   installment card has its own "พิมพ์ใบส่งมอบงวดนี้" button that prints one independent Delivery
   Note containing only that milestone's page — its เลขที่/วันที่, its ticked items, its Remark, and
   a "งวดชำระ" header line naming the milestone (`{pct}% {label}`) — never a sibling milestone's
   data. There is no combined-print toolbar button anymore. Each page renders as a
   `<table className="hidden print:table ...">` with `style={{ breakAfter: "page" }}`; a raw browser
   Ctrl+P (no button clicked) falls back to rendering every milestone's page, each still fully
   self-contained. Company letterhead is a **mix**: logo and (2026-08-04) Facebook/Line/website come
   from the live Settings → Company Info singleton (`CompanyHeaderInfo`, same convention
   `PrintDocument.tsx`/`ScopeOfWorkPrintDocument.tsx` already use — so those 4 fields stay in sync if
   Settings changes), while name/address/tel/email stay a fixed `LETTERHEAD` constant matching the
   reference form's English/split-line format exactly (Settings' `name`/`address` are single-line
   Thai, a different shape — deliberately not wired up, see the Status section above). No required-field validation gate exists on this document type (deliberately
   simpler than Quotation/Scope of Work's validation machinery) — a milestone's print button only
   blocks with a toast if that milestone has zero items ticked.
6. **Draft/Final lifecycle**, same two-state model as Scope of Work — "ยืนยัน Final" locks the record
   against further edits (no un-finalize action, no Duplicate/Rewrite action either — a Delivery
   Order is meant to track one specific Scope of Work's actual shipments, not spawn independent
   copies). No required-field validation gates finalization either.
7. **Standalone sidebar page** (`src/pages/deliveryOrder/DeliveryOrderPage.tsx`, `Truck` icon, gated
   by `deliveryOrder:view`) for browsing/opening existing records — same "list page owns list↔detail
   view state" pattern `ScopeOfWorkPage.tsx` already uses, reached directly from the sidebar (Sales
   group, after Scope of Work). Creation is still only ever triggered from the Scope of Work detail
   toolbar button above.

## Data Model

`DeliveryOrder` (`src/lib/deliveryOrder.ts`, `delivery_orders` MongoDB collection):

```ts
interface DeliveryOrder {
  id: string;
  scopeOfWorkId: string;
  scopeNumber: string;              // "WORK ORDER" field, frozen at creation, refreshable
  quotationId: string;
  customerCompanyName: string;      // "เรียน" line 1
  customerAddress: string;          // "เรียน" line 2
  items: DeliveryOrderItem[];       // { id, name, quantity, unit, specifications }
  installments: DeliveryOrderInstallment[];
  status: "Draft" | "Final";
  version: number;
  createdAt, updatedAt, createdBy, updatedBy, isDeleted;
}
interface DeliveryOrderInstallment {
  id: string;                       // mirrors the source ScopeOfWorkPaymentInstallment's id
  pct: number | null; label: string; paymentType: "" | "Cash" | "Credit"; days: number | null;
  itemIds: string[];                // which DeliveryOrderItem ids are ticked for this page
  documentNumber: string;           // "เลขที่" — blank by default
  issueDate: string;                // "วันที่" — blank by default, yyyy-mm-dd
  remark: string;                   // "Remark:" footer, auto-drafted, freely editable
}
```

No uniqueness constraint on `scopeOfWorkId` — same non-enforced "usually just one" convention Scope
of Work itself has relative to its own quotation (the client-side existence check nudges toward one,
nothing at the database level hard-blocks a second).

## RBAC

7 new permissions, mirroring Scope of Work's exactly: `deliveryOrder:view/viewAll/create/edit/
finalize/print/delete`. Default grants mirror Scope of Work's own grants row-for-row: Super Admin/
Administrator hold all 7; Sales User holds view/create/edit/print (no viewAll/finalize/delete);
Approver Level 1/2 hold view/viewAll/edit/finalize/print (no create/delete); Viewer holds view/
viewAll only. **⚠️ Requires the same manual Role Management step as every other permission added
this session** on an already-provisioned production deployment — `defaultRoles` only seeds once, so
existing role documents won't retroactively gain these 7 permissions just because the code deploys.
See [RBAC.md](../RBAC.md) and [TODO.md](../TODO.md).

Ownership rule mirrors Scope of Work's `canEditScope()`/`isOwnerOf()` exactly: edit/delete require
either being the record's creator or holding `deliveryOrder:finalize`. Direct-id `GET` and the
by-scope existence check are deliberately unfiltered by `deliveryOrder:viewAll` — same reasoning as
Scope of Work's identical carve-outs (an existence check must never hide a colleague's
already-created record and risk a duplicate; direct record access by a known id is a different
concern than the browse-everything list).

## API

Mounted from `api/handlers/quotes.ts` (checked on the raw pathname before the Scope of Work check,
which is itself checked before the plain quotes logic) — no new Vercel function file, same
12-function-slot-sharing convention Scope of Work and Quotation Templates already use. New
`api/_lib/deliveryOrderHandler.ts`. See [API.md](../API.md) for the full route table.

## Department Routing (added 2026-08-20)

The owner's requirement: *"ทำให้แผนกที่เกี่ยวข้องมีโมดูลทำใบส่งมอบงานเป็นของตัวเอง เวลาเซลล์ติ๊กส่งมา
ให้ไปโผล่ในหน้าของแผนกนั้น ๆ"* — Sales ticks which departments a delivery note goes to, and it appears
on those departments' own lists. ใบส่งมอบงาน is shared by **Sales, Project and Production**; there is
still exactly one module and one set of records, per the owner's confirmation that the three
departments use the same document.

Confirmed with the owner before building:
- **Department-level, not person-level.** Everyone whose `User.department` matches sees it. (Scope of
  Work's older "เอกสารส่งถึง" picks named individuals; this deliberately does not.)
- **Recipients get view + print only.** They cannot edit, approve, or delete.
- **ผลิต maps to the existing Factory department**, not a new one.

### Why it stores department *ids* and matches on *names*

`DeliveryOrder.sentToDepartmentIds` holds `Department.id` values, but `User.department` holds a
department **name** — so `departmentIdForUser()` resolves the caller's name → id on every query,
rather than storing names on the document. Storing names would break every existing document the
moment an admin renames a department in แผนกและทีม; resolving in this direction re-reads the current
name each time, so renames keep working.

⚠️ **Two department lists exist in this app and they do not overlap.** `DOCUMENT_RECIPIENT_DEPARTMENTS`
(`src/lib/documentRequirements.ts`, hardcoded: Purchase/Project/Factory/Store/Technic/Service/
Accounting) drives Scope of Work's checklist, while the real `departments` collection drives
`User.department`. Scope of Work never had to reconcile them because it routes to user ids. This
feature does, so it sources **only** from the real `departments` collection. Do not "unify" these by
pointing this feature at the hardcoded list — nothing would match and nobody would see anything.

### Setup this feature depends on (not code — real data)

Checked against the database on 2026-08-20: the `departments` collection still holds only the seven
generic seeded rows (ฝ่ายขาย/ฝ่ายจัดซื้อ/ฝ่ายคลังสินค้า/ฝ่ายบัญชี/ฝ่ายทรัพยากรบุคคล/ฝ่ายบริหาร/ฝ่ายไอที)
— **there is no ฝ่ายผลิต and no ฝ่ายโปรเจกต์** — and the existing users hold legacy free-text values
(`"Purchase"`, `"Technic"`) that match no department row at all. Until an admin adds the real
departments and reassigns staff, ticking a department routes the document to **nobody**.

Because that failure is completely silent, the send route returns `recipientCount` (how many active
staff actually match) and the UI shows an explicit warning when it comes back `0`, instead of a
success toast that means nothing.

### Enforcement

`POST /api/delivery-orders/:id/send-to-departments` requires `deliveryOrder:edit` + the usual
owner-or-`:finalize` check, and is deliberately **not** locked to `Draft` — Sales routinely forwards a
document after it is approved, and routing changes no document content (same exemption reasoning as
Scope of Work's PO chasing).

The "view + print only" rule is enforced in **one** place: a guard in the handler's dispatcher covers
every mutating sub-route at once, so a route added later cannot quietly bypass it. It holds even if a
recipient's role is granted `:edit`/`:finalize`/`:delete` — there is a test that grants exactly those
and asserts 403 — because the rule is about who owns the document, not about how the role was
configured. The document's own creator is exempt even if they happen to be in a ticked department.

`tests/api/deliveryOrderDepartmentRouting.test.ts` covers all of this, including the case where a
recipient **also owns** a delivery order — that one exists specifically to catch the `$or`-overwrite
bug class that caused the permission leak fixed in CHANGELOG 2026-08-20i, and it was verified by
introducing that exact bug and watching it fail.

### Navigation

`deliveryOrder` now appears in the **ขาย, โปรเจกต์ and ผลิต** sidebar groups. It is the same module and
the same page in all three — not a copy. Note that an Administrator who can see all three groups
sees the entry highlighted in all of them at once when it is active; staff with only their own
department's permissions see it once.

## Approval Workflow + Rewrite (added 2026-07-24)

Same state machine as Scope of Work's (see [ScopeOfWork.md](./ScopeOfWork.md) "Approval
workflow"): **Draft → ส่งขออนุมัติ → `PendingApproval` → อนุมัติ → Final**, with ปฏิเสธ (comment
required) and ถอนคำขอ returning to Draft; editing/refresh are Draft-only; `deliveryOrder:finalize`
= approval authority. This supersedes the module's original "no Duplicate/Rewrite, Final is
irreversible with no way onward" stance: **Rewrite now exists** (`POST /:id/rewrite`,
`deliveryOrder:create`) as the only way to change an approved document — a fresh Draft copy with
installment ids preserved (so "อัปเดตข้อมูลจาก Scope of Work" reconciliation-by-id still works);
the Scope of Work's "เปิดใบส่งมอบสินค้า" button follows the newest record automatically. In-app
notifications (`delivery_order_submitted/approved/rejected`) deep-link via the new
`Notification.relatedDeliveryOrderId` field. See [API.md](../API.md) and CHANGELOG.md 2026-07-24.

## Share View (added and removed 2026-07-24, same day)

A session-less capability-URL HTML view (`GET /api/delivery-orders/:id/view?key=...`,
`handleShareView()`, linked from the Scope of Work recipient email via a
"แนบลิงก์ใบส่งมอบสินค้าในอีเมล" checkbox) briefly existed — **removed the same day on direct user
request** ("เอาที่ติ๊กใบส่งมอบออกไปเลย เดี๋ยวแนบไฟล์เอา"): the preferred flow is printing the official
FM-SL-05 form to PDF and attaching it via the Scope of Work's normal ไฟล์แนบ feature. A `shareKey`
field may linger on `delivery_orders` documents that had a link minted during the feature's brief
lifetime — harmless, nothing reads it. See CHANGELOG.md 2026-07-24.

## Auto-save (added 2026-08-25)

**การเตือน "ยังไม่ได้บันทึก" (2026-08-25).** เอกสารนี้ลงทะเบียนการ์ดไว้กับ `src/hooks/useNavigationGuard.ts` — ถ้าผู้ใช้จะออกจากหน้าไปทั้งที่ยังมีงานที่บันทึกอัตโนมัติช่วยไม่ได้ จะมีกล่องถามก่อนพร้อมปุ่ม บันทึก / ไม่บันทึก / กลับไปแก้ต่อ ปุ่ม "บันทึก" ในกล่องคือปุ่มบันทึกจริงของหน้านี้ (validation ครบเหมือนเดิม) และถ้าบันทึกไม่สำเร็จจะค้างอยู่หน้าเดิม ดักไว้ทุกทางในแอป — ปุ่มย้อนกลับ เมนูซ้าย เมนูผู้ใช้ ผลค้นหา กระดิ่งแจ้งเตือน และลิงก์ข้ามเอกสาร กล่องนี้จะ**ไม่**เด้งถ้าเอกสารยังเป็นฉบับร่างที่บันทึกอัตโนมัติดูแลอยู่ตามปกติ ดู [UI_GUIDELINES.md](../UI_GUIDELINES.md) หัวข้อ Unsaved-Changes Guard


This module's document editor auto-saves like every other one — shared
`src/hooks/useAutoSave.ts`, rendered through `AutoSaveIndicator` (toolbar chip, next to Save) and
`DraftRecoveryBanner` (the "พบร่างที่ยังไม่ได้บันทึก" offer). Two layers: a `localStorage` snapshot
~700 ms after typing stops, and a silent `PATCH ...?autoSave=1` 2.5 s after typing stops. The hook is
fed the exact payload the Save button sends (`toUpdateFields(draft)`), never the whole loaded record.

**Draft-only, and no audit entry.** The server rejects `?autoSave=1` on anything past Draft (409) and
skips the audit-log row for auto-saved writes — otherwise one editing session would bury the log's
real, deliberate entries. Permissions, validation and status gates are unchanged. See
[../API.md](../API.md) "Auto-save writes", [../UI_GUIDELINES.md](../UI_GUIDELINES.md) "Auto-Save
Indicator & Draft Recovery", and [../CHANGELOG.md](../CHANGELOG.md) 2026-08-25.

**Module-specific**: this editor keeps a single `deliveryOrder` state that is both the loaded record and the edit buffer, so the background save deliberately does **not** write the server's response back into it — that would overwrite whatever was typed while the request was in flight.

## Files

- `src/lib/deliveryOrder.ts` — types + `fetch*`/`create*`/`update*`/`finalize*`/`refresh*`/`delete*`
  calls, `draftInstallmentRemark()`.
- `api/_lib/deliveryOrderHandler.ts` — CRUD handler, `deriveItemsFromScope()`/
  `deriveInstallmentsFromScope()` (the snapshot/reconciliation logic).
- `src/pages/quotation/DeliveryOrderDocument.tsx` — detail/edit view (per-installment item
  checkboxes, เลขที่/วันที่/Remark editors).
- `src/pages/quotation/DeliveryOrderPrintDocument.tsx` — print layout, one page per installment.
- `src/pages/deliveryOrder/DeliveryOrderPage.tsx` + `DeliveryOrderList.tsx` — standalone sidebar
  module.
- `src/pages/quotation/ScopeOfWorkDocument.tsx` — the "สร้าง/เปิดใบส่งมอบสินค้า" toolbar button and
  its existence-check effect.

## Known Limitations, Not Built This Pass

- **No Duplicate/Rewrite action** — a Delivery Order tracks one specific Scope of Work's actual
  shipment history; "ทำสำเนา"/revision semantics didn't fit the same way they do for Quotation/Scope
  of Work, and weren't requested. If a future need arises (e.g. correcting a finalized record),
  revisit then rather than speculatively building it now.
- **No required-field validation gate** — unlike Quotation/Scope of Work's `DOCUMENT_INCOMPLETE`
  machinery, printing/finalizing a Delivery Order only blocks on the one obvious case (zero items
  ticked anywhere). Deliberately simpler scope for this pass; revisit if incomplete documents in
  practice turn out to be a real problem.
- **No Global Search integration** — Scope of Work and Quotation both have a Global Search result
  group; Delivery Order doesn't yet. Not requested this pass.
- **Not verified against a live deployment/browser** — `tsc`/`lint`/`build` all pass clean, and the
  create/refresh reconciliation logic (`deriveItemsFromScope()`/`deriveInstallmentsFromScope()`) was
  verified via a standalone Node script against mock data (section-header exclusion, auto-drafted
  remark text, stale-itemId cleanup, preserved user edits, new/removed installment handling). The
  actual printed page layout has not been visually confirmed against a real browser print preview —
  same standing sandboxed-session limitation as every other pass this session (Playwright MCP
  disconnected, no live MongoDB credentials). See [TODO.md](../TODO.md).

## Accessibility Hardening (2026-07-30)

An `/impeccable audit` pass + fix found this document had inherited the pre-2026-07-29 status-pill
formula (same fix as Scope of Work, see [ScopeOfWork.md](./ScopeOfWork.md)). Also fixed: the
installment editor's fields now have real `htmlFor`/`id` label associations (ids namespaced per
installment since the component renders once per row); the 5 workflow `ConfirmDialog`s now guard
against a double-click firing the same action twice; the loading and load-error states now keep a
minimal toolbar/back button visible instead of a bare full-page block, and the load-error message is
now the server's actual error instead of one hardcoded string regardless of cause. See
CHANGELOG.md 2026-07-30 for the full list (this pass also touched Quotation and Scope of Work).

## Accessibility Hardening, standalone list/page module (2026-07-30, second pass)

A second `/impeccable audit` pass targeted at `src/pages/deliveryOrder/` specifically (the
standalone list/page module, distinct from `DeliveryOrderDocument.tsx` above) found and fixed:
`DeliveryOrderList.tsx`'s status pills reused the raw un-darkened brand hex as text color (same
class of bug as the other modules' pre-2026-07-29 formula, just not yet caught here since the
detector can't see this semantic contrast issue on its own) — now uses the same darkened
`#576f94`/`#a75d1a`/`#207e52` triplet; table rows (`<tr onClick>`) were not keyboard-operable at
all — added `tabIndex={0}`, `role="button"`, `onKeyDown` (Enter/Space), and an `aria-label`
naming the row's job code; `DeliveryOrderPage.tsx`'s loading skeleton (4 pulsing divs) had zero
text/ARIA signal — added `role="status" aria-live="polite"` plus an `sr-only` loading label; the
entire module was hardcoded Thai-only despite the app's live language toggle — added ~15
`deliveryOrder.*` i18n keys (page title/subtitle, search placeholder, empty states, column
headers, loading/error/retry) and wired them via `t()`, reusing the existing `quotation.filterAll`
key for the "all" labels rather than duplicating it. The three status-label literals
("Draft"/"รออนุมัติ"/"Final") were deliberately left untranslated, matching
`DeliveryOrderDocument.tsx`'s own established, unflagged convention — translating the list but not
its own detail view would have been a new inconsistency, not a fix. Out of scope, tracked for a
future pass: filter pills missing `aria-pressed` (P3, not requested this pass). `tsc`/`lint`/
`build`/`test` (56 tests) all pass clean; verified live via `vercel dev` — status-pill computed
text color (`rgb(87, 111, 148)` = `#576f94`), row `tabIndex`/`role`/`aria-label`, Enter-key
activation opening the detail view, the loading skeleton's `role="status"`, and full-page English
rendering via the Settings language toggle. See CHANGELOG.md 2026-07-30.

## Guided Tour (2026-07-29)

`DeliveryOrderDocument.tsx` has a 2-step driver.js tour (tourKey `deliveryOrderDoc` via
`useModuleTour()`), separate from the DeliveryOrderList page tour. Steps/anchors:
`[data-tour="dodoc-actions"]` (toolbar) and `[data-tour="dodoc-installments"]` (the
per-installment cards wrapper — the anchor is only present when `installments.length > 0`, and
auto-fire is gated `{ autoStart: !!deliveryOrder && installments.length > 0 }`: a DO created
from an SOW with an empty or deposit-only payment schedule legitimately has `installments: []`
(`deriveInstallmentsFromScope()` filters deposit labels), and the step must never narrate
per-installment cards over the "no installments yet" warning nor burn the one-time attempt
there). The shared `TourReplayButton` replays the tour any time. This introduced the component's
`currentUserId: string` prop (threaded from DeliveryOrderPage) and its first `useI18n()` usage
(tour strings only). Keep `data-tour` anchors in sync with the steps array — missing anchors are
silently filtered out at start.
