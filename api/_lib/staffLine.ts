import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser } from "./auth.js";
import { usersCollection, auditLogCollection, toObjectId } from "./collections.js";
import { generatePairingCode, PAIRING_CODE_TTL_MS } from "./lineHandler.js";
import { nowIso } from "../../src/lib/products.js";
import type { NotificationType } from "../../src/lib/notifications.js";

/**
 * แจ้งเตือนพนักงานทาง LINE (2026-10-08, Tuhmo #50) — OA "Huma-ERP แจ้งเตือน" **แยกจาก OA ลูกค้า**
 * (`lineHandler.ts`) ตามที่ตกลงไว้ตั้งแต่ 2026-08-24: รหัสผูกบัญชีของพนักงานกับของลูกค้าจะไม่มีทางชนกันในเว็บฮุคเดียว
 * และพนักงานไม่เห็น OA เดียวกับที่ลูกค้าใช้ · ตั้งค่าด้วย `LINE_STAFF_CHANNEL_ACCESS_TOKEN` / `LINE_STAFF_CHANNEL_SECRET`
 *
 * สามส่วน:
 * 1. **ผูกบัญชี** — พนักงานกด "เชื่อม LINE" ในหน้าตั้งค่า ได้รหัส (อายุ 24 ชม.) → เพิ่ม OA เป็นเพื่อน → พิมพ์รหัสในแชต →
 *    เว็บฮุค `POST /api/line/webhook/staff` จับคู่แล้วเก็บ `users.lineUserId` · ยกเลิกได้เองทุกเมื่อ
 * 2. **ส่งตามแจ้งเตือนในกระดิ่ง** — `pushStaffLineForNotifications()` ถูกเรียกจากจุดเดียว (`notificationDelivery.ts`)
 *    หลังบันทึกแจ้งเตือนลงฐานข้อมูลแล้ว ส่งเฉพาะประเภทใน `LINE_ACTION_TYPES` และเฉพาะคนที่ผูก LINE ไว้
 * 3. **ปุ่มในข้อความ** เปิด `${APP_URL}/?n=<id แจ้งเตือน>` — แอปอ่าน `n` แล้วพาไปเอกสารแบบเดียวกับกดแจ้งเตือนในกระดิ่ง
 *    (เอกสารที่เปิดอยู่ไม่ได้อยู่ใน URL ของแอปโดยตั้งใจ จึงชี้ผ่านแจ้งเตือนแทน)
 *
 * **ส่ง LINE พังต้องไม่ทำให้งานหลักพัง** — เอกสารถูกส่ง/อนุมัติไปแล้ว แจ้งเตือนในกระดิ่งถูกบันทึกแล้ว LINE เป็นแค่ช่องทางเสริม
 * ทุกความผิดพลาดจึงลง log แล้วกลืน · โควต้า OA ฟรี 300 ข้อความ/เดือน (เช็คแล้ว 2026-10-08) นับต่อคนที่รับ
 */

const LINE_API_BASE = "https://api.line.me/v2/bot";

/**
 * แจ้งเตือนที่ส่งเข้า LINE ด้วย — เจ้าของเลือก "เฉพาะเรื่องที่ต้องลงมือ" (2026-10-08) เพื่อประหยัดโควต้า:
 * มีเอกสารรอคุณอนุมัติ · เอกสารถูกส่งถึงคุณ/แผนกคุณ · คำขอกู้รหัสผ่าน · ผลอนุมัติ ปิดการขาย สต๊อกใกล้หมด ฯลฯ อยู่ในกระดิ่งอย่างเดียว
 */
export const LINE_ACTION_TYPES: ReadonlySet<NotificationType> = new Set<NotificationType>([
  // รออนุมัติ
  "quotation_submitted", "scope_of_work_submitted", "delivery_order_submitted",
  "material_requisition_submitted", "purchase_request_submitted", "job_order_submitted",
  "production_order_submitted", "purchase_order_submitted", "cost_control_submitted",
  "store_receipt_submitted", "vendor_submitted", "code_entry_submitted", "product_request_submitted",
  // ส่งถึงคุณ / แผนกคุณ ให้ทำงานต่อ
  "scope_of_work_document_sent", // ผู้รับเอกสาร Scope of Work
  "delivery_order_sent_to_department", // ใบส่งมอบส่งถึงแผนก
  "material_requisition_approved", // ใบเบิกอนุมัติแล้ว → สโตร์จ่ายของ
  "purchase_request_approved", // ใบขอซื้อ → สโตร์เช็คของ / จัดซื้อสั่งซื้อ
  "scope_of_work_po_chase", // ถูกขอให้ทวงเลข PO จากลูกค้า
  "password_reset_requested",
]);

export function isStaffLineConfigured(): boolean {
  return (process.env.LINE_STAFF_CHANNEL_ACCESS_TOKEN ?? "").trim() !== "";
}

async function callStaffLineApi(path: string, init: { method: "GET" | "POST"; payload?: unknown }): Promise<unknown> {
  const token = (process.env.LINE_STAFF_CHANNEL_ACCESS_TOKEN ?? "").trim();
  if (!token) throw new Error("LINE_STAFF_CHANNEL_ACCESS_TOKEN is not configured");
  const resp = await fetch(`${LINE_API_BASE}${path}`, {
    method: init.method,
    headers: { authorization: `Bearer ${token}`, ...(init.payload === undefined ? {} : { "content-type": "application/json" }) },
    body: init.payload === undefined ? undefined : JSON.stringify(init.payload),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`LINE staff API ${path} failed: ${resp.status} ${detail.slice(0, 300)}`);
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

async function replyStaffLine(replyToken: string, text: string): Promise<void> {
  if (!isStaffLineConfigured()) return;
  try {
    await callStaffLineApi("/message/reply", { method: "POST", payload: { replyToken, messages: [{ type: "text", text }] } });
  } catch (err) {
    console.error("[line-staff] reply failed", err);
  }
}

function appBaseUrl(): string {
  return (process.env.APP_URL || "https://www.huma-erp.com").replace(/\/+$/, "");
}

/** ลิงก์ในปุ่ม — แอปอ่าน `?n=` แล้วพาไปเอกสารของแจ้งเตือนนั้น (ดู `src/lib/notificationDeepLink.ts`) */
export function notificationLink(notificationId: string): string {
  return `${appBaseUrl()}/?n=${encodeURIComponent(notificationId)}`;
}

/** การ์ดแจ้งเตือนสีกรมท่า/ทองแบบเดียวกับ OA ลูกค้า · ปุ่มเดียว "เปิดในระบบ" */
export function buildStaffNotificationFlex(input: { title: string; description: string; module: string; link: string }): unknown {
  return {
    type: "flex",
    altText: input.title.slice(0, 400),
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#0b1d3a", paddingAll: "16px", spacing: "xs",
        contents: [
          { type: "text", text: input.module || "Huma-ERP", size: "xs", weight: "bold", color: "#c9a84c" },
          { type: "text", text: input.title || "มีแจ้งเตือนใหม่", size: "md", weight: "bold", color: "#ffffff", wrap: true },
        ],
      },
      body: {
        type: "box", layout: "vertical",
        contents: [{ type: "text", text: input.description || "-", size: "sm", color: "#1a1a1a", wrap: true }],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: "#0b1d3a", height: "sm",
          action: { type: "uri", label: "เปิดในระบบ", uri: input.link },
        }],
      },
    },
  };
}

export interface DeliveredNotification {
  id: string;
  recipientUserId: string;
  type: NotificationType;
  title: string;
  description: string;
  module: string;
}

/**
 * ส่ง LINE ตามแจ้งเตือนที่เพิ่งบันทึก — กรองประเภท → หาคนที่ผูก LINE ไว้ (query เดียว) → push ทีละคน
 * (ลิงก์ในปุ่มชี้แจ้งเตือนของแต่ละคน จึง multicast ไม่ได้) · ไม่ throw เด็ดขาด
 *
 * @returns จำนวนข้อความที่ส่งสำเร็จ (ไว้ให้เทสต์และ log)
 */
export async function pushStaffLineForNotifications(delivered: DeliveredNotification[]): Promise<number> {
  try {
    if (!isStaffLineConfigured()) return 0;
    const wanted = delivered.filter((n) => LINE_ACTION_TYPES.has(n.type) && n.recipientUserId);
    if (wanted.length === 0) return 0;
    const ids = [...new Set(wanted.map((n) => n.recipientUserId))]
      .map((id) => { try { return toObjectId(id); } catch { return null; } })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const users = await usersCollection();
    const linked = await users
      .find({ _id: { $in: ids }, status: "active", lineUserId: { $type: "string", $ne: "" } }, { projection: { lineUserId: 1 } })
      .toArray();
    const lineIdOf = new Map(linked.map((u) => [u._id.toString(), u.lineUserId as string]));
    let sent = 0;
    for (const n of wanted) {
      const to = lineIdOf.get(n.recipientUserId);
      if (!to) continue;
      try {
        await callStaffLineApi("/message/push", {
          method: "POST",
          payload: { to, messages: [buildStaffNotificationFlex({ title: n.title, description: n.description, module: n.module, link: notificationLink(n.id) })] },
        });
        sent++;
      } catch (err) {
        // โควต้าเต็ม (429) / ผู้ใช้บล็อก OA / token หมดอายุ — แจ้งเตือนในกระดิ่งยังอยู่ ไม่ต้องทำอะไรต่อ
        console.error(`[line-staff] push failed for user ${n.recipientUserId} (${n.type})`, err);
      }
    }
    return sent;
  } catch (err) {
    console.error("[line-staff] push pipeline failed", err);
    return 0;
  }
}

// ─── ข้อมูล OA สำหรับหน้าตั้งค่า (ชื่อ / @basicId / ลิงก์เพิ่มเพื่อน) ─────────────────────────────

let botInfoCache: { at: number; displayName: string; basicId: string } | null = null;
const BOT_INFO_TTL_MS = 60 * 60 * 1000;

async function staffBotInfo(): Promise<{ displayName: string; basicId: string } | null> {
  if (!isStaffLineConfigured()) return null;
  if (botInfoCache && Date.now() - botInfoCache.at < BOT_INFO_TTL_MS) return botInfoCache;
  try {
    const info = (await callStaffLineApi("/info", { method: "GET" })) as { displayName?: string; basicId?: string };
    botInfoCache = { at: Date.now(), displayName: info.displayName ?? "", basicId: info.basicId ?? "" };
    return botInfoCache;
  } catch (err) {
    console.error("[line-staff] bot info failed", err);
    return null;
  }
}

/** สถานะของผู้ใช้คนที่ล็อกอิน — ไม่เคยส่ง `lineUserId` ออกไป (เป็นตัวระบุตัวตนของ LINE ใช้ส่งข้อความได้) */
async function statusFor(userId: string): Promise<Record<string, unknown>> {
  const users = await usersCollection();
  const me = await users.findOne({ _id: toObjectId(userId) }, { projection: { lineUserId: 1, lineLinkedAt: 1, linePairing: 1 } });
  const bot = await staffBotInfo();
  const pairing = me?.linePairing && me.linePairing.expiresAt > nowIso() ? me.linePairing : null;
  return {
    configured: isStaffLineConfigured(),
    linked: typeof me?.lineUserId === "string" && me.lineUserId !== "",
    linkedAt: me?.lineLinkedAt ?? "",
    pairing,
    oaName: bot?.displayName ?? "",
    oaBasicId: bot?.basicId ?? "",
    addFriendUrl: bot?.basicId ? `https://line.me/R/ti/p/${encodeURIComponent(bot.basicId)}` : "",
  };
}

async function writeAudit(userId: string, userName: string, action: string, details: string): Promise<void> {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({ userId, userName, roleName: "", module: "ผู้ใช้", action, details, createdAt: nowIso() });
}

/**
 * `/api/line/staff/*` — ของผู้ใช้ที่ล็อกอินอยู่เท่านั้น (ผูก LINE ให้คนอื่นไม่ได้):
 * `GET /me` สถานะ · `POST /pairing` ออกรหัสใหม่ · `DELETE /me` เลิกเชื่อม
 */
export async function handleStaffLine(req: ApiRequest, res: ApiResponse): Promise<void> {
  const parts = getPathSegments(req, "/api/line/staff");
  const ctx = await requireUser(req);
  const users = await usersCollection();

  if (parts.length === 1 && parts[0] === "me") {
    if (req.method === "GET") { res.status(200).json(await statusFor(ctx.user.id)); return; }
    if (req.method === "DELETE") {
      await users.updateOne({ _id: toObjectId(ctx.user.id) }, { $set: { lineUserId: "", lineLinkedAt: "", updatedAt: nowIso() }, $unset: { linePairing: "" } });
      await writeAudit(ctx.user.id, ctx.user.fullName, "Staff LINE Unlinked", `${ctx.user.fullName} เลิกเชื่อม LINE แจ้งเตือน`);
      res.status(200).json(await statusFor(ctx.user.id));
      return;
    }
    throw new HttpError(405, "Method not allowed");
  }
  if (parts.length === 1 && parts[0] === "pairing") {
    if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
    if (!isStaffLineConfigured()) throw new HttpError(503, "ยังไม่ได้ตั้งค่า LINE แจ้งเตือนของบริษัท — ติดต่อผู้ดูแลระบบ");
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS).toISOString();
    await users.updateOne({ _id: toObjectId(ctx.user.id) }, { $set: { linePairing: { code, expiresAt }, updatedAt: nowIso() } });
    res.status(200).json(await statusFor(ctx.user.id));
    return;
  }
  throw new HttpError(404, "Not found");
}

// ─── Webhook ─────────────────────────────────────────────────────────────────────────────────

function signatureMatches(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("base64"));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** "tcs 4 8 2 1 x" → "TCS4821X" — พิมพ์มีช่องว่าง/ขีด/ตัวเล็กก็จับคู่ได้ */
function normalizeAttempt(text: string): string {
  return text.toUpperCase().replace(/[\s-]+/g, "");
}

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
};

/** `POST /api/line/webhook/staff` — Webhook URL ของ OA พนักงานชี้มาที่นี่ (ต้องมี raw body สำหรับตรวจลายเซ็น) */
export async function handleStaffLineWebhook(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const secret = (process.env.LINE_STAFF_CHANNEL_SECRET ?? "").trim();
  if (!secret) { res.status(200).json({ ok: true }); return; }

  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const signature = req.headers["x-line-signature"];
  if (!rawBody || typeof signature !== "string" || !signatureMatches(rawBody, signature, secret)) {
    throw new HttpError(403, "Bad signature");
  }

  const events: LineEvent[] = Array.isArray((req.body as { events?: unknown } | undefined)?.events)
    ? (req.body as { events: LineEvent[] }).events
    : [];
  const users = await usersCollection();

  for (const event of events) {
    const lineUserId = event.source?.userId ?? "";
    if (event.type === "follow" && event.replyToken) {
      await replyStaffLine(event.replyToken,
        "สวัสดีครับ นี่คือ LINE แจ้งเตือนของระบบ Huma-ERP\nเปิดระบบ → ตั้งค่า → การแจ้งเตือน → กด \"เชื่อม LINE\" แล้วพิมพ์รหัสที่ได้ (ขึ้นต้นด้วย TCS-) ในแชตนี้ได้เลยครับ");
      continue;
    }
    // บล็อก/ลบ OA = เลิกส่งให้คนนั้น (ส่งไปก็ไม่ถึงอยู่ดี และกินโควต้าเปล่า ๆ)
    if (event.type === "unfollow" && lineUserId) {
      await users.updateMany({ lineUserId }, { $set: { lineUserId: "", lineLinkedAt: "" } });
      continue;
    }
    if (event.type !== "message" || event.message?.type !== "text" || !lineUserId) continue;
    const attempt = normalizeAttempt(event.message.text ?? "");
    if (!/^TCS[A-Z0-9]{4,8}$/.test(attempt)) continue; // แชตทั่วไปไม่ต้องตอบ

    const candidates = await users
      .find({ "linePairing.expiresAt": { $gt: nowIso() }, status: "active" }, { projection: { fullName: 1, linePairing: 1 } })
      .toArray();
    const match = candidates.find((u) => u.linePairing && normalizeAttempt(u.linePairing.code) === attempt);
    if (!match) {
      if (event.replyToken) await replyStaffLine(event.replyToken, "รหัสไม่ถูกต้องหรือหมดอายุแล้ว — กด \"เชื่อม LINE\" ในหน้าตั้งค่าเพื่อขอรหัสใหม่ครับ");
      continue;
    }
    // LINE หนึ่งบัญชีผูกได้กับผู้ใช้คนเดียว — ถ้าเคยผูกกับบัญชีอื่น (เช่นบัญชีทดสอบ) ย้ายมาที่คนนี้
    await users.updateMany({ lineUserId, _id: { $ne: match._id } }, { $set: { lineUserId: "", lineLinkedAt: "" } });
    await users.updateOne({ _id: match._id }, { $set: { lineUserId, lineLinkedAt: nowIso(), updatedAt: nowIso() }, $unset: { linePairing: "" } });
    await writeAudit(match._id.toString(), match.fullName, "Staff LINE Linked", `${match.fullName} เชื่อม LINE แจ้งเตือนสำเร็จ (ผ่านรหัสจับคู่)`);
    if (event.replyToken) {
      await replyStaffLine(event.replyToken, `เชื่อม LINE กับบัญชี "${match.fullName}" เรียบร้อยแล้วครับ\nเมื่อมีเอกสารรอคุณอนุมัติหรือถูกส่งถึงคุณ ระบบจะแจ้งในแชตนี้`);
    }
  }
  res.status(200).json({ ok: true });
}
