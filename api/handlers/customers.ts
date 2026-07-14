import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling } from "../_lib/http.js";
import { handleCustomers } from "../_lib/customersHandler.js";

/**
 * Customer master data — see `api/_lib/customersHandler.ts` for the actual list/create/get/patch/
 * archive logic. This file used to be `api/handlers/company-profiles.ts`, dispatching both
 * `/api/company-profiles` (the now-removed multi-issuer-company admin module) and `/api/customers`
 * (this one) from the same Vercel function to stay under the Hobby plan's 12-function cap. The
 * Company Profiles module was removed 2026-07-14 (this ERP has exactly one issuer company — see
 * docs/MODULES/CompanyProfiles.md "Removed (2026-07-14)"), so this file was simplified down to
 * customers-only rather than kept as a two-resource dispatcher for a resource that no longer
 * exists. Still just the one function under the cap — see docs/ARCHITECTURE.md.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(res, () => handleCustomers(req, res));
}
