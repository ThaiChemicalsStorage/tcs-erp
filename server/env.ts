import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

/**
 * Loads environment variables BEFORE any api/ module evaluates (api/_lib/mongodb.ts reads
 * `MONGODB_DB`/`VERCEL_ENV` at module scope, not lazily) — server/index.ts imports this file
 * first, and ESM guarantees it finishes evaluating before app.ts (and its handler imports) start.
 *
 * `.env` is the real config file (see .env.example); `.vercel/.env.development.local` is the
 * fallback so a machine that previously ran `vercel dev` (which pulls env into that file) works
 * with `npm run dev` immediately, no copying required. With dotenv's path array, earlier files
 * win on duplicate keys, so a real `.env` always overrides the pulled Vercel values.
 */
const candidates = [".env", ".vercel/.env.development.local"]
  .map((p) => path.resolve(process.cwd(), p))
  .filter((p) => existsSync(p));

if (candidates.length > 0) {
  config({ path: candidates, quiet: true });
}
