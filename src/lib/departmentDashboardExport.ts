import type { ExportCell, ExportSheet } from "./tableExport.js";
import type {
  DepartmentDashboardResponse, DueItem, MonthCount, PurchaseRequestDept, StatusCounts,
} from "./departmentDashboard.js";
import type { DepartmentKey } from "./dashboardTabs.js";
import type { PendingApprovalKind } from "./pendingApprovals.js";
import { STOCK_MOVEMENT_KIND_LABELS } from "./stock.js";

/**
 * แดชบอร์ดแท็บภาพรวมและแท็บแผนก → ชีตสำหรับส่งออก Excel/PDF (2026-10-06, Tuhmo #40 — เจ้าของ: "แดชบอร์ดต้องส่งออกได้ทุกแผนก")
 *
 * ใช้ข้อมูลชุดเดียวกับที่จอแสดง (`GET /api/dashboard/departments` ตามช่วงวันที่ที่เลือก) จึงตรงกับจอเสมอ ·
 * ค่า `null` (ไม่มีสิทธิ์ดูเอกสารชนิดนั้น) ไม่ถูกส่งออก — เหมือนที่จอซ่อน ไม่ใช่แสดงเป็นศูนย์ ·
 * ไฟล์ส่งออกเป็นเอกสาร จึงเป็นภาษาไทยเสมอ (เหมือนใบพิมพ์) · แท็บขายใช้รายงานเดิม (`xlsxExport.ts`) · แท็บบัญชียังไม่ทำ
 */

const DEPT_LABEL: Record<DepartmentKey, string> = {
  service: "บริการ", purchasing: "จัดซื้อ", inventory: "คลังสินค้า", production: "ผลิต", project: "โครงการ", bd: "BD (Cost Control)",
};
const PENDING_LABEL: Record<PendingApprovalKind, string> = {
  quotation: "ใบเสนอราคา", scopeOfWork: "Scope of Work", deliveryOrder: "ใบส่งมอบสินค้า", materialRequisition: "ใบเบิก",
  storeReceipt: "ใบรับคืน/รับเข้าคลัง", jobOrder: "ใบสั่งงาน", purchaseRequest: "ใบขอซื้อ", purchaseOrder: "ใบสั่งซื้อ",
  productionOrder: "ใบสั่งผลิต", costControl: "Cost Control", productRequest: "คำขอเพิ่มสินค้า",
};
const ATTENTION_LABEL = { poOverdue: "ใบสั่งซื้อเลยกำหนดรับของ", productionDue: "ใบสั่งผลิตใกล้/เลยกำหนด", jobOrderDue: "ใบสั่งงานใกล้/เลยกำหนด", serviceApproval: "รายงานบริการรอลูกค้าอนุมัติ" } as const;
const PR_DEPT_LABEL: Record<PurchaseRequestDept, string> = { project: "โครงการ", production: "ผลิต", general: "ทั่วไป" };
const FOLLOW_UP_LABEL = { rejected: "ลูกค้าไม่อนุมัติ", pending: "รอลูกค้าตอบ", staleDraft: "ร่างค้างเกิน 7 วัน" } as const;

export interface DashboardExportExtras {
  /** ตัวเลขขายที่การ์ดภาพรวมแสดง (เฉพาะผู้เห็นแท็บขาย) */
  sales?: { closedSales: number; wonDeals: number; activeQuotations: number; activeQuotationsValue: number; vatLabel: string } | null;
  /** ลูกหนี้คงค้างที่การ์ดภาพรวมแสดง (เฉพาะผู้เห็นแท็บบัญชี) */
  arOutstanding?: { net: number; count: number } | null;
}

type Row = ExportCell[];

function periodText(from: string, to: string): string {
  if (!from && !to) return "ทุกช่วงเวลา";
  return `${from || "…"} ถึง ${to || "…"}`;
}

function kv(rows: Row[], label: string, value: number | null | undefined, note = "") {
  if (value === null || value === undefined) return;
  rows.push([label, value, note]);
}

function statusRows(rows: Row[], prefix: string, s: StatusCounts | null | undefined) {
  if (!s) return;
  kv(rows, `${prefix} — ร่าง`, s.draft, "ณ ปัจจุบัน");
  kv(rows, `${prefix} — รออนุมัติ`, s.pending, "ณ ปัจจุบัน");
  kv(rows, `${prefix} — อนุมัติแล้ว`, s.final, "ณ ปัจจุบัน");
}

function monthSheet(name: string, title: string, meta: string[], data: MonthCount[] | null | undefined): ExportSheet | null {
  if (!data) return null;
  return { sheetName: name, title, meta, columns: [{ header: "เดือน" }, { header: "จำนวน (ใบ)", kind: "qty" }], rows: data.map((m) => [m.month, m.count]) };
}

function dueSheet(name: string, title: string, meta: string[], items: DueItem[] | null | undefined, dateHeader: string): ExportSheet | null {
  if (!items) return null;
  return {
    sheetName: name, title, meta,
    columns: [{ header: "เลขที่" }, { header: "คู่ค้า / ลูกค้า" }, { header: dateHeader, kind: "date" }],
    rows: items.map((d) => [d.docNumber || d.id, d.party, d.date]),
  };
}

/** สรุปตัวเลขหลักของทุกแผนกที่ได้มา — ใช้ทั้งแท็บภาพรวมและเป็นชีตแรกของแท็บแผนก */
function summaryRows(data: DepartmentDashboardResponse): Row[] {
  const rows: Row[] = [];
  const b = data.blocks;
  if (b.service) {
    const s = b.service.summary;
    kv(rows, "บริการ — รายงานร่าง", s.draft, "ณ ปัจจุบัน");
    kv(rows, "บริการ — ปิดงานเดือนนี้", s.completedThisMonth, "เดือนปัจจุบัน");
    kv(rows, "บริการ — รอลูกค้าอนุมัติ", s.approvalPending, "ณ ปัจจุบัน");
  }
  if (b.purchasing) {
    const s = b.purchasing.summary;
    kv(rows, "จัดซื้อ — ใบขอซื้อรอออกใบสั่งซื้อ", s.prAwaitingPo, "ณ ปัจจุบัน");
    kv(rows, "จัดซื้อ — ใบสั่งซื้อรออนุมัติ", s.poPending, "ณ ปัจจุบัน");
    kv(rows, "จัดซื้อ — ใบสั่งซื้อรอรับของ", s.poAwaitingReceipt, "ณ ปัจจุบัน");
    kv(rows, "จัดซื้อ — ใบสั่งซื้อเลยกำหนดรับของ", s.poOverdue, "ณ ปัจจุบัน");
  }
  if (b.inventory) {
    const s = b.inventory.summary;
    kv(rows, "คลังสินค้า — มูลค่าสต๊อก (บาท)", s.stockValue, "ณ ปัจจุบัน");
    kv(rows, "คลังสินค้า — สินค้าถึงจุดเตือน", s.lowStock, "ณ ปัจจุบัน");
    kv(rows, "คลังสินค้า — ใบเบิกรอจ่ายของ", s.mrAwaitingIssue, "ณ ปัจจุบัน");
    kv(rows, "คลังสินค้า — ใบรับสินค้าที่ยังเปิดอยู่", s.openReceivingReports, "ณ ปัจจุบัน");
  }
  if (b.production) {
    const s = b.production.summary;
    kv(rows, "ผลิต — ใบสั่งผลิตรออนุมัติ", s.pending, "ณ ปัจจุบัน");
    kv(rows, "ผลิต — ใกล้กำหนดเสร็จ (7 วัน)", s.dueSoon, "ณ ปัจจุบัน");
    kv(rows, "ผลิต — เลยกำหนดเสร็จ", s.pastDue, "ณ ปัจจุบัน");
    kv(rows, "ผลิต — ใบเบิกรอจ่ายของ", s.mrAwaitingIssue, "ณ ปัจจุบัน");
  }
  if (b.project) {
    const s = b.project.summary;
    kv(rows, "โครงการ — ใบสั่งงานรออนุมัติ", s.jobOrderPending, "ณ ปัจจุบัน");
    kv(rows, "โครงการ — ใบสั่งงานใกล้กำหนด (7 วัน)", s.jobOrderDueSoon, "ณ ปัจจุบัน");
    kv(rows, "โครงการ — ใบสั่งงานเลยกำหนด", s.jobOrderPastDue, "ณ ปัจจุบัน");
    kv(rows, "โครงการ — ใบเบิกรอจ่ายของ", s.mrAwaitingIssue, "ณ ปัจจุบัน");
    kv(rows, "โครงการ — ใบขอซื้อที่ยังไม่ได้ของ", s.prOpen, "ณ ปัจจุบัน");
  }
  if (b.bd) {
    const s = b.bd.summary;
    statusRows(rows, "BD Cost Control", s);
    kv(rows, "BD Cost Control — สร้างในช่วงที่เลือก", s.createdInPeriod, "ช่วงที่เลือก");
  }
  return rows;
}

const SUMMARY_COLUMNS = [{ header: "ตัวชี้วัด" }, { header: "ค่า", kind: "qty" as const }, { header: "ขอบเขตของตัวเลข" }];

/** ชีตทั้งหมดของแท็บที่เปิดอยู่ — แท็บภาพรวม: สรุปทุกแผนก + รออนุมัติ + ต้องจัดการก่อน · แท็บแผนก: สรุป + รายละเอียดทุกบล็อก */
export function buildDepartmentDashboardSheets(data: DepartmentDashboardResponse, tabLabel: string, extras: DashboardExportExtras = {}): ExportSheet[] {
  const meta = [`แดชบอร์ด · ${tabLabel}`, `ช่วงวันที่: ${periodText(data.filters.from, data.filters.to)} · ข้อมูล ณ ${data.today}`];
  const sheets: (ExportSheet | null)[] = [];

  const summary = summaryRows(data);
  if (data.view === "overview") {
    if (extras.sales) {
      summary.unshift(
        [`ขาย — ยอดขายที่ปิดได้ (${extras.sales.vatLabel})`, extras.sales.closedSales, "ช่วงที่เลือก"],
        ["ขาย — จำนวนดีลที่ปิดได้", extras.sales.wonDeals, "ช่วงที่เลือก"],
        ["ขาย — ใบเสนอราคาที่ยังเปิดอยู่", extras.sales.activeQuotations, "ช่วงที่เลือก"],
        [`ขาย — มูลค่าใบเสนอราคาที่ยังเปิดอยู่ (${extras.sales.vatLabel})`, extras.sales.activeQuotationsValue, "ช่วงที่เลือก"],
      );
    }
    if (extras.arOutstanding) {
      summary.push(["บัญชี — ลูกหนี้คงค้าง (บาท)", extras.arOutstanding.net, "ณ ปัจจุบัน"], ["บัญชี — จำนวนใบคงค้าง", extras.arOutstanding.count, "ณ ปัจจุบัน"]);
    }
  }
  sheets.push({ sheetName: "สรุป", title: `สรุปแดชบอร์ด — ${tabLabel}`, meta, columns: SUMMARY_COLUMNS, rows: summary });

  if (data.pendingApprovals) {
    sheets.push({
      sheetName: "รออนุมัติ", title: "เอกสารที่รอคุณอนุมัติ", meta,
      columns: [{ header: "ชนิดเอกสาร" }, { header: "จำนวน (ใบ)", kind: "qty" }],
      rows: data.pendingApprovals.map((p) => [PENDING_LABEL[p.kind] ?? p.kind, p.count]),
    });
  }
  if (data.attention) {
    sheets.push({
      sheetName: "ต้องจัดการก่อน", title: "รายการที่ต้องจัดการก่อน", meta,
      columns: [{ header: "แผนก" }, { header: "เรื่อง" }, { header: "เลขที่" }, { header: "คู่ค้า / ลูกค้า" }, { header: "วันที่", kind: "date" }],
      rows: data.attention.map((a) => [DEPT_LABEL[a.dept], ATTENTION_LABEL[a.kind], a.docNumber || a.id, a.party, a.date]),
    });
  }

  const b = data.blocks;
  const sv = b.service?.detail;
  if (sv) {
    sheets.push({
      sheetName: "บริการ 12 เดือน", title: "รายงานบริการ 12 เดือนล่าสุด (ตามวันที่ตรวจ)", meta,
      columns: [{ header: "เดือน" }, { header: "ตรวจ (ใบ)", kind: "qty" }, { header: "ปิดงานแล้ว (ใบ)", kind: "qty" }],
      rows: sv.inspectedByMonth.map((m) => [m.month, m.inspected, m.completed]),
    });
    sheets.push({
      sheetName: "บริการ ผลอนุมัติ", title: "ผลการอนุมัติของลูกค้า (รายงานที่ปิดงานในช่วงที่เลือก)", meta,
      columns: [{ header: "ผล" }, { header: "จำนวน (ใบ)", kind: "qty" }],
      rows: [["อนุมัติแล้ว", sv.approvalBreakdown.approved], ["รอลูกค้าตอบ", sv.approvalBreakdown.pending], ["ไม่อนุมัติ", sv.approvalBreakdown.rejected], ["ยังไม่ได้ส่ง", sv.approvalBreakdown.notSent]],
    });
    sheets.push(dueSheet("บริการ PM ถัดไป", "PM ครั้งถัดไปภายใน 30 วัน", meta, sv.upcomingPm, "วันนัด PM"));
    sheets.push({
      sheetName: "บริการ ต้องตามต่อ", title: "รายงานที่ต้องตามต่อ", meta,
      columns: [{ header: "รายงาน" }, { header: "ลูกค้า" }, { header: "เหตุผล" }, { header: "ค้างตั้งแต่", kind: "date" }],
      rows: sv.followUps.map((f) => [f.id, f.party, FOLLOW_UP_LABEL[f.reason], f.date]),
    });
  }

  const pu = b.purchasing?.detail;
  if (pu) {
    if (pu.poValueByMonth) {
      sheets.push({
        sheetName: "จัดซื้อ 12 เดือน", title: "ใบสั่งซื้อที่อนุมัติแล้ว 12 เดือนล่าสุด (มูลค่ารวม VAT)", meta,
        columns: [{ header: "เดือน" }, { header: "จำนวน (ใบ)", kind: "qty" }, { header: "มูลค่า (บาท)", kind: "money" }],
        rows: pu.poValueByMonth.map((m) => [m.month, m.count, m.value]),
        totals: ["รวม", pu.poValueByMonth.reduce((s, m) => s + m.count, 0), pu.poValueByMonth.reduce((s, m) => s + m.value, 0)],
      });
    }
    if (pu.topVendors) {
      sheets.push({
        sheetName: "จัดซื้อ ผู้ขาย", title: "ผู้ขายที่ยอดสั่งซื้อสูงสุด (ช่วงที่เลือก)", meta,
        columns: [{ header: "ผู้ขาย" }, { header: "จำนวน (ใบ)", kind: "qty" }, { header: "มูลค่า (บาท)", kind: "money" }],
        rows: pu.topVendors.map((v) => [v.name, v.count, v.value]),
      });
    }
    sheets.push(dueSheet("จัดซื้อ เลยกำหนด", "ใบสั่งซื้อเลยกำหนดรับของ", meta, pu.overduePurchaseOrders, "วันที่ต้องการรับของ"));
    const lt = pu.leadTime;
    if (lt) {
      sheets.push({
        sheetName: "จัดซื้อ ระยะเวลา", title: `ระยะเวลาออกใบสั่งซื้อ (วันทำการ · เป้า ปกติ ${lt.targets.normal} / ด่วน ${lt.targets.urgent} วัน)`, meta,
        columns: SUMMARY_COLUMNS,
        rows: [
          ["ออกครบในช่วงที่เลือก (ใบ)", lt.completed.count, "ช่วงที่เลือก"],
          ["เฉลี่ยทั้งหมด (วัน)", lt.completed.avgDays, "ช่วงที่เลือก"],
          ["เฉลี่ยงานด่วน (วัน)", lt.completed.avgUrgent, "ช่วงที่เลือก"],
          ["เฉลี่ยงานปกติ (วัน)", lt.completed.avgNormal, "ช่วงที่เลือก"],
          ["ทันเป้า (ใบ)", lt.completed.onTime, "ช่วงที่เลือก"],
          ["รอออกใบสั่งซื้ออยู่ (ใบ)", lt.waiting.count, "ณ ปัจจุบัน"],
          ["ในนั้นเป็นงานด่วน (ใบ)", lt.waiting.urgent, "ณ ปัจจุบัน"],
          ["ในนั้นเกินเป้าแล้ว (ใบ)", lt.waiting.over, "ณ ปัจจุบัน"],
        ].filter((r) => r[1] !== null) as Row[],
      });
      sheets.push({
        sheetName: "จัดซื้อ คิว", title: "คิวรอออกใบสั่งซื้อ (งานด่วนก่อน แล้วค้างนานสุด)", meta,
        columns: [{ header: "ใบขอซื้อ" }, { header: "ด่วน" }, { header: "ฝ่าย" }, { header: "ถึงจัดซื้อ", kind: "date" }, { header: "ผ่านมา (วันทำการ)", kind: "qty" }, { header: "เป้า (วัน)", kind: "qty" }, { header: "ต้องการใช้", kind: "date" }],
        rows: lt.queue.map((q) => [q.id, q.urgent ? "ด่วน" : "", PR_DEPT_LABEL[q.dept], q.receivedAt.slice(0, 10), q.days, q.target, q.neededByDate]),
      });
    }
  }

  const inv = b.inventory?.detail;
  if (inv) {
    if (inv.movementsByMonth) {
      sheets.push({
        sheetName: "คลัง เข้า-ออก", title: "มูลค่ารับเข้า / ตัดจ่าย 12 เดือนล่าสุด", meta,
        columns: [{ header: "เดือน" }, { header: "รับเข้า (บาท)", kind: "money" }, { header: "ตัดจ่าย (บาท)", kind: "money" }],
        rows: inv.movementsByMonth.map((m) => [m.month, m.receive, m.deduct]),
      });
    }
    if (inv.lowStockItems) {
      sheets.push({
        sheetName: "คลัง ถึงจุดเตือน", title: "สินค้าถึงจุดเตือน", meta,
        columns: [{ header: "รหัส" }, { header: "ชื่อสินค้า" }, { header: "คงเหลือ", kind: "qty" }, { header: "จุดเตือน", kind: "qty" }, { header: "หน่วย" }],
        rows: inv.lowStockItems.map((p) => [p.code, p.name, p.stockQty, p.reorderPoint, p.unit]),
      });
    }
    if (inv.stockValueByCategory) {
      sheets.push({
        sheetName: "คลัง ตามหมวด", title: "มูลค่าสต๊อกตามหมวดหมู่ (ณ ปัจจุบัน)", meta,
        columns: [{ header: "หมวดหมู่" }, { header: "มูลค่า (บาท)", kind: "money" }],
        rows: inv.stockValueByCategory.map((c) => [c.categoryName, c.value]),
        totals: ["รวม", inv.stockValueByCategory.reduce((s, c) => s + c.value, 0)],
      });
    }
    if (inv.recentMovements) {
      sheets.push({
        sheetName: "คลัง ล่าสุด", title: "ความเคลื่อนไหวสต๊อกล่าสุด (ช่วงที่เลือก)", meta,
        columns: [{ header: "วันที่", kind: "date" }, { header: "รหัส" }, { header: "สินค้า" }, { header: "รายการ" }, { header: "จำนวน", kind: "qty" }],
        rows: inv.recentMovements.map((m) => [m.createdAt.slice(0, 10), m.productCode, m.productName, STOCK_MOVEMENT_KIND_LABELS[m.kind] ?? m.kind, m.delta]),
      });
    }
  }

  const pd = b.production?.detail;
  if (pd) {
    const rows: Row[] = [];
    statusRows(rows, "ใบสั่งผลิต", pd.status);
    kv(rows, "ใบสั่งผลิต — เริ่มผลิตในช่วงที่เลือก", pd.startedInPeriod, "ช่วงที่เลือก");
    if (pd.deliveryOrder) statusRows(rows, "ใบส่งมอบสินค้า", pd.deliveryOrder);
    sheets.push({ sheetName: "ผลิต สถานะ", title: "ฝ่ายผลิต — สถานะเอกสาร", meta, columns: SUMMARY_COLUMNS, rows });
    sheets.push(monthSheet("ผลิต 12 เดือน", "ใบสั่งผลิต 12 เดือนล่าสุด (ตามวันเริ่มผลิต)", meta, pd.startedByMonth));
    sheets.push(dueSheet("ผลิต กำหนดเสร็จ", "ใบสั่งผลิตใกล้ / เลยกำหนดเสร็จ", meta, pd.dueList, "กำหนดเสร็จ"));
  }

  const pj = b.project?.detail;
  if (pj) {
    const rows: Row[] = [];
    statusRows(rows, "ใบสั่งงาน", pj.jobOrderStatus);
    kv(rows, "ใบสั่งงาน — เริ่มงานในช่วงที่เลือก", pj.jobOrderStartedInPeriod, "ช่วงที่เลือก");
    if (pj.deliveryOrder) statusRows(rows, "ใบส่งมอบสินค้า", pj.deliveryOrder);
    sheets.push({ sheetName: "โครงการ สถานะ", title: "ฝ่ายโครงการ — สถานะเอกสาร", meta, columns: SUMMARY_COLUMNS, rows });
    sheets.push(monthSheet("โครงการ 12 เดือน", "ใบสั่งงาน 12 เดือนล่าสุด (ตามวันเริ่มงาน)", meta, pj.startedByMonth));
    sheets.push(dueSheet("โครงการ กำหนดเสร็จ", "ใบสั่งงานใกล้ / เลยกำหนดแล้วเสร็จ", meta, pj.dueList, "วันแล้วเสร็จ"));
  }

  const bd = b.bd?.detail;
  if (bd) {
    sheets.push(monthSheet("BD 12 เดือน", "Cost Control 12 เดือนล่าสุด (ตามวันที่บนหัวใบ)", meta, bd.createdByMonth));
    sheets.push({
      sheetName: "BD ล่าสุด", title: `Cost Control ล่าสุด (ผูก Scope ${bd.linkedToScope} ใบ · ไม่ผูก ${bd.standalone} ใบ)`, meta,
      columns: [{ header: "เลขที่" }, { header: "งาน / ลูกค้า" }, { header: "วันที่", kind: "date" }, { header: "สถานะ" }],
      rows: bd.recent.map((r) => [r.docNumber || r.id, r.party, r.date, r.status]),
    });
  }

  return sheets.filter((s): s is ExportSheet => s !== null);
}
