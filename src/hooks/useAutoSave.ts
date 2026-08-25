import { useCallback, useEffect, useRef, useState } from "react";

/**
 * บันทึกอัตโนมัติสำหรับแบบฟอร์มเอกสารทุกโมดูล (เพิ่ม 2026-08-25)
 * Auto-save for every document editor in the app, added 2026-08-25 after work was repeatedly lost
 * by navigating away from a quotation without pressing "บันทึกร่าง".
 *
 * There are deliberately **two independent layers**, because they fail in different ways:
 *
 * 1. `useDraftBackup()` — a local snapshot in `localStorage`, written on a short debounce. It costs
 *    nothing, needs no permission, works with no network, and survives a closed tab, a crash, or a
 *    click onto another page mid-edit. It is the only layer that can protect a document that does
 *    not exist on the server yet (a brand-new quotation), so it is the one that actually answers
 *    the original complaint. Recovery is always **offered, never applied silently** — the user is
 *    shown what was found and chooses, so re-opening a blank form never surprises them with an
 *    abandoned draft they had already given up on.
 *
 * 2. `useAutoSave()` — a real, silent `PATCH` to the server on a longer debounce, for documents that
 *    already exist and are still editable Drafts. This is what makes the draft genuinely saved
 *    rather than merely recoverable on this one browser.
 *
 * Both take the **exact payload the manual Save button would send** (e.g. `toUpdateFields(draft)`),
 * not the whole loaded document. That matters: server-assigned fields such as `updatedAt` never
 * enter the comparison, so an auto-save can't observe its own write and loop.
 */

export type AutoSaveState = "idle" | "pending" | "saving" | "saved" | "error";

/** หน่วงเวลาหลังหยุดพิมพ์ก่อนยิงบันทึกขึ้นเซิร์ฟเวอร์ */
const DEFAULT_SAVE_DELAY_MS = 2500;
/** รอลองใหม่เมื่อมีคำขอบันทึกก่อนหน้ายังค้างอยู่ */
const IN_FLIGHT_RETRY_MS = 400;
/** สำเนาในเครื่องเขียนถี่กว่ามาก เพราะไม่มีต้นทุนเครือข่าย */
const BACKUP_DELAY_MS = 700;
/** เก็บสำเนาในเครื่องไว้ 7 วัน — เกินกว่านั้นถือว่าไม่ใช่งานที่ค้างอยู่แล้ว */
const BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const BACKUP_KEY_PREFIX = "tcs_erp_draft_backup_v1";

/** `JSON.stringify` ที่ไม่ throw — ข้อมูลร่างอาจมีค่าที่ serialize ไม่ได้ */
function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

/**
 * บันทึกร่างขึ้นเซิร์ฟเวอร์อัตโนมัติเมื่อผู้ใช้หยุดแก้ไข
 *
 * Silently saves the draft to the server once the user stops editing for `delayMs`.
 *
 * - `data` must be the same payload the manual Save sends, or `null` while the document is still
 *   loading or is not editable.
 * - The first non-null `data` seen becomes the baseline and is never saved: that is the document as
 *   the server already has it, so merely opening a record never writes to it.
 * - `markSaved()` should be called after a *manual* save so the very next auto-save doesn't
 *   immediately re-send the identical payload.
 */
export function useAutoSave<T>({
  data,
  enabled,
  onSave,
  delayMs = DEFAULT_SAVE_DELAY_MS,
}: {
  data: T | null;
  enabled: boolean;
  onSave: (data: T) => Promise<void>;
  delayMs?: number;
}): { state: AutoSaveState; lastSavedAt: number | null; saveNow: () => void; markSaved: () => void } {
  const [state, setState] = useState<AutoSaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const serialized = data === null ? null : safeStringify(data);

  // สถานะล่าสุดที่ "เซิร์ฟเวอร์รู้แล้ว" — ใช้เทียบว่ามีอะไรเปลี่ยนจริงหรือไม่
  const baselineRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // ค่าล่าสุดของ props สำหรับให้ตัวจับเวลาอ่านตอนยิงจริง (อัปเดตใน effect ไม่ใช่ตอน render)
  const latestRef = useRef<{ data: T | null; serialized: string | null; onSave: (data: T) => Promise<void> }>({
    data, serialized, onSave,
  });
  useEffect(() => {
    latestRef.current = { data, serialized, onSave };
  });

  const runSave = useCallback(() => {
    async function attempt(): Promise<void> {
      const { data: payload, serialized: snapshot, onSave: save } = latestRef.current;
      if (payload === null || snapshot === null || snapshot === baselineRef.current) return;
      // มีคำขอก่อนหน้าค้างอยู่ — รอให้จบก่อนแล้วค่อยลองใหม่ (ไม่ยิงซ้อนกัน)
      // A previous save is still in flight. Retry shortly rather than dropping this change or
      // sending two overlapping writes for the same document.
      if (inFlightRef.current) {
        setTimeout(() => { void attempt(); }, IN_FLIGHT_RETRY_MS);
        return;
      }
      inFlightRef.current = true;
      setState("saving");
      try {
        await save(payload);
        baselineRef.current = snapshot;
        setLastSavedAt(Date.now());
        // ถ้าผู้ใช้พิมพ์ต่อระหว่างกำลังบันทึก ให้คงสถานะ "รอบันทึก" ไว้ (effect ตั้งเวลารอบใหม่เอง)
        setState(latestRef.current.serialized === snapshot ? "saved" : "pending");
      } catch {
        // ไม่แสดง toast — สำเนาในเครื่องยังอยู่ และปุ่มบันทึกปกติยังรายงานข้อผิดพลาดเองอยู่แล้ว
        // Deliberately no toast: the local backup still holds this edit, and the manual Save button
        // reports failures properly. A background stream of error toasts would be worse than the
        // quiet indicator the caller renders from `state`.
        setState("error");
      } finally {
        inFlightRef.current = false;
      }
    }
    void attempt();
  }, []);

  useEffect(() => {
    if (!enabled || serialized === null) return;
    if (baselineRef.current === null) { baselineRef.current = serialized; return; }
    if (serialized === baselineRef.current) return;
    setState("pending");
    const timer = setTimeout(runSave, delayMs);
    return () => clearTimeout(timer);
  }, [serialized, enabled, delayMs, runSave]);

  const markSaved = useCallback(() => {
    baselineRef.current = latestRef.current.serialized;
    setLastSavedAt(Date.now());
    setState("saved");
  }, []);

  return { state, lastSavedAt, saveNow: runSave, markSaved };
}

interface StoredBackup<T> {
  savedAt: number;
  data: T;
}

function backupStorageKey(key: string): string {
  return `${BACKUP_KEY_PREFIX}:${key}`;
}

function removeBackup(key: string): void {
  try {
    localStorage.removeItem(backupStorageKey(key));
  } catch {
    // localStorage อาจถูกปิดไว้ — ไม่มีอะไรต้องทำต่อ
  }
}

function readBackup<T>(key: string): StoredBackup<T> | null {
  try {
    const raw = localStorage.getItem(backupStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredBackup<T>;
    if (typeof parsed?.savedAt !== "number" || !("data" in parsed)) return null;
    if (Date.now() - parsed.savedAt > BACKUP_MAX_AGE_MS) {
      removeBackup(key);
      return null;
    }
    return parsed;
  } catch {
    // localStorage อาจถูกปิด/เต็ม — ถือว่าไม่มีสำเนา ไม่ทำให้หน้าจอพัง
    return null;
  }
}

/**
 * เก็บสำเนาร่างไว้ในเครื่อง แล้วเสนอให้กู้คืนเมื่อกลับเข้ามาหน้าเดิม
 *
 * Keeps a local snapshot of the in-progress draft and offers it back when the same document (or the
 * same "new document" form) is reopened with different content.
 *
 * `storageKey` must identify the document — e.g. `"quotation:QT-2026-0042"` or `"quotation:new"`.
 * Pass `null` to disable (document not loaded yet, or read-only).
 *
 * Nothing is written while a recovery offer is on screen: overwriting the very snapshot the user is
 * being asked about would destroy it the moment the form renders.
 */
export function useDraftBackup<T>({
  storageKey,
  data,
  enabled,
}: {
  storageKey: string | null;
  data: T | null;
  enabled: boolean;
}): { recovered: T | null; recoveredAt: number | null; dismiss: () => void; clear: () => void } {
  const [recovered, setRecovered] = useState<{ data: T; savedAt: number } | null>(null);
  // คีย์ที่ตรวจหาสำเนาค้างไปแล้ว — เป็น ref ไม่ใช่ state เพราะไม่ต้องทำให้ re-render
  const checkedKeyRef = useRef<string | null>(null);
  const recoveredRef = useRef(recovered);
  useEffect(() => { recoveredRef.current = recovered; });

  const serialized = data === null ? null : safeStringify(data);

  // ทั้งการตรวจหาสำเนาค้างและการเขียนสำเนาใหม่เกิดใน callback ของตัวจับเวลาเดียวกัน — localStorage
  // เป็นระบบภายนอก การอ่าน/เขียนจึงอยู่นอกช่วง render ทั้งหมด
  //
  // Detection and writing share one debounced callback. `localStorage` is an external system, so
  // both the read and the write happen inside the timer rather than in the effect body — that keeps
  // the recovery offer out of the render path entirely.
  //
  // The first tick for a given document decides which of the two it is: if a stranded snapshot
  // exists AND differs from what was loaded, it is offered and nothing is overwritten (overwriting
  // the very snapshot the user is being asked about would destroy it); a snapshot that matches is
  // merely stale and is cleaned up. Every later tick just refreshes the snapshot.
  useEffect(() => {
    if (!enabled || !storageKey || serialized === null) return;
    const timer = setTimeout(() => {
      if (checkedKeyRef.current !== storageKey) {
        checkedKeyRef.current = storageKey;
        const stored = readBackup<T>(storageKey);
        if (stored) {
          if (safeStringify(stored.data) !== serialized) {
            setRecovered({ data: stored.data, savedAt: stored.savedAt });
            return;
          }
          removeBackup(storageKey);
        }
      }
      // ยังมีข้อเสนอกู้คืนค้างอยู่ — ห้ามเขียนทับสำเนานั้นก่อนผู้ใช้ตัดสินใจ
      if (recoveredRef.current) return;
      try {
        localStorage.setItem(
          backupStorageKey(storageKey),
          JSON.stringify({ savedAt: Date.now(), data: JSON.parse(serialized) }),
        );
      } catch {
        // เต็ม/ปิดอยู่ — ข้ามไปเงียบ ๆ ชั้นบันทึกขึ้นเซิร์ฟเวอร์ยังทำงานปกติ
      }
    }, BACKUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, storageKey, serialized]);

  const clear = useCallback(() => {
    setRecovered(null);
    if (storageKey) removeBackup(storageKey);
  }, [storageKey]);

  return {
    recovered: recovered?.data ?? null,
    recoveredAt: recovered?.savedAt ?? null,
    dismiss: clear,
    clear,
  };
}
