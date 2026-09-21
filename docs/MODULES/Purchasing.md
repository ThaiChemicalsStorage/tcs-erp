# Module: Purchasing (จัดซื้อ)

## Status: ✅ Built 2026-08-28 — ใบสั่งซื้อ (new) plus ใบขอซื้อ opened to every department. Click-tested in a real browser end to end. **ใบขอซื้อ's print layout was matched against the real FM-PU-05 on 2026-08-31; ใบสั่งซื้อ's is still a placeholder** awaiting the owner's real form. ⚠️ **ใบตรวจรับสินค้า and ใบรับวางบิล were built the same day and removed hours later at the owner's instruction — see "Removed 2026-08-28" below.**

Serves the **Purchasing (จัดซื้อ) department**, which until this date had **no module of its own** —
it existed in the system only as a signature box on ใบขอซื้อ (`purchasingDeptBy`, editable only
while the document was still a draft) and as the recipient of one notification when a ใบขอซื้อ was
approved. There was no purchase order, no goods receipt, no vendor master, no approval flow the
department owned.

Built from the owner's **"กระบวนการจัดซื้อ (Procurement Process Flow)"** chart:

> ใบขอซื้อ (PR) → [PR อนุมัติ] → ใบสั่งซื้อ (PO) → [PO อนุมัติ] → รับ/ตรวจรับสินค้า → รับวางบิล

The chart also carries a per-department table of ผู้ขอซื้อ / ผู้อนุมัติ (ผลิต · โครงการ · สโตร์ ·
เซอร์วิส · บัญชี · บุคคล) and a note that approvers may delegate. That table is **not** implemented
as data yet — see [Known gaps](#known-gaps).

## The documents

| Document | Built as | Number | Statuses |
|---|---|---|---|
| ใบขอซื้อ (Purchase Request) | **Existing** module, extended with `ownerDepartment: "general"` | `PR-{พ.ศ.}-{NNNN}` | ร่าง → รออนุมัติ → อนุมัติ |
| **ใบสั่งซื้อ (Purchase Order)** | **New** — `src/lib/purchaseOrder.ts` | `PO-{พ.ศ.}-{NNNN}` | ร่าง → รออนุมัติ → อนุมัติ |

The owner's chart has two further steps — รับ/ตรวจรับสินค้า and รับวางบิล — which were built on
2026-08-28 and removed the same day; see "Removed 2026-08-28" at the bottom of this file.

## ใบขอซื้อ opened to every department (2026-08-28)

Before this date a ใบขอซื้อ could only be raised from a **Project item** or a **Production Order**,
which meant สโตร์ · เซอร์วิส · บัญชี · บุคคล — every department in the owner's chart that is not
โครงการ or ผลิต — could not raise one at all.

`ownerDepartment` therefore gained a third value:

| Value | Raised from | Appears on |
|---|---|---|
| `"project"` (also documents with no field at all) | a Project item | โครงการ → ใบขอซื้อ |
| `"production"` | a Production Order | ผลิต → ใบขอซื้อ |
| `"general"` | **nothing** — a blank document | จัดซื้อ → ใบขอซื้อ (ทุกฝ่าย) |

`POST /api/purchase-requests` with an empty body now creates a `"general"` document: no
`projectId` / `scopeOfWorkId` / `jobCode`, no `linkProjectItemToSubDocument()` call, and the user
types every line by hand. The `project:view` check that used to guard the whole route now guards
only the path that actually reads a project — without that change a store clerk with
`purchaseRequest:create` but no project access still could not raise a document.

There is also a **fourth, view-only scope**: `?ownerDepartment=all` — never stored, used by the
Purchasing inbox to list every department's documents in one table (with a แผนก column so the buyer
can see whose request each one is). It lifts the department wall, **not** the ownership wall:
`buildSimpleOwnershipClause` still applies, so a user without `purchaseRequest:viewAll` sees only
their own.

## ใบสั่งซื้อ (Purchase Order)

Created either **from an approved ใบขอซื้อ** (the flow chart's path) or **blank** (the buyer already
knows what to order). When created from a PR it inherits vendor, dates, credit terms, shipping and
every line as a **snapshot** — editing the PO afterwards never reaches back into the PR, and
editing the PR never rewrites the PO. This is the same rule Scope of Work → Delivery Order follows,
and `tests/api/purchasing.test.ts` pins it.

The source PR must be `Final`. A draft PR returns 400: *"ใบขอซื้อต้องได้รับอนุมัติก่อนจึงจะออก
ใบสั่งซื้อได้"*.

Uses the shared approval engine (`api/_lib/documentApproval.ts`) — the same one behind ใบขอซื้อ,
ใบเบิก, ใบสั่งงาน and ใบสั่งผลิต — so it gets ร่าง → รออนุมัติ → อนุมัติ, rejection with a comment,
withdraw-back-to-draft, and `-R1` rewrite for free. **Both** `Final` and `PendingApproval` lock
editing: approving a document whose content changed while it sat in the queue is the failure this
prevents.

`purchaseOrderSubtotal()` deliberately does **not** use `quoteMath.ts`. A PO has no VAT, no
discount, no withholding — it is a plain qty × price sum, and pulling in the quotation money engine
would imply tax behaviour this document does not have.

## ใบขอซื้อแนบไฟล์ได้ (2026-09-02)

เจ้าของสั่งสั้น ๆ ว่า *"ใบขอซื้อสามารถทำให้แนบไฟล์ได้ด้วย"* — ใช้ระบบแนบไฟล์กลาง
(`api/_lib/documentAttachments.ts`, คอลเลกชัน `document_attachment_files`) ตัวเดียวกับใบสั่งงาน
**ไม่ได้สร้างชุดที่สี่** ระบบยังมีที่เก็บไฟล์แนบสามชุด (Scope of Work / Accounting / กลาง) เท่าเดิม

- route แยกจาก PATCH โดยตั้งใจ (`POST|DELETE /api/purchase-requests/:id/attachments`) เพื่อไม่ให้
  หน้าจอที่ถือข้อมูลเก่าเขียนทับ array จนไฟล์ที่คนอื่นเพิ่งแนบหายไป
- route ดาวน์โหลดเปิดได้โดยไม่ต้องล็อกอิน คุมด้วย capability key ใน URL จึงต้องอยู่ก่อนด่าน `requireUser`
- ฉบับแก้ไขที่กด Rewrite **เริ่มจากไม่มีไฟล์แนบ** เพราะสำเนาจะชี้ไฟล์ก้อนเดียวกันแล้วลบทีเดียวพังทั้งคู่
- ไม่ล็อกตามสถานะเอกสาร แต่ล็อกตามสิทธิ์แก้ — ใบเสนอราคาผู้ขาย/แคตตาล็อกมักตามมาหลังอนุมัติแล้ว

## Routing

ใบสั่งซื้อ mounts on **`api/handlers/quotes.ts`**, the documented overflow dispatch host.
Adding a document is an import plus a two-line `if` on the pathname there, plus an entry in
`server/app.ts`'s `API_ROUTES` (`tests/serverRouteTable.test.ts` fails if one is missed).

| Route | Actions |
|---|---|
| `/api/purchase-orders` | list · create · get · patch · delete · `print` · `rewrite` · `submit-approval` · `approve`/`finalize` · `reject` · `withdraw-approval` |

`ensureIndexes()` only ever runs from the Setup Wizard, so any index a handler actually depends on
must also be created lazily by that handler. `ensurePurchaseOrderNumberIndex()` does this for the
unique `documentNumber` index (with a backfill for rows that predate it), matching what ใบสั่งผลิต
does.

## Navigation — the ninth group

The owner chose a **new "จัดซื้อ" group** rather than folding these into an existing one, which is
recorded in `DESIGN.md`. Order follows the flow chart, not the alphabet:

```
จัดซื้อ
  ใบขอซื้อ (ทุกฝ่าย)   ← กล่องงานเข้า: ทุกแผนก, มีคอลัมน์ "แผนก"
  ใบสั่งซื้อ
```

The existing ใบขอซื้อ entries under **โครงการ** and **ผลิต** stay exactly where they were. The nav
group hides itself entirely when a role can see none of its entries (`items.length === 0`
returns `null` in `App.tsx`), so a role without the purchasing permissions never sees the heading.

## RBAC

7 permissions — `purchaseOrder:` `view` / `viewAll` / `create` / `edit` / `finalize` / `print` /
`delete` — grouped under the label **จัดซื้อ** on the roles page. (21 were added on 2026-08-28; the
14 belonging to the two removed documents went with them the same day.)

No `PERMISSION_DEPENDENCIES` entries were added. That table exists only for the case where a page
breaks permanently because its boot fetch needs a different permission; it is not a list of
"permissions that ought to go together", and a test enforces that reading.

Following the ProductRequest precedent (2026-08-27), the permissions are added to `administrator` in
`defaultRoles` — which affects **fresh installs only**. **On the live server the owner must tick
these on the roles page by hand.** No RBAC migration was written; `api/_lib/rbacSeed.ts` has a
run-once mechanism if that decision is ever reversed.

## Print documents

`PurchaseRequestPrintDocument.tsx` was matched against the **real filled FM-PU-05 Rev.02 : 03/11/68**
on 2026-08-31 (`reference/company/ED6908038.pdf`, gitignored — its layout is transcribed in that
file's doc comment, which is the durable record). It had described itself as a "first-pass … not yet
pixel-calibrated" reproduction. What changed:

- A **Thai letterhead** (company name, address, phone, tax ID) on the left, with `ใบขอซื้อ` and the
  owning department in parentheses on the right — `(ฝ่ายโครงการ)` or `(ฝ่ายผลิต)`, read from
  `ownerDepartment`, since both departments share the one form.
- Five fields the paper has and the model had nowhere to put, all optional on disk and normalised to
  `""` on read (no migration): `issueDate`, `vendorPhone`, `deliveryContact`, `deliveryPhone`, and
  `headerRemark` (the หมายเหตุ box under the table, distinct from the `หมายเหตุ` header label, which
  the paper uses for the job code).
- The 7th column is **`ให้ซื้อ`, left blank for Purchasing to write in** — it is not the requester's
  estimate. **As of 2026-09-21 there is no requester-side price at all**: `estimatedCost` was removed
  from the model, the editor column, and the PR→PO copy (see "ราคาประเมิน removed" below). **If
  Purchasing turns out to rely on a printed price, add an 8th column; do not overwrite `ให้ซื้อ`.**
- `จำนวนขอซื้อ` prints quantity and unit in one cell (`1.00 ครั้ง`), as the paper does.
- Signature names print **above** the rule with the label below it, and dates as `____/____/______`.
- The closing `พิมพ์โดย … วันที่ … บันทึกโดย …` line. The paper's `พิมพ์ครั้งที่ N` comes from the old
  Express software; this system writes a print audit entry but never reads the count back to the
  client, so **that number is left off rather than guessed**.

The letterhead now depends on Settings → Company Info actually having an address, phone and tax ID
filled in; the local dev database still holds placeholder strings there.

`PurchaseOrderPrintDocument.tsx` is a **⚠️ placeholder**. The owner said the real forms would come
later; `DESIGN.md` is explicit that the paper form is the authority on a print layout, not the app's
design system, so it is a plain bordered table that holds the right fields rather than an invented
FM-PU-xx layout. It hardcodes Thai and never calls `useI18n`, like every other print document.
`PrintLetterhead` is deliberately not used until a real form shows a company letterhead.

### Signature block (2026-09-21)

The PO's two signature cells no longer place the signer's scanned signature from their profile.
The owner's instruction was *"ใบ PO ไม่ต้องมีลายเซ็นให้ขึ้นชื่อที่กรอกในช่องไปเลยแล้วชื่อวงเล็บก็เอาออกไปเลย"* —
so `PrintSignatureLine` was dropped from this file and the typed `orderedBy` / `approvedBy` print above
the rule instead, with a bare `ผู้สั่งซื้อ` / `ผู้อนุมัติ` label below it and no parentheses. The 28px box
above the rule is kept so the row does not collapse on a draft printed out to be signed by hand.
**`CostControlPrintDocument.tsx:177,:181` still uses the parenthesised form** — the owner named only the
PO, so it was left alone pending an answer (tracked in [TODO.md](../TODO.md)).

### Page edges (2026-09-21)

Both purchasing print documents now go through `src/components/PrintPageFrame.tsx` instead of setting
`@page { margin: 12mm }` themselves. That margin is what the browser drew the page URL and date into;
only `margin: 0` removes the margin box. The frame restores the 12mm as `padding` on a `<div>` for the
left/right edges and as an empty 12mm row inside `<thead>`/`<tfoot>` of a wrapper table for top/bottom —
browsers repeat those two on every page, which a single box's `padding` does not. `PurchaseRequestPrintDocument`
keeps its own `paddingRight: EDGE_GUARD` on the outer div; it stacks on top of the frame's 12mm.

## ราคาประเมิน removed from the PR (2026-09-21)

Owner's instruction, item 6 of the 2026-09-18 purchasing batch: *"ราคาประเมินในใบ PR เอาออก"*.
`PurchaseRequestLine.estimatedCost` is gone from the type, from `sanitizeLines()` on the server, from
the editor table (one column narrower — the sub-detail row's `colSpan` went 8 → 7 with it), and from
both translation tables plus the tour copy. It was already absent from the printed form.

The one consumer outside the module was `purchaseOrderHandler.handleCreate()`, which seeded each new
PO line's `unitPrice` from it. **A PO now starts with an empty price** and Purchasing types the real
quoted price in. `tests/api/purchasing.test.ts` asserts `unitPrice === null` on an inherited line.

Old values stay on disk untouched — see [DATABASE.md](../DATABASE.md) for why there is no migration.

## ใบขอซื้อ: four fields removed, and what that broke (2026-08-31)

The owner's instruction from 2026-08-28 was blunt: *"ใบขอซื้อไม่ต้องมีผู้จำหน่าย เครดิต ขนส่งโดย"*.
The real signed FM-PU-05 agrees — those boxes exist on the paper and are **left blank**, because the
requester is not the person who fills them. `vendorPhone`, added earlier the same day while matching
the printed form, belongs to the same group and went with them.

Removing them was not a UI deletion. Three things depended on those fields:

1. **`purchaseOrderHandler.handleCreate()` copied exactly those three** onto a new PO. It no longer
   does; a PO starts with an empty vendor and Purchasing picks one from the register, which carries
   more than the PR ever could (contact, phone, tax ID, address).
2. **`tests/api/purchasing.test.ts` pinned the copy** — rewritten to pin the new behaviour instead,
   plus a new case asserting the server drops the fields even if a client sends them.
3. **`searchDocuments.ts` used `vendorName` as the PR's `party` column.** It is now `requestedBy`,
   which is what someone hunting a ใบขอซื้อ actually remembers (the job code is already `lineage`).

Values already stored on old documents are **left in MongoDB untouched** — simply unread. No
destructive migration, so the decision is reversible.

## ส่วนลดใบสั่งซื้อ (2026-08-31)

*"เพิ่มส่วนลดเพิ่มเติมไปในใบสั่งซื้อเป็นได้ทั้งเปอร์เซ็นและเงิน ละก็มีส่วนลดท้ายใบด้วย"*

`discount` + `discountMode` on both `PurchaseOrderLine` and the document header, the same pair
`QuoteLine`/`Quote` use. Both optional; absent means no discount, so stored documents read unchanged.

**`purchaseOrderSubtotal()`'s old comment was right and is now half-obsolete.** It said it
deliberately avoided `quoteMath.ts` because the PO "did not yet know what kind of discount it needed".
It does now, so the discount helpers (`resolveDiscountAmount`, `lineDiscountAmount`, `lineSubtotal`)
are borrowed — but **`computeTotals()` still cannot be used**: it hardcodes `VAT_RATE = 7`, while a
PO carries its own editable `vatRate` (buying from a non-VAT-registered vendor is normal). Hence
`purchaseOrderTotals()`, which is `computeTotals()` step for step except for that one rate.

`tests/purchaseOrderTotals.test.ts` pins precisely that: a PO at `vatRate: 10` must produce 100, not
70, and must **not** equal what `computeTotals()` would return — so swapping to it "because the
formula looks the same" fails loudly rather than silently taxing the wrong amount.

On the printed sheet the discount shows **as entered** (`10%` / `500`), not as a resolved figure —
the reader needs the agreed term, not just its effect. The document-discount row hides when unused.

Totals had been duplicated between the editor and the print sheet; both now call the one function.

## ทะเบียนผู้ขาย (Vendor register, 2026-08-31)

The owner asked for this on 2026-08-28: *"มีหน้าเพิ่มผู้ขายสำหรับจัดซื้อเพราะมันจะมีรหัสผู้ขายด้วย"*.
It closes gap #1 below ("No vendor master").

| Layer | Path |
|---|---|
| Page | `src/pages/vendors/VendorsPage.tsx` (nav group **จัดซื้อ**) |
| Client lib | `src/lib/vendors.ts` — incl. `vendorComboboxOptions()` |
| Handler | `api/_lib/vendorsHandler.ts` (`handleVendors`), mounted in `api/handlers/customers.ts` |
| Validation | `api/_lib/vendorValidation.ts` |
| Collection | `vendors` — `VendorFields` in `api/_lib/collections.ts` |
| Permissions | `vendor:view` / `:create` / `:edit` / `:archive` — four, like `customers:*`, not seven; this is master data, not a document |

Cloned wholesale from `customersHandler` / `customerValidation` / `CustomersPage` — the newest and
only complete master-data template (real permission props, full TH+EN i18n, `EmptyState`,
`ConfirmDialog`, `useDialogA11y`, audit on every write, soft-delete). `DepartmentManagementPage` was
deliberately **not** used as the base: no permission props, no audit, no confirm dialog.

**Vendor code — optional, but unique if set.** Two layers that deliberately agree:
`validateVendorDraft` upper-cases the code first, then a case-insensitive `$regex` check produces the
readable 409, and a `unique` **partial** index (`code` present and non-empty) catches the
concurrent-insert race, with `E11000` re-thrown as the same 409. Note this is stricter than
`departmentsHandler.ts`, whose regex is case-insensitive while its index is case-sensitive — the two
layers there do not actually agree.

**`vendorName` on a purchase order stays a plain string**, with the register as a shortcut rather than
a gate: old documents read back unchanged, no migration, and a buyer can still type a vendor that is
not registered yet. Picking one from the dropdown fills contact/phone/taxId/address — overwriting
whatever was there, deliberately, because picking a vendor means "this one, all of it".

`GET /api/vendors` is readable by `purchaseOrder:view`/`purchaseRequest:view` as well as
`vendor:view` — the same carve-out `customersHandler` makes for quotation writers. Without it the
dropdown would be empty for exactly the people who use it.

## ทะเบียนรหัส (Code register, 2026-08-31)

The owner asked for this on 2026-08-28: *"เพิ่มหน้าสร้างรหัสแผนก เพื่อเอาไว้ใช้สำหรับใบ PR กับ PO"*
and *"เพิ่มช่องใส่รหัสแผนกในหน้าใบขอซื้อ ก็คือมันจะดึงข้อมูลรหัสที่เราใส่ไปออกมาจากหน้าสร้าง"*.

| Layer | Path |
|---|---|
| Page | `src/pages/codeRegister/CodeRegisterPage.tsx` (nav group **จัดซื้อ**, two tabs) |
| Client lib | `src/lib/codeRegister.ts` — incl. `parseGlChartRows()` and `codeComboboxOptions()` |
| Handler | `api/_lib/codeEntriesHandler.ts` (`handleCodeEntries`), mounted in `api/handlers/customers.ts` |
| Collection | `code_entries` — `CodeEntryFields` in `api/_lib/collections.ts` |
| Permissions | `codeRegister:view` / `:create` / `:edit` / `:archive` — four, like `vendor:*` |

**Two registers, one module.** `kind: "department"` holds the `G143`-style code the real filled-in
purchase request (`ED6908038.pdf`) puts in its แผนก box; `kind: "account"` holds the 479-row chart
of accounts the owner supplied. They are unrelated sets — confirmed with the owner, since the file
was named `รหัสสินค้าทั้งหมด.xlsx` but contains neither product codes nor `G143`. One module with
two tabs, rather than two modules, because they share the entire surface and differ only in four
optional account-side fields.

**Uniqueness is per `kind`.** `{ kind, code }`, not `{ code }`: the same string may legitimately
exist in both registers. Codes are upper-cased on write so the case-insensitive `$regex` check (which
produces the readable Thai 409) and the unique index agree on what a duplicate is — the same
discipline as `vendors`, and still more than `departmentsHandler` manages.

**Importing the chart of accounts.** The `GLCHART` sheet is not a table — it is a fixed-width
character report crammed into one column, 570 rows including report headers, rules and footers.
`parseGlChartRows()` takes `string[]` (first cell of each row), keeps only lines starting with an
account code, and splits the tail on runs of two-or-more spaces. It is pure and never touches
`xlsx`, so it is testable against a synthetic fixture — the real file lives in gitignored
`reference/`. Same split as `costControlImport.ts`. **Existing codes are skipped on import, never
overwritten**, because re-importing a longer file is expected and overwriting would eat admin edits.

**Control accounts are listed but not offered.** `isControl: true` marks a grouping account that
cannot be posted to. The register page shows them with a label; `codeComboboxOptions()` filters them
out of the PR/PO line dropdowns.

**Where the codes are used.** Both `departmentCode` and `costCode` on purchase request lines, and
the same two on purchase order lines. `costCode` had been stored and sanitized since 2026-08-27 with
no input anywhere — a dead field until this register existed. The purchase order copies both from the
purchase request but keeps them editable, because Purchasing routinely corrects an account code the
requester put in the wrong bucket.

## Known gaps

1. ~~**No vendor master.**~~ **✅ Built 2026-08-31** — see "ทะเบียนผู้ขาย" above. `vendorName` is
   still free text by design; the register supplies suggestions and auto-fill, it does not constrain.
   Credit terms are still not modelled per vendor.
2. **The per-department approver table from the chart is not data.** Existing permissions and
   departments are used instead, as agreed. Delegation is therefore whatever the roles page allows.
3. **Department codes are not connected to the `departments` collection.** `kind: "department"`
   rows are free-standing strings; nothing links `G143` to a row in `departments`, which has its
   own `code`. The owner has not supplied the department-code list, so the register starts empty
   and codes are typed in by hand. Reconciling the two is a decision, not a bug.
4. **Nobody is in the Purchasing department in the live database** (`docs/TODO.md`). The existing
   "ใบขอซื้ออนุมัติแล้ว" notification has therefore never reached anyone, and this module inherits
   that: it stays silent until employees are assigned to the department on the user-management page.
   Department matching is also by **name**, not `code` — renaming the department silently stops the
   hand-off.
5. **No guided tour** for the new document (`useModuleTour` is wired for ใบขอซื้อ only).

## Removed 2026-08-28 — ใบตรวจรับสินค้า (GR) และใบรับวางบิล (BR)

Both were built earlier the same day (commit `dc0334c`) and removed hours later on the owner's
instruction: *"ลบ 2 อันนี้ออกไปด้วยไม่ได้ใช้"*. Nothing had ever been entered into either — the two
collections were created but never written to outside a local test.

**What the removal touched.** Following the precedent set by
[CompanyProfiles.md](./CompanyProfiles.md): the four `src/lib`/`api/_lib` modules and both page
folders were deleted; the collection accessors, types and 9 index declarations came out of
`api/_lib/collections.ts`; the dispatch branches left `api/handlers/quotes.ts`, the `API_ROUTES`
entries left `server/app.ts` (those paths now return a plain
404 — no handler is left behind them); `src/App.tsx` lost 11 wiring sites; the 14 permissions came
out of all five tables in `src/lib/permissions.ts` plus `defaultRoles`; both search categories and
their `GR-`/`BR-` fast paths came out of all five search files (Global Search went from 19 categories
to 17); ~238 i18n keys went in both languages; and the manual lost chapters 17-18, with 19-25
renumbered down to 17-23.

Two things were **deliberately left alone**:

1. **The `goods_receipts` and `bill_receipts` MongoDB collections and anything in them.** Same rule
   the Company Profiles removal followed — code removal never drops a collection. Dropping them is a
   separate, deliberate, backed-up decision.
2. **The 2026-08-28 What's New entry that announced both documents to users.** It is a dated
   announcement log, not a description of the current system; rewriting history there would be
   wrong. A later entry records the withdrawal instead.

One thing that had to go with them: **`PurchaseOrderPickerDialog.tsx`**. It was shared by the two
removed pages and by nothing else, so it became dead code — and neither `noUnusedLocals` nor ESLint
catches a file that simply has no importers.

`StockMovementSourceType` also lost its `"goods_receipt"` member, in **both** copies of that union
(`api/_lib/collections.ts` and `src/lib/stock.ts` declare it independently). Nothing had ever written
that value, so no stored movement can carry it.

## PO → ใบรับสินค้า (2026-09-03)

An approved Purchase Order now has somewhere to go: **one PO = one ใบรับสินค้า (RR)**, owned by the
Store department, created from the PO with its lines snapshotted. `PurchaseOrderDocument` gained a
**รับสินค้า** button on `Final` documents that opens the existing RR when there is one and creates it
otherwise — pressing create blindly would hit the unique-index 409 the second time, which reads as a
dead end to whoever pressed it.

The PO itself is unchanged apart from the number format (`PO-202609-0001`). Receiving, costing, the
payable and the purchase-tax register all live in [Store.md](./Store.md).

## ขั้นสโตร์เช็คของ + จัดซื้อแก้ใบที่อนุมัติแล้ว (2026-09-09)

เจ้าของสั่งไหลงานเต็มของใบขอซื้อ: *"สร้าง pr เพื่อจัดซื้อของ → ส่งอนุมัติจากฝ่ายนั้นๆ → ส่งสโตร์เพื่อให้
สโตร์เช็คของว่ามีในสต๊อกไหม ถ้ามีให้ตัดจบ ถ้าไม่มีให้ส่งไปที่จัดซื้อ → จัดซื้อ"*

### ทำไมไม่เพิ่มสถานะที่ 4

`ApprovableStatus` (`Draft`/`PendingApproval`/`Final`) ใน `api/_lib/documentApproval.ts` ใช้ร่วมกัน
**6 เอกสาร** และถูกประกาศซ้ำอีก 8 ที่ฝั่งหน้าจอ (แถบสถานะ ป้าย กล่องรออนุมัติ ค้นหา แดชบอร์ด) การเพิ่ม
ค่าเข้าไปคือการแก้ทุกเอกสารและเทสต์อีก 6 ไฟล์ เพื่อขั้นที่มีอยู่ในใบขอซื้อใบเดียว · ขั้นสโตร์จึงเป็น
**ฟิลด์ของใบขอซื้อเอง** ที่อยู่หลัง `Final`:

| `storeStage` | ความหมาย | ออกใบสั่งซื้อได้ไหม |
|---|---|---|
| ไม่มีค่า | ใบก่อน 2026-09-09 — วิ่งตรงไปจัดซื้อตามกติกาเดิม | ได้ |
| `"pending"` | อนุมัติแล้ว รอสโตร์เช็คของ | **ไม่ได้** |
| `"forwarded"` | สโตร์เช็คแล้ว มีบรรทัดที่ต้องซื้อ | ได้ (เฉพาะบรรทัดที่ต้องซื้อ) |
| `"closed"` | ของมีครบและสโตร์จ่ายครบแล้ว | **ไม่ได้** — ไม่ต้องซื้อ |

**ไม่ได้ทำ migration** โดยตั้งใจ ตามแนวของทุกฟิลด์ที่เพิ่มทีหลังในระบบนี้

### สโตร์ "ตัดจบ" ที่ไหน

เจ้าของถูกถามให้เลือกระหว่าง **จ่ายบนใบขอซื้อเลย** กับ **ให้สโตร์สร้างใบเบิกจากรายการที่มีของ** และ
เลือกอย่างแรก (เร็วกว่าสำหรับคนใช้งาน) · สิ่งที่แลกไปและควรรู้ไว้: การจ่ายทางนี้**ไม่มีใบพิมพ์
ไม่มีลายเซ็นผู้รับ และไม่มีช่องคืนของ** อย่างที่ใบเบิกมี (บันทึกไว้ใน [TODO.md](../TODO.md))
· รอบการจ่ายใช้โครงเดียวกับใบเบิกทุกประการ (`storeIssues[]` ต่อท้ายอย่างเดียว ยกเลิกได้เฉพาะรอบล่าสุด
ของกลับเข้าคลังด้วยราคาซื้อล่าสุด) และเขียนบัญชีเดินสะพัดด้วย `sourceType: "purchase_request"`

### จัดซื้อแก้ใบที่อนุมัติแล้ว

*"จัดซื้อสามารถแก้ไข PR ได้ เนื่องจากชื่อหรือยี่ห้อตอนซื้ออาจจะไม่ตรงตามที่พิมพ์ไว้ในใบ"* — เจ้าของเลือก
ให้แก้ได้ **ทุกช่องเหมือนใบร่าง** ไม่ใช่แค่ข้อความของรายการ

- สิทธิ์ใหม่ `purchaseRequest:editApproved` — แยกจาก `:edit` (คนเขียนใบ ซึ่งไม่ควรกลับมาแก้ใบที่หัวหน้า
  เซ็นแล้ว) และ `:finalize` (หัวหน้าผู้อนุมัติ ซึ่งไม่ใช่คนซื้อของ) · **ไม่ผูกกับความเป็นเจ้าของใบ**
- **`PendingApproval` ยังล็อกทุกคน** — ห้ามแก้ใบที่ผู้อนุมัติกำลังอ่านอยู่ กติกาเดิมของทั้งระบบ
- ทุกการบันทึกต่อท้าย `purchasingEdits[]` (เวลา/ผู้แก้/หมายเหตุ) เขียน audit log และแจ้งผู้สร้างใบ
  ด้วยชนิดแจ้งเตือนใหม่ `purchase_request_edited`
- **บันทึกอัตโนมัติแก้ใบ Final ไม่ได้ (409)** — การแก้ใบที่อนุมัติแล้วต้องเป็นการกดของคน ไม่ใช่ผลข้างเคียง
  ของการพิมพ์
- ห้ามลบบรรทัดหรือลดจำนวนต่ำกว่าที่สโตร์จ่ายไปแล้ว (`assertStoreIssuesStillCovered()`)

### หน้าจอ

การ์ด **"สโตร์เช็คของ / จ่ายของ"** บนใบที่อนุมัติแล้ว (เห็นเมื่อมี `stock:adjust`) ลอกโครงมาจากการ์ด
จ่ายของของใบเบิก ไม่ได้ออกแบบใหม่ · เมนูใหม่ **"ใบขอซื้อ (รอสโตร์เช็คของ)"** ในกลุ่มคลังสินค้า
(`?storeStage=pending`) · ป้าย **รอสโตร์ / รอจัดซื้อ / จ่ายจากสต๊อกแล้ว** ในหน้ารายการ · แถบสถานะบอก
ว่าใบที่อนุมัติแล้วกำลังรอใครอยู่ ผ่านช่อง `finalHint` ที่ `DocumentStatusStepper` มีอยู่แล้ว

⚠️ **ต้องติ๊กสิทธิ์เองบนเครื่องจริง** — RBAC migration แจกให้ได้แค่ `administrator` เพราะบทบาทของสโตร์
และจัดซื้อเป็นบทบาทที่ลูกค้าสร้างเอง: จัดซื้อต้องได้ `purchaseRequest:editApproved` และสโตร์ต้องได้
`purchaseRequest:view`

### ไล่ flow ทั้งสายด้วยผู้ใช้จริง 4 คน (2026-09-10)

เจ้าของสั่งให้ตรวจซ้ำ: *"สร้าง pr เพื่อจัดซื้อของ → ส่งอนุมัติจากฝ่ายนั้นๆ → ส่งสโตร์เพื่อให้สโตร์เช็คของ
ว่ามีในสต๊อกไหมถ้ามีให้ตัดจบถ้าไม่มีให้ส่งไปที่จัดซื้อ → จัดซื้อ"* · ไล่จริงในเบราว์เซอร์บนเซิร์ฟเวอร์แยก
(พอร์ต 3011 + ฐานข้อมูลชั่วคราว) ด้วยบัญชี **4 คน 4 บทบาท** ไม่ใช่ super admin คนเดียว เพื่อให้กำแพง
สิทธิ์ของแต่ละขั้นถูกทดสอบไปด้วย

ทุกขั้นทำงานถูกต้อง: อนุมัติแล้ว `storeStage` เป็น `"pending"` ให้เอง · จัดซื้อออกใบสั่งซื้อระหว่างนั้น
ไม่ได้ (400 พร้อมข้อความไทยที่อ่านรู้เรื่อง) · สโตร์ติ๊ก *มีของ*/*ต้องซื้อ* แล้วบันทึก ใบถูกส่งต่อทันที ·
สโตร์จ่ายของจริง สต๊อกลดจาก 100 เหลือ 80 · ใบสั่งซื้อที่ออกตามมา**มีเฉพาะบรรทัดที่ต้องซื้อ** บรรทัดที่
สโตร์จ่ายจากสต๊อกไปแล้วไม่ถูกลอกมา

**บั๊กที่เจอและแก้ในรอบนี้ — จัดซื้อออกใบสั่งซื้อให้ใบของฝ่ายอื่นไม่ได้เลย**

`PurchaseRequestPickerDialog` (กล่องเลือกใบขอซื้อต้นทางตอนสร้างใบสั่งซื้อ) ดึงข้อมูลด้วย
`fetchAllPurchaseRequests("project")` + `("production")` — **ตกค่า `"general"` ที่เพิ่มเข้ามาพร้อม
โมดูลนี้เองเมื่อ 2026-08-28** ซึ่งคือใบของฝ่ายที่ไม่มีเอกสารต้นทาง (สโตร์/เซอร์วิส/บัญชี/บุคคล) และเป็น
ทางเดียวที่ฝ่ายเหล่านั้นเปิดใบขอซื้อได้ · ใบพวกนั้นอนุมัติแล้ว ผ่านสโตร์แล้ว เซิร์ฟเวอร์ยอมออกใบสั่งซื้อ
ให้แล้ว แต่กล่องเลือกขึ้นว่า *"ยังไม่มีใบขอซื้อที่อนุมัติแล้ว"* จัดซื้อจึงไปต่อไม่ได้เลย

แก้เป็น `fetchAllPurchaseRequests("all")` คำขอเดียว ซึ่งเป็นตัวเดียวกับที่กล่องงานเข้าของจัดซื้อใช้อยู่
(`"all"` เปิดเฉพาะกำแพงแผนก ไม่ได้เปิดกำแพงสิทธิ์ — เซิร์ฟเวอร์ยังกรองด้วยความเป็นเจ้าของใบเหมือนเดิม)

**ไม่มีเทสต์อัตโนมัติคุมจุดนี้** เพราะบั๊กอยู่ในตัวกรองฝั่งเบราว์เซอร์ และชุดเทสต์ของโปรเจกต์รันบน
environment `node` ล้วน ไม่มีเครื่องมือเรนเดอร์คอมโพเนนต์ (ตั้งใจไว้แต่แรก ดู `vitest.config.ts`) ·
เทสต์ฝั่งเซิร์ฟเวอร์ผ่านมาตลอดเพราะ route ไม่เคยผิด — ผิดที่หน้าจอไม่เคยถามถึงใบกลุ่มนั้น

**สองข้อสังเกตที่เจอรอบเดียวกัน — แก้แล้ววันเดียวกัน** (2026-09-10e)

**หนึ่ง กล่องงานเข้าของจัดซื้อกรองตามขั้นของใบแล้ว** เดิมมีแค่แถบกรองสถานะเอกสาร ใบที่ยังรอสโตร์
เช็คของอยู่จึงปนมากับงานที่ทำได้จริง ต่างจากกล่องของสโตร์ที่กรอง `?storeStage=pending` มาตั้งแต่แรก ·
ตอนนี้แถบกรองของกล่องนี้เป็น **ถึงคิวจัดซื้อ** (ตั้งต้น) · **ยังอยู่ที่สโตร์** · **ทั้งหมด** พร้อมตัวนับ ·
เงื่อนไข "ถึงคิวจัดซื้อ" คิดจาก `Final` **และ** (`storeStage === "forwarded"` **หรือ**ไม่มีฟิลด์นี้เลย)
ซึ่งต้องตรงกับ `?storeStage=forwarded` ฝั่งเซิร์ฟเวอร์เสมอ ไม่งั้นหน้าจอกับ API จะตอบคนละอย่าง ·
กรองในหน่วยความจำ ไม่ยิงคำขอใหม่ตอนสลับชิป เพราะ `storeStage` อยู่ใน summary อยู่แล้ว

**สอง เมนูกล่องงานทั้งสองต้องมีสองสิทธิ์แล้ว** เดิมเปิดด้วย `purchaseRequest:view` ตัวเดียว คนที่เป็น
แค่ผู้ขอซื้อจึงเห็นกล่องงานของทั้งสองฝ่ายในแถบข้าง (กดทำอะไรไม่ได้จริง แต่กล่องงานเข้าบอกว่างานนี้ของใคร
ไม่ใช่แค่ที่เก็บเอกสาร)

| เมนู | ด่าน |
|---|---|
| ใบขอซื้อ (รอสโตร์เช็คของ) | `purchaseRequest:view` **และ** `stock:adjust` |
| ใบขอซื้อ (ทุกฝ่าย) | `purchaseRequest:view` **และ** `purchaseOrder:`{view / create / edit} |

ฝั่งจัดซื้อใช้ `anyPermission` แบบกว้าง ไม่ใช่ `purchaseOrder:create` ตัวเดียว เพราะบทบาทของสโตร์
และจัดซื้อบนเครื่องจริงเป็นบทบาทที่ลูกค้าสร้างเอง ไม่มี roleKey คงที่ให้อ้าง การเดาสิทธิ์แคบเกินไปจะทำให้
เมนูหายจากคนที่ควรเห็น (เคยซ่อนเมนูทั้งกลุ่มมาแล้วสองครั้ง ดู [RBAC.md](../RBAC.md) "Rollout") ·
**ไม่มีสิทธิ์ใหม่ ไม่ต้องติ๊กอะไรเพิ่ม**
