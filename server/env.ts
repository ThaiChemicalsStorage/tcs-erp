import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";

/**
 * Loads environment variables BEFORE any api/ module evaluates (api/_lib/mongodb.ts reads
 * `MONGODB_DB`/`NODE_ENV` at module scope, not lazily) — server/index.ts imports this file
 * first, and ESM guarantees it finishes evaluating before app.ts (and its handler imports) start.
 *
 * `.env` is the only config file (see .env.example). Real environment variables already set on the
 * process (e.g. by docker-compose) win over it — dotenv never overrides an existing value.
 */
const envFile = path.resolve(process.cwd(), ".env");

if (existsSync(envFile)) {
  config({ path: envFile, quiet: true });
}
