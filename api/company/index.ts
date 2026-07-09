import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError } from "../_lib/http.js";
import { requireUser, requirePermission } from "../_lib/auth.js";
import { companyCollection } from "../_lib/collections.js";
import { defaultCompany, type Company } from "../../src/lib/storage.js";
import { nowIso } from "../../src/lib/products.js";

const SINGLETON_ID = "singleton";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(res, async () => {
    if (req.method === "GET") {
      // Company info is displayed on every quotation/settings screen, so any authenticated
      // user may read it — only company:manage gates writes.
      await requireUser(req);
      const company = await companyCollection();
      const doc = await company.findOne({ _id: SINGLETON_ID });
      res.status(200).json({ company: doc ? { ...defaultCompany, ...doc } : defaultCompany });
      return;
    }

    if (req.method === "PUT") {
      const ctx = await requirePermission(req, "company:manage");
      const body: Partial<Company> = req.body ?? {};
      const next: Company = { ...defaultCompany, ...body, updatedAt: nowIso(), updatedBy: ctx.user.id };
      if (typeof next.vatRate !== "number" || Number.isNaN(next.vatRate)) next.vatRate = defaultCompany.vatRate;

      const company = await companyCollection();
      await company.updateOne({ _id: SINGLETON_ID }, { $set: next }, { upsert: true });
      res.status(200).json({ company: next });
      return;
    }

    throw new HttpError(405, "Method not allowed");
  });
}
