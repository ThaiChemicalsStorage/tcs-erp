/**
 * ค่าคงที่ของหน้าตาแดชบอร์ด (docs/DASHBOARD_DESIGN.md ข้อ 4 และ 6 + ดีไซน์ใหม่ 2026-09-30) — แยกจากไฟล์คอมโพเนนต์
 * เพื่อให้ fast refresh ของ Vite ทำงาน (ไฟล์ที่ export ทั้งคอมโพเนนต์และค่าคงที่ ถูกโหลดใหม่ทั้งหน้าเมื่อแก้)
 */

/** ทองใช้น้อย — แท็บที่เลือก และตัวเลขเด่นบนพื้นเข้ม (Rare Gold Rule) */
export const GOLD = "#c9a84c";

/**
 * ชุดสีกราฟที่ผ่านการตรวจแล้ว (ดีไซน์ใหม่ 2026-09-30 — เจ้าของอนุมัติ): น้ำเงิน / ส้ม / ม่วง / ฟ้าเขียว
 * ใช้ตามลำดับนี้เมื่อกราฟ/แถบสัดส่วนมีหลายชุด · สองแผนกที่เทียบกันเสมอ: ผลิต = น้ำเงิน · โครงการ = ส้ม
 */
export const CHART = { blue: "#1a5fb4", orange: "#eb6834", violet: "#4a3aa7", aqua: "#1baf7a" } as const;
export const CHART_SEQUENCE: string[] = [CHART.blue, CHART.orange, CHART.violet, CHART.aqua];

/** กราฟชุดเดียว: แท่งเก่าสีอ่อน แท่งล่าสุดสีเข้ม · แถบอันดับใช้สีกลาง */
export const BAR = { muted: "#8fb3e3", latest: CHART.blue, rank: "#4f86cf", light: "#c9dbf3" } as const;

/** สีสถานะบนกราฟ/แถบ (ตรงกับป้ายสถานะของดีไซน์ใหม่) */
export const TONE = {
  good: "#1b7f4f",
  warn: "#d89614",
  alert: "#b93636",
  neutral: "#8a97ad",
  empty: "#c3ccda",
} as const;

/** สีของสามสถานะเครื่องอนุมัติร่วม (ร่าง / รออนุมัติ / อนุมัติแล้ว) บนแถบสัดส่วน */
export const STATUS_COLORS = { draft: TONE.neutral, pending: TONE.warn, final: CHART.blue } as const;

/** คลาสของตารางในแดชบอร์ด — หัวตารางและแถวแบบเดียวกับหน้ารายการของดีไซน์ใหม่ */
export const TH = "px-3 first:pl-6 last:pr-6 h-10 text-[12.5px] font-semibold text-[#3d5173] whitespace-nowrap";
export const TD = "px-3 first:pl-6 last:pr-6 py-3 text-sm";
export const TD_MONO = "px-3 first:pl-6 last:pr-6 py-3 font-mono text-[13px] font-medium whitespace-nowrap";
export const TR = "h-[52px] border-b border-[#eef1f6] last:border-0";
