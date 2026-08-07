import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { requireUser, requirePermission } from "../_lib/auth.js";
import { rolesCollection, usersCollection } from "../_lib/collections.js";
import { seedDefaultRolesIfEmpty, bootstrapRbac } from "../_lib/rbacSeed.js";
import { sanitizeRolePermissions } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleList(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Every authenticated user needs the full role set client-side to evaluate hasPermission() —
    // this is how UI-level gating (sidebar visibility, button visibility) decides what to render.
    // Flagged by the 2026-07-10 Codex review alongside GET /api/users, but role documents contain
    // no PII — just names/descriptions/permission keys — so unlike the user directory there's no
    // privacy tradeoff here, only an architectural one the app already depends on; not restricted.
    await requireUser(req);
    await seedDefaultRolesIfEmpty();
    // The one path that actually reaches an already-provisioned production database (every
    // authenticated client fetches /api/roles on boot) — see bootstrapRbac()'s own doc comment.
    await bootstrapRbac();
    const roles = await rolesCollection();
    const list = await roles.find({}).sort({ isSuperAdmin: -1, name: 1 }).toArray();
    res.status(200).json({ roles: list });
    return;
  }

  if (req.method === "POST") {
    await requirePermission(req, "roles:manage");
    const body = req.body ?? {};
    const name: string = typeof body.name === "string" ? body.name.trim() : "";
    const description: string = typeof body.description === "string" ? body.description.trim() : "";
    const permissions: Permission[] = Array.isArray(body.permissions) ? body.permissions : [];
    if (!name) throw new HttpError(400, "กรุณากรอกชื่อบทบาท");

    const roles = await rolesCollection();
    const nameTaken = await roles.findOne({ name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
    if (nameTaken) throw new HttpError(409, "มีบทบาทชื่อนี้อยู่แล้ว");

    const key = `role_${new ObjectId().toString()}`;
    // Silently adjusts rather than 400s — same contract the Super-Admin-only filter has always had.
    // Auto-including dependencies here (not just in the UI) means a role created by a direct API
    // call can't end up with a permission whose screen fails to load. See sanitizeRolePermissions().
    const cleanPermissions = sanitizeRolePermissions(permissions);
    await roles.insertOne({ key, name, description, permissions: cleanPermissions, isSuperAdmin: false, isSystem: false });
    const created = await roles.findOne({ key });
    res.status(201).json({ role: created });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleOne(req: VercelRequest, res: VercelResponse, key: string) {
  await requirePermission(req, "roles:manage");
  const roles = await rolesCollection();
  const target = await roles.findOne({ key });
  if (!target) throw new HttpError(404, "ไม่พบบทบาท");

  if (req.method === "PATCH") {
    // Only the Super Admin role itself is fully locked — its permissions must always be "everything".
    // Other system roles (e.g. Administrator) are locked to their built-in name, but description/permissions stay editable.
    if (target.isSuperAdmin) throw new HttpError(400, "ไม่สามารถแก้ไขบทบาท Super Admin ได้");

    const body = req.body ?? {};
    const update: Record<string, unknown> = {};

    if (!target.isSystem && typeof body.name === "string" && body.name.trim()) {
      const name = body.name.trim();
      const nameTaken = await roles.findOne({ key: { $ne: key }, name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
      if (nameTaken) throw new HttpError(409, "มีบทบาทชื่อนี้อยู่แล้ว");
      update.name = name;
    }
    if (typeof body.description === "string") update.description = body.description.trim();
    if (Array.isArray(body.permissions)) {
      update.permissions = sanitizeRolePermissions(body.permissions as Permission[]);
    }

    if (Object.keys(update).length > 0) {
      await roles.updateOne({ key }, { $set: update });
    }
    const updated = await roles.findOne({ key });
    res.status(200).json({ role: updated });
    return;
  }

  if (req.method === "DELETE") {
    if (target.isSystem) throw new HttpError(400, "ไม่สามารถลบบทบาทระบบได้");
    const users = await usersCollection();
    const inUse = await users.countDocuments({ roleKey: key });
    if (inUse > 0) throw new HttpError(409, "ไม่สามารถลบบทบาทที่มีผู้ใช้งานอยู่ได้ กรุณาเปลี่ยนบทบาทผู้ใช้งานก่อน");
    await roles.deleteOne({ key });
    res.status(204).end();
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    const parts = getPathSegments(req, "/api/roles");

    if (parts.length === 0) return handleList(req, res);
    if (parts.length === 1) return handleOne(req, res, parts[0]);
    throw new HttpError(404, "Not found");
  });
}
