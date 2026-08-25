import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

/**
 * กันไม่ให้ไฟล์ JSX หลุดเข้าไปใน import chain ที่เซิร์ฟเวอร์โหลดจริงอีก (เพิ่ม 2026-08-25)
 *
 * Guards the server's **runtime** import graph against JSX.
 *
 * Why this test exists: on 2026-08-21 production crash-looped on every boot because the Docker
 * image shipped without `tsconfig.json`, and the API could not transpile the one `.tsx` file it
 * value-imported (`src/lib/quotes.tsx`, which defined `statusIcon` as JSX). The immediate fix was
 * to copy `tsconfig.json` into the image — a fix at the wrong end. The real fix (2026-08-25) moved
 * `statusIcon` out to `src/pages/quotation/statusIcons.tsx` and `bahtText` to `src/lib/bahtText.ts`,
 * leaving `src/lib/quotes.ts` as plain TypeScript. This test is what stops it coming back: reaching
 * for a shared helper that happens to live next to some JSX is an easy, invisible mistake, and
 * nothing else in the toolchain complains until the container is already restarting in a loop.
 *
 * `import type` / `export type` are erased at compile time, so they are deliberately **not**
 * followed — a type-only reference to a `.tsx` file costs the server nothing at runtime.
 */

const ROOT = path.resolve(__dirname, "..");

/** ไฟล์ .ts/.tsx ทั้งหมดใต้ไดเรกทอรีหนึ่ง (ข้าม node_modules) */
function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) collectSourceFiles(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * ดึงเฉพาะ specifier ที่ "เหลืออยู่ตอน runtime" ออกจากไฟล์หนึ่ง
 *
 * Extracts only the specifiers that survive compilation. Skipped: `import type X from`,
 * `export type { … } from`, and a braced clause whose every named specifier carries its own
 * inline `type ` prefix (`import { type A, type B } from "x"`) — TypeScript elides that import
 * entirely, so it never reaches the runtime graph either.
 */
function runtimeSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) {
    const clause = match[1].trim();
    const specifier = match[2];
    if (/^type\b/.test(clause)) continue;
    const braced = clause.match(/^\{([\s\S]*)\}$/);
    if (braced) {
      const names = braced[1].split(",").map((n) => n.trim()).filter(Boolean);
      if (names.length > 0 && names.every((n) => /^type\s/.test(n))) continue;
    }
    specifiers.push(specifier);
  }
  return specifiers;
}

/** แปลง specifier แบบ "./x.js" (ธรรมเนียม NodeNext) กลับเป็นไฟล์ .ts/.tsx จริงในโปรเจกต์ */
function resolveLocal(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null; // a package, not our source
  const base = path.resolve(path.dirname(fromFile), specifier).replace(/\.js$/, "");
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** ทุกไฟล์ที่เซิร์ฟเวอร์จะโหลดจริงตอนรัน โดยเริ่มจากทุกไฟล์ใน api/ */
function serverRuntimeGraph(): Set<string> {
  const seen = new Set<string>();
  const queue = collectSourceFiles(path.join(ROOT, "api"));
  queue.forEach((f) => seen.add(f));
  while (queue.length > 0) {
    const file = queue.pop()!;
    const source = readFileSync(file, "utf8");
    for (const specifier of runtimeSpecifiers(source)) {
      const resolved = resolveLocal(file, specifier);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      queue.push(resolved);
    }
  }
  return seen;
}

describe("the server's runtime import graph stays JSX-free", () => {
  const graph = [...serverRuntimeGraph()].sort();

  it("reaches src/ files at all (the test would be vacuous otherwise)", () => {
    const srcFiles = graph.filter((f) => f.includes(`${path.sep}src${path.sep}`));
    expect(srcFiles.length).toBeGreaterThan(5);
  });

  it("contains no .tsx file", () => {
    const tsxFiles = graph
      .filter((f) => f.endsWith(".tsx"))
      .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    // A .tsx here means the API bundle must transpile JSX at boot — the exact shape that
    // crash-looped production on 2026-08-21. Move the shared value into a plain .ts module
    // instead of importing across the boundary. See src/lib/bahtText.ts for the pattern.
    expect(tsxFiles).toEqual([]);
  });

  it("imports no React package either", () => {
    // Scanning file *contents* for JSX is not viable in a `.ts` file — TypeScript generics
    // (`Promise<Quote>`, `Record<QuoteStatus, X>`) are indistinguishable from JSX by regex, and
    // TypeScript already refuses real JSX syntax in a `.ts` file, so the `.tsx` check above is
    // exact on its own. What this adds is the earlier warning sign: a runtime import of a React
    // package means a module the server loads is drifting back toward the UI layer, usually one
    // commit before the JSX arrives with it.
    const offenders = graph
      .filter((f) => runtimeSpecifiers(readFileSync(f, "utf8")).some((s) => s === "react" || s === "react-dom" || s === "lucide-react"))
      .map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    expect(offenders).toEqual([]);
  });
});
