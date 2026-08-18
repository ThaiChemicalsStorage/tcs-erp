/**
 * การตั้งค่าพิมพ์ลงฟอร์ม NCR (added 2026-08-18) — ขนาดกระดาษ + ค่าเยื้อง สำหรับโหมดพิมพ์เฉพาะข้อมูล
 * ลงฟอร์มกระดาษเคมีของฝ่ายบัญชี (ดู src/pages/accounting/ArDocumentNcrPrintDocument.tsx)
 * เก็บใน localStorage ต่อเครื่อง — การเยื้องเป็นเรื่องของเครื่องพิมพ์/เครื่องคอมแต่ละตัว ไม่ใช่ข้อมูลธุรกิจ
 * (convention เดียวกับ tour.ts/whatsNew.ts)
 */

export interface NcrPrintSettings {
  pageWidthMm: number;
  pageHeightMm: number;
  offsetXMm: number;
  offsetYMm: number;
}

// 9" x 11" — ขนาดฟอร์มต่อเนื่อง (continuous form) มาตรฐานที่ชุดบิล NCR ไทยส่วนใหญ่ใช้
// ยังไม่ยืนยันกับฟอร์มจริง — วัดจริงแล้วแก้ได้ในหน้าตั้งค่า
export const DEFAULT_NCR_SETTINGS: NcrPrintSettings = {
  pageWidthMm: 228.6,
  pageHeightMm: 279.4,
  offsetXMm: 0,
  offsetYMm: 0,
};

const NCR_SETTINGS_KEY = "tcs_erp_ncr_print_settings";

export function loadNcrSettings(): NcrPrintSettings {
  try {
    const raw = localStorage.getItem(NCR_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_NCR_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<NcrPrintSettings>;
    return {
      pageWidthMm: typeof parsed.pageWidthMm === "number" && parsed.pageWidthMm > 0 ? parsed.pageWidthMm : DEFAULT_NCR_SETTINGS.pageWidthMm,
      pageHeightMm: typeof parsed.pageHeightMm === "number" && parsed.pageHeightMm > 0 ? parsed.pageHeightMm : DEFAULT_NCR_SETTINGS.pageHeightMm,
      offsetXMm: typeof parsed.offsetXMm === "number" ? parsed.offsetXMm : 0,
      offsetYMm: typeof parsed.offsetYMm === "number" ? parsed.offsetYMm : 0,
    };
  } catch {
    return { ...DEFAULT_NCR_SETTINGS };
  }
}

export function saveNcrSettings(settings: NcrPrintSettings): void {
  localStorage.setItem(NCR_SETTINGS_KEY, JSON.stringify(settings));
}
