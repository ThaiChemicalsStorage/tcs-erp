import { describe, expect, it } from "vitest";
import type { DepartmentDashboardResponse } from "../src/lib/departmentDashboard";
import { buildDepartmentDashboardSheets } from "../src/lib/departmentDashboardExport";

// ส่งออกแดชบอร์ดแท็บภาพรวม/แผนก (Tuhmo #40, 2026-10-06)
function base(view: DepartmentDashboardResponse["view"]): DepartmentDashboardResponse {
  return { view, filters: { from: "2026-09-01", to: "2026-09-30" }, today: "2026-10-06", blocks: {}, pendingApprovals: null, activityTimeline: null, attention: null, failed: [] };
}

describe("buildDepartmentDashboardSheets", () => {
  it("overview: summary of every block present + pending + attention + sales/AR headline", () => {
    const data = base("overview");
    data.blocks = {
      purchasing: { scope: "all", detail: null, summary: { prAwaitingPo: 3, poPending: 1, poAwaitingReceipt: null, poOverdue: 2 } },
      production: { scope: "all", detail: null, summary: { pending: 4, dueSoon: 1, pastDue: 0, mrAwaitingIssue: null } },
    };
    data.pendingApprovals = [{ kind: "purchaseOrder", count: 2 }];
    data.attention = [{ dept: "purchasing", kind: "poOverdue", id: "x", docNumber: "PO-1", party: "ผู้ขาย ก", date: "2026-09-20" }];
    const sheets = buildDepartmentDashboardSheets(data, "ภาพรวม", {
      sales: { closedSales: 1000, wonDeals: 2, activeQuotations: 3, activeQuotationsValue: 500, vatLabel: "ก่อน VAT" },
      arOutstanding: { net: 700, count: 1 },
    });
    expect(sheets.map((s) => s.sheetName)).toEqual(["สรุป", "รออนุมัติ", "ต้องจัดการก่อน"]);
    const labels = sheets[0].rows.map((r) => r[0]);
    expect(labels[0]).toContain("ขาย — ยอดขายที่ปิดได้");
    expect(labels).toContain("จัดซื้อ — ใบสั่งซื้อเลยกำหนดรับของ");
    expect(labels).toContain("บัญชี — ลูกหนี้คงค้าง (บาท)");
    // null = ไม่มีสิทธิ์ดู → ไม่ส่งออก (ไม่ใช่ศูนย์)
    expect(labels).not.toContain("จัดซื้อ — ใบสั่งซื้อรอรับของ");
    expect(labels).not.toContain("ผลิต — ใบเบิกรอจ่ายของ");
    expect(sheets[2].rows[0]).toEqual(["จัดซื้อ", "ใบสั่งซื้อเลยกำหนดรับของ", "PO-1", "ผู้ขาย ก", "2026-09-20"]);
  });

  it("department tab: detail sheets, Excel-safe sheet names, money totals", () => {
    const data = base("inventory");
    data.blocks = {
      inventory: {
        scope: "all",
        summary: { stockValue: 1500, lowStock: 1, mrAwaitingIssue: 0, openReceivingReports: 2 },
        detail: {
          outstandingReceiveValue: 0, prAwaitingStore: 0, pendingProductRequests: 0, outOfStock: 0, mrAwaitingIssueByDepartment: null,
          movementsByMonth: [{ month: "2026-09", receive: 100, deduct: 40 }],
          recentMovements: [{ id: "m1", productCode: "P1", productName: "น็อต", kind: "receive", delta: 10, createdAt: "2026-09-05T03:00:00Z" }],
          lowStockItems: [{ id: "p", code: "P2", name: "แหวน", unit: "ตัว", stockQty: 1, reorderPoint: 5 }],
          stockValueByCategory: [{ categoryId: "a", categoryName: "อะไหล่", value: 1000 }, { categoryId: "b", categoryName: "เคมี", value: 500 }],
        },
      },
    };
    const sheets = buildDepartmentDashboardSheets(data, "คลังสินค้า");
    for (const s of sheets) {
      expect(s.sheetName.length, s.sheetName).toBeLessThanOrEqual(31);
      expect(s.sheetName, s.sheetName).not.toMatch(/[:\\/?*[\]]/);
      for (const r of s.rows) expect(r.length, s.title).toBe(s.columns.length);
    }
    const byCat = sheets.find((s) => s.sheetName === "คลัง ตามหมวด");
    expect(byCat?.totals).toEqual(["รวม", 1500]);
    expect(sheets.find((s) => s.sheetName === "คลัง ล่าสุด")?.rows[0][3]).toBe("รับเข้า");
  });
});
