# Module: Accounting

## Status: ⚠️ Planning notes only (as of 2026-08-17) — nothing scoped, nothing built

This file exists to capture everything discussed/gathered so far, before any real scoping or
implementation starts. **Not a spec, not a commitment to a design** — just raw material so the
next session (or whoever picks this up) doesn't have to re-derive it. See the coordination note at
the top of [`../CLAUDE.md`](../CLAUDE.md) and the "Accounting module" + "Coordination risk" entries
in [`../TODO.md`](../TODO.md) High/Medium Priority for the task-tracking side of this.

## Why this came up

The accounting department has already **purchased pre-printed multi-part NCR (carbonless copy)
continuous forms** and intends to print onto them using a **dot-matrix (impact) printer** — a hard
requirement, not a preference, since only mechanical impact transfers ink through the carbon layers
to the copies underneath (laser/inkjet only print the top sheet).

## Document types mentioned (owner, 2026-08-17)

Two separate lists were given in conversation — kept both verbatim since the second list adds a
document (ใบรับเงินมัดจำ) not in the first, and it's unclear yet whether these are the same 4-part
form restated or a slightly different/overlapping set:

**First mention:**
- ใบแจ้งหนี้ / ใบวางบิล (Invoice / Billing Note)
- สำเนาใบเสร็จรับเงิน (Receipt copy)
- สำเนาใบกำกับภาษี (Tax Invoice copy)
- ใบส่งสินค้า (Delivery Note)

**Second mention:**
- ใบรับเงินมัดจำ / ใบกำกับภาษี (Deposit Receipt / Tax Invoice)
- ใบแจ้งหนี้ / ใบวางบิล (Invoice / Billing Note)
- ใบเสร็จรับเงิน (Receipt)
- ใบกำกับภาษี / ใบส่งสินค้า (Tax Invoice / Delivery Note)

**Needs clarifying with accounting**: whether "ใบรับเงินมัดจำ" (Deposit Receipt) is a 5th distinct
document or an alternate name/variant of the Receipt for deposit-stage payments specifically — the
"Flow งานบัญชี" spreadsheet below suggests the latter (deposits get their own tax-invoice numbering
prefix but aren't described as a wholly separate physical document).

Of these, only **ใบส่งสินค้า** has any existing equivalent in the ERP today — the Delivery Order
module (`deliveryOrder`, see [DeliveryOrder.md](./DeliveryOrder.md)) — and even that prints its own
plain-paper layout today, not this NCR form. **Invoice/Billing Note, Receipt, Tax Invoice, and
Deposit Receipt have zero data model, workflow, or UI in the ERP.**

## Real business-process reference: "Flow งานบัญชี.(13.8.69).xlsx"

The owner dropped 3 reference files into `public/` (untracked, not committed — see below):
`Flow งานบัญชี.(13.8.69).xlsx` and two example billing-note PDFs (scanned images, couldn't be read
in this environment — no PDF renderer installed — but presumably useful later for the physical
print-position-calibration phase). The spreadsheet has 2 sheets, each a freeform flowchart (not a
data table) describing the company's actual real-world accounting process end to end. Summarized
below; **treat this as ground truth for how the business actually works**, more authoritative than
anything inferred from the document-type list alone.

### Sheet "บัญชีรับ" (Accounts Receivable)

**Actors, left to right**: ลูกค้า (Customer) → ฝ่ายขาย (Sales) → ฝ่ายผลิต (Production) →
**ฝ่ายโครงการ (Project department — the "Project" dept from the coordination-risk note)** →
ฝ่ายบัญชี/บัญชีรับ (Accounting/AR) → **โปรแกรมบัญชี "Express"** (a real third-party Thai accounting
software the company already uses — not something this ERP replaces, more likely something the new
Accounting module's data needs to end up compatible with or feed into eventually) → ฝ่ายการเงิน
(Finance) → Cloud data.

**Flow, condensed:**
1. Sales agrees product + price with customer (their own separate "Jubili" sales system was
   mentioned, not this ERP), sends to Accounting.
2. Accounting checks documents, checks the delivery/installment schedule (% split across
   installments), **keys the Scope of Work into "Cloud A"** — this is a direct reference to the
   ERP's *existing* Scope of Work module by name.
3. A billing-status lifecycle is tracked per job: **"ยังไม่ได้วางบิล" (not yet billed) → "วางบิล"
   (billed — deposit/first installment) → "งานยังไม่จบ" (work not done) → "จบ" (done)**.
4. Contracts/POs need documentation; service contracts over ฿1,000,000 require an
   อากรแสตมป์ (stamp duty) — ฿1 per ฿1,000 of contract value, either physical stamp or online
   filing with the Revenue Department depending on value. Some contracts require a bank guarantee
   (หนังสือค้ำประกัน), tracked and followed up for return once the guarantee period ends.
5. Production plans production/prepares materials (P1/P2/P3 = requisition codes for
   Sheet/Assembly/Steel), requests more via PR if short (PR.FAC code).
6. Project department plans installation/service, prepares goods (PR.PED code if short),
   **issues its own delivery note using an ISO-controlled form** ("ใบส่งมอบ2") once
   goods/materials are on-site.
7. **Each installment's billing is gated on a signed "ใบส่งมอบงาน" (Job/Work Delivery Note) —
   the customer signs it, the original goes to Accounting, and only then can the NEXT installment
   be billed.** This is the concrete mechanism behind the coordination-risk concern: the Project
   department's ใบส่งมอบงาน (being built by the other developer) is a hard *upstream dependency*
   for the Accounting module's per-installment billing trigger, not just a loosely related
   document.
8. Accounting issues, in order per installment: **AR** (ใบกำกับภาษีขาย / sales tax invoice, 4
   copies incl. original) → **BI** (ใบวางบิล / billing note, 2 copies incl. original) → once paid,
   **RE** (ใบเสร็จรับเงิน / receipt, 2 copies incl. original). Later installments' tax invoices use
   an **IV** number instead of AR. Deposit/down-payment tax invoices get their own numbering
   sequence, referenced in the flow as under the AR series ("เมื่อออกใบกำกับภาษีขาย Down payment
   ใส่เลขที่ AR…") — this is likely where "ใบรับเงินมัดจำ" from the second document list fits in,
   pending confirmation with accounting.
9. Retention money withheld by the customer (เงินประกันผลงาน), withholding tax
   (ภาษีหัก ณ ที่จ่าย), and bank transfer fees are all tracked and reconciled against bank
   statements ("เช็ค Statement กับสลิปโอนเงิน").
10. Up to (at least) 4 installments seen in the example flow, with one installment type gated on
    "Test run" completion by the Technical department before the delivery note can be issued.
11. Explicit notes at the end of the sheet: every customer's exact documentation requirements
    differ (always confirm with the customer's own accounting/purchasing dept before billing);
    some jobs need a Report attached to the billing packet; some customers pay by cheque and need
    coordination for out-of-area pickup; AR actively tracks Production/Project's plans to avoid
    missing a billing window; AR follows up customer payment for cash flow; Cloud status is kept
    updated throughout.

### Sheet "บัญชีจ่าย" (Accounts Payable)

**Actors**: Supplier/ผู้รับเหมา (Supplier/Contractor) → แผนกจัดซื้อ (Purchasing) →
ฝ่ายผลิต/คลังสินค้า (Production/Warehouse) → ฝ่ายโครงการ (Project) → ฝ่ายบัญชี/บัญชีจ่าย
(Accounting/AP) → โปรแกรมบัญชี Express → ฝ่ายการเงิน (Finance).

**Flow, condensed:**
1. Purchasing issues a PO to a supplier/contractor (with or without a deposit); for service
   contracts, stamp duty applies the same way as on the AR side.
2. Warehouse/Production receives goods, checks against PO + tax invoice, signs receipt, keys into
   the accounting system as **RR** (goods receipt), sends the full document set to AP.
3. Project department handles contractor payments for installation/service work — the supervising
   engineer signs the contractor's own **ใบส่งมอบงาน** (yes, the same document name/concept as the
   AR side, but here it's the *contractor's* proof of work delivered *to* the company, not the
   company's proof of work delivered to the customer) before it can be forwarded to AP.
4. AP checks document completeness, verifies against PO terms and amount, issues a withholding tax
   certificate if the payment is for services, then **accrues the payable ("ตั้งหนี้") under one of
   several transaction-type codes depending on document type and originating department**: RM
   (contractor payable), RD (shipping company payable), RI (goods-receipt document set), RO
   (general expenses — every department *except* Project), **RP (general expenses — Project
   department only, kept as a distinct code)**, RH (Technical department expenses), RX (factory
   expenses), BR (bill received in the accounting system), OE (misc. — employee advances, tax
   filings, social security, factory loan payments, external commissions, office rent).
5. **Fixed payment cycles** (worth preserving exactly, since a future scheduling/reminder feature
   would key off these): "รอบ Supplier" (Supplier round) — paid the 10th of every month; "รอบเงินสดย่อย"
   (petty cash round) — paid the 1st and 3rd Friday of every month; "รอบวันที่ 15" and
   "รอบวันที่ 30" — fixed-amount recurring expenses (advances, tax, social security, factory loan,
   commissions on the 15th; rent/cleaning/salaries at month-end). Document cutoff for a given
   payment round closes a few days before the round's actual pay date (e.g. close intake for
   the 3rd-Friday round on the 1st Friday).
6. Notes: e-Withholding Tax (Revenue Department online system) is used for some customers instead
   of physical withholding certificates; documents from any expense that's already been paid out of
   pocket by an employee get reimbursed via the OE flow; every document must carry a Job number and
   payer name written on it before entering the system.

## Data-model implications (not decided, just observations from the flow)

- **Job/installment as the real unit of billing** — not the whole Scope of Work at once.
  `ScopeOfWork` already has a payment-schedule/installment concept (see
  [ScopeOfWork.md](./ScopeOfWork.md)) that Delivery Order already reads per-installment
  (`deriveInstallmentsFromScope()`) — an Invoice/Billing Note module would very plausibly need to
  hang off the *same* per-installment structure, not duplicate it.
- **The "ใบส่งมอบงาน per installment, signed by customer, triggers next billing" gate** is a real
  workflow rule the software should probably enforce or at least surface, not just a paper-process
  convention — worth deciding whether the Accounting module blocks creating an installment's
  Invoice/Billing Note until that installment's Job Delivery Note exists and is marked
  customer-signed.
- **Numbering series matter and are already named**: AR/IV (tax invoice, by installment stage),
  BI (billing note), RE (receipt) on the AR side; RR/RM/RD/RI/RO/RP/RH/RX/BR/OE/AE-ish on the AP
  side. If this ERP's Accounting module ever needs to stay consistent with the existing "Express"
  accounting software's own numbering (unconfirmed whether that's a goal), these codes are the
  ground truth for what each transaction type is actually called internally.
- **Retention money, withholding tax, and bank-guarantee tracking** are real, separately-tracked
  follow-up items on the AR side — not just line items on an invoice, but their own
  needs-follow-up-until-resolved state (similar in shape to Scope of Work's existing "PO Chasing"
  follow-up pattern, see [ScopeOfWork.md](./ScopeOfWork.md) "PO Chasing").

## Open questions (for the accounting department, before any real scoping)

- Is ใบรับเงินมัดจำ a genuinely separate document from ใบเสร็จรับเงิน, or the same receipt concept
  applied specifically to a deposit/down-payment?
- Dot-matrix printer make/model, and whether it's already on hand or still being procured.
- Exact NCR form dimensions (continuous-feed width, likely ~9.5") and a measurement of each field's
  position on a real blank form, for the print-calibration phase.
- Should this module's numbering/data stay consistent with (or eventually integrate with) the
  existing "Express" accounting software, or is it meant to be fully independent record-keeping
  inside this ERP?
- Exact trigger conditions per document (does an Invoice/Billing Note require its installment's Job
  Delivery Note to exist first, as the paper process implies?).

## Coordination with the parallel "Project department" workstream

See the coordination-risk entry in [`../TODO.md`](../TODO.md) High Priority and the callout at the
top of [`../CLAUDE.md`](../CLAUDE.md). The Flow spreadsheet confirms this is a real, not
hypothetical, dependency: the Project department's **ใบส่งมอบงาน (Job/Work Delivery Note)** — one of
the 4 document types the other developer is building — is the direct upstream trigger for each
installment's billing on the Accounting side. Whoever builds each side needs to agree on the
document's shape/ID before either side hard-codes an assumption about it.

## Source files

`reference/accounting/Flow งานบัญชี.(13.8.69).xlsx`,
`reference/accounting/เอกสารวางบิล บจก.เค.ไทย ไฮดรอลิค งวดที่ 2 60__PO_KT.pdf`,
`reference/accounting/เอกสารวางบิล บจก.วีเอสเคม งวดที่ 2.2_70__POD326101972.pdf` — originally dropped
into `public/` by the owner (which is served as public static assets in production — a real
data-exposure risk since these contain real customer billing data), **moved to `reference/` on the
owner's instruction 2026-08-17** and added to `.gitignore` (`reference/`) so they can never end up
committed/deployed by accident. This doc is the durable, safe-to-commit summary of what's in them.

## Pages / Components / APIs / Permissions / Database Tables / Current Features

None exist yet — planning notes only, see Status above.

## Known Issues

N/A — nothing built yet.
