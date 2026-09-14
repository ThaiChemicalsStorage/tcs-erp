import {
  LayoutDashboard, FileText, Wrench, ShoppingCart, Warehouse, Factory, FolderKanban, Calculator, Receipt,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "../../../lib/i18n";
import type { DashboardTabKey, DepartmentKey } from "../../../lib/dashboardTabs";

/**
 * ป้าย ไอคอน และสีประจำของแต่ละแท็บ/แผนก — ใช้ทั้งแถบแท็บ การ์ดสรุปในภาพรวม และป้ายแผนกในแท็บรวม
 * เพื่อให้ "สีนี้ = แผนกนี้" ตรงกันทุกที่ · สีหยิบจากชุดสีกราฟใน DESIGN.md และตั้งใจไม่ใช้ทอง
 * (Rare Gold Rule) กับแดง (สงวนไว้ให้ของที่ผิดปกติ) — ค่าตรงกับ docs/DASHBOARD_DESIGN.md ข้อ 6
 *
 * `ink` = สีตัวอักษรบนป้ายพื้นอ่อนของแผนกนั้น (เข้มกว่า accent ให้อ่านผ่านคอนทราสต์บนพื้นขาว)
 */
export interface DepartmentMeta { labelKey: TranslationKey; icon: LucideIcon; accent: string; ink: string }

export const DEPARTMENT_META: Record<DepartmentKey | "sales" | "accounting", DepartmentMeta> = {
  sales: { labelKey: "dashboard.tab.sales", icon: FileText, accent: "#1a5fb4", ink: "#1a5fb4" },
  service: { labelKey: "dashboard.tab.service", icon: Wrench, accent: "#1f9d8a", ink: "#17786a" },
  purchasing: { labelKey: "dashboard.tab.purchasing", icon: ShoppingCart, accent: "#7c4dbb", ink: "#6a3fa6" },
  inventory: { labelKey: "dashboard.tab.inventory", icon: Warehouse, accent: "#e08a3c", ink: "#a75d1a" },
  production: { labelKey: "dashboard.tab.production", icon: Factory, accent: "#2aa36b", ink: "#207e52" },
  project: { labelKey: "dashboard.tab.project", icon: FolderKanban, accent: "#3b6fc9", ink: "#2c5aa8" },
  bd: { labelKey: "dashboard.tab.bd", icon: Calculator, accent: "#5a7299", ink: "#576f94" },
  accounting: { labelKey: "dashboard.tab.accounting", icon: Receipt, accent: "#157347", ink: "#157347" },
};

export const DASHBOARD_TAB_META: Record<DashboardTabKey, { labelKey: TranslationKey; icon: LucideIcon; accent: string }> = {
  overview: { labelKey: "dashboard.tab.overview", icon: LayoutDashboard, accent: "#5a7299" },
  sales: DEPARTMENT_META.sales,
  service: DEPARTMENT_META.service,
  purchasing: DEPARTMENT_META.purchasing,
  inventory: DEPARTMENT_META.inventory,
  // ชื่อแท็บรวมประกอบจากแผนกที่ผู้ใช้เห็นจริง (DashboardPage) — labelKey นี้ใช้เมื่อเห็นครบทั้งสาม
  operations: { labelKey: "dashboard.tab.operations", icon: Factory, accent: "#2aa36b" },
  accounting: DEPARTMENT_META.accounting,
};
