import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import * as XLSX from "xlsx";

/**
 * Real runtime `.xlsx` parsing (added 2026-07-15, second Codex-review fix pass) — closes the High
 * Priority #1 gap the 2026-07-15 review found: "the import route does not parse the supplied .xlsx
 * workbook or store a workbook-derived hash... replacing the workbook alone cannot produce
 * warnings, changed-source detection." Before this, `sourceHash` on every `QuotationTemplate` was a
 * hash of the hand-transcribed TypeScript seed content (`api/_lib/templateSeedData.ts`), completely
 * decoupled from the actual workbook bytes — editing/replacing
 * `public/Scope of work new template for air pollution control_Technic.xlsx` had literally zero
 * observable effect anywhere in this app.
 *
 * **What this module deliberately does and does not do**: it reads the real workbook and computes a
 * genuine, content-derived hash per sheet (`sourceWorkbookHash`), so a workbook edit is now
 * detectable and surfaces as a real import warning (see `upsertQuotationTemplates()` in
 * `quotationTemplatesHandler.ts`). It does **not** attempt to fully auto-classify parsed rows into
 * `TemplateSection[]`/`TemplateItem[]` (section vs. item vs. sub-item vs. specification vs.
 * editable-parameter vs. internal-note vs. payment/warranty/tax term) — that classification, quoted
 * verbatim in this file's sibling `templateSeedData.ts` doc comment, requires real judgment calls
 * this workbook's raw rows don't make mechanically resolvable. For example, row 4 of the "FRP Tank
 * and LI" sheet packs an internal hand-signing note, a "Thickness" parameter, *and* a second,
 * unrelated abbreviation-legend note into three different columns of one single row
 * (`["","","หากลดความเซลล์เขียนมือเซนต์กำกับ","Thickness","mm.","ชื่อย่อ","ALL Layer,E,R"]`), and
 * row 61 of "Wet scrubber" packs all 4 payment-term lines *and* the warranty line into one single
 * cell as `\r\n`-joined text. A naive automated classifier risks silently corrupting
 * already-twice-reviewed customer-facing quotation content in ways that are hard to detect — a
 * strictly worse outcome than the current honest "hand-transcribed, now change-detected" state.
 * Full auto-classification remains tracked future scope (see docs/TODO.md) once/if it can be built
 * and verified carefully, sheet by sheet, against this exact ground truth.
 */

const WORKBOOK_RELATIVE_PATH = "public/Scope of work new template for air pollution control_Technic.xlsx";

export interface WorkbookSheetFingerprint {
  sheetName: string;
  rowCount: number;
  /** SHA-256 over the canonical JSON of every raw cell value in the sheet's used range (`header: 1`
   * array-of-arrays form) — changes if a single cell anywhere in the sheet changes. */
  hash: string;
}

export interface WorkbookFingerprint {
  fileName: string;
  sheets: WorkbookSheetFingerprint[];
}

/** `process.cwd()` is the project root both for local `npm`/`vercel dev` runs and inside the
 * deployed Vercel function's bundled filesystem — `vercel.json`'s
 * `functions["api/handlers/jobtypes.ts"].includeFiles` bundles this exact workbook file alongside
 * that function specifically so this path resolves there too. */
function resolveWorkbookPath(): string {
  return path.join(process.cwd(), WORKBOOK_RELATIVE_PATH);
}

/**
 * Reads the real source workbook and fingerprints every sheet. **Never throws** — returns `null` if
 * the file can't be read in the current environment (e.g. a deploy target where `includeFiles`
 * wasn't honored), so a workbook-fingerprinting failure can never break the core, already-working
 * import/upsert path. The caller treats `null` as "change detection unavailable this run," not an
 * import failure — the existing seed-content idempotency (`sourceHash`) is completely unaffected
 * either way.
 */
export function fingerprintSourceWorkbook(): WorkbookFingerprint | null {
  const filePath = resolveWorkbookPath();
  try {
    const buf = readFileSync(filePath);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheets: WorkbookSheetFingerprint[] = wb.SheetNames.map((sheetName) => {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      const hash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
      return { sheetName, rowCount: rows.length, hash };
    });
    return { fileName: path.basename(filePath), sheets };
  } catch (err) {
    console.error("[quotation-templates] fingerprintSourceWorkbook failed (non-fatal — falling back to seed-only idempotency)", err);
    return null;
  }
}
