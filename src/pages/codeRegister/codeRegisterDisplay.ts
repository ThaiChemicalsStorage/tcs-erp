import { codeApprovalStatusOf, type CodeApprovalStatus, type CodeEntry, type CodeKind } from "../../lib/codeRegister";
import type { TranslationKey } from "../../lib/i18n";

export const codeKindLabelKey: Record<CodeKind, TranslationKey> = {
  department: "codeRegister.tab.department",
  account: "codeRegister.tab.account",
  workType: "codeRegister.tab.workType",
};

/** ป้ายขั้นอนุมัติของบัญชี (2026-10-02) */
export const codeApprovalLabelKey: Record<CodeApprovalStatus, TranslationKey> = {
  pending: "codeRegister.approval.pending",
  approved: "codeRegister.approval.approved",
  rejected: "codeRegister.approval.rejected",
};

/**
 * กรองรหัสของชุดที่เลือก ตามคำค้นและการแสดงที่เก็บถาวร — คำค้นดูรหัส ชื่อ หมวด และบัญชีคุม เหมือนเดิม
 * แยกเป็นฟังก์ชันล้วนเพื่อทดสอบได้ และให้หน้าจอกับจำนวนรายการใช้กติกาเดียวกัน
 * `pendingOnly` (2026-10-02) = เฉพาะที่รอบัญชีอนุมัติ — ให้บัญชีหารหัสที่ต้องอนุมัติเจอในผังบัญชี 479 แถว
 */
export function filterCodeEntries(codes: CodeEntry[], opts: { kind: CodeKind; search: string; showArchived: boolean; pendingOnly?: boolean }): CodeEntry[] {
  const q = opts.search.trim().toLowerCase();
  return codes.filter((c) => {
    if (c.kind !== opts.kind) return false;
    if (!opts.showArchived && c.isDeleted) return false;
    if (opts.pendingOnly && codeApprovalStatusOf(c) !== "pending") return false;
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

/** จำนวนรหัสที่รอบัญชีอนุมัติ ต่อชุด (ไม่นับที่เก็บถาวร) */
export function codePendingCounts(codes: CodeEntry[]): Record<CodeKind, number> {
  const out: Record<CodeKind, number> = { department: 0, account: 0, workType: 0 };
  for (const c of codes) if (!c.isDeleted && codeApprovalStatusOf(c) === "pending") out[c.kind] += 1;
  return out;
}
