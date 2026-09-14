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
 *   - **ผลิต · โครงการ · BD เป็นแท็บเดียว** (`operations`) ตามคำสั่งเจ้าของ *"แผนกไหนมีน้อยจับรวมกันเลย"*
 *     (2026-09-14) · สิทธิ์ยังแยกเป็นรายแผนก — แท็บเปิดถ้าเห็นแผนกใดแผนกหนึ่ง แต่ข้างในเห็นเฉพาะส่วนของ
 *     แผนกที่มีสิทธิ์ (`canSeeDepartmentBlock`) · ลิงก์เก่า `#dashboard/production` ฯลฯ พาเข้าแท็บรวม
 */

export type DashboardTabKey = "overview" | "sales" | "service" | "purchasing" | "inventory" | "operations" | "accounting";

/** บล็อกตัวเลขที่เซิร์ฟเวอร์คำนวณให้ผ่าน `GET /api/dashboard/departments` — หนึ่งบล็อกต่อหนึ่งแผนก */
export const DEPARTMENT_KEYS = ["service", "purchasing", "inventory", "production", "project", "bd"] as const;
export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

/** แผนกที่อยู่ในแท็บรวม เรียงตามลำดับที่แสดงบนหน้า */
export const OPERATIONS_DEPARTMENTS = ["production", "project", "bd"] as const satisfies readonly DepartmentKey[];

export interface DashboardTabRule {
  key: DashboardTabKey;
  /** เห็นแท็บถ้ามีสิทธิ์ใดสิทธิ์หนึ่ง · ว่าง = เห็นเสมอ */
  anyPermission: Permission[];
}

/** สิทธิ์ที่เปิดบล็อกของแต่ละแผนก */
export const DEPARTMENT_BLOCK_PERMISSIONS: Record<DepartmentKey, Permission[]> = {
  service: ["service:view"],
  purchasing: ["purchaseOrder:view", "purchaseRequest:view"],
  inventory: ["stock:view", "receivingReport:view", "productRequest:view"],
  production: ["productionOrder:view"],
  project: ["jobOrder:view", "project:view"],
  bd: ["costControl:view"],
};

/** เรียงตามลำดับที่แสดงบนแถบแท็บ */
export const DASHBOARD_TAB_RULES: DashboardTabRule[] = [
  { key: "overview", anyPermission: [] },
  { key: "sales", anyPermission: ["quotations:view"] },
  { key: "service", anyPermission: DEPARTMENT_BLOCK_PERMISSIONS.service },
  { key: "purchasing", anyPermission: DEPARTMENT_BLOCK_PERMISSIONS.purchasing },
  { key: "inventory", anyPermission: DEPARTMENT_BLOCK_PERMISSIONS.inventory },
  { key: "operations", anyPermission: OPERATIONS_DEPARTMENTS.flatMap((d) => DEPARTMENT_BLOCK_PERMISSIONS[d]) },
  { key: "accounting", anyPermission: ["ar:view", "ap:view"] },
];

/** แท็บที่ถูกรวมไปแล้ว — ลิงก์/ค่าที่จำไว้ก่อนรวมยังพาไปถูกที่ */
const LEGACY_TAB_ALIASES: Record<string, DashboardTabKey> = { production: "operations", project: "operations", bd: "operations" };

const TAB_KEYS = new Set<string>(DASHBOARD_TAB_RULES.map((r) => r.key));

export function isDashboardTabKey(raw: string): raw is DashboardTabKey {
  return TAB_KEYS.has(raw);
}

/** ชื่อแท็บจาก URL/ที่จำไว้ → แท็บปัจจุบัน (รวมชื่อเก่าที่ถูกรวมแล้ว) · ไม่รู้จัก = null */
export function normalizeDashboardTab(raw: string | null): DashboardTabKey | null {
  if (!raw) return null;
  if (isDashboardTabKey(raw)) return raw;
  return Object.prototype.hasOwnProperty.call(LEGACY_TAB_ALIASES, raw) ? LEGACY_TAB_ALIASES[raw] : null;
}

type Has = (permission: Permission) => boolean;

export function canSeeDashboardTab(key: DashboardTabKey, has: Has): boolean {
  const rule = DASHBOARD_TAB_RULES.find((r) => r.key === key);
  if (!rule) return false;
  return rule.anyPermission.length === 0 || rule.anyPermission.some(has);
}

export function canSeeDepartmentBlock(key: DepartmentKey, has: Has): boolean {
  return DEPARTMENT_BLOCK_PERMISSIONS[key].some(has);
}

/** แท็บที่บล็อกของแผนกนี้ไปแสดง — ปุ่ม "ดูแผนก" บนการ์ดภาพรวมใช้ */
export function tabOfDepartment(key: DepartmentKey): DashboardTabKey {
  return (OPERATIONS_DEPARTMENTS as readonly string[]).includes(key) ? "operations" : (key as DashboardTabKey);
}

export function visibleDashboardTabs(has: Has): DashboardTabKey[] {
  return DASHBOARD_TAB_RULES.filter((r) => canSeeDashboardTab(r.key, has)).map((r) => r.key);
}

/** `#dashboard/inventory` → `"inventory"` · `#dashboard` หรือค่าอื่นที่ไม่ใช่แท็บ → null */
export function tabFromHash(hash: string): DashboardTabKey | null {
  const [page, tab] = hash.replace(/^#\/?/, "").split("/");
  if (page !== "dashboard" || !tab) return null;
  return normalizeDashboardTab(tab);
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
  const stored = normalizeDashboardTab(storedTab);
  if (stored && visible.includes(stored)) return stored;
  return "overview";
}
