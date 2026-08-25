import { useCallback, useEffect, useMemo, useRef } from "react";
import { isPayloadDirty, safeStringify } from "../lib/unsavedChanges";

/**
 * ติดตามว่ามีการแก้ไขที่ยังไม่ได้บันทึกหรือไม่ (เพิ่ม 2026-08-25)
 *
 * Tracks whether a form holds unsaved work. Deliberately separate from `useAutoSave`, whose own
 * baseline only exists while auto-save is *enabled* — and the documents this guard exists for are
 * precisely the ones auto-save is switched off for (a document with no server record yet, or one
 * past Draft that the server refuses to auto-save). Six editors also feed `useAutoSave` a `null`
 * payload in those states, so it is doubly blind there. Teaching it to see them would change what
 * auto-save itself compares and when it fires, in code that is protecting live data.
 *
 * Feed this the payload representing everything the user can change on screen — usually the same
 * `toUpdateFields(draft)` the Save button sends. Pass `null` when there is nothing to track.
 *
 * **Dirtiness is pulled, not rendered.** `isDirtyNow()` is a function rather than a boolean on
 * purpose: reading a ref during render trips `react-hooks/refs`, and holding the answer in state
 * would re-render the editor on every keystroke to keep a value nobody displays. The only moment
 * it matters is when the user tries to leave, so that is when it is computed.
 */
export function useDirtyTracker<T>(data: T | null): {
  /** อ่านตอนจะออกจากหน้า ไม่ใช่ตอนเรนเดอร์ */
  isDirtyNow: () => boolean;
  /** ตั้งฐานเทียบใหม่หลังบันทึกสำเร็จ — ส่ง payload ที่ "ส่งไปจริง" ไม่ใช่สิ่งที่อยู่บนจอตอนนี้ */
  markSaved: (saved?: T) => void;
} {
  const serialized = data === null ? null : safeStringify(data);

  /** สถานะล่าสุดที่ถือว่า "บันทึกแล้ว" — ใช้เทียบว่ามีอะไรเปลี่ยนจริงหรือไม่ */
  const baselineRef = useRef<string | null>(null);
  // ค่าล่าสุดสำหรับให้ callback อ่านตอนถูกเรียกจริง (อัปเดตใน effect ไม่ใช่ตอน render — แบบเดียวกับ useAutoSave)
  const latestRef = useRef<string | null>(serialized);
  useEffect(() => {
    latestRef.current = serialized;
  });

  // ค่าแรกที่ไม่ใช่ null คือฐานเทียบตั้งต้น — เปิดเอกสารขึ้นมาเฉย ๆ ต้องไม่ถือว่ามีการแก้ไข
  useEffect(() => {
    if (serialized === null || baselineRef.current !== null) return;
    baselineRef.current = serialized;
  }, [serialized]);

  const isDirtyNow = useCallback(() => isPayloadDirty(baselineRef.current, latestRef.current), []);

  const markSaved = useCallback((saved?: T) => {
    // ใช้ payload ที่ "ส่งไปจริง" เป็นฐานเทียบ ไม่ใช่สิ่งที่อยู่บนจอตอนนี้ — ถ้าผู้ใช้พิมพ์ต่อระหว่างรอผลบันทึก
    // การยึดค่าบนจอจะทำให้ตัวอักษรที่พิมพ์เพิ่มถูกนับว่า "บันทึกแล้ว" ทั้งที่ยังไม่เคยถูกส่งขึ้นเซิร์ฟเวอร์
    // (แก้บั๊คเดียวกับที่ markSaved ของ useAutoSave เคยเจอ)
    baselineRef.current = saved === undefined ? latestRef.current : safeStringify(saved);
  }, []);

  // อ็อบเจกต์ที่คืนต้องอ้างอิงเดิมตลอด เพื่อให้หน้าเอกสารใส่ลงใน dependency array ของ effect โหลดข้อมูล
  // ได้อย่างปลอดภัย (ต้องตั้งฐานเทียบใหม่ทุกครั้งที่ดึงเอกสารจากเซิร์ฟเวอร์)
  //
  // Both members are already stable; memoizing the wrapper keeps the returned object stable too, so
  // editors can list it in the dependency array of the effect that loads the document — which is
  // exactly where the baseline has to be re-seeded.
  return useMemo(() => ({ isDirtyNow, markSaved }), [isDirtyNow, markSaved]);
}
