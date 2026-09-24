# Store (แผนกสโตร์)

> Added **2026-09-03** from a single 8-point list the owner sent, ending with
> *"ช่วยทำในส่วนตัวนี้ขึ้นมาให้หน่อยเป็นของแผนกสโตร์"* — build this as the **Store department's** own
> feature set. This is the department that physically receives goods, issues them to teams, takes
> them back, and counts what is left.

Related: [Product.md](./Product.md) (Stock ledger, costing, team tools), [Purchasing.md](./Purchasing.md)
(the PO this receives against), [Accounting.md](./Accounting.md) (the payable this posts),
[Project.md](./Project.md) (the requisition Store issues against).

## Status

| Piece | State |
|---|---|
| Unified `{PREFIX}-{YYYYMM}-{NNNN}` document numbering | ✅ Built |
| Requisition: stock cut at issue time, outstanding tracking, department/team/work-type charging | ✅ Built |
| **Store's own issue queue page** (`ตัดของตามใบเบิก`, both departments in one list) | ✅ Built 2026-09-10 |
| Stock: return movements, moving-average cost, stock value, stock card print | ✅ Built |
| Team tools (issue/return page, holdings, report) | ✅ Built |
| **Receiving Report (RR)** + payable posting | ✅ Built |
| Purchase-tax register + AP register | ✅ Built |
| Delivery Order attachments | ✅ Built |
| Real paper forms for the RR print layout | ✅ 2026-09-23 — FM-ST-01 copied from the owner's samples (see "ใบรับวางบิล + ใบพิมพ์ใบรับสินค้า" below) |
| **ใบรับวางบิล (BR)** | ✅ Built 2026-09-23 |
| Browser click-through of the whole flow | ✅ Done 2026-09-03c — found and fixed two client-side staleness bugs |

## Decisions the owner made (2026-09-03)

| Question | Answer |
|---|---|
| Document-number format | `PO-202609-0001` — Gregorian year + month, restarting at `0001` every month, for **every internal document**. Quotations (`Q#`) and accounting AR/BI/RE/IV are untouched. |
| When a requisition cuts stock | **When Store actually issues the goods**, partial issues allowed, any number of rounds (2026-09-07). Approval no longer touches stock at all. |
| *"แนบ…เหมือน cost control"* | The **Delivery Order** gains file attachments. |
| RR ↔ PO relationship | **One PO = one RR**, created from an approved PO, several receipt rounds inside the one document. |

## 1. Document numbering — `{PREFIX}-{YYYYMM}-{NNNN}`

`nextMonthlyDocumentNumber()` in `api/_lib/documentNumbering.ts` is now the single minter for every
internal document. The counter key is `${counterKey}_${yyyy}${mm}`, so each prefix restarts at `0001`
on the first of each month, in **Bangkok local time** (`bangkokYyyyMm()` shifts by +7h before reading
the month, so a document created at 06:00 Thai time on the 1st does not land in the previous month).

Seven minters delegate to it: `PO`, `PR`, `JO`, `MR`, `SC`, `CC`, `SR` — plus `RR` (new).

**The letter prefix is load-bearing.** `detectDocNumberFamily()` in `api/_lib/searchShared.ts`
discriminates Global Search's fast path purely by prefix; a bare `202609-0001` would have silently
broken every document-number search. Old numbers (`MR-2569-0001`, `SC-2026-08-002`) are untouched and
still found the same way — only the prefix is ever matched, never the year digits.

Not changed: quotations (`Q#YYMMDD-NNNN`), the AR/BI/RE/IV accounting series (`nextArDocNumber`),
Scope of Work numbers (free text), and the `-R{n}` revision suffix (which appends to the new format
exactly as it did to the old one).

## 2. Requisition: cut at issue, not at approval

Before this pass (2026-09-02) a requisition deducted stock inside `onApproved`, and
`beforeApprove: assertProductsHaveStock` **blocked approval outright when stock was short**. The
owner replaced that: a requisition must always be approvable, and the shortage must be visible on
screen instead.

- `POST /api/material-requisitions/:id/issues` — `Final` documents only, gated on **`stock:adjust`**
  (the person issuing is Store, not the requisition's author). Body is **one round**:
  `{ lines: [{ lineId, qty }], issuedDate?, issuedBy?, remark?, charge* }`.
- `assertProductsHaveStock()` runs on the whole round **before** any movement is written, so a
  short line cannot leave earlier lines half-issued behind an error response.
- `withdrawal1Qty`/`withdrawal2Qty` are stripped from `PATCH` (`sanitizeLines(raw, existing)` copies
  them from the stored line) — they belong to Store's issue routes alone.

### Issue rounds (2026-09-07)

The paper form has exactly two withdrawal columns; real jobs draw more often than twice. Rounds are
now their own append-only list, the same shape Receiving Report's `batches` already uses:

- `MaterialRequisition.issues: MaterialIssueBatch[]` is the **source of truth** for what has been
  issued. A round is never edited — post another one, or cancel the last one.
- `withdrawal1Qty`/`withdrawal2Qty` are **derived** from those rounds on every write
  (`withdrawalsFromBatches`): round 1 fills the first column, rounds 2..N are summed into the
  second. Nothing downstream changed — the printed form, `outstandingQtyOf`, `netHeldQtyOf`, the
  return route's ceiling and the "cannot delete a requisition still holding goods" guard all keep
  reading the same two fields.
- Stock is deducted **by that round's quantities alone**. The old delta-against-a-running-total
  arithmetic is gone, and with it the failure mode where typing over an earlier column silently
  returned goods to stock.
- `DELETE /api/material-requisitions/:id/issues/:batchId` cancels the **latest** round only (same
  restriction, and the same reason, as Receiving Report): the whole round goes back to stock as a
  `return` movement. Refused when the team has already returned more than the remaining rounds
  would leave issued.
- **Documents issued before 2026-09-07 have no rounds**, only the two stored numbers.
  `legacyIssueBatchesOf()` presents them as one synthetic round per non-empty column (`seq` equal to
  the column number, so the derived values round-trip exactly), and the next real round persists
  those synthetic rounds alongside it. No migration was run, and no stock is re-deducted. Because the
  old data carries only one Store sign-off, every synthetic round shows the same date and issuer, and
  the cancel button works on them too — correctly (it is the equivalent of lowering the old number,
  which the previous editable columns allowed), but the history card says so in a caption
  (`batchesLegacyNote`) so nobody wonders where a round they never posted came from. Found by driving
  a legacy fixture through the running app on 2026-09-07.

Per line the client computes `issuedQty = w1 + w2`, `outstandingQty = max(0, planned − issued)` and
`netHeldQty = issued − returned` (`src/lib/materialRequisition.ts`). `GET /:id` returns
`stockByProduct` alongside the document so the editor can show live balances without loading the
whole catalogue; the issue and cancel routes return it too, so the editor never needs a second read.

### The store's issue queue — `ตัดของตามใบเบิก` (2026-09-10)

The owner asked on 2026-09-09 *"แล้วสโตร์จะดูจากตรงไหนว่ามีใบไหนมาให้ตัด"* and then, on 2026-09-10,
*"เพิ่มหน้าตัดของ ของสโตร์มา แยกออกมาจากใบ"*. Before this there was no answer: the requisition list
is mounted **twice** (under โครงการ and under ผลิต) and each mount only ever shows its own
department's documents, so Store had to sweep two menus for work that all comes out of one stockroom
— and the list had an "outstanding" badge but no filter to bring those rows together.

`StoreIssueInboxPage` (`src/pages/materialRequisition/`) is one page in the คลังสินค้า group holding
every approved requisition that still has something to issue. A row expands **in place** into the
same issue form the document carries, so a picker never opens the document at all — that is what
"แยกออกมาจากใบ" asked for. A "เปิดใบเบิก" button is there for when the full document is wanted, and
it lands on the owning department's menu, not the one the user came from.

**It is not a second way to issue goods.** The save button posts `POST /:id/issues`, the same route
the document's issue card uses, with the same `stock:adjust` gate, the same rounds, and the same
cancel-the-latest-round undo (which stays in the document, where the round history lives). The page
stores no numbers of its own.

Server side, `GET /api/material-requisitions?ownerDepartment=all&issueStage=pending`:

- `ownerDepartment=all` drops the department clause — mirroring what `purchaseRequestHandler` has
  done for Purchasing's inbox since 2026-08-28.
- `issueStage=pending` narrows to `status: "Final"` and then filters on `requisitionHasOutstanding`
  in memory. Nothing in the document summarises "still outstanding" as a stored field, and adding
  one would create a second set of numbers that can drift from the lines; the Final set is small.
- **The queue does not filter by `createdBy`.** It is gated on `stock:adjust` instead, which is a
  stronger right than "see other people's documents" — the same reasoning `pendingApprovals.ts`
  documents. Filtering by ownership would show Store only the requisitions Store wrote, which is
  none of them, and the page would be permanently empty. The ordinary two-department lists are
  untouched and still ownership-filtered.
- Oldest first, the opposite of every other list, because this is a work queue: a requisition that
  was just part-issued should fall to the back, not jump to the front.
- `MaterialRequisitionSummary` gained `ownerDepartment`, `outstandingLineCount` and `customerName`
  so a row can say whose work it is and how big it is without fetching each document.

The issue form here deliberately has **no** department/team/work-type selectors. Omitting those keys
from the body means `resolveChargeFromBody()` leaves them alone and the round inherits the charge
already on the document; changing where goods are charged is a decision that belongs on the full
document, next to the rest of its context.

**No new permission and no RBAC migration.** The menu needs `stock:adjust` **and**
`materialRequisition:view`, both of which any Store role that can already issue goods on a document
holds — unlike the 2026-09-09 purchase-request stage, nobody has to tick anything before this works.

### Charging a department / team / work type

`chargeDepartmentId/Name`, `chargeTeamId/Name`, `chargeWorkTypeCode/Name` on the requisition, stamped
onto **every** stock movement it produces (issue and return alike). Names are always resolved
server-side from `departments`/`teams`/`code_entries` — never trusted from the client, because a
client-supplied name is what makes a report disagree with the master data six months later.

Work types come from the **code register** (`code_entries`, `kind: "workType"`) so the owner can add
"งานเหล็ก / งานโรงงาน / งานผลิต" and anything else without a code change. The field is a `Combobox`:
a code that is not in the register yet can still be typed.

Defaults come from the creating user's own department/team.

## 3. Stock: value, cost and the stock card

- `StockMovementKind` gained `"return"` (positive delta) so returned goods read as returns in the
  history instead of a bare adjustment.
- `Product.avgCost` — a **moving average**, updated by `applyStockMovement()` in the same pipeline
  update that changes the quantity, so two concurrent receipts cannot both average from the stale
  value. Receiving with a `unitCost` re-averages; issuing, returning and adjusting use the current
  average. Chosen over FIFO deliberately: no lots to track, and it is enough to give the stock card a
  value column.
- Stock value is **`stockQty × avgCost`, computed on read**, never stored.
- Movements carry `unitCost`, `amount`, `balanceValueAfter`, and the department/team/work-type stamp.
- **Stock card** (`StockCardPrintDocument.tsx`) — A4 landscape, accounting layout: date · document ·
  received (qty/price/value) · issued (qty/price/value) · balance (qty/value). It needs the full
  history of one product, so `GET /api/stock-movements` gained `?limit=` (default 200, max 2000).

## 4. Team tools

`Product.isTool` marks an item as a tool that must come back. `GET /api/tool-holdings` owns **no
collection of its own** — it aggregates `stock_movements` where `sourceType` is `"material_requisition"` or `"tool_issue"`
and the product is a tool, per (department, team, product): `held = issued − returned`, filtered to
`held > 0`. `?report=1` returns the individual movements inside a Bangkok-local date range.

The page (`src/pages/toolControl/`) has three tabs. *ในครอบครอง* and *รายงานเบิก-คืน* are read-only
views with a print layout each, gated on the existing **`stock:view`** — a different view of the
stock ledger, not a new kind of record.

**จ่าย / รับคืน (added 2026-09-03b)** is the owner's *"หน้าตัดเบิกเครื่องมือ มีแผนกในการเบิกโครงการ
หรือผลิต"*. The first pass routed tool issuing through the material requisition instead; that was
both off-spec and too heavy in practice, since tools go out and come back several times a day and
nobody opens a requisition for that.

`POST /api/tool-holdings/issue` writes to the **same ledger** as a requisition issue — only
`sourceType: "tool_issue"` differs — and mints its own `TL-YYYYMM-NNNN` slip number, one per press
rather than per line. Holdings and the report therefore sum both paths automatically; a second,
parallel tally is exactly how the two numbers would end up disagreeing.

Server-enforced rules: a **team is mandatory** (holdings belong to a team, not a department) and
must belong to the chosen department; only `isTool` products are accepted; issuing validates the
whole basket with `assertProductsHaveStock()` before the first write; returning is capped at what
that team currently holds, because "returning" something never issued would grow stock out of
nothing. The tab only appears for `stock:adjust` holders — the same permission that lets Store
issue against a requisition.

## 5. Receiving Report (RR)

The centrepiece. `receiving_reports`, keyed `_id = RR-YYYYMM-NNNN`.

```ts
ReceivingReportLine  // snapshot from the PO at creation, never changed afterwards
  { id, poLineId, productId | null, productCode, description, subDetails, unit,
    qtyOrdered, unitPriceOrdered, discount?, discountMode? }

ReceivingBatch       // one round of receiving = one vendor invoice
  { id, seq, receivedDate, invoiceNumber, invoiceDate, vatRate,
    lines: { lineId, qty, unitPrice, amount }[], subtotal, vatAmt, total,
    receivedBy, remark, postedAt, postedBy, postedByName,
    stockMovementIds, apEntryId }
```

**One PO = one RR** is enforced by a unique partial index on `purchaseOrderId` where
`isDeleted: false`, not merely by a code check — two tabs pressing "create" at once would otherwise
produce two documents. A duplicate create returns **409 with the existing document's id**, and the
UI opens that document instead of dead-ending.

### Posting a receipt — `POST /:id/receipts`

The order of writes is deliberate:

1. Validate everything: `qty ≤ outstanding` per line, at least one positive line, `invoiceNumber`
   required (the purchase-tax register cannot have a blank invoice column), and **every referenced
   product still exists** — checked here so step 2 has essentially nothing left that can fail
   mid-loop. (A receipt has no "not enough stock" failure mode by nature.)
2. `applyStockMovement({ kind: "receive", unitCost, sourceType: "receiving_report" })` per line that
   has a `productId`. A hand-typed line (no product code) posts a payable but writes no stock.
3. Insert one `ap_entries` row for the round.
4. Push the batch onto the document; close the document if every line is now fully received.

There is no transaction — the self-hosted MongoDB is a standalone (see ARCHITECTURE.md). If step 3
or 4 fails at the infrastructure level, the stock rows already written are traceable by the
`sourceId`/`sourceLabel` stamped on every movement, and correctable with a manual stock adjustment.

### Reversing a receipt — `DELETE /:id/receipts/:batchId`

**Latest round only, and only while its payable is still `Unpaid`** (409 otherwise). Latest-only
because the moving average walks forward through receipts; pulling a middle round out would leave an
average that cannot be recomputed without lots.

⚠️ The reversal moves quantity back out at the **current** average cost, not the price it came in at.
Quantities are always exact; if a different-priced receipt of the same product landed in between, the
stock *value* will not return to precisely its old number.

### Status

`Open` → `Closed`. Closing happens automatically when the last outstanding quantity reaches zero, and
Store can also close early to cancel the remainder (the vendor is not going to ship the rest). A
closed document can be reopened only while something is still outstanding.

`PATCH` accepts exactly three fields: `documentNumber`, `remarks`, `status`. Lines and batches are
never client-writable — they are snapshots and posted accounting facts respectively.

## 6. Payables — `ap_entries`

One row per receipt round, written **only** by the RR receipt route. There is deliberately no
manual-create endpoint: the moment Accounting can hand-key a payable, the register and the stock
ledger start walking apart with nothing to flag it.

`entryType` is `"RR"` (goods receipt), the code the company's real AP sheet already uses. The other
codes on that sheet (RM contractor, RD shipping, RO general expense …, see
[Accounting.md](./Accounting.md) "บัญชีจ่าย") have no source document in this system yet, so the union
holds a single member rather than guessing at codes nobody can produce.

Accounting may change exactly one thing: `status` (`Unpaid` ⇄ `Paid`) with a payment reference. A
wrong amount is fixed by reversing the receipt on the RR, which rolls back stock and payable together.

- `GET /api/ap-entries?month=&vendor=&status=` — the register rows, sorted by invoice date.
- `GET /api/ap-entries/summary?month=` — month totals plus per-vendor outstanding.
- `PATCH /api/ap-entries/:id` — `{ status, paymentRef }`.

The month filter reads **`invoiceDate`**, not the posting date — a purchase-tax report always follows
the tax invoice's own month, and an invoice dated the 31st arriving on the 2nd is routine. It is
applied as a `>= "YYYY-MM-01"` / `< next month` range rather than a regex, so it uses the index and
never interprets a query string as a pattern.

## 7. Screens

| Page | Nav group | Permission |
|---|---|---|
| ใบรับสินค้า (list + document) | คลังสินค้า | `receivingReport:view` |
| ทะเบียนภาษีซื้อ | บัญชี | `ap:view` |
| ทะเบียนเจ้าหนี้ | บัญชี | `ap:view` (payment buttons need `ap:manage`) |
| เครื่องมือประจำทีม | คลังสินค้า | `stock:view` |
| ~~ตัดของตามใบเบิก (คิวงานของสโตร์)~~ | ~~คลังสินค้า~~ | ถอดออกจากเมนู 2026-09-23 — สโตร์จ่ายผ่านใบจ่ายที่อ้างเลขใบเบิกแทน (ดูหัวข้อ "สโตร์จ่าย/คืนของแทนแผนก" ท้ายไฟล์) |

The RR document is deliberately **one page for the whole life of the order**: ordered/received/
outstanding value cards → *รายการค้างรับ* → *รับครบแล้ว* (a line moves across on its own when its
outstanding hits zero) → per-round receipt history with a reverse button on the newest → attachments.

Auto-save covers only `documentNumber` and `remarks`. Everything else is the result of pressing
*บันทึกรับของ*, which is an intentional act, not something typed and left.

`PurchaseOrderDocument` gained a **รับสินค้า** button on approved orders: it looks for an existing RR
first and opens it, and only creates one when there is none.

## 7a. What the 2026-09-21 purchasing batch changed for Stores

Three of the owner's twelve items land on this module:

- **The *ใบขอซื้อ (รอสโตร์เช็คของ)* queue now also appears under the จัดซื้อ nav group** — one nav
  key listed in two groups, the shape `materialRequisitionTemplates` already used. Stores keeps its
  own queue exactly as it was; Purchasing simply also sees it. Its `anyPermission` widened to
  `["stock:adjust", "purchaseOrder:create", "purchaseRequest:editApproved"]`, because a Purchasing
  role generally holds no `stock:adjust`.

- **Purchasing can pull a request out of the queue without waiting** (`POST /:id/pull-to-purchasing`).
  The owner's reason: *"ส่วนใหญ่ในใบขอซื้อมันจะไม่มีของใน stock อยู่แล้ว"* — the stock check is still
  there for the requests that need it, it is simply no longer a compulsory gate. Who pulled it is
  appended to `storeRemark` and recorded in `pulledToPurchasingBy/ByName/At`.

  **Purchasing still cannot record a stock check** — `handleStoreReview` requires `stock:adjust`.
  Looking at the queue is not the same authority as saying what is on the shelf. That asymmetry is
  deliberate; do not "fix" it by widening the route.

- **Stores can raise its own purchase request** — new *เปิดใบขอซื้อ (สโตร์)* menu (item 10:
  *"เผื่อแบบซื้อของเข้าสโตร์ไรงี้"*). The server has supported this since 2026-08-28 (a request with
  no source document is `ownerDepartment: "general"`); only the way in was missing. **It has to be a
  separate menu** from the review queue, which filters `Final` + `storeStage: "pending"` — a request
  Stores has just created is a Draft and would never show up there.

  ⚠️ `purchaseRequest:create` must be ticked onto the Stores role by hand; see [RBAC.md](../RBAC.md).

**Receiving skips cancelled purchase-order lines** (2026-09-21). A PO line can now be cancelled with
a reason instead of deleted; `POST /api/receiving-reports` filters those out, so Stores is never asked
to receive something Purchasing has withdrawn, and no payable or stock movement is raised for goods
that will never arrive. A PO whose lines are *all* cancelled returns 400.

## 8. RBAC

Nine new permissions, split on purpose — Store receives and posts the payable, Accounting chases the
payment; neither role should acquire the other half by default.

| Permission | Group |
|---|---|
| `receivingReport:view / viewAll / create / edit / receive / print / delete` | คลังสินค้า |
| `ap:view`, `ap:manage` | บัญชีลูกหนี้ |

`receivingReport:receive` is separate from `:edit` because posting a receipt writes stock and creates
a payable, which is a materially different act from correcting the form number in the header.

Shipped with the append-only migration **`store-ap-permissions-2026-09-03`** in
`api/_lib/rbacSeed.ts`: Administrator gets all nine, `accounting_user` gets `ap:*` only. Without that
migration an already-provisioned database would never see the new menu entries — the mistake that has
already hidden two nav groups on the live system (see [RBAC.md](../RBAC.md) "Rollout").

## 9. Delivery Order attachments

The owner's *"ทำให้ใบส่งมอบสามารถแนบใบส่งมอบได้ด้วยเหมือนกับ cost control"* — the third module on the
shared attachment engine. Full writeup in [DeliveryOrder.md](./DeliveryOrder.md) "ไฟล์แนบ".

## Tests

| File | Covers |
|---|---|
| `tests/api/monthlyNumbering.test.ts` | format, month rollover, prefix isolation, Bangkok-midnight boundary |
| `tests/api/materialRequisitionIssue.test.ts` | approve with zero stock, delta-based issuing, over-issue, insufficient stock writing nothing, return limits, org stamping, and the issue queue's filter (Final-with-outstanding only, leaves on full issue, both departments, ordinary lists still split) |
| `tests/api/toolHoldings.test.ts` | issued 3 returned 1 → holds 2, non-tools excluded, team filter, date-range report |
| `tests/api/receivingReport.test.ts` | draft PO rejected, duplicate → 409 with the existing id, partial receipt, average cost across two prices, hand-typed line posts AP but no stock, auto-close, over-receive writes nothing, month totals, paid round cannot be reversed, reversal rolls back both sides |
| `tests/api/rbacMigrations.test.ts` | the store/AP migration grants, and that Accounting does not gain receiving rights |

## Known gaps

- **No real paper form for the RR print layout.** It is a plain bordered table like the PO's, and is
  expected to be replaced wholesale when the owner supplies the form.
- ~~**Print output has not been checked as a real PDF.**~~ — **checked 2026-09-04** across all seven
  printouts (receiving report, stock card, stock count sheet, purchase tax register, AP register,
  both tool-report tabs), rendered to images via `page.pdf({ preferCSSPageSize: true })` + pdf.js.
  Two bugs found and fixed, both invisible in the DOM: the purchase tax register dropped its three
  money columns and printed an on-screen scrollbar onto the paper (`overflow-x-auto` was never
  neutralised for print), and the letterhead's vertical side ribbon overflowed the `@page` box,
  which made Chromium clip the right edge of every page using a serif base font. See CHANGELOG.md
  2026-09-04. The RR layout itself is clean — it is still a placeholder form, not a wrong one.
- ~~**The English UI has not been eyeballed.**~~ — **checked 2026-09-04**: switched to EN and swept
  the rendered text of six screens for Thai characters. No hardcoded Thai is left; everything Thai
  on screen is database content (product, vendor, department and unit names). One thing to decide:
  dates still render in the Thai Buddhist calendar in EN mode, because every page shares
  `formatQuoteDateThai()`. That predates this module and is logged in TODO.md, not changed here.
- Reversing a **receipt** still uses the current average cost (see above). Reversing an **issue**
  (requisition or purchase request) and every return now book at the **latest purchase price**
  (`Product.lastCost`, 2026-09-09) — the owner picked that over the moving average when asked. Stock
  *value* is still `stockQty × avgCost`; the latest price only sets the value of the ledger row.
- **Store can now issue straight off a ใบขอซื้อ** (2026-09-09). Approved purchase requests land in a
  new inbox, "ใบขอซื้อ (รอสโตร์เช็คของ)", where Store marks each line in-stock or to-be-bought;
  in-stock lines are issued from that document with the same append-only rounds this module's
  requisition already uses (`sourceType: "purchase_request"`), and anything to be bought is
  forwarded to Purchasing. A purchase order cannot be raised until Store has answered, and lines the
  store issued are never copied onto it. ⚠️ Unlike the requisition, that issue path has **no printed
  slip, no receiver signature and no return column** — the owner chose the shorter route knowingly;
  see [MODULES/Purchasing.md](./Purchasing.md) and [TODO.md](../TODO.md).
- `ap_entries` holds `entryType` `RR`/`RX`/`RI` (the receiving code, since 2026-09-23). The rest of the company's AP codes need their own
  source documents first.


## ใบรับสินค้า: ใบเปล่า + รหัสรับเข้า RR / RX / RI (2026-09-23)

เจ้าของสั่ง: *"ใบรับสินค้าสามารถสร้างใบเปล่าได้และ เวลาสร้างใบที่ติด PO หรือไม่มี PO ก็ตามให้สามารถเลือกรหัสรับเข้าได้
RR - ซื้อเชื่อ-วัตถุดิบ / RX - โรงงาน / RI - โครงการ"*

- **รหัสรับเข้า** `receiveCode` เลือกตอนสร้างทุกทาง (หน้าต่าง `ReceivingReportCreateDialog` ในหน้ารายการ และ
  `ReceiveCodeDialog` จากปุ่ม "รับสินค้า" บนใบสั่งซื้อ) · เป็นตัวอักษรหน้าเลขที่ใบ แต่ละรหัสนับเลขแยก · `RR` ใช้
  ตัวนับเดิม · ใบเก่าอ่านเป็น `RR` (`receivingReportCodeOf()`) · **รหัสคือ `entryType` ของหนี้** ในทะเบียนเจ้าหนี้
  ตรงกับรหัสในชีตบัญชีจ่ายจริงของบริษัท
- **ใบเปล่า** = `purchaseOrderId: ""` — สโตร์เลือกผู้ขายจากทะเบียน (หรือพิมพ์เอง) ใส่รหัสงาน VAT และรายการเอง
  (จากแคตตาล็อกหรือพิมพ์เอง) แล้วรับของเป็นรอบแบบเดียวกับใบที่มีใบสั่งซื้อทุกอย่าง: สต๊อก + ตั้งหนี้ + ยกเลิกรอบล่าสุด
  - ใบเปล่าแก้หัวใบและรายการได้ตลอด แต่รายการที่รับของแล้ว **ลบไม่ได้ / เปลี่ยนสินค้าไม่ได้ / ลดต่ำกว่าที่รับไม่ได้**
    เพราะรอบรับที่ลงบัญชีแล้วอ้าง `lineId` นั้นอยู่
  - รับของได้เมื่อมีผู้ขายแล้วเท่านั้น (หนี้ต้องรู้ว่าเป็นหนี้ใคร)
  - บรรทัดใหม่ใช้ id ที่หน้าจอตั้ง (`rrline_*`) เพื่อให้บันทึกอัตโนมัติไม่เปลี่ยน id ใต้มือผู้ใช้ และปุ่มรับของ
    บันทึกรายการที่ค้างอยู่ก่อนเปิดหน้าต่างรับ
  - ใบที่มาจากใบสั่งซื้อยังแก้หัวใบ/รายการไม่ได้เหมือนเดิม (400)
- **index "1 ใบสั่งซื้อ = 1 ใบรับ"** ต้องไม่นับใบเปล่า: เปลี่ยนเป็น partial `{ isDeleted: false, purchaseOrderId: { $gt: "" } }`
  ชื่อ `purchaseOrderId_1_linked` · handler ถอด index เก่า `purchaseOrderId_1` ทิ้งเองครั้งแรกที่มีการสร้างใบ
  (ถ้าไม่ถอด ใบเปล่าใบที่สองจะชนใบแรก) · `ensureIndexes()` ของ Setup Wizard สร้างตัวใหม่แล้ว
- ใบพิมพ์เขียนรหัสใต้หัวเรื่อง และช่องใบสั่งซื้อของใบเปล่าเขียนว่า "ไม่มี" · หน้ารายการมีคอลัมน์รหัส
- เทสต์: บล็อก "ใบรับสินค้าแบบใบเปล่า + รหัสรับเข้า" ใน `tests/api/receivingReport.test.ts`


## ใบเบิกของสโตร์ (รหัสจ่าย 15 ตัว) + ใบรับคืน / รับเข้าคลัง (รหัสรับ 15 ตัว) — 2026-09-23

เจ้าของสั่ง (ภาพเมนู "จ่ายภายใน" และ "ปรับยอดสินค้า" จากโปรแกรมบัญชีเดิม): *"หน้าเบิกของ สำหรับสโตร์จะมีแยกรหัส ตามรูปภาพ
... เป็นหน้าเบิกของเหมือนกับผลิตและโครงการ"* + *"ออกแบบหน้าใบรับคืนมาด้วย"* แล้วสั่งสร้างจริงตามแบบที่ออกแบบไว้
(*"ตรงใบรับคืนสินค้าทำให้เป็น dropdown ก็ได้"*)

**รหัส** อยู่ใน `src/lib/storeCodes.ts` ที่เดียว (ชื่อผ่าน i18n `storeCode.*`):
- จ่าย: ขาย/ลูกค้า OU FOC · ผลิต PD P1 P2 P3 PN · โครงการ PP PB PU · ใช้ภายใน/โรงงาน PM PX PT PA PW
- รับ: คืนจากผลิต JD↔PD J1↔P1 J2↔P2 J3↔P3 · คืนจากโครงการ JP↔PP JB↔PB JS↔PU · คืนอื่น JC↔FOC JT↔PT ·
  รับเข้าคลัง FG FP GC JN · ปรับยอด JU TK
- P1/J1 สะกด **SHELL** ทั้งสองฝั่ง — ภาพฝั่งจ่ายเขียน "SHEEL" ซึ่งถือเป็นคำพิมพ์ผิด (ถามไว้แล้ว เจ้าของให้ใช้ตามที่แนะนำ)
- รหัสคือตัวอักษรหน้าเลขที่ใบ แต่ละรหัสนับเลขแยก เลือกตอนสร้างผ่านดรอปดาวน์แบ่งกลุ่ม (`StoreCodeDialog`) เปลี่ยนภายหลังไม่ได้

**ใบเบิกของสโตร์** = `material_requisitions` ที่ `ownerDepartment: "store"` + `issueCode` + `storeReference` — ใช้เครื่องทั้งหมดของ
ใบเบิกเดิม (อนุมัติ · จ่ายเป็นรอบ · คิวตัดของ · ใบพิมพ์ FM-ST-04) ต่างที่: รหัสงานและเลขอ้างอิงพิมพ์เองได้ (ป้ายของช่องอ้างอิงเปลี่ยนตาม
กลุ่มรหัส), **การ์ดคืนของถูกซ่อนและ route คืนของตอบ 400** — คืนผ่านใบรับคืนรหัสคู่เท่านั้น เพื่อไม่ให้มีสองทางคืนของที่นับซ้ำกัน

**ใบรับคืน / รับเข้าคลัง** = คอลเลกชันใหม่ `store_receipts` (`api/_lib/storeReceiptHandler.ts`) สามพฤติกรรมตามรหัส:
- **คืน**: เลือกใบเบิกรหัสคู่ที่อนุมัติแล้วและยังมีของค้างคืน → หัวใบ (งาน/ลูกค้า/แผนก-ทีม) และรายการดึงจากใบเบิกให้ →
  กรอกจำนวนคืน (เพดาน = จ่ายไป − คืนแล้ว ตรวจทั้งตอนแก้และตอนรับเข้าคลัง) → ตอนรับเข้าคลังลง `return` ด้วยราคาซื้อล่าสุด
  (กติกาเดียวกับการคืนในใบเบิก 2026-09-09) และ **บวก `returnQty` ของบรรทัดใบเบิกต้นทาง** ยอดสองใบจึงตรงกันเสมอ
- **รับเข้า** (FG/FP/GC/JN): รายการจากแคตตาล็อก + ต้นทุน/หน่วย (ถัวเฉลี่ยใหม่) · GC = ของลูกค้า รับเข้าโดยไม่คิดมูลค่า
  (มูลค่าแถว 0 ไม่แตะค่าเฉลี่ย — ⚠️ ยอดคงเหลือของสินค้าตัวนั้นยังคูณด้วยต้นทุนเฉลี่ยเหมือนของอื่น ถ้าต้องแยกของลูกค้าจริง ๆ
  ควรตั้งรหัสสินค้าของลูกค้าแยก)
- **ปรับยอด** (JU/TK): จำนวน = ยอดที่ถูกต้อง/นับได้จริง ต้องมีเหตุผล · ตอนรับเข้าคลังลงส่วนต่างกับยอด ณ วินาทีนั้น
- ขั้นตอน ร่าง → รออนุมัติ → อนุมัติ (เครื่องกลาง, สิทธิ์ `materialRequisition:*`) → สโตร์กด **รับเข้าคลัง** ครั้งเดียว (`stock:adjust`)
  · การอนุมัติไม่แตะสต๊อก · รับเข้าแล้วแก้/ลบไม่ได้ ผิดให้ออกใบ JU · `beforeApprove` กันใบไม่มีรายการและใบปรับยอดที่ไม่มีเหตุผล
- มีบันทึกอัตโนมัติ + กู้ร่าง (กฎของทุกหน้าแก้เอกสาร)
- **ใบพิมพ์ (2026-09-23g) — ลอกฟอร์มของโปรแกรมบัญชีเดิม "เป๊ะ ๆ" ตามคำสั่งเจ้าของ** จากตัวอย่าง `reference/company/ใบเบิก.pdf`
  (P1 "ใบจ่ายวัสดุกลุ่ม SHELL") และ `reference/company/ใบรับคืน.pdf` (J1 "ใบรับคืนวัสดุ กลุ่ม SHELL") — ใช้ทั้งใบเบิกของสโตร์
  (`StoreIssuePrintDocument`) และใบรับคืนทุกรหัส (`StoreReceiptPrintDocument`) ผ่านเลย์เอาต์กลาง `StoreSlipPrint.tsx`:
  หัวบริษัท/ชื่อใบตัวห่าง · JOB + หมายเหตุ ซ้าย / เลขที่เอกสาร + วันที่ (วว/ดด/ปป พ.ศ.) ขวา · ตาราง No. · รหัสสินค้า/รายละเอียด ·
  จำนวน (+หน่วย) · หน่วยละ · รวม **18 บรรทัดต่อหน้า** ตัวตารางสูงตายตัว หัวซ้ำทุกหน้า · หน้าสุดท้ายมีกล่องรวม, หมายเหตุเพิ่มเติม และช่องเซ็น
  เขียนมือตามฟอร์มเดิม (ใบรับคืนมีบรรทัด "ปรับปรุงต้นทุนโดยโปรแกรม : 0.00" — ระบบนี้ไม่มีการปรับต้นทุนอัตโนมัติ จึงเป็นศูนย์เสมอ)
  · ขนาดทุกตัววัดจากไฟล์ตัวอย่าง (ตัวหนังสือ Courier 13.3px = 2.12mm/อักษร ทำให้ชื่อสินค้าถูกตัดที่ตำแหน่งเดียวกับฟอร์มเดิม)
  · ตรวจเป็น PDF เทียบกับไฟล์ตัวอย่างแล้ว (ข้อมูลชุดเดียวกัน 26 บรรทัด = 2 หน้า / 11 บรรทัด = 1 หน้า)
  · **ต้นทุน (ช่อง หน่วยละ)** มากับการกดพิมพ์: `POST …/print` ของทั้งสองเอกสารคืน `unitCostByProduct` — ลงสต๊อกแล้ว = ต้นทุนจาก movement
  ที่เอกสารเก็บ id ไว้ (`postedUnitCostsByProduct()` ใน stockHandler) · ยังไม่ลง = ราคาที่การลงจะใช้ (จ่าย = เฉลี่ย, คืน = ราคาซื้อล่าสุด,
  รับเข้า = ต้นทุนที่กรอก/GC 0, ปรับยอด = เฉลี่ย)
  · ใบเบิกพิมพ์ **จำนวนที่จ่ายแล้ว** (ข้ามบรรทัดที่ยังไม่จ่าย) ใบที่ยังไม่จ่ายเลยพิมพ์จำนวนที่ขอ · วันที่ = วันที่จ่ายรอบล่าสุด
  · **ต่างจากฟอร์มเดิมโดยตั้งใจ**: เลขที่เอกสารเป็นรูปแบบของระบบ (`P1-202609-0027`) ไม่ใช่ `P1S2609027` · ชื่อหัวใบรู้จริงแค่ P1/J1
  (P2/P3/J2/J3 ตามแบบเดียวกัน รหัสอื่น "ใบ" + ชื่อรหัส — `storeSlipTitles.ts`) · ใบเบิกฝ่ายโครงการ/ผลิตยังพิมพ์ FM-ST-04 เหมือนเดิม
- **เลขที่ใบคืนตามใบเบิก** (2026-09-23i, เจ้าของสั่งด่วน — เลขไม่ตรงกันแล้วหากันยาก): เลือกใบเบิกต้นทางแล้ว `documentNumber` =
  รหัสรับ + เลขเดียวกับใบเบิก (`P1-202609-0027` → `J1-202609-0027`) คืนซ้ำจากใบเบิกเดียวกันต่อท้าย `/2` · `_id` ยังเป็นเลขรันตอนสร้าง
- อยู่ในกล่อง "เอกสารรออนุมัติ" (kind `storeReceipt`) และ **แจ้งเตือนผู้มีสิทธิ์อนุมัติตอนส่งขออนุมัติ** (`store_receipt_submitted`,
  deep-link `relatedStoreReceiptId` — 2026-09-23f) · หน้าประวัติสต๊อกอ่านที่มาของแถว `store_receipt` ได้ (งาน/ใบเบิกต้นทาง)
- **Global Search** (2026-09-23f): หมวด `storeReceipts` ค้นเลขที่ใบ ใบเบิกต้นทาง รหัสงาน ลูกค้า อ้างอิง เหตุผล และสินค้าในรายการ ·
  รหัสรับ 15 ตัวเป็น prefix ของทางลัดเลขที่เอกสาร · หมวดนี้และทางลัดขึ้นเฉพาะคนที่เปิดหน้าสโตร์ได้ (ดูเงื่อนไขเมนูข้างล่าง)

**หน้าจอ**: เมนูเดียว **ใบเบิก-คืนวัสดุ (สโตร์)** (`StoreDocumentsPage`, `src/pages/storeDocuments/`) รายการรวมทั้งสองชนิด
(แท็บ ทั้งหมด/ใบเบิก/ใบรับคืน · ช่วงวันที่ · ค้นหา · ตัวกรองรหัส · สถานะ · ป้าย "ค้างเบิก"/"รอรับเข้าคลัง"/"รับเข้าคลังแล้ว")
ปุ่ม "สร้างใบเบิก" (ทอง) และ "ใบรับคืน / รับเข้า" · ใบเบิกเปิดด้วยหน้าแก้ไขใบเบิกเดิม ใบรับคืนเปิดด้วย `StoreReceiptDocument`
· ลิงก์จากกล่องรออนุมัติ ผลค้นหา (รหัสจ่ายทั้ง 15 ตัวเป็น prefix ของใบเบิกใน Global Search) แจ้งเตือน และคิวตัดของ พามาหน้านี้
· **เมนูเปิดได้เมื่อมี `materialRequisition:view` และ (`stock:adjust` หรือ `materialRequisition:finalize`)** — เพิ่มสิทธิ์ที่สองเมื่อ 2026-09-23f
  เพราะผู้อนุมัติที่ไม่ได้จ่ายของต้องเปิดใบจากแจ้งเตือน/ผลค้นหาได้ · **ใบเบิกสโตร์ที่เปิดจากผลค้นหา/แจ้งเตือนเคยไปหน้าฝ่ายโครงการ**
  (ผลค้นหาบอกแผนกเป็น "project" และแจ้งเตือนไม่พกแผนก) แก้แล้ว — ผลค้นหาส่ง `"store"` และ App ดูรหัสหน้าเลขที่ใบ (`isStoreIssueDocumentId`)

**ยังไม่ได้ทำ**: ยังไม่ได้กดทดสอบหน้าจอบนเบราว์เซอร์ (เบราว์เซอร์อัตโนมัติยังไม่ได้ล็อกอิน — ใบพิมพ์ตรวจเป็นภาพแล้วด้วยข้อมูลตัวอย่าง)
· ฟอร์มกระดาษจริง/รหัสฟอร์มของใบรับคืน — ดู TODO.md
· เทสต์: `tests/api/storeDocuments.test.ts` (10 ข้อ ครบวงจร PD → จ่าย → JD คืน → FG รับเข้า → TK ปรับยอด → กล่องรออนุมัติ)

## ใบรับวางบิล + ใบพิมพ์ใบรับสินค้า FM-ST-01 (2026-09-23)

เจ้าของวางตัวอย่างจากโปรแกรมบัญชีเดิมไว้อีกสามไฟล์ (`reference/company/ใบรับสินค้า.pdf` = RR6909135, `ใบรับ 2.pdf` =
RR6909134, `ใบวางบิล.pdf` = BR6909091) พร้อมคำสั่ง *"อยากให้ทำหน้าใบวางบิลของสโตร์เพิ่มให้หน่อย"* · ถามสองข้อก่อนทำ
เจ้าของเลือก **เปลี่ยนใบพิมพ์ RR ตามไฟล์ด้วย** และ **ใบรับวางบิลไม่ต้องอนุมัติ**

**ใบรับวางบิล** (เมนู `vendorBills` กลุ่มคลังสินค้า ถัดจากใบรับสินค้า · `src/pages/vendorBill/` · `api/_lib/vendorBillHandler.ts`)
- ผู้ขายมาวางบิล → กด "รับวางบิล" → เลือกผู้ขาย (แสดงเฉพาะผู้ขายที่มีใบรับสินค้ายังไม่จ่ายและยังไม่ได้วางบิล พร้อมจำนวนใบ/ยอด)
  → ระบบติ๊กให้ทุกใบของผู้ขายนั้น → เอาออก/เพิ่มได้ · หัวใบ: วันที่รับวางบิล · เครดิต (ตั้งต้นจากใบสั่งซื้อใบแรก) · วันที่จ่ายชำระ · หมายเหตุ
- **ใบนี้เก็บแค่ `apEntryIds`** — แถวคือหนี้ในทะเบียนเจ้าหนี้ (หนึ่งรอบการรับ = หนึ่งแถว) ยอด/วันที่/จ่ายแล้วอ่านสดทุกครั้ง
  บัญชีติ๊กจ่ายในทะเบียนเจ้าหนี้แล้ว คอลัมน์ "จ่ายแล้ว / เงินคงค้าง" ขยับเอง · วันครบกำหนด = วันที่ใบกำกับ + เครดิตของใบสั่งซื้อ
  (ใบรับสินค้าเปล่าใช้เครดิตหัวใบ) · ใบรับสินค้าที่รับหลายรอบแสดงเป็น `RR-…/รอบ`
- กติกา: หนี้หนึ่งก้อนอยู่ได้ใบเดียว (409) · ต้องเป็นผู้ขายเดียวกับหัวใบ (400) · **รอบการรับที่อยู่ในใบรับวางบิลยกเลิกไม่ได้** (409 บอกเลขใบ
  — เอาออกจากใบก่อน) · ลบใบแล้วหนี้กลับไปรอวางบิล · ไม่มีขั้นอนุมัติ แก้ได้ตลอด บันทึกอัตโนมัติ
- สิทธิ์ใช้ชุด `receivingReport:*` ไม่มีสิทธิ์ใหม่ · อยู่ใน Global Search (`BR-`)
- ใบพิมพ์ `VendorBillPrintDocument` ลอกฟอร์ม BR6909091: หัวบริษัท · ผู้จำหน่าย/ที่อยู่/หมายเหตุ · เลขที่/วันที่/เงื่อนไขการชำระเงิน ·
  ตาราง No./เลขที่ใบรับ/วันที่/ครบกำหนด/จำนวนเงิน/จ่ายแล้ว/เงินคงค้าง 17 แถวต่อหน้า · คำอ่านยอด + รวมเงินทั้งสิ้น (= เงินคงค้าง) ·
  ชื่อผู้รับวางบิล · ภาษีหัก ณ ที่จ่าย 3%/5% และ 1% (เว้นเขียนมือ) · วันที่จ่ายชำระ
- ⚠️ ใบรับวางบิลของฝ่ายจัดซื้อเคยสร้างและถอดออก 2026-08-28 (ดู [Purchasing.md](./Purchasing.md)) — ใบนี้ของใหม่ คอลเลกชันใหม่
  `vendor_bill_receipts` ไม่แตะ `bill_receipts` ที่ถูกทิ้งไว้

**ใบพิมพ์ใบรับสินค้า = ฟอร์ม FM-ST-01 Rev.01** (`ReceivingReportPrintDocument`) — แทนแบบชั่วคราวเดิม
- **หนึ่งรอบการรับ = หนึ่งหน้าฟอร์ม** (ฟอร์มเดิมคือบิลหนึ่งใบ) ปุ่มพิมพ์บนหัวใบพิมพ์ทุกรอบ ปุ่ม "พิมพ์รอบนี้" ในประวัติการรับพิมพ์รอบเดียว ·
  ใบที่ยังไม่ได้รับของพิมพ์รายการที่สั่งพร้อมราคาสั่งซื้อ (ใช้ตรวจรับ)
- ข้อมูลที่ใบรับสินค้าไม่มีเอง (รหัสผู้ขาย · เครดิต/ครบกำหนด · วันที่ใบสั่งซื้อ · ขนส่งโดย · เลขใบขอซื้อ:วันที่ · พิมพ์ครั้งที่) มากับการกดพิมพ์
  (`printInfo`) · ช่อง "คลัง" และ "ส่วนลด" ระบบนี้ไม่มีข้อมูล เว้นว่าง · หักส่วนลด/เงินมัดจำเป็น 0.00 ตามฟอร์ม
- ฟอร์มนี้ตัวหนังสือเล็กกว่าใบจ่าย/ใบรับคืน (10.8px) — วัดจากตัวอย่างให้ชื่อสินค้าถูกตัดตรงตำแหน่งเดียวกัน
- วันที่ทุกช่องเป็น วว/ดด/ปป พ.ศ. (`printDateShortBE()` ใน printFormat.ts ใช้ร่วมกับใบจ่าย/ใบรับคืน/ใบรับวางบิล)

ตรวจทั้งสองใบพิมพ์เป็น PDF เทียบไฟล์ตัวอย่างด้วยข้อมูลชุดเดียวกัน · เทสต์ `tests/api/vendorBills.test.ts` (7) + ข้อมูลตอนพิมพ์ RR ใน
`tests/api/receivingReport.test.ts` (+1) · ยังไม่ได้กดทดสอบหน้าจอบนเบราว์เซอร์ (ดู TODO)

## สโตร์จ่าย/คืนของแทนแผนก — ใบจ่ายและใบคืนอ้างเลขใบเบิกของแผนก (2026-09-23 ต่อจาก h)

คำสั่งเจ้าของ (ด่วน): *"ตรงที่อ้างอิงใบเบิก … อยากให้มันขึ้นเลขใบเบิกของแผนกอื่นมาให้หมดเลย ใบจ่ายก็คือตัดจ่าย ใบรับคืนพัสดุก็คือคืนพัสดุ
… หน้าตัดของตามใบเบิกไม่ต้องมีแล้ว … แผนกสโตร์ก็จะมาจ่ายของคืนของในหน้านี้แทน แผนกอื่นไม่สามารถคืนของเองได้"*

- **ใบจ่ายของสโตร์** มีช่อง "อ้างอิงใบเบิก (แผนกอื่น)" — ใบเบิกโครงการ/ผลิตที่อนุมัติแล้วและยังค้างเบิก (`GET /store-sources`)
  เลือกแล้ว: หัวใบ (รหัสงาน ลูกค้า สินค้า แผนก/ทีม/ประเภทงาน) + รายการที่ค้าง (`plannedQty` = ค้างเบิก, `sourceLineId`) + **เลขที่ใบ =
  รหัสจ่าย + เลขใบเบิก** (`MR-202609-0012` → `PD-202609-0012`, ซ้ำต่อท้าย `/2`)
- จ่ายจากใบจ่าย → ตัดสต๊อกที่ใบจ่าย **และบันทึกรอบเดียวกันลงใบเบิกแผนก** (ไม่ตัดสต๊อกซ้ำ) ยอดจ่าย/ค้างของแผนกจึงถูกต้อง ·
  จ่ายเกินที่แผนกยังค้างไม่ได้ · ยกเลิกรอบที่ใบจ่ายเท่านั้น
- **ใบรับคืน** เลือกได้ทุกใบเบิกที่อนุมัติแล้วและมีของที่ยังไม่คืน (ทุกแผนก + ใบจ่ายสโตร์ที่จ่ายตรงไม่อ้างใบเบิก) ไม่จำกัดรหัสคู่แล้ว ·
  เลขที่ใบคืนตามเลขใบเบิกเดียวกัน (`JD-202609-0012`) · ใบจ่ายที่อ้างใบเบิกแผนกไม่อยู่ในรายการ (ให้คืนที่ใบเบิกแผนก ยอดคืนจะอยู่ใบเดียวกับยอดจ่าย)
- **หน้าใบเบิกของแผนกไม่มีการ์ดจ่ายของ/คืนของแล้ว** (มีข้อความบอกว่าสโตร์ทำให้) · route คืนของต้องมี `stock:adjust`
- ช่อง "อ้างอิงใบเบิก" ของทั้งใบจ่ายและใบรับคืน**พิมพ์ค้นหาได้** (2026-09-23k — `RequisitionSourcePicker.tsx` บน `Combobox`): ค้นเลขใบเบิก
  รหัสงาน แผนก ลูกค้า · เลือกจากรายการเท่านั้นถึงเปลี่ยนใบที่อ้าง · ปุ่ม × = ไม่อ้างอิง
- เมนู **ตัดของตามใบเบิก** ถอดออก (ไฟล์หน้ายังอยู่) · ประวัติสต๊อกค้นเลขใบเบิกแผนกแล้วเจอใบจ่ายของสโตร์ที่จ่ายให้
- ⚠️ **เลขอาจต่อท้าย /2 เอง**: เลขรันของใบเบิกแผนก (MR-) กับของใบสโตร์ที่จ่ายตรง (เช่น PD- ที่ไม่อ้างใบเบิก) ใช้ช่วงเลขเดียวกัน
  ถ้าเลขชนกัน ใบที่มาทีหลังได้ `/2` · ตัวนับของใบสโตร์ข้ามเลขที่ถูกใช้แล้ว (documentNumber เป็น unique)
- เทสต์ `tests/api/storeDocuments.test.ts` +5 · ใบเบิกแผนกที่เปิดค้างไว้ก่อนวันนี้ยังจ่ายตรงผ่าน API เดิมได้ (หน้าจอไม่มีปุ่มแล้ว)

### ใบจ่ายที่อ้างใบเบิกแผนกไม่มีขั้นอนุมัติ (2026-09-24g)

เจ้าของ: *"ไม่ต้องรออนุมัติก็สามารถกดจ่ายได้"* — ใบเบิกของแผนกผ่านการอนุมัติมาแล้ว ใบจ่ายที่อ้างมันจึงไม่ต้องอนุมัติซ้ำ
- `storeSlipSkipsApproval(doc)` = ใบสโตร์ที่มี `sourceRequisitionId` · กดจ่ายได้ตั้งแต่ร่าง · **จ่ายรอบแรก = ยืนยันใบ** (เปลี่ยนเป็น Final
  แบบ atomic ก่อนตัดสต๊อก รายการล็อกหลังจากนั้น) · ส่งขออนุมัติไม่ได้ (400) · ไม่มีชื่อผู้อนุมัติบนใบ
- **ยังต้องอนุมัติเหมือนเดิม**: ใบจ่ายตรงที่ไม่อ้างใบเบิก · ใบรับคืน / รับเข้าคลัง (เจ้าของเลือกไว้)
- ใบที่ส่งขออนุมัติค้างไว้ก่อนเปลี่ยน ก็กดจ่ายได้เลย (ใบหลุดจากกล่องรออนุมัติเองเมื่อเป็น Final)
- ⚠️ เปลี่ยนใบเบิกที่อ้าง (หรือเอาออก) ได้เฉพาะก่อนจ่ายรอบแรก — เอาออกแล้วใบกลายเป็นใบจ่ายตรงที่ต้องอนุมัติ

## ใบรับสินค้า: ประเภทราคา · สรุปยอด · ส่วนลด · เครดิต/ครบกำหนด · ผู้ออกบิล (2026-09-24)

เจ้าของสั่ง (รายการงานสโตร์ 2026-09-24 ข้อ 1, 2, 3, 5) — ถามก่อนสองข้อ: "Bill Be" = **ผู้ออกบิล (แทนผู้ขายได้)** ·
ส่วนลด **หักยอดหนี้และต้นทุนสต๊อกจริง**

- **เงื่อนไขบิลอยู่ที่หัวใบ แก้ได้ทุกใบ** (ใบจากใบสั่งซื้อตั้งต้นจากใบสั่งซื้อ: `priceType` จากอัตรา VAT, `creditDays` จากใบสั่งซื้อ) —
  ไม่ใช่ snapshot ของใบสั่งซื้อ แต่เป็นสิ่งที่สโตร์กรอกให้ตรงบิลจริง: `priceType` (`none`/`exclusive`/`inclusive`) · `orderVatRate` ·
  `orderDiscount`+`orderDiscountMode` · `creditDays` · `billerCustom`+`billerName`/`billerTaxId`/`billerAddress`
- เป็น**ค่าตั้งต้นของหน้าต่างรับของ** แต่ละรอบแก้ได้เอง รอบเก็บเงื่อนไขของตัวเอง (`priceType, discount, discountMode, grossAmount,
  discountAmt, creditDays, dueDate`) แก้หัวใบทีหลังไม่ย้อนเปลี่ยนหนี้ที่ตั้งแล้ว
- **สูตร** `batchTotals(lines, vatRate, terms)`: gross = Σ จำนวน×ราคา → หักส่วนลด → `splitVat()`: ไม่มี VAT = ไม่มีภาษี ·
  แยก VAT = บวก VAT · รวม VAT = ถอด VAT ออก (`vat = ยอด × r/(100+r)`) · `subtotal` = ฐานก่อน VAT (ยอดทะเบียนภาษีซื้อ) ·
  **ต้นทุนสต๊อก = ราคาต่อหน่วย × `costFactor`** (ฐาน ÷ gross) — ส่วนลดเกลี่ยตามสัดส่วน และภาษีซื้อไม่เป็นต้นทุน ·
  ไม่ส่ง terms = สูตรเดิมทุกประการ (ใบ/รอบเก่าไม่มี `priceType` อ่านด้วย `priceTypeOf()`: มีอัตรา VAT = แยก, ไม่มี = ไม่มี VAT)
- **ผู้ออกบิลที่กรอกเอง** (เช่นซื้อเงินสดจากร้านที่ไม่มีในทะเบียน) = ชื่อเจ้าหนี้ในทะเบียนเจ้าหนี้/ภาษีซื้อ (`billerOf()`) และพิมพ์แทนผู้ขายบนฟอร์ม ·
  ชื่อบริษัทบังคับตอนรับของ (400) ไม่บังคับตอนบันทึกเพราะบันทึกอัตโนมัติยิงระหว่างพิมพ์ · ใบรับวางบิลจัดกลุ่มตามชื่อนี้ไปด้วย
- **วันครบกำหนด** = วันที่ใบกำกับ + เครดิต (`dueDateOf()`) เก็บในรอบ · ใบรับวางบิลใช้ `batch.dueDate` ก่อนเครดิตของใบสั่งซื้อ ·
  การ์ดบนหน้าจอนับจากวันที่ใบกำกับของรอบล่าสุด (ยังไม่รับ = วันนี้)
- **การ์ด "สรุปยอด"** แบบใบเสนอราคา (`orderTotalsOf()`) ไว้เทียบบิลผู้ขายก่อนกดรับของ · KPI "มูลค่าสั่งซื้อ" ใช้สูตรเดียวกัน
- **ใบพิมพ์ไม่แสดงส่วนลด** (คำสั่งเจ้าของ) — ช่อง "หักส่วนลด" ยังเป็น 0.00 ช่อง "รวมเป็นเงิน" เป็นยอดหลังหักส่วนลดแล้ว (จำนวนเงินรายบรรทัด
  เป็นราคาเต็ม รอบที่มีส่วนลดผลรวมรายบรรทัดจึงมากกว่าช่องรวมเป็นเงิน)
- ก่อนเปิดหน้าต่างรับของ หน้าจอบันทึกหัวใบที่ค้างก่อนทุกใบ (เดิมเฉพาะใบเปล่า) เพราะเซิร์ฟเวอร์อ่านผู้ออกบิลจากใบตอนตั้งหนี้
- เทสต์: บล็อก "ใบรับสินค้า: ประเภทราคา · ส่วนลด · เครดิต · ผู้ออกบิล" ใน `tests/api/receivingReport.test.ts`

## จ่ายของเกินที่ขอได้ (2026-09-24)

เจ้าของ: *"ใบเบิกตอนจ่ายของสามารถจ่ายของเกินได้"* — ของจริงมาเป็นแพ็ก/ม้วน ตัดพอดีจำนวนที่ขอไม่ได้
- รอบจ่ายไม่ถูกจำกัดด้วยยอดค้างเบิกแล้ว (ทั้งใบเองและใบเบิกแผนกที่ใบจ่ายสโตร์อ้าง) **ด่านเดียวที่เหลือคือของในคลังต้องพอ**
- ยอดเกินลงใบเบิกแผนกด้วย ค้างเบิกเป็น 0 ไม่ติดลบ · หน้าจอบอก "จ่ายเกินที่ขอ N" เป็นสีส้ม (ไม่ใช่ข้อผิดพลาด) · ของไม่พอยังเป็นกรอบแดง
- ⚠️ ของที่จ่ายเกินถือว่าทีมถืออยู่ คืนได้ตามปกติผ่านใบรับคืน (เพดานคืน = จ่ายไป − คืนแล้ว ไม่ใช่จำนวนที่ขอ)

## ใบเบิกที่อนุมัติแล้ว "ส่งมา" ที่หน้าสโตร์ — แท็บ "ใบเบิกจากแผนก" (2026-09-24)

เจ้าของ: *"ใบเบิกเมื่อถูกอนุมัติให้ส่งใบเบิกไปที่หน้าใบเบิกและใบคืนวัสดุ (สโตร์) พอเปิดใบเบิกที่ถูกส่งมาก็จะมาให้กรอกข้อมูลเหมือนเดิม"*
- ไม่ได้ย้ายเอกสาร — ใบเบิกของแผนกยังเป็นใบเดิม แต่**ขึ้นในแท็บ "ใบเบิกจากแผนก"** ของ `StoreDocumentsPage` ทันทีที่อนุมัติและยังค้างเบิก
  (แหล่งเดียวกับช่อง "อ้างอิงใบเบิก" ของใบจ่าย: `/store-sources`) และหายไปเองเมื่อจ่ายครบ
- ปุ่ม **ทำใบจ่าย** = เลือกรหัสจ่าย (ตั้งต้น PP/PD ตามแผนก) → สร้างใบจ่ายที่อ้างใบเบิกนั้นให้เลย แล้วเปิดใบให้กรอกส่วนที่เหลือ (ผู้จ่าย วันที่
  เลขอ้างอิง จำนวนจ่าย ฯลฯ) · คอลัมน์ "ใบจ่ายของสโตร์" บอกว่าใบเบิกนี้มีใบจ่ายแล้วกี่ใบ (ใบจ่ายหลายใบต่อใบเบิกได้ เลขต่อท้าย `/2`)
- แจ้งเตือนอนุมัติที่สโตร์ได้รับ พามาแท็บนี้และเน้นแถว (App: `n.type === "material_requisition_approved"` + id ที่ไม่ใช่ใบของสโตร์)

## ส่งออก Excel / PDF ของหน้าสต๊อก ประวัติสต๊อก และการ์ดสต๊อก (2026-09-24)

- ตารางเดียว (`ExportSheet` จาก `src/lib/stockExport.ts`) ป้อนทั้งไฟล์ Excel (`downloadXlsx`) และใบพิมพ์ PDF (`TablePrintDocument`) ตัวเลขจึงตรงกันเสมอ ·
  PDF = หน้าต่างพิมพ์ของเบราว์เซอร์ → "บันทึกเป็น PDF" (ระบบไม่มีตัวสร้าง PDF ฝั่งเซิร์ฟเวอร์ ใบพิมพ์ทุกใบก็ทางนี้)
- หน้าสต๊อก: ยอดคงเหลือตามผลค้นหาที่เห็น + แถวรวมจำนวน/มูลค่า · การ์ดสต๊อกรายสินค้า Excel (ดึงประวัติทั้งหมด ≤ 2,000 แถว เหมือนใบพิมพ์)
- ประวัติสต๊อก: ส่งออกทั้งชุดที่กรอง (ค้นหา/ประเภท/ที่มา/ช่วงวันที่) ≤ 5,000 แถว · แท็บติดตามรายสินค้า: การ์ดสต๊อก Excel/PDF ตามช่วงวันที่ (≤ 500 แถวตามที่แท็บโหลด)
- หัวคอลัมน์ภาษาไทยเสมอ (เอกสารที่ส่งออกไปใช้งาน — นโยบายเดียวกับใบพิมพ์)
