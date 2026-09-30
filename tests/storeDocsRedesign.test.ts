import { describe, expect, it } from "vitest";
import {
  countReturningLines, storeDocTabCounts, storeReceiptStepIndex, toStoreDocRows,
} from "../src/pages/storeDocuments/storeDocsFormat";
import type { MaterialRequisitionSummary } from "../src/lib/materialRequisition";
import type { StoreReceiptSummary } from "../src/lib/storeReceipt";

/**
 * หน้า "ใบเบิกและใบคืนวัสดุ (สโตร์)" ดีไซน์ใหม่ 2026-09-30 — แท็บพร้อมจำนวน คอลัมน์อ้างอิงสองบรรทัด แถบ 4 ขั้นของใบรับคืน
 * (ขั้นที่ 4 "รับเข้าคลังแล้ว") และ "คืนครั้งนี้ x จาก y รายการ" คิดจากข้อมูลเดิมล้วน ๆ — ถ้าสูตรพลาด หน้าจอโชว์ผิดเงียบ ๆ
 */

const issue = (p: Partial<MaterialRequisitionSummary>): MaterialRequisitionSummary => ({
  id: "PP-202609-0001", documentNumber: "", chargeDepartmentName: "", chargeTeamName: "", chargeWorkTypeName: "",
  hasOutstanding: false, projectId: "", scopeOfWorkId: "", jobCode: "", status: "Draft", updatedAt: "2026-09-01T00:00:00.000Z", ...p,
});
const receipt = (p: Partial<StoreReceiptSummary>): StoreReceiptSummary => ({
  id: "JP-202609-0001", documentNumber: "", receiptCode: "JP", status: "Draft", posted: false, jobCode: "", reference: "",
  sourceRequisitionNumber: "", chargeDepartmentName: "", chargeTeamName: "", updatedAt: "2026-09-01T00:00:00.000Z", ...p,
});

describe("toStoreDocRows", () => {
  it("merges issues and receipts newest first with code, refs and store flags", () => {
    const rows = toStoreDocRows(
      [
        issue({ id: "PP-202609-0042", documentNumber: "MR-202609-0042", issueCode: "PP", sourceRequisitionNumber: "MR-202609-0042", jobCode: "PQ1", status: "Final", hasOutstanding: true, updatedAt: "2026-09-29T00:00:00.000Z" }),
        // ใบเก่าที่ไม่มี issueCode — ใช้ส่วนหน้าของเลขรัน
        issue({ id: "PX-202609-0002", updatedAt: "2026-09-12T00:00:00.000Z" }),
      ],
      [
        receipt({ id: "FG-202609-0006", receiptCode: "FG", reference: "SC-1", status: "Final", posted: false, chargeDepartmentName: "ผลิต", chargeTeamName: "ไลน์ 2", updatedAt: "2026-09-27T00:00:00.000Z" }),
        receipt({ id: "JD-202609-0031", receiptCode: "JD", status: "Final", posted: true, updatedAt: "2026-09-25T00:00:00.000Z" }),
      ],
    );
    expect(rows.map((r) => r.id)).toEqual(["PP-202609-0042", "FG-202609-0006", "JD-202609-0031", "PX-202609-0002"]);
    expect(rows[0]).toMatchObject({ kind: "issue", number: "MR-202609-0042", code: "PP", refs: ["MR-202609-0042", "PQ1"], pendingStore: true, posted: false });
    expect(rows[1]).toMatchObject({ kind: "receipt", code: "FG", refs: ["SC-1"], chargeDepartment: "ผลิต", chargeTeam: "ไลน์ 2", pendingStore: true, posted: false });
    expect(rows[2]).toMatchObject({ pendingStore: false, posted: true });
    expect(rows[3]).toMatchObject({ code: "PX", number: "PX-202609-0002", refs: [] });
  });

  it("counts every tab, incoming counts the department requisitions waiting", () => {
    const rows = toStoreDocRows([issue({}), issue({ id: "PD-202609-0001" })], [receipt({})]);
    expect(storeDocTabCounts(rows, 5)).toEqual({ all: 3, issue: 2, receipt: 1, incoming: 5 });
  });
});

describe("storeReceiptStepIndex", () => {
  it("walks the four steps and finishes only once posted", () => {
    expect(storeReceiptStepIndex("Draft", false)).toBe(0);
    expect(storeReceiptStepIndex("PendingApproval", false)).toBe(1);
    expect(storeReceiptStepIndex("Final", false)).toBe(2);
    expect(storeReceiptStepIndex("Final", true)).toBe(4);
  });
});

describe("countReturningLines", () => {
  it("counts lines with a positive return quantity out of all lines", () => {
    expect(countReturningLines([{ qty: 2 }, { qty: 0 }, { qty: null }, { qty: 1.5 }])).toEqual({ returning: 2, total: 4 });
    expect(countReturningLines([])).toEqual({ returning: 0, total: 0 });
  });
});
