import { describe, it, expect } from "vitest";
import {
  validateScopeOfWorkForPrint, validateScopeOfWorkForFinalization, scopeOfWorkRequiredFields,
  type ScopeOfWorkValidationInput,
} from "../src/lib/validation/scopeOfWorkValidation";
import { buildDefaultChecklistGroups, MANDATORY_CHECKLIST_GROUP_KEYS } from "../src/lib/documentRequirements";
import { normalizeStringList, scopePoNumbers, scopeQuotationNumbers } from "../src/lib/scopeOfWork";

/** A fully-filled, genuinely valid input — each test then breaks exactly one thing. Mandatory
 * checklist groups get their FIRST option checked (none of the first options is an "อื่น ๆ"-style
 * option that would additionally require a note). */
function validInput(): ScopeOfWorkValidationInput & { status: "Draft" | "PendingApproval" | "Final" } {
  const checklistGroups = buildDefaultChecklistGroups("").map((g) => {
    if (!(MANDATORY_CHECKLIST_GROUP_KEYS as readonly string[]).includes(g.key)) return g;
    return { ...g, options: g.options.map((o, i) => ({ ...o, checked: i === 0 })) };
  });
  return {
    status: "Draft",
    scopeNumber: "PQ-TEST-0001",
    customerSnapshot: {
      companyName: "บริษัท ทดสอบ จำกัด", contactName: "คุณสมชาย", address: "1 ถ.ทดสอบ",
      taxId: "", phone: "020000000", email: "", projectName: "",
    },
    issueDate: "2026-07-29",
    deliveryDate: "2026-08-15",
    drawingCode: "DW-01",
    secondaryCode: "",
    customerPoNumber: "", additionalPoNumbers: [], additionalQuotationNumbers: [],
    deliveryLocation: "โรงงานลูกค้า",
    shippingContact: "คุณรับของ", shippingPhone: "0810000000",
    billingContact: "คุณวางบิล", billingPhone: "0820000000",
    checklistGroups,
    items: [{
      id: "i1", name: "FRP Lining", quantity: 10, unit: "ตร.ม.", remark: "",
      specifications: [{ id: "s1", text: "ความหนา 3 มม." }],
    }],
    paymentConditions: { installments: [], description: "40% Down Payment / 60% After Job Complete", notes: "" },
    remarks: "",
    seller: { name: "พนักงานขาย", userId: "", date: "" },
    approver: { name: "", userId: "", date: "" },
  };
}

describe("Scope of Work required-field validation", () => {
  it("the fully-filled baseline passes print validation while Draft", () => {
    const result = validateScopeOfWorkForPrint(validInput());
    expect(result.fieldErrors).toEqual({});
    expect(result.groupErrors).toEqual({});
    expect(result.valid).toBe(true);
  });

  it("scopeNumber is required (manual-ONLY numbering, 2026-07-29)", () => {
    expect(scopeOfWorkRequiredFields.scopeNumber?.required).toBe(true);
    const result = validateScopeOfWorkForPrint({ ...validInput(), scopeNumber: "   " });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.scopeNumber).toBeTruthy();
  });

  it("secondaryCode is optional (legacy reference field since 2026-07-29)", () => {
    expect(scopeOfWorkRequiredFields.secondaryCode?.required).toBe(false);
    const result = validateScopeOfWorkForPrint({ ...validInput(), secondaryCode: "" });
    expect(result.fieldErrors.secondaryCode).toBeUndefined();
  });

  it("finalize requires the approver's name; print of a Draft doesn't", () => {
    const input = validInput();
    expect(validateScopeOfWorkForPrint(input).valid).toBe(true);
    const finalize = validateScopeOfWorkForFinalization(input);
    expect(finalize.valid).toBe(false);
    expect(finalize.fieldErrors["approver.name"]).toBeTruthy();
    const withApprover = validateScopeOfWorkForFinalization({ ...input, approver: { name: "ผู้อนุมัติ", userId: "", date: "" } });
    expect(withApprover.valid).toBe(true);
  });

  it("a Final record's print validation DOES require the approver", () => {
    const result = validateScopeOfWorkForPrint({ ...validInput(), status: "Final" });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors["approver.name"]).toBeTruthy();
  });

  it("a malformed date fails even though the field is non-blank", () => {
    const result = validateScopeOfWorkForPrint({ ...validInput(), deliveryDate: "2026-13-99" });
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.deliveryDate).toBeTruthy();
  });

  it("payment installments, when present, must each have a pct and sum to exactly 100", () => {
    const base = validInput();
    const bad = validateScopeOfWorkForPrint({
      ...base,
      paymentConditions: {
        ...base.paymentConditions,
        installments: [
          { id: "p1", pct: 40, label: "Down Payment", paymentType: "Cash", days: null },
          { id: "p2", pct: 70, label: "After Job Complete", paymentType: "Credit", days: 30 },
        ],
      },
    });
    expect(bad.valid).toBe(false);
    expect(bad.fieldErrors["paymentConditions.percentTotal"]).toBeTruthy();

    const missingPct = validateScopeOfWorkForPrint({
      ...base,
      paymentConditions: {
        ...base.paymentConditions,
        installments: [{ id: "p1", pct: null, label: "Down Payment", paymentType: "Cash", days: null }],
      },
    });
    expect(missingPct.valid).toBe(false);

    const good = validateScopeOfWorkForPrint({
      ...base,
      paymentConditions: {
        ...base.paymentConditions,
        installments: [
          { id: "p1", pct: 40, label: "Down Payment", paymentType: "Cash", days: null },
          { id: "p2", pct: 60, label: "After Job Complete", paymentType: "Credit", days: 30 },
        ],
      },
    });
    expect(good.valid).toBe(true);
  });

  it("an unchecked mandatory checklist group blocks the document", () => {
    const base = validInput();
    const uncheckedSafety = {
      ...base,
      checklistGroups: base.checklistGroups.map((g) =>
        g.key === "safety" ? { ...g, options: g.options.map((o) => ({ ...o, checked: false })) } : g,
      ),
    };
    const result = validateScopeOfWorkForPrint(uncheckedSafety);
    expect(result.valid).toBe(false);
    expect(Object.keys(result.groupErrors).length).toBeGreaterThan(0);
  });

  it("items must exist and each needs name/unit/positive quantity/at least one spec line", () => {
    const base = validInput();
    const noItems = validateScopeOfWorkForPrint({ ...base, items: [] });
    expect(noItems.valid).toBe(false);
    expect(noItems.fieldErrors.items).toBeTruthy();

    const noSpec = validateScopeOfWorkForPrint({
      ...base,
      items: [{ id: "i1", name: "งาน", quantity: 1, unit: "งาน", remark: "", specifications: [] }],
    });
    expect(noSpec.valid).toBe(false);
    expect(noSpec.fieldErrors["items.i1"]).toBeTruthy();

    const zeroQty = validateScopeOfWorkForPrint({
      ...base,
      items: [{ id: "i2", name: "งาน", quantity: 0, unit: "งาน", remark: "", specifications: [{ id: "s", text: "x" }] }],
    });
    expect(zeroQty.valid).toBe(false);
    expect(zeroQty.fieldErrors["items.i2"]).toBeTruthy();
  });
});

/**
 * เลขใบเสนอราคา/เลข PO หลายเลขต่อหนึ่ง Scope (2026-08-31)
 *
 * เจ้าของเจองานจริงที่ใบเดียวกินสองใบเสนอราคาและสอง PO · เก็บเป็น "เลขหลัก + รายการเพิ่มเติม"
 * ไม่ใช่อาร์เรย์เดียว — เหตุผลอยู่ในคอมเมนต์ของ `scopePoNumbers()` เทสต์นี้ล็อกพฤติกรรมสองอย่างที่
 * ส่วนอื่นของระบบพึ่งพา: เลขหลักมาก่อนเสมอ และเอกสารเก่าที่ไม่มีฟิลด์ใหม่อ่านออกมาเป็น `[]`
 */
describe("เลขใบเสนอราคา/เลข PO หลายเลข", () => {
  it("normalizeStringList: ของที่ไม่ใช่อาร์เรย์ (เอกสารก่อน 2026-08-31 ไม่มีฟิลด์นี้เลย) คืน []", () => {
    expect(normalizeStringList(undefined)).toEqual([]);
    expect(normalizeStringList(null)).toEqual([]);
    expect(normalizeStringList("PO-1")).toEqual([]);
    expect(normalizeStringList({ 0: "PO-1" })).toEqual([]);
  });

  it("normalizeStringList: ตัดค่าว่าง/ช่องว่างหัวท้าย และทิ้งของที่ไม่ใช่ข้อความ", () => {
    expect(normalizeStringList([" PO-1 ", "", "   ", "PO-2", 42, null])).toEqual(["PO-1", "PO-2"]);
  });

  it("scopePoNumbers: เลขหลักมาก่อน แล้วตามด้วยเลขที่พิมพ์เพิ่ม ตามลำดับเดิม", () => {
    expect(scopePoNumbers({ customerPoNumber: "PO-A", additionalPoNumbers: ["PO-B", "PO-C"] }))
      .toEqual(["PO-A", "PO-B", "PO-C"]);
  });

  it("scopePoNumbers: ใบที่ยังไม่มีเลขเลยคืนรายการว่าง — เป็นตัวตัดสินของปุ่มทวง PO", () => {
    expect(scopePoNumbers({ customerPoNumber: "", additionalPoNumbers: [] })).toEqual([]);
    expect(scopePoNumbers({ customerPoNumber: "   " })).toEqual([]);
  });

  it("scopePoNumbers/scopeQuotationNumbers: เอกสารเก่าที่ไม่มีฟิลด์ใหม่ยังอ่านได้ ไม่ throw", () => {
    expect(scopePoNumbers({ customerPoNumber: "PO-A" })).toEqual(["PO-A"]);
    expect(scopeQuotationNumbers({ quotationNumber: "QT-1" })).toEqual(["QT-1"]);
  });

  it("scopeQuotationNumbers: ใบต้นทางมาก่อนเสมอ", () => {
    expect(scopeQuotationNumbers({ quotationNumber: "QT-1", additionalQuotationNumbers: ["QT-2"] }))
      .toEqual(["QT-1", "QT-2"]);
  });
});
