# Module: Cost Control (BD)

## Status: ✅ Built 2026-08-28 — โมดูลเอกสารเต็มรูปแบบของแผนก BD สร้างจากการโยนไฟล์ Excel ของงานเข้ามา หรือเปิดใบเปล่ากรอกเอง · **ใบพิมพ์ถอดแบบจากฟอร์มจริง FM-SL-06 Rev.02** ไม่ใช่ placeholder · ตรวจในเบราว์เซอร์ด้วยไฟล์จริงแล้ว

Every cost line a job carries, gathered into one document and totalled.

⚠️ **It no longer computes profit.** It was built (2026-08-28) to do exactly that — cost + markups
against a selling price, giving กำไร and คิดเป็น% — and the owner had that whole block removed on
2026-08-31, pointing at the printed summary and saying *"เอาออก"*. See "Prices are not imported" and
"The markup / profit block, removed" below. Anything in this file describing profit arithmetic is
history, kept because it explains why the code looks the way it does.

## This closed a gap the repo had carried since 2026-08-20

Both the Project and the Production specs open with *"เมื่อได้รับ Scope of Work, **Cost Control**
แล้ว …"*, and **five** places recorded that it could not be built because nobody had said what Cost
Control *was* — [`docs/TODO.md`](../TODO.md) (two items), [`Project.md`](./Project.md),
[`Production.md`](./Production.md), and `SESSION_LOG.md`. Every one of them said the same thing:
*"ต้องให้เจ้าของนิยามก่อนว่าเป็นข้อมูลแบบไหน (เอกสาร? ตัวเลขงบต่อรายการ? มาจากแผนกไหน?)"*

The answer, given 2026-08-28: **an Excel sheet the company already fills in by hand**, owned by BD.
The owner supplied a real filled-in workbook and its printed PDF, and this module is transcribed
from them.

## Which sheets the importer reads, and how it knows

**By content, never by sheet name.** The first version keyed off names (`COST CONTROL-…`, `SC`),
which fit exactly one workbook. The owner's second job file
(`PQ202511-267-LI-SK - น้ำมันพืชไทย …xlsx`) has four sheets named `Manhole 5 mm.`, `Rev.01`,
`ลองๆ` and `3mm.` — all four are complete Cost Control sheets, and the importer found none of
them. **The `SC` in the first file's name is a job-type code, not a sheet name** (the second file
is `LI`); the sheets happening to be called `SC` and `COST CONTROL-SC` was a coincidence.

| Kind | Signature row |
|---|---|
| Cost Control | `A` = `ลำดับที่` and `B` = `รายละเอียด` |
| Estimate | `B` = `ITEM` and `D` = `DESCRIPTION` (buried around row 291) |

`classifySheetName()` survives as a last-resort tiebreak only.

### One sheet, or several

Every readable sheet is listed with its kind and **how many lines it parses to**, and any number
can be ticked. Merging joins them into one document with a **group heading naming each sheet** so
a reader can still tell where a line came from. Header fields take the first non-empty value;
**the markup block is not summed** — a selling price belongs to the job, not to a sheet — and a
disagreement between sheets is warned about rather than silently resolved. **Both of those rules are
gone as of 2026-08-31**: the markup block is not read at all any more, so there is nothing to sum and
nothing to disagree about.

The default selection is a single sheet: the **leftmost one that actually parses**, preferring a
Cost Control sheet over an estimate. It deliberately does *not* pick the sheet with the most
lines — that rule picked `ลองๆ` ("just trying"), someone's scratch sheet, out of the real file.

### The summary block: read for one check only (2026-08-31)

Only **row 1 (ราคาต้นทุน)** is read now, and it is never stored: it is compared against the parsed
lines, and a mismatch with no rounding to explain it is reported as **lines missed** — the only
automatic check that the sheet was laid out as expected. `parseStatedTotalCost()` matches it **by
its number**, not its wording, which differs between files.

Rows 2-5 (ค่าดำเนินการ + %, Bubble + %, Entertainment, ราคาขาย) used to be read and sent with the
create call, so an imported document arrived with its margin already computed. They are not read at
all any more — the module has no margin.

### Dates are Buddhist

`14/11/68` means 14 Nov พ.ศ. 2568 = 2025-11-14, confirmed by the job number itself
(`PQ202511-267` = Nov 2025). A two-digit year is always read as a short Buddhist year, and any
year ≥ 2400 has 543 subtracted.

## Where the shape came from

`reference/company/PQ202608-222-SC-SK - บริษัท โรงงานแปรรูปขยะชุมชนวังไผ่.xlsx` — two sheets:

| Sheet | What it is | Rows |
|---|---|---|
| `SC` | ใบประเมินราคา (the estimate the sales/technical side builds) | 8,400 |
| `COST CONTROL-SC` | the finished Cost Control | 1,003 |

`reference/` is gitignored, so **`src/lib/costControl.ts`, `src/lib/costControlImport.ts` and
`CostControlPrintDocument.tsx` are the durable record of the form** — treat them as the source of
truth rather than expecting to reopen the spreadsheet.

## Prices are not imported (2026-08-31)

*"Cost control เวลาโยนไฟล์เข้าไปให้เอาราคาออกให้ด้วย"* — confirmed with the owner to mean **strip the
prices, keep the line items**, and **always**, with no opt-out toggle. A dropped workbook now yields
ลำดับ / รายละเอียด / Model / supplier / จำนวน / หน่วย and nothing else; the cost column and the whole
markup block arrive empty for a person to fill in.

The reason is not technical: the prices in an estimate workbook often are not yet the costs the
decision should be made on, and carrying them across invites people to trust a number nobody checked.

### Why the strip lives in the dialog, not the parser

`parseCostControlSheet()` still reads every price exactly as before. It has to: the *"ไฟล์ระบุราคา
ต้นทุน X แต่รวมจากรายการที่แกะได้ Y"* warning is the only automatic check that the sheet was laid out
as expected, and it is computed **from** those prices. Strip at the source and that check dies with
them. So `stripImportedPrices()` runs afterwards, in `CostControlImportDialog.applyPicked()` — one
chokepoint that the preview table, the summary paragraph and the create payload all read through.
None of the parser’s ~40 tests needed changing.

Warnings about money that is no longer imported are filtered out (rounding mismatch, the SC sheet’s
per-block *"อ่านยอดรวมไม่ได้"*, clashing selling prices across merged sheets). The **lines-missed**
warning stays — it is computed before the strip, so it is still true. The filter matches on text
fragments declared next to the code that builds those messages, with tests asserting each one is
present before the strip and gone after, so the two cannot drift apart silently.

Nothing on the API side changed for this pass: `handleCreate` accepts `unitCost: null` exactly as it
accepts a blank document. (The markup fields it used to accept were removed hours later, in the
follow-up below.)

One print fix went with it: the *ต้นทุนรวมทั้งหมด* cell used to print `-` (which means **zero** on this
form) on every row while the cost cell beside it was blank. Both are blank now until a cost is typed.

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
| `FFFF00` | ไฮไลต์ (ราคาขาย / คิดเป็น%) — no longer used, both rows were removed 2026-08-31 |

Those values were read out of the workbook's `fgColor`, not guessed from a screenshot. When a file
has no fills, a text-only row falls back to **`sub`, never `group`** — guessing the other way turned
almost every row pink on the printed page. The editor has a per-line kind selector so a person can
correct either case.

## The markup / profit block, removed (2026-08-31)

The owner sent a screenshot of the printed summary — ข้อ 1-5, กำไร, คิดเป็น%, every value showing
`-` or `0.00` now that prices are no longer imported — and said *"เอาออก"*, confirming it meant the
whole thing, from **both the printed form and the document page**.

So the module lost its margin arithmetic entirely:

| Gone | Kept |
|---|---|
| `operatingCost`/`operatingPct`, `bubbleCost`/`bubblePct`, `entertainmentCost`, `sellingPrice` | the cost lines |
| `costControlTotals()` → replaced by `costControlTotalCost(lines)` | ราคาต้นทุนรวม, still derived, never stored |
| the summary editor on the document page | หมายเหตุ / Submitted by / Approved by |
| summary rows 1-5 + กำไร + คิดเป็น% on the print form | one ราคาต้นทุนรวม line |
| ราคาขาย and กำไร columns on the list page | ต้นทุนรวม column |
| the `#FFFF00` highlight (it only ever highlighted ราคาขาย and คิดเป็น%) | the group/item fills |

**The print form now deviates from FM-SL-06 at exactly this one point, deliberately.** That is worth
knowing before someone "fixes" it back to match the paper form.

**Stored data was not deleted.** Documents created before this carry their markup values in MongoDB;
nothing reads them any more. Same convention as the Company Profiles and ใบตรวจรับ removals — delete
the code, leave the data. The API simply stopped accepting those keys: sending them is ignored, the
way any unknown key is.

```
ต้นทุนรวมของบรรทัด = จำนวน × ต้นทุน          (หัวกลุ่มไม่นับ)
ราคาต้นทุนรวม      = ผลรวมของทุกบรรทัด        ← สิ่งเดียวที่ยังคำนวณ
```

**No total is ever stored**, unchanged: `costControlTotalCost()` derives it at render time and the
list route computes it per row on read, the same rule `Quote.amount` and `purchaseOrderSubtotal()`
follow.

### What the profit formula used to be

Kept as a record, since the numbers below are what the import's "lines missed" check still compares
against, and because someone will eventually ask why `parseStatedTotalCost()` only reads row 1:

```
กำไร     = ราคาขาย − (ราคาต้นทุน + ค่าดำเนินการ + Bubble + Entertainment)
คิดเป็น%  = กำไร ÷ **ราคาขาย** × 100        ← หารด้วยราคาขาย ไม่ใช่ต้นทุน
```

Checked against the real document at the time: cost 8,558,497.46 + 1,300,000 + 130,000 + 0 against a
selling price of 13,000,000 gives 3,011,502.54 and 23.17% — and 23.17% is only reachable by dividing
by the selling price.

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
- ~~summary rows 1-5 unbordered with the selling price highlighted; กำไร and คิดเป็น% in a bordered
  box with the percentage highlighted~~ — **removed 2026-08-31**, replaced by a single
  ราคาต้นทุนรวม line. The one deliberate deviation from the paper form
- หมายเหตุ rule, Submitted by / Approved by with Date (ว/ด/ป), and the form code bottom-right

Fixed Thai, no `useI18n`, per the print policy in [`../CLAUDE.md`](../CLAUDE.md).

### Two print-only rules that are easy to undo by accident

**1. `EDGE_GUARD` — the 2px right padding on the print root is not spacing, it is the right border.**
The line table is `width: 100%` of A4's 186mm printable area (703px) and `border-collapse: collapse`
paints the outermost border *after* the table's right edge, not inside it. Measured out of a real
printed PDF's content stream: the rightmost vertical rule was drawn at **x = 703 → 704** against a
page that ends at 703, so the whole line fell off the paper. The left border never showed the problem
(x = 0 → 1, inside), and the DOM measures clean either way — which is why an earlier pass looked at
`getBoundingClientRect()`, found nothing wrong, and wrote the report off as a screenshot artifact.
Reported by the owner on 2026-08-28 as *"ตอนกดปริ้นเป็น A4 ขอบมันมาไม่ครบ"*. **Verify this one by
reading the PDF, not the DOM.**

**2. ฿ and the amount share one cell.** They were briefly two columns under a `colSpan={2}` header,
which drew a rule between the symbol and the number that the real form does not have (in the source
workbook it is a single accounting-formatted cell). One `<td>` with an inner flex now pushes ฿ left
and the number right. Splitting them again reintroduces both the rule and the clipped ฿ glyph.
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
