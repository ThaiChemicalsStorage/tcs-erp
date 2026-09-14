import type { Permission } from "./permissions";

/**
 * แท็บของหน้าแดชบอร์ด — ใครเห็นแท็บไหน (เพิ่ม 2026-09-14)
 *
 * เจ้าของสั่ง *"หน้า Dashboard อยากให้ทำให้ดูง่ายขึ้นแยกแต่ละแผนกอย่างชัดเจนแต่ก็ยังมี Dashboard ที่ดู
 * ข้อมูลรวมได้ทุกอย่างอยู่ด้วย"* และเลือกแบบ "แท็บในหน้าแดชบอร์ด" · ไฟล์นี้เป็นกติกาเดียวที่ทั้งหน้าจอ
 * และเซิร์ฟเวอร์ (`api/_lib/departmentDashboard.ts`, `api/dashboard/index.ts`) ใช้ตัดสินว่าแท็บ/บล็อกไหน
 * เปิดให้ใคร จึงต้องไม่ import อะไรที่เป็นค่าตอน runtime (มีแต่ type) — เซิร์ฟเวอร์โหลดไฟล์นี้ตรง ๆ
 *
 * **สิทธิ์ติ๊กต่อแท็บ (2026-09-14)** — เจ้าของสั่ง *"ฝากทำสิทธิ์เรื่องหน้า dashboard ให้หน่อยว่าติ๊กให้เห็น
 * แผนกไหนได้บ้าง"* และเลือกเองสองข้อ:
 *   1. **ต้องมีทั้งติ๊กและสิทธิ์เอกสาร** — ติ๊กแท็บคือ "อนุญาตให้เห็นแท็บ" แต่ตัวเลขยังนับตามสิทธิ์ดูเอกสาร
 *      ของแผนกนั้นเหมือนเดิม (เห็นทั้งบริษัท/เฉพาะของตัวเอง) · ติ๊กแต่ไม่มีสิทธิ์เอกสารเลย แท็บไม่ขึ้น
 *      จึงไม่มีใครเห็นตัวเลขเกินสิทธิ์ที่มีอยู่
 *   2. **ภาพรวมก็ติ๊กได้** — ไม่ติ๊กภาพรวม หน้าแดชบอร์ดเปิดที่แท็บแรกที่ติ๊กไว้
 * บทบาทเดิมได้ติ๊กตรงกับแท็บที่เคยเห็นโดยอัตโนมัติ (`src/lib/dashboardTabGrants.ts`)
 *
 * ข้อที่ตั้งใจ (สิทธิ์เอกสารของแต่ละแท็บ):
 *   - **ขาย** ใช้ `quotations:view` ไม่ใช่ `dashboard:view` — ตัวเลขทุกตัวของแท็บขายมาจากใบเสนอราคา
 *   - **คลังสินค้า** ไม่นับ `products:view` เพราะฝ่ายขายถือสิทธิ์นี้ไว้ใช้เลือกสินค้าตอนทำใบเสนอราคา
 *   - **ผลิต · โครงการ · BD เป็นแท็บเดียว** (`operations`) ตามคำสั่งเจ้าของ *"แผนกไหนมีน้อยจับรวมกันเลย"*
 *     แต่ติ๊กและสิทธิ์ยังแยกเป็นรายแผนก — แท็บเปิดถ้าเห็นแผนกใดแผนกหนึ่ง ข้างในเห็นเฉพาะส่วนที่เปิดให้
 *     · ลิงก์เก่า `#dashboard/production` ฯลฯ พาเข้าแท็บรวม
 */

export type DashboardTabKey = "overview" | "sales" | "service" | "purchasing" | "inventory" | "operations" | "accounting";

/** เรียงตามลำดับที่แสดงบนแถบแท็บ */
export const DASHBOARD_TAB_ORDER: DashboardTabKey[] = ["overview", "sales", "service", "purchasing", "inventory", "operations", "accounting"];

/** บล็อกตัวเลขที่เซิร์ฟเวอร์คำนวณให้ผ่าน `GET /api/dashboard/departments` — หนึ่งบล็อกต่อหนึ่งแผนก */
export const DEPARTMENT_KEYS = ["service", "purchasing", "inventory", "production", "project", "bd"] as const;
export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

/** แผนกที่อยู่ในแท็บรวม เรียงตามลำดับที่แสดงบนหน้า */
export const OPERATIONS_DEPARTMENTS = ["production", "project", "bd"] as const satisfies readonly DepartmentKey[];

/** ช่องติ๊กในหน้า "บทบาทและสิทธิ์" — หนึ่งช่องต่อแท็บ และแยกผลิต / โครงการ / BD ของแท็บรวม */
export type DashboardTickKey = "overview" | "sales" | "accounting" | DepartmentKey;

export const DASHBOARD_TICK: Record<DashboardTickKey, Permission> = {
  overview: "dashboard:tabOverview",
  sales: "dashboard:tabSales",
  service: "dashboard:tabService",
  purchasing: "dashboard:tabPurchasing",
  inventory: "dashboard:tabInventory",
  production: "dashboard:tabProduction",
  project: "dashboard:tabProject",
  bd: "dashboard:tabBd",
  accounting: "dashboard:tabAccounting",
};

/** สิทธิ์เอกสารที่ต้องมีคู่กับติ๊ก (อย่างใดอย่างหนึ่ง) — ภาพรวมไม่มีเอกสารของตัวเอง */
export const DASHBOARD_DOCUMENT_PERMISSIONS: Record<Exclude<DashboardTickKey, "overview">, Permission[]> = {
  sales: ["quotations:view"],
  service: ["service:view"],
  purchasing: ["purchaseOrder:view", "purchaseRequest:view"],
  inventory: ["stock:view", "receivingReport:view", "productRequest:view"],
  production: ["productionOrder:view"],
  project: ["jobOrder:view", "project:view"],
  bd: ["costControl:view"],
  accounting: ["ar:view", "ap:view"],
};

/** แท็บที่ถูกรวมไปแล้ว — ลิงก์/ค่าที่จำไว้ก่อนรวมยังพาไปถูกที่ */
const LEGACY_TAB_ALIASES: Record<string, DashboardTabKey> = { production: "operations", project: "operations", bd: "operations" };

const TAB_KEYS = new Set<string>(DASHBOARD_TAB_ORDER);

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

/** ติ๊กแผนกนี้ไว้ และมีสิทธิ์ดูเอกสารของแผนกนั้นอย่างน้อยหนึ่งชนิด */
export function canSeeDepartmentBlock(key: DepartmentKey, has: Has): boolean {
  return has(DASHBOARD_TICK[key]) && DASHBOARD_DOCUMENT_PERMISSIONS[key].some(has);
}

export function canSeeDashboardTab(key: DashboardTabKey, has: Has): boolean {
  switch (key) {
    case "overview":
      return has(DASHBOARD_TICK.overview);
    case "sales":
    case "accounting":
      return has(DASHBOARD_TICK[key]) && DASHBOARD_DOCUMENT_PERMISSIONS[key].some(has);
    case "operations":
      return OPERATIONS_DEPARTMENTS.some((d) => canSeeDepartmentBlock(d, has));
    default:
      return canSeeDepartmentBlock(key, has);
  }
}

/** แท็บที่บล็อกของแผนกนี้ไปแสดง — ปุ่ม "ดูแผนก" บนการ์ดภาพรวมใช้ */
export function tabOfDepartment(key: DepartmentKey): DashboardTabKey {
  return (OPERATIONS_DEPARTMENTS as readonly string[]).includes(key) ? "operations" : (key as DashboardTabKey);
}

export function visibleDashboardTabs(has: Has): DashboardTabKey[] {
  return DASHBOARD_TAB_ORDER.filter((key) => canSeeDashboardTab(key, has));
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
 * แท็บที่จะเปิดตอนเข้าหน้า — URL ก่อน (ลิงก์/รีเฟรช) แล้วแท็บล่าสุดที่ผู้ใช้ดู แล้วแท็บแรกที่เห็น
 * แท็บที่ผู้ใช้ไม่มีสิทธิ์ไม่ถูกเลือกเด็ดขาด แม้จะพิมพ์มาใน URL เอง · ไม่เห็นแท็บไหนเลย = null
 */
export function resolveInitialTab({ hashTab, storedTab, visible }: {
  hashTab: DashboardTabKey | null;
  storedTab: string | null;
  visible: DashboardTabKey[];
}): DashboardTabKey | null {
  if (hashTab && visible.includes(hashTab)) return hashTab;
  const stored = normalizeDashboardTab(storedTab);
  if (stored && visible.includes(stored)) return stored;
  return visible[0] ?? null;
}
