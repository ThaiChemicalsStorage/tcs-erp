import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { VercelRequest, VercelResponse } from "@vercel/node";

import authHandler from "../api/handlers/auth.js";
import usersHandler from "../api/handlers/users.js";
import rolesHandler from "../api/handlers/roles.js";
import productsHandler from "../api/handlers/products.js";
import categoriesHandler from "../api/handlers/categories.js";
import notificationsHandler from "../api/handlers/notifications.js";
import quotesHandler from "../api/handlers/quotes.js";
import jobtypesHandler from "../api/handlers/jobtypes.js";
import customersHandler from "../api/handlers/customers.js";
import companyHandler from "../api/company/index.js";
import auditLogHandler from "../api/audit-log/index.js";
import dashboardHandler from "../api/dashboard/index.js";

type ApiHandler = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;

/**
 * First-path-segment → handler map, replicating vercel.json's rewrites exactly (the routing the
 * handlers were written against). Handlers that serve several resources dispatch internally on the
 * raw pathname (e.g. quotes.ts handles /api/scope-of-works), so the full original URL must reach
 * them untouched — which is why routing happens in a plain middleware on `req.url` instead of
 * Express path mounts (`app.use("/api/quotes", ...)` would strip the prefix from `req.url`).
 */
const API_ROUTES: Record<string, ApiHandler> = {
  auth: authHandler,
  users: usersHandler,
  roles: rolesHandler,
  departments: rolesHandler,
  teams: rolesHandler,
  products: productsHandler,
  "stock-movements": productsHandler,
  "tool-holdings": productsHandler,
  categories: categoriesHandler,
  notifications: notificationsHandler,
  quotes: quotesHandler,
  "scope-of-works": quotesHandler,
  "delivery-orders": quotesHandler,
  "ar-milestones": quotesHandler,
  "ar-documents": quotesHandler,
  "ar-dashboard": quotesHandler,
  projects: quotesHandler,
  "material-requisitions": quotesHandler,
  "material-requisition-templates": quotesHandler,
  "job-orders": quotesHandler,
  "purchase-requests": quotesHandler,
  "production-orders": quotesHandler,
  "purchase-orders": quotesHandler,
  "cost-controls": quotesHandler,
  "receiving-reports": quotesHandler,
  "ap-entries": quotesHandler,
  "product-requests": quotesHandler,
  jobtypes: jobtypesHandler,
  "quotation-templates": jobtypesHandler,
  customers: customersHandler,
  vendors: customersHandler,
  "code-entries": customersHandler,
  "pending-approvals": customersHandler,
  search: customersHandler,
  "service-templates": customersHandler,
  "service-reports": customersHandler,
  line: customersHandler,
  company: companyHandler,
  "audit-log": auditLogHandler,
  dashboard: dashboardHandler,
};

// Sized for the largest JSON body the app legitimately sends: a Service photo is ≤4 MB raw
// (MAX_PHOTO_BYTES in serviceReportHandler.ts), ~5.5 MB as a base64 data URL — 25 MB leaves
// headroom for multi-photo saves without approaching MongoDB's 16 MB per-document ceiling
// (per-field caps are enforced by the handlers themselves).
const JSON_BODY_LIMIT = "25mb";

export function createApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  // "simple" gives string | string[] query values, same shape Vercel's runtime produced —
  // Express 5's default "extended" parser can produce nested objects the handlers never expect.
  app.set("query parser", "simple");
  // `verify` stashes the raw bytes for the LINE webhook's HMAC signature check
  // (api/_lib/lineHandler.ts) — the parsed body alone can't reproduce LINE's exact byte stream.
  app.use(express.json({
    limit: JSON_BODY_LIMIT,
    verify: (req, _res, buf) => { (req as Request & { rawBody?: Buffer }).rawBody = buf; },
  }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    const pathname = req.url.split("?")[0];
    if (pathname !== "/api" && !pathname.startsWith("/api/")) return next();
    const handler = API_ROUTES[pathname.split("/")[2] ?? ""];
    if (!handler) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // VercelRequest/VercelResponse are type-only shapes over Node's req/res; everything the
    // handlers actually use (url, method, headers, query, body, status().json(), setHeader(),
    // send(), end()) exists identically on Express's req/res.
    Promise.resolve(handler(req as unknown as VercelRequest, res as unknown as VercelResponse)).catch(next);
  });

  // Built frontend + SPA fallback. dist/ is absent in API-only setups (tests, `npm run dev`
  // where Vite serves the frontend itself) — then non-API routes just 404.
  const distDir = path.resolve(process.cwd(), "dist");
  if (existsSync(path.join(distDir, "index.html"))) {
    app.use(express.static(distDir));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  // JSON error backstop — every handler already catches its own errors (withErrorHandling), so
  // this only sees body-parser failures (413 payload too large, 400 malformed JSON) and bugs.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status === 413 ? "Request body too large" : status >= 500 ? "Internal server error" : "Bad request" });
  });

  return app;
}
