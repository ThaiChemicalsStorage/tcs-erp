/**
 * ข้อมูลส่งออกของหน้าสต๊อก (2026-09-24) — ตารางเดียวกันใช้ทั้งไฟล์ Excel (`downloadXlsx`) และใบพิมพ์ PDF
 * (`TablePrintDocument`) ตัวเลขสองทางจึงตรงกันเสมอ · หัวคอลัมน์เป็นภาษาไทยตามนโยบายเอกสารที่ส่งออกไปใช้งานจริง
 * (เหมือนใบพิมพ์ทุกใบ ไม่ตามภาษาหน้าจอของคนกด)
 */
import type { Product, ProductCategory } from "./products.js";
import { STOCK_MOVEMENT_KIND_LABELS, stockValueOf, type StockMovement, type StockHistoryRow } from "./stock.js";
import { printDate } from "./printFormat.js";
import type { ExportCell, ExportSheet } from "./tableExport.js";

/** ยอดคงเหลือทุกสินค้าตามที่เห็นบนจอ (ผลค้นหาที่กรองอยู่) */
export function stockBalanceSheet(products: Product[], categories: ProductCategory[], filterNote: string): ExportSheet {
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const rows: ExportCell[][] = products.map((p) => [
    p.code, p.name, categoryName(p.categoryId), p.unit, p.stockQty, p.avgCost ?? 0, p.lastCost ?? null, stockValueOf(p),
    (p.reorderPoint ?? 0) > 0 ? p.reorderPoint ?? 0 : null,
  ]);
  return {
    sheetName: "สต๊อกสินค้า",
    title: "รายงานสต๊อกสินค้าคงเหลือ",
    meta: [`ณ วันที่ ${printDate(new Date().toLocaleDateString("sv-SE"))} · ${products.length.toLocaleString("en-US")} รายการ${filterNote ? ` · ค้นหา "${filterNote}"` : ""}`],
    columns: [
      { header: "รหัสสินค้า" }, { header: "ชื่อสินค้า" }, { header: "หมวด" }, { header: "หน่วย" },
      { header: "คงเหลือ", kind: "qty" }, { header: "ต้นทุนเฉลี่ย/หน่วย", kind: "money" }, { header: "ราคาซื้อล่าสุด", kind: "money" },
      { header: "มูลค่าคงเหลือ", kind: "money" }, { header: "จุดเตือนสั่งซื้อ", kind: "qty" },
    ],
    rows,
    totals: ["รวม", "", "", "", products.reduce((s, p) => s + p.stockQty, 0), null, null, products.reduce((s, p) => s + stockValueOf(p), 0), null],
  };
}

/**
 * การ์ดสต๊อกของสินค้าหนึ่งตัว — คอลัมน์เดียวกับใบพิมพ์ `StockCardPrintDocument` (รับ / จ่าย / คงเหลือ)
 * `movements` เรียงเก่า → ใหม่
 */
export function stockCardSheet(product: Product, movements: StockMovement[], rangeNote = ""): ExportSheet {
  const rows: ExportCell[][] = movements.map((m) => {
    const inbound = m.delta > 0;
    const q = Math.abs(m.delta);
    return [
      printDate(m.createdAt.slice(0, 10)),
      `${m.sourceLabel ? `${m.sourceLabel} — ` : ""}${STOCK_MOVEMENT_KIND_LABELS[m.kind]}${m.reason ? ` · ${m.reason}` : ""}`,
      [m.departmentName, m.teamName].filter(Boolean).join(" / "),
      inbound ? q : null, inbound ? m.unitCost ?? null : null, inbound ? m.amount ?? null : null,
      inbound ? null : q, inbound ? null : m.unitCost ?? null, inbound ? null : m.amount ?? null,
      m.balanceAfter, m.balanceValueAfter ?? null,
    ];
  });
  return {
    sheetName: `การ์ดสต๊อก ${product.code}`,
    title: `การ์ดสต๊อกสินค้า ${product.code} ${product.name}`,
    meta: [
      `หน่วย ${product.unit} · คงเหลือปัจจุบัน ${product.stockQty.toLocaleString("en-US")} · ต้นทุนเฉลี่ย ${(product.avgCost ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} · มูลค่า ${stockValueOf(product).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ...(rangeNote ? [rangeNote] : []),
    ],
    columns: [
      { header: "วันที่", kind: "date" }, { header: "เอกสารอ้างอิง / รายการ" }, { header: "แผนก / ทีม" },
      { header: "รับ จำนวน", kind: "qty" }, { header: "รับ ราคา/หน่วย", kind: "money" }, { header: "รับ มูลค่า", kind: "money" },
      { header: "จ่าย จำนวน", kind: "qty" }, { header: "จ่าย ราคา/หน่วย", kind: "money" }, { header: "จ่าย มูลค่า", kind: "money" },
      { header: "คงเหลือ จำนวน", kind: "qty" }, { header: "คงเหลือ มูลค่า", kind: "money" },
    ],
    rows,
  };
}

/** ประวัติความเคลื่อนไหว (หน้าประวัติสต๊อก แท็บทุกความเคลื่อนไหว) ตามตัวกรองที่ใช้อยู่ — เรียงใหม่ → เก่าเหมือนบนจอ */
export function stockHistorySheet(rows: StockHistoryRow[], sourceLabel: (r: StockHistoryRow) => string, filterNote: string): ExportSheet {
  const linkText = (r: StockHistoryRow) => {
    const l = r.link;
    if (r.sourceType === "receiving_report" || (r.kind === "receive" && (l.purchaseOrderNumber || l.vendorName))) {
      return [l.purchaseOrderNumber, l.vendorName].filter(Boolean).join(" · ");
    }
    if (r.sourceType === "ar_document") return "ขายตรง";
    return [l.jobCode, l.jobOrderCode, l.productionOrderId, l.customerName].filter(Boolean).join(" · ");
  };
  return {
    sheetName: "ประวัติสต๊อก",
    title: "ประวัติความเคลื่อนไหวสต๊อก",
    meta: [`ส่งออกเมื่อ ${printDate(new Date().toLocaleDateString("sv-SE"))} · ${rows.length.toLocaleString("en-US")} รายการ${filterNote ? ` · ${filterNote}` : ""}`],
    columns: [
      { header: "วันที่", kind: "date" }, { header: "เวลา" }, { header: "รหัสสินค้า" }, { header: "สินค้า" }, { header: "ประเภท" },
      { header: "จำนวน", kind: "qty" }, { header: "ต้นทุน/หน่วย", kind: "money" }, { header: "มูลค่า", kind: "money" }, { header: "คงเหลือ", kind: "qty" },
      { header: "ที่มา" }, { header: "เอกสาร / เหตุผล" }, { header: "งาน / ผู้ขาย" }, { header: "แผนก / ทีม" }, { header: "ผู้ทำรายการ" },
    ],
    rows: rows.map((r) => [
      printDate(r.createdAt.slice(0, 10)),
      new Date(r.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }),
      r.productCode, r.productName, STOCK_MOVEMENT_KIND_LABELS[r.kind],
      r.delta, r.unitCost ?? null, r.amount ?? null, r.balanceAfter,
      sourceLabel(r), r.sourceLabel || r.reason || "", linkText(r),
      [r.departmentName, r.teamName].filter(Boolean).join(" / "), r.createdByName || "",
    ]),
  };
}
