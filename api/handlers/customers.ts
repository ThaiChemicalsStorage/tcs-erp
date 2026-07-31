import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling } from "../_lib/http.js";
import { handleCustomers } from "../_lib/customersHandler.js";
import { handleSearch } from "../_lib/searchHandler.js";

/**
 * Customer master data — see `api/_lib/customersHandler.ts` for the actual list/create/get/patch/
 * archive logic. This file used to be `api/handlers/company-profiles.ts`, dispatching both
 * `/api/company-profiles` (the now-removed multi-issuer-company admin module) and `/api/customers`
 * (this one) from the same Vercel function to stay under the Hobby plan's 12-function cap. The
 * Company Profiles module was removed 2026-07-14 (this ERP has exactly one issuer company — see
 * docs/MODULES/CompanyProfiles.md "Removed (2026-07-14)"), so this file was simplified down to
 * customers-only rather than kept as a two-resource dispatcher for a resource that no longer
 * exists.
 *
 * **Global Search (added 2026-07-14) now shares this same function file** rather than getting its
 * own — Vercel Hobby's 12-function cap is still fully used (see docs/ARCHITECTURE.md). Checked
 * first, on the raw pathname, before falling through to the customers-only logic below — the same
 * established pattern this file itself used to share with `company-profiles.ts`. The actual
 * search logic lives in `api/_lib/searchHandler.ts`, unrelated to and independent from
 * `customersHandler.ts` below; they just happen to share one Vercel function slot.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname === "/api/search") return handleSearch(req, res);
    return handleCustomers(req, res);
  });
}
