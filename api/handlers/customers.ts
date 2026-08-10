import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling } from "../_lib/http.js";
import { handleCustomers } from "../_lib/customersHandler.js";
import { handleSearch } from "../_lib/searchHandler.js";
import { handleServiceTemplate } from "../_lib/serviceTemplateHandler.js";
import { handleServiceReport } from "../_lib/serviceReportHandler.js";
import { handleLineWebhook } from "../_lib/lineHandler.js";

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
 *
 * **Service Reports + Service Templates (added 2026-08-06)** also share this function file, same
 * cap-driven reasoning — mounted here rather than on `api/handlers/quotes.ts` (already the
 * heaviest bundle) because a Service Report's one real relational anchor is `customerId`/
 * `customerSnapshot`, the same entity this file already owns; a Service Report is created
 * directly against a Customer, not derived from a quotation. Logic lives in
 * `api/_lib/serviceTemplateHandler.ts`/`api/_lib/serviceReportHandler.ts`.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    const pathname = (req.url ?? "").split("?")[0];
    if (pathname === "/api/search") return handleSearch(req, res);
    if (pathname === "/api/service-templates" || pathname.startsWith("/api/service-templates/")) return handleServiceTemplate(req, res);
    if (pathname === "/api/service-reports" || pathname.startsWith("/api/service-reports/")) return handleServiceReport(req, res);
    // LINE OA webhook (2026-08-10) — Express runtime only: server/app.ts routes /api/line/* here
    // and captures the raw body its signature check needs; vercel.json deliberately has no
    // /api/line rewrite (the demo can't verify signatures — see api/_lib/lineHandler.ts).
    if (pathname === "/api/line/webhook") return handleLineWebhook(req, res);
    return handleCustomers(req, res);
  });
}
