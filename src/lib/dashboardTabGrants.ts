import type { Permission } from "./permissions";
import { DASHBOARD_DOCUMENT_PERMISSIONS, DASHBOARD_TICK, type DashboardTickKey } from "./dashboardTabs.js";

/**
 * สิทธิ์ติ๊กแท็บแดชบอร์ดที่บทบาทหนึ่ง "ควรได้" จากสิทธิ์เอกสารที่ถืออยู่ (2026-09-14)
 *
 * ก่อนมีสิทธิ์ติ๊ก แท็บเปิดด้วยสิทธิ์ดูเอกสารของแผนกนั้นอย่างเดียว · ใช้สองที่เพื่อให้ไม่มีใครเสียแท็บที่เคยเห็น:
 *   1. `defaultRoles` — ติดตั้งใหม่ได้ติ๊กเท่ากับที่ฐานข้อมูลเดิมได้จาก migration
 *   2. migration `dashboard-tab-ticks-2026-09-14` ใน `api/_lib/rbacSeed.ts` — รันครั้งเดียวกับ**ทุกบทบาท**
 *      รวมบทบาทที่ลูกค้าสร้างเอง (สโตร์ จัดซื้อ ฯลฯ ไม่มี roleKey คงที่ให้แจกทีละตัว)
 * ไม่มี `dashboard:view` = เข้าหน้าแดชบอร์ดไม่ได้อยู่แล้ว ไม่แจกอะไร
 *
 * ไม่ import อะไรที่ลาก React มาด้วย — ถูกเรียกจาก roles.ts ซึ่งเซิร์ฟเวอร์โหลด
 */
export function dashboardTicksFromDocumentPermissions(permissions: readonly string[]): Permission[] {
  if (!permissions.includes("dashboard:view")) return [];
  const has = (p: Permission) => permissions.includes(p);
  const ticks: Permission[] = [DASHBOARD_TICK.overview];
  for (const key of Object.keys(DASHBOARD_DOCUMENT_PERMISSIONS) as Exclude<DashboardTickKey, "overview">[]) {
    if (DASHBOARD_DOCUMENT_PERMISSIONS[key].some(has)) ticks.push(DASHBOARD_TICK[key]);
  }
  return ticks;
}
