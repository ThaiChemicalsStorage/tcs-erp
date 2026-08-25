import type { AutoSaveState } from "../hooks/useAutoSave";

/**
 * กฎว่า "ต้องถามก่อนออกจากหน้าเอกสารไหม" (เพิ่ม 2026-08-25)
 *
 * The rule behind the "ยังไม่ได้บันทึก" prompt, kept here as plain functions with no React in
 * sight so it can be tested directly — the same reason `navResolution.ts` exists. That precedent
 * was set the same day, after a bug was signed off twice from a browser because the window in
 * which it was visible lasted one network round trip. This rule has exactly that shape: whether
 * to interrupt someone depends on a 2.5-second auto-save debounce being mid-flight, which no
 * screenshot taken a moment later can show.
 *
 * `safeStringify` lives here rather than in `useAutoSave.ts` (which now imports it back) so that
 * auto-save and this guard can never disagree about whether two payloads are the same.
 */

/** `JSON.stringify` ที่ไม่ throw — ข้อมูลร่างอาจมีค่าที่ serialize ไม่ได้ */
export function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

/**
 * มีการแก้ไขต่างจากฐานเทียบล่าสุดหรือไม่
 *
 * ยังไม่เคยตั้งฐานเทียบ หรือ serialize ไม่ได้ = ตอบว่า "ไม่มีการแก้ไข" เสมอ — ห้ามกักผู้ใช้ไว้ในหน้าเพราะระบบ
 * เทียบข้อมูลไม่ได้ (fail open)
 *
 * Fails open on purpose. A null baseline means nothing has been seeded yet, and a null
 * serialization means the payload could not be compared at all; in neither case do we know of a
 * real unsaved change, and trapping someone on a page over a stringify failure would be worse
 * than the loss this feature prevents.
 */
export function isPayloadDirty(baseline: string | null, current: string | null): boolean {
  if (baseline === null || current === null) return false;
  return baseline !== current;
}

/** เหตุผลที่งานยัง "เสี่ยงหาย" — ใช้เลือกข้อความในกล่องแจ้งเตือน; "none" = ออกจากหน้าได้เลย */
export type UnsavedRisk = "none" | "new" | "notAutoSaved" | "autoSaveFailed";

export interface UnsavedRiskInput {
  /** มีการแก้ไขต่างจากฐานเทียบล่าสุดหรือไม่ */
  isDirty: boolean;
  /** เอกสารนี้มีเรคอร์ดบนเซิร์ฟเวอร์แล้วหรือยัง (ใบที่ยังไม่เคยกดบันทึก = false) */
  hasServerRecord: boolean;
  /** เข้าเงื่อนไขบันทึกอัตโนมัติหรือไม่ (แก้ไขได้ + ยังเป็นฉบับร่าง) */
  autoSaveEnabled: boolean;
  /** สถานะล่าสุดของ useAutoSave */
  autoSaveState: AutoSaveState;
}

/**
 * ถามก่อนออกจากหน้าเฉพาะตอนที่งานเสี่ยงหายจริงเท่านั้น
 *
 * The owner's explicit rule: a healthy Draft whose auto-save debounce merely happens to be
 * mid-flight is **not** a reason to interrupt anyone. `useAutoSave` flushes on unmount, so that
 * work lands whether or not we ask, and a prompt there would be pure noise on the common path.
 *
 * Three situations genuinely risk losing work, and they are ordered by how actionable the
 * resulting message is:
 *
 * 1. `"new"` — no server record exists yet, so there is nothing for auto-save to PATCH. Leaving
 *    means the document is never created. Checked first: it is the most consequential case, and
 *    a stale `autoSaveState` left over from a previous mount must not be able to mask it.
 * 2. `"notAutoSaved"` — the document is editable but past Draft, and the server rejects
 *    `?autoSave=1` for those. Four editors have fields in this state (a Scope of Work's follow-up
 *    fields, a Production Order's signatories, a Material Requisition's return fields, and any
 *    approved/sent/won Quotation).
 * 3. `"autoSaveFailed"` — auto-save is on and was tried, but the last attempt failed, so some
 *    edits never reached the server.
 */
export function assessUnsavedRisk(input: UnsavedRiskInput): UnsavedRisk {
  if (!input.isDirty) return "none";
  if (!input.hasServerRecord) return "new";
  if (!input.autoSaveEnabled) return "notAutoSaved";
  if (input.autoSaveState === "error") return "autoSaveFailed";
  // ร่างที่บันทึกอัตโนมัติดูแลอยู่ และยังไม่มีอะไรผิดพลาด — ปล่อยผ่าน ไม่ต้องรบกวน
  return "none";
}

/**
 * สิ่งที่หน้าเอกสารลงทะเบียนไว้ว่า "ยังมีงานค้างอยู่"
 *
 * Lives here rather than beside the hook so the registry below can be tested without React.
 */
export interface UnsavedChangesGuard {
  /** เรียกตอนผู้ใช้จะออกจากหน้า ไม่ใช่ตอนเรนเดอร์ — "none" = ปล่อยผ่านทันที */
  getRisk: () => UnsavedRisk;
  /** เลขที่หรือชื่อเอกสาร แสดงในกล่องให้เห็นว่ากำลังพูดถึงใบไหน */
  documentLabel: string;
  /**
   * ปุ่ม "บันทึก" ในกล่อง — ต้องเป็นตัวบันทึกจริงของหน้านั้น ผ่าน validation ครบเหมือนกดปุ่มบันทึกเอง
   * ไม่ใช่ทางบันทึกอัตโนมัติ เพราะใบใหม่ยังไม่มี id การ "บันทึก" ของมันคือการ "สร้าง"
   *
   * Resolves `true` only when the work is safely persisted; `false` when validation or the server
   * rejected it, which keeps the user on the page instead of navigating away.
   */
  save: () => Promise<boolean>;
  /** ปุ่ม "ไม่บันทึก" — ต้องล้างสำเนาในเครื่องด้วย ไม่งั้นจะถูกเสนอให้กู้คืนงานที่เพิ่งเลือกทิ้งไป */
  discard: () => void;
}

/**
 * ทะเบียนการ์ดของหน้าที่เปิดอยู่ — แยกออกจาก React เพื่อให้ทดสอบกฎการถอนทะเบียนได้ตรง ๆ
 *
 * The rule that needs testing is the one that is easiest to get wrong and worst to get wrong: an
 * editor re-registers on every render and unregisters on unmount, and React can unmount the old
 * page *after* the new one has mounted. If a late teardown were allowed to clear whatever is
 * currently registered, it would wipe the incoming page's guard; if a guard were left behind, it
 * would block every future navigation with a prompt about a document nobody is looking at.
 */
export interface GuardRegistry {
  register: (token: symbol, guard: UnsavedChangesGuard | null) => void;
  current: () => UnsavedChangesGuard | null;
  clear: () => void;
  /** ต้องถามก่อนออกไหม — ไม่มีการ์ดอยู่ = ไม่ต้องถาม */
  assess: () => UnsavedRisk;
}

export function createGuardRegistry(): GuardRegistry {
  let held: { token: symbol; guard: UnsavedChangesGuard } | null = null;
  return {
    register(token, guard) {
      if (guard === null) {
        // ถอนได้เฉพาะทะเบียนของตัวเอง — หน้าเก่าที่ unmount ทีหลังต้องลบทะเบียนของหน้าใหม่ไม่ได้
        if (held?.token === token) held = null;
        return;
      }
      held = { token, guard };
    },
    current: () => held?.guard ?? null,
    clear() { held = null; },
    assess: () => (held ? held.guard.getRisk() : "none"),
  };
}

/**
 * เรียกตัวบันทึกจริงของหน้าเอกสารแล้วตอบว่า "ออกจากหน้าได้หรือยัง"
 *
 * A save that throws must read as "not saved", never as success — otherwise a failed save would
 * navigate away and destroy exactly the work this dialog exists to protect.
 */
export async function runGuardedSave(save: () => Promise<boolean>): Promise<boolean> {
  try {
    return await save();
  } catch {
    return false;
  }
}
