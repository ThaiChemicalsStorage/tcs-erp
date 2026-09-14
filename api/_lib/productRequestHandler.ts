import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission, type AuthContext } from "./auth.js";
import { buildSimpleOwnershipClause } from "./visibility.js";
import {
  productRequestsCollection, productsCollection, categoriesCollection, auditLogCollection,
  purchaseRequestsCollection,
  toObjectId, withStringId, type ProductRequestFields,
} from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { sanitizeShortText, sanitizeLongText } from "./quoteValidation.js";
import { notifyDepartments, notifyUser, STORE_DEPARTMENT_NAMES } from "./departmentNotify.js";

/**
 * คำขอเพิ่มสินค้า — เพิ่ม 2026-08-27 ตามที่ฝ่ายโครงการขอ ("แผนกอื่นขอเพิ่มสินค้าได้แต่ตั้งรหัสไม่ได้
 * เมื่อสโตร์กดอนุมัติให้แจ้งเตือนผู้ขอว่าสินค้าได้รับการตั้งรหัสแล้ว")
 *
 * **กติกาที่สำคัญที่สุดของไฟล์นี้: รหัสสินค้าเข้ามาได้ทางเดียวเท่านั้น คือ `handleApprove()`**
 * ทั้ง `handleCreate()` และ `handleUpdate()` ไม่อ่านฟิลด์ `code` จาก body เลยแม้แต่บรรทัดเดียว —
 * ไม่ใช่แค่ "ไม่แสดงช่องบนหน้าจอ" เพราะการซ่อนช่องบน UI ไม่ได้กันคนที่ยิง API ตรง ๆ
 *
 * การสร้าง `Product` จริงตอนอนุมัติจงใจตรวจรหัสซ้ำด้วยเงื่อนไขเดียวกับ `api/handlers/products.ts`
 * (`findOne({ code })` → 409) เพื่อให้ทั้งสองทางเข้าสู่คลังสินค้าให้ผลเหมือนกัน
 */

async function writeAuditEntry(ctx: AuthContext, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "คำขอเพิ่มสินค้า", action, details, createdAt: nowIso(),
  });
}

function toClient(doc: ProductRequestFields & { _id: unknown }) {
  return withStringId(doc as never);
}

async function loadOrThrow(id: string) {
  const requests = await productRequestsCollection();
  const doc = await requests.findOne({ _id: toObjectId(id) });
  if (!doc || doc.isDeleted) throw new HttpError(404, "ไม่พบคำขอเพิ่มสินค้า");
  return doc;
}

async function handleList(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productRequest:view");
  const requests = await productRequestsCollection();
  // สโตร์ (ผู้มีสิทธิ์ review) ต้องเห็นคำขอของทุกคน ไม่งั้นก็ไม่มีอะไรให้อนุมัติ
  const seesAll = roleHasPermission(ctx.role, "productRequest:viewAll") || roleHasPermission(ctx.role, "productRequest:review");
  const ownership = buildSimpleOwnershipClause(ctx.user.id, seesAll, "requestedBy");
  const docs = await requests.find({ isDeleted: false, ...ownership }).sort({ createdAt: -1 }).toArray();
  res.status(200).json({ productRequests: docs.map(toClient) });
}

async function handleCreate(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productRequest:create");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = sanitizeShortText(body.name, "ชื่อสินค้า", true);
  const now = nowIso();
  const doc: ProductRequestFields = {
    name,
    unit: sanitizeShortText(body.unit, "หน่วย"),
    categoryId: sanitizeShortText(body.categoryId, "หมวดหมู่"),
    specifications: sanitizeLongText(body.specifications, "รายละเอียด/สเปก"),
    reason: sanitizeLongText(body.reason, "เหตุผลที่ต้องใช้"),
    status: "Pending",
    // รหัสสินค้าไม่เคยรับจาก body — สโตร์เป็นคนตั้งตอนอนุมัติเท่านั้น
    assignedProductCode: "",
    assignedProductId: "",
    rejectionComment: "",
    sourcePurchaseRequestId: sanitizeShortText(body.sourcePurchaseRequestId, "เลขที่ใบขอซื้อ"),
    requestedBy: ctx.user.id,
    requestedByName: ctx.user.fullName,
    requestedByDepartment: (ctx.user.department ?? "").trim(),
    requestedAt: now.slice(0, 10),
    reviewedBy: "", reviewedByName: "", reviewedAt: "",
    createdAt: now, updatedAt: now, isDeleted: false,
  };
  const requests = await productRequestsCollection();
  const result = await requests.insertOne(doc as never);
  const created = { ...doc, _id: result.insertedId };

  // แจ้งสโตร์ว่ามีคำขอใหม่ — best-effort เหมือนการแจ้งเตือนอื่นในระบบ
  try {
    const sent = await notifyDepartments(STORE_DEPARTMENT_NAMES, ctx.user.id, {
      type: "product_request_submitted",
      title: "มีคำขอเพิ่มสินค้าใหม่ รอตั้งรหัส",
      description: `${ctx.user.fullName} ขอเพิ่มสินค้า "${name}"${doc.sourcePurchaseRequestId ? ` (จากใบขอซื้อ ${doc.sourcePurchaseRequestId})` : ""}`,
      module: "คำขอเพิ่มสินค้า",
      related: { relatedProductRequestId: result.insertedId.toString() },
    });
    if (sent === 0) {
      console.warn("[product-requests] created but nobody in Stores was notified —",
        "no active user has User.department matching", STORE_DEPARTMENT_NAMES.join("/"));
    }
  } catch (err) {
    console.error("[product-requests] failed to notify Stores on create", err);
  }

  await writeAuditEntry(ctx, "Product Request Created", `ขอเพิ่มสินค้า "${name}"`);
  res.status(201).json({ productRequest: toClient(created) });
}

async function handleUpdate(req: ApiRequest, res: ApiResponse, id: string) {
  const ctx = await requirePermission(req, "productRequest:create");
  const doc = await loadOrThrow(id);
  if (doc.requestedBy !== ctx.user.id) throw new HttpError(403, "Forbidden");
  if (doc.status !== "Pending") throw new HttpError(400, "คำขอนี้ถูกพิจารณาแล้ว ไม่สามารถแก้ไขได้");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const set: Partial<ProductRequestFields> = { updatedAt: nowIso() };
  if (body.name !== undefined) set.name = sanitizeShortText(body.name, "ชื่อสินค้า", true);
  if (body.unit !== undefined) set.unit = sanitizeShortText(body.unit, "หน่วย");
  if (body.categoryId !== undefined) set.categoryId = sanitizeShortText(body.categoryId, "หมวดหมู่");
  if (body.specifications !== undefined) set.specifications = sanitizeLongText(body.specifications, "รายละเอียด/สเปก");
  if (body.reason !== undefined) set.reason = sanitizeLongText(body.reason, "เหตุผลที่ต้องใช้");
  // ไม่มี `code` โดยตั้งใจ — ดูหัวไฟล์

  const requests = await productRequestsCollection();
  await requests.updateOne({ _id: doc._id }, { $set: set });
  res.status(200).json({ productRequest: toClient(await loadOrThrow(id)) });
}

/**
 * หาหมวดหมู่จากชื่อแบบไม่สนตัวพิมพ์ — ใช้ตอนสโตร์พิมพ์ชื่อหมวดใหม่ในกล่องอนุมัติ
 *
 * กรองในหน่วยความจำแทนการยิง regex เข้า MongoDB โดยตั้งใจ: ชื่อหมวดเป็นข้อความอิสระที่มีอักขระ
 * พิเศษของ regex ได้ (`(คลัง)` ในหมวดที่ระบบ seed มาเองก็มีวงเล็บ) การประกอบ regex จากข้อความของ
 * ผู้ใช้จึงต้อง escape ให้ครบทุกตัวเสมอ ซึ่งพลาดง่ายกว่าที่คิด · ตารางหมวดหมู่มีไม่กี่สิบแถว
 */
async function findCategoryByName(name: string) {
  const categories = await categoriesCollection();
  const wanted = name.trim().toLowerCase();
  const all = await categories.find({}).toArray();
  return all.find((c) => (c.name ?? "").trim().toLowerCase() === wanted) ?? null;
}

/**
 * เติม `productId`/`productCode` กลับเข้าบรรทัดของใบขอซื้อที่เป็นต้นทางของคำขอ (2026-09-09)
 *
 * เจ้าของสั่งว่า *"พอเค้าตั้งเสร็จแล้วอยากให้มันขึ้นมาเลยไม่ต้องมากดลบแล้วเพิ่มใหม่"* — เดิมตั้งใจไม่ทำ
 * เพราะใบขอซื้ออาจอนุมัติไปแล้ว แต่สิ่งที่เขียนนี่**ไม่ใช่เนื้อหาที่ผู้อนุมัติตรวจ**: เป็นการผูกบรรทัดที่
 * พิมพ์เองเข้ากับรหัสสินค้าที่เพิ่งเกิดขึ้น ชื่อ/จำนวน/ราคาบนใบไม่ถูกแตะ จึงเขียนได้ทุกสถานะ แนวเดียวกับ
 * ฟิลด์ตามงานของ Scope of Work ที่ยกเว้นจากการล็อกตอน Final (ดู docs/MODULES/ScopeOfWork.md "PO Chasing")
 *
 * เลือกบรรทัด: บรรทัดที่ยังไม่มี `productId` และ `description` ตรงกับชื่อที่ขอ (ตัดช่องว่างหัวท้าย)
 * ถ้าไม่เจอ ใช้บรรทัดแรกที่ยังไม่มี `productId` · ไม่เจอเลย = ไม่ทำอะไร (คืน false)
 *
 * **best-effort โดยตั้งใจ** — การตั้งรหัสสินค้าสำเร็จไปแล้วตอนถึงบรรทัดนี้ ห้ามให้การเติมใบขอซื้อที่
 * ล้มเหลวย้อนไปทำให้การอนุมัติล้ม (แนวเดียวกับการแจ้งเตือนทุกจุดในระบบนี้)
 */
async function backfillSourcePurchaseRequestLine(
  request: ProductRequestFields, productId: string, code: string,
): Promise<boolean> {
  const prId = (request.sourcePurchaseRequestId ?? "").trim();
  if (!prId) return false;
  try {
    const purchaseRequests = await purchaseRequestsCollection();
    const pr = await purchaseRequests.findOne({ _id: prId });
    if (!pr || pr.isDeleted) return false;
    const wanted = request.name.trim();
    const lines = pr.lines ?? [];
    const target = lines.find((l) => !l.productId && l.description.trim() === wanted)
      ?? lines.find((l) => !l.productId);
    if (!target) return false;
    const nextLines = lines.map((l) => (l.id === target.id
      ? { ...l, productId, productCode: code, unit: l.unit.trim() || request.unit }
      : l));
    await purchaseRequests.updateOne({ _id: prId }, { $set: { lines: nextLines, updatedAt: nowIso() } });
    return true;
  } catch (err) {
    console.error("[product-requests] failed to backfill purchase request", prId, err);
    return false;
  }
}

/**
 * สโตร์อนุมัติ: ตั้งรหัส → สร้าง `Product` จริง → แจ้งกลับผู้ขอ
 *
 * สร้างสินค้า**ก่อน**อัปเดตสถานะคำขอ เพื่อว่าถ้ารหัสซ้ำ (409) คำขอจะยังคงเป็น Pending ให้แก้รหัสแล้ว
 * กดใหม่ได้ ไม่ใช่กลายเป็น Approved ทั้งที่ยังไม่มีสินค้าจริงในคลัง
 */
async function handleApprove(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productRequest:review");
  const doc = await loadOrThrow(id);
  if (doc.status !== "Pending") throw new HttpError(400, "คำขอนี้ถูกพิจารณาไปแล้ว");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = sanitizeShortText(body.code, "รหัสสินค้า", true).toUpperCase();
  /**
   * **ตั้งหมวดใหม่ได้ในจังหวะเดียวกับที่ตั้งรหัส (2026-09-09)** — เจ้าของขอให้ "จัดการหมวดหมู่สินค้าได้ด้วย"
   * ถ้าหมวดที่ควรใช้ยังไม่มี สโตร์ต้องออกจากงานที่ทำอยู่ไปสร้างหมวดที่หน้าสินค้าแล้วกลับมาเริ่มใหม่
   *
   * ส่ง `newCategoryName` มาแทน `categoryId` ได้ · ตั้งใจให้ทางนี้อยู่บน route ของการอนุมัติคำขอ
   * **ไม่ใช่การเปิดสิทธิ์ `POST /api/categories` ให้กว้างขึ้น**: คนที่ตั้งรหัสสินค้าได้ย่อมสร้างหมวดที่
   * สินค้าตัวนั้นต้องใช้ได้ด้วย แต่ไม่ได้แปลว่าเขาควรจัดการทะเบียนหมวดหมู่ของทั้งระบบ
   *
   * ชื่อที่มีอยู่แล้ว (ไม่สนตัวพิมพ์) จะ **ใช้หมวดเดิม ไม่สร้างซ้ำ** — ไม่งั้นการพิมพ์ชื่อเดียวกันสองครั้ง
   * จะได้หมวดชื่อซ้ำสองอัน ซึ่งทำให้ช่องเลือกหมวดอ่านไม่รู้เรื่องภายในไม่กี่สัปดาห์
   */
  const newCategoryName = sanitizeShortText(body.newCategoryName, "ชื่อหมวดหมู่ใหม่");
  const categoryId = sanitizeShortText(body.categoryId, "หมวดหมู่", !newCategoryName);

  const categories = await categoriesCollection();
  let category = categoryId ? await categories.findOne({ _id: toObjectId(categoryId) }) : null;
  if (!category && newCategoryName) {
    category = await findCategoryByName(newCategoryName);
    if (!category) {
      const createdAt = nowIso();
      const inserted = await categories.insertOne({
        name: newCategoryName, archived: false,
        createdAt, updatedAt: createdAt, createdBy: ctx.user.id, updatedBy: ctx.user.id,
      } as never);
      category = await categories.findOne({ _id: inserted.insertedId });
      await writeAuditEntry(ctx, "Product Category Created", `สร้างหมวดหมู่สินค้า "${newCategoryName}" ตอนตั้งรหัสสินค้า`);
    }
  }
  if (!category) throw new HttpError(400, "ไม่พบหมวดหมู่ที่เลือก");
  const resolvedCategoryId = category._id.toString();

  const products = await productsCollection();
  if (await products.findOne({ code })) throw new HttpError(409, "รหัสสินค้านี้มีอยู่แล้ว");

  const now = nowIso();
  const productResult = await products.insertOne({
    code,
    name: doc.name,
    categoryId: resolvedCategoryId,
    unit: doc.unit,
    defaultPrice: 0,
    description: doc.specifications,
    // `Product.specifications` เป็น **string** ไม่ใช่ array (ดู src/lib/products.ts) — เคยใส่ `[]` ไว้
    // ซึ่ง cast `as never` กลบไว้ แล้วไปพังจริงตอน LineItemsEditor.tsx เรียก `product.specifications.trim()`
    specifications: "",
    archived: false,
    // ตั้งต้นที่ 0 เสมอ เหมือน POST /api/products — จำนวนจริงเข้ามาทางหน้าสต๊อกเท่านั้น
    stockQty: 0,
    // ครบชุดเหมือน POST /api/products (2026-09-09) — เดิมขาดสามฟิลด์นี้ สินค้าที่เกิดจากการอนุมัติจึง
    // ไม่มีวันขึ้นในตัวเลือกเครื่องมือที่กรองด้วย `isTool` และอ่านต้นทุน/จุดเตือนต่างจากสินค้าปกติ
    reorderPoint: 0,
    avgCost: 0,
    isTool: false,
    createdAt: now, updatedAt: now, createdBy: ctx.user.id, updatedBy: ctx.user.id,
  } as never);

  const requests = await productRequestsCollection();
  await requests.updateOne({ _id: doc._id }, {
    $set: {
      status: "Approved",
      assignedProductCode: code,
      assignedProductId: productResult.insertedId.toString(),
      categoryId: resolvedCategoryId,
      reviewedBy: ctx.user.id, reviewedByName: ctx.user.fullName, reviewedAt: now.slice(0, 10),
      updatedAt: now,
    },
  });

  // เติมรหัสกลับเข้าบรรทัดในใบขอซื้อต้นทางให้เลย — best-effort ไม่ให้การอนุมัติล้มเพราะเรื่องนี้
  const backfilled = await backfillSourcePurchaseRequestLine(doc, productResult.insertedId.toString(), code);

  // แจ้งกลับผู้ขอพร้อมรหัสที่ได้ — เป็นข้อที่ที่ประชุมระบุตรง ๆ
  try {
    await notifyUser(doc.requestedBy, ctx.user.id, {
      type: "product_request_approved",
      title: "สินค้าที่คุณขอเพิ่มได้รับการตั้งรหัสแล้ว",
      description: `"${doc.name}" ได้รหัสสินค้า ${code} — เลือกจากคลังสินค้าได้แล้ว`
        + (backfilled ? ` และใส่ให้ในใบขอซื้อ ${doc.sourcePurchaseRequestId} เรียบร้อยแล้ว` : ""),
      module: "คำขอเพิ่มสินค้า",
      related: { relatedProductRequestId: id },
    });
  } catch (err) {
    console.error("[product-requests] failed to notify the requester on approval", err);
  }

  await writeAuditEntry(ctx, "Product Request Approved",
    `อนุมัติคำขอเพิ่มสินค้า "${doc.name}" และตั้งรหัส ${code}`
    + (backfilled ? ` · เติมรหัสลงบรรทัดในใบขอซื้อ ${doc.sourcePurchaseRequestId} ให้แล้ว` : ""));
  res.status(200).json({ productRequest: toClient(await loadOrThrow(id)) });
}

async function handleReject(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const ctx = await requirePermission(req, "productRequest:review");
  const doc = await loadOrThrow(id);
  if (doc.status !== "Pending") throw new HttpError(400, "คำขอนี้ถูกพิจารณาไปแล้ว");

  const body = (req.body ?? {}) as Record<string, unknown>;
  const comment = sanitizeLongText(body.comment, "เหตุผล");
  if (!comment.trim()) throw new HttpError(400, "กรุณาระบุเหตุผลที่ไม่อนุมัติ");

  const now = nowIso();
  const requests = await productRequestsCollection();
  await requests.updateOne({ _id: doc._id }, {
    $set: {
      status: "Rejected", rejectionComment: comment,
      reviewedBy: ctx.user.id, reviewedByName: ctx.user.fullName, reviewedAt: now.slice(0, 10),
      updatedAt: now,
    },
  });

  try {
    await notifyUser(doc.requestedBy, ctx.user.id, {
      type: "product_request_rejected",
      title: "คำขอเพิ่มสินค้าไม่ได้รับอนุมัติ",
      description: `"${doc.name}": ${comment}`,
      module: "คำขอเพิ่มสินค้า",
      related: { relatedProductRequestId: id },
    });
  } catch (err) {
    console.error("[product-requests] failed to notify the requester on rejection", err);
  }

  await writeAuditEntry(ctx, "Product Request Rejected", `ไม่อนุมัติคำขอเพิ่มสินค้า "${doc.name}": ${comment}`);
  res.status(200).json({ productRequest: toClient(await loadOrThrow(id)) });
}

async function handleDelete(req: ApiRequest, res: ApiResponse, id: string) {
  const ctx = await requirePermission(req, "productRequest:create");
  const doc = await loadOrThrow(id);
  const canReview = roleHasPermission(ctx.role, "productRequest:review");
  if (doc.requestedBy !== ctx.user.id && !canReview) throw new HttpError(403, "Forbidden");
  const requests = await productRequestsCollection();
  await requests.updateOne({ _id: doc._id }, { $set: { isDeleted: true, updatedAt: nowIso() } });
  await writeAuditEntry(ctx, "Product Request Deleted", `ลบคำขอเพิ่มสินค้า "${doc.name}"`);
  res.status(200).json({ ok: true });
}

async function handleOne(req: ApiRequest, res: ApiResponse, id: string) {
  if (req.method === "GET") {
    await requirePermission(req, "productRequest:view");
    res.status(200).json({ productRequest: toClient(await loadOrThrow(id)) });
    return;
  }
  if (req.method === "PATCH") return handleUpdate(req, res, id);
  if (req.method === "DELETE") return handleDelete(req, res, id);
  throw new HttpError(405, "Method not allowed");
}

export async function handleProductRequest(req: ApiRequest, res: ApiResponse) {
  await requireUser(req);
  const parts = getPathSegments(req, "/api/product-requests");
  if (parts.length === 0) {
    if (req.method === "POST") return handleCreate(req, res);
    return handleList(req, res);
  }
  if (parts.length === 1) return handleOne(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "approve") return handleApprove(req, res, parts[0]);
  if (parts.length === 2 && parts[1] === "reject") return handleReject(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
