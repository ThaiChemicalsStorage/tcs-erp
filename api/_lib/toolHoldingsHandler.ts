import type { VercelRequest, VercelResponse } from "@vercel/node";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission } from "./auth.js";
import { productsCollection, stockMovementsCollection, toObjectId, withStringId, type StockMovementFields } from "./collections.js";

/**
 * เครื่องมือประจำทีม (2026-09-03) — เจ้าของสั่ง *"เพิ่มหน้าคุมเครื่องมือ ว่าทีมนี้มีเครื่องมืออะไรในครอบครอง"*
 * และ *"หน้าย่อย … เลือกรายงานแยกออกมาว่าทีมไหนเบิกอะไรไปบ้าง และสามารถกดปริ้นออกมาได้"*
 *
 * **ไม่มี collection ของตัวเอง** — ทุกอย่างอ่านจากบัญชีเดินสะพัดของสต๊อก (`stock_movements`) ที่ใบเบิก
 * ประทับแผนก/ทีม/ประเภทงานไว้ทุกครั้งที่จ่ายและคืน: ของที่ทีมถืออยู่ = Σจ่าย − Σคืน ต่อ (ทีม, สินค้า)
 * เฉพาะสินค้าที่ติ๊ก `Product.isTool` · ถ้าเก็บยอดถือแยกอีกที่ วันหนึ่งสองตัวเลขจะเถียงกันแน่นอน
 *
 * สองโหมดใน route เดียว (`GET /api/tool-holdings`):
 *   - ค่าเริ่มต้น → ยอดถือครองต่อ (แผนก, ทีม, สินค้า) พร้อมใบเบิกล่าสุดที่เกี่ยว
 *   - `?report=1` → รายการเคลื่อนไหวรายแถวในช่วงวันที่ (เบิก/คืน) สำหรับพิมพ์รายงาน
 * กรองได้ด้วย `departmentId` / `teamId` / `workTypeCode` / `from` / `to` (YYYY-MM-DD, เวลาไทย)
 *
 * mount บน api/handlers/products.ts ข้าง `/api/stock-movements` — เป็นมุมมองของสต๊อก ไม่ใช่เอกสารใหม่
 * สิทธิ์ `stock:view` เดิม ไม่สร้างสิทธิ์ใหม่ (เหตุผลเดียวกับเทมเพลตใบเบิก 2026-09-02: สิทธิ์ใหม่ที่ไม่มี
 * migration แจกให้บทบาทจริง = เมนูที่ไม่มีใครมองเห็น)
 */

export interface ToolHoldingRow {
  departmentId: string;
  departmentName: string;
  teamId: string;
  teamName: string;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  issued: number;
  returned: number;
  held: number;
  /** เลขใบเบิกล่าสุดที่จ่ายของตัวนี้ให้ทีมนี้ */
  lastSourceLabel: string;
  lastMovementAt: string;
}

export interface ToolReportRow {
  id: string;
  createdAt: string;
  kind: StockMovementFields["kind"];
  /** จำนวนเบิก (บวก) หรือคืน (ลบ) — มองจากฝั่งทีม */
  qty: number;
  productId: string;
  productCode: string;
  productName: string;
  unit: string;
  sourceLabel: string;
  departmentName: string;
  teamName: string;
  workTypeName: string;
  createdBy: string;
}

const MAX_REPORT_ROWS = 5000;

/** เที่ยงคืนเวลาไทยของวันที่ที่ส่งมา แปลงเป็น ISO (UTC) สำหรับเทียบ `createdAt` — ตรงกับ documentNumbering.ts */
function bangkokDayStartIso(day: string): string {
  return new Date(`${day}T00:00:00+07:00`).toISOString();
}

function query(req: VercelRequest, key: string): string {
  const v = req.query?.[key];
  return typeof v === "string" ? v.trim() : "";
}

async function toolProductIds(): Promise<Map<string, { code: string; name: string; unit: string }>> {
  const products = await productsCollection();
  const docs = await products.find({ isTool: true, archived: { $ne: true } }, { projection: { code: 1, name: 1, unit: 1 } }).toArray();
  return new Map(docs.map((p) => [p._id.toString(), { code: p.code, name: p.name, unit: p.unit }]));
}

/** filter ร่วมของทั้งสองโหมด — เฉพาะ movement ที่มาจากใบเบิกและเป็นสินค้าประเภทเครื่องมือ */
function baseFilter(req: VercelRequest, productIds: string[]): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    sourceType: "material_requisition",
    productId: { $in: productIds },
  };
  const departmentId = query(req, "departmentId");
  const teamId = query(req, "teamId");
  const workTypeCode = query(req, "workTypeCode");
  if (departmentId) filter.departmentId = departmentId;
  if (teamId) filter.teamId = teamId;
  if (workTypeCode) filter.workTypeCode = workTypeCode.toUpperCase();
  const from = query(req, "from");
  const to = query(req, "to");
  if (from || to) {
    const range: Record<string, string> = {};
    if (from) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new HttpError(400, "วันที่เริ่มต้นไม่ถูกต้อง");
      range.$gte = bangkokDayStartIso(from);
    }
    if (to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new HttpError(400, "วันที่สิ้นสุดไม่ถูกต้อง");
      const next = new Date(bangkokDayStartIso(to));
      next.setUTCDate(next.getUTCDate() + 1);
      range.$lt = next.toISOString();
    }
    filter.createdAt = range;
  }
  return filter;
}

async function handleHoldings(req: VercelRequest, res: VercelResponse, productMeta: Map<string, { code: string; name: string; unit: string }>) {
  const movements = await stockMovementsCollection();
  // ยอดถือครองไม่สนช่วงวันที่ — "ตอนนี้ถืออยู่เท่าไร" ต้องรวมตั้งแต่ต้น ช่วงวันที่มีไว้สำหรับรายงานเท่านั้น
  const filter = baseFilter(req, [...productMeta.keys()]);
  delete filter.createdAt;
  const docs = await movements.find(filter).sort({ createdAt: 1 }).toArray();

  const rows = new Map<string, ToolHoldingRow>();
  for (const m of docs) {
    const meta = productMeta.get(m.productId);
    if (!meta) continue;
    const key = `${m.departmentId ?? ""}|${m.teamId ?? ""}|${m.productId}`;
    const row = rows.get(key) ?? {
      departmentId: m.departmentId ?? "", departmentName: m.departmentName ?? "",
      teamId: m.teamId ?? "", teamName: m.teamName ?? "",
      productId: m.productId, productCode: meta.code, productName: meta.name, unit: meta.unit,
      issued: 0, returned: 0, held: 0, lastSourceLabel: "", lastMovementAt: "",
    };
    // มองจากฝั่งทีม: สต๊อกลด (delta < 0) = ทีมได้ของไป, สต๊อกเพิ่ม = ทีมคืน
    if (m.delta < 0) { row.issued += -m.delta; row.lastSourceLabel = m.sourceLabel ?? row.lastSourceLabel; }
    else row.returned += m.delta;
    row.held = row.issued - row.returned;
    row.lastMovementAt = m.createdAt;
    rows.set(key, row);
  }
  const holdings = [...rows.values()]
    .filter((r) => r.held > 0)
    .sort((a, b) => a.departmentName.localeCompare(b.departmentName, "th") || a.teamName.localeCompare(b.teamName, "th") || a.productName.localeCompare(b.productName, "th"));
  res.status(200).json({ holdings });
}

async function handleReport(req: VercelRequest, res: VercelResponse, productMeta: Map<string, { code: string; name: string; unit: string }>) {
  const movements = await stockMovementsCollection();
  const filter = baseFilter(req, [...productMeta.keys()]);
  const docs = await movements.find(filter).sort({ createdAt: 1 }).limit(MAX_REPORT_ROWS).toArray();
  const rows: ToolReportRow[] = docs.map((m) => {
    const meta = productMeta.get(m.productId);
    const full = withStringId(m);
    return {
      id: full.id, createdAt: m.createdAt, kind: m.kind, qty: -m.delta,
      productId: m.productId, productCode: meta?.code ?? m.productCode, productName: meta?.name ?? m.productName, unit: meta?.unit ?? "",
      sourceLabel: m.sourceLabel ?? "", departmentName: m.departmentName ?? "", teamName: m.teamName ?? "",
      workTypeName: m.workTypeName ?? "", createdBy: m.createdBy,
    };
  });
  res.status(200).json({ rows, truncated: docs.length >= MAX_REPORT_ROWS });
}

export async function handleToolHoldings(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "stock:view");
  const parts = getPathSegments(req, "/api/tool-holdings");
  if (parts.length !== 0) throw new HttpError(404, "Not found");
  const productMeta = await toolProductIds();
  // เช็ค ObjectId ให้ก่อน — `toObjectId` โยน 400 เองเมื่อรูปแบบผิด ใช้แค่ validate ไม่ได้เอาค่าไปใช้
  for (const key of ["departmentId", "teamId"] as const) {
    const v = query(req, key);
    if (v) toObjectId(v);
  }
  if (query(req, "report") === "1") return handleReport(req, res, productMeta);
  return handleHoldings(req, res, productMeta);
}
