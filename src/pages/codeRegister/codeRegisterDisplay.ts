import type { CodeEntry, CodeKind } from "../../lib/codeRegister";
import type { TranslationKey } from "../../lib/i18n";

export const codeKindLabelKey: Record<CodeKind, TranslationKey> = {
  department: "codeRegister.tab.department",
  account: "codeRegister.tab.account",
  workType: "codeRegister.tab.workType",
};

/**
 * กรองรหัสของชุดที่เลือก ตามคำค้นและการแสดงที่เก็บถาวร — คำค้นดูรหัส ชื่อ หมวด และบัญชีคุม เหมือนเดิม
 * แยกเป็นฟังก์ชันล้วนเพื่อทดสอบได้ และให้หน้าจอกับจำนวนรายการใช้กติกาเดียวกัน
 */
export function filterCodeEntries(codes: CodeEntry[], opts: { kind: CodeKind; search: string; showArchived: boolean }): CodeEntry[] {
  const q = opts.search.trim().toLowerCase();
  return codes.filter((c) => {
    if (c.kind !== opts.kind) return false;
    if (!opts.showArchived && c.isDeleted) return false;
    if (!q) return true;
    return [c.code, c.name, c.category ?? "", c.parentCode ?? ""].some((v) => v.toLowerCase().includes(q));
  });
}

/** จำนวนบนแท็บของแต่ละชุด — นับเฉพาะที่ยังไม่เก็บถาวร (แบบเดียวกับตัวเลขข้างแท็บเดิม) */
export function codeKindCounts(codes: CodeEntry[]): Record<CodeKind, number> {
  const out: Record<CodeKind, number> = { department: 0, account: 0, workType: 0 };
  for (const c of codes) if (!c.isDeleted) out[c.kind] += 1;
  return out;
}
