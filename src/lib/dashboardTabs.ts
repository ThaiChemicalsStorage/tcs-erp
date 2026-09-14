import type { Permission } from "./permissions";

/**
 * แท็บของหน้าแดชบอร์ด — ใครเห็นแท็บไหน (เพิ่ม 2026-09-14)
 *
 * เจ้าของสั่ง *"หน้า Dashboard อยากให้ทำให้ดูง่ายขึ้นแยกแต่ละแผนกอย่างชัดเจนแต่ก็ยังมี Dashboard ที่ดู
 * ข้อมูลรวมได้ทุกอย่างอยู่ด้วย"* และเลือกแบบ "แท็บในหน้าแดชบอร์ด" · ไฟล์นี้เป็นกติกาเดียวที่ทั้งหน้าจอ
 * และเซิร์ฟเวอร์ (`api/_lib/departmentDashboard.ts`) ใช้ตัดสินว่าแท็บ/บล็อกไหนเปิดให้ใคร
 * จึงต้องไม่ import อะไรที่เป็นค่าตอน runtime (มีแต่ type) — เซิร์ฟเวอร์โหลดไฟล์นี้ตรง ๆ
 *
 * **ไม่มีสิทธิ์ใหม่** — แต่ละแท็บเปิดด้วยสิทธิ์ดูของแผนกนั้นที่มีอยู่แล้ว (ตามที่จดไว้ใน TODO 2026-09-11)
 * · ภาพรวมเปิดเสมอ เพราะหน้าแดชบอร์ดทั้งหน้ามีด่าน `dashboard:view` อยู่แล้ว
 *
 * ข้อที่ตั้งใจ:
 *   - **ขาย** ใช้ `quotations:view` ไม่ใช่ `dashboard:view` — ตัวเลขทุกตัวของแท็บขายมาจากใบเสนอราคา
 *     ช่างบริการ/ฝ่ายบัญชีที่ถือ `dashboard:view` แต่ไม่มีสิทธิ์ดูใบเสนอราคา เคยเห็นแดชบอร์ดขายที่เป็นศูนย์ล้วน
 *   - **คลังสินค้า** ไม่นับ `products:view` เพราะฝ่ายขายถือสิทธิ์นี้ไว้ใช้เลือกสินค้าตอนทำใบเสนอราคา
 */

export type DashboardTabKey =
  | "overview" | "sales" | "service" | "purchasing" | "inventory" | "production" | "project" | "bd" | "accounting";

/** แท็บที่เซิร์ฟเวอร์คำนวณให้ผ่าน `GET /api/dashboard/departments` (ขายกับบัญชีมี endpoint ของตัวเองอยู่แล้ว) */
export const DEPARTMENT_KEYS = ["service", "purchasing", "inventory", "production", "project", "bd"] as const;
export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

export interface DashboardTabRule {
  key: DashboardTabKey;
  /** เห็นแท็บถ้ามีสิทธิ์ใดสิทธิ์หนึ่ง · ว่าง = เห็นเสมอ */
  anyPermission: Permission[];
}

/** เรียงตามลำดับที่แสดงบนแถบแท็บ */
export const DASHBOARD_TAB_RULES: DashboardTabRule[] = [
  { key: "overview", anyPermission: [] },
  { key: "sales", anyPermission: ["quotations:view"] },
  { key: "service", anyPermission: ["service:view"] },
  { key: "purchasing", anyPermission: ["purchaseOrder:view", "purchaseRequest:view"] },
  { key: "inventory", anyPermission: ["stock:view", "receivingReport:view", "productRequest:view"] },
  { key: "production", anyPermission: ["productionOrder:view"] },
  { key: "project", anyPermission: ["jobOrder:view", "project:view"] },
  { key: "bd", anyPermission: ["costControl:view"] },
  { key: "accounting", anyPermission: ["ar:view", "ap:view"] },
];

const TAB_KEYS = new Set<string>(DASHBOARD_TAB_RULES.map((r) => r.key));

export function isDashboardTabKey(raw: string): raw is DashboardTabKey {
  return TAB_KEYS.has(raw);
}

export function canSeeDashboardTab(key: DashboardTabKey, has: (permission: Permission) => boolean): boolean {
  const rule = DASHBOARD_TAB_RULES.find((r) => r.key === key);
  if (!rule) return false;
  return rule.anyPermission.length === 0 || rule.anyPermission.some(has);
}

export function visibleDashboardTabs(has: (permission: Permission) => boolean): DashboardTabKey[] {
  return DASHBOARD_TAB_RULES.filter((r) => canSeeDashboardTab(r.key, has)).map((r) => r.key);
}

/** `#dashboard/inventory` → `"inventory"` · `#dashboard` หรือค่าอื่นที่ไม่ใช่แท็บ → null */
export function tabFromHash(hash: string): DashboardTabKey | null {
  const [page, tab] = hash.replace(/^#\/?/, "").split("/");
  if (page !== "dashboard" || !tab) return null;
  return isDashboardTabKey(tab) ? tab : null;
}

/** ภาพรวมใช้ `#dashboard` เฉย ๆ เพื่อให้ลิงก์เดิมทุกอันยังตรงกับแท็บตั้งต้น */
export function dashboardTabHash(tab: DashboardTabKey): string {
  return tab === "overview" ? "#dashboard" : `#dashboard/${tab}`;
}

/**
 * แท็บที่จะเปิดตอนเข้าหน้า — URL ก่อน (ลิงก์/รีเฟรช) แล้วแท็บล่าสุดที่ผู้ใช้ดู แล้วภาพรวม
 * แท็บที่ผู้ใช้ไม่มีสิทธิ์ไม่ถูกเลือกเด็ดขาด แม้จะพิมพ์มาใน URL เอง
 */
export function resolveInitialTab({ hashTab, storedTab, visible }: {
  hashTab: DashboardTabKey | null;
  storedTab: string | null;
  visible: DashboardTabKey[];
}): DashboardTabKey {
  if (hashTab && visible.includes(hashTab)) return hashTab;
  if (storedTab && isDashboardTabKey(storedTab) && visible.includes(storedTab)) return storedTab;
  return "overview";
}
