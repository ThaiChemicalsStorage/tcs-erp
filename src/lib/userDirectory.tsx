import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { User } from "./users";

/**
 * ทะเบียนผู้ใช้ที่โหลดไว้แล้วใน `App.tsx` เปิดให้คอมโพเนนต์ลึก ๆ อ่านได้โดยไม่ต้องส่งเป็น prop ต่อกัน
 * ทีละชั้น — เพิ่ม 2026-09-02 ตอนทำ *"คนที่สร้างเอกสารไหนก็ตามให้ขึ้นลายเซ็นเป็นคนสร้าง"*
 *
 * เหตุผลที่เป็น context ไม่ใช่ prop: ใบพิมพ์ **ทุกใบ** ต้องการลายเซ็น และเส้นทางกว่าจะถึงใบพิมพ์คือ
 * `App → XxxPage → XxxDocument → XxxPrintDocument` สี่ชั้นต่อหนึ่งโมดูล คูณเก้าโมดูล การส่ง `users`
 * เป็น prop จึงหมายถึงแก้ signature ของคอมโพเนนต์กลางทางอีกสามสิบกว่าจุดที่ไม่ได้ใช้ค่านั้นเองเลย
 *
 * `App.tsx` โหลด `users` แบบ best-effort ตอนบูต — ระหว่างที่ยังโหลดไม่เสร็จ (หรือถ้าโหลดพลาด)
 * `byId()` คืน `undefined` และใบพิมพ์จะพิมพ์เส้นลายเซ็นเปล่าออกมาเหมือนเดิม ไม่ใช่พังทั้งหน้า
 */
export interface UserDirectory {
  users: User[];
  /** หาผู้ใช้จาก id — `undefined` เมื่อไม่มี id, หาไม่เจอ, หรือรายชื่อยังโหลดไม่เสร็จ */
  byId: (userId: string | null | undefined) => User | undefined;
}

const EMPTY: UserDirectory = { users: [], byId: () => undefined };

const UserDirectoryContext = createContext<UserDirectory>(EMPTY);

export function UserDirectoryProvider({ users, children }: { users: User[]; children: ReactNode }) {
  const value = useMemo<UserDirectory>(() => {
    const index = new Map(users.map((u) => [u.id, u]));
    return { users, byId: (userId) => (userId ? index.get(userId) : undefined) };
  }, [users]);
  return <UserDirectoryContext.Provider value={value}>{children}</UserDirectoryContext.Provider>;
}

export function useUserDirectory(): UserDirectory {
  return useContext(UserDirectoryContext);
}
