import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "th" | "en";

const STORAGE_KEY = "tcs_erp_lang";

/**
 * Scope note: this dictionary only covers strings introduced/touched by the
 * 2026-07 production-readiness pass (Dashboard, empty states, Settings toggle).
 * The rest of the app's existing Thai UI text is intentionally left as-is —
 * full app-wide translation is tracked as a follow-up in docs/TODO.md.
 */
const translations = {
  th: {
    "settings.language": "ภาษา",
    "settings.language.sub": "เลือกภาษาที่แสดงผลในระบบ",
    "settings.language.th": "ไทย",
    "settings.language.en": "English",

    "dashboard.title": "ภาพรวมผู้บริหาร",
    "dashboard.subtitle": "ข้อมูลแบบเรียลไทม์จากฐานข้อมูล",
    "dashboard.kpi.totalCustomers": "ลูกค้าทั้งหมด",
    "dashboard.kpi.totalLeads": "ลูกค้าเป้าหมาย",
    "dashboard.kpi.totalQuotations": "ใบเสนอราคาทั้งหมด",
    "dashboard.kpi.totalProducts": "สินค้าทั้งหมด",
    "dashboard.kpi.totalRevenue": "รายได้ (ปิดการขายสำเร็จ)",
    "dashboard.kpi.wonDeals": "ปิดการขายสำเร็จ",
    "dashboard.kpi.lostDeals": "เสียโอกาส",
    "dashboard.chart.revenue.title": "รายได้รายเดือน",
    "dashboard.chart.revenue.sub": "12 เดือนล่าสุด · จากใบเสนอราคาที่ปิดการขายสำเร็จ",
    "dashboard.chart.category.title": "สินค้าตามหมวดหมู่",
    "dashboard.chart.category.sub": "จำนวนสินค้าที่ใช้งานอยู่ แยกตามหมวดหมู่",
    "dashboard.interest.title": "ความสนใจใบเสนอราคา",

    "empty.dashboard.title": "ยังไม่มีข้อมูลธุรกิจ",
    "empty.dashboard.sub": "เมื่อมีการสร้างใบเสนอราคาและสินค้าในระบบ ข้อมูลจะแสดงที่นี่โดยอัตโนมัติ",
    "empty.products.title": "ไม่มีสินค้า",
    "empty.products.sub": "เริ่มต้นโดยการเพิ่มสินค้ารายการแรกของคุณ",
    "empty.products.action": "+ เพิ่มสินค้า",
    "empty.quotations.title": "ยังไม่มีการสร้างใบเสนอราคา",
    "empty.quotations.sub": "เริ่มต้นโดยการสร้างใบเสนอราคาฉบับแรกของคุณ",
    "empty.quotations.action": "+ สร้างใบเสนอราคา",
    "empty.notifications.title": "คุณอ่านการแจ้งเตือนครบแล้ว",
    "empty.auditLog.title": "ยังไม่มีการบันทึกกิจกรรม",
    "empty.auditLog.sub": "กิจกรรมของผู้ใช้งานในระบบจะปรากฏที่นี่",
  },
  en: {
    "settings.language": "Language",
    "settings.language.sub": "Choose the display language for the system",
    "settings.language.th": "ไทย",
    "settings.language.en": "English",

    "dashboard.title": "Executive Overview",
    "dashboard.subtitle": "Live data from the database",
    "dashboard.kpi.totalCustomers": "Total Customers",
    "dashboard.kpi.totalLeads": "Total Leads",
    "dashboard.kpi.totalQuotations": "Total Quotations",
    "dashboard.kpi.totalProducts": "Total Products",
    "dashboard.kpi.totalRevenue": "Revenue (Won Deals)",
    "dashboard.kpi.wonDeals": "Won Deals",
    "dashboard.kpi.lostDeals": "Lost Deals",
    "dashboard.chart.revenue.title": "Monthly Revenue",
    "dashboard.chart.revenue.sub": "Last 12 months · from won quotations",
    "dashboard.chart.category.title": "Products by Category",
    "dashboard.chart.category.sub": "Active products, grouped by category",
    "dashboard.interest.title": "Quotation Interest",

    "empty.dashboard.title": "No business data available yet.",
    "empty.dashboard.sub": "Once quotations and products are created, data will appear here automatically.",
    "empty.products.title": "No products available.",
    "empty.products.sub": "Get started by adding your first product.",
    "empty.products.action": "+ Add Product",
    "empty.quotations.title": "No quotations have been created.",
    "empty.quotations.sub": "Get started by creating your first quotation.",
    "empty.quotations.action": "+ Create Quotation",
    "empty.notifications.title": "You're all caught up.",
    "empty.auditLog.title": "No activity has been recorded.",
    "empty.auditLog.sub": "User activity across the system will appear here.",
  },
} satisfies Record<Lang, Record<string, string>>;

export type TranslationKey = keyof typeof translations.th;

function readStoredLang(): Lang {
  if (typeof window === "undefined") return "th";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "en" ? "en" : "th";
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang: setLangState,
      t: (key) => translations[lang][key] ?? translations.th[key] ?? key,
    }),
    [lang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
