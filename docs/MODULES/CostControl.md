# Module: Cost Control (BD)

## Status: ✅ Built 2026-08-28 — โมดูลเอกสารเต็มรูปแบบของแผนก BD สร้างจากการโยนไฟล์ Excel ของงานเข้ามา หรือเปิดใบเปล่ากรอกเอง · **ใบพิมพ์ถอดแบบจากฟอร์มจริง FM-SL-06 Rev.02** ไม่ใช่ placeholder · ตรวจในเบราว์เซอร์ด้วยไฟล์จริงแล้ว

The document that decides whether a job is worth taking: every cost line the estimate produced,
totalled, marked up, and compared against the intended selling price.

## This closed a gap the repo had carried since 2026-08-20

Both the Project and the Production specs open with *"เมื่อได้รับ Scope of Work, **Cost Control**
แล้ว …"*, and **five** places recorded that it could not be built because nobody had said what Cost
Control *was* — [`docs/TODO.md`](../TODO.md) (two items), [`Project.md`](./Project.md),
[`Production.md`](./Production.md), and `SESSION_LOG.md`. Every one of them said the same thing:
*"ต้องให้เจ้าของนิยามก่อนว่าเป็นข้อมูลแบบไหน (เอกสาร? ตัวเลขงบต่อรายการ? มาจากแผนกไหน?)"*

The answer, given 2026-08-28: **an Excel sheet the company already fills in by hand**, owned by BD.
The owner supplied a real filled-in workbook and its printed PDF, and this module is transcribed
from them.

## Where the shape came from

`reference/company/PQ202608-222-SC-SK - บริษัท โรงงานแปรรูปขยะชุมชนวังไผ่.xlsx` — two sheets:

| Sheet | What it is | Rows |
|---|---|---|
| `SC` | ใบประเมินราคา (the estimate the sales/technical side builds) | 8,400 |
| `COST CONTROL-SC` | the finished Cost Control | 1,003 |

`reference/` is gitignored, so **`src/lib/costControl.ts`, `src/lib/costControlImport.ts` and
`CostControlPrintDocument.tsx` are the durable record of the form** — treat them as the source of
truth rather than expecting to reopen the spreadsheet.

## Two ways to create one

1. **โยนไฟล์ Excel เข้ามา** (the main path) — drop the job's workbook on the import dialog.
2. **เปิดใบเปล่า** — added at the owner's request mid-build (*"cost control ไม่ต้องโยนไฟล์ก็สร้างเอง
   ได้ด้วยดิ"*), for jobs with no estimate file.

Numbering is `CC-{พ.ศ.}-{NNNN}`. The document runs on the shared approval engine
(`api/_lib/documentApproval.ts`) — ร่าง → รออนุมัติ → อนุมัติ, rejection comments, withdraw, and
`-R1` rewrite — because the real form has *Submitted by* and *Approved by* signature lines.

## The import, and why a person must look at it

`src/lib/costControlImport.ts` is **pure** — it takes `string[][]` (plus optional fill colours) and
knows nothing about React, the network, or `xlsx`. The browser reads the file and posts the
**corrected rows** as ordinary JSON; the server never receives a file. That avoids multipart,
base64, and body-size ceilings entirely, and the preview needs no round-trip.

### Reading the `SC` sheet

Columns `A,C,E,G,I,K,M,O` hold `|` characters that draw a fake table border — skipped. The real
columns are `B`=ลำดับ `D`=รายละเอียด `F`=จำนวน `H`=หน่วย `P`=ยอดรวม. **One "block" = one line**:
it starts where `B` has a number and ends at a row whose `P` is `=`; the block's total is the last
`P` value before that separator. Verified against the real file:

| Block in `SC` | Total | Line in `COST CONTROL` |
|---|---|---|
| `Mian Duct ( FRP Duct) No.1` | 931,020.00 | `MAIN DUCT FRP No.1` ✓ |
| `Mian Duct ( FRP Duct) No.2` | 1,802,484.00 | ✓ |
| `SUPPORT` | 557,000.00 | ✓ |
| `JOINT FRP DUCTING` | 273,350.40 | ✓ |

**But it is not 1:1, and that is the whole reason the preview exists.** Three real behaviours found
in the same file:

- blocks whose total carries straight across (above)
- blocks a person **split into several lines with different prices** — `FRP HOOD`'s block totals
  180,000, but the finished document has two lines totalling 248,000
- blocks a person **collapsed** — `LADDER` 14,400 + `PLATFORM` 10,000 became one
  "Steel Ladder & Support" line at 24,400

So the parser produces a **starting point**, never a finished document. This is the same conclusion
`api/_lib/templateWorkbookParser.ts` reached about this company's spreadsheets in July, recorded
there as *"A naive automated classifier risks silently corrupting already-twice-reviewed
customer-facing content"*.

### Row kind is stored, and read from cell colour

`CostControlLine.kind` is `"group" | "item" | "sub"`, stored rather than inferred. It has to be:
in the sheet, a group heading (`งาน Dust Collector`) and a descriptive sub-line (`VERTICAL PUMP`,
`-34,800 CMH`) are **textually identical** — both are rows with words and no numbers. A person tells
them apart by **background colour**, so the parser reads it too:

| Fill | Meaning |
|---|---|
| `F2DBDB` | หัวกลุ่ม |
| `92D050` | ช่องรายละเอียดของรายการหลัก |
| `FFFF00` | ไฮไลต์ (ราคาขาย / คิดเป็น%) |

Those values were read out of the workbook's `fgColor`, not guessed from a screenshot. When a file
has no fills, a text-only row falls back to **`sub`, never `group`** — guessing the other way turned
almost every row pink on the printed page. The editor has a per-line kind selector so a person can
correct either case.

## Money

**No total is ever stored.** `costControlTotals()` derives everything from the lines and the five
markup fields at render time, the same rule `Quote.amount` and `purchaseOrderSubtotal()` follow.
The list route computes `totalCost` per row on read for the same reason.

```
ต้นทุนรวมของบรรทัด = จำนวน × ต้นทุน          (หัวกลุ่มไม่นับ)
ราคาต้นทุน         = ผลรวมของทุกบรรทัด
กำไร              = ราคาขาย − (ราคาต้นทุน + ค่าดำเนินการ + Bubble + Entertainment)
คิดเป็น%           = กำไร ÷ **ราคาขาย** × 100        ← หารด้วยราคาขาย ไม่ใช่ต้นทุน
```

Checked against the real document: cost 8,558,497.46 + 1,300,000 + 130,000 + 0 against a selling
price of 13,000,000 gives 3,011,502.54 and 23.17% — and 23.17% is only reachable by dividing by the
selling price.

### The 24-baht difference, surfaced rather than hidden

Importing that file produces a cost of 8,558,521.55, not 8,558,497.46 — **24.09 baht more**. The
source file *displays* a rounded quantity (Packing Media shows `10.62`; the stored value is
`10.618583…`) while computing from the full one. Three options existed: store the file's totals
(two sources of truth), silently round, or compute honestly and say so. The import does the third —
it counts the disagreeing lines and warns before you create the document. The resulting document is
internally consistent, which a document with stored totals cannot promise.

## The printed form — FM-SL-06 Rev.02 : 11/09/67

The owner's instruction was explicit: *"รูปแบบ pdf ต้องออกมาตรงตามเหมือนใน pdf ที่ส่งให้ไปเลย"*.
`CostControlPrintDocument.tsx` is transcribed from the supplied PDF, not designed:

- **its own letterhead** — logo left, company block right. It deliberately does **not** use the
  shared `PrintLetterhead`, whose gold vertical tab and right-hand meta block are a different design
- bordered `COST CONTROL` title cell, then a bordered two-row job box (Job Name / Work type,
  Job order / Date)
- the nine-column grid, with fills applied **only to the description cell** as in the original
- `฿` in its own narrow column, numbers right-aligned, zero printed as `-`
- summary rows 1-5 unbordered with the selling price highlighted; กำไร and คิดเป็น% in a bordered
  box with the percentage highlighted
- หมายเหตุ rule, Submitted by / Approved by with Date (ว/ด/ป), and the form code bottom-right

Fixed Thai, no `useI18n`, per the print policy in [`../CLAUDE.md`](../CLAUDE.md).

> One layout note for whoever edits this next: the line table deliberately uses **auto** table
> layout. An earlier version set `table-layout: fixed` with percentage widths, and `nowrap` money
> columns overflowed their assigned cells and lost their last characters on the page edge.

## Navigation, RBAC

A tenth nav group, **BD**, holding this one document — the rule `DESIGN.md` states is that a group
is earned by a department with a process of its own, which is why โครงการ, ผลิต and จัดซื้อ have
theirs.

7 permissions: `costControl:view` / `viewAll` / `create` / `edit` / `finalize` / `print` / `delete`,
grouped under **BD** on the roles page. As with every module since 2026-08-25 they are added to
`administrator` in `defaultRoles`, which affects **fresh installs only** — **the live server needs
them ticked by hand in Role Management.**

## Routing

`api/_lib/costControlHandler.ts`, mounted on `api/handlers/quotes.ts` (the Vercel 12-function budget
is full), with matching entries in `vercel.json` and `server/app.ts`. The unique index on
`documentNumber` is created lazily by the handler, because `ensureIndexes()` only ever runs from the
Setup Wizard.

## Known gaps

1. **`jobOrder` is text, not a link.** It holds the Scope of Work number (`PQ202608-222-SC-SK`) but
   is not a foreign key, so nothing reconciles a Cost Control against the Scope of Work it names.
   Deliberate for now — the owner asked for file-import only, and a real link needs a decision about
   what happens when the Scope of Work is revised.
2. **Nothing downstream reads it.** The Project and Production specs treat Cost Control as a
   precondition; neither module checks for one yet.
3. **No guided tour**, and no Dashboard presence.
4. **The `SC` importer assumes this workbook's shape.** A job whose estimate sheet is laid out
   differently will parse to zero lines — which the import reports rather than silently accepting.
