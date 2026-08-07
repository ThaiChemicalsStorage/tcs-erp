import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Collection, WithId } from "mongodb";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requireUser, requirePermission, hashPassword, verifyPassword } from "../_lib/auth.js";
import { usersCollection, rolesCollection, toObjectId, toPublicUser, type UserFields } from "../_lib/collections.js";
import { findRole, roleHasPermission } from "../../src/lib/roles.js";
import type { Role } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";
import { validateImageDataUrl } from "../_lib/uploadValidation.js";

async function activeSuperAdminCount(users: Collection<UserFields>, roleList: Role[]): Promise<number> {
  const superAdminKeys = roleList.filter((r) => r.isSuperAdmin).map((r) => r.key);
  if (superAdminKeys.length === 0) return 0;
  return users.countDocuments({ status: "active", roleKey: { $in: superAdminKeys } });
}

async function isLastActiveSuperAdmin(
  users: Collection<UserFields>,
  roleList: Role[],
  target: WithId<UserFields>,
): Promise<boolean> {
  const targetRole = findRole(roleList, target.roleKey);
  if (target.status !== "active" || !targetRole?.isSuperAdmin) return false;
  return (await activeSuperAdminCount(users, roleList)) <= 1;
}

async function countUsersWithSuperAdminRole(users: Collection<UserFields>, roleList: Role[]): Promise<number> {
  const superAdminKeys = roleList.filter((r) => r.isSuperAdmin).map((r) => r.key);
  if (superAdminKeys.length === 0) return 0;
  return users.countDocuments({ roleKey: { $in: superAdminKeys } });
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Any authenticated user can see the full directory (phone/email/department/position/profile
    // picture/signature image, everything but passwordHash) — matches Phase 1 behavior, where the
    // full user list already lived in every signed-in user's browser. Flagged as a Medium finding
    // by the 2026-07-10 Codex review ("exposes broader data than a minimum-access model"). Not
    // narrowed here: `users` is genuinely relied on app-wide for things that need real data from
    // *any* user, not just admins — salesperson pickers, printed-quote preparer/approver signature
    // images (any `quotations:view` holder can open/print any quote), avatar pictures in lists —
    // and this is a single-company internal tool (not multi-tenant), where staff-directory
    // visibility across the whole org is a defensible default, not obviously wrong. Restricting
    // fields risks silently breaking one of those call sites without a full trace of every
    // consumer. Marked in TODO.md as a privacy-model decision needing explicit sign-off (least-
    // privilege field-level restriction vs. accept the current "any signed-in employee, no PII
    // secrets" model) rather than guessed at here.
    await requireUser(req);
    const users = await usersCollection();
    const docs = await users.find({}).sort({ fullName: 1 }).toArray();
    res.status(200).json({ users: docs.map(toPublicUser) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "users:manage");
    const body = req.body ?? {};
    const { employeeId, fullName, username, email, password, roleKey } = body;
    const phone: string = typeof body.phone === "string" ? body.phone : "";
    const department: string = typeof body.department === "string" ? body.department : "";
    const position: string = typeof body.position === "string" ? body.position : "";

    if (!employeeId?.trim() || !fullName?.trim() || !username?.trim() || !email?.trim() || !roleKey) {
      throw new HttpError(400, "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน");
    }
    if (!password || password.length < 6) throw new HttpError(400, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");

    const roles = await rolesCollection();
    const roleList = await roles.find({}).toArray();
    const role = findRole(roleList, roleKey);
    if (!role) throw new HttpError(400, "ไม่พบบทบาทที่เลือก");
    if (role.isSuperAdmin && !ctx.role?.isSuperAdmin) {
      throw new HttpError(403, "ไม่สามารถกำหนดบทบาท Super Admin ได้");
    }

    const users = await usersCollection();
    if (await users.findOne({ employeeId: employeeId.trim() })) throw new HttpError(409, "รหัสพนักงานนี้มีผู้ใช้งานแล้ว");
    if (await users.findOne({ username: username.trim() })) throw new HttpError(409, "ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว");
    if (await users.findOne({ email: email.trim() })) throw new HttpError(409, "อีเมลนี้มีผู้ใช้งานแล้ว");

    const now = nowIso();
    const passwordHash = await hashPassword(password);
    const insertResult = await users.insertOne({
      employeeId: employeeId.trim(),
      fullName: fullName.trim(),
      username: username.trim(),
      email: email.trim(),
      passwordHash,
      phone: phone.trim(),
      department: department.trim(),
      position: position.trim(),
      roleKey,
      status: body.status === "inactive" ? "inactive" : "active",
      profilePictureDataUrl: "",
      signatureDataUrl: "",
      createdAt: now,
      updatedAt: now,
    });
    const doc = await users.findOne({ _id: insertResult.insertedId });
    if (!doc) throw new HttpError(500, "Failed to create user");
    res.status(201).json({ user: toPublicUser(doc) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requireUser(req);
  const isSelf = ctx.user.id === id;
  const canManage = roleHasPermission(ctx.role, "users:manage");
  if (!isSelf && !canManage) throw new HttpError(403, "Forbidden");

  const users = await usersCollection();
  const objectId = toObjectId(id);
  const target = await users.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบผู้ใช้งาน");

  if (req.method === "PATCH") {
    const body = req.body ?? {};
    const update: Record<string, unknown> = {};

    if (typeof body.fullName === "string" && body.fullName.trim()) update.fullName = body.fullName.trim();
    if (typeof body.phone === "string") update.phone = body.phone.trim();
    if (typeof body.department === "string") update.department = body.department.trim();
    if (typeof body.position === "string") update.position = body.position.trim();
    if (typeof body.profilePictureDataUrl === "string") update.profilePictureDataUrl = validateImageDataUrl(body.profilePictureDataUrl, "รูปโปรไฟล์");
    if (typeof body.signatureDataUrl === "string") update.signatureDataUrl = validateImageDataUrl(body.signatureDataUrl, "ลายเซ็น");

    if (typeof body.password === "string" && body.password) {
      if (body.password.length < 6) throw new HttpError(400, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
      if (isSelf) {
        if (typeof body.currentPassword !== "string" || !(await verifyPassword(body.currentPassword, target.passwordHash))) {
          throw new HttpError(400, "รหัสผ่านปัจจุบันไม่ถูกต้อง");
        }
      } else if (!canManage) {
        throw new HttpError(403, "Forbidden");
      }
      update.passwordHash = await hashPassword(body.password);
    }

    if (canManage) {
      const roles = await rolesCollection();
      const roleList = await roles.find({}).toArray();

      if (typeof body.employeeId === "string" && body.employeeId.trim()) {
        const dup = await users.findOne({ _id: { $ne: objectId }, employeeId: body.employeeId.trim() });
        if (dup) throw new HttpError(409, "รหัสพนักงานนี้มีผู้ใช้งานแล้ว");
        update.employeeId = body.employeeId.trim();
      }
      if (typeof body.username === "string" && body.username.trim()) {
        const dup = await users.findOne({ _id: { $ne: objectId }, username: body.username.trim() });
        if (dup) throw new HttpError(409, "ชื่อผู้ใช้นี้มีผู้ใช้งานแล้ว");
        update.username = body.username.trim();
      }
      if (typeof body.email === "string" && body.email.trim()) {
        const dup = await users.findOne({ _id: { $ne: objectId }, email: body.email.trim() });
        if (dup) throw new HttpError(409, "อีเมลนี้มีผู้ใช้งานแล้ว");
        update.email = body.email.trim();
      }
      if (typeof body.roleKey === "string" && body.roleKey !== target.roleKey) {
        if (isSelf) throw new HttpError(400, "ไม่สามารถเปลี่ยนบทบาทของบัญชีตนเองได้");
        const nextRole = findRole(roleList, body.roleKey);
        if (!nextRole) throw new HttpError(400, "ไม่พบบทบาทที่เลือก");
        if (nextRole.isSuperAdmin && !ctx.role?.isSuperAdmin) throw new HttpError(403, "ไม่สามารถกำหนดบทบาท Super Admin ได้");
        if (!nextRole.isSuperAdmin && (await isLastActiveSuperAdmin(users, roleList, target))) {
          throw new HttpError(400, "ไม่สามารถเปลี่ยนบทบาทของ Super Admin คนสุดท้ายที่ใช้งานอยู่ได้");
        }
        update.roleKey = body.roleKey;
      }
      if (typeof body.status === "string" && (body.status === "active" || body.status === "inactive") && body.status !== target.status) {
        if (isSelf) throw new HttpError(400, "ไม่สามารถระงับการใช้งานบัญชีตนเองได้");
        if (body.status === "inactive" && (await isLastActiveSuperAdmin(users, roleList, target))) {
          throw new HttpError(400, "ไม่สามารถระงับ Super Admin คนสุดท้ายที่ใช้งานอยู่ได้");
        }
        update.status = body.status;
      }
    }

    if (Object.keys(update).length === 0) {
      res.status(200).json({ user: toPublicUser(target) });
      return;
    }
    update.updatedAt = nowIso();
    await users.updateOne({ _id: objectId }, { $set: update });
    const updated = await users.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบผู้ใช้งาน");
    res.status(200).json({ user: toPublicUser(updated) });
    return;
  }

  if (req.method === "DELETE") {
    if (!canManage) throw new HttpError(403, "Forbidden");
    if (isSelf) throw new HttpError(400, "ไม่สามารถลบบัญชีของตนเองได้");
    const roles = await rolesCollection();
    const roleList = await roles.find({}).toArray();
    const targetRole = findRole(roleList, target.roleKey);
    if (targetRole?.isSuperAdmin && (await countUsersWithSuperAdminRole(users, roleList)) <= 1) {
      throw new HttpError(400, "ไม่สามารถลบ Super Admin คนสุดท้ายได้");
    }
    await users.deleteOne({ _id: objectId });
    res.status(204).end();
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    const parts = getPathSegments(req, "/api/users");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
