import {
  LayoutDashboard, FileText, Wrench, ShoppingCart, Warehouse, Factory, FolderKanban, Calculator, Receipt,
  type LucideIcon,
} from "lucide-react";
import type { TranslationKey } from "../../../lib/i18n";
import type { DashboardTabKey } from "../../../lib/dashboardTabs";

/**
 * ป้าย ไอคอน และสีประจำของแต่ละแท็บ — ใช้ทั้งแถบแท็บและการ์ดสรุปในภาพรวม เพื่อให้ "สีนี้ = แผนกนี้"
 * ตรงกันทุกที่ · ไอคอนตรงกับเมนูของแผนกในแถบข้างเท่าที่มี · สีหยิบจากชุดสีกราฟใน DESIGN.md
 * และตั้งใจไม่ใช้ทอง (Rare Gold Rule) กับแดง (สงวนไว้ให้ของที่ผิดปกติ)
 */
export const DASHBOARD_TAB_META: Record<DashboardTabKey, { labelKey: TranslationKey; icon: LucideIcon; accent: string }> = {
  overview: { labelKey: "dashboard.tab.overview", icon: LayoutDashboard, accent: "#5a7299" },
  sales: { labelKey: "dashboard.tab.sales", icon: FileText, accent: "#1a5fb4" },
  service: { labelKey: "dashboard.tab.service", icon: Wrench, accent: "#1f9d8a" },
  purchasing: { labelKey: "dashboard.tab.purchasing", icon: ShoppingCart, accent: "#7c4dbb" },
  inventory: { labelKey: "dashboard.tab.inventory", icon: Warehouse, accent: "#e08a3c" },
  production: { labelKey: "dashboard.tab.production", icon: Factory, accent: "#2aa36b" },
  project: { labelKey: "dashboard.tab.project", icon: FolderKanban, accent: "#3b6fc9" },
  bd: { labelKey: "dashboard.tab.bd", icon: Calculator, accent: "#5a7299" },
  accounting: { labelKey: "dashboard.tab.accounting", icon: Receipt, accent: "#157347" },
};
