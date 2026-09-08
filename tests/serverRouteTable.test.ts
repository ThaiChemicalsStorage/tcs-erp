import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * ทุก path ที่ handler ดักไว้ ต้องมีชื่ออยู่ใน API_ROUTES ของ server/app.ts (เพิ่ม 2026-09-08)
 *
 * Guards the seam between the two halves of API routing.
 *
 * Why this test exists: `server/app.ts` dispatches on the **first** path segment only
 * (`API_ROUTES[pathname.split("/")[2]]`), and anything missing from that table 404s before any
 * handler runs. But several handlers serve more than one resource and dispatch internally on the
 * full pathname — `api/handlers/quotes.ts` alone answers for a dozen of them. Adding a resource
 * therefore takes an edit in two files, and forgetting the second one fails in the least
 * informative way possible: the handler is complete, tested and reachable in code review, yet
 * every request to it returns `{"error":"Not found"}`.
 *
 * That is exactly what happened to `/api/material-requisition-templates`, shipped 2026-09-02 with
 * a full handler and UI page but never added to `API_ROUTES` — the page 404'd on save for six days
 * before anyone tried to use it.
 *
 * Only pathnames the handlers genuinely *compare against* are collected. A bare `/api/x` mention
 * inside a comment is not a route (`api/handlers/customers.ts` still discusses the removed
 * `/api/company-profiles` module), so matching a quoted literal alone would report ghosts.
 */

const ROOT = path.resolve(__dirname, "..");

/** ไฟล์ .ts ทั้งหมดใต้ api/ */
function collectApiFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collectApiFiles(full, out);
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

/** คีย์ทั้งหมดใน API_ROUTES — ตัวที่ตัดสินว่า request จะไปถึง handler ไหม */
function routedSegments(): Set<string> {
  const source = readFileSync(path.join(ROOT, "server", "app.ts"), "utf8");
  const table = source.match(/const API_ROUTES[\s\S]*?\n\};/);
  if (!table) throw new Error("API_ROUTES table not found in server/app.ts — did its shape change?");
  const segments = new Set<string>();
  for (const match of table[0].matchAll(/(?:^|\n)\s*"?([a-z0-9-]+)"?\s*:/g)) segments.add(match[1]);
  return segments;
}

/**
 * ชื่อ resource ที่ handler เทียบกับ pathname จริง ๆ
 *
 * The comparison forms the handlers actually use: `pathname === "/api/x"`,
 * `pathname.startsWith("/api/x/")`, and their negations.
 */
function comparedSegments(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of collectApiFiles(path.join(ROOT, "api"))) {
    const source = readFileSync(file, "utf8");
    const pattern = /(?:===|!==|startsWith\(|includes\()\s*["'`]\/api\/([a-z0-9-]+)/g;
    for (const match of source.matchAll(pattern)) {
      const segment = match[1];
      const where = found.get(segment) ?? [];
      const relative = path.relative(ROOT, file).replace(/\\/g, "/");
      if (!where.includes(relative)) where.push(relative);
      found.set(segment, where);
    }
  }
  return found;
}

describe("every resource a handler answers for is reachable through API_ROUTES", () => {
  const routed = routedSegments();
  const compared = comparedSegments();

  it("finds the handlers' own path comparisons at all (the test would be vacuous otherwise)", () => {
    expect(compared.size).toBeGreaterThan(20);
    expect(routed.size).toBeGreaterThan(20);
  });

  it("routes every one of them", () => {
    const unreachable = [...compared.entries()]
      .filter(([segment]) => !routed.has(segment))
      .map(([segment, files]) => `/api/${segment} (handled in ${files.join(", ")})`);
    // A name here means server/app.ts drops the request with a 404 before the handler that
    // implements it ever runs. Add it to API_ROUTES pointing at that handler.
    expect(unreachable).toEqual([]);
  });
});
