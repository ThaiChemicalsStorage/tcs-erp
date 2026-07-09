import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { usersCollection, ensureIndexes, toPublicUser } from "../_lib/collections.js";
import { hashPassword, verifyPassword, issueSessionCookie, clearSessionCookie, getAuthContext } from "../_lib/auth.js";
import { seedDefaultRolesIfEmpty } from "../_lib/rbacSeed.js";
import { seedSystemDataIfEmpty } from "../_lib/systemSeed.js";
import { defaultRoles } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleSession(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await getAuthContext(req);
  if (ctx) {
    res.status(200).json({ user: ctx.user, needsSetup: false });
    return;
  }
  const users = await usersCollection();
  const count = await users.estimatedDocumentCount();
  res.status(200).json({ user: null, needsSetup: count === 0 });
}

async function handleSetup(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const users = await usersCollection();
  const existing = await users.estimatedDocumentCount();
  if (existing > 0) throw new HttpError(409, "ตั้งค่าเริ่มต้นระบบไปแล้ว");

  const body = req.body ?? {};
  const { employeeId, fullName, username, email, password } = body;
  if (!employeeId?.trim() || !fullName?.trim() || !username?.trim() || !email?.trim() || !password) {
    throw new HttpError(400, "กรุณากรอกข้อมูลให้ครบทุกช่อง");
  }
  if (password.length < 6) throw new HttpError(400, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");

  await ensureIndexes();
  await seedDefaultRolesIfEmpty();
  await seedSystemDataIfEmpty();
  const superAdminRole = defaultRoles.find((r) => r.isSuperAdmin) ?? defaultRoles[0];

  const now = nowIso();
  const passwordHash = await hashPassword(password);
  const insertResult = await users.insertOne({
    employeeId: employeeId.trim(),
    fullName: fullName.trim(),
    username: username.trim(),
    email: email.trim(),
    passwordHash,
    phone: "",
    department: "",
    position: "",
    roleKey: superAdminRole.key,
    status: "active",
    profilePictureDataUrl: "",
    signatureDataUrl: "",
    createdAt: now,
    updatedAt: now,
  });
  const doc = await users.findOne({ _id: insertResult.insertedId });
  if (!doc) throw new HttpError(500, "Failed to create user");

  issueSessionCookie(res, doc._id.toString());
  res.status(201).json({ user: toPublicUser(doc) });
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const { identifier, password } = req.body ?? {};
  if (!identifier?.trim() || !password) throw new HttpError(400, "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");

  const users = await usersCollection();
  const needle = escapeRegExp(identifier.trim());
  const re = new RegExp(`^${needle}$`, "i");
  const doc = await users.findOne({ $or: [{ username: re }, { email: re }] });

  if (!doc || !(await verifyPassword(password, doc.passwordHash))) {
    throw new HttpError(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }
  if (doc.status === "inactive") {
    throw new HttpError(403, "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
  }

  issueSessionCookie(res, doc._id.toString());
  res.status(200).json({ user: toPublicUser(doc) });
}

async function handleLogout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  clearSessionCookie(res);
  res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(res, async () => {
    const [path] = getPathSegments(req, "/api/auth");

    if (path === "session") return handleSession(req, res);
    if (path === "setup") return handleSetup(req, res);
    if (path === "login") return handleLogin(req, res);
    if (path === "logout") return handleLogout(req, res);
    throw new HttpError(404, "Not found");
  });
}
