import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt, { type JwtPayload } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { parseCookie, stringifySetCookie } from "cookie";
import { ObjectId } from "mongodb";
import { HttpError } from "./http.js";
import { randomUUID } from "node:crypto";
import { usersCollection, rolesCollection, sessionsCollection, toObjectId, toPublicUser, type PublicUser } from "./collections.js";
import { roleHasPermission, findRole } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import type { Role } from "../../src/lib/roles.js";

const COOKIE_NAME = "tcs_erp_session";
const SESSION_DAYS = 7;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET environment variable");
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/**
 * ── 1 user เข้าใช้ได้ทีละเครื่องเดียว (2026-08-31) ─────────────────────────────────────────────
 *
 * เจ้าของสั่งไว้ 2026-08-28: *"1 user จำกัดเข้าได้แค่ 1 คน"*
 *
 * เดิมเป็น JWT ล้วน payload มีแค่ `{ sub }` ใครถือคุกกี้ที่ยังไม่หมดอายุก็ใช้ได้ทั้งหมด ไม่มีอะไรฝั่ง
 * เซิร์ฟเวอร์ให้เพิกถอนได้เลย ตอนนี้ token พก `sid` (รหัสเซสชัน) เพิ่มมาด้วย และมีแถวใน `sessions`
 * คู่กับมัน — **เข้าสู่ระบบใหม่ = เซสชันเก่าของ user คนนั้นถูกยกเลิกทั้งหมด**
 *
 * ทำไมต้องเก็บใน DB ไม่ใช่หน่วยความจำ: หลาย instance ไม่แชร์หน่วยความจำกัน (เหตุผลเดียวกับที่
 * login rate limit เก็บลง `login_attempts`) และ cold start จะล้างทิ้ง
 *
 * **แถวเก่าถูก `revokedAt` ไม่ใช่ถูกลบ** — เครื่องที่โดนเตะต้องแยกออกได้ว่า "มีคนล็อกอินที่อื่น"
 * ไม่ใช่ "เซสชันหมดอายุ" สองอย่างนี้ต่างกันมากสำหรับคนที่กำลังงงว่าทำไมหลุด · TTL index บน
 * `expiresAt` เก็บกวาดแถวเก่าให้เอง
 *
 * ⚠️ **คุกกี้ที่ออกก่อน 2026-08-31 ไม่มี `sid`** จึงใช้ไม่ได้อีก — ทุกคนต้องเข้าสู่ระบบใหม่หนึ่งครั้ง
 * ตอนดีพลอย จงใจ: ยอมรับ token ไม่มี `sid` ต่อ แปลว่าใครที่ถือคุกกี้เก่าอยู่ข้ามข้อจำกัดนี้ได้อีก 7 วัน
 */
let sessionIndexesEnsured = false;
async function ensureSessionIndexes(): Promise<void> {
  if (sessionIndexesEnsured) return;
  try {
    const sessions = await sessionsCollection();
    await Promise.all([
      sessions.createIndex({ tokenId: 1 }, { unique: true }),
      sessions.createIndex({ userId: 1 }),
      // TTL — เก็บกวาดแถวที่หมดอายุ/ถูกยกเลิกทิ้งเอง ใช้ได้จริงเพราะ `expiresAt` เป็น Date แล้ว
      sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
  } catch (err) {
    // `ensureIndexes()` รันจากหน้าตั้งค่าครั้งแรกเท่านั้น ที่นี่จึงสร้างแบบ lazy เหมือนโมดูลอื่น
    console.error("[auth] ensureSessionIndexes failed", err);
  }
  sessionIndexesEnsured = true;
}

/**
 * เริ่มเซสชันใหม่ และ**ยกเลิกเซสชันอื่นทั้งหมดของผู้ใช้คนนี้** คืนรหัสเซสชันที่จะใส่ลง token
 *
 * ลำดับสำคัญ: ยกเลิกของเก่า**ก่อน**แล้วค่อยใส่ของใหม่ ไม่งั้นถ้าสองอย่างสลับกัน การล็อกอินจะยกเลิก
 * เซสชันที่ตัวเองเพิ่งสร้าง
 */
export async function startSession(userId: string, userAgent: string): Promise<string> {
  const sessions = await sessionsCollection();
  await ensureSessionIndexes();
  const now = new Date();
  await sessions.updateMany(
    { userId: toObjectId(userId), revokedAt: null },
    { $set: { revokedAt: now.toISOString(), revokedReason: "superseded" } },
  );
  const tokenId = randomUUID();
  await sessions.insertOne({
    userId: toObjectId(userId),
    tokenId,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    userAgent: (userAgent || "").slice(0, 300),
    revokedAt: null,
  });
  return tokenId;
}

/** กดออกจากระบบเอง — ยกเลิกเฉพาะเซสชันของเครื่องนี้ ไม่แตะเครื่องอื่น (ซึ่งตอนนี้ก็ไม่มีอยู่แล้ว) */
export async function endSession(req: VercelRequest): Promise<void> {
  const claims = readSessionClaims(req);
  if (!claims?.sid) return;
  const sessions = await sessionsCollection();
  await sessions.updateOne(
    { tokenId: claims.sid, revokedAt: null },
    { $set: { revokedAt: new Date().toISOString(), revokedReason: "logout" } },
  );
}

export function issueSessionCookie(res: VercelResponse, userId: string, sessionId: string) {
  const token = jwt.sign({ sub: userId, sid: sessionId }, getJwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
  res.setHeader(
    "Set-Cookie",
    stringifySetCookie({ name: COOKIE_NAME, value: token, ...cookieOptions(SESSION_DAYS * 24 * 60 * 60) }),
  );
}

export function clearSessionCookie(res: VercelResponse) {
  res.setHeader("Set-Cookie", stringifySetCookie({ name: COOKIE_NAME, value: "", ...cookieOptions(0) }));
}

/**
 * Rolling/sliding expiration: re-signs and re-issues the session cookie with a fresh SESSION_DAYS
 * window on every request that carries a still-valid token, so an active user is never logged out
 * mid-session. A token only ever reaches its `exp` (and thus 401s) after SESSION_DAYS have passed
 * with zero requests in between. No DB lookup here — cheap enough to run unconditionally per request.
 *
 * ⚠️ **ต้องพก `sid` ต่อไปด้วย** — ฟังก์ชันนี้ re-sign ทุก request ถ้า claim ไหนไม่ถูกก๊อปมา มันจะ
 * หายไปเงียบ ๆ ที่ request ถัดไป แล้วผู้ใช้จะหลุดออกจากระบบเองโดยไม่มีใครรู้สาเหตุ (จดกับดักข้อนี้
 * ไว้ใน TODO.md ตั้งแต่ก่อนเริ่มทำ)
 */
export function refreshSessionCookie(req: VercelRequest, res: VercelResponse) {
  const claims = readSessionClaims(req);
  if (!claims?.userId || !claims.sid) return;
  issueSessionCookie(res, claims.userId, claims.sid);
}

/** `{ sub, sid }` ของ token ปัจจุบัน — `null` ถ้าไม่มีคุกกี้ ลายเซ็นไม่ผ่าน หรือไม่มี `sid` */
function readSessionClaims(req: VercelRequest): { userId: string; sid: string } | null {
  const token = readSessionToken(req);
  if (!token) return null;
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  const sid = typeof payload.sid === "string" ? payload.sid : null;
  if (!userId || !sid) return null;
  return { userId, sid };
}

/**
 * ทำไมถึงหลุดออกจากระบบ — ใช้กับหน้าเข้าสู่ระบบเท่านั้น (`GET /api/auth/session`)
 *
 * `"superseded"` = บัญชีนี้ถูกเข้าสู่ระบบจากเครื่องอื่น · `null` = เหตุผลธรรมดา (หมดอายุ/ไม่เคยล็อกอิน/
 * กดออกเอง) ซึ่งไม่ต้องอธิบายอะไรเป็นพิเศษ
 */
export async function signedOutReason(req: VercelRequest): Promise<"superseded" | null> {
  const claims = readSessionClaims(req);
  if (!claims) return null;
  const sessions = await sessionsCollection();
  const row = await sessions.findOne({ tokenId: claims.sid });
  return row?.revokedReason === "superseded" ? "superseded" : null;
}

function readSessionToken(req: VercelRequest): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  return parseCookie(raw)[COOKIE_NAME] ?? null;
}

export interface AuthContext {
  user: PublicUser;
  role: Role | undefined;
}

/**
 * Re-fetches the user (and their role) from the DB on every request rather than trusting JWT
 * claims — this is what makes deactivating/editing a user take effect immediately instead of
 * only after their token expires.
 */
export async function getAuthContext(req: VercelRequest): Promise<AuthContext | null> {
  const claims = readSessionClaims(req);
  if (!claims || !ObjectId.isValid(claims.userId)) return null;
  const userId = claims.userId;

  // เซสชันต้องยังไม่ถูกยกเลิก — จุดต่อเดียวกับที่เช็ค `status !== "active"` อยู่แล้ว จึงมีผลทันที
  // ในหนึ่ง request ไม่ต้องรอ token หมดอายุ
  const sessions = await sessionsCollection();
  const row = await sessions.findOne({ tokenId: claims.sid });
  if (!row || row.revokedAt !== null || row.userId.toString() !== userId) return null;

  const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
  const doc = await users.findOne({ _id: toObjectId(userId) });
  if (!doc || doc.status !== "active") return null;

  const roleList = await roles.find({}).toArray();
  return { user: toPublicUser(doc), role: findRole(roleList, doc.roleKey) };
}

export async function requireUser(req: VercelRequest): Promise<AuthContext> {
  const ctx = await getAuthContext(req);
  if (!ctx) throw new HttpError(401, "Not authenticated");
  return ctx;
}

export async function requirePermission(req: VercelRequest, permission: Permission): Promise<AuthContext> {
  const ctx = await requireUser(req);
  if (!roleHasPermission(ctx.role, permission)) {
    throw new HttpError(403, "Forbidden");
  }
  return ctx;
}

/** Passes if the caller holds ANY of the given permissions — for a route two otherwise-unrelated
 * permission groups both need read access to (e.g. GET /api/products, needed by both Product
 * Library and the Stock page's stock:view-only holders). See RBAC.md "Permission dependencies".
 * Named distinctly from `quotationTemplatesHandler.ts`'s own module-local `requireAnyPermission()`
 * (different shape: sync, takes an already-resolved AuthContext) — same "any of" idea, unrelated
 * code, deliberately not sharing a name to avoid confusing the two at a glance. */
export async function requireOneOfPermissions(req: VercelRequest, permissions: Permission[]): Promise<AuthContext> {
  const ctx = await requireUser(req);
  if (!permissions.some((p) => roleHasPermission(ctx.role, p))) {
    throw new HttpError(403, "Forbidden");
  }
  return ctx;
}
