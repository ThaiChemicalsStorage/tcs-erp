import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ObjectId } from "mongodb";
import { HttpError, getPathSegments } from "./http.js";
import { requireUser, requirePermission } from "./auth.js";
import { departmentsCollection, teamsCollection, toObjectId, withStringId } from "./collections.js";
import { sanitizeShortText, sanitizeBoolean } from "./quoteValidation.js";
import { nowIso } from "../../src/lib/products.js";

/**
 * Departments (manageable) + Sales Teams (2026-08-14, direct business request — Sales has 2 teams,
 * each with its own team lead who should only see their own team's records, not the other team's).
 * Mounted inside `api/handlers/roles.ts` via pathname dispatch — Vercel Hobby's 12-function cap is
 * still fully used (see docs/ARCHITECTURE.md), same sharing pattern Scope of Work/Delivery Order
 * use inside `api/handlers/quotes.ts`. List routes are open to any authenticated user (needed for
 * the User Management create/edit dropdowns); mutations require `departments:manage`/
 * `teams:manage` (Super-Admin-only permissions, like `roles:manage`/`company:manage`).
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleDepartmentList(req: VercelRequest, res: VercelResponse) {
  const departments = await departmentsCollection();

  if (req.method === "GET") {
    await requireUser(req);
    const docs = await departments.find({}).sort({ name: 1 }).toArray();
    res.status(200).json({ departments: docs.map(withStringId) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "departments:manage");
    const body = req.body ?? {};
    const name = sanitizeShortText(body.name, "ชื่อแผนก", true);
    const codeInput = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const code = codeInput || `DEPT_${new ObjectId().toString()}`;

    const codeTaken = await departments.findOne({ code: { $regex: `^${escapeRegExp(code)}$`, $options: "i" } });
    if (codeTaken) throw new HttpError(409, "รหัสแผนกนี้มีผู้ใช้งานแล้ว");
    const nameTaken = await departments.findOne({ name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
    if (nameTaken) throw new HttpError(409, "มีแผนกชื่อนี้อยู่แล้ว");

    const now = nowIso();
    const insertResult = await departments.insertOne({
      name,
      code,
      isActive: sanitizeBoolean(body.isActive ?? true, "สถานะการใช้งาน"),
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    });
    const created = await departments.findOne({ _id: insertResult.insertedId });
    if (!created) throw new HttpError(500, "Failed to create department");
    res.status(201).json({ department: withStringId(created) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleDepartmentOne(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requirePermission(req, "departments:manage");
  const departments = await departmentsCollection();
  const objectId = toObjectId(id);
  const target = await departments.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบแผนก");

  if (req.method === "PATCH") {
    const body = req.body ?? {};
    const update: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      const name = sanitizeShortText(body.name, "ชื่อแผนก", true);
      const nameTaken = await departments.findOne({ _id: { $ne: objectId }, name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
      if (nameTaken) throw new HttpError(409, "มีแผนกชื่อนี้อยู่แล้ว");
      update.name = name;
    }
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;

    if (Object.keys(update).length > 0) {
      update.updatedAt = nowIso();
      update.updatedBy = ctx.user.id;
      await departments.updateOne({ _id: objectId }, { $set: update });
    }
    const updated = await departments.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบแผนก");
    res.status(200).json({ department: withStringId(updated) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleTeamList(req: VercelRequest, res: VercelResponse) {
  const teams = await teamsCollection();

  if (req.method === "GET") {
    await requireUser(req);
    const departmentId = typeof req.query.departmentId === "string" ? req.query.departmentId : "";
    const filter = departmentId ? { departmentId } : {};
    const docs = await teams.find(filter).sort({ name: 1 }).toArray();
    res.status(200).json({ teams: docs.map(withStringId) });
    return;
  }

  if (req.method === "POST") {
    const ctx = await requirePermission(req, "teams:manage");
    const body = req.body ?? {};
    const name = sanitizeShortText(body.name, "ชื่อทีม", true);
    const departmentId = sanitizeShortText(body.departmentId, "แผนก", true);

    const departments = await departmentsCollection();
    if (!(await departments.findOne({ _id: toObjectId(departmentId) }))) throw new HttpError(400, "ไม่พบแผนกที่เลือก");

    const nameTaken = await teams.findOne({ departmentId, name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
    if (nameTaken) throw new HttpError(409, "มีทีมชื่อนี้อยู่แล้วในแผนกนี้");

    const now = nowIso();
    const insertResult = await teams.insertOne({
      name,
      departmentId,
      isActive: sanitizeBoolean(body.isActive ?? true, "สถานะการใช้งาน"),
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.user.id,
      updatedBy: ctx.user.id,
    });
    const created = await teams.findOne({ _id: insertResult.insertedId });
    if (!created) throw new HttpError(500, "Failed to create team");
    res.status(201).json({ team: withStringId(created) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

async function handleTeamOne(req: VercelRequest, res: VercelResponse, id: string) {
  const ctx = await requirePermission(req, "teams:manage");
  const teams = await teamsCollection();
  const objectId = toObjectId(id);
  const target = await teams.findOne({ _id: objectId });
  if (!target) throw new HttpError(404, "ไม่พบทีม");

  if (req.method === "PATCH") {
    const body = req.body ?? {};
    const update: Record<string, unknown> = {};

    if (typeof body.name === "string" && body.name.trim()) {
      const name = sanitizeShortText(body.name, "ชื่อทีม", true);
      const nameTaken = await teams.findOne({ _id: { $ne: objectId }, departmentId: target.departmentId, name: { $regex: `^${escapeRegExp(name)}$`, $options: "i" } });
      if (nameTaken) throw new HttpError(409, "มีทีมชื่อนี้อยู่แล้วในแผนกนี้");
      update.name = name;
    }
    if (typeof body.isActive === "boolean") update.isActive = body.isActive;

    if (Object.keys(update).length > 0) {
      update.updatedAt = nowIso();
      update.updatedBy = ctx.user.id;
      await teams.updateOne({ _id: objectId }, { $set: update });
    }
    const updated = await teams.findOne({ _id: objectId });
    if (!updated) throw new HttpError(404, "ไม่พบทีม");
    res.status(200).json({ team: withStringId(updated) });
    return;
  }

  throw new HttpError(405, "Method not allowed");
}

export async function handleDepartments(req: VercelRequest, res: VercelResponse) {
  const parts = getPathSegments(req, "/api/departments");
  if (parts.length === 0) return handleDepartmentList(req, res);
  if (parts.length === 1) return handleDepartmentOne(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}

export async function handleTeams(req: VercelRequest, res: VercelResponse) {
  const parts = getPathSegments(req, "/api/teams");
  if (parts.length === 0) return handleTeamList(req, res);
  if (parts.length === 1) return handleTeamOne(req, res, parts[0]);
  throw new HttpError(404, "Not found");
}
