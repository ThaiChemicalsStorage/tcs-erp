import type { ApiRequest, ApiResponse } from "./httpTypes.js";
import { randomInt } from "node:crypto";
import { HttpError } from "./http.js";
import { requireUser, hashPassword, type AuthContext } from "./auth.js";
import {
  usersCollection, rolesCollection, sessionsCollection, auditLogCollection,
  passwordResetRequestsCollection, passwordResetAttemptsCollection, toObjectId, withStringId,
  type PasswordResetRequestFields,
} from "./collections.js";
import { notifyUsers } from "./departmentNotify.js";
import { nowIso } from "../../src/lib/products.js";
import type { PasswordResetRequest } from "../../src/lib/passwordResets.js";

/**
 * กู้รหัสผ่านผ่าน Super Admin (2026-09-24) — ดูเหตุผลและขั้นตอนใน `src/lib/passwordResets.ts`
 *
 *  - `POST /api/auth/forgot-password` (ไม่ต้องล็อกอิน) — `handleForgotPassword()` เรียกจาก `api/handlers/auth.ts`
 *  - `GET  /api/users/password-resets` · `POST /api/users/password-resets/:id/issue` · `POST …/:id/dismiss`
 *    — Super Admin เท่านั้น (`isSuperAdmin` ของบทบาท ไม่ใช่สิทธิ์ที่ติ๊กให้ใครก็ได้ ตามที่เจ้าของสั่ง
 *    "จะมีแค่ Super admin ที่สามารถดูรหัสผ่านได้")
 *
 * **ตัวรหัสชั่วคราวไม่ถูกเก็บที่ไหนเลย** — สุ่ม → hash ลง `users` → ส่งกลับใน response ครั้งเดียว ไม่ลง audit log/แจ้งเตือน
 */

const ATTEMPT_WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS_PER_IP = 5;
/** ไม่มี 0/O/1/l/I — อ่านออกเสียงบอกกันทางโทรศัพท์ได้ไม่พลาด */
const TEMP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const TEMP_LENGTH = 10;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requestIp(req: ApiRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd ?? "").split(",")[0].trim();
  return first || req.socket?.remoteAddress || "unknown";
}

export function generateTemporaryPassword(): string {
  let out = "";
  for (let i = 0; i < TEMP_LENGTH; i += 1) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  // รับประกันว่ามีตัวเลขอย่างน้อยหนึ่งตัว — กันรหัสที่ดูเหมือนคำ
  return /[2-9]/.test(out) ? out : `${out.slice(0, -1)}${TEMP_ALPHABET[TEMP_ALPHABET.length - 1 - randomInt(8)]}`;
}

let attemptIndexesEnsured = false;
async function ensureAttemptIndexes() {
  if (attemptIndexesEnsured) return;
  const attempts = await passwordResetAttemptsCollection();
  await Promise.all([
    attempts.createIndex({ createdAt: 1 }, { expireAfterSeconds: ATTEMPT_WINDOW_SECONDS }),
    attempts.createIndex({ ip: 1, createdAt: 1 }),
  ]);
  const requests = await passwordResetRequestsCollection();
  await requests.createIndex({ userId: 1, status: 1 });
  attemptIndexesEnsured = true;
}

async function superAdminIds(): Promise<string[]> {
  const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
  const superKeys = (await roles.find({ isSuperAdmin: true }).toArray()).map((r) => r.key);
  if (superKeys.length === 0) return [];
  const docs = await users.find({ status: "active", roleKey: { $in: superKeys } }, { projection: { _id: 1 } }).toArray();
  return docs.map((d) => d._id.toString());
}

/**
 * ผู้ใช้กด "ลืมรหัสผ่าน" — **ตอบ 200 เหมือนกันทุกกรณี** (มี/ไม่มีชื่อนี้ · บัญชีถูกระงับ) ไม่งั้นหน้านี้กลายเป็นเครื่องเดาชื่อผู้ใช้
 * จำกัด 5 ครั้งต่อ IP ต่อ 15 นาที · ขอซ้ำระหว่างที่คำขอเดิมยังค้าง = อัปเดตแถวเดิม (ไม่แจ้งเตือนซ้ำ)
 */
export async function handleForgotPassword(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const body = (req.body ?? {}) as Record<string, unknown>;
  const identifier = typeof body.identifier === "string" ? body.identifier.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  if (!identifier) throw new HttpError(400, "กรุณากรอกชื่อผู้ใช้หรืออีเมล");
  if (identifier.length > 200) throw new HttpError(400, "ชื่อผู้ใช้หรืออีเมลยาวเกินไป");

  await ensureAttemptIndexes();
  const attempts = await passwordResetAttemptsCollection();
  const ip = requestIp(req);
  const cutoff = new Date(Date.now() - ATTEMPT_WINDOW_SECONDS * 1000);
  if ((await attempts.countDocuments({ ip, createdAt: { $gte: cutoff } })) >= MAX_ATTEMPTS_PER_IP) {
    throw new HttpError(429, "ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ หรือติดต่อผู้ดูแลระบบโดยตรง");
  }
  await attempts.insertOne({ ip, createdAt: new Date() });

  const users = await usersCollection();
  const re = new RegExp(`^${escapeRegExp(identifier)}$`, "i");
  const user = await users.findOne({ $or: [{ username: re }, { email: re }] });
  if (user && user.status === "active") {
    const requests = await passwordResetRequestsCollection();
    const now = nowIso();
    const userId = user._id.toString();
    const pending = await requests.findOne({ userId, status: "pending" });
    if (pending) {
      await requests.updateOne({ _id: pending._id }, {
        $set: { lastRequestedAt: now, requesterIp: ip, identifier, ...(note ? { note } : {}) },
        $inc: { requestCount: 1 },
      });
    } else {
      const doc: PasswordResetRequestFields = {
        userId, fullName: user.fullName, username: user.username, employeeId: user.employeeId, department: user.department ?? "",
        identifier, note, status: "pending", requestedAt: now, lastRequestedAt: now, requestCount: 1, requesterIp: ip,
      };
      const inserted = await requests.insertOne(doc);
      try {
        const sent = await notifyUsers(await superAdminIds(), userId, {
          type: "password_reset_requested",
          title: "มีคำขอกู้รหัสผ่าน",
          description: `${user.fullName} (${user.username}) ขอรหัสผ่านใหม่${note ? ` — ${note}` : ""}`,
          module: "ผู้ใช้งาน",
          related: { relatedPasswordResetRequestId: inserted.insertedId.toString() },
        });
        if (sent === 0) console.warn("[password-reset] request recorded but no active Super Admin to notify");
      } catch (err) {
        console.error("[password-reset] failed to notify Super Admins", err);
      }
    }
  }
  res.status(200).json({ ok: true });
}

async function requireSuperAdmin(req: ApiRequest): Promise<AuthContext> {
  const ctx = await requireUser(req);
  if (!ctx.role?.isSuperAdmin) throw new HttpError(403, "เฉพาะ Super Admin เท่านั้น");
  return ctx;
}

function toClient(doc: PasswordResetRequestFields & { _id: import("mongodb").ObjectId }): PasswordResetRequest {
  return withStringId(doc);
}

async function loadRequest(id: string) {
  const requests = await passwordResetRequestsCollection();
  const doc = await requests.findOne({ _id: toObjectId(id) });
  if (!doc) throw new HttpError(404, "ไม่พบคำขอกู้รหัสผ่าน");
  return doc;
}

async function writeAudit(ctx: AuthContext, action: string, details: string) {
  const auditLog = await auditLogCollection();
  await auditLog.insertOne({
    userId: ctx.user.id, userName: ctx.user.fullName, roleName: ctx.role?.name ?? ctx.user.roleKey,
    module: "ผู้ใช้งาน", action, details, createdAt: nowIso(),
  });
}

/** `/api/users/password-resets[/:id/(issue|dismiss)]` — `parts` ไม่รวม "password-resets" */
export async function handlePasswordResets(req: ApiRequest, res: ApiResponse, parts: string[]) {
  const ctx = await requireSuperAdmin(req);
  const requests = await passwordResetRequestsCollection();

  if (parts.length === 0) {
    if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
    const [pending, done] = await Promise.all([
      requests.find({ status: "pending" }).sort({ lastRequestedAt: -1 }).toArray(),
      requests.find({ status: { $ne: "pending" } }).sort({ resolvedAt: -1 }).limit(100).toArray(),
    ]);
    res.status(200).json({ requests: [...pending, ...done].map(toClient) });
    return;
  }

  if (parts.length === 2 && req.method === "POST" && (parts[1] === "issue" || parts[1] === "dismiss")) {
    const doc = await loadRequest(parts[0]);
    if (doc.status !== "pending") throw new HttpError(409, "คำขอนี้ดำเนินการไปแล้ว");
    const now = nowIso();
    const resolved = { resolvedAt: now, resolvedBy: ctx.user.id, resolvedByName: ctx.user.fullName };

    if (parts[1] === "dismiss") {
      await requests.updateOne({ _id: doc._id }, { $set: { status: "dismissed", ...resolved } });
      await writeAudit(ctx, "Password Reset Dismissed", `ปิดคำขอกู้รหัสผ่านของ ${doc.fullName} (${doc.username}) โดยไม่ออกรหัสใหม่`);
      res.status(200).json({ request: toClient({ ...doc, status: "dismissed", ...resolved }) });
      return;
    }

    const users = await usersCollection();
    const user = await users.findOne({ _id: toObjectId(doc.userId) });
    if (!user) throw new HttpError(404, "ไม่พบผู้ใช้งานของคำขอนี้แล้ว — ปิดคำขอแทน");
    if (user.status !== "active") throw new HttpError(400, "บัญชีนี้ถูกระงับการใช้งาน — เปิดใช้งานบัญชีก่อนจึงจะออกรหัสใหม่ได้");

    const temporaryPassword = generateTemporaryPassword();
    await users.updateOne({ _id: user._id }, {
      $set: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, updatedAt: now },
    });
    // รหัสเดิมอาจรั่ว (เหตุผลหนึ่งที่คนมาขอ) — ตัดทุกเครื่องที่ยังค้างเซสชันอยู่
    const sessions = await sessionsCollection();
    await sessions.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: now, revokedReason: "password_reset" } });
    await requests.updateOne({ _id: doc._id }, { $set: { status: "resolved", ...resolved } });
    await writeAudit(ctx, "Password Reset Issued", `ออกรหัสผ่านชั่วคราวให้ ${user.fullName} (${user.username}) — ผู้ใช้ต้องตั้งรหัสใหม่เมื่อเข้าสู่ระบบ`);
    res.status(200).json({ temporaryPassword, request: toClient({ ...doc, status: "resolved", ...resolved }) });
    return;
  }

  throw new HttpError(404, "Not found");
}
