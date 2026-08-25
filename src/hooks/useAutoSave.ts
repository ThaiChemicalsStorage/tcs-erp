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
 * - `markSaved(payload)` should be called after a *manual* save so the very next auto-save doesn't
 *   immediately re-send the identical payload. **Pass the payload that was actually sent** — not
 *   omitted: if the user kept typing during the save's round trip, the latest on-screen state is
 *   newer than what the server received, and adopting it as the baseline would mark those extra
 *   keystrokes "saved" and never send them.
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
}): { state: AutoSaveState; lastSavedAt: number | null; markSaved: (saved?: T) => void } {
  const [state, setState] = useState<AutoSaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const serialized = data === null ? null : safeStringify(data);

  // สถานะล่าสุดที่ "เซิร์ฟเวอร์รู้แล้ว" — ใช้เทียบว่ามีอะไรเปลี่ยนจริงหรือไม่
  const baselineRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // ตัวจับเวลา "ลองใหม่เพราะมีคำขอค้างอยู่" — เก็บไว้เพื่อยกเลิกตอน unmount ไม่ให้ยิงหลังออกจากหน้าไปแล้ว
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ค่าล่าสุดของ props สำหรับให้ตัวจับเวลาอ่านตอนยิงจริง (อัปเดตใน effect ไม่ใช่ตอน render)
  const latestRef = useRef<{ data: T | null; serialized: string | null; onSave: (data: T) => Promise<void>; enabled: boolean }>({
    data, serialized, onSave, enabled,
  });
  useEffect(() => {
    latestRef.current = { data, serialized, onSave, enabled };
  });

  const runSave = useCallback(() => {
    async function attempt(): Promise<void> {
      const { data: payload, serialized: snapshot, onSave: save } = latestRef.current;
      if (payload === null || snapshot === null || snapshot === baselineRef.current) return;
      // มีคำขอก่อนหน้าค้างอยู่ — รอให้จบก่อนแล้วค่อยลองใหม่ (ไม่ยิงซ้อนกัน)
      // A previous save is still in flight. Retry shortly rather than dropping this change or
      // sending two overlapping writes for the same document.
      if (inFlightRef.current) {
        if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(() => { retryTimerRef.current = null; void attempt(); }, IN_FLIGHT_RETRY_MS);
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

  // ออกจากหน้าไปทั้งที่ยังมีการแก้ไขค้างอยู่ในช่วงหน่วงเวลา = งานหายไปเฉย ๆ ซึ่งคือปัญหาที่ฟีเจอร์นี้
  // ตั้งใจแก้ตั้งแต่แรก จึงต้องยิงบันทึกทิ้งท้ายตอน unmount (คำขอเดินต่อได้แม้คอมโพเนนต์ถูกถอดแล้ว)
  //
  // Flush on unmount. Without this, typing and then clicking to another page inside the debounce
  // window silently drops the write — the exact "navigated away and lost my work" case this hook
  // exists to prevent. `runSave()` no-ops unless there really is an unsaved change, and the request
  // it fires outlives the component.
  useEffect(() => () => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (latestRef.current.enabled) runSave();
  }, [runSave]);

  const markSaved = useCallback((saved?: T) => {
    // ใช้ payload ที่ "ส่งไปจริง" เป็นฐานเทียบ ไม่ใช่สิ่งที่อยู่บนจอตอนนี้ — ถ้าผู้ใช้พิมพ์ต่อระหว่างรอผลบันทึก
    // การยึดค่าบนจอจะทำให้ตัวอักษรที่พิมพ์เพิ่มถูกนับว่า "บันทึกแล้ว" ทั้งที่ยังไม่เคยถูกส่งขึ้นเซิร์ฟเวอร์
    baselineRef.current = saved === undefined ? latestRef.current.serialized : safeStringify(saved);
    setLastSavedAt(Date.now());
    setState("saved");
  }, []);

  return { state, lastSavedAt, markSaved };
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

/**
 * เขียนสำเนาลง localStorage โดยไม่ต้อง parse/stringify ซ้ำ — `serialized` เป็น JSON ที่พร้อมใช้อยู่แล้ว
 * Writes the snapshot without re-parsing and re-serializing a payload that is already JSON.
 */
function writeBackup(key: string, serialized: string): void {
  try {
    localStorage.setItem(backupStorageKey(key), `{"savedAt":${Date.now()},"data":${serialized}}`);
  } catch {
    // เต็ม/ปิดอยู่ — ข้ามไปเงียบ ๆ ชั้นบันทึกขึ้นเซิร์ฟเวอร์ยังทำงานปกติ
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
  // สำเนาถูกล้างไปแล้วและยังไม่มีการแก้ไขใหม่หลังจากนั้น — ห้าม "เขียนทิ้งท้าย" ตอน unmount ไม่งั้นการกดบันทึก
  // แล้วออกจากหน้าจะปลุกสำเนาที่เพิ่งล้างไปกลับมา (โดยเฉพาะคีย์ "…:new" ที่จะไปทักเอกสารใหม่ใบถัดไป)
  const clearedRef = useRef(false);

  const serialized = data === null ? null : safeStringify(data);

  // ค่าล่าสุดสำหรับ "เขียนทิ้งท้าย" ตอนปิดแท็บ/ออกจากหน้า ซึ่งเกิดนอกรอบ render ปกติ
  const latestRef = useRef<{ storageKey: string | null; serialized: string | null; enabled: boolean }>({
    storageKey, serialized, enabled,
  });
  useEffect(() => { latestRef.current = { storageKey, serialized, enabled }; });

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
      clearedRef.current = false;
      writeBackup(storageKey, serialized);
    }, BACKUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [enabled, storageKey, serialized]);

  // ปิดแท็บหรือออกจากหน้าไปกลางคัน = การแก้ไขในช่วงหน่วง 700ms สุดท้ายหายไปทั้งที่ชั้นนี้มีไว้กันเรื่องนี้
  // โดยเฉพาะ — localStorage เขียนแบบ synchronous จึงเขียนทันได้ทั้งใน `pagehide` และตอน unmount
  //
  // Flush on tab-close/navigation. The debounced write is dropped when the page goes away, which is
  // precisely the case this layer exists for; `localStorage` is synchronous, so a last write still
  // lands from `pagehide` (the one teardown event that also fires for the bfcache path) and from
  // unmount. Never writes while a recovery offer is on screen — that snapshot is what is being
  // offered.
  useEffect(() => {
    const flush = () => {
      const { storageKey: key, serialized: snapshot, enabled: on } = latestRef.current;
      if (!on || !key || snapshot === null || recoveredRef.current || clearedRef.current) return;
      // ยังไม่ได้ตรวจหาสำเนาค้างของคีย์นี้เลย — เขียนตอนนี้จะทับของเดิมที่ยังไม่ได้เสนอให้ผู้ใช้
      if (checkedKeyRef.current !== key) return;
      writeBackup(key, snapshot);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const clear = useCallback(() => {
    setRecovered(null);
    clearedRef.current = true;
    if (storageKey) removeBackup(storageKey);
  }, [storageKey]);

  return {
    recovered: recovered?.data ?? null,
    recoveredAt: recovered?.savedAt ?? null,
    dismiss: clear,
    clear,
  };
}
