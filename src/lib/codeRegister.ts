import { apiFetch } from "./apiClient.js";

/**
 * ทะเบียนรหัสสำหรับใบ PR/PO (2026-08-31) — เจ้าของขอไว้ 2026-08-28:
 * *"เพิ่มหน้าสร้างรหัสแผนก เพื่อเอาไว้ใช้สำหรับใบ PR กับ PO"* และส่งไฟล์ `รหัสสินค้าทั้งหมด.xlsx` มาด้วย
 *
 * **เปิดไฟล์แล้วพบว่าเป็นคนละอย่างกับที่ชื่อไฟล์บอก** — เป็น **ผังบัญชี (GLCHART) 479 บัญชี**
 * รูปแบบ `5230-15` ไม่ใช่รหัสสินค้า และ**ไม่ใช่รหัสแผนกด้วย**: ใบขอซื้อจริง (`ED6908038.pdf`)
 * กรอกช่อง "แผนก" เป็น `G143` ซึ่งไม่มีอยู่ในไฟล์นั้นเลย (เช็คแล้ว) และมีแค่ 11 จาก 272 บัญชี
 * ค่าใช้จ่ายที่ระบุฝ่ายไว้ในชื่อ
 *
 * เจ้าของยืนยัน 2026-08-31 ว่า **เป็นรหัสสองชุดแยกกัน** จึงเก็บใน collection เดียวแยกด้วย `kind`
 * แทนที่จะทำเป็นสองโมดูล — ประหยัดเช็คลิสต์การเพิ่มโมดูลไปทั้งชุด และ Combobox บนใบ PR/PO
 * ก็แค่กรองด้วย `kind`
 */

/** `workType` (2026-09-03) — ประเภทงานที่ใบเบิก "ตัดเข้างาน" (งานเหล็ก / งานโรงงาน / งานผลิต …)
 * เจ้าของสั่ง *"ใบเบิกมี dropdown สามารถเลือกตัดได้ว่าตัดงานนี้เป็นงานเหล็กอะไรงี้ งานโรงงาน งานผลิต"*
 * เก็บในทะเบียนนี้แทนการฮาร์ดโค้ด เพื่อให้เจ้าของเพิ่ม/แก้รายการเองได้ */
export type CodeKind = "department" | "account" | "workType";
export const CODE_KINDS: readonly CodeKind[] = ["department", "account", "workType"];

export interface CodeEntry {
  id: string;
  kind: CodeKind;
  code: string;
  name: string;
  /** หมวดบัญชี (ส/ท, รายได้, คชจ.) — เฉพาะ kind "account" */
  category?: string;
  /** ระดับ 1-4 ในผังบัญชี — เฉพาะ kind "account" */
  level?: number | null;
  /** บัญชีคุม (true) หรือบัญชีย่อยที่ลงรายการได้ (false) — เฉพาะ kind "account" */
  isControl?: boolean;
  /** รหัสบัญชีคุมที่อยู่เหนือขึ้นไป — เฉพาะ kind "account" */
  parentCode?: string;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export type CodeEntryDraft = Pick<CodeEntry, "kind" | "code" | "name" | "isActive"> &
  Partial<Pick<CodeEntry, "category" | "level" | "isControl" | "parentCode">>;

export function emptyCodeEntryDraft(kind: CodeKind): CodeEntryDraft {
  return { kind, code: "", name: "", isActive: true };
}

// ── ตัวแกะผังบัญชีจากไฟล์ที่เจ้าของส่งมา ────────────────────────────────────────

/** หนึ่งบรรทัดของผังบัญชีที่แกะได้ — ยังไม่ใช่เอกสารในฐานข้อมูล */
export interface ParsedAccount {
  code: string;
  name: string;
  category: string;
  level: number | null;
  isControl: boolean;
  parentCode: string;
}

export interface ParsedAccountResult {
  accounts: ParsedAccount[];
  warnings: string[];
}

/** บรรทัดผังบัญชี: รหัส แล้วตามด้วยที่เหลือของบรรทัด */
const ACCOUNT_LINE = /^\s*(\d{4}-\d{2})\s+(.*)$/;
/**
 * รหัสบัญชีล้วน ๆ ไม่มีอะไรตามหลัง — ใช้หาคอลัมน์ "บัญชีคุม" ซึ่งเป็นรหัสเดี่ยวท้ายบรรทัด
 * แยกจาก `ACCOUNT_LINE` เพราะตัวนั้นบังคับว่าต้องมีช่องว่างตามหลังรหัส ถ้าเอามาใช้ซ้ำ
 * รหัสบัญชีคุมจะไม่เคยแมตช์เลย (เทสต์จับได้ตอนเขียนครั้งแรก)
 */
const BARE_ACCOUNT_CODE = /^\d{4}-\d{2}$/;

/**
 * แกะผังบัญชีจากชีต `GLCHART`
 *
 * ⚠️ **ไฟล์ไม่ใช่ตารางจริง** — เป็นรายงานตัวอักษรความกว้างคงที่ที่ถูกยัดลงคอลัมน์เดียว (570 แถว
 * มีหัวรายงาน เส้นคั่น และท้ายรายงานปนอยู่) จึงรับ `string[]` คือค่าคอลัมน์แรกของแต่ละแถว แล้วแยก
 * ท้ายบรรทัดด้วยช่องว่างตั้งแต่สองตัวขึ้นไป — แถวที่ไม่ขึ้นต้นด้วยรหัสบัญชีถูกข้ามทั้งหมด
 *
 * เป็นฟังก์ชันบริสุทธิ์ ไม่แตะ `xlsx` เลย เพื่อให้เทสต์ด้วย fixture สังเคราะห์ได้ (ไฟล์จริงอยู่ใน
 * `reference/` ที่ gitignore) — แนวเดียวกับ `costControlImport.ts`
 */
export function parseGlChartRows(rows: string[]): ParsedAccountResult {
  const accounts: ParsedAccount[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (const raw of rows) {
    const m = ACCOUNT_LINE.exec(raw ?? "");
    if (!m) continue;
    const code = m[1];
    // ท้ายบรรทัดคือ ชื่อบัญชี / หมวด / ระดับ / ประเภท / บัญชีคุม คั่นด้วยช่องว่างหลายตัว
    const cols = m[2].trimEnd().split(/\s{2,}/).map((c) => c.trim());
    const name = cols[0] ?? "";
    if (name === "") { warnings.push(`${code}: ไม่มีชื่อบัญชี ข้ามไป`); continue; }
    if (seen.has(code)) { warnings.push(`${code}: รหัสซ้ำในไฟล์ ใช้แถวแรกที่เจอ`); continue; }
    seen.add(code);

    const levelRaw = cols.find((c) => /^[1-9]$/.test(c));
    accounts.push({
      code,
      name,
      category: cols[1] ?? "",
      level: levelRaw ? Number(levelRaw) : null,
      // "คุม" = บัญชีคุม (มีลูก) ส่วน "---" = บัญชีย่อยที่ลงรายการได้จริง
      isControl: cols.includes("คุม"),
      parentCode: cols.find((c) => BARE_ACCOUNT_CODE.test(c)) ?? "",
    });
  }

  if (accounts.length === 0) warnings.push("ไม่พบบรรทัดที่ขึ้นต้นด้วยรหัสบัญชีเลย — ไฟล์อาจไม่ใช่ผังบัญชี");
  return { accounts, warnings };
}

// ── API ──────────────────────────────────────────────────────────────────────

export async function fetchCodeEntries(): Promise<CodeEntry[]> {
  const { codes } = await apiFetch<{ codes: CodeEntry[] }>("/code-entries");
  return codes;
}

export async function createCodeEntry(draft: CodeEntryDraft): Promise<CodeEntry> {
  const { code } = await apiFetch<{ code: CodeEntry }>("/code-entries", { method: "POST", body: JSON.stringify(draft) });
  return code;
}

export async function updateCodeEntry(id: string, draft: Partial<CodeEntryDraft>): Promise<CodeEntry> {
  const { code } = await apiFetch<{ code: CodeEntry }>(`/code-entries/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(draft) });
  return code;
}

export async function setCodeEntryArchived(id: string, isDeleted: boolean): Promise<CodeEntry> {
  const { code } = await apiFetch<{ code: CodeEntry }>(`/code-entries/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    body: JSON.stringify({ isDeleted }),
  });
  return code;
}

/** นำเข้าหลายรหัสพร้อมกัน — รหัสที่มีอยู่แล้วถูกข้าม ไม่ทับของเดิม */
export async function importCodeEntries(kind: CodeKind, entries: CodeEntryDraft[]): Promise<{ created: number; skipped: number }> {
  return apiFetch<{ created: number; skipped: number }>("/code-entries/import", {
    method: "POST",
    body: JSON.stringify({ kind, entries }),
  });
}

/** ตัวเลือกสำหรับ `<Combobox>` บนใบ PR/PO — กรองตามชนิดและเอาเฉพาะที่ใช้งานอยู่ */
export function codeComboboxOptions(codes: CodeEntry[], kind: CodeKind): { value: string; label: string; hint?: string }[] {
  return codes
    .filter((c) => c.kind === kind && c.isActive && !c.isDeleted)
    // บัญชีคุมลงรายการไม่ได้ มีไว้จัดกลุ่ม — ไม่ควรขึ้นให้เลือกบนใบเอกสาร
    .filter((c) => !(kind === "account" && c.isControl))
    .map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, hint: c.category || undefined }));
}
