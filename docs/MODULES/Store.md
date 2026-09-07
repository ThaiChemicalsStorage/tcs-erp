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
| Stock: return movements, moving-average cost, stock value, stock card print | ✅ Built |
| Team tools (issue/return page, holdings, report) | ✅ Built |
| **Receiving Report (RR)** + payable posting | ✅ Built |
| Purchase-tax register + AP register | ✅ Built |
| Delivery Order attachments | ✅ Built |
| Real paper forms for the RR print layout | ⏳ Not supplied by the owner yet — placeholder |
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

The RR document is deliberately **one page for the whole life of the order**: ordered/received/
outstanding value cards → *รายการค้างรับ* → *รับครบแล้ว* (a line moves across on its own when its
outstanding hits zero) → per-round receipt history with a reverse button on the newest → attachments.

Auto-save covers only `documentNumber` and `remarks`. Everything else is the result of pressing
*บันทึกรับของ*, which is an intentional act, not something typed and left.

`PurchaseOrderDocument` gained a **รับสินค้า** button on approved orders: it looks for an existing RR
first and opens it, and only creates one when there is none.

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
| `tests/api/materialRequisitionIssue.test.ts` | approve with zero stock, delta-based issuing, over-issue, insufficient stock writing nothing, return limits, org stamping |
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
- Reversing a receipt uses the current average cost (see above).
- `ap_entries` only ever holds `entryType: "RR"`. The rest of the company's AP codes need their own
  source documents first.
