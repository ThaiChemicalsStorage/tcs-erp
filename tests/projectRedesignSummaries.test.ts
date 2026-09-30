import { describe, expect, it } from "vitest";
import { projectStatusMoves, summarizeProjectItems } from "../src/pages/project/projectSummary";
import { summarizeRequisitionLines } from "../src/pages/materialRequisition/mrSummary";
import type { ProjectItem } from "../src/lib/project";

/**
 * ตัวเลขใหม่ของดีไซน์ 2026-09-30 ฝั่งโครงการ/ใบเบิก คิดจากข้อมูลเดิมล้วน ๆ — ถ้าสูตรพลาด การ์ดจะโชว์ตัวเลขผิด
 * เงียบ ๆ โดยไม่มี error: ช่องแบ่งสาขาการจัดหา + "จัดหาแล้ว x / y" ของโครงการ, การ์ดนับรายการของใบเบิก,
 * และปุ่มเปลี่ยนสถานะโครงการที่มาแทน dropdown (ต้องยังไปได้ทุกสถานะเหมือน dropdown เดิม)
 */

type ItemPart = Pick<ProjectItem, "sourcingMethod" | "itemStatus" | "materialRequisitionId" | "jobOrderId" | "purchaseRequestId">;
const item = (p: Partial<ItemPart>): ItemPart => ({
  sourcingMethod: "unassigned", itemStatus: "pending", materialRequisitionId: "", jobOrderId: "", purchaseRequestId: "", ...p,
});

describe("summarizeProjectItems", () => {
  it("counts sourcing branches, statuses, progress and distinct sub-documents", () => {
    const s = summarizeProjectItems([
      item({}),
      item({}),
      item({ sourcingMethod: "requisition", itemStatus: "documentCreated", materialRequisitionId: "MR-1" }),
      item({ sourcingMethod: "requisition", itemStatus: "documentCreated", materialRequisitionId: "MR-1" }),
      item({ sourcingMethod: "jobOrder", itemStatus: "fulfilled", jobOrderId: "JO-1" }),
      item({ sourcingMethod: "purchaseRequest", itemStatus: "cancelled", purchaseRequestId: "PR-1" }),
    ]);
    expect(s.bySourcing).toEqual({ unassigned: 2, requisition: 2, jobOrder: 1, purchaseRequest: 1 });
    expect(s.byStatus).toEqual({ pending: 2, documentCreated: 2, fulfilled: 1, cancelled: 1 });
    // ยกเลิกไม่นับเป็นงานที่ต้องจัดหา
    expect(s.total).toBe(5);
    expect(s.progress).toBe(20);
    // ใบเดียวผูกหลายรายการ นับครั้งเดียว
    expect(s.subDocumentCount).toBe(3);
  });

  it("handles an empty project without dividing by zero", () => {
    expect(summarizeProjectItems([])).toMatchObject({ total: 0, progress: 0, subDocumentCount: 0 });
  });
});

describe("projectStatusMoves", () => {
  it("offers the next status as primary and every other status in the menu", () => {
    expect(projectStatusMoves("Planning")).toEqual({ next: "InProgress", others: ["Completed"] });
    expect(projectStatusMoves("InProgress")).toEqual({ next: "Completed", others: ["Planning"] });
    expect(projectStatusMoves("Completed")).toEqual({ next: null, others: ["Planning", "InProgress"] });
  });
});

describe("summarizeRequisitionLines", () => {
  const line = (productId: string, plannedQty: number | null, w1: number | null = null, w2: number | null = null) =>
    ({ productId, plannedQty, withdrawal1Qty: w1, withdrawal2Qty: w2 });

  it("splits lines into fully issued / outstanding / short on stock", () => {
    const s = summarizeRequisitionLines(
      [
        line("a", 10, 10),        // จ่ายครบ
        line("b", 10, 4),         // ค้าง 6 · คลังมี 10 → พอ
        line("c", 10, 4, 1),      // ค้าง 5 · คลังมี 2 → ไม่พอ
        line("d", 3),             // ค้าง 3 · ไม่รู้ยอดคลัง → ไม่นับว่าไม่พอ
        line("e", null),          // ไม่ได้ขอ ไม่ได้จ่าย
      ],
      { a: 0, b: 10, c: 2 },
    );
    expect(s).toEqual({ total: 5, fullyIssued: 1, outstanding: 3, short: 1 });
  });

  it("compares stock with what is still outstanding, not with the full request", () => {
    // ขอ 10 จ่ายไปแล้ว 8 เหลือ 2 · คลังเหลือ 2 → พอ (ส่วนที่จ่ายไปแล้วออกจากคลังไปแล้ว)
    expect(summarizeRequisitionLines([line("x", 10, 8)], { x: 2 }).short).toBe(0);
  });
});
