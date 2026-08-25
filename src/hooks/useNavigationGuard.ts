import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createGuardRegistry, runGuardedSave, type UnsavedChangesGuard, type UnsavedRisk } from "../lib/unsavedChanges";

export type { UnsavedChangesGuard } from "../lib/unsavedChanges";

/**
 * ดักทุกทางออกจากหน้าเอกสารที่ยังมีงานค้าง (เพิ่ม 2026-08-25)
 *
 * The app has no router: every navigation is a `setActiveNav(...)` call in `App.tsx`, and an open
 * editor is unmounted the instant one happens — including re-clicking the *already active* sidebar
 * item, because `navBump` remounts the page through the ErrorBoundary key. So the block has to sit
 * where the navigation is initiated, not where the route changes.
 *
 * Every initiator calls `requestLeave(proceed)`. When nothing is at risk, `proceed()` runs
 * synchronously in the same tick it always did — this must stay a no-op on the common path.
 */

export interface NavigationGuardApi {
  register: (token: symbol, guard: UnsavedChangesGuard | null) => void;
  requestLeave: (proceed: () => void) => void;
}

// ค่าเริ่มต้นเป็น no-op โดยตั้งใจ — หน้าเอกสารที่ถูกเรนเดอร์นอก Provider ต้องไม่พัง แค่ไม่มีการ์ด
// A page rendered outside the provider degrades to "no guard" rather than crashing.
export const NavigationGuardContext = createContext<NavigationGuardApi>({
  register: () => {},
  requestLeave: (proceed) => proceed(),
});

/**
 * ฝั่งหน้าเอกสาร — เรียกบรรทัดเดียว ส่ง `null` เมื่อยังไม่มีอะไรต้องกัน
 * คืน `requestLeave` มาให้ห่อปุ่มย้อนกลับของหน้านั้นเองด้วย
 */
export function useUnsavedChangesGuard(guard: UnsavedChangesGuard | null): {
  requestLeave: (proceed: () => void) => void;
} {
  const { register, requestLeave } = useContext(NavigationGuardContext);
  const tokenRef = useRef<symbol | null>(null);
  if (tokenRef.current === null) tokenRef.current = Symbol("unsavedChangesGuard");
  const token = tokenRef.current;

  // ไม่มี dependency array โดยตั้งใจ — closure ใน guard ต้องสดทุกเรนเดอร์ และ cleanup ต้องถอนทะเบียนเสมอ
  // ไม่งั้นการ์ดค้างจะบล็อกการเปลี่ยนหน้าไปตลอด (แนวเดียวกับ latestRef ใน useAutoSave)
  //
  // No dependency array on purpose: the guard's closures must be fresh on every render, and the
  // cleanup must always unregister — a stale guard left behind would block navigation forever.
  useEffect(() => {
    register(token, guard);
    return () => register(token, null);
  });

  return { requestLeave };
}

export interface NavigationGuardDialogState {
  open: boolean;
  risk: UnsavedRisk;
  documentLabel: string;
  busy: boolean;
  /** true = กด "บันทึก" แล้วไม่สำเร็จ กล่องต้องเปิดค้างไว้ ข้อความอธิบายอยู่ในตัวกล่องเอง */
  saveFailed: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export interface NavigationGuardHost {
  contextValue: NavigationGuardApi;
  /** ทุกจุดที่พาผู้ใช้ออกจากหน้าปัจจุบันต้องเรียกผ่านตัวนี้ */
  requestLeave: (proceed: () => void) => void;
  dialog: NavigationGuardDialogState;
}

interface PendingLeave {
  proceed: () => void;
  risk: UnsavedRisk;
  documentLabel: string;
}

/**
 * ฝั่ง App — ถือสถานะการ์ดไว้เอง จึงเรียก requestLeave ได้โดยไม่ต้องแยก App ออกเป็นสองคอมโพเนนต์
 *
 * A hook rather than a `<Provider>` component because `App` is both the provider and the biggest
 * consumer (~16 navigation call sites), and a component cannot consume a context it provides in
 * the same render. Wrapping would have meant splitting App's ~700-line body — a large diff in the
 * file that has already produced two user-visible navigation bugs, for no functional gain.
 */
export function useNavigationGuardHost(): NavigationGuardHost {
  // เก็บใน ref ไม่ใช่ state — หน้าเอกสารลงทะเบียนใหม่ทุกเรนเดอร์ ถ้าเป็น state จะ re-render ทั้งแอปทุกตัวอักษรที่พิมพ์
  // กฎการลงทะเบียน/ถอนทะเบียนอยู่ใน createGuardRegistry() ซึ่งไม่ผูกกับ React จึงเขียนเทสต์ตรง ๆ ได้
  const registryRef = useRef<ReturnType<typeof createGuardRegistry> | null>(null);
  registryRef.current ??= createGuardRegistry();
  const registry = registryRef.current;
  const [pending, setPending] = useState<PendingLeave | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  const register = useCallback((token: symbol, guard: UnsavedChangesGuard | null) => {
    registry.register(token, guard);
  }, [registry]);

  const requestLeave = useCallback((proceed: () => void) => {
    const risk = registry.assess();
    if (risk === "none") {
      // ทางปกติ — ต้องทำงานใน tick เดียวกับเดิมเป๊ะ ไม่มีอะไรเปลี่ยน
      proceed();
      return;
    }
    setSaveFailed(false);
    setBusy(false);
    setPending({ proceed, risk, documentLabel: registry.current()?.documentLabel ?? "" });
  }, [registry]);

  // ล้างทะเบียนก่อนไปเสมอ ไม่งั้นตอนหน้าเดิม unmount การ์ดเดิมอาจเด้งถามซ้ำอีกรอบ
  const leave = useCallback((proceed: () => void) => {
    registry.clear();
    setPending(null);
    setBusy(false);
    setSaveFailed(false);
    proceed();
  }, [registry]);

  const onSave = useCallback(() => {
    const guard = registry.current();
    const proceed = pending?.proceed;
    if (!guard || !proceed) return;
    setBusy(true);
    setSaveFailed(false);
    void (async () => {
      if (await runGuardedSave(guard.save)) {
        leave(proceed);
        return;
      }
      // บันทึกไม่ผ่าน — ต้องอยู่หน้าเดิม สาเหตุที่แท้จริงหน้าเอกสารแจ้งเป็น toast ของตัวเองอยู่แล้ว
      setBusy(false);
      setSaveFailed(true);
    })();
  }, [pending, leave, registry]);

  const onDiscard = useCallback(() => {
    const proceed = pending?.proceed;
    if (!proceed) return;
    registry.current()?.discard();
    leave(proceed);
  }, [pending, leave, registry]);

  const onCancel = useCallback(() => {
    setPending(null);
    setBusy(false);
    setSaveFailed(false);
  }, []);

  return {
    contextValue: { register, requestLeave },
    requestLeave,
    dialog: {
      open: pending !== null,
      risk: pending?.risk ?? "none",
      documentLabel: pending?.documentLabel ?? "",
      busy,
      saveFailed,
      onSave,
      onDiscard,
      onCancel,
    },
  };
}
