import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError } from "../_lib/http.js";
import { requireUser, requirePermission } from "../_lib/auth.js";
import { auditLogCollection, withStringId } from "../_lib/collections.js";
import { nowIso } from "../../src/lib/products.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    if (req.method === "GET") {
      await requirePermission(req, "auditLog:view");
      const auditLog = await auditLogCollection();
      const docs = await auditLog.find({}).sort({ createdAt: -1 }).limit(1000).toArray();
      res.status(200).json({ entries: docs.map(withStringId) });
      return;
    }

    if (req.method === "POST") {
      // Append-only. userId/userName/roleName always come from the authenticated session, never
      // the request body — a client can describe what happened but can't claim to be someone else.
      const ctx = await requireUser(req);
      const body = req.body ?? {};
      const module = typeof body.module === "string" ? body.module : "ระบบ";
      const action = typeof body.action === "string" ? body.action : "";
      const details = typeof body.details === "string" ? body.details : "";
      if (!action) throw new HttpError(400, "Missing action");
      // Quotation events are written authoritatively by api/handlers/quotes.ts itself (create/
      // update/duplicate/every workflow transition) — never from this generic client-facing
      // endpoint. Before this, any authenticated caller could POST an arbitrary "Quotation
      // Created"/"Quotation Updated" entry here, which the Dashboard's Sales Activity Analytics
      // counts from `audit_log`, making that report forgeable. Flagged by the 2026-07-10 Codex
      // review ("Audit integrity" Critical finding).
      if (module === "ใบเสนอราคา") {
        throw new HttpError(403, "เหตุการณ์ใบเสนอราคาถูกบันทึกโดยระบบโดยอัตโนมัติ ไม่สามารถบันทึกผ่าน API นี้ได้");
      }
      // Scope of Work events are written authoritatively by api/_lib/scopeOfWorkHandler.ts itself
      // (create/update/finalize/duplicate/refresh/print/delete) — same forgery-prevention rule as
      // the quotation module above, added 2026-07-15 when the feature was built.
      if (module === "Scope of Work") {
        throw new HttpError(403, "เหตุการณ์ Scope of Work ถูกบันทึกโดยระบบโดยอัตโนมัติ ไม่สามารถบันทึกผ่าน API นี้ได้");
      }
      // The Company Profiles module itself was removed 2026-07-14 (docs/MODULES/CompanyProfiles.md
      // "Removed") — nothing writes this module's audit entries anymore. Lockout kept anyway: the
      // historical `audit_log` entries from when the module was live still legitimately carry this
      // module name, and there's no reason to newly allow a client to forge more of them for a
      // module that no longer exists.
      if (module === "โปรไฟล์บริษัท") {
        throw new HttpError(403, "เหตุการณ์โปรไฟล์บริษัทถูกบันทึกโดยระบบโดยอัตโนมัติ ไม่สามารถบันทึกผ่าน API นี้ได้");
      }

      const auditLog = await auditLogCollection();
      const insertResult = await auditLog.insertOne({
        userId: ctx.user.id,
        userName: ctx.user.fullName,
        roleName: ctx.role?.name ?? ctx.user.roleKey,
        module,
        action,
        details,
        createdAt: nowIso(),
      });
      const doc = await auditLog.findOne({ _id: insertResult.insertedId });
      if (!doc) throw new HttpError(500, "Failed to write audit entry");
      res.status(201).json({ entry: withStringId(doc) });
      return;
    }

    throw new HttpError(405, "Method not allowed");
  });
}
