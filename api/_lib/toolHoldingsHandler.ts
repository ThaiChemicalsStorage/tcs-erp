import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { HttpError, getPathSegments } from "./http.js";
import { requirePermission, type AuthContext } from "./auth.js";
import {
  productsCollection, categoriesCollection, stockMovementsCollection, departmentsCollection, teamsCollection,
  codeEntriesCollection, countersCollection, auditLogCollection,
  toObjectId, withStringId, type StockMovementFields,
} from "./collections.js";
import { applyStockMovement, assertProductsHaveStock, productCostBasis, returnUnitCostOf } from "./stockHandler.js";
import { nextMonthlyDocumentNumber } from "./documentNumbering.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText } from "./quoteValidation.js";
import { sanitizeNullableNumber } from "./projectValidation.js";

/** รูปแบบ id ที่ query ได้จริง — ผิดรูปต้องตอบ 400 ไม่ใช่ปล่อยให้ toObjectId โยนกลางทาง */
function isObjectIdLike(v: string): boolean {
  return /^[a-f0-9]{24}$/i.test(v);
}

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
 * **2026-09-03 (รอบสอง)** เพิ่ม `POST /api/tool-holdings/issue` — หน้าจ่าย/รับคืนเครื่องมือให้ทีมโดยตรง
 * ตามที่เจ้าของสั่งไว้ว่า *"หน้าตัดเบิกเครื่องมือ มีแผนกในการเบิกโครงการหรือผลิต"* · **ยังเป็นบัญชี
 * สต๊อกชุดเดิม** ไม่ได้เปิดทางเดินที่สอง — ต่างกันแค่ `sourceType: "tool_issue"` แทน
 * `"material_requisition"` ยอดถือครองจึงรวมของที่มาจากทั้งสองทางเสมอ (ถ้าแยกบัญชี วันหนึ่ง
 * สองตัวเลขจะเถียงกัน ซึ่งเป็นเหตุผลเดียวกับที่หน้านี้ไม่มี collection ของตัวเองตั้งแต่แรก) ·
 * การจ่ายตรงต้องมีสิทธิ์ `stock:adjust` (เท่ากับการจ่ายของบนใบเบิก) ไม่ใช่ `stock:view`
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

function query(req: ApiRequest, key: string): string {
  const v = req.query?.[key];
  return typeof v === "string" ? v.trim() : "";
}

async function toolProductIds(): Promise<Map<string, { code: string; name: string; unit: string }>> {
  const products = await productsCollection();
  const docs = await products.find({ isTool: true, archived: { $ne: true } }, { projection: { code: 1, name: 1, unit: 1 } }).toArray();
  return new Map(docs.map((p) => [p._id.toString(), { code: p.code, name: p.name, unit: p.unit }]));
}

/** filter ร่วมของทั้งสองโหมด — เฉพาะ movement ที่มาจากใบเบิกและเป็นสินค้าประเภทเครื่องมือ */
function baseFilter(req: ApiRequest, productIds: string[]): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    // ของที่ทีมถืออยู่มาได้สองทาง: จ่ายผ่านใบเบิก และจ่ายตรงจากหน้าเครื่องมือ — ต้องรวมทั้งคู่เสมอ
    sourceType: { $in: ["material_requisition", "tool_issue"] },
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

async function handleHoldings(req: ApiRequest, res: ApiResponse, productMeta: Map<string, { code: string; name: string; unit: string }>) {
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

async function handleReport(req: ApiRequest, res: ApiResponse, productMeta: Map<string, { code: string; name: string; unit: string }>) {
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


/**
 * จ่าย / รับคืนเครื่องมือให้ทีมโดยตรง (2026-09-03 รอบสอง)
 *
 * เจ้าของสั่ง *"หน้าตัดเบิกเครื่องมือ มีแผนกในการเบิกโครงการหรือผลิต"* — เครื่องมือถูกยืมไปคืนมา
 * บ่อยเกินกว่าจะเปิดใบเบิกใหม่ทุกครั้ง แต่ยอดถือครองต้องยังตรงกับบัญชีสต๊อก จึงเขียนลง
 * `stock_movements` ชุดเดิม ต่างแค่ `sourceType` และได้เลขที่ของตัวเอง `TL-YYYYMM-NNNN`
 * (เลขเดียวต่อการกดหนึ่งครั้ง ไม่ใช่ต่อบรรทัด) ไว้ให้รายงานอ้างถึงได้
 *
 * ต้องระบุ**ทีม**เสมอ เพราะยอดถือครองเป็นของทีม ไม่ใช่ของแผนก — จ่ายให้แผนกลอย ๆ แล้วจะไม่มี
 * ใครรับผิดชอบว่าของอยู่ที่ใคร
 *
 * ตอนรับคืน ตรวจกับยอดที่ทีมนั้นถืออยู่จริงก่อนเสมอ ไม่งั้นจะ "คืน" ของที่ไม่เคยเบิกจนสต๊อกงอกเอง
 */
async function handleIssue(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const mode = body.mode === "return" ? "return" : "issue";

  const departmentId = sanitizeShortText(body.departmentId, "แผนก", true);
  const teamId = sanitizeShortText(body.teamId, "ทีม", true);
  if (!isObjectIdLike(departmentId)) throw new HttpError(400, "แผนกไม่ถูกต้อง");
  if (!isObjectIdLike(teamId)) throw new HttpError(400, "ทีมไม่ถูกต้อง");
  const department = await (await departmentsCollection()).findOne({ _id: toObjectId(departmentId) });
  if (!department) throw new HttpError(400, "ไม่พบแผนกที่ระบุ");
  const team = await (await teamsCollection()).findOne({ _id: toObjectId(teamId) });
  if (!team) throw new HttpError(400, "ไม่พบทีมที่ระบุ");
  if (team.departmentId !== departmentId) throw new HttpError(400, "ทีมนี้ไม่ได้อยู่ในแผนกที่เลือก");

  // ชื่อประเภทงานเติมจากทะเบียนรหัสฝั่งเซิร์ฟเวอร์ ไม่เชื่อชื่อที่ client ส่งมา (กติกาเดียวกับใบเบิก)
  const workTypeCode = sanitizeShortText(body.workTypeCode, "ประเภทงาน").toUpperCase();
  let workTypeName = "";
  if (workTypeCode) {
    const entry = await (await codeEntriesCollection()).findOne({ kind: "workType", code: workTypeCode, isDeleted: false });
    workTypeName = entry?.name ?? "";
  }
  const note = sanitizeLongText(body.note, "หมายเหตุ");

  const productMeta = await toolProductIds();
  const rawLines = body.lines;
  if (!Array.isArray(rawLines)) throw new HttpError(400, "ข้อมูลรายการไม่ถูกต้อง");
  if (rawLines.length > 200) throw new HttpError(400, "จำนวนรายการต้องไม่เกิน 200 รายการ");

  const qtyByProduct = new Map<string, number>();
  for (const [idx, raw] of (rawLines as Record<string, unknown>[]).entries()) {
    const productId = typeof raw.productId === "string" ? raw.productId : "";
    if (!productMeta.has(productId)) throw new HttpError(400, `รายการลำดับที่ ${idx + 1}: ไม่ใช่สินค้าประเภทเครื่องมือ`);
    const qty = sanitizeNullableNumber(raw.qty, `จำนวนลำดับที่ ${idx + 1}`) ?? 0;
    if (qty <= 0) continue;
    qtyByProduct.set(productId, (qtyByProduct.get(productId) ?? 0) + qty);
  }
  if (qtyByProduct.size === 0) throw new HttpError(400, "กรุณาระบุจำนวนอย่างน้อยหนึ่งรายการ");

  if (mode === "issue") {
    // ตรวจของทั้งชุดก่อนเขียนแถวแรก — บรรทัดท้ายไม่พอต้องไม่ทิ้งบรรทัดต้น ๆ ที่ตัดไปแล้วค้างไว้
    await assertProductsHaveStock(qtyByProduct);
  } else {
    const held = await heldByTeam(teamId, [...qtyByProduct.keys()]);
    for (const [productId, qty] of qtyByProduct) {
      const have = held.get(productId) ?? 0;
      if (qty > have) {
        const meta = productMeta.get(productId)!;
        throw new HttpError(400, `${meta.code} ${meta.name}: ทีมนี้ถืออยู่ ${have} ${meta.unit} คืนเกินที่ถือไม่ได้`);
      }
    }
  }

  const slipNumber = await nextMonthlyDocumentNumber(await countersCollection(), "TL", "tool_issue");
  const org = {
    departmentId, departmentName: department.name,
    teamId, teamName: team.name,
    ...(workTypeCode ? { workTypeCode } : {}),
    ...(workTypeName ? { workTypeName } : {}),
  };
  const reason = note || (mode === "issue" ? `จ่ายเครื่องมือให้ ${team.name}` : `รับคืนเครื่องมือจาก ${team.name}`);
  // เครื่องมือที่คืนเข้าคลังลงบัญชีด้วยราคาซื้อล่าสุด เหมือนการคืนวัสดุของใบเบิก (2026-09-09)
  const costs = mode === "return" ? await productCostBasis([...qtyByProduct.keys()]) : {};
  for (const [productId, qty] of qtyByProduct) {
    await applyStockMovement({
      productId,
      kind: mode === "issue" ? "deduct" : "return",
      delta: mode === "issue" ? -qty : qty,
      reason,
      sourceType: "tool_issue",
      sourceId: slipNumber,
      sourceLabel: slipNumber,
      userId: ctx.user.id,
      org,
      ...(mode === "return" ? { rowUnitCost: returnUnitCostOf(costs[productId]) } : {}),
    });
  }

  await writeToolAudit(ctx, mode, slipNumber, team.name, qtyByProduct.size);
  res.status(200).json({ slipNumber, lineCount: qtyByProduct.size });
}

/**
 * **เครื่องมือกองกลาง** (2026-09-29) — เจ้าของ: *"ตรงรายการเครื่องมือสามารถเพิ่มเครื่องมือขึ้นมาเองตรงนั้นเลยได้โดยไม่ต้องผ่านสต๊อก
 * มันจะเป็นเครื่องมือกองกลาง … กดรหัสหรือกดที่ชื่อก็ได้เพื่ออัปเดตจำนวนสต๊อก"* · เจ้าของเลือก: ขึ้นในหน้าสต๊อก/คลังสินค้าด้วย ·
 * รหัสพิมพ์เองได้ เว้นว่าง = ระบบออก `CT-0001`
 *
 * ยังเป็นสินค้าในคอลเล็กชันเดิม (`isTool` + `commonTool`) ไม่ใช่ทะเบียนแยก — จ่าย/คืน/ยอดถือครองจึงใช้ทางเดิมทั้งหมด ·
 * ยอดสต๊อกเปลี่ยนผ่าน `applyStockMovement()` เสมอ (kind `adjust`, sourceType `manual` — **ไม่ใช่** `tool_issue`
 * เพราะยอดถือครองของทีมนับจาก `tool_issue` ถ้าใช้ตัวนั้นการตั้งยอดจะกลายเป็นการจ่าย/คืนให้ทีม) · สิทธิ์ `stock:adjust`
 * เท่าการจ่าย/รับคืนในหน้าเดียวกัน ไม่ต้องมี `products:create`
 */
const COMMON_TOOL_CATEGORY = "เครื่องมือกองกลาง";

async function commonToolCategoryId(userId: string): Promise<string> {
  const categories = await categoriesCollection();
  const found = await categories.findOne({ name: COMMON_TOOL_CATEGORY });
  if (found) return found._id.toString();
  const now = nowIso();
  const inserted = await categories.insertOne({
    name: COMMON_TOOL_CATEGORY, archived: false, createdAt: now, updatedAt: now, createdBy: userId, updatedBy: userId,
  });
  return inserted.insertedId.toString();
}

/** รหัสถัดไป `CT-0001` — ข้ามเลขที่มีคนพิมพ์ใช้ไปแล้ว (รหัสสินค้าต้องไม่ซ้ำ) */
async function nextCommonToolCode(): Promise<string> {
  const counters = await countersCollection();
  const products = await productsCollection();
  for (let i = 0; i < 1000; i++) {
    const result = await counters.findOneAndUpdate({ _id: "common_tool" }, { $inc: { seq: 1 } }, { returnDocument: "after", upsert: true });
    const code = `CT-${String(result?.seq ?? 1).padStart(4, "0")}`;
    if (!(await products.findOne({ code }))) return code;
  }
  throw new HttpError(500, "ออกรหัสเครื่องมือไม่สำเร็จ");
}

function sanitizeStockQty(v: unknown): number {
  const qty = sanitizeNullableNumber(v, "จำนวนสต๊อก") ?? 0;
  if (qty < 0) throw new HttpError(400, "จำนวนสต๊อกต้องไม่ติดลบ");
  return qty;
}

/** `POST /api/tool-holdings/tools` — `{ code?, name, unit?, qty? }` → สร้างเครื่องมือกองกลาง (+ ตั้งยอดเริ่มต้น) */
async function handleCreateCommonTool(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = sanitizeShortText(body.name, "ชื่อเครื่องมือ", true);
  const unit = sanitizeShortText(body.unit, "หน่วย");
  const qty = sanitizeStockQty(body.qty);
  const products = await productsCollection();
  let code = sanitizeShortText(body.code, "รหัสเครื่องมือ");
  if (code) {
    if (await products.findOne({ code })) throw new HttpError(409, `รหัส ${code} มีอยู่แล้ว`);
  } else {
    code = await nextCommonToolCode();
  }

  const now = nowIso();
  let insertedId;
  try {
    ({ insertedId } = await products.insertOne({
      code, name, categoryId: await commonToolCategoryId(ctx.user.id), unit,
      defaultPrice: 0, description: "", specifications: "", archived: false,
      stockQty: 0, reorderPoint: 0, avgCost: 0, isTool: true, commonTool: true,
      createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
    }));
  } catch (err) {
    if (err && typeof err === "object" && (err as { code?: number }).code === 11000) throw new HttpError(409, `รหัส ${code} มีอยู่แล้ว`);
    throw err;
  }
  const productId = insertedId.toString();
  if (qty > 0) {
    await applyStockMovement({
      productId, kind: "adjust", delta: qty, reason: "ตั้งยอดเครื่องมือกองกลาง (เพิ่มจากหน้าเครื่องมือประจำทีม)",
      sourceType: "manual", userId: ctx.user.id,
    });
  }
  await writeCommonToolAudit(ctx, "Common Tool Created", `เพิ่มเครื่องมือกองกลาง ${code} ${name} ยอดเริ่มต้น ${qty} ${unit}`.trim());
  const doc = await products.findOne({ _id: insertedId });
  res.status(201).json({ product: withStringId(doc!) });
}

/**
 * `POST /api/tool-holdings/tools/:id/stock` — `{ qty, note? }` **qty = ยอดคงเหลือที่ควรเป็น** (นับได้เท่าไหร่กรอกเท่านั้น)
 * ระบบลงส่วนต่างเป็นแถว `adjust` · เฉพาะเครื่องมือกองกลาง — สินค้าอื่นยังปรับยอดที่หน้าสต๊อกตามเดิม
 */
async function handleSetCommonToolStock(req: ApiRequest, res: ApiResponse, productId: string): Promise<void> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "stock:adjust");
  if (!isObjectIdLike(productId)) throw new HttpError(400, "รหัสเครื่องมือไม่ถูกต้อง");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const qty = sanitizeStockQty(body.qty);
  const note = sanitizeLongText(body.note, "หมายเหตุ");
  const products = await productsCollection();
  const product = await products.findOne({ _id: toObjectId(productId) });
  if (!product) throw new HttpError(404, "ไม่พบเครื่องมือ");
  if (!product.commonTool) throw new HttpError(400, "อัปเดตยอดที่หน้านี้ได้เฉพาะเครื่องมือกองกลาง — สินค้าอื่นปรับยอดที่หน้าสต๊อก");
  const before = product.stockQty ?? 0;
  const delta = qty - before;
  if (delta !== 0) {
    await applyStockMovement({
      productId, kind: "adjust", delta,
      reason: note || `อัปเดตยอดเครื่องมือกองกลาง ${before} → ${qty}`,
      sourceType: "manual", userId: ctx.user.id,
    });
    await writeCommonToolAudit(ctx, "Common Tool Stock Updated", `อัปเดตยอด ${product.code} ${product.name}: ${before} → ${qty} ${product.unit ?? ""}`.trim());
  }
  const doc = await products.findOne({ _id: toObjectId(productId) });
  res.status(200).json({ product: withStringId(doc!) });
}

async function writeCommonToolAudit(ctx: AuthContext, action: string, details: string): Promise<void> {
  await (await auditLogCollection()).insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "เครื่องมือประจำทีม", action, details, createdAt: nowIso(),
  });
}

/** ยอดที่ทีมหนึ่งถืออยู่ตอนนี้ ต่อสินค้า — ใช้กันการคืนเกินที่ถือ */
async function heldByTeam(teamId: string, productIds: string[]): Promise<Map<string, number>> {
  const movements = await stockMovementsCollection();
  const docs = await movements.find({
    sourceType: { $in: ["material_requisition", "tool_issue"] },
    teamId,
    productId: { $in: productIds },
  }).toArray();
  const held = new Map<string, number>();
  for (const m of docs) held.set(m.productId, (held.get(m.productId) ?? 0) - m.delta);
  return held;
}

async function writeToolAudit(ctx: AuthContext, mode: "issue" | "return", slipNumber: string, teamName: string, lineCount: number): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "เครื่องมือประจำทีม",
    action: mode === "issue" ? "Tools Issued" : "Tools Returned",
    details: `${mode === "issue" ? "จ่ายเครื่องมือให้" : "รับคืนเครื่องมือจาก"} ${teamName} ${lineCount} รายการ (${slipNumber})`,
    createdAt: nowIso(),
  });
}
export async function handleToolHoldings(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/tool-holdings");
  // จ่าย/รับคืนเป็นการเขียนสต๊อกจริง จึงต้องมี stock:adjust ไม่ใช่ stock:view ของหน้าดูอย่างเดียว
  if (parts.length === 1 && parts[0] === "issue") return handleIssue(req, res);
  if (parts.length === 1 && parts[0] === "tools") return handleCreateCommonTool(req, res);
  if (parts.length === 3 && parts[0] === "tools" && parts[2] === "stock") return handleSetCommonToolStock(req, res, parts[1]);
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  await requirePermission(req, "stock:view");
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
